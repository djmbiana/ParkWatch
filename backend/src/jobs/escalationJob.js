'use strict';

/**
 * Escalation job (UC-10, paper p.32) — a two-stage timer that chases
 * unacknowledged verified reports:
 *
 *   Stage 1 (re-notify): once a verified report has sat unacknowledged for
 *     MTPB_RESPONSE_WINDOW_MINUTES, push a reminder to every active MTPB officer
 *     and mark the report `renotified`.
 *
 *   Stage 2 (escalate): if a re-notified report is STILL unacknowledged after a
 *     further MTPB_RENOTIFY_WINDOW_MINUTES, flip it to `escalated`, notify the
 *     citizen, and alert every active supervisor.
 *
 * State lives on VIOLATION_REPORTS (verified_at → renotified/renotified_at →
 * is_escalated/escalated_at), consistent with the rest of the lifecycle. Both
 * stages are guarded by boolean flags, so running the job repeatedly is
 * idempotent — a report is re-notified once and escalated once.
 */

const cron = require('node-cron');
const { pool } = require('../config/db');
const logger = require('../config/logger');
const notificationService = require('../services/notificationService');
const { getMessaging } = require('../config/firebase');

// Env fallbacks kept for tests / first boot before migration 032 runs.
const ENV_RESPONSE_WINDOW = parseInt(
  process.env.MTPB_RESPONSE_WINDOW_MINUTES || process.env.MTPB_RESPONSE_TIMER_MINUTES || '60', 10
);
const ENV_RENOTIFY_WINDOW = parseInt(process.env.MTPB_RENOTIFY_WINDOW_MINUTES || '15', 10);

// Read configurable windows from DB; fall back to env if the table doesn't exist yet.
const getWindows = async () => {
  try {
    const [rows] = await pool.execute(
      `SELECT config_key, config_value FROM SYSTEM_CONFIG
        WHERE config_key IN ('escalation_response_window_minutes', 'escalation_renotify_window_minutes')`
    );
    const map = Object.fromEntries(rows.map(r => [r.config_key, parseInt(r.config_value, 10)]));
    return {
      responseWindow: map['escalation_response_window_minutes'] ?? ENV_RESPONSE_WINDOW,
      renotifyWindow: map['escalation_renotify_window_minutes'] ?? ENV_RENOTIFY_WINDOW,
    };
  } catch {
    return { responseWindow: ENV_RESPONSE_WINDOW, renotifyWindow: ENV_RENOTIFY_WINDOW };
  }
};

const ESCALATION_REASON = 'Unacknowledged after re-notification to MTPB officers.';

// Direct staff push + log for the custom officer reminder (which has no status
// key, so it can't go through notificationService.send). Best-effort — never
// throws, so one bad token can't stall the batch.
const notifyStaff = async (userId, reportId, message) => {
  try {
    await pool.execute(
      `INSERT INTO NOTIFICATION_LOG (report_id, recipient_id, message, notification_type, sent_at, is_read)
       VALUES (?, ?, ?, 'status_update', NOW(), FALSE)`,
      [reportId, userId, message]
    );
  } catch (err) {
    logger.error(`[Escalation] Failed to log officer reminder (report ${reportId}, user ${userId}): ${err.message}`);
  }
  try {
    const [[row]] = await pool.execute('SELECT fcm_token FROM USER_FCM_TOKENS WHERE user_id = ? LIMIT 1', [userId]);
    if (row?.fcm_token) {
      await getMessaging().send({
        token: row.fcm_token,
        notification: { title: 'ParkWatch — Action Required', body: message },
        data: { report_id: String(reportId), status: 'verified' },
      });
    }
  } catch (err) {
    logger.warn(`[Escalation] Officer push failed (report ${reportId}, user ${userId}): ${err.message}`);
  }
};

// Stage 1 — re-notify MTPB officers about reports past the response window.
// Source of truth is MTPB_QUEUE (response_deadline / renotified flags); the
// VIOLATION_REPORTS columns are mirrored for backward compatibility.
const runStage1Renotification = async (renotifyWindow) => {
  const [reports] = await pool.execute(
    `SELECT vr.report_id
       FROM VIOLATION_REPORTS vr
       JOIN MTPB_QUEUE mq ON vr.report_id = mq.report_id
      WHERE vr.status = 'verified'
        AND mq.renotified = FALSE
        AND mq.is_escalated = FALSE
        AND mq.response_deadline < NOW()`
  );
  if (reports.length === 0) return 0;

  const [officers] = await pool.execute(
    `SELECT user_id FROM USERS WHERE role = 'mtpb_officer' AND is_active = TRUE`
  );

  let processed = 0;
  for (const r of reports) {
    // Claim on MTPB_QUEUE first; if another run already flagged it, skip (idempotent).
    const [upd] = await pool.execute(
      `UPDATE MTPB_QUEUE SET renotified = TRUE, renotified_at = NOW()
        WHERE report_id = ? AND renotified = FALSE`,
      [r.report_id]
    );
    if (upd.affectedRows === 0) continue;
    // Mirror onto the report row (kept in sync for compatibility).
    await pool.execute(
      `UPDATE VIOLATION_REPORTS SET renotified = TRUE, renotified_at = NOW() WHERE report_id = ?`,
      [r.report_id]
    );

    const message = `Unacknowledged report RPT-${r.report_id} requires immediate attention. `
      + `Please acknowledge within ${renotifyWindow} minutes.`;
    for (const o of officers) await notifyStaff(o.user_id, r.report_id, message);
    processed++;
  }
  if (processed > 0) {
    logger.info(`[Escalation] Stage 1 re-notified ${processed} report(s) to ${officers.length} officer(s).`);
  }
  return processed;
};

// Stage 2 — escalate reports still unacknowledged after the re-notify window.
const runStage2Escalation = async (renotifyWindow) => {
  const [reports] = await pool.execute(
    `SELECT vr.report_id
       FROM VIOLATION_REPORTS vr
       JOIN MTPB_QUEUE mq ON vr.report_id = mq.report_id
      WHERE vr.status = 'verified'
        AND mq.renotified = TRUE
        AND mq.is_escalated = FALSE
        AND mq.renotified_at IS NOT NULL
        AND DATE_ADD(mq.renotified_at, INTERVAL ? MINUTE) < NOW()`,
    [renotifyWindow]
  );
  if (reports.length === 0) return 0;

  const [supervisors] = await pool.execute(
    `SELECT user_id FROM USERS WHERE role = 'mtpb_supervisor' AND is_active = TRUE`
  );

  let processed = 0;
  for (const r of reports) {
    // Atomic claim on MTPB_QUEUE: only the run that flips the flag notifies.
    const [upd] = await pool.execute(
      `UPDATE MTPB_QUEUE
          SET is_escalated = TRUE, escalated_at = NOW(), escalation_reason = ?
        WHERE report_id = ? AND is_escalated = FALSE`,
      [ESCALATION_REASON, r.report_id]
    );
    if (upd.affectedRows === 0) continue;

    // Mirror the escalation onto the report row.
    await pool.execute(
      `UPDATE VIOLATION_REPORTS
          SET status = 'escalated', is_escalated = TRUE, escalated_at = NOW(), escalation_reason = ?
        WHERE report_id = ?`,
      [ESCALATION_REASON, r.report_id]
    );

    // Notify citizen + every supervisor (best-effort; send() never throws).
    await notificationService.send(null, r.report_id, 'escalated');
    for (const s of supervisors) await notificationService.send(s.user_id, r.report_id, 'escalated');
    processed++;
  }
  if (processed > 0) {
    logger.info(`[Escalation] Stage 2 escalated ${processed} report(s) to ${supervisors.length} supervisor(s).`);
  }
  return processed;
};

// Run both stages once. Exported for manual triggering in tests/admin tooling.
const runNow = async () => {
  const { renotifyWindow } = await getWindows();
  await runStage1Renotification(renotifyWindow);
  await runStage2Escalation(renotifyWindow);
};

let task = null;

// Schedules the job every 5 minutes. Called from server.js (NOT app.js) so the
// timer never starts under jest/supertest, which import app.js directly.
const start = () => {
  if (task) return task;
  task = cron.schedule('*/5 * * * *', async () => {
    logger.info('[Escalation] Running escalation job...');
    try {
      await runNow();
    } catch (err) {
      logger.error(`[Escalation] Job error: ${err.message}`);
    }
  });
  logger.info(`[Escalation] Scheduled every 5 min (windows loaded from DB at runtime).`);
  return task;
};

module.exports = { start, runNow, runStage1Renotification, runStage2Escalation };
