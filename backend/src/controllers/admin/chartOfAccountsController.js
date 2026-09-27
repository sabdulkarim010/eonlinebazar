/********************************************************************
 * Project: EonlineBazar — Chart of Accounts API
 * File: chartOfAccountsController.js
 ********************************************************************/

const chartOfAccountsService = require('../../services/chartOfAccountsService');

/**
 * GET /api/admin/finance/chart-of-accounts
 * Optional ?dateFrom=&dateTo= (YYYY-MM-DD)
 */
exports.getChartOfAccounts = async (req, res) => {
    try {
        const data = await chartOfAccountsService.getChartOfAccounts(req.query);
        return res.status(200).json({ success: true, data });
    } catch (err) {
        console.error('getChartOfAccounts error:', err);
        return res.status(500).json({
            success: false,
            message: 'Failed to load chart of accounts.'
        });
    }
};
