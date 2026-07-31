/********************************************************************
 * Payment Reconciliation — admin page logic
 ********************************************************************/

(function () {
    'use strict';

    const API_BASE = '/api/admin/payments/reconciliation';
    const CURRENCY = '৳';
    const TOKEN_KEY = 'adminToken';

    let currentPage = 1;
    let currentLimit = 10;
    let totalPages = 1;
    let totalOrders = 0;
    let currentOrders = [];
    let activeProofOrderId = null;
    let activeMarkPaidOrderId = null;
    let reconPg = null;

    function initReconPagination() {
        if (typeof AdminPagination === 'undefined' || reconPg) return;
        reconPg = new AdminPagination({
            containerId: 'recon-pg-btns',
            infoId: 'recon-pg-info',
            countId: 'recon-total-count',
            limitSelectId: 'recon-pg-limit',
            defaultLimit: 10,
            onPageChange: (page, limit) => {
                currentPage = page;
                currentLimit = limit;
                loadData();
            }
        });
        window.reconPg = reconPg;
    }

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

    function showAlert(message, type) {
        const toast = $('toast-alert');
        if (!toast) return;
        toast.textContent = message;
        toast.className = 'toast-alert show' + (type === 'ok' ? ' ok' : type === 'err' ? ' err' : '');
        clearTimeout(showAlert._timer);
        showAlert._timer = setTimeout(() => { toast.classList.remove('show'); }, 3500);
    }

    function showToast(message, type) {
        showAlert(message, type === 'success' ? 'ok' : type === 'error' ? 'err' : '');
    }

    function setLoading(isLoading) {
        const topLoading = $('top-loading');
        if (topLoading) {
            topLoading.classList.toggle('show', isLoading);
        }
        const tableLoading = $('table-loading');
        if (tableLoading) {
            tableLoading.style.display = isLoading ? 'block' : 'none';
        }
    }

    function showError(message) {
        showToast(message, 'error');
    }

    function hideError() {
        /* no error banner in current layout */
    }

    function getFilterParams() {
        const params = new URLSearchParams();
        const type = $('filter-type')?.value || 'all';
        const status = $('filter-status')?.value || 'all';
        const gateway = $('filter-gateway')?.value || 'all';
        const startDate = $('filter-start')?.value || '';
        const endDate = $('filter-end')?.value || '';

        if (type && type !== 'all') params.set('type', type);
        if (status && status !== 'all') params.set('paymentStatus', status);
        if (gateway && gateway !== 'all') params.set('gateway', gateway);
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
        params.set('page', String(currentPage));
        params.set('limit', String(currentLimit));

        return params;
    }

    function typeBadge(type) {
        const t = String(type || '').toLowerCase();
        if (t === 'gateway' || t === 'automated') {
            return '<span class="badge b-gateway">🏦 Gateway</span>';
        }
        if (t === 'manual') return '<span class="badge b-manual">📱 Manual</span>';
        if (t === 'cod') return '<span class="badge b-cod">🚚 COD</span>';
        return `<span class="badge b-none">${escapeHtml(type || '—')}</span>`;
    }

    function statusBadge(status) {
        const s = String(status || 'unpaid').toLowerCase();
        if (s === 'paid') return '<span class="badge b-paid">✅ Paid</span>';
        if (s === 'pending') return '<span class="badge b-pending">⏳ Pending</span>';
        return '<span class="badge b-unpaid">❌ Unpaid</span>';
    }

    function ipnBadge(received) {
        if (received) return '<span class="badge b-yes">✓</span>';
        return '<span class="badge b-no">—</span>';
    }

    function proofBadge(status) {
        if (status == null) return '<span class="badge b-none">—</span>';
        const s = String(status || 'none').toLowerCase();
        if (s === 'submitted') return '<span class="badge b-sub">⏳ Review</span>';
        if (s === 'approved') return '<span class="badge b-app">✅ Done</span>';
        if (s === 'rejected') return '<span class="badge b-rej">❌ Rejected</span>';
        return '<span class="badge b-none">—</span>';
    }

    function jsStr(value) {
        return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    function renderActions(order) {
        const id = jsStr(order._id);
        const parts = [
            `<button class="btn btn-sm" style="background:#6366f1;color:white" onclick="viewOrder('${id}')">View</button>`
        ];
        if (order.paymentType === 'gateway' && order.paymentStatus !== 'paid') {
            parts.push(
                `<button class="btn btn-sm btn-amber" onclick="openMarkPaid('${id}')">Mark Paid</button>`
            );
        }
        if (order.paymentType === 'manual' && order.proofStatus === 'submitted') {
            parts.push(
                `<button class="btn btn-sm btn-green" onclick="openProofModal('${id}','approve')">Approve</button>`,
                `<button class="btn btn-sm btn-red" onclick="openProofModal('${id}','reject')">Reject</button>`
            );
        }
        return `<div class="action-wrap">${parts.join('')}</div>`;
    }

    function renderTable(orders) {
        const tbody = $('recon-tbody');
        if (!tbody) return;

        if (!orders.length) {
            tbody.innerHTML = `<tr><td colspan="11">
                <div class="empty-box">
                    <div class="e-icon">📋</div>
                    <h3>No orders found</h3>
                    <p>No orders match the current filters.</p>
                </div>
            </td></tr>`;
            clearSelection();
            return;
        }

        tbody.innerHTML = orders.map((order) => {
            const orderLink = `/admin/order-details/${encodeURIComponent(order._id)}`;
            const ipnCell = order.paymentType === 'gateway'
                ? ipnBadge(order.ipnReceived)
                : '—';

            return `<tr data-order-id="${order._id}">
                <td><input type="checkbox" class="row-select" value="${order._id}" onchange="updateBulkToolbar()"></td>
                <td><a class="order-link" href="${orderLink}" target="_blank" rel="noopener">${escapeHtml(order.orderId || order._id)}</a></td>
                <td><span class="cust-name">${escapeHtml(order.customerName || '—')}</span><br><span class="cust-phone">${escapeHtml(order.customerPhone || '')}</span></td>
                <td class="amount-val">${formatMoney(order.grandTotal)}</td>
                <td>${escapeHtml(order.paymentMethod || '—')}</td>
                <td>${typeBadge(order.paymentType)}</td>
                <td>${statusBadge(order.paymentStatus)}</td>
                <td>${ipnCell}</td>
                <td>${proofBadge(order.proofStatus)}</td>
                <td>${formatDate(order.createdAt)}</td>
                <td>${renderActions(order)}</td>
            </tr>`;
        }).join('');

        const selectAll = $('select-all');
        if (selectAll) selectAll.checked = false;
        updateBulkToolbar();
    }

    function updateTableCount(count) {
        totalOrders = count;
        const el = $('table-count');
        if (el) el.textContent = `${count} order${count !== 1 ? 's' : ''}`;
    }

    function updatePagination(pagination) {
        initReconPagination();
        currentPage = pagination?.page || currentPage;
        totalPages = pagination?.totalPages || 1;
        totalOrders = pagination?.total ?? totalOrders;
        if (currentPage > totalPages && totalPages > 0) {
            currentPage = totalPages;
        }
        if (reconPg) {
            reconPg.currentPage = currentPage;
            reconPg.currentLimit = currentLimit;
            reconPg.setTotal(totalOrders);
        }
    }

    function goToPage(page) {
        if (reconPg) reconPg.goTo(page);
        else if (page >= 1 && page <= totalPages) {
            currentPage = page;
            loadData();
        }
    }

    function changeLimit(val) {
        if (reconPg) reconPg.changeLimit(val);
        else {
            currentLimit = parseInt(val, 10) || 10;
            currentPage = 1;
            loadData();
        }
    }

    function jumpToPage() {
        const val = parseInt($('recon-pg-jump')?.value, 10);
        if (reconPg) reconPg.goTo(val);
        else if (val >= 1 && val <= totalPages) goToPage(val);
    }

    function toggleSelectAll(cb) {
        document.querySelectorAll('.row-select')
            .forEach((el) => { el.checked = cb.checked; });
        updateBulkToolbar();
    }

    function updateBulkToolbar() {
        const selected = document.querySelectorAll('.row-select:checked').length;
        const toolbar = $('bulk-toolbar');
        const count = $('selected-count');
        if (toolbar) toolbar.style.display = selected > 0 ? 'flex' : 'none';
        if (count) count.textContent = `${selected} order${selected > 1 ? 's' : ''} selected`;
    }

    async function bulkDelete() {
        const selected = [...document.querySelectorAll('.row-select:checked')]
            .map((el) => el.value);
        if (!selected.length) return;

        if (!confirm(`Delete ${selected.length} order(s)? This cannot be undone.`)) return;

        try {
            const res = await fetch('/api/admin/orders/bulk-delete', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ orderIds: selected })
            });
            const data = await res.json();
            if (data.success) {
                showAlert(`${data.deleted ?? selected.length} orders deleted`, 'ok');
                clearSelection();
                if (reconPg) reconPg.stayOnPage();
                else loadData();
            } else {
                showAlert(data.message || 'Delete failed', 'err');
            }
        } catch (err) {
            showAlert('Network error', 'err');
        }
    }

    function clearSelection() {
        document.querySelectorAll('.row-select, #select-all')
            .forEach((el) => { el.checked = false; });
        updateBulkToolbar();
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
        $('stat-total').textContent = summary.totalOrders ?? 0;
        $('stat-revenue').textContent = formatMoney(summary.totalRevenue);
        $('stat-gateway-paid').textContent = summary.gatewayPaidCount ?? 0;
        $('stat-gateway-unpaid').textContent = summary.gatewayUnpaidCount ?? 0;
        $('stat-pending-proof').textContent = summary.pendingProofCount ?? 0;
        $('stat-cod').textContent = summary.codCount ?? 0;
    }

    async function loadData() {
        initReconPagination();
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
            updateTableCount(result.pagination?.total ?? currentOrders.length);
            updatePagination(result.pagination);

            if (!currentOrders.length && currentPage > 1 && totalPages > 0) {
                currentPage = totalPages;
                return loadData();
            }

            renderTable(currentOrders);
        } catch (err) {
            showError(err.message || 'Failed to load data.');
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

    function exportCsvData(orders) {
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

    function openModal(id) {
        const el = $(id);
        if (el) el.classList.add('open');
    }

    function closeModal(id) {
        const el = $(id);
        if (el) el.classList.remove('open');
    }

    function openProofModal(orderId, action) {
        const order = currentOrders.find((o) => String(o._id) === String(orderId));
        if (!order) return;

        activeProofOrderId = orderId;
        $('modal-order-id').textContent = order.orderId || orderId;
        $('modal-customer').textContent = order.customerName
            ? `${order.customerName}${order.customerPhone ? ' · ' + order.customerPhone : ''}`
            : '—';
        $('modal-trx-id').textContent = order.paymentProof?.trxId || '—';
        $('modal-admin-note').value = '';

        const img = $('modal-proof-img');
        const noImg = $('modal-no-img');
        const url = order.paymentProof?.screenshotUrl;

        if (url && img) {
            img.src = url;
            img.style.display = 'block';
            img.onclick = () => window.open(url, '_blank');
            if (noImg) noImg.style.display = 'none';
        } else {
            if (img) {
                img.style.display = 'none';
                img.src = '';
            }
            if (noImg) noImg.style.display = 'block';
        }

        openModal('proof-modal');

        if (action === 'approve' && order.paymentProof) {
            /* modal opened for review; user confirms via footer buttons */
        }
    }

    function openMarkPaid(orderId) {
        const order = currentOrders.find((o) => String(o._id) === String(orderId));
        activeMarkPaidOrderId = orderId;
        $('markpaid-order-id').textContent = order?.orderId || orderId;
        $('markpaid-note').value = '';
        openModal('markpaid-modal');
    }

    function viewOrder(id) {
        window.open('/admin/order-details/' + encodeURIComponent(id), '_blank', 'noopener');
    }

    async function reviewProof(action) {
        if (!activeProofOrderId) return;

        const adminNote = $('modal-admin-note')?.value?.trim() || '';

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
            closeModal('proof-modal');
            activeProofOrderId = null;
            await loadData();
        } catch (err) {
            showToast(err.message || 'Review failed.', 'error');
        }
    }

    async function confirmMarkPaid() {
        if (!activeMarkPaidOrderId) return;

        const adminNote = $('markpaid-note')?.value?.trim() || '';

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
            closeModal('markpaid-modal');
            activeMarkPaidOrderId = null;
            await loadData();
        } catch (err) {
            showToast(err.message || 'Failed to mark as paid.', 'error');
        }
    }

    function changePage(delta) {
        goToPage(currentPage + delta);
    }

    function applyFilters() {
        currentPage = 1;
        if (reconPg) reconPg.resetPage();
        loadData();
    }

    async function exportCSV() {
        try {
            setLoading(true);
            const orders = await fetchAllForExport();
            exportCsvData(orders);
            showToast(`Exported ${orders.length} orders.`, 'success');
        } catch (err) {
            showToast(err.message || 'Export failed.', 'error');
        } finally {
            setLoading(false);
        }
    }

    function initDefaultDates() {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 30);
        $('filter-end').value = end.toISOString().slice(0, 10);
        $('filter-start').value = start.toISOString().slice(0, 10);
    }

    function bindModalBackdropClose() {
        $('proof-modal')?.addEventListener('click', (e) => {
            if (e.target === $('proof-modal')) {
                closeModal('proof-modal');
                activeProofOrderId = null;
            }
        });
        $('markpaid-modal')?.addEventListener('click', (e) => {
            if (e.target === $('markpaid-modal')) {
                closeModal('markpaid-modal');
                activeMarkPaidOrderId = null;
            }
        });
    }

    /* expose globals for inline onclick handlers */
    window.loadReconciliation = loadData;
    window.exportCSV = exportCSV;
    window.applyFilters = applyFilters;
    window.changePage = changePage;
    window.goToPage = goToPage;
    window.changeLimit = changeLimit;
    window.jumpToPage = jumpToPage;
    window.toggleSelectAll = toggleSelectAll;
    window.updateBulkToolbar = updateBulkToolbar;
    window.bulkDelete = bulkDelete;
    window.clearSelection = clearSelection;
    window.showAlert = showAlert;
    window.openModal = openModal;
    window.closeModal = closeModal;
    window.viewOrder = viewOrder;
    window.openMarkPaid = openMarkPaid;
    window.openProofModal = openProofModal;
    window.submitProofReview = reviewProof;
    window.submitMarkPaid = confirmMarkPaid;

    document.addEventListener('DOMContentLoaded', () => {
        initReconPagination();
        initDefaultDates();
        bindModalBackdropClose();
        loadData();
    });
})();
