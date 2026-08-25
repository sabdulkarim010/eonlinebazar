/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/customers-table.js
 * Description: Customer listing, search, segments, selection, and shared order-row helpers.
 */
/* Dependencies: token, allCustomers, selectedCustomerIds, customerPg, customerSegmentFilter, showToast, escapeHtml (window) */
/* Exposes: window.buildCustomerCopyCell, window.buildOrderAddressCopyField, window.buildOrderCopyField, window.buildOrderExpandedPanel, window.buildOrderProductsSummary, window.copyCustomerField, window.getCustomerDisplayName, window.getCustomerStatusHtml, window.getOrderSearchInputEl, window.getStatusSelectClass, window.hydrateOrderExpandedTimeline, window.normalizeOrderStatusKey, window.orderMatchesDateFilter, window.orderMatchesStatusTab, window.renderCustomerTable, window.showCustomerError, window.toggleCustomerSelection, window.toggleSelectAllCustomers, window.updateCustomersBulkToolbar, window.updateOrderTabCounts */

import '../admin-core.js';

/* ==========================================================================
   SECTION 6: CUSTOMER MANAGEMENT (সকল কাস্টমারদের তালিকা ও পরিচালনা)
   ========================================================================== */

/**
 * ৬.১: কাস্টমারদের ডাটা টেবিলে প্রদর্শন করা
 * @param {Array} customers - ডাটাবেজ থেকে পাওয়া কাস্টমার অ্যারে
 */
function getCustomerDisplayName(user = {}) {
    const stored = String(user.name || '').trim();
    const fromParts = `${user.firstName || ''} ${user.lastName || ''}`.trim();
    return stored || fromParts || 'N/A';
}

function getCustomerStatusHtml(user) {
    const accountStatus = user.accountStatus || 'active';
    if (accountStatus === 'blocked') {
        return '<span class="status-badge status-blocked customers-status-badge"><i class="fa-solid fa-ban"></i> Blocked</span>';
    }
    if (accountStatus === 'suspended') {
        return '<span class="status-badge status-suspended customers-status-badge"><i class="fa-solid fa-pause"></i> Suspended</span>';
    }
    const verifyClass = user.isVerified ? 'status-verified' : 'status-pending';
    const verifyText = user.isVerified ? 'Verified' : 'Pending';
    return `<span class="status-badge ${verifyClass} customers-status-badge">${verifyText}</span>`;
}

function buildCustomerCopyCell(displayHtml, copyValue) {
    const safeCopy = escapeHtml(String(copyValue ?? ''));
    return `
        <span class="customers-copy-cell">
            <span class="customers-copy-cell__text">${displayHtml}</span>
            <button type="button" class="customers-copy-cell__btn" data-copy="${safeCopy}" onclick="copyCustomerField(this)" title="Copy to clipboard" aria-label="Copy">
                <i class="fa-regular fa-copy" aria-hidden="true"></i>
            </button>
        </span>`;
}

/** Hover-to-copy field for Live Orders — zero layout impact (button is absolutely positioned). */
function buildOrderCopyField(displayHtml, copyValue) {
    const raw = String(copyValue ?? '').trim();
    if (!raw || raw === '—') return displayHtml;

    const safeCopy = escapeHtml(raw);
    return `
        <span class="group inline-flex items-center justify-center max-w-full relative min-w-0">
            <span class="min-w-0">${displayHtml}</span>
            <button type="button"
                class="order-field-copy-btn opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer p-1 rounded hover:bg-gray-100"
                data-copy="${safeCopy}"
                onclick="copyCustomerField(this)"
                title="Copy"
                aria-label="Copy">
                <i class="fa-regular fa-copy" aria-hidden="true"></i>
            </button>
        </span>`;
}

function getOrderSearchInputEl() {
    return document.getElementById('order-search') || document.getElementById('orderSearchInput');
}

function normalizeOrderStatusKey(status) {
    return String(status || 'pending').trim().toLowerCase();
}

function getStatusSelectClass(status) {
    const key = normalizeOrderStatusKey(status);
    if (key.includes('process')) return 'processing';
    if (key.includes('ship')) return 'shipped';
    if (key.includes('deliver')) return 'delivered';
    if (key.includes('cancel')) return 'cancelled';
    if (key.includes('return')) return 'returned';
    return 'pending';
}

function orderMatchesStatusTab(order, tabStatus) {
    if (tabStatus === 'all') return true;
    const orderKey = normalizeOrderStatusKey(order.status);
    const tabKey = normalizeOrderStatusKey(tabStatus);
    if (tabKey === 'cancelled') return orderKey === 'cancelled' || orderKey === 'canceled';
    return orderKey === tabKey;
}

function orderMatchesDateFilter(order, dateValue) {
    if (!dateValue) return true;
    if (!order.createdAt) return false;
    const orderDate = new Date(order.createdAt);
    const y = orderDate.getFullYear();
    const m = String(orderDate.getMonth() + 1).padStart(2, '0');
    const d = String(orderDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}` === dateValue;
}

function buildOrderProductsSummary(items) {
    if (!Array.isArray(items) || items.length === 0) {
        return '<span class="order-products-empty">—</span>';
    }
    const first = items[0];
    const firstName = escapeHtml(first.name || 'Product');
    const extra = items.length - 1;
    if (extra <= 0) {
        return `<span class="order-products-primary">${firstName}</span>`;
    }
    return `<span class="order-products-primary">${firstName}</span> <span class="order-products-more">(+${extra} more)</span>`;
}

function buildOrderExpandedPanel(order) {
    const address = escapeHtml(order.customerAddress || '—');
    const items = Array.isArray(order.items) ? order.items : [];
    const productsHtml = items.length
        ? `<ul class="order-expanded-products">${items.map((item) =>
            `<li><strong>${escapeHtml(item.name || 'Product')}</strong> × ${Number(item.quantity) || 1}${item.variantLabel ? ` <span class="order-expanded-variant">(${escapeHtml(item.variantLabel)})</span>` : ''}</li>`
        ).join('')}</ul>`
        : '<p class="order-expanded-muted">No line items recorded.</p>';

    const subTotal = Number(order.subTotal ?? order.subtotal) || 0;
    const discountAmount = Number(order.discountAmount) || 0;
    const deliveryCharge = Number(order.deliveryCharge ?? order.shippingFee) || 0;
    const processingFee = Number(order.processingFee ?? order.payment?.processingFee) || 0;
    const grandTotal = getOrderGrandTotal(order);
    const paymentMethod = escapeHtml(order.paymentMethod || order.payment?.name || 'COD');
    const paymentStatus = escapeHtml(order.payment?.status || (order.paymentMethod === 'COD' ? 'cod' : 'unpaid'));
    const proofStatus = order.paymentProof?.status && order.paymentProof.status !== 'none'
        ? escapeHtml(order.paymentProof.status)
        : null;

    const timelineHostId = `order-timeline-${order._id}`;

    return `
        <div class="order-expanded-panel">
            <div class="order-expanded-grid">
                <div class="order-expanded-section">
                    <h4>Full Address</h4>
                    <p class="order-expanded-address">${address}</p>
                </div>
                <div class="order-expanded-section">
                    <h4>All Products</h4>
                    ${productsHtml}
                </div>
                <div class="order-expanded-section">
                    <h4>Payment Details</h4>
                    <dl class="order-expanded-payment">
                        <div><dt>Method</dt><dd>${paymentMethod}</dd></div>
                        <div><dt>Status</dt><dd>${paymentStatus}</dd></div>
                        <div><dt>Subtotal</dt><dd>${formatAdminPrice(subTotal)}</dd></div>
                        ${discountAmount > 0 ? `<div><dt>Discount</dt><dd>-${formatAdminPrice(discountAmount)}</dd></div>` : ''}
                        <div><dt>Shipping</dt><dd>${formatAdminPrice(deliveryCharge)}</dd></div>
                        ${processingFee > 0 ? `<div><dt>Processing Fee</dt><dd>${formatAdminPrice(processingFee)}</dd></div>` : ''}
                        <div><dt>Grand Total</dt><dd><strong>${formatAdminPrice(grandTotal)}</strong></dd></div>
                        ${proofStatus ? `<div><dt>Proof</dt><dd>${proofStatus}</dd></div>` : ''}
                    </dl>
                </div>
                <div class="order-expanded-section order-expanded-section--timeline">
                    <h4>Status Timeline</h4>
                    <div id="${timelineHostId}" class="order-expanded-timeline-host"></div>
                </div>
            </div>
        </div>`;
}

function hydrateOrderExpandedTimeline(orderId, status) {
    const host = document.getElementById(`order-timeline-${orderId}`);
    if (!host || !window.OrderStatusTimeline?.renderOrderStatusTimeline) return;
    window.OrderStatusTimeline.renderOrderStatusTimeline(host, status);
}

function updateOrderTabCounts() {
    const counts = {
        all: globalOrders.length,
        pending: 0,
        processing: 0,
        shipped: 0,
        delivered: 0,
        cancelled: 0
    };

    globalOrders.forEach((order) => {
        const key = normalizeOrderStatusKey(order.status);
        if (key === 'pending' || key === 'placed') counts.pending += 1;
        else if (key.includes('process')) counts.processing += 1;
        else if (key.includes('ship') && !key.includes('deliver')) counts.shipped += 1;
        else if (key.includes('deliver')) counts.delivered += 1;
        else if (key === 'cancelled' || key === 'canceled') counts.cancelled += 1;
    });

    const setCount = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(val);
    };

    setCount('count-all', counts.all);
    setCount('count-pending', counts.pending);
    setCount('count-processing', counts.processing);
    setCount('count-shipped', counts.shipped);
    setCount('count-delivered', counts.delivered);
    setCount('count-cancelled', counts.cancelled);
}

/** Address cell — inline copy control visible on row hover. */
function buildOrderAddressCopyField(address) {
    const raw = String(address ?? '').trim();
    const display = raw || '—';
    if (!raw || raw === '—') {
        return `<span class="order-address-text">${escapeHtml(display)}</span>`;
    }

    const safeCopy = escapeHtml(raw);
    return `
        <span class="group inline-flex items-center justify-start gap-1 min-w-0 max-w-full relative">
            <span class="order-address-text min-w-0">${escapeHtml(display)}</span>
            <button type="button"
                class="order-address-copy-btn opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer p-1 rounded hover:bg-gray-200 text-gray-500 shrink-0"
                data-copy="${safeCopy}"
                onclick="copyCustomerField(this)"
                title="Copy address"
                aria-label="Copy address">
                <i class="fa-regular fa-copy" aria-hidden="true"></i>
            </button>
        </span>`;
}

window.copyCustomerField = function(btn) {
    const value = btn?.getAttribute('data-copy') || '';
    if (!value) return;

    const onCopied = () => showToast('Copied!', 'success');
    const onFailed = () => showToast('Could not copy to clipboard.', 'warning');

    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(value).then(onCopied).catch(onFailed);
        return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy') ? onCopied() : onFailed();
    } catch {
        onFailed();
    } finally {
        textarea.remove();
    }
};

function renderCustomerTable(customers, totalFiltered) {
    const tbody = document.getElementById('customerTableBody');
    if (!tbody) return;

    if (customers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="loading-container">No records found.</td></tr>`;
        updateCustomersBulkToolbar();
        return;
    }

    let tableHTML = '';
    customers.forEach((user, index) => {
        const displayId = user._id ? user._id.toString().slice(-6).toUpperCase() : `USR-${index + 1}`;
        const accountStatus = user.accountStatus || 'active';
        const uid = user._id;
        const totalSpent = Number(user.totalSpent) || 0;
        const isChecked = selectedCustomerIds.has(String(uid)) ? 'checked' : '';

        let statusActionBtn = '';
        if (accountStatus === 'blocked') {
            statusActionBtn = `<button class="action-btn activate" onclick="setCustomerStatus('${uid}', 'active')" title="Unblock / Activate"><i class="fa-solid fa-unlock"></i></button>`;
        } else if (accountStatus === 'suspended') {
            statusActionBtn = `
                <button class="action-btn activate" onclick="setCustomerStatus('${uid}', 'active')" title="Reactivate"><i class="fa-solid fa-play"></i></button>
                <button class="action-btn block" onclick="setCustomerStatus('${uid}', 'blocked')" title="Block User"><i class="fa-solid fa-ban"></i></button>`;
        } else {
            statusActionBtn = `
                <button class="action-btn suspend" onclick="setCustomerStatus('${uid}', 'suspended')" title="Suspend User"><i class="fa-solid fa-pause"></i></button>
                <button class="action-btn block" onclick="setCustomerStatus('${uid}', 'blocked')" title="Block User"><i class="fa-solid fa-ban"></i></button>`;
        }

        const userIdCopy = user._id ? user._id.toString() : displayId;
        const emailDisplay = user.email || 'N/A';
        const mobileDisplay = user.mobile || 'N/A';

        tableHTML += `
            <tr class="customers-row">
                <td class="customers-td customers-td--check no-print">
                    <input type="checkbox" class="customer-row-checkbox" value="${uid}" ${isChecked} onchange="toggleCustomerSelection(this)">
                </td>
                <td class="customers-td customers-td--id">${buildCustomerCopyCell(`<b>#${escapeHtml(displayId)}</b>`, userIdCopy)}</td>
                <td class="customers-td customers-td--name"><span class="customers-name">${escapeHtml(getCustomerDisplayName(user))}${user.isVip ? ' <span class="customers-vip-crown" aria-hidden="true">👑</span>' : ''}</span></td>
                <td class="customers-td customers-td--email">${emailDisplay !== 'N/A' ? buildCustomerCopyCell(escapeHtml(emailDisplay), emailDisplay) : 'N/A'}</td>
                <td class="customers-td customers-td--mobile">${mobileDisplay !== 'N/A' ? buildCustomerCopyCell(escapeHtml(mobileDisplay), mobileDisplay) : 'N/A'}</td>
                <td class="customers-td customers-td--num">${getOrderCountBadge(user.orderCount)}</td>
                <td class="customers-td customers-td--num"><span class="spent-badge">${formatAdminPrice(totalSpent)}</span></td>
                <td class="customers-td customers-td--segment">${getCustomerSegmentBadge(user)}</td>
                <td class="customers-td customers-td--status">${getCustomerStatusHtml(user)}</td>
                <td class="col-actions customers-td customers-td--actions">
                    <div class="customer-actions-row">
                        <button type="button" class="action-btn view" onclick="viewCustomerDetails('${uid}')" title="View Profile"><i class="fa-solid fa-eye"></i></button>
                        <button type="button" class="action-btn edit" onclick="editCustomer('${uid}')" title="Edit Profile"><i class="fa-solid fa-pen-to-square"></i></button>
                        <button type="button" class="action-btn orders" onclick="viewCustomerOrders('${uid}')" title="Order History"><i class="fa-solid fa-clock-rotate-left"></i></button>
                        <button type="button" class="action-btn delete" onclick="deleteCustomer('${uid}')" title="Delete Customer Permanently"><i class="fa-solid fa-trash"></i></button>
                        ${statusActionBtn}
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = tableHTML;

    const selectAll = document.getElementById('customers-select-all');
    if (selectAll) {
        const pageBoxes = tbody.querySelectorAll('.customer-row-checkbox');
        selectAll.checked = pageBoxes.length > 0 && Array.from(pageBoxes).every(cb => cb.checked);
    }
    updateCustomersBulkToolbar();
}

window.toggleSelectAllCustomers = function(source) {
    document.querySelectorAll('.customer-row-checkbox').forEach(cb => {
        cb.checked = source.checked;
        if (source.checked) selectedCustomerIds.add(cb.value);
        else selectedCustomerIds.delete(cb.value);
    });
    updateCustomersBulkToolbar();
};

window.toggleCustomerSelection = function(checkbox) {
    if (checkbox.checked) selectedCustomerIds.add(checkbox.value);
    else selectedCustomerIds.delete(checkbox.value);
    updateCustomersBulkToolbar();
    const allChecked = Array.from(document.querySelectorAll('.customer-row-checkbox')).every(cb => cb.checked);
    const selectAll = document.getElementById('customers-select-all');
    if (selectAll) selectAll.checked = allChecked;
};

function updateCustomersBulkToolbar() {
    const toolbar = document.getElementById('customers-bulk-toolbar');
    const countEl = document.getElementById('customers-selected-count');
    const count = selectedCustomerIds.size;
    if (toolbar) toolbar.style.display = count > 0 ? 'flex' : 'none';
    if (countEl) countEl.textContent = `${count} selected`;
}

/**
 * ৬.২: কাস্টমার টেবিলে এরর মেসেজ দেখানোর ফাংশন
 * @param {string} msg - এরর মেসেজ
 */
function showCustomerError(msg) {
    const tbody = document.getElementById('customerTableBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="table-status-error">${msg}</td></tr>`;
}

/**
 * ৬.৩: কাস্টমার প্রোফাইল দেখার মোডাল

/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    buildCustomerCopyCell,
    buildOrderAddressCopyField,
    buildOrderCopyField,
    buildOrderExpandedPanel,
    buildOrderProductsSummary,
    getCustomerDisplayName,
    getCustomerStatusHtml,
    getOrderSearchInputEl,
    getStatusSelectClass,
    hydrateOrderExpandedTimeline,
    normalizeOrderStatusKey,
    orderMatchesDateFilter,
    orderMatchesStatusTab,
    renderCustomerTable,
    showCustomerError,
    updateCustomersBulkToolbar,
    updateOrderTabCounts
});

