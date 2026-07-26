const express = require('express');
const router = express.Router();
const storeController = require('../controllers/storeController');

router.get('/branding', storeController.getPublicStoreBranding);
router.get('/delivery-settings', storeController.getPublicDeliverySettings);
router.get('/announcement', storeController.getPublicAnnouncement);
router.get('/shipping-quote', storeController.getPublicShippingQuote);
router.get('/flash-sale', storeController.getPublicFlashSale);
router.get('/payment-methods', storeController.getPublicPaymentMethods);
router.get('/districts', storeController.getPublicDistricts);

module.exports = router;
