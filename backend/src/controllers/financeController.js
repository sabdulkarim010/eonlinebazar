/********************************************************************
 * Project: EonlineBazar
 * File: financeController.js
 * Location: backend/src/controllers/financeController.js
 * Description: Finance dashboard authentication — issues a scoped JWT
 * on login and verifies it on protected finance routes. Analytics
 * handlers live in financeAnalyticsController.js and are re-exported
 * here for backward compatibility.
 ********************************************************************/

const jwt = require('jsonwebtoken');
const Admin = require('../models/admin');
const {
    getFinanceOverview,
    getFinanceChartData,
    getFinanceAnalytics,
    getAnalyticsFilter
} = require('./financeAnalyticsController');

const FINANCE_TOKEN_TTL = process.env.FINANCE_TOKEN_TTL || '8h';
const FINANCE_TOKEN_SCOPE = 'finance-dashboard';
const JWT_SECRET = process.env.JWT_SECRET;

/* =========================================================================
   ৩. POST /api/finance/admin-login — হার্ড-কোডেড পাসওয়ার্ড লগইন
   -------------------------------------------------------------------------
   ফ্রন্টএন্ড থেকে পাঠানো পাসওয়ার্ড সরাসরি process.env.ADMIN_DASHBOARD_PASSWORD
   এর সাথে মিলিয়ে দেখা হয়। মিললে একটি স্বল্পমেয়াদী (ডিফল্ট ৮ ঘণ্টা) JWT সেশন
   টোকেন সাইন করে JSON-এ ফেরত পাঠানো হয়।
   ========================================================================= */
const financeAdminLogin = async (req, res) => {
    try {
        const password = (req.body && (req.body.password ?? req.body.adminPassword)) || '';
        const expected = process.env.ADMIN_DASHBOARD_PASSWORD;

        // সার্ভারে পাসওয়ার্ড কনফিগার করা না থাকলে নিরাপদভাবে আটকে দেওয়া
        if (!expected) {
            return res.status(503).json({
                success: false,
                message: 'Finance dashboard password is not configured on the server (ADMIN_DASHBOARD_PASSWORD missing).'
            });
        }

        if (!password || typeof password !== 'string') {
            return res.status(400).json({ success: false, message: 'Password is required.' });
        }

        if (password !== expected) {
            return res.status(401).json({ success: false, message: 'Incorrect password. Access denied.' });
        }

        // সফল হলে শুধুমাত্র এই ড্যাশবোর্ডের জন্য স্কোপড টোকেন সাইন করা
        const token = jwt.sign(
            { scope: FINANCE_TOKEN_SCOPE, role: 'admin' },
            JWT_SECRET,
            { expiresIn: FINANCE_TOKEN_TTL }
        );

        return res.json({
            success: true,
            message: 'Login successful.',
            token
        });
    } catch (err) {
        console.error('🔴 Finance Admin Login Error:', err);
        return res.status(500).json({ success: false, message: 'Login failed due to a server error.' });
    }
};

/* =========================================================================
   ৪. verifyFinanceToken — ফাইন্যান্স রুট প্রোটেকশন মিডলওয়্যার
   -------------------------------------------------------------------------
   প্রতিটি /api/finance/* (লগইন বাদে) রিকোয়েস্টে Authorization হেডারে থাকা
   টোকেন কঠোরভাবে যাচাই করে। টোকেন না থাকলে বা অবৈধ হলে 401 ফেরত দেয়।
   গ্রহণযোগ্য: ফাইন্যান্স-স্কোপড টোকেন, অথবা বিদ্যমান অ্যাডমিন প্যানেল টোকেন
   (role: 'admin'), যাতে আগের অ্যাডমিন ইন্টিগ্রেশন ভেঙে না যায়।
   ========================================================================= */
const verifyFinanceToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: 'No token provided. Please log in to the finance dashboard.',
            redirect: '/finance-login'
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        const isFinanceAdmin =
            decoded.scope === FINANCE_TOKEN_SCOPE ||
            decoded.role === 'admin' ||
            (decoded.username && !decoded.id && !decoded.sid && !decoded._id && !decoded.userId);

        if (!isFinanceAdmin) {
            return res.status(401).json({
                success: false,
                message: 'Invalid finance session. Please log in again.',
                redirect: '/finance-login'
            });
        }

        // 🛡️ RBAC: অ্যাডমিন প্যানেলের টোকেন দিয়ে ঢুকলে অ্যাকাউন্টটি এখনো সক্রিয়
        // কিনা এবং প্রফিট/মার্জিন ডাটা দেখার অনুমতি (view_analytics) আছে কিনা
        // যাচাই করা হয়। ফাইন্যান্স-স্কোপড টোকেন (আলাদা পাসওয়ার্ড) আগের মতোই চলে।
        if (decoded.scope !== FINANCE_TOKEN_SCOPE && decoded.username) {
            const account = await Admin.findOne({ username: decoded.username });

            if (!account || account.isBlocked()) {
                return res.status(403).json({
                    success: false,
                    message: 'This admin account is blocked or no longer exists.',
                    redirect: '/finance-login'
                });
            }

            if (!account.hasPermission('view_analytics')) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied. You do not have permission to view finance analytics.',
                    reason: 'PERMISSION_DENIED',
                    redirect: '/admin/access-denied'
                });
            }
        }

        req.financeAdmin = decoded;
        next();
    } catch (err) {
        return res.status(401).json({
            success: false,
            message: 'Session expired or invalid. Please log in again.',
            redirect: '/finance-login'
        });
    }
};

module.exports = {
    getFinanceOverview,
    getFinanceChartData,
    getFinanceAnalytics,
    getAnalyticsFilter,
    financeAdminLogin,
    verifyFinanceToken
};
