/********************************************************************
 * Project: EonlineBazar
 * File: adminController.js
 * Location: controllers/adminController.js
 * Author: Abdul Karim Sheikh
 * Description: Handles Admin authentication, profile image management 
 * (with Cloudinary cleanup), and fetching customer data.
 ********************************************************************/

const User = require('../models/user'); 
const Admin = require('../models/admin'); 
const Order = require('../models/order');
const Product = require('../models/product');
const SecurityLog = require('../models/securityLog');
const AdminSession = require('../models/adminSession');
const cloudinary = require('cloudinary').v2;
const jwt = require('jsonwebtoken');
const {
    brandingPublicPath,
    deleteLocalBrandingAsset,
    normalizeBrandingPublicUrl
} = require('../utils/brandingPaths');
const { clearStoreSettingsCache } = require('../utils/storeSettingsService');
const { logSecurityEvent, getClientIp } = require('../utils/securityLogger');
const Coupon = require('../models/coupon');
const { getApplicationNow } = require('../utils/applicationTime');

// ==============================================================
// ১. কাস্টমারদের তালিকা নিয়ে আসার ফাংশন 
// ==============================================================
const getAllCustomers = async (req, res) => {
    try {
        const customers = await User.find({}).select('-password').sort({ createdAt: -1 }).lean();

        const orderCounts = await Order.aggregate([
            { $match: { user: { $ne: null } } },
            { $group: { _id: '$user', count: { $sum: 1 } } }
        ]);
        const countMap = new Map(orderCounts.map(o => [String(o._id), o.count]));

        const enriched = customers.map(c => ({
            ...c,
            orderCount: countMap.get(String(c._id)) || 0
        }));

        res.status(200).json({ success: true, customers: enriched });
    } catch (error) {
        console.error("🔴 কাস্টমার ডাটা ফেচ করতে এরর:", error);
        res.status(500).json({ success: false, message: 'সার্ভার এরর।' });
    }
};

// ==============================================================
// ২. পুরোনো অ্যাডমিন লগইন ফাংশন — ⚠️ DEPRECATED, কোনো রাউটে ব্যবহৃত নয়।
// আসল লগইন এখন adminSecurityController.loginAdmin (bcrypt + 2FA + ডিভাইস
// সেশন + RBAC স্ট্যাটাস চেক)। এটি শুধু রেফারেন্সের জন্য রাখা হলো, তাই
// পাসওয়ার্ড যাচাইও হ্যাশ-অ্যাওয়্যার verifyPassword() দিয়ে করা হয়েছে।
// ==============================================================
const loginAdmin = async (req, res) => {
    try {
        const { username, password } = req.body;
        
        let admin = await Admin.findOne({ username });

        // অ্যাডমিন না থাকলে এবং ক্রেডেনশিয়াল মিললে নতুন অ্যাডমিন তৈরি করা
        if (!admin && username === "admin" && password === process.env.ADMIN_PASSWORD) {
            admin = new Admin({ username: "admin", password: process.env.ADMIN_PASSWORD });
            await admin.save(); 
        } else if (!admin || !(await admin.verifyPassword(password))) {
            await logSecurityEvent({
                action: 'Admin Login Failed',
                actor: username || 'unknown',
                actorType: 'admin',
                ipAddress: getClientIp(req),
                details: 'Invalid admin credentials'
            });
            return res.status(401).json({ success: false, message: "ভুল ইউজারনেম অথবা পাসওয়ার্ড দিয়েছেন!" });
        }

        // 🌟 নিরাপত্তা ফিক্স: টোকেনে role: 'admin' যুক্ত করা হলো।
        // কাস্টমার টোকেন একই JWT_SECRET দিয়ে সাইন হয় বলে role ছাড়া verifyAdmin
        // যেকোনো লগইন করা কাস্টমারকেও অ্যাডমিন হিসেবে গ্রহণ করত — এই দুর্বলতা দূর হলো।
        const token = jwt.sign(
            { username: admin.username, role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        await logSecurityEvent({
            action: 'Admin Login Success',
            actor: admin.username,
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: 'Admin panel authenticated via JWT'
        });

        return res.status(200).json({
            success: true,
            message: "Login successful!",
            token: token,
            image: admin.image 
        });

    } catch (error) {
        console.error("Login Controller Error:", error);
        return res.status(500).json({ success: false, message: "সার্ভারে অভ্যন্তরীণ সমস্যা।" });
    }
};

// ==============================================================
// ৩. প্রোফাইল ছবি আপলোড ফাংশন (Cloudinary) - 🌟 ওল্ড ইমেজ ডিলিট ফিক্সসহ
// ==============================================================
const updateProfilePic = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "কোনো ছবি সিলেক্ট করা হয়নি!" });
        }

        // 🌟 ফিক্স: নতুন ছবি আপলোডের আগে পুরোনো ছবি ক্লাউডিনারি থেকে ডিলিট করা
        // (স্টাফ অ্যাকাউন্টও নিজের ছবি বদলাতে পারে — তাই লগইন করা ইউজারনেম ব্যবহার)
        const currentUsername = req.admin?.username;
        const existingAdmin = await Admin.findOne({ username: currentUsername });
        if (existingAdmin && existingAdmin.image) {
            const oldImageUrl = existingAdmin.image;
            if (oldImageUrl.includes('cloudinary.com')) {
                try {
                    const urlParts = oldImageUrl.split('/');
                    const filename = urlParts[urlParts.length - 1].split('.')[0];        
                    const folder = urlParts[urlParts.length - 2];      
                    const publicId = `${folder}/${filename}`;
                    await cloudinary.uploader.destroy(publicId);
                } catch (cloudinaryErr) {
                    console.error("Old Admin Image Delete Error:", cloudinaryErr);
                }
            }
        }

        // নতুন ছবি ক্লাউডিনারিতে আপলোড করা
        const stream = cloudinary.uploader.upload_stream(
            { folder: 'EonlineBazar_Admin' }, 
            async (error, result) => {
                if (error) {
                    console.error("Cloudinary Error:", error);
                    return res.status(500).json({ success: false, message: "ছবি আপলোডে এরর!" });
                }

                // ডাটাবেজে নতুন ছবির লিংক আপডেট করা
                const updatedAdmin = await Admin.findOneAndUpdate(
                    { username: currentUsername },
                    { image: result.secure_url },
                    { returnDocument: 'after' }
                );

                if (!updatedAdmin) {
                    return res.status(404).json({ success: false, message: "অ্যাডমিন অ্যাকাউন্ট পাওয়া যায়নি।" });
                }

                res.status(200).json({
                    success: true,
                    imageUrl: result.secure_url,
                    message: "প্রোফাইল ছবি সফলভাবে আপডেট হয়েছে!"
                });
            }
        );

        stream.end(req.file.buffer);

    } catch (error) {
        console.error("Profile Upload Error:", error);
        res.status(500).json({ success: false, message: "সার্ভার এরর" });
    }
};

// ==============================================================
// ৪. ডাটাবেজ থেকে অ্যাডমিন প্রোফাইল ছবি নিয়ে আসার ফাংশন
// ==============================================================
const getAdminProfile = async (req, res) => {
    try {
        // লগইন করা অ্যাকাউন্টের নিজের প্রোফাইল (সুপার অ্যাডমিন বা স্টাফ)
        const admin = await Admin.findOne({ username: req.admin?.username });
        
        if (!admin) {
            return res.status(404).json({ success: false, message: "অ্যাডমিন পাওয়া যায়নি।" });
        }

        res.status(200).json({
            success: true,
            image: admin.image,
            username: admin.username,
            name: admin.name || admin.displayName || admin.username,
            role: admin.role,
            permissions: Array.isArray(admin.permissions) ? admin.permissions : []
        });
    } catch (error) {
        console.error("Get Profile Error:", error);
        res.status(500).json({ success: false, message: "সার্ভার এরর" });
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
        res.status(200).json({ success: true, data: { ...customer, orderCount } });
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
        const { name, firstName, lastName, email, mobile, phone, address, isVerified } = req.body;
        const updateFields = {};

        if (firstName !== undefined) updateFields.firstName = String(firstName).trim();
        if (lastName !== undefined) updateFields.lastName = String(lastName).trim();
        if (name !== undefined && firstName === undefined && lastName === undefined) {
            const trimmed = String(name).trim();
            const parts = trimmed.split(/\s+/).filter(Boolean);
            updateFields.firstName = parts[0] || '';
            updateFields.lastName = parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || '';
        }
        if (email !== undefined) updateFields.email = String(email).trim().toLowerCase();
        if (mobile !== undefined) updateFields.mobile = String(mobile).trim();
        if (phone !== undefined) updateFields.phone = String(phone).trim();
        if (address !== undefined) updateFields.address = String(address).trim();
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
                name: customer.name,
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

// ==============================================================
// ৯. সিকিউরিটি লগস (অ্যাডমিন প্যানেল)
// ==============================================================
const getSecurityLogs = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
        const logs = await SecurityLog.find({})
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        const data = logs.map(log => ({
            _id: log._id,
            action: log.action,
            actor: log.actor,
            actorType: log.actorType,
            ipAddress: log.ipAddress,
            details: log.details,
            timestamp: log.createdAt
        }));

        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Get Security Logs Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch security logs.' });
    }
};

// ==============================================================
// ১০. অ্যাডমিন টোকেন ভেরিফাই
// ==============================================================
const verifyAdminToken = (req, res) => {
    res.status(200).json({ success: true, admin: req.admin });
};

// ==============================================================
// ১১. অ্যাডমিন সেটিংস পড়া
// ==============================================================
const getAdminSettings = async (req, res) => {
    try {
        const admin = await Admin.findOne({ username: req.admin?.username || 'admin' })
            .select('-password')
            .lean();
        if (!admin) {
            return res.status(404).json({ success: false, message: 'Admin not found.' });
        }
        admin.logoUrl = normalizeBrandingPublicUrl(admin.logoUrl);
        admin.faviconUrl = normalizeBrandingPublicUrl(admin.faviconUrl);
        res.status(200).json({ success: true, data: admin });
    } catch (error) {
        console.error('Get Admin Settings Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load settings.' });
    }
};

// ==============================================================
// ১১.১. অ্যাডমিন প্রোফাইল আপডেট (ডিসপ্লে নেম, ইউজারনেম, পাসওয়ার্ড)
// ==============================================================
const updateAdminProfile = async (req, res) => {
    try {
        const { currentPassword, username, newPassword, displayName } = req.body;

        if (!currentPassword) {
            return res.status(400).json({ success: false, message: 'Current password is required.' });
        }

        const admin = await Admin.findOne({ username: req.admin?.username || 'admin' });
        if (!admin) {
            return res.status(404).json({ success: false, message: 'Admin not found.' });
        }

        const currentPasswordOk = await admin.verifyPassword(currentPassword);
        if (!currentPasswordOk) {
            await logSecurityEvent({
                action: 'Admin Profile Update Failed',
                actor: admin.username,
                actorType: 'admin',
                ipAddress: getClientIp(req),
                details: 'Incorrect current password'
            });
            return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
        }

        const previousUsername = admin.username;
        let usernameChanged = false;

        if (username && username !== admin.username) {
            const exists = await Admin.findOne({ username, _id: { $ne: admin._id } });
            if (exists) {
                return res.status(400).json({ success: false, message: 'Username already taken.' });
            }
            admin.username = String(username).trim();
            usernameChanged = true;
        }

        if (newPassword) {
            if (String(newPassword).length < 6) {
                return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
            }
            // মডেলের pre-save হুক এটিকে bcrypt হ্যাশে রূপান্তর করবে
            admin.password = String(newPassword);
        }

        if (displayName !== undefined) {
            admin.displayName = String(displayName).trim();
            if (!admin.isSuperAdmin()) admin.name = admin.displayName;
        }

        await admin.save();

        // ইউজারনেম বা পাসওয়ার্ড বদলালে পুরোনো টোকেন/সেশন আর বৈধ নয় —
        // সব ডিভাইস সাইন-আউট করে ফ্রন্টএন্ডকে রি-লগইন করতে বলা হয়।
        const requireRelogin = usernameChanged || !!newPassword;
        if (requireRelogin) {
            await AdminSession.deleteMany({ adminUsername: previousUsername });
        }

        await logSecurityEvent({
            action: 'Admin Profile Updated',
            actor: admin.username,
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: 'Display name, username, or password changed'
        });

        const safe = admin.toObject();
        delete safe.password;

        res.status(200).json({
            success: true,
            message: requireRelogin
                ? 'Profile updated. Please sign in again with your new credentials.'
                : 'Admin profile updated successfully.',
            requireRelogin,
            data: safe
        });
    } catch (error) {
        console.error('Update Admin Profile Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update admin profile.' });
    }
};

// ==============================================================
// ১২. অ্যাডমিন সেটিংস আপডেট
// ==============================================================
const updateAdminSettings = async (req, res) => {
    try {
        const {
            currentPassword,
            username,
            newPassword,
            displayName,
            storeName,
            currency,
            currencySymbol,
            timezone
        } = req.body;

        if (!currentPassword) {
            return res.status(400).json({ success: false, message: 'Current password is required.' });
        }

        const admin = await Admin.findOne({ username: req.admin?.username || 'admin' });
        if (!admin) {
            return res.status(404).json({ success: false, message: 'Admin not found.' });
        }

        const currentPasswordOk = await admin.verifyPassword(currentPassword);
        if (!currentPasswordOk) {
            await logSecurityEvent({
                action: 'Admin Settings Change Failed',
                actor: admin.username,
                actorType: 'admin',
                ipAddress: getClientIp(req),
                details: 'Incorrect current password'
            });
            return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
        }

        const previousUsername = admin.username;
        let usernameChanged = false;

        if (username && username !== admin.username) {
            const exists = await Admin.findOne({ username, _id: { $ne: admin._id } });
            if (exists) {
                return res.status(400).json({ success: false, message: 'Username already taken.' });
            }
            admin.username = String(username).trim();
            usernameChanged = true;
        }

        const passwordChanged = !!(newPassword && String(newPassword).length >= 6);
        if (passwordChanged) {
            // মডেলের pre-save হুক এটিকে bcrypt হ্যাশে রূপান্তর করবে
            admin.password = String(newPassword);
        }

        if (displayName !== undefined) admin.displayName = String(displayName).trim();
        if (storeName !== undefined) admin.storeName = String(storeName).trim();
        if (currency !== undefined) admin.currency = String(currency).trim();
        if (currencySymbol !== undefined) admin.currencySymbol = String(currencySymbol).trim();
        if (timezone !== undefined) admin.timezone = String(timezone).trim();

        await admin.save();

        // ইউজারনেম বা পাসওয়ার্ড বদলালে পুরোনো টোকেন আর বৈধ নয় → সব ডিভাইস সাইন-আউট
        const requireRelogin = usernameChanged || passwordChanged;
        if (requireRelogin) {
            await AdminSession.deleteMany({ adminUsername: previousUsername });
        }

        await logSecurityEvent({
            action: 'Admin Settings Updated',
            actor: admin.username,
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: 'Profile or platform preferences saved'
        });

        const safe = admin.toObject();
        delete safe.password;

        res.status(200).json({
            success: true,
            message: requireRelogin
                ? 'Settings saved. Please sign in again with your new credentials.'
                : 'Settings saved successfully.',
            requireRelogin,
            data: safe
        });
    } catch (error) {
        console.error('Update Admin Settings Error:', error);
        res.status(500).json({ success: false, message: 'Failed to save settings.' });
    }
};

async function deleteCloudinaryBrandingAsset(oldUrl) {
    if (!oldUrl || !oldUrl.includes('cloudinary.com')) return;
    try {
        const urlParts = oldUrl.split('/');
        const filename = urlParts[urlParts.length - 1].split('.')[0];
        const folder = urlParts[urlParts.length - 2];
        await cloudinary.uploader.destroy(`${folder}/${filename}`);
    } catch (cloudErr) {
        console.error('Old branding asset delete error:', cloudErr);
    }
}

// ==============================================================
// ১৩. স্টোর লোগো / ফ্যাভিকন আপলোড (local public directory)
// ==============================================================
const uploadStoreBranding = async (req, res) => {
    try {
        const logoFile = req.files?.logo?.[0];
        const faviconFile = req.files?.favicon?.[0];

        if (!logoFile && !faviconFile) {
            return res.status(400).json({
                success: false,
                message: 'Please choose a logo or favicon to upload.'
            });
        }

        const admin = await Admin.findOne({ username: req.admin?.username || 'admin' });
        if (!admin) {
            return res.status(404).json({ success: false, message: 'Admin not found.' });
        }

        const response = { success: true, message: 'Store branding updated successfully.' };

        if (logoFile) {
            const newLogoUrl = brandingPublicPath(logoFile.filename);
            if (admin.logoUrl && normalizeBrandingPublicUrl(admin.logoUrl) !== newLogoUrl) {
                await deleteCloudinaryBrandingAsset(admin.logoUrl);
                deleteLocalBrandingAsset(admin.logoUrl);
            }
            admin.logoUrl = newLogoUrl;
            response.logoUrl = admin.logoUrl;
        }

        if (faviconFile) {
            const newFaviconUrl = brandingPublicPath(faviconFile.filename);
            if (admin.faviconUrl && normalizeBrandingPublicUrl(admin.faviconUrl) !== newFaviconUrl) {
                await deleteCloudinaryBrandingAsset(admin.faviconUrl);
                deleteLocalBrandingAsset(admin.faviconUrl);
            }
            admin.faviconUrl = newFaviconUrl;
            response.faviconUrl = admin.faviconUrl;
        }

        await admin.save();
        clearStoreSettingsCache();

        await logSecurityEvent({
            action: 'Store Branding Updated',
            actor: admin.username,
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: [
                logoFile ? 'logo uploaded' : null,
                faviconFile ? 'favicon uploaded' : null
            ].filter(Boolean).join(', ')
        });

        res.status(200).json(response);
    } catch (error) {
        console.error('Upload Store Branding Error:', error);
        res.status(500).json({ success: false, message: 'Server error during upload.' });
    }
};

// ==============================================================
// Global admin "Sync Data" — flush expired coupons + return fresh catalog state
// ==============================================================
const syncAdminData = async (req, res) => {
    try {
        const now = getApplicationNow();

        // Automatically shift outdated coupons before returning synced state
        await Coupon.updateMany(
            { status: 'ACTIVE', expiryDate: { $lte: now } },
            { $set: { status: 'EXPIRED', isActive: false } }
        );

        const coupons = await Coupon.find().sort({ createdAt: -1 }).lean();

        res.status(200).json({
            success: true,
            message: 'Data synchronized successfully.',
            data: { coupons }
        });
    } catch (error) {
        console.error('Admin Sync Error:', error);
        res.status(500).json({ success: false, message: 'Failed to synchronize admin data.' });
    }
};

// ==============================================================
// ড্যাশবোর্ড অ্যানালিটিক্স — Sales, Orders, Top Products & Stock Alerts
// ==============================================================
const getOrderRevenue = (order) => Number(order?.grandTotal ?? order?.totalAmount) || 0;

const normalizeOrderStatus = (status) => (status || 'Pending').trim().toLowerCase();

const isDeliveredOrder = (order) =>
    order.isDelivered === true || normalizeOrderStatus(order.status) === 'delivered';

const buildDailyRevenueSeries = (deliveredOrders, days = 30) => {
    const labels = [];
    const revenue = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
        const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        labels.push(dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

        const dayTotal = deliveredOrders.reduce((sum, order) => {
            const created = new Date(order.createdAt);
            if (created >= dayStart && created < dayEnd) {
                return sum + getOrderRevenue(order);
            }
            return sum;
        }, 0);

        revenue.push(dayTotal);
    }

    return { labels, revenue };
};

const buildMonthlyRevenueSeries = (deliveredOrders, months = 12) => {
    const labels = [];
    const revenue = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

        labels.push(monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));

        const monthTotal = deliveredOrders.reduce((sum, order) => {
            const created = new Date(order.createdAt);
            if (created >= monthStart && created < monthEnd) {
                return sum + getOrderRevenue(order);
            }
            return sum;
        }, 0);

        revenue.push(monthTotal);
    }

    return { labels, revenue };
};

const getDashboardAnalytics = async (req, res) => {
    try {
        const now = getApplicationNow();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const [orders, totalCustomers, alertProducts] = await Promise.all([
            Order.find({})
                .select('status grandTotal totalAmount createdAt items isDelivered')
                .lean(),
            User.countDocuments({}),
            Product.find({ stock: { $lte: 5 } })
                .select('_id productId name stock category image icon')
                .sort({ stock: 1 })
                .lean()
        ]);

        const deliveredOrders = orders.filter(isDeliveredOrder);

        const allTimeRevenue = deliveredOrders.reduce((sum, order) => sum + getOrderRevenue(order), 0);
        const dailyRevenue = deliveredOrders
            .filter((order) => new Date(order.createdAt) >= startOfDay)
            .reduce((sum, order) => sum + getOrderRevenue(order), 0);
        const monthlyRevenue = deliveredOrders
            .filter((order) => new Date(order.createdAt) >= startOfMonth)
            .reduce((sum, order) => sum + getOrderRevenue(order), 0);

        const orderCounts = {
            total: orders.length,
            pending: orders.filter((o) => normalizeOrderStatus(o.status) === 'pending').length,
            processing: orders.filter((o) => normalizeOrderStatus(o.status) === 'processing').length,
            delivered: deliveredOrders.length,
            returnRequests: orders.filter((o) => normalizeOrderStatus(o.status) === 'return requested').length
        };

        const productQtyMap = new Map();
        for (const order of deliveredOrders) {
            for (const item of order.items || []) {
                const key = String(item.productId || item.id || item.name || 'unknown');
                const existing = productQtyMap.get(key) || {
                    productId: item.productId || item.id || key,
                    name: item.name || 'Unknown Product',
                    quantity: 0
                };
                existing.quantity += Number(item.quantity) || 0;
                productQtyMap.set(key, existing);
            }
        }

        const topProducts = Array.from(productQtyMap.values())
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 5);

        const salesTrend = {
            daily: buildDailyRevenueSeries(deliveredOrders, 30),
            monthly: buildMonthlyRevenueSeries(deliveredOrders, 12)
        };

        const inventoryAlerts = {
            outOfStock: alertProducts.filter((p) => Number(p.stock) === 0),
            lowStock: alertProducts.filter((p) => Number(p.stock) > 0 && Number(p.stock) <= 5)
        };

        res.status(200).json({
            success: true,
            analytics: {
                revenue: {
                    daily: dailyRevenue,
                    monthly: monthlyRevenue,
                    allTime: allTimeRevenue
                },
                orderCounts,
                totalCustomers,
                topProducts,
                salesTrend,
                inventoryAlerts
            }
        });
    } catch (error) {
        console.error('Dashboard Analytics Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load dashboard analytics.' });
    }
};

// দ্রষ্টব্য: loginAdmin এখন controllers/adminSecurityController.js-এ স্থানান্তরিত
// (2-step OTP flow)। তাই এখান থেকে এক্সপোর্ট সরিয়ে ফেলা হলো — উপরের পুরোনো
// হ্যান্ডলারটি আর কোনো রুটে ব্যবহৃত হয় না।
module.exports = {
    getAllCustomers,
    updateProfilePic,
    getAdminProfile,
    getCustomerById,
    updateCustomer,
    updateCustomerStatus,
    getCustomerOrders,
    getSecurityLogs,
    verifyAdminToken,
    getAdminSettings,
    updateAdminProfile,
    updateAdminSettings,
    uploadStoreBranding,
    syncAdminData,
    getDashboardAnalytics
};





