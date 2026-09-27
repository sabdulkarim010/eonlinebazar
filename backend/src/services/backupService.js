/********************************************************************
 * Project: EonlineBazar
 * File: backupService.js
 * Location: services/backupService.js
 * Description: Portable MongoDB export via Mongoose — no mongodump binary.
 * Iterates registered models, writes a single JSON backup file to a temp dir.
 ********************************************************************/

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const {
    sealBackupPayload,
    openBackupEnvelope,
    envelopeToBuffer,
    parseEnvelopeBuffer
} = require('./backupEncryptionService');
const {
    getBackupStorageDir,
    registerBackupEntry,
    buildBackupFilename,
    pruneOldBackups
} = require('./backupArchiveService');

/** Collections excluded from encrypted DR exports (volatile / high-volume audit). */
const EXCLUDED_MONGO_COLLECTIONS = new Set([
    'adminsessions',
    'securitylogs',
    'loginattempts',
    'failedsyncs'
]);

const PG_ESSENTIAL_TABLES = [
    { name: 'settings', fetch: (prisma) => prisma.settings.findMany() },
    { name: 'orders', fetch: (prisma) => prisma.order.findMany() },
    { name: 'products', fetch: (prisma) => prisma.product.findMany() },
    { name: 'users', fetch: (prisma) => prisma.user.findMany() },
    { name: 'employees', fetch: (prisma) => prisma.employee.findMany() },
    { name: 'payment_methods', fetch: (prisma) => prisma.paymentMethod.findMany() }
];

/**
 * Export every Mongoose model collection to one JSON document.
 * @returns {Promise<{ filePath: string, filename: string, cleanup: Function, documentCount: number }>}
 */
async function exportFullBackup() {
    const models = mongoose.connection.models;
    const collections = {};
    let documentCount = 0;

    for (const Model of Object.values(models)) {
        const collectionName = Model.collection.collectionName;
        const docs = await Model.find({}).lean();
        collections[collectionName] = docs;
        documentCount += docs.length;
    }

    const payload = {
        exportedAt: new Date().toISOString(),
        database: mongoose.connection.name,
        mongooseVersion: mongoose.version,
        collectionCount: Object.keys(collections).length,
        documentCount,
        collections
    };

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `eonlinebazar-backup-${dateStr}.json`;
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'eob-backup-'));
    const filePath = path.join(tmpDir, filename);

    await fs.promises.writeFile(filePath, JSON.stringify(payload), 'utf8');

    const cleanup = async () => {
        try {
            await fs.promises.rm(tmpDir, { recursive: true, force: true });
        } catch (err) {
            console.warn('[Backup] Temp cleanup failed:', err.message);
        }
    };

    return { filePath, filename, cleanup, documentCount };
}

/**
 * Export critical PostgreSQL tables via Prisma into a timestamped ZIP.
 * Neon retains automatic backups — this is an additional manual export.
 * @returns {Promise<{ filePath: string, filename: string, cleanup: Function, documentCount: number }>}
 */
async function exportPostgresBackup() {
    let archiver;
    try {
        archiver = require('archiver');
    } catch (err) {
        throw new Error(`ZIP archiver unavailable: ${err.message}`);
    }

    let prisma;
    try {
        prisma = require('../config/prismaClient');
    } catch (err) {
        throw new Error(`PostgreSQL client unavailable: ${err.message}`);
    }

    const tableExports = [
        { name: 'orders', fetch: () => prisma.order.findMany() },
        { name: 'products', fetch: () => prisma.product.findMany() },
        { name: 'users', fetch: () => prisma.user.findMany() },
        { name: 'employees', fetch: () => prisma.employee.findMany() },
        { name: 'attendance', fetch: () => prisma.attendance.findMany() },
        { name: 'order_payments', fetch: () => prisma.orderPayment.findMany() }
    ];

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `pg-backup-${dateStr}.zip`;
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'eob-pg-backup-'));
    const filePath = path.join(tmpDir, filename);

    let documentCount = 0;
    const manifest = {
        exportedAt: new Date().toISOString(),
        source: 'postgresql',
        tables: {}
    };

    await new Promise((resolve, reject) => {
        const output = fs.createWriteStream(filePath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', resolve);
        archive.on('error', reject);
        archive.pipe(output);

        (async () => {
            for (const table of tableExports) {
                // eslint-disable-next-line no-await-in-loop
                const rows = await table.fetch();
                documentCount += rows.length;
                manifest.tables[table.name] = rows.length;
                archive.append(JSON.stringify(rows, null, 2), { name: `${table.name}.json` });
            }
            archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
            archive.finalize();
        })().catch(reject);
    });

    const cleanup = async () => {
        try {
            await fs.promises.rm(tmpDir, { recursive: true, force: true });
        } catch (err) {
            console.warn('[Backup] PG temp cleanup failed:', err.message);
        }
    };

    return { filePath, filename, cleanup, documentCount };
}

async function fetchEssentialPostgresTables() {
    let prisma;
    try {
        prisma = require('../config/prismaClient');
    } catch (err) {
        return { tables: {}, recordCount: 0, error: err.message };
    }

    const tables = {};
    let recordCount = 0;

    for (const table of PG_ESSENTIAL_TABLES) {
        try {
            // eslint-disable-next-line no-await-in-loop
            const rows = await table.fetch(prisma);
            tables[table.name] = rows;
            recordCount += rows.length;
        } catch (err) {
            tables[table.name] = { _error: err.message };
        }
    }

    return { tables, recordCount };
}

async function buildEssentialBackupPayload() {
    const models = mongoose.connection.models;
    const collections = {};
    let documentCount = 0;

    for (const Model of Object.values(models)) {
        const collectionName = Model.collection.collectionName;
        if (EXCLUDED_MONGO_COLLECTIONS.has(collectionName)) continue;
        // eslint-disable-next-line no-await-in-loop
        const docs = await Model.find({}).lean();
        collections[collectionName] = docs;
        documentCount += docs.length;
    }

    const pg = await fetchEssentialPostgresTables();
    documentCount += pg.recordCount;

    return {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        database: mongoose.connection.name,
        documentCount,
        collections,
        collectionNames: Object.keys(collections),
        postgresql: pg.tables
    };
}

function summarizePayload(payload) {
    const collections = payload?.collections || {};
    const collectionNames = Object.keys(collections);
    let recordCount = 0;
    collectionNames.forEach((name) => {
        recordCount += Array.isArray(collections[name]) ? collections[name].length : 0;
    });

    const pg = payload?.postgresql || {};
    Object.values(pg).forEach((rows) => {
        if (Array.isArray(rows)) recordCount += rows.length;
    });

    return {
        valid: true,
        timestamp: payload?.exportedAt || null,
        collections: collectionNames,
        recordCount,
        checksumMatched: true,
        schemaVersion: payload?.schemaVersion || null
    };
}

function validateBackupPayloadStructure(payload) {
    if (!payload || typeof payload !== 'object') {
        throw new Error('Backup payload is not an object.');
    }
    if (!payload.collections || typeof payload.collections !== 'object') {
        throw new Error('Missing collections object in backup payload.');
    }
    if (!payload.schemaVersion) {
        throw new Error('Missing schemaVersion in backup payload.');
    }
    return summarizePayload(payload);
}

async function parseEncryptedBackupBuffer(fileBuffer) {
    const envelope = parseEnvelopeBuffer(fileBuffer);
    const { plainBuffer, checksumMatched } = await openBackupEnvelope(envelope);
    const payload = JSON.parse(plainBuffer.toString('utf8'));
    const summary = validateBackupPayloadStructure(payload);
    return { envelope, payload, summary, checksumMatched };
}

async function validateEncryptedBackupBuffer(fileBuffer) {
    const { summary, checksumMatched } = await parseEncryptedBackupBuffer(fileBuffer);
    return { ...summary, checksumMatched };
}

function modelForCollectionName(collectionName) {
    for (const Model of Object.values(mongoose.connection.models)) {
        if (Model.collection.collectionName === collectionName) {
            return Model;
        }
    }
    return null;
}

async function restoreMongoFromPayload(collections) {
    const restoredCounts = {};
    const rollbackOps = [];

    try {
        for (const [collectionName, docs] of Object.entries(collections || {})) {
            if (!Array.isArray(docs) || docs.length === 0) continue;
            const Model = modelForCollectionName(collectionName);
            if (!Model) continue;

            restoredCounts[collectionName] = 0;
            for (const doc of docs) {
                if (!doc || doc._id == null) continue;
                // eslint-disable-next-line no-await-in-loop
                const prior = await Model.findById(doc._id).lean();
                // eslint-disable-next-line no-await-in-loop
                await Model.replaceOne({ _id: doc._id }, doc, { upsert: true });
                rollbackOps.push({ Model, _id: doc._id, prior });
                restoredCounts[collectionName] += 1;
            }
        }
        return { restoredCounts, ok: true };
    } catch (err) {
        for (const op of rollbackOps.reverse()) {
            try {
                if (op.prior) {
                    // eslint-disable-next-line no-await-in-loop
                    await op.Model.replaceOne({ _id: op._id }, op.prior, { upsert: true });
                } else {
                    // eslint-disable-next-line no-await-in-loop
                    await op.Model.deleteOne({ _id: op._id });
                }
            } catch (rollbackErr) {
                console.error('[Backup] Rollback step failed:', rollbackErr.message);
            }
        }
        throw err;
    }
}

async function restoreBackupPayload(payload) {
    validateBackupPayloadStructure(payload);
    const mongoResult = await restoreMongoFromPayload(payload.collections);
    return {
        dryRun: false,
        mongo: mongoResult,
        postgresqlNote: 'PostgreSQL tables are included in backups for validation; live PG restore is not automated in this release.'
    };
}

/**
 * Create encrypted .eobk archive on disk and register manifest entry.
 * @param {{ source?: string }} [options]
 */
async function generateEncryptedBackup(options = {}) {
    const started = Date.now();
    const payload = await buildEssentialBackupPayload();
    const plainBuffer = Buffer.from(JSON.stringify(payload), 'utf8');
    const envelope = await sealBackupPayload(plainBuffer);
    const fileBuffer = envelopeToBuffer(envelope);

    const id = crypto.randomBytes(8).toString('hex');
    const filename = buildBackupFilename(id);
    const storageDir = getBackupStorageDir();
    const filePath = path.join(storageDir, filename);
    await fs.promises.writeFile(filePath, fileBuffer);

    const durationMs = Date.now() - started;
    const entry = await registerBackupEntry({
        id,
        filename,
        sizeBytes: fileBuffer.length,
        checksumSha256: envelope.checksumSha256,
        recordCount: payload.documentCount,
        durationMs,
        source: options.source || 'manual'
    });

    await pruneOldBackups();

    return {
        entry,
        filePath,
        fileBuffer,
        envelope,
        payloadMeta: summarizePayload(payload),
        durationMs
    };
}

module.exports = {
    exportFullBackup,
    exportPostgresBackup,
    buildEssentialBackupPayload,
    generateEncryptedBackup,
    validateEncryptedBackupBuffer,
    parseEncryptedBackupBuffer,
    validateBackupPayloadStructure,
    restoreBackupPayload,
    restoreMongoFromPayload,
    pruneOldBackups,
    EXCLUDED_MONGO_COLLECTIONS
};
