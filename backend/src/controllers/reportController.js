'use strict';

/**
 * Report controller — violation-report submission pipeline and read endpoints
 * (VIOLATION_REPORTS table).
 *
 * Submission pipeline (create / confirm):
 *   1. parking-rule validation → 2. OCR → 3. plate determination →
 *   4. format validation → 5. duplicate detection →
 *   6. cross-barangay lookup & penalty tier → 7. atomic insert + vehicle
 *   counter update → 8. notify & return.
 */

const { validationResult } = require('express-validator');

const { pool } = require('../config/db');
const logger = require('../config/logger');
const ocrService = require('../services/ocrService');
const notificationService = require('../services/notificationService');
const storageService = require('../services/storageService');

// VIOLATION_REPORTS.ocr_raw_response is TEXT (64KB); large Vision responses
// (full bounding boxes) can exceed it, so cap before insert.
const MAX_RAW_RESPONSE_CHARS = 60000;

const duplicateWindowMinutes = () =>
  parseInt(process.env.DUPLICATE_WINDOW_MINUTES, 10)
  || parseInt(process.env.DUPLICATE_DETECTION_WINDOW_MINUTES, 10)
  || 30;

// Pipeline failures use the spec'd { error } shape; `message` is kept alongside
// for consistency with the rest of the API envelope.
const fail = (res, statusCode, error) =>
  res.status(statusCode).json({ success: false, error, message: error });

const handleValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return false;
  }
  return true;
};

// ---------------------------------------------------------------------------
// Pipeline steps shared by create() and confirm()
// ---------------------------------------------------------------------------

/**
 * Step 1 — parking-rule validation. Returns the street's barangay_id (used to
 * denormalize onto the report) or null when no active rule exists.
 */
const findActiveRule = async (streetId, violationType) => {
  const [[rule]] = await pool.execute(
    `SELECT p.rule_id, s.barangay_id
       FROM PARKING_RULES p
       JOIN STREETS s ON s.street_id = p.street_id
      WHERE p.street_id = ? AND p.violation_type = ? AND p.is_active = TRUE
      LIMIT 1`,
    [streetId, violationType]
  );
  return rule || null;
};

/**
 * Steps 5–8 — duplicate detection, vehicle lookup/creation, penalty tier,
 * atomic report insert + vehicle counter update, notification.
 * `plate` must already be normalized and format-validated (step 4).
 */
const finishPipeline = async (res, ctx) => {
  const {
    plate, citizenId, streetId, barangayId, violationType,
    photoPath, ocrRawResponse, ocrExtractedPlate, ocrConfidenceScore, manualPlateInput,
  } = ctx;

  // Step 5 — duplicate detection: same plate + street within the rolling
  // window, ignoring rejected reports.
  const [[duplicate]] = await pool.execute(
    `SELECT r.report_id
       FROM VIOLATION_REPORTS r
       JOIN VEHICLES v ON v.vehicle_id = r.vehicle_id
      WHERE v.plate_number = ?
        AND r.street_id = ?
        AND r.submitted_at > NOW() - INTERVAL ? MINUTE
        AND r.status NOT IN ('rejected')
      LIMIT 1`,
    [plate, streetId, duplicateWindowMinutes()]
  );
  if (duplicate) {
    return fail(res, 409, 'A duplicate report already exists for this vehicle at this location.');
  }

  // Step 6 — cross-barangay lookup: one VEHICLES row per plate, shared by all
  // barangays, so total_violations accumulates district-wide.
  let [[vehicle]] = await pool.execute(
    'SELECT vehicle_id, total_violations FROM VEHICLES WHERE plate_number = ? LIMIT 1',
    [plate]
  );
  if (!vehicle) {
    try {
      const [created] = await pool.execute(
        'INSERT INTO VEHICLES (plate_number, total_violations, first_recorded_at) VALUES (?, 0, NOW())',
        [plate]
      );
      vehicle = { vehicle_id: created.insertId, total_violations: 0 };
    } catch (err) {
      if (err.code !== 'ER_DUP_ENTRY') throw err;
      // Concurrent request created it between our SELECT and INSERT.
      [[vehicle]] = await pool.execute(
        'SELECT vehicle_id, total_violations FROM VEHICLES WHERE plate_number = ? LIMIT 1',
        [plate]
      );
    }
  }

  const [[tier]] = await pool.execute(
    `SELECT tier_id, tier_name, fine_amount, requires_clamping
       FROM PENALTY_TIERS
      WHERE min_violations <= ?
        AND (max_violations IS NULL OR max_violations >= ?)
      ORDER BY min_violations DESC
      LIMIT 1`,
    [vehicle.total_violations, vehicle.total_violations]
  );

  // Step 7 — create the report and bump the vehicle's counters atomically.
  const connection = await pool.getConnection();
  let reportId;
  try {
    await connection.beginTransaction();

    const [inserted] = await connection.execute(
      `INSERT INTO VIOLATION_REPORTS
         (citizen_id, vehicle_id, street_id, barangay_id, violation_type, photo_path,
          ocr_raw_response, ocr_extracted_plate, ocr_confidence_score,
          manual_plate_input, penalty_tier_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        citizenId,
        vehicle.vehicle_id,
        streetId,
        barangayId,
        violationType,
        photoPath,
        ocrRawResponse ? String(ocrRawResponse).slice(0, MAX_RAW_RESPONSE_CHARS) : null,
        ocrExtractedPlate ?? null,
        ocrConfidenceScore ?? null,
        manualPlateInput ?? null,
        tier ? tier.tier_id : null,
      ]
    );
    reportId = inserted.insertId;

    await connection.execute(
      `UPDATE VEHICLES
          SET total_violations = total_violations + 1,
              is_repeat_offender = (total_violations + 1 >= 2)
        WHERE vehicle_id = ?`,
      [vehicle.vehicle_id]
    );

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  // Step 8 — notify (best-effort: a logging failure must not fail the report).
  try {
    await notificationService.send(citizenId, reportId, 'pending');
  } catch (err) {
    logger.warn(`Notification failed for report ${reportId}: ${err.message}`);
  }

  return res.status(201).json({
    success: true,
    message: 'Report submitted successfully.',
    data: {
      report_id: reportId,
      status: 'pending',
      penalty_tier: tier
        ? {
            tier_id: tier.tier_id,
            tier_name: tier.tier_name,
            fine_amount: Number(tier.fine_amount),
            requires_clamping: !!tier.requires_clamping,
          }
        : null,
    },
  });
};

// ---------------------------------------------------------------------------
// POST /api/reports
// FR: OCR-assisted citizen report submission. Validates the parking rule,
// extracts the plate via Cloud Vision, and either creates the report
// (auto-accepted plate) or hands back to the frontend for manual confirmation.
// ---------------------------------------------------------------------------
const create = async (req, res, next) => {
  if (!handleValidation(req, res)) return undefined;

  const { photo_url, violation_type } = req.body;
  const streetId = parseInt(req.body.street_id, 10);
  const citizenId = req.user.id;

  try {
    // Step 1 — parking-rule validation
    const rule = await findActiveRule(streetId, violation_type);
    if (!rule) {
      return fail(res, 422, 'This violation type is not active for this street.');
    }

    // photo_url must point at our bucket (throws 400 otherwise); the bare
    // object path is what gets stored in VIOLATION_REPORTS.photo_path.
    const { objectPath } = storageService.parsePhotoRef(photo_url);

    // Step 2 — OCR
    const ocr = await ocrService.extractPlate(photo_url);

    // Step 3 — plate determination: low confidence or no plate → frontend
    // prompts the citizen, then resumes via POST /api/reports/confirm.
    if (ocr.needs_manual_review) {
      return res.status(200).json({
        success: true,
        message: 'Plate could not be read with enough confidence. Manual confirmation required.',
        data: {
          needs_manual_input: true,
          ocr_extracted_plate: ocr.extracted_plate,
          confidence_score: ocr.confidence_score,
          photo_url,
          street_id: streetId,
          violation_type,
        },
      });
    }

    // Step 4 — format validation
    const { valid, normalized } = await ocrService.validatePlateFormat(ocr.extracted_plate);
    if (!valid) {
      return fail(res, 422, 'Plate number format is invalid.');
    }

    // Steps 5–8
    return await finishPipeline(res, {
      plate: normalized,
      citizenId,
      streetId,
      barangayId: rule.barangay_id,
      violationType: violation_type,
      photoPath: objectPath,
      ocrRawResponse: ocr.raw_response,
      ocrExtractedPlate: normalized,
      ocrConfidenceScore: ocr.confidence_score,
      manualPlateInput: null,
    });
  } catch (err) {
    return next(err);
  }
};

// ---------------------------------------------------------------------------
// POST /api/reports/confirm
// FR: manual plate confirmation fallback. Resumes the pipeline from Step 4
// using the citizen-typed plate; stores OCR output and manual input separately
// so verifiers can compare them.
// ---------------------------------------------------------------------------
const confirm = async (req, res, next) => {
  if (!handleValidation(req, res)) return undefined;

  const {
    photo_url, violation_type, manual_plate_input,
    ocr_extracted_plate, ocr_confidence_score, ocr_raw_response,
  } = req.body;
  const streetId = parseInt(req.body.street_id, 10);
  const citizenId = req.user.id;

  try {
    // Re-run Step 1: confirm is a separate request, so the rule must be
    // re-checked — clients could otherwise skip the first call entirely.
    const rule = await findActiveRule(streetId, violation_type);
    if (!rule) {
      return fail(res, 422, 'This violation type is not active for this street.');
    }

    const { objectPath } = storageService.parsePhotoRef(photo_url);

    // Step 4 — format validation on the manual input
    const { valid, normalized } = await ocrService.validatePlateFormat(manual_plate_input);
    if (!valid) {
      return fail(res, 422, 'Plate number format is invalid.');
    }

    // Steps 5–8 (manual plate drives the pipeline; OCR fields stored as-is)
    return await finishPipeline(res, {
      plate: normalized,
      citizenId,
      streetId,
      barangayId: rule.barangay_id,
      violationType: violation_type,
      photoPath: objectPath,
      ocrRawResponse: ocr_raw_response ?? null,
      ocrExtractedPlate: ocr_extracted_plate ?? null,
      ocrConfidenceScore: ocr_confidence_score ?? null,
      manualPlateInput: normalized,
    });
  } catch (err) {
    return next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /api/reports/mine
// FR: citizen report tracking — a citizen's own submissions with full
// lifecycle timestamps and penalty info, newest first.
// ---------------------------------------------------------------------------
const mine = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT r.report_id, r.status, r.violation_type, s.street_name,
              r.submitted_at, r.verified_at, r.acknowledged_at, r.dispatched_at, r.resolved_at,
              r.resolution_outcome, r.rejection_reason,
              t.tier_name, t.fine_amount,
              v.is_repeat_offender
         FROM VIOLATION_REPORTS r
         LEFT JOIN STREETS s        ON s.street_id  = r.street_id
         LEFT JOIN PENALTY_TIERS t  ON t.tier_id    = r.penalty_tier_id
         LEFT JOIN VEHICLES v       ON v.vehicle_id = r.vehicle_id
        WHERE r.citizen_id = ?
        ORDER BY r.submitted_at DESC`,
      [req.user.id]
    );

    const reports = rows.map((row) => ({
      report_id: row.report_id,
      status: row.status,
      violation_type: row.violation_type,
      street_name: row.street_name,
      submitted_at: row.submitted_at,
      verified_at: row.verified_at,
      acknowledged_at: row.acknowledged_at,
      dispatched_at: row.dispatched_at,
      resolved_at: row.resolved_at,
      resolution_outcome: row.resolution_outcome,
      rejection_reason: row.rejection_reason,
      penalty_tier: row.tier_name
        ? { tier_name: row.tier_name, fine_amount: Number(row.fine_amount) }
        : null,
      is_repeat_offender: row.is_repeat_offender === null ? null : !!row.is_repeat_offender,
    }));

    return res.json({ success: true, message: 'Success', data: reports });
  } catch (err) {
    return next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /api/reports/:reportId
// FR: role-scoped report detail. Citizens see only their own reports;
// barangay officials only reports on streets in their barangay; MTPB staff
// and admins see everything. Reporter identity is exposed only as the
// anonymous alias — never name or email.
// ---------------------------------------------------------------------------
const getById = async (req, res, next) => {
  const reportId = parseInt(req.params.reportId, 10);
  if (!Number.isInteger(reportId) || reportId <= 0) {
    return fail(res, 400, 'Invalid report id.');
  }

  try {
    const [[report]] = await pool.execute(
      `SELECT r.report_id, r.citizen_id, r.vehicle_id, r.street_id, r.barangay_id,
              r.violation_type, r.photo_path, r.ocr_extracted_plate, r.ocr_confidence_score,
              r.manual_plate_input, r.status, r.resolution_outcome, r.rejection_reason,
              r.is_escalated, r.ticket_reference,
              r.submitted_at, r.verified_at, r.acknowledged_at, r.dispatched_at,
              r.escalated_at, r.resolved_at,
              s.street_name, s.barangay_id AS street_barangay_id,
              b.barangay_name,
              t.tier_name, t.fine_amount, t.requires_clamping,
              v.plate_number, v.total_violations, v.is_repeat_offender,
              u.anonymous_alias
         FROM VIOLATION_REPORTS r
         LEFT JOIN STREETS s        ON s.street_id   = r.street_id
         LEFT JOIN BARANGAYS b      ON b.barangay_id = COALESCE(r.barangay_id, s.barangay_id)
         LEFT JOIN PENALTY_TIERS t  ON t.tier_id     = r.penalty_tier_id
         LEFT JOIN VEHICLES v       ON v.vehicle_id  = r.vehicle_id
         LEFT JOIN USERS u          ON u.user_id     = r.citizen_id
        WHERE r.report_id = ?
        LIMIT 1`,
      [reportId]
    );

    if (!report) {
      return fail(res, 404, 'Report not found.');
    }

    // Role-based access
    const { role } = req.user;
    if (role === 'citizen' && report.citizen_id !== req.user.id) {
      return fail(res, 403, 'You can only view your own reports.');
    }
    if (role === 'brgy_official') {
      const reportBarangay = report.barangay_id ?? report.street_barangay_id;
      if (!req.user.barangay_id || reportBarangay !== req.user.barangay_id) {
        return fail(res, 403, 'You can only view reports for streets in your barangay.');
      }
    }

    // Presigned GCS URL (15 min). Falls back to the plain object URL when
    // signing is unavailable (e.g. local dev without a service-account key).
    let photoUrl = null;
    if (report.photo_path) {
      try {
        photoUrl = await storageService.getSignedReadUrl(report.photo_path, 15);
      } catch (err) {
        logger.warn(`Could not presign ${report.photo_path}: ${err.message}`);
        photoUrl = `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/${report.photo_path}`;
      }
    }

    // Cross-barangay violation history of the vehicle
    let history = [];
    if (report.vehicle_id) {
      const [historyRows] = await pool.execute(
        `SELECT r2.report_id, r2.violation_type, r2.status, r2.submitted_at,
                s2.street_name, b2.barangay_name
           FROM VIOLATION_REPORTS r2
           LEFT JOIN STREETS s2   ON s2.street_id   = r2.street_id
           LEFT JOIN BARANGAYS b2 ON b2.barangay_id = COALESCE(r2.barangay_id, s2.barangay_id)
          WHERE r2.vehicle_id = ?
          ORDER BY r2.submitted_at DESC`,
        [report.vehicle_id]
      );
      history = historyRows;
    }

    return res.json({
      success: true,
      message: 'Success',
      data: {
        report_id: report.report_id,
        status: report.status,
        violation_type: report.violation_type,
        street: report.street_id
          ? { street_id: report.street_id, street_name: report.street_name, barangay_name: report.barangay_name }
          : null,
        photo_url: photoUrl,
        photo_path: report.photo_path,
        ocr_extracted_plate: report.ocr_extracted_plate,
        ocr_confidence_score: report.ocr_confidence_score === null ? null : Number(report.ocr_confidence_score),
        manual_plate_input: report.manual_plate_input,
        penalty_tier: report.tier_name
          ? {
              tier_name: report.tier_name,
              fine_amount: Number(report.fine_amount),
              requires_clamping: !!report.requires_clamping,
            }
          : null,
        vehicle: report.vehicle_id
          ? {
              plate_number: report.plate_number,
              total_violations: report.total_violations,
              is_repeat_offender: !!report.is_repeat_offender,
              history,
            }
          : null,
        reporter: { anonymous_alias: report.anonymous_alias }, // never name/email
        is_escalated: !!report.is_escalated,
        ticket_reference: report.ticket_reference,
        resolution_outcome: report.resolution_outcome,
        rejection_reason: report.rejection_reason,
        submitted_at: report.submitted_at,
        verified_at: report.verified_at,
        acknowledged_at: report.acknowledged_at,
        dispatched_at: report.dispatched_at,
        escalated_at: report.escalated_at,
        resolved_at: report.resolved_at,
      },
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = { create, confirm, mine, getById };
