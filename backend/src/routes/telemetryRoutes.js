const express = require('express');
const router = express.Router();
const { ingestClientErrors } = require('../controllers/telemetryController');

router.post('/errors', ingestClientErrors);

module.exports = router;
