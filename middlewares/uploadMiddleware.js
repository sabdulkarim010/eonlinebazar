/********************************************************************
 * Project: EonlineBazar
 * File: uploadMiddleware.js
 * Location: middlewares/uploadMiddleware.js
 * Author: Abdul Karim Sheikh
 * Description: Middleware for handling memory-based image uploads.
 * Images are validated and prepared for Cloudinary upload.
 ********************************************************************/

const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { BRANDING_DIR } = require('../utils/brandingPaths');
const {
    PAYMENTS_DIR,
    buildUniquePaymentLogoFilename
} = require('../utils/paymentLogoPaths');

// Guarantee payment logo upload directory exists before any save attempt.
fs.mkdirSync(PAYMENTS_DIR, { recursive: true });

const PAYMENT_LOGO_MIMES = new Set([
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/svg+xml'
]);

// মেমোরি স্টোরেজ: ফাইলগুলো লোকাল সার্ভারে সেভ না করে র‍্যামে বাফার হিসেবে রাখা হয়
const storage = multer.memoryStorage();

// ফাইল ফিল্টার: শুধুমাত্র ইমেজ ফাইল গ্রহণ করার জন্য
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type! Only images are allowed.'), false);
    }
};

/** Payment method logos — explicit MIME allowlist (PNG, JPEG, JPG, WebP, SVG). */
const paymentMethodLogoFileFilter = (req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    if (PAYMENT_LOGO_MIMES.has(mime)) {
        cb(null, true);
        return;
    }
    cb(new Error('Invalid file type. Allowed: PNG, JPEG, JPG, WebP, and SVG.'), false);
};

// আপলোড কনফিগারেশন (Cloudinary / memory pipeline)
const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // ৫ মেগাবাইট লিমিট
    }
});

// Store logo & favicon — saved under client/uploads/branding (public URL /uploads/branding/...)
const brandingStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        fs.mkdirSync(BRANDING_DIR, { recursive: true });
        cb(null, BRANDING_DIR);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.png';
        const baseName = file.fieldname === 'logo' ? 'store-logo' : 'store-favicon';
        cb(null, `${baseName}${ext}`);
    }
});

const brandingUpload = multer({
    storage: brandingStorage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024
    }
});

// Dynamic payment method catalog — one `logo` file per create/update request.
// Filenames are keyed off the submitted method name so uploads stay legible
// on disk, and collisions are impossible thanks to the timestamp + random hex.
const paymentMethodLogoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        fs.mkdirSync(PAYMENTS_DIR, { recursive: true });
        cb(null, PAYMENTS_DIR);
    },
    filename: (req, file, cb) => {
        const key = req.body?.code || req.body?.name || 'method';
        cb(null, buildUniquePaymentLogoFilename(key, file.originalname));
    }
});

const paymentMethodLogoUpload = multer({
    storage: paymentMethodLogoStorage,
    fileFilter: paymentMethodLogoFileFilter,
    limits: {
        fileSize: 2 * 1024 * 1024 // logos are small — a tight cap keeps disk use predictable
    }
}).single('logo');

/**
 * Multer rejects (oversized file, non-image) surface as thrown errors that
 * would otherwise reach the generic handler and return HTML to a fetch() call.
 * The admin panel expects JSON, so they are translated here.
 */
function paymentMethodLogoUploadSafe(req, res, next) {
    paymentMethodLogoUpload(req, res, (err) => {
        if (!err) return next();

        const message = err.code === 'LIMIT_FILE_SIZE'
            ? 'Logo must be 2 MB or smaller.'
            : (err.message || 'Logo upload failed.');
        return res.status(400).json({ success: false, message });
    });
}

module.exports = upload;
module.exports.brandingUpload = brandingUpload;
module.exports.paymentMethodLogoUpload = paymentMethodLogoUploadSafe;
module.exports.BRANDING_DIR = BRANDING_DIR;
module.exports.PAYMENTS_DIR = PAYMENTS_DIR;
