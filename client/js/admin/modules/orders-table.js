/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/orders-table.js
 * Description: Live order listing, filters, expanded rows, and pagination.
 */
/* Dependencies: token, tableBody, globalOrders, currentFilteredOrders, showToast, handleAdminApiAuthResponse, buildCourierActionHtml, buildAdminOrderStatusCell, getOrderSearchInputEl, buildOrderExpandedPanel (window) */
/* Exposes: window.applyOrderFilters, window.changeOrderPageSize, window.debounceSearch, window.fetchLiveOrders, window.filterAndRenderOrders, window.filterByDate, window.getOrderPageNumbers, window.getOrderReasonDetails, window.goToNextOrderPage, window.goToOrderPage, window.goToPreviousOrderPage, window.jumpToOrderPage, window.maybeOpenOrderFromDeepLink, window.orderMatchesSandboxFilter, window.renderOrderPaginationControls, window.renderOrderTable, window.setOrderSandboxFilter, window.setOrderStatusTab, window.toggleOrderRowExpand, window.viewInvoice */

import '../admin-core.js';

const LIVE_ORDERS_TABLE_COLS = window.LIVE_ORDERS_TABLE_COLS;
const ORDER_COURIER_SEND_CLASSES = window.ORDER_COURIER_SEND_CLASSES;
const ORDER_COURIER_SENT_CLASSES = window.ORDER_COURIER_SENT_CLASSES;
const COURIER_TRACKING_BASE_URLS = window.COURIER_TRACKING_BASE_URLS;
const COURIER_PROVIDER_LABELS = window.COURIER_PROVIDER_LABELS;
const COURIER_BLOCKED_STATUSES = window.COURIER_BLOCKED_STATUSES;

/* ==========================================================================
   SECTION 7: LIVE ORDER MANAGEMENT (লাইভ অর্ডার ও ইনভয়েস ইঞ্জিন)
   ========================================================================== */

/**
 * ৭.১: ডাটাবেজ থেকে লাইভ সমস্ত অর্ডার ফেচ করা
 * এটি সিকিউর হেডার (Token) ব্যবহার করে ব্যাকএন্ড থেকে রিয়েল-টাইম অর্ডার নিয়ে আসে
 */
async function fetchLiveOrders() {
    if (!tableBody) return;
    
    // ডাটা লোড হওয়ার সময় ইউজার ফ্রেন্ডলি মেসেজ দেখানো
    tableBody.innerHTML = `<tr><td colspan="${LIVE_ORDERS_TABLE_COLS}" class="loading-cell">Syncing live orders...</td></tr>`; 
    
    try {
        const [response, settingsRes] = await Promise.all([
            fetch('/api/orders', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            }),
            fetch('/api/admin/master-settings', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            })
        ]);

        if (response.status === 429) {
            if (trackAdminPollError('liveOrders', response)) return;
            tableBody.innerHTML = `<tr><td colspan="${LIVE_ORDERS_TABLE_COLS}" class="table-status-error">Too many requests — please wait and try again.</td></tr>`;
            return;
        }
        if (response.status === 401) {
            handleAdminApiAuthResponse(response, {});
            return;
        }
        
        const data = await response.json();
        resetAdminPollErrors('liveOrders');

        try {
            const settingsData = await settingsRes.json();
            if (settingsData.success && settingsData.data) {
                cacheAdminRewardSettings(settingsData.data);
                cacheAdminCourierSettings(settingsData.data);
            }
        } catch (settingsErr) {
            console.warn('Could not load refund undo window from master settings:', settingsErr);
        }

        await refreshAdminCourierStatus();
        
        // ব্যাকএন্ড ডাটা ফরম্যাট যাচাই ও রিভার্স (সর্বশেষ অর্ডার আগে দেখানোর জন্য) করা
        if (data && data.success && Array.isArray(data.data)) {
            globalOrders = data.data; 
        } else if (Array.isArray(data)) {
            globalOrders = data.reverse(); 
        } else {
            globalOrders = [];
        }
        
        // ড্যাশবোর্ডের টোটাল অর্ডার ব্যাজ কাউন্টার আপডেট
        const totalOrderBadge = document.getElementById('total-orders-badge');
        if (totalOrderBadge) totalOrderBadge.innerText = `Total: ${globalOrders.length}`;
        
        // টেবিল রেন্ডার করার মূল ফাংশন কল
        filterAndRenderOrders();
        fetchPendingWhatsAppAlerts();
        maybeOpenOrderFromDeepLink();
    } catch (error) {
        console.error("অর্ডারের ডাটা প্রসেস করতে এরর হয়েছে:", error);
        tableBody.innerHTML = `<tr><td colspan="${LIVE_ORDERS_TABLE_COLS}" class="table-status-error">Failed to load live orders.</td></tr>`;
    }
}

/** Open invoice modal when arriving via /admin/order-details/:orderId */
function maybeOpenOrderFromDeepLink() {
    const match = window.location.pathname.match(/^\/admin\/order-details\/([^/]+)$/);
    if (!match) return;

    const orderId = decodeURIComponent(match[1]);
    try {
        window.history.replaceState({}, document.title, '/admin/dashboard');
    } catch (_) { /* ignore */ }

    const navItem = document.querySelector('[data-target="view-orders"]');
    if (navItem && typeof navItem.click === 'function') {
        navItem.click();
    }

    setTimeout(() => {
        if (typeof window.viewInvoice === 'function') {
            window.viewInvoice(orderId);
        }
    }, 150);
}
function applyOrderFilters(resetPage = false) {
    const searchInput = getOrderSearchInputEl();
    const search = (searchInput ? searchInput.value : '').toLowerCase().trim();

    currentFilteredOrders = globalOrders.filter((order) => {
        const orderIdStr = (order.orderId || order._id || '').toLowerCase();
        const nameStr = (order.customerName || '').toLowerCase();
        const phoneStr = (order.customerPhone || '').toLowerCase();

        const matchSearch = !search || orderIdStr.includes(search) || nameStr.includes(search) || phoneStr.includes(search);
        const matchStatus = orderMatchesStatusTab(order, currentOrderStatusFilter);
        const matchDate = orderMatchesDateFilter(order, currentOrderDateFilter);
        const matchSandbox = orderMatchesSandboxFilter(order, currentOrderSandboxFilter);

        return matchSearch && matchStatus && matchDate && matchSandbox;
    });

    initAdminPaginationInstances();
    if (resetPage) {
        currentOrderPage = 1;
        if (orderPg) orderPg.resetPage();
    }
    updateOrderTabCounts();
    renderOrderTable();
}

window.filterAndRenderOrders = function(resetPage = false) {
    applyOrderFilters(resetPage);
};

window.debounceSearch = function() {
    clearTimeout(orderSearchDebounceTimer);
    orderSearchDebounceTimer = setTimeout(() => applyOrderFilters(true), 300);
};

window.filterByDate = function(value) {
    currentOrderDateFilter = value || '';
    applyOrderFilters(true);
};

window.setOrderStatusTab = function(status) {
    currentOrderStatusFilter = status;
    document.querySelectorAll('#view-orders .order-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.status === status);
    });
    applyOrderFilters(false);
};

function orderMatchesSandboxFilter(order, filter) {
    if (!filter || filter === 'all') return true;
    const isTest = order.isSandbox === true;
    if (filter === 'test') return isTest;
    if (filter === 'live') return !isTest;
    return true;
}

window.setOrderSandboxFilter = function(filter) {
    currentOrderSandboxFilter = filter || 'all';
    document.querySelectorAll('#view-orders .sandbox-filter-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.sandboxFilter === currentOrderSandboxFilter);
    });
    applyOrderFilters(true);
};

/**
 * ৭.২ক: অর্ডার cancel/return reason ও status badge হেল্পার
 */
function getOrderReasonDetails(order) {
    if (!order) return null;

    const statusLower = String(order.status || 'pending').toLowerCase();
    const cancelReason = String(order.cancelReason || order.actionReason || '').trim();
    const returnReason = String(order.returnReason || order.actionReason || '').trim();

    if (statusLower === 'cancelled' || statusLower === 'canceled') {
        if (!cancelReason) return null;
        const by = order.cancelledBy === 'Admin' ? 'Admin' : 'Customer';
        return {
            actionType: 'Cancellation',
            initiatedBy: by,
            reason: cancelReason
        };
    }

    if (statusLower === 'return requested' && returnReason) {
        return {
            actionType: 'Return Request',
            initiatedBy: 'Customer',
            reason: returnReason
        };
    }

    if (statusLower === 'returned' && returnReason) {
        return {
            actionType: 'Return (Refunded)',
            initiatedBy: 'Customer',
            reason: returnReason
        };
    }

    return null;
}
window.renderOrderTable = function() {
    if (!tableBody) return;

    initAdminPaginationInstances();
    const limit = orderPg?.currentLimit ?? ordersPerPage;
    const page = orderPg?.currentPage ?? currentOrderPage;
    currentOrderPage = page;
    ordersPerPage = limit;

    const totalItems = currentFilteredOrders.length;
    const totalPages = Math.ceil(totalItems / limit) || 1;

    if (page > totalPages) {
        currentOrderPage = totalPages;
        if (orderPg) orderPg.currentPage = totalPages;
    }

    const effectivePage = orderPg?.currentPage ?? currentOrderPage;
    const startIdx = (effectivePage - 1) * limit;
    const paginatedOrders = currentFilteredOrders.slice(startIdx, startIdx + limit);

    if (orderPg) {
        orderPg.currentPage = effectivePage;
        orderPg.currentLimit = limit;
        orderPg.setTotal(totalItems);
    }

    if (paginatedOrders.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="${LIVE_ORDERS_TABLE_COLS}">
                    <div class="empty-orders">
                        <div class="empty-orders-icon" aria-hidden="true">📭</div>
                        <h3>No orders found</h3>
                        <p>Try changing the filter or search query</p>
                    </div>
                </td>
            </tr>`;
        updateOrdersBulkToolbar();
        return;
    }

    tableBody.innerHTML = '';

    paginatedOrders.forEach((order) => {
        const orderId = order._id;
        const displayId = order.orderId || orderId.slice(-6).toUpperCase();
        const isExpanded = expandedOrderIds.has(String(orderId));

        let dateHtml = `<span class="order-date-main">N/A</span>`;
        if (order.createdAt) {
            const dateObj = new Date(order.createdAt);
            const dateStr = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            dateHtml = `<span class="order-date-main">${dateStr}</span><span class="order-date-time">${timeStr}</span>`;
        }

        const statusLower = (order.status || 'pending').toLowerCase();
        const isReturnRequested = statusLower === 'return requested';

        const statusCellHtml = buildAdminOrderStatusCell(order);
        const courierActionHtml = buildCourierActionHtml(order);

        const displayIdSafe = escapeHtml(displayId);
        const customerName = order.customerName || '—';
        const customerPhone = order.customerPhone || '—';
        const orderIdCellHtml = `
            <button type="button" class="order-id-link" onclick="event.stopPropagation(); viewInvoice('${orderId}')" title="View invoice">
                #${displayIdSafe}
            </button>${order.isSandbox ? '<span class="sandbox-badge">TEST</span>' : ''}${buildAdminPaymentProofPendingBadge(order)}`;
        const customerNameHtml = `<span class="order-customer-name">${escapeHtml(customerName)}</span>`;
        const customerPhoneHtml = `<span class="order-customer-phone-sub">${escapeHtml(customerPhone)}</span>`;
        const customerAddress = order.customerAddress || '—';
        const addressCellHtml = `<span class="order-address-text" title="${escapeHtml(customerAddress)}">${escapeHtml(customerAddress)}</span>`;
        const productsCellHtml = buildOrderProductsSummary(order.items);

        const tr = document.createElement('tr');
        tr.className = `order-row-main${isReturnRequested ? ' order-row-return-requested' : ''}${isExpanded ? ' is-expanded' : ''}`;
        tr.dataset.orderId = orderId;
        tr.addEventListener('click', (event) => toggleOrderRowExpand(event, orderId));
        tr.innerHTML = `
            <td class="col-checkbox" onclick="event.stopPropagation()">
                <input type="checkbox" class="order-row-select" value="${orderId}" onchange="updateOrdersBulkToolbar()" aria-label="Select order #${displayIdSafe}">
            </td>
            <td class="col-order-id">${orderIdCellHtml}</td>
            <td class="col-datetime">${dateHtml}</td>
            <td class="col-customer">
                ${customerNameHtml}
                ${customerPhoneHtml}
            </td>
            <td class="col-address">${addressCellHtml}</td>
            <td class="col-products">${productsCellHtml}</td>
            <td class="col-total"><span class="order-total-amount">${formatAdminPrice(getOrderGrandTotal(order))}</span></td>
            <td class="col-status">${statusCellHtml}</td>
            <td class="order-courier-cell">${courierActionHtml}</td>
            <td class="order-actions-cell">
                <div class="order-actions-toolbar">
                    <button type="button" class="action-icon edit" onclick="event.stopPropagation(); openEditOrderShippingModal('${orderId}')" title="Edit Shipping Details" aria-label="Edit">✏️</button>
                    <button type="button" class="action-icon view" onclick="event.stopPropagation(); viewInvoice('${orderId}')" title="View Invoice" aria-label="View">👁️</button>
                    <button type="button" class="action-icon delete" onclick="event.stopPropagation(); deleteOrder('${orderId}')" title="Delete Order" aria-label="Delete">🗑️</button>
                </div>
            </td>
        `;
        tableBody.appendChild(tr);

        const expandTr = document.createElement('tr');
        expandTr.className = 'order-row-expanded';
        expandTr.dataset.expandFor = orderId;
        expandTr.style.display = isExpanded ? 'table-row' : 'none';
        expandTr.innerHTML = `
            <td colspan="${LIVE_ORDERS_TABLE_COLS}">
                ${buildOrderExpandedPanel(order)}
            </td>`;
        tableBody.appendChild(expandTr);

        if (isExpanded) {
            requestAnimationFrame(() => hydrateOrderExpandedTimeline(orderId, order.status));
        }
    });

    const selectAll = document.getElementById('orders-select-all');
    if (selectAll) selectAll.checked = false;
    updateOrdersBulkToolbar();
};

window.toggleOrderRowExpand = function(event, orderId) {
    if (event.target.closest('button, a, input, select, textarea, label')) return;

    const id = String(orderId);
    const expandRow = document.querySelector(`tr.order-row-expanded[data-expand-for="${id}"]`);
    const mainRow = document.querySelector(`tr.order-row-main[data-order-id="${id}"]`);
    if (!expandRow || !mainRow) return;

    const willExpand = expandRow.style.display === 'none';
    if (willExpand) {
        expandedOrderIds.add(id);
        expandRow.style.display = 'table-row';
        mainRow.classList.add('is-expanded');
        const order = globalOrders.find((o) => String(o._id) === id);
        if (order) hydrateOrderExpandedTimeline(id, order.status);
    } else {
        expandedOrderIds.delete(id);
        expandRow.style.display = 'none';
        mainRow.classList.remove('is-expanded');
    }
};
/* ==========================================================================
   SECTION 7.2: ORDER PAGINATION CONTROLS (অর্ডার পেজিনেশন নেভিগেশন)
   ========================================================================== */

/**
 * ৭.৮: প্রতি পেজে কতটি অর্ডার দেখাবে তা পরিবর্তন করার ফাংশন
 */
window.changeOrderPageSize = function() {
    const select = document.getElementById('order-pg-limit') || document.getElementById('orderItemsPerPage');
    if (orderPg && select) {
        orderPg.changeLimit(select.value);
    } else if (select) {
        ordersPerPage = parseInt(select.value, 10);
        currentOrderPage = 1;
        renderOrderTable();
    }
};

function getOrderPageNumbers(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

    const pages = [];
    if (current <= 4) {
        pages.push(1, 2, 3, 4, 5, '...', total);
    } else if (current >= total - 3) {
        pages.push(1, '...', total - 4, total - 3, total - 2, total - 1, total);
    } else {
        pages.push(1, '...', current - 1, current, current + 1, '...', total);
    }
    return pages;
}

function renderOrderPaginationControls(totalPages) {
    const paginationContainer = document.getElementById('dynamic-order-pages');
    if (!paginationContainer) return;

    let html = '';
    html += `<button type="button" class="pg-btn" ${currentOrderPage === 1 ? 'disabled' : ''} onclick="goToPreviousOrderPage()">← Prev</button>`;

    const pages = getOrderPageNumbers(currentOrderPage, totalPages);
    pages.forEach((p) => {
        if (p === '...') {
            html += '<span class="pg-dots">...</span>';
        } else {
            html += `<button type="button" class="pg-btn ${p === currentOrderPage ? 'active' : ''}" onclick="goToOrderPage(${p})">${p}</button>`;
        }
    });

    html += `<button type="button" class="pg-btn" ${currentOrderPage === totalPages || totalPages === 0 ? 'disabled' : ''} onclick="goToNextOrderPage()">Next →</button>`;

    paginationContainer.innerHTML = html;

    const jumpInput = document.getElementById('order-jump-page');
    if (jumpInput) {
        jumpInput.max = totalPages || 1;
        jumpInput.placeholder = String(currentOrderPage);
    }
}

window.jumpToOrderPage = function() {
    const val = parseInt(document.getElementById('order-pg-jump')?.value || document.getElementById('order-jump-page')?.value, 10);
    if (orderPg) orderPg.goTo(val);
    else if (val >= 1) goToOrderPage(val);
};

window.goToPreviousOrderPage = function() {
    if (orderPg) orderPg.goTo(orderPg.currentPage - 1);
    else if (currentOrderPage > 1) {
        currentOrderPage--;
        renderOrderTable();
    }
};

window.goToNextOrderPage = function() {
    if (orderPg) orderPg.goTo(orderPg.currentPage + 1);
    else {
        const totalItems = currentFilteredOrders.length;
        const totalPages = Math.ceil(totalItems / ordersPerPage) || 1;
        if (currentOrderPage < totalPages) {
            currentOrderPage++;
            renderOrderTable();
        }
    }
};

window.goToOrderPage = function(pageNumber) {
    if (orderPg) orderPg.goTo(pageNumber);
    else {
        currentOrderPage = pageNumber;
        renderOrderTable();
    }
};

// সার্চ ইভেন্ট লিসেনার (fallback if inline handler missing)
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = getOrderSearchInputEl();
    if (searchInput && !searchInput.dataset.boundSearch) {
        searchInput.dataset.boundSearch = '1';
        searchInput.addEventListener('input', () => debounceSearch());
    }
});

/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    applyOrderFilters,
    fetchLiveOrders,
    getOrderPageNumbers,
    getOrderReasonDetails,
    maybeOpenOrderFromDeepLink,
    orderMatchesSandboxFilter,
    renderOrderPaginationControls
});

