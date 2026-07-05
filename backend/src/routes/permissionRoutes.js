const express = require('express');
const { authenticate } = require('../middleware/auth');
const { myPermissions } = require('../controllers/userGroupsController');

const router = express.Router();

// GET /api/permissions/mine — returns the calling user's full permission set.
// Called once after login to bootstrap the frontend PermissionsContext.
router.get('/mine', authenticate, myPermissions);

module.exports = router;
