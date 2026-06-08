const User = require('../models/user');
const bcrypt = require('bcryptjs'); // পাসওয়ার্ড সিকিউর (হ্যাশ) করার জন্য
const jwt = require('jsonwebtoken'); // লগিন সেশন ধরে রাখার জন্য
const nodemailer = require('nodemailer'); // ইমেইল পাঠানোর জন্য
const crypto = require('crypto'); // ভেরিফিকেশন টোকেন বানানোর জন্য

// 🌟 ইমেইল পাঠানোর কনফিগারেশন (আপনার জিমেইল ও অ্যাপ পাসওয়ার্ড বসাতে হবে .env ফাইলে)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, // উদাহরণ: আপনার জিমেইল
        pass: process.env.EMAIL_PASS  // উদাহরণ: জিমেইলের App Password
    }
});

// আগের টেস্ট রাউট (আপনার কোডটি রেখে দিলাম)
exports.testUserRoute = (req, res) => {
    res.status(200).json({ message: "User Controller is ready!" });
};

/* =======================================================
   ১. ইউজার রেজিস্ট্রেশন (Register)
   ======================================================= */
exports.registerUser = async (req, res) => {
    try {
        const { name, mobile, email, password } = req.body;

        // চেক করা এই ইমেইল আগে থেকেই আছে কি না
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: "Email already exists!" });
        }

        // পাসওয়ার্ড এনক্রিপ্ট বা হ্যাশ করা
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // ইমেইল ভেরিফিকেশনের জন্য টোকেন তৈরি
        const verificationToken = crypto.randomBytes(20).toString('hex');

        const newUser = new User({
            name,
            mobile,
            email,
            password: hashedPassword,
            verificationToken
        });

        await newUser.save();

        // 💡 (ভবিষ্যতে এখানে ইমেইলে ভেরিফিকেশন লিংক পাঠানোর কোড অ্যাড করা যাবে)

        res.status(201).json({ success: true, message: "Registration successful! Please verify your email." });

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

        // ডাটাবেজে ইউজার খোঁজা
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ success: false, message: "Invalid email or password." });
        }

        // পাসওয়ার্ড মেলানো
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: "Invalid email or password." });
        }

        // JWT টোকেন জেনারেট করা (যাতে ইউজার লগিন থাকে)
        const token = jwt.sign(
            { id: user._id }, 
            process.env.JWT_SECRET || 'eOnlineBazarSecretKey123', 
            { expiresIn: '7d' } // ৭ দিন লগিন থাকবে
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

        // ৬ ডিজিটের রেন্ডম OTP তৈরি
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // ডাটাবেজে OTP এবং মেয়াদ (১৫ মিনিট) সেভ করা
        user.resetPasswordOtp = otp;
        user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 mins
        await user.save();

        // ইমেইল পাঠানোর ডিজাইন
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

        // ইমেইল সেন্ড করা
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

        // ইউজার খুঁজবো যার ইমেইল, OTP মিলবে এবং OTP এর মেয়াদ এখনো আছে
        const user = await User.findOne({ 
            email,
            resetPasswordOtp: otp,
            resetPasswordExpires: { $gt: Date.now() } // বর্তমান সময়ের চেয়ে এক্সপায়ারি টাইম বেশি হতে হবে
        });

        if (!user) {
            return res.status(400).json({ success: false, message: "Invalid or expired OTP." });
        }

        // নতুন পাসওয়ার্ড হ্যাশ করা
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);

        // কাজ শেষ, তাই OTP ডাটাবেজ থেকে মুছে ফেলা
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
        // req.user.id আসবে আমাদের verifyUser মিডলওয়্যার থেকে
        const user = await User.findById(req.user.id).select('-password'); // পাসওয়ার্ড বাদে সব ডাটা নিবো
        
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
        const { name, phone, address } = req.body;
        
        const updatedUser = await User.findByIdAndUpdate(
            req.user.id,
            { name, phone, address },
            { returnDocument: 'after', runValidators: true } // 🌟 ফিক্স: টার্মিনালের ওয়ার্নিং দূর করতে 'returnDocument' ব্যবহার করা হলো
        ).select('-password');

        res.status(200).json({ success: true, message: "Profile updated successfully!", user: updatedUser });
    } catch (error) {
        console.error("Update Profile Error:", error);
        res.status(500).json({ success: false, message: "Server error while updating profile." });
    }
};


/* =======================================================
   ৭. প্রোফাইল ছবি আপডেট করা (Update Avatar) - বাফার লজিকসহ (Fixed)
   ======================================================= */
const cloudinary = require('cloudinary').v2;

exports.updateUserAvatar = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No image file provided." });
        }

        // মেমোরি বাফার থেকে ক্লাউডিনারিতে সরাসরি আপলোড করার প্রফেশনাল লজিক
        cloudinary.uploader.upload_stream(
            { folder: 'eOnlineBazar/avatars' },
            async (error, result) => {
                // ১. ক্লাউডিনারি আপলোড এরর চেক
                if (error) {
                    console.error("Cloudinary Upload Error:", error);
                    return res.status(500).json({ success: false, message: "Cloudinary upload failed." });
                }

                // ২. 🌟 ক্লাউডিনারি সফল হওয়ার পর, ডাটাবেজ সেভ করার জন্য আলাদা try-catch
                try {
                    const avatarUrl = result.secure_url;
                    console.log("Cloudinary Upload Success URL:", avatarUrl); // টার্মিনালে চেক করার জন্য

                    // MongoDB ডাটাবেজে ইউজারের 'avatar' ফিল্ড আপডেট করা হচ্ছে
                    const updatedUser = await User.findByIdAndUpdate(
                        req.user.id, 
                        { avatar: avatarUrl },
                        { returnDocument: 'after' }
                    );

                    if (!updatedUser) {
                        console.log("User not found with ID:", req.user.id);
                        return res.status(404).json({ success: false, message: "User not found in database." });
                    }

                    console.log("🌟 Successfully saved to MongoDB for User:", updatedUser.name);

                    // ৩. সফলভাবে ডাটাবেজে সেভ হলে ফ্রন্টএন্ডে রেসপন্স পাঠানো
                    return res.status(200).json({ 
                        success: true, 
                        message: "Profile photo updated and saved to MongoDB!", 
                        avatarUrl 
                    });

                } catch (dbError) {
                    // 🌟 ডাটাবেজে সেভ করার সময় কোনো এরর হলে তা সরাসরি টার্মিনালে প্রিন্ট হবে
                    console.error("❌ MongoDB Save Error inside Cloudinary Callback:", dbError);
                    return res.status(500).json({ 
                        success: false, 
                        message: "Image uploaded to Cloudinary, but failed to save in MongoDB." 
                    });
                }
            }
        ).end(req.file.buffer); 

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

        // বর্তমান পাসওয়ার্ড সঠিক কি না চেক করা
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: "Incorrect current password." });
        }

        // নতুন পাসওয়ার্ড হ্যাশ করে সেভ করা
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        res.status(200).json({ success: true, message: "Password changed successfully!" });
    } catch (error) {
        console.error("Change Password Error:", error);
        res.status(500).json({ success: false, message: "Server error while changing password." });
    }
};






