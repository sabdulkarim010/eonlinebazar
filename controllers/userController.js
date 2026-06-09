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

// টেস্ট রাউট
exports.testUserRoute = (req, res) => {
    res.status(200).json({ message: "User Controller is ready!" });
};



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

        const token = jwt.sign(
            { id: user._id }, 
            process.env.JWT_SECRET || 'eOnlineBazarSecretKey123', 
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
        const contactNumber = mobile || phone;

        const updatedUser = await User.findByIdAndUpdate(
            req.user.id,
            { name, mobile: contactNumber, address },
            { returnDocument: 'after', runValidators: true } 
        ).select('-password');

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






