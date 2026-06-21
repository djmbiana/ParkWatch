'use strict';

const path = require('path');

const storageService = require('../services/storageService');
const { sendSuccess, sendError } = require('../utils/response');

// Sniff the real image type from the file's magic bytes so a renamed/forged
// Content-Type can't smuggle a non-image through (C.6). Returns the detected
// MIME type or null. Covers the three accepted formats (jpeg/png/webp).
const detectImageType = (buf) => {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
      && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return 'image/png';
  // WEBP: "RIFF"...."WEBP"
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
};

// POST /api/upload/photo (also mounted at /api/v1/upload/photo)
// Citizen-only. Expects multipart/form-data with an image under field "photo"
// (type/size validation happens in middleware/upload.js). The photo lands in
// GCS at photos/{userId}/{timestamp}_{originalname}.
const uploadPhoto = async (req, res, next) => {
  try {
    if (!req.file) {
      return sendError(res, 'No photo provided. Attach an image file under the "photo" field.', 400);
    }

    // Validate actual file contents, not just the client-declared MIME type (C.6).
    const detected = detectImageType(req.file.buffer);
    if (!detected) {
      return sendError(res, 'File content is not a valid JPEG, PNG, or WEBP image.', 400);
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
      detected // trust the sniffed type, not the client-declared Content-Type
    );

    return sendSuccess(res, { photo_url }, 'Photo uploaded successfully.');
  } catch (err) {
    return next(err);
  }
};

module.exports = { uploadPhoto };
