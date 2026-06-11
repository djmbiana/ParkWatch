'use strict';

/**
 * Street controller — public reference data the report form is built from
 * (STREETS, PARKING_RULES tables).
 */

const { pool } = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

// ---------------------------------------------------------------------------
// GET /api/streets
// FR: reference data for report submission — all active streets in
// participating barangays, so the frontend can populate the street picker.
// No auth: this is public lookup data.
// ---------------------------------------------------------------------------
const list = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT s.street_id, s.street_name, b.barangay_name
         FROM STREETS s
         JOIN BARANGAYS b ON b.barangay_id = s.barangay_id
        WHERE b.is_participating = TRUE AND s.is_active = TRUE
        ORDER BY b.barangay_name, s.street_name`
    );
    return sendSuccess(res, rows);
  } catch (err) {
    return next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /api/streets/:streetId/violation-types
// FR: per-street enforceable violation types — drives the violation picker so
// citizens can only submit types with an active PARKING_RULES row (the same
// rule Step 1 of the pipeline enforces server-side). No auth.
// ---------------------------------------------------------------------------
const violationTypes = async (req, res, next) => {
  const streetId = parseInt(req.params.streetId, 10);
  if (!Number.isInteger(streetId) || streetId <= 0) {
    return sendError(res, 'Invalid street id.', 400);
  }

  try {
    const [[street]] = await pool.execute(
      'SELECT street_id FROM STREETS WHERE street_id = ? LIMIT 1',
      [streetId]
    );
    if (!street) {
      return sendError(res, 'Street not found.', 404);
    }

    const [rows] = await pool.execute(
      `SELECT violation_type
         FROM PARKING_RULES
        WHERE street_id = ? AND is_active = TRUE
        ORDER BY violation_type`,
      [streetId]
    );
    return sendSuccess(res, rows);
  } catch (err) {
    return next(err);
  }
};

module.exports = { list, violationTypes };
