/**
 * Admin return requests queue — list, approve, reject.
 */
import '../admin-core.js';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

async function loadReturnRequests(status = 'pending') {
    const host = document.getElementById('returnRequestsList');
    if (!host) return;

    host.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Loading return requests…</p></div>';

    try {
        const params = new URLSearchParams({ status });
        const res = await fetch(`/api/admin/orders/return-requests?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
            throw new Error(data.message || 'Failed to load return requests.');
        }

        const rows = data.data || [];
        const badge = document.getElementById('returnRequestsTabCount');
        if (badge) badge.textContent = String(rows.length);

        if (!rows.length) {
            host.innerHTML = '<p class="table-status-empty">📦 No return requests in this queue.</p>';
            return;
        }

        host.innerHTML = rows.map((order) => {
            const req = order.returnRequest || {};
            const items = (req.items?.length ? req.items : order.returnItems) || [];
            const itemsHtml = items.map((item) =>
                `<li>${escapeHtml(item.productName || item.name || 'Item')} × ${item.quantity || 1}</li>`
            ).join('');

            return `
                <article class="return-request-card" data-order-id="${order._id}">
                    <header>
                        <strong>#${escapeHtml(order.orderId || order._id)}</strong>
                        <span>${escapeHtml(order.customerName || 'Customer')} · ${escapeHtml(order.customerPhone || '')}</span>
                    </header>
                    <p><strong>Reason:</strong> ${escapeHtml(req.reason || '—')}</p>
                    <ul>${itemsHtml || '<li>Full order return</li>'}</ul>
                    <div class="return-request-actions">
                        <button type="button" class="btn-secondary" onclick="rejectReturnRequest('${order._id}')">Reject</button>
                        <button type="button" class="btn-primary" onclick="approveReturnRequest('${order._id}')">Approve Refund</button>
                    </div>
                </article>`;
        }).join('');
    } catch (err) {
        console.error('loadReturnRequests:', err);
        host.innerHTML = '<p class="table-status-error">Failed to load return requests.</p>';
        showToast(err.message || 'Failed to load return requests.', 'error');
    }
}

async function approveReturnRequest(orderId) {
    showCustomConfirm('Approve Return', 'Credit refund to customer wallet?', async () => {
        try {
            const res = await fetch(`/api/admin/orders/${orderId}/return-request`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: 'approved', refundMethod: 'wallet' })
            });
            const data = await res.json();
            if (data.success) {
                showAdminSuccess('Return Approved', data.message || 'Refund processed.');
                await loadReturnRequests('pending');
                if (typeof fetchLiveOrders === 'function') fetchLiveOrders();
            } else {
                showToast(data.message || 'Approval failed.', 'error');
            }
        } catch (err) {
            showToast('Server error while approving return.', 'error');
        }
    });
}

async function rejectReturnRequest(orderId) {
    const note = window.prompt('Rejection note (optional):', '') || 'Return request rejected';
    try {
        const res = await fetch(`/api/admin/orders/${orderId}/return-request`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: 'rejected', note })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Return rejected.', 'success');
            await loadReturnRequests('pending');
        } else {
            showToast(data.message || 'Rejection failed.', 'error');
        }
    } catch (err) {
        showToast('Server error while rejecting return.', 'error');
    }
}

function setReturnRequestsTab(status) {
    document.querySelectorAll('.return-requests-tab').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.status === status);
    });
    loadReturnRequests(status);
}

function setOrderReturnRequestsView(show) {
    const main = document.getElementById('ordersMainPanel');
    const panel = document.getElementById('returnRequestsPanel');
    if (main) main.hidden = show === true;
    if (panel) panel.hidden = show !== true;

    document.querySelectorAll('#view-orders .order-tab').forEach((tab) => {
        if (tab.dataset.status === 'return-requests') {
            tab.classList.toggle('active', show === true);
        } else if (show === true) {
            tab.classList.remove('active');
        }
    });

    if (show === true) {
        loadReturnRequests('pending');
    } else if (typeof window.restoreOrdersListTab === 'function') {
        window.restoreOrdersListTab('all');
    }
}

window.loadReturnRequests = loadReturnRequests;
window.approveReturnRequest = approveReturnRequest;
window.rejectReturnRequest = rejectReturnRequest;
window.setReturnRequestsTab = setReturnRequestsTab;
window.setOrderReturnRequestsView = setOrderReturnRequestsView;
