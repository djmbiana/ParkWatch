const fs     = require('fs');
const multer = require('multer');
const path   = require('path');
const { v4: uuidv4 } = require('uuid');

// Ensure uploads/ exists so multer never crashes on a fresh clone.
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Local disk storage for evidence photos during development. In production these
// are uploaded to Google Cloud Storage (see src/services/storageService.js).
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const err = new Error('Only JPEG, PNG, and WEBP images are allowed.');
    err.statusCode = 400; // client error, not a 500
    cb(err, false);
  }
};

const limits = { fileSize: 10 * 1024 * 1024 }; // 10 MB

const upload = multer({ storage, fileFilter, limits });

// Memory-storage variant for files forwarded to Google Cloud Storage —
// keeps the photo as a buffer (req.file.buffer) instead of writing to disk.
const memoryUpload = multer({ storage: multer.memoryStorage(), fileFilter, limits });

module.exports = { upload, memoryUpload };
