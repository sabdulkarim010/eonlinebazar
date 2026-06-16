/********************************************************************
 * Project: EonlineBazar
 * File: uploadMiddleware.js
 * Location: middlewares/uploadMiddleware.js
 * Author: Abdul Karim Sheikh
 * Description: Middleware for handling memory-based image uploads.
 * Images are validated and prepared for Cloudinary upload.
 ********************************************************************/

const multer = require('multer');

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

// আপলোড কনফিগারেশন
const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { 
        fileSize: 5 * 1024 * 1024 // ৫ মেগাবাইট লিমিট
    }
});

module.exports = upload;



