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
const token = localStorage.getItem('adminToken');

// ১.২: টোকেন না থাকলে সরাসরি লগইন পেজে রিডাইরেক্ট (সিকিউরিটি গেটওয়ে)
if (!token) {
    window.location.replace('/admin-login');
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
        
        // টোকেন অবৈধ বা এক্সপায়ার হলে সেশন ক্লিয়ার করে রিডাইরেক্ট
        if (!res.ok || !data.success) {
            localStorage.removeItem('adminToken');
            window.location.replace('/admin-login');
        }
    } catch (err) {
        console.error("Security Verification Critical Error:", err);
        // সার্ভার ডাউন বা কানেকশন এরর হলে নিরাপত্তা স্বার্থে কনসোলে এরর দেখানো
    }
}


/* ==========================================================================
   CORE MODULE 2: GLOBAL VARIABLES & STATE MANAGEMENT (গ্লোবাল স্টেট ও ভেরিয়েবল)
   ========================================================================== */

// ২.১: ডম (DOM) এলিমেন্ট রেফারেন্স সমূহ
const tableBody = document.getElementById('adminOrderTableBody') || document.getElementById('orderTableBody');
const prodTableBody = document.getElementById('adminProductTableBody');

// ২.২: গ্লোবাল ডাটা স্টোরেজ (State)
let allOrders = {};
let allProducts = {};
let globalProducts = [];
let currentFilteredProducts = [];
let allCustomers = [];
let globalOrders = [];
let currentFilteredOrders = [];

// ২.৩: চার্ট এবং পেজিনেশন কন্ট্রোল ভেরিয়েবল
let growthChartInstance = null;
let salesTrendChartInstance = null;
let topProductsChartInstance = null;
let dashboardAnalytics = null;
let salesTrendPeriod = 'daily';
let topProductsChartType = 'bar';
let currentPage = 1;          // প্রোডাক্ট পেজের বর্তমান পেজ নম্বর
const PRODUCT_PAGINATION_STORAGE_KEY = 'eob_admin_products_pagination';
let savedProductPageBeforeAction = null;
const itemsPerPage = 10;      // প্রতি পেজে ডিফল্ট প্রোডাক্ট সংখ্যা
let currentOrderPage = 1;     // অর্ডারের বর্তমান পেজ নম্বর
let ordersPerPage = 10;       // প্রতি পেজে ডিফল্ট অর্ডারের সংখ্যা
let isStockAscending = true;
let adminPlatformTimezone = 'Asia/Dhaka';
let adminCurrencySymbol = '৳';
let adminRewardSettings = { refundUndoWindowHours: 72 };

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

const ADMIN_TOAST_ICONS = {
    success: 'fa-circle-check',
    error: 'fa-circle-xmark',
    warning: 'fa-triangle-exclamation',
    info: 'fa-circle-info'
};

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

/** Snapshot active filters + pagination for restore after edit/save */
function getProductFilterQueryParams() {
    return {
        search: document.getElementById('searchProduct')?.value || '',
        category: document.getElementById('filterCategory')?.value || 'All',
        stockStatus: document.getElementById('filterStockStatus')?.value || 'All',
        priceRange: document.getElementById('filterPriceRange')?.value || 'All',
        pageSize: document.getElementById('itemsPerPage')?.value || '10',
        sortKey: currentSort?.key || 'productId',
        sortAsc: currentSort?.asc !== false
    };
}

function saveProductPaginationState() {
    savedProductPageBeforeAction = currentPage;
    try {
        sessionStorage.setItem(PRODUCT_PAGINATION_STORAGE_KEY, JSON.stringify({
            page: currentPage,
            ...getProductFilterQueryParams()
        }));
    } catch (_) { /* ignore quota / private mode */ }
    syncProductListUrlState();
}

function restoreProductPaginationState() {
    if (savedProductPageBeforeAction != null && savedProductPageBeforeAction > 0) {
        currentPage = savedProductPageBeforeAction;
        savedProductPageBeforeAction = null;
        return;
    }
    readProductListUrlState();
}

function readProductListUrlState() {
    try {
        const params = new URLSearchParams(window.location.search);
        const page = parseInt(params.get('page'), 10);
        if (Number.isFinite(page) && page > 0) {
            currentPage = page;
        } else {
            const raw = sessionStorage.getItem(PRODUCT_PAGINATION_STORAGE_KEY);
            if (raw) {
                const stored = JSON.parse(raw);
                if (stored.page) currentPage = Number(stored.page) || 1;
            }
        }

        const pageSizeEl = document.getElementById('itemsPerPage');
        const pageSize = params.get('pageSize');
        if (pageSizeEl && pageSize) pageSizeEl.value = pageSize;

        const searchEl = document.getElementById('searchProduct');
        if (searchEl && params.has('search')) searchEl.value = params.get('search');

        const catEl = document.getElementById('filterCategory');
        if (catEl && params.has('category')) catEl.value = params.get('category');

        const stockEl = document.getElementById('filterStockStatus');
        if (stockEl && params.has('stockStatus')) stockEl.value = params.get('stockStatus');

        const priceEl = document.getElementById('filterPriceRange');
        if (priceEl && params.has('priceRange')) priceEl.value = params.get('priceRange');
    } catch (_) { /* ignore malformed URL / storage */ }
}

function syncProductListUrlState() {
    const manageSection = document.getElementById('view-manage-products');
    if (!manageSection || manageSection.style.display === 'none') return;

    const params = new URLSearchParams(window.location.search);
    params.set('section', 'manage-products');

    if (currentPage > 1) params.set('page', String(currentPage));
    else params.delete('page');

    const filters = getProductFilterQueryParams();
    if (filters.search) params.set('search', filters.search);
    else params.delete('search');

    if (filters.category && filters.category !== 'All') params.set('category', filters.category);
    else params.delete('category');

    if (filters.stockStatus && filters.stockStatus !== 'All') params.set('stockStatus', filters.stockStatus);
    else params.delete('stockStatus');

    if (filters.priceRange && filters.priceRange !== 'All') params.set('priceRange', filters.priceRange);
    else params.delete('priceRange');

    if (filters.pageSize && filters.pageSize !== '10') params.set('pageSize', filters.pageSize);
    else params.delete('pageSize');

    const query = params.toString();
    const newUrl = query
        ? `${window.location.pathname}?${query}${window.location.hash}`
        : `${window.location.pathname}${window.location.hash}`;

    history.replaceState(
        { ...(history.state || {}), productPage: currentPage, productSection: 'manage-products' },
        '',
        newUrl
    );
}

/** Instant product list sync after edit/delete */
function removeProductFromState(productId) {
    const id = String(productId);
    globalProducts = globalProducts.filter(p => String(p._id) !== id);
    selectedProductIds.delete(productId);
    if (typeof updateBulkActionPanel === 'function') updateBulkActionPanel();
    filterAndRenderProducts(false);
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
    updateFilterCategoryDropdown();
    restoreProductPaginationState();
    filterAndRenderProducts(false);
}

/** Instant order list sync after delete */
function removeOrderFromState(orderId) {
    const id = String(orderId);
    globalOrders = globalOrders.filter(o => String(o._id) !== id);
    const totalOrderBadge = document.getElementById('total-orders-badge');
    if (totalOrderBadge) totalOrderBadge.innerText = `Total: ${globalOrders.length}`;
    filterAndRenderOrders();
}


/* ==========================================================================
   ADMIN PAGE METADATA (সেকশন অনুযায়ী হেডার টাইটেল আপডেট)
   ========================================================================== */
const ADMIN_PAGE_META = {
    'view-overview':        { title: 'Dashboard Overview',      subtitle: 'Real-time monitoring engine for EonlineBazar platform.' },
    'view-customers':       { title: 'All Customers',           subtitle: 'Manage registered users, account status, and order history.' },
    'view-orders':          { title: 'Live Orders',             subtitle: 'Real-time monitoring engine for order processing.' },
    'view-add-product':     { title: 'Add New Product',         subtitle: 'Launch a new product with pricing, media, and inventory details.' },
    'view-manage-products': { title: 'Manage Products',         subtitle: 'Search, filter, export, and maintain your product catalog.' },
    'manage-category':      { title: 'Manage Categories',       subtitle: 'Organize products with dynamic category labels.' },
    'manage-brands':        { title: 'Manage Brands',           subtitle: 'Maintain brand names for catalog filtering and display.' },
    'manage-attributes':    { title: 'Product Attributes',      subtitle: 'Define attribute names and values (Size, Color, etc.).' },
    'manage-coupons':       { title: 'Manage Coupons',          subtitle: 'Create discount codes, set usage limits, and track redemptions.' },
    'view-security':        { title: 'Security Logs',           subtitle: 'Monitor authentication events and system security activity.' },
    'view-sessions':        { title: 'Active Devices & Sessions', subtitle: 'Review and remotely revoke logged-in admin devices.' },
    'view-audit':           { title: 'Security & Audit',         subtitle: 'Login history, intrusion attempts, and IP blacklist firewall.' },
    'view-master-settings': { title: 'Master Settings',          subtitle: 'Configure global cashback, loyalty points, conversion, and refund rules.' },
    'view-staff':           { title: 'Staff Management',         subtitle: 'Create staff accounts, assign permissions, and control access instantly.' },
    'view-settings':        { title: 'Admin Settings',          subtitle: 'Configure your admin profile and platform preferences.' }
};

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
let _catalogQuickEditSaveHandler = null;

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

let customerSegmentFilter = 'all';
let customerSegmentThresholds = null;

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
            renderCustomerTable(filterCustomersBySegment(allCustomers, customerSegmentFilter));
        });
    });
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
        sec.style.style.display = 'none';
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



/* ==========================================================================
   SECTION 5: OVERVIEW & ANALYTICS (ড্যাশবোর্ড ওভারভিউ এবং স্ট্যাটিস্টিকস)
   ========================================================================== */

/**
 * ৫.১: ড্যাশবোর্ডে বর্তমান তারিখ প্রদর্শন
 */
function updateDashboardDate(dateObj) {
    const textEl = document.getElementById('dateText');
    const d = dateObj instanceof Date && !isNaN(dateObj) ? dateObj : new Date();
    if (textEl) {
        const options = { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' };
        textEl.textContent = d.toLocaleDateString('en-US', options);
    }
}

/**
 * ৫.১ক: রিয়েল-টাইম লাইভ ঘড়ি (সেকেন্ড সহ) তারিখের ঠিক নিচে দেখানো
 */
let __liveClockTimer = null;
function startLiveClock() {
    const clockEl = document.getElementById('clockText');
    if (!clockEl) return;

    const tick = () => {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
            timeZone: adminPlatformTimezone || undefined
        });
    };

    tick();
    if (__liveClockTimer) clearInterval(__liveClockTimer);
    __liveClockTimer = setInterval(tick, 1000);
}

/**
 * ৫.১খ: হেডারের তারিখ ক্লিক করলে ক্যালেন্ডার পিকার খোলা, এবং তারিখ
 * নির্বাচন করলে তা হেডারে প্রদর্শন করা।
 */
function setupHeaderDatePicker() {
    const dateBtn = document.getElementById('current-date');
    const picker = document.getElementById('hiddenDatePicker');
    if (!dateBtn || !picker) return;

    // আজকের তারিখ পিকারে প্রি-ফিল করা
    const today = new Date();
    picker.value = today.toISOString().slice(0, 10);

    dateBtn.addEventListener('click', () => {
        // আধুনিক ব্রাউজারে নেটিভ ক্যালেন্ডার পপআপ খোলা; না পারলে ফোকাস ফলব্যাক
        if (typeof picker.showPicker === 'function') {
            try { picker.showPicker(); return; } catch (_) { /* fallback below */ }
        }
        picker.focus();
        picker.click();
    });

    picker.addEventListener('change', () => {
        if (picker.value) {
            updateDashboardDate(new Date(picker.value + 'T00:00:00'));
        }
    });
}

/**
 * ৫.২: সার্ভার থেকে ড্যাশবোর্ডের প্রাথমিক ডাটা (কাস্টমার ও স্ট্যাটস) নিয়ে আসা
 * Overview পেজ এবং All Customers পেজ উভয়ের জন্যই এই ফাংশনটি কাজ করবে
 */
async function fetchDashboardData() {
    try {
        // 🛡️ রিকোয়েস্টে অ্যাডমিন সিকিউরিটি টোকেন পাঠানো হচ্ছে
        const response = await fetch('/api/admin/customers', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        
        const data = await response.json();
        
        // ব্যাকএন্ড রেসপন্সের বিভিন্ন ফরম্যাট হ্যান্ডেল করা
        if (data && data.success) {
            allCustomers = data.customers || data.data || [];
            customerSegmentThresholds = data.segmentThresholds || customerSegmentThresholds;
        } else if (Array.isArray(data)) {
            allCustomers = data;
        } else {
            allCustomers = [];
            showCustomerError("Failed to fetch data.");
        }

        // ডাটা পাওয়ার পর ড্যাশবোর্ডের কার্ড, চার্ট ও টেবিল আপডেট করা
        updateMetricsCards(allCustomers);
        renderCustomerTable(filterCustomersBySegment(allCustomers, customerSegmentFilter));
        renderGrowthChart(allCustomers);
        await fetchDashboardAnalytics();

    } catch (error) {
        console.error("Dashboard Fetch Error:", error);
        showCustomerError("Server connection error.");
    }
}

/**
 * ৫.২ক: Sales & Order Analytics — revenue, order counts, charts & stock alerts
 */
async function fetchDashboardAnalytics() {
    try {
        const response = await fetch('/api/admin/dashboard-analytics', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

        const data = await response.json();
        if (!data.success || !data.analytics) return;

        dashboardAnalytics = data.analytics;
        updateSalesMetricsCards(dashboardAnalytics);
        renderSalesTrendChart(dashboardAnalytics.salesTrend);
        renderTopProductsChart(dashboardAnalytics.topProducts);
        renderInventoryAlerts(dashboardAnalytics.inventoryAlerts);
    } catch (error) {
        console.error('Dashboard Analytics Fetch Error:', error);
    }
}

function updateSalesMetricsCards(analytics) {
    if (!analytics) return;

    const { revenue, orderCounts, totalCustomers } = analytics;

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    setText('stat-alltime-revenue', formatAdminPrice(revenue?.allTime || 0));
    setText('stat-revenue-breakdown', `Today: ${formatAdminPrice(revenue?.daily || 0)} · This Month: ${formatAdminPrice(revenue?.monthly || 0)}`);
    setText('stat-pending-orders', orderCounts?.pending ?? 0);
    setText('stat-return-requests', orderCounts?.returnRequests ?? 0);
    setText('stat-total-customers', totalCustomers ?? 0);
    setText('stat-total-orders', orderCounts?.total ?? 0);
    setText('stat-processing-orders', orderCounts?.processing ?? 0);
    setText('stat-delivered-orders', orderCounts?.delivered ?? 0);
}

function renderSalesTrendChart(salesTrend) {
    const ctx = document.getElementById('salesTrendChart');
    if (!ctx || typeof Chart === 'undefined' || !salesTrend) return;

    if (salesTrendChartInstance) salesTrendChartInstance.destroy();

    const series = salesTrendPeriod === 'monthly' ? salesTrend.monthly : salesTrend.daily;
    const labels = series?.labels || [];
    const values = series?.revenue || [];

    salesTrendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Revenue',
                data: values,
                borderColor: '#8b5cf6',
                backgroundColor: 'rgba(139, 92, 246, 0.12)',
                borderWidth: 2.5,
                tension: 0.35,
                fill: true,
                pointRadius: 3,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => ` Revenue: ${formatAdminPrice(context.parsed.y)}`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: (value) => formatAdminPrice(value)
                    }
                },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderTopProductsChart(topProducts) {
    const ctx = document.getElementById('topProductsChart');
    if (!ctx || typeof Chart === 'undefined') return;

    if (topProductsChartInstance) topProductsChartInstance.destroy();

    const products = topProducts || [];
    const labels = products.map((p) => p.name || 'Unknown');
    const quantities = products.map((p) => p.quantity || 0);
    const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

    if (topProductsChartType === 'pie') {
        topProductsChartInstance = new Chart(ctx, {
            type: 'pie',
            data: {
                labels,
                datasets: [{
                    data: quantities,
                    backgroundColor: palette,
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: {
                        callbacks: {
                            label: (context) => ` ${context.label}: ${context.parsed} units sold`
                        }
                    }
                }
            }
        });
        return;
    }

    topProductsChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Units Sold',
                data: quantities,
                backgroundColor: palette,
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => ` ${context.parsed.y} units sold`
                    }
                }
            },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderInventoryAlerts(inventoryAlerts) {
    const container = document.getElementById('inventoryAlertsList');
    const countLabel = document.getElementById('inventoryAlertCount');
    if (!container) return;

    const outOfStock = inventoryAlerts?.outOfStock || [];
    const lowStock = inventoryAlerts?.lowStock || [];
    const allAlerts = [
        ...outOfStock.map((p) => ({ ...p, alertType: 'out' })),
        ...lowStock.map((p) => ({ ...p, alertType: 'low' }))
    ];

    if (countLabel) {
        countLabel.textContent = allAlerts.length === 0
            ? 'All clear'
            : `${allAlerts.length} alert${allAlerts.length === 1 ? '' : 's'}`;
    }

    if (allAlerts.length === 0) {
        container.innerHTML = `
            <div class="inventory-alert-empty">
                <i class="fa-solid fa-circle-check"></i>
                <p>All products are well stocked.</p>
            </div>`;
        return;
    }

    container.innerHTML = allAlerts.map((product) => {
        const isOut = product.alertType === 'out';
        const badgeClass = isOut ? 'out' : 'low';
        const badgeText = isOut
            ? '⚠️ Out of Stock'
            : `🔥 Low Stock: ${product.stock} left`;
        const itemClass = isOut ? 'out-of-stock' : 'low-stock';
        const thumb = product.image
            ? `<img src="${product.image}" class="inventory-alert-thumb" alt="" onerror="this.outerHTML='<span class=\\'inventory-alert-thumb\\'>${product.icon || '📦'}</span>'">`
            : `<span class="inventory-alert-thumb">${product.icon || '📦'}</span>`;

        return `
            <div class="inventory-alert-item ${itemClass}">
                <div class="inventory-alert-info">
                    ${thumb}
                    <div class="inventory-alert-meta">
                        <strong>${product.name || 'Unnamed Product'}</strong>
                        <span>${product.productId || 'N/A'} · ${product.category || 'General'}</span>
                    </div>
                </div>
                <div class="inventory-alert-actions">
                    <span class="inventory-alert-badge ${badgeClass}">${badgeText}</span>
                    <button type="button" class="btn-update-stock" onclick="quickUpdateStock('${product._id}')">
                        <i class="fa-solid fa-pen"></i> Update Stock
                    </button>
                </div>
            </div>`;
    }).join('');
}

window.quickUpdateStock = async function(productId) {
    let product = globalProducts.find((p) => String(p._id) === String(productId));
    if (!product) {
        await fetchLiveProducts();
        product = globalProducts.find((p) => String(p._id) === String(productId));
    }
    if (!product) {
        showToast('Product not found. Open Manage Products to update stock.', 'warning');
        return;
    }

    if (typeof Swal === 'undefined') {
        editProduct(productId);
        return;
    }

    const { value: newStock, isConfirmed } = await Swal.fire({
        title: 'Update Stock',
        html: `<p style="margin-bottom:8px;font-size:14px;color:#64748b;">${product.name}</p>`,
        input: 'number',
        inputValue: Number(product.stock) || 0,
        inputAttributes: { min: 0, step: 1 },
        showCancelButton: true,
        confirmButtonText: 'Save Stock',
        confirmButtonColor: '#3b82f6'
    });

    if (!isConfirmed || newStock === undefined || newStock === null || newStock === '') return;

    saveProductPaginationState();

    const formData = new FormData();
    formData.append('name', product.name);
    formData.append('price', product.price);
    formData.append('buyingPrice', product.buyingPrice || 0);
    formData.append('stock', newStock);
    formData.append('stockQuantity', newStock);
    formData.append('hasVariants', product.hasVariants ? 'true' : 'false');
    formData.append('category', product.category || 'General');
    formData.append('brand', (product.brand && product.brand._id) ? product.brand._id : (product.brand || ''));
    formData.append('variants', JSON.stringify(product.variants || []));
    formData.append('icon', product.icon || '📦');
    formData.append('description', product.description || '');

    try {
        const res = await fetch(`/api/products/${productId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const result = await res.json();

        if (res.ok && result.success) {
            const updated = result.data || result.product;
            if (updated && updated._id) upsertProductInState(updated);
            showAdminSuccess('Stock Updated', `Stock set to ${newStock} for ${product.name}`);
            fetchDashboardAnalytics();
        } else {
            showToast(result.message || 'Stock update failed.', 'error');
        }
    } catch (err) {
        showToast('Server error during stock update.', 'error');
    }
};

function setupAnalyticsChartToggles() {
    const dailyBtn = document.getElementById('salesTrendDailyBtn');
    const monthlyBtn = document.getElementById('salesTrendMonthlyBtn');
    const barBtn = document.getElementById('topProductsBarBtn');
    const pieBtn = document.getElementById('topProductsPieBtn');

    const setActive = (buttons, activeBtn) => {
        buttons.forEach((btn) => {
            if (!btn) return;
            btn.classList.toggle('active', btn === activeBtn);
        });
    };

    if (dailyBtn && monthlyBtn) {
        dailyBtn.addEventListener('click', () => {
            salesTrendPeriod = 'daily';
            setActive([dailyBtn, monthlyBtn], dailyBtn);
            if (dashboardAnalytics?.salesTrend) renderSalesTrendChart(dashboardAnalytics.salesTrend);
        });
        monthlyBtn.addEventListener('click', () => {
            salesTrendPeriod = 'monthly';
            setActive([dailyBtn, monthlyBtn], monthlyBtn);
            if (dashboardAnalytics?.salesTrend) renderSalesTrendChart(dashboardAnalytics.salesTrend);
        });
    }

    if (barBtn && pieBtn) {
        barBtn.addEventListener('click', () => {
            topProductsChartType = 'bar';
            setActive([barBtn, pieBtn], barBtn);
            if (dashboardAnalytics?.topProducts) renderTopProductsChart(dashboardAnalytics.topProducts);
        });
        pieBtn.addEventListener('click', () => {
            topProductsChartType = 'pie';
            setActive([barBtn, pieBtn], pieBtn);
            if (dashboardAnalytics?.topProducts) renderTopProductsChart(dashboardAnalytics.topProducts);
        });
    }
}

/**
 * ৫.৩: টপ অ্যানালিটিক্স কার্ডগুলো (Total Users, Verified, Pending) আপডেট করা
 * @param {Array} customers - ডাটাবেজ থেকে পাওয়া কাস্টমার অ্যারে
 */
function updateMetricsCards(customers) {
    const totalUsers = customers.length;
    const verifiedUsers = customers.filter(user => user.isVerified === true).length;
    const pendingUsers = totalUsers - verifiedUsers;
    const spamAlerts = customers.filter(user => user.accountStatus === 'blocked').length;

    // DOM এলিমেন্ট আপডেট করা
    if (document.getElementById('stat-total-users')) document.getElementById('stat-total-users').innerText = totalUsers;
    if (document.getElementById('stat-verified-users')) document.getElementById('stat-verified-users').innerText = verifiedUsers;
    if (document.getElementById('stat-pending-users')) document.getElementById('stat-pending-users').innerText = pendingUsers;
    if (document.getElementById('stat-spam-blocks')) document.getElementById('stat-spam-blocks').innerText = spamAlerts;
}

/**
 * গত N মাসের রেজিস্ট্রেশন সিরিজ বিল্ড করা (ডাইনামিক চার্ট ডেটা)
 */
function buildMonthlyRegistrationSeries(customers, months = 6) {
    const now = new Date();
    const labels = [];
    const totals = [];
    const verified = [];

    for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = d.getFullYear();
        const month = d.getMonth();
        labels.push(d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));

        const inMonth = (customers || []).filter(c => {
            if (!c.createdAt) return false;
            const created = new Date(c.createdAt);
            return created.getFullYear() === year && created.getMonth() === month;
        });
        totals.push(inMonth.length);
        verified.push(inMonth.filter(u => u.isVerified).length);
    }

    return { labels, totals, verified };
}

/**
 * ৫.৪: কাস্টমার রেজিস্ট্রেশন গ্রোথ চার্ট (Chart.js — real monthly data)
 */
function renderGrowthChart(customers) {
    const ctx = document.getElementById('userGrowthChart');
    if (!ctx || typeof Chart === 'undefined') return;

    if (growthChartInstance) growthChartInstance.destroy();

    const { labels, totals, verified } = buildMonthlyRegistrationSeries(customers || [], 6);
    const periodLabel = document.getElementById('chartPeriodLabel');
    if (periodLabel) periodLabel.textContent = `Last ${labels.length} months · ${(customers || []).length} total users`;

    growthChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'New Registrations',
                    data: totals,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.12)',
                    borderWidth: 2.5,
                    tension: 0.35,
                    fill: true,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: 'Verified in Month',
                    data: verified,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.08)',
                    borderWidth: 2,
                    tension: 0.35,
                    fill: false,
                    pointRadius: 3,
                    borderDash: [4, 4]
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'bottom' },
                tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y}` } }
            },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } },
                x: { grid: { display: false } }
            }
        }
    });
}


/* ==========================================================================
   SECTION 6: CUSTOMER MANAGEMENT (সকল কাস্টমারদের তালিকা ও পরিচালনা)
   ========================================================================== */

/**
 * ৬.১: কাস্টমারদের ডাটা টেবিলে প্রদর্শন করা
 * @param {Array} customers - ডাটাবেজ থেকে পাওয়া কাস্টমার অ্যারে
 */
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

function renderCustomerTable(customers) {
    const tbody = document.getElementById('customerTableBody');
    if (!tbody) return;

    if (customers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="loading-container">No records found.</td></tr>`;
        return;
    }

    let tableHTML = '';
    customers.forEach((user, index) => {
        const displayId = user._id ? user._id.toString().slice(-6).toUpperCase() : `USR-${index + 1}`;
        const accountStatus = user.accountStatus || 'active';
        const uid = user._id;
        const totalSpent = Number(user.totalSpent) || 0;

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
                <td class="customers-td customers-td--id">${buildCustomerCopyCell(`<b>#${escapeHtml(displayId)}</b>`, userIdCopy)}</td>
                <td class="customers-td customers-td--name"><span class="customers-name">${escapeHtml(user.name || 'N/A')}${user.isVip ? ' <span class="customers-vip-crown" aria-hidden="true">👑</span>' : ''}</span></td>
                <td class="customers-td customers-td--email">${emailDisplay !== 'N/A' ? buildCustomerCopyCell(escapeHtml(emailDisplay), emailDisplay) : 'N/A'}</td>
                <td class="customers-td customers-td--mobile">${mobileDisplay !== 'N/A' ? buildCustomerCopyCell(escapeHtml(mobileDisplay), mobileDisplay) : 'N/A'}</td>
                <td class="customers-td customers-td--num">${getOrderCountBadge(user.orderCount)}</td>
                <td class="customers-td customers-td--num"><span class="spent-badge">${formatAdminPrice(totalSpent)}</span></td>
                <td class="customers-td customers-td--segment">${getCustomerSegmentBadge(user)}</td>
                <td class="customers-td customers-td--status">${getCustomerStatusHtml(user)}</td>
                <td class="col-actions customers-td customers-td--actions">
                    <div class="customer-actions-row">
                        <button type="button" class="action-btn view" onclick="viewCustomerDetails('${uid}')" title="View Profile"><i class="fa-solid fa-eye"></i></button>
                        <button type="button" class="action-btn edit" onclick="editCustomer('${uid}')" title="Edit Customer"><i class="fa-solid fa-pen-to-square"></i></button>
                        <button type="button" class="action-btn orders" onclick="viewCustomerOrders('${uid}')" title="Order History"><i class="fa-solid fa-clock-rotate-left"></i></button>
                        ${statusActionBtn}
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = tableHTML;
}

/**
 * ৬.২: কাস্টমার টেবিলে এরর মেসেজ দেখানোর ফাংশন
 * @param {string} msg - এরর মেসেজ
 */
function showCustomerError(msg) {
    const tbody = document.getElementById('customerTableBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="table-status-error">${msg}</td></tr>`;
}

/**
 * ৬.৩: কাস্টমার প্রোফাইল দেখার মোডাল
 */
window.viewCustomerDetails = async function(userId) {
    try {
        const res = await fetch(`/api/admin/customers/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();
        if (!result.success || !result.data) {
            return showToast(result.message || 'Failed to load customer.', 'error');
        }

        const u = result.data;
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? '—'; };

        set('cvName', u.name);
        set('cvEmail', u.email);
        set('cvMobile', u.mobile);
        set('cvPhone', u.phone || 'N/A');
        set('cvVerified', u.isVerified ? 'Verified' : 'Pending');
        set('cvAccountStatus', (u.accountStatus || 'active').charAt(0).toUpperCase() + (u.accountStatus || 'active').slice(1));
        set('cvWallet', formatAdminPrice(u.walletBalance || 0));
        set('cvPoints', Number(u.loyaltyPoints || 0).toLocaleString());
        set('cvOrderCount', `${Number(u.orderCount || 0).toLocaleString()} order${Number(u.orderCount || 0) !== 1 ? 's' : ''}`);
        set('cvAddress', u.address || 'Not provided');
        set('cvJoined', u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—');

        const editFromView = document.getElementById('cvEditFromViewBtn');
        if (editFromView) {
            editFromView.onclick = () => {
                closeCustomerViewModal();
                editCustomer(userId);
            };
        }

        document.getElementById('customerViewModal').style.display = 'flex';
    } catch (e) {
        showToast('Server error loading customer profile.', 'error');
    }
};

window.closeCustomerViewModal = function() {
    const modal = document.getElementById('customerViewModal');
    if (modal) modal.style.display = 'none';
};

/**
 * ৬.৪: কাস্টমার এডিট মোডাল
 */
window.editCustomer = async function(userId) {
    try {
        const res = await fetch(`/api/admin/customers/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();
        if (!result.success || !result.data) {
            return showToast(result.message || 'Failed to load customer.', 'error');
        }

        const u = result.data;
        document.getElementById('editCustomerId').value = u._id;
        document.getElementById('editCustomerName').value = u.name || '';
        document.getElementById('editCustomerEmail').value = u.email || '';
        document.getElementById('editCustomerMobile').value = u.mobile || '';
        document.getElementById('editCustomerPhone').value = u.phone || '';
        document.getElementById('editCustomerAddress').value = u.address || '';
        document.getElementById('editCustomerVerified').value = u.isVerified ? 'true' : 'false';

        document.getElementById('customerEditModal').style.display = 'flex';
    } catch (e) {
        showToast('Server error loading customer for edit.', 'error');
    }
};

window.closeCustomerEditModal = function() {
    const modal = document.getElementById('customerEditModal');
    if (modal) modal.style.display = 'none';
};

window.saveCustomerEdits = async function() {
    const userId = document.getElementById('editCustomerId').value;
    const name = document.getElementById('editCustomerName').value.trim();
    const email = document.getElementById('editCustomerEmail').value.trim();
    const mobile = document.getElementById('editCustomerMobile').value.trim();

    if (!name || !email || !mobile) {
        return showToast('Name, email, and mobile are required.', 'warning');
    }

    const btn = document.getElementById('saveCustomerBtn');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...'; }

    try {
        const res = await fetch(`/api/admin/customers/${userId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                name,
                email,
                mobile,
                phone: document.getElementById('editCustomerPhone').value.trim(),
                address: document.getElementById('editCustomerAddress').value.trim(),
                isVerified: document.getElementById('editCustomerVerified').value === 'true'
            })
        });
        const result = await res.json();
        if (result.success) {
            showToast('Customer updated successfully!', 'success');
            closeCustomerEditModal();
            fetchDashboardData();
        } else {
            showToast(result.message || 'Update failed.', 'error');
        }
    } catch (e) {
        showToast('Server error while saving customer.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    }
};

/**
 * ৬.৫: Block / Suspend / Activate কাস্টমার
 */
window.setCustomerStatus = function(userId, status) {
    const labels = {
        blocked: { title: 'Block Customer', msg: 'This user will be unable to log in. Continue?', type: 'danger' },
        suspended: { title: 'Suspend Customer', msg: 'This user will be temporarily suspended from logging in. Continue?', type: 'danger' },
        active: { title: 'Activate Customer', msg: 'Restore this account to active status?', type: 'warning' }
    };
    const cfg = labels[status] || labels.active;

    showCustomConfirm(cfg.title, cfg.msg, async () => {
        try {
            const res = await fetch(`/api/admin/customers/${userId}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ status })
            });
            const result = await res.json();
            if (result.success) {
                showToast(result.message || 'Status updated.', 'success');
                fetchDashboardData();
            } else {
                showToast(result.message || 'Failed to update status.', 'error');
            }
        } catch (e) {
            showToast('Server error updating account status.', 'error');
        }
    }, cfg.type);
};

/**
 * ৬.৬: কাস্টমারের অর্ডার হিস্ট্রি মোডাল
 */
window.viewCustomerOrders = async function(userId) {
    const modal = document.getElementById('customerOrdersModal');
    const tbody = document.getElementById('customerOrdersTableBody');
    const label = document.getElementById('coCustomerLabel');

    if (modal) modal.style.display = 'flex';
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="loading-cell">Loading orders...</td></tr>';

    try {
        const res = await fetch(`/api/admin/customers/${userId}/orders`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();

        if (!result.success) {
            if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="loading-cell">${result.message || 'Failed to load orders.'}</td></tr>`;
            return;
        }

        if (label && result.customer) {
            label.textContent = `Orders for ${result.customer.name} (${result.customer.email})`;
        }

        const orders = result.data || [];
        if (!tbody) return;

        if (orders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="loading-cell" style="text-align:center;">No orders placed yet.</td></tr>';
            return;
        }

        tbody.innerHTML = orders.map(order => {
            const dateStr = order.createdAt
                ? new Date(order.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                : '—';
            const statusClass = (order.status || 'pending').toLowerCase();
            return `
                <tr>
                    <td><b>${order.orderId || 'N/A'}</b></td>
                    <td>${dateStr}</td>
                    <td><b>${formatAdminPrice(getOrderGrandTotal(order))}</b></td>
                    <td><span class="status-badge status-${statusClass === 'delivered' ? 'verified' : 'pending'}">${order.status || 'Pending'}</span></td>
                    <td>${order.paymentMethod || 'COD'}</td>
                </tr>`;
        }).join('');
    } catch (e) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="loading-cell">Server error loading orders.</td></tr>';
    }
};

window.closeCustomerOrdersModal = function() {
    const modal = document.getElementById('customerOrdersModal');
    if (modal) modal.style.display = 'none';
};



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
    tableBody.innerHTML = `<tr><td colspan="8" class="loading-cell">Syncing live orders...</td></tr>`; 
    
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
        
        const data = await response.json();

        try {
            const settingsData = await settingsRes.json();
            if (settingsData.success && settingsData.data) {
                cacheAdminRewardSettings(settingsData.data);
                cacheAdminCourierSettings(settingsData.data);
            }
        } catch (settingsErr) {
            console.warn('Could not load refund undo window from master settings:', settingsErr);
        }
        
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
    } catch (error) {
        console.error("অর্ডারের ডাটা প্রসেস করতে এরর হয়েছে:", error);
        tableBody.innerHTML = `<tr><td colspan="8" class="table-status-error">Failed to load live orders.</td></tr>`;
    }
}

/* ==========================================================================
   MANUAL POS / PHONE ORDER ENGINE
   ========================================================================== */

let manualOrderCatalog = [];
let manualOrderLines = [];

function getManualOrderProductId(product) {
    return String(product?._id || product?.productId || product?.id || '');
}

function formatManualMoney(value) {
    return `৳${Number(value || 0).toLocaleString('en-US')}`;
}

function resetManualOrderForm() {
    manualOrderLines = [];
    const form = document.getElementById('manualOrderForm');
    if (form) form.reset();
    document.getElementById('manualItemQuantity').value = '1';
    document.getElementById('manualDiscountAmount').value = '0';
    document.getElementById('manualShippingFee').value = '0';
    document.getElementById('manualProductSearch').value = '';
    populateManualProductSelect('');
    renderManualOrderLines();
    updateManualOrderTotals();
    updateManualVariantStockHint();
}

window.openManualOrderModal = async function openManualOrderModal() {
    const modal = document.getElementById('manualOrderModal');
    if (!modal) return;

    resetManualOrderForm();
    modal.style.display = 'flex';

    if (manualOrderCatalog.length === 0) {
        await loadManualOrderCatalog();
    } else {
        populateManualProductSelect('');
    }
};

window.closeManualOrderModal = function closeManualOrderModal() {
    const modal = document.getElementById('manualOrderModal');
    if (modal) modal.style.display = 'none';
};

async function loadManualOrderCatalog() {
    const productSelect = document.getElementById('manualProductSelect');
    if (productSelect) {
        productSelect.innerHTML = '<option value="">Loading products…</option>';
    }

    try {
        const res = await fetch('/api/products', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        manualOrderCatalog = Array.isArray(data)
            ? data
            : (Array.isArray(data?.data) ? data.data : []);
        populateManualProductSelect(document.getElementById('manualProductSearch')?.value || '');
    } catch (err) {
        console.error('Manual order catalog load failed:', err);
        manualOrderCatalog = [];
        if (productSelect) {
            productSelect.innerHTML = '<option value="">Failed to load products</option>';
        }
        showToast('Could not load product catalog for manual orders.', 'error');
    }
}

function populateManualProductSelect(searchTerm = '') {
    const productSelect = document.getElementById('manualProductSelect');
    if (!productSelect) return;

    const query = String(searchTerm || '').trim().toLowerCase();
    const filtered = manualOrderCatalog.filter((product) => {
        if (!query) return true;
        const name = String(product.name || '').toLowerCase();
        const category = String(product.category || '').toLowerCase();
        const pid = getManualOrderProductId(product).toLowerCase();
        return name.includes(query) || category.includes(query) || pid.includes(query);
    });

    productSelect.innerHTML = '<option value="">— Select product —</option>';
    filtered.forEach((product) => {
        const option = document.createElement('option');
        option.value = getManualOrderProductId(product);
        option.textContent = product.name || 'Unnamed product';
        productSelect.appendChild(option);
    });

    populateManualVariantSelect();
}

function getSelectedManualProduct() {
    const productId = document.getElementById('manualProductSelect')?.value || '';
    if (!productId) return null;
    return manualOrderCatalog.find((p) => getManualOrderProductId(p) === productId) || null;
}

function populateManualVariantSelect() {
    const variantSelect = document.getElementById('manualVariantSelect');
    const product = getSelectedManualProduct();
    if (!variantSelect) return;

    variantSelect.innerHTML = '';
    variantSelect.disabled = true;

    if (!product) {
        variantSelect.innerHTML = '<option value="">— Default (no variant) —</option>';
        updateManualVariantStockHint();
        return;
    }

    const variants = Array.isArray(product.variants) ? product.variants : [];
    if (variants.length === 0) {
        variantSelect.innerHTML = '<option value="">— Default (no variant) —</option>';
        variantSelect.disabled = true;
        updateManualVariantStockHint();
        return;
    }

    variantSelect.disabled = false;
    variantSelect.innerHTML = '<option value="">— Select variant —</option>';
    variants.forEach((variant, index) => {
        const attrs = getVariantAttributesFromDoc(variant);
        const label = resolveCombinationLabel({ name: variant.name, attributes: attrs, sku: variant.sku }) || `Row ${index + 1}`;
        const stock = Number(variant.stock) || 0;
        const price = Number(variant.price ?? product.price) || 0;
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = `${label} · ${formatManualMoney(price)} · Stock: ${stock}`;
        option.dataset.variantIndex = String(index);
        variantSelect.appendChild(option);
    });

    updateManualVariantStockHint();
}

function updateManualVariantStockHint() {
    const hint = document.getElementById('manualVariantStockHint');
    if (!hint) return;

    const product = getSelectedManualProduct();
    if (!product) {
        hint.textContent = 'Select a product to see price and stock.';
        return;
    }

    const variants = Array.isArray(product.variants) ? product.variants : [];
    const variantSelect = document.getElementById('manualVariantSelect');
    const variantIndex = variantSelect && !variantSelect.disabled
        ? Number(variantSelect.value)
        : -1;

    if (variants.length > 0 && (Number.isNaN(variantIndex) || variantIndex < 0)) {
        hint.textContent = 'This product has variants — pick Size/Color before adding.';
        return;
    }

    let price = Number(product.price) || 0;
    let stock = Number(product.stockQuantity ?? product.stock) || 0;
    let label = 'Default';

    if (variantIndex >= 0 && variants[variantIndex]) {
        const variant = variants[variantIndex];
        const attrs = getVariantAttributesFromDoc(variant);
        label = formatCombinationLabel(attrs) || label;
        price = Number(variant.price ?? product.price) || 0;
        stock = Number(variant.stock) || 0;
    }

    hint.textContent = `${product.name} · ${label} · Price: ${formatManualMoney(price)} · Available stock: ${stock}`;
}

function buildManualLinePayload(product, variantIndex, quantity) {
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const payload = {
        productId: getManualOrderProductId(product),
        id: getManualOrderProductId(product),
        name: product.name,
        quantity
    };

    if (variantIndex >= 0 && variants[variantIndex]) {
        const variant = variants[variantIndex];
        const attrs = getVariantAttributesFromDoc(variant);
        payload.variantSku = variant.sku || '';
        payload.variantId = variant.sku || combinationKey(attrs);
        payload.variantAttribute = Object.entries(attrs).map(([k, v]) => `${k}:${v}`).join(',');
        payload.variantValue = Object.values(attrs).join(', ');
        payload.variantLabel = formatCombinationLabel(attrs);
        payload.price = Number(variant.price ?? product.price) || 0;
    } else {
        payload.price = Number(product.price) || 0;
    }

    return payload;
}

function renderManualOrderLines() {
    const tbody = document.getElementById('manualOrderLinesBody');
    if (!tbody) return;

    if (!manualOrderLines.length) {
        tbody.innerHTML = '<tr class="manual-order-empty-row"><td colspan="6">No items added yet.</td></tr>';
        return;
    }

    tbody.innerHTML = manualOrderLines.map((line, index) => {
        const lineTotal = (Number(line.price) || 0) * (Number(line.quantity) || 0);
        return `<tr>
            <td>${escHtml(line.name || 'Product')}</td>
            <td>${escHtml(line.variantLabel || 'Default')}</td>
            <td>${formatManualMoney(line.price)}</td>
            <td>${line.quantity}</td>
            <td>${formatManualMoney(lineTotal)}</td>
            <td><button type="button" class="manual-order-remove-btn" onclick="removeManualOrderLine(${index})" title="Remove line"><i class="fa-solid fa-trash-can"></i></button></td>
        </tr>`;
    }).join('');
}

window.removeManualOrderLine = function removeManualOrderLine(index) {
    manualOrderLines.splice(index, 1);
    renderManualOrderLines();
    updateManualOrderTotals();
};

function updateManualOrderTotals() {
    const preview = document.getElementById('manualOrderTotalsPreview');
    if (!preview) return;

    const subtotal = manualOrderLines.reduce(
        (sum, line) => sum + ((Number(line.price) || 0) * (Number(line.quantity) || 0)),
        0
    );
    const discount = Math.max(0, Number(document.getElementById('manualDiscountAmount')?.value) || 0);
    const shipping = Math.max(0, Number(document.getElementById('manualShippingFee')?.value) || 0);
    const grandTotal = Math.max(0, subtotal - discount + shipping);

    preview.innerHTML = `Subtotal: ${formatManualMoney(subtotal)} · Discount: ${formatManualMoney(discount)} · Shipping: ${formatManualMoney(shipping)} · <strong>Grand Total: ${formatManualMoney(grandTotal)}</strong>`;
}

function addManualOrderLine() {
    const product = getSelectedManualProduct();
    const quantity = Math.max(1, Number(document.getElementById('manualItemQuantity')?.value) || 1);

    if (!product) {
        return showToast('Select a product first.', 'warning');
    }

    const variants = Array.isArray(product.variants) ? product.variants : [];
    const variantSelect = document.getElementById('manualVariantSelect');
    const variantIndex = variants.length > 0 ? Number(variantSelect?.value) : -1;

    if (variants.length > 0 && (Number.isNaN(variantIndex) || variantIndex < 0)) {
        return showToast('Select a Size/Color variant for this product.', 'warning');
    }

    let availableStock = Number(product.stockQuantity ?? product.stock) || 0;
    if (variantIndex >= 0 && variants[variantIndex]) {
        availableStock = Number(variants[variantIndex].stock) || 0;
    }

    const existingQty = manualOrderLines
        .filter((line) => line.productId === getManualOrderProductId(product)
            && String(line.variantIndex) === String(variantIndex))
        .reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);

    if (existingQty + quantity > availableStock) {
        return showToast(`Insufficient stock. Available: ${availableStock}, already in cart: ${existingQty}.`, 'error');
    }

    const linePayload = buildManualLinePayload(product, variantIndex, quantity);
    linePayload.variantIndex = variantIndex;
    manualOrderLines.push(linePayload);

    document.getElementById('manualItemQuantity').value = '1';
    renderManualOrderLines();
    updateManualOrderTotals();
}

async function submitManualOrder(event) {
    event.preventDefault();

    if (!manualOrderLines.length) {
        return showToast('Add at least one product line.', 'warning');
    }

    const payload = {
        customerName: document.getElementById('manualCustomerName')?.value?.trim(),
        customerPhone: document.getElementById('manualCustomerPhone')?.value?.trim(),
        customerAddress: document.getElementById('manualCustomerAddress')?.value?.trim(),
        deliveryArea: document.getElementById('manualDeliveryArea')?.value || 'inside',
        paymentStatus: document.getElementById('manualPaymentStatus')?.value || 'COD',
        manualDiscount: document.getElementById('manualDiscountAmount')?.value || 0,
        shippingFee: document.getElementById('manualShippingFee')?.value || 0,
        note: document.getElementById('manualOrderNote')?.value?.trim() || '',
        items: manualOrderLines.map((line) => ({
            productId: line.productId,
            id: line.productId,
            quantity: line.quantity,
            variantSku: line.variantSku || '',
            variantId: line.variantId || '',
            variantAttribute: line.variantAttribute || '',
            variantValue: line.variantValue || '',
            variantLabel: line.variantLabel || ''
        }))
    };

    const submitBtn = document.getElementById('manualOrderSubmitBtn');
    const restore = setButtonLoading(submitBtn, 'Creating…');

    try {
        const res = await fetch('/api/admin/orders/manual', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.success) {
            showToast(`Manual order ${result.data?.orderId || ''} created successfully!`, 'success');
            closeManualOrderModal();
            fetchLiveOrders();
            fetchPendingWhatsAppAlerts();
            if (typeof fetchDashboardAnalytics === 'function') fetchDashboardAnalytics();
        } else {
            showToast(result.message || 'Failed to create manual order.', 'error');
        }
    } catch (err) {
        console.error('Manual order submit error:', err);
        showToast('Could not reach the server. Please try again.', 'error');
    } finally {
        restore();
    }
}

function setupManualOrderEngine() {
    const openBtn = document.getElementById('openManualOrderModalBtn');
    if (openBtn) {
        openBtn.addEventListener('click', () => openManualOrderModal());
    }

    const searchInput = document.getElementById('manualProductSearch');
    if (searchInput) {
        searchInput.addEventListener('input', () => populateManualProductSelect(searchInput.value));
    }

    const productSelect = document.getElementById('manualProductSelect');
    if (productSelect) {
        productSelect.addEventListener('change', populateManualVariantSelect);
    }

    const variantSelect = document.getElementById('manualVariantSelect');
    if (variantSelect) {
        variantSelect.addEventListener('change', updateManualVariantStockHint);
    }

    const addBtn = document.getElementById('manualAddLineBtn');
    if (addBtn) addBtn.addEventListener('click', addManualOrderLine);

    ['manualDiscountAmount', 'manualShippingFee'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateManualOrderTotals);
    });

    const form = document.getElementById('manualOrderForm');
    if (form) form.addEventListener('submit', submitManualOrder);
}

/* ==========================================================================
   WHATSAPP PENDING ALERT BADGE (wa.me fallback queue)
   ========================================================================== */

let whatsappAlertPollTimer = null;

function renderWhatsAppAlertDropdown(alerts = []) {
    const dropdown = document.getElementById('whatsappAlertDropdown');
    const wrap = document.getElementById('whatsappAlertBadgeWrap');
    const countEl = document.getElementById('whatsappAlertBadgeCount');
    if (!dropdown || !wrap || !countEl) return;

    const count = alerts.length;
    countEl.textContent = String(count);
    wrap.style.display = count > 0 ? 'block' : 'none';

    if (count === 0) {
        dropdown.style.display = 'none';
        dropdown.innerHTML = '';
        return;
    }

    dropdown.innerHTML = alerts.map((alert) => `
        <div class="whatsapp-alert-item" data-alert-id="${escHtml(alert.id)}">
            <div class="whatsapp-alert-item-head">
                <strong>#${escHtml(alert.orderId || 'Order')}</strong>
                <button type="button" class="whatsapp-alert-dismiss" data-dismiss-id="${escHtml(alert.id)}" title="Dismiss">×</button>
            </div>
            <p class="whatsapp-alert-reason">${escHtml(alert.reason || 'Tap to send via WhatsApp')}</p>
            <a href="${escHtml(alert.waMeUrl || '#')}" target="_blank" rel="noopener noreferrer" class="whatsapp-alert-send-link">
                <i class="fa-brands fa-whatsapp"></i> Open WhatsApp
            </a>
        </div>
    `).join('');

    dropdown.querySelectorAll('[data-dismiss-id]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const alertId = btn.getAttribute('data-dismiss-id');
            try {
                await fetch(`/api/admin/whatsapp-alerts/${encodeURIComponent(alertId)}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            } catch (err) {
                console.warn('Dismiss WhatsApp alert failed:', err);
            }
            fetchPendingWhatsAppAlerts();
        });
    });
}

async function fetchPendingWhatsAppAlerts() {
    try {
        const res = await fetch('/api/admin/whatsapp-alerts/pending', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            renderWhatsAppAlertDropdown(Array.isArray(data.data) ? data.data : []);
        }
    } catch (err) {
        console.warn('Could not load pending WhatsApp alerts:', err);
    }
}

function setupWhatsAppAlertBadge() {
    const btn = document.getElementById('whatsappAlertBadgeBtn');
    const dropdown = document.getElementById('whatsappAlertDropdown');

    if (btn && dropdown) {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        });

        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
    }

    fetchPendingWhatsAppAlerts();
    if (whatsappAlertPollTimer) clearInterval(whatsappAlertPollTimer);
    whatsappAlertPollTimer = setInterval(fetchPendingWhatsAppAlerts, 30000);
}

/**
 * ৭.২: অর্ডার ফিল্টারিং এবং রিয়েল-টাইম সার্চিং লজিক
 * অর্ডার আইডি, কাস্টমারের নাম বা ফোন নাম্বার টাইপ করলেই টেবিল ইনস্ট্যান্ট আপডেট হবে
 */
window.filterAndRenderOrders = function() {
    const searchInput = document.getElementById('orderSearchInput');
    const filterSelect = document.getElementById('orderStatusFilter');

    const search = (searchInput ? searchInput.value : '').toLowerCase();
    const statusFilter = (filterSelect ? filterSelect.value : 'all').toLowerCase();

    // সার্চ কি-ওয়ার্ড এবং ড্রপডাউন স্ট্যাটাস ফিল্টারের সাথে ম্যাচিং করানো
    currentFilteredOrders = globalOrders.filter(order => {
        const orderIdStr = (order.orderId || order._id || '').toLowerCase();
        const nameStr = (order.customerName || '').toLowerCase();
        const phoneStr = (order.customerPhone || '').toLowerCase();
        
        const matchSearch = orderIdStr.includes(search) || nameStr.includes(search) || phoneStr.includes(search);
        const matchStatus = (statusFilter === 'all' || (order.status || 'pending').toLowerCase() === statusFilter);
        
        return matchSearch && matchStatus;
    });

    // ফিল্টার অ্যাপ্লাই করার পর পেজ নাম্বার ১ এ রিসেট করা
    currentOrderPage = 1;
    renderOrderTable();
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

/* ============================================================
   🚚 COURIER BOOKING (Steadfast / Pathao / RedX)
   ============================================================ */

const COURIER_TRACKING_BASE_URLS = {
    Steadfast: 'https://steadfast.com.bd/t/',
    Pathao: 'https://merchant.pathao.com/tracking?consignment_id=',
    RedX: 'https://redx.com.bd/track-global-parcel/?trackingId='
};

// Mirrors the server-side guard — these orders can never be handed to a courier.
const COURIER_BLOCKED_STATUSES = ['cancelled', 'canceled', 'returned', 'refunded', 'return requested'];

// Filled from the Master Settings payload that fetchLiveOrders() already loads,
// so the button can name the store's configured provider.
let adminCourierConfig = { provider: 'Steadfast', isConfigured: false, mockMode: true };

function cacheAdminCourierSettings(settings) {
    if (!settings) return;
    const isConfigured = Boolean(
        String(settings.courierApiKey || '').trim() && String(settings.courierSecretKey || '').trim()
    );
    adminCourierConfig = {
        provider: settings.defaultCourierProvider || 'Steadfast',
        isConfigured,
        mockMode: !isConfigured
    };
}

function getCourierTrackingUrl(provider, trackingId) {
    const base = COURIER_TRACKING_BASE_URLS[provider];
    const code = String(trackingId || '').trim();
    if (!base || !code) return '';
    return `${base}${encodeURIComponent(code)}`;
}

/**
 * Renders either the tracking badge (already booked) or the one-click booking
 * button (not booked yet) for an order row.
 */
function buildCourierActionHtml(order) {
    const trackingId = String(order.courierTrackingId || '').trim();
    const provider = order.courierProvider || adminCourierConfig.provider || 'Steadfast';
    const safeProvider = escapeToastText(provider);

    if (trackingId) {
        const safeTracking = escapeToastText(trackingId);
        const trackingUrl = getCourierTrackingUrl(provider, trackingId);
        const badgeLabel = `<span class="order-courier-sent-label">🚚 Sent</span><span class="order-courier-sent-id">${safeTracking}</span>`;

        return trackingUrl
            ? `<a href="${trackingUrl}" target="_blank" rel="noopener noreferrer" class="order-courier-btn order-courier-sent courier-tracking-badge" title="Track ${safeTracking} on ${safeProvider}">${badgeLabel}</a>`
            : `<span class="order-courier-btn order-courier-sent courier-tracking-badge" title="Booked with ${safeProvider}">${badgeLabel}</span>`;
    }

    if (COURIER_BLOCKED_STATUSES.includes(String(order.status || '').trim().toLowerCase())) {
        return '';
    }

    return `<button type="button" class="order-courier-btn send-courier-btn" onclick="sendOrderToCourier('${order._id}')" title="Book this parcel with ${safeProvider}">
                <i class="fa-solid fa-truck-fast" aria-hidden="true"></i>
                <span class="send-courier-label">Send to Courier</span>
            </button>`;
}

/**
 * ৭.৪খ: এক ক্লিকে কুরিয়ার পার্সেল বুকিং
 * Steadfast API-তে পার্সেল তৈরি করে ট্র্যাকিং আইডি সংরক্ষণ করে।
 * @param {string} orderId - অর্ডারের ডাটাবেজ আইডি
 */
window.sendOrderToCourier = function(orderId) {
    const order = globalOrders.find(o => String(o._id) === String(orderId));
    const provider = order?.courierProvider || adminCourierConfig.provider || 'Steadfast';
    const displayId = order?.orderId || String(orderId).slice(-6).toUpperCase();
    const isMockMode = adminCourierConfig.mockMode;

    const confirmTitle = isMockMode ? `Send to ${provider} (Mock Mode)` : `Send to ${provider}`;
    const confirmBody = isMockMode
        ? `No courier API credentials are configured. Order #${displayId} will receive a mock tracking ID (e.g. SF-PENDING-XXXXX), be marked as Shipped, and saved to the database.`
        : `Book order #${displayId} as a ${provider} parcel? This creates a real consignment and marks the order as Shipped.`;

    showCustomConfirm(
        confirmTitle,
        confirmBody,
        async () => {
            const bookBtn = document.querySelector(`tr[data-order-id="${orderId}"] .send-courier-btn`);
            const restore = setButtonLoading(bookBtn, isMockMode ? 'Booking (Mock)...' : 'Booking...');

            try {
                const response = await fetch(`/api/admin/orders/${orderId}/send-courier`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                });

                const result = await response.json();

                if (result.success) {
                    const toastMsg = result.mockMode
                        ? (result.message || 'Mock parcel booked! Order marked as Shipped.')
                        : (result.message || 'Parcel booked successfully!');
                    showToast(toastMsg, 'success');
                    fetchLiveOrders();
                    return;
                }

                showToast(result.message || 'Courier booking failed.', 'error');
                // A 409 means the order was already booked elsewhere — resync so
                // the row shows the tracking badge instead of the button.
                if (response.status === 409) fetchLiveOrders();
            } catch (error) {
                console.error('Courier booking error:', error);
                showToast('Server connection error! Parcel was not booked.', 'error');
            } finally {
                restore();
            }
        }
    );
};

function buildAdminOrderStatusCell(order) {
    const orderId = order._id;
    const statusLower = String(order.status || 'pending').toLowerCase();
    const isCancelled = statusLower === 'cancelled' || statusLower === 'canceled';
    const isReturnRequested = statusLower === 'return requested';
    const isReturned = statusLower === 'returned';
    const isRefunded = statusLower === 'refunded';

    let badgeHtml = '';

    if (isCancelled) {
        const by = order.cancelledBy === 'Admin' ? 'Admin' : 'Customer';
        const badgeClass = by === 'Admin' ? 'status-cancelled-admin' : 'status-cancelled-customer';
        badgeHtml = `<span class="status-badge ${badgeClass}"><i class="fa-solid fa-ban"></i> Cancelled (${by})</span>`;
    } else if (isReturnRequested) {
        badgeHtml = `<span class="status-badge status-return-requested"><i class="fa-solid fa-rotate-left"></i> Return Requested</span>`;
    } else if (isReturned) {
        badgeHtml = `<span class="status-badge status-returned"><i class="fa-solid fa-check-double"></i> Returned</span>`;
    } else if (isRefunded) {
        badgeHtml = `<span class="status-badge status-returned"><i class="fa-solid fa-money-bill-wave"></i> Refunded</span>`;
    } else {
        badgeHtml = `
            <select onchange="changeOrderStatus('${orderId}', this.value)" class="filter-box">
                <option value="Pending" ${order.status === 'Pending' ? 'selected' : ''}>⏳ Pending</option>
                <option value="Processing" ${order.status === 'Processing' ? 'selected' : ''}>⚙️ Processing</option>
                <option value="Shipped" ${order.status === 'Shipped' ? 'selected' : ''}>🚚 Shipped</option>
                <option value="Delivered" ${order.status === 'Delivered' ? 'selected' : ''}>✅ Delivered</option>
                <option value="Cancelled" ${order.status === 'Cancelled' ? 'selected' : ''}>❌ Cancelled</option>
            </select>`;
    }

    const reasonDetails = getOrderReasonDetails(order);
    const reasonBtn = reasonDetails
        ? `<button type="button" class="view-reason-btn" onclick="showOrderReasonDetails('${orderId}')" title="View ${reasonDetails.actionType.toLowerCase()} reason">
                <i class="fa-solid fa-circle-info"></i><span>View Reason</span>
           </button>`
        : '';

    const undoRefundBtn = canUndoRefund(order)
        ? `<button type="button" class="undo-refund-btn" onclick="undoOrderRefund('${orderId}')" title="Reverse refund and restore return request">
                <i class="fa-solid fa-rotate-left"></i><span class="undo-refund-label">Undo Refund</span>
           </button>`
        : '';

    return `<div class="order-status-cell">${badgeHtml}${undoRefundBtn}${reasonBtn}</div>`;
}

window.showOrderReasonDetails = function(orderId) {
    const order = globalOrders.find(o => String(o._id) === String(orderId));
    const details = getOrderReasonDetails(order);

    if (!order || !details) {
        showToast('No reason details found for this order.', 'warning');
        return;
    }

    const displayId = order.orderId || String(order._id).slice(-6).toUpperCase();
    const modal = document.getElementById('orderReasonModal');
    const orderIdEl = document.getElementById('orderReasonOrderId');
    const actionTypeEl = document.getElementById('orderReasonActionType');
    const initiatedByEl = document.getElementById('orderReasonInitiatedBy');
    const reasonTextEl = document.getElementById('orderReasonText');
    const subtitleEl = document.getElementById('orderReasonModalSubtitle');

    if (orderIdEl) orderIdEl.textContent = `#${displayId}`;
    if (actionTypeEl) actionTypeEl.textContent = details.actionType;
    if (initiatedByEl) initiatedByEl.textContent = details.initiatedBy;
    if (reasonTextEl) reasonTextEl.textContent = details.reason;
    if (subtitleEl) {
        subtitleEl.textContent = details.actionType === 'Cancellation'
            ? `This order was cancelled by the ${details.initiatedBy.toLowerCase()}.`
            : 'This is the reason the customer submitted for their return request.';
    }
    if (modal) modal.style.display = 'flex';
};

window.closeOrderReasonModal = function() {
    const modal = document.getElementById('orderReasonModal');
    if (modal) modal.style.display = 'none';
};

/**
 * ৭.৩: ডাইনামিক অর্ডার টেবিল রেন্ডারিং এবং পেজিনেশন প্রসেসর
 * ফিল্টারকৃত ডাটাকে লিমিট অনুযায়ী টেবিলে সুন্দর করে সাজিয়ে ফুটিয়ে তোলে
 */
window.renderOrderTable = function() {
    if (!tableBody) return;
    
    const totalItems = currentFilteredOrders.length;
    const totalPages = Math.ceil(totalItems / ordersPerPage) || 1;
    
    if (currentOrderPage > totalPages) currentOrderPage = totalPages;
    const startIdx = (currentOrderPage - 1) * ordersPerPage;
    const paginatedOrders = currentFilteredOrders.slice(startIdx, startIdx + ordersPerPage);

    // পেজিনেশনের ফুটার বাটন ও ইনফো টেক্সট আপডেট
    if (document.getElementById('order-start-idx')) {
        document.getElementById('order-start-idx').innerText = totalItems === 0 ? 0 : startIdx + 1;
        document.getElementById('order-end-idx').innerText = startIdx + paginatedOrders.length;
        document.getElementById('order-total-entries').innerText = totalItems; 
    }

    // ডাইনামিক পেজ নম্বর বাটন জেনারেট করা
    renderOrderPaginationControls(totalPages);

    // ডাটা না থাকলে খালি টেবিল মেসেজ দেখানো
    tableBody.innerHTML = paginatedOrders.length === 0 ? `<tr><td colspan="8" class="loading-cell">No matching orders found.</td></tr>` : '';

    // লুপ চালিয়ে প্রতিটি অর্ডার রো (Row) তৈরি করা
    paginatedOrders.forEach((order) => {
        const orderId = order._id;
        const displayId = order.orderId || orderId.slice(-6).toUpperCase();
        
        // তারিখ ও সময় ফরম্যাটিং
        let dateHtml = `<span>N/A</span>`;
        if (order.createdAt) {
            const dateObj = new Date(order.createdAt);
            const dateStr = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            dateHtml = `<span class="order-date-main">${dateStr}</span><span class="order-date-time"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${timeStr}</span>`;
        }
        
        // কাস্টমারের কেনা প্রোডাক্টের তালিকা তৈরি
        let itemsList = '';
        if (order.items) {
            order.items.forEach(item => itemsList += `<li><i class="fa-solid fa-cube" aria-hidden="true"></i> ${item.name} <b>(x${item.quantity})</b></li>`);
        }

        const statusLower = (order.status || 'pending').toLowerCase();
        const isReturnRequested = statusLower === 'return requested';

        const statusCellHtml = buildAdminOrderStatusCell(order);
        const courierActionHtml = buildCourierActionHtml(order);

        const approveReturnBtn = isReturnRequested
            ? `<button type="button" class="order-action-pill approve-return-btn" onclick="approveOrderReturn('${orderId}')" title="Approve Return &amp; Refund Wallet">
                    <i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i><span class="approve-return-label">Approve</span>
               </button>`
            : '';

        const tr = document.createElement('tr');
        tr.dataset.orderId = orderId;
        if (isReturnRequested) tr.classList.add('order-row-return-requested');
        tr.innerHTML = `
            <td class="col-order-id"><span class="order-id-chip">#${displayId}</span></td>
            <td class="col-datetime">${dateHtml}</td>
            <td class="col-customer">
                <span class="order-customer-name">${order.customerName || '—'}</span>
                <span class="order-customer-phone"><i class="fa-solid fa-phone" aria-hidden="true"></i> ${order.customerPhone || '—'}</span>
            </td>
            <td class="col-address"><span class="order-address-text">${order.customerAddress || '—'}</span></td>
            <td class="col-products"><ul class="order-items-list">${itemsList}</ul></td>
            <td class="col-total"><span class="order-total-amount">${formatAdminPrice(getOrderGrandTotal(order))}</span></td>
            <td class="col-status">${statusCellHtml}</td>
            <td class="order-actions-cell">
                <div class="order-actions-toolbar">
                    ${courierActionHtml}
                    ${approveReturnBtn}
                    <button type="button" class="order-action-icon order-action-invoice" onclick="viewInvoice('${orderId}')" title="View Invoice" aria-label="View Invoice">
                        <i class="fa-solid fa-file-invoice" aria-hidden="true"></i>
                    </button>
                    <button type="button" class="order-action-icon order-action-delete" onclick="deleteOrder('${orderId}')" title="Delete Order" aria-label="Delete Order">
                        <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
                    </button>
                </div>
            </td>
        `;
        tableBody.appendChild(tr);
    });
};

/**
 * ৭.৪: লাইভ অর্ডার স্ট্যাটাস পরিবর্তন ইঞ্জিন
 * @param {string} orderId - অর্ডারের ডাটাবেজ আইডি
 * @param {string} newStatus - নতুন সিলেক্টেড স্ট্যাটাস
 */
window.changeOrderStatus = async function(orderId, newStatus) {
    try {
        const response = await fetch(`/api/orders/${orderId}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status: newStatus })
        });
        const result = await response.json();
        if (result.success) {
            showToast(`Order status changed to ${newStatus}!`, 'success');
            fetchLiveOrders(); // ডাটা রিলোড করে টেবিল সিঙ্ক করা
        } else showToast("Error updating status!", 'error');
    } catch (error) {
        showToast("Server connection error!", 'error');
    }
};

/**
 * ৭.৪ক: Return Requested অর্ডার অনুমোদন ও ওয়ালেট রিফান্ড
 */
window.approveOrderReturn = function(orderId) {
    showCustomConfirm(
        'Approve Return',
        'Approve this return and refund the order total to the customer wallet?',
        async () => {
            const approveBtn = document.querySelector(`tr[data-order-id="${orderId}"] .approve-return-btn`);
            const originalHtml = approveBtn ? approveBtn.innerHTML : '';

            if (approveBtn) {
                approveBtn.disabled = true;
                approveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            }

            try {
                const response = await fetch(`/api/admin/orders/${orderId}/approve-return`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    const idx = globalOrders.findIndex(o => String(o._id) === String(orderId));
                    if (idx !== -1) {
                        const updated = result.data?.order || {};
                        globalOrders[idx] = {
                            ...globalOrders[idx],
                            status: updated.status || 'Returned',
                            refundedAt: updated.refundedAt || new Date().toISOString(),
                            refundAmount: updated.refundAmount ?? result.data?.refundAmount ?? getOrderGrandTotal(globalOrders[idx]),
                            statusBeforeRefund: updated.statusBeforeRefund || 'Return Requested'
                        };
                    }
                    showAdminSuccess(
                        'Return Approved',
                        result.message || `Refund processed. Order marked as Returned.`
                    );
                    filterAndRenderOrders();
                } else {
                    showToast(result.message || 'Failed to approve return.', 'error');
                    if (approveBtn) {
                        approveBtn.disabled = false;
                        approveBtn.innerHTML = originalHtml;
                    }
                }
            } catch (error) {
                console.error('Approve return error:', error);
                showToast('Server connection error!', 'error');
                if (approveBtn) {
                    approveBtn.disabled = false;
                    approveBtn.innerHTML = originalHtml;
                }
            }
        },
        'warning'
    );
};

/**
 * ৭.৪খ: Returned/Refunded অর্ডারের রিফান্ড নিরাপদে উল্টানো (Safe Undo Refund)
 */
window.undoOrderRefund = function(orderId) {
    const order = globalOrders.find(o => String(o._id) === String(orderId));
    const refundAmount = order ? getOrderGrandTotal(order) : 0;

    showCustomConfirm(
        'Undo Refund',
        refundAmount > 0
            ? `Reverse the ৳${refundAmount.toLocaleString()} wallet refund? The amount will be deducted from the customer's wallet and the order will return to Return Requested.`
            : 'Reverse this refund? The amount will be deducted from the customer wallet and the order will return to Return Requested.',
        async () => {
            const undoBtn = document.querySelector(`tr[data-order-id="${orderId}"] .undo-refund-btn`);
            const originalHtml = undoBtn ? undoBtn.innerHTML : '';

            if (undoBtn) {
                undoBtn.disabled = true;
                undoBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            }

            try {
                const response = await fetch(`/api/admin/orders/${orderId}/undo-refund`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    const idx = globalOrders.findIndex(o => String(o._id) === String(orderId));
                    if (idx !== -1) {
                        const updated = result.data?.order || {};
                        globalOrders[idx] = {
                            ...globalOrders[idx],
                            status: updated.status || 'Return Requested',
                            refundedAt: null,
                            refundAmount: 0,
                            statusBeforeRefund: ''
                        };
                    }

                    if (typeof Swal !== 'undefined') {
                        Swal.fire({
                            icon: 'success',
                            title: 'Refund Undone',
                            text: result.message || 'Refund reversed successfully.',
                            confirmButtonColor: '#3b82f6'
                        });
                    } else {
                        showAdminSuccess('Refund Undone', result.message || 'Refund reversed successfully.');
                    }
                    filterAndRenderOrders();
                } else {
                    const errMsg = result.message || 'Failed to undo refund.';
                    if (typeof Swal !== 'undefined') {
                        Swal.fire({
                            icon: 'error',
                            title: errMsg.includes('already spent') ? 'Cannot Undo Refund' : 'Undo Failed',
                            text: errMsg,
                            confirmButtonColor: '#ef4444'
                        });
                    } else {
                        showToast(errMsg, 'error');
                    }
                    if (undoBtn) {
                        undoBtn.disabled = false;
                        undoBtn.innerHTML = originalHtml;
                    }
                }
            } catch (error) {
                console.error('Undo refund error:', error);
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'error',
                        title: 'Server Error',
                        text: 'Could not connect to the server. Please try again.',
                        confirmButtonColor: '#ef4444'
                    });
                } else {
                    showToast('Server connection error!', 'error');
                }
                if (undoBtn) {
                    undoBtn.disabled = false;
                    undoBtn.innerHTML = originalHtml;
                }
            }
        },
        'danger'
    );
};

/**
 * ۷.৫: সিঙ্গেল অর্ডার ডিলিট করার লজিক (নিরাপত্তা প্রম্পট সহ)
 * @param {string} orderId - ডিলিট করার জন্য অর্ডার আইডি
 */
window.deleteOrder = function(orderId) {
    showCustomConfirm("Delete Order", "Are you sure you want to permanently delete this order?", async () => {
        try {
            const response = await fetch(`/api/orders/${orderId}`, { 
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await response.json();
            if (response.ok && result.success) {
                removeOrderFromState(orderId);
                showAdminSuccess('Order Deleted', result.message || 'Order removed from live queue.');
            } else {
                showToast(result.message || "Failed to delete order.", "error");
            }
        } catch (err) { showToast("Server error!", "error"); }
    }, "danger");
};


/* ==========================================================================
   SECTION 7.1: INVOICE ENGINE (অর্ডার ইনভয়েস মডাল কন্ট্রোলার)
   ========================================================================== */

/**
 * ৭.৬: নির্দিষ্ট অর্ডারের কাস্টম ডিজিটাল ইনভয়েস মডাল ওপেন করা
 * @param {string} orderId - ইনভয়েস দেখার জন্য অর্ডার আইডি
 */
window.viewInvoice = function(orderId) {
    const order = globalOrders.find(o => o._id === orderId); 
    const modal = document.getElementById('invoiceModal');
    if (!order || !modal) return showToast("Invoice data not found!", "error");

    const subTotal = Number(order.subTotal ?? order.subtotal) || 0;
    const discountAmount = Number(order.discountAmount) || 0;
    const deliveryCharge = Number(order.deliveryCharge ?? order.shippingFee) || 0;
    const grandTotal = Number(order.grandTotal ?? order.totalAmount)
        || Math.max(0, subTotal - discountAmount + deliveryCharge);
    const shippingLocationType = order.shippingLocationType
        || (order.deliveryLocationType === 'outside' ? 'Outside City' : 'Inside City');
    const shippingDistrict = order.shippingDistrict || 'N/A';

    // মডালে কাস্টমার ডাটা পুশ করা
    document.getElementById('invOrderId').innerText = order.orderId || '#' + orderId.slice(-6).toUpperCase();
    document.getElementById('invCustomerName').innerText = order.customerName || 'N/A';
    document.getElementById('invCustomerPhone').innerText = order.customerPhone || 'N/A';
    document.getElementById('invCustomerAddress').innerText = order.customerAddress || 'N/A';
    
    document.getElementById('invPaymentMethod').innerText = order.paymentMethod ? order.paymentMethod : "COD";
    document.getElementById('invShippingLocation').innerText = `${shippingDistrict} (${shippingLocationType})`;
    document.getElementById('invNote').innerText = order.note && order.note.trim() !== "" ? order.note : "No note provided";

    // 🚚 কুরিয়ার বুকিং ডিটেইলস — শুধু বুক করা অর্ডারের জন্য দেখানো হয়
    const courierRow = document.getElementById('invCourierRow');
    const courierInfoEl = document.getElementById('invCourierInfo');
    const invTrackingId = String(order.courierTrackingId || '').trim();
    if (courierRow && courierInfoEl) {
        if (invTrackingId) {
            const invProvider = order.courierProvider || adminCourierConfig.provider || 'Steadfast';
            const consignment = order.courierConsignmentId ? ` · Consignment: ${order.courierConsignmentId}` : '';
            courierInfoEl.innerText = `${invProvider} — ${invTrackingId}${consignment}`;
            courierRow.style.display = '';
        } else {
            courierRow.style.display = 'none';
        }
    }

    document.getElementById('invSubTotal').innerText = formatAdminPrice(subTotal);

    const discountRow = document.getElementById('invDiscountRow');
    if (discountAmount > 0 && discountRow) {
        discountRow.style.display = 'flex';
        document.getElementById('invDiscountAmount').innerText = `-${formatAdminPrice(discountAmount)}`;
        document.getElementById('invCouponCode').innerText = order.couponCode || '';
    } else if (discountRow) {
        discountRow.style.display = 'none';
    }

    const deliveryEl = document.getElementById('invDeliveryCharge');
    if (deliveryEl) {
        deliveryEl.innerText = deliveryCharge === 0 ? 'Free Shipping' : formatAdminPrice(deliveryCharge);
    }

    document.getElementById('invTotalAmount').innerText = formatAdminPrice(grandTotal);

    // আইটেম লিস্ট জেনারেট করা
    const itemsContainer = document.getElementById('invItemsList');
    let itemsHTML = '';
    if (order.items) {
        order.items.forEach(item => {
            itemsHTML += `<div style="display:flex; justify-content:space-between; padding: 10px 0; border-bottom: 1px dashed #e2e8f0;">
                <span><i class="fa-solid fa-cube text-muted"></i> ${item.name} (x${item.quantity})</span>
                <b class="text-main">${formatAdminPrice((item.price || 0) * (item.quantity || 1))}</b>
            </div>`;
        });
    }
    itemsContainer.innerHTML = itemsHTML;
    modal.style.display = 'flex'; // মডাল প্রদর্শন
};

/**
 * ৭.৭: ইনভয়েস মডাল বন্ধ করার ফাংশন
 */
window.closeInvoiceModal = function() {
    const modal = document.getElementById('invoiceModal');
    if (modal) modal.style.display = 'none';
};

window.printInvoice = function() {
    document.body.classList.add('printing-invoice');
    const cleanup = () => {
        document.body.classList.remove('printing-invoice');
        window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
};


/* ==========================================================================
   SECTION 7.2: ORDER PAGINATION CONTROLS (অর্ডার পেজিনেশন নেভিগেশন)
   ========================================================================== */

/**
 * ৭.৮: প্রতি পেজে কতটি অর্ডার দেখাবে তা পরিবর্তন করার ফাংশন
 */
window.changeOrderPageSize = function() {
    const select = document.getElementById('orderItemsPerPage');
    if (select) {
        ordersPerPage = parseInt(select.value);
        currentOrderPage = 1; // পেজ সাইজ পাল্টালে আবার ১ম পেজে নিয়ে আসা
        renderOrderTable();
    }
};

/**
 * ৭.৯: পরবর্তী পেজে যাওয়ার নেভিগেশন বাটন
 */
window.goToNextOrderPage = function() {
    const totalItems = currentFilteredOrders.length;
    const totalPages = Math.ceil(totalItems / ordersPerPage) || 1;
    if (currentOrderPage < totalPages) {
        currentOrderPage++;
        renderOrderTable();
    }
};

/**
 * ৭.১০: পূর্ববর্তী পেজে যাওয়ার নেভিগেশন বাটন
 */
window.goToPreviousOrderPage = function() {
    if (currentOrderPage > 1) {
        currentOrderPage--;
        renderOrderTable();
    }
};

/**
 * ৭.১১: নির্দিষ্ট পেজ নম্বরে ডাইরেক্ট যাওয়ার নেভিগেশন
 */
window.goToOrderPage = function(pageNumber) {
    currentOrderPage = pageNumber;
    renderOrderTable();
};

/**
 * ৭.১২: টেবিলের নিচে ডাইনামিক পেজ নম্বর বাটন স্ট্রাকচার তৈরি করা
 * @param {number} totalPages - মোট পেজের সংখ্যা
 */
function renderOrderPaginationControls(totalPages) {
    const paginationContainer = document.getElementById('dynamic-order-pages');
    if (!paginationContainer) return;

    paginationContainer.innerHTML = ''; // পুরোনো বাটন বা ডুপ্লিকেট ক্লিয়ার করা
    
    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.classList.add('page-num-btn');
        if (i === currentOrderPage) {
            btn.classList.add('active-page');
        }
        btn.innerText = i;
        btn.onclick = () => goToOrderPage(i);
        paginationContainer.appendChild(btn);
    }

    // প্রথম বা শেষ পেজে থাকলে Next/Prev বাটনগুলোকে ডিজেবল (Disable) করা
    const prevBtn = document.getElementById('btn-prev-order');
    const nextBtn = document.getElementById('btn-next-order');
    
    if (prevBtn) prevBtn.disabled = currentOrderPage === 1;
    if (nextBtn) nextBtn.disabled = currentOrderPage === totalPages;
}

// সার্চ এবং স্ট্যাটাস চেঞ্জের জন্য ইভেন্ট লিসেনার ইনিশিয়ালাইজেশন
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('orderSearchInput');
    const filterSelect = document.getElementById('orderStatusFilter');
    
    if (searchInput) searchInput.addEventListener('input', window.filterAndRenderOrders);
    if (filterSelect) filterSelect.addEventListener('change', window.filterAndRenderOrders);
});







/* ==========================================================================
   SECTION 8: ADD NEW PRODUCT ENGINE (নতুন প্রোডাক্ট আপলোড মডিউল)
   ========================================================================== */

// ৮.১: প্রোডাক্ট আপলোডের সময় ফাইল ট্র্যাকিং এর জন্য গ্লোবাল ডাটা ট্রান্সফার অবজেক্ট
let selectedFilesAdd = new DataTransfer(); 

/**
 * ৮.২: ছবি সিলেক্ট করার পর ডাইনামিক লাইভ প্রিভিউ জেনারেটর (ক্রস বাটন সহ)
 * @param {Event} event - ফাইল ইনপুট চেঞ্জ ইভেন্ট
 */
window.previewImage = function(event) {
    const files = event.target.files;
    if (files && files.length > 0) {
        // নতুন সিলেক্ট করা ফাইলগুলো গ্লোবাল লিস্টে যোগ করা
        Array.from(files).forEach(file => selectedFilesAdd.items.add(file));
    }
    event.target.files = selectedFilesAdd.files; // অরিজিনাল ইনপুট ফাইল আপডেট
    renderAddPreviews();
};

/**
 * ৮.৩: সিলেক্টেড ছবিগুলোর প্রিভিউ ডমে (DOM) রেন্ডার করা
 */
function renderAddPreviews() {
    const previewBox = document.getElementById('imgPreviewBox');
    if (!previewBox) return;
    previewBox.innerHTML = '';

    // কোনো ফাইল সিলেক্ট না থাকলে ডিফল্ট প্লেসহোল্ডার দেখানো
    if (selectedFilesAdd.files.length === 0) {
        previewBox.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i><p>Upload Images</p>`;
        return;
    }

    // প্রতিটা ফাইলের জন্য FileReader দিয়ে প্রিভিউ থাম্বনেইল এবং ডিলিট বাটন তৈরি
    Array.from(selectedFilesAdd.files).forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = e => {
            previewBox.innerHTML += `
            <div style="position:relative; display:inline-block; margin:5px;">
                <img src="${e.target.result}" style="height:80px; border-radius:5px; object-fit: cover;">
                <button type="button" onclick="removeAddImage(${index})" style="position:absolute; top:-5px; right:-5px; background:#ef4444; color:white; border:none; border-radius:50%; width:22px; height:22px; cursor:pointer; font-size:14px; font-weight:bold; line-height:1;">&times;</button>
            </div>`;
        };
        reader.readAsDataURL(file);
    });
}

/**
 * ৮.৪: প্রিভিউ থেকে নির্দিষ্ট কোনো ছবি বাদ দেওয়ার (ক্রস বাটন) ফাংশন
 * @param {number} index - ফাইল লিস্টের ইনডেক্স নম্বর
 */
window.removeAddImage = function(index) {
    const dt = new DataTransfer();
    const files = selectedFilesAdd.files;
    for (let i = 0; i < files.length; i++) {
        if (i !== index) dt.items.add(files[i]);
    }
    selectedFilesAdd = dt;
    document.getElementById('prodImageFile').files = selectedFilesAdd.files;
    renderAddPreviews();
};

/**
 * ৮.৫: ব্যাকএন্ড ক্লাউড সার্ভারে নতুন প্রোডাক্ট ডাটা এবং ইমেজ আপলোড করা
 * এতে Detailed Description, Highlights এবং Dynamic Category ফিল্ড অন্তর্ভুক্ত রয়েছে
 */
window.uploadProduct = async function() {
    const id = document.getElementById('prodId').value.trim();
    const name = document.getElementById('prodName').value.trim();
    const price = document.getElementById('prodPrice').value.trim();
    const buyingPrice = document.getElementById('prodBuyingPrice') ? document.getElementById('prodBuyingPrice').value.trim() : '';
    const stockField = document.getElementById('prodStock');
    const variantPayload = collectProductVariantPayload('add');
    const stock = String(variantPayload.stock ?? stockField?.value ?? '').trim();
    const category = document.getElementById('prodCategory').value;
    const brand = document.getElementById('prodBrand') ? document.getElementById('prodBrand').value : '';
    const emoji = document.getElementById('prodEmoji').value.trim();
    const desc = document.getElementById('prodDesc').value.trim();
    
    // নতুন মাল্টি-ফাংশনাল ফিল্ড ডাটা সংগ্রহ
    const detailedDesc = document.getElementById('prodDetailedDesc') ? document.getElementById('prodDetailedDesc').value.trim() : '';
    const highlightsInput = document.getElementById('prodHighlights') ? document.getElementById('prodHighlights').value.trim() : '';
    
    const files = document.getElementById('prodImageFile').files; 

    // ডাটা ভ্যালিডেশন চেক (নতুন: ক্যাটাগরি সিলেক্ট করা হয়েছে কি না চেক করা)
    if (!name || !id || !price || !stock || !category) return showToast("Required fields missing or Category not selected!", "warning");
    if (!emoji && files.length === 0) return showToast("Provide an Emoji or Image!", "warning");

    // বাটন লোডিং স্টেট অ্যানিমেশন চালু
    const btn = document.activeElement; 
    let originalText = '';
    if (btn && btn.tagName === 'BUTTON') { 
        originalText = btn.innerHTML;
        btn.disabled = true; 
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...'; 
    }

    // হাইলাইটস ইনপুটকে কমা দিয়ে ভাগ করে অ্যারে স্ট্রাকচারে রূপান্তর
    const highlightsArray = highlightsInput 
        ? highlightsInput.split(',').map(item => item.trim()).filter(item => item !== '') 
        : [];

    // মাল্টিপার্ট ফর্ম ডাটা (FormData) অবজেক্ট তৈরি
    const formData = new FormData();
    formData.append('id', id); 
    formData.append('name', name); 
    formData.append('price', price);
    formData.append('buyingPrice', buyingPrice || 0);
    formData.append('stock', stock);
    formData.append('stockQuantity', variantPayload.stockQuantity);
    formData.append('hasVariants', variantPayload.hasVariants ? 'true' : 'false');
    formData.append('variants', JSON.stringify(variantPayload.variants));
    formData.append('category', category);
    formData.append('brand', brand || '');
    formData.append('icon', emoji);
    formData.append('description', desc);
    formData.append('detailedDescription', detailedDesc); 
    formData.append('highlights', JSON.stringify(highlightsArray)); 
    
    // একাধিক ছবি থাকলে সবগুলোকে ব্যাকএন্ড রাউটের 'productImages' কী-তে অ্যাপেন্ড করা
    if (files.length > 0) {
        for (let i = 0; i < files.length; i++) {
            formData.append('productImages', files[i]);
        }
    }

    try {
        const res = await fetch('/api/products', { 
            method: 'POST', 
            headers: { 'Authorization': `Bearer ${token}` }, // token গ্লোবাল ভেরিয়েবল হিসেবে থাকা লাগবে
            body: formData 
        });
        const result = await res.json();

        if (result.success) {
            showAdminSuccess('Product Launched', result.message || 'Product uploaded successfully!');
            document.getElementById('addProductForm').reset();

            // ভ্যারিয়েশন সারি ও ব্র্যান্ড সিলেকশন রিসেট করা
            resetProductVariantUI('add');
            if (document.getElementById('prodBrand')) document.getElementById('prodBrand').value = '';
            
            // ডাটা ট্রান্সফার রিসেট ও প্রিভিউ ক্লিয়ার
            selectedFilesAdd = new DataTransfer();
            document.getElementById('prodImageFile').files = selectedFilesAdd.files;
            renderAddPreviews();
            
            // প্রোডাক্ট লিস্ট লাইভ আপডেট করা (যদি ফাংশনটি এভেইলেবল থাকে)
            if (typeof fetchLiveProducts === "function") fetchLiveProducts();
        } else {
            showToast("Upload failed: " + (result.message || "Unknown error"), "error");
        }
    } catch (e) { 
        showToast("Server error during product upload!", "error"); 
    } finally { 
        // বাটনের লোডিং স্টেট রিমুভ ও আগের টেক্সট ফিরিয়ে আনা
        if (btn && btn.tagName === 'BUTTON') { btn.disabled = false; btn.innerHTML = originalText; } 
    }
};




function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function catalogActionsHtml(editHandler, deleteHandler) {
    return `<div class="catalog-actions">
        <button type="button" class="catalog-action-btn edit" onclick="${editHandler}" title="Edit" aria-label="Edit">
            <i class="fa-solid fa-pen-to-square"></i>
        </button>
        <button type="button" class="catalog-action-btn delete" onclick="${deleteHandler}" title="Delete" aria-label="Delete">
            <i class="fa-solid fa-trash-can"></i>
        </button>
    </div>`;
}

function formatCatalogDate(dateVal) {
    if (!dateVal) return '—';
    return new Date(dateVal).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ৯.১: গ্লোবাল ক্যাটাগরি লিস্ট সংরক্ষণের জন্য অ্যারে
let globalCategories = [];

/**
 * ৯.২: ডাটাবেজ (API) থেকে সব ক্যাটাগরি ফেচ করে আনা
 */
async function fetchCategories() {
    try {
        const response = await fetch('/api/categories');
        const data = await response.json();
        if (data.success) {
            globalCategories = data.data;
            renderCategoryDropdown(); // এটি এখন ৩টি ড্রপডাউনই একসাথে ডাইনামিকালি আপডেট করবে
            renderCategoryTable();
        }
    } catch (error) {
        console.error("🔴 Category load error:", error);
    }
}

/**
 * ৯.৩: প্রোডাক্ট আপলোড ফর্ম, ফিল্টার এবং এডিট মোডালের ক্যাটাগরি ড্রপডাউনে ডাটা পপুলেট (Populate) করা
 */
/**
 * ৯.৩: প্রোডাক্ট আপলোড ফর্ম এবং এডিট মোডালের ক্যাটাগরি ড্রপডাউনে ডাটা পপুলেট (Populate) করা
 */
function renderCategoryDropdown() {
    // [ক] নতুন প্রোডাক্ট আপলোড ফর্মের ড্রপডাউন (#prodCategory)
    const prodDropdown = document.getElementById('prodCategory');
    if (prodDropdown) {
        prodDropdown.innerHTML = '<option value="" disabled selected>Select a Category</option>';
        globalCategories.forEach(cat => {
            prodDropdown.innerHTML += `<option value="${cat.name}">${cat.name}</option>`;
        });
    }

    // [গ] প্রোডাক্ট এডিট মোডালের ড্রপডাউন (#editProdCategory)
    const editDropdown = document.getElementById('editProdCategory');
    if (editDropdown) {
        editDropdown.innerHTML = '<option value="" disabled>Select a Category</option>';
        globalCategories.forEach(cat => {
            editDropdown.innerHTML += `<option value="${cat.name}">${cat.name}</option>`;
        });
    }
}

/**
 * ৯.৩খ: Add ও Edit Product ফর্মের ব্র্যান্ড ড্রপডাউন ডাইনামিকালি পপুলেট করা।
 * ভ্যালু হিসেবে ব্র্যান্ডের _id সংরক্ষণ করা হয় (ব্যাকএন্ড ObjectId রেফারেন্স),
 * টেক্সট হিসেবে ব্র্যান্ডের নাম দেখানো হয়।
 */
function renderBrandDropdown() {
    const optionsHtml = '<option value="">No Brand</option>' +
        (globalBrands || []).map(b => `<option value="${b._id}">${escHtml(b.name)}</option>`).join('');

    ['prodBrand', 'editProdBrand'].forEach(sel => {
        const el = document.getElementById(sel);
        if (!el) return;
        const current = el.value;
        el.innerHTML = optionsHtml;
        el.value = current; // পূর্বের সিলেকশন থাকলে ধরে রাখা
    });
}

/* ==========================================================================
   PRODUCT VARIANT MATRIX (Simple vs Combination SKU builder)
   ========================================================================== */

const variantMatrixState = {
    add: { mode: 'simple', attributeTypes: [], combinations: [] },
    edit: { mode: 'simple', attributeTypes: [], combinations: [] }
};

let globalAttributes = [];

function getVariantModePrefix(mode) {
    return mode === 'edit' ? 'edit' : 'add';
}

function parseCommaValues(raw) {
    return String(raw || '')
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
}

function findGlobalAttributeByName(name) {
    const key = String(name || '').trim().toLowerCase();
    if (!key) return null;
    return (globalAttributes || []).find(
        a => String(a.name || '').trim().toLowerCase() === key
    ) || null;
}

function autoFillAttributeValuesFromGlobal(nameInput) {
    if (!nameInput) return;
    const attr = findGlobalAttributeByName(nameInput.value);
    if (!attr || !Array.isArray(attr.values) || !attr.values.length) return;

    const row = nameInput.closest('[data-attr-type-row]');
    if (!row) return;
    const valuesInput = row.querySelector('.attr-type-values');
    if (!valuesInput) return;

    valuesInput.value = attr.values.join(', ');
}

function setMatrixDerivedFieldLock(el, locked, title) {
    if (!el) return;
    el.readOnly = locked;
    if (locked) {
        el.classList.add('stock-auto-locked');
        el.title = title || '';
    } else {
        el.classList.remove('stock-auto-locked');
        el.title = '';
    }
}

function unlockSimpleProductDerivedFields(mode) {
    const priceInput = document.getElementById(mode === 'edit' ? 'editProdPrice' : 'prodPrice');
    const buyingInput = document.getElementById(mode === 'edit' ? 'editProdBuyingPrice' : 'prodBuyingPrice');
    const stockInput = document.getElementById(mode === 'edit' ? 'editProdStock' : 'prodStock');
    [priceInput, buyingInput, stockInput].forEach(el => setMatrixDerivedFieldLock(el, false));
}

function cartesianCombinations(attributeTypes) {
    const cleaned = (attributeTypes || [])
        .map(t => ({
            name: String(t.name || '').trim(),
            values: [...new Set((t.values || []).map(v => String(v).trim()).filter(Boolean))]
        }))
        .filter(t => t.name && t.values.length > 0);

    if (cleaned.length === 0) return [];

    return cleaned.reduce((acc, type) => {
        if (acc.length === 0) {
            return type.values.map(value => ({ [type.name]: value }));
        }
        const next = [];
        acc.forEach(combo => {
            type.values.forEach(value => next.push({ ...combo, [type.name]: value }));
        });
        return next;
    }, []);
}

function combinationKey(attributes) {
    return Object.entries(attributes || {})
        .map(([k, v]) => `${String(k).trim().toLowerCase()}=${String(v).trim().toLowerCase()}`)
        .sort()
        .join('|');
}

/** Normalize a string segment for SKU codes (uppercase, alphanumeric + hyphens). */
function normalizeSkuToken(raw, maxLen = 16) {
    const token = String(raw || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (!token) return '';
    return token.length > maxLen ? token.slice(0, maxLen) : token;
}

/** Derive initials from product name — e.g. "Premium T-Shirt" → "PTS". */
function getProductNameInitials(name) {
    return String(name || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(word => word.replace(/[^a-zA-Z0-9]/g, '').charAt(0))
        .join('')
        .toUpperCase();
}

/** Product-level SKU prefix from Product ID field, falling back to name initials. */
function getProductSkuPrefix(mode) {
    const idEl = document.getElementById(mode === 'edit' ? 'editProdId' : 'prodId');
    const nameEl = document.getElementById(mode === 'edit' ? 'editProdName' : 'prodName');
    const productId = (idEl?.value || '').trim();
    if (productId) return normalizeSkuToken(productId, 16);
    const initials = getProductNameInitials(nameEl?.value || '');
    return initials || 'PRD';
}

function getVariantAttributeSortOrder(attrName) {
    const key = String(attrName || '').trim().toLowerCase();
    if (key === 'color' || key === 'colour') return 0;
    if (key === 'size') return 1;
    return 10;
}

/** Map attribute value to a compact SKU segment (Color before Size in final SKU). */
function attributeValueToSkuCode(attrName, value) {
    const key = String(attrName || '').trim().toLowerCase();
    const normalized = normalizeSkuToken(value, key === 'size' ? 8 : 12);
    if (!normalized) return 'VAR';

    if (key === 'color' || key === 'colour') {
        const compact = normalized.replace(/-/g, '');
        if (compact.length > 8) return compact.slice(0, 3);
    }
    return normalized;
}

/**
 * Build variant SKU: [Product ID or Initials]-[Color]-[Size]-[other attrs…]
 * Example: PTS-PINK-M or PROD55-PNK-L
 */
function generateVariantSku(mode, attributes) {
    const prefix = getProductSkuPrefix(mode);
    const segments = Object.entries(attributes || {})
        .filter(([k, v]) => String(k).trim() && String(v).trim())
        .sort(([a], [b]) => {
            const orderDiff = getVariantAttributeSortOrder(a) - getVariantAttributeSortOrder(b);
            return orderDiff !== 0 ? orderDiff : String(a).localeCompare(String(b));
        })
        .map(([k, v]) => attributeValueToSkuCode(k, v));

    return [prefix, ...segments].filter(Boolean).join('-');
}

function resolveProductImagePath(img) {
    const src = String(img || '').trim();
    if (!src) return '';
    if (src.startsWith('http') || src.startsWith('data:') || src.startsWith('/')) return src;
    return `/products/${src}`;
}

/** Primary product image from preview box or saved product record (edit mode). */
function getPrimaryProductImageUrl(mode) {
    const previewBox = document.getElementById(mode === 'edit' ? 'editImgPreviewBox' : 'imgPreviewBox');
    const previewImg = previewBox?.querySelector('img');
    if (previewImg?.src) return previewImg.src.trim();

    if (mode === 'edit') {
        const mongoId = document.getElementById('editProdMongoId')?.value;
        const product = (globalProducts || []).find(p => String(p._id) === String(mongoId));
        if (product) {
            if (Array.isArray(product.images) && product.images.length) {
                return resolveProductImagePath(product.images[0]);
            }
            if (product.image) return resolveProductImagePath(product.image);
            if (product.imageUrl) return resolveProductImagePath(product.imageUrl);
        }
    }
    return '';
}

/** Strip transient data-URL previews before persisting variant rows. */
function sanitizeVariantImageForSave(image) {
    const src = String(image || '').trim();
    if (!src || src.startsWith('data:')) return '';
    return src;
}

function formatCombinationLabel(attributes) {
    const entries = Object.entries(attributes || {})
        .map(([k, v]) => [String(k || '').trim(), String(v || '').trim()])
        .filter(([k, v]) => k && v);
    if (!entries.length) return '';
    return entries.map(([k, v]) => `${k}: ${v}`).join(' | ');
}

function resolveCombinationLabel(row) {
    const explicit = String(row?.name || row?.title || '').trim();
    if (explicit) return explicit;
    const fromAttrs = formatCombinationLabel(row?.attributes || {});
    if (fromAttrs) return fromAttrs;
    const sku = String(row?.sku || '').trim();
    return sku ? `SKU: ${sku}` : '';
}

function parseLabelToAttributes(label) {
    const out = {};
    String(label || '')
        .split('|')
        .map(s => s.trim())
        .filter(Boolean)
        .forEach(part => {
            const idx = part.indexOf(':');
            if (idx === -1) return;
            const k = part.slice(0, idx).trim();
            const v = part.slice(idx + 1).trim();
            if (k && v) out[k] = v;
        });
    return out;
}

function getVariantAttributesFromDoc(v) {
    if (window.VariantUtils && typeof window.VariantUtils.getVariantAttributes === 'function') {
        const attrs = window.VariantUtils.getVariantAttributes(v);
        if (Object.keys(attrs).length) return attrs;
    }
    if (!v || typeof v !== 'object') return {};
    if (v.attributes instanceof Map) {
        const out = {};
        v.attributes.forEach((val, key) => {
            const k = String(key || '').trim();
            const value = String(val || '').trim();
            if (k && value) out[k] = value;
        });
        if (Object.keys(out).length) return out;
    }
    if (v.attributes && typeof v.attributes === 'object') {
        const out = {};
        Object.entries(v.attributes).forEach(([k, val]) => {
            const key = String(k || '').trim();
            const value = String(val || '').trim();
            if (key && value) out[key] = value;
        });
        if (Object.keys(out).length) return out;
    }
    const attribute = String(v.attribute || '').trim();
    const value = String(v.value || '').trim();
    if (attribute && value) return { [attribute]: value };
    return parseLabelToAttributes(v.name || v.title || '');
}

function productUsesVariantMatrix(product) {
    if (!product || !Array.isArray(product.variants) || product.variants.length === 0) return false;
    if (product.hasVariants === true) return true;
    return product.variants.some(v => {
        const attrs = getVariantAttributesFromDoc(v);
        return Object.keys(attrs).length > 0 || String(v.sku || '').trim();
    });
}

function variantsToMatrixState(variants) {
    const attrMap = {};
    const combinations = [];

    (variants || []).forEach(v => {
        const attributes = getVariantAttributesFromDoc(v);
        Object.entries(attributes).forEach(([name, value]) => {
            if (!attrMap[name]) attrMap[name] = new Set();
            attrMap[name].add(value);
        });
        combinations.push({
            name: resolveCombinationLabel({ name: v.name, attributes, sku: v.sku }),
            attributes,
            sku: v.sku || '',
            price: v.price ?? '',
            buyingPrice: v.buyingPrice ?? '',
            stock: v.stock ?? '',
            image: v.image || ''
        });
    });

    const attributeTypes = Object.entries(attrMap).map(([name, set]) => ({
        name,
        values: [...set]
    }));

    return { attributeTypes, combinations };
}

function attributeTypeRowHtml(mode, data) {
    const d = data || {};
    const valuesStr = Array.isArray(d.values) ? d.values.join(', ') : (d.valuesStr || '');
    return `<div class="attribute-type-row" data-attr-type-row>
        <input list="attrNameList" class="v-input attr-type-name" placeholder="Size" value="${escHtml(d.name || '')}">
        <input class="v-input attr-type-values" placeholder="S, M, L" value="${escHtml(valuesStr)}">
        <button type="button" class="v-remove" title="Remove attribute" onclick="removeAttributeTypeRow(this, '${mode}')">
            <i class="fa-solid fa-xmark"></i>
        </button>
    </div>`;
}

function matrixRowHtml(mode, row, index) {
    const attrs = row.attributes || {};
    const label = resolveCombinationLabel(row);
    const key = combinationKey(attrs) || String(row.sku || '').trim().toLowerCase() || `idx-${index}`;
    const attrsJson = escHtml(JSON.stringify(attrs));
    const priceVal = row.price === '' || row.price === undefined || row.price === null ? '' : row.price;
    const buyVal = row.buyingPrice === '' || row.buyingPrice === undefined || row.buyingPrice === null ? '' : row.buyingPrice;
    const stockVal = row.stock === '' || row.stock === undefined || row.stock === null ? '' : row.stock;
    return `<tr data-matrix-row data-combo-key="${escHtml(key)}" data-combo-attrs="${attrsJson}" data-combo-name="${escHtml(label)}">
        <td class="matrix-combo-cell"><span class="matrix-combo-label" title="${escHtml(label)}">${escHtml(label)}</span></td>
        <td class="matrix-input-cell"><input class="v-input matrix-sku" placeholder="Auto-generated SKU" value="${escHtml(row.sku || '')}" title="Auto-filled on regenerate — editable"></td>
        <td class="matrix-input-cell"><input type="number" min="0" step="any" class="v-input matrix-price" placeholder="0" value="${priceVal}" oninput="syncMatrixTotalStock('${mode}')"></td>
        <td class="matrix-input-cell"><input type="number" min="0" step="any" class="v-input matrix-buying-price" placeholder="0" value="${buyVal}" oninput="syncMatrixTotalStock('${mode}')"></td>
        <td class="matrix-input-cell"><input type="number" min="0" class="v-input matrix-stock" placeholder="0" value="${stockVal}" oninput="syncMatrixTotalStock('${mode}')"></td>
        <td class="matrix-input-cell matrix-image-cell"><input class="v-input matrix-image" placeholder="Defaults to main product image" value="${escHtml(row.image || '')}" title="Auto-filled from main product image on regenerate — editable per variant"></td>
    </tr>`;
}

window.setProductVariantMode = function(mode, productType, options) {
    const opts = options || {};
    const prefix = getVariantModePrefix(mode);
    const isVariant = productType === 'variant';
    variantMatrixState[mode].mode = isVariant ? 'variant' : 'simple';

    const panel = document.getElementById(`${prefix}VariantMatrixPanel`);
    const hint = document.getElementById(`${prefix}SimpleStockHint`);

    if (panel) panel.style.display = isVariant ? 'block' : 'none';
    if (hint) hint.style.display = isVariant ? 'none' : 'block';

    if (isVariant) {
        syncMatrixTotalStock(mode);
    } else {
        unlockSimpleProductDerivedFields(mode);
    }

    if (isVariant && !opts.skipMatrixRegenerate && variantMatrixState[mode].combinations.length === 0) {
        generateVariantMatrix(mode);
    }
};

window.addAttributeTypeRow = function(mode, data) {
    ensureVariationDatalists();
    const list = document.getElementById(`${getVariantModePrefix(mode)}AttributeTypesList`);
    if (!list) return;
    list.insertAdjacentHTML('beforeend', attributeTypeRowHtml(mode, data));
    const row = list.lastElementChild;
    const nameInput = row?.querySelector('.attr-type-name');
    if (nameInput && data?.name) {
        autoFillAttributeValuesFromGlobal(nameInput);
    }
};

window.removeAttributeTypeRow = function(btn, mode) {
    const row = btn.closest('[data-attr-type-row]');
    if (row) row.remove();
};

function collectAttributeTypes(mode) {
    const list = document.getElementById(`${getVariantModePrefix(mode)}AttributeTypesList`);
    if (!list) return [];
    const out = [];
    list.querySelectorAll('[data-attr-type-row]').forEach(row => {
        const name = (row.querySelector('.attr-type-name')?.value || '').trim();
        const values = parseCommaValues(row.querySelector('.attr-type-values')?.value || '');
        if (name && values.length) out.push({ name, values });
    });
    return out;
}

window.generateVariantMatrix = function(mode) {
    const attributeTypes = collectAttributeTypes(mode);
    variantMatrixState[mode].attributeTypes = attributeTypes;

    const existing = {};
    (variantMatrixState[mode].combinations || []).forEach(row => {
        existing[combinationKey(row.attributes)] = row;
    });

    const combos = cartesianCombinations(attributeTypes);
    const basePrice = document.getElementById(mode === 'edit' ? 'editProdPrice' : 'prodPrice')?.value || '';
    const baseBuyingPrice = document.getElementById(mode === 'edit' ? 'editProdBuyingPrice' : 'prodBuyingPrice')?.value || '';
    const defaultImage = getPrimaryProductImageUrl(mode);

    variantMatrixState[mode].combinations = combos.map(attributes => {
        const key = combinationKey(attributes);
        const prev = existing[key] || {};
        const comboRow = {
            attributes,
            sku: prev.sku || generateVariantSku(mode, attributes),
            price: prev.price !== undefined && prev.price !== '' ? prev.price : basePrice,
            buyingPrice: prev.buyingPrice !== undefined && prev.buyingPrice !== '' ? prev.buyingPrice : baseBuyingPrice,
            stock: prev.stock ?? '',
            image: prev.image || defaultImage || ''
        };
        comboRow.name = resolveCombinationLabel(comboRow);
        return comboRow;
    });

    renderVariantMatrix(mode);
};

function renderVariantMatrix(mode) {
    const prefix = getVariantModePrefix(mode);
    const body = document.getElementById(`${prefix}VariantMatrixBody`);
    const wrap = document.getElementById(`${prefix}VariantMatrixWrap`);
    const empty = document.getElementById(`${prefix}VariantMatrixEmpty`);
    const rows = variantMatrixState[mode].combinations || [];

    if (body) body.innerHTML = rows.map((r, i) => matrixRowHtml(mode, r, i)).join('');
    if (wrap) wrap.style.display = rows.length ? 'block' : 'none';
    if (empty) empty.style.display = rows.length ? 'none' : 'block';
    syncMatrixTotalStock(mode);
}

function parseMatrixRowAttributes(rowEl, fallbackAttributes) {
    const raw = rowEl.getAttribute('data-combo-attrs');
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && Object.keys(parsed).length) return parsed;
        } catch (e) { /* use fallback */ }
    }
    return fallbackAttributes || {};
}

function collectMatrixCombinations(mode) {
    const prefix = getVariantModePrefix(mode);
    const body = document.getElementById(`${prefix}VariantMatrixBody`);
    if (!body) return variantMatrixState[mode].combinations || [];

    const out = [];
    body.querySelectorAll('[data-matrix-row]').forEach(row => {
        const key = row.getAttribute('data-combo-key') || '';
        const base = (variantMatrixState[mode].combinations || []).find((r, i) => {
            const rowKey = combinationKey(r.attributes) || String(r.sku || '').trim().toLowerCase() || `idx-${i}`;
            return rowKey === key;
        });
        const attributes = parseMatrixRowAttributes(row, base?.attributes);
        const sku = (row.querySelector('.matrix-sku')?.value || '').trim();
        const price = Number(row.querySelector('.matrix-price')?.value) || 0;
        const buyingPrice = Number(row.querySelector('.matrix-buying-price')?.value) || 0;
        const stock = Number(row.querySelector('.matrix-stock')?.value) || 0;
        const image = sanitizeVariantImageForSave(row.querySelector('.matrix-image')?.value || '');
        const comboRow = { attributes, sku, price, buyingPrice, stock, image };
        comboRow.name = resolveCombinationLabel(comboRow);
        if (Object.keys(attributes).length || sku) {
            out.push(comboRow);
        }
    });
    return out;
}

function sumMatrixStockFromDom(mode) {
    const prefix = getVariantModePrefix(mode);
    const body = document.getElementById(`${prefix}VariantMatrixBody`);
    if (!body) return 0;
    return [...body.querySelectorAll('.matrix-stock')].reduce(
        (sum, el) => sum + (Number(el.value) || 0),
        0
    );
}

function computeMatrixMinSellPrice(combinations) {
    if (!Array.isArray(combinations) || combinations.length === 0) return 0;
    const prices = combinations
        .map(r => Number(r.price))
        .filter(p => Number.isFinite(p) && p > 0);
    return prices.length ? Math.min(...prices) : 0;
}

function computeMatrixMinBuyingPrice(combinations) {
    if (!Array.isArray(combinations) || combinations.length === 0) return 0;
    const prices = combinations
        .map(r => Number(r.buyingPrice))
        .filter(p => Number.isFinite(p) && p > 0);
    return prices.length ? Math.min(...prices) : 0;
}

window.syncMatrixTotalStock = function(mode) {
    const priceInput = document.getElementById(mode === 'edit' ? 'editProdPrice' : 'prodPrice');
    const buyingInput = document.getElementById(mode === 'edit' ? 'editProdBuyingPrice' : 'prodBuyingPrice');
    const stockInput = document.getElementById(mode === 'edit' ? 'editProdStock' : 'prodStock');
    const totalEl = document.getElementById(`${getVariantModePrefix(mode)}MatrixTotalStock`);
    if (variantMatrixState[mode].mode !== 'variant') return;

    const combinations = collectMatrixCombinations(mode);
    variantMatrixState[mode].combinations = combinations;

    const total = sumMatrixStockFromDom(mode);
    if (totalEl) totalEl.textContent = String(total);

    if (stockInput) {
        stockInput.value = String(total);
        setMatrixDerivedFieldLock(
            stockInput,
            true,
            'Auto-calculated from variant matrix (sum of combination stock)'
        );
    }

    const minSell = computeMatrixMinSellPrice(combinations);
    if (priceInput) {
        priceInput.value = minSell > 0 ? String(minSell) : '';
        setMatrixDerivedFieldLock(
            priceInput,
            true,
            'Auto-calculated minimum sell price across variant rows'
        );
    }

    const minBuy = computeMatrixMinBuyingPrice(combinations);
    if (buyingInput) {
        buyingInput.value = minBuy > 0 ? String(minBuy) : '';
        setMatrixDerivedFieldLock(
            buyingInput,
            true,
            'Auto-calculated minimum buy price across variant rows'
        );
    }

    if (typeof updateEditProfitPreview === 'function' && mode === 'edit') {
        updateEditProfitPreview();
    }
};

function collectProductVariantPayload(mode) {
    const isVariant = variantMatrixState[mode].mode === 'variant';
    if (!isVariant) {
        const stockInput = document.getElementById(mode === 'edit' ? 'editProdStock' : 'prodStock');
        const stockQuantity = Number(stockInput?.value) || 0;
        return { hasVariants: false, variants: [], stockQuantity, stock: stockQuantity };
    }

    const variants = collectMatrixCombinations(mode);
    const total = variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
    return { hasVariants: variants.length > 0, variants, stockQuantity: total, stock: total };
}

function loadProductVariantUI(mode, product) {
    ensureVariationDatalists();
    const prefix = getVariantModePrefix(mode);
    const hasVariants = productUsesVariantMatrix(product);
    const productType = hasVariants ? 'variant' : 'simple';

    const radio = document.querySelector(`input[name="${prefix}ProductType"][value="${productType}"]`);
    if (radio) radio.checked = true;

    if (hasVariants) {
        const { attributeTypes, combinations } = variantsToMatrixState(product.variants);
        variantMatrixState[mode] = { mode: 'variant', attributeTypes, combinations };

        const list = document.getElementById(`${prefix}AttributeTypesList`);
        if (list) {
            if (attributeTypes.length) {
                list.innerHTML = attributeTypes.map(t => attributeTypeRowHtml(mode, {
                    name: t.name,
                    values: t.values
                })).join('');
            } else {
                list.innerHTML = attributeTypeRowHtml(mode, { name: '', values: [] });
            }
        }
        renderVariantMatrix(mode);
    } else {
        variantMatrixState[mode] = { mode: 'simple', attributeTypes: [], combinations: [] };
        const list = document.getElementById(`${prefix}AttributeTypesList`);
        if (list) list.innerHTML = '';
        renderVariantMatrix(mode);
    }

    setProductVariantMode(mode, productType, { skipMatrixRegenerate: hasVariants });

    if (!hasVariants) {
        const stockInput = document.getElementById(mode === 'edit' ? 'editProdStock' : 'prodStock');
        const qty = product?.stockQuantity ?? product?.stock ?? '';
        if (stockInput && qty !== '') stockInput.value = qty;
    } else {
        syncMatrixTotalStock(mode);
    }
}

function resetProductVariantUI(mode) {
    const prefix = getVariantModePrefix(mode);
    variantMatrixState[mode] = { mode: 'simple', attributeTypes: [], combinations: [] };
    const list = document.getElementById(`${prefix}AttributeTypesList`);
    if (list) list.innerHTML = '';
    const radio = document.querySelector(`input[name="${prefix}ProductType"][value="simple"]`);
    if (radio) radio.checked = true;
    setProductVariantMode(mode, 'simple');
    renderVariantMatrix(mode);
}

/** Legacy alias used after form reset */
function renderVariations(mode, list) {
    if (list && list.length) {
        loadProductVariantUI(mode, { hasVariants: true, variants: list });
    } else {
        resetProductVariantUI(mode);
    }
}

/** Shared datalists for attribute names (Manage Attributes integration) */
function ensureVariationDatalists() {
    let nameList = document.getElementById('attrNameList');
    if (!nameList) {
        nameList = document.createElement('datalist');
        nameList.id = 'attrNameList';
        document.body.appendChild(nameList);
    }
    nameList.innerHTML = (globalAttributes || [])
        .map(a => `<option value="${escHtml(a.name)}"></option>`).join('');
}

window.collectVariations = function(mode) {
    return collectProductVariantPayload(mode).variants;
};

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('addProductForm')) resetProductVariantUI('add');
});

document.addEventListener('change', (e) => {
    if (e.target?.classList?.contains('attr-type-name')) {
        autoFillAttributeValuesFromGlobal(e.target);
    }
});

document.addEventListener('input', (e) => {
    if (!e.target?.classList?.contains('attr-type-name')) return;
    const attr = findGlobalAttributeByName(e.target.value);
    if (attr) autoFillAttributeValuesFromGlobal(e.target);
});

function formatCategoryCashbackDisplay(cat) {
    const val = cat?.customCashbackPercentage;
    if (val === null || val === undefined || val === '') {
        return '<span class="catalog-meta-muted">Global default</span>';
    }
    return `<span class="status-badge status-verified">${Number(val)}%</span>`;
}

let _categoryEditId = null;

window.openCategoryEditModal = function(cat) {
    const modal = document.getElementById('categoryEditModal');
    const nameInput = document.getElementById('editCategoryNameInput');
    const cashbackInput = document.getElementById('editCategoryCashbackInput');
    if (!modal || !nameInput || !cashbackInput || !cat) return;

    _categoryEditId = cat._id;
    nameInput.value = cat.name || '';
    const cashbackVal = cat.customCashbackPercentage;
    cashbackInput.value = (cashbackVal === null || cashbackVal === undefined || cashbackVal === '')
        ? ''
        : String(cashbackVal);

    const saveBtn = document.getElementById('editCategorySaveBtn');
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    newSaveBtn.addEventListener('click', saveCategoryEdit);

    modal.style.display = 'flex';
    nameInput.focus();
    nameInput.select();
};

window.closeCategoryEditModal = function() {
    const modal = document.getElementById('categoryEditModal');
    if (modal) modal.style.display = 'none';
    _categoryEditId = null;
};

async function saveCategoryEdit() {
    if (!_categoryEditId) return;

    const nameInput = document.getElementById('editCategoryNameInput');
    const cashbackInput = document.getElementById('editCategoryCashbackInput');
    const newName = nameInput?.value.trim();
    const cashbackRaw = cashbackInput?.value.trim();

    if (!newName) return showToast('Please enter a category name.', 'warning');

    if (cashbackRaw !== '') {
        const parsed = Number(cashbackRaw);
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
            return showToast('Custom cashback must be between 0 and 100, or left blank.', 'warning');
        }
    }

    try {
        const res = await fetch(`/api/categories/${_categoryEditId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                name: newName,
                customCashbackPercentage: cashbackRaw === '' ? null : Number(cashbackRaw)
            })
        });
        const result = await res.json();
        if (result.success) {
            showAdminSuccess('Category Updated', result.message || 'Category updated successfully.');
            closeCategoryEditModal();
            await fetchCategories();
        } else {
            showToast(result.message || 'Failed to update category', 'error');
        }
    } catch (error) {
        showToast('Server error while updating category!', 'error');
    }
}

/**
 * ৯.৪: অ্যাডমিন প্যানেলের ম্যানেজমেন্ট টেবিলে ক্যাটাগরির লিস্ট রেন্ডার করা (এডিট বাটন সহ)
 */
function renderCategoryTable() {
    const tbody = document.getElementById('categoryTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (globalCategories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="cell-empty">No categories yet. Add one using the form above.</td></tr>';
        return;
    }

    tbody.innerHTML = globalCategories.map(cat => {
        const safeName = escHtml(cat.name);
        return `<tr>
            <td class="cell-name">${safeName}</td>
            <td class="cell-cashback">${formatCategoryCashbackDisplay(cat)}</td>
            <td class="cell-date">${formatCatalogDate(cat.createdAt)}</td>
            <td>${catalogActionsHtml(
                `openCategoryEditById('${cat._id}')`,
                `deleteCategory('${cat._id}')`
            )}</td>
        </tr>`;
    }).join('');
}

window.openCategoryEditById = function(id) {
    const cat = globalCategories.find(c => String(c._id) === String(id));
    if (!cat) return showToast('Category not found.', 'warning');
    openCategoryEditModal(cat);
};

/**
 * ৯.৫: নতুন ক্যাটাগরি তৈরি করে ডাটাবেজে সেভ করা
 */
window.addCategory = async function() {
    const nameInput = document.getElementById('newCategoryName');
    const cashbackInput = document.getElementById('newCategoryCashback');
    const name = nameInput.value.trim();
    const cashbackRaw = cashbackInput?.value.trim() || '';
    
    if (!name) return showToast("Please enter a category name!", "warning");

    if (cashbackRaw !== '') {
        const parsed = Number(cashbackRaw);
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
            return showToast('Custom cashback must be between 0 and 100, or left blank.', 'warning');
        }
    }

    try {
        const res = await fetch('/api/categories', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({
                name,
                customCashbackPercentage: cashbackRaw === '' ? null : Number(cashbackRaw)
            })
        });
        const result = await res.json();
        
        if (result.success) {
            showAdminSuccess('Category Added', result.message || 'Category added successfully!');
            nameInput.value = '';
            if (cashbackInput) cashbackInput.value = '';
            await fetchCategories();
        } else {
            showToast(result.message, "error");
        }
    } catch (error) {
        showToast("Server error while adding category!", "error");
    }
};

/**
 * @deprecated Use openCategoryEditById — kept for backward compatibility if referenced elsewhere.
 */
window.editCategory = function(id) {
    openCategoryEditById(id);
};

/**
 * ৯.৭: নির্দিষ্ট একটি ক্যাটাগরি ডাটাবেজ থেকে ডিলিট করা
 */
window.deleteCategory = function(id) {
    showCustomConfirm('Delete Category', 'Are you sure you want to delete this category? Products linked to it will keep their current label.', async () => {
        try {
            const res = await fetch(`/api/categories/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await res.json();
            if (result.success) {
                globalCategories = globalCategories.filter(c => String(c._id) !== String(id));
                renderCategoryTable();
                renderCategoryDropdown();
                showAdminSuccess('Category Deleted', result.message || 'Category removed.');
            } else {
                showToast(result.message, 'error');
            }
        } catch (error) {
            showToast('Failed to delete category', 'error');
        }
    }, 'danger');
};

/* ==========================================================================
   SECTION 9B: BRAND MANAGEMENT ENGINE (ব্র্যান্ড ম্যানেজমেন্ট মডিউল)
   ========================================================================== */

let globalBrands = [];

async function fetchBrands() {
    try {
        const response = await fetch('/api/brands');
        const data = await response.json();
        if (data.success) {
            globalBrands = data.data || [];
            renderBrandTable();
            renderBrandDropdown();
        }
    } catch (error) {
        console.error("🔴 Brand load error:", error);
    }
}

function renderBrandTable() {
    const tbody = document.getElementById('brandTableBody');
    if (!tbody) return;

    if (globalBrands.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="cell-empty">No brands yet. Add one using the form above.</td></tr>';
        return;
    }

    tbody.innerHTML = globalBrands.map(brand => {
        const safeName = escHtml(brand.name);
        return `<tr>
            <td class="cell-name">${safeName}</td>
            <td class="cell-date">${formatCatalogDate(brand.createdAt)}</td>
            <td>${catalogActionsHtml(
                `editBrand('${brand._id}', ${JSON.stringify(brand.name)})`,
                `deleteBrand('${brand._id}')`
            )}</td>
        </tr>`;
    }).join('');
}

window.addBrand = async function() {
    const input = document.getElementById('newBrandName');
    const name = input.value.trim();
    if (!name) return showToast("Please enter a brand name!", "warning");

    try {
        const res = await fetch('/api/brands', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ name })
        });
        const result = await res.json();
        if (result.success) {
            showAdminSuccess('Brand Added', result.message || 'Brand added successfully!');
            input.value = '';
            await fetchBrands();
        } else {
            showToast(result.message, "error");
        }
    } catch (error) {
        showToast("Server error while adding brand!", "error");
    }
};

window.editBrand = function(id, currentName) {
    openCatalogQuickEdit({
        title: 'Edit Brand',
        label: 'Brand Name',
        value: currentName,
        placeholder: 'e.g., Samsung',
        onSave: async (newName) => {
            if (newName === currentName) {
                closeCatalogQuickEdit();
                return;
            }
            try {
                const res = await fetch(`/api/brands/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ name: newName })
                });
                const result = await res.json();
                if (result.success) {
                    showAdminSuccess('Brand Updated', 'Brand renamed successfully.');
                    closeCatalogQuickEdit();
                    await fetchBrands();
                } else {
                    showToast(result.message || 'Failed to update brand', 'error');
                }
            } catch (error) {
                showToast('Server error while updating brand!', 'error');
            }
        }
    });
};

window.deleteBrand = function(id) {
    showCustomConfirm('Delete Brand', 'Are you sure you want to delete this brand?', async () => {
        try {
            const res = await fetch(`/api/brands/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await res.json();
            if (result.success) {
                globalBrands = globalBrands.filter(b => String(b._id) !== String(id));
                renderBrandTable();
                showAdminSuccess('Brand Deleted', result.message || 'Brand removed.');
            } else {
                showToast(result.message, 'error');
            }
        } catch (error) {
            showToast('Failed to delete brand', 'error');
        }
    }, 'danger');
};


/* ==========================================================================
   SECTION 9B2: COUPON & DISCOUNT MANAGEMENT ENGINE
   ========================================================================== */

let globalCoupons = [];

/** Fresh admin token + JSON headers for coupon API calls */
function getCouponAuthHeaders() {
    const adminToken = localStorage.getItem('adminToken');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken || ''}`
    };
}

function setupCouponForm() {
    const form = document.getElementById('couponForm');
    if (!form || form.dataset.bound === '1') return;
    form.dataset.bound = '1';
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        saveCoupon();
    });
    setupCouponTimeValidation();
}

const COUPON_TIME_DEFAULT = '11:59';
const COUPON_AMPM_DEFAULT = 'PM';

function getCouponAmPmValue() {
    const select = document.getElementById('couponExpiryAmPm');
    const value = (select?.value || COUPON_AMPM_DEFAULT).toUpperCase();
    return value === 'AM' ? 'AM' : 'PM';
}

/** Convert 12-hour hh:mm + AM/PM to 24-hour HH:MM for server timestamp building. */
function convert12hTimeTo24h(time12, ampm) {
    const cleaned = normalizeCouponTimeDigits(time12).trim();
    const match = cleaned.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;

    let hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);
    const period = String(ampm || COUPON_AMPM_DEFAULT).toUpperCase();

    if (!Number.isFinite(hour) || hour < 1 || hour > 12) return null;
    if (!Number.isFinite(minute) || minute > 59) return null;

    if (period === 'AM') {
        if (hour === 12) hour = 0;
    } else if (hour !== 12) {
        hour += 12;
    }

    return formatCouponTimeParts(hour, minute);
}

function setCouponTimeHint(message, { valid = false } = {}) {
    const hint = document.getElementById('couponExpiryTimeHint');
    const input = document.getElementById('couponExpiryTime');
    if (!hint) return;
    hint.textContent = message || '';
    hint.classList.toggle('is-valid', Boolean(valid && message));
    if (input) {
        input.classList.toggle('is-invalid', Boolean(message && !valid));
    }
}

function normalizeCouponTimeDigits(raw) {
    return String(raw || '').replace(/[^\d:]/g, '');
}

function formatCouponTimeParts(hour, minute) {
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function validateCouponExpiryTime(raw, { showErrors = true, inlineOnly = false } = {}) {
    const cleaned = normalizeCouponTimeDigits(raw).trim();
    const match = cleaned.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) {
        const msg = 'Use 12-hour format hh:mm with AM/PM (minutes 00–59).';
        if (showErrors && !inlineOnly) showToast(msg, 'warning');
        if (showErrors) setCouponTimeHint(msg);
        return { ok: false, value: null };
    }

    const hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);

    if (!Number.isFinite(hour) || hour < 1 || hour > 12) {
        const msg = 'Hour must be between 01 and 12.';
        if (showErrors && !inlineOnly) showToast(msg, 'warning');
        if (showErrors) setCouponTimeHint(msg);
        return { ok: false, value: null };
    }
    if (!Number.isFinite(minute) || minute > 59) {
        const msg = 'Minutes cannot exceed 59.';
        if (showErrors && !inlineOnly) showToast(msg, 'warning');
        if (showErrors) setCouponTimeHint(msg);
        return { ok: false, value: null };
    }

    if (showErrors) setCouponTimeHint('');
    return { ok: true, value: formatCouponTimeParts(hour, minute) };
}

function handleCouponExpiryTimeInput(event) {
    const input = event.target;
    let val = normalizeCouponTimeDigits(input.value);
    let blockedMessage = '';

    const digitsOnly = val.replace(':', '');
    if (!val.includes(':') && digitsOnly.length >= 3) {
        val = `${digitsOnly.slice(0, 2)}:${digitsOnly.slice(2)}`;
    }

    const colonIdx = val.indexOf(':');
    if (colonIdx !== -1) {
        let hourPart = val.slice(0, colonIdx);
        let minutePart = val.slice(colonIdx + 1);

        if (hourPart.length > 2) hourPart = hourPart.slice(0, 2);
        if (minutePart.length > 2) minutePart = minutePart.slice(0, 2);

        if (hourPart.length === 2) {
            const hourNum = parseInt(hourPart, 10);
            if (Number.isFinite(hourNum) && (hourNum < 1 || hourNum > 12)) {
                blockedMessage = 'Hour must be between 01 and 12.';
                hourPart = hourNum > 12 ? '12' : '01';
            }
        }

        if (minutePart.length >= 2) {
            const minuteNum = parseInt(minutePart.slice(0, 2), 10);
            if (Number.isFinite(minuteNum) && minuteNum > 59) {
                blockedMessage = 'Minutes cannot exceed 59.';
                minutePart = '59';
            }
        }

        val = minutePart.length ? `${hourPart}:${minutePart}` : `${hourPart}:`;
    } else if (val.length >= 2) {
        const hourNum = parseInt(val.slice(0, 2), 10);
        if (Number.isFinite(hourNum) && (hourNum < 1 || hourNum > 12)) {
            blockedMessage = 'Hour must be between 01 and 12.';
            val = hourNum > 12 ? '12' : '01';
        }
    }

    input.value = val;

    if (blockedMessage) {
        setCouponTimeHint(blockedMessage);
        input.classList.add('is-invalid');
        return;
    }

    if (/^\d{2}:\d{2}$/.test(val)) {
        validateCouponExpiryTime(val, { showErrors: true, inlineOnly: true });
    } else {
        setCouponTimeHint('');
        input.classList.remove('is-invalid');
    }
}

function finalizeCouponExpiryTimeInput(input) {
    if (!input) return COUPON_TIME_DEFAULT;
    const result = validateCouponExpiryTime(input.value, { showErrors: true, inlineOnly: true });
    if (result.ok) {
        input.value = result.value;
        input.dataset.lastValid = result.value;
        input.classList.remove('is-invalid');
        setCouponTimeHint('');
        return result.value;
    }
    const fallback = input.dataset.lastValid || COUPON_TIME_DEFAULT;
    input.value = fallback;
    input.classList.remove('is-invalid');
    setCouponTimeHint('');
    return fallback;
}

function setupCouponTimeValidation() {
    const input = document.getElementById('couponExpiryTime');
    if (!input || input.dataset.timeBound === '1') return;
    input.dataset.timeBound = '1';
    input.dataset.lastValid = input.value || COUPON_TIME_DEFAULT;

    input.addEventListener('input', handleCouponExpiryTimeInput);
    input.addEventListener('change', () => finalizeCouponExpiryTimeInput(input));
    input.addEventListener('blur', () => finalizeCouponExpiryTimeInput(input));
}

async function runAdminDataSync() {
    const response = await fetch('/api/admin/sync-data', {
        method: 'POST',
        headers: getCouponAuthHeaders()
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to synchronize coupon data.');
    }
    if (Array.isArray(data.data?.coupons)) {
        globalCoupons = data.data.coupons;
        renderCouponTable();
    }
    return data;
}

async function fetchCoupons() {
    try {
        const response = await fetch('/api/coupons', {
            headers: getCouponAuthHeaders()
        });
        const data = await response.json();
        if (data.success) {
            globalCoupons = data.data || [];
            renderCouponTable();
        } else {
            showToast(data.message || 'Failed to load coupons', 'error');
        }
    } catch (error) {
        console.error('Coupon load error:', error);
        showToast('Failed to load coupons', 'error');
    }
}

function formatCouponExpiry(dateVal) {
    if (!dateVal) return '—';
    const d = new Date(dateVal);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: adminPlatformTimezone || 'Asia/Dhaka'
    });
}

function resolveCouponStatus(coupon) {
    if (coupon.status === 'ACTIVE' || coupon.status === 'EXPIRED') {
        return coupon.status;
    }
    return isCouponExpired(coupon.expiryDate) ? 'EXPIRED' : 'ACTIVE';
}

function isCouponExpired(dateVal) {
    if (!dateVal) return false;
    return Date.now() > new Date(dateVal).getTime();
}

function getPlatformTimeZoneOffsetMs(timeZone, date) {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    const parts = dtf.formatToParts(date);
    const map = {};
    for (const part of parts) {
        if (part.type !== 'literal') map[part.type] = part.value;
    }
    const asUtc = Date.UTC(
        Number(map.year),
        Number(map.month) - 1,
        Number(map.day),
        Number(map.hour),
        Number(map.minute),
        Number(map.second)
    );
    return asUtc - date.getTime();
}

/** Interpret date/time inputs in the admin platform timezone (same zone as the header clock). */
function platformLocalToUtc(dateStr, timeStr, timeZone) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const timeParts = String(timeStr || '00:00').split(':').map(Number);
    const hour = timeParts[0] ?? 0;
    const minute = timeParts[1] ?? 0;
    const second = timeParts[2] ?? 0;

    let utcMs = Date.UTC(year, month - 1, day, hour, minute, second);
    let offsetMs = getPlatformTimeZoneOffsetMs(timeZone, new Date(utcMs));
    utcMs -= offsetMs;

    const offsetMs2 = getPlatformTimeZoneOffsetMs(timeZone, new Date(utcMs));
    if (offsetMs2 !== offsetMs) {
        utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMs2;
    }

    return new Date(utcMs);
}

function buildCouponExpiryIso() {
    const dateVal = document.getElementById('couponExpiry')?.value?.trim();
    const timeInput = document.getElementById('couponExpiryTime');
    const timeVal = finalizeCouponExpiryTimeInput(timeInput);
    const timeCheck = validateCouponExpiryTime(timeVal, { showErrors: false });
    if (!dateVal || !timeCheck.ok) return null;

    const ampm = getCouponAmPmValue();
    const time24 = convert12hTimeTo24h(timeCheck.value, ampm);
    if (!time24) return null;

    const tz = adminPlatformTimezone || 'Asia/Dhaka';
    const combined = platformLocalToUtc(dateVal, time24, tz);
    if (Number.isNaN(combined.getTime())) return null;
    return combined.toISOString();
}

function renderCouponTable() {
    const tbody = document.getElementById('couponTableBody');
    if (!tbody) return;

    if (!globalCoupons.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="cell-empty">No coupons yet. Create one using the form above.</td></tr>';
        return;
    }

    const cur = typeof adminCurrencySymbol !== 'undefined' ? adminCurrencySymbol : '৳';

    tbody.innerHTML = globalCoupons.map(coupon => {
        const used = Number(coupon.usedCount) || 0;
        const limit = Number(coupon.usageLimit) || 0;
        const status = resolveCouponStatus(coupon);
        const discountLabel = coupon.discountType === 'percentage'
            ? `${coupon.discountValue}%`
            : `${cur}${coupon.discountValue}`;
        const statusHtml = status === 'ACTIVE'
            ? '<span class="coupon-status-badge active">ACTIVE</span>'
            : '<span class="coupon-status-badge expired">EXPIRED</span>';

        return `<tr>
            <td class="cell-name"><code class="coupon-code-chip">${escHtml(coupon.code)}</code></td>
            <td>${escHtml(discountLabel)}${coupon.discountType === 'percentage' && coupon.maxDiscountAmount ? ` <small class="coupon-cap">(max ${cur}${coupon.maxDiscountAmount})</small>` : ''}</td>
            <td>${cur}${Number(coupon.minOrderAmount) || 0}</td>
            <td><strong>${used}</strong> / ${limit} Used</td>
            <td class="cell-date">${formatCouponExpiry(coupon.expiryDate)}</td>
            <td>${statusHtml}</td>
            <td>
                <div class="catalog-actions">
                    <button type="button" class="catalog-action-btn edit" title="Edit" onclick="editCoupon('${coupon._id}')"><i class="fa-solid fa-pen"></i></button>
                    <button type="button" class="catalog-action-btn delete" title="Delete" onclick="deleteCoupon('${coupon._id}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

window.resetCouponForm = function() {
    const form = document.getElementById('couponForm');
    if (form) form.reset();
    const editId = document.getElementById('couponEditId');
    if (editId) editId.value = '';
    const expiryTime = document.getElementById('couponExpiryTime');
    if (expiryTime) {
        expiryTime.value = COUPON_TIME_DEFAULT;
        expiryTime.dataset.lastValid = COUPON_TIME_DEFAULT;
    }
    const ampmSelect = document.getElementById('couponExpiryAmPm');
    if (ampmSelect) ampmSelect.value = COUPON_AMPM_DEFAULT;
    setCouponTimeHint('');
    const btnText = document.getElementById('couponSaveBtnText');
    if (btnText) btnText.textContent = 'Create Coupon';
    const cancelBtn = document.getElementById('couponCancelBtn');
    if (cancelBtn) cancelBtn.style.display = 'none';
    const perUser = document.getElementById('couponPerUserLimit');
    if (perUser && !perUser.value) perUser.value = '1';
};

function toDateInputValue(dateVal) {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    if (Number.isNaN(d.getTime())) return '';
    const tz = adminPlatformTimezone || 'Asia/Dhaka';
    return d.toLocaleDateString('en-CA', { timeZone: tz });
}

function to12HourTimeParts(dateVal) {
    if (!dateVal) {
        return { time: COUPON_TIME_DEFAULT, ampm: COUPON_AMPM_DEFAULT };
    }
    const d = new Date(dateVal);
    if (Number.isNaN(d.getTime())) {
        return { time: COUPON_TIME_DEFAULT, ampm: COUPON_AMPM_DEFAULT };
    }
    const tz = adminPlatformTimezone || 'Asia/Dhaka';
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    }).formatToParts(d);
    const map = {};
    for (const part of parts) {
        if (part.type !== 'literal') map[part.type] = part.value;
    }
    return {
        time: `${map.hour}:${map.minute}`,
        ampm: (map.dayPeriod || COUPON_AMPM_DEFAULT).toUpperCase()
    };
}

function toTimeInputValue(dateVal) {
    return to12HourTimeParts(dateVal).time;
}

window.editCoupon = function(id) {
    const coupon = globalCoupons.find(c => String(c._id) === String(id));
    if (!coupon) return showToast('Coupon not found', 'error');

    document.getElementById('couponEditId').value = coupon._id;
    document.getElementById('couponCode').value = coupon.code || '';
    document.getElementById('couponDiscountType').value = coupon.discountType || 'percentage';
    document.getElementById('couponDiscountValue').value = coupon.discountValue ?? '';
    document.getElementById('couponMinOrder').value = coupon.minOrderAmount ?? 0;
    document.getElementById('couponMaxDiscount').value = coupon.maxDiscountAmount ?? '';
    document.getElementById('couponExpiry').value = toDateInputValue(coupon.expiryDate);
    const timeParts = to12HourTimeParts(coupon.expiryDate);
    const expiryTimeEl = document.getElementById('couponExpiryTime');
    if (expiryTimeEl) {
        expiryTimeEl.value = timeParts.time;
        expiryTimeEl.dataset.lastValid = expiryTimeEl.value || COUPON_TIME_DEFAULT;
    }
    const ampmEl = document.getElementById('couponExpiryAmPm');
    if (ampmEl) ampmEl.value = timeParts.ampm === 'AM' ? 'AM' : 'PM';
    document.getElementById('couponUsageLimit').value = coupon.usageLimit ?? '';
    document.getElementById('couponPerUserLimit').value = coupon.perUserLimit ?? 1;
    document.getElementById('couponSaveBtnText').textContent = 'Update Coupon';
    document.getElementById('couponCancelBtn').style.display = 'inline-flex';

    document.getElementById('manage-coupons')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

async function saveCoupon() {
    const editId = document.getElementById('couponEditId')?.value?.trim();
    const timeInput = document.getElementById('couponExpiryTime');
    const timeCheck = validateCouponExpiryTime(finalizeCouponExpiryTimeInput(timeInput));
    if (!timeCheck.ok) {
        showToast('Error: Please enter a valid expiry time (hh:mm with AM/PM, minutes 00–59).', 'warning');
        return;
    }
    const ampm = getCouponAmPmValue();
    if (!convert12hTimeTo24h(timeCheck.value, ampm)) {
        showToast('Error: Could not parse expiry time. Check hh:mm and AM/PM.', 'warning');
        return;
    }
    const expiryIso = buildCouponExpiryIso();
    const payload = {
        code: document.getElementById('couponCode')?.value?.trim(),
        discountType: document.getElementById('couponDiscountType')?.value,
        discountValue: Number(document.getElementById('couponDiscountValue')?.value),
        minOrderAmount: Number(document.getElementById('couponMinOrder')?.value) || 0,
        maxDiscountAmount: document.getElementById('couponMaxDiscount')?.value === ''
            ? null
            : Number(document.getElementById('couponMaxDiscount')?.value),
        expiryDate: expiryIso,
        usageLimit: Number(document.getElementById('couponUsageLimit')?.value),
        perUserLimit: Number(document.getElementById('couponPerUserLimit')?.value) || 1
    };

    if (!localStorage.getItem('adminToken')) {
        showToast('Error: Admin session expired. Please log in again.', 'error');
        window.location.replace('/admin-login');
        return;
    }

    if (!payload.code) {
        showToast('Error: Please enter a coupon code!', 'warning');
        return;
    }
    if (!expiryIso) {
        showToast('Error: Please select a valid expiry date and time!', 'warning');
        return;
    }
    if (!Number.isFinite(payload.discountValue) || payload.discountValue <= 0) {
        showToast('Error: Please enter a valid discount value!', 'warning');
        return;
    }
    if (!Number.isFinite(payload.usageLimit) || payload.usageLimit < 1) {
        showToast('Error: Global usage limit must be at least 1!', 'warning');
        return;
    }
    if (!Number.isFinite(payload.perUserLimit) || payload.perUserLimit < 1) {
        showToast('Error: Per-user limit must be at least 1!', 'warning');
        return;
    }

    const saveBtn = document.getElementById('couponSaveBtn');
    const restore = setButtonLoading(saveBtn, editId ? 'Updating...' : 'Creating...');

    try {
        const res = await fetch(editId ? `/api/coupons/${editId}` : '/api/coupons', {
            method: editId ? 'PUT' : 'POST',
            headers: getCouponAuthHeaders(),
            body: JSON.stringify(payload)
        });

        let result;
        try {
            result = await res.json();
        } catch (_) {
            throw new Error('Unexpected server response. Please try again.');
        }

        if (result.success) {
            const successMsg = editId
                ? (result.message || 'Coupon updated successfully!')
                : 'Coupon created successfully!';
            showToast(`Success: ${successMsg}`, 'success');
            window.resetCouponForm();
            await fetchCoupons();
        } else {
            const errMsg = result.message || 'Failed to save coupon';
            showToast('Error: ' + errMsg, 'error');
            if (res.status === 401 && result.redirect) {
                localStorage.removeItem('adminToken');
                window.location.replace(result.redirect);
            }
        }
    } catch (error) {
        const errMsg = error.message || 'Server error while saving coupon!';
        showToast('Error: ' + errMsg, 'error');
        console.error('Coupon save error:', error);
    } finally {
        restore();
    }
}
window.saveCoupon = saveCoupon;

window.deleteCoupon = function(id) {
    showCustomConfirm('Delete Coupon', 'Are you sure you want to permanently delete this coupon?', async () => {
        try {
            const res = await fetch(`/api/coupons/${id}`, {
                method: 'DELETE',
                headers: getCouponAuthHeaders()
            });
            const result = await res.json();
            if (result.success) {
                globalCoupons = globalCoupons.filter(c => String(c._id) !== String(id));
                renderCouponTable();
                showAdminSuccess('Coupon Deleted', result.message || 'Coupon deleted successfully!');
            } else {
                showToast(result.message || 'Failed to delete coupon', 'error');
            }
        } catch (error) {
            showToast('Failed to delete coupon', 'error');
        }
    }, 'danger');
};


/* ==========================================================================
   SECTION 9C: ATTRIBUTE MANAGEMENT ENGINE (অ্যাট্রিবিউট মডিউল)
   ========================================================================== */

window.checkAttributeNameDuplicate = function() {
    const nameInput = document.getElementById('newAttributeName');
    const warnEl = document.getElementById('attributeNameDuplicateWarn');
    if (!nameInput || !warnEl) return false;

    const existing = findGlobalAttributeByName(nameInput.value);
    if (existing) {
        warnEl.textContent = `Attribute '${existing.name}' already exists. Click the Edit button on the table below to add more values.`;
        warnEl.hidden = false;
        return true;
    }

    warnEl.hidden = true;
    warnEl.textContent = '';
    return false;
};

async function fetchAttributes() {
    try {
        const response = await fetch('/api/attributes');
        const data = await response.json();
        if (data.success) {
            globalAttributes = data.data || [];
            renderAttributeTable();
            ensureVariationDatalists();
        }
    } catch (error) {
        console.error("🔴 Attribute load error:", error);
    }
}

function renderAttributeTable() {
    const tbody = document.getElementById('attributeTableBody');
    if (!tbody) return;

    if (globalAttributes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="cell-empty">No attributes yet. Add one using the form above.</td></tr>';
        return;
    }

    tbody.innerHTML = globalAttributes.map(attr => {
        const valueChips = (attr.values || []).map(v => `<span class="attr-value-chip">${escHtml(v)}</span>`).join(' ')
            || '<span class="cell-date">—</span>';
        return `<tr>
            <td class="cell-name">${escHtml(attr.name)}</td>
            <td>${valueChips}</td>
            <td class="cell-date">${formatCatalogDate(attr.createdAt)}</td>
            <td>${catalogActionsHtml(
                `editAttribute('${attr._id}')`,
                `deleteAttribute('${attr._id}')`
            )}</td>
        </tr>`;
    }).join('');
}

window.addAttribute = async function() {
    const nameInput = document.getElementById('newAttributeName');
    const valuesInput = document.getElementById('newAttributeValues');
    const name = nameInput.value.trim();
    const values = valuesInput.value.trim();
    if (!name) return showToast("Please enter an attribute name!", "warning");

    const existing = findGlobalAttributeByName(name);
    if (existing) {
        checkAttributeNameDuplicate();
        showToast(
            `Attribute '${existing.name}' already exists. Use Edit on the table below to add more values.`,
            'warning'
        );
        return;
    }

    try {
        const res = await fetch('/api/attributes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ name, values })
        });
        const result = await res.json();
        if (result.success) {
            showAdminSuccess('Attribute Added', result.message || 'Attribute saved successfully.');
            nameInput.value = '';
            valuesInput.value = '';
            checkAttributeNameDuplicate();
            await fetchAttributes();
        } else {
            if ((result.message || '').toLowerCase().includes('already exists')) {
                checkAttributeNameDuplicate();
            }
            showToast(result.message || 'Failed to save attribute. Please try again.', 'error');
        }
    } catch (error) {
        showToast('Failed to save attribute. Please try again.', 'error');
    }
};

window.editAttribute = function(id) {
    const attr = globalAttributes.find(a => a._id === id);
    if (!attr) return showToast('Attribute not found!', 'error');

    const existingValues = (attr.values || []).join(', ');
    openCatalogQuickEdit({
        title: `Edit Attribute — ${attr.name}`,
        label: 'Values (comma separated)',
        value: existingValues,
        placeholder: 'Append values, e.g. Black, Red',
        hint: existingValues
            ? `Current values: ${existingValues}. Edit the full list or append new values at the end.`
            : 'Enter comma-separated values for this attribute.',
        focusMode: 'end',
        onSave: async (newValues) => {
            const mergedValues = parseCommaValues(newValues);
            if (!mergedValues.length) {
                return showToast('Please enter at least one value.', 'warning');
            }
            try {
                const res = await fetch(`/api/attributes/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ values: mergedValues })
                });
                const result = await res.json();
                if (result.success) {
                    showAdminSuccess('Attribute Updated', result.message || 'Attribute updated successfully.');
                    closeCatalogQuickEdit();
                    await fetchAttributes();
                } else {
                    showToast(result.message || 'Failed to update attribute. Please try again.', 'error');
                }
            } catch (error) {
                showToast('Failed to update attribute. Please try again.', 'error');
            }
        }
    });
};

window.deleteAttribute = function(id) {
    showCustomConfirm('Delete Attribute', 'Are you sure you want to delete this attribute?', async () => {
        try {
            const res = await fetch(`/api/attributes/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await res.json();
            if (result.success) {
                globalAttributes = globalAttributes.filter(a => String(a._id) !== String(id));
                renderAttributeTable();
                showAdminSuccess('Attribute Deleted', result.message || 'Attribute removed.');
            } else {
                showToast(result.message || 'Failed to delete attribute. Please try again.', 'error');
            }
        } catch (error) {
            showToast('Failed to delete attribute. Please try again.', 'error');
        }
    }, 'danger');
};




/*-------------------------------------------------------------------------------------------*/












/* ==========================================================================
   SECTION 10: MANAGE PRODUCTS ENGINE (প্রোডাক্ট তালিকা ও মাল্টি-ফিল্টারিং)
   ========================================================================== */

let currentSort = { key: 'productId', asc: false }; // ডিফল্ট সোর্টিং স্টেট
let selectedProductIds = new Set();               // বাল্ক ডিলিটের জন্য চেক করা আইডি সেট

/**
 * ১০.১: ক্লাউড ডাটাবেজ থেকে সকল প্রোডাক্ট ডাটা লাইভ সিঙ্ক করা
 */
window.fetchLiveProducts = async function() {
    const tbody = getProdTableBody();
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="8" class="loading-cell"><div class="custom-spinner"></div><p>Syncing secure cloud server database...</p></td></tr>`;
    
    try {
        const res = await fetch('/api/products', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        globalProducts = Array.isArray(data) ? data : (data.products || data.data || []);
        
        const totalBadge = document.getElementById('total-products-badge');
        if (totalBadge) totalBadge.innerText = `Total: ${globalProducts.length}`;
        
        updateFilterCategoryDropdown();
        readProductListUrlState();
        filterAndRenderProducts(false); 
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="8" class="table-status-error">Failed to load products.</td></tr>`; 
    }
};

/**
 * 🌟 নতুন ফাংশন: শুধুমাত্র এক্সিস্টিং প্রোডাক্টের ক্যাটাগরি দিয়ে ফিল্টার ড্রপডাউন আপডেট করা
 */
function updateFilterCategoryDropdown() {
    const filterDropdown = document.getElementById('filterCategory');
    if (!filterDropdown) return;

    const currentFilterValue = filterDropdown.value || 'All'; // ইউজারের বর্তমান সিলেকশন ধরে রাখার জন্য

    // প্রোডাক্ট লিস্ট থেকে ইউনিক ক্যাটাগরি বের করা (ফাঁকা বা নাল ক্যাটাগরি বাদ দিয়ে)
    const uniqueCategories = [...new Set(globalProducts.map(p => p.category).filter(c => c && c.trim() !== ''))];

    filterDropdown.innerHTML = '<option value="All">All Categories</option>';
    uniqueCategories.forEach(cat => {
        filterDropdown.innerHTML += `<option value="${cat}">${cat}</option>`;
    });

    // রেন্ডার শেষে আগের সিলেক্টেড ফিল্টার ফিরিয়ে আনা (যদি সেই ক্যাটাগরির প্রোডাক্ট এখনো লিস্টে থাকে)
    if (uniqueCategories.includes(currentFilterValue)) {
        filterDropdown.value = currentFilterValue;
    } else {
        filterDropdown.value = 'All';
    }
}

/**
 * ১০.২: সার্চ কি-ওয়ার্ড, ক্যাটাগরি, স্টক স্ট্যাটাস ও প্রাইস রেঞ্জ অনুযায়ী প্রোডাক্ট ফিল্টারিং
 */
window.filterAndRenderProducts = function(resetPage = true) {
    const search = (document.getElementById('searchProduct') ? document.getElementById('searchProduct').value : '').toLowerCase();
    const cat = document.getElementById('filterCategory') ? document.getElementById('filterCategory').value : 'All';
    const stockStatus = document.getElementById('filterStockStatus') ? document.getElementById('filterStockStatus').value : 'All';
    const priceRange = document.getElementById('filterPriceRange') ? document.getElementById('filterPriceRange').value : 'All';

    // ১. ফিল্টারিং প্রসেস
    currentFilteredProducts = globalProducts.filter(p => {
        const matchSearch = (p.name || '').toLowerCase().includes(search) || (p.productId || p.id || '').toLowerCase().includes(search) || (p.category || '').toLowerCase().includes(search);
        const matchCat = (cat === 'All' || p.category === cat);
        
        // স্টক স্ট্যাটাস ফিল্টার লজিক
        let matchStock = true;
        if (stockStatus === 'InStock') matchStock = p.stock >= 5;
        else if (stockStatus === 'LowStock') matchStock = p.stock > 0 && p.stock < 5;
        else if (stockStatus === 'OutOfStock') matchStock = p.stock == 0;

        // প্রাইস ফিল্টার লজিক
        let matchPrice = true;
        if (priceRange === '0-500') matchPrice = p.price <= 500;
        else if (priceRange === '500-2000') matchPrice = p.price > 500 && p.price <= 2000;
        else if (priceRange === '2000+') matchPrice = p.price > 2000;

        return matchSearch && matchCat && matchStock && matchPrice;
    });

    // ২. সোর্টিং প্রসেস
    currentFilteredProducts.sort((a, b) => {
        let valA = a[currentSort.key] || '';
        let valB = b[currentSort.key] || '';
        
        if (currentSort.key === 'price' || currentSort.key === 'stock') {
            valA = Number(valA); valB = Number(valB);
        } else {
            valA = valA.toString().toLowerCase(); valB = valB.toString().toLowerCase();
        }

        if (valA < valB) return currentSort.asc ? -1 : 1;
        if (valA > valB) return currentSort.asc ? 1 : -1;
        return 0;
    });

    currentPage = resetPage ? 1 : currentPage;
    renderProductTable();
    syncProductListUrlState();
};

/**
 * ১০.৩: কলাম হেডারে ক্লিক করলে ডাইনামিক সর্ট টগল করার ফাংশন
 * @param {string} key - যে অবজেক্ট প্রোপার্টি অনুযায়ী সর্ট হবে (price, stock ইত্যাদি)
 */
window.handleSort = function(key) {
    if (currentSort.key === key) {
        currentSort.asc = !currentSort.asc; 
    } else {
        currentSort.key = key;
        currentSort.asc = true;
    }
    filterAndRenderProducts();
};


/* ==========================================================================
   SECTION 10.1: PRODUCT TABLE RENDERING (টেবিল রেন্ডার ও স্টক অ্যালার্ট)
   ========================================================================== */

window.changePageSize = function() {
    currentPage = 1;
    renderProductTable();
    syncProductListUrlState();
};

/**
 * ১০.৪: প্রোডাক্ট ডাটা টেবিল জেনারেটর এবং কন্ডিশনাল স্টক ব্যাজ বাইন্ডিং
 */
window.renderProductTable = function() {
    const tbody = getProdTableBody();
    if (!tbody) return;
    
    const limit = parseInt(document.getElementById('itemsPerPage') ? document.getElementById('itemsPerPage').value : 10);
    const totalItems = currentFilteredProducts.length;
    const totalPages = Math.ceil(totalItems / limit) || 1;
    
    if (currentPage > totalPages) currentPage = totalPages;
    const startIdx = (currentPage - 1) * limit;
    const paginated = currentFilteredProducts.slice(startIdx, startIdx + limit);

    // এন্ট্রি কাউন্টার টেক্সট আপডেট
    if (document.getElementById('page-start-idx')) {
        document.getElementById('page-start-idx').innerText = totalItems === 0 ? 0 : startIdx + 1;
        document.getElementById('page-end-idx').innerText = startIdx + paginated.length;
        document.getElementById('page-total-entries').innerText = totalItems;
    }

    tbody.innerHTML = paginated.length === 0 ? `<tr><td colspan="9" class="loading-cell">No matching products found.</td></tr>` : '';

    paginated.forEach(prod => {
        // ইমেজ ইউআরএল প্রসেস লজিক (মাল্টিপল অ্যারে থেকে প্রথম ছবি নির্বাচন)
        let imgSrc = '';
        if (prod.images && prod.images.length > 0) imgSrc = prod.images[0];
        else if (prod.image) imgSrc = prod.image;
        else if (prod.imageUrl) imgSrc = prod.imageUrl;
        
        if (imgSrc && !imgSrc.startsWith('/') && !imgSrc.startsWith('http')) imgSrc = `/products/${imgSrc}`;
        let imgHtml = imgSrc ? `<img src="${imgSrc}" onerror="this.outerHTML='<span>${prod.icon||'📦'}</span>';" class="product-img-sm">` : `<span style="font-size:24px;">${prod.icon||'📦'}</span>`;

        // স্টক লেভেলের উপর ভিত্তি করে ডাইনামিক স্টাইলিশ ব্যাজ তৈরি
        let stockHtml = '';
        let currentStock = Number(prod.stock);

        if (currentStock <= 0) { 
            stockHtml = `<span class="stock-status stock-out"><i class="fa-solid fa-ban"></i> Out of Stock</span>`;
        } else if (currentStock <= 5) {
            stockHtml = `<span class="stock-status stock-low"><i class="fa-solid fa-triangle-exclamation"></i> Low: ${currentStock}</span>`;
        } else {
            stockHtml = `<span class="stock-status stock-normal"><i class="fa-solid fa-check-circle"></i> In Stock: ${currentStock}</span>`;
        }

        // বাল্ক সিলেকশন চেকবক্স স্টেট চেক করা
        const isChecked = selectedProductIds.has(prod._id) ? 'checked' : '';

        // Sell/buy price — variant matrix shows minimum only; weighted avg stays in DB for analytics
        const { sellPriceHtml, buyPriceHtml } = buildProductTablePriceCells(prod);

        tbody.innerHTML += `
            <tr>
                <td class="col-checkbox no-print">
                    <input type="checkbox" class="row-checkbox" value="${prod._id}" ${isChecked} onchange="toggleSingleSelection(this)">
                </td>
                <td><b>${prod.productId || prod.id || 'N/A'}</b></td>
                <td>${imgHtml}</td>
                <td>${prod.name}</td>
                <td><span class="status-badge status-verified">${prod.category || 'General'}</span></td>
                <td>${sellPriceHtml}</td>
                <td class="buy-price-cell">${buyPriceHtml}</td>
                <td>${stockHtml}</td> 
                <td class="col-actions no-print">
                    <button class="action-btn edit" onclick="editProduct('${prod._id}')" title="Edit Product"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button class="action-btn delete" onclick="deleteProduct('${prod._id}')" title="Delete Product"><i class="fa-solid fa-trash-can"></i></button>
                </td>
            </tr>
        `;
    });

    // প্রোডাক্ট পেজিনেশন নম্বর বাটন রেন্ডার করা
    renderPaginationButtons(totalPages);
    syncProductListUrlState();
    
    // সিলেক্ট অল চেকবক্স হ্যান্ডলার সিঙ্ক
    const selectAllCheckbox = document.getElementById('selectAllProducts');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = paginated.length > 0 && Array.from(document.querySelectorAll('.row-checkbox')).every(cb => cb.checked);
    }
};

/**
 * ১০.৫: ডাইনামিক পেজিনেশন বাটন ট্র্যাকার ও জেনারেটর
 * @param {number} totalPages - মোট প্রোডাক্ট পেজ সংখ্যা
 */
function renderPaginationButtons(totalPages) {
    const container = document.getElementById('dynamic-page-numbers');
    if (!container) return;
    
    let html = '';
    for (let i = 1; i <= totalPages; i++) {
        // ডাইনামিক ইলিপসিস (...) স্ট্রাকচার তৈরি যদি পেজ অনেক বেশি থাকে
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            html += `<button type="button" class="page-num-btn ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
        } else if (i === currentPage - 2 || i === currentPage + 2) {
            html += `<span style="padding: 5px;">...</span>`;
        }
    }
    container.innerHTML = html;

    document.getElementById('btn-prev-page').disabled = currentPage === 1;
    document.getElementById('btn-next-page').disabled = currentPage === totalPages || totalPages === 0;
}

window.goToPage = function(page) { currentPage = page; renderProductTable(); };
window.goToNextPage = function() { currentPage++; renderProductTable(); };
window.goToPreviousPage = function() { if (currentPage > 1) { currentPage--; renderProductTable(); } };


/* ==========================================================================
   SECTION 10.2: BULK OPERATIONS & DATA EXPORT (CSV এক্সপোর্ট মডিউল)
   ========================================================================== */

/**
 * ১০.৬: টেবিলের সকল চেকবক্স একসাথে অন/অফ করা
 */
window.toggleSelectAll = function(source) {
    const checkboxes = document.querySelectorAll('.row-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = source.checked;
        if (source.checked) selectedProductIds.add(cb.value);
        else selectedProductIds.delete(cb.value);
    });
    updateBulkActionPanel();
};

/**
 * ১০.৭: সিঙ্গেল আইটেম চেকবক্স সিলেক্ট করা
 */
window.toggleSingleSelection = function(checkbox) {
    if (checkbox.checked) selectedProductIds.add(checkbox.value);
    else selectedProductIds.delete(checkbox.value);
    updateBulkActionPanel();
    
    const allChecked = Array.from(document.querySelectorAll('.row-checkbox')).every(cb => cb.checked);
    document.getElementById('selectAllProducts').checked = allChecked;
};

function updateBulkActionPanel() {
    const countSpan = document.getElementById('selected-count');
    if (countSpan) countSpan.innerText = `${selectedProductIds.size} selected`;
}

/**
 * ১০.৮: একাধিক সিলেক্টেড প্রোডাক্ট একসাথে এক ক্লিকে ডিলিট করার কোর ফাংশন
 */
window.handleBulkDelete = function() {
    if (selectedProductIds.size === 0) return showToast("No products selected!", "warning");
    
    showCustomConfirm("Bulk Delete", `Are you sure you want to delete ${selectedProductIds.size} products? This cannot be undone.`, async () => {
        const ids = Array.from(selectedProductIds);
        try {
            const results = await Promise.all(ids.map(id =>
                fetch(`/api/products/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } })
                    .then(r => r.json().then(body => ({ ok: r.ok, body })))
            ));
            const allOk = results.every(r => r.ok && r.body.success);
            if (!allOk) {
                showToast("Some products could not be deleted.", "error");
                fetchLiveProducts();
                return;
            }
            ids.forEach(id => {
                const sid = String(id);
                globalProducts = globalProducts.filter(p => String(p._id) !== sid);
                selectedProductIds.delete(id);
            });
            updateBulkActionPanel();
            const totalBadge = document.getElementById('total-products-badge');
            if (totalBadge) totalBadge.innerText = `Total: ${globalProducts.length}`;
            updateFilterCategoryDropdown();
            filterAndRenderProducts(false);
            document.getElementById('selectAllProducts').checked = false;
            showAdminSuccess('Products Deleted', `${ids.length} product(s) removed successfully.`);
        } catch (e) {
            showToast("Error in bulk deletion process!", "error");
        }
    }, "danger");
};

/**
 * ১০.৯: একক প্রোডাক্ট ডিলিট করার লজিক
 */
window.deleteProduct = (id) => {
    showCustomConfirm("Delete Product", "Permanently delete this product?", async () => {
        try {
            const res = await fetch(`/api/products/${id}`, { 
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await res.json();
            if (res.ok && result.success) {
                removeProductFromState(id);
                showAdminSuccess('Product Deleted', result.message || 'Product removed from catalog.');
            } else {
                showToast(result.message || "Failed to delete.", "error");
            }
        } catch (e) { showToast("Server error", "error"); }
    }, "danger");
};

/**
 * ১০.১০: এক্সপোর্ট বাটন — শুধুমাত্র চেকবক্সে সিলেক্ট করা সারিগুলো CSV তে এক্সপোর্ট
 */
document.getElementById('btn-export-csv')?.addEventListener('click', () => {
    if (selectedProductIds.size === 0) {
        return showToast("Please select products using the checkboxes before exporting.", "warning");
    }

    const toExport = currentFilteredProducts.filter(p => selectedProductIds.has(p._id));
    if (toExport.length === 0) {
        return showToast("Selected products are not visible in the current filter view.", "warning");
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "ID,Name,Category,Sell Price,Buy Price,Stock\n";

    toExport.forEach(p => {
        const row = [
            p.productId || p.id || '',
            p.name || '',
            p.category || '',
            p.price ?? '',
            p.buyingPrice ?? 0,
            p.stock ?? 0
        ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');
        csvContent += row + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Products_Selected_${toExport.length}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`${toExport.length} selected product(s) exported to CSV!`, "success");
});

document.getElementById('btn-print-table')?.addEventListener('click', () => {
    const dateEl = document.getElementById('printReportDate');
    if (dateEl) {
        dateEl.textContent = 'Generated: ' + new Date().toLocaleString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }

    document.body.classList.add('printing-products');
    const cleanup = () => {
        document.body.classList.remove('printing-products');
        window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
});


/* ==========================================================================
   SECTION 11: ADVANCED PRODUCT EDIT & LIVE PREVIEW ENGINE (এডিট মডিউল)
   ========================================================================== */

let selectedFilesEdit = new DataTransfer(); // এডিট মোডালের ইমেজ ট্র্যাকার

/**
 * ১১.১: এডিট মডাল ওপেন করা এবং ফর্মে ডাইনামিক ডাটা ইনজেক্ট করা
 * @param {string} id - প্রোডাক্টের অবজেক্ট আইডি
 */
window.editProduct = function(id) {
    saveProductPaginationState();

    selectedFilesEdit = new DataTransfer(); 

    const previewBox = document.getElementById('editImgPreviewBox');
    if (previewBox) previewBox.innerHTML = ''; 
    
    const fileInput = document.getElementById('prodImageFile'); 
    if (fileInput) {
        fileInput.value = ''; 
        fileInput.files = selectedFilesEdit.files; 
    }

    const product = globalProducts.find(p => p._id === id);
    if (!product) return showToast("Product not found!", "error");

    const modal = document.getElementById('editProductModal'); 
    if (!modal) return showToast("Edit Product Modal ID not found in HTML!", "warning");

    // ফর্মে ওল্ড ডাটা বসানো
    if (document.getElementById('editProdMongoId')) document.getElementById('editProdMongoId').value = product._id;
    if (document.getElementById('editProdId')) document.getElementById('editProdId').value = product.productId || product.id || '';
    if (document.getElementById('editProdName')) document.getElementById('editProdName').value = product.name || '';
    if (document.getElementById('editProdPrice')) document.getElementById('editProdPrice').value = product.price || '';
    if (document.getElementById('editProdBuyingPrice')) document.getElementById('editProdBuyingPrice').value = (product.buyingPrice !== undefined && product.buyingPrice !== null) ? product.buyingPrice : '';
    if (typeof updateEditProfitPreview === 'function') updateEditProfitPreview();
    
    // 🌟 ক্যাটাগরি ড্রপডাউনটি রেন্ডার করে ভ্যালু সিলেক্ট করা (ডাটাবেজ ওরিয়েন্টেড সিকিউরড লক)
    if (document.getElementById('editProdCategory')) {
        renderCategoryDropdown(); // এডিট মোডাল ওপেন হওয়ার মুহূর্তেই অপশন লিস্ট রি-ফ্রেশ নিশ্চিত করা
        document.getElementById('editProdCategory').value = product.category || '';
    }

    // 🌟 ব্র্যান্ড ড্রপডাউন রেন্ডার করে বর্তমান ব্র্যান্ড প্রি-সিলেক্ট করা
    if (document.getElementById('editProdBrand')) {
        renderBrandDropdown();
        const brandId = (product.brand && product.brand._id) ? product.brand._id : (product.brand || '');
        document.getElementById('editProdBrand').value = brandId || '';
    }

    // 🌟 বিদ্যমান ভ্যারিয়েশনগুলো এডিট মোডালে রেন্ডার করা
    loadProductVariantUI('edit', product);
    
    if (document.getElementById('editProdEmoji')) document.getElementById('editProdEmoji').value = product.icon || '📦';
    if (document.getElementById('editProdDesc')) document.getElementById('editProdDesc').value = product.description || '';
    
    // অ্যাডভান্সড ডেসক্রিপশন এবং হাইলাইটস ডাটা ইনজেকশন
    if (document.getElementById('editDetailedDescription')) document.getElementById('editDetailedDescription').value = product.detailedDescription || '';
    if (document.getElementById('editHighlights')) document.getElementById('editHighlights').value = product.highlights && Array.isArray(product.highlights) ? product.highlights.join(', ') : '';

    // এক্সিসটিং ইমেজের ডাইনামিক থাম্বনেইল থাম্ব শো করানো
    if (previewBox) {
        if (product.images && product.images.length > 0) {
            previewBox.innerHTML = product.images.map(img => {
                const imgSrc = img.startsWith('http') ? img : `/products/${img}`;
                return `<div class="edit-img-thumb"><img src="${imgSrc}" alt="Product image"></div>`;
            }).join('');
        } else if (product.image) {
            const imgSrc = product.image.startsWith('http') ? product.image : `/products/${product.image}`;
            previewBox.innerHTML = `<div class="edit-img-thumb"><img src="${imgSrc}" alt="Product image"></div>`;
        } else {
            previewBox.innerHTML = `<span class="edit-img-placeholder">${product.icon || '📦'}</span>`;
        }
    }

    modal.style.display = 'flex';
};

/**
 * ১১.২: এডিট মোডাল বন্ধ ও রিসেট করা
 */
window.closeEditModal = function() {
    const modal = document.getElementById('editProductModal');
    if (modal) {
        modal.style.display = 'none';
        savedProductPageBeforeAction = null;
        selectedFilesEdit = new DataTransfer();
        const editFileInput = document.querySelector('#editProductModal input[type="file"]'); 
        if (editFileInput) {
            editFileInput.value = '';
            editFileInput.files = selectedFilesEdit.files;
        }
    }
};

// ইভেন্ট ডেলিগেশন দিয়ে এডিট মোডালের ফাইল আপলোড লাইভ লিসেনিং করা
/**
 * 🌟 এডিট মোডালে প্রতি ইউনিট প্রফিট (Selling - Buying) লাইভ প্রিভিউ আপডেট করা
 */
function updateEditProfitPreview() {
    const priceEl = document.getElementById('editProdPrice');
    const buyEl = document.getElementById('editProdBuyingPrice');
    const previewEl = document.getElementById('editProdProfitPreview');
    if (!previewEl) return;

    const selling = Number(priceEl ? priceEl.value : 0) || 0;
    const buying = Number(buyEl ? buyEl.value : 0) || 0;
    const profit = selling - buying;

    previewEl.value = `${formatAdminPrice(profit)}` + (buying > 0 && selling > 0 ? `  (${Math.round((profit / selling) * 100)}% margin)` : '');
    previewEl.style.color = profit >= 0 ? '#047857' : '#dc2626';
}
window.updateEditProfitPreview = updateEditProfitPreview;

// প্রাইস/বায়িং প্রাইস টাইপ করার সাথে সাথে প্রফিট প্রিভিউ লাইভ আপডেট
document.addEventListener('input', function(e) {
    if (e.target && (e.target.id === 'editProdPrice' || e.target.id === 'editProdBuyingPrice')) {
        updateEditProfitPreview();
    }
});

document.addEventListener('change', function(e) {
    if (e.target && e.target.closest('#editProductModal') && e.target.type === 'file') {
        const files = e.target.files;
        if (files && files.length > 0) {
            Array.from(files).forEach(file => selectedFilesEdit.items.add(file));
        }
        e.target.files = selectedFilesEdit.files;
        renderEditPreviews();
    }
});

function renderEditPreviews() {
    const previewBox = document.getElementById('editImgPreviewBox');
    if (!previewBox) return;
    
    const hasFiles = selectedFilesEdit.files.length > 0;
    if (hasFiles) {
        previewBox.innerHTML = '';
        Array.from(selectedFilesEdit.files).forEach((file, index) => {
            const reader = new FileReader();
            reader.onload = function(event) {
                previewBox.innerHTML += `
                <div class="edit-img-thumb">
                    <img src="${event.target.result}" alt="New upload preview">
                    <button type="button" class="edit-img-remove" onclick="removeEditImage(${index})" aria-label="Remove image">&times;</button>
                </div>`;
            };
            reader.readAsDataURL(file);
        });
    }
}

window.removeEditImage = function(index) {
    const dt = new DataTransfer();
    const files = selectedFilesEdit.files;
    for (let i = 0; i < files.length; i++) {
        if (i !== index) dt.items.add(files[i]);
    }
    selectedFilesEdit = dt;
    const editFileInput = document.querySelector('#editProductModal input[type="file"]');
    if (editFileInput) editFileInput.files = selectedFilesEdit.files;
    renderEditPreviews();
};

/**
 * ১১.৩: মডিফাইড ডাটা পুশ করে ক্লাউড ডাটাবেজে প্রোডাক্ট আপডেট সেভ করা
 */
window.updateProductDetails = async function() {
    saveProductPaginationState();

    const mongoId = document.getElementById('editProdMongoId').value;
    const productId = document.getElementById('editProdId').value.trim();
    const name = document.getElementById('editProdName').value.trim();
    const price = document.getElementById('editProdPrice').value.trim();
    const buyingPrice = document.getElementById('editProdBuyingPrice') ? document.getElementById('editProdBuyingPrice').value.trim() : '';
    const stockField = document.getElementById('editProdStock');
    const variantPayload = collectProductVariantPayload('edit');
    const stock = String(variantPayload.stock ?? stockField?.value ?? '').trim();
    const category = document.getElementById('editProdCategory').value.trim();
    const brand = document.getElementById('editProdBrand') ? document.getElementById('editProdBrand').value : '';
    const emoji = document.getElementById('editProdEmoji').value.trim();
    const desc = document.getElementById('editProdDesc').value.trim();
    
    const detailedDesc = document.getElementById('editDetailedDescription') ? document.getElementById('editDetailedDescription').value.trim() : '';
    const highlightsInput = document.getElementById('editHighlights') ? document.getElementById('editHighlights').value.trim() : '';
    
    const editFileInput = document.querySelector('#editProductModal input[type="file"]');
    const files = editFileInput ? editFileInput.files : null;

    if (!name || !price || !stock) return showToast("Required fields missing!", "warning");

    const btn = document.getElementById('saveEditBtn');
    let originalText = '';
    if (btn) { originalText = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...'; }

    const highlightsArray = highlightsInput 
        ? highlightsInput.split(',').map(item => item.trim()).filter(item => item !== '') 
        : [];

    const formData = new FormData();
    formData.append('id', productId);
    formData.append('name', name);
    formData.append('price', price);
    formData.append('buyingPrice', buyingPrice || 0);
    formData.append('stock', stock);
    formData.append('stockQuantity', variantPayload.stockQuantity);
    formData.append('hasVariants', variantPayload.hasVariants ? 'true' : 'false');
    formData.append('category', category);
    formData.append('brand', brand || '');
    formData.append('variants', JSON.stringify(variantPayload.variants));
    formData.append('icon', emoji);
    formData.append('description', desc);
    formData.append('detailedDescription', detailedDesc);
    formData.append('highlights', JSON.stringify(highlightsArray)); 
    
    if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
            formData.append('productImages', files[i]);
        }
    }

    try {
        const res = await fetch(`/api/products/${mongoId}`, { 
            method: 'PUT', 
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData 
        });
        
        const result = await res.json();
        if (res.ok && result.success) {
            const updated = result.data || result.product;
            if (updated && updated._id) {
                upsertProductInState(updated);
            } else {
                fetchLiveProducts();
            }
            window.closeEditModal();
            showAdminSuccess('Product Updated', result.message || 'Changes saved successfully.');
        } else {
            showToast(result.message || "Update failed!", "error");
        }
    } catch (e) { 
        showToast("Server error during update!", "error"); 
    } finally { 
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; } 
    }
};

// সার্চ বা ফিল্টার ইভেন্ট বাইন্ডিং সেটআপ
document.addEventListener('DOMContentLoaded', () => {
    const searchProduct = document.getElementById('searchProduct');
    if (searchProduct) searchProduct.addEventListener('input', window.filterAndRenderProducts);
    
    ['filterCategory', 'filterStockStatus', 'filterPriceRange'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', window.filterAndRenderProducts);
    });
});



/* ==========================================================================
   SECTION 12: SECURITY LOGS (অ্যাডমিন প্যানেল অ্যাক্টিভিটি এবং লগ ট্র্যাকিং)
   ========================================================================== */

/**
 * ১২.১: সার্ভার থেকে অ্যাডমিন ও সিস্টেমের সিকিউরিটি লগস নিয়ে আসা
 */
async function fetchSecurityLogs() {
    const logsBody = document.getElementById('securityLogsBody');
    if (!logsBody) return;

    logsBody.innerHTML = `<tr><td colspan="6" class="loading-container"><div class="spinner"></div><p>Fetching security logs...</p></td></tr>`;

    try {
        const response = await fetch('/api/admin/logs?limit=100', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();
        const logs = data.success ? data.data : [];

        const countEl = document.getElementById('securityLogCount');
        if (countEl) countEl.textContent = logs.length;

        if (logs.length === 0) {
            logsBody.innerHTML = `<tr><td colspan="6" class="loading-cell">No security logs recorded yet.</td></tr>`;
            return;
        }

        let logsHTML = '';
        logs.forEach(log => {
            let actionClass = 'status-pending';
            const actionLower = (log.action || '').toLowerCase();
            if (actionLower.includes('fail') || actionLower.includes('block') || actionLower.includes('delete')) actionClass = 'stock-out';
            else if (actionLower.includes('success') || actionLower.includes('login success') || actionLower.includes('activated')) actionClass = 'status-verified';
            else if (actionLower.includes('update') || actionLower.includes('edit') || actionLower.includes('suspend')) actionClass = 'stock-low';

            const actorType = log.actorType || 'system';
            const ts = log.timestamp || log.createdAt;

            logsHTML += `
                <tr>
                    <td><b>#${log._id ? String(log._id).slice(-6).toUpperCase() : 'SYS'}</b></td>
                    <td>${ts ? new Date(ts).toLocaleString('en-GB') : '—'}</td>
                    <td><span class="status-badge ${actionClass}">${log.action || '—'}</span></td>
                    <td><span class="actor-badge ${actorType}">${actorType}</span> ${log.actor || '—'}</td>
                    <td>${log.ipAddress || 'Unknown'}</td>
                    <td>${log.details || '—'}</td>
                </tr>
            `;
        });
        logsBody.innerHTML = logsHTML;
    } catch (error) {
        console.error("Logs Fetch Error:", error);
        logsBody.innerHTML = `<tr><td colspan="6" class="table-status-error">Server connection failed.</td></tr>`;
    }
}
window.fetchSecurityLogs = fetchSecurityLogs;


/* ==========================================================================
   SECTION 12B: FORTIFIED ADMIN SECURITY SUITE
   Active Sessions · Login History · IP Blacklist Manager
   ========================================================================== */

const SEC_AUTH_HEADERS = () => ({ 'Authorization': `Bearer ${token}` });

function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function timeAgo(dateStr) {
    if (!dateStr) return '—';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hr ago`;
    return `${Math.floor(hrs / 24)} day(s) ago`;
}

function formatDuration(ms) {
    if (ms == null) return 'Permanent';
    if (ms <= 0) return 'Expired';
    const totalMin = Math.floor(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h left`;
    return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

function deviceIcon(deviceType = '') {
    const t = deviceType.toLowerCase();
    if (t.includes('mobile') || t.includes('phone')) return 'fa-mobile-screen';
    if (t.includes('tablet')) return 'fa-tablet-screen-button';
    return 'fa-laptop';
}

/* ---------- 12B.1 Active Devices & Sessions ---------- */
async function fetchAdminSessions() {
    const grid = document.getElementById('adminSessionsGrid');
    if (!grid) return;
    grid.innerHTML = `<div class="loading-container"><div class="spinner"></div><p>Loading active sessions...</p></div>`;

    try {
        const res = await fetch('/api/admin/sessions', { headers: SEC_AUTH_HEADERS() });
        const data = await res.json();
        const sessions = data.success ? data.sessions : [];

        const countEl = document.getElementById('activeSessionCount');
        if (countEl) countEl.textContent = sessions.length;

        const current = sessions.find(s => s.isCurrent);
        const thisEl = document.getElementById('thisDeviceLabel');
        if (thisEl) thisEl.textContent = current ? `${current.os} · ${current.location}` : 'Unknown';

        if (sessions.length === 0) {
            grid.innerHTML = `<div class="empty-state">No active sessions found.</div>`;
            return;
        }

        grid.innerHTML = sessions.map(s => `
            <div class="session-card ${s.isCurrent ? 'current' : ''}">
                <div class="session-icon"><i class="fa-solid ${deviceIcon(s.deviceType)}"></i></div>
                <div class="session-body">
                    <div class="session-title">
                        ${escapeHtml(s.os)} · ${escapeHtml(s.browser)}
                        ${s.isCurrent ? '<span class="this-device-badge">This Device</span>' : ''}
                    </div>
                    <div class="session-meta"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(s.location)}</div>
                    <div class="session-meta"><i class="fa-solid fa-network-wired"></i> ${escapeHtml(s.ip)}</div>
                    <div class="session-meta"><i class="fa-solid fa-clock"></i> Active ${timeAgo(s.lastActive)}</div>
                </div>
                <button class="session-logout-btn ${s.isCurrent ? 'current' : ''}"
                    onclick="logoutAdminSession('${s.sessionId}', ${s.isCurrent})">
                    <i class="fa-solid fa-right-from-bracket"></i>
                    ${s.isCurrent ? 'Log Out This Device' : 'Log Out'}
                </button>
            </div>
        `).join('');
    } catch (err) {
        console.error('Sessions fetch error:', err);
        grid.innerHTML = `<div class="empty-state error">Failed to load sessions.</div>`;
    }
}
window.fetchAdminSessions = fetchAdminSessions;

async function logoutAdminSession(sessionId, isCurrent) {
    const confirmMsg = isCurrent
        ? 'Log out this device? You will be returned to the login screen.'
        : 'Log out this device remotely?';

    const proceed = window.Swal
        ? (await Swal.fire({ title: 'Terminate session?', text: confirmMsg, icon: 'warning', showCancelButton: true, confirmButtonText: 'Yes, log out', confirmButtonColor: '#ef4444' })).isConfirmed
        : window.confirm(confirmMsg);
    if (!proceed) return;

    try {
        const res = await fetch(`/api/admin/sessions/logout/${encodeURIComponent(sessionId)}`, {
            method: 'POST', headers: SEC_AUTH_HEADERS()
        });
        const data = await res.json();
        if (!data.success) return showToast(data.message || 'Failed.', 'error');

        if (data.loggedOutCurrent) {
            window.location.replace('/admin/logout');
            return;
        }
        if (typeof showToast === 'function') showToast(data.message, 'success');
        fetchAdminSessions();
    } catch (err) {
        console.error('Logout session error:', err);
        if (typeof showToast === 'function') showToast('Server error.', 'error');
    }
}
window.logoutAdminSession = logoutAdminSession;

async function logoutOtherAdminSessions() {
    const proceed = window.Swal
        ? (await Swal.fire({ title: 'Log out all other devices?', text: 'This keeps you signed in here but revokes every other session.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Yes, log out others', confirmButtonColor: '#ef4444' })).isConfirmed
        : window.confirm('Log out all other devices?');
    if (!proceed) return;

    try {
        const res = await fetch('/api/admin/sessions/logout-others', { method: 'POST', headers: SEC_AUTH_HEADERS() });
        const data = await res.json();
        if (typeof showToast === 'function') showToast(data.message || 'Done.', data.success ? 'success' : 'error');
        fetchAdminSessions();
    } catch (err) {
        console.error('Logout others error:', err);
        if (typeof showToast === 'function') showToast('Server error.', 'error');
    }
}
window.logoutOtherAdminSessions = logoutOtherAdminSessions;

/* ---------- 12B.2 Security & Audit tabs ---------- */
let _auditActiveTab = 'tab-login-history';

function initAuditView() {
    setupAuditTabs();
    refreshAuditActiveTab();
}
window.initAuditView = initAuditView;

function setupAuditTabs() {
    const tabs = document.querySelectorAll('.audit-tab');
    tabs.forEach(tab => {
        if (tab._bound) return;
        tab._bound = true;
        tab.addEventListener('click', () => {
            const target = tab.getAttribute('data-audit-tab');
            _auditActiveTab = target;
            tabs.forEach(t => t.classList.toggle('active', t === tab));
            document.querySelectorAll('.audit-panel').forEach(p => {
                p.style.display = (p.id === target) ? 'block' : 'none';
            });
            refreshAuditActiveTab();
        });
    });
}

function refreshAuditActiveTab() {
    if (_auditActiveTab === 'tab-blacklist') fetchBlacklist();
    else fetchLoginHistory();
}
window.refreshAuditActiveTab = refreshAuditActiveTab;

async function fetchLoginHistory() {
    const body = document.getElementById('loginHistoryBody');
    if (!body) return;
    body.innerHTML = `<tr><td colspan="6" class="loading-container"><div class="spinner"></div><p>Loading login history...</p></td></tr>`;

    try {
        const res = await fetch('/api/admin/login-history?limit=150', { headers: SEC_AUTH_HEADERS() });
        const data = await res.json();
        const rows = data.success ? data.data : [];
        const summary = data.summary || {};

        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? '—'; };
        set('auditSuccessCount', summary.success);
        set('auditFailedCount', summary.failed);
        set('auditBlockedCount', summary.blocked);

        if (rows.length === 0) {
            body.innerHTML = `<tr><td colspan="6" class="loading-cell">No login activity recorded yet.</td></tr>`;
            return;
        }

        const statusBadge = (s) => {
            const map = {
                success: ['status-verified', 'Success'],
                failed: ['stock-out', 'Failed'],
                otp_failed: ['stock-out', 'OTP Failed'],
                otp_sent: ['stock-low', 'OTP Sent'],
                blocked: ['stock-out', 'Blocked']
            };
            const [cls, label] = map[s] || ['status-pending', s];
            return `<span class="status-badge ${cls}">${label}</span>`;
        };

        body.innerHTML = rows.map(r => `
            <tr>
                <td>${r.timestamp ? new Date(r.timestamp).toLocaleString('en-GB') : '—'}</td>
                <td>${escapeHtml(r.username)}</td>
                <td>${escapeHtml(r.ip)}</td>
                <td>${escapeHtml(r.location)}</td>
                <td>${escapeHtml(r.os)} · ${escapeHtml(r.browser)}</td>
                <td>${statusBadge(r.status)}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Login history error:', err);
        body.innerHTML = `<tr><td colspan="6" class="table-status-error">Server connection failed.</td></tr>`;
    }
}
window.fetchLoginHistory = fetchLoginHistory;

async function fetchBlacklist() {
    const body = document.getElementById('blacklistBody');
    if (!body) return;
    body.innerHTML = `<tr><td colspan="6" class="loading-container"><div class="spinner"></div><p>Loading blacklist...</p></td></tr>`;

    try {
        const res = await fetch('/api/admin/blacklist', { headers: SEC_AUTH_HEADERS() });
        const data = await res.json();
        const rows = data.success ? data.data : [];

        if (rows.length === 0) {
            body.innerHTML = `<tr><td colspan="6" class="loading-cell">No blocked IP addresses. Your firewall is clear.</td></tr>`;
            return;
        }

        body.innerHTML = rows.map(b => `
            <tr class="${b.active ? '' : 'row-muted'}">
                <td><b>${escapeHtml(b.ip)}</b></td>
                <td>${escapeHtml(b.reason)}</td>
                <td><span class="actor-badge ${b.source === 'auto' ? 'system' : 'admin'}">${b.source === 'auto' ? 'Auto (IDS)' : 'Manual'}</span></td>
                <td>${b.blockedAt ? new Date(b.blockedAt).toLocaleString('en-GB') : '—'}</td>
                <td>${b.permanent ? '<span class="status-badge stock-out">Permanent</span>' : formatDuration(b.expiresInMs)}</td>
                <td>
                    <button class="btn-unblock" onclick="removeBlacklist('${b.id}', '${escapeHtml(b.ip)}')">
                        <i class="fa-solid fa-unlock"></i> Unblock
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Blacklist fetch error:', err);
        body.innerHTML = `<tr><td colspan="6" class="table-status-error">Server connection failed.</td></tr>`;
    }
}
window.fetchBlacklist = fetchBlacklist;

async function submitBlacklist(e) {
    e.preventDefault();
    const ip = document.getElementById('blIpInput').value.trim();
    const reason = document.getElementById('blReasonInput').value.trim();
    const hours = document.getElementById('blDurationInput').value;
    if (!ip) return showToast('Please enter an IP address.', 'error');

    try {
        const res = await fetch('/api/admin/blacklist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...SEC_AUTH_HEADERS() },
            body: JSON.stringify({ ip, reason, hours })
        });
        const data = await res.json();
        if (typeof showToast === 'function') showToast(data.message || (data.success ? 'IP blocked.' : 'Failed.'), data.success ? 'success' : 'error');
        if (data.success) {
            document.getElementById('blacklistAddForm').reset();
            fetchBlacklist();
        }
    } catch (err) {
        console.error('Add blacklist error:', err);
        if (typeof showToast === 'function') showToast('Server error.', 'error');
    }
}

async function removeBlacklist(id, ip) {
    const proceed = window.Swal
        ? (await Swal.fire({ title: `Unblock ${ip}?`, text: 'This IP will be able to reach the admin login again.', icon: 'question', showCancelButton: true, confirmButtonText: 'Yes, unblock' })).isConfirmed
        : window.confirm(`Unblock ${ip}?`);
    if (!proceed) return;

    try {
        const res = await fetch(`/api/admin/blacklist/${encodeURIComponent(id)}`, { method: 'DELETE', headers: SEC_AUTH_HEADERS() });
        const data = await res.json();
        if (typeof showToast === 'function') showToast(data.message || 'Done.', data.success ? 'success' : 'error');
        fetchBlacklist();
    } catch (err) {
        console.error('Remove blacklist error:', err);
        if (typeof showToast === 'function') showToast('Server error.', 'error');
    }
}
window.removeBlacklist = removeBlacklist;

// Bind the manual-blacklist form once the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const blForm = document.getElementById('blacklistAddForm');
    if (blForm) blForm.addEventListener('submit', submitBlacklist);
});


/* ==========================================================================
   SECTION 13: ADMIN SETTINGS & SYSTEM INITIALIZATION (সেটিংস ও সিস্টেম বুট)
   ========================================================================== */

/**
 * ১৩.১ক: অ্যাডমিন সেটিংস লোড ও UI-তে প্রয়োগ
 */
function applyAdminSettingsToUI(settings) {
    if (!settings) return;

    adminPlatformTimezone = settings.timezone || 'Asia/Dhaka';
    adminCurrencySymbol = settings.currencySymbol || '৳';

    const setVal = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined && val !== null) el.value = val; };
    setVal('settingsDisplayName', settings.displayName);
    setVal('settingsUsername', settings.username);
    setVal('settingsStoreName', settings.storeName);
    setVal('settingsCurrency', settings.currency);
    setVal('settingsCurrencySymbol', settings.currencySymbol);
    setVal('settingsTimezone', settings.timezone);

    const storeNameEl = document.getElementById('sidebarStoreName');
    if (storeNameEl) storeNameEl.textContent = settings.storeName || 'EonlineBazar';

    const sidebarName = document.querySelector('.admin-profile .info h4');
    if (sidebarName && settings.displayName) sidebarName.textContent = settings.displayName;

    applyBrandingPreviewFromSettings(settings);
    startLiveClock();
}

const brandingPreviewObjectUrls = { logo: null, favicon: null };

function normalizeBrandingUrl(url) {
    if (!url) return '';
    if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
        return url;
    }
    return url.replace(/^\/images\/branding\//, '/uploads/branding/');
}

function cacheBustBrandingUrl(url) {
    const resolved = normalizeBrandingUrl(url);
    if (!resolved || resolved.startsWith('blob:') || resolved.startsWith('data:')) return resolved;
    return resolved.includes('?') ? `${resolved}&t=${Date.now()}` : `${resolved}?t=${Date.now()}`;
}

function revokeBrandingObjectUrl(assetType) {
    if (brandingPreviewObjectUrls[assetType]) {
        URL.revokeObjectURL(brandingPreviewObjectUrls[assetType]);
        brandingPreviewObjectUrls[assetType] = null;
    }
}

function setBrandingPreviewImage(assetType, url) {
    const isLogo = assetType === 'logo';
    const img = document.getElementById(isLogo ? 'settingsLogoPreview' : 'settingsFaviconPreview');
    const ph = document.getElementById(isLogo ? 'settingsLogoPlaceholder' : 'settingsFaviconPlaceholder');
    if (!img) return;

    if (!url) {
        img.removeAttribute('src');
        img.style.display = 'none';
        if (ph) ph.style.display = 'flex';
        if (isLogo) updateSidebarStoreLogo(null);
        return;
    }

    const resolved = (url.startsWith('blob:') || url.startsWith('data:'))
        ? url
        : cacheBustBrandingUrl(url);

    img.onerror = () => {
        img.style.display = 'none';
        if (ph) ph.style.display = 'flex';
        if (isLogo) updateSidebarStoreLogo(null);
    };
    img.onload = () => {
        img.style.display = 'block';
        if (ph) ph.style.display = 'none';
    };
    if (isLogo) updateSidebarStoreLogo(resolved);
    img.src = resolved;
}

function updateSidebarStoreLogo(url) {
    const sidebarLogo = document.getElementById('sidebarStoreLogo');
    const sidebarDefault = document.getElementById('sidebarDefaultLogo');
    const sidebarIcon = document.getElementById('sidebarStoreIcon');
    const sidebarName = document.getElementById('sidebarStoreName');
    const brandLogo = document.getElementById('sidebarBrandLogo');

    if (url) {
        const bust = cacheBustBrandingUrl(url);
        if (sidebarLogo) {
            sidebarLogo.src = bust;
            sidebarLogo.style.display = 'block';
        }
        if (sidebarDefault) sidebarDefault.style.display = 'none';
        if (sidebarIcon) sidebarIcon.style.display = 'none';
        if (sidebarName) sidebarName.style.display = '';
        if (brandLogo) brandLogo.classList.add('has-custom-logo');
        return;
    }

    if (sidebarLogo) {
        sidebarLogo.removeAttribute('src');
        sidebarLogo.style.display = 'none';
    }
    if (sidebarDefault) sidebarDefault.style.display = 'block';
    if (sidebarIcon) sidebarIcon.style.display = 'none';
    if (sidebarName) sidebarName.style.display = 'none';
    if (brandLogo) brandLogo.classList.remove('has-custom-logo');
}

function updateSiteFaviconLink(url) {
    const href = cacheBustBrandingUrl(url || '/images/favicon.png');
    let faviconLink = document.getElementById('adminFavicon')
        || document.getElementById('siteFavicon')
        || document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');

    if (!faviconLink) {
        faviconLink = document.createElement('link');
        faviconLink.id = 'adminFavicon';
        faviconLink.rel = 'icon';
        document.head.appendChild(faviconLink);
    }

    faviconLink.href = href;
    faviconLink.type = href.endsWith('.ico') ? 'image/x-icon' : 'image/png';
}

function applyBrandingPreviewFromSettings(settings) {
    if (settings.logoUrl) {
        setBrandingPreviewImage('logo', settings.logoUrl);
    } else {
        setBrandingPreviewImage('logo', null);
    }

    if (settings.faviconUrl) {
        setBrandingPreviewImage('favicon', settings.faviconUrl);
        updateSiteFaviconLink(settings.faviconUrl);
    } else {
        setBrandingPreviewImage('favicon', null);
    }
}

async function fetchAdminSettings() {
    try {
        const [platformRes, deliveryRes] = await Promise.all([
            fetch('/api/admin/platform-settings', {
                headers: { 'Authorization': `Bearer ${token}` }
            }),
            fetch('/api/admin/settings', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
        ]);

        const platformData = await platformRes.json();
        if (platformData.success && platformData.data) applyAdminSettingsToUI(platformData.data);

        const deliveryData = await deliveryRes.json();
        if (deliveryData.success && deliveryData.data) applyDeliverySettingsToUI(deliveryData.data);
    } catch (err) {
        console.error('Failed to load admin settings:', err);
    }
    // Load 2FA status/config for the settings panel
    if (typeof window.refreshTwoFactorSettings === 'function') window.refreshTwoFactorSettings();
}

async function saveAdminProfile(payload) {
    const res = await fetch('/api/admin/profile', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
    });
    return res.json();
}

async function saveAdminSettings(payload) {
    const res = await fetch('/api/admin/platform-settings', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
    });
    return res.json();
}

function populateDistrictSelect(selectEl, selectedValue = '') {
    if (!selectEl || !Array.isArray(window.BANGLADESH_DISTRICTS)) return;

    const current = String(selectedValue || selectEl.value || '').trim();
    selectEl.innerHTML = '<option value="">Select district</option>';
    window.BANGLADESH_DISTRICTS.forEach((district) => {
        const option = document.createElement('option');
        option.value = district;
        option.textContent = district;
        selectEl.appendChild(option);
    });

    if (current) selectEl.value = current;
}

function populateShopHomeCityOptions(selectedValue = '') {
    populateDistrictSelect(document.getElementById('settingsShopHomeCity'), selectedValue);
}

function applyDeliverySettingsToUI(settings) {
    if (!settings) return;

    populateShopHomeCityOptions(settings.shopHomeCity || 'Dhaka');

    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el && val !== undefined && val !== null) el.value = val;
    };

    setVal('settingsShopHomeCity', settings.shopHomeCity || 'Dhaka');
    setVal('settingsDeliveryInsideCity', settings.deliveryInsideCity);
    setVal('settingsDeliveryOutsideCity', settings.deliveryOutsideCity);
    setVal('settingsFreeShippingMinAmount', settings.freeShippingMinAmount);
}

async function saveDeliverySettings(payload) {
    const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
    });
    return res.json();
}

function applyMasterSettingsToUI(settings) {
    if (!settings) return;

    cacheAdminRewardSettings(settings);

    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el && val !== undefined && val !== null) el.value = val;
    };

    setVal('masterCashbackPercentage', settings.cashbackPercentage);
    setVal('masterTakaToPointsRatio', settings.takaToPointsRatio);
    setVal('masterPointsConversionRate', settings.pointsToTakaConversionRate);
    setVal('masterRefundUndoWindow', settings.refundUndoWindowHours);
    setVal('masterFreeShippingThreshold', settings.freeShippingThreshold);
    setVal('vipMinTotalSpent', settings.vipMinTotalSpent);
    setVal('vipMinOrderCount', settings.vipMinOrderCount);
    setVal('frequentBuyerMinOrders', settings.frequentBuyerMinOrders);

    applyFlashSaleSettingsToUI(settings);
    applyAnnouncementSettingsToUI(settings);
    applySmsSettingsToUI(settings);
    applyCourierSettingsToUI(settings);
    applyWhatsAppSettingsToUI(settings);
    updateMasterSettingsPreview();
}

function applyWhatsAppSettingsToUI(settings) {
    if (!settings) return;

    const publicEl = document.getElementById('publicSupportWhatsApp');
    if (publicEl && settings.publicSupportWhatsApp !== undefined) {
        publicEl.value = settings.publicSupportWhatsApp || '';
    }

    const privateEl = document.getElementById('privateAdminAlertWhatsApp');
    if (privateEl && settings.privateAdminAlertWhatsApp !== undefined) {
        privateEl.value = settings.privateAdminAlertWhatsApp || '';
    }

    const alertsToggle = document.getElementById('enableWhatsAppOrderAlerts');
    if (alertsToggle && settings.enableWhatsAppOrderAlerts !== undefined) {
        alertsToggle.checked = settings.enableWhatsAppOrderAlerts === true;
    }

    const providerEl = document.getElementById('whatsAppAlertProvider');
    if (providerEl && settings.whatsAppAlertProvider !== undefined) {
        providerEl.value = settings.whatsAppAlertProvider || '';
    }

    const apiKeyEl = document.getElementById('whatsAppAlertApiKey');
    if (apiKeyEl && settings.whatsAppAlertApiKey !== undefined) {
        apiKeyEl.value = settings.whatsAppAlertApiKey || '';
    }

    const instanceEl = document.getElementById('whatsAppAlertInstanceId');
    if (instanceEl && settings.whatsAppAlertInstanceId !== undefined) {
        instanceEl.value = settings.whatsAppAlertInstanceId || '';
    }

    updateWhatsAppSettingsPreview();
}

function updateWhatsAppSettingsPreview() {
    const previewEl = document.getElementById('whatsappSettingsPreviewText');
    if (!previewEl) return;

    const publicNumber = document.getElementById('publicSupportWhatsApp')?.value?.trim() || '';
    const privateNumber = document.getElementById('privateAdminAlertWhatsApp')?.value?.trim() || '';
    const alertsEnabled = document.getElementById('enableWhatsAppOrderAlerts')?.checked === true;
    const provider = document.getElementById('whatsAppAlertProvider')?.value || '';
    const hasApiKey = Boolean(document.getElementById('whatsAppAlertApiKey')?.value?.trim());

    if (!publicNumber && !privateNumber) {
        previewEl.textContent = 'Add a public customer number for storefront chat and a private admin number for order alerts.';
        return;
    }

    const publicLabel = publicNumber
        ? `Public chat: +${publicNumber.replace(/^88?/, '')} (live on storefront)`
        : 'Public chat: not set — storefront button will use the default fallback';
    const gatewayLabel = provider && hasApiKey
        ? `Auto-send via ${provider}`
        : 'No gateway — wa.me fallback badge in admin header when orders arrive';
    const alertLabel = alertsEnabled
        ? (privateNumber
            ? `Order alerts ON → private line …${privateNumber.slice(-4)} · ${gatewayLabel}`
            : 'Order alerts ON — add the private admin number to receive alerts')
        : 'Order alerts OFF';

    previewEl.textContent = `${publicLabel} · ${alertLabel}`;
}

function applyCourierSettingsToUI(settings) {
    if (!settings) return;

    cacheAdminCourierSettings(settings);

    const providerEl = document.getElementById('defaultCourierProvider');
    if (providerEl && settings.defaultCourierProvider !== undefined) {
        providerEl.value = settings.defaultCourierProvider || '';
    }

    const apiKeyEl = document.getElementById('courierApiKey');
    if (apiKeyEl && settings.courierApiKey !== undefined) {
        apiKeyEl.value = settings.courierApiKey || '';
    }

    const secretKeyEl = document.getElementById('courierSecretKey');
    if (secretKeyEl && settings.courierSecretKey !== undefined) {
        secretKeyEl.value = settings.courierSecretKey || '';
    }

    updateCourierSettingsPreview();
}

function updateCourierSettingsPreview() {
    const previewEl = document.getElementById('courierSettingsPreviewText');
    if (!previewEl) return;

    const provider = document.getElementById('defaultCourierProvider')?.value || '';
    const hasApiKey = Boolean(document.getElementById('courierApiKey')?.value?.trim());
    const hasSecretKey = Boolean(document.getElementById('courierSecretKey')?.value?.trim());

    if (!provider) {
        previewEl.textContent = 'No provider selected — pick one to label the booking button in Live Orders.';
        return;
    }

    if (!hasApiKey || !hasSecretKey) {
        const missing = !hasApiKey && !hasSecretKey
            ? 'API key and secret key'
            : (!hasApiKey ? 'API key' : 'secret key');
        previewEl.textContent = `${provider} selected — add the ${missing} to enable one-click booking.`;
        return;
    }

    previewEl.textContent = provider === 'Steadfast'
        ? 'Steadfast ready — "Send to Steadfast" is live on every unbooked order in Live Orders.'
        : `${provider} credentials saved — automated booking currently supports Steadfast only.`;
}

function applySmsSettingsToUI(settings) {
    if (!settings) return;

    const smsToggle = document.getElementById('enableSmsNotifications');
    if (smsToggle && settings.enableSmsNotifications !== undefined) {
        smsToggle.checked = settings.enableSmsNotifications === true;
    }

    const providerEl = document.getElementById('smsGatewayProvider');
    if (providerEl && settings.smsGatewayProvider !== undefined) {
        providerEl.value = settings.smsGatewayProvider || '';
    }

    const apiKeyEl = document.getElementById('smsApiKey');
    if (apiKeyEl && settings.smsApiKey !== undefined) {
        apiKeyEl.value = settings.smsApiKey || '';
    }

    const senderEl = document.getElementById('smsSenderId');
    if (senderEl && settings.smsSenderId !== undefined) {
        senderEl.value = settings.smsSenderId || '';
    }

    updateSmsSettingsPreview();
}

function updateSmsSettingsPreview() {
    const previewEl = document.getElementById('smsSettingsPreviewText');
    if (!previewEl) return;

    const enabled = document.getElementById('enableSmsNotifications')?.checked === true;
    const provider = document.getElementById('smsGatewayProvider')?.value || '';
    const hasKey = Boolean(document.getElementById('smsApiKey')?.value?.trim());
    const senderId = document.getElementById('smsSenderId')?.value?.trim() || 'EOBAZAR';

    if (!enabled) {
        previewEl.textContent = 'Disabled — enable the toggle to send order and status SMS.';
        return;
    }

    if (!provider || !hasKey) {
        previewEl.textContent = 'Enabled — select a gateway provider and enter your API key to go live.';
        return;
    }

    previewEl.textContent = `Enabled — ${provider} · Sender: ${senderId} · credentials loaded from Master Settings.`;
}

function applyFlashSaleSettingsToUI(settings) {
    if (!settings) return;

    const enabledEl = document.getElementById('flashSaleEnabled');
    if (enabledEl) enabledEl.checked = settings.flashSaleEnabled === true;

    const titleEl = document.getElementById('flashSaleTitle');
    if (titleEl && settings.flashSaleTitle !== undefined) titleEl.value = settings.flashSaleTitle || '';

    const discountEl = document.getElementById('flashSaleDiscountPercent');
    if (discountEl && settings.flashSaleDiscountPercent !== undefined) {
        discountEl.value = settings.flashSaleDiscountPercent;
    }

    const productsEl = document.getElementById('flashSaleProductIds');
    if (productsEl && Array.isArray(settings.flashSaleProductIds)) {
        productsEl.value = settings.flashSaleProductIds.join(', ');
    }

    const endDateEl = document.getElementById('flashSaleEndDate');
    const endTimeEl = document.getElementById('flashSaleEndTime');
    if (settings.flashSaleEndDate || settings.endsAt) {
        const end = new Date(settings.flashSaleEndDate || settings.endsAt);
        if (!Number.isNaN(end.getTime())) {
            if (endDateEl) endDateEl.value = end.toISOString().slice(0, 10);
            if (endTimeEl) endTimeEl.value = end.toTimeString().slice(0, 5);
        }
    }

    updateFlashSaleSettingsPreview();
}

function updateFlashSaleSettingsPreview() {
    const previewEl = document.getElementById('flashSaleSettingsPreviewText');
    if (!previewEl) return;

    const enabled = document.getElementById('flashSaleEnabled')?.checked === true;
    const title = document.getElementById('flashSaleTitle')?.value?.trim() || 'Flash Sale';
    const discount = Number(document.getElementById('flashSaleDiscountPercent')?.value || 0);
    const endDate = document.getElementById('flashSaleEndDate')?.value;
    const endTime = document.getElementById('flashSaleEndTime')?.value || '23:59';
    const productCount = (document.getElementById('flashSaleProductIds')?.value || '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean).length;

    if (!enabled) {
        previewEl.textContent = 'Flash sale is currently inactive.';
        return;
    }

    if (!endDate || discount <= 0 || productCount === 0) {
        previewEl.textContent = `${title} enabled — add end date, discount, and at least one product ID to go live.`;
        return;
    }

    previewEl.textContent = `${title} · ${discount}% off · ${productCount} product(s) · ends ${endDate} ${endTime}`;
}

function applyAnnouncementSettingsToUI(settings) {
    if (!settings) return;

    const textEl = document.getElementById('announcementText');
    const activeEl = document.getElementById('isAnnouncementActive');

    if (textEl && settings.announcementText !== undefined) {
        textEl.value = settings.announcementText || '';
    }
    if (activeEl && settings.isAnnouncementActive !== undefined) {
        activeEl.checked = settings.isAnnouncementActive !== false;
    }

    updateAnnouncementSettingsPreview();
}

/**
 * Mirrors the server's announcement builder so the admin sees the exact
 * sentence customers will get before saving.
 */
function buildAnnouncementPreviewText() {
    const threshold = Number(document.getElementById('masterFreeShippingThreshold')?.value || 0);
    const cashback = Number(document.getElementById('masterCashbackPercentage')?.value || 0);
    const takaPerPoint = Number(document.getElementById('masterTakaToPointsRatio')?.value || 0);

    const shippingSentence = threshold > 0
        ? `Enjoy Free Shipping on orders over ৳${threshold.toLocaleString('en-US')}!`
        : 'Enjoy Free Shipping on every order!';

    const perks = [];
    if (cashback > 0) perks.push(`${cashback}% cashback straight to your wallet`);
    if (takaPerPoint > 0) perks.push(`1 loyalty point for every ৳${takaPerPoint.toLocaleString('en-US')} you spend`);

    return perks.length === 0
        ? shippingSentence
        : `${shippingSentence} Earn ${perks.join(' and ')}.`;
}

function updateAnnouncementSettingsPreview() {
    const previewEl = document.getElementById('announcementSettingsPreviewText');
    if (!previewEl) return;

    const isActive = document.getElementById('isAnnouncementActive')?.checked !== false;
    const customText = document.getElementById('announcementText')?.value?.trim() || '';

    if (!isActive) {
        previewEl.textContent = 'Announcement hidden from customer dashboard.';
        return;
    }

    previewEl.textContent = customText || buildAnnouncementPreviewText();
}

function updateMasterSettingsPreview() {
    const previewEl = document.getElementById('masterSettingsPreviewText');

    // The announcement copy quotes the cashback and points rates, so it has to
    // refresh whenever the rewards fields change too.
    updateAnnouncementSettingsPreview();
    updateSmsSettingsPreview();
    updateCourierSettingsPreview();
    updateWhatsAppSettingsPreview();
    if (!previewEl) return;

    const cashback = Number(document.getElementById('masterCashbackPercentage')?.value || 0);
    const takaRatio = Number(document.getElementById('masterTakaToPointsRatio')?.value || 100);
    const conversion = Number(document.getElementById('masterPointsConversionRate')?.value || 0);
    const refundHours = Number(document.getElementById('masterRefundUndoWindow')?.value || 0);
    const threshold = Number(document.getElementById('masterFreeShippingThreshold')?.value || 0);

    const pointsPerThousand = takaRatio > 0 ? (1000 / takaRatio).toFixed(2) : '0';
    let shippingNote = 'free shipping on every order';
    if (threshold > 0) {
        const thresholdLabel = `৳${threshold.toLocaleString('en-US')}`;
        shippingNote = 1000 >= threshold
            ? `free shipping (meets ${thresholdLabel} threshold)`
            : `shipping charged (${thresholdLabel} threshold not met)`;
    }
    previewEl.textContent =
        `৳1,000 order → ${cashback}% cashback (৳${(1000 * cashback / 100).toFixed(0)}) + ~${pointsPerThousand} pts · 100 pts → ৳${conversion} · Refund undo: ${refundHours}h · ${shippingNote}`;
}

async function fetchMasterSettings() {
    try {
        const res = await fetch('/api/admin/master-settings', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success && data.data) {
            applyMasterSettingsToUI(data.data);
        } else {
            showToast(data.message || 'Failed to load master settings.', 'error');
        }
    } catch (err) {
        console.error('Failed to load master settings:', err);
        showToast('Error: Could not load master settings.', 'error');
    }
}

async function saveMasterSettings(payload) {
    const res = await fetch('/api/admin/master-settings/update', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
    });
    return res.json();
}

async function saveStoreBrandingForm(form) {
    const formData = new FormData(form);
    const logoFile = formData.get('logo');
    const faviconFile = formData.get('favicon');
    const hasLogo = logoFile instanceof File && logoFile.size > 0;
    const hasFavicon = faviconFile instanceof File && faviconFile.size > 0;

    if (!hasLogo && !hasFavicon) {
        showToast('Please choose a logo or favicon before saving.', 'warning');
        return;
    }

    const saveBtn = form.querySelector('button[type="submit"]');
    const restore = setButtonLoading(saveBtn, 'Saving...');

    try {
        const res = await fetch('/api/admin/upload-branding', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        let result;
        try {
            result = await res.json();
        } catch (parseErr) {
            throw new Error('Invalid server response.');
        }

        if (result.success) {
            showToast('Success: Store Branding updated successfully!', 'success');
            if (result.logoUrl) applyBrandingAsset('logo', result.logoUrl);
            if (result.faviconUrl) applyBrandingAsset('favicon', result.faviconUrl);
            window.__STORE_SETTINGS__ = {
                ...(window.__STORE_SETTINGS__ || {}),
                storeName: document.getElementById('settingsStoreName')?.value?.trim() || window.__STORE_SETTINGS__?.storeName || 'EonlineBazar',
                logoPath: result.logoUrl || window.__STORE_SETTINGS__?.logoPath || '',
                faviconPath: result.faviconUrl || window.__STORE_SETTINGS__?.faviconPath || '/images/favicon.png',
                logoUrl: result.logoUrl || window.__STORE_SETTINGS__?.logoUrl || '',
                faviconUrl: result.faviconUrl || window.__STORE_SETTINGS__?.faviconUrl || '/images/favicon.png',
                storeLogo: result.logoUrl || window.__STORE_SETTINGS__?.storeLogo || '',
                v: Date.now()
            };
            if (typeof window.notifyStoreBrandingUpdated === 'function') {
                window.notifyStoreBrandingUpdated();
            }
            if (typeof window.refreshStoreBranding === 'function') window.refreshStoreBranding();
            form.reset();
        } else {
            showToast(`Error: ${result.message || 'Failed to upload store branding.'}`, 'error');
            fetchAdminSettings();
        }
    } catch (err) {
        console.error('Store branding upload error:', err);
        showToast('Error: Could not reach the server. Please try again.', 'error');
        fetchAdminSettings();
    } finally {
        restore();
    }
}
window.saveStoreBranding = () => {
    const form = document.getElementById('storeBrandingForm');
    if (form) saveStoreBrandingForm(form);
};

/**
 * Handles a logo/favicon file selection: validates it and shows an instant local preview.
 */
function previewBrandingFile(input, assetType, label) {
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast(`Error: Please choose a valid image file for the ${label}.`, 'error');
        input.value = '';
        return;
    }

    showLocalBrandingPreview(assetType, file);
    showToast(`${label} ready — click "Save Store Branding" to publish it.`, 'info');
}

/**
 * বাটনকে সাময়িকভাবে লোডিং অবস্থায় নিয়ে যায় ("Saving..." + স্পিনার + disabled)
 * @returns {Function} restore() — বাটনকে আগের অবস্থায় ফিরিয়ে আনে
 */
function setButtonLoading(btn, loadingText = 'Saving...') {
    if (!btn) return () => {};
    const originalHTML = btn.innerHTML;
    const wasDisabled = btn.disabled;
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${loadingText}`;
    return () => {
        btn.disabled = wasDisabled;
        btn.classList.remove('is-loading');
        btn.innerHTML = originalHTML;
    };
}

/**
 * নতুন লোগো/ফ্যাভিকন URL সঙ্গে সঙ্গে পুরো DOM-এ প্রয়োগ করে (রিফ্রেশ ছাড়াই)
 */
function applyBrandingAsset(assetType, url) {
    if (!url) return;

    if (assetType === 'logo') {
        setBrandingPreviewImage('logo', url);
    } else if (assetType === 'favicon') {
        setBrandingPreviewImage('favicon', url);
        updateSiteFaviconLink(url);
    }
}

/**
 * ফাইল সিলেক্ট করার সঙ্গে সঙ্গে লোকাল প্রিভিউ দেখায় (আপলোডের আগেই)
 */
function showLocalBrandingPreview(assetType, file) {
    revokeBrandingObjectUrl(assetType);
    const objectUrl = URL.createObjectURL(file);
    brandingPreviewObjectUrls[assetType] = objectUrl;
    setBrandingPreviewImage(assetType, objectUrl);
}

function setupAdminSettingsForms() {
    populateShopHomeCityOptions();

    [
        'masterCashbackPercentage',
        'masterTakaToPointsRatio',
        'masterPointsConversionRate',
        'masterRefundUndoWindow',
        'masterFreeShippingThreshold',
        'announcementText',
        'isAnnouncementActive',
        'enableSmsNotifications',
        'smsGatewayProvider',
        'smsApiKey',
        'smsSenderId',
        'defaultCourierProvider',
        'courierApiKey',
        'courierSecretKey',
        'publicSupportWhatsApp',
        'privateAdminAlertWhatsApp',
        'enableWhatsAppOrderAlerts',
        'whatsAppAlertProvider',
        'whatsAppAlertApiKey',
        'whatsAppAlertInstanceId',
        'flashSaleTitle',
        'flashSaleEndDate',
        'flashSaleEndTime',
        'flashSaleDiscountPercent',
        'flashSaleProductIds',
        'vipMinTotalSpent',
        'vipMinOrderCount',
        'frequentBuyerMinOrders'
    ].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', updateMasterSettingsPreview);
        if (el.type === 'checkbox' || el.tagName === 'SELECT') {
            el.addEventListener('change', updateMasterSettingsPreview);
        }
    });

    const flashEnabledEl = document.getElementById('flashSaleEnabled');
    if (flashEnabledEl) {
        flashEnabledEl.addEventListener('change', updateFlashSaleSettingsPreview);
    }

    // One form, one save action: announcement, free shipping, rewards and the
    // refund window all travel to /api/admin/master-settings/update together.
    const masterForm = document.getElementById('masterSettingsForm');
    if (masterForm) {
        masterForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const payload = {
                announcementText: document.getElementById('announcementText')?.value?.trim() || '',
                isAnnouncementActive: document.getElementById('isAnnouncementActive')?.checked !== false,
                enableSmsNotifications: document.getElementById('enableSmsNotifications')?.checked === true,
                smsGatewayProvider: document.getElementById('smsGatewayProvider')?.value || '',
                smsApiKey: document.getElementById('smsApiKey')?.value?.trim() || '',
                smsSenderId: document.getElementById('smsSenderId')?.value?.trim() || '',
                defaultCourierProvider: document.getElementById('defaultCourierProvider')?.value || '',
                courierApiKey: document.getElementById('courierApiKey')?.value?.trim() || '',
                courierSecretKey: document.getElementById('courierSecretKey')?.value?.trim() || '',
                publicSupportWhatsApp: document.getElementById('publicSupportWhatsApp')?.value?.trim() || '',
                privateAdminAlertWhatsApp: document.getElementById('privateAdminAlertWhatsApp')?.value?.trim() || '',
                enableWhatsAppOrderAlerts: document.getElementById('enableWhatsAppOrderAlerts')?.checked === true,
                whatsAppAlertProvider: document.getElementById('whatsAppAlertProvider')?.value || '',
                whatsAppAlertApiKey: document.getElementById('whatsAppAlertApiKey')?.value?.trim() || '',
                whatsAppAlertInstanceId: document.getElementById('whatsAppAlertInstanceId')?.value?.trim() || '',
                freeShippingThreshold: document.getElementById('masterFreeShippingThreshold')?.value,
                cashbackPercentage: document.getElementById('masterCashbackPercentage')?.value,
                takaToPointsRatio: document.getElementById('masterTakaToPointsRatio')?.value,
                pointsToTakaConversionRate: document.getElementById('masterPointsConversionRate')?.value,
                refundUndoWindowHours: document.getElementById('masterRefundUndoWindow')?.value,
                flashSaleEnabled: document.getElementById('flashSaleEnabled')?.checked === true,
                flashSaleTitle: document.getElementById('flashSaleTitle')?.value?.trim() || 'Flash Sale',
                flashSaleEndDate: document.getElementById('flashSaleEndDate')?.value || '',
                flashSaleEndTime: document.getElementById('flashSaleEndTime')?.value || '23:59',
                flashSaleDiscountPercent: document.getElementById('flashSaleDiscountPercent')?.value,
                flashSaleProductIds: document.getElementById('flashSaleProductIds')?.value || '',
                vipMinTotalSpent: document.getElementById('vipMinTotalSpent')?.value,
                vipMinOrderCount: document.getElementById('vipMinOrderCount')?.value,
                frequentBuyerMinOrders: document.getElementById('frequentBuyerMinOrders')?.value
            };

            const submitBtn = document.getElementById('masterSettingsSaveBtn');
            const restore = setButtonLoading(submitBtn, 'Saving...');
            try {
                const result = await saveMasterSettings(payload);
                if (result.success) {
                    showToast('Success: Master settings saved across store, checkout & dashboard!', 'success');
                    if (result.data) applyMasterSettingsToUI(result.data);
                    // The delivery card shares the free-shipping threshold.
                    fetchAdminSettings();
                } else {
                    showToast(`Error: ${result.message || 'Failed to save master settings.'}`, 'error');
                }
            } catch (err) {
                console.error('Save master settings error:', err);
                showToast('Error: Could not reach the server. Please try again.', 'error');
            } finally {
                restore();
            }
        });
    }

    const profileForm = document.getElementById('adminProfileForm');
    if (profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const displayName = document.getElementById('settingsDisplayName')?.value?.trim();
            const username = document.getElementById('settingsUsername')?.value?.trim();
            const currentPassword = document.getElementById('settingsCurrentPassword')?.value;
            const newPassword = document.getElementById('settingsNewPassword')?.value;

            if (!currentPassword) {
                return showToast('Error: Current password is required to save changes.', 'warning');
            }

            const submitBtn = profileForm.querySelector('button[type="submit"]');
            const restore = setButtonLoading(submitBtn, 'Saving...');
            try {
                const result = await saveAdminProfile({
                    displayName,
                    username,
                    currentPassword,
                    ...(newPassword ? { newPassword } : {})
                });

                if (result.success) {
                    showToast('Success: Admin Profile updated successfully!', 'success');
                    if (result.data) applyAdminSettingsToUI(result.data);
                    document.getElementById('settingsCurrentPassword').value = '';
                    document.getElementById('settingsNewPassword').value = '';

                    // Changing the username or password invalidates this token —
                    // the server already revoked every session, so sign back in.
                    if (result.requireRelogin) {
                        showToast(result.message || 'Please sign in again with your new credentials.', 'info');
                        setTimeout(() => { window.location.href = '/admin/logout'; }, 1800);
                    }
                } else {
                    showToast(`Error: ${result.message || 'Failed to update profile.'}`, 'error');
                }
            } catch (err) {
                console.error('Save profile error:', err);
                showToast('Error: Could not reach the server. Please try again.', 'error');
            } finally {
                restore();
            }
        });
    }

    const platformForm = document.getElementById('platformSettingsForm');
    if (platformForm) {
        platformForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const currentPassword = document.getElementById('platformCurrentPassword')?.value;
            if (!currentPassword) return showToast('Error: Current password is required to save changes.', 'warning');

            const submitBtn = platformForm.querySelector('button[type="submit"]');
            const restore = setButtonLoading(submitBtn, 'Saving...');
            try {
                const result = await saveAdminSettings({
                    currentPassword,
                    storeName: document.getElementById('settingsStoreName')?.value?.trim(),
                    currency: document.getElementById('settingsCurrency')?.value?.trim(),
                    currencySymbol: document.getElementById('settingsCurrencySymbol')?.value?.trim(),
                    timezone: document.getElementById('settingsTimezone')?.value
                });

                if (result.success) {
                    showToast('Success: Platform preferences saved!', 'success');
                    applyAdminSettingsToUI(result.data);
                    document.getElementById('platformCurrentPassword').value = '';

                    if (result.requireRelogin) {
                        showToast(result.message || 'Please sign in again with your new credentials.', 'info');
                        setTimeout(() => { window.location.href = '/admin/logout'; }, 1800);
                    }
                } else {
                    showToast(`Error: ${result.message || 'Failed to save platform settings.'}`, 'error');
                }
            } catch (err) {
                console.error('Save platform settings error:', err);
                showToast('Error: Could not reach the server. Please try again.', 'error');
            } finally {
                restore();
            }
        });
    }

    const deliveryForm = document.getElementById('deliverySettingsForm');
    if (deliveryForm) {
        deliveryForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const shopHomeCity = document.getElementById('settingsShopHomeCity')?.value;
            const deliveryInsideCity = document.getElementById('settingsDeliveryInsideCity')?.value;
            const deliveryOutsideCity = document.getElementById('settingsDeliveryOutsideCity')?.value;
            const freeShippingMinAmount = document.getElementById('settingsFreeShippingMinAmount')?.value;

            const submitBtn = deliveryForm.querySelector('button[type="submit"]');
            const restore = setButtonLoading(submitBtn, 'Saving...');
            try {
                const result = await saveDeliverySettings({
                    shopHomeCity,
                    deliveryInsideCity,
                    deliveryOutsideCity,
                    freeShippingMinAmount
                });

                if (result.success) {
                    showToast('Success: Delivery settings saved successfully!', 'success');
                    if (result.data) applyDeliverySettingsToUI(result.data);
                    // Master Settings shares the free-shipping threshold.
                    fetchMasterSettings();
                } else {
                    showToast(`Error: ${result.message || 'Failed to save delivery settings.'}`, 'error');
                }
            } catch (err) {
                console.error('Save delivery settings error:', err);
                showToast('Error: Could not reach the server. Please try again.', 'error');
            } finally {
                restore();
            }
        });
    }

    const brandingForm = document.getElementById('storeBrandingForm');
    if (brandingForm) {
        brandingForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveStoreBrandingForm(brandingForm);
        });
    }

    const logoInput = document.getElementById('settingsLogoInput');
    if (logoInput) {
        logoInput.addEventListener('change', () => previewBrandingFile(logoInput, 'logo', 'Store logo'));
    }

    const favInput = document.getElementById('settingsFaviconInput');
    if (favInput) {
        favInput.addEventListener('change', () => previewBrandingFile(favInput, 'favicon', 'Favicon'));
    }
}

/**
 * ১৩.১: অ্যাডমিন প্রোফাইল পিকচার লাইভ প্রিভিউ ও সার্ভারে আপলোড
 * @param {Event} event - ফাইল ইনপুট ইভেন্ট
 */
window.uploadAdminProfilePic = async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    // লোকাল প্রিভিউ দেখানো
    const reader = new FileReader();
    reader.onload = function(e) {
        const profileImg = document.getElementById('adminProfileImg');
        const headerImg = document.getElementById('headerProfileImg');
        if (profileImg) profileImg.src = e.target.result;
        if (headerImg) headerImg.src = e.target.result;
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
            // লোকাল স্টোরেজে সেভ করে রাখা যাতে রিলোড দিলেও থাকে
            localStorage.setItem('adminProfilePic', result.imageUrl); 
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

    readProductListUrlState();

    // ২. লোকাল স্টোরেজ থেকে প্রোফাইল পিকচার সেট করা (যদি আগে থেকে থাকে)
    const savedPic = localStorage.getItem('adminProfilePic');
    if (savedPic) {
        const profileImg = document.getElementById('adminProfileImg');
        const headerImg = document.getElementById('headerProfileImg');
        if (profileImg) profileImg.src = savedPic;
        if (headerImg) headerImg.src = savedPic;
    }

    // ৩. কোর মডিউলগুলোর ডাটা সার্ভার থেকে সিঙ্ক করা
    fetchDashboardData();   // ওভারভিউ এবং কাস্টমার ডাটা
    fetchLiveOrders();      // লাইভ অর্ডারস
    fetchLiveProducts();    // ম্যানেজ প্রোডাক্টস ডাটা
    fetchSecurityLogs();    // সিকিউরিটি লগস
    setupAnalyticsChartToggles();
    setupCustomerSegmentTabs();
}

/* ==========================================================================
   EVENT LISTENERS & LIFECYCLE HOOKS
   ========================================================================== */

// DOM সম্পূর্ণ লোড হওয়ার পর সিস্টেম বুট করা
document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
    setupSidebarNavigation();
    setupGlobalSearch();
    setupSyncButton();

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('section') === 'manage-products') {
        readProductListUrlState();
        const productsNav = document.querySelector('.sidebar-menu li[data-target="view-manage-products"]');
        if (productsNav) navigateAdminSection('view-manage-products', productsNav);
    }

    const profileUploadInput = document.getElementById('adminProfileUpload');
    if (profileUploadInput) {
        profileUploadInput.addEventListener('change', uploadAdminProfilePic);
    }

    fetchCategories();
    fetchBrands();
    fetchAttributes();
    setupCouponForm();
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
        'view-manage-products': fetchLiveProducts,
        'view-customers': fetchDashboardData,
        'view-overview': fetchDashboardData,
        'manage-category': fetchCategories,
        'manage-brands': fetchBrands,
        'manage-attributes': fetchAttributes,
        'manage-coupons': fetchCoupons,
        'view-security': fetchSecurityLogs,
        'view-sessions': fetchAdminSessions,
        'view-audit': initAuditView,
        'view-master-settings': fetchMasterSettings,
        // Staff Management lives in js/admin-staff.js (Super Admin only)
        'view-staff': () => window.loadStaffSection && window.loadStaffSection(),
        'view-settings': fetchAdminSettings
    };
    if (typeof refreshMap[targetId] === 'function') {
        if (targetId === 'view-manage-products') readProductListUrlState();
        refreshMap[targetId]();
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
                const orderSearch = document.getElementById('orderSearchInput');
                if (orderSearch) {
                    orderSearch.value = query;
                    if (typeof filterAndRenderOrders === 'function') filterAndRenderOrders();
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
async function fetchAdminProfile() {
    try {
        const token = localStorage.getItem('adminToken');
        
        const response = await fetch('/api/admin/profile', {
            method: 'GET',
            headers: { 
                'Authorization': `Bearer ${token}` 
            }
        });
        
        const data = await response.json();
        
        // ডাটাবেজে ছবি পাওয়া গেলে তা ড্যাশবোর্ডের img ট্যাগে সেট করবে
        if (data.success && data.image) {
            const profilePic = document.getElementById('adminProfilePic');
            if (profilePic) {
                profilePic.src = data.image;
            }
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
const adminProfilePic = document.getElementById('adminProfilePic');

if (profileUploadInput) {
    profileUploadInput.addEventListener('change', async function(e) {
        const file = e.target.files[0];
        if (!file) return;

        // ছবির ডাটা পাঠানোর জন্য FormData তৈরি
        const formData = new FormData();
        formData.append('profilePic', file);

        try {
            const token = localStorage.getItem('adminToken');
            
            // সার্ভারের আপলোড এপিআই এন্ডপয়েন্টে রিকোয়েস্ট পাঠানো
            const response = await fetch('/api/admin/update-profile-pic', {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}` 
                },
                body: formData // বডিতে ছবি পাঠানো হচ্ছে
            });

            const data = await response.json();
            
            if (data.success) {
                // আপলোড সফল হলে সাথে সাথে ড্যাশবোর্ডের ছবি পরিবর্তন হবে
                if (adminProfilePic) {
                    adminProfilePic.src = data.imageUrl;
                }
                showToast("Profile picture updated successfully!", "success");
            } else {
                showToast(data.message || "Failed to upload image", "error");
            }
        } catch (err) {
            console.error("🔴 Failed to upload image :", err);
            showToast("Error connecting to server", "error");
        }
    });
}





/*==========================================================================================================================*/

/*==========================================================================================================================*/

/* ==========================================================================
   TWO-FACTOR AUTHENTICATION (2FA) — Admin self-service manager
   Email · Google Authenticator (TOTP) · SMS
========================================================================== */
(function () {
    const AUTH = () => ({ 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` });
    const toast = (m, t = 'success') => showToast(m, t);
    const $ = (id) => document.getElementById(id);

    let state = {
        method: 'email', twoFactorEnabled: true,
        totpConfigured: false, totpPending: false,
        phone: '', maskedPhone: '', maskedEmail: '', smsConfigured: false
    };

    /* ---- Small helpers ---- */

    // Put a button into a loading state; returns a restore() that reverses it.
    function setBusy(btn, label) {
        if (!btn) return () => {};
        if (btn.dataset.loading === '1') return () => {}; // already busy → ignore double clicks
        const html = btn.innerHTML;
        const wasDisabled = btn.disabled;
        btn.dataset.loading = '1';
        btn.disabled = true;
        btn.classList.add('is-loading');
        btn.innerHTML = `<span class="twofa-spinner" aria-hidden="true"></span> ${label || 'Please wait…'}`;
        return () => {
            btn.dataset.loading = '0';
            btn.disabled = wasDisabled;
            btn.classList.remove('is-loading');
            btn.innerHTML = html;
        };
    }

    // Unified JSON fetch. Never throws on non-2xx — returns { ok, status, data }.
    async function api(url, method = 'GET', body) {
        const opts = { method, headers: { ...AUTH() } };
        if (body !== undefined) {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }
        const res = await fetch(url, opts);
        let data = {};
        try { data = await res.json(); } catch (_) { /* empty / non-JSON body */ }
        return { ok: res.ok, status: res.status, data };
    }

    async function loadStatus() {
        if (!$('twofaMethods')) return; // settings section not mounted yet
        try {
            const { data } = await api('/api/admin/2fa/status');
            if (data && data.success) { state = { ...state, ...data.data }; render(); }
        } catch (err) {
            console.error('2FA status load failed:', err);
        }
    }

    function setBadge(el, text, kind) {
        if (!el) return;
        el.textContent = text;
        el.dataset.state = kind; // off | ready | active
    }

    function render() {
        // Active-method highlight (drives the check icon + border via CSS)
        document.querySelectorAll('.twofa-method').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.method === state.method);
        });

        if ($('twofaEmailTarget')) $('twofaEmailTarget').textContent = state.maskedEmail ? `Code sent to ${state.maskedEmail}` : 'Code sent to your email';
        if ($('twofaTotpState')) $('twofaTotpState').textContent = state.totpConfigured ? 'Active & verified' : (state.totpPending ? 'Setup in progress' : 'Not configured');
        if ($('twofaSmsTarget')) $('twofaSmsTarget').textContent = state.maskedPhone ? `Code texted to ${state.maskedPhone}` : 'Add a phone number';

        // Status badges
        setBadge($('twofaEmailBadge'), state.method === 'email' ? 'Active' : 'Ready', state.method === 'email' ? 'active' : 'ready');
        setBadge($('twofaTotpBadge'),
            state.totpConfigured ? (state.method === 'totp' ? 'Active' : 'Configured') : 'Not set up',
            state.totpConfigured ? (state.method === 'totp' ? 'active' : 'ready') : 'off');
        setBadge($('twofaSmsBadge'),
            state.smsConfigured ? (state.method === 'sms' ? 'Active' : 'Configured') : 'Not set up',
            state.smsConfigured ? (state.method === 'sms' ? 'active' : 'ready') : 'off');

        // SMS panel visible when SMS selected OR a phone is already on file
        const showSms = state.method === 'sms' || state.smsConfigured;
        if ($('twofaPhoneGroup')) $('twofaPhoneGroup').style.display = showSms ? 'block' : 'none';
        if ($('twofaPhoneInput') && document.activeElement !== $('twofaPhoneInput')) $('twofaPhoneInput').value = state.phone || '';

        // TOTP panel visible when Authenticator selected OR already configured
        const showTotp = state.method === 'totp' || state.totpConfigured;
        if ($('twofaTotpPanel')) $('twofaTotpPanel').style.display = showTotp ? 'block' : 'none';
        if ($('twofaSetupTotpBtn') && $('twofaSetupTotpBtn').dataset.loading !== '1') {
            $('twofaSetupTotpBtn').innerHTML = state.totpConfigured
                ? '<i class="fa-solid fa-rotate"></i> Re-configure'
                : '<i class="fa-solid fa-qrcode"></i> Set up Google Authenticator';
        }
        if ($('twofaDisableTotpBtn')) $('twofaDisableTotpBtn').style.display = state.totpConfigured ? 'inline-flex' : 'none';
    }

    /* ---- Actions ---- */

    async function updateMethod(method, extra, srcBtn) {
        const restore = setBusy(srcBtn, 'Saving…');
        try {
            const { data } = await api('/api/admin/2fa/method', 'PUT', { method, ...(extra || {}) });
            if (!data.success) { toast(data.message || 'Failed to update 2FA method.', 'error'); return false; }
            state.method = data.data.method;
            state.phone = data.data.phone || state.phone;
            state.maskedPhone = data.data.maskedPhone || state.maskedPhone;
            if (state.phone) state.smsConfigured = true;
            toast(data.message, 'success');
            render();
            return true;
        } catch (err) {
            console.error('2FA method update failed:', err);
            toast('Server error updating 2FA method.', 'error');
            return false;
        } finally { restore(); }
    }

    async function onMethodClick(btn) {
        const method = btn.dataset.method;
        if (!method || method === state.method) return;

        // Authenticator not yet configured → reveal setup instead of switching.
        if (method === 'totp' && !state.totpConfigured) {
            document.querySelectorAll('.twofa-method').forEach(b => b.classList.toggle('active', b === btn));
            if ($('twofaTotpPanel')) $('twofaTotpPanel').style.display = 'block';
            toast('Set up Google Authenticator, then verify to activate it.', 'info');
            return;
        }
        // SMS not yet verified → reveal the phone + test-code panel.
        if (method === 'sms' && !state.smsConfigured) {
            document.querySelectorAll('.twofa-method').forEach(b => b.classList.toggle('active', b === btn));
            if ($('twofaPhoneGroup')) $('twofaPhoneGroup').style.display = 'block';
            if ($('twofaPhoneInput')) $('twofaPhoneInput').focus();
            toast('Add your phone number and verify it to enable SMS 2FA.', 'info');
            return;
        }
        await updateMethod(method, {}, btn);
    }

    async function onSavePhone(btn) {
        const phone = ($('twofaPhoneInput').value || '').trim();
        if (!phone) return toast('Please enter a phone number.', 'error');
        const restore = setBusy(btn, 'Saving…');
        try {
            // Save the phone WITHOUT forcing the method (empty method = keep current).
            const { data } = await api('/api/admin/2fa/method', 'PUT', { phone });
            if (!data.success) { toast(data.message || 'Failed to save phone number.', 'error'); return; }
            state.phone = (data.data && data.data.phone) || phone;
            state.maskedPhone = (data.data && data.data.maskedPhone) || state.maskedPhone;
            state.smsConfigured = !!state.phone;
            toast('Phone number saved. Send a test code to verify it.', 'success');
            render();
        } catch (err) {
            console.error('Save phone failed:', err);
            toast('Server error saving phone number.', 'error');
        } finally { restore(); }
    }

    async function onSendSms(btn) {
        const phone = ($('twofaPhoneInput').value || '').trim();
        if (!phone) return toast('Enter a phone number first.', 'error');
        const restore = setBusy(btn, 'Sending…');
        try {
            const { data } = await api('/api/admin/2fa/sms/send', 'POST', { phone });
            if (!data.success) { toast(data.message || 'Failed to send test code.', 'error'); return; }
            state.phone = phone;
            state.smsConfigured = true;
            if (data.maskedPhone) state.maskedPhone = data.maskedPhone;
            if ($('twofaSmsVerifyRow')) $('twofaSmsVerifyRow').style.display = 'block';
            if ($('twofaSmsHint')) $('twofaSmsHint').textContent = data.delivered
                ? `We texted a 6-digit code to ${data.maskedPhone}. It expires in ${data.expiresInMinutes || 5} minutes.`
                : 'Code generated. SMS is in console mode — check the server terminal for the 6-digit code.';
            if ($('twofaSmsCode')) { $('twofaSmsCode').value = ''; $('twofaSmsCode').focus(); }
            toast(data.delivered ? 'Test code sent via SMS.' : 'Code generated — check the server console.', data.delivered ? 'success' : 'info');
        } catch (err) {
            console.error('Send SMS code failed:', err);
            toast('Server error sending test code.', 'error');
        } finally { restore(); }
    }

    async function onVerifySms(btn) {
        const code = ($('twofaSmsCode').value || '').replace(/\D/g, '').trim();
        if (code.length !== 6) return toast('Enter the 6-digit code sent to your phone.', 'error');
        const restore = setBusy(btn, 'Verifying…');
        try {
            const { data } = await api('/api/admin/2fa/sms/verify', 'POST', { token: code });
            if (!data.success) { toast(data.message || 'Invalid code, please try again.', 'error'); return; }
            state.method = 'sms';
            state.smsConfigured = true;
            if (data.maskedPhone) state.maskedPhone = data.maskedPhone;
            toast('SMS OTP Activated Successfully', 'success');
            if ($('twofaSmsVerifyRow')) $('twofaSmsVerifyRow').style.display = 'none';
            render();
        } catch (err) {
            console.error('Verify SMS code failed:', err);
            toast('Server error verifying code.', 'error');
        } finally { restore(); }
    }

    async function onSetupTotp(btn) {
        const restore = setBusy(btn, 'Generating…');
        try {
            const { data } = await api('/api/admin/2fa/totp/setup', 'POST');
            if (!data.success) { toast(data.message || 'Failed to start setup.', 'error'); return; }
            if ($('twofaQrImg')) $('twofaQrImg').src = data.qrCode;
            if ($('twofaManualKey')) $('twofaManualKey').textContent = data.manualKey;
            if ($('twofaQrWrap')) $('twofaQrWrap').style.display = 'flex';
            if ($('twofaVerifyCode')) { $('twofaVerifyCode').value = ''; $('twofaVerifyCode').focus(); }
            state.totpPending = true;
        } catch (err) {
            console.error('TOTP setup failed:', err);
            toast('Server error during setup.', 'error');
        } finally { restore(); }
    }

    async function onVerifyTotp(btn) {
        const code = ($('twofaVerifyCode') && $('twofaVerifyCode').value || '').replace(/\D/g, '').trim();
        if (code.length !== 6) return toast('Enter the 6-digit code from your authenticator app.', 'error');
        const restore = setBusy(btn, 'Verifying…');
        try {
            const { data } = await api('/api/admin/2fa/totp/verify', 'POST', { token: code });
            if (!data.success) { toast(data.message || 'Invalid Code, please try again.', 'error'); return; }
            state.totpConfigured = true;
            state.method = 'totp';
            state.totpPending = false;
            toast('Google Authenticator Activated Successfully', 'success');
            if ($('twofaQrWrap')) $('twofaQrWrap').style.display = 'none';
            render();
        } catch (err) {
            console.error('TOTP verify failed:', err);
            toast('Server error during verification.', 'error');
        } finally { restore(); }
    }

    async function onDisableTotp(btn) {
        if (!confirm('Disable Google Authenticator and switch back to Email OTP?')) return;
        const restore = setBusy(btn, 'Disabling…');
        try {
            const { data } = await api('/api/admin/2fa/totp/disable', 'POST');
            if (!data.success) { toast(data.message || 'Failed to disable.', 'error'); return; }
            state.totpConfigured = false;
            state.method = 'email';
            state.totpPending = false;
            toast(data.message || 'Google Authenticator disabled.', 'success');
            if ($('twofaQrWrap')) $('twofaQrWrap').style.display = 'none';
            render();
        } catch (err) {
            console.error('TOTP disable failed:', err);
            toast('Server error.', 'error');
        } finally { restore(); }
    }

    /* ---- Event delegation (robust: works no matter when the DOM mounts) ---- */

    document.addEventListener('click', (e) => {
        if (!e.target || !e.target.closest) return;

        // Method tiles (spans inside the button also resolve to the tile)
        const tile = e.target.closest('.twofa-method');
        if (tile && $('twofaMethods') && $('twofaMethods').contains(tile)) {
            onMethodClick(tile);
            return;
        }

        const btn = e.target.closest('button');
        if (!btn || !btn.id) return;
        switch (btn.id) {
            case 'twofaSavePhoneBtn':   onSavePhone(btn); break;
            case 'twofaSendSmsBtn':     onSendSms(btn); break;
            case 'twofaVerifySmsBtn':   onVerifySms(btn); break;
            case 'twofaSetupTotpBtn':   onSetupTotp(btn); break;
            case 'twofaVerifyTotpBtn':  onVerifyTotp(btn); break;
            case 'twofaDisableTotpBtn': onDisableTotp(btn); break;
        }
    });

    // Enter key submits the code fields
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || !e.target) return;
        if (e.target.id === 'twofaVerifyCode') { e.preventDefault(); onVerifyTotp($('twofaVerifyTotpBtn')); }
        else if (e.target.id === 'twofaSmsCode') { e.preventDefault(); onVerifySms($('twofaVerifySmsBtn')); }
    });

    // Public hook: called whenever the Settings view is opened
    window.refreshTwoFactorSettings = loadStatus;

    document.addEventListener('DOMContentLoaded', loadStatus);
    // If the module evaluates after DOMContentLoaded already fired, load now too.
    if (document.readyState !== 'loading') loadStatus();
})();

