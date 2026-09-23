/********************************************************************
 * Project: EonlineBazar — Database Migration
 * File: syncFailuresController.js
 * Description: Super-admin visibility into Mongo→PG dual-write failures.
 ********************************************************************/

const { listUnresolvedFailures } = require('../../services/failedSyncService');

async function getSyncFailures(req, res) {
    try {
        const limit = Number(req.query.limit) || 100;
        const failures = await listUnresolvedFailures(limit);

        return res.json({
            success: true,
            count: failures.length,
            data: failures
        });
    } catch (err) {
        console.error('getSyncFailures:', err);
        return res.status(500).json({
            success: false,
            message: 'Could not load sync failures.'
        });
    }
}

module.exports = {
    getSyncFailures
};
