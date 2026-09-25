/********************************************************************
 * Project: EonlineBazar — CRM Automation
 * File: crmController.js
 * Location: backend/src/controllers/admin/crmController.js
 * Description: Admin CRM dashboards — abandoned-cart stats, cart list,
 * and manual recovery notifications (email / SMS).
 ********************************************************************/

const mongoose = require('mongoose');
const Cart = require('../../models/cart');
const { ABANDON_THRESHOLD_MS } = require('../../jobs/abandonedCartJob');
const { sendAbandonedCartEmail } = require('../../services/mailer');
const { sendSms, isCustomerSmsEnabled } = require('../../services/smsService');
const { routedRead } = require('../../services/readRouter');
const { buildCartRecoveryUrl } = require('../../services/cartRestoreService');
const {
    getRfmSegmentDistribution,
    recalculateAllCustomerRfm
} = require('../../services/rfmSegmentationService');
const prisma = require('../../config/prismaClient');

const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 100;

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

function buildCartUrl(cartId) {
    if (cartId) {
        return buildCartRecoveryUrl(cartId).restoreUrl;
    }
    const base = getStorePublicUrl();
    return base ? `${base}/cart.html` : '/cart.html';
}

function resolveCustomerPhone(user) {
    return String(user?.phone || user?.mobile || '').trim();
}

function resolveCustomerName(user) {
    if (!user || typeof user !== 'object') return '';
    const fromParts = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    if (fromParts) return fromParts;
    return String(user.name || '').trim();
}

function parseListPagination(query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(
        MAX_LIST_LIMIT,
        Math.max(1, parseInt(query.limit, 10) || DEFAULT_LIST_LIMIT)
    );
    const skip = (page - 1) * limit;
    return { page, limit, skip };
}

function resolveRecoveryStageLabel(stage) {
    const n = Number(stage) || 0;
    if (n >= 3) return 'Stage 3 — Expiry Notice';
    if (n === 2) return 'Stage 2 — Email + 5% Coupon';
    if (n === 1) return 'Stage 1 — SMS/WhatsApp';
    return 'Not started';
}

function mapCartRow(cart) {
    const user = cart.userId && typeof cart.userId === 'object' ? cart.userId : null;
    const itemCount = Array.isArray(cart.items) ? cart.items.length : 0;
    const value = Math.round(computeCartValue(cart.items));
    const cartId = cart._id || cart.mongoCartId || cart.legacyId || null;
    const recoveryStage = Number(cart.recoveryStage) || 0;
    let restoreUrl = '';
    if (cartId) {
        try {
            restoreUrl = buildCartRecoveryUrl(cartId).restoreUrl;
        } catch (_err) {
            restoreUrl = buildCartUrl(cartId);
        }
    }

    return {
        cartId: cartId ? String(cartId) : null,
        userId: user?._id || cart.userId,
        customerName: resolveCustomerName(user) || 'Guest',
        phone: resolveCustomerPhone(user) || '',
        email: String(user?.email || '').trim(),
        itemCount,
        value,
        lastActivityAt: cart.lastActivityAt || cart.updatedAt,
        notified: !!cart.abandonedNotifiedAt,
        notifiedAt: cart.abandonedNotifiedAt || null,
        recoveryStage,
        recoveryStageLabel: resolveRecoveryStageLabel(recoveryStage),
        recoveryCouponCode: cart.recoveryCouponCode || null,
        restoreUrl
    };
}

function mapPgCartRow(cart) {
    const user = cart.user;
    const items = (cart.items || []).map((item) => ({
        price: Number(item.price),
        quantity: item.quantity
    }));

    return mapCartRow({
        _id: cart.legacyId || cart.id,
        userId: user
            ? {
                _id: user.legacyId || user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: user.phone,
                mobile: user.mobile,
                isDeleted: user.isDeleted
            }
            : cart.userId,
        items,
        lastActivityAt: cart.lastActivityAt,
        abandonedNotifiedAt: cart.abandonedNotifiedAt,
        updatedAt: cart.updatedAt,
        recoveryStage: cart.recoveryStage,
        recoveryCouponCode: cart.recoveryCouponCode
    });
}

function buildPgAbandonedBaseWhere(cutoff) {
    return {
        lastActivityAt: { lt: cutoff },
        items: { some: {} }
    };
}

function buildPgListFilter(cutoff, filterParam) {
    const where = buildPgAbandonedBaseWhere(cutoff);

    if (filterParam === 'notified') {
        where.abandonedNotifiedAt = { not: null };
    } else if (filterParam === 'not_notified' || filterParam === 'not-notified') {
        where.abandonedNotifiedAt = null;
    }

    return where;
}

function buildMongoAbandonedBaseFilter(cutoff) {
    return {
        lastActivityAt: { $lt: cutoff },
        'items.0': { $exists: true }
    };
}

function buildMongoListFilter(cutoff, filterParam) {
    const listFilter = buildMongoAbandonedBaseFilter(cutoff);

    if (filterParam === 'notified') {
        listFilter.abandonedNotifiedAt = { $ne: null };
    } else if (filterParam === 'not_notified' || filterParam === 'not-notified') {
        listFilter.abandonedNotifiedAt = null;
    }

    return listFilter;
}

async function aggregateMongoAbandonedValue(cutoff) {
    const baseFilter = buildMongoAbandonedBaseFilter(cutoff);
    const result = await Cart.aggregate([
        { $match: baseFilter },
        { $unwind: '$items' },
        {
            $group: {
                _id: null,
                total: {
                    $sum: {
                        $multiply: [
                            { $ifNull: ['$items.price', 0] },
                            { $max: [1, { $ifNull: ['$items.quantity', 1] }] }
                        ]
                    }
                }
            }
        }
    ]);

    return Math.round(Number(result[0]?.total) || 0);
}

async function aggregatePgAbandonedValue(cutoff) {
    const rows = await prisma.$queryRaw`
        SELECT COALESCE(SUM(ci.price * ci.quantity), 0)::float AS total
        FROM cart_items ci
        INNER JOIN carts c ON c.id = ci."cartId"
        WHERE c."lastActivityAt" < ${cutoff}
    `;
    return Math.round(Number(rows[0]?.total) || 0);
}

async function loadAbandonedCartStatsFromPG(cutoff, filterParam, pagination) {
    const baseWhere = buildPgAbandonedBaseWhere(cutoff);
    const listFilter = buildPgListFilter(cutoff, filterParam);
    const { skip, limit, page } = pagination;

    const [count, value, notified, recovered, listTotal, filteredCarts] = await Promise.all([
        prisma.cart.count({ where: baseWhere }),
        aggregatePgAbandonedValue(cutoff),
        prisma.cart.count({
            where: { abandonedNotifiedAt: { not: null } }
        }),
        prisma.cart.count({
            where: {
                abandonedNotifiedAt: { not: null },
                items: { none: {} }
            }
        }),
        prisma.cart.count({ where: listFilter }),
        prisma.cart.findMany({
            where: listFilter,
            include: {
                user: {
                    select: {
                        legacyId: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        phone: true,
                        mobile: true,
                        isDeleted: true
                    }
                },
                items: { select: { price: true, quantity: true } }
            },
            orderBy: { lastActivityAt: 'desc' },
            skip,
            take: limit
        })
    ]);

    return {
        source: 'pg',
        count,
        value,
        notified,
        recovered,
        listTotal,
        filteredCarts,
        page,
        limit
    };
}

async function loadAbandonedCartStatsFromMongo(cutoff, filterParam, pagination) {
    const baseFilter = buildMongoAbandonedBaseFilter(cutoff);
    const listFilter = buildMongoListFilter(cutoff, filterParam);
    const { skip, limit, page } = pagination;

    const [count, value, notified, recovered, listTotal, filteredCarts] = await Promise.all([
        Cart.countDocuments(baseFilter),
        aggregateMongoAbandonedValue(cutoff),
        Cart.countDocuments({ abandonedNotifiedAt: { $ne: null } }),
        Cart.countDocuments({
            abandonedNotifiedAt: { $ne: null },
            'items.0': { $exists: false }
        }),
        Cart.countDocuments(listFilter),
        Cart.find(listFilter)
            .populate('userId', 'firstName lastName name email phone mobile isDeleted')
            .sort({ lastActivityAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean()
    ]);

    return {
        source: 'mongo',
        count,
        value,
        notified,
        recovered,
        listTotal,
        filteredCarts,
        page,
        limit
    };
}

async function loadAbandonedCartStatsPayload(cutoff, filterParam, pagination) {
    return routedRead(
        'crm',
        () => loadAbandonedCartStatsFromMongo(cutoff, filterParam, pagination),
        () => loadAbandonedCartStatsFromPG(cutoff, filterParam, pagination)
    );
}

function buildPgUserLookupWhere(userId) {
    const ref = String(userId || '').trim();
    if (!ref) return null;
    if (mongoose.Types.ObjectId.isValid(ref)) {
        return { OR: [{ legacyId: ref }, { id: ref }] };
    }
    return { legacyId: ref };
}

async function findAbandonedCartForNotify(userId, cutoff) {
    return routedRead(
        'crm',
        async () => {
            const cart = await Cart.findOne({
                userId,
                lastActivityAt: { $lt: cutoff },
                'items.0': { $exists: true }
            })
                .populate('userId', 'firstName lastName name email phone mobile isDeleted')
                .lean();

            if (!cart) return null;

            const user = cart.userId && typeof cart.userId === 'object' ? cart.userId : null;
            if (!user || user.isDeleted) return null;

            return {
                source: 'mongo',
                mongoCartId: cart._id,
                pgCartId: null,
                items: cart.items,
                user
            };
        },
        async () => {
            const userWhere = buildPgUserLookupWhere(userId);
            if (!userWhere) return null;

            const cart = await prisma.cart.findFirst({
                where: {
                    lastActivityAt: { lt: cutoff },
                    items: { some: {} },
                    user: userWhere
                },
                include: {
                    user: {
                        select: {
                            legacyId: true,
                            firstName: true,
                            lastName: true,
                            email: true,
                            phone: true,
                            mobile: true,
                            isDeleted: true
                        }
                    },
                    items: {
                        select: {
                            name: true,
                            price: true,
                            quantity: true,
                            image: true
                        }
                    }
                },
                orderBy: { lastActivityAt: 'desc' }
            });

            if (!cart || !cart.user || cart.user.isDeleted) return null;

            return {
                source: 'pg',
                mongoCartId: cart.legacyId || null,
                pgCartId: cart.id,
                items: (cart.items || []).map((item) => ({
                    name: item.name,
                    price: Number(item.price),
                    quantity: item.quantity,
                    image: item.image
                })),
                user: {
                    _id: cart.user.legacyId || cart.userId,
                    firstName: cart.user.firstName,
                    lastName: cart.user.lastName,
                    email: cart.user.email,
                    phone: cart.user.phone,
                    mobile: cart.user.mobile,
                    isDeleted: cart.user.isDeleted
                }
            };
        }
    );
}

async function stampAbandonedNotifiedAt(cartRef, userId) {
    const now = new Date();

    if (cartRef?.mongoCartId) {
        await Cart.updateOne(
            { _id: cartRef.mongoCartId },
            { $set: { abandonedNotifiedAt: now } }
        );
    } else if (userId) {
        await Cart.updateOne(
            {
                userId,
                'items.0': { $exists: true }
            },
            { $set: { abandonedNotifiedAt: now } }
        );
    }

    if (!cartRef?.pgCartId) return;

    try {
        await prisma.cart.update({
            where: { id: cartRef.pgCartId },
            data: { abandonedNotifiedAt: now }
        });
    } catch (err) {
        console.warn('[CRM] PG abandonedNotifiedAt mirror failed:', err.message);
    }
}

/**
 * GET /api/admin/crm/abandoned-carts
 * Returns KPI stats plus a filterable cart list.
 * Query: filter=all|notified|not_notified, page, limit (max 100)
 */
const getAbandonedCartStats = async (req, res) => {
    try {
        const cutoff = new Date(Date.now() - ABANDON_THRESHOLD_MS);
        const filterParam = String(req.query.filter || 'all').trim().toLowerCase();
        const pagination = parseListPagination(req.query);

        const payload = await loadAbandonedCartStatsPayload(cutoff, filterParam, pagination);
        const usePg = payload.source === 'pg';

        const recoveryRate = payload.notified > 0
            ? Math.round((payload.recovered / payload.notified) * 1000) / 10
            : 0;

        const carts = (payload.filteredCarts || [])
            .filter((cart) => {
                const user = usePg ? cart.user : cart.userId;
                return user && !user.isDeleted;
            })
            .map((cart) => (usePg ? mapPgCartRow(cart) : mapCartRow(cart)));

        res.json({
            success: true,
            data: {
                count: payload.count,
                value: payload.value,
                notified: payload.notified,
                recovered: payload.recovered,
                recoveryRate,
                carts,
                pagination: {
                    page: payload.page,
                    limit: payload.limit,
                    total: payload.listTotal,
                    totalPages: payload.listTotal > 0
                        ? Math.ceil(payload.listTotal / payload.limit)
                        : 0
                }
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
        const cartRef = await findAbandonedCartForNotify(userId, cutoff);

        if (!cartRef) {
            return res.status(404).json({ success: false, message: 'No abandoned cart found for this customer.' });
        }

        const user = cartRef.user;
        const customerName = resolveCustomerName(user);
        const email = String(user.email || '').trim();
        const phone = resolveCustomerPhone(user);
        const restoreCartId = cartRef.mongoCartId || cartRef.user?._id;
        const cartUrl = buildCartUrl(restoreCartId);
        const results = { email: false, sms: false };

        if (sendEmail && email) {
            try {
                const emailResult = await sendAbandonedCartEmail({
                    to: email,
                    customerName,
                    items: cartRef.items,
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

        await stampAbandonedNotifiedAt(cartRef, userId);

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

const getRfmSegments = async (req, res) => {
    try {
        const monetaryHigh = Number(req.query.monetaryHigh) || undefined;
        const data = await getRfmSegmentDistribution(monetaryHigh);
        res.json({ success: true, data });
    } catch (error) {
        console.error('RFM segment distribution error:', error);
        res.status(500).json({ success: false, message: 'Failed to load RFM segments.' });
    }
};

const recalculateRfmSegments = async (req, res) => {
    try {
        const monetaryHigh = Number(req.body?.monetaryHigh) || undefined;
        const data = await recalculateAllCustomerRfm({ monetaryHigh });
        res.json({
            success: true,
            message: `RFM tags recalculated for ${data.updated} customer(s).`,
            data
        });
    } catch (error) {
        console.error('RFM recalculate error:', error);
        res.status(500).json({ success: false, message: 'Failed to recalculate RFM segments.' });
    }
};

module.exports = {
    getAbandonedCartStats,
    notifyAbandonedCart,
    getRfmSegments,
    recalculateRfmSegments,
    // Exported for unit tests — do not use from routes.
    loadAbandonedCartStatsPayload,
    aggregateMongoAbandonedValue,
    aggregatePgAbandonedValue,
    parseListPagination
};
