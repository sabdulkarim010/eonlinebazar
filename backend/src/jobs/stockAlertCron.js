/********************************************************************
 * Project: EonlineBazar
 * File: stockAlertCron.js
 * Location: backend/src/jobs/stockAlertCron.js
 * Description: Periodic stock alert + inventory intelligence scan.
 *   Flags REORDER_NEEDED items, persists metrics, and optionally
 *   generates draft POs when auto-PO is enabled.
 ********************************************************************/

'use strict';

const cron = require('node-cron');
const StockAlert = require('../models/stockAlert');
const { scheduleCronHandler } = require('../utils/cronJobRunner');
const { dualWrite } = require('../services/dualWriteService');
const { checkAndAlertLowStock } = require('../services/stockAlertService');
const {
    scanInventoryIntelligence,
    getReorderNeededRows,
    generateAutoDraftPurchaseOrders
} = require('../services/inventoryIntelligenceService');

function getStockAlertRepository() {
    return require('../repositories/stockAlertRepository');
}

const DEFAULT_CRON = '0 * * * *';

async function persistIntelligenceSnapshot(snapshot, autoPoResult = null) {
    const reorderNeeded = getReorderNeededRows(snapshot);

    const payload = {
        checkedAt: snapshot.computedAt || new Date(),
        lowStockCount: reorderNeeded.length,
        outOfStockCount: reorderNeeded.filter((r) => r.currentStock <= 0).length,
        lowStockProducts: reorderNeeded.map((row) => ({
            name: row.name,
            productId: row.productId,
            stock: row.currentStock,
            threshold: row.calculatedRop
        })),
        outOfStockProducts: reorderNeeded
            .filter((row) => row.currentStock <= 0)
            .map((row) => ({ name: row.name, productId: row.productId })),
        intelligenceMetrics: {
            windowDays: snapshot.windowDays,
            leadTimeDays: snapshot.leadTimeDays,
            reorderNeededCount: reorderNeeded.length,
            reorderNeededProducts: reorderNeeded,
            autoPoResult
        },
        alertsSent: { email: false, sms: false, whatsapp: false }
    };

    await dualWrite(
        () => StockAlert.create(payload),
        async (saved) => {
            const plain = saved.toObject ? saved.toObject() : saved;
            await getStockAlertRepository().create({
                checkedAt: plain.checkedAt,
                lowStockCount: plain.lowStockCount,
                outOfStockCount: plain.outOfStockCount,
                lowStockProducts: plain.lowStockProducts,
                outOfStockProducts: plain.outOfStockProducts,
                alertsSent: plain.alertsSent,
                legacyId: String(saved._id),
                createdAt: plain.createdAt
            });
        },
        {
            model: 'StockAlert',
            operation: 'create',
            source: 'stockAlertCron:runIntelligenceStockScan',
            mongoId: (saved) => String(saved._id)
        }
    );
}

/**
 * Run intelligence scan, persist metrics, optionally auto-generate draft POs,
 * then run legacy low-stock notifications.
 */
async function runIntelligenceStockScan() {
    const snapshot = await scanInventoryIntelligence();
    const reorderNeeded = getReorderNeededRows(snapshot);

    let autoPoResult = null;
    if (process.env.INVENTORY_AUTO_PO_ENABLED === 'true') {
        autoPoResult = await generateAutoDraftPurchaseOrders({ snapshot });
    }

    await persistIntelligenceSnapshot(snapshot, autoPoResult);

    const legacyAlert = await checkAndAlertLowStock();

    console.log(
        `[StockAlertCron] Intelligence scan — ${reorderNeeded.length} REORDER_NEEDED, `
        + `auto POs: ${autoPoResult?.purchaseOrders?.length || 0}`
    );

    return {
        intelligence: snapshot,
        reorderNeededCount: reorderNeeded.length,
        autoPoResult,
        legacyAlert
    };
}

let cronTask = null;

function startStockAlertCron() {
    if (process.env.LOW_STOCK_ALERT_ENABLED !== 'true') {
        console.log('[StockAlertCron] Cron disabled (LOW_STOCK_ALERT_ENABLED !== true)');
        return;
    }

    const schedule = String(process.env.LOW_STOCK_CHECK_INTERVAL || DEFAULT_CRON).trim() || DEFAULT_CRON;
    const expression = cron.validate(schedule) ? schedule : DEFAULT_CRON;

    if (!cron.validate(schedule)) {
        console.error(`[StockAlertCron] Invalid cron "${schedule}" — using ${DEFAULT_CRON}`);
    }

    if (cronTask) cronTask.stop();

    cronTask = cron.schedule(
        expression,
        scheduleCronHandler('StockAlertCron.runIntelligenceStockScan', runIntelligenceStockScan)
    );

    console.log(`[StockAlertCron] Scheduled: "${expression}"`);
}

module.exports = {
    startStockAlertCron,
    runIntelligenceStockScan
};
