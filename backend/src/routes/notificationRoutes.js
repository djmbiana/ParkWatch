const express = require('express');

const notificationController = require('../controllers/notificationController');
const { authenticate, optionalAuthenticate } = require('../middleware/auth');

const router = express.Router();

// POST /register-token — FCM device-token registration (UC-03).
// Public: citizens report without an account. optionalAuthenticate lets a
// logged-in staff caller register the token against their own account.
router.post('/register-token', optionalAuthenticate, notificationController.registerToken);

// GET /mine — the authenticated caller's in-app notification feed (UC-02).
router.get('/mine', authenticate, notificationController.mine);

module.exports = router;
