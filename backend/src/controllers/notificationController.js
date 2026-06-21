'use strict';

/**
 * Notification controller — FCM token registration (UC-03) and the staff
 * in-app notification feed (UC-02).
 *
 * Anonymous citizens have no account (paper p.118): their device tokens go to
 * PUBLIC_FCM_TOKENS keyed by hash. Authenticated staff register against their
 * USERS row in USER_FCM_TOKENS. Registration is idempotent.
 */

const { pool } = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

// POST /api/notifications/register-token  { fcm_token }
// Public route (optionalAuthenticate). If a valid Bearer token is present the
// device is registered to that staff account; otherwise it is stored as an
// anonymous citizen device. The owning user is taken from the JWT (req.user),
// never from the body, so a caller cannot register a token for someone else.
const registerToken = async (req, res, next) => {
  const token = (req.body?.fcm_token || '').trim();
  if (!token) return sendError(res, 'fcm_token is required.', 400);
  if (token.length > 512) return sendError(res, 'fcm_token is too long.', 400);

  try {
    if (req.user?.id) {
      // Authenticated staff — one token per user.
      await pool.execute(
        `INSERT INTO USER_FCM_TOKENS (user_id, fcm_token)
           VALUES (?, ?)
         ON DUPLICATE KEY UPDATE fcm_token = VALUES(fcm_token), updated_at = NOW()`,
        [req.user.id, token]
      );
    } else {
      // Anonymous citizen device.
      await pool.execute(
        `INSERT INTO PUBLIC_FCM_TOKENS (token_hash, token, last_seen_at)
           VALUES (SHA2(?, 256), ?, NOW())
         ON DUPLICATE KEY UPDATE last_seen_at = NOW()`,
        [token, token]
      );
    }
    return sendSuccess(res, null, 'Token registered.');
  } catch (err) {
    return next(err);
  }
};

// GET /api/notifications/mine  (auth required)
// Returns the caller's in-app notifications newest-first, then marks the unread
// ones as read.
const mine = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT notification_id, report_id, message, notification_type, sent_at, is_read, read_at
         FROM NOTIFICATION_LOG
        WHERE recipient_id = ?
        ORDER BY sent_at DESC`,
      [req.user.id]
    );

    // Mark the unread ones read (read_at stamped once).
    await pool.execute(
      `UPDATE NOTIFICATION_LOG SET is_read = TRUE, read_at = NOW()
        WHERE recipient_id = ? AND is_read = FALSE`,
      [req.user.id]
    );

    const data = rows.map((r) => ({
      notification_id: r.notification_id,
      report_id: r.report_id,
      message: r.message,
      notification_type: r.notification_type,
      sent_at: r.sent_at,
      is_read: true, // reflects the post-read state returned to the client
      read_at: r.read_at,
    }));
    return sendSuccess(res, data, 'Success');
  } catch (err) {
    return next(err);
  }
};

module.exports = { registerToken, mine };
