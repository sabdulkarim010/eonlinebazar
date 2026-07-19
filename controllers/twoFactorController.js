/********************************************************************
 * Project: EonlineBazar — Fortified Admin Security Suite
 * File: twoFactorController.js
 * Location: controllers/twoFactorController.js
 * Author: Abdul Karim Sheikh
 * Description: Admin self-service Two-Factor Authentication manager.
 *   • GET  /api/admin/2fa/status        → current 2FA config
 *   • POST /api/admin/2fa/totp/setup    → generate secret + QR to scan
 *   • POST /api/admin/2fa/totp/verify   → confirm scan, activate TOTP
 *   • POST /api/admin/2fa/totp/disable  → remove Google Authenticator
 *   • PUT  /api/admin/2fa/method        → choose Email | TOTP | SMS
 *
 *   All routes are protected by verifyAdmin (req.admin.username set).
 ********************************************************************/

const crypto = require('crypto');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

const Admin = require('../models/admin');
const { fingerprint } = require('../utils/deviceParser');
const { sendAdminOtpSms } = require('../utils/smsSender');
const { logSecurityEvent } = require('../utils/securityLogger');

const TOTP_ISSUER = process.env.TOTP_ISSUER || 'EonlineBazar Admin';
const VALID_METHODS = ['email', 'totp', 'sms'];
const SMS_SETUP_TTL_MINUTES = 5;

/* Loose E.164-ish validation: optional '+', 7–15 digits (spaces/dashes ignored). */
function isValidPhone(phone = '') {
    const clean = String(phone).replace(/[\s()-]/g, '');
    return /^\+?[0-9]{7,15}$/.test(clean);
}

/* Mask an email for safe display (a****@gmail.com). */
function maskEmail(email = '') {
    if (!email || !email.includes('@')) return '';
    const [name, domain] = email.split('@');
    return `${name.slice(0, 1)}${'*'.repeat(Math.max(1, name.length - 1))}@${domain}`;
}

/* Mask a phone, keeping only the last 3 digits (******789). */
function maskPhone(phone = '') {
    const clean = String(phone).trim();
    if (clean.length < 4) return clean ? '***' : '';
    return `${'*'.repeat(clean.length - 3)}${clean.slice(-3)}`;
}

function currentAdminUsername(req) {
    return (req.admin && req.admin.username) || 'admin';
}

/* ==================================================================
   GET /api/admin/2fa/status
   ================================================================== */
exports.getTwoFactorStatus = async (req, res) => {
    try {
        const admin = await Admin.findOne({ username: currentAdminUsername(req) })
            .select('+totpSecret +totpPendingSecret');
        if (!admin) return res.status(404).json({ success: false, message: 'Admin not found.' });

        const effectiveEmail = admin.email || process.env.SMTP_USER || process.env.EMAIL_USER || '';

        res.status(200).json({
            success: true,
            data: {
                twoFactorEnabled: admin.twoFactorEnabled !== false,
                method: admin.twoFactorMethod || 'email',
                email: effectiveEmail,
                maskedEmail: maskEmail(effectiveEmail),
                phone: admin.phone || '',
                maskedPhone: maskPhone(admin.phone || ''),
                smsConfigured: !!admin.phone,
                totpConfigured: !!admin.totpSecret && admin.totpVerified === true,
                totpPending: !!admin.totpPendingSecret
            }
        });
    } catch (error) {
        console.error('Get 2FA Status Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load 2FA status.' });
    }
};

/* ==================================================================
   POST /api/admin/2fa/totp/setup
   Generate a fresh secret, store it as PENDING, and return a QR image
   (data URL) + otpauth URL for the Google Authenticator app.
   ================================================================== */
exports.setupTotp = async (req, res) => {
    try {
        const admin = await Admin.findOne({ username: currentAdminUsername(req) });
        if (!admin) return res.status(404).json({ success: false, message: 'Admin not found.' });

        const label = `${TOTP_ISSUER}:${admin.username}`;
        const secret = speakeasy.generateSecret({ name: label, issuer: TOTP_ISSUER, length: 20 });

        // Hold the secret as "pending" until the admin proves a valid code.
        admin.totpPendingSecret = secret.base32;
        await admin.save();

        const otpauthUrl = speakeasy.otpauthURL({
            secret: secret.ascii,
            label,
            issuer: TOTP_ISSUER,
            encoding: 'ascii'
        });

        const qrDataUrl = await qrcode.toDataURL(otpauthUrl, { margin: 1, width: 240 });

        await logSecurityEvent({
            action: 'Admin 2FA TOTP Setup Started',
            actor: admin.username,
            actorType: 'admin',
            ipAddress: fingerprint(req).ipAddress,
            details: 'Generated new Google Authenticator secret (pending verification)'
        });

        res.status(200).json({
            success: true,
            message: 'Scan the QR code with Google Authenticator, then enter the 6-digit code to confirm.',
            qrCode: qrDataUrl,
            otpauthUrl,
            manualKey: secret.base32
        });
    } catch (error) {
        console.error('Setup TOTP Error:', error);
        res.status(500).json({ success: false, message: 'Failed to start Google Authenticator setup.' });
    }
};

/* ==================================================================
   POST /api/admin/2fa/totp/verify   { token }
   Confirm the scanned secret. On success: promote pending → active,
   switch method to 'totp'.
   ================================================================== */
exports.verifyTotpSetup = async (req, res) => {
    try {
        const inputToken = String(req.body.token || '').replace(/\D/g, '').trim();
        if (inputToken.length !== 6) {
            return res.status(400).json({ success: false, message: 'Enter the 6-digit code from your authenticator app.' });
        }

        const admin = await Admin.findOne({ username: currentAdminUsername(req) })
            .select('+totpPendingSecret +totpSecret');
        if (!admin) return res.status(404).json({ success: false, message: 'Admin not found.' });
        if (!admin.totpPendingSecret) {
            return res.status(400).json({ success: false, message: 'No pending setup found. Please start Google Authenticator setup again.' });
        }

        const verified = speakeasy.totp.verify({
            secret: admin.totpPendingSecret,
            encoding: 'base32',
            token: inputToken,
            window: 1 // tolerate ±30s clock drift
        });

        if (!verified) {
            return res.status(401).json({ success: false, message: 'Invalid code. Make sure your device time is correct and try again.' });
        }

        admin.totpSecret = admin.totpPendingSecret;
        admin.totpPendingSecret = null;
        admin.totpVerified = true;
        admin.twoFactorMethod = 'totp';
        admin.twoFactorEnabled = true;
        await admin.save();

        await logSecurityEvent({
            action: 'Admin 2FA TOTP Enabled',
            actor: admin.username,
            actorType: 'admin',
            ipAddress: fingerprint(req).ipAddress,
            details: 'Google Authenticator verified and set as active 2FA method'
        });

        res.status(200).json({
            success: true,
            message: 'Google Authenticator is now active as your 2FA method.',
            method: 'totp'
        });
    } catch (error) {
        console.error('Verify TOTP Setup Error:', error);
        res.status(500).json({ success: false, message: 'Failed to verify authenticator code.' });
    }
};

/* ==================================================================
   POST /api/admin/2fa/totp/disable
   Remove Google Authenticator and fall back to Email OTP.
   ================================================================== */
exports.disableTotp = async (req, res) => {
    try {
        const admin = await Admin.findOne({ username: currentAdminUsername(req) })
            .select('+totpSecret +totpPendingSecret');
        if (!admin) return res.status(404).json({ success: false, message: 'Admin not found.' });

        admin.totpSecret = null;
        admin.totpPendingSecret = null;
        admin.totpVerified = false;
        if (admin.twoFactorMethod === 'totp') admin.twoFactorMethod = 'email';
        await admin.save();

        await logSecurityEvent({
            action: 'Admin 2FA TOTP Disabled',
            actor: admin.username,
            actorType: 'admin',
            ipAddress: fingerprint(req).ipAddress,
            details: 'Google Authenticator removed — reverted to Email OTP'
        });

        res.status(200).json({ success: true, message: 'Google Authenticator disabled. Email OTP is now active.', method: 'email' });
    } catch (error) {
        console.error('Disable TOTP Error:', error);
        res.status(500).json({ success: false, message: 'Failed to disable Google Authenticator.' });
    }
};

/* ==================================================================
   POST /api/admin/2fa/sms/send   { phone? }
   Persist/refresh the admin phone number, generate a 6-digit setup code
   and deliver it via the configured SMS gateway. In SMS_PROVIDER=console
   mode the code is printed to the server terminal (see utils/smsSender.js).
   ================================================================== */
exports.sendSmsSetupOtp = async (req, res) => {
    try {
        const admin = await Admin.findOne({ username: currentAdminUsername(req) });
        if (!admin) return res.status(404).json({ success: false, message: 'Admin not found.' });

        const requested = req.body.phone !== undefined ? String(req.body.phone).trim() : '';
        const targetPhone = requested || admin.phone;

        if (!targetPhone) {
            return res.status(400).json({ success: false, message: 'Please enter a phone number first.' });
        }
        if (!isValidPhone(targetPhone)) {
            return res.status(400).json({ success: false, message: 'Enter a valid phone number in E.164 format (e.g. +8801712345678).' });
        }

        // Save (or update) the phone and stash a fresh setup code (epoch-ms expiry).
        admin.phone = targetPhone;
        const otp = String(crypto.randomInt(100000, 1000000)); // always 6 digits
        admin.smsSetupOtp = otp;
        admin.smsSetupOtpExpiry = Date.now() + SMS_SETUP_TTL_MINUTES * 60 * 1000;
        await admin.save();

        const delivery = await sendAdminOtpSms({
            to: targetPhone,
            otp,
            username: admin.username,
            expiresInMinutes: SMS_SETUP_TTL_MINUTES
        });

        await logSecurityEvent({
            action: 'Admin 2FA SMS Setup Code Sent',
            actor: admin.username,
            actorType: 'admin',
            ipAddress: fingerprint(req).ipAddress,
            details: `SMS setup code issued to ${maskPhone(targetPhone)} via ${delivery.provider} (delivered: ${delivery.delivered})`
        });

        res.status(200).json({
            success: true,
            delivered: !!delivery.delivered,
            provider: delivery.provider,
            maskedPhone: maskPhone(targetPhone),
            expiresInMinutes: SMS_SETUP_TTL_MINUTES,
            message: delivery.delivered
                ? `A 6-digit test code was sent via SMS to ${maskPhone(targetPhone)}.`
                : 'A 6-digit code was generated. SMS is in console mode — check the server terminal for the code.'
        });
    } catch (error) {
        console.error('Send SMS Setup OTP Error:', error);
        res.status(500).json({ success: false, message: 'Failed to send SMS test code.' });
    }
};

/* ==================================================================
   POST /api/admin/2fa/sms/verify   { token }
   Confirm the SMS setup code. On success: activate SMS as the 2FA method.
   ================================================================== */
exports.verifySmsSetupOtp = async (req, res) => {
    try {
        const inputToken = String(req.body.token || req.body.otp || '').replace(/\D/g, '').trim();
        if (inputToken.length !== 6) {
            return res.status(400).json({ success: false, message: 'Enter the 6-digit code sent to your phone.' });
        }

        const admin = await Admin.findOne({ username: currentAdminUsername(req) })
            .select('+smsSetupOtp +smsSetupOtpExpiry');
        if (!admin) return res.status(404).json({ success: false, message: 'Admin not found.' });

        if (!admin.smsSetupOtp || !admin.smsSetupOtpExpiry) {
            return res.status(400).json({ success: false, message: 'No active setup code. Please send a test code again.' });
        }
        if (Date.now() > admin.smsSetupOtpExpiry) {
            admin.smsSetupOtp = null;
            admin.smsSetupOtpExpiry = null;
            await admin.save();
            return res.status(400).json({ success: false, message: 'The code has expired. Please send a new test code.' });
        }
        if (String(admin.smsSetupOtp) !== inputToken) {
            return res.status(401).json({ success: false, message: 'Invalid code, please try again.' });
        }

        // Burn the setup code and activate SMS as the live 2FA method.
        admin.smsSetupOtp = null;
        admin.smsSetupOtpExpiry = null;
        admin.twoFactorMethod = 'sms';
        admin.twoFactorEnabled = true;
        await admin.save();

        await logSecurityEvent({
            action: 'Admin 2FA SMS Enabled',
            actor: admin.username,
            actorType: 'admin',
            ipAddress: fingerprint(req).ipAddress,
            details: `SMS OTP verified for ${maskPhone(admin.phone)} and set as active 2FA method`
        });

        res.status(200).json({
            success: true,
            method: 'sms',
            maskedPhone: maskPhone(admin.phone),
            message: 'SMS OTP verified and activated as your 2FA method.'
        });
    } catch (error) {
        console.error('Verify SMS Setup OTP Error:', error);
        res.status(500).json({ success: false, message: 'Failed to verify SMS code.' });
    }
};

/* ==================================================================
   PUT /api/admin/2fa/method   { method, phone?, enabled? }
   Choose the preferred 2FA delivery channel.
   ================================================================== */
exports.updateMethod = async (req, res) => {
    try {
        const method = String(req.body.method || '').toLowerCase().trim();
        const phone = req.body.phone !== undefined ? String(req.body.phone).trim() : undefined;
        const enabled = req.body.enabled;

        if (method && !VALID_METHODS.includes(method)) {
            return res.status(400).json({ success: false, message: 'Invalid 2FA method. Choose email, totp, or sms.' });
        }

        const admin = await Admin.findOne({ username: currentAdminUsername(req) })
            .select('+totpSecret');
        if (!admin) return res.status(404).json({ success: false, message: 'Admin not found.' });

        if (phone !== undefined) admin.phone = phone;

        if (method === 'totp' && !(admin.totpSecret && admin.totpVerified)) {
            return res.status(400).json({
                success: false,
                message: 'Set up and verify Google Authenticator before selecting it as your 2FA method.'
            });
        }

        if (method === 'sms' && !admin.phone) {
            return res.status(400).json({
                success: false,
                message: 'Add a phone number before selecting SMS as your 2FA method.'
            });
        }

        if (method) admin.twoFactorMethod = method;
        if (typeof enabled === 'boolean') admin.twoFactorEnabled = enabled;

        await admin.save();

        await logSecurityEvent({
            action: 'Admin 2FA Method Updated',
            actor: admin.username,
            actorType: 'admin',
            ipAddress: fingerprint(req).ipAddress,
            details: `2FA method set to "${admin.twoFactorMethod}" (enabled: ${admin.twoFactorEnabled})`
        });

        res.status(200).json({
            success: true,
            message: `Two-factor method updated to ${admin.twoFactorMethod.toUpperCase()}.`,
            data: {
                method: admin.twoFactorMethod,
                twoFactorEnabled: admin.twoFactorEnabled,
                phone: admin.phone,
                maskedPhone: maskPhone(admin.phone || '')
            }
        });
    } catch (error) {
        console.error('Update 2FA Method Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update 2FA method.' });
    }
};

module.exports = {
    getTwoFactorStatus: exports.getTwoFactorStatus,
    setupTotp: exports.setupTotp,
    verifyTotpSetup: exports.verifyTotpSetup,
    disableTotp: exports.disableTotp,
    sendSmsSetupOtp: exports.sendSmsSetupOtp,
    verifySmsSetupOtp: exports.verifySmsSetupOtp,
    updateMethod: exports.updateMethod
};
