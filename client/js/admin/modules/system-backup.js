/**
 * Project: EonlineBazar (E-Commerce Platform)
 * File: js/admin/modules/system-backup.js
 * Description: Super-admin database backup download UI.
 */
import '../admin-core.js';

function formatBackupTimestamp(value) {
    if (!value) return 'never';
    try {
        return new Date(value).toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return String(value);
    }
}

function updateBackupLastRunText(lastBackupAt) {
    const el = document.getElementById('backupLastRunText');
    if (!el) return;
    el.textContent = `Last backup: ${formatBackupTimestamp(lastBackupAt)}`;
}

async function fetchBackupStatus() {
    if (!token) return;

    try {
        const res = await fetch('/api/admin/system/backup-status', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success && data.data) {
            updateBackupLastRunText(data.data.lastBackupAt);
        }
    } catch (err) {
        console.warn('[Backup] Status fetch failed:', err.message);
    }
}

async function downloadFullBackup() {
    if (!token) {
        showToast('Please log in as Super Admin.', 'warning');
        return;
    }

    const btn = document.getElementById('downloadFullBackupBtn');
    const restore = typeof setButtonLoading === 'function'
        ? setButtonLoading(btn, 'Preparing backup...')
        : () => {};

    try {
        const res = await fetch('/api/admin/system/backup-now', {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) {
            let message = 'Backup download failed.';
            try {
                const errBody = await res.json();
                message = errBody.message || message;
            } catch {
                // stream response may not be JSON
            }
            throw new Error(message);
        }

        const blob = await res.blob();
        const disposition = res.headers.get('Content-Disposition') || '';
        const match = disposition.match(/filename="?([^";]+)"?/i);
        const dateStr = new Date().toISOString().slice(0, 10);
        const filename = match?.[1] || `eonlinebazar-backup-${dateStr}.json`;

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        updateBackupLastRunText(new Date().toISOString());
        if (typeof settingsHubToast === 'function') {
            settingsHubToast('Backup downloaded successfully.', 'success');
        } else {
            showToast('Backup downloaded successfully.', 'success');
        }
    } catch (err) {
        console.error('[Backup] Download error:', err);
        if (typeof Swal !== 'undefined') {
            Swal.fire({ icon: 'error', title: 'Backup failed', text: err.message || 'Could not download backup.' });
        } else {
            showToast(err.message || 'Backup download failed.', 'error');
        }
    } finally {
        restore();
        fetchBackupStatus();
    }
}

function loadSystemBackupSection() {
    fetchBackupStatus();
}

window.downloadFullBackup = downloadFullBackup;
window.loadSystemBackupSection = loadSystemBackupSection;
window.fetchBackupStatus = fetchBackupStatus;

Object.assign(window, {
    downloadFullBackup,
    loadSystemBackupSection,
    fetchBackupStatus
});
