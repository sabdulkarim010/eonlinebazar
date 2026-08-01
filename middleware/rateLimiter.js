/********************************************************************
 * Project: EonlineBazar
 * File: rateLimiter.js
 * Location: middleware/rateLimiter.js
 * Description: Dynamic, admin-configurable API rate limiter with in-memory
 * settings cache. Localhost and development always bypass all limits.
 ********************************************************************/

const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const Settings = require('../models/Settings');

const DEFAULTS = {
    rateLimitEnabled: true,
    rateLimitWindowMs: 15 * 60 * 1000,
    rateLimitMaxRequests: 1000,
    bypassAdminAndLocalhost: true
};

const CACHE_TTL_MS = 30 * 1000;

/** All localhost identifiers — IPv4, IPv6, and hostname forms. */
const LOCALHOST_IDENTIFIERS = new Set([
    '127.0.0.1',
    '::1',
    '::ffff:127.0.0.1',
    'localhost',
    '0.0.0.0'
]);

/** Auth & admin routes exempt from throttling during local development. */
const DEV_EXEMPT_PATH_PREFIXES = [
    '/api/admin/login',
    '/api/admin/verify-otp',
    '/api/admin/',
    '/api/auth/'
];

let cachedSettings = { ...DEFAULTS };
let cacheExpiresAt = 0;
let activeLimiter = null;
let activeLimiterKey = '';

function normalizeIp(ip = '') {
    return String(ip).trim().toLowerCase();
}

function stripIpv6MappedPrefix(ip = '') {
    const normalized = normalizeIp(ip);
    return normalized.startsWith('::ffff:') ? normalized.slice(7) : normalized;
}

function isLocalhostIp(ip = '') {
    const raw = normalizeIp(ip);
    if (!raw) return false;
    if (LOCALHOST_IDENTIFIERS.has(raw)) return true;

    const stripped = stripIpv6MappedPrefix(raw);
    if (LOCALHOST_IDENTIFIERS.has(stripped)) return true;
    if (stripped === '127.0.0.1') return true;
    if (raw.endsWith('127.0.0.1')) return true;

    return false;
}

/** Private LAN ranges — never rate-limit local development or office networks. */
function isPrivateNetworkIp(ip = '') {
    const cleanIp = stripIpv6MappedPrefix(ip);
    if (!cleanIp) return false;
    return (
        /^192\.168\./.test(cleanIp) ||
        /^10\./.test(cleanIp) ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(cleanIp)
    );
}

/**
 * Bypass all rate limits for localhost, private LAN, and non-production environments.
 * Used by every express-rate-limit instance and the dynamic API limiter.
 */
function isLocalOrDev(req) {
    if (process.env.NODE_ENV !== 'production') return true;

    const ips = collectRequestIps(req);
    if (ips.some((ip) => isLocalhostIp(ip) || isPrivateNetworkIp(ip))) return true;

    const primary = req.ip || req.connection?.remoteAddress || '';
    const cleanIp = stripIpv6MappedPrefix(primary);
    return (
        cleanIp === '127.0.0.1' ||
        cleanIp === '::1' ||
        cleanIp === 'localhost' ||
        isPrivateNetworkIp(cleanIp)
    );
}

/**
 * Collect every IP the request may present — req.ip, socket, proxy headers.
 */
function collectRequestIps(req) {
    const forwarded = req.headers['x-forwarded-for'];
    const forwardedFirst = typeof forwarded === 'string'
        ? forwarded.split(',')[0].trim()
        : '';

    const candidates = [
        req.clientIp,
        req.ip,
        req.connection?.remoteAddress,
        req.socket?.remoteAddress,
        forwardedFirst
    ];

    return [...new Set(candidates.filter(Boolean).map(normalizeIp))];
}

function isLocalhostRequest(req) {
    if (collectRequestIps(req).some(isLocalhostIp)) return true;

    const hostHeader = String(req.headers.host || '').trim();
    const hostOnly = normalizeIp(hostHeader.split(':')[0] || '');
    const hostname = normalizeIp(req.hostname || hostOnly);

    const localHostnames = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);
    if (localHostnames.has(hostname) || localHostnames.has(hostOnly)) return true;

    // Host header forms: localhost:3000, 127.0.0.1:3000, [::1]:3000
    if (/^(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?$/i.test(hostHeader)) return true;

    return false;
}

function isDevEnvironment() {
    return process.env.NODE_ENV !== 'production';
}

function getRequestPath(req) {
    return (req.originalUrl || req.url || req.path || '').split('?')[0];
}

function isDevExemptAuthRoute(req) {
    const path = getRequestPath(req);
    return DEV_EXEMPT_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function isAdminApiRoute(req) {
    return getRequestPath(req).startsWith('/api/admin/');
}

/**
 * Emergency bypass — localhost, development, or dev-only admin/auth routes.
 * Checked before any DB read or limiter invocation.
 */
function shouldForceBypass(req) {
    if (isLocalOrDev(req)) return true;
    // Localhost always bypasses — even when NODE_ENV=production
    if (isLocalhostRequest(req)) return true;
    if (isDevEnvironment()) return true;
    if (isDevEnvironment() && isDevExemptAuthRoute(req)) return true;
    return false;
}

function isAuthenticatedAdmin(req) {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return false;

    try {
        const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
        return payload && (payload.role === 'admin' || payload.scope === 'admin-otp');
    } catch (_) {
        return false;
    }
}

function shouldBypass(req, settings) {
    if (shouldForceBypass(req)) return true;
    if (!settings.rateLimitEnabled) return true;
    if (!settings.bypassAdminAndLocalhost) return false;

    if (isLocalhostRequest(req)) return true;
    return isAuthenticatedAdmin(req);
}

/** Shared skip handler for express-rate-limit instances in securityMiddleware. */
function skipRateLimit(req) {
    if (isLocalOrDev(req)) return true;
    if (shouldForceBypass(req)) return true;
    // Dev-only: never throttle admin auth or admin API surfaces
    if (isDevEnvironment() && (isDevExemptAuthRoute(req) || isAdminApiRoute(req))) return true;
    return false;
}

function buildLimiterKey(settings) {
    return [
        settings.rateLimitEnabled,
        settings.rateLimitWindowMs,
        settings.rateLimitMaxRequests
    ].join(':');
}

function createLimiter(settings) {
    return rateLimit({
        validate: { trustProxy: false },
        windowMs: settings.rateLimitWindowMs,
        max: settings.rateLimitMaxRequests,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
            success: false,
            message: 'Too many requests, please try again later.'
        },
        skip: (req) => shouldBypass(req, settings)
    });
}

async function loadRateLimitSettings(force = false) {
    const now = Date.now();
    if (!force && now < cacheExpiresAt) return cachedSettings;

    const doc = await Settings.getOrCreate();
    cachedSettings = {
        rateLimitEnabled: doc.rateLimitEnabled !== false,
        rateLimitWindowMs: Number(doc.rateLimitWindowMs) || DEFAULTS.rateLimitWindowMs,
        rateLimitMaxRequests: Number(doc.rateLimitMaxRequests) || DEFAULTS.rateLimitMaxRequests,
        bypassAdminAndLocalhost: doc.bypassAdminAndLocalhost !== false
    };

    cacheExpiresAt = now + CACHE_TTL_MS;

    const key = buildLimiterKey(cachedSettings);
    if (key !== activeLimiterKey) {
        activeLimiterKey = key;
        activeLimiter = createLimiter(cachedSettings);
    }

    return cachedSettings;
}

function invalidateRateLimitCache() {
    cacheExpiresAt = 0;
    activeLimiterKey = '';
    activeLimiter = null;
}

async function dynamicApiRateLimiter(req, res, next) {
    if (shouldForceBypass(req)) {
        return next();
    }

    try {
        let settings;
        try {
            settings = await loadRateLimitSettings();
        } catch (err) {
            console.warn('[RateLimiter] Settings unavailable — pass-through:', err.message);
            return next();
        }

        if (!settings.rateLimitEnabled || shouldBypass(req, settings)) {
            return next();
        }

        if (!activeLimiter) {
            activeLimiter = createLimiter(settings);
            activeLimiterKey = buildLimiterKey(settings);
        }

        return activeLimiter(req, res, next);
    } catch (err) {
        console.error('[RateLimiter] Middleware error — pass-through:', err.message);
        return next();
    }
}

function getPublicRateLimitSettings(settings = cachedSettings) {
    return {
        rateLimitEnabled: settings.rateLimitEnabled !== false,
        rateLimitWindowMs: settings.rateLimitWindowMs,
        rateLimitMaxRequests: settings.rateLimitMaxRequests,
        bypassAdminAndLocalhost: settings.bypassAdminAndLocalhost !== false
    };
}

module.exports = {
    DEFAULTS,
    DEV_EXEMPT_PATH_PREFIXES,
    dynamicApiRateLimiter,
    invalidateRateLimitCache,
    getPublicRateLimitSettings,
    loadRateLimitSettings,
    shouldBypass,
    shouldForceBypass,
    skipRateLimit,
    isLocalOrDev,
    isLocalhostIp,
    isPrivateNetworkIp,
    isLocalhostRequest,
    isDevEnvironment,
    isDevExemptAuthRoute,
    isAdminApiRoute,
    collectRequestIps
};
