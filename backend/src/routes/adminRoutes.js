const express = require('express');
const adminController = require('../controllers/adminController');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roleMiddleware');

const router = express.Router();
const admin = [authenticate, authorize(ROLES.ADMIN)];
const adminOrSup = [authenticate, authorize(ROLES.ADMIN, ROLES.MTPB_SUPERVISOR)];

// Users
router.get  ('/users',                  ...admin,      adminController.listUsers);
router.post ('/users',                  ...admin,      adminController.createUser);
router.patch('/users/:userId',          ...admin,      adminController.updateUser);
router.patch('/users/:userId/deactivate', ...admin,    adminController.deactivateUser);
router.patch('/users/:userId/reactivate', ...admin,    adminController.reactivateUser);
router.get  ('/officers',               ...adminOrSup, adminController.listOfficers);

// Barangays
router.get  ('/barangays',                ...admin, adminController.listBarangays);
router.post ('/barangays',                ...admin, adminController.createBarangay);
router.patch('/barangays/:barangayId/toggle',   ...admin, adminController.toggleBarangay);
router.patch('/barangays/:barangayId/location', ...admin, adminController.setBarangayLocation);

// Streets & Rules
router.get  ('/streets',                  ...admin, adminController.listStreets);
router.post ('/streets',                  ...admin, adminController.createStreet);
router.patch('/streets/:streetId/deactivate', ...admin, adminController.deactivateStreet);
router.get  ('/parking-rules',            ...admin, adminController.listRules);
router.patch('/parking-rules/:ruleId/toggle', ...admin, adminController.toggleRule);
router.post ('/parking-rules',            ...admin, adminController.createRule);

// Penalty Tiers
router.get  ('/penalty-tiers',           ...adminOrSup, adminController.listTiers);
router.post ('/penalty-tiers',           ...admin,      adminController.createTier);
router.patch('/penalty-tiers/:tierId',   ...admin,      adminController.updateTier);

module.exports = router;
