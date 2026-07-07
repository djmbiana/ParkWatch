'use strict';

/**
 * User controller — self-service profile management for the signed-in user.
 */

const bcrypt = require('bcrypt');
const { validationResult } = require('express-validator');

const { pool } = require('../config/db');

const SALT_ROUNDS = 10;

// Explicit column lists instead of SELECT * (Check 4.3). USER_AUTH_COLUMNS
// includes password_hash only because the initial fetch needs it to verify the
// current password on a password change; it is never sent in a response.
const USER_PUBLIC_COLUMNS =
  'user_id, first_name, last_name, email, phone_number, role, anonymous_alias, ' +
  'barangay_id, is_verified, is_active, created_at';
const USER_AUTH_COLUMNS = `${USER_PUBLIC_COLUMNS}, password_hash`;

const toPublicUser = (row) => ({
  id: row.user_id,
  first_name: row.first_name,
  last_name: row.last_name,
  email: row.email,
  role: row.role,
  barangay_id: row.barangay_id,
  anonymous_alias: row.anonymous_alias,
  is_verified: !!row.is_verified,
  is_active: !!row.is_active,
});

// PATCH /api/users/me — update the signed-in user's own name and/or password.
// Changing the password requires the current password.
const updateMe = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const userId = req.user.id;
  const { first_name, last_name, employee_id, current_password, new_password } = req.body;

  try {
    const [[user]] = await pool.execute(
      `SELECT ${USER_AUTH_COLUMNS} FROM USERS WHERE user_id = ? LIMIT 1`,
      [userId]
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    const fields = [];
    const values = [];

    if (typeof first_name === 'string' && first_name.trim()) {
      fields.push('first_name = ?');
      values.push(first_name.trim());
    }
    if (typeof last_name === 'string' && last_name.trim()) {
      fields.push('last_name = ?');
      values.push(last_name.trim());
    }
    if (typeof employee_id === 'string' && employee_id.trim() && user.role !== 'citizen') {
      fields.push('anonymous_alias = ?');
      values.push(employee_id.trim());
    }

    // Password change is all-or-nothing and requires the current password.
    if (new_password) {
      if (!current_password) {
        return res.status(400).json({ success: false, message: 'Current password is required to set a new password.' });
      }
      const ok = await bcrypt.compare(current_password, user.password_hash);
      if (!ok) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
      }
      fields.push('password_hash = ?');
      values.push(await bcrypt.hash(new_password, SALT_ROUNDS));
    }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'Nothing to update.' });
    }

    values.push(userId);
    await pool.execute(`UPDATE USERS SET ${fields.join(', ')} WHERE user_id = ?`, values);

    const [[updated]] = await pool.execute(`SELECT ${USER_PUBLIC_COLUMNS} FROM USERS WHERE user_id = ? LIMIT 1`, [userId]);
    return res.json({ success: true, message: 'Profile updated.', data: { user: toPublicUser(updated) } });
  } catch (err) {
    return next(err);
  }
};

module.exports = { updateMe };
