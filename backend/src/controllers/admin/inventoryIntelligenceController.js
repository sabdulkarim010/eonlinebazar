/********************************************************************
 * Project: EonlineBazar — Inventory Intelligence
 * File: inventoryIntelligenceController.js
 * Description: Admin API for sales velocity, ROP, and auto PO triggers.
 ********************************************************************/

const {
    scanInventoryIntelligence,
    getCachedIntelligence,
    getReorderNeededRows,
    generateAutoDraftPurchaseOrders
} = require('../../services/inventoryIntelligenceService');
const { logSecurityEvent, getClientIp } = require('../../utils/securityLogger');

exports.getVelocity = async (req, res) => {
    try {
        const refresh = String(req.query.refresh || '').toLowerCase() === 'true';
        const snapshot = refresh
            ? await scanInventoryIntelligence({
                windowDays: req.query.windowDays,
                leadTimeDays: req.query.leadTimeDays
            })
            : getCachedIntelligence();

        const products = snapshot?.products?.length
            ? snapshot.products
            : (await scanInventoryIntelligence({
                windowDays: req.query.windowDays,
                leadTimeDays: req.query.leadTimeDays
            })).products;

        const reorderNeeded = products.filter((row) => row.status === 'REORDER_NEEDED');

        return res.json({
            success: true,
            data: {
                computedAt: snapshot.computedAt,
                windowDays: snapshot.windowDays,
                leadTimeDays: snapshot.leadTimeDays,
                totalProducts: products.length,
                reorderNeededCount: reorderNeeded.length,
                products,
                reorderNeeded
            }
        });
    } catch (err) {
        console.error('[inventoryIntelligenceController.getVelocity]', err);
        return res.status(500).json({
            success: false,
            message: err.message || 'Could not compute inventory intelligence.'
        });
    }
};

exports.triggerAutoPo = async (req, res) => {
    try {
        const snapshot = await scanInventoryIntelligence({
            windowDays: req.body?.windowDays,
            leadTimeDays: req.body?.leadTimeDays
        });

        const result = await generateAutoDraftPurchaseOrders({
            snapshot,
            createdBy: req.account?._id || req.adminId || null,
            createdByName: req.account?.username || req.admin?.username || 'admin',
            notes: String(req.body?.notes || 'Manual auto-PO trigger from inventory intelligence.')
        });

        await logSecurityEvent({
            action: 'INVENTORY_AUTO_PO_TRIGGERED',
            actor: req.account?.username || req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `Generated ${result.purchaseOrders.length} draft PO(s); `
                + `${result.reorderNeededCount} reorder-needed SKU(s) scanned`,
            resourceType: 'purchase_order',
            resourceId: result.purchaseOrders[0]?.poId || ''
        });

        return res.json({
            success: true,
            message: `Auto draft PO run complete — ${result.purchaseOrders.length} PO(s) touched.`,
            data: result
        });
    } catch (err) {
        console.error('[inventoryIntelligenceController.triggerAutoPo]', err);
        return res.status(500).json({
            success: false,
            message: err.message || 'Auto PO generation failed.'
        });
    }
};

exports.runIntelligenceScan = async (req, res) => {
    try {
        const { runIntelligenceStockScan } = require('../../jobs/stockAlertCron');
        const payload = await runIntelligenceStockScan();
        return res.json({ success: true, data: payload });
    } catch (err) {
        console.error('[inventoryIntelligenceController.runIntelligenceScan]', err);
        return res.status(500).json({
            success: false,
            message: err.message || 'Intelligence scan failed.'
        });
    }
};
