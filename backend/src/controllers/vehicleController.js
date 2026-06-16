'use strict';

/**
 * Vehicle controller — plate lookup and repeat-offender tracking (VEHICLES table).
 */

const { pool } = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');
const { normalizePlate } = require('../utils/plateValidator');

// ---------------------------------------------------------------------------
// GET /api/vehicles/:plateNumber/history
// FR: cross-barangay violation tracking — enforcement staff look up a plate's
// full district-wide history regardless of which barangay each report came
// from. Restricted to enforcement roles (brgy_official, mtpb_officer,
// mtpb_supervisor, admin) via route middleware; reporter identity is exposed
// only as the anonymous alias.
// ---------------------------------------------------------------------------
const history = async (req, res, next) => {
  // Plates are stored normalized ("ABC 1234"), so normalize the URL param the
  // same way before comparing ("abc1234" / "ABC%201234" both resolve).
  const plate = normalizePlate(req.params.plateNumber);
  if (!plate) {
    return sendError(res, 'Plate number is required.', 400);
  }

  try {
    const [[vehicle]] = await pool.execute(
      `SELECT vehicle_id, plate_number, vehicle_type, color,
              total_violations, is_repeat_offender, first_recorded_at
         FROM VEHICLES
        WHERE plate_number = ?
        LIMIT 1`,
      [plate]
    );
    if (!vehicle) {
      return sendError(res, 'No vehicle found for this plate number.', 404);
    }

    const [reports] = await pool.execute(
      `SELECT r.report_id, r.violation_type, r.status, r.is_escalated, r.ticket_reference,
              r.submitted_at, r.resolved_at, r.resolution_outcome,
              s.street_name, b.barangay_name,
              t.tier_name, t.fine_amount,
              COALESCE(r.anonymous_alias, u.anonymous_alias) AS reporter_alias
         FROM VIOLATION_REPORTS r
         LEFT JOIN STREETS s       ON s.street_id   = r.street_id
         LEFT JOIN BARANGAYS b     ON b.barangay_id = COALESCE(r.barangay_id, s.barangay_id)
         LEFT JOIN PENALTY_TIERS t ON t.tier_id     = r.penalty_tier_id
         LEFT JOIN USERS u         ON u.user_id     = r.citizen_id
        WHERE r.vehicle_id = ?
        ORDER BY r.submitted_at DESC`,
      [vehicle.vehicle_id]
    );

    return sendSuccess(res, {
      vehicle: {
        plate_number: vehicle.plate_number,
        vehicle_type: vehicle.vehicle_type,
        color: vehicle.color,
        total_violations: vehicle.total_violations,
        is_repeat_offender: !!vehicle.is_repeat_offender,
        first_recorded_at: vehicle.first_recorded_at,
      },
      history: reports.map((r) => ({
        report_id: r.report_id,
        violation_type: r.violation_type,
        status: r.status,
        street_name: r.street_name,
        barangay_name: r.barangay_name,
        penalty_tier: r.tier_name
          ? { tier_name: r.tier_name, fine_amount: Number(r.fine_amount) }
          : null,
        is_escalated: !!r.is_escalated,
        ticket_reference: r.ticket_reference,
        submitted_at: r.submitted_at,
        resolved_at: r.resolved_at,
        resolution_outcome: r.resolution_outcome,
        reporter: { anonymous_alias: r.reporter_alias }, // never name/email
      })),
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = { history };
