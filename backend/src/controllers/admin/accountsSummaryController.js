/********************************************************************
 * Project: EonlineBazar — Accounts & Finance
 * File: accountsSummaryController.js
 * Description: Cash flow, liquidity, and balance-sheet-style summary
 * metrics for the admin Accounts Overview dashboard.
 ********************************************************************/

const Order = require('../../models/order');
const Expense = require('../../models/expense');
const PurchaseOrder = require('../../models/purchaseOrder');
const { isPgReadEnabled } = require('../../config/readCutoverFlags');
const { getTotalExpensesAllFromPG } = require('../../repositories/expenseRepository');
const { sumOpenPurchaseOrderTotalFromPG } = require('../../repositories/purchaseOrderRepository');
const prisma = require('../../config/prismaClient');
const { fromOrderStatusEnum, fromOrderPaymentStatusEnum } = require('../../repositories/orderRepository');

const OPEN_PO_STATUSES = ['draft', 'sent', 'partial'];
const RECEIVABLE_PAYMENT_STATUSES = ['unpaid', 'pending'];
const CANCELLED_ORDER_STATUSES = ['cancelled', 'refunded', 'returned'];

function roundMoney(n) {
    return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

function getOrderTotal(order) {
    return Number(order?.grandTotal ?? order?.totalAmount) || 0;
}

function isCancelledOrder(order) {
    const status = String(order?.status || '').trim().toLowerCase();
    return CANCELLED_ORDER_STATUSES.includes(status);
}

function paymentCode(order) {
    return String(order?.payment?.code || order?.paymentMethod || '').trim().toLowerCase();
}

function paymentStatus(order) {
    return String(order?.payment?.status || 'unpaid').trim().toLowerCase();
}

function isPaidOrder(order) {
    return paymentStatus(order) === 'paid';
}

function mapPgOrderForSummary(row) {
    return {
        status: fromOrderStatusEnum(row.status),
        grandTotal: row.grandTotal != null ? Number(row.grandTotal) : null,
        totalAmount: row.totalAmount != null ? Number(row.totalAmount) : null,
        paymentMethod: row.paymentMethod,
        createdAt: row.createdAt,
        payment: row.payment
            ? {
                code: row.payment.code,
                status: fromOrderPaymentStatusEnum(row.payment.status)
            }
            : null
    };
}

async function loadAccountsSummaryDataFromPG() {
    const [orders, expensesTotal, supplierPayable] = await Promise.all([
        prisma.order.findMany({
            select: {
                status: true,
                grandTotal: true,
                totalAmount: true,
                paymentMethod: true,
                createdAt: true,
                payment: { select: { code: true, status: true } }
            }
        }),
        getTotalExpensesAllFromPG(),
        sumOpenPurchaseOrderTotalFromPG(OPEN_PO_STATUSES)
    ]);

    return {
        orders: orders.map(mapPgOrderForSummary),
        expensesTotal,
        supplierPayable
    };
}

async function loadAccountsSummaryDataFromMongo() {
    const [orders, expenseAgg, poAgg] = await Promise.all([
        Order.find({})
            .select('status grandTotal totalAmount payment paymentMethod createdAt')
            .lean(),
        Expense.aggregate([
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        PurchaseOrder.aggregate([
            { $match: { status: { $in: OPEN_PO_STATUSES } } },
            { $group: { _id: null, total: { $sum: '$totalCost' } } }
        ])
    ]);

    return {
        orders,
        expensesTotal: expenseAgg[0]?.total || 0,
        supplierPayable: poAgg[0]?.total || 0
    };
}

/**
 * GET /api/admin/accounts-summary
 * Aggregates cash flow and account balance indicators from live orders,
 * expenses, and purchase orders — no separate ledger collection required.
 */
exports.getAccountsSummary = async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const { orders, expensesTotal, supplierPayable } = isPgReadEnabled('accountssummary')
            ? await loadAccountsSummaryDataFromPG()
            : await loadAccountsSummaryDataFromMongo();

        const activeOrders = orders.filter((o) => !isCancelledOrder(o));
        const paidOrders = activeOrders.filter(isPaidOrder);

        const cashInflow = paidOrders.reduce((sum, o) => sum + getOrderTotal(o), 0);
        const cashInflowThisMonth = paidOrders
            .filter((o) => new Date(o.createdAt) >= startOfMonth)
            .reduce((sum, o) => sum + getOrderTotal(o), 0);

        const cashOutflow = expensesTotal + supplierPayable;

        const netLiquidity = roundMoney(cashInflow - cashOutflow);

        const cashInHand = paidOrders
            .filter((o) => paymentCode(o) === 'cod')
            .reduce((sum, o) => sum + getOrderTotal(o), 0);

        const bankAccountsBalance = paidOrders
            .filter((o) => {
                const code = paymentCode(o);
                return code === 'bank-transfer' || code.includes('bank');
            })
            .reduce((sum, o) => sum + getOrderTotal(o), 0);

        const accountsReceivable = activeOrders
            .filter((o) => RECEIVABLE_PAYMENT_STATUSES.includes(paymentStatus(o)))
            .reduce((sum, o) => sum + getOrderTotal(o), 0);

        const accountsPayable = supplierPayable;

        let cashFlowStatus = 'neutral';
        if (netLiquidity > 0) cashFlowStatus = 'positive';
        else if (netLiquidity < 0) cashFlowStatus = 'negative';

        res.status(200).json({
            success: true,
            data: {
                cashFlow: {
                    inflow: roundMoney(cashInflow),
                    inflowThisMonth: roundMoney(cashInflowThisMonth),
                    outflow: roundMoney(cashOutflow),
                    expensesTotal: roundMoney(expensesTotal),
                    supplierPayments: roundMoney(supplierPayable),
                    netLiquidity,
                    status: cashFlowStatus
                },
                balances: {
                    cashInHand: roundMoney(cashInHand),
                    bankAccountsBalance: roundMoney(bankAccountsBalance),
                    accountsReceivable: roundMoney(accountsReceivable),
                    accountsPayable: roundMoney(accountsPayable)
                }
            }
        });
    } catch (error) {
        console.error('getAccountsSummary Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load accounts summary.' });
    }
};
