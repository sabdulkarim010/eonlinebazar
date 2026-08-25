/**
 * Profile Orders
 * Barrel: client/js/profile.js
 *
 * Globals used from other modules:
 *  * - profileAuthToken
 * - escapeHtml
 * - safeImg
 * - showToast
 * - currentUserId
 *
 * Globals this module exposes:
 *  * - formatOrderDate
 * - getDisplayOrderId
 * - getStatusBadgeClass
 * - getOrderDeliveryDate
 * - isWithinReturnWindow
 * - buildOrderThumbnailHtml
 * - buildOrderPreviewHtml
 * - buildOrderActionsHtml
 * - buildOrderRowHtml
 * - buildOrderItemsHtml
 * - populateOrderActionReasons
 * - toggleOrderActionOtherField
 * - resetOrderActionForm
 * - closeOrderActionModal
 * - openOrderActionModal
 * - resolveOrderActionReason
 * - showOrderActionSuccess
 * - submitOrderAction
 * - getOrdersScrollTarget
 * - scrollToOrdersContainer
 * - buildOrdersPaginationRange
 * - renderOrdersPagination
 * - goToOrdersPage
 * - fetchUserOrders
 */

document.addEventListener('DOMContentLoaded', () => {
    const token = window.profileAuthToken;
    if (!token) return;
    const escapeHtml = window.profileEscapeHtml;
    const safeImg = window.profileSafeImg;
    const bindImgFallback = window.profileBindImgFallback;
    const setAvatarSrc = window.profileSetAvatarSrc;
    const IMAGE_PLACEHOLDER = window.profileImagePlaceholder;
    const AVATAR_PLACEHOLDER = window.profileAvatarPlaceholder;
    const IMG_ONERROR = window.profileImgOnerror;
    const showToast = window.profileShowToast;
    const showInlineFeedback = window.profileShowInlineFeedback;
    const currentUserId = window.profileCurrentUserId;
    let currentUser = window.profileCurrentUser;


    // =================================================================
    // ৫.৯ অর্ডার টেবিল হেল্পার (Status, Actions, Row Builder)
    // =================================================================
    function formatOrderDate(dateValue) {
        if (!dateValue) return '—';
        return new Date(dateValue).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function getDisplayOrderId(order) {
        if (order.orderId) return order.orderId;
        if (order._id) return order._id.substring(order._id.length - 6).toUpperCase();
        return 'N/A';
    }

    function getStatusBadgeClass(status) {
        const key = String(status || 'pending').toLowerCase();
        const map = {
            pending: 'pending',
            placed: 'pending',
            processing: 'processing',
            shipped: 'shipped',
            'out for delivery': 'out-for-delivery',
            'out-for-delivery': 'out-for-delivery',
            delivered: 'delivered',
            cancelled: 'cancelled',
            canceled: 'cancelled',
            'return requested': 'return-requested',
            returned: 'returned'
        };
        return map[key] || 'pending';
    }

    function getOrderDeliveryDate(order) {
        return order.deliveredAt || order.deliveryDate || order.updatedAt || null;
    }

    function isWithinReturnWindow(order) {
        if (String(order.status || '').toLowerCase() !== 'delivered') return false;

        const deliveryDate = getOrderDeliveryDate(order);
        if (!deliveryDate) return false;

        const delivered = new Date(deliveryDate);
        if (Number.isNaN(delivered.getTime())) return false;

        const diffMs = Date.now() - delivered.getTime();
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        return diffMs >= 0 && diffMs <= sevenDaysMs;
    }

    function buildOrderThumbnailHtml(items, qty = 1) {
        const PT = window.ProductThumbnail;
        const safeItems = Array.isArray(items) ? items : [];
        const first = { ...(safeItems[0] || {}) };
        ['image', 'products', 'selectedImage', 'variantImage', 'photo', 'imageUrl'].forEach((key) => {
            if (first[key] && isInvalidImageValue(first[key])) first[key] = '';
        });

        const media = PT
            ? PT.buildThumbnailHtml(first, { variant: 'compact', loading: 'lazy', escapeHtml })
            : '';

        const qtyBadge = `<span class="thumb-qty-badge">x${qty}</span>`;

        return `<div class="order-card-thumb-wrap">${media}${qtyBadge}</div>`;
    }

    function buildOrderPreviewHtml(items, grandTotal) {
        const safeItems = Array.isArray(items) ? items : [];
        const totalBlock = `<div class="order-card-total-mobile"><span class="order-total-amount">৳${Number(grandTotal || 0).toLocaleString()}</span></div>`;

        if (safeItems.length === 0) {
            const thumb = buildOrderThumbnailHtml(safeItems, 1);
            return `<div class="order-card-body">${thumb}<div class="order-card-product-info"><span class="order-card-product-name">Unknown Item</span></div>${totalBlock}</div>`;
        }

        const first = safeItems[0];
        const name = first.name || 'Unknown Item';
        const qty = first.quantity || first.qty || 1;
        const moreCount = safeItems.length - 1;
        const extraItemsTag = moreCount > 0
            ? `<span class="order-extra-items">+${moreCount} more item${moreCount > 1 ? 's' : ''}</span>`
            : '';
        const thumb = buildOrderThumbnailHtml(safeItems, qty);

        return `<div class="order-card-body">
            ${thumb}
            <div class="order-card-product-info">
                <span class="order-card-product-name">${escapeHtml(name)}${extraItemsTag}</span>
            </div>
            ${totalBlock}
        </div>`;
    }

    function buildOrderActionsHtml() {
        return '';
    }

    function buildOrderRowHtml(order) {
        const orderDate = formatOrderDate(order.createdAt);
        const currentStatus = order.status || 'Pending';
        const statusBadgeClass = getStatusBadgeClass(currentStatus);
        const displayOrderId = getDisplayOrderId(order);
        const orderId = order._id || '';
        const grandTotal = Number(order.grandTotal ?? order.totalAmount) || 0;
        const previewHtml = buildOrderPreviewHtml(order.items, grandTotal);

        return `
            <tr class="clickable-order-row order-card-row" data-id="${escapeHtml(orderId)}" tabindex="0" role="link" aria-label="View order #${escapeHtml(displayOrderId)}">
                <td class="order-card-id-cell" data-label="Order ID">
                    <div class="order-card-header-meta">
                        <span class="order-id-link">#${escapeHtml(displayOrderId)}</span>
                        <span class="order-card-date-inline order-card-date-text"><span class="order-card-date-sep" aria-hidden="true">•</span> ${orderDate}</span>
                    </div>
                </td>
                <td class="order-card-date-cell order-card-date-cell--desktop" data-label="Date"><span class="order-card-date-text">${orderDate}</span></td>
                <td class="order-card-preview-cell" data-label="Products">${previewHtml}</td>
                <td class="order-total-cell order-card-total-cell order-card-total-desktop" data-label="Total Amount"><span class="order-total-amount">৳${grandTotal.toLocaleString()}</span></td>
                <td class="order-card-status-cell" data-label="Status"><span class="status-badge ${statusBadgeClass}">${escapeHtml(currentStatus)}</span></td>
                <td class="order-actions-td order-card-actions-cell order-card-actions-cell--empty" data-label="Actions"></td>
            </tr>
        `;
    }

    // Legacy helper kept for any inline references — preview renderer replaces stacked list in order cards.
    function buildOrderItemsHtml(items, order = {}) {
        const total = Number(order.grandTotal ?? order.totalAmount) || 0;
        return buildOrderPreviewHtml(items, total);
    }

    // =================================================================
    // ৯.৫ অর্ডার Cancel / Return মডাল ও API (Order Action Modal)
    // =================================================================
    const orderActionModal = document.getElementById('order-action-modal');
    const orderActionForm = document.getElementById('order-action-form');
    const orderActionTitleText = document.getElementById('order-action-modal-title-text');
    const orderActionReasonSelect = document.getElementById('order-action-reason-select');
    const orderActionOtherGroup = document.getElementById('order-action-other-group');
    const orderActionOtherReason = document.getElementById('order-action-other-reason');
    const orderActionConfirmBtn = document.getElementById('order-action-confirm-btn');
    const closeOrderActionModalBtn = document.getElementById('close-order-action-modal');
    const orderActionCloseBtn = document.getElementById('order-action-close-btn');

    const ORDER_ACTION_REASONS = [
        { value: 'Changed my mind', label: 'Changed my mind' },
        { value: 'Ordered by mistake', label: 'Ordered by mistake' },
        { value: 'Delivery taking too long', label: 'Delivery taking too long' },
        { value: 'Defective product', label: 'Defective product' },
        { value: 'Other', label: 'Other (type your own reason)' }
    ];

    let pendingOrderAction = { orderId: null, action: null };

    function populateOrderActionReasons() {
        if (!orderActionReasonSelect) return;

        orderActionReasonSelect.innerHTML = '<option value="">Choose a reason...</option>';
        ORDER_ACTION_REASONS.forEach(({ value, label }) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            orderActionReasonSelect.appendChild(option);
        });
    }

    function toggleOrderActionOtherField() {
        if (!orderActionReasonSelect || !orderActionOtherGroup) return;
        const isOther = orderActionReasonSelect.value === 'Other';
        orderActionOtherGroup.classList.toggle('hidden', !isOther);
        orderActionOtherGroup.setAttribute('aria-hidden', isOther ? 'false' : 'true');
        if (orderActionOtherReason) {
            orderActionOtherReason.required = isOther;
            if (!isOther) orderActionOtherReason.value = '';
            else orderActionOtherReason.focus();
        }
    }

    function resetOrderActionForm() {
        if (orderActionForm) orderActionForm.reset();
        toggleOrderActionOtherField();
        if (orderActionConfirmBtn) {
            orderActionConfirmBtn.disabled = false;
            orderActionConfirmBtn.innerHTML = '<i class="fa-solid fa-check"></i> Confirm';
            orderActionConfirmBtn.classList.remove('btn-order-action-cancel-theme', 'btn-order-action-return-theme');
        }
    }

    function closeOrderActionModal() {
        if (orderActionModal) orderActionModal.classList.add('hidden');
        pendingOrderAction = { orderId: null, action: null };
        resetOrderActionForm();
    }

    function openOrderActionModal(orderId, actionType) {
        if (!orderActionModal || !orderId || !actionType) return;

        pendingOrderAction = { orderId, action: actionType };
        resetOrderActionForm();
        populateOrderActionReasons();

        if (orderActionTitleText) {
            orderActionTitleText.textContent = actionType === 'return' ? 'Return Request' : 'Cancel Order';
        }
        if (orderActionConfirmBtn) {
            orderActionConfirmBtn.classList.add(
                actionType === 'return' ? 'btn-order-action-return-theme' : 'btn-order-action-cancel-theme'
            );
        }

        orderActionModal.classList.remove('hidden');
        if (orderActionReasonSelect) orderActionReasonSelect.focus();
    }

    function resolveOrderActionReason() {
        const selected = orderActionReasonSelect ? orderActionReasonSelect.value.trim() : '';
        if (!selected) return { selectedReason: '', customReason: '', reason: '' };

        if (selected === 'Other') {
            const customReason = orderActionOtherReason ? orderActionOtherReason.value.trim() : '';
            return { selectedReason: 'Other', customReason, reason: customReason };
        }
        return { selectedReason: selected, customReason: '', reason: selected };
    }

    function showOrderActionSuccess(message) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'success',
                title: 'Success',
                text: message,
                confirmButtonColor: '#2563eb'
            });
        } else {
            window.alert(message);
        }
    }

    async function submitOrderAction() {
        const { orderId, action } = pendingOrderAction;
        if (!orderId || !action) {
            showToast('Missing order reference. Please try again.', 'danger');
            return;
        }

        const { reason, selectedReason, customReason } = resolveOrderActionReason();
        if (!reason) {
            showToast(
                selectedReason === 'Other' || orderActionReasonSelect?.value === 'Other'
                    ? 'Please type your custom reason in the text field.'
                    : 'Please select a reason before confirming.',
                'warning'
            );
            return;
        }

        const endpoint = action === 'return'
            ? `/api/orders/${encodeURIComponent(orderId)}/return`
            : `/api/orders/${encodeURIComponent(orderId)}/cancel`;

        const originalBtnHtml = orderActionConfirmBtn ? orderActionConfirmBtn.innerHTML : '';
        if (orderActionConfirmBtn) {
            orderActionConfirmBtn.disabled = true;
            orderActionConfirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
        }

        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ reason, selectedReason, customReason })
            });

            const data = await res.json();

            if (res.ok && data.success) {
                closeOrderActionModal();
                showOrderActionSuccess(data.message || 'Request processed successfully.');
                await fetchUserOrders();
                await fetchDashboardStats();
            } else {
                showToast(data.message || 'Request failed. Please try again.', 'danger');
            }
        } catch (error) {
            console.error('Order action error:', error);
            showToast('Server error while processing your request.', 'danger');
        } finally {
            if (orderActionConfirmBtn) {
                orderActionConfirmBtn.disabled = false;
                orderActionConfirmBtn.innerHTML = originalBtnHtml;
            }
        }
    }

    if (orderActionReasonSelect) {
        orderActionReasonSelect.addEventListener('change', toggleOrderActionOtherField);
    }

    if (orderActionForm) {
        orderActionForm.addEventListener('submit', (e) => {
            e.preventDefault();
            submitOrderAction();
        });
    }

    if (closeOrderActionModalBtn) {
        closeOrderActionModalBtn.addEventListener('click', closeOrderActionModal);
    }
    if (orderActionCloseBtn) {
        orderActionCloseBtn.addEventListener('click', closeOrderActionModal);
    }
    if (orderActionModal) {
        orderActionModal.addEventListener('click', (e) => {
            if (e.target === orderActionModal) closeOrderActionModal();
        });
    }

    // =================================================================
    // ৯. ইউজারের লাইভ অর্ডারসমূহ লোড করা (Fetch & Render Orders)
    // =================================================================
    function getOrdersScrollTarget() {
        return document.getElementById('orders-section')
            || document.querySelector('#my-orders .orders-list-card')
            || document.getElementById('my-orders');
    }

    function scrollToOrdersContainer() {
        const target = getOrdersScrollTarget();
        if (!target) return;
        requestAnimationFrame(() => {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    function buildOrdersPaginationRange(current, total) {
        if (total <= 7) {
            return Array.from({ length: total }, (_, index) => index + 1);
        }

        const pages = [];
        const addPage = (pageNum) => {
            if (pageNum < 1 || pageNum > total) return;
            if (pages.length && pageNum - pages[pages.length - 1] > 1) {
                pages.push('...');
            }
            if (pages[pages.length - 1] !== pageNum) {
                pages.push(pageNum);
            }
        };

        addPage(1);
        addPage(current - 1);
        addPage(current);
        addPage(current + 1);
        addPage(total);
        return pages;
    }

    function renderOrdersPagination(pagination) {
        if (!ordersPaginationEl) return;

        if (!pagination || pagination.totalPages <= 1 || pagination.total <= ORDERS_PER_PAGE) {
            ordersPaginationEl.innerHTML = '';
            ordersPaginationEl.classList.add('hidden');
            return;
        }

        const page = pagination.page;
        const totalPages = pagination.totalPages;
        const total = pagination.total;
        const rangeStart = ((page - 1) * ORDERS_PER_PAGE) + 1;
        const rangeEnd = Math.min(page * ORDERS_PER_PAGE, total);
        const pageItems = buildOrdersPaginationRange(page, totalPages);

        ordersPaginationEl.classList.remove('hidden');
        ordersPaginationEl.innerHTML = `
            <div class="pagination-container orders-pagination-inner">
                <button type="button" class="orders-page-btn orders-page-prev" data-page="${page - 1}" aria-label="Previous page"${page <= 1 ? ' disabled' : ''}>
                    <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
                    <span>Previous</span>
                </button>
                <div class="orders-page-numbers" role="group" aria-label="Page numbers">
                    ${pageItems.map((item) => {
                        if (item === '...') {
                            return '<span class="orders-page-ellipsis" aria-hidden="true">…</span>';
                        }
                        const isActive = item === page;
                        return `<button type="button" class="orders-page-btn orders-page-num${isActive ? ' is-active' : ''}" data-page="${item}" aria-label="Page ${item}"${isActive ? ' aria-current="page"' : ''}>${item}</button>`;
                    }).join('')}
                </div>
                <button type="button" class="orders-page-btn orders-page-next" data-page="${page + 1}" aria-label="Next page"${page >= totalPages ? ' disabled' : ''}>
                    <span>Next</span>
                    <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
                </button>
            </div>
            <p class="orders-pagination-summary">Showing ${rangeStart}–${rangeEnd} of ${total} orders</p>
        `;
    }

    function goToOrdersPage(page) {
        const nextPage = Number(page);
        if (!Number.isFinite(nextPage) || nextPage < 1) return;
        fetchUserOrders(nextPage).then(() => scrollToOrdersContainer());
    }

    async function fetchUserOrders(page = ordersCurrentPage) {
        if (!ordersListTbody) return Promise.resolve();

        ordersCurrentPage = Math.max(1, page);

        try {
            ordersListTbody.innerHTML = `<tr class="orders-state-row"><td colspan="6" class="text-center orders-loading-cell"><i class="fa-solid fa-spinner fa-spin orders-loading-icon"></i><br><br>Loading your orders...</td></tr>`;
            if (ordersPaginationEl) {
                ordersPaginationEl.innerHTML = '';
                ordersPaginationEl.classList.add('hidden');
            }

            const res = await fetch(`/api/orders/my-orders?page=${ordersCurrentPage}&limit=${ORDERS_PER_PAGE}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache'
                }
            });

            const rawData = await res.json();

            if (res.ok) {
                const orderList = rawData.data || rawData.orders || (Array.isArray(rawData) ? rawData : []);
                const pagination = rawData.pagination || null;

                if (pagination && ordersCurrentPage > pagination.totalPages && pagination.totalPages > 0) {
                    return fetchUserOrders(pagination.totalPages);
                }

                if (!orderList || orderList.length === 0) {
                    ordersListTbody.innerHTML = `<tr class="orders-state-row"><td colspan="6" class="text-center orders-empty-cell"><i class="fa-solid fa-box-open orders-empty-icon"></i><br>You haven't placed any orders yet.</td></tr>`;
                    renderOrdersPagination(pagination);
                    return;
                }

                ordersListTbody.innerHTML = orderList.map((order) => buildOrderRowHtml(order)).join('');
                renderOrdersPagination(pagination);
            } else {
                ordersListTbody.innerHTML = `<tr class="orders-state-row"><td colspan="6" class="text-center orders-error-cell"><i class="fa-solid fa-triangle-exclamation"></i> Failed to load orders. (${escapeHtml(rawData.message || 'Error')})</td></tr>`;
                renderOrdersPagination(null);
            }
        } catch (error) {
            console.error('Fetch Orders Error:', error);
            ordersListTbody.innerHTML = `<tr class="orders-state-row"><td colspan="6" class="text-center orders-error-cell"><i class="fa-solid fa-server"></i> Server connection error.</td></tr>`;
            renderOrdersPagination(null);
        }
    }

    if (ordersPaginationEl) {
        ordersPaginationEl.addEventListener('click', (e) => {
            const btn = e.target.closest('.orders-page-btn');
            if (!btn || btn.disabled || !ordersPaginationEl.contains(btn)) return;
            e.preventDefault();
            const targetPage = parseInt(btn.getAttribute('data-page'), 10);
            if (!Number.isNaN(targetPage)) {
                goToOrdersPage(targetPage);
            }
        });
    }

function resolveOrderNavigationSource(row) {
    if (!row) return 'orders';
    const dashboardTbody = document.getElementById('dashboard-orders-tbody');
    if (dashboardTbody && dashboardTbody.contains(row)) return 'dashboard';
    return 'orders';
}

function navigateToOrderDetails(orderId, from) {
    if (!orderId) return;
    const source = from || 'orders';
    window.location.href = `/order-details?id=${encodeURIComponent(orderId)}&from=${encodeURIComponent(source)}`;
}

// Entire order card navigates to order details; action buttons stop propagation above.
document.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = e.target.closest('.clickable-order-row.order-card-row');
    if (!row || !row.contains(e.target)) return;
    if (e.target.closest('.order-action-btn')) return;
    e.preventDefault();
    const orderId = row.getAttribute('data-id');
    if (orderId) navigateToOrderDetails(orderId, resolveOrderNavigationSource(row));
});

document.addEventListener('click', function(e) {
    if (e.target.closest('.btn-write-review')) return;

    const actionBtn = e.target.closest('.order-action-btn');
    if (actionBtn) {
        e.preventDefault();
        e.stopPropagation();

        const orderId = actionBtn.getAttribute('data-id');
        if (actionBtn.classList.contains('btn-order-cancel')) {
            openOrderActionModal(orderId, 'cancel');
        }
        return;
    }

    const _orderTarget = e.target.closest('.clickable-order-row');
    if (_orderTarget) {
        e.preventDefault();

        const orderId = _orderTarget.getAttribute('data-id');

        if (orderId) {
            navigateToOrderDetails(orderId, resolveOrderNavigationSource(_orderTarget));
        }
    }
});

Object.assign(window, {
    formatOrderDate,
    getDisplayOrderId,
    getStatusBadgeClass,
    getOrderDeliveryDate,
    isWithinReturnWindow,
    buildOrderThumbnailHtml,
    buildOrderPreviewHtml,
    buildOrderActionsHtml,
    buildOrderRowHtml,
    buildOrderItemsHtml,
    populateOrderActionReasons,
    toggleOrderActionOtherField,
    resetOrderActionForm,
    closeOrderActionModal,
    openOrderActionModal,
    resolveOrderActionReason,
    showOrderActionSuccess,
    submitOrderAction,
    getOrdersScrollTarget,
    scrollToOrdersContainer,
    buildOrdersPaginationRange,
    renderOrdersPagination,
    goToOrdersPage,
    fetchUserOrders
});

});
