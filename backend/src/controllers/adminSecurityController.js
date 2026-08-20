/********************************************************************
 * Project: EonlineBazar — Fortified Admin Security Suite
 * File: adminSecurityController.js
 * Location: controllers/adminSecurityController.js
 * Author: Abdul Karim Sheikh
 * Description: Enterprise-grade admin authentication & security ops:
 *   • 2-step login (password → email OTP) with device/geo capture
 *   • Active admin session tracking + remote logout (single / all others)
 *   • IP blacklist manager (list / manual block / unblock)
 *   • Login history & failed-attempt audit feed
 ********************************************************************/

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const speakeasy = require('speakeasy');

const Admin = require('../models/admin');
const AdminSession = require('../models/adminSession');
const BlacklistedIP = require('../models/blacklistedIp');
const LoginAttempt = require('../models/loginAttempt');

const { fingerprint } = require('../utils/deviceParser');
const { sendAdminOtpEmail } = require('../services/mailer');
const { sendAdminOtpSms } = require('../utils/smsSender');
const { recordLoginAttempt, findActiveBan } = require('../middlewares/adminSecurity');
const { logSecurityEvent } = require('../utils/securityLogger');
const { ROLES, ACCOUNT_STATUS } = require('../config/permissions');

const JWT_SECRET = process.env.JWT_SECRET;
const OTP_TTL_MINUTES = 5;
const TOTP_WINDOW = 3; // ±90s (3 × 30s steps) — production hosts often drift vs phone clocks

/* helper: mask an email for safe display (a****@gmail.com) */
function maskEmail(email = '') {
    if (!email || !email.includes('@')) return 'your registered email';
    const [name, domain] = email.split('@');
    const visible = name.slice(0, 1);
    return `${visible}${'*'.repeat(Math.max(1, name.length - 1))}@${domain}`;
}

/** Normalize OTP to a 6-digit string (same format used at generation). */
function normalizeOtp(value) {
    return String(value ?? '').replace(/\D/g, '').trim();
}

function extractTwoFactorCode(body = {}) {
    const candidates = [
        body.otp,
        body.twoFactorCode,
        body.two_factor_code,
        body.totp,
        body.totpCode,
        body.code
    ];
    for (const candidate of candidates) {
        const normalized = normalizeOtp(candidate);
        if (normalized) return normalized;
    }
    return '';
}

function cleanTotpSecret(secret) {
    return String(secret || '').replace(/\s+/g, '').trim();
}

function verifyTotpToken(secret, token) {
    const cleanSecret = cleanTotpSecret(secret);
    const cleanToken = normalizeOtp(token);
    if (!cleanSecret || cleanToken.length !== 6) return false;

    const encodings = ['base32', 'ascii'];
    const nowSec = Math.floor(Date.now() / 1000);

    for (const encoding of encodings) {
        try {
            const ok = speakeasy.totp.verify({
                secret: cleanSecret,
                encoding,
                token: cleanToken,
                window: TOTP_WINDOW,
                digits: 6,
                step: 30
            });
            if (ok) return true;
        } catch (_) { /* secret is not valid for this encoding */ }

        // Explicit step walk — some runtimes mishandle speakeasy's `window` option.
        for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset++) {
            try {
                const expected = speakeasy.totp({
                    secret: cleanSecret,
                    encoding,
                    digits: 6,
                    step: 30,
                    time: nowSec + (offset * 30)
                });
                if (String(expected) === cleanToken) return true;
            } catch (_) { /* ignore */ }
        }
    }
    return false;
}

function describeTotpMismatch(secret, providedCode) {
    const cleanSecret = cleanTotpSecret(secret);
    const cleanToken = normalizeOtp(providedCode);
    const now = new Date();
    const nowSec = Math.floor(now.getTime() / 1000);
    const expectedByEncoding = {};

    for (const encoding of ['base32', 'ascii']) {
        const steps = {};
        for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset++) {
            const key = `t${offset >= 0 ? '+' : ''}${offset}`;
            try {
                steps[key] = speakeasy.totp({
                    secret: cleanSecret,
                    encoding,
                    digits: 6,
                    step: 30,
                    time: nowSec + (offset * 30)
                });
            } catch (_) {
                steps[key] = null;
            }
        }
        expectedByEncoding[encoding] = steps;
    }

    const matchedAnyWindow = Object.values(expectedByEncoding).some((steps) =>
        Object.values(steps).includes(cleanToken)
    );

    return {
        serverTimeUtc: now.toISOString(),
        serverUnix: nowSec,
        providedCode: cleanToken,
        windowSteps: TOTP_WINDOW,
        windowSeconds: TOTP_WINDOW * 30,
        secretLength: cleanSecret.length,
        expectedByEncoding,
        matchedAnyWindow
    };
}

/**
 * Unify expiry to epoch milliseconds (timezone-independent).
 * Accepts Number ms (current schema) or legacy Date/ISO from older docs.
 */
function toExpiryMs(expiresAt) {
    if (expiresAt == null || expiresAt === '') return null;
    if (typeof expiresAt === 'number' && Number.isFinite(expiresAt)) return expiresAt;
    const ms = new Date(expiresAt).getTime();
    return Number.isNaN(ms) ? null : ms;
}

function otpFail(res, status, reason, message, extra = {}) {
    console.warn(`[Admin OTP] verify failed → ${reason}: ${message}`);
    return res.status(status).json({
        success: false,
        reason,
        message,
        ...extra
    });
}

/** Clear any pending OTP challenge (new + legacy hashed fields). */
function clearOtpFields() {
    return {
        $set: { otp: null, otpExpiry: null },
        $unset: { loginOtpHash: 1, loginOtpExpires: 1 }
    };
}

/** Mask a phone, keeping only the last 3 digits (******789). */
function maskPhone(phone = '') {
    const clean = String(phone).trim();
    if (clean.length < 4) return clean ? '***' : 'your phone';
    return `${'*'.repeat(clean.length - 3)}${clean.slice(-3)}`;
}

/**
 * Generate a 6-digit numeric OTP and its epoch-ms expiry.
 * Uses Date.now() exclusively — NO Date objects, NO timezones — so the
 * value compares identically on any server regardless of locale/TZ.
 */
function generateEpochOtp() {
    const otp = String(crypto.randomInt(100000, 1000000)); // always 6 digits
    const otpExpiry = Date.now() + OTP_TTL_MINUTES * 60 * 1000; // UTC epoch ms
    return { otp, otpExpiry };
}

/**
 * Create the AdminSession + signed 24h JWT after a fully-authenticated login.
 * Centralized so every 2FA path (bypass / email / sms / totp) is identical.
 */
async function issueAdminSession(admin, fp) {
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

    await Admin.updateOne({ _id: admin._id }, { $set: { lastLoginAt: new Date() } });

    // `role: 'admin'` stays as the *token type* (every existing guard keys off
    // it). The RBAC role travels as `accountRole` — but nothing trusts it:
    // verifyAdmin re-reads role and permissions from MongoDB on each request.
    const token = jwt.sign(
        {
            username: admin.username,
            role: 'admin',
            accountRole: admin.role || ROLES.SUPER_ADMIN,
            sid: sessionId
        },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
    return { sessionId, token };
}

/**
 * Reject suspended accounts at the door. Any live session is destroyed so a
 * blocked staff member is signed out everywhere the instant they try again.
 */
async function rejectIfBlocked(res, admin, fp) {
    if (!admin.isBlocked || !admin.isBlocked()) return false;

    await AdminSession.deleteMany({ adminUsername: admin.username });
    await recordLoginAttempt({
        fingerprint: fp,
        username: admin.username,
        status: 'blocked',
        details: 'Login refused — account blocked by Super Admin'
    });
    await logSecurityEvent({
        action: 'Blocked Account Login Attempt',
        actor: admin.username,
        actorType: 'admin',
        ipAddress: fp.ipAddress,
        details: `Suspended account tried to sign in · ${fp.device} · ${fp.location}`
    });

    res.status(403).json({
        success: false,
        reason: 'ACCOUNT_BLOCKED',
        message: 'This account has been blocked by the Super Admin. Please contact the store owner.'
    });
    return true;
}

/**
 * Finish login after password (2FA off) or after a valid inline/step-2 code.
 */
async function completeAdminLogin(res, admin, fp, details) {
    await Admin.updateOne({ _id: admin._id }, clearOtpFields());
    const { token } = await issueAdminSession(admin, fp);

    await recordLoginAttempt({
        fingerprint: fp,
        username: admin.username,
        status: 'success',
        details
    });
    await logSecurityEvent({
        action: 'Admin Login Success',
        actor: admin.username,
        actorType: 'admin',
        ipAddress: fp.ipAddress,
        details: `${details} · ${fp.device} · ${fp.location}`
    });

    return res.status(200).json({
        success: true,
        message: 'Login successful!',
        token,
        image: admin.image,
        role: admin.role || ROLES.SUPER_ADMIN,
        permissions: Array.isArray(admin.permissions) ? admin.permissions : []
    });
}

/**
 * Verify a 2FA code submitted on the login form (same TOTP/email/SMS rules as Step 2).
 * Returns { ok: true } or { ok: false, status, reason, message }.
 */
function isTotpFullyEnrolled(admin) {
    return Boolean(admin && admin.totpSecret) && admin.totpVerified === true;
}

/** Drop leftover authenticator secrets that were never confirmed via QR verify. */
async function discardUnverifiedTotp(admin) {
    const nextMethod = admin.twoFactorMethod === 'totp' ? 'email' : admin.twoFactorMethod;
    await Admin.updateOne(
        { _id: admin._id },
        {
            $unset: { totpSecret: 1, totpPendingSecret: 1 },
            $set: { totpVerified: false, twoFactorMethod: nextMethod }
        }
    );
    admin.totpSecret = undefined;
    admin.totpPendingSecret = undefined;
    admin.totpVerified = false;
    admin.twoFactorMethod = nextMethod;
}

function verifyInlineTwoFactor(admin, method, inputOtp) {
    const totpReady = isTotpFullyEnrolled(admin);

    // Prefer Google Authenticator only when it is fully enrolled (secret + verified).
    if (method === 'totp' || totpReady) {
        if (method === 'totp' && !admin.totpSecret) {
            return {
                ok: false,
                status: 401,
                reason: 'OTP_NOT_FOUND',
                message: 'Google Authenticator is not configured for this account. Sign in with username and password to continue.'
            };
        }
        if (totpReady && verifyTotpToken(admin.totpSecret, inputOtp)) {
            return { ok: true, via: 'totp' };
        }
        if (method === 'totp') {
            return {
                ok: false,
                status: 401,
                reason: 'INVALID_OTP',
                message: 'Invalid 2FA Code, please try again'
            };
        }
    }

    const expiryMs = toExpiryMs(admin.otpExpiry);
    if (admin.otp == null || expiryMs == null) {
        return {
            ok: false,
            status: 401,
            reason: 'OTP_NOT_FOUND',
            message: 'No code has been sent yet. Submit username and password first to receive a verification code.'
        };
    }
    if (Date.now() > expiryMs) {
        return {
            ok: false,
            status: 400,
            reason: 'OTP_EXPIRED',
            message: 'That verification code has expired. Submit username and password again to receive a new one.'
        };
    }
    if (String(admin.otp) !== String(inputOtp)) {
        return {
            ok: false,
            status: 401,
            reason: 'INVALID_OTP',
            message: 'Invalid 2FA Code, please try again'
        };
    }
    return { ok: true, via: method };
}

/**
 * Dispatch a login challenge for the admin's selected 2FA method.
 * Used by the same-page /admin-login step (email/SMS send a code; TOTP does not).
 *   - email / sms → generates + persists an epoch-ms OTP and delivers it
 *   - totp        → no code is sent (user reads it from their authenticator app)
 */
async function dispatchChallenge(admin, method, fp) {
    const recipientEmail = admin.email || process.env.SMTP_USER || process.env.EMAIL_USER || '';

    // Short-lived signed handoff token — carries the chosen method to Step 2.
    const otpToken = jwt.sign(
        { username: admin.username, scope: 'admin-otp', method },
        JWT_SECRET,
        { expiresIn: `${OTP_TTL_MINUTES}m` }
    );

    if (method === 'totp') {
        await Admin.updateOne({ _id: admin._id }, clearOtpFields());
        return {
            otpToken,
            method,
            delivered: true,
            channelLabel: 'Google Authenticator',
            message: 'Open Google Authenticator and enter the current 6-digit code.',
            expiresInMinutes: OTP_TTL_MINUTES
        };
    }

    // email or sms → make a fresh epoch-ms OTP
    const { otp, otpExpiry } = generateEpochOtp();
    await Admin.updateOne(
        { _id: admin._id },
        { $set: { otp, otpExpiry }, $unset: { loginOtpHash: 1, loginOtpExpires: 1 } }
    );

    if (method === 'sms') {
        const delivery = await sendAdminOtpSms({
            to: admin.phone,
            otp,
            username: admin.username,
            expiresInMinutes: OTP_TTL_MINUTES
        });
        return {
            otpToken,
            method,
            delivered: !!delivery.delivered,
            channelLabel: 'SMS',
            maskedTarget: maskPhone(admin.phone),
            message: delivery.delivered
                ? `A 6-digit code was sent via SMS to ${maskPhone(admin.phone)}.`
                : 'A 6-digit code was generated. SMS gateway is in fallback mode — check the server console.',
            expiresInMinutes: OTP_TTL_MINUTES
        };
    }

    // default: email
    const delivery = await sendAdminOtpEmail({
        to: recipientEmail,
        otp,
        username: admin.username,
        ip: fp.ipAddress,
        location: fp.location,
        expiresInMinutes: OTP_TTL_MINUTES
    });
    return {
        otpToken,
        method: 'email',
        delivered: !!delivery.delivered,
        channelLabel: 'Email',
        maskedTarget: maskEmail(recipientEmail),
        message: delivery.delivered
            ? `A 6-digit verification code was sent to ${maskEmail(recipientEmail)}.`
            : 'A 6-digit code was generated. Email delivery failed / SMTP not configured — check the server console.',
        expiresInMinutes: OTP_TTL_MINUTES
    };
}

/* ==================================================================
   STEP 1 — Verify username & password; complete login or request same-page 2FA
   POST /api/admin/login
   ================================================================== */
exports.loginAdmin = async (req, res) => {
    try {
        // Accept `username` (canonical) or `email` (admin-dashboard / chat clients).
        const username = String(req.body.username || req.body.email || '').trim();
        const password = String(req.body.password || '');
        const fp = fingerprint(req);

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password are required.' });
        }

        // totpSecret / totpPendingSecret / otp are select:false — must be included
        // or TOTP verification always sees undefined and fails.
        let admin = await Admin.findOne({ username })
            .select('+totpSecret +totpPendingSecret +otp +otpExpiry');

        // Bootstrap: প্রথমবার সঠিক ক্রেডেনশিয়ালে অ্যাডমিন তৈরি
        // (এই অ্যাকাউন্টটি সব সময় সুপার অ্যাডমিন — মালিকের অ্যাক্সেস)
        if (!admin && username === 'admin' && password === process.env.ADMIN_PASSWORD) {
            admin = new Admin({
                username: 'admin',
                password: process.env.ADMIN_PASSWORD,
                email: process.env.SMTP_USER || process.env.EMAIL_USER || '',
                role: ROLES.SUPER_ADMIN,
                status: ACCOUNT_STATUS.ACTIVE
            });
            await admin.save();
        } else {
            const passwordOk = admin ? await admin.verifyPassword(password) : false;

            if (!passwordOk) {
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

            // 🚫 Suspended staff never get past the password step.
            if (await rejectIfBlocked(res, admin, fp)) return;

            // 🔐 Legacy accounts stored their password in plain text. Now that the
            // credential is proven correct, re-save it so the pre-save hook
            // replaces it with a bcrypt digest. One silent upgrade, no lockout.
            if (!admin.isPasswordHashed()) {
                admin.password = String(password);
                // The value is unchanged, so Mongoose would consider the path
                // clean and skip the hashing hook — force it to run.
                admin.markModified('password');
                await admin.save();
            }
        }

        // ── Resolve the admin's chosen 2FA method ──
        // TOTP is used only when the secret exists AND the QR was confirmed
        // (totpVerified). A leftover unverified secret must not steal the login
        // path (production vs localhost enrollment mismatch).
        let method = admin.twoFactorMethod || 'email';
        const twoFactorOn = admin.twoFactorEnabled !== false;

        if (isTotpFullyEnrolled(admin)) {
            method = 'totp';
        } else if (admin.totpSecret && admin.totpVerified !== true) {
            console.warn('[2FA DIAG] Discarding unverified totpSecret — falling back to email/SMS', {
                username: admin.username,
                previousMethod: method,
                totpSecretLength: String(admin.totpSecret || '').length
            });
            await discardUnverifiedTotp(admin);
            if (method === 'totp') method = 'email';
        } else if (method === 'totp') {
            method = 'email';
        }
        // Guard: if 'sms' is selected but no phone on file, fall back to email.
        if (method === 'sms' && !admin.phone) method = 'email';

        const totpSecret = admin.totpSecret || '';

        // ── 2FA disabled → complete login immediately after password ──
        if (!twoFactorOn) {
            return completeAdminLogin(res, admin, fp, 'Password verified — 2FA disabled · login complete');
        }

        // Optional 2FA code from the same /admin-login form (step 2).
        // If present, verify it here and issue the session. If blank, stay on
        // the login page (otpRequired) so the TWO-FACTOR CODE field can appear.
        const twoFactorCode = extractTwoFactorCode(req.body);
        const cleanSecret = cleanTotpSecret(totpSecret);
        const secretPrefix = cleanSecret ? cleanSecret.substring(0, 4) : 'EMPTY';

        // TEMPORARY production diagnosis — remove extractedCode after the
        // eonlinebazar.com TOTP failure is confirmed and re-enrollment is done.
        console.log('[2FA DIAG]', {
            username: admin.username,
            twoFactorEnabled: admin.twoFactorEnabled,
            twoFactorMethod: admin.twoFactorMethod,
            effectiveMethod: method,
            totpVerified: admin.totpVerified === true,
            totpSecretLength: cleanSecret.length,
            pendingSecretLength: admin.totpPendingSecret ? String(admin.totpPendingSecret).length : 0,
            secretPrefix,
            secretCharset: !cleanSecret
                ? 'empty'
                : cleanSecret.startsWith('pmv1.')
                    ? 'vault'
                    : /^[A-Z2-7]+=*$/i.test(cleanSecret) ? 'base32' : 'other',
            extractedCodeLength: twoFactorCode ? twoFactorCode.length : 0,
            extractedCode: twoFactorCode, // TEMPORARY — remove after diagnosis
            bodyKeys: Object.keys(req.body || {}),
            totpWindowSeconds: TOTP_WINDOW * 30,
            serverTimeUtc: new Date().toISOString()
        });

        if (twoFactorCode) {
            if (twoFactorCode.length !== 6) {
                return res.status(400).json({
                    success: false,
                    reason: 'INVALID_OTP',
                    message: 'Invalid 2FA Code, please try again'
                });
            }

            const verified = verifyInlineTwoFactor(admin, method, twoFactorCode);
            if (!verified.ok) {
                const mismatch = totpSecret
                    ? describeTotpMismatch(totpSecret, twoFactorCode)
                    : { providedCode: twoFactorCode, hasTotpSecret: false };
                console.warn('[Admin Login 2FA] TOTP verification FAILED', {
                    username: admin.username,
                    method,
                    reason: verified.reason || null,
                    ...mismatch
                });
                await recordLoginAttempt({
                    fingerprint: fp,
                    username: admin.username,
                    status: 'otp_failed',
                    details: `Inline 2FA failed (${verified.reason})`
                });
                await logSecurityEvent({
                    action: 'Admin OTP Failed',
                    actor: admin.username,
                    actorType: 'admin',
                    ipAddress: fp.ipAddress,
                    details: `Inline 2FA failed · ${verified.reason} · ${fp.device} · ${fp.location}`
                });
                return res.status(verified.status).json({
                    success: false,
                    reason: verified.reason,
                    message: verified.reason === 'INVALID_OTP'
                        ? 'Invalid 2FA Code, please try again'
                        : verified.message
                });
            }

            console.log('[Admin Login 2FA] verified OK', {
                username: admin.username,
                via: verified.via,
                windowSeconds: TOTP_WINDOW * 30
            });

            const viaLabel = verified.via === 'totp' ? 'Google Authenticator' : verified.via.toUpperCase();
            return completeAdminLogin(res, admin, fp, `Password + ${viaLabel} verified on login form`);
        }

        // ── Password OK, 2FA on, code not yet entered → same-page step 2 ──
        const challenge = await dispatchChallenge(admin, method, fp);

        await recordLoginAttempt({
            fingerprint: fp,
            username: admin.username,
            status: 'otp_sent',
            details: `Password verified — ${challenge.channelLabel} 2FA challenge issued`
        });
        await logSecurityEvent({
            action: 'Admin OTP Requested',
            actor: admin.username,
            actorType: 'admin',
            ipAddress: fp.ipAddress,
            details: `2FA challenge (${challenge.channelLabel}) · ${fp.device} · ${fp.location}`
        });

        const totpPrompt = 'Enter your 6-digit Authenticator code';
        const emailSmsPrompt = challenge.message || 'Enter the 6-digit verification code';
        return res.status(200).json({
            success: true,
            otpRequired: true,
            method: challenge.method,
            channelLabel: challenge.channelLabel,
            message: challenge.method === 'totp' ? totpPrompt : challenge.message,
            prompt: challenge.method === 'totp' ? totpPrompt : emailSmsPrompt,
            otpToken: challenge.otpToken,
            delivered: challenge.delivered,
            maskedTarget: challenge.maskedTarget || '',
            expiresInMinutes: challenge.expiresInMinutes
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
        // Always compare as String — prevents Number vs String mismatches from JSON body
        const inputOtp = normalizeOtp(req.body.otp);
        const otpToken = String(req.body.otpToken || '').trim();
        const fp = fingerprint(req);

        if (!inputOtp || !otpToken) {
            return otpFail(res, 400, 'MISSING_FIELDS', 'Verification code and session token are required.');
        }
        if (inputOtp.length !== 6) {
            return otpFail(res, 400, 'INVALID_OTP', 'OTP must be exactly 6 digits.');
        }

        let payload;
        try {
            payload = jwt.verify(otpToken, JWT_SECRET);
        } catch (e) {
            const reason = e.name === 'TokenExpiredError' ? 'SESSION_EXPIRED' : 'SESSION_INVALID';
            return otpFail(
                res,
                401,
                reason,
                'Your verification session has expired. Please log in again.',
                { restart: true }
            );
        }
        if (!payload || payload.scope !== 'admin-otp' || !payload.username) {
            return otpFail(
                res,
                401,
                'SESSION_INVALID',
                'Invalid verification session. Please log in again.',
                { restart: true }
            );
        }

        const user = await Admin.findOne({ username: payload.username })
            .select('+otp +otpExpiry +totpSecret +totpPendingSecret');
        if (!user) {
            return otpFail(res, 404, 'USER_NOT_FOUND', 'Admin account not found.', { restart: true });
        }

        // 🚫 The Super Admin may have blocked this account between step 1 and step 2.
        if (await rejectIfBlocked(res, user, fp)) return;

        // Which channel issued this challenge? (email | sms | totp)
        const method = payload.method || 'email';

        if (method === 'totp') {
            // ── Google Authenticator (TOTP) verification via speakeasy ──
            if (!isTotpFullyEnrolled(user)) {
                return otpFail(
                    res,
                    401,
                    'OTP_NOT_FOUND',
                    'Google Authenticator is not configured for this account. Please log in again.',
                    { restart: true }
                );
            }

            const totpOk = verifyTotpToken(user.totpSecret, inputOtp);

            if (!totpOk) {
                console.warn('[Admin Login 2FA] TOTP verification FAILED (verify-otp)', {
                    username: user.username,
                    ...describeTotpMismatch(user.totpSecret, inputOtp)
                });
                await recordLoginAttempt({ fingerprint: fp, username: user.username, status: 'otp_failed', details: 'Incorrect TOTP code' });
                await logSecurityEvent({
                    action: 'Admin OTP Failed',
                    actor: user.username,
                    actorType: 'admin',
                    ipAddress: fp.ipAddress,
                    details: `Wrong authenticator code · ${fp.device} · ${fp.location}`
                });
                return otpFail(res, 401, 'INVALID_OTP', 'Incorrect authenticator code. Check your device clock and try again.');
            }
        } else {
            // ── Email / SMS one-time code verification (epoch-ms, timezone-safe) ──
            user.otpExpiry = toExpiryMs(user.otpExpiry);

            console.log('Input OTP:', inputOtp, 'Saved OTP:', user.otp, 'Is Expired:', Date.now() > user.otpExpiry);
            console.log(
                '[Admin OTP] expiry debug → nowMs:',
                Date.now(),
                'otpExpiryMs:',
                user.otpExpiry,
                'remainingMs:',
                user.otpExpiry == null ? null : user.otpExpiry - Date.now()
            );

            if (user.otp == null || user.otpExpiry == null) {
                return otpFail(
                    res,
                    401,
                    'OTP_NOT_FOUND',
                    'No active verification code found. Please log in again to request a new one.',
                    { restart: true }
                );
            }

            // Strict epoch-ms compare — never parse local date strings / timezones
            if (Date.now() > user.otpExpiry) {
                await Admin.updateOne({ _id: user._id }, clearOtpFields());
                return otpFail(res, 400, 'OTP_EXPIRED', 'OTP Expired', { restart: true });
            }

            // Strict String equality (Number vs String safe)
            if (String(user.otp) !== String(inputOtp)) {
                await recordLoginAttempt({ fingerprint: fp, username: user.username, status: 'otp_failed', details: 'Incorrect OTP entered' });
                await logSecurityEvent({
                    action: 'Admin OTP Failed',
                    actor: user.username,
                    actorType: 'admin',
                    ipAddress: fp.ipAddress,
                    details: `Wrong 2FA code · ${fp.device} · ${fp.location}`
                });
                return otpFail(res, 401, 'INVALID_OTP', 'Incorrect verification code. Please try again.');
            }
        }

        // Create session BEFORE burning the OTP — if session write fails, code stays reusable
        const { token } = await issueAdminSession(user, fp);

        // One-time use — clear only after session is safely created
        await Admin.updateOne({ _id: user._id }, clearOtpFields());

        await recordLoginAttempt({ fingerprint: fp, username: user.username, status: 'success', details: 'OTP verified — login complete' });
        await logSecurityEvent({
            action: 'Admin Login Success',
            actor: user.username,
            actorType: 'admin',
            ipAddress: fp.ipAddress,
            details: `2FA verified · ${fp.device} · ${fp.location}`
        });

        return res.status(200).json({
            success: true,
            reason: 'OK',
            message: 'Login successful!',
            token,
            image: user.image,
            role: user.role || ROLES.SUPER_ADMIN,
            permissions: Array.isArray(user.permissions) ? user.permissions : []
        });
    } catch (error) {
        console.error('Admin Verify OTP (Step 2) Error:', error);
        return otpFail(res, 500, 'SERVER_ERROR', 'Internal server error during verification.');
    }
};

/* ==================================================================
   TEMPORARY — POST /api/admin/reset-totp-temp
   Emergency TOTP wipe so production can re-enroll Google Authenticator.
   Guarded by EMERGENCY_MASTER_KEY. Remove this handler + route after
   production re-enrollment is complete.
   ================================================================== */
exports.resetTotpEmergency = async (req, res) => {
    const masterKey = process.env.EMERGENCY_MASTER_KEY;
    const provided = String((req.body && req.body.masterKey) || '');
    const username = String((req.body && req.body.username) || 'admin').trim();
    const fp = fingerprint(req);

    if (!masterKey) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const keyBuf = Buffer.from(masterKey);
    const providedBuf = Buffer.from(provided);
    const keyOk = keyBuf.length === providedBuf.length
        && crypto.timingSafeEqual(keyBuf, providedBuf);

    if (!keyOk) {
        console.warn('[2FA DIAG] reset-totp-temp rejected — invalid master key', {
            ip: fp.ipAddress,
            username
        });
        return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    if (!username) {
        return res.status(400).json({ success: false, message: 'Username is required.' });
    }

    try {
        const result = await Admin.findOneAndUpdate(
            { username },
            {
                $unset: { totpSecret: 1, totpPendingSecret: 1 },
                $set: {
                    totpVerified: false,
                    twoFactorMethod: 'email',
                    twoFactorEnabled: false
                }
            },
            { new: true }
        );

        if (!result) {
            return res.status(404).json({ success: false, message: 'Admin not found' });
        }

        await logSecurityEvent({
            action: 'Admin TOTP Emergency Reset',
            actor: username,
            actorType: 'admin',
            ipAddress: fp.ipAddress,
            details: 'TOTP secrets unset — 2FA disabled pending re-enrollment'
        }).catch(() => {});

        console.warn('[2FA DIAG] TOTP emergency reset completed', {
            username,
            ip: fp.ipAddress
        });

        return res.json({
            success: true,
            message: 'TOTP reset. 2FA disabled. Re-enroll from Admin Settings.'
        });
    } catch (err) {
        console.error('resetTotpEmergency error:', err);
        return res.status(500).json({ success: false, message: 'Failed to reset TOTP.' });
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

// POST /api/admin/logout — revoke the current admin session (full sign-out)
exports.logoutCurrent = async (req, res) => {
    try {
        const username = req.admin && req.admin.username;
        const sid = req.admin && req.admin.sid;
        const fp = fingerprint(req);

        if (sid) {
            await AdminSession.deleteOne({ sessionId: sid, adminUsername: username });
        } else if (username) {
            // Legacy tokens without sid: wipe all sessions for this admin
            await AdminSession.deleteMany({ adminUsername: username });
        }

        await logSecurityEvent({
            action: 'Admin Logout',
            actor: username || 'unknown',
            actorType: 'admin',
            ipAddress: fp.ipAddress,
            details: sid ? `Signed out session ${sid}` : 'Signed out (no sid on token)'
        });

        res.clearCookie('adminToken', { path: '/' });
        res.clearCookie('token', { path: '/' });

        return res.status(200).json({
            success: true,
            message: 'Logged out successfully.',
            redirect: '/admin/login'
        });
    } catch (error) {
        console.error('Admin Logout Error:', error);
        res.clearCookie('adminToken', { path: '/' });
        res.clearCookie('token', { path: '/' });
        return res.status(200).json({
            success: true,
            message: 'Logged out locally.',
            redirect: '/admin/login'
        });
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
            { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
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
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
        const skip = (page - 1) * limit;

        const [attempts, total, successCount, failedCount, blockedCount] = await Promise.all([
            LoginAttempt.find({})
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            LoginAttempt.countDocuments({}),
            LoginAttempt.countDocuments({ status: 'success' }),
            LoginAttempt.countDocuments({ status: { $in: ['failed', 'otp_failed'] } }),
            LoginAttempt.countDocuments({ status: 'blocked' })
        ]);

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
            total,
            success: successCount,
            failed: failedCount,
            blocked: blockedCount
        };

        res.status(200).json({
            success: true,
            summary,
            data,
            total,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1
            }
        });
    } catch (error) {
        console.error('Get Login History Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load login history.' });
    }
};
