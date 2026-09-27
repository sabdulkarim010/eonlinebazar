/********************************************************************
 * Daily encrypted backup cron + 30-day retention
 ********************************************************************/

'use strict';

const cron = require('node-cron');
const { scheduleCronHandler } = require('../utils/cronJobRunner');
const { generateEncryptedBackup } = require('../services/backupService');
const { logSecurityEvent } = require('../utils/securityLogger');

const DEFAULT_CRON = process.env.BACKUP_CRON_SCHEDULE || '0 3 * * *';
let cronTask = null;

async function runScheduledEncryptedBackup() {
    const result = await generateEncryptedBackup({ source: 'cron' });

    await logSecurityEvent({
        action: 'SYSTEM_BACKUP_CREATED',
        actor: 'system',
        actorType: 'system',
        ipAddress: '127.0.0.1',
        details: `Scheduled encrypted backup ${result.entry.id} — ${result.entry.sizeBytes} bytes, `
            + `checksum ${result.entry.checksumSha256}, ${result.durationMs}ms, `
            + `${result.entry.recordCount} records`,
        resourceType: 'setting',
        resourceId: 'backup'
    });

    return result;
}

function startBackupScheduler() {
    if (process.env.DISABLE_BACKUP_CRON === 'true') return null;
    if (process.env.NODE_ENV === 'test') return null;
    if (cronTask) return cronTask;

    if (!cron.validate(DEFAULT_CRON)) {
        console.warn('[BackupScheduler] Invalid BACKUP_CRON_SCHEDULE — scheduler not started.');
        return null;
    }

    cronTask = cron.schedule(
        DEFAULT_CRON,
        scheduleCronHandler('encrypted-backup-daily', runScheduledEncryptedBackup, {
            requirePostgres: false
        })
    );

    console.log(`[BackupScheduler] Daily encrypted backup scheduled (${DEFAULT_CRON})`);
    return cronTask;
}

module.exports = {
    startBackupScheduler,
    runScheduledEncryptedBackup,
    DEFAULT_CRON
};
