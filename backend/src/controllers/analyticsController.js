/********************************************************************
 * Project: EonlineBazar
 * File: analyticsController.js
 * Location: backend/src/controllers/analyticsController.js
 * Description: Admin dashboard analytics — sales, orders, top products,
 * inventory alerts, and revenue chart series for the admin panel.
 ********************************************************************/

const User = require('../models/user');
const Order = require('../models/order');
const Product = require('../models/product');
const { getApplicationNow } = require('../utils/applicationTime');

const getOrderRevenue = (order) => Number(order?.grandTotal ?? order?.totalAmount) || 0;

const normalizeOrderStatus = (status) => (status || 'Pending').trim().toLowerCase();

const isDeliveredOrder = (order) =>
    order.isDelivered === true || normalizeOrderStatus(order.status) === 'delivered';

const buildDailyRevenueSeries = (deliveredOrders, days = 30) => {
    const labels = [];
    const revenue = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
        const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        labels.push(dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

        const dayTotal = deliveredOrders.reduce((sum, order) => {
            const created = new Date(order.createdAt);
            if (created >= dayStart && created < dayEnd) {
                return sum + getOrderRevenue(order);
            }
            return sum;
        }, 0);

        revenue.push(dayTotal);
    }

    return { labels, revenue };
};

const buildMonthlyRevenueSeries = (deliveredOrders, months = 12) => {
    const labels = [];
    const revenue = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

        labels.push(monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));

        const monthTotal = deliveredOrders.reduce((sum, order) => {
            const created = new Date(order.createdAt);
            if (created >= monthStart && created < monthEnd) {
                return sum + getOrderRevenue(order);
            }
            return sum;
        }, 0);

        revenue.push(monthTotal);
    }

    return { labels, revenue };
};

const getDashboardAnalytics = async (req, res) => {
    try {
        const now = getApplicationNow();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const [orders, totalCustomers, alertProducts] = await Promise.all([
            Order.find({})
                .select('status grandTotal totalAmount createdAt items isDelivered')
                .lean(),
            User.countDocuments({}),
            Product.find({ stock: { $lte: 5 } })
                .select('_id productId name stock category image icon')
                .sort({ stock: 1 })
                .lean()
        ]);

        const deliveredOrders = orders.filter(isDeliveredOrder);

        const allTimeRevenue = deliveredOrders.reduce((sum, order) => sum + getOrderRevenue(order), 0);
        const dailyRevenue = deliveredOrders
            .filter((order) => new Date(order.createdAt) >= startOfDay)
            .reduce((sum, order) => sum + getOrderRevenue(order), 0);
        const monthlyRevenue = deliveredOrders
            .filter((order) => new Date(order.createdAt) >= startOfMonth)
            .reduce((sum, order) => sum + getOrderRevenue(order), 0);

        const orderCounts = {
            total: orders.length,
            pending: orders.filter((o) => normalizeOrderStatus(o.status) === 'pending').length,
            processing: orders.filter((o) => normalizeOrderStatus(o.status) === 'processing').length,
            delivered: deliveredOrders.length,
            returnRequests: orders.filter((o) => normalizeOrderStatus(o.status) === 'return requested').length
        };

        const productQtyMap = new Map();
        for (const order of deliveredOrders) {
            for (const item of order.items || []) {
                const key = String(item.productId || item.id || item.name || 'unknown');
                const existing = productQtyMap.get(key) || {
                    productId: item.productId || item.id || key,
                    name: item.name || 'Unknown Product',
                    quantity: 0
                };
                existing.quantity += Number(item.quantity) || 0;
                productQtyMap.set(key, existing);
            }
        }

        const topProducts = Array.from(productQtyMap.values())
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 5);

        const salesTrend = {
            daily: buildDailyRevenueSeries(deliveredOrders, 30),
            monthly: buildMonthlyRevenueSeries(deliveredOrders, 12)
        };

        const inventoryAlerts = {
            outOfStock: alertProducts.filter((p) => Number(p.stock) === 0),
            lowStock: alertProducts.filter((p) => Number(p.stock) > 0 && Number(p.stock) <= 5)
        };

        res.status(200).json({
            success: true,
            analytics: {
                revenue: {
                    daily: dailyRevenue,
                    monthly: monthlyRevenue,
                    allTime: allTimeRevenue
                },
                orderCounts,
                totalCustomers,
                topProducts,
                salesTrend,
                inventoryAlerts
            }
        });
    } catch (error) {
        console.error('Dashboard Analytics Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load dashboard analytics.' });
    }
};

module.exports = {
    getDashboardAnalytics
};
