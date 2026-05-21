const express = require('express');

const router = express.Router();

// Liveness/health probe — used by Cloud Run and the docker-compose healthcheck.
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'ParkWatch API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// Domain routers. Each is an empty stub for Sprint 1 — endpoints are added per sprint.
router.use('/auth', require('./authRoutes'));
router.use('/users', require('./userRoutes'));
router.use('/barangays', require('./barangayRoutes'));
router.use('/vehicles', require('./vehicleRoutes'));
router.use('/reports', require('./reportRoutes'));
router.use('/notifications', require('./notificationRoutes'));

module.exports = router;
