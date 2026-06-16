'use strict';

/**
 * Notification service — records report status updates in NOTIFICATION_LOG
 * so citizens see them in-app.
 *
 * FR: report status notifications (citizen is informed at each lifecycle step).
 *
 * Push delivery via FCM (src/services/fcmService.js) is still stubbed; when it
 * lands, send() is the single place to add the push call so every status
 * change is both logged and pushed.
 */

const { pool } = require('../config/db');
const logger = require('../config/logger');
const { getMessaging } = require('../config/firebase');

// Best-effort FCM push. Never throws — a delivery failure (or Firebase not
// being configured) must not break the report pipeline.
const pushFcm = async (token, title, body, reportId) => {
  try {
    await getMessaging().send({
      token,
      notification: { title, body },
      data: { report_id: String(reportId) },
    });
  } catch (err) {
    logger.warn(`FCM push failed for report ${reportId}: ${err.message}`);
  }
};

// Exact message strings per the system spec. {detail} carries
// resolution_outcome (resolved) or rejection_reason (rejected).
const STATUS_MESSAGES = {
  pending:      'Report submitted — pending barangay verification.',
  verified:     'Report verified — awaiting MTPB action.',
  acknowledged: 'Report acknowledged by MTPB officer.',
  dispatched:   'Officer has been dispatched to the location.',
  resolved:     'Report resolved — {detail}.',
  rejected:     'Report rejected — {detail}.',
  escalated:    'Your report has been escalated to a supervisor for priority attention.',
};

const TYPE_BY_STATUS = {
  resolved:  'resolution',
  rejected:  'resolution',
  escalated: 'escalation',
};

/**
 * Logs a status notification for a report.
 *
 * @param {number|null} recipientId  USERS.user_id (null = anonymous report, nothing to send)
 * @param {number}      reportId     VIOLATION_REPORTS.report_id
 * @param {string}      status       report status driving the message text
 * @param {string}      [detail]     resolution_outcome / rejection_reason for
 *                                   resolved / rejected statuses
 */
const send = async (recipientId, reportId, status, detail = '') => {
  const template = STATUS_MESSAGES[status] || `Your report status changed to "${status}".`;
  const message = template.replace('{detail}', detail);
  const notificationType = TYPE_BY_STATUS[status] || 'status_update';

  // Registered citizen — log against their account (in-app notification feed).
  if (recipientId) {
    const [result] = await pool.execute(
      `INSERT INTO NOTIFICATION_LOG (report_id, recipient_id, message, notification_type, sent_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [reportId, recipientId, message, notificationType]
    );
    logger.info(`Notification ${result.insertId} logged for user ${recipientId} (report ${reportId}, ${status})`);
    return result.insertId;
  }

  // Anonymous report — deliver to the device token linked at submission, if any.
  const [[row]] = await pool.execute(
    `SELECT t.token
       FROM VIOLATION_REPORTS r
       JOIN PUBLIC_FCM_TOKENS t ON t.token_id = r.fcm_token_id
      WHERE r.report_id = ?
      LIMIT 1`,
    [reportId]
  );
  if (!row || !row.token) return null; // no registered device — nothing to send

  const [result] = await pool.execute(
    `INSERT INTO NOTIFICATION_LOG (report_id, recipient_id, message, notification_type, sent_at)
     VALUES (?, NULL, ?, ?, NOW())`,
    [reportId, message, notificationType]
  );
  await pushFcm(row.token, 'ParkWatch', message, reportId);

  logger.info(`Notification ${result.insertId} pushed to anonymous device (report ${reportId}, ${status})`);
  return result.insertId;
};

module.exports = { send };
