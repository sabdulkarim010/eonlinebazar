/********************************************************************
 * Project: EonlineBazar — Fortified Admin Security Suite
 * File: adminSecurityController.js
 * Location: controllers/adminSecurityController.js
 * Author: Abdul Karim Sheikh
 * Description: Enterprise-grade admin authentication & security ops:
 *   • 2-step login (password → hashed email OTP) with device/geo capture
 *   • Active admin session tracking + remote logout (single / all others)
 *   • IP blacklist manager (list / manual block / unblock)
 *   • Login history & failed-attempt audit feed
 ********************************************************************/

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const Admin = require('../models/admin');
const AdminSession = require('../models/adminSession');
const BlacklistedIP = require('../models/blacklistedIp');
const LoginAttempt = require('../models/loginAttempt');

const { fingerprint } = require('../utils/deviceParser');
const { sendAdminOtpEmail } = require('../utils/mailer');
const { recordLoginAttempt, findActiveBan } = require('../middlewares/adminSecurity');
const { logSecurityEvent } = require('../utils/securityLogger');

const JWT_SECRET = process.env.JWT_SECRET || 'eOnlineBazarSecretKey123';
const OTP_TTL_MINUTES = 5;

/* helper: mask an email for safe display (a****@gmail.com) */
function maskEmail(email = '') {
    if (!email || !email.includes('@')) return 'your registered email';
    const [name, domain] = email.split('@');
    const visible = name.slice(0, 1);
    return `${visible}${'*'.repeat(Math.max(1, name.length - 1))}@${domain}`;
}

/* ==================================================================
   STEP 1 — Verify username & password, dispatch OTP
   POST /api/admin/login
   ================================================================== */
exports.loginAdmin = async (req, res) => {
    try {
        const username = String(req.body.username || '').trim();
        const password = String(req.body.password || '');
        const fp = fingerprint(req);

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password are required.' });
        }

        let admin = await Admin.findOne({ username });

        // Bootstrap: প্রথমবার সঠিক ক্রেডেনশিয়ালে অ্যাডমিন তৈরি
        if (!admin && username === 'admin' && password === process.env.ADMIN_PASSWORD) {
            admin = new Admin({
                username: 'admin',
                password: process.env.ADMIN_PASSWORD,
                email: process.env.EMAIL_USER || ''
            });
            await admin.save();
        } else if (!admin || admin.password !== password) {
            await recordLoginAttempt({ fingerprint: fp, username, status: 'failed', details: 'Invalid admin credentials' });
            await logSecurityEvent({
                action: 'Admin Login Failed',
                actor: username || 'unknown',
                actorType: 'admin',
                ipAddress: fp.ipAddress,
                details: `Invalid credentials · ${fp.device} · ${fp.location}`
            });
            return res.status(401).json({ success: false, message: 'Invalid username or password.' });
        }

        // 🔐 6-digit OTP তৈরি, হ্যাশ করে সংরক্ষণ, ৫ মিনিট মেয়াদ
        const otp = ('' + crypto.randomInt(100000, 1000000));
        const salt = await bcrypt.genSalt(10);
        admin.loginOtpHash = await bcrypt.hash(otp, salt);
        admin.loginOtpExpires = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
        await admin.save();

        const recipient = admin.email || process.env.EMAIL_USER || '';
        const delivery = await sendAdminOtpEmail({
            to: recipient,
            otp,
            username: admin.username,
            ip: fp.ipAddress,
            location: fp.location,
            expiresInMinutes: OTP_TTL_MINUTES
        });

        // স্বল্পমেয়াদী OTP টোকেন — step 2-এ কোন লগইন সেশন যাচাই হবে তা শনাক্ত করে
        const otpToken = jwt.sign(
            { username: admin.username, scope: 'admin-otp' },
            JWT_SECRET,
            { expiresIn: `${OTP_TTL_MINUTES}m` }
        );

        await recordLoginAttempt({ fingerprint: fp, username: admin.username, status: 'otp_sent', details: 'Password verified — OTP dispatched' });
        await logSecurityEvent({
            action: 'Admin OTP Requested',
            actor: admin.username,
            actorType: 'admin',
            ipAddress: fp.ipAddress,
            details: `2FA challenge sent (${delivery.delivered ? 'email' : 'console'}) · ${fp.device}`
        });

        return res.status(200).json({
            success: true,
            otpRequired: true,
            message: delivery.delivered
                ? `A 6-digit verification code was sent to ${maskEmail(recipient)}.`
                : 'A 6-digit verification code was generated. Check the server console (email not configured).',
            otpToken,
            emailDelivered: delivery.delivered,
            maskedEmail: maskEmail(recipient),
            expiresInMinutes: OTP_TTL_MINUTES
        });
    } catch (error) {
        console.error('Admin Login (Step 1) Error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error during login.' });
    }
};

/* ==================================================================
   STEP 2 — Verify OTP, issue final JWT + create AdminSession
   POST /api/admin/verify-otp
   ================================================================== */
exports.verifyOtp = async (req, res) => {
    try {
        const otp = String(req.body.otp || '').trim();
        const otpToken = String(req.body.otpToken || '');
        const fp = fingerprint(req);

        if (!otp || !otpToken) {
            return res.status(400).json({ success: false, message: 'Verification code and session token are required.' });
        }

        let payload;
        try {
            payload = jwt.verify(otpToken, JWT_SECRET);
        } catch (e) {
            return res.status(401).json({ success: false, message: 'Your verification session has expired. Please log in again.', restart: true });
        }
        if (!payload || payload.scope !== 'admin-otp' || !payload.username) {
            return res.status(401).json({ success: false, message: 'Invalid verification session. Please log in again.', restart: true });
        }

        const admin = await Admin.findOne({ username: payload.username })
            .select('+loginOtpHash +loginOtpExpires');
        if (!admin) {
            return res.status(404).json({ success: false, message: 'Admin account not found.', restart: true });
        }

        if (!admin.loginOtpHash || !admin.loginOtpExpires || admin.loginOtpExpires < new Date()) {
            return res.status(401).json({ success: false, message: 'Your code has expired. Please request a new one.', restart: true });
        }

        const match = await bcrypt.compare(otp, admin.loginOtpHash);
        if (!match) {
            await recordLoginAttempt({ fingerprint: fp, username: admin.username, status: 'otp_failed', details: 'Incorrect OTP entered' });
            await logSecurityEvent({
                action: 'Admin OTP Failed',
                actor: admin.username,
                actorType: 'admin',
                ipAddress: fp.ipAddress,
                details: `Wrong 2FA code · ${fp.device} · ${fp.location}`
            });
            return res.status(401).json({ success: false, message: 'Incorrect verification code. Please try again.' });
        }

        // OTP ওয়ান-টাইম — ব্যবহারের পর মুছে ফেলা
        admin.loginOtpHash = null;
        admin.loginOtpExpires = null;
        await admin.save();

        // 🌟 লগইন সেশন তৈরি (Active Devices + Remote Logout)
        const sessionId = crypto.randomUUID();
        await AdminSession.create({
            sessionId,
            adminUsername: admin.username,
            ipAddress: fp.ipAddress,
            location: fp.location,
            os: fp.os,
            browser: fp.browser,
            deviceType: fp.deviceType,
            device: fp.device,
            userAgent: fp.userAgent,
            status: 'active',
            lastActive: new Date()
        });

        const token = jwt.sign(
            { username: admin.username, role: 'admin', sid: sessionId },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        await recordLoginAttempt({ fingerprint: fp, username: admin.username, status: 'success', details: 'OTP verified — login complete' });
        await logSecurityEvent({
            action: 'Admin Login Success',
            actor: admin.username,
            actorType: 'admin',
            ipAddress: fp.ipAddress,
            details: `2FA verified · ${fp.device} · ${fp.location}`
        });

        return res.status(200).json({
            success: true,
            message: 'Login successful!',
            token,
            image: admin.image
        });
    } catch (error) {
        console.error('Admin Verify OTP (Step 2) Error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error during verification.' });
    }
};

/* ==================================================================
   ACTIVE SESSIONS / DEVICES
   ================================================================== */

// GET /api/admin/sessions
exports.getAdminSessions = async (req, res) => {
    try {
        const currentSid = req.admin && req.admin.sid;
        const sessions = await AdminSession
            .find({ adminUsername: req.admin.username, status: 'active' })
            .sort({ lastActive: -1 })
            .lean();

        const data = sessions.map(s => ({
            id: s._id,
            sessionId: s.sessionId,
            ip: s.ipAddress,
            location: s.location || 'Unknown Location',
            os: s.os,
            browser: s.browser,
            deviceType: s.deviceType,
            device: s.device,
            createdAt: s.createdAt,
            lastActive: s.lastActive,
            isCurrent: currentSid ? s.sessionId === currentSid : false
        }));

        res.status(200).json({ success: true, sessions: data });
    } catch (error) {
        console.error('Get Admin Sessions Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load active sessions.' });
    }
};

// POST /api/admin/sessions/logout/:id  (log out a specific device)
exports.logoutSession = async (req, res) => {
    try {
        const { id } = req.params;
        const orMatch = [{ sessionId: id }];
        if (mongoose.Types.ObjectId.isValid(id)) orMatch.push({ _id: id });

        const target = await AdminSession.findOne({ adminUsername: req.admin.username, $or: orMatch });
        if (!target) {
            return res.status(404).json({ success: false, message: 'Session not found or already logged out.' });
        }

        const isCurrent = req.admin.sid && target.sessionId === req.admin.sid;
        await target.deleteOne();

        await logSecurityEvent({
            action: 'Admin Session Terminated',
            actor: req.admin.username,
            actorType: 'admin',
            ipAddress: fingerprint(req).ipAddress,
            details: isCurrent ? 'Logged out current device' : `Remotely logged out ${target.device} (${target.ipAddress})`
        });

        res.status(200).json({
            success: true,
            message: isCurrent ? 'This device has been logged out.' : 'Device logged out remotely.',
            loggedOutCurrent: !!isCurrent
        });
    } catch (error) {
        console.error('Logout Admin Session Error:', error);
        res.status(500).json({ success: false, message: 'Failed to log out the device.' });
    }
};

// POST /api/admin/sessions/logout-others
exports.logoutOtherSessions = async (req, res) => {
    try {
        const currentSid = req.admin && req.admin.sid;
        if (!currentSid) {
            return res.status(400).json({ success: false, message: 'Current session could not be identified.' });
        }

        const result = await AdminSession.deleteMany({
            adminUsername: req.admin.username,
            sessionId: { $ne: currentSid }
        });

        await logSecurityEvent({
            action: 'Admin Sessions Purged',
            actor: req.admin.username,
            actorType: 'admin',
            ipAddress: fingerprint(req).ipAddress,
            details: `Logged out ${result.deletedCount} other device(s)`
        });

        res.status(200).json({
            success: true,
            message: result.deletedCount > 0
                ? `Logged out ${result.deletedCount} other device(s) successfully.`
                : 'No other active devices found.',
            removed: result.deletedCount
        });
    } catch (error) {
        console.error('Logout Other Admin Sessions Error:', error);
        res.status(500).json({ success: false, message: 'Failed to log out other devices.' });
    }
};

/* ==================================================================
   IP BLACKLIST MANAGER
   ================================================================== */

// GET /api/admin/blacklist
exports.getBlacklist = async (req, res) => {
    try {
        const now = Date.now();
        const list = await BlacklistedIP.find({}).sort({ blockedAt: -1 }).lean();
        const data = list.map(b => {
            const expired = b.expiresAt ? new Date(b.expiresAt).getTime() <= now : false;
            return {
                id: b._id,
                ip: b.ip,
                reason: b.reason,
                source: b.source,
                blockedBy: b.blockedBy,
                blockedAt: b.blockedAt,
                expiresAt: b.expiresAt,
                permanent: !b.expiresAt,
                active: !expired,
                expiresInMs: b.expiresAt ? Math.max(0, new Date(b.expiresAt).getTime() - now) : null
            };
        });
        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Get Blacklist Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load blacklist.' });
    }
};

// POST /api/admin/blacklist  { ip, reason, hours }
exports.addBlacklist = async (req, res) => {
    try {
        const ip = String(req.body.ip || '').trim();
        const reason = String(req.body.reason || 'Manually blocked by admin').trim();
        const hours = req.body.hours !== undefined && req.body.hours !== null && req.body.hours !== ''
            ? Number(req.body.hours)
            : null;

        const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]+$/;
        if (!ip || !ipPattern.test(ip)) {
            return res.status(400).json({ success: false, message: 'Please provide a valid IPv4 or IPv6 address.' });
        }

        const expiresAt = hours && hours > 0 ? new Date(Date.now() + hours * 60 * 60 * 1000) : null;

        const doc = await BlacklistedIP.findOneAndUpdate(
            { ip },
            {
                $set: {
                    ip,
                    reason,
                    source: 'manual',
                    blockedBy: req.admin.username || 'admin',
                    blockedAt: new Date(),
                    expiresAt
                }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        await logSecurityEvent({
            action: 'IP Manually Blacklisted',
            actor: req.admin.username || 'admin',
            actorType: 'admin',
            ipAddress: fingerprint(req).ipAddress,
            details: `Blocked ${ip}${expiresAt ? ` for ${hours}h` : ' permanently'} — ${reason}`
        });

        res.status(201).json({ success: true, message: `IP ${ip} has been blacklisted.`, data: doc });
    } catch (error) {
        console.error('Add Blacklist Error:', error);
        res.status(500).json({ success: false, message: 'Failed to blacklist IP.' });
    }
};

// DELETE /api/admin/blacklist/:id  (unblock by _id or ip)
exports.removeBlacklist = async (req, res) => {
    try {
        const { id } = req.params;
        const orMatch = [{ ip: id }];
        if (mongoose.Types.ObjectId.isValid(id)) orMatch.push({ _id: id });

        const target = await BlacklistedIP.findOne({ $or: orMatch });
        if (!target) {
            return res.status(404).json({ success: false, message: 'Blacklist entry not found.' });
        }
        await target.deleteOne();

        await logSecurityEvent({
            action: 'IP Unblocked',
            actor: req.admin.username || 'admin',
            actorType: 'admin',
            ipAddress: fingerprint(req).ipAddress,
            details: `Removed ${target.ip} from blacklist`
        });

        res.status(200).json({ success: true, message: `IP ${target.ip} has been unblocked.` });
    } catch (error) {
        console.error('Remove Blacklist Error:', error);
        res.status(500).json({ success: false, message: 'Failed to unblock IP.' });
    }
};

/* ==================================================================
   LOGIN HISTORY & FAILED ATTEMPTS (audit feed)
   GET /api/admin/login-history
   ================================================================== */
exports.getLoginHistory = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
        const attempts = await LoginAttempt.find({})
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        const data = attempts.map(a => ({
            id: a._id,
            username: a.username,
            ip: a.ipAddress,
            location: a.location,
            os: a.os,
            browser: a.browser,
            deviceType: a.deviceType,
            status: a.status,
            details: a.details,
            timestamp: a.createdAt
        }));

        const summary = {
            total: data.length,
            success: data.filter(d => d.status === 'success').length,
            failed: data.filter(d => d.status === 'failed' || d.status === 'otp_failed').length,
            blocked: data.filter(d => d.status === 'blocked').length
        };

        res.status(200).json({ success: true, summary, data });
    } catch (error) {
        console.error('Get Login History Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load login history.' });
    }
};
