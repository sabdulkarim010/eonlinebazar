/**
 * Project: EonlineBazar — CRM Abandoned Cart Recovery
 * File: js/admin/modules/crm-abandoned-carts.js
 */
import '../admin-core.js';

let abandonedCartFilter = 'all';
let abandonedCartsCache = [];

function formatBdt(value) {
    const n = Number(value) || 0;
    return `৳${n.toLocaleString('en-US')}`;
}

function escapeCell(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function formatRelativeTime(dateInput) {
    if (!dateInput) return '—';
    const date = new Date(dateInput);
    const diffMs = Date.now() - date.getTime();
    if (!Number.isFinite(diffMs) || diffMs < 0) return 'just now';
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function renderRecoveryStageBadge(cart = {}) {
    const stage = Number(cart.recoveryStage) || 0;
    const label = cart.recoveryStageLabel || (stage >= 3
        ? 'Stage 3 — Expiry Notice'
        : stage === 2
            ? 'Stage 2 — Email + 5% Coupon'
            : stage === 1
                ? 'Stage 1 — SMS/WhatsApp'
                : 'Not started');
    const cls = stage >= 3 ? 'recovery-stage--3' : stage === 2 ? 'recovery-stage--2' : stage === 1 ? 'recovery-stage--1' : 'recovery-stage--0';
    const coupon = cart.recoveryCouponCode
        ? `<br><small>Coupon: ${escapeCell(cart.recoveryCouponCode)}</small>`
        : '';
    return `<span class="recovery-stage-badge ${cls}">${escapeCell(label)}</span>${coupon}`;
}

function renderAbandonedCartStats(data = {}) {
    const countEl = document.getElementById('abandonedCartCount');
    const valueEl = document.getElementById('abandonedCartValue');
    const rateEl = document.getElementById('abandonedCartRecoveryRate');
    const notifiedEl = document.getElementById('abandonedCartNotified');
    const recoveredEl = document.getElementById('abandonedCartRecovered');

    if (countEl) countEl.textContent = Number(data.count || 0).toLocaleString('en-US');
    if (valueEl) valueEl.textContent = formatBdt(data.value);
    if (rateEl) rateEl.textContent = `${Number(data.recoveryRate || 0)}%`;
    if (notifiedEl) notifiedEl.textContent = Number(data.notified || 0).toLocaleString('en-US');
    if (recoveredEl) recoveredEl.textContent = Number(data.recovered || 0).toLocaleString('en-US');
}

function renderCartsTable(carts = []) {
    const tbody = document.getElementById('abandonedCartsTableBody');
    if (!tbody) return;

    if (!carts.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="table-status-empty">No abandoned carts match this filter.</td></tr>';
        return;
    }

    tbody.innerHTML = carts.map((cart, index) => {
        const userId = cart.userId;
        const phoneLine = cart.phone ? `<br><small>${escapeCell(cart.phone)}</small>` : '';
        const notifiedBadge = cart.notified
            ? '<span class="status-badge status-verified">Yes</span>'
            : '<span class="status-badge status-pending">No</span>';
        const restoreUrl = String(cart.restoreUrl || '').trim();
        const restoreBtn = restoreUrl
            ? `<button type="button" class="btn-secondary" style="font-size:11px;padding:4px 8px;"
                    data-restore-index="${index}" onclick="copyAbandonedCartRestoreLink(Number(this.dataset.restoreIndex))" title="Copy 1-click restore link">
                    <i class="fa-solid fa-link"></i> Copy Restore Link
               </button>`
            : '';

        return `
            <tr>
                <td><strong>${escapeCell(cart.customerName)}</strong>${phoneLine}</td>
                <td>${cart.itemCount} item(s)<br><strong>${formatBdt(cart.value)}</strong></td>
                <td>${formatRelativeTime(cart.lastActivityAt)}</td>
                <td>${renderRecoveryStageBadge(cart)}</td>
                <td>${notifiedBadge}</td>
                <td>
                    <div class="catalog-actions" style="flex-wrap:wrap;gap:4px;">
                        ${restoreBtn}
                        <button type="button" class="btn-secondary" style="font-size:11px;padding:4px 8px;"
                                onclick="sendRecoveryNotification('${userId}', 'email')" title="Send Recovery Email">
                            <i class="fa-solid fa-envelope"></i> Email
                        </button>
                        <button type="button" class="btn-secondary" style="font-size:11px;padding:4px 8px;"
                                onclick="sendRecoveryNotification('${userId}', 'sms')" title="Send Recovery SMS">
                            <i class="fa-solid fa-comment-sms"></i> SMS
                        </button>
                    </div>
                </td>
            </tr>`;
    }).join('');
}

window.copyAbandonedCartRestoreLink = function copyAbandonedCartRestoreLink(indexOrUrl) {
    const fromCache = Number.isFinite(Number(indexOrUrl))
        ? String(abandonedCartsCache[Number(indexOrUrl)]?.restoreUrl || '').trim()
        : '';
    const value = fromCache || String(indexOrUrl || '').trim();
    if (!value) return showToast('Restore link unavailable.', 'warning');
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(value).then(
            () => showToast('Restore link copied to clipboard.', 'success'),
            () => showToast('Could not copy link.', 'error')
        );
        return;
    }
    showToast(value, 'info');
};

async function loadAbandonedCarts(filter = abandonedCartFilter) {
    abandonedCartFilter = filter || 'all';
    const tbody = document.getElementById('abandonedCartsTableBody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-container"><div class="spinner"></div><p>Loading abandoned carts…</p></td></tr>';
    }

    try {
        const qs = new URLSearchParams({ filter: abandonedCartFilter });
        const res = await fetch(`/api/admin/crm/abandoned-carts?${qs}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const result = await res.json();

        if (!result.success) {
            throw new Error(result.message || 'Failed to load abandoned carts');
        }

        const data = result.data || {};
        renderAbandonedCartStats(data);
        abandonedCartsCache = Array.isArray(data.carts) ? data.carts : [];
        renderCartsTable(abandonedCartsCache);
    } catch (err) {
        console.error('loadAbandonedCarts:', err);
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="6" class="table-status-error">Failed to load abandoned carts.</td></tr>';
        }
        showToast('Failed to load abandoned carts.', 'error');
    }
}

async function loadAbandonedCartStats() {
    return loadAbandonedCarts(abandonedCartFilter);
}

function setAbandonedCartFilter(filter) {
    document.querySelectorAll('#abandonedCartFilterTabs .segment-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.filter === filter);
    });
    loadAbandonedCarts(filter);
}

async function sendRecoveryNotification(userId, channel) {
    const label = channel === 'sms' ? 'SMS' : 'email';
    showCustomConfirm(
        `Send Recovery ${label}`,
        `Send a cart recovery ${label.toLowerCase()} to this customer?`,
        async () => {
            try {
                const res = await fetch(`/api/admin/crm/abandoned-carts/${userId}/notify`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({ channel })
                });
                const result = await res.json();

                if (result.success) {
                    showAdminSuccess('Notification Sent', result.message || 'Recovery notification sent.');
                    await loadAbandonedCarts(abandonedCartFilter);
                } else {
                    showToast(result.message || 'Failed to send notification.', 'error');
                }
            } catch (err) {
                console.error('sendRecoveryNotification:', err);
                showToast('Failed to send recovery notification.', 'error');
            }
        }
    );
}

document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('abandonedCartRefreshBtn');
    if (refreshBtn && !refreshBtn.dataset.bound) {
        refreshBtn.dataset.bound = '1';
        refreshBtn.addEventListener('click', () => loadAbandonedCarts(abandonedCartFilter));
    }
});

window.loadAbandonedCarts = loadAbandonedCarts;
window.loadAbandonedCartStats = loadAbandonedCartStats;
window.renderCartsTable = renderCartsTable;
window.sendRecoveryNotification = sendRecoveryNotification;
window.setAbandonedCartFilter = setAbandonedCartFilter;
