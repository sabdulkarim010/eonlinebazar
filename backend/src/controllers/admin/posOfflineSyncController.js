/********************************************************************
 * POS offline batch order sync controller.
 ********************************************************************/

'use strict';

const { syncOfflineOrdersBatch } = require('../../services/posOfflineSyncService');

const batchSyncOfflineOrders = async (req, res) => {
    try {
        const orders = Array.isArray(req.body?.orders) ? req.body.orders : [];
        if (!orders.length) {
            return res.status(400).json({
                success: false,
                message: 'orders array is required and must not be empty.'
            });
        }

        const report = await syncOfflineOrdersBatch(orders, {
            actor: req.admin?.username || req.adminAccount?.username || 'pos-offline-sync'
        });

        return res.status(200).json({
            success: true,
            message: 'Offline batch sync completed.',
            data: report
        });
    } catch (err) {
        console.error('batchSyncOfflineOrders error:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = {
    batchSyncOfflineOrders
};
