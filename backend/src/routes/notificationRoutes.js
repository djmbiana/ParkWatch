const express = require('express');

const notificationController = require('../controllers/notificationController');
const { optionalAuthenticate } = require('../middleware/auth');

const router = express.Router();

// POST /register-token — anonymous FCM device-token registration (UC-03).
// Public: citizens report without an account. optionalAuthenticate is harmless
// and lets a logged-in caller's token be associated later if needed.
router.post('/register-token', optionalAuthenticate, notificationController.registerToken);

module.exports = router;
