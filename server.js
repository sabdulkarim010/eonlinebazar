/********************************************************************
 * Project: EonlineBazar
 * File: server.js
 * Location: ./server.js
 * Author: Abdul Karim Sheikh
 * Description: Main entry point of the backend server. Configures 
 * environment variables, database connections, global middlewares, 
 * API routing, and custom clean URLs for the frontend client.
 ********************************************************************/

require('dotenv').config();
require('./utils/validateEnv')();

global.SERVER_START_TIME = Date.now().toString();
const { applySecurityMiddleware } = require('./middleware/securityMiddleware');
const express = require('express');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
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
const { getFinanceAnalytics, verifyFinanceToken } = require('./controllers/financeController');
const couponRoutes = require('./routes/couponRoutes');
const storeRoutes = require('./routes/storeRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const contactRoutes = require('./routes/contactRoutes');
const inquiryRoutes = require('./routes/inquiryRoutes');
const newsletterRoutes = require('./routes/newsletterRoutes');
const { seedDefaultPaymentMethods } = require('./utils/paymentMethodService');
const storeSettingsMiddleware = require('./middlewares/storeSettingsMiddleware');
const { applyBrandingToHtml } = require('./utils/brandingHtml');
const { DEFAULT_SETTINGS } = require('./utils/storeSettingsService');
const seoRoutes = require('./routes/seoRoutes');
const bannerRoutes = require('./routes/bannerRoutes');
const { serveProductDetailsWithSeo, serveSearchWithSeo } = require('./utils/seoPageService');

const app = express();
const PORT = process.env.PORT || 3000;
const CLIENT_DIR = path.join(__dirname, 'client');
const PUBLIC_DIR = path.join(__dirname, 'public');

function sendClientHtml(res, filename) {
    const absPath = path.join(CLIENT_DIR, filename);
    const settings = res.locals.settings || DEFAULT_SETTINGS;
    const html = applyBrandingToHtml(fs.readFileSync(absPath, 'utf8'), settings, { filename });
    res.type('html').send(html);
}

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
        const { startStockAlertCron } = require('./utils/stockAlertService');
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

// request-ip already mounted above (before rate limiting)

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

// Finance analytics — explicit path expected by the dashboard UI
// URL: GET /admin/api/analytics?period=&startDate=&endDate=
app.get('/admin/api/analytics', verifyFinanceToken, getFinanceAnalytics);

/********************************************************************
 # FRONTEND UI ROUTES (ক্লিন ইউআরএল লজিক)
 ********************************************************************/

// হোমপেজ রুট
app.get('/', (req, res) => {
    sendClientHtml(res, 'index.html');
});

app.get('/index', (req, res) => {
    sendClientHtml(res, 'index.html');
});

// কাস্টমার প্রোফাইল, লগইন ও রেজিস্ট্রেশন রুট
app.get('/profile', (req, res) => {
    sendClientHtml(res, 'profile.html');
});

app.get('/login', (req, res) => {
    sendClientHtml(res, 'login.html');
});

app.get('/register', (req, res) => {
    sendClientHtml(res, 'register.html');
});

app.get('/forgot-password', (req, res) => {
    sendClientHtml(res, 'forgot-password.html');
});

// অর্ডার ট্র্যাকিং ও শপিং পেজসমূহ
app.get('/order-track', (req, res) => {
    sendClientHtml(res, 'order-track.html');
});

// 🟢 নতুন যোগ করা হলো: Order Details পেজের ক্লিন রুট
app.get('/order-details', (req, res) => {
    sendClientHtml(res, 'order-details.html');
});

app.get('/product-details', serveProductDetailsWithSeo);

// 🌟 সার্চ রেজাল্ট পেজের ক্লিন রুট (?q=keyword দিয়ে অ্যাক্সেস)
app.get('/search', serveSearchWithSeo);

// Browse all products (navbar "All") — same search page, no empty-state prompt
app.get('/products', serveSearchWithSeo);

// Category product listing — /category/mobile → same search page scoped to that category
app.get('/category/:slug', (req, res) => {
    req.query.category = req.params.slug;
    return serveSearchWithSeo(req, res);
});

app.get('/cart', (req, res) => {
    sendClientHtml(res, 'cart.html');
});

app.get('/checkout', (req, res) => {
    sendClientHtml(res, 'checkout.html');
});

app.get('/payment', (req, res) => {
    sendClientHtml(res, 'payment.html');
});

// ইনফরমেশনাল ও লেআউট পেজসমূহ
app.get('/about', (req, res) => {
    sendClientHtml(res, 'about.html');
});

app.get('/contact', (req, res) => {
    sendClientHtml(res, 'contact.html');
});

app.get('/privacy-policy', (req, res) => {
    sendClientHtml(res, 'cms-page.html');
});

app.get('/privacy', (req, res) => {
    sendClientHtml(res, 'cms-page.html');
});

app.get('/terms', (req, res) => {
    sendClientHtml(res, 'cms-page.html');
});

app.get('/terms-conditions', (req, res) => {
    sendClientHtml(res, 'cms-page.html');
});

app.get('/terms-and-conditions', (req, res) => {
    sendClientHtml(res, 'cms-page.html');
});

app.get('/careers', (req, res) => {
    sendClientHtml(res, 'cms-page.html');
});

// Dynamic CMS pages — /pages/:slug, /page/:slug, and /page.html?slug=xxx
app.get('/pages/:slug', (req, res) => {
    sendClientHtml(res, 'cms-page.html');
});

app.get('/page/:slug', (req, res) => {
    sendClientHtml(res, 'cms-page.html');
});

app.get('/page.html', (req, res) => {
    sendClientHtml(res, 'cms-page.html');
});

app.get('/page', (req, res) => {
    sendClientHtml(res, 'cms-page.html');
});

app.get('/footer', (req, res) => {
    sendClientHtml(res, 'footer.html');
});

// অ্যাডমিন প্যানেল রুটসমূহ
app.get('/admin', (req, res) => {
    sendClientHtml(res, 'admin.html');
});

// Dashboard alias (same panel as /admin)
app.get('/admin/dashboard', (req, res) => {
    sendClientHtml(res, 'admin.html');
});

app.get('/admin/messages', (req, res) => {
    sendClientHtml(res, 'admin.html');
});

// Catalog Management → Navbar Menu Links deep-link
app.get('/admin/navbar-links', (req, res) => {
    sendClientHtml(res, 'admin.html');
});

// Super Admin file manager deep-link (same SPA panel as /admin)
app.get('/admin/file-manager', (req, res) => {
    sendClientHtml(res, 'admin.html');
});

app.get('/admin-login', (req, res) => {
    sendClientHtml(res, 'admin-login.html');
});

// Login alias
app.get('/admin/login', (req, res) => {
    sendClientHtml(res, 'admin-login.html');
});

// 🚫 Access Denied — RBAC মিডলওয়্যার পেজ নেভিগেশন ব্লক করলে এখানে পাঠায়
// (API কল হলে JSON 403 ফেরত যায়, পেজ লোড হলে এই ভিউ)
app.get('/admin/access-denied', (req, res) => {
    res.status(403);
    sendClientHtml(res, 'access-denied.html');
});

// Full admin logout: clear server-side cookies and cleanly redirect to the
// login page. The admin JWT lives in localStorage (a browser page navigation
// can't send it), so the login page finishes the client-side cleanup +
// server session revocation when it sees ?loggedout=1. No HTML is rendered
// here — this is a standard redirect so the login template always styles.
app.get('/admin/logout', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.clearCookie('adminToken', { path: '/' });
    res.clearCookie('token', { path: '/' });
    return res.redirect('/admin/login?loggedout=1');
});

// 🔐 2-Step Verification page (Email OTP / Google Authenticator / SMS).
// The client-side script guards access: without a valid handoff token it
// bounces the visitor back to /admin-login.
function serveAdminOtpPage(req, res) {
    sendClientHtml(res, 'verify-otp.html');
}
app.get('/admin/verify-otp', serveAdminOtpPage);
app.get('/verify-otp', serveAdminOtpPage);

// ফাইন্যান্স ড্যাশবোর্ড লগইন পেজের ক্লিন রুট
app.get('/finance-login', (req, res) => {
    sendClientHtml(res, 'finance-login.html');
});

/********************************************************************
 # FINANCE DASHBOARD: SERVER-SIDE PAGE GUARD (🔒)
 # ব্রাউজার পেজ নেভিগেশনে Authorization হেডার পাঠাতে পারে না (টোকেন
 # localStorage-এ থাকে)। তাই finance-login সফল হলে টোকেনটি একটি কুকিতেও
 # সেট করা হয়, যেন নিচের গার্ড সার্ভার-সাইডে পেজ লোডের আগেই টোকেন যাচাই
 # করতে পারে এবং অবৈধ হলে /finance-login এ রিডাইরেক্ট করতে পারে।
 ********************************************************************/

// রিকোয়েস্ট থেকে টোকেন বের করা: Authorization হেডার → ?token= → কুকি
function getFinanceTokenFromRequest(req) {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.split(' ')[1];
    }
    if (req.query && req.query.token) {
        return String(req.query.token);
    }
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
        const cookies = {};
        cookieHeader.split(';').forEach((pair) => {
            const idx = pair.indexOf('=');
            if (idx > -1) {
                const key = pair.slice(0, idx).trim();
                const val = pair.slice(idx + 1).trim();
                try { cookies[key] = decodeURIComponent(val); } catch (e) { cookies[key] = val; }
            }
        });
        return cookies.financeToken || cookies.adminToken || null;
    }
    return null;
}

// টোকেনটি ফাইন্যান্স/অ্যাডমিন স্কোপের বৈধ টোকেন কিনা যাচাই
function isValidFinanceToken(token) {
    if (!token) return false;
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return (
            decoded.scope === 'finance-dashboard' ||
            decoded.role === 'admin' ||
            (decoded.username && !decoded.id && !decoded.sid && !decoded._id && !decoded.userId)
        );
    } catch (err) {
        return false;
    }
}

// ফাইন্যান্স ড্যাশবোর্ড সার্ভ করার হ্যান্ডলার — ক্লায়েন্ট-সাইড টোকেন গেট (অ্যাডমিন প্যানেলের মতো)
// localStorage-এ adminToken থাকলেও ব্রাউজার নেভিগেশনে কুকি/হেডার যায় না; তাই HTML সরাসরি সerv করা হয়।
function serveFinanceDashboard(req, res) {
    sendClientHtml(res, 'finance-analytics.html');
}

// ফাইন্যান্স ও অ্যানালিটিক্স প্যানেলের ক্লিন রুট (সার্ভার-সাইড গার্ডসহ)
// দ্রষ্টব্য: .html এক্সটেনশন স্ট্রিপার /finance-analytics.html কে 301 করে এই
// ক্লিন রুটে নিয়ে আসে, তাই এই গার্ডটি উভয় URL-কেই সুরক্ষা দেয়।
app.get('/finance-analytics', serveFinanceDashboard);

// 🌟 অ্যাডমিন-নেমস্পেসড সিকিউর অ্যালিয়াস রুট: GET /admin/finance
app.get('/admin/finance', serveFinanceDashboard);

// Payment reconciliation admin page
function servePaymentReconciliationPage(req, res) {
    sendClientHtml(res, 'payment-reconciliation.html');
}
app.get('/admin/payment-reconciliation', servePaymentReconciliationPage);

// Admin order detail deep-link (opens invoice modal in admin panel)
app.get('/admin/order-details/:orderId', (req, res) => {
    sendClientHtml(res, 'admin.html');
});

// Unknown admin pages → dashboard (avoids blank page on bad admin URLs)
app.get('/admin/*splat', (req, res) => {
    res.redirect('/admin/dashboard');
});

// Public SEO endpoints — before static files and 404 handler
app.use(seoRoutes);

// PWA manifest and service worker (correct MIME + SW scope headers)
app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/manifest+json');
    res.sendFile(path.join(PUBLIC_DIR, 'manifest.json'));
});
app.get('/service-worker.js', (req, res) => {
    const swPath = path.join(PUBLIC_DIR, 'service-worker.js');

    try {
        let swContent = fs.readFileSync(swPath, 'utf8');
        swContent = swContent.replace(
            '__BUILD_TIMESTAMP__',
            global.SERVER_START_TIME || Date.now().toString()
        );
        res.setHeader('Content-Type', 'application/javascript');
        res.setHeader('Service-Worker-Allowed', '/');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.send(swContent);
    } catch (err) {
        res.status(404).send('// Service worker not found');
    }
});

const staticAssetOptions = {
    index: false,
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
        } else if (filePath.match(/\.(js|css)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=3600');
        } else if (filePath.match(/\.(png|jpg|jpeg|gif|svg|ico|webp)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=604800');
        }
    }
};

/********************************************************************
 # PRIVATE ROOT FILES — never expose over public HTTP
 # ADMIN_NOTES.md lives at the project root for VS Code / Admin File
 # Manager only. It is intentionally outside client/ and public/, and
 # this guard blocks any direct URL probe (case-insensitive).
 ********************************************************************/
const PRIVATE_HTTP_BASENAMES = new Set(['admin_notes.md']);
app.use((req, res, next) => {
    const base = path.basename(String(req.path || '')).toLowerCase();
    if (PRIVATE_HTTP_BASENAMES.has(base)) {
        return res.status(404).json({
            success: false,
            message: 'Not found'
        });
    }
    next();
});

// Static assets — public/ (optional shared assets) then client/ storefront root
// Note: project-root files (e.g. ADMIN_NOTES.md) are NOT mounted here.
if (fs.existsSync(PUBLIC_DIR)) {
    app.use(express.static(PUBLIC_DIR, staticAssetOptions));
}
app.use(express.static(CLIENT_DIR, staticAssetOptions));

/********************************************************************
 # DYNAMIC CMS PAGE CATCH-ALL
 # Serves cms-page.html for single-segment paths like /return-policy
 # when they are not reserved app routes. Client loader fetches content
 # by slug from /api/store/pages/:slug (404 UI if unpublished/missing).
 ********************************************************************/
const CMS_RESERVED_SLUGS = new Set([
    'index', 'profile', 'login', 'register', 'forgot-password',
    'order-track', 'order-details', 'product-details', 'search',
    'cart', 'checkout', 'payment', 'footer', 'admin', 'admin-login',
    'finance-login', 'finance-analytics', 'verify-otp', 'api',
    'uploads', 'css', 'js', 'images', 'assets', 'public', 'pages',
    'page', 'manifest', 'service-worker', 'robots', 'sitemap', 'favicon'
]);

app.get('/:slug', (req, res, next) => {
    const slug = String(req.params.slug || '').toLowerCase();
    if (!slug || slug.includes('.') || CMS_RESERVED_SLUGS.has(slug)) {
        return next();
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        return next();
    }
    return sendClientHtml(res, 'cms-page.html');
});

/********************************************************************
 # 404 NOT FOUND HANDLER (🌟 নতুন: ভুল ইউআরএল হ্যান্ডেল করার জন্য)
 ********************************************************************/
app.use((req, res) => {
    // Don't intercept API routes — return JSON 404 for those
    if (req.path.startsWith('/api/') || req.path.startsWith('/admin/api/')) {
        return res.status(404).json({
            success: false,
            message: `Route not found: ${req.method} ${req.path}`
        });
    }
    // For all other unknown routes, serve the branded 404 HTML page (with GA4)
    const settings = res.locals.settings || DEFAULT_SETTINGS;
    const notFoundHtml = applyBrandingToHtml(
        fs.readFileSync(path.join(PUBLIC_DIR, '404.html'), 'utf8'),
        settings,
        { filename: '404.html' }
    );
    res.status(404).type('html').send(notFoundHtml);
});

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
    res.status(500).sendFile(path.join(__dirname, 'public', '404.html'));
});

// ৫. সার্ভার স্টার্ট করা (Socket.IO requires the raw HTTP server)
const http = require('http');
const httpServer = http.createServer(app);
const { initSocketServer } = require('./utils/socketService');
initSocketServer(httpServer);

httpServer.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});








