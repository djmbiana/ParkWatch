'use strict';

/**
 * Notification service — the single entry point for ALL report status
 * notifications (UC-03, paper p.72). Every call:
 *   1. composes the exact status message from the paper,
 *   2. logs it to NOTIFICATION_LOG (so citizens see it via UC-02 regardless of
 *      push-delivery outcome — paper p.72 Step 5), and
 *   3. best-effort pushes it via FCM to the recipient's device token.
 *
 * send() never throws: a failed push (or Firebase not being configured) and even
 * a failed log are caught and logged, so a notification can never break the
 * report lifecycle (UC-03 AF-1, paper p.72).
 */

const { pool } = require('../config/db');
const logger = require('../config/logger');
const { getMessaging } = require('../config/firebase');

// Exact message strings per UC-03 Main Flow Step 3 (paper p.72) — do not paraphrase.
const buildMessage = (status, extra = {}) => {
  switch (status) {
    case 'pending':      return 'Report Submitted Pending Barangay Verification.';
    case 'verified':     return 'Report Verified - Awaiting MTPB Action.';
    case 'acknowledged': return 'Report Acknowledged by MTPB Officer.';
    case 'dispatched':   return 'Officer Dispatched to Location.';
    case 'resolved':     return `Report Resolved [${extra.resolution_outcome || 'Resolved'}].`;
    case 'rejected':     return `Report Rejected [${extra.rejection_reason || 'No reason provided'}].`;
    case 'escalated':    return 'Your report has been escalated to a supervisor for priority attention.';
    default:             return null;
  }
};

const TYPE_BY_STATUS = {
  resolved:  'resolution',
  rejected:  'resolution',
  escalated: 'escalation',
};

// Best-effort FCM push. Never throws — a delivery failure (or Firebase not being
// configured) must not break the report pipeline (UC-03 AF-1, paper p.72).
const pushFcm = async (token, body, reportId, status) => {
  try {
    await getMessaging().send({
      token,
      notification: { title: 'ParkWatch Update', body },
      data: { report_id: String(reportId), status: String(status) },
    });
  } catch (err) {
    logger.warn(`FCM delivery failed for report ${reportId}: ${err.message}`);
  }
};

/**
 * Logs (and pushes) a status notification for a report.
 *
 * @param {number|null} recipientId  USERS.user_id for staff/registered recipients,
 *                                   or null for an anonymous citizen report (the
 *                                   device token is then resolved from the report's
 *                                   fcm_token_id).
 * @param {number}      reportId     VIOLATION_REPORTS.report_id
 * @param {string}      status       status key driving the message text
 * @param {object}      [extra]      { resolution_outcome } / { rejection_reason }
 * @returns {Promise<number|null>}   NOTIFICATION_LOG insert id, or null
 */
const send = async (recipientId, reportId, status, extra = {}) => {
  const message = buildMessage(status, extra);
  if (!message) {
    logger.warn(`[Notification] Unknown status key: ${status}`);
    return null;
  }
  const notificationType = TYPE_BY_STATUS[status] || 'status_update';

  // Step 1: log regardless of push outcome (paper p.72 Step 5).
  let insertId = null;
  try {
    const [result] = await pool.execute(
      `INSERT INTO NOTIFICATION_LOG (report_id, recipient_id, message, notification_type, sent_at, is_read)
       VALUES (?, ?, ?, ?, NOW(), FALSE)`,
      [reportId, recipientId || null, message, notificationType]
    );
    insertId = result.insertId;
  } catch (err) {
    logger.error(`[Notification] Failed to log notification for report ${reportId}: ${err.message}`);
  }

  // Step 2: resolve the recipient's device token.
  let token = null;
  try {
    if (recipientId) {
      // Authenticated staff / registered user.
      const [[row]] = await pool.execute(
        'SELECT fcm_token FROM USER_FCM_TOKENS WHERE user_id = ? LIMIT 1',
        [recipientId]
      );
      token = row?.fcm_token || null;
    } else {
      // Anonymous citizen — device token linked to the report at submission.
      const [[row]] = await pool.execute(
        `SELECT t.token
           FROM VIOLATION_REPORTS r
           JOIN PUBLIC_FCM_TOKENS t ON t.token_id = r.fcm_token_id
          WHERE r.report_id = ?
          LIMIT 1`,
        [reportId]
      );
      token = row?.token || null;
    }
  } catch (err) {
    logger.error(`[Notification] Failed to resolve device token for report ${reportId}: ${err.message}`);
  }

  // Step 3: best-effort push (no token = nothing to send; not an error).
  if (token) await pushFcm(token, message, reportId, status);

  if (insertId) {
    logger.info(`Notification ${insertId} logged for report ${reportId} (${status}, recipient=${recipientId || 'anon'})`);
  }
  return insertId;
};

module.exports = { send };
