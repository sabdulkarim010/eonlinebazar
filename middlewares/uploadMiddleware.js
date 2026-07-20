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

module.exports = upload;
module.exports.brandingUpload = brandingUpload;
module.exports.BRANDING_DIR = BRANDING_DIR;
