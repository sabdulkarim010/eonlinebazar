/********************************************************************
 * Project: EonlineBazar
 * File: financeController.js
 * Location: controllers/financeController.js
 * Author: Abdul Karim Sheikh
 * Description: Finance & Analytics controller. Aggregates orders from
 * the Order model to compute Total Revenue, Net Profit (per-item
 * costPrice vs sellingPrice difference), Daily Profit (today) and
 * Monthly Profit (current month). Also returns chart-ready datasets
 * for the admin Finance & Analytics panel. Returns clean JSON only.
 ********************************************************************/

const jwt = require('jsonwebtoken');
const Order = require('../models/order');
const Product = require('../models/product');

// ফাইন্যান্স ড্যাশবোর্ড সেশন টোকেনের মেয়াদ ও স্কোপ
const FINANCE_TOKEN_TTL = process.env.FINANCE_TOKEN_TTL || '8h';
const FINANCE_TOKEN_SCOPE = 'finance-dashboard';
const JWT_SECRET = process.env.JWT_SECRET || 'eOnlineBazarSecretKey123';

/* =========================================================================
   কনফিগারেশন (Config)
   -------------------------------------------------------------------------
   কিছু পুরোনো অর্ডার আইটেমে costPrice আলাদাভাবে সেভ করা নাও থাকতে পারে।
   এমন ক্ষেত্রে নিচের DEFAULT_COST_RATIO ব্যবহার করে সেলিং প্রাইস থেকে
   একটি নিরাপদ কস্ট অনুমান করা হয় (যেমন: 0.70 মানে সেলিং প্রাইসের ৭০% কস্ট,
   অর্থাৎ ৩০% মার্জিন)। .env এ FINANCE_DEFAULT_COST_RATIO দিয়ে বদলানো যায়।
   ========================================================================= */
const DEFAULT_COST_RATIO = (() => {
    const raw = parseFloat(process.env.FINANCE_DEFAULT_COST_RATIO);
    if (!isNaN(raw) && raw >= 0 && raw < 1) return raw;
    return 0.70;
})();

// বাতিল/ফেরত হওয়া অর্ডার রেভিনিউ থেকে বাদ দেওয়ার জন্য স্ট্যাটাস তালিকা
const EXCLUDED_STATUSES = ['cancelled', 'canceled', 'returned', 'refunded', 'failed'];

/* =========================================================================
   ছোট হেল্পার ফাংশনসমূহ (Safe parsing helpers)
   ========================================================================= */

// নিরাপদে নাম্বারে রূপান্তর করা (null/undefined/স্ট্রিং সব হ্যান্ডেল করে)
function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

// একটি অর্ডারের নির্ভরযোগ্য তারিখ বের করা (createdAt না থাকলে _id থেকে)
function resolveOrderDate(order) {
    if (order.createdAt) {
        const d = new Date(order.createdAt);
        if (!isNaN(d.getTime())) return d;
    }
    if (order.updatedAt) {
        const d = new Date(order.updatedAt);
        if (!isNaN(d.getTime())) return d;
    }
    // ObjectId এর ভেতরে টাইমস্ট্যাম্প থাকে — শেষ ব্যাকআপ হিসেবে ব্যবহার
    if (order._id && typeof order._id.getTimestamp === 'function') {
        return order._id.getTimestamp();
    }
    return null;
}

// একটি অর্ডার রেভিনিউ গণনায় ধরা হবে কিনা
function isCountableOrder(order) {
    const status = (order.status || '').toString().trim().toLowerCase();
    return !EXCLUDED_STATUSES.includes(status);
}

/* =========================================================================
   কোর গণনা ইঞ্জিন (Core financial computation)
   -------------------------------------------------------------------------
   প্রতিটি অর্ডারের প্রতিটি আইটেম ঘুরে সেলিং প্রাইস ও কস্ট প্রাইস বের করে
   রেভিনিউ ও নেট প্রফিট হিসাব করা হয়। কস্ট প্রাইস বিভিন্ন সম্ভাব্য ফিল্ড নাম
   (costPrice / cost / purchasePrice / buyPrice) থেকে নেওয়া হয়, না পেলে
   প্রোডাক্ট ক্যাটালগ থেকে, তাও না পেলে DEFAULT_COST_RATIO দিয়ে অনুমান।
   ========================================================================= */
function computeItemFinance(item, productCostMap) {
    const quantity = Math.max(1, toNumber(item.quantity, 1));

    // সেলিং প্রাইস: একাধিক সম্ভাব্য ফিল্ড নাম নিরাপদে চেক করা
    const sellingPrice = toNumber(
        item.sellingPrice ?? item.price ?? item.unitPrice ?? item.salePrice,
        0
    );

    // কস্ট প্রাইস: আইটেমে সরাসরি থাকলে নেওয়া (buyingPrice সর্বোচ্চ অগ্রাধিকার)
    let costPrice = item.buyingPrice ?? item.costPrice ?? item.cost ?? item.purchasePrice ?? item.buyPrice;
    costPrice = costPrice !== undefined && costPrice !== null ? toNumber(costPrice, NaN) : NaN;

    // আইটেমে না থাকলে প্রোডাক্ট ক্যাটালগ ম্যাপ থেকে খোঁজা
    if (!Number.isFinite(costPrice)) {
        const productId = item.id || item.productId || item._id;
        if (productId && productCostMap.has(String(productId))) {
            costPrice = productCostMap.get(String(productId));
        }
    }

    // তাও না পেলে সেলিং প্রাইসের অনুপাত হিসেবে নিরাপদ অনুমান
    if (!Number.isFinite(costPrice) || costPrice <= 0) {
        costPrice = sellingPrice * DEFAULT_COST_RATIO;
    }

    const lineRevenue = sellingPrice * quantity;
    const lineProfit = (sellingPrice - costPrice) * quantity;

    return { quantity, lineRevenue, lineProfit };
}

// প্রোডাক্ট ক্যাটালগ থেকে costPrice ম্যাপ তৈরি করা (যদি ফিল্ডটি থাকে)
async function buildProductCostMap() {
    const map = new Map();
    try {
        // buyingPrice হলো মূল ফিল্ড; পুরোনো ডাটার জন্য costPrice/cost/purchasePrice ও রাখা হলো
        const products = await Product.find({}, { _id: 1, productId: 1, buyingPrice: 1, costPrice: 1, cost: 1, purchasePrice: 1 }).lean();
        for (const p of products) {
            const cost = p.buyingPrice ?? p.costPrice ?? p.cost ?? p.purchasePrice;
            if (cost === undefined || cost === null) continue;
            const numericCost = toNumber(cost, NaN);
            if (!Number.isFinite(numericCost)) continue;
            if (p._id) map.set(String(p._id), numericCost);
            if (p.productId) map.set(String(p.productId), numericCost);
        }
    } catch (err) {
        console.error('⚠️ buildProductCostMap warning:', err.message);
    }
    return map;
}

/* =========================================================================
   ১. GET /api/finance/overview — KPI সামারি
   -------------------------------------------------------------------------
   রিটার্ন করে: Total Revenue, Net Profit, Daily Profit (আজ),
   Monthly Profit (চলতি মাস), Total Orders, Daily Sales ইত্যাদি।
   ========================================================================= */
const getFinanceOverview = async (req, res) => {
    try {
        const productCostMap = await buildProductCostMap();
        const orders = await Order.find().lean();

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        let totalRevenue = 0;
        let netProfit = 0;
        let dailyRevenue = 0;
        let dailyProfit = 0;
        let monthlyRevenue = 0;
        let monthlyProfit = 0;
        let totalOrders = 0;
        let dailyOrders = 0;
        let monthlyOrders = 0;

        for (const order of orders) {
            if (!isCountableOrder(order)) continue;

            const orderDate = resolveOrderDate(order);
            const items = Array.isArray(order.items) ? order.items : [];

            let orderRevenue = 0;
            let orderProfit = 0;
            for (const item of items) {
                const { lineRevenue, lineProfit } = computeItemFinance(item, productCostMap);
                orderRevenue += lineRevenue;
                orderProfit += lineProfit;
            }

            // আইটেম থেকে রেভিনিউ না বের হলে (পুরোনো অর্ডার) totalAmount ফলব্যাক
            if (orderRevenue <= 0) {
                orderRevenue = toNumber(order.totalAmount, 0);
                orderProfit = orderRevenue * (1 - DEFAULT_COST_RATIO);
            }

            totalRevenue += orderRevenue;
            netProfit += orderProfit;
            totalOrders += 1;

            if (orderDate && orderDate >= startOfMonth) {
                monthlyRevenue += orderRevenue;
                monthlyProfit += orderProfit;
                monthlyOrders += 1;
            }
            if (orderDate && orderDate >= startOfToday) {
                dailyRevenue += orderRevenue;
                dailyProfit += orderProfit;
                dailyOrders += 1;
            }
        }

        const round = (n) => Math.round((toNumber(n, 0) + Number.EPSILON) * 100) / 100;
        const profitMargin = totalRevenue > 0 ? round((netProfit / totalRevenue) * 100) : 0;
        const avgOrderValue = totalOrders > 0 ? round(totalRevenue / totalOrders) : 0;

        return res.json({
            success: true,
            currency: 'BDT',
            generatedAt: now.toISOString(),
            data: {
                totalRevenue: round(totalRevenue),
                netProfit: round(netProfit),
                dailyRevenue: round(dailyRevenue),
                dailyProfit: round(dailyProfit),
                monthlyRevenue: round(monthlyRevenue),
                monthlyProfit: round(monthlyProfit),
                totalOrders,
                dailyOrders,
                monthlyOrders,
                profitMargin,
                avgOrderValue
            }
        });
    } catch (err) {
        console.error('🔴 Finance Overview Error:', err);
        return res.status(500).json({ success: false, message: 'Failed to compute finance overview.', error: err.message });
    }
};

/* =========================================================================
   ২. GET /api/finance/chart-data — চার্ট ডাটাসেট
   -------------------------------------------------------------------------
   রিটার্ন করে:
   - revenueVsProfit: গত ১২ মাসের মাস-ভিত্তিক Revenue ও Profit (লাইন চার্ট)
   - topCategories: টপ সেলিং ক্যাটাগরি বাই রেভিনিউ (পাই চার্ট)
   ========================================================================= */
const getFinanceChartData = async (req, res) => {
    try {
        const productCostMap = await buildProductCostMap();

        // প্রোডাক্ট আইডি → ক্যাটাগরি ম্যাপ (পাই চার্টের জন্য)
        const categoryMap = new Map();
        try {
            const products = await Product.find({}, { _id: 1, productId: 1, category: 1 }).lean();
            for (const p of products) {
                const cat = p.category || 'General';
                if (p._id) categoryMap.set(String(p._id), cat);
                if (p.productId) categoryMap.set(String(p.productId), cat);
            }
        } catch (err) {
            console.error('⚠️ category map warning:', err.message);
        }

        const orders = await Order.find().lean();
        const now = new Date();

        // গত ১২ মাসের বাকেট তৈরি (পুরোনো → নতুন)
        const months = [];
        const monthIndex = new Map();
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
            monthIndex.set(key, months.length);
            months.push({ key, label, revenue: 0, profit: 0 });
        }

        const categoryRevenue = new Map();

        for (const order of orders) {
            if (!isCountableOrder(order)) continue;

            const orderDate = resolveOrderDate(order);
            const items = Array.isArray(order.items) ? order.items : [];

            let orderRevenue = 0;
            let orderProfit = 0;

            for (const item of items) {
                const { lineRevenue, lineProfit } = computeItemFinance(item, productCostMap);
                orderRevenue += lineRevenue;
                orderProfit += lineProfit;

                // ক্যাটাগরি রেভিনিউ জমা করা
                const productId = item.id || item.productId || item._id;
                const category = (productId && categoryMap.get(String(productId))) || item.category || 'General';
                categoryRevenue.set(category, (categoryRevenue.get(category) || 0) + lineRevenue);
            }

            if (orderRevenue <= 0) {
                orderRevenue = toNumber(order.totalAmount, 0);
                orderProfit = orderRevenue * (1 - DEFAULT_COST_RATIO);
            }

            // মাস-ভিত্তিক বাকেটে যোগ করা
            if (orderDate) {
                const key = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}`;
                if (monthIndex.has(key)) {
                    const idx = monthIndex.get(key);
                    months[idx].revenue += orderRevenue;
                    months[idx].profit += orderProfit;
                }
            }
        }

        const round = (n) => Math.round((toNumber(n, 0) + Number.EPSILON) * 100) / 100;

        // টপ ৬ ক্যাটাগরি, বাকিগুলো "Others" এ একত্র
        const sortedCategories = [...categoryRevenue.entries()]
            .map(([name, revenue]) => ({ name, revenue: round(revenue) }))
            .sort((a, b) => b.revenue - a.revenue);

        const TOP_N = 6;
        let topCategories = sortedCategories.slice(0, TOP_N);
        const rest = sortedCategories.slice(TOP_N);
        if (rest.length > 0) {
            const othersTotal = round(rest.reduce((sum, c) => sum + c.revenue, 0));
            if (othersTotal > 0) topCategories.push({ name: 'Others', revenue: othersTotal });
        }

        return res.json({
            success: true,
            currency: 'BDT',
            generatedAt: now.toISOString(),
            data: {
                revenueVsProfit: {
                    labels: months.map(m => m.label),
                    revenue: months.map(m => round(m.revenue)),
                    profit: months.map(m => round(m.profit))
                },
                topCategories: {
                    labels: topCategories.map(c => c.name),
                    values: topCategories.map(c => c.revenue)
                }
            }
        });
    } catch (err) {
        console.error('🔴 Finance Chart Data Error:', err);
        return res.status(500).json({ success: false, message: 'Failed to compute finance chart data.', error: err.message });
    }
};

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
const verifyFinanceToken = (req, res, next) => {
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
    financeAdminLogin,
    verifyFinanceToken
};
