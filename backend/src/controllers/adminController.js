'use strict';

/**
 * Admin portal controller — user provisioning, barangay toggle,
 * street/rule management, and penalty tier CRUD.
 */

const bcrypt = require('bcrypt');
const { pool } = require('../config/db');
const { logAudit } = require('./userGroupsController');

const fail = (res, code, msg) => res.status(code).json({ success: false, message: msg });

// ---------------------------------------------------------------------------
// User management
// ---------------------------------------------------------------------------

const listUsers = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT u.user_id, u.first_name, u.last_name, u.email, u.role,
              u.barangay_id, u.supervisor_id, u.group_id, u.is_verified, u.is_active, u.created_at,
              b.barangay_name, g.name AS group_name,
              u.anonymous_alias AS employee_id
         FROM USERS u
         LEFT JOIN BARANGAYS b ON b.barangay_id = u.barangay_id
         LEFT JOIN user_groups g ON g.id = u.group_id
         ORDER BY u.created_at DESC`
    );
    return res.json({ success: true, message: 'Success', data: rows });
  } catch (err) { return next(err); }
};

const createUser = async (req, res, next) => {
  const { first_name, last_name, email, role, barangay_id, group_id } = req.body;
  if (!first_name || !last_name || !email || !role) return fail(res, 400, 'first_name, last_name, email, role are required.');
  // UC-13 Special Requirements (paper p.104): admin cannot assign the citizen role.
  if (!['brgy_official', 'mtpb_officer', 'mtpb_supervisor'].includes(role)) {
    return fail(res, 422, 'Admin can only provision brgy_official, mtpb_officer, or mtpb_supervisor accounts.');
  }
  if (role === 'brgy_official' && !barangay_id) {
    return fail(res, 422, 'barangay_id is required for a barangay official.');
  }

  try {
    const [[exists]] = await pool.execute('SELECT user_id FROM USERS WHERE email = ? LIMIT 1', [email]);
    if (exists) return fail(res, 409, 'Email already registered.');

    if (group_id) {
      const [[group]] = await pool.execute('SELECT id FROM user_groups WHERE id = ?', [group_id]);
      if (!group) return fail(res, 422, 'group_id does not reference an existing group.');
    }

    const tempPw = `PW-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const hash = await bcrypt.hash(tempPw, 10);
    const alias = `Admin${Date.now()}`;

    const [result] = await pool.execute(
      `INSERT INTO USERS (first_name, last_name, email, password_hash, role, barangay_id, group_id, anonymous_alias, is_verified, is_active, must_change_password)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE, TRUE, TRUE)`,
      [first_name, last_name, email, hash, role, barangay_id || null, group_id || null, alias]
    );

    await logAudit(req, 'users_mgt', 'edit_profile', 'create', 'USERS', result.insertId, null, { email, role });
    return res.status(201).json({
      success: true,
      message: 'Account provisioned.',
      // temporary_password is what the admin portal reads; temp_password is the
      // spec's name — both returned so the secret is shown exactly once.
      data: { user_id: result.insertId, email, role, temporary_password: tempPw, temp_password: tempPw, must_change_password: true },
    });
  } catch (err) { return next(err); }
};

const updateUser = async (req, res, next) => {
  const { userId } = req.params;
  const { first_name, last_name, email, barangay_id } = req.body;
  try {
    const [[before]] = await pool.execute(
      'SELECT first_name, last_name, email, barangay_id FROM USERS WHERE user_id = ?', [userId]
    );
    await pool.execute(
      `UPDATE USERS SET first_name=COALESCE(?,first_name), last_name=COALESCE(?,last_name),
              email=COALESCE(?,email), barangay_id=COALESCE(?,barangay_id) WHERE user_id=?`,
      [first_name||null, last_name||null, email||null, barangay_id||null, userId]
    );
    await logAudit(req, 'users_mgt', 'edit_profile', 'update', 'USERS', userId,
      before, { first_name, last_name, email, barangay_id });
    return res.json({ success: true, message: 'User updated.' });
  } catch (err) { return next(err); }
};

// PATCH /api/admin/users/:userId/role — Super Admin only (see adminRoutes.js).
// Split out from updateUser() because that endpoint is reachable by any group
// with users_mgt.edit_profile.update (e.g. "User Manager"); role changes are
// more sensitive (can grant admin access) so they get their own Super-Admin-
// gated route, mirroring how /group and /supervisor assignment already work.
const ASSIGNABLE_ROLES = ['brgy_official', 'mtpb_officer', 'mtpb_supervisor', 'admin'];

const updateUserRole = async (req, res, next) => {
  const { userId } = req.params;
  const { role } = req.body;
  if (!ASSIGNABLE_ROLES.includes(role)) {
    return fail(res, 422, `role must be one of: ${ASSIGNABLE_ROLES.join(', ')}.`);
  }

  try {
    const [[user]] = await pool.execute('SELECT role, barangay_id, supervisor_id FROM USERS WHERE user_id = ?', [userId]);
    if (!user) return fail(res, 404, 'User not found.');

    if (user.role === 'admin' && role !== 'admin') {
      const [[{ admin_count }]] = await pool.execute(
        "SELECT COUNT(*) AS admin_count FROM USERS WHERE role = 'admin' AND is_active = TRUE"
      );
      if (admin_count <= 1) return fail(res, 422, 'Cannot change the role of the only remaining admin.');
    }

    // Fields that only make sense for the role the account is leaving behind.
    const barangayId = role === 'brgy_official' ? user.barangay_id : null;
    const supervisorId = role === 'mtpb_officer' ? user.supervisor_id : null;

    await pool.execute(
      'UPDATE USERS SET role = ?, barangay_id = ?, supervisor_id = ? WHERE user_id = ?',
      [role, barangayId, supervisorId, userId]
    );
    await logAudit(req, 'users_mgt', 'edit_profile', 'update', 'USERS', userId,
      { role: user.role }, { role });
    return res.json({ success: true, message: 'Role updated.' });
  } catch (err) { return next(err); }
};

const deactivateUser = async (req, res, next) => {
  const { userId } = req.params;
  try {
    const [[target]] = await pool.execute('SELECT role FROM USERS WHERE user_id = ? LIMIT 1', [userId]);
    if (!target) return fail(res, 404, 'User not found.');
    if (target.role === 'admin') return fail(res, 422, 'Cannot deactivate an admin account.');
    await pool.execute('UPDATE USERS SET is_active=FALSE WHERE user_id=?', [userId]);
    await logAudit(req, 'users_mgt', 'status_update', 'update', 'USERS', userId,
      { is_active: true }, { is_active: false });
    return res.json({ success: true, message: 'User deactivated.' });
  } catch (err) { return next(err); }
};

const reactivateUser = async (req, res, next) => {
  const { userId } = req.params;
  try {
    await pool.execute('UPDATE USERS SET is_active=TRUE WHERE user_id=?', [userId]);
    await logAudit(req, 'users_mgt', 'status_update', 'update', 'USERS', userId,
      { is_active: false }, { is_active: true });
    return res.json({ success: true, message: 'User reactivated.' });
  } catch (err) { return next(err); }
};

// Supervisor or Admin can assign a supervisor to an officer.
// Supervisors may only assign themselves; admins can assign anyone.
const setOfficerSupervisor = async (req, res, next) => {
  const officerId = parseInt(req.params.officerId, 10);
  const { supervisor_id } = req.body; // null/undefined → unassign
  try {
    const [[officer]] = await pool.execute(
      'SELECT user_id, role, supervisor_id FROM USERS WHERE user_id = ?', [officerId]
    );
    if (!officer) return fail(res, 404, 'Officer not found.');
    if (officer.role !== 'mtpb_officer') return fail(res, 422, 'Target user is not an MTPB Officer.');

    let resolvedSupId = supervisor_id ? parseInt(supervisor_id, 10) : null;
    if (req.user.role === 'mtpb_supervisor') {
      // Supervisors can only claim/release for themselves
      resolvedSupId = supervisor_id ? req.user.id : null;
    }
    if (resolvedSupId) {
      const [[sup]] = await pool.execute(
        "SELECT user_id FROM USERS WHERE user_id = ? AND role = 'mtpb_supervisor'", [resolvedSupId]
      );
      if (!sup) return fail(res, 422, 'supervisor_id must reference an MTPB Supervisor.');
    }
    await pool.execute('UPDATE USERS SET supervisor_id = ? WHERE user_id = ?', [resolvedSupId, officerId]);
    return res.json({ success: true, message: resolvedSupId ? 'Supervisor assigned.' : 'Supervisor removed.' });
  } catch (err) { return next(err); }
};

const deleteUser = async (req, res, next) => {
  const { userId } = req.params;
  try {
    const [[user]] = await pool.execute(
      'SELECT user_id, email, role, is_active FROM USERS WHERE user_id = ?', [userId]
    );
    if (!user) return fail(res, 404, 'User not found.');
    if (user.is_active) return fail(res, 409, 'Only inactive accounts can be deleted. Deactivate first.');
    if (user.role === 'admin' && parseInt(userId, 10) === req.user?.id) {
      return fail(res, 409, 'Cannot delete your own account.');
    }
    await logAudit(req, 'users_mgt', 'edit_profile', 'delete', 'USERS', userId,
      { email: user.email, role: user.role }, null);
    await pool.execute('DELETE FROM USERS WHERE user_id = ? AND is_active = FALSE', [userId]);
    return res.json({ success: true, message: 'User account permanently deleted.' });
  } catch (err) { return next(err); }
};

const listOfficers = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT u.user_id, u.first_name, u.last_name, u.email, u.is_active,
              u.anonymous_alias AS badge_number, u.supervisor_id,
              CONCAT(s.first_name, ' ', s.last_name) AS supervisor_name,
              (SELECT COUNT(*) FROM VIOLATION_REPORTS vr
                WHERE vr.assigned_officer_id = u.user_id
                  AND vr.status IN ('acknowledged','dispatched')) AS active_reports,
              (SELECT COUNT(*) FROM VIOLATION_REPORTS vr2
                WHERE vr2.assigned_officer_id = u.user_id
                  AND vr2.status = 'resolved') AS resolved_total
         FROM USERS u
         LEFT JOIN USERS s ON s.user_id = u.supervisor_id
        WHERE u.role = 'mtpb_officer'
        ORDER BY u.first_name`
    );
    return res.json({ success: true, message: 'Success', data: rows });
  } catch (err) { return next(err); }
};

const getOfficerStats = async (req, res, next) => {
  const officerId = parseInt(req.params.officerId, 10);
  try {
    const [[officer]] = await pool.execute(
      `SELECT u.user_id, u.first_name, u.last_name, u.email, u.is_active,
              u.anonymous_alias AS badge_number, u.supervisor_id,
              CONCAT(s.first_name, ' ', s.last_name) AS supervisor_name
         FROM USERS u
         LEFT JOIN USERS s ON s.user_id = u.supervisor_id
        WHERE u.user_id = ? AND u.role = 'mtpb_officer'`,
      [officerId]
    );
    if (!officer) return res.status(404).json({ success: false, message: 'Officer not found.' });

    const [[stats]] = await pool.execute(
      `SELECT
         SUM(vr.status IN ('acknowledged','dispatched'))       AS active_reports,
         SUM(vr.status = 'resolved')                          AS resolved_total,
         SUM(vr.status = 'resolved' AND DATE(vr.resolved_at) = CURDATE()) AS resolved_today,
         ROUND(AVG(CASE WHEN vr.status = 'resolved'
           THEN TIMESTAMPDIFF(MINUTE, vr.acknowledged_at, vr.resolved_at) END), 1) AS avg_resolve_min
       FROM VIOLATION_REPORTS vr
      WHERE vr.assigned_officer_id = ?`,
      [officerId]
    );

    const [recent] = await pool.execute(
      `SELECT vr.report_id, vr.status, vr.violation_type, vr.submitted_at, vr.resolved_at,
              s.street_name, b.barangay_name
         FROM VIOLATION_REPORTS vr
         LEFT JOIN STREETS s ON s.street_id = vr.street_id
         LEFT JOIN BARANGAYS b ON b.barangay_id = COALESCE(vr.barangay_id, s.barangay_id)
        WHERE vr.assigned_officer_id = ?
        ORDER BY vr.submitted_at DESC
        LIMIT 10`,
      [officerId]
    );

    return res.json({ success: true, message: 'Success', data: { ...officer, stats, recent } });
  } catch (err) { return next(err); }
};

const getEscalationConfig = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT config_key, config_value, label, updated_at, updated_by FROM SYSTEM_CONFIG
        WHERE config_key IN ('escalation_response_window_minutes', 'escalation_renotify_window_minutes')`
    );
    return res.json({ success: true, message: 'Success', data: rows });
  } catch (err) { return next(err); }
};

const updateEscalationConfig = async (req, res, next) => {
  const { response_window_minutes, renotify_window_minutes } = req.body;
  const userId = req.user?.id;
  try {
    if (response_window_minutes != null) {
      const val = parseInt(response_window_minutes, 10);
      if (isNaN(val) || val < 1 || val > 1440) return res.status(400).json({ success: false, message: 'response_window_minutes must be 1-1440.' });
      await pool.execute(
        `INSERT INTO SYSTEM_CONFIG (config_key, config_value, updated_by) VALUES ('escalation_response_window_minutes', ?, ?)
           ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_by = VALUES(updated_by)`,
        [String(val), userId]
      );
    }
    if (renotify_window_minutes != null) {
      const val = parseInt(renotify_window_minutes, 10);
      if (isNaN(val) || val < 1 || val > 120) return res.status(400).json({ success: false, message: 'renotify_window_minutes must be 1-120.' });
      await pool.execute(
        `INSERT INTO SYSTEM_CONFIG (config_key, config_value, updated_by) VALUES ('escalation_renotify_window_minutes', ?, ?)
           ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_by = VALUES(updated_by)`,
        [String(val), userId]
      );
    }
    return res.json({ success: true, message: 'Escalation config updated.' });
  } catch (err) { return next(err); }
};

// ---------------------------------------------------------------------------
// Barangay management
// ---------------------------------------------------------------------------

const listBarangays = async (req, res, next) => {
  const { restrict_to_barangay, own_barangay_id } = req.permScope;
  const scopeFilter = restrict_to_barangay ? 'AND b.barangay_id = ?' : '';
  const scopeParams = restrict_to_barangay ? [own_barangay_id] : [];
  try {
    const [rows] = await pool.execute(
      `SELECT b.barangay_id, b.barangay_name, b.barangay_number, b.is_participating AS is_active,
              b.latitude, b.longitude,
              (SELECT CONCAT(u2.first_name, ' ', u2.last_name)
               FROM USERS u2
               WHERE u2.barangay_id = b.barangay_id AND u2.role = 'brgy_official' AND u2.is_active = TRUE
               ORDER BY u2.user_id LIMIT 1) AS assigned_official,
              (SELECT COUNT(*) FROM STREETS s WHERE s.barangay_id = b.barangay_id AND s.is_active = TRUE) AS streets_enrolled,
              (SELECT COUNT(*) FROM VIOLATION_REPORTS r
                LEFT JOIN STREETS s2 ON s2.street_id = r.street_id
                WHERE COALESCE(r.barangay_id, s2.barangay_id) = b.barangay_id
                  AND MONTH(r.submitted_at) = MONTH(CURDATE())
                  AND YEAR(r.submitted_at) = YEAR(CURDATE())) AS reports_this_month
       FROM BARANGAYS b
       WHERE 1=1 ${scopeFilter}
       ORDER BY b.barangay_name`,
      scopeParams
    );
    return res.json({ success: true, message: 'Success', data: rows });
  } catch (err) { return next(err); }
};

// POST /api/admin/barangays  { barangay_name, barangay_number? }
// Onboards a new barangay to the pilot (participating by default). The admin then
// provisions an official for it (Users page), adds its streets (Streets page), and
// sets its map pin — see the barangay page flow. barangay_name is UNIQUE, so a
// duplicate returns 409 via the error handler.
const createBarangay = async (req, res, next) => {
  if (req.permScope.restrict_to_barangay) {
    return fail(res, 403, 'Barangay Captains cannot create new barangays.');
  }
  const name = (req.body.barangay_name || '').trim();
  const number = (req.body.barangay_number || '').trim() || null;
  if (!name) return fail(res, 422, 'barangay_name is required.');
  try {
    const [result] = await pool.execute(
      'INSERT INTO BARANGAYS (barangay_name, barangay_number, is_participating) VALUES (?, ?, TRUE)',
      [name, number]
    );
    return res.status(201).json({ success: true, message: 'Barangay added.', data: { barangay_id: result.insertId } });
  } catch (err) { return next(err); }
};

const toggleBarangay = async (req, res, next) => {
  const { barangayId } = req.params;
  const { restrict_to_barangay, own_barangay_id } = req.permScope;
  if (restrict_to_barangay && Number(barangayId) !== own_barangay_id) {
    return fail(res, 403, 'You can only manage your own barangay.');
  }
  try {
    await pool.execute(
      'UPDATE BARANGAYS SET is_participating = NOT is_participating WHERE barangay_id = ?',
      [barangayId]
    );
    return res.json({ success: true, message: 'Barangay status toggled.' });
  } catch (err) { return next(err); }
};

// PATCH /api/admin/barangays/:barangayId/location  { latitude, longitude }
// Sets the barangay's map centroid (drives the barangay-level violation heat map).
// Human-set from the admin map picker, so it matches the real location exactly.
const setBarangayLocation = async (req, res, next) => {
  const { barangayId } = req.params;
  const { restrict_to_barangay, own_barangay_id } = req.permScope;
  if (restrict_to_barangay && Number(barangayId) !== own_barangay_id) {
    return fail(res, 403, 'You can only manage your own barangay.');
  }
  const lat = Number(req.body.latitude);
  const lng = Number(req.body.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return fail(res, 422, 'Valid latitude and longitude are required.');
  }
  try {
    const [result] = await pool.execute(
      'UPDATE BARANGAYS SET latitude = ?, longitude = ? WHERE barangay_id = ?',
      [lat, lng, barangayId]
    );
    if (result.affectedRows === 0) return fail(res, 404, 'Barangay not found.');
    return res.json({ success: true, message: 'Barangay location updated.', data: { latitude: lat, longitude: lng } });
  } catch (err) { return next(err); }
};

// ---------------------------------------------------------------------------
// Streets & Parking Rules
// ---------------------------------------------------------------------------

const listStreets = async (req, res, next) => {
  const { restrict_to_barangay, own_barangay_id } = req.permScope;
  const scopeFilter = restrict_to_barangay ? 'WHERE s.barangay_id = ?' : '';
  const scopeParams = restrict_to_barangay ? [own_barangay_id] : [];
  try {
    const [streets] = await pool.execute(
      `SELECT s.street_id, s.street_name, s.is_active, s.barangay_id, b.barangay_name
       FROM STREETS s
       LEFT JOIN BARANGAYS b ON b.barangay_id = s.barangay_id
       ${scopeFilter}
       ORDER BY b.barangay_name, s.street_name`,
      scopeParams
    );
    const [rules] = await pool.execute('SELECT rule_id, street_id, violation_type, description, ordinance, is_active FROM PARKING_RULES ORDER BY violation_type');

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
  const { restrict_to_barangay, own_barangay_id } = req.permScope;
  if (restrict_to_barangay && Number(barangay_id) !== own_barangay_id) {
    return fail(res, 403, 'You can only add streets to your own barangay.');
  }
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

// PATCH /api/admin/streets/:streetId/deactivate — soft-delete (UC-15).
const deactivateStreet = async (req, res, next) => {
  const { streetId } = req.params;
  const { restrict_to_barangay, own_barangay_id } = req.permScope;
  try {
    if (restrict_to_barangay) {
      const [[street]] = await pool.execute('SELECT barangay_id FROM STREETS WHERE street_id = ?', [streetId]);
      if (!street || street.barangay_id !== own_barangay_id) {
        return fail(res, 403, 'You can only deactivate streets in your own barangay.');
      }
    }
    await pool.execute('UPDATE STREETS SET is_active = FALSE WHERE street_id = ?', [streetId]);
    return res.json({ success: true, message: 'Street deactivated.' });
  } catch (err) { return next(err); }
};

// GET /api/admin/parking-rules?street_id= — rules with their street name (UC-17).
const listRules = async (req, res, next) => {
  const { restrict_to_barangay, own_barangay_id } = req.permScope;
  try {
    const { street_id } = req.query;
    const conditions = [];
    const params = [];
    if (street_id) { conditions.push('pr.street_id = ?'); params.push(parseInt(street_id, 10)); }
    if (restrict_to_barangay) { conditions.push('s.barangay_id = ?'); params.push(own_barangay_id); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [rows] = await pool.execute(
      `SELECT pr.rule_id, pr.street_id, pr.violation_type, pr.description, pr.ordinance, pr.is_active, s.street_name
         FROM PARKING_RULES pr
         LEFT JOIN STREETS s ON s.street_id = pr.street_id
         ${where}
         ORDER BY s.street_name, pr.violation_type`,
      params
    );
    return res.json({ success: true, message: 'Success', data: rows });
  } catch (err) { return next(err); }
};

const toggleRule = async (req, res, next) => {
  const { ruleId } = req.params;
  const { restrict_to_barangay, own_barangay_id } = req.permScope;
  try {
    if (restrict_to_barangay) {
      const [[rule]] = await pool.execute(
        'SELECT s.barangay_id FROM PARKING_RULES pr JOIN STREETS s ON s.street_id = pr.street_id WHERE pr.rule_id = ?',
        [ruleId]
      );
      if (!rule || rule.barangay_id !== own_barangay_id) {
        return fail(res, 403, 'You can only manage rules for streets in your own barangay.');
      }
    }
    await pool.execute('UPDATE PARKING_RULES SET is_active = NOT is_active WHERE rule_id = ?', [ruleId]);
    return res.json({ success: true, message: 'Rule toggled.' });
  } catch (err) { return next(err); }
};

const createRule = async (req, res, next) => {
  const { street_id, violation_type, description, ordinance } = req.body;
  if (!street_id || !violation_type) return fail(res, 400, 'street_id and violation_type are required.');
  const { restrict_to_barangay, own_barangay_id } = req.permScope;
  if (restrict_to_barangay) {
    const [[street]] = await pool.execute('SELECT barangay_id FROM STREETS WHERE street_id = ?', [street_id]);
    if (!street || street.barangay_id !== own_barangay_id) {
      return fail(res, 403, 'You can only add rules to streets in your own barangay.');
    }
  }
  try {
    const [result] = await pool.execute(
      'INSERT INTO PARKING_RULES (street_id, violation_type, description, ordinance) VALUES (?, ?, ?, ?)',
      [street_id, violation_type.trim(), description?.trim() ?? null, ordinance?.trim() ?? null]
    );
    return res.status(201).json({ success: true, message: 'Rule created.', data: { rule_id: result.insertId } });
  } catch (err) { return next(err); }
};

// PATCH /api/admin/parking-rules/:ruleId — update description and/or ordinance text.
const updateRule = async (req, res, next) => {
  const ruleId = parseInt(req.params.ruleId, 10);
  if (!Number.isInteger(ruleId) || ruleId <= 0) return fail(res, 400, 'Invalid rule id.');
  const { description, ordinance } = req.body;
  if (description === undefined && ordinance === undefined) {
    return fail(res, 400, 'Provide description and/or ordinance to update.');
  }
  const { restrict_to_barangay, own_barangay_id } = req.permScope;
  try {
    if (restrict_to_barangay) {
      const [[rule]] = await pool.execute(
        'SELECT s.barangay_id FROM PARKING_RULES pr JOIN STREETS s ON s.street_id = pr.street_id WHERE pr.rule_id = ?',
        [ruleId]
      );
      if (!rule || rule.barangay_id !== own_barangay_id) {
        return fail(res, 403, 'You can only manage rules for streets in your own barangay.');
      }
    }
    const fields = [];
    const params = [];
    if (description !== undefined) { fields.push('description = ?'); params.push(description?.trim() ?? null); }
    if (ordinance  !== undefined) { fields.push('ordinance = ?');   params.push(ordinance?.trim()  ?? null); }
    params.push(ruleId);
    await pool.execute(`UPDATE PARKING_RULES SET ${fields.join(', ')} WHERE rule_id = ?`, params);
    return res.json({ success: true, message: 'Rule updated.' });
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

// Two violation-count ranges overlap if each starts at or before the other ends.
// A null max_violations means the tier is open-ended (… and up).
const rangesOverlap = (aMin, aMax, bMin, bMax) => {
  const aHi = aMax == null ? Infinity : Number(aMax);
  const bHi = bMax == null ? Infinity : Number(bMax);
  return Number(aMin) <= bHi && Number(bMin) <= aHi;
};

// Returns an existing tier whose range overlaps [minV, maxV], or null.
// excludeTierId skips the row being updated.
const findOverlappingTier = async (minV, maxV, excludeTierId = null) => {
  const [tiers] = await pool.execute(
    'SELECT tier_id, tier_name, min_violations, max_violations FROM PENALTY_TIERS'
  );
  return tiers.find((t) =>
    t.tier_id !== excludeTierId && rangesOverlap(minV, maxV, t.min_violations, t.max_violations)
  ) || null;
};

const overlapMessage = (t) =>
  `Violation range overlaps existing tier "${t.tier_name}" (${t.min_violations}–${t.max_violations ?? '∞'}).`;

const updateTier = async (req, res, next) => {
  const { tierId } = req.params;
  const { tier_name, min_violations, max_violations, fine_amount, requires_clamping } = req.body;
  if (!tier_name || min_violations == null || fine_amount == null) {
    return fail(res, 400, 'tier_name, min_violations, fine_amount required.');
  }
  try {
    const clash = await findOverlappingTier(min_violations, max_violations ?? null, Number(tierId));
    if (clash) return fail(res, 422, overlapMessage(clash));

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
    const clash = await findOverlappingTier(min_violations, max_violations ?? null);
    if (clash) return fail(res, 422, overlapMessage(clash));

    const [result] = await pool.execute(
      `INSERT INTO PENALTY_TIERS (tier_name, min_violations, max_violations, fine_amount, requires_clamping) VALUES (?,?,?,?,?)`,
      [tier_name, min_violations, max_violations ?? null, fine_amount, requires_clamping ? 1 : 0]
    );
    return res.status(201).json({ success: true, message: 'Tier created.', data: { tier_id: result.insertId } });
  } catch (err) { return next(err); }
};

module.exports = {
  listUsers, createUser, updateUser, updateUserRole, deactivateUser, reactivateUser, deleteUser, setOfficerSupervisor,
  listOfficers, getOfficerStats, getEscalationConfig, updateEscalationConfig,
  listBarangays, createBarangay, toggleBarangay, setBarangayLocation,
  listStreets, createStreet, deactivateStreet, listRules, toggleRule, createRule, updateRule,
  listTiers, updateTier, createTier,
};
