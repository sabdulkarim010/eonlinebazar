/**
 * EonlineBazar — Customer Register Controller
 * Extracted from: controllers/authController.js
 * Routes that use this: routes/authRoutes.js, routes/userRoutes.js
 *
 * When adding new endpoints:
 * 1. Add handler here
 * 2. Export from barrel (original controller file)
 * 3. Add route in routes/[file].routes.js
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../../models/user');
const { isValidDistrict, resolveDistrictLabel } = require('../../utils/bangladeshDistricts');
const { isSandboxMode } = require('../../services/sandboxService');

const {
    VERIFICATION_TOKEN_TTL_MS,
    MIN_PASSWORD_LENGTH,
    BD_MOBILE_RE,
    EMAIL_RE,
    normalizeEmail,
    normalizeMobile,
    isDuplicateKeyError,
    firstValidationMessage,
    sendVerificationEmail,
    wantsJsonResponse,
    buildVerificationResultHtml,
    respondVerification
} = require('./authHelpers');

// টেস্ট রাউট
exports.testUserRoute = (req, res) => {
    res.status(200).json({ message: "User Controller is ready!" });
};

/* =======================================================
   ১. ইউজার রেজিস্ট্রেশন (Register - ফিক্স করা হয়েছে)
   ======================================================= */
exports.registerUser = async (req, res) => {
    try {
        const {
            firstName,
            lastName,
            district,
            upazilaOrThana,
            upazila,
            thana,
            mobile,
            email,
            password
        } = req.body;

        const trimmedFirstName = firstName ? String(firstName).trim() : '';
        const trimmedLastName = lastName ? String(lastName).trim() : '';
        const normalizedEmail = normalizeEmail(email);
        const normalizedMobile = normalizeMobile(mobile);
        const rawPassword = password == null ? '' : String(password);

        if (!trimmedFirstName || !trimmedLastName || !normalizedMobile || !normalizedEmail || !rawPassword) {
            return res.status(400).json({
                success: false,
                message: "First name, last name, mobile, email, and password are required."
            });
        }

        if (!EMAIL_RE.test(normalizedEmail)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid email address."
            });
        }

        if (!BD_MOBILE_RE.test(normalizedMobile)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid Bangladesh mobile number (01XXXXXXXXX)."
            });
        }

        if (rawPassword.length < MIN_PASSWORD_LENGTH) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters."
            });
        }

        const existingUser = await User.findOne({
            $or: [
                { email: normalizedEmail },
                { mobile: normalizedMobile }
            ]
        });
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "User with this email/mobile already exists."
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(rawPassword, salt);

        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationTokenExpiry = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);

        const userPayload = {
            firstName: trimmedFirstName,
            lastName: trimmedLastName,
            mobile: normalizedMobile,
            email: normalizedEmail,
            password: hashedPassword,
            verificationToken,
            verificationTokenExpiry
        };

        const trimmedDistrict = district ? String(district).trim() : '';
        if (trimmedDistrict) {
            if (!isValidDistrict(trimmedDistrict)) {
                return res.status(400).json({
                    success: false,
                    message: "Please select a valid Bangladesh district."
                });
            }
            userPayload.district = resolveDistrictLabel(trimmedDistrict);
        }

        const resolvedUpazila = (upazilaOrThana || upazila || thana)
            ? String(upazilaOrThana || upazila || thana).trim()
            : '';
        if (resolvedUpazila) {
            userPayload.upazila = resolvedUpazila;
            userPayload.thana = resolvedUpazila;
        }

        const inSandbox = await isSandboxMode();
        if (inSandbox) userPayload.isSandbox = true;

        const newUser = new User(userPayload);
        await newUser.save();

        let emailSent = true;
        try {
            await sendVerificationEmail(newUser, verificationToken);
        } catch (emailError) {
            emailSent = false;
            console.error('Verification email failed during registration (registration continues):', emailError);
        }

        return res.status(201).json({
            success: true,
            message: emailSent
                ? "Registration successful! Please check your email to verify your account."
                : "Registration successful, but we could not send the verification email. Please use Resend Verification Email.",
            email: normalizedEmail,
            emailSent,
            needsVerification: true
        });

    } catch (error) {
        console.error("Register Error:", error);

        if (error && error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: firstValidationMessage(error)
            });
        }

        if (isDuplicateKeyError(error)) {
            return res.status(409).json({
                success: false,
                message: "User with this email/mobile already exists."
            });
        }

        return res.status(500).json({ success: false, message: "Server error during registration." });
    }
};

/* =======================================================
   ৮. ইমেইল ভেরিফিকেশন (Verify Email)
   ======================================================= */
exports.verifyEmail = async (req, res) => {
    try {
        const { token } = req.params;

        if (!token) {
            return respondVerification(req, res, {
                statusCode: 400,
                success: false,
                message: 'Verification token is required.'
            });
        }

        const user = await User.findOne({ verificationToken: token });

        if (!user) {
            return respondVerification(req, res, {
                statusCode: 400,
                success: false,
                message: 'Invalid or expired verification link.'
            });
        }

        if (user.isVerified) {
            return respondVerification(req, res, {
                statusCode: 200,
                success: true,
                message: 'Your email is already verified. You can log in now.'
            });
        }

        if (!user.verificationTokenExpiry || user.verificationTokenExpiry < new Date()) {
            return respondVerification(req, res, {
                statusCode: 400,
                success: false,
                message: 'This verification link has expired. Please request a new verification email.'
            });
        }

        user.isVerified = true;
        user.verificationToken = null;
        user.verificationTokenExpiry = null;
        await user.save();

        return respondVerification(req, res, {
            statusCode: 200,
            success: true,
            message: 'Your email has been verified successfully! You can now log in to your account.'
        });
    } catch (error) {
        console.error('Verify Email Error:', error);
        if (wantsJsonResponse(req)) {
            return res.status(500).json({ success: false, message: 'Server error during email verification.' });
        }
        return res.status(500).type('html').send(buildVerificationResultHtml({
            success: false,
            title: 'Verification Failed',
            message: 'Something went wrong while verifying your email. Please try again later.'
        }));
    }
};


/* =======================================================
   ৯. নতুন করে ভেরিফিকেশন মেইল পাঠানো (Resend Verification)
   ======================================================= */
exports.resendVerification = async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();

        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required.' });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        if (user.isVerified) {
            return res.status(400).json({ success: false, message: 'Account already verified.' });
        }

        const newVerificationToken = crypto.randomBytes(32).toString('hex');
        user.verificationToken = newVerificationToken;
        user.verificationTokenExpiry = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);
        await user.save();

        await sendVerificationEmail(
            user,
            newVerificationToken,
            'Verify your eOnlineBazar account'
        );

        return res.status(200).json({
            success: true,
            message: 'Verification email resent successfully!',
            email,
            emailSent: true
        });
    } catch (error) {
        console.error('Resend Verification Error:', error);
        return res.status(503).json({ success: false, message: 'Failed to resend verification email.' });
    }
};
