const express = require('express');

const uploadController = require('../controllers/uploadController');
const { optionalAuthenticate } = require('../middleware/auth');
const { memoryUpload } = require('../middleware/upload');

const router = express.Router();

// POST /photo — evidence photo upload to Google Cloud Storage.
// Public: citizens submit anonymously (paper p.118), so no auth is required.
// optionalAuthenticate links the upload to an account only when a token is sent.
// memoryUpload enforces image-only (jpeg/png/webp) and the 10MB cap.
router.post(
  '/photo',
  optionalAuthenticate,
  memoryUpload.single('photo'),
  uploadController.uploadPhoto
);

module.exports = router;
