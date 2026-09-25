/********************************************************************
 * Project: EonlineBazar — Orders / COD Risk
 * File: riskScoringService.js
 * Description: Customer COD fraud & return-rate risk scoring for admin orders.
 ********************************************************************/

'use strict';

const Order = require('../models/order');

const RETURN_CANCEL_STATUSES = new Set([
    'cancelled',
    'canceled',
    'returned',
    'refunded',
    'return requested'
]);

const DELIVERED_STATUSES = new Set(['delivered']);
const PENDING_COD_STATUSES = new Set(['pending', 'processing']);

function normalizeStatus(status) {
    return String(status || '').trim().toLowerCase();
}

function isCodPayment(order = {}) {
    const method = String(
        order.paymentMethod
        || order.payment?.name
        || order.payment?.code
        || 'COD'
    ).trim().toLowerCase();
    return method.includes('cod') || method.includes('cash on delivery') || method === 'cash';
}

function normalizePhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    return digits.length >= 6 ? digits : '';
}

function buildHistoryFilter({ userId, phone }) {
    const clauses = [];
    if (userId) clauses.push({ user: userId });
    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone) {
        clauses.push({ customerPhone: { $regex: normalizedPhone.slice(-10) } });
    }
    if (!clauses.length) return null;
    return clauses.length === 1 ? clauses[0] : { $or: clauses };
}

function computeRiskFromMetrics(metrics = {}) {
    const {
        totalOrders = 0,
        deliveredCount = 0,
        returnCancelCount = 0,
        pendingCodCount = 0
    } = metrics;

    if (totalOrders === 0) {
        return {
            riskScore: 'LOW',
            riskReason: 'New customer — no order history'
        };
    }

    const returnRate = Math.round((returnCancelCount / totalOrders) * 1000) / 10;
    const fakeOrderPattern = returnCancelCount >= 3 && deliveredCount === 0;

    if (returnRate > 40 || fakeOrderPattern) {
        const reason = fakeOrderPattern
            ? `Repeated cancelled/returned orders (${returnCancelCount}) with no deliveries`
            : `Return/cancel rate: ${returnRate}%`;
        return { riskScore: 'HIGH', riskReason: reason };
    }

    if ((returnRate >= 16 && returnRate <= 40) || pendingCodCount >= 2) {
        const parts = [];
        if (returnRate >= 16) parts.push(`Return/cancel rate: ${returnRate}%`);
        if (pendingCodCount >= 2) parts.push(`${pendingCodCount} pending COD orders`);
        return {
            riskScore: 'MEDIUM',
            riskReason: parts.join('; ') || 'Elevated COD risk'
        };
    }

    if (returnRate <= 15) {
        return {
            riskScore: 'LOW',
            riskReason: deliveredCount > 0
                ? `Return/cancel rate: ${returnRate}%`
                : 'New customer with acceptable history'
        };
    }

    return { riskScore: 'LOW', riskReason: 'Within acceptable risk thresholds' };
}

function summarizeOrderHistory(orders = []) {
    let deliveredCount = 0;
    let returnCancelCount = 0;
    let pendingCodCount = 0;

    orders.forEach((order) => {
        const status = normalizeStatus(order.status);
        const delivered = DELIVERED_STATUSES.has(status) || order.isDelivered === true;
        if (delivered) deliveredCount += 1;
        if (RETURN_CANCEL_STATUSES.has(status)) returnCancelCount += 1;
        if (isCodPayment(order) && PENDING_COD_STATUSES.has(status)) pendingCodCount += 1;
    });

    return {
        totalOrders: orders.length,
        deliveredCount,
        returnCancelCount,
        pendingCodCount
    };
}

async function fetchCustomerOrderHistory({ userId, phone }) {
    const filter = buildHistoryFilter({ userId, phone });
    if (!filter) return [];
    return Order.find(filter)
        .select('status paymentMethod payment isDelivered customerPhone user')
        .lean();
}

async function computeCustomerRisk({ userId, phone } = {}) {
    const history = await fetchCustomerOrderHistory({ userId, phone });
    const metrics = summarizeOrderHistory(history);
    return computeRiskFromMetrics(metrics);
}

function cacheKeyForOrder(order = {}) {
    const userKey = order.user ? String(order.user._id || order.user) : '';
    const phoneKey = normalizePhone(order.customerPhone);
    return `${userKey}::${phoneKey}`;
}

async function enrichOrdersWithRiskScores(orders = []) {
    if (!Array.isArray(orders) || !orders.length) return orders;

    const keys = new Map();
    orders.forEach((order) => {
        const key = cacheKeyForOrder(order);
        if (!keys.has(key)) {
            keys.set(key, {
                userId: order.user?._id || order.user || order.userId || null,
                phone: order.customerPhone
            });
        }
    });

    const riskCache = new Map();
    await Promise.all(
        [...keys.entries()].map(async ([key, identity]) => {
            const risk = await computeCustomerRisk(identity);
            riskCache.set(key, risk);
        })
    );

    return orders.map((order) => {
        const risk = riskCache.get(cacheKeyForOrder(order)) || { riskScore: 'LOW', riskReason: 'Unknown' };
        return {
            ...order,
            riskScore: risk.riskScore,
            riskReason: risk.riskReason
        };
    });
}

async function enrichOrderWithRiskScore(order) {
    if (!order) return order;
    const risk = await computeCustomerRisk({
        userId: order.user?._id || order.user || order.userId,
        phone: order.customerPhone
    });
    return {
        ...(typeof order.toObject === 'function' ? order.toObject() : order),
        riskScore: risk.riskScore,
        riskReason: risk.riskReason
    };
}

module.exports = {
    computeRiskFromMetrics,
    summarizeOrderHistory,
    computeCustomerRisk,
    enrichOrdersWithRiskScores,
    enrichOrderWithRiskScore,
    normalizePhone,
    isCodPayment
};
