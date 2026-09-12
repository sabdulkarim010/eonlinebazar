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

module.exports = {
    exportFullBackup
};
