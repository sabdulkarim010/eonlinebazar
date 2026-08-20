/********************************************************************
 * Project: EonlineBazar
 * File: sandboxController.js
 * Location: controllers/sandboxController.js
 * Description: Super-admin API for sandbox mode toggle and data reset.
 ********************************************************************/

const {
    isSandboxMode,
    setSandboxMode,
    resetSandboxData,
    resetRealData,
    getSandboxStats
} = require('../services/sandboxService');

exports.getSandboxStatus = async (req, res) => {
    try {
        const [sandboxMode, stats] = await Promise.all([
            isSandboxMode(),
            getSandboxStats()
        ]);

        res.json({
            success: true,
            sandboxMode,
            sandboxOrderCount: stats.sandboxOrderCount,
            realOrderCount: stats.realOrderCount
        });
    } catch (err) {
        console.error('[Sandbox] getSandboxStatus error:', err);
        res.status(500).json({ success: false, message: 'Failed to load sandbox status.' });
    }
};

exports.toggleSandboxMode = async (req, res) => {
    try {
        const enabled = req.body.enabled === true || req.body.enabled === 'true';
        const sandboxMode = await setSandboxMode(enabled);

        res.json({
            success: true,
            sandboxMode,
            message: enabled
                ? 'Sandbox mode enabled — new orders will be marked as test data.'
                : 'Live mode enabled — new orders are real.'
        });
    } catch (err) {
        console.error('[Sandbox] toggleSandboxMode error:', err);
        res.status(500).json({ success: false, message: 'Failed to toggle sandbox mode.' });
    }
};

exports.resetTestData = async (req, res) => {
    try {
        const deleted = await resetSandboxData();

        res.json({
            success: true,
            deleted: {
                orders: deleted.ordersDeleted,
                users: deleted.usersDeleted,
                reviews: deleted.reviewsDeleted
            }
        });
    } catch (err) {
        console.error('[Sandbox] resetTestData error:', err);
        res.status(500).json({ success: false, message: 'Failed to reset test data.' });
    }
};

exports.resetRealData = async (req, res) => {
    try {
        const confirmationKey = String(req.body.confirmationKey || '').trim();
        const deleted = await resetRealData(confirmationKey);

        res.json({
            success: true,
            deleted: { orders: deleted.ordersDeleted }
        });
    } catch (err) {
        const isKeyError = err.message.includes('Invalid confirmation key');
        res.status(isKeyError ? 403 : 500).json({
            success: false,
            message: isKeyError ? 'Invalid confirmation key.' : 'Failed to reset real data.'
        });
    }
};
