/********************************************************************
 * Project: EonlineBazar — Accounts & Finance
 * File: accountsSummaryController.js
 * Description: Cash flow, liquidity, and balance-sheet-style summary
 * metrics for the admin Accounts Overview dashboard.
 ********************************************************************/

const accountingLedger = require('../../services/accountingLedgerService');

/**
 * GET /api/admin/accounts-summary
 * Optional query: ?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
 */
exports.getAccountsSummary = async (req, res) => {
    try {
        const { data } = await accountingLedger.buildAccountsSummaryPayload(req.query);
        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('getAccountsSummary Error:', error);
        res.status(200).json({
            success: true,
            data: accountingLedger.computeAccountsSummaryFromOrders([], {
                startOfMonth: new Date(),
                expensesTotal: 0,
                supplierPayable: 0
            })
        });
    }
};
