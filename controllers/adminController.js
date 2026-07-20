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
const SecurityLog = require('../models/securityLog');
const cloudinary = require('cloudinary').v2;
const jwt = require('jsonwebtoken');
const {
    brandingPublicPath,
    deleteLocalBrandingAsset,
    normalizeBrandingPublicUrl
} = require('../utils/brandingPaths');
const { clearStoreSettingsCache } = require('../utils/storeSettingsService');
const { logSecurityEvent, getClientIp } = require('../utils/securityLogger');

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
// ২. অ্যাডমিন লগইন ফাংশন (ডাটাবেজ কানেক্টেড)
// ==============================================================
const loginAdmin = async (req, res) => {
    try {
        const { username, password } = req.body;
        
        let admin = await Admin.findOne({ username });

        // অ্যাডমিন না থাকলে এবং ক্রেডেনশিয়াল মিললে নতুন অ্যাডমিন তৈরি করা
        if (!admin && username === "admin" && password === process.env.ADMIN_PASSWORD) {
            admin = new Admin({ username: "admin", password: process.env.ADMIN_PASSWORD });
            await admin.save(); 
        } else if (!admin || admin.password !== password) {
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
        const existingAdmin = await Admin.findOne({ username: 'admin' });
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
                    { username: 'admin' }, 
                    { image: result.secure_url },
                    { returnDocument: 'after', upsert: true } // না থাকলে তৈরি করবে (upsert)
                );

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
        const admin = await Admin.findOne({ username: 'admin' });
        
        if (!admin) {
            return res.status(404).json({ success: false, message: "অ্যাডমিন পাওয়া যায়নি।" });
        }

        res.status(200).json({
            success: true,
            image: admin.image 
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
        const { name, email, mobile, phone, address, isVerified } = req.body;
        const updateFields = {};

        if (name !== undefined) updateFields.name = String(name).trim();
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
        const customer = await User.findById(req.params.id).select('name email mobile');
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

        if (admin.password !== currentPassword) {
            await logSecurityEvent({
                action: 'Admin Profile Update Failed',
                actor: admin.username,
                actorType: 'admin',
                ipAddress: getClientIp(req),
                details: 'Incorrect current password'
            });
            return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
        }

        if (username && username !== admin.username) {
            const exists = await Admin.findOne({ username, _id: { $ne: admin._id } });
            if (exists) {
                return res.status(400).json({ success: false, message: 'Username already taken.' });
            }
            admin.username = String(username).trim();
        }

        if (newPassword) {
            if (String(newPassword).length < 6) {
                return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
            }
            admin.password = String(newPassword);
        }

        if (displayName !== undefined) {
            admin.displayName = String(displayName).trim();
        }

        await admin.save();

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
            message: 'Admin profile updated successfully.',
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

        if (admin.password !== currentPassword) {
            await logSecurityEvent({
                action: 'Admin Settings Change Failed',
                actor: admin.username,
                actorType: 'admin',
                ipAddress: getClientIp(req),
                details: 'Incorrect current password'
            });
            return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
        }

        if (username && username !== admin.username) {
            const exists = await Admin.findOne({ username, _id: { $ne: admin._id } });
            if (exists) {
                return res.status(400).json({ success: false, message: 'Username already taken.' });
            }
            admin.username = String(username).trim();
        }

        if (newPassword && String(newPassword).length >= 6) {
            admin.password = String(newPassword);
        }

        if (displayName !== undefined) admin.displayName = String(displayName).trim();
        if (storeName !== undefined) admin.storeName = String(storeName).trim();
        if (currency !== undefined) admin.currency = String(currency).trim();
        if (currencySymbol !== undefined) admin.currencySymbol = String(currencySymbol).trim();
        if (timezone !== undefined) admin.timezone = String(timezone).trim();

        await admin.save();

        await logSecurityEvent({
            action: 'Admin Settings Updated',
            actor: admin.username,
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: 'Profile or platform preferences saved'
        });

        const safe = admin.toObject();
        delete safe.password;

        res.status(200).json({ success: true, message: 'Settings saved successfully.', data: safe });
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
    uploadStoreBranding
};





