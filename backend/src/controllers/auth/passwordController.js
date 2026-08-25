/**
 * EonlineBazar — Customer Password Controller
 * Extracted from: controllers/authController.js
 * Routes that use this: routes/authRoutes.js, routes/userRoutes.js
 *
 * When adding new endpoints:
 * 1. Add handler here
 * 2. Export from barrel (original controller file)
 * 3. Add route in routes/[file].routes.js
 */

const bcrypt = require('bcryptjs');
const User = require('../../models/user');
const { sendEmail } = require('../../utils/sendEmail');

const {
    MIN_PASSWORD_LENGTH,
    EMAIL_RE,
    escapeHtml,
    normalizeEmail,
    buildPasswordResetEmailHtml
} = require('./authHelpers');

/* =======================================================
   ৩. ফরগেট পাসওয়ার্ড - OTP পাঠানো (Forgot Password)
   ======================================================= */
exports.forgotPassword = async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);

        if (!email || !EMAIL_RE.test(email)) {
            return res.status(400).json({ success: false, message: "Please enter a valid email address." });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ success: false, message: "No account found with this email." });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        user.resetPasswordOtp = otp;
        user.resetPasswordExpires = Date.now() + 15 * 60 * 1000;
        await user.save();

        await sendEmail({
            to: user.email,
            subject: 'eOnlineBazar - Password reset code',
            html: buildPasswordResetEmailHtml(escapeHtml(user.name || user.firstName || 'Customer'), otp)
        });

        return res.status(200).json({ success: true, message: "OTP sent to your email successfully." });

    } catch (error) {
        console.error("Forgot Password Error:", error);
        return res.status(503).json({ success: false, message: "Failed to send OTP. Please try again." });
    }
};

/* =======================================================
   ৪. নতুন পাসওয়ার্ড সেট করা (Reset Password)
   ======================================================= */
exports.resetPassword = async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const otp = String(req.body.otp || '').trim();
        const newPassword = req.body.newPassword == null ? '' : String(req.body.newPassword);

        if (!email || !otp || !newPassword) {
            return res.status(400).json({ success: false, message: "Email, OTP, and new password are required." });
        }

        if (newPassword.length < MIN_PASSWORD_LENGTH) {
            return res.status(400).json({ success: false, message: "Password must be at least 6 characters." });
        }

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
