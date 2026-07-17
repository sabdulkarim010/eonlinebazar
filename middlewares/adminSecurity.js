/********************************************************************
 * Project: EonlineBazar — Fortified Admin Security Suite
 * File: adminSecurity.js
 * Location: middlewares/adminSecurity.js
 * Author: Abdul Karim Sheikh
 * Description: Perimeter defense for the admin authentication surface:
 *   1) checkBlacklist   — hard-blocks banned IPs (403) before any
 *                          controller logic runs.
 *   2) adminLoginLimiter — express-rate-limit throttle against brute
 *                          force / bot floods on login & OTP routes.
 *   3) recordLoginAttempt — writes a rich audit record AND runs the
 *                          Intrusion Detection engine: 5 failed
 *                          attempts from one IP within 15 minutes ⇒
 *                          automatic 24h IP ban.
 ********************************************************************/

const rateLimit = require('express-rate-limit');
const BlacklistedIP = require('../models/blacklistedIp');
const LoginAttempt = require('../models/loginAttempt');
const { getClientIp } = require('../utils/deviceParser');
const { logSecurityEvent } = require('./../utils/securityLogger');

// ---- Intrusion Detection tuning ----
const FAIL_LIMIT = 5;                 // অনুমোদিত ব্যর্থ চেষ্টা
const WINDOW_MINUTES = 15;            // এই সময়সীমার মধ্যে
const BAN_HOURS = 24;                 // অটো-ব্যানের মেয়াদ
const FAILURE_STATUSES = ['failed', 'otp_failed'];

/**
 * নির্দিষ্ট IP বর্তমানে ব্ল্যাকলিস্টেড কিনা যাচাই (মেয়াদোত্তীর্ণ এন্ট্রি উপেক্ষা করে)।
 */
async function findActiveBan(ip) {
    if (!ip) return null;
    const now = new Date();
    return BlacklistedIP.findOne({
        ip,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
    }).lean();
}

/* ==================================================================
   1. BLACKLIST GATE — যেকোনো লগইন কন্ট্রোলারের আগেই চলে
   ================================================================== */
const checkBlacklist = async (req, res, next) => {
    try {
        const ip = getClientIp(req);
        const ban = await findActiveBan(ip);

        if (ban) {
            // ব্লকড IP থেকে আসা প্রতিটি প্রচেষ্টা অডিটে রেকর্ড করা
            LoginAttempt.create({
                ipAddress: ip,
                username: (req.body && req.body.username) || 'unknown',
                status: 'blocked',
                userAgent: req.headers['user-agent'] || '',
                details: `Blocked request — ${ban.reason || 'blacklisted IP'}`
            }).catch(() => {});

            const retryAfter = ban.expiresAt
                ? Math.max(0, Math.ceil((new Date(ban.expiresAt) - Date.now()) / 1000))
                : null;
            if (retryAfter) res.set('Retry-After', String(retryAfter));

            return res.status(403).json({
                success: false,
                blocked: true,
                message: '⛔ Access denied. Your IP address has been blocked due to suspicious activity. Contact the system administrator.',
                reason: ban.reason || 'Suspicious activity',
                expiresAt: ban.expiresAt || null
            });
        }

        next();
    } catch (err) {
        console.error('checkBlacklist error:', err.message);
        // ফেইল-ওপেন নয় বরং নিরাপদে পাস — DB সমস্যায় লগইন সম্পূর্ণ বন্ধ না করতে
        next();
    }
};

/* ==================================================================
   2. RATE LIMITER — ব্রুট-ফোর্স / DDoS থ্রটল
   ================================================================== */
const adminLoginLimiter = rateLimit({
    windowMs: WINDOW_MINUTES * 60 * 1000,
    max: 20,                       // প্রতি IP প্রতি উইন্ডোতে সর্বোচ্চ ২০ অনুরোধ
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => getClientIp(req),
    handler: (req, res) => {
        const ip = getClientIp(req);
        LoginAttempt.create({
            ipAddress: ip,
            username: (req.body && req.body.username) || 'unknown',
            status: 'blocked',
            userAgent: req.headers['user-agent'] || '',
            details: 'Rate limit exceeded on admin auth route'
        }).catch(() => {});
        return res.status(429).json({
            success: false,
            message: '🚫 Too many attempts. Please wait a few minutes before trying again.'
        });
    }
});

/* ==================================================================
   3. INTRUSION DETECTION + AUDIT WRITER
   একবারে (a) LoginAttempt রেকর্ড করে এবং (b) failure হলে
   গত ১৫ মিনিটে ৫+ ব্যর্থতা হলে IP অটো-ব্ল্যাকলিস্ট করে।
   ================================================================== */
async function recordLoginAttempt({ fingerprint = {}, username = 'unknown', status = 'failed', details = '' }) {
    try {
        await LoginAttempt.create({
            username,
            ipAddress: fingerprint.ipAddress || 'Unknown',
            location: fingerprint.location || 'Unknown Location',
            os: fingerprint.os || 'Unknown OS',
            browser: fingerprint.browser || 'Unknown Browser',
            deviceType: fingerprint.deviceType || 'Desktop',
            userAgent: fingerprint.userAgent || '',
            status,
            details
        });
    } catch (err) {
        console.error('recordLoginAttempt write failed:', err.message);
    }

    if (!FAILURE_STATUSES.includes(status)) return;

    const ip = fingerprint.ipAddress;
    if (!ip || ip === 'Unknown') return;

    try {
        const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);
        const failCount = await LoginAttempt.countDocuments({
            ipAddress: ip,
            status: { $in: FAILURE_STATUSES },
            createdAt: { $gte: since }
        });

        if (failCount >= FAIL_LIMIT) {
            const alreadyBanned = await findActiveBan(ip);
            if (!alreadyBanned) {
                const expiresAt = new Date(Date.now() + BAN_HOURS * 60 * 60 * 1000);
                await BlacklistedIP.findOneAndUpdate(
                    { ip },
                    {
                        $set: {
                            ip,
                            reason: `Auto-blocked: ${failCount} failed admin logins within ${WINDOW_MINUTES} minutes`,
                            source: 'auto',
                            blockedBy: 'Intrusion Detection',
                            blockedAt: new Date(),
                            expiresAt
                        }
                    },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );

                await logSecurityEvent({
                    action: 'IP Auto-Blacklisted',
                    actor: username,
                    actorType: 'system',
                    ipAddress: ip,
                    details: `${failCount} failed attempts in ${WINDOW_MINUTES} min → banned ${BAN_HOURS}h`
                });
            }
        }
    } catch (err) {
        console.error('Intrusion detection error:', err.message);
    }
}

module.exports = {
    checkBlacklist,
    adminLoginLimiter,
    recordLoginAttempt,
    findActiveBan,
    FAIL_LIMIT,
    WINDOW_MINUTES,
    BAN_HOURS
};
