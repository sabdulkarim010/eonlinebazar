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
const express = require('express');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const requestIp = require('request-ip');
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
const attributeRoutes = require('./routes/attributeRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const financeRoutes = require('./routes/financeRoutes');
const couponRoutes = require('./routes/couponRoutes');
const storeRoutes = require('./routes/storeRoutes');
const storeSettingsMiddleware = require('./middlewares/storeSettingsMiddleware');
const { applyBrandingToHtml } = require('./utils/brandingHtml');
const { DEFAULT_SETTINGS } = require('./utils/storeSettingsService');

const app = express();
const PORT = process.env.PORT || 3000;
const CLIENT_DIR = path.join(__dirname, 'client');

function sendClientHtml(res, filename) {
    const absPath = path.join(CLIENT_DIR, filename);
    const settings = res.locals.settings || DEFAULT_SETTINGS;
    const html = applyBrandingToHtml(fs.readFileSync(absPath, 'utf8'), settings);
    res.type('html').send(html);
}

// ২. ডাটাবেজ কানেক্ট করা
connectDB();

// ৩. প্রয়োজনীয় মিডলওয়্যারসমূহ
// প্রক্সি/হোস্টিং (Render, Vercel, Nginx ইত্যাদি)-এর পেছনে আসল ক্লায়েন্ট IP পেতে
app.set('trust proxy', true);
app.use(express.json()); 

// request-ip: প্রতিটি রিকোয়েস্টে আসল ক্লায়েন্ট IP req.clientIp-তে সেট করে
// (অ্যাক্টিভ ডিভাইস ও লোকেশন ট্র্যাকিং-এ ব্যবহৃত হয়)
app.use(requestIp.mw());

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
app.use('/api/attributes', attributeRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/store', storeRoutes);

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

app.get('/product-details', (req, res) => {
    sendClientHtml(res, 'product-details.html');
});

// 🌟 সার্চ রেজাল্ট পেজের ক্লিন রুট (?q=keyword দিয়ে অ্যাক্সেস)
app.get('/search', (req, res) => {
    sendClientHtml(res, 'search.html');
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

app.get('/admin-login', (req, res) => {
    sendClientHtml(res, 'admin-login.html');
});

// Login alias
app.get('/admin/login', (req, res) => {
    sendClientHtml(res, 'admin-login.html');
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
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'eOnlineBazarSecretKey123');
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

// স্ট্যাটিক assets (CSS/JS/images/uploads) — index.html সরাসরি সerv করবে না; সব HTML পেজ উপরের ব্র্যান্ডেড রুট দিয়ে যায়
app.use(express.static(CLIENT_DIR, { index: false }));

/********************************************************************
 # 404 NOT FOUND HANDLER (🌟 নতুন: ভুল ইউআরএল হ্যান্ডেল করার জন্য)
 ********************************************************************/
app.use((req, res) => {
    // যদি এপিআই রুট ভুল হয় তবে জেসন রেসপন্স দেবে
    if (req.originalUrl.startsWith('/api/')) {
        return res.status(404).json({ success: false, message: "API endpoint not found!" });
    }
    // নরমাল পেজ ভুল হলে হোমপেজে বা আপনার কাস্টম ৪০৪ পেজে রিডাইরেক্ট করবে
    res.status(404);
    sendClientHtml(res, 'index.html'); 
});

// ৫. সার্ভার স্টার্ট করা
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});








