/********************************************************************
 * Project: EonlineBazar — ERP Core (Phase 2)
 * File: migrateOrderStatus.js
 * Location: scripts/migrateOrderStatus.js
 * Author: Abdul Karim Sheikh
 *
 * Description: Order.status used to be a free-form String. Now that it
 * carries an enum, Mongoose validates the field on every document save —
 * so any legacy order holding an off-enum value would start throwing on
 * the next write. This script normalizes historical rows before that
 * happens.
 *
 * Usage:
 *   node scripts/migrateOrderStatus.js            # apply the migration
 *   node scripts/migrateOrderStatus.js --dry-run  # report only, no writes
 *
 * Safe to re-run: already-valid orders are left untouched.
 ********************************************************************/

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Order = require('../backend/src/models/order');

const DRY_RUN = process.argv.includes('--dry-run');

const VALID_STATUSES = Order.STATUSES;

/**
 * Legacy spellings seen in the wild, mapped to their enum equivalent.
 * Keys are compared lowercased with punctuation and separators stripped,
 * so "out_for_delivery", "Out-For-Delivery" and "outfordelivery" all match.
 */
const LEGACY_ALIASES = {
    // Cancellations — US spelling and verb forms
    canceled: 'Cancelled',
    cancel: 'Cancelled',
    cancelledbyadmin: 'Cancelled',
    cancelledbycustomer: 'Cancelled',

    // Fulfilment stages
    confirmed: 'Processing',
    accepted: 'Processing',
    packing: 'Processing',
    packed: 'Processing',
    inprogress: 'Processing',
    processing: 'Processing',
    dispatched: 'Shipped',
    shipping: 'Shipped',
    intransit: 'Shipped',
    outfordelivery: 'Out for Delivery',
    ofd: 'Out for Delivery',
    complete: 'Delivered',
    completed: 'Delivered',
    delivered: 'Delivered',

    // Returns and refunds
    returnrequest: 'Return Requested',
    returnrequested: 'Return Requested',
    requestedreturn: 'Return Requested',
    returnpending: 'Return Requested',
    returned: 'Returned',
    returnapproved: 'Returned',
    refundpending: 'Refund Pending',
    pendingrefund: 'Refund Pending',
    refunded: 'Refunded',
    refundcomplete: 'Refunded',

    // Placement
    pending: 'Pending',
    new: 'Pending',
    placed: 'Pending',
    unpaid: 'Pending'
};

/** Strip case, spaces, underscores, and hyphens for alias lookup. */
function normalizeKey(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[\s_\-.]+/g, '');
}

/** Exact enum match, ignoring case and separators. */
function matchEnum(value) {
    const key = normalizeKey(value);
    return VALID_STATUSES.find((status) => normalizeKey(status) === key) || null;
}

/**
 * Resolve a legacy status to an enum value.
 * Returns null when the value cannot be mapped confidently.
 */
function resolveStatus(rawStatus) {
    if (rawStatus === null || rawStatus === undefined || String(rawStatus).trim() === '') {
        return 'Pending';
    }

    const exact = matchEnum(rawStatus);
    if (exact) return exact;

    const alias = LEGACY_ALIASES[normalizeKey(rawStatus)];
    if (alias) return alias;

    return null;
}

async function run() {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) {
        console.error('❌ MONGODB_URI (or MONGO_URI) is not set. Check your .env file.');
        process.exit(1);
    }

    await mongoose.connect(uri);
    console.log(`✅ Connected to MongoDB${DRY_RUN ? ' (dry run — no writes)' : ''}`);
    console.log(`   Valid statuses: ${VALID_STATUSES.join(', ')}\n`);

    // Read raw documents through the driver so the new enum cannot reject
    // the very rows we are here to repair.
    const collection = mongoose.connection.collection('orders');

    const total = await collection.countDocuments();
    const cursor = collection.find({}, { projection: { _id: 1, orderId: 1, status: 1 } });

    let alreadyValid = 0;
    let migrated = 0;
    const unmapped = [];
    const changes = new Map();

    while (await cursor.hasNext()) {
        const order = await cursor.next();
        const current = order.status;

        // Exact, case-correct match needs no write.
        if (VALID_STATUSES.includes(current)) {
            alreadyValid += 1;
            continue;
        }

        const resolved = resolveStatus(current);

        if (!resolved) {
            unmapped.push({ _id: order._id, orderId: order.orderId, status: current });
            continue;
        }

        const label = `"${current ?? '(empty)'}" → "${resolved}"`;
        changes.set(label, (changes.get(label) || 0) + 1);

        if (!DRY_RUN) {
            await collection.updateOne({ _id: order._id }, { $set: { status: resolved } });
        }
        migrated += 1;
    }

    console.log('──────── Order status migration ────────');
    console.log(`Total orders scanned : ${total}`);
    console.log(`Already valid        : ${alreadyValid}`);
    console.log(`${DRY_RUN ? 'Would migrate      ' : 'Migrated           '}  : ${migrated}`);
    console.log(`Unmapped (untouched) : ${unmapped.length}`);

    if (changes.size > 0) {
        console.log('\nBreakdown:');
        [...changes.entries()]
            .sort((a, b) => b[1] - a[1])
            .forEach(([label, count]) => console.log(`  ${count.toString().padStart(5)}  ${label}`));
    }

    if (unmapped.length > 0) {
        console.log('\n⚠️  These orders hold a status with no safe mapping and were left as-is.');
        console.log('   They will fail validation on their next save — map them by hand or');
        console.log('   add an entry to LEGACY_ALIASES in this script, then re-run.');
        unmapped.slice(0, 25).forEach((row) => {
            console.log(`   • ${row.orderId || row._id} → "${row.status}"`);
        });
        if (unmapped.length > 25) {
            console.log(`   … and ${unmapped.length - 25} more`);
        }
    }

    console.log(`\n${DRY_RUN ? '🔍 Dry run complete — no documents were written.' : '✅ Migration complete.'}`);

    await mongoose.disconnect();
    process.exit(unmapped.length > 0 ? 2 : 0);
}

// Only migrate when invoked directly — requiring this file (e.g. from a
// test that wants resolveStatus) must not touch the database.
if (require.main === module) {
    run().catch(async (err) => {
        console.error('❌ Migration failed:', err.message);
        try {
            await mongoose.disconnect();
        } catch (_) { /* already closed */ }
        process.exit(1);
    });
}

module.exports = { resolveStatus, normalizeKey, LEGACY_ALIASES, VALID_STATUSES };
