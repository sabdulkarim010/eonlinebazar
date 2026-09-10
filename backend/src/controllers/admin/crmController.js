/********************************************************************
 * Project: EonlineBazar — CRM Automation
 * File: crmController.js
 * Location: backend/src/controllers/admin/crmController.js
 * Description: Admin CRM dashboards. Currently surfaces abandoned-cart
 * metrics (open count, recoverable value, recovery rate) computed from
 * the Cart collection's lastActivityAt / abandonedNotifiedAt fields.
 ********************************************************************/

const Cart = require('../../models/cart');
const { ABANDON_THRESHOLD_MS } = require('../../jobs/abandonedCartJob');

function computeCartValue(items = []) {
    if (!Array.isArray(items)) return 0;
    return items.reduce((sum, item) => {
        const price = Number(item.price) || 0;
        const qty = Math.max(1, Number(item.quantity) || 1);
        return sum + price * qty;
    }, 0);
}

/**
 * GET /api/admin/crm/abandoned-carts
 * Returns: { count, value, recoveryRate, notified, recovered }
 *   - count:        carts idle 24h+ that still hold items (currently abandoned)
 *   - value:        total merchandise value sitting in those carts
 *   - notified:     carts a recovery message has already been sent for
 *   - recovered:    notified carts that were later emptied (proxy for conversion)
 *   - recoveryRate: recovered / notified as a percentage
 */
const getAbandonedCartStats = async (req, res) => {
    try {
        const cutoff = new Date(Date.now() - ABANDON_THRESHOLD_MS);

        const [abandonedCarts, notified, recovered] = await Promise.all([
            Cart.find({
                lastActivityAt: { $lt: cutoff },
                'items.0': { $exists: true }
            }).select('items').lean(),
            Cart.countDocuments({ abandonedNotifiedAt: { $ne: null } }),
            Cart.countDocuments({
                abandonedNotifiedAt: { $ne: null },
                'items.0': { $exists: false }
            })
        ]);

        const count = abandonedCarts.length;
        const value = Math.round(
            abandonedCarts.reduce((sum, cart) => sum + computeCartValue(cart.items), 0)
        );
        const recoveryRate = notified > 0
            ? Math.round((recovered / notified) * 1000) / 10
            : 0;

        res.json({
            success: true,
            data: {
                count,
                value,
                notified,
                recovered,
                recoveryRate
            }
        });
    } catch (error) {
        console.error('Abandoned cart stats error:', error);
        res.status(500).json({ success: false, message: 'Failed to load abandoned cart stats' });
    }
};

module.exports = {
    getAbandonedCartStats
};
