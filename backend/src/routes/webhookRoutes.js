/********************************************************************
 * Project: EonlineBazar
 * File: webhookRoutes.js
 * Location: routes/webhookRoutes.js
 * Description: Public webhook listeners for courier status sync.
 ********************************************************************/

const express = require('express');
const router = express.Router();
const {
    handleSteadfastWebhook,
    handlePathaoWebhook,
    handleRedxWebhook
} = require('../controllers/webhook/courierWebhookController');

router.post('/courier/steadfast', handleSteadfastWebhook);
router.post('/courier/pathao', handlePathaoWebhook);
router.post('/courier/redx', handleRedxWebhook);

module.exports = router;
