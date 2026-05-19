const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'ParkWatch API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// Uncomment as you build each module:
// router.use('/auth',          require('./auth.routes'));
// router.use('/reports',       require('./report.routes'));
// router.use('/vehicles',      require('./vehicle.routes'));
// router.use('/barangays',     require('./barangay.routes'));
// router.use('/streets',       require('./street.routes'));
// router.use('/users',         require('./user.routes'));
// router.use('/penalties',     require('./penalty.routes'));
// router.use('/notifications', require('./notification.routes'));

module.exports = router;
