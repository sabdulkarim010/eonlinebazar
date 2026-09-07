const express = require('express');
const { authMiddleware } = require('../middleware/auth.middleware');
const { fetchOrderById } = require('../services/storeProfile.service');

const router = express.Router();

/**
 * GET /api/orders/:order_id
 * Proxy/lookup for CustomerContext panel via main store internal API.
 */
router.get('/:order_id', authMiddleware, async (req, res) => {
  try {
    const { order_id } = req.params;

    if (!process.env.MAIN_STORE_API_URL) {
      return res.status(503).json({
        success: false,
        message:
          'Order lookup unavailable — set MAIN_STORE_API_URL to enable proxy',
      });
    }

    const order = await fetchOrderById(order_id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    return res.json({ success: true, order });
  } catch (err) {
    console.error('[GET /api/orders/:order_id]', err.message);
    return res.status(500).json({ message: 'Order fetch failed' });
  }
});

module.exports = router;
