const express = require('express');
const router = express.Router();
const storeController = require('../controllers/storeController');

router.get('/branding', storeController.getPublicStoreBranding);

module.exports = router;
