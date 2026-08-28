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
 * - getStatusIcon
 * - isStepDone
 * - isStepActive
 * - renderOrderCard
 * - renderOrders
 * - toggleOrderCard
 * - viewOrderDetails
 * - trackOrder
 * - cancelOrder
 * - reviewOrder
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

    const ordersContainer = document.getElementById('ordersContainer')
        || document.querySelector('#my-orders .orders-list')
        || document.querySelector('[data-section="orders"]');
    const ordersPaginationEl = document.getElementById('orders-pagination');
    const ORDERS_PER_PAGE = 10;
    let ordersCurrentPage = 1;

    // =================================================================
    // ৫.৯ অর্ডার টেবিল হেল্পার (Status, Actions, Row Builder)
    // =================================================================
    function formatOrderDate(dateValue) {
        if (!dateValue) return '—';
        const d = new Date(dateValue);
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('en-US', {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }

    function formatOrderDateShort(dateValue) {
        if (!dateValue) return '—';
        const d = new Date(dateValue);
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function formatMoney(value) {
        return Number(value || 0).toLocaleString();
    }

    function getStatusIcon(status) {
        const icons = {
            Pending: '⏳',
            Processing: '⚙️',
            Shipped: '🚚',
            Delivered: '✅',
            Cancelled: '❌',
            Returned: '↩️'
        };
        return icons[canonicalStatus(status)] || '📦';
    }

    const STATUS_ORDER = ['Pending', 'Processing', 'Shipped', 'Delivered'];

    function canonicalStatus(status) {
        const key = String(status || '').trim().toLowerCase();
        const map = {
            pending: 'Pending',
            placed: 'Pending',
            processing: 'Processing',
            shipped: 'Shipped',
            'out for delivery': 'Shipped',
            'out-for-delivery': 'Shipped',
            delivered: 'Delivered',
            cancelled: 'Cancelled',
            canceled: 'Cancelled',
            returned: 'Returned',
            'return requested': 'Returned'
        };
        return map[key] || (status ? String(status) : 'Pending');
    }

    function isStepDone(currentStatus, stepStatus) {
        const ci = STATUS_ORDER.indexOf(canonicalStatus(currentStatus));
        const si = STATUS_ORDER.indexOf(stepStatus);
        return ci > si;
    }

    function isStepActive(currentStatus, stepStatus) {
        return canonicalStatus(currentStatus) === stepStatus;
    }

    function getItemVariantText(item) {
        const parts = [item.color, item.size, item.variant, item.variantLabel]
            .map((value) => String(value || '').trim())
            .filter(Boolean);
        return [...new Set(parts)].join(' · ');
    }

    function getItemProductId(item) {
        return item.productId || item.id || item._id || item.product?._id || '';
    }

    function getOrderTotals(order) {
        const items = Array.isArray(order.items) ? order.items : [];
        const itemsSum = items.reduce((sum, item) => {
            const qty = Number(item.quantity || item.qty) || 1;
            return sum + (Number(item.price) || 0) * qty;
        }, 0);
        const subtotal = Number(order.subtotal ?? order.subTotal) || itemsSum;
        const deliveryCharge = Number(order.deliveryCharge ?? order.shippingFee) || 0;
        const discount = Number(order.discountAmount ?? order.discount) || 0;
        const grandTotal = Number(order.grandTotal ?? order.totalAmount) || 0;
        return { subtotal, deliveryCharge, discount, grandTotal };
    }

    function getDisplayOrderId(order) {
        if (order.orderId) return order.orderId;
        if (order.orderNumber) return order.orderNumber;
        if (order._id) return String(order._id).slice(-8).toUpperCase();
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
        const orderDate = formatOrderDateShort(order.createdAt);
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

    function getItemImageSrc(item) {
        return safeImg(
            item.image || item.productImage || item.imageUrl
                || (Array.isArray(item.product?.images) ? item.product.images[0] : '')
                || item.product?.image
                || ''
        );
    }

    function getStatusConfig(status) {
        const canonical = canonicalStatus(status);
        const config = {
            Pending: { icon: '⏳', cls: 'pending', label: 'Pending' },
            Processing: { icon: '⚙️', cls: 'processing', label: 'Processing' },
            Shipped: { icon: '🚚', cls: 'shipped', label: 'Shipped' },
            Delivered: { icon: '✅', cls: 'delivered', label: 'Delivered' },
            Cancelled: { icon: '❌', cls: 'cancelled', label: 'Cancelled' },
            Returned: { icon: '↩️', cls: 'returned', label: 'Returned' }
        };
        return config[canonical] || config.Pending;
    }

    function renderOrderThumbs(items) {
        const maxThumb = 4;
        const list = Array.isArray(items) ? items : [];
        const visibleItems = list.slice(0, maxThumb);
        const extraCount = Math.max(0, list.length - maxThumb);
        const thumbCount = visibleItems.length + (extraCount > 0 ? 1 : 0);
        const width = thumbCount > 0 ? ((thumbCount - 1) * 22) + 40 : 0;

        return `
    <div class="order-thumbs" style="width:${width}px">
      ${visibleItems.map((item, i) => `
        <div class="order-thumb" style="z-index:${maxThumb - i}; left:${i * 22}px">
          <img src="${escapeHtml(getItemImageSrc(item))}"
               alt="${escapeHtml(item.name || 'Product')}"
               width="40"
               height="40"
               onerror="${IMG_ONERROR}">
        </div>
      `).join('')}
      ${extraCount > 0
        ? `<div class="order-thumb order-thumb-extra" style="z-index:0; left:${visibleItems.length * 22}px">+${extraCount}</div>`
        : ''}
    </div>`;
    }

    function renderOrderProgress(status) {
        const canonical = canonicalStatus(status);
        const st = getStatusConfig(canonical);
        if (canonical === 'Cancelled' || canonical === 'Returned') {
            return `
      <div class="order-cancelled-banner">
        ${st.icon} This order was ${escapeHtml(canonical.toLowerCase())}
      </div>`;
        }

        const steps = ['Pending', 'Processing', 'Shipped', 'Delivered'];
        const stepIcons = ['✓', '⚙️', '🚚', '✅'];
        const currentIdx = steps.indexOf(canonical);

        return `
      <div class="order-progress-track">
        <div class="order-progress-steps">
          ${steps.map((step, i) => {
            const done = i < currentIdx;
            const active = i === currentIdx;
            return `
              ${i > 0 ? `<div class="progress-line ${done || active ? 'done' : ''}"></div>` : ''}
              <div class="progress-step ${done ? 'done' : ''} ${active ? 'active' : ''}">
                <div class="step-dot">${done ? '✓' : stepIcons[i]}</div>
                <span class="step-label">${i === 0 ? 'Placed' : step}</span>
              </div>`;
          }).join('')}
        </div>
      </div>`;
    }

    function renderOrderItemThumb(item, qty) {
        const PT = window.ProductThumbnail;
        const alt = item.name || 'Product';
        const media = PT
            ? PT.buildThumbnailHtml(item, {
                variant: 'compact',
                loading: 'lazy',
                escapeHtml,
                alt
            })
            : `<img src="${escapeHtml(getItemImageSrc(item))}"
                    alt="${escapeHtml(alt)}"
                    width="64"
                    height="64"
                    class="order-item-thumb-img"
                    onerror="${IMG_ONERROR}">`;
        const qtyBadge = qty > 1
            ? `<span class="item-qty-badge" aria-hidden="true">×${qty}</span>`
            : '';
        return `<div class="order-item-img-wrap">${media}${qtyBadge}</div>`;
    }

    function renderOrderItemsDetail(items) {
        const safeItems = Array.isArray(items) ? items : [];
        if (safeItems.length === 0) {
            return `
    <div class="order-items-detail">
      <div class="order-item-row">
        <div class="order-item-info">
          <p class="item-name">No items in this order</p>
        </div>
      </div>
    </div>`;
        }

        return `
    <div class="order-items-detail">
      ${safeItems.map((item) => {
            const name = escapeHtml(item.name || 'Product');
            const qty = Number(item.quantity || item.qty) || 1;
            const price = Number(item.price) || 0;
            const variantText = getItemVariantText(item);
            return `
        <div class="order-item-row">
          ${renderOrderItemThumb(item, qty)}
          <div class="order-item-info">
            <p class="item-name">${name}</p>
            ${variantText ? `<p class="item-variant">${escapeHtml(variantText)}</p>` : ''}
            <p class="item-meta">
              <span class="item-unit-price">৳${formatMoney(price)}</span>
              <span class="item-qty">Qty: ${qty}</span>
            </p>
            <p class="item-subtotal">Subtotal <strong>৳${formatMoney(price * qty)}</strong></p>
          </div>
        </div>`;
        }).join('')}
    </div>`;
    }

    function renderOrderActions(order, mongoId, canonical) {
        const firstItem = Array.isArray(order.items) ? order.items[0] : null;
        const productId = firstItem ? escapeHtml(String(getItemProductId(firstItem))) : '';
        const productName = firstItem ? escapeHtml(firstItem.name || 'Product') : '';
        const safeMongoId = escapeHtml(mongoId);

        const trackBtn = canonical === 'Shipped'
            ? `<button type="button" class="oab primary order-action-btn" data-action="track" data-id="${safeMongoId}">🚚 Track Order</button>`
            : '';
        const cancelBtn = canonical === 'Pending'
            ? `<button type="button" class="oab danger order-action-btn btn-order-cancel" data-action="cancel" data-id="${safeMongoId}">Cancel</button>`
            : '';
        const reviewBtn = canonical === 'Delivered'
            ? `<button type="button" class="oab primary order-action-btn btn-write-review" data-action="review" data-id="${safeMongoId}" data-order-id="${safeMongoId}" data-product-id="${productId}" data-product-name="${productName}">⭐ Review</button>`
            : '';

        return `
    <div class="order-actions order-card-footer-actions">
      <button type="button" class="oab secondary order-action-btn" data-action="view" data-id="${safeMongoId}">👁 View Details</button>
      ${cancelBtn}${trackBtn}${reviewBtn}
    </div>`;
    }

    function collapseOrderCard(card) {
        if (!card) return;
        const detail = card.querySelector('.order-card-expanded');
        if (detail) {
            detail.style.maxHeight = `${detail.scrollHeight}px`;
            requestAnimationFrame(() => {
                detail.style.maxHeight = '0';
            });
        }
        card.dataset.expanded = 'false';
        card.classList.remove('is-expanded');
        card.setAttribute('aria-expanded', 'false');
    }

    function expandOrderCard(card) {
        if (!card) return;
        const detail = card.querySelector('.order-card-expanded');
        if (detail) {
            detail.style.maxHeight = `${detail.scrollHeight}px`;
        }
        card.dataset.expanded = 'true';
        card.classList.add('is-expanded');
        card.setAttribute('aria-expanded', 'true');
    }

    function toggleOrderCard(cardId) {
        const card = document.getElementById(cardId);
        if (!card) return;

        const expanded = card.dataset.expanded === 'true';
        if (!expanded) {
            document.querySelectorAll('#ordersContainer .order-card.is-expanded, .orders-list .order-card.is-expanded').forEach((other) => {
                if (other.id !== cardId) collapseOrderCard(other);
            });
            expandOrderCard(card);
        } else {
            collapseOrderCard(card);
        }
    }

    function setThumbsWidth() {
        document.querySelectorAll('#ordersContainer .order-thumbs, .orders-list .order-thumbs').forEach((container) => {
            const thumbs = container.querySelectorAll('.order-thumb');
            if (thumbs.length === 0) return;
            container.style.width = `${((thumbs.length - 1) * 22) + 40}px`;
        });
    }

    function autoExpandFirst() {
        const firstCard = document.querySelector('#ordersContainer .order-card, .orders-list .order-card');
        if (firstCard) toggleOrderCard(firstCard.id);
    }

    function renderOrderCard(order) {
        const items = Array.isArray(order.items) ? order.items : [];
        const mongoId = String(order._id || '');
        const cardId = `order-${mongoId}`;
        const displayOrderId = escapeHtml(getDisplayOrderId(order));
        const currentStatus = order.status || 'Pending';
        const canonical = canonicalStatus(currentStatus);
        const st = getStatusConfig(canonical);
        const totals = getOrderTotals(order);
        const itemCount = items.length;
        const date = escapeHtml(formatOrderDateShort(order.createdAt));

        return `
    <div class="order-card" id="${escapeHtml(cardId)}"
         data-expanded="false"
         data-order-id="${escapeHtml(mongoId)}"
         data-id="${escapeHtml(mongoId)}"
         tabindex="0"
         role="button"
         aria-expanded="false"
         aria-label="Toggle details for order #${displayOrderId}">
      <div class="order-card-compact">
        <div class="occ-left">
          <span class="order-id-tag">#${displayOrderId}</span>
          <span class="occ-date">${date}</span>
          <span class="occ-count">${itemCount} item${itemCount !== 1 ? 's' : ''}</span>
        </div>
        <div class="occ-middle">
          <div class="order-thumbs-wrapper">
            ${renderOrderThumbs(items)}
          </div>
        </div>
        <div class="occ-right">
          <span class="occ-total">৳${formatMoney(totals.grandTotal)}</span>
          <span class="order-status-pill status-${escapeHtml(st.cls)}">
            ${st.icon} ${escapeHtml(st.label)}
          </span>
          <span class="expand-icon" aria-hidden="true">▼</span>
        </div>
      </div>
      <div class="order-card-expanded">
        ${renderOrderProgress(currentStatus)}
        ${renderOrderItemsDetail(items)}
        <div class="order-detail-footer order-card-footer">
          <div class="order-totals-mini">
            <span>Subtotal <strong>৳${formatMoney(totals.subtotal)}</strong></span>
            <span class="divider">·</span>
            <span>Delivery ${totals.deliveryCharge > 0
                ? `<strong>৳${formatMoney(totals.deliveryCharge)}</strong>`
                : '<strong class="free-tag">FREE</strong>'}</span>
            ${totals.discount > 0
                ? `<span class="divider">·</span><span>Discount <strong class="disc-tag">-৳${formatMoney(totals.discount)}</strong></span>`
                : ''}
            <span class="divider">·</span>
            <span>Total <strong class="grand">৳${formatMoney(totals.grandTotal)}</strong></span>
          </div>
          ${renderOrderActions(order, mongoId, canonical)}
        </div>
      </div>
    </div>`;
    }

    function renderOrders(orders) {
        const container = ordersContainer
            || document.getElementById('ordersContainer')
            || document.querySelector('.orders-list')
            || document.querySelector('[data-section="orders"]');

        if (!container) return;

        if (!orders || orders.length === 0) {
            container.innerHTML = `
      <div class="orders-empty orders-empty-state">
        <div class="orders-empty-icon">🛍️</div>
        <h3>No orders yet</h3>
        <p>Your orders will appear here once you make a purchase.</p>
        <a href="/" class="oab primary order-action-btn"
           style="text-decoration:none;display:inline-flex;">
          Start Shopping
        </a>
      </div>`;
            return;
        }

        container.innerHTML = orders.map((order) => renderOrderCard(order)).join('');
        setThumbsWidth();
        autoExpandFirst();
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
                if (typeof window.fetchDashboardStats === 'function') {
                    await window.fetchDashboardStats();
                }
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
        if (!ordersContainer) return Promise.resolve();

        ordersCurrentPage = Math.max(1, page);

        try {
            ordersContainer.innerHTML = `<div class="orders-empty-state"><i class="fa-solid fa-spinner fa-spin orders-loading-icon"></i><h3>Loading your orders...</h3></div>`;
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

                renderOrders(orderList);
                renderOrdersPagination(pagination);
            } else {
                ordersContainer.innerHTML = `<div class="orders-empty-state"><i class="fa-solid fa-triangle-exclamation orders-empty-icon"></i><h3>Failed to load orders</h3><p>${escapeHtml(rawData.message || 'Error')}</p></div>`;
                renderOrdersPagination(null);
            }
        } catch (error) {
            console.error('Fetch Orders Error:', error);
            ordersContainer.innerHTML = `<div class="orders-empty-state"><i class="fa-solid fa-server orders-empty-icon"></i><h3>Server connection error.</h3></div>`;
            renderOrdersPagination(null);
        }
    }

    function viewOrderDetails(orderId) {
        navigateToOrderDetails(orderId, 'orders');
    }

    function trackOrder(orderId) {
        navigateToOrderDetails(orderId, 'orders');
    }

    function cancelOrder(orderId) {
        if (orderId) openOrderActionModal(orderId, 'cancel');
    }

    function reviewOrder(orderId) {
        if (!orderId) return;
        const card = document.querySelector(`.order-card[data-order-id="${CSS.escape(String(orderId))}"]`);
        const btn = card && card.querySelector('.btn-write-review');
        if (btn && typeof window.openReviewModal === 'function') {
            window.openReviewModal(
                btn.getAttribute('data-order-id'),
                btn.getAttribute('data-product-id'),
                btn.getAttribute('data-product-name')
            );
            return;
        }
        if (typeof showToast === 'function') {
            showToast('Unable to open review for this order.', 'warning');
        }
    }

    window.buildOrderRowHtml = buildOrderRowHtml;
    window.fetchUserOrders = fetchUserOrders;

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

document.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target.closest('.oab, .order-action-btn')) return;

    const compactCard = e.target.closest('#ordersContainer .order-card, .orders-list .order-card');
    if (compactCard && compactCard.contains(e.target)) {
        e.preventDefault();
        toggleOrderCard(compactCard.id);
        return;
    }

    const row = e.target.closest('.clickable-order-row');
    if (!row || !row.contains(e.target)) return;
    e.preventDefault();
    const orderId = row.getAttribute('data-id') || row.getAttribute('data-order-id');
    if (orderId) navigateToOrderDetails(orderId, resolveOrderNavigationSource(row));
});

document.addEventListener('click', function(e) {
    if (e.target.closest('.btn-write-review')) return;

    const actionBtn = e.target.closest('.oab, .order-action-btn');
    if (actionBtn) {
        const action = actionBtn.getAttribute('data-action');
        if (!action && !actionBtn.classList.contains('btn-order-cancel')) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        const orderId = actionBtn.getAttribute('data-id') || actionBtn.getAttribute('data-order-id');

        if (action === 'view') {
            viewOrderDetails(orderId);
            return;
        }
        if (action === 'track') {
            trackOrder(orderId);
            return;
        }
        if (action === 'cancel' || actionBtn.classList.contains('btn-order-cancel')) {
            cancelOrder(orderId);
        }
        return;
    }

    const compactCard = e.target.closest('#ordersContainer .order-card, .orders-list .order-card');
    if (compactCard) {
        e.preventDefault();
        toggleOrderCard(compactCard.id);
        return;
    }

    const _orderTarget = e.target.closest('.clickable-order-row');
    if (_orderTarget) {
        e.preventDefault();
        const orderId = _orderTarget.getAttribute('data-id') || _orderTarget.getAttribute('data-order-id');
        if (orderId) {
            navigateToOrderDetails(orderId, resolveOrderNavigationSource(_orderTarget));
        }
    }
});

Object.assign(window, {
    formatOrderDate,
    getStatusIcon,
    isStepDone,
    isStepActive,
    renderOrderCard,
    renderOrders,
    toggleOrderCard,
    viewOrderDetails,
    trackOrder,
    cancelOrder,
    reviewOrder,
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
