const express = require('express');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');

const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roleMiddleware');

const router = express.Router();

// Brute-force / credential-stuffing throttle for the credential endpoints (A.8,
// E.4). Unlike the global limiter this runs in ALL environments. Per-IP.
const authLimiter = rateLimit({
  windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 min
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many attempts. Please try again later.' },
});

// --- Validators ----------------------------------------------------------
const registerValidators = [
  body('first_name').trim().notEmpty().withMessage('First name is required.')
    .isLength({ max: 50 }),
  body('last_name').trim().notEmpty().withMessage('Last name is required.')
    .isLength({ max: 50 }),
  body('email').trim().isEmail().withMessage('A valid email is required.')
    .normalizeEmail({ gmail_remove_dots: false })
    .isLength({ max: 100 }),
  body('password').isString()
    .isLength({ min: 8, max: 72 })
    .withMessage('Password must be between 8 and 72 characters.'),
  body('phone_number').optional({ checkFalsy: true })
    .isLength({ max: 20 }),
];

const loginValidators = [
  body('email').trim().isEmail().withMessage('A valid email is required.'),
  body('password').isString().notEmpty().withMessage('Password is required.'),
];

const changePasswordValidators = [
  body('current_password').isString().notEmpty().withMessage('Current password is required.'),
  body('new_password').isString().isLength({ min: 8, max: 72 }).withMessage('New password must be 8–72 characters.'),
];

// --- Routes --------------------------------------------------------------
router.post('/register',        authLimiter, registerValidators,        authController.register);
router.post('/login',           authLimiter, loginValidators,           authController.login);
router.get ('/me',              authenticate,                            authController.me);
router.post('/change-password', authenticate, changePasswordValidators, authController.changePassword);

// Test route for role-based access control — confirms authorize() middleware
// blocks unauthorized roles. Used for the Authentication Testing & CORS Config
// sprint card. Safe to remove or relocate when real admin endpoints land.
router.get('/admin-only', authenticate, authorize(ROLES.ADMIN), authController.me);

module.exports = router;