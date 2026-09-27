/********************************************************************
 * Project: EonlineBazar — Balance Sheet (Phase 3 Part 2)
 * File: balanceSheetService.js
 ********************************************************************/

'use strict';

const Product = require('../models/product');
const prisma = require('../config/prismaClient');
const { isPgReadEnabled } = require('../config/readCutoverFlags');
const accountingLedger = require('./accountingLedgerService');
const { computeProfitLoss } = require('../controllers/admin/profitLossController');

function parseBalanceSheetQuery(query = {}) {
    const asOfRaw = query.asOfDate;
    if (asOfRaw) {
        const d = accountingLedger.parseAccountsSummaryDateRange({
            dateFrom: asOfRaw,
            dateTo: asOfRaw
        });
        return {
            mode: 'asOf',
            asOfDate: d.dateTo,
            summaryQuery: { dateFrom: asOfRaw, dateTo: asOfRaw },
            plQuery: {
                startDate: accountingLedger.formatQueryDateOnly(d.dateFrom),
                endDate: accountingLedger.formatQueryDateOnly(d.dateTo)
            }
        };
    }

    const range = accountingLedger.parseAccountsSummaryDateRange(query);
    if (range.mode === 'all') {
        const now = new Date();
        return {
            mode: 'all',
            asOfDate: now,
            summaryQuery: {},
            plQuery: {
                startDate: '1970-01-01',
                endDate: accountingLedger.formatQueryDateOnly(now)
            }
        };
    }

    return {
        mode: 'range',
        asOfDate: range.dateTo,
        summaryQuery: {
            dateFrom: accountingLedger.formatQueryDateOnly(range.dateFrom),
            dateTo: accountingLedger.formatQueryDateOnly(range.dateTo)
        },
        plQuery: {
            startDate: accountingLedger.formatQueryDateOnly(range.dateFrom),
            endDate: accountingLedger.formatQueryDateOnly(range.dateTo)
        }
    };
}

async function computeInventoryValuation() {
    if (isPgReadEnabled('product')) {
        try {
            const rows = await prisma.$queryRaw`
                SELECT COALESCE(SUM(
                    COALESCE("stockQuantity", 0) * COALESCE("buyingPrice", 0)
                ), 0)::float AS total
                FROM "Product"
            `;
            const total = Number(rows?.[0]?.total) || 0;
            return accountingLedger.roundMoney(total);
        } catch (err) {
            console.warn('[balanceSheet] PG inventory valuation failed, Mongo fallback:', err.message);
        }
    }

    try {
        const [row] = await Product.aggregate([
            {
                $group: {
                    _id: null,
                    total: {
                        $sum: {
                            $multiply: [
                                { $ifNull: ['$stockQuantity', { $ifNull: ['$stock', 0] }] },
                                { $ifNull: ['$buyingPrice', 0] }
                            ]
                        }
                    }
                }
            }
        ]);
        return accountingLedger.roundMoney(row?.total || 0);
    } catch (err) {
        console.warn('[balanceSheet] Mongo inventory valuation failed:', err.message);
        return 0;
    }
}

async function resolveRetainedEarnings(plQuery) {
    try {
        const pl = await computeProfitLoss(plQuery);
        return accountingLedger.roundMoney(pl?.profit?.net || 0);
    } catch (err) {
        console.warn('[balanceSheet] P&L slice for equity failed:', err.message);
        return 0;
    }
}

/**
 * @param {object} [query] — asOfDate OR dateFrom/dateTo
 */
async function buildBalanceSheet(query = {}) {
    const parsed = parseBalanceSheetQuery(query);
    const { data: summaryData } = await accountingLedger.buildAccountsSummaryPayload(parsed.summaryQuery);
    const { balances } = summaryData;

    const cashInHand = balances?.cashInHand || 0;
    const bankBalance = balances?.bankAccountsBalance || 0;
    const accountsReceivable = balances?.accountsReceivable || 0;
    const inventoryValuation = await computeInventoryValuation();
    const accountsPayable = balances?.accountsPayable || 0;
    const customerStoreCredit = balances?.customerWalletLiability || 0;
    const posDrawerCash = balances?.posDrawerCash || 0;

    const assets = {
        cashInHand: accountingLedger.roundMoney(cashInHand),
        posDrawerCash: accountingLedger.roundMoney(posDrawerCash),
        bankBalance: accountingLedger.roundMoney(bankBalance),
        accountsReceivable: accountingLedger.roundMoney(accountsReceivable),
        inventoryValuation: accountingLedger.roundMoney(inventoryValuation),
        total: 0
    };
    assets.total = accountingLedger.roundMoney(
        assets.cashInHand + assets.bankBalance + assets.accountsReceivable + assets.inventoryValuation
    );

    const liabilities = {
        accountsPayable: accountingLedger.roundMoney(accountsPayable),
        customerStoreCredit: accountingLedger.roundMoney(customerStoreCredit),
        total: accountingLedger.roundMoney(accountsPayable + customerStoreCredit)
    };

    const retainedEarnings = await resolveRetainedEarnings(parsed.plQuery);
    let balancingAdjustment = accountingLedger.roundMoney(
        assets.total - liabilities.total - retainedEarnings
    );

    const equity = {
        retainedEarnings,
        balancingAdjustment,
        total: accountingLedger.roundMoney(retainedEarnings + balancingAdjustment)
    };

    const liabilitiesPlusEquity = accountingLedger.roundMoney(liabilities.total + equity.total);
    const difference = accountingLedger.roundMoney(assets.total - liabilitiesPlusEquity);
    const balanced = Math.abs(difference) < 0.02;

    return {
        currency: 'BDT',
        generatedAt: new Date().toISOString(),
        asOfDate: parsed.asOfDate.toISOString(),
        periodMode: parsed.mode,
        assets,
        liabilities,
        equity,
        check: {
            equation: 'Assets = Liabilities + Equity',
            assetsTotal: assets.total,
            liabilitiesPlusEquity,
            difference,
            balanced
        }
    };
}

module.exports = {
    buildBalanceSheet,
    parseBalanceSheetQuery,
    computeInventoryValuation
};
