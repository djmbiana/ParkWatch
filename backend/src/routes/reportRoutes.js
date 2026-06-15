const express = require('express');
const { body } = require('express-validator');

const reportController = require('../controllers/reportController');
const queueController  = require('../controllers/queueController');
const { authenticate }  = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roleMiddleware');

const router = express.Router();

// --- Validators ----------------------------------------------------------
const submissionValidators = [
  body('photo_url').isString().trim().notEmpty().withMessage('photo_url is required.').isLength({ max: 500 }),
  body('street_id').isInt({ min: 1 }).withMessage('street_id must be a positive integer.'),
  body('violation_type').isString().trim().notEmpty().withMessage('violation_type is required.').isLength({ max: 100 }),
];

const confirmValidators = [
  ...submissionValidators,
  body('manual_plate_input').isString().trim().notEmpty().withMessage('manual_plate_input is required.').isLength({ max: 20 }),
  body('ocr_extracted_plate').optional({ nullable: true }).isString().trim().isLength({ max: 20 }),
  body('ocr_confidence_score').optional({ nullable: true }).isFloat({ min: 0, max: 100 }).withMessage('ocr_confidence_score must be between 0 and 100.'),
  body('ocr_raw_response').optional({ nullable: true }).isString(),
];

// --- Citizen routes -------------------------------------------------------
router.post('/',        authenticate, authorize(ROLES.CITIZEN), submissionValidators, reportController.create);
router.post('/confirm', authenticate, authorize(ROLES.CITIZEN), confirmValidators,    reportController.confirm);
router.get ('/mine',    authenticate, authorize(ROLES.CITIZEN), reportController.mine);

// --- Barangay queue -------------------------------------------------------
router.get('/queue/barangay',  authenticate, authorize(ROLES.BRGY_OFFICIAL),                                   queueController.barangayQueue);
router.get('/stats/barangay',  authenticate, authorize(ROLES.BRGY_OFFICIAL),                                   queueController.barangayStats);
router.patch('/:reportId/verify', authenticate, authorize(ROLES.BRGY_OFFICIAL),                               queueController.verify);

// --- MTPB queue & actions -------------------------------------------------
router.get ('/queue/mtpb',        authenticate, authorize(ROLES.MTPB_OFFICER, ROLES.MTPB_SUPERVISOR, ROLES.ADMIN), queueController.mtpbQueue);
router.patch('/:reportId/acknowledge', authenticate, authorize(ROLES.MTPB_OFFICER, ROLES.MTPB_SUPERVISOR),        queueController.acknowledge);
router.patch('/:reportId/dispatch',    authenticate, authorize(ROLES.MTPB_OFFICER, ROLES.MTPB_SUPERVISOR),        queueController.dispatch);
router.patch('/:reportId/resolve',     authenticate, authorize(ROLES.MTPB_OFFICER, ROLES.MTPB_SUPERVISOR),        queueController.resolve);
router.patch('/:reportId/assign',      authenticate, authorize(ROLES.MTPB_SUPERVISOR, ROLES.ADMIN),               queueController.assign);

// --- Analytics (supervisor / admin) --------------------------------------
router.get('/analytics/summary',          authenticate, authorize(ROLES.MTPB_SUPERVISOR, ROLES.ADMIN), queueController.analyticsSummary);
router.get('/analytics/repeat-offenders', authenticate, authorize(ROLES.MTPB_SUPERVISOR, ROLES.ADMIN), queueController.repeatOffenders);

// --- Report detail (role-scoped) — must be last to avoid matching above ----
router.get('/:reportId', authenticate, reportController.getById);

module.exports = router;
