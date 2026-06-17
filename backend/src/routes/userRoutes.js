const express = require('express');
const { body } = require('express-validator');

const userController = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// PATCH /me — signed-in user updates their own name / password.
router.patch(
  '/me',
  authenticate,
  [
    body('first_name').optional().isString().trim().isLength({ min: 1, max: 100 }),
    body('last_name').optional().isString().trim().isLength({ min: 1, max: 100 }),
    body('current_password').optional().isString(),
    body('new_password').optional().isString().isLength({ min: 8 }).withMessage('New password must be at least 8 characters.'),
  ],
  userController.updateMe
);

module.exports = router;
