/********************************************************************
 * Project: EonlineBazar
 * File: userController.js
 * Location: controllers/userController.js
 * Author: Abdul Karim Sheikh
 * Description: Handles User Registration, Authentication (JWT Login), 
 * Forgot/Reset Password via Email OTP, Profile management, and fully 
 * compressed Avatar Upload using Sharp and Cloudinary.
 ********************************************************************/

const User = require('../models/user');
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken'); 
const nodemailer = require('nodemailer'); 
const crypto = require('crypto'); 
const cloudinary = require('cloudinary').v2;
const sharp = require('sharp'); 

// ইমেইল পাঠানোর কনফিগারেশন
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS  
    }
});

// JWT সিক্রেট (ফলব্যাক সহ যাতে .env না থাকলেও কাজ করে)
const JWT_SECRET = process.env.JWT_SECRET || 'eOnlineBazarSecretKey123';

// টেস্ট রাউট
exports.testUserRoute = (req, res) => {
    res.status(200).json({ message: "User Controller is ready!" });
};

/* =======================================================
   হেল্পার: User-Agent থেকে ডিভাইস ও ব্রাউজার শনাক্ত করা
   ======================================================= */
function parseUserAgent(uaString = '') {
    const ua = uaString.toLowerCase();

    let browser = 'Unknown Browser';
    if (ua.includes('edg/')) browser = 'Microsoft Edge';
    else if (ua.includes('opr/') || ua.includes('opera')) browser = 'Opera';
    else if (ua.includes('chrome') && !ua.includes('edg/')) browser = 'Chrome';
    else if (ua.includes('firefox')) browser = 'Firefox';
    else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';

    let device = 'Desktop';
    if (ua.includes('android')) device = 'Android Phone';
    else if (ua.includes('iphone')) device = 'iPhone';
    else if (ua.includes('ipad')) device = 'iPad';
    else if (ua.includes('windows')) device = 'Windows PC';
    else if (ua.includes('mac os')) device = 'Mac';
    else if (ua.includes('linux')) device = 'Linux PC';

    return { device, browser };
}

// ক্লায়েন্টের আইপি বের করা
function getClientIp(req) {
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) return fwd.split(',')[0].trim();
    return (req.socket && req.socket.remoteAddress) || req.ip || '';
}



/* =======================================================
   ১. ইউজার রেজিস্ট্রেশন (Register - ফিক্স করা হয়েছে)
   ======================================================= */
exports.registerUser = async (req, res) => {
    try {
        const { name, mobile, email, password } = req.body;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: "Email already exists!" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const verificationToken = crypto.randomBytes(20).toString('hex');

        const newUser = new User({
            name,
            mobile,
            email,
            password: hashedPassword,
            verificationToken
        });

        await newUser.save();

        // 🚀 ফিক্স: ভেরিফিকেশন লিঙ্ক তৈরি (আপনার ফ্রন্টএন্ড বা ব্যাকএন্ডের রুট অনুযায়ী)
        // ধরুন আপনার ভেরিফিকেশন এপিআই রুটটি এমন: /api/customer/verify/:token
        const verificationUrl = `${req.protocol}://${req.get('host')}/api/customer/verify/${verificationToken}`;

        // ✉️ ইমেইল অপশন সেট করা
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: newUser.email,
            subject: 'eOnlineBazar - Account Verification',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 10px; max-width: 500px; margin: auto;">
                    <h2 style="color: #2563eb; text-align: center;">eOnlineBazar</h2>
                    <p>Dear <b>${newUser.name}</b>,</p>
                    <p>Thank you for registering with us. Please verify your email address to activate your account:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${verificationUrl}" style="background-color: #2563eb; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Verify Email Address</a>
                    </div>
                    <p style="color: #666; font-size: 12px;">If the button doesn't work, copy and paste this link into your browser:</p>
                    <p style="color: #2563eb; font-size: 12px; word-break: break-all;">${verificationUrl}</p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin-top: 20px;">
                    <p style="color: #999; font-size: 11px; text-align: center;">This is an automated email, please do not reply.</p>
                </div>
            `
        };

        // 📨 মেইলটি পাঠানো হচ্ছে
        await transporter.sendMail(mailOptions);

        res.status(201).json({ success: true, message: "Registration successful! Please check your email to verify your account." });

    } catch (error) {
        console.error("Register Error:", error);
        res.status(500).json({ success: false, message: "Server error during registration." });
    }
};



/* =======================================================
   ২. ইউজার লগিন (Login)
   ======================================================= */
exports.loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ success: false, message: "Invalid email or password." });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: "Invalid email or password." });
        }

        // 🌟 নতুন: লগইন সেশন তৈরি করা (অ্যাক্টিভ ডিভাইস ট্র্যাকিং ও রিমোট লগআউটের জন্য)
        const { device, browser } = parseUserAgent(req.headers['user-agent']);
        const newSession = {
            device,
            browser,
            ip: getClientIp(req),
            location: 'Unknown Location',
            createdAt: new Date(),
            lastActive: new Date()
        };
        user.sessions.push(newSession);
        await user.save();

        // নতুন তৈরি হওয়া সেশনের আইডি (সাব-ডকুমেন্টের শেষটি)
        const sessionId = user.sessions[user.sessions.length - 1]._id.toString();

        const token = jwt.sign(
            { id: user._id, sid: sessionId }, 
            JWT_SECRET, 
            { expiresIn: '7d' } 
        );

        res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            user: { id: user._id, name: user.name, email: user.email, mobile: user.mobile }
        });

    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ success: false, message: "Server error during login." });
    }
};

/* =======================================================
   ৩. ফরগেট পাসওয়ার্ড - OTP পাঠানো (Forgot Password)
   ======================================================= */
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ success: false, message: "No account found with this email." });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        user.resetPasswordOtp = otp;
        user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; 
        await user.save();

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: 'eOnlineBazar - Password Reset OTP',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                    <h2 style="color: #2563eb;">eOnlineBazar</h2>
                    <p>Dear <b>${user.name}</b>,</p>
                    <p>You requested to reset your password. Here is your 6-digit OTP:</p>
                    <h1 style="color: #e74c3c; letter-spacing: 5px;">${otp}</h1>
                    <p style="color: #e74c3c; font-size: 12px;"><i>This OTP is valid for 15 minutes only. Do not share it with anyone.</i></p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);

        res.status(200).json({ success: true, message: "OTP sent to your email successfully." });

    } catch (error) {
        console.error("Forgot Password Error:", error);
        res.status(500).json({ success: false, message: "Failed to send OTP. Please try again." });
    }
};

/* =======================================================
   ৪. নতুন পাসওয়ার্ড সেট করা (Reset Password)
   ======================================================= */
exports.resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        const user = await User.findOne({ 
            email,
            resetPasswordOtp: otp,
            resetPasswordExpires: { $gt: Date.now() } 
        });

        if (!user) {
            return res.status(400).json({ success: false, message: "Invalid or expired OTP." });
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);

        user.resetPasswordOtp = null;
        user.resetPasswordExpires = null;

        await user.save();

        res.status(200).json({ success: true, message: "Password reset successful! You can login now." });

    } catch (error) {
        console.error("Reset Password Error:", error);
        res.status(500).json({ success: false, message: "Server error during password reset." });
    }
};

/* =======================================================
   ৫. ইউজারের প্রোফাইল ডাটা পাঠানো (Get Profile)
   ======================================================= */
exports.getUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password'); 
        
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }
        res.status(200).json(user);
    } catch (error) {
        console.error("Get Profile Error:", error);
        res.status(500).json({ success: false, message: "Server error while fetching profile." });
    }
};

/* =======================================================
   ৬. প্রোফাইল ইনফরমেশন আপডেট করা (Update Profile)
   ======================================================= */
exports.updateUserProfile = async (req, res) => {
    try {
        const { name, phone, mobile, address } = req.body;
        
        // 🌟 ফিক্স: ফ্রন্টএন্ড থেকে 'phone' বা 'mobile' যেকোনো একটি আসলেই যেন ডাটাবেজের সঠিক ফিল্ড আপডেট হয়
        const contactNumber = (phone !== undefined ? phone : mobile);

        const updateFields = {};
        if (name !== undefined) updateFields.name = name;
        if (address !== undefined) updateFields.address = address;
        if (contactNumber !== undefined) {
            updateFields.phone = contactNumber;
            updateFields.mobile = contactNumber;
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.user.id,
            { $set: updateFields },
            { new: true, runValidators: true } 
        ).select('-password');

        if (!updatedUser) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        res.status(200).json({ success: true, message: "Profile updated successfully!", user: updatedUser });
    } catch (error) {
        console.error("Update Profile Error:", error);
        res.status(500).json({ success: false, message: "Server error while updating profile." });
    }
};

/* =======================================================
   ৭. প্রোফাইল ছবি আপডেট করা (Update Avatar)
   ======================================================= */
exports.updateUserAvatar = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No image file provided." });
        }

        // Sharp দিয়ে ইমেজ ৩০০x৩০০ স্কয়ার ও কম্প্রেস করা হলো
        const compressedBuffer = await sharp(req.file.buffer)
            .resize({ width: 300, height: 300, fit: 'cover' }) 
            .jpeg({ quality: 70 }) 
            .toBuffer();

        // ক্লাউডিনারিতে আপলোড স্ট্রিম
        cloudinary.uploader.upload_stream(
            { folder: 'eOnlineBazar/avatars' },
            async (error, result) => {
                if (error) {
                    console.error("Cloudinary Upload Error:", error);
                    return res.status(500).json({ success: false, message: "Cloudinary upload failed." });
                }

                try {
                    const avatarUrl = result.secure_url;
                    const publicId = result.public_id; 

                    // পুরনো ছবি ক্লাউডিনারি থেকে ডিলিট করা
                    const oldUser = await User.findById(req.user.id);
                    if (oldUser && oldUser.avatarPublicId) {
                        await cloudinary.uploader.destroy(oldUser.avatarPublicId);
                        console.log("✅ Old avatar successfully deleted from Cloudinary");
                    }

                    // ডাটাবেজে আপডেট করা
                    const updatedUser = await User.findByIdAndUpdate(
                        req.user.id, 
                        { 
                            avatar: avatarUrl,
                            avatarPublicId: publicId 
                        },
                        { returnDocument: 'after' }
                    );

                    if (!updatedUser) {
                        return res.status(404).json({ success: false, message: "User not found in database." });
                    }

                    console.log("🌟 Successfully compressed & saved to MongoDB for User:", updatedUser.name);

                    return res.status(200).json({ 
                        success: true, 
                        message: "Profile photo successfully compressed, updated, and old photo removed!", 
                        avatarUrl 
                    });

                } catch (dbError) {
                    console.error("❌ MongoDB Save Error inside Cloudinary Callback:", dbError);
                    return res.status(500).json({ 
                        success: false, 
                        message: "Image uploaded, but failed to save data in database." 
                    });
                }
            }
        ).end(compressedBuffer); 

    } catch (error) {
        console.error("Avatar Update Error:", error);
        res.status(500).json({ success: false, message: "Server error while uploading avatar." });
    }
};

/* =======================================================
   ৮. বর্তমান পাসওয়ার্ড পরিবর্তন করা (Change Password)
   ======================================================= */
exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User.findById(req.user.id);

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: "Incorrect current password." });
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        res.status(200).json({ success: true, message: "Password changed successfully!" });
    } catch (error) {
        console.error("Change Password Error:", error);
        res.status(500).json({ success: false, message: "Server error while changing password." });
    }
};


/* =======================================================
   ৯. নতুন করে ভেরিফিকেশন মেইল পাঠানো (Resend Verification)
   ======================================================= */
exports.resendVerification = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) return res.status(404).json({ success: false, message: "User not found." });
        if (user.isVerified) return res.status(400).json({ success: false, message: "Account already verified." });

        // নতুন টোকেন তৈরি করুন
        const newVerificationToken = crypto.randomBytes(20).toString('hex');
        user.verificationToken = newVerificationToken;
        await user.save();

        // মেইল পাঠানোর কোড (যা আমরা একটু আগে তৈরি করলাম)
        const verificationUrl = `${req.protocol}://${req.get('host')}/api/customer/verify/${newVerificationToken}`;
        
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: 'eOnlineBazar - Resend Verification Email',
            html: `<p>Click here to verify: <a href="${verificationUrl}">${verificationUrl}</a></p>`
        };

        await transporter.sendMail(mailOptions);

        res.status(200).json({ success: true, message: "Verification email resent successfully!" });

    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to resend email." });
    }
};


/* =======================================================
   ১০. উইশলিস্ট ম্যানেজমেন্ট (My Wishlist - persists until removed)
   ======================================================= */

// ১০.ক. ইউজারের উইশলিস্ট দেখা
exports.getWishlist = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('wishlist');
        if (!user) return res.status(404).json({ success: false, message: "User not found." });
        res.status(200).json({ success: true, wishlist: user.wishlist || [] });
    } catch (error) {
        console.error("Get Wishlist Error:", error);
        res.status(500).json({ success: false, message: "Failed to load wishlist." });
    }
};

// ১০.খ. উইশলিস্টে নতুন আইটেম যুক্ত করা (একই প্রোডাক্ট দুইবার যোগ হবে না)
exports.addToWishlist = async (req, res) => {
    try {
        const { productId, name, price, image, icon } = req.body;
        if (!productId) {
            return res.status(400).json({ success: false, message: "Product ID is required." });
        }

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        const alreadyExists = user.wishlist.some(item => String(item.productId) === String(productId));
        if (alreadyExists) {
            return res.status(200).json({ success: true, message: "Already in your wishlist.", wishlist: user.wishlist });
        }

        user.wishlist.unshift({
            productId,
            name: name || '',
            price: Number(price) || 0,
            image: image || '',
            icon: icon || '📦'
        });
        await user.save();

        res.status(200).json({ success: true, message: "Added to wishlist!", wishlist: user.wishlist });
    } catch (error) {
        console.error("Add Wishlist Error:", error);
        res.status(500).json({ success: false, message: "Failed to add to wishlist." });
    }
};

// ১০.গ. উইশলিস্ট থেকে আইটেম রিমুভ করা
exports.removeFromWishlist = async (req, res) => {
    try {
        const { productId } = req.params;
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        user.wishlist = user.wishlist.filter(item => String(item.productId) !== String(productId));
        await user.save();

        res.status(200).json({ success: true, message: "Removed from wishlist.", wishlist: user.wishlist });
    } catch (error) {
        console.error("Remove Wishlist Error:", error);
        res.status(500).json({ success: false, message: "Failed to remove from wishlist." });
    }
};


/* =======================================================
   ১১. ঠিকানা ম্যানেজমেন্ট (Addresses - Add / Update / Delete)
   ======================================================= */

// ১১.ক. সব ঠিকানা দেখা
exports.getAddresses = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('addresses');
        if (!user) return res.status(404).json({ success: false, message: "User not found." });
        res.status(200).json({ success: true, addresses: user.addresses || [] });
    } catch (error) {
        console.error("Get Addresses Error:", error);
        res.status(500).json({ success: false, message: "Failed to load addresses." });
    }
};

// ১১.খ. নতুন ঠিকানা যুক্ত করা
exports.addAddress = async (req, res) => {
    try {
        const { label, fullAddress, phone, isDefault } = req.body;
        if (!fullAddress || !fullAddress.trim()) {
            return res.status(400).json({ success: false, message: "Address is required." });
        }

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        const makeDefault = !!isDefault || user.addresses.length === 0;
        if (makeDefault) {
            user.addresses.forEach(addr => { addr.isDefault = false; });
        }

        user.addresses.push({
            label: label || 'Home',
            fullAddress: fullAddress.trim(),
            phone: phone || '',
            isDefault: makeDefault
        });

        // ডিফল্ট ঠিকানা থাকলে সেটি মূল address ফিল্ডেও সিঙ্ক হবে (চেকআউট অটো-ফিলের জন্য)
        if (makeDefault) user.address = fullAddress.trim();

        await user.save();
        res.status(200).json({ success: true, message: "Address added successfully!", addresses: user.addresses });
    } catch (error) {
        console.error("Add Address Error:", error);
        res.status(500).json({ success: false, message: "Failed to add address." });
    }
};

// ১১.গ. ঠিকানা আপডেট করা
exports.updateAddress = async (req, res) => {
    try {
        const { addressId } = req.params;
        const { label, fullAddress, phone, isDefault } = req.body;

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        const target = user.addresses.id(addressId);
        if (!target) return res.status(404).json({ success: false, message: "Address not found." });

        if (label !== undefined) target.label = label;
        if (fullAddress !== undefined) target.fullAddress = fullAddress.trim();
        if (phone !== undefined) target.phone = phone;

        if (isDefault) {
            user.addresses.forEach(addr => { addr.isDefault = false; });
            target.isDefault = true;
            user.address = target.fullAddress;
        }

        await user.save();
        res.status(200).json({ success: true, message: "Address updated successfully!", addresses: user.addresses });
    } catch (error) {
        console.error("Update Address Error:", error);
        res.status(500).json({ success: false, message: "Failed to update address." });
    }
};

// ১১.ঘ. ঠিকানা ডিলিট করা
exports.deleteAddress = async (req, res) => {
    try {
        const { addressId } = req.params;
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        const target = user.addresses.id(addressId);
        if (!target) return res.status(404).json({ success: false, message: "Address not found." });

        const wasDefault = target.isDefault;
        target.deleteOne();

        // ডিফল্ট মুছে ফেললে প্রথম ঠিকানাটিকে নতুন ডিফল্ট করা হবে
        if (wasDefault && user.addresses.length > 0) {
            user.addresses[0].isDefault = true;
            user.address = user.addresses[0].fullAddress;
        } else if (user.addresses.length === 0) {
            user.address = '';
        }

        await user.save();
        res.status(200).json({ success: true, message: "Address deleted successfully!", addresses: user.addresses });
    } catch (error) {
        console.error("Delete Address Error:", error);
        res.status(500).json({ success: false, message: "Failed to delete address." });
    }
};


/* =======================================================
   ১২. পয়েন্ট কনভার্সন (Loyalty Points → Wallet Balance)
   রেট: ১০০ পয়েন্ট = ৳১০ (অর্থাৎ ১ পয়েন্ট = ৳০.১)
   ======================================================= */
exports.convertPoints = async (req, res) => {
    try {
        const pointsToConvert = Number(req.body.points);

        if (!pointsToConvert || pointsToConvert <= 0) {
            return res.status(400).json({ success: false, message: "Please enter a valid number of points." });
        }
        if (pointsToConvert < 100) {
            return res.status(400).json({ success: false, message: "Minimum 100 points are required to convert." });
        }
        if (pointsToConvert % 100 !== 0) {
            return res.status(400).json({ success: false, message: "Points must be in multiples of 100." });
        }

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        if (user.loyaltyPoints < pointsToConvert) {
            return res.status(400).json({ success: false, message: `You only have ${user.loyaltyPoints} points.` });
        }

        const cashValue = (pointsToConvert / 100) * 10; // ১০০ পয়েন্ট = ৳১০

        user.loyaltyPoints -= pointsToConvert;
        user.walletBalance += cashValue;
        user.walletHistory.unshift({
            type: 'conversion',
            amount: cashValue,
            note: `Converted ${pointsToConvert} points to wallet balance`
        });

        await user.save();

        res.status(200).json({
            success: true,
            message: `Successfully converted ${pointsToConvert} points to ৳${cashValue}!`,
            walletBalance: user.walletBalance,
            loyaltyPoints: user.loyaltyPoints,
            walletHistory: user.walletHistory
        });
    } catch (error) {
        console.error("Convert Points Error:", error);
        res.status(500).json({ success: false, message: "Server error during points conversion." });
    }
};


/* =======================================================
   ১৩. সেশন / অ্যাক্টিভ ডিভাইস ম্যানেজমেন্ট (Security)
   ======================================================= */

// ১৩.ক. সব অ্যাক্টিভ সেশন দেখা (বর্তমান ডিভাইস চিহ্নিত করা সহ)
exports.getSessions = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('sessions');
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        const currentSid = req.user.sid;
        const sessions = (user.sessions || [])
            .map(s => ({
                _id: s._id,
                device: s.device,
                browser: s.browser,
                ip: s.ip,
                location: s.location,
                createdAt: s.createdAt,
                lastActive: s.lastActive,
                isCurrent: currentSid ? String(s._id) === String(currentSid) : false
            }))
            .sort((a, b) => new Date(b.lastActive) - new Date(a.lastActive));

        res.status(200).json({ success: true, sessions });
    } catch (error) {
        console.error("Get Sessions Error:", error);
        res.status(500).json({ success: false, message: "Failed to load active sessions." });
    }
};

// ১৩.খ. নির্দিষ্ট একটি সেশন রিমোট লগআউট করা
exports.logoutSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        const target = user.sessions.id(sessionId);
        if (!target) return res.status(404).json({ success: false, message: "Session not found or already logged out." });

        const isCurrent = req.user.sid && String(sessionId) === String(req.user.sid);
        target.deleteOne();
        await user.save();

        res.status(200).json({
            success: true,
            message: isCurrent ? "This device has been logged out." : "Device logged out remotely.",
            loggedOutCurrent: isCurrent
        });
    } catch (error) {
        console.error("Logout Session Error:", error);
        res.status(500).json({ success: false, message: "Failed to log out the device." });
    }
};






