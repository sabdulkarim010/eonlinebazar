/********************************************************************
 * Project: EonlineBazar — Tax & VAT compliance ledger (Phase 3 Part 2)
 * File: taxVatService.js
 ********************************************************************/

'use strict';

const Order = require('../models/order');
const orderRepository = require('../repositories/orderRepository');
const { isPgReadEnabled } = require('../config/readCutoverFlags');
const accountingLedger = require('./accountingLedgerService');
const { getVatSettings, computeVatAmount, roundMoney } = require('./deliveryChargeService');

const CANCELLED_STATUSES = new Set(['cancelled', 'refunded', 'returned']);

function defaultTaxMonthRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { dateFrom: start, dateTo: end };
}

function parseTaxLedgerDateRange(query = {}) {
    let from = accountingLedger.parseAccountsSummaryDateRange({
        dateFrom: query.dateFrom,
        dateTo: query.dateTo || query.dateFrom
    });

    if (from.mode === 'all') {
        return defaultTaxMonthRange();
    }

    return { dateFrom: from.dateFrom, dateTo: from.dateTo };
}

function normalizePaymentStatus(order) {
    return String(order?.payment?.status || order?.paymentStatus || 'unpaid').trim().toLowerCase();
}

function resolveOrderDisplayId(order) {
    if (order?.orderId) return String(order.orderId);
    if (order?._id) return String(order._id);
    if (order?.id) return String(order.id);
    return '—';
}

function resolveCustomerLabel(order) {
    const name = String(order?.customerName || order?.shippingName || '').trim();
    if (name) return name;
    const user = order?.user;
    if (user && typeof user === 'object') {
        const parts = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
        if (parts) return parts;
    }
    return 'Guest';
}

function resolveTaxLine(order, vatSettings) {
    const subTotal = roundMoney(Number(order.subTotal ?? order.subtotal) || 0);
    const discountAmount = roundMoney(Number(order.discountAmount) || 0);
    const taxableAmount = roundMoney(Math.max(0, subTotal - discountAmount));

    let vatRate = Number(order.vatPercentage);
    if (!Number.isFinite(vatRate) || vatRate <= 0) {
        vatRate = Number(vatSettings.vatPercentage) || 0;
    }

    let taxCollected = roundMoney(Number(order.vatAmount) || 0);
    const orderVatEnabled = order.vatEnabled === true || taxCollected > 0;
    const vatEnabled = orderVatEnabled || vatSettings.vatEnabled === true;

    if (taxCollected <= 0 && vatEnabled && vatRate > 0) {
        taxCollected = computeVatAmount({
            merchandisePayable: taxableAmount,
            vatEnabled: true,
            vatPercentage: vatRate,
            vatInclusive: vatSettings.vatInclusive !== false
        });
        if (vatSettings.vatInclusive !== false && taxCollected <= 0) {
            taxCollected = roundMoney(taxableAmount * vatRate / (100 + vatRate));
        }
    }

    const isExempt = !vatEnabled || (taxCollected <= 0 && taxableAmount > 0);

    return {
        taxableAmount,
        taxCollected: roundMoney(taxCollected),
        vatRate: roundMoney(vatRate),
        vatEnabled,
        isExempt
    };
}

async function loadOrdersForTaxLedger(dateFrom, dateTo) {
    if (isPgReadEnabled('order') || isPgReadEnabled('profitloss')) {
        try {
            return await orderRepository.findAll({ dateFrom, dateTo });
        } catch (err) {
            console.warn('[taxVat] PG order load failed, Mongo fallback:', err.message);
        }
    }

    try {
        return await Order.find({
            createdAt: { $gte: dateFrom, $lte: dateTo }
        })
            .select(
                'orderId customerName shippingName subTotal subtotal discountAmount vatAmount vatPercentage vatEnabled status payment paymentMethod createdAt user'
            )
            .lean();
    } catch (err) {
        console.error('[taxVat] Mongo order load failed:', err.message);
        return [];
    }
}

function buildLedgerRows(orders, vatSettings) {
    const rows = [];

    for (const order of orders || []) {
        const status = String(order?.status || '').trim().toLowerCase();
        if (CANCELLED_STATUSES.has(status)) continue;

        const tax = resolveTaxLine(order, vatSettings);
        rows.push({
            orderId: resolveOrderDisplayId(order),
            date: order.createdAt ? new Date(order.createdAt).toISOString() : null,
            customer: resolveCustomerLabel(order),
            taxableAmount: tax.taxableAmount,
            vatRate: tax.vatRate,
            taxCollected: tax.taxCollected,
            vatEnabled: tax.vatEnabled,
            isExempt: tax.isExempt,
            paymentStatus: normalizePaymentStatus(order),
            orderStatus: status
        });
    }

    rows.sort((a, b) => {
        const ta = a.date ? new Date(a.date).getTime() : 0;
        const tb = b.date ? new Date(b.date).getTime() : 0;
        return tb - ta;
    });

    return rows;
}

function summarizeLedger(rows) {
    let totalTaxableRevenue = 0;
    let totalTaxCollected = 0;
    let exemptSales = 0;

    for (const row of rows) {
        totalTaxableRevenue += row.taxableAmount;
        totalTaxCollected += row.taxCollected;
        if (row.isExempt) exemptSales += row.taxableAmount;
    }

    totalTaxableRevenue = roundMoney(totalTaxableRevenue);
    totalTaxCollected = roundMoney(totalTaxCollected);
    exemptSales = roundMoney(exemptSales);

    return {
        totalTaxableRevenue,
        totalTaxCollected,
        netTaxPayable: totalTaxCollected,
        exemptSales,
        orderCount: rows.length
    };
}

async function buildTaxVatLedger(query = {}) {
    const { dateFrom, dateTo } = parseTaxLedgerDateRange(query);
    const vatSettings = await getVatSettings();
    const orders = await loadOrdersForTaxLedger(dateFrom, dateTo);
    const ledger = buildLedgerRows(orders, vatSettings);
    const summary = summarizeLedger(ledger);

    return {
        currency: 'BDT',
        generatedAt: new Date().toISOString(),
        period: {
            dateFrom: dateFrom.toISOString(),
            dateTo: dateTo.toISOString()
        },
        taxRegistrationNumber: vatSettings.taxRegistrationNumber || '',
        summary,
        ledger
    };
}

function csvCell(value) {
    const str = value == null ? '' : String(value);
    if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
}

function buildTaxLedgerCsvRows(payload) {
    const header = [
        'Order ID',
        'Date',
        'Customer',
        'Taxable Amount',
        'VAT Rate %',
        'Tax Collected',
        'Payment Status',
        'Exempt'
    ];
    const lines = [header.map(csvCell).join(',')];

    for (const row of payload.ledger || []) {
        lines.push([
            row.orderId,
            row.date ? row.date.slice(0, 10) : '',
            row.customer,
            row.taxableAmount,
            row.vatRate,
            row.taxCollected,
            row.paymentStatus,
            row.isExempt ? 'yes' : 'no'
        ].map(csvCell).join(','));
    }

    return lines;
}

function sendTaxLedgerCsv(res, payload) {
    const rows = buildTaxLedgerCsvRows(payload);
    const csv = `\uFEFF${rows.join('\r\n')}`;
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="tax-vat-ledger-${stamp}.csv"`);
    return res.send(csv);
}

module.exports = {
    buildTaxVatLedger,
    parseTaxLedgerDateRange,
    sendTaxLedgerCsv,
    buildTaxLedgerCsvRows
};
