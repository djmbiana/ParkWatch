'use strict';

/**
 * Queue & enforcement action controller — the sprint-2 MTPB and barangay
 * workflow endpoints. Separate from reportController to keep the citizen
 * pipeline (create/confirm/mine) isolated.
 */

const { pool } = require('../config/db');
const logger = require('../config/logger');
const notificationService = require('../services/notificationService');

const fail = (res, code, msg) => res.status(code).json({ success: false, message: msg });

// ---------------------------------------------------------------------------
// Shared query fragment — report row with all joined fields needed by queues
// ---------------------------------------------------------------------------
const REPORT_SELECT = `
  SELECT
    r.report_id, r.status, r.violation_type,
    r.photo_path, r.ocr_extracted_plate, r.ocr_confidence_score, r.manual_plate_input,
    r.is_escalated, r.ticket_reference, r.resolution_outcome, r.rejection_reason,
    r.assigned_officer_id, r.verified_by,
    r.submitted_at, r.verified_at, r.acknowledged_at, r.dispatched_at,
    r.escalated_at, r.resolved_at,
    s.street_name,
    b.barangay_name, b.barangay_id AS bry_id,
    t.tier_id, t.tier_name, t.fine_amount, t.requires_clamping,
    v.plate_number, v.total_violations, v.is_repeat_offender,
    u.anonymous_alias
  FROM VIOLATION_REPORTS r
  LEFT JOIN STREETS s        ON s.street_id   = r.street_id
  LEFT JOIN BARANGAYS b      ON b.barangay_id = COALESCE(r.barangay_id, s.barangay_id)
  LEFT JOIN PENALTY_TIERS t  ON t.tier_id     = r.penalty_tier_id
  LEFT JOIN VEHICLES v       ON v.vehicle_id  = r.vehicle_id
  LEFT JOIN USERS u          ON u.user_id     = r.citizen_id
`;

function mapRow(r) {
  return {
    report_id: r.report_id,
    status: r.status,
    violation_type: r.violation_type,
    street_name: r.street_name,
    barangay_name: r.barangay_name,
    plate_number: r.plate_number,
    ocr_confidence_score: r.ocr_confidence_score === null ? null : Number(r.ocr_confidence_score),
    manual_plate_input: r.manual_plate_input,
    ocr_extracted_plate: r.ocr_extracted_plate,
    tier_name: r.tier_name,
    fine_amount: r.fine_amount ? Number(r.fine_amount) : null,
    requires_clamping: !!r.requires_clamping,
    total_violations: r.total_violations,
    is_repeat_offender: !!r.is_repeat_offender,
    is_escalated: !!r.is_escalated,
    assigned_officer_id: r.assigned_officer_id,
    ticket_reference: r.ticket_reference,
    resolution_outcome: r.resolution_outcome,
    rejection_reason: r.rejection_reason,
    anonymous_alias: r.anonymous_alias,
    submitted_at: r.submitted_at,
    verified_at: r.verified_at,
    acknowledged_at: r.acknowledged_at,
    dispatched_at: r.dispatched_at,
    escalated_at: r.escalated_at,
    resolved_at: r.resolved_at,
  };
}

// ---------------------------------------------------------------------------
// GET /api/reports/queue/barangay
// Returns pending reports for the logged-in barangay official's barangay.
// ---------------------------------------------------------------------------
const barangayQueue = async (req, res, next) => {
  try {
    const barangayId = req.user.barangay_id;
    if (!barangayId) return fail(res, 403, 'No barangay assigned to your account.');

    const [rows] = await pool.execute(
      `${REPORT_SELECT}
       WHERE r.status = 'pending'
         AND COALESCE(r.barangay_id, s.barangay_id) = ?
       ORDER BY r.submitted_at ASC`,
      [barangayId]
    );

    return res.json({ success: true, message: 'Success', data: rows.map(mapRow) });
  } catch (err) { return next(err); }
};

// ---------------------------------------------------------------------------
// GET /api/reports/stats/barangay
// ---------------------------------------------------------------------------
const barangayStats = async (req, res, next) => {
  try {
    const barangayId = req.user.barangay_id;
    if (!barangayId) return fail(res, 403, 'No barangay assigned.');

    const today = new Date().toISOString().slice(0, 10);
    const [[stats]] = await pool.execute(
      `SELECT
         SUM(CASE WHEN r.status = 'pending' AND DATE(r.submitted_at) = ? THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN r.status = 'verified' AND DATE(r.verified_at) = ? THEN 1 ELSE 0 END) AS verified,
         SUM(CASE WHEN r.status = 'rejected' AND DATE(r.submitted_at) = ? THEN 1 ELSE 0 END) AS rejected,
         COALESCE(AVG(CASE WHEN r.verified_at IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, r.submitted_at, r.verified_at) END), 0) AS avg_review_min
       FROM VIOLATION_REPORTS r
       LEFT JOIN STREETS s ON s.street_id = r.street_id
       WHERE COALESCE(r.barangay_id, s.barangay_id) = ?`,
      [today, today, today, barangayId]
    );

    return res.json({ success: true, message: 'Success', data: {
      pending: Number(stats.pending ?? 0),
      verified: Number(stats.verified ?? 0),
      rejected: Number(stats.rejected ?? 0),
      avg_review_min: Math.round(Number(stats.avg_review_min ?? 0)),
    }});
  } catch (err) { return next(err); }
};

// ---------------------------------------------------------------------------
// PATCH /api/reports/:reportId/verify   { action: 'approve'|'reject', rejection_reason? }
// ---------------------------------------------------------------------------
const verify = async (req, res, next) => {
  const reportId = parseInt(req.params.reportId, 10);
  const { action, rejection_reason } = req.body;
  if (!['approve', 'reject'].includes(action)) return fail(res, 400, 'action must be "approve" or "reject".');
  if (action === 'reject' && (!rejection_reason || rejection_reason.trim().length < 10)) {
    return fail(res, 400, 'rejection_reason must be at least 10 characters.');
  }

  try {
    const [[report]] = await pool.execute(
      'SELECT report_id, status, barangay_id, street_id FROM VIOLATION_REPORTS WHERE report_id = ? LIMIT 1',
      [reportId]
    );
    if (!report) return fail(res, 404, 'Report not found.');
    if (report.status !== 'pending') return fail(res, 409, 'Only pending reports can be verified.');

    // Barangay officials can only verify reports in their barangay
    if (req.user.role === 'brgy_official') {
      const [[street]] = await pool.execute('SELECT barangay_id FROM STREETS WHERE street_id = ?', [report.street_id ?? 0]);
      const brgy = report.barangay_id ?? street?.barangay_id;
      if (brgy !== req.user.barangay_id) return fail(res, 403, 'You can only verify reports in your barangay.');
    }

    if (action === 'approve') {
      await pool.execute(
        `UPDATE VIOLATION_REPORTS SET status = 'verified', verified_by = ?, verified_at = NOW() WHERE report_id = ?`,
        [req.user.id, reportId]
      );
    } else {
      await pool.execute(
        `UPDATE VIOLATION_REPORTS SET status = 'rejected', rejection_reason = ?, verified_by = ? WHERE report_id = ?`,
        [rejection_reason.trim(), req.user.id, reportId]
      );
    }

    return res.json({ success: true, message: `Report ${action}d.`, data: { report_id: reportId, action } });
  } catch (err) { return next(err); }
};

// ---------------------------------------------------------------------------
// GET /api/reports/queue/mtpb
// Returns verified/acknowledged/dispatched/escalated reports for MTPB.
// ---------------------------------------------------------------------------
const mtpbQueue = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `${REPORT_SELECT}
       WHERE r.status IN ('verified','acknowledged','dispatched','escalated')
       ORDER BY r.is_escalated DESC, r.verified_at ASC`
    );
    return res.json({ success: true, message: 'Success', data: rows.map(mapRow) });
  } catch (err) { return next(err); }
};

// ---------------------------------------------------------------------------
// PATCH /api/reports/:reportId/acknowledge
// ---------------------------------------------------------------------------
const acknowledge = async (req, res, next) => {
  const reportId = parseInt(req.params.reportId, 10);
  try {
    const [[report]] = await pool.execute('SELECT status FROM VIOLATION_REPORTS WHERE report_id = ?', [reportId]);
    if (!report) return fail(res, 404, 'Report not found.');
    if (report.status !== 'verified' && report.status !== 'escalated') {
      return fail(res, 409, 'Report is not in a verified state.');
    }
    await pool.execute(
      `UPDATE VIOLATION_REPORTS SET status='acknowledged', acknowledged_at=NOW(), assigned_officer_id=?, is_escalated=FALSE WHERE report_id=?`,
      [req.user.id, reportId]
    );
    return res.json({ success: true, message: 'Report acknowledged.', data: { report_id: reportId } });
  } catch (err) { return next(err); }
};

// ---------------------------------------------------------------------------
// PATCH /api/reports/:reportId/dispatch
// ---------------------------------------------------------------------------
const dispatch = async (req, res, next) => {
  const reportId = parseInt(req.params.reportId, 10);
  try {
    const [[report]] = await pool.execute('SELECT status, assigned_officer_id FROM VIOLATION_REPORTS WHERE report_id = ?', [reportId]);
    if (!report) return fail(res, 404, 'Report not found.');
    if (report.status !== 'acknowledged') return fail(res, 409, 'Report must be acknowledged first.');
    await pool.execute(
      `UPDATE VIOLATION_REPORTS SET status='dispatched', dispatched_at=NOW() WHERE report_id=?`,
      [reportId]
    );
    return res.json({ success: true, message: 'Report dispatched.', data: { report_id: reportId } });
  } catch (err) { return next(err); }
};

// ---------------------------------------------------------------------------
// PATCH /api/reports/:reportId/resolve  { resolution_outcome, ticket_reference? }
// ---------------------------------------------------------------------------
const resolve = async (req, res, next) => {
  const reportId = parseInt(req.params.reportId, 10);
  const { resolution_outcome, ticket_reference } = req.body;
  if (!resolution_outcome) return fail(res, 400, 'resolution_outcome is required.');

  try {
    const [[report]] = await pool.execute('SELECT status FROM VIOLATION_REPORTS WHERE report_id = ?', [reportId]);
    if (!report) return fail(res, 404, 'Report not found.');
    if (!['dispatched', 'acknowledged', 'escalated', 'verified'].includes(report.status)) {
      return fail(res, 409, `Cannot resolve a report with status "${report.status}".`);
    }
    await pool.execute(
      `UPDATE VIOLATION_REPORTS SET status='resolved', resolution_outcome=?, ticket_reference=?, resolved_at=NOW(), is_escalated=FALSE WHERE report_id=?`,
      [resolution_outcome, ticket_reference ?? null, reportId]
    );
    return res.json({ success: true, message: 'Report resolved.', data: { report_id: reportId } });
  } catch (err) { return next(err); }
};

// ---------------------------------------------------------------------------
// PATCH /api/reports/:reportId/assign  { officer_id }
// ---------------------------------------------------------------------------
const assign = async (req, res, next) => {
  const reportId = parseInt(req.params.reportId, 10);
  const { officer_id } = req.body;
  if (!officer_id) return fail(res, 400, 'officer_id is required.');

  try {
    const [[report]] = await pool.execute('SELECT status FROM VIOLATION_REPORTS WHERE report_id = ?', [reportId]);
    if (!report) return fail(res, 404, 'Report not found.');
    await pool.execute(
      `UPDATE VIOLATION_REPORTS SET assigned_officer_id=?, status='acknowledged', acknowledged_at=NOW(), is_escalated=FALSE WHERE report_id=?`,
      [officer_id, reportId]
    );
    return res.json({ success: true, message: 'Report assigned.', data: { report_id: reportId } });
  } catch (err) { return next(err); }
};

// ---------------------------------------------------------------------------
// GET /api/reports/analytics/summary
// ---------------------------------------------------------------------------
const analyticsSummary = async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;
    const today = new Date().toISOString().slice(0, 10);

    const dateFilter = start_date && end_date
      ? `AND DATE(r.submitted_at) BETWEEN ? AND ?`
      : '';
    const params = start_date && end_date ? [start_date, end_date] : [];

    const [[s]] = await pool.execute(
      `SELECT
         COUNT(*) AS reports_submitted,
         SUM(CASE WHEN r.status = 'resolved' THEN 1 ELSE 0 END) AS reports_resolved,
         SUM(CASE WHEN r.status = 'pending' THEN 1 ELSE 0 END) AS pending_now,
         SUM(CASE WHEN r.is_escalated = 1 OR r.status = 'escalated' THEN 1 ELSE 0 END) AS escalated_now,
         SUM(CASE WHEN r.status = 'resolved' AND DATE(r.resolved_at) = '${today}' THEN 1 ELSE 0 END) AS resolved_today,
         COALESCE(AVG(CASE WHEN r.verified_at IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, r.submitted_at, r.verified_at) END), 0) AS avg_verify_min,
         COALESCE(AVG(CASE WHEN r.acknowledged_at IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, r.verified_at, r.acknowledged_at) END), 0) AS avg_mtpb_response_min,
         COALESCE(AVG(CASE WHEN r.escalated_at IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, r.verified_at, r.escalated_at) END), 0) AS avg_escalation_min
       FROM VIOLATION_REPORTS r
       WHERE 1=1 ${dateFilter}`,
      params
    );

    const total = Number(s.reports_submitted ?? 0);
    const resolved = Number(s.reports_resolved ?? 0);
    const rate = total > 0 ? Math.round((resolved / total) * 100) : 0;

    const [[roStats]] = await pool.execute(
      `SELECT COUNT(DISTINCT vehicle_id) AS total_repeat_offenders FROM VIOLATION_REPORTS r WHERE r.status != 'rejected'`
    );

    const [[fineStats]] = await pool.execute(
      `SELECT COALESCE(SUM(t.fine_amount), 0) AS total_fines FROM VIOLATION_REPORTS r LEFT JOIN PENALTY_TIERS t ON t.tier_id = r.penalty_tier_id WHERE r.status = 'resolved'`
    );

    return res.json({ success: true, message: 'Success', data: {
      reports_submitted: total,
      reports_resolved: resolved,
      pending_now: Number(s.pending_now ?? 0),
      escalated_now: Number(s.escalated_now ?? 0),
      resolved_today: Number(s.resolved_today ?? 0),
      resolution_rate: rate,
      avg_verify_min: Math.round(Number(s.avg_verify_min ?? 0)),
      avg_mtpb_response_min: Math.round(Number(s.avg_mtpb_response_min ?? 0)),
      avg_escalation_min: Math.round(Number(s.avg_escalation_min ?? 0)),
      total_repeat_offenders: Number(roStats.total_repeat_offenders ?? 0),
      total_fines_issued: Number(fineStats.total_fines ?? 0),
    }});
  } catch (err) { return next(err); }
};

// ---------------------------------------------------------------------------
// GET /api/reports/analytics/repeat-offenders
// ---------------------------------------------------------------------------
const repeatOffenders = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT v.plate_number, v.total_violations, MAX(r.submitted_at) AS last_violation_date
       FROM VEHICLES v
       JOIN VIOLATION_REPORTS r ON r.vehicle_id = v.vehicle_id
       WHERE v.is_repeat_offender = TRUE
       GROUP BY v.vehicle_id, v.plate_number, v.total_violations
       ORDER BY v.total_violations DESC, last_violation_date DESC
       LIMIT 100`
    );
    return res.json({ success: true, message: 'Success', data: rows });
  } catch (err) { return next(err); }
};

module.exports = {
  barangayQueue, barangayStats, verify,
  mtpbQueue, acknowledge, dispatch, resolve, assign,
  analyticsSummary, repeatOffenders,
};
