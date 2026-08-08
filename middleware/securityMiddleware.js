/********************************************************************
 * Project: EonlineBazar
 * File: securityMiddleware.js
 * Location: middleware/securityMiddleware.js
 * Description: Production-grade security middleware — helmet, CORS,
 * input sanitization, HPP protection, and tiered rate limiting.
 ********************************************************************/

const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const { dynamicApiRateLimiter, isLocalOrDev, shouldForceBypass } = require('./rateLimiter');

/**
 * Configure and apply all security-related Express middleware.
 * Call after express.json() and before route registration.
 */
function applySecurityMiddleware(app) {
    // Tag bypassed requests before any limiter runs (localhost / development)
    app.use((req, res, next) => {
        if (shouldForceBypass(req)) {
            req._rateLimitBypass = true;
        }
        next();
    });

    // Emergency panel: strict rate limit to prevent brute force
    const emergencyLimiter = rateLimit({
        validate: { trustProxy: false },
        windowMs: 15 * 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        skip: isLocalOrDev,
        message: { success: false, message: 'Too many attempts' }
    });
    app.use('/sys', emergencyLimiter);

    app.use(
        helmet({
            contentSecurityPolicy: false,
            crossOriginEmbedderPolicy: false,
        })
    );

    const allowedOrigins = [
        ...new Set(
            [
                'https://eonlinebazar.com',
                'https://www.eonlinebazar.com',
                'http://localhost:3000',
                process.env.FRONTEND_URL,
            ].filter(Boolean)
        ),
    ];

    const corsOptions = {
        origin(origin, callback) {
            // Non-browser clients / same-origin requests may omit Origin
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
                return;
            }
            console.warn(`[CORS] blocked origin: ${origin}`);
            callback(null, false);
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    };

    app.use(cors(corsOptions));
    // Express 5: named wildcard required (path-to-regexp v8)
    app.options('/{*splat}', cors(corsOptions));

    const authLimiter = rateLimit({
        validate: { trustProxy: false },
        windowMs: 15 * 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        skip: isLocalOrDev,
        message: { success: false, message: 'Too many requests, please try again later.' }
    });

    const authRoutes = [
        '/api/auth/login',
        '/api/auth/register',
        '/api/customer/login',
        '/api/customer/register',
        '/api/auth/forgot-password',
        '/api/customer/forgot-password',
    ];

    authRoutes.forEach((route) => {
        app.post(route, authLimiter);
    });

    app.post(
        '/api/coupons/apply',
        rateLimit({
            validate: { trustProxy: false },
            windowMs: 60 * 1000,
            max: 5,
            standardHeaders: true,
            legacyHeaders: false,
            skip: isLocalOrDev,
            message: { success: false, message: 'Too many requests, please try again later.' }
        })
    );

    app.post(
        '/api/orders',
        rateLimit({
            validate: { trustProxy: false },
            windowMs: 60 * 1000,
            max: 3,
            standardHeaders: true,
            legacyHeaders: false,
            skip: isLocalOrDev,
            message: { success: false, message: 'Too many requests, please try again later.' }
        })
    );

    app.use('/api/', (req, res, next) => {
        if (req._rateLimitBypass || shouldForceBypass(req)) return next();
        return dynamicApiRateLimiter(req, res, next);
    });

    app.use((req, res, next) => {
        if (req.body) req.body = mongoSanitize.sanitize(req.body);
        if (req.params) req.params = mongoSanitize.sanitize(req.params);
        next();
    });
    app.use((req, res, next) => {
        if (req.body && typeof req.body === 'object') {
            const isLikelyUrlOrPath = (value) => {
                const s = String(value).trim();
                if (!s) return false;
                return /^https?:\/\//i.test(s)
                    || s.startsWith('/')
                    || s.startsWith('data:')
                    || /cloudinary\.com/i.test(s);
            };

            const sanitizeValue = (val) => {
                if (typeof val === 'string') {
                    if (isLikelyUrlOrPath(val)) return val;
                    return val
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&#x27;');
                }
                if (typeof val === 'object' && val !== null) {
                    Object.keys(val).forEach((k) => { val[k] = sanitizeValue(val[k]); });
                }
                return val;
            };
            req.body = sanitizeValue(req.body);
        }
        next();
    });
    app.use(hpp());
}

module.exports = { applySecurityMiddleware };
