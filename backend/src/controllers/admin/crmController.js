/********************************************************************
 * Project: EonlineBazar — CRM Automation
 * File: crmController.js
 * Location: backend/src/controllers/admin/crmController.js
 * Description: Admin CRM dashboards — abandoned-cart stats, cart list,
 * and manual recovery notifications (email / SMS).
 ********************************************************************/

const Cart = require('../../models/cart');
const { ABANDON_THRESHOLD_MS } = require('../../jobs/abandonedCartJob');
const { sendAbandonedCartEmail } = require('../../services/mailer');
const { sendSms, isCustomerSmsEnabled } = require('../../services/smsService');

function computeCartValue(items = []) {
    if (!Array.isArray(items)) return 0;
    return items.reduce((sum, item) => {
        const price = Number(item.price) || 0;
        const qty = Math.max(1, Number(item.quantity) || 1);
        return sum + price * qty;
    }, 0);
}

function getStorePublicUrl() {
    return String(process.env.STORE_PUBLIC_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '');
}

function buildCartUrl() {
    const base = getStorePublicUrl();
    return base ? `${base}/cart.html` : '/cart.html';
}

function resolveCustomerPhone(user) {
    return String(user?.phone || user?.mobile || '').trim();
}

function resolveCustomerName(user) {
    if (!user || typeof user !== 'object') return '';
    return String(user.name || user.firstName || '').trim();
}

function mapCartRow(cart) {
    const user = cart.userId && typeof cart.userId === 'object' ? cart.userId : null;
    const itemCount = Array.isArray(cart.items) ? cart.items.length : 0;
    const value = Math.round(computeCartValue(cart.items));

    return {
        userId: user?._id || cart.userId,
        customerName: resolveCustomerName(user) || 'Guest',
        phone: resolveCustomerPhone(user) || '',
        email: String(user?.email || '').trim(),
        itemCount,
        value,
        lastActivityAt: cart.lastActivityAt || cart.updatedAt,
        notified: !!cart.abandonedNotifiedAt,
        notifiedAt: cart.abandonedNotifiedAt || null
    };
}

/**
 * GET /api/admin/crm/abandoned-carts
 * Returns KPI stats plus a filterable cart list.
 * Query: filter=all|notified|not_notified
 */
const getAbandonedCartStats = async (req, res) => {
    try {
        const cutoff = new Date(Date.now() - ABANDON_THRESHOLD_MS);
        const filterParam = String(req.query.filter || 'all').trim().toLowerCase();

        const listFilter = {
            lastActivityAt: { $lt: cutoff },
            'items.0': { $exists: true }
        };

        if (filterParam === 'notified') {
            listFilter.abandonedNotifiedAt = { $ne: null };
        } else if (filterParam === 'not_notified' || filterParam === 'not-notified') {
            listFilter.abandonedNotifiedAt = null;
        }

        const [abandonedCarts, notified, recovered, filteredCarts] = await Promise.all([
            Cart.find({
                lastActivityAt: { $lt: cutoff },
                'items.0': { $exists: true }
            }).select('items').lean(),
            Cart.countDocuments({ abandonedNotifiedAt: { $ne: null } }),
            Cart.countDocuments({
                abandonedNotifiedAt: { $ne: null },
                'items.0': { $exists: false }
            }),
            Cart.find(listFilter)
                .populate('userId', 'firstName lastName name email phone mobile isDeleted')
                .sort({ lastActivityAt: -1 })
                .limit(200)
                .lean()
        ]);

        const count = abandonedCarts.length;
        const value = Math.round(
            abandonedCarts.reduce((sum, cart) => sum + computeCartValue(cart.items), 0)
        );
        const recoveryRate = notified > 0
            ? Math.round((recovered / notified) * 1000) / 10
            : 0;

        const carts = filteredCarts
            .filter((cart) => {
                const user = cart.userId;
                return user && !user.isDeleted;
            })
            .map(mapCartRow);

        res.json({
            success: true,
            data: {
                count,
                value,
                notified,
                recovered,
                recoveryRate,
                carts
            }
        });
    } catch (error) {
        console.error('Abandoned cart stats error:', error);
        res.status(500).json({ success: false, message: 'Failed to load abandoned cart stats' });
    }
};

/**
 * POST /api/admin/crm/abandoned-carts/:userId/notify
 * Body: { channel: 'email' | 'sms' | 'both' }
 */
const notifyAbandonedCart = async (req, res) => {
    try {
        const { userId } = req.params;
        const channel = String(req.body?.channel || 'both').trim().toLowerCase();
        const sendEmail = channel === 'email' || channel === 'both';
        const sendSmsChannel = channel === 'sms' || channel === 'both';

        if (!sendEmail && !sendSmsChannel) {
            return res.status(400).json({ success: false, message: 'channel must be email, sms, or both.' });
        }

        const cutoff = new Date(Date.now() - ABANDON_THRESHOLD_MS);
        const cart = await Cart.findOne({
            userId,
            lastActivityAt: { $lt: cutoff },
            'items.0': { $exists: true }
        })
            .populate('userId', 'firstName lastName name email phone mobile isDeleted')
            .exec();

        if (!cart) {
            return res.status(404).json({ success: false, message: 'No abandoned cart found for this customer.' });
        }

        const user = cart.userId;
        if (!user || user.isDeleted) {
            return res.status(404).json({ success: false, message: 'Customer not found.' });
        }

        const customerName = resolveCustomerName(user);
        const email = String(user.email || '').trim();
        const phone = resolveCustomerPhone(user);
        const cartUrl = buildCartUrl();
        const results = { email: false, sms: false };

        if (sendEmail && email) {
            try {
                const emailResult = await sendAbandonedCartEmail({
                    to: email,
                    customerName,
                    items: cart.items,
                    cartUrl
                });
                results.email = !!emailResult?.delivered;
            } catch (err) {
                console.warn('[CRM] Abandoned cart email failed:', err.message);
            }
        }

        if (sendSmsChannel) {
            const smsEnabled = await isCustomerSmsEnabled();
            if (phone && smsEnabled) {
                try {
                    const smsResult = await sendSms({
                        to: phone,
                        body: `[EonlineBazar] Hi ${customerName || 'there'}! You still have items waiting in your cart. Complete your order: ${cartUrl}`,
                        context: 'ABANDONED CART'
                    });
                    results.sms = !!smsResult?.delivered;
                } catch (err) {
                    console.warn('[CRM] Abandoned cart SMS failed:', err.message);
                }
            }
        }

        if (!results.email && !results.sms) {
            const hint = sendEmail && !email ? 'No email on file.' : '';
            const smsHint = sendSmsChannel && !phone ? ' No phone on file.' : '';
            return res.status(422).json({
                success: false,
                message: `Could not deliver recovery notification.${hint}${smsHint}`.trim()
            });
        }

        await Cart.updateOne({ _id: cart._id }, { $set: { abandonedNotifiedAt: new Date() } });

        res.json({
            success: true,
            message: 'Recovery notification sent.',
            data: results
        });
    } catch (error) {
        console.error('Abandoned cart notify error:', error);
        res.status(500).json({ success: false, message: 'Failed to send recovery notification.' });
    }
};

module.exports = {
    getAbandonedCartStats,
    notifyAbandonedCart
};
