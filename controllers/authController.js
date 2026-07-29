/********************************************************************
 * Project: EonlineBazar
 * File: authController.js
 * Location: controllers/authController.js
 * Author: Abdul Karim Sheikh
 * Description: Active Devices & Sessions management for logged-in
 * users. Backed by the dedicated UserSession collection. Deleting a
 * session here instantly invalidates that device's JWT on its next
 * request (enforced inside authMiddleware.verifyUser).
 ********************************************************************/

const mongoose = require('mongoose');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const requestIp = require('request-ip');
const geoip = require('geoip-lite');
const UserSession = require('../models/userSession');
const { logSecurityEvent } = require('../utils/securityLogger');

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
