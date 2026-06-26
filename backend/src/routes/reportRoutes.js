const express = require('express');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');

const reportController = require('../controllers/reportController');
const queueController  = require('../controllers/queueController');
const { authenticate, optionalAuthenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roleMiddleware');
const { requireStatus } = require('../middleware/statusGuard');

const router = express.Router();

// Dedicated submission limiter (Check 4.8). Unlike the global /api limiter in
// app.js — which only runs in production — this caps anonymous report creation
// in ALL environments, since it's the one unauthenticated write path. Skipped
// only under NODE_ENV=test so the jest/supertest suites aren't throttled.
// Backed by the in-memory store, so the count resets on each process restart.
const reportSubmissionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: parseInt(process.env.REPORT_RATE_LIMIT_MAX, 10) || 10, // per IP per hour
  message: {
    success: false,
    error: 'Too many reports submitted from this IP. Please wait before submitting again.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

// --- Validators ----------------------------------------------------------
const submissionValidators = [
  body('photo_url').isString().trim().notEmpty().withMessage('photo_url is required.').isLength({ max: 500 }),
  body('street_id').isInt({ min: 1 }).withMessage('street_id must be a positive integer.'),
  body('violation_type').isString().trim().notEmpty().withMessage('violation_type is required.').isLength({ max: 100 }),
  // Anonymous citizens persist their alias client-side and replay it on later
  // submissions so all of a device's reports share one handle. Optional.
  body('anonymous_alias').optional({ nullable: true }).isString().trim().isLength({ max: 50 }),
  // Device FCM token for anonymous push delivery (UC-03). Optional.
  body('fcm_token').optional({ nullable: true }).isString().trim().isLength({ max: 512 }),
  // Citizen-confirmed plate (+ the OCR reading it was confirmed against). When
  // present, the server trusts it instead of re-running OCR. Optional.
  body('plate').optional({ nullable: true }).isString().trim().isLength({ max: 20 }),
  body('ocr_extracted_plate').optional({ nullable: true }).isString().trim().isLength({ max: 20 }),
  body('ocr_confidence_score').optional({ nullable: true }).isFloat({ min: 0, max: 100 }),
];

const confirmValidators = [
  ...submissionValidators,
  body('manual_plate_input').isString().trim().notEmpty().withMessage('manual_plate_input is required.').isLength({ max: 20 }),
  body('ocr_extracted_plate').optional({ nullable: true }).isString().trim().isLength({ max: 20 }),
  body('ocr_confidence_score').optional({ nullable: true }).isFloat({ min: 0, max: 100 }).withMessage('ocr_confidence_score must be between 0 and 100.'),
  body('ocr_raw_response').optional({ nullable: true }).isString(),
];

// --- Citizen routes (anonymous — no account, per paper p.118) -------------
// Submission is public; a logged-in citizen may still submit, in which case the
// report is linked to their account. The optional token is read so the report
// can be associated when present.
router.post('/',        reportSubmissionLimiter, optionalAuthenticate, submissionValidators, reportController.create);
router.post('/confirm', reportSubmissionLimiter, optionalAuthenticate, confirmValidators,    reportController.confirm);
// Preview steps (no DB write) that power the Step-2 plate card + Step-3 penalty.
router.post('/ocr',             optionalAuthenticate, body('photo_url').isString().trim().notEmpty(), reportController.ocrPreview);
router.post('/penalty-preview', optionalAuthenticate, body('plate').isString().trim().notEmpty(),     reportController.penaltyPreview);
router.get ('/mine',    authenticate, authorize(ROLES.CITIZEN), reportController.mine);

// --- Barangay queue -------------------------------------------------------
router.get('/queue/barangay',  authenticate, authorize(ROLES.BRGY_OFFICIAL),                                   queueController.barangayQueue);
router.get('/stats/barangay',  authenticate, authorize(ROLES.BRGY_OFFICIAL),                                   queueController.barangayStats);
router.patch('/:reportId/verify', authenticate, authorize(ROLES.BRGY_OFFICIAL),        requireStatus('verify_approve'), queueController.verify);

// --- MTPB queue & actions -------------------------------------------------
router.get ('/queue/mtpb',        authenticate, authorize(ROLES.MTPB_OFFICER, ROLES.MTPB_SUPERVISOR, ROLES.ADMIN), queueController.mtpbQueue);
router.patch('/:reportId/acknowledge', authenticate, authorize(ROLES.MTPB_OFFICER, ROLES.MTPB_SUPERVISOR), requireStatus('acknowledge'), queueController.acknowledge);
router.patch('/:reportId/dispatch',    authenticate, authorize(ROLES.MTPB_OFFICER, ROLES.MTPB_SUPERVISOR), requireStatus('dispatch'),    queueController.dispatch);
router.patch('/:reportId/resolve',     authenticate, authorize(ROLES.MTPB_OFFICER, ROLES.MTPB_SUPERVISOR), requireStatus('resolve'),     queueController.resolve);
router.patch('/:reportId/assign',      authenticate, authorize(ROLES.MTPB_SUPERVISOR, ROLES.ADMIN),        requireStatus('assign'),      queueController.assign);

// --- Supervisor (UC-10) ---------------------------------------------------
router.get  ('/queue/supervisor',           authenticate, authorize(ROLES.MTPB_SUPERVISOR, ROLES.ADMIN),                          queueController.supervisorQueue);
router.patch('/:reportId/supervisor-resolve', authenticate, authorize(ROLES.MTPB_SUPERVISOR, ROLES.ADMIN), requireStatus('supervisor_resolve'), queueController.supervisorResolve);

// --- Analytics (supervisor / admin) --------------------------------------
router.get('/analytics/summary',          authenticate, authorize(ROLES.MTPB_SUPERVISOR, ROLES.ADMIN), queueController.analyticsSummary);
router.get('/analytics/repeat-offenders', authenticate, authorize(ROLES.MTPB_SUPERVISOR, ROLES.ADMIN), queueController.repeatOffenders);
router.get('/analytics/violation-map',    authenticate, authorize(ROLES.MTPB_SUPERVISOR, ROLES.ADMIN), queueController.violationMap);

// --- All reports (supervisor / admin) — paginated list -------------------
router.get('/', authenticate, authorize(ROLES.MTPB_SUPERVISOR, ROLES.ADMIN), queueController.allReports);

// --- Report detail (role-scoped) — must be last to avoid matching above ----
// FR-16: Anonymous citizens access their own reports via the access_token
// returned at submission and stored in localStorage['parkwatch_reports'] —
// GET /api/reports/:id?token={access_token}. Without a valid token the handler
// returns 401, which prevents report_id enumeration. Staff (JWT present) bypass
// the token check per their role scoping. This design exceeds the paper spec by
// preventing enumeration while still requiring no citizen account.
router.get('/:reportId', optionalAuthenticate, reportController.getById);

module.exports = router;
