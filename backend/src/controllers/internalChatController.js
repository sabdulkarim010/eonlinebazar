/**
 * Internal endpoints consumed by the ecommerce-chat microservice.
 * Protected by verifyInternalService (INTERNAL_API_KEY).
 */

const User = require('../models/user');
const Order = require('../models/order');
const Admin = require('../models/admin');
const { enrichOrderItemsWithImages } = require('../utils/orderItemImages');

function hydrateCustomerName(customer = {}) {
    const fromParts = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim();
    const legacy = customer.name ? String(customer.name).trim() : '';
    return fromParts || legacy || 'Customer';
}

function pickDefaultAddress(addresses = []) {
    if (!Array.isArray(addresses) || !addresses.length) return null;
    return addresses.find((a) => a && a.isDefault) || addresses[0];
}

function formatAddressSnapshot(addr) {
    if (!addr) return null;
    const parts = [addr.fullAddress, addr.upazilaOrThana, addr.district].filter(Boolean);
    return {
        label: addr.label || 'Home',
        fullAddress: addr.fullAddress || '',
        upazilaOrThana: addr.upazilaOrThana || '',
        district: addr.district || '',
        phone: addr.phone || '',
        formatted: parts.join(', '),
    };
}

function buildChatProfile(customer) {
    const avatarUrl = customer.avatarUrl || customer.avatar || null;
    const defaultAddress = pickDefaultAddress(customer.addresses);
    return {
        user_id: String(customer._id),
        name: hydrateCustomerName(customer),
        email: customer.email || null,
        mobile: customer.mobile || customer.phone || null,
        avatar: customer.avatar || avatarUrl || '',
        avatarUrl,
        image: avatarUrl,
        profilePic: avatarUrl,
        defaultAddress: formatAddressSnapshot(defaultAddress),
    };
}

const getInternalCustomerProfile = async (req, res) => {
    try {
        const customer = await User.findById(req.params.id).select('-password').lean();
        if (!customer) {
            return res.status(404).json({ success: false, message: 'Customer not found.' });
        }

        const orderCount = await Order.countDocuments({ user: customer._id });

        return res.status(200).json({
            success: true,
            data: {
                ...buildChatProfile(customer),
                orderCount,
            },
        });
    } catch (error) {
        console.error('[internal] getInternalCustomerProfile:', error);
        return res.status(500).json({ success: false, message: 'Server error.' });
    }
};

const getInternalCustomerOrders = async (req, res) => {
    try {
        const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 5));
        const customer = await User.findById(req.params.id).select('firstName lastName email mobile').lean();
        if (!customer) {
            return res.status(404).json({ success: false, message: 'Customer not found.' });
        }

        const orders = await Order.find({ user: req.params.id })
            .sort({ createdAt: -1 })
            .limit(limit)
            .select('orderId status grandTotal total createdAt items')
            .lean();

        const normalized = orders.map((order) => ({
            _id: order._id,
            orderId: order.orderId || String(order._id).slice(-6).toUpperCase(),
            status: order.status,
            grandTotal: order.grandTotal ?? order.total ?? 0,
            total: order.grandTotal ?? order.total ?? 0,
            createdAt: order.createdAt,
            itemCount: Array.isArray(order.items) ? order.items.length : 0,
        }));

        return res.status(200).json({
            success: true,
            customer: {
                id: customer._id,
                name: hydrateCustomerName(customer),
                email: customer.email,
                mobile: customer.mobile,
            },
            orders: normalized,
        });
    } catch (error) {
        console.error('[internal] getInternalCustomerOrders:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch order history.' });
    }
};

const getInternalOrderById = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        const orderObj = order.toObject();
        await enrichOrderItemsWithImages(orderObj);

        return res.json({ success: true, data: orderObj, order: orderObj });
    } catch (err) {
        console.error('[internal] getInternalOrderById:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/** PUT /api/internal/admins/:id/image — chat service sync for Admin.image */
const updateInternalAdminImage = async (req, res) => {
    try {
        const image = req.body?.image || req.body?.avatar;
        if (!image || !String(image).trim()) {
            return res.status(400).json({
                success: false,
                message: 'image URL is required',
            });
        }

        const admin = await Admin.findByIdAndUpdate(
            req.params.id,
            { image: String(image).trim() },
            { new: true }
        ).select('-password');

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found.',
            });
        }

        return res.status(200).json({
            success: true,
            image: admin.image || null,
        });
    } catch (error) {
        console.error('[internal] updateInternalAdminImage:', error);
        return res.status(500).json({ success: false, message: 'Server error.' });
    }
};

module.exports = {
    getInternalCustomerProfile,
    getInternalCustomerOrders,
    getInternalOrderById,
    updateInternalAdminImage,
};
