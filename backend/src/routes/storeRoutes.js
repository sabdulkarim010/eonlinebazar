const express = require('express');
const router = express.Router();
const storeController = require('../controllers/storeController');

router.get('/health', storeController.getHealth);
router.get('/branding', storeController.getPublicStoreBranding);
router.get('/delivery-settings', storeController.getPublicDeliverySettings);
router.get('/announcement', storeController.getPublicAnnouncement);
router.get('/shipping-quote', storeController.getPublicShippingQuote);
router.get('/flash-sale', storeController.getPublicFlashSale);
router.get('/payment-methods', storeController.getPublicPaymentMethods);
router.get('/footer-settings', storeController.getPublicFooterSettings);
router.get('/pages/:slug', storeController.getPublicPageContent);
router.get('/districts', storeController.getPublicDistricts);
router.get('/cache-settings', storeController.getPublicCacheSettings);

module.exports = router;
