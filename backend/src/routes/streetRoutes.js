const express = require('express');

const streetController = require('../controllers/streetController');

const router = express.Router();

// Public reference data (no auth) — street picker + per-street violation types.
router.get('/', streetController.list);
router.get('/:streetId/violation-types', streetController.violationTypes);

module.exports = router;
