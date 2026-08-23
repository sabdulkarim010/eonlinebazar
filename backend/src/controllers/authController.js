/********************************************************************
 * Project: EonlineBazar
 * File: authController.js
 * Location: controllers/authController.js
 * Author: Abdul Karim Sheikh
 * Description: Customer registration, login, password reset, email verification,
 * Google OAuth, and active-device session management. Backed by the dedicated
 * UserSession collection. Deleting a session here instantly invalidates that
 * device's JWT on its next request (enforced inside authMiddleware.verifyUser).
 ********************************************************************/

const mongoose = require('mongoose');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const requestIp = require('request-ip');
const geoip = require('geoip-lite');
const User = require('../models/user');
const Cart = require('../models/cart');
const UserSession = require('../models/userSession');
const { logSecurityEvent } = require('../utils/securityLogger');
const { isValidDistrict, resolveDistrictLabel } = require('../utils/bangladeshDistricts');
const {
    mergeGuestCartIntoUserCart,
    normalizeGuestCartItems,
    resolveGuestCartFromRequest,
    toClientCartItem
} = require('../services/cartMergeService');
const { isSandboxMode } = require('../services/sandboxService');
const { sendEmail } = require('../utils/sendEmail');

const JWT_SECRET = process.env.JWT_SECRET;

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

function getClientIp(req) {
    const detected = requestIp.getClientIp(req);
    if (detected) return detected;
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) return fwd.split(',')[0].trim();
    return (req.socket && req.socket.remoteAddress) || req.ip || '';
}

function getLocationFromIp(rawIp = '') {
    try {
        const ip = String(rawIp).replace('::ffff:', '').trim();
        if (!ip) return 'Unknown Location';

        if (
            ip === '127.0.0.1' || ip === '::1' ||
            ip.startsWith('10.') || ip.startsWith('192.168.') ||
            /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
        ) {
            return 'Local Network';
        }

        const geo = geoip.lookup(ip);
        if (!geo) return 'Unknown Location';

        let countryName = geo.country || '';
        try {
            const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
            countryName = regionNames.of(geo.country) || geo.country;
        } catch (_) { /* ignore */ }

        const parts = [geo.city, countryName].filter(Boolean);
        return parts.length ? parts.join(', ') : 'Unknown Location';
    } catch (err) {
        return 'Unknown Location';
    }
}

async function createCustomerLoginSession(req, user) {
    const { device, browser } = parseUserAgent(req.headers['user-agent']);
    const sessionId = crypto.randomUUID();
    const clientIp = getClientIp(req);

    await UserSession.create({
        sessionId,
        userId: user._id,
        userAgent: req.headers['user-agent'] || '',
        device,
        browser,
        ipAddress: clientIp,
        location: getLocationFromIp(clientIp)
    });

    const token = jwt.sign(
        { id: user._id, sid: sessionId },
        JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    await logSecurityEvent({
        action: 'Customer Login Success',
        actor: user.email,
        actorType: 'customer',
        ipAddress: clientIp,
        details: `${device} · ${browser} (Google OAuth)`
    });

    return token;
}


/* =======================================================
   ১. বর্তমান ইউজারের সব অ্যাক্টিভ সেশন দেখা
   বর্তমান রিকোয়েস্টের সেশনটি req.user.sid দিয়ে চিহ্নিত করা হয়
   GET /api/auth/sessions
   ======================================================= */
exports.getSessions = async (req, res) => {
    try {
        const currentSid = req.user.sid;

        const sessions = await UserSession
            .find({ userId: req.user.id })
            .sort({ lastActiveAt: -1 })
            .lean();

        const data = sessions.map(s => ({
            id: s._id,
            sessionId: s.sessionId,
            device: s.device,
            browser: s.browser,
            ip: s.ipAddress,
            location: s.location || 'Unknown Location',
            userAgent: s.userAgent,
            createdAt: s.createdAt,
            lastActiveAt: s.lastActiveAt,
            isCurrent: currentSid ? s.sessionId === currentSid : false
        }));

        res.status(200).json({ success: true, sessions: data });
    } catch (error) {
        console.error("Get Sessions Error:", error);
        res.status(500).json({ success: false, message: "Failed to load active sessions." });
    }
};

/* =======================================================
   ২. নির্দিষ্ট একটি সেশন রিমোট লগআউট করা
   :id হিসেবে ডাটাবেজ _id অথবা sessionId — দুটোই গ্রহণযোগ্য
   DELETE /api/auth/sessions/:id
   ======================================================= */
exports.deleteSession = async (req, res) => {
    try {
        const { id } = req.params;

        // ইউজার শুধু নিজের সেশনই মুছতে পারবে (ownership guard)
        const orMatch = [{ sessionId: id }];
        if (mongoose.Types.ObjectId.isValid(id)) {
            orMatch.push({ _id: id });
        }

        const target = await UserSession.findOne({ userId: req.user.id, $or: orMatch });
        if (!target) {
            return res.status(404).json({ success: false, message: "Session not found or already logged out." });
        }

        const isCurrent = req.user.sid && target.sessionId === req.user.sid;
        await target.deleteOne();

        res.status(200).json({
            success: true,
            message: isCurrent ? "This device has been logged out." : "Device logged out remotely.",
            loggedOutCurrent: !!isCurrent
        });
    } catch (error) {
        console.error("Delete Session Error:", error);
        res.status(500).json({ success: false, message: "Failed to log out the device." });
    }
};

/* =======================================================
   ৩. বর্তমান ডিভাইস বাদে অন্য সব ডিভাইস লগআউট করা
   POST /api/auth/sessions/logout-others
   ======================================================= */
exports.logoutOtherSessions = async (req, res) => {
    try {
        const currentSid = req.user.sid;
        if (!currentSid) {
            return res.status(400).json({ success: false, message: "Current session could not be identified." });
        }

        const result = await UserSession.deleteMany({
            userId: req.user.id,
            sessionId: { $ne: currentSid }
        });

        res.status(200).json({
            success: true,
            message: result.deletedCount > 0
                ? `Logged out ${result.deletedCount} other device(s) successfully.`
                : "No other active devices found.",
            removed: result.deletedCount
        });
    } catch (error) {
        console.error("Logout Other Sessions Error:", error);
        res.status(500).json({ success: false, message: "Failed to log out other devices." });
    }
};

exports.getGoogleAuthStatus = (req, res) => {
    res.status(200).json({
        configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    });
};

exports.handleGoogleCallback = async (req, res, next) => {
    try {
        const user = req.user;

        if (!user) {
            return res.redirect('/login?error=google_failed');
        }

        if (user.accountStatus === 'blocked') {
            return res.redirect('/login?error=google_failed');
        }
        if (user.accountStatus === 'suspended') {
            return res.redirect('/login?error=google_failed');
        }

        user.lastLogin = new Date();
        await user.save();

        const token = await createCustomerLoginSession(req, user);
        return res.redirect(`/login?token=${encodeURIComponent(token)}&google=true`);
    } catch (error) {
        console.error('Google OAuth callback error:', error);
        return res.redirect('/login?error=google_failed');
    }
};

const VERIFICATION_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 6;
const BD_MOBILE_RE = /^01[3-9]\d{8}$/;
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function normalizeMobile(value) {
    return String(value || '').replace(/\D/g, '');
}

function isDuplicateKeyError(error) {
    if (!error) return false;
    if (error.code === 11000 || error.code === '11000') return true;
    return error.name === 'MongoServerError' && /E11000/i.test(String(error.message || ''));
}

function firstValidationMessage(error) {
    const first = error && error.errors ? Object.values(error.errors)[0] : null;
    return (first && first.message) || 'Please check your details and try again.';
}

function buildVerificationUrl(token) {
    const base = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
    return `${base}/api/customer/verify/${token}`;
}

function buildVerificationEmailHtml(userName, verificationUrl) {
    return `
        <div style="font-family: Arial, Helvetica, sans-serif; max-width: 520px; margin: auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
            <div style="background: #0f172a; padding: 22px; text-align: center;">
                <h2 style="color: #f8fafc; margin: 0;">eOnlineBazar</h2>
                <p style="color: #94a3b8; margin: 6px 0 0; font-size: 13px;">Verify your email address</p>
            </div>
            <div style="padding: 28px;">
                <p style="color:#111827; margin: 0 0 12px;">Dear <b>${userName}</b>,</p>
                <p style="color:#374151; margin: 0 0 8px;">Thank you for creating an account. Confirm your email to activate it and start shopping.</p>
                <div style="text-align: center; margin: 28px 0;">
                    <a href="${verificationUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 26px; text-decoration: none; border-radius: 8px; font-weight: 700; display: inline-block;">Verify Email Address</a>
                </div>
                <p style="color: #6b7280; font-size: 12px; margin: 0 0 8px;">If the button does not work, copy and paste this link into your browser:</p>
                <p style="color: #2563eb; font-size: 12px; word-break: break-all; margin: 0 0 16px;">${verificationUrl}</p>
                <p style="color: #6b7280; font-size: 12px; margin: 0;">This link expires in 48 hours.</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="color: #9ca3af; font-size: 11px; text-align: center; margin: 0;">This is an automated email. Please do not reply.</p>
            </div>
        </div>
    `;
}

function buildPasswordResetEmailHtml(userName, otp) {
    return `
        <div style="font-family: Arial, Helvetica, sans-serif; max-width: 520px; margin: auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
            <div style="background: #0f172a; padding: 22px; text-align: center;">
                <h2 style="color: #f8fafc; margin: 0;">eOnlineBazar</h2>
                <p style="color: #94a3b8; margin: 6px 0 0; font-size: 13px;">Password reset</p>
            </div>
            <div style="padding: 28px;">
                <p style="color:#111827; margin: 0 0 12px;">Dear <b>${userName}</b>,</p>
                <p style="color:#374151; margin: 0 0 8px;">Use this one-time code to reset your password:</p>
                <div style="text-align:center; margin: 26px 0;">
                    <span style="display:inline-block; font-size: 32px; letter-spacing: 8px; font-weight: 800; color:#0f172a; background:#f1f5f9; padding: 14px 26px; border-radius: 10px; border:1px dashed #cbd5e1;">${otp}</span>
                </div>
                <p style="color:#dc2626; font-size: 13px; text-align:center; margin: 0;"><i>This code is valid for 15 minutes. Do not share it with anyone.</i></p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="color: #9ca3af; font-size: 11px; text-align: center; margin: 0;">If you did not request this, you can ignore this email.</p>
            </div>
        </div>
    `;
}

async function sendVerificationEmail(user, token, subject = 'Verify your eOnlineBazar account') {
    const verificationUrl = buildVerificationUrl(token);
    const displayName = escapeHtml(user.name || user.firstName || 'Customer');
    await sendEmail({
        to: user.email,
        subject,
        html: buildVerificationEmailHtml(displayName, verificationUrl)
    });
}

function wantsJsonResponse(req) {
    return req.query.format === 'json' || req.accepts(['html', 'json']) === 'json';
}

function buildVerificationResultHtml({ success, title, message }) {
    const accent = success ? '#2563eb' : '#dc2626';
    const icon = success ? '✓' : '!';
    const loginUrl = `${(process.env.FRONTEND_URL || '').replace(/\/$/, '')}/login`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} — eOnlineBazar</title>
</head>
<body style="margin:0;padding:40px 16px;font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,0.08);">
        <div style="background:${accent};padding:28px;text-align:center;">
            <div style="width:64px;height:64px;margin:0 auto 16px;border-radius:50%;background:rgba(255,255,255,0.18);color:#fff;font-size:32px;line-height:64px;font-weight:700;">${icon}</div>
            <h1 style="margin:0;color:#fff;font-size:24px;">${title}</h1>
        </div>
        <div style="padding:28px;">
            <p style="margin:0 0 20px;line-height:1.6;color:#334155;font-size:16px;">${message}</p>
            ${success ? `<div style="text-align:center;margin-top:24px;">
                <a href="${loginUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;">Go to Login</a>
            </div>` : ''}
        </div>
    </div>
</body>
</html>`;
}

function respondVerification(req, res, { statusCode, success, message, extra = {} }) {
    const payload = { success, message, ...extra };
    if (wantsJsonResponse(req)) {
        return res.status(statusCode).json(payload);
    }
    const title = success ? 'Email Verified' : 'Verification Failed';
    return res.status(statusCode).type('html').send(buildVerificationResultHtml({ success, title, message }));
}

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
   ২. ইউজার লগিন (Login)
   ======================================================= */
exports.loginUser = async (req, res) => {
    try {
        const loginInput = (req.body.loginInput || req.body.email || '').trim();
        const { password } = req.body;

        if (!loginInput || !password) {
            return res.status(400).json({ success: false, message: "Invalid email or password." });
        }

        const digitsOnly = loginInput.replace(/\D/g, '');
        const mobileLookup = /^01[3-9]\d{8}$/.test(digitsOnly) ? digitsOnly : loginInput;

        const user = await User.findOne({
            $or: [
                { email: loginInput.toLowerCase() },
                { mobile: mobileLookup }
            ]
        });

        if (!user) {
            await logSecurityEvent({
                action: 'Customer Login Failed',
                actor: loginInput || 'unknown',
                actorType: 'customer',
                ipAddress: getClientIp(req),
                details: 'Unknown email or mobile number'
            });
            return res.status(400).json({ success: false, message: "Invalid email or password." });
        }

        if (!user.password) {
            return res.status(400).json({
                success: false,
                message: "This account uses Google sign-in. Please log in with Google."
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            await logSecurityEvent({
                action: 'Customer Login Failed',
                actor: user.email,
                actorType: 'customer',
                ipAddress: getClientIp(req),
                details: 'Invalid password'
            });
            return res.status(401).json({
                success: false,
                message: "Invalid email or password.",
                userEmail: user.email
            });
        }

        if (user.accountStatus === 'blocked') {
            await logSecurityEvent({
                action: 'Customer Login Blocked',
                actor: user.email,
                actorType: 'customer',
                ipAddress: getClientIp(req),
                details: 'Blocked account login attempt'
            });
            return res.status(403).json({ success: false, message: "Your account has been blocked. Please contact support." });
        }
        if (user.accountStatus === 'suspended') {
            await logSecurityEvent({
                action: 'Customer Login Suspended',
                actor: user.email,
                actorType: 'customer',
                ipAddress: getClientIp(req),
                details: 'Suspended account login attempt'
            });
            return res.status(403).json({ success: false, message: "Your account is temporarily suspended. Please contact support." });
        }

        if (process.env.REQUIRE_EMAIL_VERIFICATION !== 'false' && !user.isVerified) {
            return res.status(403).json({
                success: false,
                message: 'Please verify your email before logging in. Check your inbox or resend the verification email.',
                needsVerification: true,
                email: user.email
            });
        }

        // 🌟 লগইন সেশন তৈরি করা (অ্যাক্টিভ ডিভাইস ট্র্যাকিং ও রিমোট লগআউটের জন্য)
        // ইউনিক UUID সেশন আইডি জেনারেট করে আলাদা UserSession কালেকশনে সেভ করা হয়;
        // এই sessionId-ই JWT-এর ভেতরে 'sid' হিসেবে এম্বেড হয়।
        const { device, browser } = parseUserAgent(req.headers['user-agent']);
        const sessionId = crypto.randomUUID();
        const clientIp = getClientIp(req);

        await UserSession.create({
            sessionId,
            userId: user._id,
            userAgent: req.headers['user-agent'] || '',
            device,
            browser,
            ipAddress: clientIp,
            location: getLocationFromIp(clientIp)
        });

        const token = jwt.sign(
            { id: user._id, sid: sessionId }, 
            JWT_SECRET, 
            { expiresIn: '7d' } 
        );

        await logSecurityEvent({
            action: 'Customer Login Success',
            actor: user.email,
            actorType: 'customer',
            ipAddress: clientIp,
            details: `${device} · ${browser}`
        });

        let cartPayload = { merged: false, itemCount: 0, items: [] };
        try {
            const guestCartRaw = resolveGuestCartFromRequest(req);
            const guestItems = normalizeGuestCartItems(guestCartRaw);

            if (guestItems.length > 0) {
                const mergedCart = await mergeGuestCartIntoUserCart(user._id, guestItems);
                const mergedItems = (mergedCart.items || []).map(toClientCartItem);
                cartPayload = {
                    merged: true,
                    itemCount: mergedItems.length,
                    items: mergedItems
                };
            } else {
                const existingCart = await Cart.findOne({ userId: user._id });
                const existingItems = (existingCart?.items || []).map(toClientCartItem);
                cartPayload = {
                    merged: false,
                    itemCount: existingItems.length,
                    items: existingItems
                };
            }

            if (req.session?.cart) {
                delete req.session.cart;
            }
        } catch (mergeError) {
            console.error('Guest cart merge failed during login (login continues):', mergeError);
        }

        res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            user: { id: user._id, name: user.name, firstName: user.firstName, lastName: user.lastName, email: user.email, mobile: user.mobile },
            cart: cartPayload
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
