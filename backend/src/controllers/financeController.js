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
const mongoose = require('mongoose');
const Order = require('../models/order');
const Product = require('../models/product');
const Admin = require('../models/admin');

// ফাইন্যান্স ড্যাশবোর্ড সেশন টোকেনের মেয়াদ ও স্কোপ
const FINANCE_TOKEN_TTL = process.env.FINANCE_TOKEN_TTL || '8h';
const FINANCE_TOKEN_SCOPE = 'finance-dashboard';
const JWT_SECRET = process.env.JWT_SECRET;

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
    const lineCOGS = costPrice * quantity;
    const lineProfit = lineRevenue - lineCOGS; // Net Profit = Revenue − COGS (per line)

    return { quantity, lineRevenue, lineCOGS, lineProfit, costPrice, sellingPrice };
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

// প্রোডাক্ট আইডি → ক্যাটাগরি ম্যাপ (পাই চার্ট / ফিল্টার API)
async function buildCategoryMap() {
    const map = new Map();
    try {
        const products = await Product.find({}, { _id: 1, productId: 1, category: 1 }).lean();
        for (const p of products) {
            const cat = p.category || 'General';
            if (p._id) map.set(String(p._id), cat);
            if (p.productId) map.set(String(p.productId), cat);
        }
    } catch (err) {
        console.error('⚠️ buildCategoryMap warning:', err.message);
    }
    return map;
}

const roundMoney = (n) => Math.round((toNumber(n, 0) + Number.EPSILON) * 100) / 100;

function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/* =========================================================================
   Date-range parsing & bucket helpers (Analytics Filter Engine)
   ========================================================================= */
function parseDateRangeQuery(query = {}) {
    const now = new Date();
    const rawPeriod = query.period ?? query.preset ?? '';
    const preset = String(rawPeriod).trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
    let startDate;
    let endDate;

    const parseYyyyMmDd = (str) => {
        if (!str) return null;
        const m = String(str).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        const d = new Date(str);
        return isNaN(d.getTime()) ? null : d;
    };

    if (query.startDate || query.endDate) {
        const parsedStart = query.startDate ? parseYyyyMmDd(query.startDate) : null;
        const parsedEnd = query.endDate ? parseYyyyMmDd(query.endDate) : null;
        startDate = parsedStart ? startOfDay(parsedStart) : new Date(2000, 0, 1, 0, 0, 0, 0);
        endDate = parsedEnd ? endOfDay(parsedEnd) : endOfDay(now);
    } else {
        switch (preset) {
            case 'today':
                startDate = startOfDay(now);
                endDate = endOfDay(now);
                break;
            case 'yesterday': {
                const y = new Date(now);
                y.setDate(y.getDate() - 1);
                startDate = startOfDay(y);
                endDate = endOfDay(y);
                break;
            }
            case '7days':
            case '7_days':
            case 'last_7_days':
            case 'last7days':
            case 'last_7':
                startDate = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
                endDate = endOfDay(now);
                break;
            case 'all':
            case 'alltime':
            case 'all_time':
                startDate = new Date(2000, 0, 1, 0, 0, 0, 0);
                endDate = endOfDay(now);
                break;
            case 'this_year':
            case 'thisyear':
                startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
                endDate = endOfDay(now);
                break;
            case 'thismonth':
            case 'this_month':
            default:
                startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
                endDate = endOfDay(now);
                break;
        }
    }

    if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return null;
    }
    if (startDate > endDate) {
        const tmp = startDate;
        startDate = startOfDay(endDate);
        endDate = endOfDay(tmp);
    }

    const resolvedPreset = (query.startDate || query.endDate)
        ? 'custom'
        : (preset || 'thismonth');
    return { startDate, endDate, preset: resolvedPreset };
}

function resolveGroupBy(startDate, endDate) {
    const msPerDay = 86400000;
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / msPerDay) + 1;
    return days <= 31 ? 'day' : 'month';
}

function getBucketKey(date, groupBy) {
    if (!date || isNaN(date.getTime())) return null;
    if (groupBy === 'day') {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatBucketLabel(key, groupBy) {
    if (!key) return '';
    if (groupBy === 'day') {
        const [y, m, d] = key.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    const [y, m] = key.split('-').map(Number);
    const dt = new Date(y, m - 1, 1);
    return dt.toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

function buildTimeBuckets(startDate, endDate, groupBy) {
    const buckets = new Map();
    const cursor = new Date(startDate);

    if (groupBy === 'day') {
        cursor.setHours(0, 0, 0, 0);
        const end = endOfDay(endDate);
        while (cursor <= end) {
            const key = getBucketKey(cursor, 'day');
            buckets.set(key, { key, label: formatBucketLabel(key, 'day'), revenue: 0, profit: 0, cogs: 0, orders: 0 });
            cursor.setDate(cursor.getDate() + 1);
        }
    } else {
        cursor.setDate(1);
        cursor.setHours(0, 0, 0, 0);
        const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
        while (cursor <= end) {
            const key = getBucketKey(cursor, 'month');
            buckets.set(key, { key, label: formatBucketLabel(key, 'month'), revenue: 0, profit: 0, cogs: 0, orders: 0 });
            cursor.setMonth(cursor.getMonth() + 1);
        }
    }

    return buckets;
}

/**
 * তারিখ-ভিত্তিক অর্ডার কোয়েরি। createdAt সবচেয়ে নির্ভরযোগ্য, কিন্তু খুব
 * পুরোনো কিছু ডকুমেন্টে সেটি না থাকতে পারে — তখন ObjectId-এর ভেতরে থাকা
 * টাইমস্ট্যাম্প রেঞ্জ দিয়ে ম্যাচ করা হয়, যাতে কোনো বৈধ অর্ডার বাদ না পড়ে।
 */
function buildDateRangeQuery(startDate, endDate) {
    const toObjectId = (date) => {
        const hex = Math.floor(date.getTime() / 1000).toString(16).padStart(8, '0');
        return new mongoose.Types.ObjectId(hex + '0000000000000000');
    };

    const conditions = [
        { createdAt: { $gte: startDate, $lte: endDate } },
        { updatedAt: { $gte: startDate, $lte: endDate }, createdAt: { $exists: false } }
    ];

    try {
        conditions.push({
            createdAt: { $exists: false },
            _id: { $gte: toObjectId(startDate), $lte: toObjectId(endDate) }
        });
    } catch (err) {
        console.error('⚠️ ObjectId date-range fallback skipped:', err.message);
    }

    return { $or: conditions };
}

/**
 * একটি অর্ডারের সম্পূর্ণ P&L ব্রেকডাউন বের করা।
 *
 *   Gross Revenue = চার্জকৃত অ্যামাউন্ট + ইতিমধ্যে বাদ যাওয়া ডিসকাউন্ট
 *   COGS          = Σ (buyingPrice × quantity)
 *   Discounts     = discountAmount + couponDiscount + pointsRedeemed + cashback
 *   Shipping      = deliveryCharge (fallback: shippingFee)
 *   Net Profit    = Gross Revenue − COGS − Discounts − Shipping
 *
 * ⚠️ grandTotal = subTotal − discountAmount + deliveryCharge, অর্থাৎ totalAmount-এ
 * ডিসকাউন্ট আগেই বাদ দেওয়া আছে। তাই Gross Revenue-তে সেটি ফেরত যোগ (gross-up)
 * করা হয়, নাহলে ডিসকাউন্ট দুইবার বাদ পড়ে প্রফিট কম দেখাত। রিওয়ার্ড ক্যাশব্যাক
 * totalAmount-এ ধরা থাকে না, তাই সেটি gross-up ছাড়াই খরচ হিসেবে বাদ যায়।
 *
 * অনুপস্থিত/null ফিল্ড সবসময় 0 ধরা হয়, তাই কোনো এজ-কেসে রেসপন্স ভাঙে না।
 */
function computeOrderFinance(order, productCostMap, categoryMap, categoryRevenue) {
    const items = Array.isArray(order.items) ? order.items : [];

    let itemRevenue = 0;
    let cogs = 0;

    for (const item of items) {
        if (!item) continue;
        const { lineRevenue, lineCOGS } = computeItemFinance(item, productCostMap);
        itemRevenue += lineRevenue;
        cogs += lineCOGS;

        if (categoryRevenue) {
            const productId = item.id || item.productId || item._id;
            const category = (productId && categoryMap.get(String(productId))) || item.category || 'General';
            categoryRevenue.set(category, (categoryRevenue.get(category) || 0) + lineRevenue);
        }
    }

    // শিপিং/ডেলিভারি খরচ
    const shipping = toNumber(order.deliveryCharge, 0) || toNumber(order.shippingFee, 0);

    // চার্জকৃত টোটাল থেকে ইতিমধ্যে বাদ যাওয়া ছাড় (কুপন / পয়েন্ট / ওয়ালেট)
    const nettedDiscounts =
        toNumber(order.discountAmount, 0) +
        toNumber(order.couponDiscount, 0) +
        toNumber(order.pointsRedeemed, 0) +
        toNumber(order.walletApplied, 0);

    // অর্ডারের পরে দেওয়া ক্যাশব্যাক — totalAmount-এ ধরা নেই, তাই সরাসরি খরচ
    const rewardsExpense = toNumber(order.rewardsCashbackAmount, 0);
    const discounts = nettedDiscounts + rewardsExpense;

    // চার্জকৃত অ্যামাউন্ট, তারপর ছাড় ফেরত যোগ করে প্রকৃত গ্রস রেভিনিউ
    let chargedAmount = toNumber(order.totalAmount, 0) || toNumber(order.grandTotal, 0);
    if (chargedAmount <= 0) {
        const subTotal = toNumber(order.subTotal, 0) || toNumber(order.subtotal, 0);
        chargedAmount = subTotal > 0 ? subTotal + shipping : itemRevenue;
    }
    const grossRevenue = chargedAmount + nettedDiscounts;

    // আইটেম থেকে COGS না পাওয়া গেলে অর্ডার-লেভেল স্ন্যাপশট, তারপর অনুপাত
    if (cogs <= 0) {
        const savedCogs = toNumber(order.totalBuyingPrice, 0);
        cogs = savedCogs > 0
            ? savedCogs
            : (itemRevenue > 0 ? itemRevenue : grossRevenue) * DEFAULT_COST_RATIO;
    }

    const netProfit = grossRevenue - cogs - discounts - shipping;

    return { grossRevenue, cogs, discounts, shipping, netProfit, itemRevenue };
}

/**
 * Reliable JS-based metrics engine (MongoDB date filter + in-memory P&L).
 * Primary calculation path — resilient to missing fields and legacy documents.
 */
async function computeFinanceMetricsJs(startDate, endDate, groupBy) {
    const productCostMap = await buildProductCostMap();
    const categoryMap = await buildCategoryMap();

    let orders = [];
    try {
        orders = await Order.find(buildDateRangeQuery(startDate, endDate)).lean();
    } catch (err) {
        console.error('⚠️ Finance date-range query failed, retrying unfiltered:', err.message);
        try {
            orders = await Order.find({}).lean();
        } catch (fallbackErr) {
            console.error('🔴 Finance order fetch failed:', fallbackErr.message);
            orders = [];
        }
    }

    const bucketTotals = new Map();
    const categoryRevenue = new Map();

    let totalRevenue = 0;
    let totalCOGS = 0;
    let totalDiscounts = 0;
    let totalShipping = 0;
    let netProfit = 0;
    let totalOrders = 0;

    for (const order of orders) {
        if (!order || !isCountableOrder(order)) continue;

        // চূড়ান্ত তারিখ যাচাই — কোয়েরি ফলব্যাক হলেও রেঞ্জের বাইরে কিছু ঢুকবে না
        const orderDate = resolveOrderDate(order);
        if (!orderDate || orderDate < startDate || orderDate > endDate) continue;

        const finance = computeOrderFinance(order, productCostMap, categoryMap, categoryRevenue);
        if (finance.grossRevenue <= 0 && finance.cogs <= 0) continue;

        totalRevenue += finance.grossRevenue;
        totalCOGS += finance.cogs;
        totalDiscounts += finance.discounts;
        totalShipping += finance.shipping;
        netProfit += finance.netProfit;
        totalOrders += 1;

        const bucketKey = getBucketKey(orderDate, groupBy);
        if (bucketKey) {
            const prev = bucketTotals.get(bucketKey) ||
                { revenue: 0, cogs: 0, profit: 0, discounts: 0, shipping: 0, orders: 0 };
            prev.revenue += finance.grossRevenue;
            prev.cogs += finance.cogs;
            prev.profit += finance.netProfit;
            prev.discounts += finance.discounts;
            prev.shipping += finance.shipping;
            prev.orders += 1;
            bucketTotals.set(bucketKey, prev);
        }
    }

    return {
        totalRevenue,
        totalCOGS,
        totalDiscounts,
        totalShipping,
        netProfit,
        totalOrders,
        bucketTotals,
        categoryRevenue
    };
}

/**
 * MongoDB aggregation: $match → $unwind → cost fields → $group (time buckets + totals).
 * COGS prefers order-item buyingPrice snapshot, then product catalog, then ratio fallback.
 */
async function aggregateFinanceByDateRange(startDate, endDate, groupBy) {
    const dateFormat = groupBy === 'day' ? '%Y-%m-%d' : '%Y-%m';
    const costRatio = DEFAULT_COST_RATIO;

    const pipeline = [
        {
            $match: {
                createdAt: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $addFields: {
                statusLower: { $toLower: { $ifNull: ['$status', ''] } }
            }
        },
        {
            $match: {
                statusLower: { $nin: EXCLUDED_STATUSES }
            }
        },
        {
            $facet: {
                lineItems: [
                    { $match: { 'items.0': { $exists: true } } },
                    { $unwind: '$items' },
                    {
                        $lookup: {
                            from: 'products',
                            let: { pid: '$items.productId', iid: '$items.id' },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $or: [
                                                { $eq: ['$productId', '$$pid'] },
                                                { $eq: ['$productId', '$$iid'] },
                                                { $eq: [{ $toString: '$_id' }, '$$pid'] },
                                                { $eq: [{ $toString: '$_id' }, '$$iid'] }
                                            ]
                                        }
                                    }
                                },
                                { $limit: 1 },
                                {
                                    $project: {
                                        buyingPrice: 1,
                                        costPrice: 1,
                                        cost: 1,
                                        purchasePrice: 1,
                                        category: 1
                                    }
                                }
                            ],
                            as: 'productMatch'
                        }
                    },
                    {
                        $addFields: {
                            quantity: { $max: [1, { $ifNull: ['$items.quantity', 1] }] },
                            sellingPrice: {
                                $ifNull: [
                                    '$items.sellingPrice',
                                    {
                                        $ifNull: [
                                            '$items.price',
                                            { $ifNull: ['$items.unitPrice', { $ifNull: ['$items.salePrice', 0] }] }
                                        ]
                                    }
                                ]
                            },
                            itemBuyingPrice: { $ifNull: ['$items.buyingPrice', 0] },
                            catalogCost: {
                                $let: {
                                    vars: { p: { $arrayElemAt: ['$productMatch', 0] } },
                                    in: {
                                        $ifNull: [
                                            '$$p.buyingPrice',
                                            {
                                                $ifNull: [
                                                    '$$p.costPrice',
                                                    { $ifNull: ['$$p.cost', { $ifNull: ['$$p.purchasePrice', 0] }] }
                                                ]
                                            }
                                        ]
                                    }
                                }
                            },
                            itemCategory: {
                                $ifNull: [
                                    { $arrayElemAt: ['$productMatch.category', 0] },
                                    { $ifNull: ['$items.category', 'General'] }
                                ]
                            }
                        }
                    },
                    {
                        $addFields: {
                            unitCost: {
                                $cond: [
                                    { $gt: ['$itemBuyingPrice', 0] },
                                    '$itemBuyingPrice',
                                    {
                                        $cond: [
                                            { $gt: ['$catalogCost', 0] },
                                            '$catalogCost',
                                            { $multiply: ['$sellingPrice', costRatio] }
                                        ]
                                    }
                                ]
                            }
                        }
                    },
                    {
                        $addFields: {
                            lineRevenue: { $multiply: ['$sellingPrice', '$quantity'] },
                            lineCOGS: { $multiply: ['$unitCost', '$quantity'] },
                            bucketKey: {
                                $dateToString: { format: dateFormat, date: '$createdAt' }
                            }
                        }
                    },
                    {
                        $addFields: {
                            lineProfit: { $subtract: ['$lineRevenue', '$lineCOGS'] }
                        }
                    },
                    {
                        $group: {
                            _id: '$_id',
                            orderRevenue: { $sum: '$lineRevenue' },
                            orderCOGS: { $sum: '$lineCOGS' },
                            orderProfit: { $sum: '$lineProfit' },
                            bucketKey: { $first: '$bucketKey' },
                            categories: {
                                $push: {
                                    category: '$itemCategory',
                                    revenue: '$lineRevenue'
                                }
                            }
                        }
                    }
                ],
                emptyItems: [
                    {
                        $match: {
                            $or: [
                                { items: { $exists: false } },
                                { items: { $size: 0 } }
                            ]
                        }
                    },
                    {
                        $addFields: {
                            orderRevenue: { $ifNull: ['$totalAmount', { $ifNull: ['$grandTotal', 0] }] },
                            orderCOGS: {
                                $cond: [
                                    { $gt: [{ $ifNull: ['$totalBuyingPrice', 0] }, 0] },
                                    '$totalBuyingPrice',
                                    {
                                        $multiply: [
                                            { $ifNull: ['$totalAmount', { $ifNull: ['$grandTotal', 0] }] },
                                            costRatio
                                        ]
                                    }
                                ]
                            },
                            bucketKey: {
                                $dateToString: { format: dateFormat, date: '$createdAt' }
                            }
                        }
                    },
                    {
                        $addFields: {
                            orderProfit: { $subtract: ['$orderRevenue', '$orderCOGS'] }
                        }
                    },
                    {
                        $project: {
                            orderRevenue: 1,
                            orderCOGS: 1,
                            orderProfit: 1,
                            bucketKey: 1,
                            categories: { $literal: [] }
                        }
                    }
                ]
            }
        },
        {
            $project: {
                orders: { $concatArrays: ['$lineItems', '$emptyItems'] }
            }
        },
        { $unwind: '$orders' },
        { $replaceRoot: { newRoot: '$orders' } },
        {
            $group: {
                _id: null,
                totalRevenue: { $sum: '$orderRevenue' },
                totalCOGS: { $sum: '$orderCOGS' },
                netProfit: { $sum: '$orderProfit' },
                totalOrders: { $sum: 1 },
                bucketRows: {
                    $push: {
                        bucketKey: '$bucketKey',
                        revenue: '$orderRevenue',
                        cogs: '$orderCOGS',
                        profit: '$orderProfit'
                    }
                },
                categoryRows: { $push: '$categories' }
            }
        }
    ];

    const [aggResult] = await Order.aggregate(pipeline);

    if (!aggResult) {
        return {
            totalRevenue: 0,
            totalCOGS: 0,
            netProfit: 0,
            totalOrders: 0,
            bucketTotals: new Map(),
            categoryRevenue: new Map()
        };
    }

    const bucketTotals = new Map();
    for (const row of aggResult.bucketRows || []) {
        if (!row || !row.bucketKey) continue;
        const prev = bucketTotals.get(row.bucketKey) || { revenue: 0, cogs: 0, profit: 0, orders: 0 };
        prev.revenue += toNumber(row.revenue, 0);
        prev.cogs += toNumber(row.cogs, 0);
        prev.profit += toNumber(row.profit, 0);
        prev.orders += 1;
        bucketTotals.set(row.bucketKey, prev);
    }

    const categoryRevenue = new Map();
    for (const catGroup of aggResult.categoryRows || []) {
        if (!Array.isArray(catGroup)) continue;
        for (const entry of catGroup) {
            if (!entry) continue;
            const cat = entry.category || 'General';
            categoryRevenue.set(cat, (categoryRevenue.get(cat) || 0) + toNumber(entry.revenue, 0));
        }
    }

    return {
        totalRevenue: toNumber(aggResult.totalRevenue, 0),
        totalCOGS: toNumber(aggResult.totalCOGS, 0),
        netProfit: toNumber(aggResult.netProfit, 0),
        totalOrders: toNumber(aggResult.totalOrders, 0),
        bucketTotals,
        categoryRevenue
    };
}

/* =========================================================================
   GET /admin/api/analytics | /api/admin/analytics | /api/finance/analytics
   -------------------------------------------------------------------------
   Date-range analytics: summary KPIs + chartData time series.
   Query: startDate & endDate (YYYY-MM-DD) OR period
   (today|yesterday|7days|thismonth|all|custom).
   ========================================================================= */
const getFinanceAnalytics = async (req, res) => {
    try {
        const range = parseDateRangeQuery(req.query);
        if (!range) {
            return res.status(400).json({
                success: false,
                message: 'Invalid date range. Use period or startDate/endDate (YYYY-MM-DD).'
            });
        }

        const groupBy = resolveGroupBy(range.startDate, range.endDate);

        // JS ইঞ্জিন প্রাইমারি — সম্পূর্ণ P&L (COGS, ডিসকাউন্ট, শিপিং) হিসাব করে
        // এবং পুরোনো/অসম্পূর্ণ ডকুমেন্টেও নিরাপদে কাজ করে।
        let agg = await computeFinanceMetricsJs(range.startDate, range.endDate, groupBy);

        if (!agg || typeof agg.totalOrders !== 'number') {
            agg = {
                totalRevenue: 0,
                totalCOGS: 0,
                totalDiscounts: 0,
                totalShipping: 0,
                netProfit: 0,
                totalOrders: 0,
                bucketTotals: new Map(),
                categoryRevenue: new Map()
            };
        }

        const buckets = buildTimeBuckets(range.startDate, range.endDate, groupBy);

        for (const [key, totals] of (agg.bucketTotals || new Map()).entries()) {
            if (!buckets.has(key)) {
                buckets.set(key, {
                    key,
                    label: formatBucketLabel(key, groupBy),
                    revenue: 0,
                    profit: 0,
                    cogs: 0,
                    orders: 0
                });
            }
            const b = buckets.get(key);
            b.revenue += totals.revenue || 0;
            b.profit += totals.profit || 0;
            b.cogs += totals.cogs || 0;
            b.orders += totals.orders || 0;
        }

        const sortedBuckets = [...buckets.values()];
        const totalRevenue = roundMoney(agg.totalRevenue || 0);
        const totalCOGS = roundMoney(agg.totalCOGS || 0);
        const totalDiscounts = roundMoney(agg.totalDiscounts || 0);
        const totalShipping = roundMoney(agg.totalShipping || 0);
        const netProfit = roundMoney(agg.netProfit || 0);
        const totalOrders = toNumber(agg.totalOrders, 0);
        const profitMargin = totalRevenue > 0 ? roundMoney((netProfit / totalRevenue) * 100) : 0;
        const avgOrderValue = totalOrders > 0 ? roundMoney(totalRevenue / totalOrders) : 0;

        const chartData = sortedBuckets.map((b) => ({
            label: b.label,
            key: b.key,
            revenue: roundMoney(b.revenue),
            profit: roundMoney(b.profit),
            cogs: roundMoney(b.cogs),
            discounts: roundMoney(b.discounts || 0),
            shipping: roundMoney(b.shipping || 0),
            orders: b.orders || 0
        }));

        const summary = {
            sales: totalRevenue,
            revenue: totalRevenue,
            grossRevenue: totalRevenue,
            profit: netProfit,
            netProfit,
            cogs: totalCOGS,
            discounts: totalDiscounts,
            shipping: totalShipping,
            orders: totalOrders,
            profitMargin,
            avgOrderValue
        };

        const sortedCategories = [...(agg.categoryRevenue || new Map()).entries()]
            .map(([name, revenue]) => ({ name, revenue: roundMoney(revenue) }))
            .sort((a, b) => b.revenue - a.revenue);

        const TOP_N = 6;
        let topCategories = sortedCategories.slice(0, TOP_N);
        const rest = sortedCategories.slice(TOP_N);
        if (rest.length > 0) {
            const othersTotal = roundMoney(rest.reduce((sum, c) => sum + c.revenue, 0));
            if (othersTotal > 0) topCategories.push({ name: 'Others', revenue: othersTotal });
        }

        const now = new Date();

        return res.json({
            success: true,
            currency: 'BDT',
            generatedAt: now.toISOString(),
            dateRange: {
                startDate: range.startDate.toISOString(),
                endDate: range.endDate.toISOString(),
                period: range.preset,
                preset: range.preset,
                groupBy
            },
            summary,
            chartData,
            // Backward-compatible payload for existing finance-analytics.js
            data: {
                totalRevenue,
                totalCOGS,
                totalDiscounts,
                totalShipping,
                netProfit,
                totalOrders,
                profitMargin,
                avgOrderValue,
                periodRevenue: totalRevenue,
                periodProfit: netProfit,
                periodOrders: totalOrders,
                revenueVsProfit: {
                    labels: chartData.map((row) => row.label),
                    revenue: chartData.map((row) => row.revenue),
                    profit: chartData.map((row) => row.profit),
                    cogs: chartData.map((row) => row.cogs)
                },
                topCategories: {
                    labels: topCategories.map((c) => c.name),
                    values: topCategories.map((c) => c.revenue)
                }
            }
        });
    } catch (err) {
        console.error('🔴 Finance Analytics Error:', err);
        return res.status(500).json({
            success: false,
            message: 'Failed to compute analytics for the selected date range.',
            error: err.message || 'Unknown server error'
        });
    }
};

// Alias kept for older route registrations
const getAnalyticsFilter = getFinanceAnalytics;

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
