'use strict';

/**
 * User Groups controller — CRUD for user_groups, permission matrix management,
 * user-to-group assignment, officer-to-supervisor assignment, and audit log.
 *
 * All mutating operations write to audit_logs via logAudit().
 */

const { pool } = require('../config/db');

const fail = (res, code, msg) => res.status(code).json({ success: false, message: msg });

// ---------------------------------------------------------------------------
// Audit helper
// ---------------------------------------------------------------------------

const logAudit = async (req, module, func, action, targetTable, targetId, before = null, after = null) => {
  const userId  = req.user?.id ?? null;
  const groupId = req.permScope?.group_id ?? null;
  const ip      = req.ip || req.headers['x-forwarded-for'] || null;
  try {
    await pool.execute(
      `INSERT INTO audit_logs
         (user_id, group_id, module_name, function_name, action_type,
          target_table, target_id, before_value, after_value, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, groupId, module, func, action, targetTable, String(targetId),
       before ? JSON.stringify(before) : null,
       after  ? JSON.stringify(after)  : null,
       ip],
    );
  } catch (err) {
    // Audit failure must never break the main operation.
    console.error('[audit] log failed:', err.message);
  }
};

// ---------------------------------------------------------------------------
// User Groups CRUD
// ---------------------------------------------------------------------------

const listGroups = async (req, res, next) => {
  try {
    const [groups] = await pool.execute(
      `SELECT g.id, g.name, g.description, g.is_system_role, g.created_at,
              COUNT(u.user_id) AS user_count
         FROM user_groups g
         LEFT JOIN USERS u ON u.group_id = g.id
         GROUP BY g.id
         ORDER BY g.id`,
    );
    return res.json({ success: true, data: groups });
  } catch (err) { return next(err); }
};

const createGroup = async (req, res, next) => {
  const { name, description } = req.body;
  if (!name?.trim()) return fail(res, 400, 'name is required.');
  try {
    const [[exists]] = await pool.execute(
      `SELECT id FROM user_groups WHERE name = ? LIMIT 1`, [name.trim()],
    );
    if (exists) return fail(res, 409, 'A group with that name already exists.');

    const [result] = await pool.execute(
      `INSERT INTO user_groups (name, description, is_system_role) VALUES (?, ?, FALSE)`,
      [name.trim(), description?.trim() || null],
    );
    const groupId = result.insertId;
    await logAudit(req, 'users_mgt', 'edit_profile', 'create', 'user_groups', groupId, null, { name, description });
    return res.status(201).json({ success: true, message: 'Group created.', data: { id: groupId } });
  } catch (err) { return next(err); }
};

const updateGroup = async (req, res, next) => {
  const { groupId } = req.params;
  const { name, description } = req.body;
  if (!name?.trim()) return fail(res, 400, 'name is required.');
  try {
    const [[group]] = await pool.execute(`SELECT * FROM user_groups WHERE id = ?`, [groupId]);
    if (!group) return fail(res, 404, 'Group not found.');
    if (group.is_system_role) return fail(res, 403, 'Super Admin group cannot be renamed.');

    await logAudit(req, 'users_mgt', 'edit_profile', 'update', 'user_groups', groupId,
      { name: group.name, description: group.description }, { name: name.trim(), description });

    await pool.execute(
      `UPDATE user_groups SET name = ?, description = ? WHERE id = ?`,
      [name.trim(), description?.trim() || null, groupId],
    );
    return res.json({ success: true, message: 'Group updated.' });
  } catch (err) { return next(err); }
};

const deleteGroup = async (req, res, next) => {
  const { groupId } = req.params;
  try {
    const [[group]] = await pool.execute(`SELECT * FROM user_groups WHERE id = ?`, [groupId]);
    if (!group) return fail(res, 404, 'Group not found.');
    if (group.is_system_role) return fail(res, 403, 'Super Admin group cannot be deleted.');

    const [[{ count }]] = await pool.execute(
      `SELECT COUNT(*) AS count FROM USERS WHERE group_id = ?`, [groupId],
    );
    if (Number(count) > 0) return fail(res, 409, `Cannot delete: ${count} user(s) still assigned to this group.`);

    await logAudit(req, 'users_mgt', 'edit_profile', 'delete', 'user_groups', groupId, group, null);
    await pool.execute(`DELETE FROM user_groups WHERE id = ?`, [groupId]);
    return res.json({ success: true, message: 'Group deleted.' });
  } catch (err) { return next(err); }
};

// ---------------------------------------------------------------------------
// Permission matrix
// ---------------------------------------------------------------------------

const listPermissions = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, module_name, function_name, description FROM permissions ORDER BY module_name, function_name`,
    );
    return res.json({ success: true, data: rows });
  } catch (err) { return next(err); }
};

const getGroupPermissions = async (req, res, next) => {
  const { groupId } = req.params;
  try {
    const [[group]] = await pool.execute(`SELECT id, name FROM user_groups WHERE id = ?`, [groupId]);
    if (!group) return fail(res, 404, 'Group not found.');

    const [matrix] = await pool.execute(
      `SELECT p.id AS permission_id, p.module_name, p.function_name, p.description,
              COALESCE(gp.can_create, 0) AS can_create,
              COALESCE(gp.can_read,   0) AS can_read,
              COALESCE(gp.can_update, 0) AS can_update,
              COALESCE(gp.can_delete, 0) AS can_delete
         FROM permissions p
         LEFT JOIN group_permissions gp
           ON gp.permission_id = p.id AND gp.group_id = ?
         ORDER BY p.module_name, p.function_name`,
      [groupId],
    );
    return res.json({ success: true, data: { group, matrix } });
  } catch (err) { return next(err); }
};

const updateGroupPermissions = async (req, res, next) => {
  const { groupId } = req.params;
  const { permissions: perms } = req.body;
  if (!Array.isArray(perms)) return fail(res, 400, 'permissions must be an array.');

  try {
    const [[group]] = await pool.execute(`SELECT * FROM user_groups WHERE id = ?`, [groupId]);
    if (!group) return fail(res, 404, 'Group not found.');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const p of perms) {
        const { permission_id, can_create = false, can_read = false, can_update = false, can_delete = false } = p;
        await conn.execute(
          `INSERT INTO group_permissions (group_id, permission_id, can_create, can_read, can_update, can_delete)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             can_create = VALUES(can_create), can_read = VALUES(can_read),
             can_update = VALUES(can_update), can_delete = VALUES(can_delete)`,
          [groupId, permission_id, can_create, can_read, can_update, can_delete],
        );
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    await logAudit(req, 'users_mgt', 'edit_profile', 'update', 'group_permissions', groupId, null, { perms });
    return res.json({ success: true, message: 'Permission matrix updated.' });
  } catch (err) { return next(err); }
};

// ---------------------------------------------------------------------------
// User assignment
// ---------------------------------------------------------------------------

const assignUserGroup = async (req, res, next) => {
  const { userId } = req.params;
  const { group_id } = req.body;
  if (!group_id) return fail(res, 400, 'group_id is required.');
  try {
    const [[user]] = await pool.execute(`SELECT user_id, group_id AS old_group FROM USERS WHERE user_id = ?`, [userId]);
    if (!user) return fail(res, 404, 'User not found.');

    const [[group]] = await pool.execute(`SELECT id FROM user_groups WHERE id = ?`, [group_id]);
    if (!group) return fail(res, 404, 'Group not found.');

    await pool.execute(`UPDATE USERS SET group_id = ? WHERE user_id = ?`, [group_id, userId]);
    await logAudit(req, 'users_mgt', 'edit_profile', 'update', 'USERS', userId,
      { group_id: user.old_group }, { group_id });
    return res.json({ success: true, message: 'User assigned to group.' });
  } catch (err) { return next(err); }
};

const assignSupervisor = async (req, res, next) => {
  const { userId } = req.params;
  const { supervisor_id } = req.body;
  try {
    const [[user]] = await pool.execute(
      `SELECT user_id, role, supervisor_id AS old_sup FROM USERS WHERE user_id = ?`, [userId],
    );
    if (!user) return fail(res, 404, 'User not found.');
    if (user.role !== 'mtpb_officer') return fail(res, 422, 'Only MTPB Officers can be assigned a supervisor.');

    if (supervisor_id) {
      const [[sup]] = await pool.execute(
        `SELECT user_id FROM USERS WHERE user_id = ? AND role = 'mtpb_supervisor'`, [supervisor_id],
      );
      if (!sup) return fail(res, 422, 'supervisor_id must reference an active MTPB Supervisor.');
    }

    await pool.execute(`UPDATE USERS SET supervisor_id = ? WHERE user_id = ?`, [supervisor_id || null, userId]);
    await logAudit(req, 'users_mgt', 'edit_profile', 'update', 'USERS', userId,
      { supervisor_id: user.old_sup }, { supervisor_id: supervisor_id || null });
    return res.json({ success: true, message: 'Supervisor assignment updated.' });
  } catch (err) { return next(err); }
};

// ---------------------------------------------------------------------------
// Audit log viewer
// ---------------------------------------------------------------------------

const listAuditLogs = async (req, res, next) => {
  const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);
  const offset = (page - 1) * limit;

  try {
    const [rows] = await pool.query(
      `SELECT a.id, a.user_id,
              CONCAT(u.first_name, ' ', u.last_name) AS user_name,
              g.name AS group_name,
              a.module_name, a.function_name, a.action_type,
              a.target_table, a.target_id,
              a.before_value, a.after_value, a.ip_address, a.created_at
         FROM audit_logs a
         LEFT JOIN USERS       u ON u.user_id = a.user_id
         LEFT JOIN user_groups g ON g.id      = a.group_id
         ORDER BY a.created_at DESC
         LIMIT ? OFFSET ?`,
      [limit, offset],
    );
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM audit_logs`);
    return res.json({ success: true, data: { logs: rows, total, page, limit } });
  } catch (err) { return next(err); }
};

// ---------------------------------------------------------------------------
// My permissions (frontend permission context bootstrap)
// ---------------------------------------------------------------------------

const myPermissions = async (req, res, next) => {
  if (!req.user) return fail(res, 401, 'Not authenticated.');
  try {
    const [[groupRow]] = await pool.execute(
      `SELECT ug.id, ug.name, ug.is_system_role
         FROM USERS u JOIN user_groups ug ON ug.id = u.group_id
        WHERE u.user_id = ?`,
      [req.user.id],
    );
    if (!groupRow) {
      // User has no group assigned yet — return empty permissions (read-only safe degradation).
      return res.json({ success: true, data: { group: null, permissions: [] } });
    }

    const [perms] = await pool.execute(
      `SELECT p.module_name, p.function_name,
              gp.can_create, gp.can_read, gp.can_update, gp.can_delete
         FROM group_permissions gp
         JOIN permissions p ON p.id = gp.permission_id
        WHERE gp.group_id = ?`,
      [groupRow.id],
    );

    return res.json({
      success: true,
      data: {
        group: { id: groupRow.id, name: groupRow.name, is_system_role: !!groupRow.is_system_role },
        permissions: perms,
      },
    });
  } catch (err) { return next(err); }
};

module.exports = {
  listGroups, createGroup, updateGroup, deleteGroup,
  listPermissions,
  getGroupPermissions, updateGroupPermissions,
  assignUserGroup, assignSupervisor,
  listAuditLogs,
  myPermissions,
  logAudit,
};
