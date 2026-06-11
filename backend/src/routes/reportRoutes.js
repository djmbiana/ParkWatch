const express = require('express');
const { body } = require('express-validator');

const reportController = require('../controllers/reportController');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roleMiddleware');

const router = express.Router();

// --- Validators ----------------------------------------------------------
const submissionValidators = [
  body('photo_url').isString().trim().notEmpty().withMessage('photo_url is required.')
    .isLength({ max: 500 }),
  body('street_id').isInt({ min: 1 }).withMessage('street_id must be a positive integer.'),
  body('violation_type').isString().trim().notEmpty().withMessage('violation_type is required.')
    .isLength({ max: 100 }),
];

const confirmValidators = [
  ...submissionValidators,
  body('manual_plate_input').isString().trim().notEmpty()
    .withMessage('manual_plate_input is required.')
    .isLength({ max: 20 }),
  body('ocr_extracted_plate').optional({ nullable: true }).isString().trim().isLength({ max: 20 }),
  body('ocr_confidence_score').optional({ nullable: true }).isFloat({ min: 0, max: 100 })
    .withMessage('ocr_confidence_score must be between 0 and 100.'),
  body('ocr_raw_response').optional({ nullable: true }).isString(),
];

// --- Routes --------------------------------------------------------------
// POST /            — citizen submits a report (OCR-assisted pipeline)
// POST /confirm     — citizen confirms/corrects the plate after low-confidence OCR
// GET  /mine        — citizen's own reports (must precede /:reportId)
// GET  /:reportId   — role-scoped report detail
router.post('/',        authenticate, authorize(ROLES.CITIZEN), submissionValidators, reportController.create);
router.post('/confirm', authenticate, authorize(ROLES.CITIZEN), confirmValidators,    reportController.confirm);
router.get ('/mine',    authenticate, authorize(ROLES.CITIZEN), reportController.mine);
router.get ('/:reportId', authenticate, reportController.getById);

module.exports = router;
