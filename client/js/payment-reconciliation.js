/********************************************************************
 * Payment Reconciliation — admin page logic
 ********************************************************************/

(function () {
    'use strict';

    const API_BASE = '/api/admin/payments/reconciliation';
    const CURRENCY = '৳';
    const TOKEN_KEY = 'adminToken';

    let currentPage = 1;
    let totalPages = 1;
    let currentOrders = [];
    let activeProofOrderId = null;
    let activeMarkPaidOrderId = null;

    const $ = (id) => document.getElementById(id);

    function getToken() {
        return localStorage.getItem(TOKEN_KEY) || '';
    }

    function authHeaders() {
        return {
            Authorization: `Bearer ${getToken()}`,
            'Content-Type': 'application/json'
        };
    }

    function formatMoney(amount) {
        const n = Number(amount) || 0;
        return CURRENCY + n.toLocaleString('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        });
    }

    function formatDate(value) {
        if (!value) return '—';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function showToast(message, type) {
        const toast = $('toast');
        if (!toast) return;
        toast.textContent = message;
        toast.className = 'pr-toast' + (type ? ` pr-toast--${type}` : '');
        toast.hidden = false;
        clearTimeout(showToast._timer);
        showToast._timer = setTimeout(() => { toast.hidden = true; }, 3500);
    }

    function setLoading(isLoading) {
        const overlay = $('loadingOverlay');
        if (overlay) {
            overlay.hidden = !isLoading;
            overlay.setAttribute('aria-busy', isLoading ? 'true' : 'false');
        }
    }

    function showError(message) {
        const banner = $('errorBanner');
        const text = $('errorBannerText');
        if (banner && text) {
            text.textContent = message;
            banner.hidden = false;
        }
    }

    function hideError() {
        const banner = $('errorBanner');
        if (banner) banner.hidden = true;
    }

    function getFilterParams() {
        const params = new URLSearchParams();
        const type = $('filterType')?.value || 'all';
        const status = $('filterStatus')?.value || '';
        const gateway = $('filterGateway')?.value || '';
        const startDate = $('filterStartDate')?.value || '';
        const endDate = $('filterEndDate')?.value || '';

        if (type && type !== 'all') params.set('type', type);
        if (status) params.set('paymentStatus', status);
        if (gateway) params.set('gateway', gateway);
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
        params.set('page', String(currentPage));
        params.set('limit', '20');

        return params;
    }

    function typeBadge(type) {
        const labels = { gateway: 'Gateway', manual: 'Manual', cod: 'COD' };
        const cls = `pr-badge pr-badge--${type}`;
        return `<span class="${cls}">${labels[type] || type}</span>`;
    }

    function statusBadge(status) {
        const s = String(status || 'unpaid').toLowerCase();
        if (s === 'paid') return '<span class="pr-badge pr-badge--paid">Paid ✓</span>';
        if (s === 'pending') return '<span class="pr-badge pr-badge--pending">Pending ⏳</span>';
        return '<span class="pr-badge pr-badge--unpaid">Unpaid ✗</span>';
    }

    function proofBadge(status) {
        if (status == null) return '—';
        const s = String(status || 'none').toLowerCase();
        const labels = {
            none: 'None',
            submitted: 'Submitted',
            approved: 'Approved',
            rejected: 'Rejected'
        };
        return `<span class="pr-badge pr-badge--proof-${s}">${labels[s] || s}</span>`;
    }

    function renderActions(order) {
        const parts = [];
        if (order.paymentType === 'gateway' && order.paymentStatus !== 'paid') {
            parts.push(
                `<button type="button" class="pr-action-btn pr-action-btn--primary" data-action="mark-paid" data-id="${order._id}">Mark as Paid</button>`
            );
        }
        if (order.paymentType === 'manual' && order.proofStatus === 'submitted') {
            parts.push(
                `<button type="button" class="pr-action-btn pr-action-btn--warning" data-action="review-proof" data-id="${order._id}">Review Proof</button>`
            );
        }
        return parts.length ? parts.join('') : '—';
    }

    function renderTable(orders) {
        const tbody = $('ordersTableBody');
        if (!tbody) return;

        if (!orders.length) {
            tbody.innerHTML = '<tr><td colspan="10" class="pr-empty-row">No orders match the current filters.</td></tr>';
            return;
        }

        tbody.innerHTML = orders.map((order) => {
            const orderLink = `/order-details?id=${encodeURIComponent(order._id)}`;
            const ipnCell = order.paymentType === 'gateway'
                ? (order.ipnReceived ? 'Yes' : 'No')
                : '—';

            return `<tr data-order-id="${order._id}">
                <td><a class="pr-order-link" href="${orderLink}" target="_blank" rel="noopener">${order.orderId || order._id}</a></td>
                <td class="pr-customer-cell">${escapeHtml(order.customerName || '—')}<small>${escapeHtml(order.customerPhone || '')}</small></td>
                <td>${formatMoney(order.grandTotal)}</td>
                <td>${escapeHtml(order.paymentMethod || '—')}</td>
                <td>${typeBadge(order.paymentType)}</td>
                <td>${statusBadge(order.paymentStatus)}</td>
                <td>${ipnCell}</td>
                <td>${proofBadge(order.proofStatus)}</td>
                <td>${formatDate(order.createdAt)}</td>
                <td>${renderActions(order)}</td>
            </tr>`;
        }).join('');
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function updateSummary(summary) {
        if (!summary) return;
        $('kpiTotalOrders').textContent = summary.totalOrders ?? 0;
        $('kpiTotalRevenue').textContent = formatMoney(summary.totalRevenue);
        $('kpiGatewayPaid').textContent = summary.gatewayPaidCount ?? 0;
        $('kpiGatewayUnpaid').textContent = summary.gatewayUnpaidCount ?? 0;
        $('kpiPendingProof').textContent = summary.pendingProofCount ?? 0;
        $('kpiCodCount').textContent = summary.codCount ?? 0;
    }

    function updatePagination(pagination) {
        currentPage = pagination?.page || 1;
        totalPages = pagination?.totalPages || 1;
        $('paginationInfo').textContent = `Page ${currentPage} of ${totalPages || 1}`;
        $('prevPageBtn').disabled = currentPage <= 1;
        $('nextPageBtn').disabled = currentPage >= totalPages;
    }

    async function loadData() {
        const token = getToken();
        if (!token) {
            window.location.href = '/admin-login?redirect=' + encodeURIComponent(window.location.pathname);
            return;
        }

        setLoading(true);
        hideError();

        try {
            const params = getFilterParams();
            const response = await fetch(`${API_BASE}?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const result = await response.json();

            if (response.status === 401 || response.status === 403) {
                window.location.href = '/admin-login?redirect=' + encodeURIComponent(window.location.pathname);
                return;
            }

            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Failed to load reconciliation data.');
            }

            currentOrders = result.orders || [];
            updateSummary(result.summary);
            renderTable(currentOrders);
            updatePagination(result.pagination);
        } catch (err) {
            showError(err.message || 'Failed to load data.');
            showToast(err.message || 'Failed to load data.', 'error');
        } finally {
            setLoading(false);
        }
    }

    async function fetchAllForExport() {
        const token = getToken();
        const params = getFilterParams();
        params.set('page', '1');
        params.set('limit', '500');

        const allOrders = [];
        let page = 1;
        let totalPagesExport = 1;

        do {
            params.set('page', String(page));
            const response = await fetch(`${API_BASE}?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Export failed.');
            }
            allOrders.push(...(result.orders || []));
            totalPagesExport = result.pagination?.totalPages || 1;
            page += 1;
        } while (page <= totalPagesExport && page <= 20);

        return allOrders;
    }

    function exportCsv(orders) {
        const headers = ['Order ID', 'Customer', 'Total', 'Payment Method', 'Status', 'Date'];
        const rows = orders.map((o) => [
            o.orderId || o._id,
            `${o.customerName || ''} (${o.customerPhone || ''})`.trim(),
            o.grandTotal,
            o.paymentMethod || '',
            o.paymentStatus || '',
            o.createdAt ? new Date(o.createdAt).toISOString() : ''
        ]);

        const csvContent = [headers, ...rows]
            .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            .join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `payment-reconciliation-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }

    function openProofModal(orderId) {
        const order = currentOrders.find((o) => String(o._id) === String(orderId));
        if (!order || !order.paymentProof) return;

        activeProofOrderId = orderId;
        $('proofModalOrderId').textContent = order.orderId || orderId;
        $('proofModalTrxId').textContent = order.paymentProof.trxId || '—';
        $('proofModalSubmittedAt').textContent = formatDate(order.paymentProof.submittedAt);
        $('proofModalAdminNote').value = '';

        const wrap = $('proofModalScreenshotWrap');
        const link = $('proofModalScreenshotLink');
        const img = $('proofModalScreenshot');
        const url = order.paymentProof.screenshotUrl;

        if (url && wrap && link && img) {
            wrap.hidden = false;
            link.href = url;
            img.src = url;
        } else if (wrap) {
            wrap.hidden = true;
        }

        $('proofModal').hidden = false;
    }

    function closeProofModal() {
        activeProofOrderId = null;
        $('proofModal').hidden = true;
    }

    function openMarkPaidModal(orderId) {
        const order = currentOrders.find((o) => String(o._id) === String(orderId));
        activeMarkPaidOrderId = orderId;
        $('markPaidOrderLabel').textContent = order?.orderId || orderId;
        $('markPaidAdminNote').value = '';
        $('markPaidModal').hidden = false;
    }

    function closeMarkPaidModal() {
        activeMarkPaidOrderId = null;
        $('markPaidModal').hidden = true;
    }

    async function reviewProof(action) {
        if (!activeProofOrderId) return;

        const adminNote = $('proofModalAdminNote')?.value?.trim() || '';
        const approveBtn = $('approveProofBtn');
        const rejectBtn = $('rejectProofBtn');

        approveBtn.disabled = true;
        rejectBtn.disabled = true;

        try {
            const response = await fetch(`/api/admin/orders/${activeProofOrderId}/review-payment-proof`, {
                method: 'PATCH',
                headers: authHeaders(),
                body: JSON.stringify({ action, adminNote })
            });
            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Review failed.');
            }

            showToast(result.message || 'Proof reviewed.', 'success');
            closeProofModal();
            await loadData();
        } catch (err) {
            showToast(err.message || 'Review failed.', 'error');
        } finally {
            approveBtn.disabled = false;
            rejectBtn.disabled = false;
        }
    }

    async function confirmMarkPaid() {
        if (!activeMarkPaidOrderId) return;

        const adminNote = $('markPaidAdminNote')?.value?.trim() || '';
        const btn = $('confirmMarkPaidBtn');
        btn.disabled = true;

        try {
            const response = await fetch(`/api/admin/payments/${activeMarkPaidOrderId}/mark-paid`, {
                method: 'PATCH',
                headers: authHeaders(),
                body: JSON.stringify({ adminNote })
            });
            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Failed to mark as paid.');
            }

            showToast(result.message || 'Order marked as paid.', 'success');
            closeMarkPaidModal();
            await loadData();
        } catch (err) {
            showToast(err.message || 'Failed to mark as paid.', 'error');
        } finally {
            btn.disabled = false;
        }
    }

    function bindEvents() {
        $('applyFilterBtn')?.addEventListener('click', () => {
            currentPage = 1;
            loadData();
        });

        $('refreshBtn')?.addEventListener('click', () => loadData());

        $('prevPageBtn')?.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage -= 1;
                loadData();
            }
        });

        $('nextPageBtn')?.addEventListener('click', () => {
            if (currentPage < totalPages) {
                currentPage += 1;
                loadData();
            }
        });

        $('exportCsvBtn')?.addEventListener('click', async () => {
            try {
                setLoading(true);
                const orders = await fetchAllForExport();
                exportCsv(orders);
                showToast(`Exported ${orders.length} orders.`, 'success');
            } catch (err) {
                showToast(err.message || 'Export failed.', 'error');
            } finally {
                setLoading(false);
            }
        });

        $('ordersTableBody')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.getAttribute('data-action');
            const id = btn.getAttribute('data-id');
            if (action === 'review-proof') openProofModal(id);
            if (action === 'mark-paid') openMarkPaidModal(id);
        });

        $('closeProofModalBtn')?.addEventListener('click', closeProofModal);
        $('approveProofBtn')?.addEventListener('click', () => reviewProof('approve'));
        $('rejectProofBtn')?.addEventListener('click', () => reviewProof('reject'));
        $('proofModal')?.addEventListener('click', (e) => {
            if (e.target === $('proofModal')) closeProofModal();
        });

        $('closeMarkPaidModalBtn')?.addEventListener('click', closeMarkPaidModal);
        $('cancelMarkPaidBtn')?.addEventListener('click', closeMarkPaidModal);
        $('confirmMarkPaidBtn')?.addEventListener('click', confirmMarkPaid);
        $('markPaidModal')?.addEventListener('click', (e) => {
            if (e.target === $('markPaidModal')) closeMarkPaidModal();
        });
    }

    function initDefaultDates() {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 30);
        $('filterEndDate').value = end.toISOString().slice(0, 10);
        $('filterStartDate').value = start.toISOString().slice(0, 10);
    }

    document.addEventListener('DOMContentLoaded', () => {
        initDefaultDates();
        bindEvents();
        loadData();
    });
})();
