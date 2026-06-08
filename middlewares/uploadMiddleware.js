const multer = require('multer');
const cloudinary = require('cloudinary').v2;

// ১. ক্লাউডিনারি কনফিগারেশন
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ২. মেমোরি স্টোরেজ সেটআপ (ফাইল বাফার আকারে জমা থাকবে)
const storage = multer.memoryStorage(); 

// ৩. ফাইল ফিল্টার (শুধু ছবি আপলোড নিশ্চিত করার জন্য)
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // সর্বোচ্চ ৫ মেগাবাইট সাইজ
});

// সরাসরি upload মিডলওয়্যারটি এক্সপোর্ট করলাম যাতে রাউট ফাইলে কোনো এরর না আসে
module.exports = upload;






