const express = require('express');
const { body } = require('express-validator');

const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

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

// --- Routes --------------------------------------------------------------
router.post('/register', registerValidators, authController.register);
router.post('/login',    loginValidators,    authController.login);
router.get ('/me',       authenticate,       authController.me);

module.exports = router;