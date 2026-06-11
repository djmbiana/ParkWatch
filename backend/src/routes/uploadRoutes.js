const express = require('express');

const uploadController = require('../controllers/uploadController');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roleMiddleware');
const { memoryUpload } = require('../middleware/upload');

const router = express.Router();

// POST /photo — citizen-only evidence photo upload to Google Cloud Storage.
// memoryUpload enforces image-only (jpeg/png/webp) and the 10MB cap.
router.post(
  '/photo',
  authenticate,
  authorize(ROLES.CITIZEN),
  memoryUpload.single('photo'),
  uploadController.uploadPhoto
);

module.exports = router;
