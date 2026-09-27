/********************************************************************
 * On-disk encrypted backup archive index + retention
 ********************************************************************/

'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_DIR = path.join(__dirname, '../../../data/encrypted-backups');
const MANIFEST = 'manifest.json';
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS) || 30;

function getBackupStorageDir() {
    const dir = process.env.BACKUP_STORAGE_DIR || DEFAULT_DIR;
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function manifestPath() {
    return path.join(getBackupStorageDir(), MANIFEST);
}

async function readManifest() {
    const file = manifestPath();
    try {
        const raw = await fs.promises.readFile(file, 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed.entries) ? parsed : { entries: [] };
    } catch (err) {
        if (err.code === 'ENOENT') return { entries: [] };
        throw err;
    }
}

async function writeManifest(manifest) {
    await fs.promises.writeFile(manifestPath(), JSON.stringify(manifest, null, 2), 'utf8');
}

function buildBackupFilename(id) {
    return `backup-${id}.eobk`;
}

/**
 * @param {{ id: string, filename: string, sizeBytes: number, checksumSha256: string, recordCount: number, durationMs: number, source?: string }} meta
 */
async function registerBackupEntry(meta) {
    const manifest = await readManifest();
    const entry = {
        id: meta.id,
        filename: meta.filename,
        createdAt: new Date().toISOString(),
        sizeBytes: meta.sizeBytes,
        checksumSha256: meta.checksumSha256,
        encryptionStandard: 'AES-256-GCM',
        recordCount: meta.recordCount,
        durationMs: meta.durationMs,
        source: meta.source || 'manual'
    };
    manifest.entries.unshift(entry);
    await writeManifest(manifest);
    return entry;
}

async function listBackupEntries() {
    const manifest = await readManifest();
    return manifest.entries || [];
}

async function getBackupEntryById(id) {
    const entries = await listBackupEntries();
    return entries.find((e) => e.id === id) || null;
}

async function getBackupFilePath(id) {
    const entry = await getBackupEntryById(id);
    if (!entry) return null;
    return path.join(getBackupStorageDir(), entry.filename);
}

async function deleteBackupEntry(id) {
    const manifest = await readManifest();
    const idx = manifest.entries.findIndex((e) => e.id === id);
    if (idx === -1) return false;

    const [removed] = manifest.entries.splice(idx, 1);
    const filePath = path.join(getBackupStorageDir(), removed.filename);
    try {
        await fs.promises.unlink(filePath);
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }
    await writeManifest(manifest);
    return true;
}

/**
 * Remove archives older than retentionDays (default 30).
 * @returns {Promise<{ pruned: number, kept: number }>}
 */
async function pruneOldBackups(retentionDays = RETENTION_DAYS) {
    const manifest = await readManifest();
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const kept = [];
    let pruned = 0;

    for (const entry of manifest.entries) {
        const created = new Date(entry.createdAt).getTime();
        if (Number.isFinite(created) && created < cutoff) {
            const filePath = path.join(getBackupStorageDir(), entry.filename);
            try {
                await fs.promises.unlink(filePath);
            } catch (err) {
                if (err.code !== 'ENOENT') console.warn('[Backup] prune unlink:', err.message);
            }
            pruned += 1;
        } else {
            kept.push(entry);
        }
    }

    if (pruned > 0) {
        await writeManifest({ entries: kept });
    }

    return { pruned, kept: kept.length };
}

module.exports = {
    RETENTION_DAYS,
    getBackupStorageDir,
    readManifest,
    registerBackupEntry,
    listBackupEntries,
    getBackupEntryById,
    getBackupFilePath,
    deleteBackupEntry,
    pruneOldBackups,
    buildBackupFilename
};
