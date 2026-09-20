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
const mongoose = require('mongoose');

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

module.exports = {
    exportFullBackup,
    exportPostgresBackup
};
