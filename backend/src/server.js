/********************************************************************
 * Project: EonlineBazar
 * File: server.js
 * Location: backend/src/server.js
 * Author: Abdul Karim Sheikh
 * Description: Main entry point of the backend server. Configures
 * environment variables, database connections, global middlewares,
 * and API route mounts. HTML views live in routes/viewRoutes.js.
 ********************************************************************/

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('./utils/validateEnv')();

global.SERVER_START_TIME = Date.now().toString();
const { applySecurityMiddleware } = require('./middlewares/securityMiddleware');
const express = require('express');
const requestIp = require('request-ip');
const session = require('express-session');
const passport = require('./config/passport');
const connectDB = require('./config/db');

// ১. রুট ফাইলসমূহ ইমপোর্ট করা
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const adminRoutes = require('./routes/adminRoutes');
const userRoutes = require('./routes/userRoutes');
const authRoutes = require('./routes/authRoutes');
const cartRoutes = require ('./routes/cartRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const brandRoutes = require('./routes/brandRoutes');
const navbarLinkRoutes = require('./routes/navbarLinkRoutes');
const attributeRoutes = require('./routes/attributeRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const financeRoutes = require('./routes/financeRoutes');
const { verifyFinanceToken } = require('./controllers/financeController');
const { getFinanceAnalytics } = require('./controllers/financeAnalyticsController');
const { mountViewRoutes } = require('./routes/viewRoutes');
const couponRoutes = require('./routes/couponRoutes');
const storeRoutes = require('./routes/storeRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const contactRoutes = require('./routes/contactRoutes');
const inquiryRoutes = require('./routes/inquiryRoutes');
const newsletterRoutes = require('./routes/newsletterRoutes');
const { seedDefaultPaymentMethods } = require('./services/paymentMethodService');
const storeSettingsMiddleware = require('./middlewares/storeSettingsMiddleware');
const bannerRoutes = require('./routes/bannerRoutes');
const noteRoutes = require('./routes/noteRoutes');

const app = express();
const PORT = process.env.PORT || 3000;
const REPO_ROOT = path.join(__dirname, '..', '..');
const PUBLIC_DIR = path.join(REPO_ROOT, 'public');

// ২. ডাটাবেজ কানেক্ট করা
// কানেকশনের পরপরই RBAC ডিফল্ট ব্যাকফিল করা হয় — RBAC চালুর আগে তৈরি হওয়া
// অ্যাডমিন ডকুমেন্টে role/status ফিল্ড না থাকলে সেগুলো superadmin/active হিসেবে
// সেট হয়, যাতে মালিকের অ্যাক্সেস কোনোভাবেই নষ্ট না হয়।
connectDB().then(async () => {
    try {
        const Admin = require('./models/admin');
        const { rolesBackfilled, statusBackfilled } = await Admin.ensureRbacDefaults();
        if (rolesBackfilled || statusBackfilled) {
            console.log(`🛡️  RBAC backfill: ${rolesBackfilled} role(s), ${statusBackfilled} status field(s) normalized.`);
        }
    } catch (err) {
        console.error('RBAC bootstrap error:', err.message);
    }

    // 💳 পেমেন্ট মেথড ক্যাটালগ বুটস্ট্র্যাপ — কালেকশন খালি থাকলে পুরোনো
    // Settings.paymentGateways টগল ও আপলোড করা লোগো থেকে মেথডগুলো একবারই
    // মাইগ্রেট হয়, যাতে ডিপ্লয়ের পর চেকআউটে একই মেথডগুলোই সক্রিয় থাকে।
    try {
        await seedDefaultPaymentMethods();
    } catch (err) {
        console.error('Payment method bootstrap error:', err.message);
    }

    // Start background stock alert cron job
    try {
        const { startStockAlertCron } = require('./services/stockAlertService');
        startStockAlertCron();
    } catch (err) {
        console.error('Stock alert cron bootstrap error:', err.message);
    }

    const redisClient = require('./utils/redisClient');
    redisClient.on('connect', () => console.log('Redis Connected ✅'));
    redisClient.on('error', (err) => console.warn('Redis unavailable:', err.message));
});

// ৩. প্রয়োজনীয় মিডলওয়্যারসমূহ
// প্রক্সি/হোস্টিং (Render, Vercel, Nginx ইত্যাদি)-এর পেছনে আসল ক্লায়েন্ট IP পেতে
app.set('trust proxy', true);
app.use(express.json());
// request-ip must run before rate limiting so localhost/admin bypass can read client IP
app.use(requestIp.mw());
applySecurityMiddleware(app);

// 🔴 Emergency control panel — mounted early, separate from admin auth
const emergencyRoutes = require('./routes/emergencyRoutes');
app.use('/sys', emergencyRoutes);

// Google OAuth — express-session + passport (before API routes)
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000
    }
}));
app.use(passport.initialize());
app.use(passport.session());

// Global store branding/settings from MongoDB — available as res.locals.settings on every request
app.use(storeSettingsMiddleware);

/********************************************************************
 # .HTML EXTENSION STRIPPER & REDIRECT MIDDLEWARE (🌟 ফিক্স করা হয়েছে)
 # ইউজার ইউআরএল-এ .html লিখলে সেটি কেটে ক্লিন ইউআরএল-এ রিডাইরেক্ট করবে
 # এবং সাথের ?id=... থাকলে সেটাও ঠিকঠাক পাস করবে।
 ********************************************************************/
app.use((req, res, next) => {
    if (req.path.endsWith('.html') && req.path !== '/index.html') {
        const newPath = req.path.slice(0, -5);
        // 🚀 ফিক্স: URL এর শেষে ?id=... থাকলে সেটা যেন না কাটে
        const queryString = req.url.slice(req.path.length);
        return res.redirect(301, newPath + queryString);
    } else if (req.path === '/index.html') {
        const queryString = req.url.slice(req.path.length);
        return res.redirect(301, '/' + queryString);
    }
    next();
});

// Development: prevent browser caching of HTML pages (avoids stale SW-triggered reloads)
if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        if (req.path.endsWith('.html') ||
            req.path === '/' ||
            !req.path.includes('.')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
        next();
    });
}

// ব্রাউজারকে বলবেন ফাইলগুলো ক্যাশ না করতে
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

// ৪. এপিআই রুটসমূহ যুক্ত করা (স্ট্যাটিক ফাইলের আগে — JSON/API সবসময় ব্র্যান্ডেড HTML-এর আগে মিলবে)
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/customer', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/navbar-links', navbarLinkRoutes);
app.use('/api/attributes', attributeRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/store', storeRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/inquiries', inquiryRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api', bannerRoutes);
app.use('/api/notes', noteRoutes);

// Finance analytics — explicit path expected by the dashboard UI
// URL: GET /admin/api/analytics?period=&startDate=&endDate=
app.get('/admin/api/analytics', verifyFinanceToken, getFinanceAnalytics);

// HTML views, static assets, CMS catch-all, and branded 404
mountViewRoutes(app);

app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    if (req.path.startsWith('/api/') || req.path.startsWith('/admin/api/')) {
        return res.status(500).json({
            success: false,
            message: process.env.NODE_ENV === 'production'
                ? 'Internal server error'
                : err.message
        });
    }
    res.status(500).sendFile(path.join(PUBLIC_DIR, '404.html'));
});

// ৫. সার্ভার স্টার্ট করা (Socket.IO requires the raw HTTP server)
const http = require('http');
const httpServer = http.createServer(app);
const { initSocketServer } = require('./services/socketService');
initSocketServer(httpServer);

httpServer.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});


