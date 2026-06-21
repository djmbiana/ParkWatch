'use strict';

/**
 * Status-transition guard (Part 7C) — validates that a report is in a legal
 * source status before a lifecycle PATCH handler runs, so invalid transitions
 * (e.g. resolving a still-pending report) are rejected centrally with 422.
 *
 * Mirrors the report lifecycle in the paper (UC-04 → UC-10). On success it
 * attaches the fetched row to req.report so handlers can skip a re-read.
 *
 * Response envelope uses `message` to match the rest of the API.
 */

const { pool } = require('../config/db');

const VALID_TRANSITIONS = {
  verify_approve:     { from: ['pending'] },
  verify_reject:      { from: ['pending'] },
  acknowledge:        { from: ['verified', 'escalated'] },
  dispatch:           { from: ['acknowledged'] },
  // /resolve is shared by two real flows: an officer resolving a dispatched
  // report (UC-08) and a supervisor resolving an escalated one (UC-10 AF-1, the
  // SupervisorEscalated portal posts to this same route).
  resolve:            { from: ['dispatched', 'escalated'] },
  assign:             { from: ['escalated'] },
  supervisor_resolve: { from: ['escalated', 'dispatched'] },
};

function requireStatus(action) {
  const rule = VALID_TRANSITIONS[action];
  if (!rule) throw new Error(`requireStatus: unknown action "${action}"`);

  return async (req, res, next) => {
    try {
      const reportId = parseInt(req.params.reportId, 10);
      const [[report]] = await pool.execute(
        'SELECT report_id, status, assigned_officer_id FROM VIOLATION_REPORTS WHERE report_id = ?',
        [reportId]
      );
      if (!report) {
        return res.status(404).json({ success: false, message: 'Report not found.' });
      }
      if (!rule.from.includes(report.status)) {
        return res.status(422).json({
          success: false,
          message: `Invalid transition. Report is '${report.status}', expected one of: ${rule.from.join(', ')}.`,
        });
      }
      req.report = report;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { requireStatus, VALID_TRANSITIONS };
