#!/usr/bin/env node
/********************************************************************
 * Project: EonlineBazar — Enterprise Index Migration
 * File: scripts/addEnterpriseIndexes.js
 * Description: Creates recommended compound indexes for ERP/CRM queries.
 * Usage: npm run migrate:indexes
 ********************************************************************/

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const INDEX_SPECS = [
    {
        model: 'Order',
        collection: 'orders',
        keys: { user: 1, status: 1, createdAt: -1 },
        options: { name: 'user_status_createdAt' }
    },
    {
        model: 'Cart',
        collection: 'carts',
        keys: { userId: 1, updatedAt: -1 },
        options: { name: 'userId_updatedAt' }
    },
    {
        model: 'User',
        collection: 'users',
        keys: { loyaltyPoints: -1 },
        options: { name: 'loyaltyPoints_desc' }
    },
    {
        model: 'User',
        collection: 'users',
        keys: { walletBalance: -1 },
        options: { name: 'walletBalance_desc' }
    },
    {
        model: 'Review',
        collection: 'reviews',
        keys: { isHidden: 1, createdAt: -1 },
        options: { name: 'isHidden_createdAt' }
    },
    {
        model: 'ContactMessage',
        collection: 'contactmessages',
        keys: { status: 1, createdAt: -1 },
        options: { name: 'status_createdAt' }
    }
];

async function ensureIndex(db, spec) {
    const collection = db.collection(spec.collection);
    const existing = await collection.indexes();
    const keyJson = JSON.stringify(spec.keys);
    const already = existing.some((idx) => JSON.stringify(idx.key) === keyJson);
    if (already) {
        console.log(`  ✓ ${spec.model} ${keyJson} (exists)`);
        return;
    }
    await collection.createIndex(spec.keys, spec.options);
    console.log(`  + ${spec.model} ${keyJson} (created)`);
}

async function main() {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) {
        console.error('MONGODB_URI or MONGO_URI is required.');
        process.exit(1);
    }

    await mongoose.connect(uri);
    console.log('Connected to MongoDB');
    console.log('Creating enterprise indexes…');

    const db = mongoose.connection.db;
    for (const spec of INDEX_SPECS) {
        await ensureIndex(db, spec);
    }

    console.log('Enterprise index migration complete.');
    await mongoose.disconnect();
}

main().catch((err) => {
    console.error('Migration failed:', err.message);
    process.exit(1);
});
