'use strict';

/**
 * Notification controller — anonymous FCM token registration (UC-03).
 *
 * Citizens have no account (paper p.118), so device tokens are stored in
 * PUBLIC_FCM_TOKENS keyed by hash. Registration is public and idempotent.
 */

const { pool } = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

// POST /api/notifications/register-token  { fcm_token }
const registerToken = async (req, res, next) => {
  const token = (req.body?.fcm_token || '').trim();
  if (!token) return sendError(res, 'fcm_token is required.', 400);
  if (token.length > 512) return sendError(res, 'fcm_token is too long.', 400);

  try {
    await pool.execute(
      `INSERT INTO PUBLIC_FCM_TOKENS (token_hash, token, last_seen_at)
         VALUES (SHA2(?, 256), ?, NOW())
       ON DUPLICATE KEY UPDATE last_seen_at = NOW()`,
      [token, token]
    );
    return sendSuccess(res, null, 'Token registered.');
  } catch (err) {
    return next(err);
  }
};

module.exports = { registerToken };
