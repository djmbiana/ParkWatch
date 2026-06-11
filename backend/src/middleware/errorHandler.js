const logger = require('../config/logger');

// Centralized error handler. Mounted last in src/app.js so any next(err) lands here.
// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity (4 args).
const errorHandler = (err, req, res, next) => {
  logger.error(err.stack || err.message);

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, message: 'File too large. Max size is 10MB.' });
  }

  // Other multer errors (e.g. LIMIT_UNEXPECTED_FILE when the field name
  // isn't "photo") are client mistakes, not server faults.
  if (err.name === 'MulterError') {
    return res.status(400).json({ success: false, message: `Upload error: ${err.message}.` });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(403).json({ success: false, message: 'Invalid token.' });
  }

  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ success: false, message: 'Duplicate entry.' });
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error.';

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = { errorHandler };
