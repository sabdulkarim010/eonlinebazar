/**
 * EonlineBazar — Admin Settings Controller
 * Extracted from: controllers/adminController.js
 * Routes that use this: routes/adminRoutes.js
 *
 * When adding new endpoints:
 * 1. Add handler here
 * 2. Export from barrel (original controller file)
 * 3. Add route in routes/[file].routes.js
 */

const Admin = require('../../models/admin');
const AdminSession = require('../../models/adminSession');
const cloudinary = require('cloudinary').v2;
const {
    brandingPublicPath,
    deleteLocalBrandingAsset,
    normalizeBrandingPublicUrl
} = require('../../utils/brandingPaths');
const { clearStoreSettingsCache } = require('../../services/storeSettingsService');
const { invalidate, CACHE_KEYS } = require('../../services/cacheService');
const { logSecurityEvent, getClientIp } = require('../../utils/securityLogger');

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

        if (storeName !== undefined) {
            clearStoreSettingsCache();
            await invalidate(CACHE_KEYS.STORE_SETTINGS);
        }

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
        await invalidate(CACHE_KEYS.STORE_SETTINGS);

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

module.exports = {
    getAdminSettings,
    updateAdminSettings,
    uploadStoreBranding
};
