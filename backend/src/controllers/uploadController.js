'use strict';

const path = require('path');

const storageService = require('../services/storageService');
const { sendSuccess, sendError } = require('../utils/response');

// POST /api/upload/photo (also mounted at /api/v1/upload/photo)
// Citizen-only. Expects multipart/form-data with an image under field "photo"
// (type/size validation happens in middleware/upload.js). The photo lands in
// GCS at photos/{userId}/{timestamp}_{originalname}.
const uploadPhoto = async (req, res, next) => {
  try {
    if (!req.file) {
      return sendError(res, 'No photo provided. Attach an image file under the "photo" field.', 400);
    }

    // Strip any path components and characters that are unsafe in object names.
    const safeName = path
      .basename(req.file.originalname)
      .replace(/[^a-zA-Z0-9._-]/g, '_');
    // Anonymous citizens have no account, so bucket uploads under "anonymous".
    const owner = req.user?.id ?? 'anonymous';
    const destination = `photos/${owner}/${Date.now()}_${safeName}`;

    const photo_url = await storageService.uploadBuffer(
      req.file.buffer,
      destination,
      req.file.mimetype
    );

    return sendSuccess(res, { photo_url }, 'Photo uploaded successfully.');
  } catch (err) {
    return next(err);
  }
};

module.exports = { uploadPhoto };
