const express = require('express');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'ParkWatch API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

router.use('/auth',          require('./authRoutes'));
router.use('/users',         require('./userRoutes'));
router.use('/barangays',     require('./barangayRoutes'));
router.use('/streets',       require('./streetRoutes'));
router.use('/vehicles',      require('./vehicleRoutes'));
router.use('/reports',       require('./reportRoutes'));
router.use('/notifications', require('./notificationRoutes'));
router.use('/upload',        require('./uploadRoutes'));
router.use('/admin',         require('./adminRoutes'));

module.exports = router;
