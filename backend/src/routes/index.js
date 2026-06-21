const express = require('express');

const router = express.Router();

router.get('/health', require('../controllers/healthController').health);

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
