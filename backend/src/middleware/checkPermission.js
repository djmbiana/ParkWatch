'use strict';

const { pool } = require('../config/db');

/**
 * RBAC permission-check middleware.
 *
 * Usage:
 *   router.patch('/users/:id', authenticate, checkPermission('users_mgt','edit_profile','update'), ...)
 *
 * action ∈ { 'create', 'read', 'update', 'delete' }
 *
 * On success attaches req.permScope:
 *   group_id, group_name, is_system_role
 *   own_barangay_id   – requesting user's barangay_id (Barangay Captain scope)
 *   own_user_id       – req.user.id shorthand
 *   restrict_to_barangay     – true for Barangay Captain
 *   restrict_to_own_officers – true for MTPB Supervisor (users_mgt reads)
 */
const checkPermission = (module, func, action) => async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated.' });
  }

  const actionColumn = `can_${action}`;

  try {
    const [rows] = await pool.execute(
      `SELECT gp.can_create, gp.can_read, gp.can_update, gp.can_delete,
              ug.id AS group_id, ug.name AS group_name, ug.is_system_role,
              u.barangay_id AS user_barangay_id
         FROM USERS u
         JOIN user_groups ug        ON ug.id = u.group_id
         JOIN group_permissions gp  ON gp.group_id = ug.id
         JOIN permissions p         ON p.id = gp.permission_id
        WHERE u.user_id = ? AND p.module_name = ? AND p.function_name = ?`,
      [req.user.id, module, func],
    );

    if (rows.length === 0 || !rows[0][actionColumn]) {
      return res.status(403).json({ success: false, message: 'Permission denied.' });
    }

    const perm = rows[0];
    req.permScope = {
      group_id:                perm.group_id,
      group_name:              perm.group_name,
      is_system_role:          !!perm.is_system_role,
      own_barangay_id:         perm.user_barangay_id,
      own_user_id:             req.user.id,
      restrict_to_barangay:    perm.group_name === 'Barangay Captain',
      restrict_to_own_officers: perm.group_name === 'MTPB Supervisor',
    };

    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Require the user to be in the Super Admin group (is_system_role = true).
 * Used to protect group management and audit log endpoints.
 */
const requireSystemRole = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated.' });
  }
  try {
    const [[row]] = await pool.execute(
      `SELECT ug.is_system_role
         FROM USERS u JOIN user_groups ug ON ug.id = u.group_id
        WHERE u.user_id = ?`,
      [req.user.id],
    );
    if (!row?.is_system_role) {
      return res.status(403).json({ success: false, message: 'Super Admin access required.' });
    }
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { checkPermission, requireSystemRole };
