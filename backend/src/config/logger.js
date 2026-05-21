const winston = require('winston');

const isProduction = process.env.NODE_ENV === 'production';

// In production we emit structured JSON so Cloud Run / Cloud Logging can parse it.
// In development we use a colorized, human-readable format.
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    isProduction
      ? winston.format.json()
      : winston.format.combine(winston.format.colorize(), winston.format.simple())
  ),
  transports: [new winston.transports.Console()],
});

module.exports = logger;
