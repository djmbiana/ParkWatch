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

const crypto = require('crypto');

const { validationResult } = require('express-validator');

const { pool } = require('../config/db');
const logger = require('../config/logger');
const ocrService = require('../services/ocrService');
const notificationService = require('../services/notificationService');
const storageService = require('../services/storageService');
const { CONDUCTION_PLATE, TEMPORARY_PLATE, TEMPORARY_MC_PLATE, NO_PLATE_ID, normalizePlate } = require('../utils/plateValidator');

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

// Extra evidence photos (migration 024). Each must point at our storage bucket;
// invalid entries are dropped, and the list is capped so a report can't attach an
// unbounded number of images. Returns an array of GCS object paths.
const MAX_ADDITIONAL_PHOTOS = 5;
const parseAdditionalPhotos = (raw) => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_ADDITIONAL_PHOTOS)
    .map((u) => { try { return storageService.parsePhotoRef(u).objectPath; } catch { return null; } })
    .filter(Boolean);
};

// Public shape for a PENALTY_TIERS row (4-tier structure, migration 022).
const formatTier = (tier) =>
  tier
    ? {
        tier_id: tier.tier_id,
        tier_name: tier.tier_name,
        enforcement_action: tier.enforcement_action,
        fine_amount: Number(tier.fine_amount),
        requires_clamping: !!tier.requires_clamping,
        requires_impound: !!tier.requires_impound,
      }
    : null;

// Public handle for anonymous reporters, per the paper's "Reporter #XXXX"
// format (p.122). Anonymous submitters have no USERS row, so the alias is
// generated here and stored on the report itself.
const ALIAS_RE = /^Reporter #\d{4}$/;
const generateAlias = () =>
  `Reporter #${String(Math.floor(1000 + Math.random() * 9000))}`;

// Resolve the alias to store on an anonymous report: reuse the client-supplied
// one when it matches the expected format (so a device's reports share a
// handle), otherwise mint a fresh one.
const resolveAnonymousAlias = (provided) =>
  provided && ALIAS_RE.test(provided.trim()) ? provided.trim() : generateAlias();

// Constant-time compare of a client-supplied access token against the stored one.
const tokenMatches = (provided, actual) => {
  if (typeof provided !== 'string' || typeof actual !== 'string' || !provided || !actual) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(actual);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

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
    plate, plateType = 'regular', citizenId, anonymousAlias, fcmToken, streetId, barangayId, violationType,
    photoPath, additionalPhotos, ocrRawResponse, ocrExtractedPlate, ocrConfidenceScore, manualPlateInput,
  } = ctx;

  // Unguessable bearer token so anonymous submitters (and only they) can read
  // their report by id. crypto.randomBytes(32) → 64 hex chars (fits VARCHAR(64)).
  const accessToken = crypto.randomBytes(32).toString('hex');

  // Step 5 — duplicate detection: same plate + street within the rolling window,
  // ignoring rejected reports. NOPLATE_ identifiers are unique by design so they
  // never match. For regular/conduction plates, return 409 with the existing
  // report_id so the frontend can offer an "add context" prompt instead of a
  // hard block.
  if (plateType !== 'no_plate') {
    const [[duplicate]] = await pool.execute(
      `SELECT r.report_id, TIMESTAMPDIFF(MINUTE, r.submitted_at, NOW()) AS minutes_ago
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
      return res.status(409).json({
        success: false,
        error: 'This vehicle was already reported at this location recently.',
        message: 'This vehicle was already reported at this location recently.',
        duplicate: true,
        report_id: duplicate.report_id,
        minutes_ago: Number(duplicate.minutes_ago),
      });
    }
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

  // Penalty tier assigned at submission reflects CONFIRMED violations only.
  // total_violations counts resolved (Ticket Issued / Vehicle Clamped) reports
  // and increments at resolution per FR-13 (paper p.54), NOT at submission — so
  // it is the prior confirmed count here, and this report is the (count + 1)th
  // potential offense. Two reports submitted before the first resolves both map
  // to the same tier, which is correct (the tier reflects violations at the time
  // of the report).
  const offenseNumber = vehicle.total_violations + 1;
  const [[tier]] = await pool.execute(
    `SELECT tier_id, tier_name, enforcement_action, fine_amount, requires_clamping, requires_impound
       FROM PENALTY_TIERS
      WHERE min_violations <= ?
        AND (max_violations IS NULL OR max_violations >= ?)
      ORDER BY min_violations DESC
      LIMIT 1`,
    [offenseNumber, offenseNumber]
  );

  // Step 7 — create the report. The vehicle's total_violations counter is NOT
  // touched here: it increments at resolution (FR-13), so an unconfirmed or
  // later-rejected report never inflates a plate's offense history.
  const connection = await pool.getConnection();
  let reportId;
  try {
    await connection.beginTransaction();

    // Link the submitting device's FCM token (anonymous push delivery, UC-03).
    // Upsert keyed by hash; LAST_INSERT_ID() yields the row id on insert OR update.
    let fcmTokenId = null;
    if (fcmToken) {
      const [tokenRow] = await connection.execute(
        `INSERT INTO PUBLIC_FCM_TOKENS (token_hash, token, last_seen_at)
           VALUES (SHA2(?, 256), ?, NOW())
         ON DUPLICATE KEY UPDATE last_seen_at = NOW(), token_id = LAST_INSERT_ID(token_id)`,
        [fcmToken, fcmToken]
      );
      fcmTokenId = tokenRow.insertId || null;
    }

    const [inserted] = await connection.execute(
      `INSERT INTO VIOLATION_REPORTS
         (citizen_id, anonymous_alias, access_token, fcm_token_id, vehicle_id, street_id, barangay_id, violation_type, plate_type, photo_path, additional_photos,
          ocr_raw_response, ocr_extracted_plate, ocr_confidence_score,
          manual_plate_input, penalty_tier_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        citizenId,
        anonymousAlias,
        accessToken,
        fcmTokenId,
        vehicle.vehicle_id,
        streetId,
        barangayId,
        violationType,
        plateType,
        photoPath,
        additionalPhotos && additionalPhotos.length ? JSON.stringify(additionalPhotos) : null,
        ocrRawResponse ? String(ocrRawResponse).slice(0, MAX_RAW_RESPONSE_CHARS) : null,
        ocrExtractedPlate ?? null,
        ocrConfidenceScore ?? null,
        manualPlateInput ?? null,
        tier ? tier.tier_id : null,
      ]
    );
    reportId = inserted.insertId;

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
      anonymous_alias: anonymousAlias,
      access_token: accessToken,
      penalty_tier: formatTier(tier),
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
  const citizenId = req.user?.id ?? null;
  const anonymousAlias = resolveAnonymousAlias(req.body.anonymous_alias);

  // plate_type distinguishes standard LTO plates from conduction stickers,
  // temporary plates, and vehicles with no plate number.
  const rawPlateType = String(req.body.plate_type ?? 'regular').toLowerCase();
  const plateType = ['regular', 'conduction', 'temporary', 'no_plate'].includes(rawPlateType)
    ? rawPlateType
    : 'regular';

  try {
    const rule = await findActiveRule(streetId, violation_type);
    if (!rule) return fail(res, 422, 'This violation type is not active for this street.');

    const { objectPath } = storageService.parsePhotoRef(photo_url);
    const additionalPhotos = parseAdditionalPhotos(req.body.additional_photos);

    // --- Conduction sticker (yellow LTO sticker, format "AA 123A" / "D1 E777") ---
    if (plateType === 'conduction') {
      const rawPlate = normalizePlate(req.body.plate ?? '');
      if (!CONDUCTION_PLATE.test(rawPlate)) {
        return fail(res, 422,
          'Conduction sticker number format is invalid. ' +
          'Expected a 2-character district code followed by a 4-character alphanumeric body (e.g. "AA 123A" or "D1 E777").'
        );
      }
      return await finishPipeline(res, {
        plate: rawPlate,
        plateType,
        citizenId,
        anonymousAlias,
        fcmToken: req.body.fcm_token,
        streetId,
        barangayId: rule.barangay_id,
        violationType: violation_type,
        photoPath: objectPath,
        additionalPhotos,
        ocrRawResponse: null,
        ocrExtractedPlate: null,
        ocrConfidenceScore: null,
        manualPlateInput: rawPlate,
      });
    }

    // --- Temporary Motor Vehicle Plate (white "REGISTERED" / dealer-issued plate) ---
    // 4-wheel: AB 1234 (2 letters + 4 digits).
    // Improvised MC: AB 12345 (2 letters + 5 digits, for lost/mutilated motorcycle plates).
    if (plateType === 'temporary') {
      const rawPlate = normalizePlate(req.body.plate ?? '');
      if (!TEMPORARY_PLATE.test(rawPlate) && !TEMPORARY_MC_PLATE.test(rawPlate)) {
        return fail(res, 422,
          'Temporary plate number format is invalid. ' +
          'Expected 2 letters + 4 digits (e.g. "AB 1234") for 4-wheel vehicles, ' +
          'or 2 letters + 5 digits (e.g. "AB 12345") for improvised motorcycle plates.'
        );
      }
      return await finishPipeline(res, {
        plate: rawPlate,
        plateType,
        citizenId,
        anonymousAlias,
        fcmToken: req.body.fcm_token,
        streetId,
        barangayId: rule.barangay_id,
        violationType: violation_type,
        photoPath: objectPath,
        additionalPhotos,
        ocrRawResponse: null,
        ocrExtractedPlate: null,
        ocrConfidenceScore: null,
        manualPlateInput: rawPlate,
      });
    }

    // --- No plate (synthetic NOPLATE_ identifier) ----------------------------
    if (plateType === 'no_plate') {
      const rawPlate = normalizePlate(req.body.plate ?? '');
      if (!NO_PLATE_ID.test(rawPlate)) {
        return fail(res, 422, 'No-plate identifier format is invalid.');
      }
      return await finishPipeline(res, {
        plate: rawPlate,
        plateType,
        citizenId,
        anonymousAlias,
        fcmToken: req.body.fcm_token,
        streetId,
        barangayId: rule.barangay_id,
        violationType: violation_type,
        photoPath: objectPath,
        additionalPhotos,
        ocrRawResponse: null,
        ocrExtractedPlate: null,
        ocrConfidenceScore: null,
        manualPlateInput: null,
      });
    }

    // --- Regular plate: citizen-confirmed plate (OCR already ran) -----------
    if (req.body.plate != null && String(req.body.plate).trim() !== '') {
      const { valid, normalized } = await ocrService.validatePlateFormat(req.body.plate);
      if (!valid) return fail(res, 422, 'Plate number format is invalid.');

      let ocrNormalized = null;
      if (req.body.ocr_extracted_plate) {
        const r = await ocrService.validatePlateFormat(req.body.ocr_extracted_plate);
        ocrNormalized = r.valid ? r.normalized : String(req.body.ocr_extracted_plate).trim().toUpperCase();
      }
      const edited = !ocrNormalized || ocrNormalized !== normalized;

      return await finishPipeline(res, {
        plate: normalized,
        plateType,
        citizenId,
        anonymousAlias,
        fcmToken: req.body.fcm_token,
        streetId,
        barangayId: rule.barangay_id,
        violationType: violation_type,
        photoPath: objectPath,
        additionalPhotos,
        ocrRawResponse: null,
        ocrExtractedPlate: ocrNormalized,
        ocrConfidenceScore: req.body.ocr_confidence_score ?? null,
        manualPlateInput: edited ? normalized : null,
      });
    }

    // Legacy flow (direct API use without the preview step): OCR at submit.
    const ocr = await ocrService.extractPlate(photo_url);
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

    const { valid, normalized } = await ocrService.validatePlateFormat(ocr.extracted_plate);
    if (!valid) return fail(res, 422, 'Plate number format is invalid.');

    return await finishPipeline(res, {
      plate: normalized,
      plateType,
      citizenId,
      anonymousAlias,
      fcmToken: req.body.fcm_token,
      streetId,
      barangayId: rule.barangay_id,
      violationType: violation_type,
      photoPath: objectPath,
      additionalPhotos,
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
// POST /api/reports/ocr
// Runs OCR on an already-uploaded photo and returns the extracted plate +
// confidence WITHOUT creating a report. Drives the Step-2 plate-review card
// (citizen confirms "is this right?" / edits before submitting).
// ---------------------------------------------------------------------------
const ocrPreview = async (req, res, next) => {
  const { photo_url } = req.body;
  if (!photo_url) return fail(res, 400, 'photo_url is required.');

  try {
    storageService.parsePhotoRef(photo_url); // 400 unless it's our bucket
    const ocr = await ocrService.extractPlate(photo_url);

    // Pre-fill with the strict plate when found, otherwise the loose guess so
    // the citizen can correct it rather than type from scratch.
    return res.json({
      success: true,
      message: 'OCR complete.',
      data: {
        extracted_plate: ocr.extracted_plate || ocr.best_guess || null,
        confidence_score: ocr.confidence_score ?? ocr.guess_confidence ?? null,
        needs_manual_review: !!ocr.needs_manual_review,
      },
    });
  } catch (err) {
    return next(err);
  }
};

// ---------------------------------------------------------------------------
// POST /api/reports/penalty-preview  { plate }
// Returns the penalty tier a plate would draw given its CURRENT district-wide
// violation count — shown on the review screen before submitting.
// ---------------------------------------------------------------------------
const penaltyPreview = async (req, res, next) => {
  const { plate } = req.body;
  if (!plate) return fail(res, 400, 'plate is required.');

  try {
    const { valid, normalized } = await ocrService.validatePlateFormat(plate);
    if (!valid) return fail(res, 422, 'Plate number format is invalid.');

    const [[vehicle]] = await pool.execute(
      'SELECT total_violations FROM VEHICLES WHERE plate_number = ? LIMIT 1',
      [normalized]
    );
    const count = vehicle ? vehicle.total_violations : 0;
    const offenseNumber = count + 1; // the offense this submission would be

    const [[tier]] = await pool.execute(
      `SELECT tier_id, tier_name, enforcement_action, fine_amount, requires_clamping, requires_impound
         FROM PENALTY_TIERS
        WHERE min_violations <= ? AND (max_violations IS NULL OR max_violations >= ?)
        ORDER BY min_violations DESC
        LIMIT 1`,
      [offenseNumber, offenseNumber]
    );

    return res.json({
      success: true,
      message: 'Success',
      data: {
        offense_count: offenseNumber,
        penalty_tier: formatTier(tier),
      },
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
  const citizenId = req.user?.id ?? null;
  const anonymousAlias = resolveAnonymousAlias(req.body.anonymous_alias);

  try {
    // Re-run Step 1: confirm is a separate request, so the rule must be
    // re-checked — clients could otherwise skip the first call entirely.
    const rule = await findActiveRule(streetId, violation_type);
    if (!rule) {
      return fail(res, 422, 'This violation type is not active for this street.');
    }

    const { objectPath } = storageService.parsePhotoRef(photo_url);
    const additionalPhotos = parseAdditionalPhotos(req.body.additional_photos);

    // Step 4 — format validation on the manual input
    const { valid, normalized } = await ocrService.validatePlateFormat(manual_plate_input);
    if (!valid) {
      return fail(res, 422, 'Plate number format is invalid.');
    }

    // Steps 5–8 (manual plate drives the pipeline; OCR fields stored as-is)
    return await finishPipeline(res, {
      plate: normalized,
      citizenId,
      anonymousAlias,
      fcmToken: req.body.fcm_token,
      streetId,
      barangayId: rule.barangay_id,
      violationType: violation_type,
      photoPath: objectPath,
      additionalPhotos,
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
              r.violation_type, r.plate_type, r.photo_path, r.additional_photos, r.ocr_extracted_plate, r.ocr_confidence_score,
              r.manual_plate_input, r.status, r.resolution_outcome, r.rejection_reason,
              r.is_escalated, r.ticket_reference, r.access_token,
              r.submitted_at, r.verified_at, r.acknowledged_at, r.dispatched_at,
              r.escalated_at, r.resolved_at,
              s.street_name, s.barangay_id AS street_barangay_id,
              b.barangay_name,
              t.tier_name, t.enforcement_action, t.fine_amount, t.requires_clamping, t.requires_impound,
              v.plate_number, v.total_violations, v.is_repeat_offender,
              COALESCE(r.anonymous_alias, u.anonymous_alias) AS anonymous_alias
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

    // Access control: a valid staff/citizen JWT (with the existing role scoping)
    // OR, for anonymous callers, the report's access token (?token=...).
    const role = req.user?.role;
    if (req.user) {
      // Citizens (if logged in) only see their own; all staff — including
      // barangay officials — share the cross-barangay database and may view
      // any report (paper's cross-barangay violation tracking).
      if (role === 'citizen' && report.citizen_id !== req.user.id) {
        return fail(res, 403, 'You can only view your own reports.');
      }
    } else if (!tokenMatches(req.query.token, report.access_token)) {
      return fail(res, 401, 'A valid access token is required to view this report.');
    }

    // Presigned GCS URL (15 min). Falls back to the plain object URL when
    // signing is unavailable (e.g. local dev without a service-account key).
    const signPhoto = async (path) => {
      if (!path) return null;
      try {
        return await storageService.getSignedReadUrl(path, 15);
      } catch (err) {
        logger.warn(`Could not presign ${path}: ${err.message}`);
        return `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/${path}`;
      }
    };

    const photoUrl = await signPhoto(report.photo_path);

    // Extra evidence photos (migration 024) — signed the same way as the primary.
    let additionalPhotoUrls = [];
    if (report.additional_photos) {
      try {
        const paths = JSON.parse(report.additional_photos);
        if (Array.isArray(paths)) {
          additionalPhotoUrls = (await Promise.all(paths.map(signPhoto))).filter(Boolean);
        }
      } catch { /* malformed JSON — no extra photos */ }
    }

    // Appeal (if any) — mig031
    const [[appeal]] = await pool.execute(
      'SELECT appeal_id, status, reason, verdict_notes, created_at, resolved_at FROM REPORT_APPEALS WHERE report_id = ? ORDER BY created_at DESC LIMIT 1',
      [reportId]
    );

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
        plate_type: report.plate_type ?? 'regular',
        street: report.street_id
          ? { street_id: report.street_id, street_name: report.street_name, barangay_name: report.barangay_name }
          : null,
        photo_url: photoUrl,
        photo_path: report.photo_path,
        additional_photos: additionalPhotoUrls,
        ocr_extracted_plate: report.ocr_extracted_plate,
        ocr_confidence_score: report.ocr_confidence_score === null ? null : Number(report.ocr_confidence_score),
        manual_plate_input: report.manual_plate_input,
        penalty_tier: report.tier_name
          ? {
              tier_name: report.tier_name,
              enforcement_action: report.enforcement_action,
              fine_amount: Number(report.fine_amount),
              requires_clamping: !!report.requires_clamping,
              requires_impound: !!report.requires_impound,
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
        appeal: appeal ?? null,
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

// ---------------------------------------------------------------------------
// POST /api/reports/check-duplicate  { plate, street_id }
// Lets the citizen app warn — BEFORE submitting — that this vehicle was already
// reported at this location within the dedup window, so a second reporter knows
// it's already handled and the vehicle doesn't accrue duplicate offenses. This
// is advisory only; the hard guard still runs at create() (returns 409).
// ---------------------------------------------------------------------------
const checkDuplicate = async (req, res, next) => {
  const streetId = parseInt(req.body.street_id, 10);
  const plate = req.body.plate;
  if (!plate || !Number.isInteger(streetId)) {
    return fail(res, 400, 'plate and street_id are required.');
  }

  try {
    const { valid, normalized } = await ocrService.validatePlateFormat(plate);
    // An invalid plate can't match anything; let the main flow surface the format
    // error instead of blocking the pre-check.
    if (!valid) return res.json({ success: true, message: 'Success', data: { duplicate: false } });

    const [[dup]] = await pool.execute(
      `SELECT r.report_id, r.status, s.street_name,
              TIMESTAMPDIFF(MINUTE, r.submitted_at, NOW()) AS minutes_ago
         FROM VIOLATION_REPORTS r
         JOIN VEHICLES v       ON v.vehicle_id = r.vehicle_id
         LEFT JOIN STREETS s   ON s.street_id  = r.street_id
        WHERE v.plate_number = ?
          AND r.street_id = ?
          AND r.submitted_at > NOW() - INTERVAL ? MINUTE
          AND r.status NOT IN ('rejected')
        ORDER BY r.submitted_at DESC
        LIMIT 1`,
      [normalized, streetId, duplicateWindowMinutes()]
    );

    return res.json({
      success: true,
      message: 'Success',
      data: dup
        ? {
            duplicate: true,
            report_id: dup.report_id,
            street_name: dup.street_name,
            minutes_ago: Number(dup.minutes_ago),
            window_minutes: duplicateWindowMinutes(),
          }
        : { duplicate: false },
    });
  } catch (err) {
    return next(err);
  }
};

// ---------------------------------------------------------------------------
// PATCH /api/reports/:reportId/additional-photos
// Two modes:
//   1. Original reporter (token provided): validates ownership, no status guard.
//   2. Witness / corroborator (no token): any citizen can add supporting photos
//      to an active report (pending / verified / acknowledged / dispatched).
//      Limited to 3 witness photos per call; capped at 10 total on the report.
// ---------------------------------------------------------------------------
const attachAdditionalPhotos = async (req, res, next) => {
  const reportId = parseInt(req.params.reportId, 10);
  if (!Number.isInteger(reportId) || reportId <= 0) {
    return fail(res, 400, 'Invalid report id.');
  }

  const accessToken = req.query.token ?? req.body.access_token ?? null;
  const isOwner = !!(accessToken && typeof accessToken === 'string');

  const newPhotos = parseAdditionalPhotos(req.body.additional_photos);
  if (!newPhotos.length) return fail(res, 400, 'No valid photos provided.');

  // Witnesses are capped at 3 photos per call to prevent bulk spam.
  if (!isOwner && newPhotos.length > 3) {
    return fail(res, 400, 'Witness submissions are limited to 3 photos at a time.');
  }

  try {
    const [[report]] = await pool.execute(
      'SELECT report_id, status, additional_photos, access_token FROM VIOLATION_REPORTS WHERE report_id = ? LIMIT 1',
      [reportId]
    );
    if (!report) return fail(res, 404, 'Report not found.');

    if (isOwner) {
      if (!tokenMatches(accessToken, report.access_token)) {
        return fail(res, 403, 'Invalid access token.');
      }
    } else {
      // Witness photos only allowed while the report is still active.
      const activeStatuses = ['pending', 'verified', 'acknowledged', 'dispatched'];
      if (!activeStatuses.includes(report.status)) {
        return fail(res, 422, 'Supporting photos can only be added to active reports.');
      }
    }

    let existing = [];
    try { existing = JSON.parse(report.additional_photos ?? '[]'); } catch {}
    if (!Array.isArray(existing)) existing = [];

    const merged = [...existing, ...newPhotos].slice(0, 10);
    await pool.execute(
      'UPDATE VIOLATION_REPORTS SET additional_photos = ? WHERE report_id = ?',
      [JSON.stringify(merged), reportId]
    );

    return res.json({
      success: true,
      message: 'Photos attached.',
      data: { report_id: reportId, added: newPhotos.length, is_owner: isOwner },
    });
  } catch (err) {
    return next(err);
  }
};

// ---------------------------------------------------------------------------
// POST /api/reports/:reportId/contest?token=XXX  { reason }
// Citizen contests a declined (rejected) report. One appeal per report.
// Report status moves to 'contested'; barangay must then render a verdict.
// ---------------------------------------------------------------------------
const contest = async (req, res, next) => {
  const reportId = parseInt(req.params.reportId, 10);
  if (!Number.isInteger(reportId) || reportId <= 0) return fail(res, 400, 'Invalid report id.');

  const accessToken = req.query.token ?? req.body.access_token;
  const reason = (req.body.reason ?? '').trim();
  if (!reason || reason.length < 10) return fail(res, 400, 'Reason must be at least 10 characters.');

  try {
    const [[report]] = await pool.execute(
      'SELECT report_id, status, access_token FROM VIOLATION_REPORTS WHERE report_id = ? LIMIT 1',
      [reportId]
    );
    if (!report) return fail(res, 404, 'Report not found.');
    if (!tokenMatches(accessToken, report.access_token)) return fail(res, 401, 'Invalid access token.');
    if (report.status !== 'rejected') return fail(res, 409, 'Only declined reports can be contested.');

    const [[existing]] = await pool.execute(
      'SELECT appeal_id FROM REPORT_APPEALS WHERE report_id = ? LIMIT 1',
      [reportId]
    );
    if (existing) return fail(res, 409, 'An appeal has already been filed for this report.');

    await pool.execute('INSERT INTO REPORT_APPEALS (report_id, reason) VALUES (?, ?)', [reportId, reason]);
    await pool.execute("UPDATE VIOLATION_REPORTS SET status = 'contested' WHERE report_id = ?", [reportId]);

    return res.status(201).json({ success: true, message: 'Appeal filed. The barangay will review your case.' });
  } catch (err) {
    return next(err);
  }
};

// ---------------------------------------------------------------------------
// PATCH /api/reports/:reportId/appeal-verdict  { verdict, verdict_notes }
// Barangay official renders a verdict on a contested report.
// verdict='upheld' → stays rejected; verdict='overturned' → back to pending.
// ---------------------------------------------------------------------------
const renderAppealVerdict = async (req, res, next) => {
  const reportId = parseInt(req.params.reportId, 10);
  if (!Number.isInteger(reportId) || reportId <= 0) return fail(res, 400, 'Invalid report id.');

  const { verdict, verdict_notes } = req.body;
  if (!['upheld', 'overturned'].includes(verdict)) return fail(res, 400, 'verdict must be "upheld" or "overturned".');

  try {
    const [[appeal]] = await pool.execute(
      "SELECT appeal_id FROM REPORT_APPEALS WHERE report_id = ? AND status = 'pending' LIMIT 1",
      [reportId]
    );
    if (!appeal) return fail(res, 404, 'No pending appeal found for this report.');

    const newStatus = verdict === 'overturned' ? 'pending' : 'rejected';
    await pool.execute(
      'UPDATE REPORT_APPEALS SET status = ?, verdict_notes = ?, resolved_at = NOW() WHERE appeal_id = ?',
      [verdict, (verdict_notes ?? '').trim() || null, appeal.appeal_id]
    );
    await pool.execute('UPDATE VIOLATION_REPORTS SET status = ? WHERE report_id = ?', [newStatus, reportId]);

    return res.json({ success: true, message: 'Verdict recorded.' });
  } catch (err) {
    return next(err);
  }
};

module.exports = { create, confirm, mine, getById, ocrPreview, penaltyPreview, checkDuplicate, attachAdditionalPhotos, contest, renderAppealVerdict };
