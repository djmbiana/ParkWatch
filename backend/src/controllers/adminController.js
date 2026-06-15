'use strict';

/**
 * Admin portal controller — user provisioning, barangay toggle,
 * street/rule management, and penalty tier CRUD.
 */

const bcrypt = require('bcrypt');
const { pool } = require('../config/db');

const fail = (res, code, msg) => res.status(code).json({ success: false, message: msg });

// ---------------------------------------------------------------------------
// User management
// ---------------------------------------------------------------------------

const listUsers = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT u.user_id, u.first_name, u.last_name, u.email, u.role,
              u.barangay_id, u.is_verified, u.is_active, u.created_at,
              b.barangay_name,
              u.anonymous_alias AS employee_id
         FROM USERS u
         LEFT JOIN BARANGAYS b ON b.barangay_id = u.barangay_id
         ORDER BY u.created_at DESC`
    );
    return res.json({ success: true, message: 'Success', data: rows });
  } catch (err) { return next(err); }
};

const createUser = async (req, res, next) => {
  const { first_name, last_name, email, role, barangay_id } = req.body;
  if (!first_name || !last_name || !email || !role) return fail(res, 400, 'first_name, last_name, email, role are required.');
  if (role === 'citizen') return fail(res, 400, 'Cannot provision citizen accounts via admin.');

  try {
    const [[exists]] = await pool.execute('SELECT user_id FROM USERS WHERE email = ? LIMIT 1', [email]);
    if (exists) return fail(res, 409, 'Email already registered.');

    const tempPw = `PW-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const hash = await bcrypt.hash(tempPw, 10);
    const alias = `Admin${Date.now()}`;

    const [result] = await pool.execute(
      `INSERT INTO USERS (first_name, last_name, email, password_hash, role, barangay_id, anonymous_alias, is_verified, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, TRUE)`,
      [first_name, last_name, email, hash, role, barangay_id || null, alias]
    );

    return res.status(201).json({
      success: true,
      message: 'Account provisioned.',
      data: { user_id: result.insertId, temporary_password: tempPw },
    });
  } catch (err) { return next(err); }
};

const updateUser = async (req, res, next) => {
  const { userId } = req.params;
  const { first_name, last_name, email, barangay_id } = req.body;
  try {
    await pool.execute(
      `UPDATE USERS SET first_name=COALESCE(?,first_name), last_name=COALESCE(?,last_name),
              email=COALESCE(?,email), barangay_id=COALESCE(?,barangay_id) WHERE user_id=?`,
      [first_name||null, last_name||null, email||null, barangay_id||null, userId]
    );
    return res.json({ success: true, message: 'User updated.' });
  } catch (err) { return next(err); }
};

const deactivateUser = async (req, res, next) => {
  const { userId } = req.params;
  try {
    await pool.execute('UPDATE USERS SET is_active=FALSE WHERE user_id=?', [userId]);
    return res.json({ success: true, message: 'User deactivated.' });
  } catch (err) { return next(err); }
};

const reactivateUser = async (req, res, next) => {
  const { userId } = req.params;
  try {
    await pool.execute('UPDATE USERS SET is_active=TRUE WHERE user_id=?', [userId]);
    return res.json({ success: true, message: 'User reactivated.' });
  } catch (err) { return next(err); }
};

const listOfficers = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT user_id, first_name, last_name, email, is_active, anonymous_alias AS badge_number
         FROM USERS WHERE role IN ('mtpb_officer') AND is_active = TRUE ORDER BY first_name`
    );
    return res.json({ success: true, message: 'Success', data: rows });
  } catch (err) { return next(err); }
};

// ---------------------------------------------------------------------------
// Barangay management
// ---------------------------------------------------------------------------

const listBarangays = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT b.barangay_id, b.barangay_name, b.barangay_number, b.is_participating AS is_active,
              CONCAT(u.first_name, ' ', u.last_name) AS assigned_official,
              (SELECT COUNT(*) FROM STREETS s WHERE s.barangay_id = b.barangay_id AND s.is_active = TRUE) AS streets_enrolled,
              (SELECT COUNT(*) FROM VIOLATION_REPORTS r
                LEFT JOIN STREETS s2 ON s2.street_id = r.street_id
                WHERE COALESCE(r.barangay_id, s2.barangay_id) = b.barangay_id
                  AND MONTH(r.submitted_at) = MONTH(CURDATE())
                  AND YEAR(r.submitted_at) = YEAR(CURDATE())) AS reports_this_month
       FROM BARANGAYS b
       LEFT JOIN USERS u ON u.barangay_id = b.barangay_id AND u.role = 'brgy_official' AND u.is_active = TRUE
       ORDER BY b.barangay_name`
    );
    return res.json({ success: true, message: 'Success', data: rows });
  } catch (err) { return next(err); }
};

const toggleBarangay = async (req, res, next) => {
  const { barangayId } = req.params;
  try {
    await pool.execute(
      'UPDATE BARANGAYS SET is_participating = NOT is_participating WHERE barangay_id = ?',
      [barangayId]
    );
    return res.json({ success: true, message: 'Barangay status toggled.' });
  } catch (err) { return next(err); }
};

// ---------------------------------------------------------------------------
// Streets & Parking Rules
// ---------------------------------------------------------------------------

const listStreets = async (req, res, next) => {
  try {
    const [streets] = await pool.execute(
      `SELECT s.street_id, s.street_name, s.is_active, s.barangay_id, b.barangay_name
       FROM STREETS s
       LEFT JOIN BARANGAYS b ON b.barangay_id = s.barangay_id
       ORDER BY b.barangay_name, s.street_name`
    );
    const [rules] = await pool.execute('SELECT rule_id, street_id, violation_type, is_active FROM PARKING_RULES ORDER BY violation_type');

    const rulesByStreet = {};
    for (const r of rules) {
      if (!rulesByStreet[r.street_id]) rulesByStreet[r.street_id] = [];
      rulesByStreet[r.street_id].push(r);
    }

    const result = streets.map(s => ({
      ...s,
      rules: rulesByStreet[s.street_id] ?? [],
      active_rule_count: (rulesByStreet[s.street_id] ?? []).filter(r => r.is_active).length,
    }));

    return res.json({ success: true, message: 'Success', data: result });
  } catch (err) { return next(err); }
};

const createStreet = async (req, res, next) => {
  const { street_name, barangay_id } = req.body;
  if (!street_name || !barangay_id) return fail(res, 400, 'street_name and barangay_id are required.');
  try {
    const [result] = await pool.execute(
      'INSERT INTO STREETS (street_name, barangay_id) VALUES (?, ?)',
      [street_name.trim(), barangay_id]
    );
    return res.status(201).json({ success: true, message: 'Street created.', data: { street_id: result.insertId } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return fail(res, 409, 'This street already exists in this barangay.');
    return next(err);
  }
};

const toggleRule = async (req, res, next) => {
  const { ruleId } = req.params;
  try {
    await pool.execute('UPDATE PARKING_RULES SET is_active = NOT is_active WHERE rule_id = ?', [ruleId]);
    return res.json({ success: true, message: 'Rule toggled.' });
  } catch (err) { return next(err); }
};

const createRule = async (req, res, next) => {
  const { street_id, violation_type } = req.body;
  if (!street_id || !violation_type) return fail(res, 400, 'street_id and violation_type are required.');
  try {
    const [result] = await pool.execute(
      'INSERT INTO PARKING_RULES (street_id, violation_type) VALUES (?, ?)',
      [street_id, violation_type.trim()]
    );
    return res.status(201).json({ success: true, message: 'Rule created.', data: { rule_id: result.insertId } });
  } catch (err) { return next(err); }
};

// ---------------------------------------------------------------------------
// Penalty Tiers
// ---------------------------------------------------------------------------

const listTiers = async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM PENALTY_TIERS ORDER BY min_violations');
    return res.json({ success: true, message: 'Success', data: rows });
  } catch (err) { return next(err); }
};

const updateTier = async (req, res, next) => {
  const { tierId } = req.params;
  const { tier_name, min_violations, max_violations, fine_amount, requires_clamping } = req.body;
  try {
    await pool.execute(
      `UPDATE PENALTY_TIERS SET tier_name=?, min_violations=?, max_violations=?, fine_amount=?, requires_clamping=? WHERE tier_id=?`,
      [tier_name, min_violations, max_violations ?? null, fine_amount, requires_clamping ? 1 : 0, tierId]
    );
    return res.json({ success: true, message: 'Tier updated.' });
  } catch (err) { return next(err); }
};

const createTier = async (req, res, next) => {
  const { tier_name, min_violations, max_violations, fine_amount, requires_clamping } = req.body;
  if (!tier_name || min_violations == null || fine_amount == null) return fail(res, 400, 'tier_name, min_violations, fine_amount required.');
  try {
    const [result] = await pool.execute(
      `INSERT INTO PENALTY_TIERS (tier_name, min_violations, max_violations, fine_amount, requires_clamping) VALUES (?,?,?,?,?)`,
      [tier_name, min_violations, max_violations ?? null, fine_amount, requires_clamping ? 1 : 0]
    );
    return res.status(201).json({ success: true, message: 'Tier created.', data: { tier_id: result.insertId } });
  } catch (err) { return next(err); }
};

module.exports = {
  listUsers, createUser, updateUser, deactivateUser, reactivateUser, listOfficers,
  listBarangays, toggleBarangay,
  listStreets, createStreet, toggleRule, createRule,
  listTiers, updateTier, createTier,
};
