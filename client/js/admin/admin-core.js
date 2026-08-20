/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/admin-core.js
 * Description: Auth token handling, shared state, fetch/auth helpers, toasts, socket setup, and base UI router.
 */

window.token = localStorage.getItem('adminToken');
window.adminPollErrorCounts = {};
window.MAX_ADMIN_POLL_ERRORS = 3;
window.tableBody = document.getElementById('adminOrderTableBody') || document.getElementById('orderTableBody');
window.prodTableBody = document.getElementById('adminProductTableBody');
window.PRODUCT_PAGINATION_STORAGE_KEY = 'eob_admin_products_pagination';
window.itemsPerPage = 10;      // প্রতি পেজে ডিফল্ট প্রোডাক্ট সংখ্যা
window.expandedOrderIds = new Set();
window.ADMIN_TOAST_ICONS = {
    success: 'fa-circle-check',
    error: 'fa-circle-xmark',
    warning: 'fa-triangle-exclamation',
    info: 'fa-circle-info'
};
window.adminRealtimeToasts = [];
window.adminNotifHistory = [];
window.ADMIN_PAGE_META = {
    'view-overview':        { title: 'Dashboard Overview',      subtitle: 'Real-time monitoring engine for EonlineBazar platform.' },
    'view-customers':       { title: 'All Customers',           subtitle: 'Manage registered users, account status, and order history.' },
    'view-orders':          { title: 'Live Orders',             subtitle: 'Real-time monitoring engine for order processing.' },
    'view-add-product':     { title: 'Add New Product',         subtitle: 'Launch a new product with pricing, media, and inventory details.' },
    'view-manage-products': { title: 'Manage Products',         subtitle: 'Search, filter, export, and maintain your product catalog.' },
    'manage-category':      { title: 'Manage Categories',       subtitle: 'Organize products with dynamic category labels.' },
    'manage-brands':        { title: 'Manage Brands',           subtitle: 'Maintain brand names for catalog filtering and display.' },
    'manage-navbar-links':  { title: 'Navbar Menu Links',       subtitle: 'Manage top-bar promo links — categories stay in the ☰ All drawer.' },
    'manage-attributes':    { title: 'Product Attributes',      subtitle: 'Define attribute names and values (Size, Color, etc.).' },
    'manage-coupons':       { title: 'Manage Coupons',          subtitle: 'Create discount codes, set usage limits, and track redemptions.' },
    'view-security':        { title: 'Security Logs',           subtitle: 'Monitor authentication events and system security activity.' },
    'view-sessions':        { title: 'Active Devices & Sessions', subtitle: 'Review and remotely revoke logged-in admin devices.' },
    'view-audit':           { title: 'Security & Audit',         subtitle: 'Login history, intrusion attempts, and IP blacklist firewall.' },
    'view-master-settings': { title: 'System Settings',          subtitle: 'Configure shipping, notifications, loyalty rewards, and store integrations.' },
    'view-banners':          { title: 'Hero Banners',             subtitle: 'Upload and manage homepage banner slides, autoplay, and display settings.' },
    'view-messages':        { title: 'Messages / Inquiries',     subtitle: 'Customer contact form submissions from the storefront.' },
    'view-newsletter-subscribers': { title: 'Newsletter Subscribers', subtitle: 'Manage newsletter subscribers and filter by tags.' },
    'view-newsletter-campaigns':   { title: 'Email Campaigns',        subtitle: 'Create, test, and send newsletter email campaigns.' },
    'view-staff':           { title: 'Staff Management',         subtitle: 'Create staff accounts, assign permissions, and control access instantly.' },
    'view-file-manager':    { title: 'File Manager',             subtitle: 'Browse, search, and edit project files securely from the admin panel.' },
    'view-settings':        { title: 'Admin Settings',          subtitle: 'Manage your profile, store preferences, shipping rules, and branding.' }
};
window.allOrders = {};
window.allProducts = {};
window.globalProducts = [];
window.currentFilteredProducts = [];
window.allCustomers = [];
window.globalOrders = [];
window.currentInvoiceOrderId = null;
window.currentFilteredOrders = [];
window.growthChartInstance = null;
window.salesTrendChartInstance = null;
window.topProductsChartInstance = null;
window.dashboardAnalytics = null;
window.salesTrendPeriod = 'daily';
window.topProductsChartType = 'bar';
window.currentPage = 1;          // প্রোডাক্ট পেজের বর্তমান পেজ নম্বর
window.savedProductPageBeforeAction = null;
window.currentOrderPage = 1;     // অর্ডারের বর্তমান পেজ নম্বর
window.ordersPerPage = 10;       // প্রতি পেজে ডিফল্ট অর্ডারের সংখ্যা
window.currentOrderStatusFilter = 'all';
window.currentOrderSandboxFilter = 'all';
window.currentOrderDateFilter = '';
window.orderSearchDebounceTimer = null;
window.isStockAscending = true;
window.adminPlatformTimezone = 'Asia/Dhaka';
window.adminCurrencySymbol = '৳';
window.adminRewardSettings = { refundUndoWindowHours: 72 };
window.adminSocket = null;
window.adminSocketInitialized = false;
window.adminNotifUnread = 0;
window.sidebarOrdersCount = 0;
window.sidebarMessagesCount = 0;
window._catalogQuickEditSaveHandler = null;
window.customerSegmentFilter = 'all';
window.customerSegmentThresholds = null;
window.selectedCustomerIds = new Set();
window.customerPg = null;
window.productPg = null;
window.securityPg = null;
window.auditPg = null;
window.messagePg = null;
window.orderPg = null;
window.customerSearchQuery = '';
window.selectedMessageIds = new Set();
window.__liveClockTimer = null;
window.manualOrderCatalog = [];
window.manualOrderLines = [];
window.whatsappAlertPollTimer = null;
window.adminCourierConfig = { provider: 'steadfast', isConfigured: false, mockMode: true, supportsBooking: false };
window.selectedFilesAdd = new DataTransfer(); 
window.addProductCharCountersReady = false;
window.productHighlights = [];
window.aiGeneratedData = null;
window.globalCategories = [];
window.globalAttributes = [];
window.allCategories = [];
window.editingCategoryId = null;
window.categorySortable = null;
window.globalBrands = [];
window.globalNavbarLinks = [];
window.navbarLinkQuill = null;
window.globalCoupons = [];
window.couponStatusFilter = 'all';
window.currentSort = { key: 'productId', asc: false }; // ডিফল্ট সোর্টিং স্টেট
window.selectedProductIds = new Set();               // বাল্ক ডিলিটের জন্য চেক করা আইডি সেট
window.bulkImportSelectedFile = null;
window.selectedFilesEdit = new DataTransfer(); // এডিট মোডালের ইমেজ ট্র্যাকার
window._auditActiveTab = 'tab-login-history';
window.adminPaymentMethodsCache = [];
window.pmRemoveLogoFlag = false;
window.pmDragSourceId = null;
window.footerSettingsState = {
    copyrightText: '',
    columns: [],
    socialLinks: [],
    paymentGateways: [],
    paymentBadgesEnabled: true
};
window.pageContentCatalog = [];
window.pageContentQuill = null;
window.activePageSlug = '';
window.createPageSlugManual = false;
window.adminMessagesCache = [];
window.inquiryDetailActiveId = null;
window.messagesFilterTab = 'all';
window.messagesSearchQuery = '';

/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * Author: Abdul Karim
 * File: js/admin.js
 * Description: Unified Admin Engine - Combines Products, Orders, Customers, Analytics, Security & Settings.
 * Version: 2.0.0
 * Last Updated: June 2026
 */

/* ==========================================================================
   CORE MODULE 1: DASHBOARD SECURITY & INITIALIZATION (নিরাপত্তা ও প্রাথমিককরণ)
   ========================================================================== */

// ১.১: লোকাল স্টোরেজ থেকে অ্যাডমিন টোকেন সংগ্রহ

/* shared state: token lives on window (admin-core) */

// ১.২: টোকেন না থাকলে সরাসরি লগইন পেজে রিডাইরেক্ট (সিকিউরিটি গেটওয়ে)
if (!token) {
    window.location.replace('/admin-login');
}

/**
 * Shared admin API auth/rate-limit handler.
 * Returns 'rate_limited' | 'auth_failed' | 'forbidden' | 'ok' — never redirects on HTTP 429.
 */
function handleAdminApiAuthResponse(res, data = {}) {
    if (res.status === 429) {
        const msg = data.message || 'Too many requests — please wait and try again.';
        if (typeof showToast === 'function') showToast(msg, 'warning');
        return 'rate_limited';
    }
    // Only redirect on genuine 401 — not 403 (permission/geo/rate-limit side effects)
    if (res.status === 401) {
        localStorage.removeItem('adminToken');
        window.location.replace('/admin-login');
        return 'auth_failed';
    }
    if (res.status === 403) {
        const msg = data.message || 'Access denied.';
        if (typeof showToast === 'function') showToast(msg, 'warning');
        return 'forbidden';
    }
    return 'ok';
}

/** Track consecutive poll/API errors and pause auto-refresh after repeated failures. */

/* shared state: adminPollErrorCounts lives on window (admin-core) */

/* shared state: MAX_ADMIN_POLL_ERRORS lives on window (admin-core) */

function trackAdminPollError(pollKey, res) {
    if (!adminPollErrorCounts[pollKey]) adminPollErrorCounts[pollKey] = 0;

    if (res && res.status === 429) {
        adminPollErrorCounts[pollKey]++;
        if (adminPollErrorCounts[pollKey] >= MAX_ADMIN_POLL_ERRORS) {
            console.warn(`[Admin] Too many 429s on ${pollKey}, pausing auto-refresh`);
            return true;
        }
        return false;
    }
    if (res && !res.ok) {
        adminPollErrorCounts[pollKey]++;
        return adminPollErrorCounts[pollKey] >= MAX_ADMIN_POLL_ERRORS;
    }
    adminPollErrorCounts[pollKey] = 0;
    return false;
}

function resetAdminPollErrors(pollKey) {
    adminPollErrorCounts[pollKey] = 0;
}

/**
 * ১.৩: ব্যাকএন্ডের সাথে অ্যাডমিন টোকেন লাইভ ভেরিফিকেশন করা
 * ড্যাশবোর্ড লোড হওয়ার সময় ব্যাকএন্ড API-এর মাধ্যমে চেক করে টোকেনটি আসল ও সচল কিনা
 */
async function verifyAdminTokenOnLoad() {
    try {
        const res = await fetch('/api/admin/verify-token', {
            method: 'GET',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        const data = await res.json();

        const authResult = handleAdminApiAuthResponse(res, data);
        if (authResult === 'rate_limited' || authResult === 'auth_failed') {
            return;
        }

        if (!res.ok || !data.success) {
            console.warn('Admin token verification failed:', data.message || res.status);
            return;
        }

        initAdminSocket();
    } catch (err) {
        console.error("Security Verification Critical Error:", err);
        // সার্ভার ডাউন বা কানেকশন এরর হলে নিরাপত্তা স্বার্থে কনসোলে এরর দেখানো
    }
}

/* ==========================================================================
   CORE MODULE 2: GLOBAL VARIABLES & STATE MANAGEMENT (গ্লোবাল স্টেট ও ভেরিয়েবল)
   ========================================================================== */

// ২.১: ডম (DOM) এলিমেন্ট রেফারেন্স সমূহ

/* shared state: tableBody lives on window (admin-core) */

/* shared state: prodTableBody lives on window (admin-core) */

// ২.২: গ্লোবাল ডাটা স্টোরেজ (State)

/* shared state: allOrders lives on window (admin-core) */

/* shared state: allProducts lives on window (admin-core) */

/* shared state: globalProducts lives on window (admin-core) */

/* shared state: currentFilteredProducts lives on window (admin-core) */

/* shared state: allCustomers lives on window (admin-core) */

/* shared state: globalOrders lives on window (admin-core) */

/* shared state: currentInvoiceOrderId lives on window (admin-core) */

/* shared state: currentFilteredOrders lives on window (admin-core) */

// ২.৩: চার্ট এবং পেজিনেশন কন্ট্রোল ভেরিয়েবল

/* shared state: growthChartInstance lives on window (admin-core) */

/* shared state: salesTrendChartInstance lives on window (admin-core) */

/* shared state: topProductsChartInstance lives on window (admin-core) */

/* shared state: dashboardAnalytics lives on window (admin-core) */

/* shared state: salesTrendPeriod lives on window (admin-core) */

/* shared state: topProductsChartType lives on window (admin-core) */

/* shared state: currentPage lives on window (admin-core) */

/* shared state: PRODUCT_PAGINATION_STORAGE_KEY lives on window (admin-core) */

/* shared state: savedProductPageBeforeAction lives on window (admin-core) */

/* shared state: itemsPerPage lives on window (admin-core) */

/* shared state: currentOrderPage lives on window (admin-core) */

/* shared state: ordersPerPage lives on window (admin-core) */

/* shared state: currentOrderStatusFilter lives on window (admin-core) */

/* shared state: currentOrderSandboxFilter lives on window (admin-core) */

/* shared state: currentOrderDateFilter lives on window (admin-core) */

/* shared state: orderSearchDebounceTimer lives on window (admin-core) */

/* shared state: expandedOrderIds lives on window (admin-core) */

/* shared state: isStockAscending lives on window (admin-core) */

/* shared state: adminPlatformTimezone lives on window (admin-core) */

/* shared state: adminCurrencySymbol lives on window (admin-core) */

/* shared state: adminRewardSettings lives on window (admin-core) */

/** Format a monetary amount using the admin-configured currency symbol */
function formatAdminPrice(amount) {
    const sym = adminCurrencySymbol || '৳';
    const num = Number(amount);
    if (Number.isNaN(num)) return `${sym} 0`;
    return `${sym} ${num.toLocaleString()}`;
}

function getOrderGrandTotal(order) {
    return Number(order?.grandTotal ?? order?.totalAmount) || 0;
}

function cacheAdminRewardSettings(settings) {
    if (!settings) return;
    adminRewardSettings = {
        refundUndoWindowHours: Number(settings.refundUndoWindowHours ?? adminRewardSettings.refundUndoWindowHours ?? 72)
    };
}

function isWithinRefundUndoWindowClient(refundedAt, windowHours) {
    const hours = Number(windowHours);
    if (!refundedAt || hours <= 0) return false;

    const refunded = new Date(refundedAt);
    if (Number.isNaN(refunded.getTime())) return false;

    const elapsedMs = Date.now() - refunded.getTime();
    return elapsedMs >= 0 && elapsedMs <= hours * 60 * 60 * 1000;
}

function canUndoRefund(order) {
    if (!order) return false;

    const statusLower = String(order.status || '').toLowerCase();
    if (statusLower !== 'returned' && statusLower !== 'refunded') return false;

    const windowHours = adminRewardSettings.refundUndoWindowHours ?? 72;
    const refundedAt = order.refundedAt || order.updatedAt;
    return isWithinRefundUndoWindowClient(refundedAt, windowHours);
}

/** Format a signed profit/loss delta (e.g. +৳ 120) */
function formatAdminProfit(amount) {
    const sym = adminCurrencySymbol || '৳';
    const num = Number(amount) || 0;
    const sign = num >= 0 ? '+' : '-';
    return `${sign}${sym}${Math.abs(num).toLocaleString()}`;
}

/** Collect positive numeric values from variant rows (sell or buy price). */
function collectPositiveVariantPrices(product, field) {
    const variants = Array.isArray(product?.variants) ? product.variants : [];
    return variants
        .map(v => Number(v[field]))
        .filter(p => Number.isFinite(p) && p > 0);
}

/** Minimum positive variant price for a field, with product-level fallback. */
function getVariantMinPrice(product, field, fallback = 0) {
    const prices = collectPositiveVariantPrices(product, field);
    if (prices.length) return Math.min(...prices);
    const fb = Number(fallback) || 0;
    return fb > 0 ? fb : 0;
}

function isVariantMatrixProduct(product) {
    if (!product) return false;
    if (product.hasVariants === true && Array.isArray(product.variants) && product.variants.length > 0) {
        return true;
    }
    return productUsesVariantMatrix(product);
}

/** Table cell HTML for sell/buy columns (simple product vs variant matrix). */
function buildProductTablePriceCells(product) {
    const isVariant = isVariantMatrixProduct(product);

    if (isVariant) {
        const minSell = getVariantMinPrice(product, 'price', product.price);
        const minBuy = getVariantMinPrice(product, 'buyingPrice', 0);
        const sellPriceHtml = `<b>${formatAdminPrice(minSell)}</b>`;

        let buyPriceHtml;
        if (minBuy > 0) {
            const unitProfit = minSell - minBuy;
            const profitClass = unitProfit >= 0 ? 'profit-positive' : 'profit-negative';
            buyPriceHtml = `${formatAdminPrice(minBuy)} <span class="unit-profit ${profitClass}">${formatAdminProfit(unitProfit)}</span>`;
        } else {
            buyPriceHtml = `<span class="buy-price-empty" title="Set buying prices on variant matrix rows">—</span>`;
        }

        return { sellPriceHtml, buyPriceHtml };
    }

    const buyingPrice = Number(product.buyingPrice) || 0;
    const sellingPrice = Number(product.price) || 0;
    const sellPriceHtml = `<b>${formatAdminPrice(sellingPrice)}</b>`;

    let buyPriceHtml;
    if (buyingPrice > 0) {
        const unitProfit = sellingPrice - buyingPrice;
        const profitClass = unitProfit >= 0 ? 'profit-positive' : 'profit-negative';
        buyPriceHtml = `${formatAdminPrice(buyingPrice)} <span class="unit-profit ${profitClass}">${formatAdminProfit(unitProfit)}</span>`;
    } else {
        buyPriceHtml = `<span class="buy-price-empty" title="Set a buying price for accurate profit">—</span>`;
    }

    return { sellPriceHtml, buyPriceHtml };
}

/* ==========================================================================
   CORE MODULE 3: UI UTILITIES - TOASTR & SWEETALERT2
   ========================================================================== */

function initAdminNotifications() {
    if (!document.getElementById('toastContainer')) {
        const container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'admin-toast-stack';
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('aria-atomic', 'true');
        document.body.appendChild(container);
    }
}

/* shared state: ADMIN_TOAST_ICONS lives on window (admin-core) */

function escapeToastText(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Modern floating toast notifications for the admin dashboard.
 */
window.showToast = function(message, type = 'success', durationMs = 4000) {
    initAdminNotifications();
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toastType = Object.prototype.hasOwnProperty.call(ADMIN_TOAST_ICONS, type) ? type : 'info';
    const toast = document.createElement('div');
    toast.className = `admin-toast ${toastType}`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
        <i class="fa-solid ${ADMIN_TOAST_ICONS[toastType]} admin-toast-icon" aria-hidden="true"></i>
        <span class="admin-toast-message">${escapeToastText(message)}</span>
        <button type="button" class="admin-toast-close" aria-label="Dismiss notification">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add('is-visible'));
    });

    let dismissed = false;
    const dismiss = () => {
        if (dismissed) return;
        dismissed = true;
        toast.classList.remove('is-visible');
        toast.classList.add('is-leaving');
        window.setTimeout(() => toast.remove(), 350);
    };

    toast.querySelector('.admin-toast-close')?.addEventListener('click', dismiss);
    window.setTimeout(dismiss, Math.max(Number(durationMs) || 0, 1000));
};

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
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            title: title || 'Are you sure?',
            text: message,
            icon: type === 'danger' ? 'warning' : 'question',
            showCancelButton: true,
            confirmButtonText: 'Yes, Proceed',
            cancelButtonText: 'Cancel',
            confirmButtonColor: type === 'danger' ? '#ef4444' : '#3b82f6',
            cancelButtonColor: '#94a3b8',
            reverseButtons: true
        }).then((result) => {
            if (result.isConfirmed && onConfirm) onConfirm();
        });
        return;
    }

    const modal = document.getElementById('customConfirmModal');
    if (!modal) return;
    
    const titleEl = document.getElementById('confirmTitle');
    const messageEl = document.getElementById('confirmMessage');
    const iconBox = document.getElementById('confirmIconBox');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    const confirmBtn = document.getElementById('confirmSuccessBtn');

    titleEl.innerText = title;
    messageEl.innerText = message;
    
    // টাইপ অনুযায়ী ডেঞ্জার বা ওয়ার্নিং আইকন সেটআপ
    iconBox.className = `confirm-icon-box ${type}`;
    iconBox.innerHTML = type === 'danger' 
        ? '<i class="fa-solid fa-triangle-exclamation"></i>' 
        : '<i class="fa-solid fa-circle-question"></i>';
        
    confirmBtn.className = type === 'danger' ? 'btn-confirm danger-action' : 'btn-confirm';

    // মডাল প্রদর্শন
    modal.style.display = 'flex';

    // ইভেন্ট লিসেনার ওভারল্যাপিং এড়াতে নোড ক্লোন করা
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    // ইভেন্ট লিসেনার যুক্তকরণ
    newCancelBtn.addEventListener('click', () => modal.style.display = 'none');
    newConfirmBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        if (onConfirm) onConfirm();
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

/* ==========================================================================
   ADMIN PAGE METADATA (সেকশন অনুযায়ী হেডার টাইটেল আপডেট)
   ========================================================================== */

/* shared state: ADMIN_PAGE_META lives on window (admin-core) */

function updateAdminPageHeader(sectionId, fallbackLabel) {
    const meta = ADMIN_PAGE_META[sectionId];
    const mainTitle = document.getElementById('page-main-title');
    const subTitle = document.getElementById('page-sub-title');
    if (mainTitle) mainTitle.textContent = meta ? meta.title : (fallbackLabel || 'Dashboard');
    if (subTitle) subTitle.textContent = meta ? meta.subtitle : '';
}

/**
 * ক্যাটালগ আইটেম এডিটের জন্য পেশাদার ইনলাইন মোডাল (native prompt এর বিকল্প)
 */

/* shared state: _catalogQuickEditSaveHandler lives on window (admin-core) */

window.openCatalogQuickEdit = function({ title, label, value, placeholder, hint, focusMode, onSave }) {
    const modal = document.getElementById('catalogQuickEditModal');
    const input = document.getElementById('cqeInput');
    const hintEl = document.getElementById('cqeHint');
    if (!modal || !input) return;

    document.getElementById('cqeTitle').textContent = title || 'Edit Item';
    document.getElementById('cqeLabel').textContent = label || 'Name';
    input.value = value || '';
    input.placeholder = placeholder || '';
    if (hintEl) {
        if (hint) {
            hintEl.textContent = hint;
            hintEl.style.display = 'block';
        } else {
            hintEl.textContent = '';
            hintEl.style.display = 'none';
        }
    }
    _catalogQuickEditSaveHandler = onSave;

    const saveBtn = document.getElementById('cqeSaveBtn');
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    newSaveBtn.addEventListener('click', async () => {
        const val = input.value.trim();
        if (!val) return showToast('Please enter a value.', 'warning');
        if (typeof _catalogQuickEditSaveHandler === 'function') {
            await _catalogQuickEditSaveHandler(val);
        }
    });

    modal.style.display = 'flex';
    input.focus();
    if (focusMode === 'end') {
        const len = input.value.length;
        input.setSelectionRange(len, len);
    } else {
        input.select();
    }
};

window.closeCatalogQuickEdit = function() {
    const modal = document.getElementById('catalogQuickEditModal');
    if (modal) modal.style.display = 'none';
    _catalogQuickEditSaveHandler = null;
};

function getOrderCountBadge(count) {
    const n = Number(count) || 0;
    const cls = n === 0 ? 'order-count-badge zero' : 'order-count-badge';
    return `<span class="${cls}">${n} order${n !== 1 ? 's' : ''}</span>`;
}

function getCustomerSegmentBadge(user) {
    if (user.isVip) {
        return '<span class="segment-badge segment-badge--vip"><i class="fa-solid fa-crown"></i> VIP / Top Buyer</span>';
    }
    if (user.isFrequentBuyer) {
        return '<span class="segment-badge segment-badge--frequent"><i class="fa-solid fa-repeat"></i> Frequent Buyer</span>';
    }
    return '<span class="segment-badge segment-badge--standard">Standard</span>';
}

/* shared state: customerSegmentFilter lives on window (admin-core) */

/* shared state: customerSegmentThresholds lives on window (admin-core) */

/* shared state: selectedCustomerIds lives on window (admin-core) */

/** Unified pagination instances */

/* shared state: customerPg lives on window (admin-core) */

/* shared state: productPg lives on window (admin-core) */

/* shared state: securityPg lives on window (admin-core) */

/* shared state: auditPg lives on window (admin-core) */

/* shared state: messagePg lives on window (admin-core) */

/* shared state: orderPg lives on window (admin-core) */

/* shared state: customerSearchQuery lives on window (admin-core) */

/* shared state: selectedMessageIds lives on window (admin-core) */

function initAdminPaginationInstances() {
    if (typeof AdminPagination === 'undefined') return;

    if (!customerPg && document.getElementById('customer-pg-btns')) {
        customerPg = new AdminPagination({
            containerId: 'customer-pg-btns',
            infoId: 'customer-pg-info',
            countId: 'customer-total-count',
            limitSelectId: 'customer-pg-limit',
            defaultLimit: 10,
            onPageChange: (page, limit) => fetchCustomers(page, limit)
        });
        window.customerPg = customerPg;
    }

    if (!productPg && document.getElementById('product-pg-btns')) {
        productPg = new AdminPagination({
            containerId: 'product-pg-btns',
            infoId: 'product-pg-info',
            countId: 'product-total-count',
            limitSelectId: 'product-pg-limit',
            defaultLimit: 10,
            onPageChange: (page, limit) => {
                currentPage = page;
                renderProductTable();
            }
        });
        window.productPg = productPg;
    }

    if (!securityPg && document.getElementById('security-pg-btns')) {
        securityPg = new AdminPagination({
            containerId: 'security-pg-btns',
            infoId: 'security-pg-info',
            countId: 'security-total-count',
            limitSelectId: 'security-pg-limit',
            defaultLimit: 25,
            onPageChange: (page, limit) => fetchSecurityLogs(page, limit)
        });
        window.securityPg = securityPg;
    }

    if (!auditPg && document.getElementById('audit-pg-btns')) {
        auditPg = new AdminPagination({
            containerId: 'audit-pg-btns',
            infoId: 'audit-pg-info',
            countId: 'audit-total-count',
            limitSelectId: 'audit-pg-limit',
            defaultLimit: 25,
            onPageChange: (page, limit) => fetchAuditLogs(page, limit)
        });
        window.auditPg = auditPg;
    }

    if (!messagePg && document.getElementById('message-pg-btns')) {
        messagePg = new AdminPagination({
            containerId: 'message-pg-btns',
            infoId: 'message-pg-info',
            countId: 'message-total-count',
            limitSelectId: 'message-pg-limit',
            defaultLimit: 10,
            onPageChange: (page, limit) => renderMessagesPage(page, limit)
        });
        window.messagePg = messagePg;
    }

    if (!orderPg && document.getElementById('order-pg-btns')) {
        orderPg = new AdminPagination({
            containerId: 'order-pg-btns',
            infoId: 'order-pg-info',
            countId: 'order-total-count',
            limitSelectId: 'order-pg-limit',
            defaultLimit: ordersPerPage || 10,
            onPageChange: () => renderOrderTable()
        });
        window.orderPg = orderPg;
    }
}

window.fetchCustomers = function fetchCustomers(page, limit) {
    initAdminPaginationInstances();
    const pg = customerPg;
    const effectivePage = page ?? pg?.currentPage ?? 1;
    const effectiveLimit = limit ?? pg?.currentLimit ?? 10;

    if (pg) {
        pg.currentPage = effectivePage;
        pg.currentLimit = effectiveLimit;
    }

    const filtered = filterCustomersBySegment(allCustomers, customerSegmentFilter)
        .filter((user) => {
            const q = customerSearchQuery.trim().toLowerCase();
            if (!q) return true;
            const haystack = [
                user.name,
                user.email,
                user.mobile,
                user.phone,
                user._id
            ].map((v) => String(v || '').toLowerCase()).join(' ');
            return haystack.includes(q);
        });
    const start = (effectivePage - 1) * effectiveLimit;
    const slice = filtered.slice(start, start + effectiveLimit);

    renderCustomerTable(slice, filtered.length);
    if (pg) pg.setTotal(filtered.length);
};

function filterCustomersBySegment(customers, segment = customerSegmentFilter) {
    const list = Array.isArray(customers) ? customers : [];
    if (segment === 'vip') return list.filter((user) => user.isVip);
    if (segment === 'frequent') return list.filter((user) => user.isFrequentBuyer);
    return list;
}

function setupCustomerSegmentTabs() {
    const tabs = document.querySelectorAll('#customerSegmentTabs .segment-tab');
    tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            customerSegmentFilter = tab.getAttribute('data-segment') || 'all';
            tabs.forEach((btn) => btn.classList.toggle('active', btn === tab));
            selectedCustomerIds.clear();
            updateCustomersBulkToolbar();
            if (customerPg) customerPg.resetPage();
            fetchCustomers(1, customerPg?.currentLimit);
        });
    });

    const searchInput = document.getElementById('customerSearchInput');
    if (searchInput && !searchInput.dataset.bound) {
        searchInput.dataset.bound = '1';
        let debounceTimer;
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                customerSearchQuery = searchInput.value;
                if (customerPg) customerPg.resetPage();
                fetchCustomers(1, customerPg?.currentLimit);
            }, 300);
        });
    }
}

/* ==========================================================================
   CORE MODULE 4: SPA ROUTER ENGINE (সিঙ্গেল পেজ নেভিগেশন সিস্টেম)
   ========================================================================== */

/**
 * ৪.১: সাইডবার মেনু নেভিগেশন সেটআপ
 */
function setupAdminSPARouter() {
    const menuItems = document.querySelectorAll('.sidebar-menu li');
    
    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const link = item.querySelector('a');
            const targetId = link ? link.getAttribute('href').replace('#', '') : item.getAttribute('data-target');
            
            if (!targetId) return;
            if (link) e.preventDefault(); // হ্যাশট্যাগ ইউআরএল চেঞ্জ হওয়া বন্ধ করা

            // অ্যাক্টিভ ক্লাস রিমুভ ও অ্যাড করা
            menuItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            // মূল ভিউ পরিবর্তন ফাংশন কল করা
            switchDashboardView(targetId, item.innerText.trim());
        });
    });
}

/**
 * ৪.২: ডাইনামিক সেকশন সুইচিং এবং লাইভ ডাটা লোড
 * @param {string} sectionId - যে সেকশনটি অন হবে
 * @param {string} sectionTitle - পেজের মূল টাইটেল টেক্সট
 */
function switchDashboardView(sectionId, sectionTitle) {
    // সব সেকশন হাইড করা
    const allSections = document.querySelectorAll('.admin-section, .spa-section');
    allSections.forEach(sec => {
        sec.style.display = 'none';
        sec.classList.remove('active');
    });

    // টার্গেটেড সেকশনটি শো করা
    const targetSection = document.getElementById(sectionId) || document.getElementById(`view-${sectionId}`);
    if (targetSection) {
        targetSection.style.display = 'block';
        targetSection.classList.add('active');
    }

    // পেজ হেডার বা মেইন টাইটেল আপডেট করা
    const mainTitle = document.getElementById('page-main-title') || document.getElementById('page-title');
    if (mainTitle) {
        mainTitle.innerText = sectionTitle || 'Dashboard';
    }

    // নির্দিষ্ট পেজে ইউজার গেলে তাৎক্ষণিকভাবে ডাটাবেজ থেকে লাইভ রিফ্রেশ করা
    if (sectionId === 'manage-products-section' || sectionId === 'products') fetchLiveProducts();
    if (sectionId === 'manage-orders-section' || sectionId === 'orders') fetchLiveOrders();
    if (sectionId === 'overview' || sectionId === 'dashboard-overview') fetchDashboardData();
    if (sectionId === 'view-customers' || sectionId === 'customers') fetchDashboardData();
}



window.uploadAdminProfilePic = async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    // লোকাল প্রিভিউ দেখানো
    const reader = new FileReader();
    reader.onload = function(e) {
        updateAdminProfileUI({ image: e.target.result });
    };
    reader.readAsDataURL(file);

    // সার্ভারে আপলোড করার লজিক
    const formData = new FormData();
    formData.append('profilePic', file);

    try {
        const res = await fetch('/api/admin/update-profile-pic', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const result = await res.json();
        
        if (result.success) {
            showToast("Profile picture updated successfully!", "success");
            localStorage.setItem('adminProfilePic', result.imageUrl);
            updateAdminProfileUI({ image: result.imageUrl });
        } else {
            showToast("Failed to upload picture.", "error");
        }
    } catch (error) {
        showToast("Error uploading profile picture.", "error");
    }
};

/**
 * ১৩.২: অ্যাডমিন লগআউট প্রসেস
 * Always finishes at /admin/logout (revokes AdminSession, clears storage/cookies,
 * redirects to /admin/login). No OTP/2FA state is required — works with the bypass.
 */
window.logout = function() {
    const goLogout = () => {
        try { showToast("Logging out...", "info"); } catch (e) { /* never block logout */ }
        window.location.href = '/admin/logout';
    };

    try {
        if (typeof showCustomConfirm === 'function') {
            showCustomConfirm(
                "Logout",
                "Are you sure you want to securely log out of the admin panel?",
                goLogout,
                "danger"
            );
            return;
        }
    } catch (err) {
        console.error('Logout confirm error:', err);
    }
    goLogout();
};

/**
 * ১৩.৩: সিস্টেম இனிশিয়ালাইজেশন (SYSTEM BOOT)
 * ড্যাশবোর্ড লোড হওয়ার সাথে সাথে এই ফাংশনটি রান করে পুরো সিস্টেম সচল করবে
 */
function initDashboard() {
    verifyAdminTokenOnLoad();
    initAdminNotifications();
    updateDashboardDate();
    startLiveClock();
    setupHeaderDatePicker();
    setupAdminSettingsForms();
    setupManualOrderEngine();
    setupWhatsAppAlertBadge();
    fetchAdminSettings();
    if (typeof loadSandboxStatus === 'function') loadSandboxStatus();

    // ২. লোকাল স্টোরেজ থেকে প্রোফাইল পিকচার সেট করা (যদি আগে থেকে থাকে)
    const savedPic = localStorage.getItem('adminProfilePic');
    if (savedPic) {
        updateAdminProfileUI({ image: savedPic });
    }

    // ৩. কোর মডিউলগুলোর ডাটা সার্ভার থেকে সিঙ্ক করা
    fetchDashboardData();   // ওভারভিউ এবং কাস্টমার ডাটা
    initAdminPaginationInstances();
    fetchLiveOrders();      // লাইভ অর্ডারস
    fetchLiveProducts();    // ম্যানেজ প্রোডাক্টস ডাটা
    fetchSecurityLogs();    // সিকিউরিটি লগস
    setupAnalyticsChartToggles();
    setupCustomerSegmentTabs();
    if (typeof updateBulkActionPanel === 'function') updateBulkActionPanel();
}

/* ==========================================================================
   EVENT LISTENERS & LIFECYCLE HOOKS
   ========================================================================== */

// DOM সম্পূর্ণ লোড হওয়ার পর সিস্টেম বুট করা
document.addEventListener('DOMContentLoaded', () => {
    ensureCleanAdminUrl();
    initAdminPaginationInstances();
    initDashboard();
    setupSidebarNavigation();
    setupGlobalSearch();
    setupSyncButton();

    if (window.location.pathname.replace(/\/+$/, '') === '/admin/messages') {
        const messagesNav = document.querySelector('[data-target="view-messages"]');
        if (messagesNav) navigateAdminSection('view-messages', messagesNav);
    }

    if (window.location.pathname.replace(/\/+$/, '') === '/admin/navbar-links') {
        const navbarLinksNav = document.querySelector('[data-target="manage-navbar-links"]');
        if (navbarLinksNav) navigateAdminSection('manage-navbar-links', navbarLinksNav);
    }

    if (window.location.pathname.replace(/\/+$/, '') === '/admin/file-manager') {
        const fileManagerNav = document.querySelector('[data-target="view-file-manager"]');
        if (fileManagerNav) navigateAdminSection('view-file-manager', fileManagerNav);
    }

    const profileUploadInput = document.getElementById('profileUploadInput');
    if (profileUploadInput && !profileUploadInput.dataset.bound) {
        profileUploadInput.dataset.bound = '1';
        profileUploadInput.addEventListener('change', uploadAdminProfilePic);
    }

    fetchCategories();
    fetchBrands();
    fetchAttributes();
    setupNavbarLinkForm();
    setupCouponForm();
    initAddProductFormUI();
});

/* ==========================================================================
   SECTION 14: SIDEBAR NAVIGATION (মেনু ট্যাব কন্ট্রোলার)
   ========================================================================== */

function navigateAdminSection(targetId, clickedItem) {
    if (!targetId) return;

    const menuItems = document.querySelectorAll('.sidebar-menu li[data-target]');
    const menuGroups = document.querySelectorAll('.sidebar-menu li.menu-group');
    const sections = document.querySelectorAll('.admin-section');

    menuItems.forEach(item => item.classList.remove('active'));
    menuGroups.forEach(g => g.classList.remove('child-active'));

    if (clickedItem) clickedItem.classList.add('active');

    const parentGroup = clickedItem ? clickedItem.closest('.menu-group') : null;
    if (parentGroup) parentGroup.classList.add('open', 'child-active');

    sections.forEach(section => {
        section.style.display = 'none';
        section.classList.remove('active');
    });

    const targetSection = document.getElementById(targetId);
    if (targetSection) {
        targetSection.style.display = 'block';
        targetSection.classList.add('active');
    }

    const label = clickedItem ? clickedItem.textContent.trim() : '';
    updateAdminPageHeader(targetId, label);

    const refreshMap = {
        'view-orders': fetchLiveOrders,
        'view-manage-products': () => {
            loadCategoryFilter();
            fetchLiveProducts();
        },
        'view-customers': () => {
            initAdminPaginationInstances();
            fetchDashboardData();
        },
        'view-overview': fetchDashboardData,
        'manage-category': loadCategories,
        'manage-brands': fetchBrands,
        'manage-navbar-links': fetchNavbarLinks,
        'manage-attributes': fetchAttributes,
        'manage-coupons': fetchCoupons,
        'view-security': fetchSecurityLogs,
        'view-sessions': fetchAdminSessions,
        'view-audit': initAuditView,
        'view-master-settings': fetchMasterSettings,
        'view-banners': () => window.loadBanners && window.loadBanners(),
        'view-messages': fetchAdminMessages,
        'view-newsletter-subscribers': () => window.loadNewsletterSubscribersSection && window.loadNewsletterSubscribersSection(),
        'view-newsletter-campaigns': () => window.loadNewsletterCampaignsSection && window.loadNewsletterCampaignsSection(),
        // Staff Management lives in js/admin-staff.js (Super Admin only)
        'view-staff': () => window.loadStaffSection && window.loadStaffSection(),
        // File Manager lives in js/admin-file-manager.js (Super Admin only)
        'view-file-manager': () => window.loadFileManagerSection && window.loadFileManagerSection(),
        'view-settings': fetchAdminSettings
    };
    if (typeof refreshMap[targetId] === 'function') {
        if (targetId === 'view-manage-products') readProductListSessionState();
        refreshMap[targetId]();
    }

    if (targetId === 'view-add-product') {
        initAddProductFormUI();
        loadCategoryDropdownForProduct('prodCategory');
    }
}
window.navigateAdminSection = navigateAdminSection;

function setupSidebarNavigation() {
    const nav = document.querySelector('.sidebar-menu');
    if (!nav) return;

    nav.addEventListener('click', (e) => {
        const toggle = e.target.closest('.catalog-toggle');
        if (toggle) {
            e.preventDefault();
            e.stopPropagation();
            const group = toggle.closest('.menu-group');
            if (group) group.classList.toggle('open');
            return;
        }

        const item = e.target.closest('li[data-target]');
        if (!item || !nav.contains(item)) return;

        e.preventDefault();
        e.stopPropagation();
        navigateAdminSection(item.getAttribute('data-target'), item);
    });
}

/* ==========================================================================
   SECTION 15: GLOBAL SEARCH BAR (টপ হেডারের সার্চ ইঞ্জিন)
   ========================================================================== */

function setupGlobalSearch() {
    // আপনার HTML এর সার্চ ইনপুট ID 'adminSearchInput'
    const globalSearchInput = document.getElementById('adminSearchInput'); 

    if (globalSearchInput) {
        globalSearchInput.addEventListener('input', function(e) {
            const query = e.target.value.toLowerCase().trim();

            // বর্তমানে স্ক্রিনে কোন সেকশনটি ওপেন আছে তা খুঁজে বের করা
            const activeSection = document.querySelector('.admin-section[style*="display: block"]') || document.querySelector('.admin-section.active');

            if (!activeSection) return;

            // যদি Live Orders পেজে থাকেন
            if (activeSection.id === 'view-orders') {
                const orderSearch = getOrderSearchInputEl();
                if (orderSearch) {
                    orderSearch.value = query;
                    if (typeof debounceSearch === 'function') debounceSearch();
                }
            } 
            // যদি Manage Products পেজে থাকেন
            else if (activeSection.id === 'view-manage-products') {
                const productSearch = document.getElementById('searchProduct');
                if (productSearch) {
                    productSearch.value = query;
                    if (typeof filterAndRenderProducts === 'function') filterAndRenderProducts();
                }
            }
            // যদি All Customers পেজে থাকেন
            else if (activeSection.id === 'view-customers') {
                const customerSearch = document.getElementById('customerSearchInput');
                if (customerSearch) {
                    customerSearch.value = query;
                    customerSearchQuery = query;
                    if (customerPg) customerPg.resetPage();
                    if (typeof fetchCustomers === 'function') fetchCustomers(1, customerPg?.currentLimit);
                }
            }
        });
    }
}

/* ==========================================================================
   SECTION 16: SYNC DATA BUTTON (টপ হেডারের সিঙ্ক/রিফ্রেশ বাটন)
   ========================================================================== */

function setupSyncButton() {
    const syncBtn = document.getElementById('refreshDataBtn');
    if (!syncBtn) return;

    syncBtn.addEventListener('click', async function() {
        if (this.disabled) return;
        this.disabled = true;

        const icon = this.querySelector('i');
        if (icon) icon.classList.add('fa-spin');

        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'Syncing data…',
                html: 'Flushing expired coupons &amp; fetching latest dashboard, orders, products &amp; catalog',
                allowOutsideClick: false,
                allowEscapeKey: false,
                didOpen: () => Swal.showLoading()
            });
        }

        try {
            await runAdminDataSync();

            await Promise.all([
                typeof fetchDashboardData === 'function' ? fetchDashboardData() : Promise.resolve(),
                typeof fetchLiveOrders === 'function' ? fetchLiveOrders() : Promise.resolve(),
                typeof fetchLiveProducts === 'function' ? fetchLiveProducts() : Promise.resolve(),
                typeof fetchCategories === 'function' ? fetchCategories() : Promise.resolve(),
                typeof loadCategories === 'function' ? loadCategories() : Promise.resolve(),
                typeof fetchBrands === 'function' ? fetchBrands() : Promise.resolve(),
                typeof fetchAttributes === 'function' ? fetchAttributes() : Promise.resolve(),
                typeof fetchSecurityLogs === 'function' ? fetchSecurityLogs() : Promise.resolve()
            ]);

            if (typeof Swal !== 'undefined') Swal.close();
            showAdminSuccess('Data Synchronized Successfully', 'Expired coupons flushed, dashboard, orders, products & catalog are up to date.');
        } catch (error) {
            console.error('Sync Error:', error);
            if (typeof Swal !== 'undefined') Swal.close();
            showToast('Sync failed. Check your connection.', 'error');
        } finally {
            this.disabled = false;
            if (icon) icon.classList.remove('fa-spin');
        }
    });
}

/* ==========================================================================
  SECTION 17 SYSTEM INITIALIZATION (সব কন্ট্রোলার একসাথে চালু করা)
   ========================================================================== */

/* ==========================================================================
   SECTION 18: Logout
   ========================================================================== */

// Sidebar logout: prefer the native <a href="/admin/logout"> navigation so
// sign-out still works if showToast / other dashboard JS throws.
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
        // Let the href handle navigation; only intercept if we need a confirm.
        // Default path: go straight to /admin/logout (full cleanup + redirect).
        e.preventDefault();
        try {
            if (typeof window.logout === 'function') {
                window.logout();
                return;
            }
        } catch (err) {
            console.error('Logout handler error:', err);
        }
        window.location.href = '/admin/logout';
    });
}

// =========================================================================
// SECTION 19: 🌟 ADMIN PROFILE PICTURE & AUTO-REFRESH MANAGEMENT SYSTEM 🌟
// =========================================================================

/**
 * ১. ডাটাবেজ থেকে অ্যাডমিন প্রোফাইল ছবি লোড করার ফাংশন
 * পেজ যখনই রিফ্রেশ বা নতুন করে লোড হবে, এই ফাংশনটি ডাটাবেজ থেকে লেটেস্ট ছবি এনে দেখাবে।
 */
function updateAdminProfileUI(adminData = {}) {
    const avatarImg = document.getElementById('adminProfilePic');
    const nameEl = document.querySelector('.admin-profile .info h4');
    const roleEl = document.querySelector('.admin-profile .info p');
    const displayName = adminData.name || adminData.username || 'Admin';
    const avatarUrl = adminData.image || adminData.avatar || adminData.avatarUrl || adminData.profileImage;

    if (nameEl) nameEl.textContent = displayName;
    if (roleEl) roleEl.textContent = adminData.role || 'Super Admin';

    if (!avatarImg) return;

    if (avatarUrl) {
        const bust = avatarUrl.includes('?') ? `${avatarUrl}&t=${Date.now()}` : `${avatarUrl}?t=${Date.now()}`;
        avatarImg.src = bust;
        avatarImg.style.display = 'block';
        avatarImg.onerror = () => {
            avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=d97706&color=fff`;
        };
    } else {
        avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=d97706&color=fff`;
    }
}

async function fetchAdminProfile() {
    try {
        
/* shared state: token lives on window (admin-core) */

        
        const response = await fetch('/api/admin/profile', {
            method: 'GET',
            headers: { 
                'Authorization': `Bearer ${token}` 
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            updateAdminProfileUI(data);
        }
    } catch (error) {
        console.error("🔴 The profile image could not be fetched from the database :", error);
    }
}

// পেজ রিফ্রেশ বা প্রথমবার লোড হওয়ার সাথে সাথে ছবি লোড করার ইভেন্ট অ্যাক্টিভ করা
document.addEventListener('DOMContentLoaded', fetchAdminProfile);

/**
 * ২. প্রোফাইল পিকচার ইনপুট চেঞ্জ এবং ক্লাউডিনারি আপলোড হ্যান্ডলার
 * ইনপুট ফিল্ডে নতুন ছবি সিলেক্ট করলেই তা সরাসরি ক্লাউডিনারি ও ডাটাবেজে সেভ হবে।
 */
const profileUploadInput = document.getElementById('profileUploadInput');

if (profileUploadInput && profileUploadInput.dataset.legacyBound !== '1') {
    profileUploadInput.dataset.legacyBound = '1';
    /* Handler attached in DOMContentLoaded via uploadAdminProfilePic — skip duplicate bind */
}

/*==========================================================================================================================*/

/*==========================================================================================================================*/


/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    buildProductTablePriceCells,
    cacheAdminRewardSettings,
    canUndoRefund,
    collectPositiveVariantPrices,
    ensureAdminRealtimeToastStack,
    ensureAdminSocketStatusIndicator,
    ensureCleanAdminUrl,
    escapeToastText,
    fetchAdminProfile,
    filterCustomersBySegment,
    formatAdminPrice,
    formatAdminProfit,
    formatTimeAgo,
    getCustomerSegmentBadge,
    getOrderCountBadge,
    getOrderGrandTotal,
    getProdTableBody,
    getProductFilterState,
    getVariantMinPrice,
    handleAdminApiAuthResponse,
    initAdminNotifications,
    initAdminPaginationInstances,
    initAdminSocket,
    initDashboard,
    isAdminSectionActive,
    isVariantMatrixProduct,
    isWithinRefundUndoWindowClient,
    navigateAdminSection,
    persistProductListSessionState,
    playAdminNotificationBeep,
    pushAdminNotification,
    readProductListSessionState,
    removeOrderFromState,
    removeProductFromState,
    renderAdminNotifDropdown,
    resetAdminPollErrors,
    restoreProductPaginationState,
    saveProductPaginationState,
    setAdminSocketStatus,
    setupAdminNotifBell,
    setupAdminSPARouter,
    setupCustomerSegmentTabs,
    setupGlobalSearch,
    setupSidebarNavigation,
    setupSyncButton,
    showAdminToast,
    showEnterpriseActionModal,
    switchDashboardView,
    trackAdminPollError,
    updateAdminNotifBellBadge,
    updateAdminPageHeader,
    updateAdminProfileUI,
    updateSidebarMessagesBadge,
    updateSidebarOrdersBadge,
    upsertProductInState,
    verifyAdminTokenOnLoad
});

