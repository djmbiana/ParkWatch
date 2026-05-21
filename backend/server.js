require('dotenv').config();

const app = require('./src/app');
const logger = require('./src/config/logger');
const { testConnection } = require('./src/config/db');
const { initFirebase } = require('./src/config/firebase');

// Cloud Run injects PORT (defaults to 8080); fall back to 3000 for local dev.
const PORT = process.env.PORT || 3000;

const start = async () => {
  await testConnection();
  initFirebase();

  app.listen(PORT, () => {
    logger.info(`ParkWatch API running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    logger.info(`Health check: http://localhost:${PORT}/api/v1/health`);
  });
};

// Surface unexpected failures instead of dying silently.
process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason instanceof Error ? reason.stack : reason}`);
  process.exit(1);
});

start();
