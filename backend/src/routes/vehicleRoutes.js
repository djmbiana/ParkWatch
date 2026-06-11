const express = require('express');

const vehicleController = require('../controllers/vehicleController');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roleMiddleware');

const router = express.Router();

// GET /:plateNumber/history — cross-barangay violation history for a plate.
// Spec requires mtpb_officer or brgy_official; supervisors and admins are
// included since they already have full report visibility. Citizens excluded.
router.get(
  '/:plateNumber/history',
  authenticate,
  authorize(ROLES.MTPB_OFFICER, ROLES.BRGY_OFFICIAL, ROLES.MTPB_SUPERVISOR, ROLES.ADMIN),
  vehicleController.history
);

module.exports = router;
