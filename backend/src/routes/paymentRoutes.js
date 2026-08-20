/********************************************************************
 * Project: EonlineBazar
 * File: paymentRoutes.js
 * Location: routes/paymentRoutes.js
 * Author: Abdul Karim Sheikh
 * Description: Public payment surface — the storefront method list, the
 * hosted-checkout initiation call, and the gateway IPN/callback receiver.
 ********************************************************************/

const express = require('express');
const router = express.Router();
const paymentIpnController = require('../controllers/paymentIpnController');

// Gateways post IPN callbacks as form-encoded bodies, which the global
// express.json() parser ignores. Scoped here so no other route's parsing changes.
router.use(express.urlencoded({ extended: false }));

// URL: GET /api/payments/methods — active methods in checkout display order
router.get('/methods', paymentIpnController.getPublicPaymentMethods);

// URL: POST /api/payments/initiate — start a hosted-checkout session
router.post('/initiate', paymentIpnController.initiateGatewayPayment);

// URL: POST|GET /api/payments/ipn/:code — gateway IPN / success-callback target.
// Public by design (the gateway calls it, not the browser); trust comes from
// the provider signature check inside the adapter, never from the caller.
router.post('/ipn/:code', paymentIpnController.handleGatewayIpn);
router.get('/ipn/:code', paymentIpnController.handleGatewayIpn);

module.exports = router;
