#!/usr/bin/env node
/********************************************************************
 * One-time migration: merge the deprecated Setting (key: master)
 * singleton into the Settings (key: global) singleton.
 *
 * Copies any field that is unset or still at schema default on the
 * global document from the master document. Does NOT delete the master
 * row — safe to re-run (idempotent for already-merged fields).
 *
 * Usage:
 *   node scripts/mergeSettingsModels.js
 *   node scripts/mergeSettingsModels.js --dry-run
 ********************************************************************/

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Settings = require('../backend/src/models/Settings');

const MASTER_KEY = 'master';
const GLOBAL_KEY = 'global';

/** Fields migrated from the former Setting.js schema. */
const MERGE_FIELDS = [
    'cashbackPercentage',
    'takaToPointsRatio',
    'pointsToTakaConversionRate',
    'refundUndoWindowHours',
    'freeShippingThreshold',
    'announcementText',
    'announcementDiscount',
    'isAnnouncementActive',
    'enableSmsNotifications',
    'flashSaleEnabled',
    'flashSaleTitle',
    'flashSaleEndDate',
    'flashSaleDiscountPercent',
    'flashSaleProductIds',
    'vipMinTotalSpent',
    'vipMinOrderCount',
    'frequentBuyerMinOrders',
    'referralRewardAmount',
    'enableTieredLoyalty',
    'silverThreshold',
    'goldThreshold',
    'platinumThreshold',
    'silverCashback',
    'goldCashback',
    'platinumCashback',
    'defaultProductsPerPage',
    'vatRate',
    'orderPrefix',
    'maintenanceMode',
    'maintenanceMessage'
];

function isUnset(value, path) {
    if (value === null || value === undefined) return true;
    if (path === 'freeShippingThreshold') return false;
    if (Array.isArray(value) && value.length === 0) return true;
    if (typeof value === 'string' && value.trim() === '' && path === 'announcementText') return true;
    return false;
}

function hasMeaningfulMasterValue(value, path) {
    if (value === null || value === undefined) return false;
    if (path === 'freeShippingThreshold' && !Number.isFinite(Number(value))) return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI is required.');
        process.exit(1);
    }

    await mongoose.connect(uri);
    console.log(`Connected to MongoDB${dryRun ? ' (dry run)' : ''}.`);

    const collection = mongoose.connection.collection('settings');
    const [master, global] = await Promise.all([
        collection.findOne({ key: MASTER_KEY }),
        collection.findOne({ key: GLOBAL_KEY })
    ]);

    if (!master) {
        console.log('No master (key: master) document found — nothing to merge.');
        await mongoose.disconnect();
        return;
    }

    let globalDoc = global;
    if (!globalDoc) {
        console.log('No global document — creating via Settings.getOrCreate().');
        if (!dryRun) {
            globalDoc = (await Settings.getOrCreate()).toObject();
        } else {
            globalDoc = { key: GLOBAL_KEY };
        }
    }

    const updates = {};
    for (const field of MERGE_FIELDS) {
        const globalVal = globalDoc[field];
        const masterVal = master[field];
        if (!hasMeaningfulMasterValue(masterVal, field)) continue;
        if (isUnset(globalVal, field)) {
            updates[field] = masterVal;
        }
    }

    // Mirror free-shipping threshold into freeShippingMinAmount when global is default.
    const threshold = updates.freeShippingThreshold ?? master.freeShippingThreshold;
    if (Number.isFinite(Number(threshold)) && Number(threshold) >= 0) {
        const currentMin = globalDoc.freeShippingMinAmount;
        if (currentMin === undefined || currentMin === null || currentMin === 1000) {
            updates.freeShippingMinAmount = Number(threshold);
        }
    }

    const keys = Object.keys(updates);
    if (keys.length === 0) {
        console.log('Global document already has all master values — no changes needed.');
    } else {
        console.log(`Fields to merge (${keys.length}):`, keys.join(', '));
        if (dryRun) {
            console.log('Dry run — no writes performed.');
        } else {
            await collection.updateOne(
                { key: GLOBAL_KEY },
                { $set: updates },
                { upsert: true }
            );
            console.log('Merge complete. Master document preserved at key: master.');
        }
    }

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
