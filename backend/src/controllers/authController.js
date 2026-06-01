'use strict';

const bcrypt = require('bcrypt');
const { validationResult } = require('express-validator');
const { pool } = require('../config/db');
const logger = require('../config/logger');
const User = require('../models/User');
const { signToken } = require('../utils/jwt');

const SALT_ROUNDS = 10;

/**
 * Build the public-safe user object returned to clients.
 * Never include password_hash. Renames user_id → id to match the JWT payload.
 */
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

/**
 * Generates an anonymous alias like "Citizen_a3f9b2".
 * Uniqueness is enforced by USERS.uq_users_alias; on the rare collision the
 * INSERT will fail with ER_DUP_ENTRY and the request can be retried.
 */
const generateAnonymousAlias = () => {
  const hex = Math.random().toString(16).slice(2, 8);
  return `Citizen_${hex}`;
};

// POST /api/v1/auth/register
// Self-registration is restricted to the 'citizen' role. Staff accounts
// (brgy_official, mtpb_officer, mtpb_supervisor, admin) are seeded or
// provisioned by an admin endpoint (out of scope for this sprint).
const register = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { first_name, last_name, email, password, phone_number } = req.body;

  try {
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const anonymous_alias = generateAnonymousAlias();

    const [result] = await pool.execute(
      `INSERT INTO ${User.TABLE}
         (first_name, last_name, email, password_hash, phone_number,
          role, anonymous_alias, is_verified, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, TRUE)`,
      [
        first_name,
        last_name,
        email.toLowerCase(),
        password_hash,
        phone_number || null,
        User.ROLES.CITIZEN,
        anonymous_alias,
      ]
    );

    const [[newUser]] = await pool.execute(
      `SELECT * FROM ${User.TABLE} WHERE ${User.COLUMNS.ID} = ?`,
      [result.insertId]
    );

    const token = signToken(newUser);
    logger.info(`User registered: ${email} (id=${newUser.user_id})`);

    return res.status(201).json({
      success: true,
      message: 'Registration successful.',
      data: { user: toPublicUser(newUser), token },
    });
  } catch (err) {
    // ER_DUP_ENTRY is caught by errorHandler.js → 409 Conflict (email taken).
    return next(err);
  }
};

// POST /api/v1/auth/login
const login = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    const [[user]] = await pool.execute(
      `SELECT * FROM ${User.TABLE} WHERE ${User.COLUMNS.EMAIL} = ? LIMIT 1`,
      [email.toLowerCase()]
    );

    // Same generic message for "no user" and "bad password" to prevent
    // account-enumeration attacks (an attacker can't tell which case applies).
    const GENERIC_AUTH_FAILED = 'Invalid email or password.';

    if (!user) {
      return res.status(401).json({ success: false, message: GENERIC_AUTH_FAILED });
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'This account has been deactivated. Contact an administrator.',
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: GENERIC_AUTH_FAILED });
    }

    const token = signToken(user);
    logger.info(`User logged in: ${email} (id=${user.user_id}, role=${user.role})`);

    return res.json({
      success: true,
      message: 'Login successful.',
      data: { user: toPublicUser(user), token },
    });
  } catch (err) {
    return next(err);
  }
};

// GET /api/v1/auth/me — requires authenticate middleware
const me = async (req, res, next) => {
  try {
    const [[user]] = await pool.execute(
      `SELECT * FROM ${User.TABLE} WHERE ${User.COLUMNS.ID} = ? LIMIT 1`,
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.json({ success: true, data: { user: toPublicUser(user) } });
  } catch (err) {
    return next(err);
  }
};

module.exports = { register, login, me };