'use strict';

/**
 * Queue & enforcement action controller — the sprint-2 MTPB and barangay
 * workflow endpoints. Separate from reportController to keep the citizen
 * pipeline (create/confirm/mine) isolated.
 */

const { pool } = require('../config/db');
const logger = require('../config/logger');
const notificationService = require('../services/notificationService');
const { sendPaginated } = require('../utils/response');
const { logAudit } = require('./userGroupsController');
const { resolveDateRange, trendPct, mnl } = require('../utils/dateRange');

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
    COALESCE(r.anonymous_alias, u.anonymous_alias) AS anonymous_alias,
    mq.response_deadline
  FROM VIOLATION_REPORTS r
  LEFT JOIN STREETS s        ON s.street_id   = r.street_id
  LEFT JOIN BARANGAYS b      ON b.barangay_id = COALESCE(r.barangay_id, s.barangay_id)
  LEFT JOIN PENALTY_TIERS t  ON t.tier_id     = r.penalty_tier_id
  LEFT JOIN VEHICLES v       ON v.vehicle_id  = r.vehicle_id
  LEFT JOIN USERS u          ON u.user_id     = r.citizen_id
  LEFT JOIN MTPB_QUEUE mq    ON mq.report_id  = r.report_id
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
// Date-range parsing (presets, custom range, Manila-timezone "today", input
// validation) lives in ../utils/dateRange.js (resolveDateRange/mnl) and is
// shared by every endpoint below instead of being reimplemented per-function.
// ---------------------------------------------------------------------------
// GET /api/reports/queue/barangay
// Shared cross-barangay database (paper's cross-barangay violation tracking):
// every barangay official sees ALL pending reports district-wide, each labeled
// with its barangay, so repeat offenders are visible across barangay lines.
// ---------------------------------------------------------------------------
const barangayQueue = async (req, res, next) => {
  // FIX 3 (FR-12) — officials see only their own barangay's reports.
  const barangayId = req.user.barangay_id;
  if (barangayId == null) {
    return res.status(403).json({
      success: false,
      error: 'No barangay assigned to your account. Contact the system administrator.',
      message: 'No barangay assigned to your account. Contact the system administrator.',
    });
  }
  try {
    const [rows] = await pool.execute(
      `${REPORT_SELECT}
       WHERE r.status IN ('pending', 'contested')
         AND COALESCE(r.barangay_id, s.barangay_id) = ?
       ORDER BY r.status = 'contested' DESC, v.is_repeat_offender DESC, r.submitted_at ASC`,
      [barangayId]
    );

    // No inline stats here — the dashboard/queue pages both call
    // GET /api/reports/stats/barangay (barangayStats below) for stat-card
    // data, so computing a second, unfiltered "today" set here would just be
    // dead weight (and a second place for the numbers to drift out of sync).
    return res.json({ success: true, message: 'Success', data: {
      reports: rows.map(mapRow),
    }});
  } catch (err) { return next(err); }
};

// ---------------------------------------------------------------------------
// GET /api/reports/stats/barangay?range=7d|30d|60d|today  (or start_date+end_date)
//
// "pending"/"verified"/"rejected" and avg_review_min are period activity —
// how many reports were submitted/reviewed within the selected window — so
// they respect the date range and carry a trend vs. the prior period of
// equal length. There is no un-dated "current queue depth" metric on this
// endpoint by design: the barangay portal's whole framing is "how much did
// we handle in period X", not a live counter (that's what the queue table
// itself is for).
// ---------------------------------------------------------------------------
const barangayStats = async (req, res, next) => {
  // FIX 3 — scoped to the official's own barangay (FR-12).
  const barangayId = req.user.barangay_id;
  if (barangayId == null) {
    return res.status(403).json({
      success: false,
      error: 'No barangay assigned to your account. Contact the system administrator.',
      message: 'No barangay assigned to your account. Contact the system administrator.',
    });
  }
  try {
    const { startDate, endDate, prevStartDate, prevEndDate, label, preset } = resolveDateRange(req.query);

    // Manila-timezone comparisons throughout (see dateRange.js) — a report
    // submitted at 2am PHT is still 18:00 UTC the previous day in the DB.
    const runWindow = async (from, to) => {
      const [[row]] = await pool.execute(
        `SELECT
           SUM(CASE WHEN r.status = 'pending'  AND DATE(${mnl('r.submitted_at')}) BETWEEN ? AND ? THEN 1 ELSE 0 END) AS pending,
           SUM(CASE WHEN r.status = 'verified' AND DATE(${mnl('r.verified_at')})  BETWEEN ? AND ? THEN 1 ELSE 0 END) AS verified,
           SUM(CASE WHEN r.status = 'rejected' AND DATE(${mnl('r.verified_at')})  BETWEEN ? AND ? THEN 1 ELSE 0 END) AS rejected,
           COALESCE(AVG(CASE WHEN r.verified_at IS NOT NULL AND DATE(${mnl('r.verified_at')}) BETWEEN ? AND ?
                          THEN TIMESTAMPDIFF(MINUTE, r.submitted_at, r.verified_at) END), 0) AS avg_review_min
         FROM VIOLATION_REPORTS r
         LEFT JOIN STREETS s ON s.street_id = r.street_id
         WHERE COALESCE(r.barangay_id, s.barangay_id) = ?`,
        [from, to, from, to, from, to, from, to, barangayId]
      );
      return row;
    };

    const [current, previous] = await Promise.all([
      runWindow(startDate, endDate),
      runWindow(prevStartDate, prevEndDate),
    ]);

    const pending = Number(current.pending ?? 0);
    const verified = Number(current.verified ?? 0);
    const rejected = Number(current.rejected ?? 0);
    const avgReviewMin = Math.round(Number(current.avg_review_min ?? 0));

    return res.json({ success: true, message: 'Success', data: {
      pending, verified, rejected, avg_review_min: avgReviewMin,
      trend: {
        pending:  trendPct(pending,  previous.pending),
        verified: trendPct(verified, previous.verified),
        rejected: trendPct(rejected, previous.rejected),
        avg_review_min: trendPct(avgReviewMin, Math.round(Number(previous.avg_review_min ?? 0))),
      },
      date_range: { start: startDate, end: endDate, label, preset },
    }});
  } catch (err) { return next(err); }
};

// ---------------------------------------------------------------------------
// PATCH /api/reports/:reportId/verify   { action: 'approve'|'reject', rejection_reason? }
// ---------------------------------------------------------------------------
// Philippine plate format — current "ABC 1234", legacy "ABC 123", or
// motorcycle "ABC 12-3456". Mirrors utils/plateValidator.js PLATE_FORMAT.
const PLATE_RE = /^[A-Z]{3} \d{4}$|^[A-Z]{3} \d{3}$|^[A-Z]{3} \d{2}-\d{4}$/;
const getResponseWindowMin = async () => {
  try {
    const [[row]] = await pool.execute(
      "SELECT config_value FROM SYSTEM_CONFIG WHERE config_key = 'escalation_response_window_minutes'"
    );
    if (row) return parseInt(row.config_value, 10) || 60;
  } catch {}
  return parseInt(process.env.MTPB_RESPONSE_WINDOW_MINUTES, 10)
    || parseInt(process.env.MTPB_RESPONSE_TIMER_MINUTES, 10)
    || 60;
};

const verify = async (req, res, next) => {
  const reportId = parseInt(req.params.reportId, 10);
  const { action, rejection_reason, verified_plate } = req.body;
  if (!['approve', 'reject'].includes(action)) return fail(res, 400, 'action must be "approve" or "reject".');
  // FIX 4 — missing rejection reason is a validation error (422), not a 400.
  if (action === 'reject' && (!rejection_reason || !rejection_reason.trim())) {
    return fail(res, 422, 'Rejection reason is required.');
  }

  // FIX 5 (UC-04 AF-2) — official may override the plate they visually verified.
  let verifiedPlate = null;
  if (action === 'approve' && verified_plate != null && String(verified_plate).trim() !== '') {
    verifiedPlate = String(verified_plate).trim().toUpperCase();
    if (!PLATE_RE.test(verifiedPlate)) return fail(res, 422, 'Invalid plate format for verified_plate.');
  }

  try {
    const [[report]] = await pool.execute(
      `SELECT vr.report_id, vr.status, vr.street_id,
              COALESCE(vr.barangay_id, s.barangay_id) AS eff_barangay
         FROM VIOLATION_REPORTS vr
         LEFT JOIN STREETS s ON s.street_id = vr.street_id
        WHERE vr.report_id = ? LIMIT 1`,
      [reportId]
    );
    if (!report) return fail(res, 404, 'Report not found.');
    if (report.status !== 'pending') return fail(res, 409, 'Only pending reports can be verified.');

    // FIX 3 — scope to the official's own barangay (FR-12).
    if (req.user.barangay_id == null) {
      return fail(res, 403, 'No barangay assigned to your account. Contact the system administrator.');
    }
    if (report.eff_barangay !== req.user.barangay_id) {
      return fail(res, 403, 'This report does not belong to your barangay.');
    }

    if (action === 'approve') {
      const responseWindowMin = await getResponseWindowMin();
      // Atomic: status update (+ optional plate override) and queue entry.
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.execute(
          `UPDATE VIOLATION_REPORTS
              SET status = 'verified', verified_by = ?, verified_at = NOW(),
                  manual_plate_input = COALESCE(?, manual_plate_input)
            WHERE report_id = ?`,
          [req.user.id, verifiedPlate, reportId]
        );
        await connection.execute(
          `INSERT INTO MTPB_QUEUE (report_id, queued_at, response_deadline)
             VALUES (?, NOW(), DATE_ADD(NOW(), INTERVAL ? MINUTE))
           ON DUPLICATE KEY UPDATE queued_at = NOW(),
             response_deadline = DATE_ADD(NOW(), INTERVAL ? MINUTE),
             renotified = FALSE, renotified_at = NULL, is_escalated = FALSE,
             escalated_at = NULL, escalation_reason = NULL`,
          [reportId, responseWindowMin, responseWindowMin]
        );
        await connection.commit();
      } catch (err) {
        await connection.rollback();
        throw err;
      } finally {
        connection.release();
      }
      await notificationService.send(null, reportId, 'verified');
      await logAudit(req, 'reports', 'manage', 'update', 'VIOLATION_REPORTS', reportId,
        { status: 'pending' }, { status: 'verified', verified_plate_applied: verifiedPlate != null });
      return res.json({
        success: true,
        message: 'Report approved.',
        data: { report_id: reportId, action, verified_plate_applied: verifiedPlate != null },
      });
    }

    await pool.execute(
      `UPDATE VIOLATION_REPORTS SET status = 'rejected', rejection_reason = ?, verified_by = ?, verified_at = NOW() WHERE report_id = ?`,
      [rejection_reason.trim(), req.user.id, reportId]
    );
    await notificationService.send(null, reportId, 'rejected', { rejection_reason: rejection_reason.trim() });
    await logAudit(req, 'reports', 'manage', 'update', 'VIOLATION_REPORTS', reportId,
      { status: 'pending' }, { status: 'rejected', rejection_reason: rejection_reason.trim() });
    return res.json({ success: true, message: 'Report rejected.', data: { report_id: reportId, action } });
  } catch (err) { return next(err); }
};

// ---------------------------------------------------------------------------
// GET /api/reports/queue/mtpb
// Returns verified/acknowledged/dispatched/escalated reports for MTPB.
// ---------------------------------------------------------------------------
const mtpbQueue = async (req, res, next) => {
  try {
    // FIX 6 — escalated reports belong to the supervisor queue; exclude them
    // here. 'dispatched' stays so the assigned officer can resolve from here.
    const [rows] = await pool.execute(
      `${REPORT_SELECT}
       WHERE r.status IN ('verified','acknowledged','dispatched')
         AND r.is_escalated = FALSE
       ORDER BY v.is_repeat_offender DESC, r.verified_at ASC`
    );
    const now = Date.now();
    const data = rows.map((r) => {
      const m = mapRow(r);
      m.time_in_queue_minutes = r.verified_at
        ? Math.max(0, Math.floor((now - new Date(r.verified_at).getTime()) / 60000))
        : null;
      m.response_deadline = r.response_deadline ?? null;
      return m;
    });
    return res.json({ success: true, message: 'Success', data });
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
    await notificationService.send(null, reportId, 'acknowledged');
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
    await notificationService.send(null, reportId, 'dispatched');
    return res.json({ success: true, message: 'Report dispatched.', data: { report_id: reportId } });
  } catch (err) { return next(err); }
};

// ---------------------------------------------------------------------------
// PATCH /api/reports/:reportId/resolve  { resolution_outcome, ticket_reference? }
// ---------------------------------------------------------------------------
// Resolution outcomes that CONFIRM a real violation and therefore advance the
// vehicle's offense count (FR-13). Every enforcement action counts — including a
// 1st-offense Verbal Warning — so the vehicle progresses through the tiers. Only
// "Vehicle No Longer Present" (the officer found nothing to enforce) does not.
// 'Vehicle Clamped' is kept as a legacy alias for 'Wheel Clamp'.
const COUNTABLE_OUTCOMES = ['Verbal Warning', 'Ticket Issued', 'Wheel Clamp', 'Vehicle Clamped', 'Vehicle Impounded'];

// Outcomes that issue physical paperwork and therefore require a ticket/reference
// number. A Verbal Warning counts as an offense but needs no paperwork.
const TICKET_REQUIRED_OUTCOMES = ['Ticket Issued', 'Wheel Clamp', 'Vehicle Clamped', 'Vehicle Impounded'];
const VALID_OUTCOMES = [
  'Verbal Warning',
  'Ticket Issued',
  'Wheel Clamp',
  'Vehicle Clamped',            // legacy alias for 'Wheel Clamp'
  'Vehicle Impounded',
  'Vehicle No Longer Present',  // resolution, not a violation — never counts
];

const resolve = async (req, res, next) => {
  const reportId = parseInt(req.params.reportId, 10);
  const { resolution_outcome, ticket_reference } = req.body;
  if (!resolution_outcome) return fail(res, 400, 'resolution_outcome is required.');
  // resolution_outcome is a varchar with no DB constraint, so this allowlist is the
  // only guard. An unrecognised value would fail the COUNTABLE_OUTCOMES check
  // silently and drop a confirmed violation from the vehicle's history — fail loudly.
  if (!VALID_OUTCOMES.includes(resolution_outcome)) {
    return fail(res, 400, `Invalid resolution_outcome. Must be one of: ${VALID_OUTCOMES.join(', ')}.`);
  }
  // UC-08 Step 3 (paper p.87): a paperwork outcome requires a ticket reference.
  if (TICKET_REQUIRED_OUTCOMES.includes(resolution_outcome)
      && (!ticket_reference || !String(ticket_reference).trim())) {
    return fail(res, 422, 'Ticket reference is required.');
  }

  try {
    const [[report]] = await pool.execute(
      'SELECT status, vehicle_id FROM VIOLATION_REPORTS WHERE report_id = ?',
      [reportId]
    );
    if (!report) return fail(res, 404, 'Report not found.');
    if (!['dispatched', 'acknowledged', 'escalated', 'verified'].includes(report.status)) {
      return fail(res, 409, `Cannot resolve a report with status "${report.status}".`);
    }

    await resolveAndCount(reportId, report.vehicle_id, resolution_outcome, ticket_reference);
    await notificationService.send(null, reportId, 'resolved', { resolution_outcome });
    return res.json({ success: true, message: 'Report resolved.', data: { report_id: reportId } });
  } catch (err) { return next(err); }
};

// Marks a report resolved and, for a countable outcome (Ticket Issued / Vehicle
// Clamped), atomically increments the vehicle's total_violations counter and
// recomputes is_repeat_offender (FR-13). Counting happens HERE, at resolution —
// never at submission — so unconfirmed or "Vehicle No Longer Present" reports
// never inflate a plate's offense history.
const resolveAndCount = async (reportId, vehicleId, outcome, ticketReference) => {
  const countable = COUNTABLE_OUTCOMES.includes(outcome);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `UPDATE VIOLATION_REPORTS
          SET status='resolved', resolution_outcome=?, ticket_reference=?, resolved_at=NOW(), is_escalated=FALSE
        WHERE report_id=?`,
      [outcome, ticketReference ?? null, reportId]
    );
    if (countable && vehicleId) {
      await connection.execute(
        `UPDATE VEHICLES SET total_violations = total_violations + 1 WHERE vehicle_id = ?`,
        [vehicleId]
      );
      // Repeat offender = 2+ confirmed violations (schema.sql:87). Recomputed as a
      // separate statement so it reads the incremented value, not the stale one.
      await connection.execute(
        `UPDATE VEHICLES SET is_repeat_offender = (total_violations >= 2) WHERE vehicle_id = ?`,
        [vehicleId]
      );
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
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
// GET /api/reports/analytics/summary?range=7d|30d|60d|today  (or start_date+end_date)
//
// Two kinds of metric, deliberately handled differently:
//  - "Current state" (pending_now, escalated_now, total_repeat_offenders): a
//    live queue-depth/roster snapshot. Never date-filtered — filtering "how
//    many are escalated right now" by a submission-date range doesn't mean
//    anything, and would make the number silently wrong for old-but-still-
//    escalated reports outside the window.
//  - "Period activity" (submitted/resolved/rejected counts, avg durations,
//    fines issued, repeat offenders active in the period): scoped to the
//    selected range, each against the timestamp that actually happened in
//    that window (submitted_at for submissions, resolved_at for resolutions,
//    etc.) — not all pinned to submitted_at like the previous version, which
//    made "Reports Resolved" actually mean "resolved reports that happened
//    to be SUBMITTED in this window", silently excluding reports submitted
//    earlier but resolved during the selected period.
// ---------------------------------------------------------------------------
const analyticsSummary = async (req, res, next) => {
  try {
    const { startDate, endDate, prevStartDate, prevEndDate, label, preset } = resolveDateRange(req.query);

    // Manila-timezone comparisons throughout (see dateRange.js) — every
    // DATE(col) is wrapped with mnl() so a report submitted at 2am PHT isn't
    // misfiled into the previous UTC day.
    const runPeriod = async (from, to) => {
      const [[row]] = await pool.execute(
        `SELECT
           SUM(CASE WHEN DATE(${mnl('r.submitted_at')}) BETWEEN ? AND ? THEN 1 ELSE 0 END) AS reports_submitted,
           SUM(CASE WHEN r.status = 'resolved' AND DATE(${mnl('r.resolved_at')}) BETWEEN ? AND ? THEN 1 ELSE 0 END) AS reports_resolved,
           SUM(CASE WHEN r.status = 'rejected' AND DATE(${mnl('r.verified_at')})  BETWEEN ? AND ? THEN 1 ELSE 0 END) AS total_rejected,
           SUM(CASE WHEN r.status IN ('verified','acknowledged','dispatched','resolved')
                     AND DATE(${mnl('r.verified_at')}) BETWEEN ? AND ? THEN 1 ELSE 0 END) AS total_verified,
           SUM(CASE WHEN r.status IN ('acknowledged','dispatched','resolved')
                     AND DATE(${mnl('r.acknowledged_at')}) BETWEEN ? AND ? THEN 1 ELSE 0 END) AS total_acknowledged,
           COALESCE(AVG(CASE WHEN r.verified_at IS NOT NULL AND DATE(${mnl('r.verified_at')}) BETWEEN ? AND ?
                          THEN TIMESTAMPDIFF(MINUTE, r.submitted_at, r.verified_at) END), 0) AS avg_verify_min,
           COALESCE(AVG(CASE WHEN r.acknowledged_at IS NOT NULL AND DATE(${mnl('r.acknowledged_at')}) BETWEEN ? AND ?
                          THEN TIMESTAMPDIFF(MINUTE, r.verified_at, r.acknowledged_at) END), 0) AS avg_mtpb_response_min,
           COALESCE(AVG(CASE WHEN r.resolved_at IS NOT NULL AND DATE(${mnl('r.resolved_at')}) BETWEEN ? AND ?
                          THEN TIMESTAMPDIFF(MINUTE, r.submitted_at, r.resolved_at) END), 0) AS avg_resolution_min,
           COALESCE(AVG(CASE WHEN r.escalated_at IS NOT NULL AND DATE(${mnl('r.escalated_at')}) BETWEEN ? AND ?
                          THEN TIMESTAMPDIFF(MINUTE, r.verified_at, r.escalated_at) END), 0) AS avg_escalation_min
         FROM VIOLATION_REPORTS r
         WHERE DATE(${mnl('r.submitted_at')}) BETWEEN ? AND ?
            OR DATE(${mnl('r.resolved_at')}) BETWEEN ? AND ?
            OR DATE(${mnl('r.verified_at')}) BETWEEN ? AND ?
            OR DATE(${mnl('r.acknowledged_at')}) BETWEEN ? AND ?
            OR DATE(${mnl('r.escalated_at')}) BETWEEN ? AND ?`,
        Array(14).fill([from, to]).flat()
      );

      // Fines issued for reports actually resolved in this window (a paperwork
      // outcome — Verbal Warning is 0, "Vehicle No Longer Present" issues none).
      const [[fineRow]] = await pool.execute(
        `SELECT COALESCE(SUM(t.fine_amount), 0) AS total_fines
           FROM VIOLATION_REPORTS r
           JOIN PENALTY_TIERS t ON t.tier_id = r.penalty_tier_id
          WHERE r.status = 'resolved' AND DATE(${mnl('r.resolved_at')}) BETWEEN ? AND ?
            AND r.resolution_outcome IN ('Ticket Issued','Wheel Clamp','Vehicle Clamped','Vehicle Impounded')`,
        [from, to]
      );

      // Repeat offenders (>=2 confirmed violations) with at least one report
      // submitted in this window — "repeat offender activity during period X".
      const [[repeatRow]] = await pool.execute(
        `SELECT COUNT(DISTINCT v.vehicle_id) AS repeat_in_range
           FROM VEHICLES v
           JOIN VIOLATION_REPORTS vr ON vr.vehicle_id = v.vehicle_id
          WHERE v.total_violations >= 2 AND DATE(${mnl('vr.submitted_at')}) BETWEEN ? AND ?`,
        [from, to]
      );

      const submitted = Number(row.reports_submitted ?? 0);
      const resolved = Number(row.reports_resolved ?? 0);
      return {
        reports_submitted: submitted,
        reports_resolved: resolved,
        total_verified: Number(row.total_verified ?? 0),
        total_acknowledged: Number(row.total_acknowledged ?? 0),
        total_rejected: Number(row.total_rejected ?? 0),
        resolution_rate: submitted > 0 ? Math.round((resolved / submitted) * 100) : 0,
        avg_verify_min: Math.round(Number(row.avg_verify_min ?? 0)),
        avg_mtpb_response_min: Math.round(Number(row.avg_mtpb_response_min ?? 0)),
        avg_resolution_min: Math.round(Number(row.avg_resolution_min ?? 0)),
        avg_escalation_min: Math.round(Number(row.avg_escalation_min ?? 0)),
        total_fines_issued: Number(fineRow.total_fines ?? 0),
        repeat_offenders_in_range: Number(repeatRow.repeat_in_range ?? 0),
      };
    };

    const [current, previous] = await Promise.all([
      runPeriod(startDate, endDate),
      runPeriod(prevStartDate, prevEndDate),
    ]);

    // Current-state snapshot — deliberately NOT part of runPeriod, never date-filtered.
    const [[stateRow]] = await pool.execute(
      `SELECT
         SUM(CASE WHEN status = 'pending'   THEN 1 ELSE 0 END) AS pending_now,
         SUM(CASE WHEN status = 'escalated' THEN 1 ELSE 0 END) AS escalated_now
       FROM VIOLATION_REPORTS`
    );

    // A repeat offender is a VEHICLE with >= 2 confirmed violations, all-time by
    // definition — not date-filtered.
    const [[roStats]] = await pool.execute(
      `SELECT COUNT(*) AS total_repeat_offenders FROM VEHICLES WHERE total_violations >= 2`
    );

    const trend = {
      reports_submitted: trendPct(current.reports_submitted, previous.reports_submitted),
      reports_resolved: trendPct(current.reports_resolved, previous.reports_resolved),
      resolution_rate: trendPct(current.resolution_rate, previous.resolution_rate),
      avg_verify_min: trendPct(current.avg_verify_min, previous.avg_verify_min),
      avg_mtpb_response_min: trendPct(current.avg_mtpb_response_min, previous.avg_mtpb_response_min),
      avg_resolution_min: trendPct(current.avg_resolution_min, previous.avg_resolution_min),
      avg_escalation_min: trendPct(current.avg_escalation_min, previous.avg_escalation_min),
      total_fines_issued: trendPct(current.total_fines_issued, previous.total_fines_issued),
    };

    return res.json({ success: true, message: 'Success', data: {
      // Existing field names (kept for the supervisor portal / CSV) — now
      // period-scoped to the selected date range instead of all-time/today.
      reports_submitted: current.reports_submitted,
      reports_resolved: current.reports_resolved,
      pending_now: Number(stateRow.pending_now ?? 0),
      escalated_now: Number(stateRow.escalated_now ?? 0),
      resolved_today: current.reports_resolved, // kept for back-compat; equal to reports_resolved for the selected range
      resolution_rate: current.resolution_rate,
      avg_verify_min: current.avg_verify_min,
      avg_mtpb_response_min: current.avg_mtpb_response_min,
      avg_escalation_min: current.avg_escalation_min,
      total_repeat_offenders: Number(roStats.total_repeat_offenders ?? 0),
      repeat_this_month: current.repeat_offenders_in_range, // kept for back-compat; now range-scoped, not hardcoded to the calendar month
      total_fines_issued: current.total_fines_issued,
      // FIX 7 — paper/audit field names (additive).
      total_submitted: current.reports_submitted,
      total_verified: current.total_verified,
      total_acknowledged: current.total_acknowledged,
      total_escalated: Number(stateRow.escalated_now ?? 0),
      total_resolved: current.reports_resolved,
      total_rejected: current.total_rejected,
      pending: Number(stateRow.pending_now ?? 0),
      avg_verify_time_minutes: current.avg_verify_min,
      avg_acknowledgment_time_minutes: current.avg_mtpb_response_min,
      avg_resolution_time_minutes: current.avg_resolution_min,
      trend,
      date_range: { start: startDate, end: endDate, label, preset },
    }});
  } catch (err) { return next(err); }
};

// ---------------------------------------------------------------------------
// GET /api/reports/analytics/repeat-offenders
// ---------------------------------------------------------------------------
const repeatOffenders = async (req, res, next) => {
  try {
    // FIX 8 (FR-19) — include the location/status of each vehicle's most recent
    // violation. last_violation_date is kept for the existing CSV export.
    const [rows] = await pool.execute(
      `SELECT
         v.plate_number,
         v.total_violations,
         v.is_repeat_offender,
         v.first_recorded_at,
         MAX(vr.submitted_at) AS last_seen,
         MAX(vr.submitted_at) AS last_violation_date,
         latest.street_name   AS last_seen_street,
         latest.barangay_name AS last_seen_barangay,
         latest.status        AS last_violation_status
       FROM VEHICLES v
       JOIN VIOLATION_REPORTS vr ON vr.vehicle_id = v.vehicle_id
       JOIN (
         SELECT vr2.vehicle_id, vr2.status, s.street_name, b.barangay_name
         FROM VIOLATION_REPORTS vr2
         LEFT JOIN STREETS s   ON vr2.street_id = s.street_id
         LEFT JOIN BARANGAYS b ON s.barangay_id = b.barangay_id
         WHERE vr2.submitted_at = (
           SELECT MAX(vr3.submitted_at) FROM VIOLATION_REPORTS vr3 WHERE vr3.vehicle_id = vr2.vehicle_id
         )
       ) latest ON latest.vehicle_id = v.vehicle_id
       WHERE v.total_violations >= 2
       GROUP BY v.vehicle_id, v.plate_number, v.total_violations, v.is_repeat_offender,
                v.first_recorded_at, latest.street_name, latest.barangay_name, latest.status
       ORDER BY v.total_violations DESC, last_seen DESC
       LIMIT 100`
    );
    return res.json({
      success: true,
      message: 'Success',
      data: rows.map((r) => ({ ...r, is_repeat_offender: !!r.is_repeat_offender })),
    });
  } catch (err) { return next(err); }
};

// ---------------------------------------------------------------------------
// GET /api/reports/analytics/violation-map
// Per-street violation counts (with coordinates) for the supervisor heat map.
// Excludes rejected reports; only streets with coordinates and ≥1 violation.
// ---------------------------------------------------------------------------
// GET /api/reports/analytics/violation-map?range=7d|30d|60d|today  (or start_date+end_date)
// Date range is OPTIONAL here (unlike the other analytics endpoints): with no
// range param at all this stays all-time (cumulative hotspots — the original,
// still the most useful default for enforcement resource planning), but the
// Supervisor Reports page passes its selected range so the map narrows
// consistently with the rest of that page when the user picks one.
const violationMap = async (req, res, next) => {
  try {
    const hasRange = !!(req.query.range || (req.query.start_date && req.query.end_date));
    const dateRange = hasRange ? resolveDateRange(req.query) : null;
    const dateFilter = dateRange ? 'AND DATE(r.submitted_at) BETWEEN ? AND ?' : '';
    const params = dateRange ? [dateRange.startDate, dateRange.endDate] : [];

    // Barangay-level density: one point per barangay at its verified OSM centroid,
    // counting all non-rejected reports in that barangay. Plotting per-street was
    // unreliable (Manila street names repeat; barangay boundaries aren't published).
    const [rows] = await pool.execute(
      `SELECT b.barangay_id, b.barangay_name, b.latitude, b.longitude,
              COUNT(r.report_id) AS violation_count
         FROM BARANGAYS b
         LEFT JOIN VIOLATION_REPORTS r
                ON r.barangay_id = b.barangay_id AND r.status <> 'rejected' ${dateFilter}
        WHERE b.latitude IS NOT NULL AND b.longitude IS NOT NULL
        GROUP BY b.barangay_id, b.barangay_name, b.latitude, b.longitude
       HAVING violation_count > 0
        ORDER BY violation_count DESC`,
      params
    );

    return res.json({
      success: true,
      message: 'Success',
      data: {
        points: rows.map((r) => ({
          barangay_id: r.barangay_id,
          barangay_name: r.barangay_name,
          latitude: Number(r.latitude),
          longitude: Number(r.longitude),
          violation_count: Number(r.violation_count),
        })),
        generated_at: new Date().toISOString(),
        date_range: dateRange ? { start: dateRange.startDate, end: dateRange.endDate, label: dateRange.label, preset: dateRange.preset } : null,
      },
    });
  } catch (err) { return next(err); }
};

// ---------------------------------------------------------------------------
// GET /api/reports/queue/supervisor
// Escalated reports awaiting supervisor action (UC-10), oldest escalation first.
// ---------------------------------------------------------------------------
const supervisorQueue = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `${REPORT_SELECT.replace(
        'v.plate_number, v.total_violations, v.is_repeat_offender,',
        `v.plate_number, v.total_violations, v.is_repeat_offender,
         r.escalation_reason,
         TIMESTAMPDIFF(SECOND, r.escalated_at, NOW()) AS seconds_since_escalation,`,
      )}
       WHERE r.status = 'escalated'
       ORDER BY r.escalated_at ASC`
    );

    // escalated_now is current queue depth — never date-filtered (same
    // reasoning as analyticsSummary above).
    const [[stateRow]] = await pool.execute(
      `SELECT SUM(CASE WHEN status = 'escalated' THEN 1 ELSE 0 END) AS escalated_now FROM VIOLATION_REPORTS`
    );

    // avg_escalation_time_minutes / resolved-in-range / resolution_rate are
    // period activity, scoped to the selected date range with a trend vs the
    // prior period of equal length.
    const { startDate, endDate, prevStartDate, prevEndDate, label, preset } = resolveDateRange(req.query);
    const runPeriod = async (from, to) => {
      const [[row]] = await pool.execute(
        `SELECT
           COALESCE(AVG(CASE WHEN escalated_at IS NOT NULL AND DATE(escalated_at) BETWEEN ? AND ?
                          THEN TIMESTAMPDIFF(MINUTE, verified_at, escalated_at) END), 0) AS avg_escalation_time_minutes,
           SUM(CASE WHEN status = 'resolved' AND DATE(resolved_at) BETWEEN ? AND ? THEN 1 ELSE 0 END) AS resolved_in_range,
           SUM(CASE WHEN DATE(submitted_at) BETWEEN ? AND ? THEN 1 ELSE 0 END) AS submitted_in_range
         FROM VIOLATION_REPORTS
         WHERE DATE(submitted_at) BETWEEN ? AND ? OR DATE(resolved_at) BETWEEN ? AND ? OR DATE(escalated_at) BETWEEN ? AND ?`,
        Array(6).fill([from, to]).flat()
      );
      const submitted = Number(row.submitted_in_range ?? 0);
      const resolved = Number(row.resolved_in_range ?? 0);
      return {
        avg_escalation_time_minutes: Math.round(Number(row.avg_escalation_time_minutes ?? 0)),
        resolved_in_range: resolved,
        resolution_rate: submitted > 0 ? Math.round((resolved / submitted) * 100) : 0,
      };
    };
    const [current, previous] = await Promise.all([
      runPeriod(startDate, endDate),
      runPeriod(prevStartDate, prevEndDate),
    ]);

    const reports = rows.map((r) => ({
      ...mapRow(r),
      escalation_reason: r.escalation_reason,
      seconds_since_escalation: r.seconds_since_escalation === null ? null : Number(r.seconds_since_escalation),
    }));

    return res.json({ success: true, message: 'Success', data: {
      reports,
      stats: {
        escalated_now: Number(stateRow.escalated_now ?? 0),
        avg_escalation_time_minutes: current.avg_escalation_time_minutes,
        resolved_today: current.resolved_in_range, // kept for back-compat; now range-scoped, not hardcoded to today
        resolution_rate: current.resolution_rate,
        trend: {
          avg_escalation_time_minutes: trendPct(current.avg_escalation_time_minutes, previous.avg_escalation_time_minutes),
          resolved_today: trendPct(current.resolved_in_range, previous.resolved_in_range),
          resolution_rate: trendPct(current.resolution_rate, previous.resolution_rate),
        },
        date_range: { start: startDate, end: endDate, label, preset },
      },
    }});
  } catch (err) { return next(err); }
};

// ---------------------------------------------------------------------------
// PATCH /api/reports/:reportId/supervisor-resolve  { resolution_outcome, ticket_reference? }
// UC-10 AF-1 — a supervisor resolves directly. Source status (escalated/
// dispatched) is enforced by requireStatus('supervisor_resolve'); no
// assigned-officer check. Counter increments at resolution for a countable
// outcome, identical to the officer resolve path (FR-13).
// ---------------------------------------------------------------------------
const supervisorResolve = async (req, res, next) => {
  const reportId = parseInt(req.params.reportId, 10);
  const { resolution_outcome, ticket_reference } = req.body;
  if (!resolution_outcome) return fail(res, 400, 'resolution_outcome is required.');
  if (TICKET_REQUIRED_OUTCOMES.includes(resolution_outcome)
      && (!ticket_reference || !String(ticket_reference).trim())) {
    return fail(res, 422, 'Ticket reference is required.');
  }

  try {
    const [[report]] = await pool.execute(
      'SELECT vehicle_id FROM VIOLATION_REPORTS WHERE report_id = ?',
      [reportId]
    );
    if (!report) return fail(res, 404, 'Report not found.');

    await resolveAndCount(reportId, report.vehicle_id, resolution_outcome, ticket_reference);
    await notificationService.send(null, reportId, 'resolved', { resolution_outcome });
    return res.json({ success: true, message: 'Report resolved.', data: { report_id: reportId, status: 'resolved', resolution_outcome } });
  } catch (err) { return next(err); }
};

// ---------------------------------------------------------------------------
// GET /api/reports  — paginated all-reports list (supervisor / admin).
// Filters: start_date, end_date, barangay_id, status, page, limit.
// ---------------------------------------------------------------------------
const allReports = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const where = ['1=1'];
    const params = [];
    if (req.query.start_date && req.query.end_date) {
      where.push('DATE(r.submitted_at) BETWEEN ? AND ?');
      params.push(req.query.start_date, req.query.end_date);
    }
    if (req.query.status) { where.push('r.status = ?'); params.push(req.query.status); }
    if (req.query.barangay_id) {
      where.push('COALESCE(r.barangay_id, s.barangay_id) = ?');
      params.push(parseInt(req.query.barangay_id, 10));
    }
    const whereSql = where.join(' AND ');

    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total
         FROM VIOLATION_REPORTS r
         LEFT JOIN STREETS s ON s.street_id = r.street_id
        WHERE ${whereSql}`,
      params
    );

    // limit/offset are validated integers — inlined to avoid mysql2 placeholder
    // quirks with LIMIT/OFFSET bound params.
    const [rows] = await pool.execute(
      `${REPORT_SELECT}
        WHERE ${whereSql}
        ORDER BY r.submitted_at DESC
        LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    return sendPaginated(res, rows.map(mapRow), Number(total), page, limit);
  } catch (err) { return next(err); }
};

module.exports = {
  barangayQueue, barangayStats, verify,
  mtpbQueue, acknowledge, dispatch, resolve, assign,
  supervisorQueue, supervisorResolve, allReports,
  analyticsSummary, repeatOffenders, violationMap,
};
