/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/core-realtime.js
 * Description: Socket notifications and product/order list state helpers.
 */
/* ==========================================================================
   REAL-TIME SOCKET NOTIFICATIONS (Socket.IO admin namespace)
   ========================================================================== */

/* shared state: adminSocket lives on window (admin-core) */

/* shared state: adminSocketInitialized lives on window (admin-core) */

/* shared state: adminRealtimeToasts lives on window (admin-core) */

/* shared state: adminNotifHistory lives on window (admin-core) */

/* shared state: adminNotifUnread lives on window (admin-core) */

/* shared state: sidebarOrdersCount lives on window (admin-core) */

/* shared state: sidebarMessagesCount lives on window (admin-core) */

function ensureAdminRealtimeToastStack() {
    if (!document.getElementById('adminRealtimeToastStack')) {
        const stack = document.createElement('div');
        stack.id = 'adminRealtimeToastStack';
        stack.className = 'admin-realtime-toast-stack';
        stack.setAttribute('aria-live', 'polite');
        document.body.appendChild(stack);
    }
}

function ensureAdminSocketStatusIndicator() {
    if (!document.getElementById('adminSocketStatus')) {
        const el = document.createElement('div');
        el.id = 'adminSocketStatus';
        el.className = 'admin-socket-status is-hidden';
        el.setAttribute('role', 'status');
        document.body.appendChild(el);
    }
    return document.getElementById('adminSocketStatus');
}

function setAdminSocketStatus(text, state, autoHideMs = 0) {
    const el = ensureAdminSocketStatusIndicator();
    if (!el) return;
    el.textContent = text;
    el.classList.remove('is-hidden', 'is-connected', 'is-disconnected');
    if (state === 'connected') el.classList.add('is-connected');
    if (state === 'disconnected') el.classList.add('is-disconnected');
    if (autoHideMs > 0) {
        window.setTimeout(() => el.classList.add('is-hidden'), autoHideMs);
    }
}

function playAdminNotificationBeep() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.value = 0.04;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
        osc.onended = () => ctx.close();
    } catch (err) {
        console.warn('Notification beep failed:', err);
    }
}

/**
 * Real-time toast — top-right, max 3 visible, auto-dismiss after 5s.
 */
function showAdminToast(message, type = 'info') {
    ensureAdminRealtimeToastStack();
    const stack = document.getElementById('adminRealtimeToastStack');
    if (!stack) return;

    const allowed = ['success', 'warning', 'info', 'error'];
    const toastType = allowed.includes(type) ? type : 'info';

    while (adminRealtimeToasts.length >= 3) {
        const oldest = adminRealtimeToasts.shift();
        if (oldest?.el) oldest.el.remove();
    }

    const toast = document.createElement('div');
    toast.className = `admin-realtime-toast ${toastType}`;
    toast.textContent = message;
    stack.appendChild(toast);

    const entry = { el: toast };
    adminRealtimeToasts.push(entry);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add('is-visible'));
    });

    const dismiss = () => {
        toast.classList.remove('is-visible');
        toast.classList.add('is-leaving');
        window.setTimeout(() => {
            toast.remove();
            const idx = adminRealtimeToasts.indexOf(entry);
            if (idx >= 0) adminRealtimeToasts.splice(idx, 1);
        }, 320);
    };

    window.setTimeout(dismiss, 5000);
}

function formatTimeAgo(dateInput) {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
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

function updateSidebarOrdersBadge(delta = 0) {
    sidebarOrdersCount = Math.max(0, sidebarOrdersCount + delta);
    const badge = document.getElementById('sidebarOrdersBadge');
    if (!badge) return;
    if (sidebarOrdersCount <= 0) {
        badge.hidden = true;
        badge.textContent = '0';
    } else {
        badge.hidden = false;
        badge.textContent = String(sidebarOrdersCount);
    }

    const totalOrderBadge = document.getElementById('total-orders-badge');
    if (totalOrderBadge && delta > 0) {
        const current = parseInt(String(totalOrderBadge.textContent).replace(/\D/g, ''), 10) || 0;
        totalOrderBadge.innerText = `Total: ${current + delta}`;
    }
}

function updateSidebarMessagesBadge(delta = 0) {
    sidebarMessagesCount = Math.max(0, sidebarMessagesCount + delta);
    const badge = document.getElementById('sidebarMessagesBadge');
    if (!badge) return;
    if (sidebarMessagesCount <= 0) {
        badge.hidden = true;
        badge.textContent = '0';
    } else {
        badge.hidden = false;
        badge.textContent = String(sidebarMessagesCount);
    }
}

function updateAdminNotifBellBadge() {
    const countEl = document.getElementById('adminNotifBellCount');
    if (!countEl) return;
    if (adminNotifUnread <= 0) {
        countEl.hidden = true;
        countEl.textContent = '0';
    } else {
        countEl.hidden = false;
        countEl.textContent = String(adminNotifUnread);
    }
}

function renderAdminNotifDropdown() {
    const listEl = document.getElementById('adminNotifDropdownList');
    if (!listEl) return;

    if (!adminNotifHistory.length) {
        listEl.innerHTML = '<p class="admin-notif-empty">No notifications yet</p>';
        return;
    }

    listEl.innerHTML = adminNotifHistory.slice(0, 10).map((item) => `
        <div class="admin-notif-item">
            <span class="admin-notif-item-icon">${item.icon}</span>
            <div class="admin-notif-item-body">
                <p class="admin-notif-item-msg">${escapeToastText(item.message)}</p>
                <span class="admin-notif-item-time">${escapeToastText(item.timeAgo)}</span>
            </div>
        </div>
    `).join('');
}

function pushAdminNotification({ icon, message, createdAt }) {
    adminNotifHistory.unshift({
        icon,
        message,
        createdAt: createdAt || new Date(),
        timeAgo: formatTimeAgo(createdAt || new Date())
    });
    if (adminNotifHistory.length > 10) adminNotifHistory.length = 10;
    adminNotifUnread += 1;
    updateAdminNotifBellBadge();
    renderAdminNotifDropdown();
}

function setupAdminNotifBell() {
    const btn = document.getElementById('adminNotifBellBtn');
    const dropdown = document.getElementById('adminNotifDropdown');
    const markAllBtn = document.getElementById('adminNotifMarkAllRead');

    if (btn && dropdown) {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.hidden = !dropdown.hidden;
        });

        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
                dropdown.hidden = true;
            }
        });
    }

    if (markAllBtn) {
        markAllBtn.addEventListener('click', () => {
            adminNotifUnread = 0;
            updateAdminNotifBellBadge();
            if (dropdown) dropdown.hidden = true;
        });
    }

    renderAdminNotifDropdown();
}

function isAdminSectionActive(sectionId) {
    const section = document.getElementById(sectionId);
    return !!(section && (section.classList.contains('active') || section.style.display === 'block'));
}

function initAdminSocket() {
    if (adminSocketInitialized || typeof io === 'undefined') return;
    const authToken = localStorage.getItem('adminToken');
    if (!authToken) return;

    adminSocketInitialized = true;
    setupAdminNotifBell();

    adminSocket = io('/admin', {
        auth: { token: authToken }
    });

    adminSocket.on('connect', () => {
        setAdminSocketStatus('🟢 Connected', 'connected', 3000);
    });

    adminSocket.on('disconnect', () => {
        setAdminSocketStatus('🔴 Disconnected', 'disconnected');
    });

    adminSocket.on('connect_error', (err) => {
        console.warn('[Socket] Connection error:', err.message);
        setAdminSocketStatus('🔴 Disconnected', 'disconnected');
    });

    adminSocket.on('new_order', (data) => {
        playAdminNotificationBeep();
        const total = Number(data.total || 0).toLocaleString();
        const msg = `🛒 New order! #${data.orderId} — ${data.customerName} — ৳${total}`;
        showAdminToast(msg, 'success');
        pushAdminNotification({ icon: '🛒', message: msg, createdAt: data.createdAt });
        updateSidebarOrdersBadge(1);

        if (isAdminSectionActive('view-orders') && typeof fetchLiveOrders === 'function') {
            fetchLiveOrders();
        }
    });

    adminSocket.on('new_message', (data) => {
        const msg = `✉️ New message! ${data.senderName}: ${data.subject}`;
        showAdminToast(msg, 'info');
        pushAdminNotification({ icon: '✉️', message: msg, createdAt: data.createdAt });
        updateSidebarMessagesBadge(1);
    });

    adminSocket.on('payment_proof_submitted', (data) => {
        const msg = `💳 Payment proof submitted! Order #${data.orderId}`;
        showAdminToast(msg, 'info');
        pushAdminNotification({ icon: '💳', message: msg, createdAt: data.submittedAt });
    });

    adminSocket.on('low_stock_alert', (data) => {
        const msg = `⚠️ Low stock: ${data.productName} — ${data.stockQuantity} left`;
        showAdminToast(msg, 'warning');
        pushAdminNotification({ icon: '⚠️', message: msg, createdAt: new Date() });
    });

    adminSocket.on('order_status_changed', (data) => {
        const msg = `📦 Order #${data.orderId}: ${data.oldStatus} → ${data.newStatus}`;
        showAdminToast(msg, 'info');
        pushAdminNotification({ icon: '📦', message: msg, createdAt: data.updatedAt });

        if (isAdminSectionActive('view-orders') && typeof fetchLiveOrders === 'function') {
            fetchLiveOrders();
        }
    });
}

window.showAdminToast = showAdminToast;
window.initAdminSocket = initAdminSocket;

/**
 * Enterprise-grade confirmation modal — frosted backdrop, optional typed phrase,
 * async confirm handler with loading spinner. Returns a Promise<boolean>.
 */
function showEnterpriseActionModal(options = {}) {
    const {
        title = 'Confirm action',
        message = '',
        variant = 'danger',
        confirmText = 'Confirm',
        cancelText = 'Cancel',
        requireTypedPhrase = null,
        onConfirm = null
    } = options;

    const overlay = document.getElementById('enterpriseConfirmModal');
    if (!overlay) {
        return Promise.resolve(false);
    }

    const iconWrap = document.getElementById('enterpriseModalIconWrap');
    const iconEl = document.getElementById('enterpriseModalIcon');
    const titleEl = document.getElementById('enterpriseModalTitle');
    const messageEl = document.getElementById('enterpriseModalMessage');
    const typedWrap = document.getElementById('enterpriseModalTypedWrap');
    const phraseEl = document.getElementById('enterpriseModalPhrase');
    const typedInput = document.getElementById('enterpriseModalTypedInput');
    const typedError = document.getElementById('enterpriseModalTypedError');
    const cancelBtn = document.getElementById('enterpriseModalCancelBtn');
    const confirmBtn = document.getElementById('enterpriseModalConfirmBtn');
    const confirmLabel = document.getElementById('enterpriseModalConfirmLabel');
    const spinner = document.getElementById('enterpriseModalSpinner');
    const closeBtn = document.getElementById('enterpriseModalCloseBtn');

    const isDanger = variant === 'danger';
    const needsTyped = typeof requireTypedPhrase === 'string' && requireTypedPhrase.trim().length > 0;

    titleEl.textContent = title;
    messageEl.textContent = message;
    cancelBtn.textContent = cancelText;
    confirmLabel.textContent = confirmText;

    iconWrap.className = `enterprise-modal-icon-wrap ${isDanger ? 'is-danger' : 'is-warning'}`;
    iconEl.className = isDanger
        ? 'fa-solid fa-skull-crossbones enterprise-modal-icon'
        : 'fa-solid fa-triangle-exclamation enterprise-modal-icon';

    confirmBtn.classList.toggle('is-warning', !isDanger);

    if (needsTyped) {
        typedWrap.hidden = false;
        phraseEl.textContent = requireTypedPhrase;
        typedInput.value = '';
        typedInput.classList.remove('is-invalid');
        typedError.hidden = true;
        typedError.textContent = '';
    } else {
        typedWrap.hidden = true;
    }

    let resolvePromise;
    const resultPromise = new Promise((resolve) => { resolvePromise = resolve; });

    let isBusy = false;

    const setBusy = (busy) => {
        isBusy = busy;
        confirmBtn.disabled = busy;
        cancelBtn.disabled = busy;
        closeBtn.disabled = busy;
        typedInput.disabled = busy;
        spinner.hidden = !busy;
        confirmLabel.hidden = busy;
    };

    const closeModal = (confirmed = false) => {
        overlay.hidden = true;
        overlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('enterprise-modal-open');
        document.removeEventListener('keydown', onKeyDown);
        overlay.removeEventListener('click', onOverlayClick);
        setBusy(false);
        resolvePromise(confirmed);
    };

    const onKeyDown = (event) => {
        if (event.key === 'Escape' && !isBusy) closeModal(false);
    };

    const onOverlayClick = (event) => {
        if (event.target === overlay && !isBusy) closeModal(false);
    };

    const handleConfirm = async () => {
        if (isBusy) return;

        if (needsTyped && typedInput.value.trim() !== requireTypedPhrase) {
            typedInput.classList.add('is-invalid');
            typedError.hidden = false;
            typedError.textContent = `Please type "${requireTypedPhrase}" exactly to continue.`;
            typedInput.focus();
            return;
        }

        if (typeof onConfirm !== 'function') {
            closeModal(true);
            return;
        }

        setBusy(true);
        try {
            await onConfirm();
            closeModal(true);
        } catch (err) {
            setBusy(false);
            showToast(err?.message || 'Action failed. Please try again.', 'error');
        }
    };

    cancelBtn.onclick = () => { if (!isBusy) closeModal(false); };
    closeBtn.onclick = () => { if (!isBusy) closeModal(false); };
    confirmBtn.onclick = handleConfirm;

    typedInput.oninput = () => {
        typedInput.classList.remove('is-invalid');
        typedError.hidden = true;
    };

    typedInput.onkeydown = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            handleConfirm();
        }
    };

    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('enterprise-modal-open');
    document.addEventListener('keydown', onKeyDown);
    overlay.addEventListener('click', onOverlayClick);

    requestAnimationFrame(() => {
        if (needsTyped) typedInput.focus();
        else confirmBtn.focus();
    });

    return resultPromise;
}

window.showEnterpriseActionModal = showEnterpriseActionModal;

/**
 * কনফার্মেশন ডায়ালগ (SweetAlert2)
 */
window.showCustomConfirm = function(title, message, onConfirm, type = 'warning') {
    const isDanger = type === 'danger' || type === 'warning';

    if (typeof Swal !== 'undefined') {
        return Swal.fire({
            title: title || 'Are you sure?',
            text: message,
            icon: 'warning',
            showCancelButton: true,
            focusCancel: true,
            reverseButtons: false,
            confirmButtonText: 'Yes, Proceed',
            cancelButtonText: 'Cancel',
            buttonsStyling: false,
            width: 420,
            padding: '2.1em 1.6em 1.6em',
            customClass: {
                popup: 'admin-confirm-swal',
                title: 'admin-confirm-swal-title',
                htmlContainer: 'admin-confirm-swal-text',
                icon: 'admin-confirm-swal-icon',
                actions: 'admin-confirm-swal-actions',
                confirmButton: 'admin-confirm-swal-confirm',
                cancelButton: 'admin-confirm-swal-cancel'
            }
        }).then((result) => {
            if (result.isConfirmed && typeof onConfirm === 'function') onConfirm();
            return result.isConfirmed === true;
        });
    }

    const modal = document.getElementById('customConfirmModal');
    if (!modal) {
        const ok = window.confirm(`${title || 'Are you sure?'}\n\n${message || ''}`);
        if (ok && typeof onConfirm === 'function') onConfirm();
        return Promise.resolve(ok);
    }

    const titleEl = document.getElementById('confirmTitle');
    const messageEl = document.getElementById('confirmMessage');
    const iconBox = document.getElementById('confirmIconBox');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    const confirmBtn = document.getElementById('confirmSuccessBtn');

    titleEl.innerText = title;
    messageEl.innerText = message;

    iconBox.className = `confirm-icon-box ${isDanger ? 'danger' : 'warning'}`;
    iconBox.innerHTML = '<i class="fa-solid fa-exclamation"></i>';
    confirmBtn.className = 'btn-confirm danger-action';
    confirmBtn.textContent = 'Yes, Proceed';

    modal.style.display = 'flex';

    return new Promise((resolve) => {
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

        const newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

        const close = (confirmed) => {
            modal.style.display = 'none';
            if (confirmed && typeof onConfirm === 'function') onConfirm();
            resolve(confirmed);
        };

        newCancelBtn.addEventListener('click', () => close(false));
        newConfirmBtn.addEventListener('click', () => close(true));
        modal.addEventListener('click', (event) => {
            if (event.target === modal) close(false);
        }, { once: true });
    });
};

window.showAdminSuccess = function(title, message) {
    const text = message || title || 'Success';
    const formatted = /^success:/i.test(text) ? text : `Success: ${text}`;
    showToast(formatted, 'success');
};

/** Resolve product table body lazily (module init timing safe) */
function getProdTableBody() {
    return document.getElementById('adminProductTableBody');
}

/** Snapshot active filters + pagination for restore after edit/save (sessionStorage only — no URL params) */
function getProductFilterState() {
    return {
        search: document.getElementById('searchProduct')?.value || '',
        category: document.getElementById('filterCategory')?.value || 'All',
        stockStatus: document.getElementById('filterStockStatus')?.value || 'All',
        priceRange: document.getElementById('filterPriceRange')?.value || 'All',
        pageSize: document.getElementById('product-pg-limit')?.value || '10',
        sortKey: currentSort?.key || 'productId',
        sortAsc: currentSort?.asc !== false
    };
}

function saveProductPaginationState() {
    savedProductPageBeforeAction = productPg?.currentPage ?? currentPage;
    persistProductListSessionState(true);
}

function restoreProductPaginationState() {
    if (savedProductPageBeforeAction != null && savedProductPageBeforeAction > 0) {
        currentPage = savedProductPageBeforeAction;
        if (productPg) productPg.currentPage = currentPage;
        savedProductPageBeforeAction = null;
        return;
    }
    readProductListSessionState();
}

function readProductListSessionState() {
    try {
        const raw = sessionStorage.getItem(PRODUCT_PAGINATION_STORAGE_KEY);
        if (!raw) return;
        const stored = JSON.parse(raw);
        if (stored.page) {
            currentPage = Number(stored.page) || 1;
            if (productPg) productPg.currentPage = currentPage;
        }

        const pageSizeEl = document.getElementById('product-pg-limit');
        if (pageSizeEl && stored.pageSize) {
            pageSizeEl.value = stored.pageSize;
            if (productPg) productPg.currentLimit = parseInt(stored.pageSize, 10) || 10;
        }

        const searchEl = document.getElementById('searchProduct');
        if (searchEl && stored.search != null) searchEl.value = stored.search;

        const catEl = document.getElementById('filterCategory');
        if (catEl && stored.category) catEl.value = stored.category;

        const stockEl = document.getElementById('filterStockStatus');
        if (stockEl && stored.stockStatus) stockEl.value = stored.stockStatus;

        const priceEl = document.getElementById('filterPriceRange');
        if (priceEl && stored.priceRange) priceEl.value = stored.priceRange;

        if (stored.sortKey) {
            currentSort.key = stored.sortKey;
            currentSort.asc = stored.sortAsc !== false;
        }
    } catch (_) { /* ignore malformed storage */ }
}

/** Persist pagination + filters in sessionStorage while Manage Products is active */
function persistProductListSessionState(force = false) {
    const manageSection = document.getElementById('view-manage-products');
    if (!force && (!manageSection || manageSection.style.display === 'none')) return;

    try {
        sessionStorage.setItem(PRODUCT_PAGINATION_STORAGE_KEY, JSON.stringify({
            page: currentPage,
            ...getProductFilterState()
        }));
    } catch (_) { /* ignore quota / private mode */ }
}

/** Strip legacy ?section= / ?page= query params so /admin stays clean on reload */
function ensureCleanAdminUrl() {
    if (!window.location.search && !window.location.hash) return;
    try {
        window.history.replaceState({}, document.title, window.location.pathname);
    } catch (_) { /* ignore */ }
}

/** Instant product list sync after edit/delete */
function removeProductFromState(productId) {
    const id = String(productId);
    globalProducts = globalProducts.filter(p => String(p._id) !== id);
    selectedProductIds.delete(productId);
    if (typeof updateBulkActionPanel === 'function') updateBulkActionPanel();
    if (productPg) productPg.stayOnPage();
    else filterAndRenderProducts(false);
}

function upsertProductInState(updatedProduct) {
    if (!updatedProduct || !updatedProduct._id) return;
    const id = String(updatedProduct._id);
    const idx = globalProducts.findIndex(p => String(p._id) === id);
    if (idx >= 0) {
        globalProducts[idx] = { ...globalProducts[idx], ...updatedProduct };
    } else {
        globalProducts.unshift(updatedProduct);
    }
    const totalBadge = document.getElementById('total-products-badge');
    if (totalBadge) totalBadge.innerText = `Total: ${globalProducts.length}`;
    loadCategoryFilter();
    restoreProductPaginationState();
    filterAndRenderProducts(false);
}

/** Instant order list sync after delete — preserve current page & filters */
function removeOrderFromState(orderId) {
    const id = String(orderId);
    globalOrders = globalOrders.filter(o => String(o._id) !== id);
    expandedOrderIds.delete(id);
    const totalOrderBadge = document.getElementById('total-orders-badge');
    if (totalOrderBadge) totalOrderBadge.innerText = `Total: ${globalOrders.length}`;
    applyOrderFilters(false);
}

/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    ensureAdminRealtimeToastStack,
    ensureAdminSocketStatusIndicator,
    setAdminSocketStatus,
    playAdminNotificationBeep,
    showAdminToast,
    formatTimeAgo,
    updateSidebarOrdersBadge,
    updateSidebarMessagesBadge,
    updateAdminNotifBellBadge,
    renderAdminNotifDropdown,
    pushAdminNotification,
    setupAdminNotifBell,
    isAdminSectionActive,
    initAdminSocket,
    showEnterpriseActionModal,
    getProdTableBody,
    getProductFilterState,
    saveProductPaginationState,
    restoreProductPaginationState,
    readProductListSessionState,
    persistProductListSessionState,
    ensureCleanAdminUrl,
    removeProductFromState,
    upsertProductInState,
    removeOrderFromState
});
