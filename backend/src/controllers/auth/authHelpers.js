/**
 * EonlineBazar — Customer Auth Helpers
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
const requestIp = require('request-ip');
const geoip = require('geoip-lite');
const User = require('../../models/user');
const Cart = require('../../models/cart');
const UserSession = require('../../models/userSession');
const { logSecurityEvent } = require('../../utils/securityLogger');
const { isValidDistrict, resolveDistrictLabel } = require('../../utils/bangladeshDistricts');
const {
    mergeGuestCartIntoUserCart,
    normalizeGuestCartItems,
    resolveGuestCartFromRequest,
    toClientCartItem
} = require('../../services/cartMergeService');
const { isSandboxMode } = require('../../services/sandboxService');
const { sendEmail } = require('../../utils/sendEmail');

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

module.exports = {
    JWT_SECRET,
    parseUserAgent,
    getClientIp,
    getLocationFromIp,
    createCustomerLoginSession,
    VERIFICATION_TOKEN_TTL_MS,
    MIN_PASSWORD_LENGTH,
    BD_MOBILE_RE,
    EMAIL_RE,
    escapeHtml,
    normalizeEmail,
    normalizeMobile,
    isDuplicateKeyError,
    firstValidationMessage,
    buildVerificationUrl,
    buildVerificationEmailHtml,
    buildPasswordResetEmailHtml,
    sendVerificationEmail,
    wantsJsonResponse,
    buildVerificationResultHtml,
    respondVerification
};
