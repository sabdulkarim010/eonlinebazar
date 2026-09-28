/********************************************************************
 * Super-admin database backup — export, encrypted DR, validate, restore
 ********************************************************************/

const fs = require('fs');
const Admin = require('../../models/admin');
const Settings = require('../../models/Settings');
const {
    exportFullBackup,
    exportPostgresBackup,
    generateEncryptedBackup,
    validateEncryptedBackupBuffer,
    restoreBackupPayload,
    parseEncryptedBackupBuffer
} = require('../../services/backupService');
const {
    listBackupEntries,
    getBackupFilePath,
    deleteBackupEntry
} = require('../../services/backupArchiveService');
const { logSecurityEvent, getClientIp } = require('../../utils/securityLogger');

const SETTINGS_DOCUMENT_KEY = 'global';

async function persistBackupTimestamps(fields) {
    await Settings.findOneAndUpdate(
        { key: SETTINGS_DOCUMENT_KEY },
        { $set: fields },
        { upsert: true, setDefaultsOnInsert: true }
    );
}

async function verifySuperAdminStepUp(req) {
    const password = String(req.body?.currentPassword || req.body?.password || '').trim();
    if (!password) {
        return { ok: false, status: 400, message: 'Super Admin password is required for this operation.' };
    }

    const account = req.adminAccount;
    if (!account?.isSuperAdmin?.()) {
        return { ok: false, status: 403, message: 'Super Admin access required.' };
    }

    const adminDoc = await Admin.findById(account._id);
    if (!adminDoc) {
        return { ok: false, status: 401, message: 'Admin account not found.' };
    }

    const valid = await adminDoc.verifyPassword(password);
    if (!valid) {
        return { ok: false, status: 403, message: 'Password verification failed.' };
    }

    return { ok: true };
}

async function triggerBackup(req, res) {
    let backup = null;

    try {
        backup = await exportFullBackup();

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${backup.filename}"`);
        res.setHeader('X-Backup-Document-Count', String(backup.documentCount));

        const stream = fs.createReadStream(backup.filePath);

        stream.on('error', async (streamErr) => {
            console.error('[Backup] Stream error:', streamErr.message);
            if (!res.headersSent) {
                res.status(500).json({ success: false, message: 'Failed to stream backup file.' });
            }
            if (backup?.cleanup) await backup.cleanup();
        });

        stream.on('end', async () => {
            try {
                await persistBackupTimestamps({ lastBackupAt: new Date() });
            } catch (saveErr) {
                if (process.env.NODE_ENV !== 'test') {
                    console.warn('[Backup] Could not persist lastBackupAt:', saveErr.message);
                }
            }
            if (backup?.cleanup) await backup.cleanup();
        });

        await logSecurityEvent({
            action: 'Database Backup Downloaded',
            actor: req.adminAccount?.username || 'system',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `Full JSON backup exported (${backup.documentCount} documents)`,
            resourceType: 'setting',
            resourceId: 'backup'
        });

        stream.pipe(res);
    } catch (err) {
        console.error('[Backup] Export failed:', err);
        if (backup?.cleanup) await backup.cleanup();
        if (!res.headersSent) {
            return res.status(500).json({
                success: false,
                message: 'Failed to generate database backup.'
            });
        }
    }
}

async function streamBackupFile(req, res, backup, logLabel) {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${backup.filename}"`);
    res.setHeader('X-Backup-Document-Count', String(backup.documentCount));

    const stream = fs.createReadStream(backup.filePath);

    stream.on('error', async (streamErr) => {
        console.error('[Backup] Stream error:', streamErr.message);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Failed to stream backup file.' });
        }
        if (backup?.cleanup) await backup.cleanup();
    });

    stream.on('end', async () => {
        try {
            const patch = logLabel.includes('PostgreSQL')
                ? { lastPostgresBackupAt: new Date() }
                : { lastBackupAt: new Date() };
            await persistBackupTimestamps(patch);
        } catch (saveErr) {
            if (process.env.NODE_ENV !== 'test') {
                console.warn('[Backup] Could not persist lastBackupAt:', saveErr.message);
            }
        }
        if (backup?.cleanup) await backup.cleanup();
    });

    await logSecurityEvent({
        action: logLabel,
        actor: req.adminAccount?.username || 'system',
        actorType: 'admin',
        ipAddress: getClientIp(req),
        details: `${logLabel} (${backup.documentCount} records)`,
        resourceType: 'setting',
        resourceId: 'backup'
    });

    stream.pipe(res);
}

async function triggerPostgresBackup(req, res) {
    let backup = null;

    try {
        backup = await exportPostgresBackup();
        await streamBackupFile(req, res, backup, 'PostgreSQL Backup Downloaded');
    } catch (err) {
        console.error('[Backup] PG export failed:', err);
        if (backup?.cleanup) await backup.cleanup();
        if (!res.headersSent) {
            return res.status(500).json({
                success: false,
                message: err.message || 'Failed to generate PostgreSQL backup.'
            });
        }
    }
}

async function getBackupStatus(req, res) {
    try {
        const settings = await Settings.getOrCreate();
        const archives = await listBackupEntries();
        return res.json({
            success: true,
            data: {
                lastBackupAt: settings.lastBackupAt || null,
                lastPostgresBackupAt: settings.lastPostgresBackupAt || null,
                encryptedBackups: archives
            }
        });
    } catch (err) {
        console.error('[Backup] Status error:', err);
        return res.status(500).json({
            success: false,
            message: 'Failed to load backup status.'
        });
    }
}

async function listEncryptedBackups(req, res) {
    try {
        const entries = await listBackupEntries();
        return res.json({ success: true, data: entries });
    } catch (err) {
        console.error('[Backup] List error:', err);
        return res.status(500).json({ success: false, message: 'Failed to list backups.' });
    }
}

async function generateInstantEncryptedBackup(req, res) {
    try {
        const result = await generateEncryptedBackup({ source: 'manual' });

        await logSecurityEvent({
            action: 'SYSTEM_BACKUP_CREATED',
            actor: req.adminAccount?.username || 'system',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `Instant encrypted backup ${result.entry.id} — ${result.entry.sizeBytes} bytes, `
                + `checksum ${result.entry.checksumSha256}, ${result.durationMs}ms`,
            resourceType: 'setting',
            resourceId: 'backup'
        });

        await persistBackupTimestamps({ lastBackupAt: new Date() });

        return res.status(201).json({
            success: true,
            message: 'Encrypted backup created.',
            data: result.entry
        });
    } catch (err) {
        console.error('[Backup] Encrypted generate failed:', err);
        return res.status(500).json({
            success: false,
            message: err.message || 'Failed to create encrypted backup.'
        });
    }
}

async function downloadEncryptedBackup(req, res) {
    try {
        const { id } = req.params;
        const filePath = await getBackupFilePath(id);
        if (!filePath) {
            return res.status(404).json({ success: false, message: 'Backup not found.' });
        }

        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${id}.eobk"`);
        fs.createReadStream(filePath).pipe(res);
    } catch (err) {
        console.error('[Backup] Download error:', err);
        return res.status(500).json({ success: false, message: 'Download failed.' });
    }
}

async function deleteEncryptedBackup(req, res) {
    try {
        const removed = await deleteBackupEntry(req.params.id);
        if (!removed) {
            return res.status(404).json({ success: false, message: 'Backup not found.' });
        }
        return res.json({ success: true, message: 'Backup deleted.' });
    } catch (err) {
        console.error('[Backup] Delete error:', err);
        return res.status(500).json({ success: false, message: 'Delete failed.' });
    }
}

async function readBackupBufferFromRequest(req) {
    if (req.file?.buffer) {
        return req.file.buffer;
    }
    const backupId = req.body?.backupId;
    if (backupId) {
        const filePath = await getBackupFilePath(String(backupId));
        if (!filePath) throw Object.assign(new Error('Backup not found.'), { status: 404 });
        return fs.promises.readFile(filePath);
    }
    throw Object.assign(new Error('Upload a backup file or provide backupId.'), { status: 400 });
}

async function validateBackup(req, res) {
    try {
        const buffer = await readBackupBufferFromRequest(req);
        const summary = await validateEncryptedBackupBuffer(buffer);
        return res.json({
            success: true,
            data: summary
        });
    } catch (err) {
        const status = err.status || 400;
        return res.status(status).json({
            success: false,
            valid: false,
            message: err.message || 'Validation failed.'
        });
    }
}

async function restoreBackup(req, res) {
    const stepUp = await verifySuperAdminStepUp(req);
    if (!stepUp.ok) {
        return res.status(stepUp.status).json({ success: false, message: stepUp.message });
    }

    try {
        const buffer = await readBackupBufferFromRequest(req);
        const { payload } = await parseEncryptedBackupBuffer(buffer);
        const restoreResult = await restoreBackupPayload(payload);

        await logSecurityEvent({
            action: 'SYSTEM_BACKUP_RESTORED',
            actor: req.adminAccount?.username || 'system',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `Mongo restore completed — collections: ${Object.keys(restoreResult.mongo.restoredCounts || {}).join(', ')}`,
            resourceType: 'setting',
            resourceId: 'backup'
        });

        return res.json({
            success: true,
            message: 'Backup restored successfully.',
            data: restoreResult
        });
    } catch (err) {
        console.error('[Backup] Restore failed:', err);
        return res.status(500).json({
            success: false,
            message: err.message || 'Restore failed and was rolled back.'
        });
    }
}

module.exports = {
    triggerBackup,
    triggerPostgresBackup,
    getBackupStatus,
    listEncryptedBackups,
    generateInstantEncryptedBackup,
    downloadEncryptedBackup,
    deleteEncryptedBackup,
    validateBackup,
    restoreBackup,
    verifySuperAdminStepUp
};
