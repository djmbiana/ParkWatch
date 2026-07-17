const express = require('express');
const adminController = require('../controllers/adminController');
const ugController    = require('../controllers/userGroupsController');
const { authenticate } = require('../middleware/auth');
const { checkPermission, requireSystemRole } = require('../middleware/checkPermission');
const { authorize, ROLES } = require('../middleware/roleMiddleware');

const router = express.Router();

// Convenience shorthands
const cp = (mod, fn, action) => [authenticate, checkPermission(mod, fn, action)];
const sys = [authenticate, requireSystemRole];

// ─── Users ────────────────────────────────────────────────────────────────────
router.get   ('/users',                       authenticate, authorize(ROLES.ADMIN),        adminController.listUsers);
router.post  ('/users',                       ...cp('users_mgt','edit_profile','create'),  adminController.createUser);
router.patch ('/users/:userId',               ...cp('users_mgt','edit_profile','update'),  adminController.updateUser);
router.patch ('/users/:userId/deactivate',    ...cp('users_mgt','status_update','update'), adminController.deactivateUser);
router.patch ('/users/:userId/reactivate',    ...cp('users_mgt','status_update','update'), adminController.reactivateUser);
router.delete('/users/:userId',               ...cp('users_mgt','status_update','update'), adminController.deleteUser);
router.get   ('/officers',                    ...cp('users_mgt','edit_profile','read'),    adminController.listOfficers);
router.get   ('/officers/:officerId/stats',   authenticate, authorize(ROLES.MTPB_SUPERVISOR, ROLES.ADMIN), adminController.getOfficerStats);
router.patch ('/officers/:officerId/supervisor', authenticate, authorize(ROLES.MTPB_SUPERVISOR, ROLES.ADMIN), adminController.setOfficerSupervisor);

// ─── System Config ───────────────────────────────────────────────────────────
router.get   ('/system-config/escalation',    authenticate, authorize(ROLES.MTPB_SUPERVISOR, ROLES.ADMIN), adminController.getEscalationConfig);
router.patch ('/system-config/escalation',    authenticate, authorize(ROLES.MTPB_SUPERVISOR, ROLES.ADMIN), adminController.updateEscalationConfig);

// User RBAC assignment (Super Admin only)
router.patch ('/users/:userId/role',          ...sys, adminController.updateUserRole);
router.patch ('/users/:userId/group',         ...sys, ugController.assignUserGroup);
router.patch ('/users/:userId/supervisor',    ...sys, ugController.assignSupervisor);

// ─── Barangays ───────────────────────────────────────────────────────────────
router.get   ('/barangays',                          ...cp('brgy_mgt','manage','read'),   adminController.listBarangays);
router.post  ('/barangays',                          ...cp('brgy_mgt','manage','create'), adminController.createBarangay);
router.post  ('/barangays/sync',                     ...cp('brgy_mgt','manage','create'), adminController.syncBarangaysFromPsgc);
router.patch ('/barangays/:barangayId',               ...cp('brgy_mgt','manage','update'), adminController.updateBarangay);
router.patch ('/barangays/:barangayId/toggle',       ...cp('brgy_mgt','manage','update'), adminController.toggleBarangay);
router.patch ('/barangays/:barangayId/location',     ...cp('brgy_mgt','manage','update'), adminController.setBarangayLocation);

// ─── Streets & Rules ─────────────────────────────────────────────────────────
router.get   ('/streets',                            ...cp('streets_rules','manage','read'),   adminController.listStreets);
router.post  ('/streets',                            ...cp('streets_rules','manage','create'), adminController.createStreet);
router.patch ('/streets/:streetId/deactivate',       ...cp('streets_rules','manage','update'), adminController.deactivateStreet);
router.get   ('/parking-rules',                      ...cp('streets_rules','manage','read'),   adminController.listRules);
router.patch ('/parking-rules/:ruleId/toggle',       ...cp('streets_rules','manage','update'), adminController.toggleRule);
router.patch ('/parking-rules/:ruleId',              ...cp('streets_rules','manage','update'), adminController.updateRule);
router.post  ('/parking-rules',                      ...cp('streets_rules','manage','create'), adminController.createRule);

// ─── Penalty Tiers ───────────────────────────────────────────────────────────
router.get   ('/penalty-tiers',                      ...cp('penalty','manage','read'),   adminController.listTiers);
router.post  ('/penalty-tiers',                      ...cp('penalty','manage','create'), adminController.createTier);
router.patch ('/penalty-tiers/:tierId',              ...cp('penalty','manage','update'), adminController.updateTier);

// ─── User Groups (Super Admin only) ──────────────────────────────────────────
router.get   ('/groups',                             ...sys, ugController.listGroups);
router.post  ('/groups',                             ...sys, ugController.createGroup);
router.patch ('/groups/:groupId',                    ...sys, ugController.updateGroup);
router.delete('/groups/:groupId',                    ...sys, ugController.deleteGroup);

// ─── Permission matrix (Super Admin only) ────────────────────────────────────
router.get   ('/permissions',                        ...sys, ugController.listPermissions);
router.get   ('/groups/:groupId/permissions',        ...sys, ugController.getGroupPermissions);
router.put   ('/groups/:groupId/permissions',        ...sys, ugController.updateGroupPermissions);

// ─── Audit log (Super Admin only) ────────────────────────────────────────────
router.get   ('/audit-logs',                         ...sys, ugController.listAuditLogs);

module.exports = router;
