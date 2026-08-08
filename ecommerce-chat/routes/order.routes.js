const express = require('express');
const { authMiddleware } = require('../middleware/auth.middleware');

const router = express.Router();

/**
 * GET /api/orders/:order_id
 * Proxy/lookup for CustomerContext panel.
 * Prefer MAIN_STORE_API_URL when configured; otherwise return a clear error.
 */
router.get('/:order_id', authMiddleware, async (req, res) => {
  try {
    const { order_id } = req.params;
    const baseUrl = process.env.MAIN_STORE_API_URL;

    if (!baseUrl) {
      return res.status(503).json({
        success: false,
        message:
          'Order lookup unavailable — set MAIN_STORE_API_URL to enable proxy',
      });
    }

    const headers = {
      Accept: 'application/json',
    };
    if (process.env.INTERNAL_API_KEY) {
      headers.Authorization = `Bearer ${process.env.INTERNAL_API_KEY}`;
    }

    const response = await fetch(
      `${baseUrl.replace(/\/$/, '')}/api/orders/${encodeURIComponent(order_id)}`,
      { headers }
    );

    const order = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: order?.message || 'Order fetch failed',
        order,
      });
    }

    return res.json({ success: true, order: order?.data || order?.order || order });
  } catch (err) {
    console.error('[GET /api/orders/:order_id]', err.message);
    return res.status(500).json({ message: 'Order fetch failed' });
  }
});

module.exports = router;
