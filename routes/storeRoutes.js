const express = require('express');
const router = express.Router();
const storeController = require('../controllers/storeController');

router.get('/branding', storeController.getPublicStoreBranding);
router.get('/delivery-settings', storeController.getPublicDeliverySettings);
router.get('/districts', storeController.getPublicDistricts);

module.exports = router;
