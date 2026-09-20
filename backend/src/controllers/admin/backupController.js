/********************************************************************
 * Project: EonlineBazar
 * File: backupController.js
 * Location: controllers/admin/backupController.js
 * Description: Super-admin database backup download (export only — no restore).
 ********************************************************************/

const fs = require('fs');
const Settings = require('../../models/Settings');
const { exportFullBackup, exportPostgresBackup } = require('../../services/backupService');
const { logSecurityEvent, getClientIp } = require('../../utils/securityLogger');

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
                const settings = await Settings.getOrCreate();
                settings.lastBackupAt = new Date();
                await settings.save();
            } catch (saveErr) {
                console.warn('[Backup] Could not persist lastBackupAt:', saveErr.message);
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
            const settings = await Settings.getOrCreate();
            if (logLabel.includes('PostgreSQL')) {
                settings.lastPostgresBackupAt = new Date();
            } else {
                settings.lastBackupAt = new Date();
            }
            await settings.save();
        } catch (saveErr) {
            console.warn('[Backup] Could not persist lastBackupAt:', saveErr.message);
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
        return res.json({
            success: true,
            data: {
                lastBackupAt: settings.lastBackupAt || null,
                lastPostgresBackupAt: settings.lastPostgresBackupAt || null
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

module.exports = {
    triggerBackup,
    triggerPostgresBackup,
    getBackupStatus
};
