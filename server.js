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
const categoryRoutes = require('./routes/categoryRoutes'); 
const reviewRoutes = require('./routes/reviewRoutes');
const financeRoutes = require('./routes/financeRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// ২. ডাটাবেজ কানেক্ট করা
connectDB();

// ৩. প্রয়োজনীয় মিডলওয়্যারসমূহ
// প্রক্সি/হোস্টিং (Render, Vercel, Nginx ইত্যাদি)-এর পেছনে আসল ক্লায়েন্ট IP পেতে
app.set('trust proxy', true);
app.use(express.json()); 

// request-ip: প্রতিটি রিকোয়েস্টে আসল ক্লায়েন্ট IP req.clientIp-তে সেট করে
// (অ্যাক্টিভ ডিভাইস ও লোকেশন ট্র্যাকিং-এ ব্যবহৃত হয়)
app.use(requestIp.mw());

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

// স্ট্যাটিক ফাইলগুলো সার্ভ করার জন্য 'client' ফোল্ডার লিংক করা
app.use(express.static(path.join(__dirname, 'client')));

// ৪. এপিআই রুটসমূহ যুক্ত করা
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes); 
app.use('/api/admin', adminRoutes);
app.use('/api/customer', userRoutes);  
app.use('/api/auth', authRoutes);
app.use('/api/cart',cartRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/finance', financeRoutes);

/********************************************************************
 # FRONTEND UI ROUTES (ক্লিন ইউআরএল লজিক)
 ********************************************************************/

// হোমপেজ রুট
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'index.html'));
});

app.get('/index', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'index.html'));
});

// কাস্টমার প্রোফাইল, লগইন ও রেজিস্ট্রেশন রুট
app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'profile.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'register.html'));
});

app.get('/forgot-password', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'forgot-password.html'));
});

// অর্ডার ট্র্যাকিং ও শপিং পেজসমূহ
app.get('/order-track', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'order-track.html'));
});

// 🟢 নতুন যোগ করা হলো: Order Details পেজের ক্লিন রুট
app.get('/order-details', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'order-details.html'));
});

app.get('/product-details', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'product-details.html'));
});

app.get('/cart', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'cart.html'));
});

app.get('/checkout', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'checkout.html'));
});

app.get('/payment', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'payment.html'));
});

// ইনফরমেশনাল ও লেআউট পেজসমূহ
app.get('/about', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'about.html'));
});

app.get('/contact', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'contact.html'));
});

app.get('/footer', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'footer.html'));
});

// অ্যাডমিন প্যানেল রুটসমূহ
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'admin.html'));
});

app.get('/admin-login', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'admin-login.html'));
});

// ফাইন্যান্স ড্যাশবোর্ড লগইন পেজের ক্লিন রুট
app.get('/finance-login', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'finance-login.html'));
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

// ফাইন্যান্স ড্যাশবোর্ড সার্ভ করার আগে টোকেন চেক করার গার্ড হ্যান্ডলার
function serveFinanceDashboard(req, res) {
    const token = getFinanceTokenFromRequest(req);
    if (!isValidFinanceToken(token)) {
        // টোকেন না থাকলে/অবৈধ হলে সরাসরি লগইন পেজে — ব্ল্যাঙ্ক পেজ নয়
        return res.redirect('/finance-login');
    }
    res.sendFile(path.join(__dirname, 'client', 'finance-analytics.html'));
}

// ফাইন্যান্স ও অ্যানালিটিক্স প্যানেলের ক্লিন রুট (সার্ভার-সাইড গার্ডসহ)
// দ্রষ্টব্য: .html এক্সটেনশন স্ট্রিপার /finance-analytics.html কে 301 করে এই
// ক্লিন রুটে নিয়ে আসে, তাই এই গার্ডটি উভয় URL-কেই সুরক্ষা দেয়।
app.get('/finance-analytics', serveFinanceDashboard);

// 🌟 অ্যাডমিন-নেমস্পেসড সিকিউর অ্যালিয়াস রুট: GET /admin/finance
app.get('/admin/finance', serveFinanceDashboard);

/********************************************************************
 # 404 NOT FOUND HANDLER (🌟 নতুন: ভুল ইউআরএল হ্যান্ডেল করার জন্য)
 ********************************************************************/
app.use((req, res) => {
    // যদি এপিআই রুট ভুল হয় তবে জেসন রেসপন্স দেবে
    if (req.originalUrl.startsWith('/api/')) {
        return res.status(404).json({ success: false, message: "API endpoint not found!" });
    }
    // নরমাল পেজ ভুল হলে হোমপেজে বা আপনার কাস্টম ৪০৪ পেজে রিডাইরেক্ট করবে
    res.status(404).sendFile(path.join(__dirname, 'client', 'index.html')); 
});

// ৫. সার্ভার স্টার্ট করা
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});




