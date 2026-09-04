/**
 * EonlineBazar — Customer Login Controller
 * Extracted from: controllers/authController.js
 * Routes that use this: routes/authRoutes.js, routes/userRoutes.js
 *
 * When adding new endpoints:
 * 1. Add handler here
 * 2. Export from barrel (original controller file)
 * 3. Add route in routes/[file].routes.js
 */

const mongoose = require('mongoose');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../../models/user');
const Cart = require('../../models/cart');
const Order = require('../../models/order');
const Note = require('../../models/note');
const UserSession = require('../../models/userSession');
const { logSecurityEvent } = require('../../utils/securityLogger');
const {
    mergeGuestCartIntoUserCart,
    normalizeGuestCartItems,
    resolveGuestCartFromRequest,
    toClientCartItem
} = require('../../services/cartMergeService');

const {
    JWT_SECRET,
    parseUserAgent,
    getClientIp,
    getLocationFromIp
} = require('./authHelpers');

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

        if (user.isDeleted) {
            return res.status(401).json({ success: false, message: "Invalid email or password." });
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
            user: { id: user._id, name: user.name, firstName: user.firstName, lastName: user.lastName, email: user.email, mobile: user.mobile, isVerified: user.isVerified, avatar: user.avatar || user.avatarUrl || '', avatarUrl: user.avatarUrl || user.avatar || null },
            cart: cartPayload
        });

    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ success: false, message: "Server error during login." });
    }
};

/* =======================================================
   ৩. অ্যাকাউন্ট ডিলিট (Play Store in-app deletion)
   DELETE /api/auth/account  and  DELETE /api/customer/account
   ======================================================= */
exports.deleteAccount = async (req, res) => {
    try {
        const userId = req.user.id || req.user._id;
        const { password, reason } = req.body || {};

        const user = await User.findById(userId);
        if (!user || user.isDeleted) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        if (user.password) {
            if (!password) {
                return res.status(400).json({
                    success: false,
                    message: 'Please enter your password to confirm account deletion.'
                });
            }
            const passwordOk = await bcrypt.compare(String(password), user.password);
            if (!passwordOk) {
                return res.status(401).json({
                    success: false,
                    message: 'Incorrect password. Account not deleted.'
                });
            }
        } else {
            const confirm = String(password || req.body.confirm || '').trim().toUpperCase();
            if (confirm !== 'DELETE') {
                return res.status(400).json({
                    success: false,
                    message: 'This account has no password. Type DELETE to confirm account deletion.'
                });
            }
        }

        const deletionReason = String(reason || 'User requested').trim().slice(0, 500);

        await logSecurityEvent({
            action: 'Customer Account Deleted',
            actor: user.email,
            actorType: 'customer',
            ipAddress: getClientIp(req),
            details: deletionReason
        });

        await Order.updateMany(
            { user: userId, status: { $in: ['Pending', 'pending'] } },
            { $set: { status: 'Cancelled', cancelReason: 'Account deleted by user', cancelledBy: 'Customer' } }
        );

        await Promise.all([
            Cart.deleteMany({ userId }),
            UserSession.deleteMany({ userId }),
            Note.deleteMany({ user: userId })
        ]);

        await User.findByIdAndUpdate(userId, {
            firstName: 'Deleted',
            lastName: 'User',
            email: `deleted_${userId}@deleted.invalid`,
            mobile: null,
            phone: '',
            address: '',
            district: '',
            upazila: '',
            thana: '',
            fullAddress: '',
            googleId: null,
            avatar: '',
            avatarUrl: null,
            avatarPublicId: '',
            password: null,
            isVerified: false,
            isDeleted: true,
            deletedAt: new Date(),
            deletionReason,
            accountStatus: 'blocked',
            wishlist: [],
            addresses: [],
            walletHistory: [],
            verificationToken: null,
            verificationTokenExpiry: null,
            resetPasswordOtp: null,
            resetPasswordExpires: null,
            profileUpdateOtp: null,
            profileUpdateOtpExpires: null,
            pendingEmail: null,
            pendingMobile: null
        });

        return res.status(200).json({
            success: true,
            message: 'Your account has been deleted. Personal data has been removed.'
        });
    } catch (err) {
        console.error('Delete Account Error:', err);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete account. Please try again.'
        });
    }
};
