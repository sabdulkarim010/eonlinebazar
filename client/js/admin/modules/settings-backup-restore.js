/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/settings-backup-restore.js
 * Description: Sanitized settings JSON export/import (Utilities tab).
 */
import '../admin-core.js';
import { settingsFetchJson, isSettingsFetchFailure } from './settings-utils.js';

function authHeaders() {
    return {
        Authorization: `Bearer ${window.token || localStorage.getItem('adminToken') || ''}`
    };
}

function parseFilenameFromDisposition(header) {
    if (!header) return null;
    const match = /filename="?([^";\n]+)"?/i.exec(header);
    return match?.[1] || null;
}

function summarizeBackup(backup) {
    const settingsKeys = backup?.settings && typeof backup.settings === 'object'
        ? Object.keys(backup.settings).length
        : 0;
    const labelCount = backup?.sidebarLabels && typeof backup.sidebarLabels === 'object'
        ? Object.keys(backup.sidebarLabels).length
        : 0;
    const categoryCount = Array.isArray(backup?.categories) ? backup.categories.length : 0;
    const exportedAt = backup?.exportedAt
        ? new Date(backup.exportedAt).toLocaleString('en-GB')
        : 'Unknown date';
    return { settingsKeys, labelCount, categoryCount, exportedAt, version: backup?.version };
}

async function exportSettingsBackup() {
    const btn = document.getElementById('settingsExportBackupBtn');
    const restore = typeof setButtonLoading === 'function'
        ? setButtonLoading(btn, 'Exporting…')
        : () => {};

    try {
        const res = await fetch('/api/admin/settings-export', {
            method: 'GET',
            headers: authHeaders()
        });

        if (!res.ok) {
            let message = 'Export failed.';
            try {
                const err = await res.json();
                message = err.message || message;
            } catch {
                /* ignore */
            }
            throw new Error(message);
        }

        const blob = await res.blob();
        const dateStr = new Date().toISOString().slice(0, 10);
        const filename = parseFilenameFromDisposition(res.headers.get('Content-Disposition'))
            || `settings-backup-${dateStr}.json`;

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        if (typeof window.settingsHubToast === 'function') {
            window.settingsHubToast('Settings backup downloaded.', 'success');
        } else if (typeof showToast === 'function') {
            showToast('Settings backup downloaded.', 'success');
        }
    } catch (err) {
        console.error('Settings export error:', err);
        if (typeof Swal !== 'undefined') {
            Swal.fire({ icon: 'error', title: 'Export failed', text: err.message || 'Could not export settings.' });
        } else if (typeof showToast === 'function') {
            showToast(err.message || 'Export failed.', 'error');
        }
    } finally {
        restore();
    }
}

async function confirmAndImportSettingsBackup(file) {
    if (!file) return;

    let backup;
    try {
        backup = JSON.parse(await file.text());
    } catch {
        if (typeof Swal !== 'undefined') {
            Swal.fire({ icon: 'error', title: 'Invalid file', text: 'The selected file is not valid JSON.' });
        }
        return;
    }

    const summary = summarizeBackup(backup);

    if (typeof Swal !== 'undefined') {
        const result = await Swal.fire({
            title: 'Import settings backup?',
            html: `
                <p style="text-align:left;margin:0 0 12px;">This will overwrite current platform settings with the backup values. Secrets (API keys, passwords) are never imported.</p>
                <ul style="text-align:left;font-size:14px;line-height:1.6;">
                    <li><strong>Exported:</strong> ${summary.exportedAt}</li>
                    <li><strong>Version:</strong> ${summary.version ?? '—'}</li>
                    <li><strong>Settings fields:</strong> ${summary.settingsKeys}</li>
                    <li><strong>Sidebar labels:</strong> ${summary.labelCount}</li>
                    <li><strong>Categories:</strong> ${summary.categoryCount}</li>
                </ul>
            `,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, import backup',
            cancelButtonText: 'Cancel',
            confirmButtonColor: '#ef4444',
            reverseButtons: true
        });
        if (!result.isConfirmed) return;
    } else if (!window.confirm('Import settings backup? This will overwrite current settings.')) {
        return;
    }

    const btn = document.getElementById('settingsImportBackupBtn');
    const restore = typeof setButtonLoading === 'function'
        ? setButtonLoading(btn, 'Importing…')
        : () => {};

    try {
        const fetchResponse = await settingsFetchJson('/api/admin/settings-import', {
            method: 'POST',
            headers: {
                ...authHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ backup, confirm: true })
        }, { showToast: true });

        if (isSettingsFetchFailure(fetchResponse)) {
            return;
        }

        const payload = fetchResponse.data;
        if (!payload?.success) {
            throw new Error(payload?.message || 'Import failed.');
        }

        const data = payload.data || {};
        const message = [
            `${data.settingsFields || 0} settings field(s)`,
            `${data.sidebarLabelsSaved || 0} sidebar label(s)`,
            `${data.categoriesUpdated || 0} categor(ies) updated`
        ].join(' · ');

        if (typeof Swal !== 'undefined') {
            Swal.fire({ icon: 'success', title: 'Backup imported', text: message, timer: 3200, showConfirmButton: false });
        } else if (typeof showToast === 'function') {
            showToast('Settings backup imported.', 'success');
        }

        if (typeof window.fetchAdminSettings === 'function') window.fetchAdminSettings();
        if (typeof window.fetchMasterSettings === 'function') window.fetchMasterSettings();
        if (typeof window.loadNotificationSettings === 'function') window.loadNotificationSettings();
        if (typeof window.loadSettingsHistory === 'function') window.loadSettingsHistory();
    } catch (err) {
        console.error('Settings import error:', err);
        if (typeof Swal !== 'undefined') {
            Swal.fire({ icon: 'error', title: 'Import failed', text: err.message || 'Could not import settings.' });
        }
    } finally {
        restore();
        const input = document.getElementById('settingsImportBackupInput');
        if (input) input.value = '';
    }
}

function bindSettingsBackupRestoreControls() {
    const exportBtn = document.getElementById('settingsExportBackupBtn');
    if (exportBtn && !exportBtn.dataset.bound) {
        exportBtn.dataset.bound = '1';
        exportBtn.addEventListener('click', () => exportSettingsBackup());
    }

    const importBtn = document.getElementById('settingsImportBackupBtn');
    const importInput = document.getElementById('settingsImportBackupInput');
    if (importBtn && importInput && !importBtn.dataset.bound) {
        importBtn.dataset.bound = '1';
        importBtn.addEventListener('click', () => importInput.click());
        importInput.addEventListener('change', () => {
            const file = importInput.files?.[0];
            if (file) confirmAndImportSettingsBackup(file);
        });
    }
}

bindSettingsBackupRestoreControls();

window.exportSettingsBackup = exportSettingsBackup;
window.confirmAndImportSettingsBackup = confirmAndImportSettingsBackup;
