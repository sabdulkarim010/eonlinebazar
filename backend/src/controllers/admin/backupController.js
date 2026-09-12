/********************************************************************
 * Project: EonlineBazar
 * File: backupController.js
 * Location: controllers/admin/backupController.js
 * Description: Super-admin database backup download (export only — no restore).
 ********************************************************************/

const fs = require('fs');
const Settings = require('../../models/Settings');
const { exportFullBackup } = require('../../services/backupService');
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
            adminId: req.adminAccount?._id,
            adminUsername: req.adminAccount?.username,
            ip: getClientIp(req),
            details: `Full JSON backup exported (${backup.documentCount} documents)`,
            resourceType: 'system',
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

async function getBackupStatus(req, res) {
    try {
        const settings = await Settings.getOrCreate();
        return res.json({
            success: true,
            data: {
                lastBackupAt: settings.lastBackupAt || null
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
    getBackupStatus
};
