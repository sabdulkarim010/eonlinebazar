/**
 * EonlineBazar — Customer Admin Controller
 * Extracted from: controllers/adminController.js
 * Routes that use this: routes/adminRoutes.js
 *
 * When adding new endpoints:
 * 1. Add handler here
 * 2. Export from barrel (original controller file)
 * 3. Add route in routes/[file].routes.js
 */

const User = require('../../models/user');
const Order = require('../../models/order');
const UserSession = require('../../models/userSession');
const Setting = require('../../models/Setting');
const cloudinary = require('cloudinary').v2;
const sharp = require('sharp');
const { logSecurityEvent, getClientIp } = require('../../utils/securityLogger');

const VIP_DEFAULTS = {
    vipMinTotalSpent: 10000,
    vipMinOrderCount: 5,
    frequentBuyerMinOrders: 3
};

function resolveCustomerSegment(userStats = {}, thresholds = VIP_DEFAULTS) {
    const orderCount = Number(userStats.orderCount) || 0;
    const totalSpent = Number(userStats.totalSpent) || 0;
    const vipMinSpent = Number(thresholds.vipMinTotalSpent ?? VIP_DEFAULTS.vipMinTotalSpent);
    const vipMinOrders = Number(thresholds.vipMinOrderCount ?? VIP_DEFAULTS.vipMinOrderCount);
    const frequentMin = Number(thresholds.frequentBuyerMinOrders ?? VIP_DEFAULTS.frequentBuyerMinOrders);

    const isVip = totalSpent >= vipMinSpent || orderCount >= vipMinOrders;
    const isFrequent = !isVip && orderCount >= frequentMin;
    const isInactive = orderCount === 0;

    let segment = 'all';
    if (isInactive) segment = 'inactive';
    else if (isVip) segment = 'vip';
    else if (isFrequent) segment = 'frequent';

    return {
        orderCount,
        totalSpent,
        segment,
        isVip,
        isFrequentBuyer: isFrequent,
        isInactive
    };
}

function hydrateCustomerName(customer = {}) {
    const fromParts = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim();
    const legacy = customer.name ? String(customer.name).trim() : '';
    return fromParts || legacy || 'N/A';
}

function getCustomerAvatarFields(user = {}) {
    return {
        avatar: user.avatar || '',
        avatarUrl: user.avatarUrl || user.avatar || null,
        avatarPublicId: user.avatarPublicId || ''
    };
}

function isAvatarClearPayload(body = {}) {
    if (body.clear === true || body.clear === 'true' || body.remove === true || body.remove === 'true') {
        return true;
    }
    if (!Object.prototype.hasOwnProperty.call(body, 'avatar')) return false;
    const value = body.avatar;
    return value === null || value === '' || value === 'null' || value === undefined;
}

function cloudinaryPublicIdFromUrl(url = '') {
    const match = String(url).match(/\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+(?:\?.*)?$/);
    return match ? match[1] : '';
}

async function destroyStoredCustomerAvatar(user) {
    const publicId = String(user?.avatarPublicId || '').trim()
        || cloudinaryPublicIdFromUrl(user?.avatar || user?.avatarUrl || '');
    if (!publicId) return;
    try {
        await cloudinary.uploader.destroy(publicId);
    } catch (err) {
        console.error('Customer avatar Cloudinary delete error:', err);
    }
}

function uploadBufferToCloudinary(buffer, folder) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error, result) => {
            if (settled) return;
            settled = true;
            if (error) reject(error);
            else resolve(result);
        };

        const stream = cloudinary.uploader.upload_stream(
            { folder },
            (error, result) => finish(error, result)
        );

        if (stream && typeof stream.end === 'function') {
            stream.end(buffer);
            return;
        }

        if (!settled) {
            finish(new Error('Cloudinary upload stream is unavailable.'));
        }
    });
}

function serializeCustomerAvatarResponse(user) {
    const fields = getCustomerAvatarFields(user);
    return {
        _id: user._id,
        name: hydrateCustomerName(user),
        ...fields
    };
}

// ==============================================================
// ১. কাস্টমারদের তালিকা নিয়ে আসার ফাংশন 
// ==============================================================
const getAllCustomers = async (req, res) => {
    try {
        const [customers, orderStats, masterSettings] = await Promise.all([
            User.find({}).select('-password').sort({ createdAt: -1 }).lean(),
            Order.aggregate([
                {
                    $match: {
                        user: { $ne: null },
                        status: { $nin: ['Cancelled', 'Canceled'] }
                    }
                },
                {
                    $group: {
                        _id: '$user',
                        orderCount: { $sum: 1 },
                        totalSpent: {
                            $sum: {
                                $add: [
                                    { $ifNull: ['$grandTotal', 0] },
                                    { $ifNull: ['$walletApplied', 0] }
                                ]
                            }
                        }
                    }
                }
            ]),
            Setting.getOrCreate()
        ]);

        const statsMap = new Map(
            orderStats.map((row) => [String(row._id), {
                orderCount: row.orderCount || 0,
                totalSpent: Math.round(Number(row.totalSpent) || 0)
            }])
        );

        const thresholds = {
            vipMinTotalSpent: masterSettings.vipMinTotalSpent,
            vipMinOrderCount: masterSettings.vipMinOrderCount,
            frequentBuyerMinOrders: masterSettings.frequentBuyerMinOrders
        };

        const enriched = customers.map((customer) => {
            const stats = statsMap.get(String(customer._id)) || { orderCount: 0, totalSpent: 0 };
            const segmentMeta = resolveCustomerSegment(stats, thresholds);
            return {
                ...customer,
                name: hydrateCustomerName(customer),
                orderCount: segmentMeta.orderCount,
                totalSpent: segmentMeta.totalSpent,
                segment: segmentMeta.segment,
                isVip: segmentMeta.isVip,
                isFrequentBuyer: segmentMeta.isFrequentBuyer,
                isInactive: segmentMeta.isInactive
            };
        });

        res.status(200).json({
            success: true,
            customers: enriched,
            segmentThresholds: thresholds
        });
    } catch (error) {
        console.error("🔴 কাস্টমার ডাটা ফেচ করতে এরর:", error);
        res.status(500).json({ success: false, message: 'সার্ভার এরর।' });
    }
};

// ==============================================================
// ৫. নির্দিষ্ট কাস্টমারের প্রোফাইল দেখা (অ্যাডমিন)
// ==============================================================
const getCustomerById = async (req, res) => {
    try {
        const customer = await User.findById(req.params.id).select('-password').lean();
        if (!customer) {
            return res.status(404).json({ success: false, message: 'Customer not found.' });
        }
        const orderCount = await Order.countDocuments({ user: customer._id });
        res.status(200).json({
            success: true,
            data: {
                ...customer,
                name: hydrateCustomerName(customer),
                orderCount
            }
        });
    } catch (error) {
        console.error('Get Customer Error:', error);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// ==============================================================
// ৬. কাস্টমার প্রোফাইল আপডেট (অ্যাডমিন)
// ==============================================================
const updateCustomer = async (req, res) => {
    try {
        const {
            name,
            firstName,
            lastName,
            email,
            mobile,
            phone,
            address,
            district,
            upazila,
            thana,
            fullAddress,
            isVerified
        } = req.body;
        const updateFields = {};

        if (firstName !== undefined) updateFields.firstName = String(firstName).trim();
        if (lastName !== undefined) updateFields.lastName = String(lastName).trim();
        if (name !== undefined && firstName === undefined && lastName === undefined) {
            const trimmed = String(name).trim();
            if (!trimmed) {
                return res.status(400).json({ success: false, message: 'Full name is required.' });
            }
            const parts = trimmed.split(/\s+/).filter(Boolean);
            updateFields.firstName = parts[0] || trimmed;
            updateFields.lastName = parts.length > 1 ? parts.slice(1).join(' ') : trimmed;
        }
        if (email !== undefined) updateFields.email = String(email).trim().toLowerCase();
        if (mobile !== undefined) {
            const normalizedMobile = String(mobile).replace(/\D/g, '');
            if (normalizedMobile && !/^01[3-9]\d{8}$/.test(normalizedMobile)) {
                return res.status(400).json({
                    success: false,
                    message: 'Mobile must be a valid 11-digit Bangladeshi number.'
                });
            }
            updateFields.mobile = normalizedMobile || String(mobile).trim();
        }
        if (phone !== undefined) updateFields.phone = String(phone).trim();
        if (district !== undefined) updateFields.district = String(district).trim();
        if (upazila !== undefined) updateFields.upazila = String(upazila).trim();
        if (thana !== undefined) {
            updateFields.thana = String(thana).trim();
        } else if (upazila !== undefined) {
            updateFields.thana = String(upazila).trim();
        }
        if (fullAddress !== undefined) updateFields.fullAddress = String(fullAddress).trim();

        const existingUser = await User.findById(req.params.id).select('district upazila thana fullAddress address').lean();
        if (!existingUser) {
            return res.status(404).json({ success: false, message: 'Customer not found.' });
        }

        const resolvedDistrict = updateFields.district ?? existingUser.district;
        const resolvedUpazila = updateFields.upazila ?? updateFields.thana ?? existingUser.upazila ?? existingUser.thana;
        const resolvedFullAddress = updateFields.fullAddress ?? existingUser.fullAddress;

        if (district !== undefined || upazila !== undefined || thana !== undefined || fullAddress !== undefined) {
            const parts = [resolvedFullAddress, resolvedUpazila, resolvedDistrict].filter(Boolean);
            updateFields.address = parts.join(', ');
        } else if (address !== undefined) {
            updateFields.address = String(address).trim();
        }

        if (isVerified !== undefined) updateFields.isVerified = !!isVerified;

        const updated = await User.findByIdAndUpdate(
            req.params.id,
            { $set: updateFields },
            { new: true, runValidators: true }
        ).select('-password');

        if (!updated) {
            return res.status(404).json({ success: false, message: 'Customer not found.' });
        }

        await logSecurityEvent({
            action: 'Customer Profile Updated',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `Customer ${updated.email || updated._id} profile edited by admin`
        });

        res.status(200).json({ success: true, message: 'Customer updated successfully.', data: updated });
    } catch (error) {
        console.error('Update Customer Error:', error);
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Email already in use by another account.' });
        }
        res.status(500).json({ success: false, message: 'Failed to update customer.' });
    }
};

// ==============================================================
// ৬ক. কাস্টমার প্রোফাইল ছবি আপলোড / ক্লিয়ার (অ্যাডমিন)
// ==============================================================
const updateCustomerAvatar = async (req, res) => {
    try {
        const customer = await User.findById(req.params.id).select('-password');
        if (!customer) {
            return res.status(404).json({ success: false, message: 'Customer not found.' });
        }

        if (!req.file) {
            if (isAvatarClearPayload(req.body || {})) {
                return clearCustomerAvatarRecord(req, res, customer);
            }
            return res.status(400).json({ success: false, message: 'No image file provided.' });
        }

        const compressedBuffer = await sharp(req.file.buffer)
            .resize({ width: 600, height: 600, fit: 'cover' })
            .jpeg({ quality: 80 })
            .toBuffer();

        const uploaded = await uploadBufferToCloudinary(compressedBuffer, 'eOnlineBazar/avatars');
        if (!uploaded?.secure_url) {
            return res.status(500).json({ success: false, message: 'Cloudinary upload failed.' });
        }

        await destroyStoredCustomerAvatar(customer);

        customer.avatar = uploaded.secure_url;
        customer.avatarUrl = uploaded.secure_url;
        customer.avatarPublicId = uploaded.public_id || '';
        await customer.save();

        await logSecurityEvent({
            action: 'Customer Avatar Updated',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `Customer ${customer.email || customer._id} avatar replaced by admin`
        });

        return res.status(200).json({
            success: true,
            message: 'Customer profile photo updated.',
            avatarUrl: uploaded.secure_url,
            data: serializeCustomerAvatarResponse(customer)
        });
    } catch (error) {
        console.error('Update Customer Avatar Error:', error);
        if (error.message && /unsupported|invalid/i.test(error.message)) {
            return res.status(400).json({ success: false, message: 'Invalid image file.' });
        }
        return res.status(500).json({ success: false, message: 'Failed to update customer photo.' });
    }
};

async function clearCustomerAvatarRecord(req, res, existingCustomer) {
    const customer = existingCustomer || await User.findById(req.params.id).select('-password');
    if (!customer) {
        return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    await destroyStoredCustomerAvatar(customer);

    customer.avatar = '';
    customer.avatarUrl = null;
    customer.avatarPublicId = '';
    await customer.save();

    await logSecurityEvent({
        action: 'Customer Avatar Removed',
        actor: req.admin?.username || 'admin',
        actorType: 'admin',
        ipAddress: getClientIp(req),
        details: `Customer ${customer.email || customer._id} avatar removed by admin`
    });

    return res.status(200).json({
        success: true,
        message: 'Customer profile photo removed.',
        avatarUrl: null,
        data: serializeCustomerAvatarResponse(customer)
    });
}

const deleteCustomerAvatar = async (req, res) => {
    try {
        return await clearCustomerAvatarRecord(req, res);
    } catch (error) {
        console.error('Delete Customer Avatar Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to remove customer photo.' });
    }
};

// ==============================================================
// ৭. কাস্টমার অ্যাকাউন্ট স্ট্যাটাস (Block / Suspend / Activate)
// ==============================================================
const updateCustomerStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const allowed = ['active', 'suspended', 'blocked'];
        if (!status || !allowed.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status. Use active, suspended, or blocked.' });
        }

        const updated = await User.findByIdAndUpdate(
            req.params.id,
            { $set: { accountStatus: status } },
            { new: true }
        ).select('-password');

        if (!updated) {
            return res.status(404).json({ success: false, message: 'Customer not found.' });
        }

        const labels = { active: 'activated', suspended: 'suspended', blocked: 'blocked' };
        await logSecurityEvent({
            action: `Customer Account ${labels[status]}`,
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `Customer ${updated.email || updated._id} set to ${status}`
        });
        res.status(200).json({
            success: true,
            message: `Customer account ${labels[status]} successfully.`,
            data: updated
        });
    } catch (error) {
        console.error('Update Customer Status Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update account status.' });
    }
};

// ==============================================================
// ৭ক. কাস্টমার স্থায়ীভাবে ডিলিট (ইমেইল/মোবাইল ফ্রি করে)
// ==============================================================
const deleteCustomer = async (req, res) => {
    try {
        const customer = await User.findById(req.params.id).select('firstName lastName email mobile');
        if (!customer) {
            return res.status(404).json({ success: false, message: 'Customer not found.' });
        }

        const displayName = hydrateCustomerName(customer);
        const email = customer.email || '';
        const mobile = customer.mobile || '';

        await UserSession.deleteMany({ userId: customer._id });
        await User.deleteOne({ _id: customer._id });

        await logSecurityEvent({
            action: 'Customer Account Deleted',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `Permanently deleted customer ${email || customer._id} (${displayName})${mobile ? `, mobile ${mobile}` : ''}`
        });

        res.status(200).json({
            success: true,
            message: 'Customer permanently deleted. Email and mobile are now available for re-registration.'
        });
    } catch (error) {
        console.error('Delete Customer Error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete customer.' });
    }
};

// ==============================================================
// ৮. কাস্টমারের অর্ডার হিস্ট্রি (অ্যাডমিন)
// ==============================================================
const getCustomerOrders = async (req, res) => {
    try {
        const customer = await User.findById(req.params.id).select('firstName lastName email mobile');
        if (!customer) {
            return res.status(404).json({ success: false, message: 'Customer not found.' });
        }

        const orders = await Order.find({ user: req.params.id }).sort({ createdAt: -1 }).lean();

        res.status(200).json({
            success: true,
            customer: {
                id: customer._id,
                name: hydrateCustomerName(customer),
                email: customer.email,
                mobile: customer.mobile
            },
            data: orders
        });
    } catch (error) {
        console.error('Get Customer Orders Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch order history.' });
    }
};

module.exports = {
    getAllCustomers,
    getCustomerById,
    updateCustomer,
    updateCustomerAvatar,
    deleteCustomerAvatar,
    updateCustomerStatus,
    deleteCustomer,
    getCustomerOrders
};
