const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const logger = require('./config/logger');
const { errorHandler } = require('./middleware/errorHandler');
const routes = require('./routes');

// Builds and returns the configured Express application. It deliberately does NOT
// call app.listen() or open a database connection — server.js owns the process
// lifecycle, and tests (supertest) can import this app directly.
const app = express();

// Trust the first proxy hop (Cloud Run / load balancer) so client IPs and
// rate limiting work correctly behind a reverse proxy.
app.set('trust proxy', 1);

// ── Security & CORS ──────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin:
      process.env.NODE_ENV === 'production'
        ? (process.env.CORS_ORIGINS || '').split(',').filter(Boolean)
        : '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ── Body Parsing ─────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Request Logging (winston) ────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.http(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

// ── Rate Limiting ────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 min
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  // Only enforce in production. The portals poll (queue auto-refresh) and the
  // citizen app fetches per report, so the limit trips constantly during local
  // testing — dropping submissions and plate searches as 429s.
  skip: () => (process.env.NODE_ENV || 'development') !== 'production',
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api', limiter);

// ── Routes ───────────────────────────────────────────────
app.use('/api/v1', routes);
// Unversioned aliases so the documented /api/* paths work alongside /api/v1/*.
app.use('/api/upload', require('./routes/uploadRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/streets', require('./routes/streetRoutes'));
app.use('/api/vehicles', require('./routes/vehicleRoutes'));

// ── 404 Handler ──────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found.` });
});

// ── Global Error Handler (must be last) ──────────────────
app.use(errorHandler);

module.exports = app;
