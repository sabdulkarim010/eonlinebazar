/**
 * Super-admin disaster recovery — encrypted backups, validate, restore
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

function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function truncateHash(hash) {
    const h = String(hash || '');
    if (h.length <= 16) return h;
    return `${h.slice(0, 8)}…${h.slice(-8)}`;
}

function updateBackupLastRunText(lastBackupAt, lastPostgresBackupAt) {
    const el = document.getElementById('backupLastRunText');
    if (!el) return;
    const mongoLine = `MongoDB / DR backup: ${formatBackupTimestamp(lastBackupAt)}`;
    const pgLine = `PostgreSQL ZIP: ${formatBackupTimestamp(lastPostgresBackupAt)}`;
    el.textContent = `${mongoLine} · ${pgLine}`;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

async function fetchBackupStatus() {
    if (!token) return [];

    try {
        const res = await fetch('/api/admin/system/backup-status', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success && data.data) {
            updateBackupLastRunText(data.data.lastBackupAt, data.data.lastPostgresBackupAt);
            return data.data.encryptedBackups || [];
        }
    } catch (err) {
        console.warn('[Backup] Status fetch failed:', err.message);
    }
    return [];
}

function renderEncryptedBackupsTable(entries = []) {
    const body = document.getElementById('encryptedBackupsBody');
    if (!body) return;

    if (!entries.length) {
        body.innerHTML = '<tr><td colspan="6" class="loading-cell">No encrypted backups yet. Generate one above.</td></tr>';
        return;
    }

    body.innerHTML = entries.map((row) => `
        <tr data-backup-id="${escapeHtml(row.id)}">
            <td>${escapeHtml(formatBackupTimestamp(row.createdAt))}</td>
            <td>${escapeHtml(formatBytes(row.sizeBytes))}</td>
            <td>${escapeHtml(row.encryptionStandard || 'AES-256-GCM')}</td>
            <td><code title="${escapeHtml(row.checksumSha256)}">${escapeHtml(truncateHash(row.checksumSha256))}</code></td>
            <td>${Number(row.recordCount) || 0}</td>
            <td class="backup-actions-cell">
                <button type="button" class="btn-secondary btn-sm backup-download-btn" data-id="${escapeHtml(row.id)}">Download</button>
                <button type="button" class="btn-secondary btn-sm backup-validate-btn" data-id="${escapeHtml(row.id)}">Validate</button>
                <button type="button" class="btn-secondary btn-sm backup-restore-btn" data-id="${escapeHtml(row.id)}">Restore</button>
                <button type="button" class="btn-danger-soft btn-sm backup-delete-btn" data-id="${escapeHtml(row.id)}">Delete</button>
            </td>
        </tr>
    `).join('');
}

async function refreshBackupArchiveUI() {
    const entries = await fetchBackupStatus();
    renderEncryptedBackupsTable(entries);
}

async function generateEncryptedBackupInstant() {
    if (!token) {
        showToast('Please log in as Super Admin.', 'warning');
        return;
    }

    const btn = document.getElementById('generateEncryptedBackupBtn');
    const restore = typeof setButtonLoading === 'function'
        ? setButtonLoading(btn, 'Encrypting…')
        : () => {};

    try {
        const res = await fetch('/api/admin/system/backup/generate', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.message || 'Backup generation failed.');
        }
        showToast('Encrypted backup created.', 'success');
        await refreshBackupArchiveUI();
    } catch (err) {
        console.error('[Backup] Generate error:', err);
        showToast(err.message || 'Could not create backup.', 'error');
    } finally {
        restore();
    }
}

async function downloadEncryptedBackupById(id) {
    const res = await fetch(`/api/admin/system/backups/${encodeURIComponent(id)}/download`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Download failed.');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${id}.eobk`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

async function validateBackupById(id) {
    const res = await fetch('/api/admin/system/backup/validate', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ backupId: id })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
        throw new Error(data.message || 'Validation failed.');
    }
    return data.data;
}

async function promptSuperAdminPassword(title) {
    if (typeof Swal !== 'undefined') {
        const result = await Swal.fire({
            title,
            input: 'password',
            inputLabel: 'Super Admin password',
            inputPlaceholder: 'Enter your password',
            showCancelButton: true,
            confirmButtonText: 'Continue',
            confirmButtonColor: '#dc2626'
        });
        if (!result.isConfirmed) return null;
        return result.value || '';
    }
    return window.prompt(`${title}\n\nEnter Super Admin password:`);
}

async function restoreBackupById(id) {
    const confirmed = typeof Swal !== 'undefined'
        ? (await Swal.fire({
            title: 'Restore database from backup?',
            text: 'This will overwrite matching MongoDB documents. This action is irreversible.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Continue to password step',
            confirmButtonColor: '#dc2626'
        })).isConfirmed
        : window.confirm('Restore database from backup?');

    if (!confirmed) return;

    const password = await promptSuperAdminPassword('Confirm restore');
    if (!password) return;

    const res = await fetch('/api/admin/system/backup/restore', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ backupId: id, currentPassword: password })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
        throw new Error(data.message || 'Restore failed.');
    }
    showToast('Backup restored successfully.', 'success');
}

async function deleteBackupById(id) {
    const ok = typeof Swal !== 'undefined'
        ? (await Swal.fire({
            title: 'Delete backup archive?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Delete'
        })).isConfirmed
        : window.confirm('Delete this backup?');
    if (!ok) return;

    const res = await fetch(`/api/admin/system/backups/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
        throw new Error(data.message || 'Delete failed.');
    }
    showToast('Backup deleted.', 'info');
    await refreshBackupArchiveUI();
}

function bindEncryptedBackupTableActions() {
    const body = document.getElementById('encryptedBackupsBody');
    if (!body || body.dataset.bound) return;
    body.dataset.bound = '1';

    body.addEventListener('click', async (event) => {
        const btn = event.target.closest('button');
        if (!btn) return;
        const id = btn.getAttribute('data-id');
        if (!id) return;

        try {
            if (btn.classList.contains('backup-download-btn')) {
                await downloadEncryptedBackupById(id);
            } else if (btn.classList.contains('backup-validate-btn')) {
                const summary = await validateBackupById(id);
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'success',
                        title: 'Backup valid',
                        html: `<p>Records: <strong>${summary.recordCount}</strong></p>`
                            + `<p>Collections: ${summary.collections?.length || 0}</p>`
                            + `<p>Checksum matched: ${summary.checksumMatched ? 'Yes' : 'No'}</p>`
                    });
                } else {
                    showToast(`Valid — ${summary.recordCount} records`, 'success');
                }
            } else if (btn.classList.contains('backup-restore-btn')) {
                await restoreBackupById(id);
            } else if (btn.classList.contains('backup-delete-btn')) {
                await deleteBackupById(id);
            }
        } catch (err) {
            showToast(err.message || 'Action failed.', 'error');
        }
    });
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
                // ignore
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

        showToast('Backup downloaded successfully.', 'success');
    } catch (err) {
        console.error('[Backup] Download error:', err);
        showToast(err.message || 'Backup download failed.', 'error');
    } finally {
        restore();
        fetchBackupStatus();
    }
}

async function downloadPostgresBackup() {
    if (!token) {
        showToast('Please log in as Super Admin.', 'warning');
        return;
    }

    const btn = document.getElementById('downloadPostgresBackupBtn');
    const restore = typeof setButtonLoading === 'function'
        ? setButtonLoading(btn, 'Exporting PostgreSQL...')
        : () => {};

    try {
        const res = await fetch('/api/admin/system/backup-postgres', {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) {
            let message = 'PostgreSQL backup download failed.';
            try {
                const errBody = await res.json();
                message = errBody.message || message;
            } catch {
                // ignore
            }
            throw new Error(message);
        }

        const blob = await res.blob();
        const disposition = res.headers.get('Content-Disposition') || '';
        const match = disposition.match(/filename="?([^";]+)"?/i);
        const dateStr = new Date().toISOString().slice(0, 10);
        const filename = match?.[1] || `pg-backup-${dateStr}.zip`;

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        showToast('PostgreSQL backup downloaded.', 'success');
    } catch (err) {
        showToast(err.message || 'PostgreSQL backup failed.', 'error');
    } finally {
        restore();
        fetchBackupStatus();
    }
}

function loadSystemBackupSection() {
    bindEncryptedBackupTableActions();
    const genBtn = document.getElementById('generateEncryptedBackupBtn');
    if (genBtn && !genBtn.dataset.bound) {
        genBtn.dataset.bound = '1';
        genBtn.addEventListener('click', () => generateEncryptedBackupInstant());
    }
    refreshBackupArchiveUI();
}

window.downloadFullBackup = downloadFullBackup;
window.downloadPostgresBackup = downloadPostgresBackup;
window.loadSystemBackupSection = loadSystemBackupSection;
window.fetchBackupStatus = fetchBackupStatus;
window.generateEncryptedBackupInstant = generateEncryptedBackupInstant;

Object.assign(window, {
    downloadFullBackup,
    downloadPostgresBackup,
    loadSystemBackupSection,
    fetchBackupStatus,
    generateEncryptedBackupInstant
});

export {
    downloadFullBackup,
    downloadPostgresBackup,
    loadSystemBackupSection,
    fetchBackupStatus,
    generateEncryptedBackupInstant
};
