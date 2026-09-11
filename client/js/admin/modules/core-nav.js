/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/core-nav.js
 * Description: Page header, SPA router, sidebar navigation, and global search.
 */
/* ==========================================================================
   ADMIN PAGE METADATA (সেকশন অনুযায়ী হেডার টাইটেল আপডেট)
   ========================================================================== */

/* shared state: ADMIN_PAGE_META lives on window (admin-core) */
let lastClickedNavItem = null;

function updateAdminPageHeader(sectionId, fallbackLabel) {
    const meta = ADMIN_PAGE_META[sectionId];
    const mainTitle = document.getElementById('page-main-title');
    const subTitle = document.getElementById('page-sub-title');
    if (mainTitle) mainTitle.textContent = meta ? meta.title : (fallbackLabel || 'Dashboard');
    if (subTitle) subTitle.textContent = meta ? meta.subtitle : '';
}

/** Sidebar deep links use aliases when data-settings-tab does not match a tab button id. */
const ADMIN_SETTINGS_TAB_ALIASES = {
    security: 'profile',
    system: 'profile'
};

function activateAdminSettingsTab(tabId) {
    if (!tabId) return;

    const resolvedTabId = ADMIN_SETTINGS_TAB_ALIASES[tabId] || tabId;
    const tab =
        document.querySelector(`.admin-settings-tab[data-tab="${tabId}"]`) ||
        document.querySelector(`.admin-settings-tab[data-tab="${resolvedTabId}"]`) ||
        document.getElementById(tabId) ||
        document.getElementById(`adminTab${resolvedTabId.charAt(0).toUpperCase()}${resolvedTabId.slice(1)}`);

    if (!tab || !tab.classList.contains('admin-settings-tab')) return;

    const target = tab.dataset.tab;
    if (!target) return;

    const tabs = document.querySelectorAll('.admin-settings-tab');
    const panels = document.querySelectorAll('.admin-settings-panel');

    tabs.forEach((t) => {
        const isActive = t === tab;
        t.classList.toggle('is-active', isActive);
        t.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    panels.forEach((panel) => {
        const isActive = panel.dataset.panel === target;
        panel.classList.toggle('is-active', isActive);
        panel.hidden = !isActive;
    });

    if (target === 'profile' && typeof loadSandboxStatus === 'function') {
        loadSandboxStatus();
    }
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
    const orderCount = Number(user.orderCount) || 0;
    if (user.isInactive || user.segment === 'inactive' || orderCount === 0) {
        return '<span class="segment-badge segment-badge--inactive"><i class="fa-solid fa-user-clock"></i> Inactive</span>';
    }
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

    if (!window.staffAuditPg && document.getElementById('staff-audit-pg-btns')) {
        window.staffAuditPg = new AdminPagination({
            containerId: 'staff-audit-pg-btns',
            infoId: 'staff-audit-pg-info',
            countId: 'staff-audit-total-count',
            limitSelectId: 'staff-audit-pg-limit',
            defaultLimit: 25,
            onPageChange: (page, limit) => fetchStaffAuditSummary(page, limit)
        });
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

window.customerNextCursor = null;
window.customerHasMore = false;
window.customerListLoading = false;

window.fetchCustomers = async function fetchCustomers(reset = false) {
    if (customerListLoading) return;
    customerListLoading = true;

    const loadMoreBtn = document.getElementById('customersLoadMoreBtn');
    const infoEl = document.getElementById('customer-pg-info');
    if (loadMoreBtn) loadMoreBtn.disabled = true;

    if (reset) {
        allCustomers = [];
        customerNextCursor = null;
        customerHasMore = false;
    }

    try {
        const qs = new URLSearchParams({ limit: '50' });
        if (customerNextCursor) qs.set('cursor', customerNextCursor);
        if (customerTierFilter) qs.set('tier', customerTierFilter);

        const response = await fetch(`/api/admin/customers?${qs}`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` }
        });

        if (response.status === 429) {
            if (trackAdminPollError('customers', response)) return;
            showCustomerError('Too many requests. Please wait and try again.');
            return;
        }
        if (!response.ok) {
            handleAdminApiAuthResponse(response, {});
            throw new Error(`HTTP error: ${response.status}`);
        }

        const data = await response.json();
        resetAdminPollErrors('customers');

        const batch = data.customers || data.data || [];
        customerSegmentThresholds = data.segmentThresholds || customerSegmentThresholds;
        customerNextCursor = data.nextCursor || null;
        customerHasMore = data.hasMore === true;

        allCustomers = reset ? batch : [...allCustomers, ...batch];

        const filtered = filterCustomersBySegment(allCustomers, customerSegmentFilter)
            .filter((user) => {
                const q = customerSearchQuery.trim().toLowerCase();
                if (!q) return true;
                const haystack = [
                    user.name,
                    user.firstName,
                    user.lastName,
                    user.email,
                    user.mobile,
                    user.phone,
                    user._id
                ].map((v) => String(v || '').toLowerCase()).join(' ');
                return haystack.includes(q);
            });

        renderCustomerTable(filtered, filtered.length);

        if (infoEl) {
            infoEl.textContent = `Showing ${filtered.length} loaded customer${filtered.length !== 1 ? 's' : ''}${customerHasMore ? ' — more available' : ''}`;
        }
        if (loadMoreBtn) {
            loadMoreBtn.hidden = !customerHasMore;
            loadMoreBtn.disabled = false;
        }
    } catch (error) {
        console.error('fetchCustomers error:', error);
        showCustomerError('Server connection error.');
        if (loadMoreBtn) loadMoreBtn.disabled = false;
    } finally {
        customerListLoading = false;
    }
};

function filterCustomersBySegment(customers, segment = customerSegmentFilter) {
    const list = Array.isArray(customers) ? customers : [];
    if (segment === 'vip') return list.filter((user) => user.isVip);
    if (segment === 'frequent') return list.filter((user) => user.isFrequentBuyer);
    if (segment === 'inactive') {
        return list.filter((user) => user.isInactive || user.segment === 'inactive' || Number(user.orderCount) === 0);
    }
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
            const filtered = filterCustomersBySegment(allCustomers, customerSegmentFilter);
            renderCustomerTable(filtered, filtered.length);
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
                const filtered = filterCustomersBySegment(allCustomers, customerSegmentFilter)
                    .filter((user) => {
                        const q = customerSearchQuery.trim().toLowerCase();
                        if (!q) return true;
                        const haystack = [
                            user.name, user.firstName, user.lastName,
                            user.email, user.mobile, user.phone, user._id
                        ].map((v) => String(v || '').toLowerCase()).join(' ');
                        return haystack.includes(q);
                    });
                renderCustomerTable(filtered, filtered.length);
            }, 300);
        });
    }

    const tierFilter = document.getElementById('customerTierFilter');
    if (tierFilter && !tierFilter.dataset.bound) {
        tierFilter.dataset.bound = '1';
        tierFilter.addEventListener('change', () => {
            customerTierFilter = tierFilter.value || '';
            fetchCustomers(true);
        });
    }

    const loadMoreBtn = document.getElementById('customersLoadMoreBtn');
    if (loadMoreBtn && !loadMoreBtn.dataset.bound) {
        loadMoreBtn.dataset.bound = '1';
        loadMoreBtn.addEventListener('click', () => fetchCustomers(false));
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
    if (typeof setupMasterOrderEditor === 'function') setupMasterOrderEditor();
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

    if (clickedItem) lastClickedNavItem = clickedItem;

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
    const linkTitle = clickedItem?.getAttribute?.('data-breadcrumb') || clickedItem?.getAttribute?.('data-title') || label;
    const settingsTab = clickedItem?.getAttribute?.('data-settings-tab');

    const mainTitle = document.getElementById('page-main-title');
    const subTitle = document.getElementById('page-sub-title');
    if (linkTitle && mainTitle) {
        mainTitle.textContent = linkTitle;
        const meta = ADMIN_PAGE_META[targetId];
        if (subTitle) subTitle.textContent = meta?.subtitle || '';
    } else {
        updateAdminPageHeader(targetId, label);
    }

    if (typeof renderAdminBreadcrumb === 'function') {
        renderAdminBreadcrumb(targetId, clickedItem);
    }
    syncNavAccordionState(targetId, clickedItem);

    const refreshMap = {
        'view-orders': fetchLiveOrders,
        'view-manage-products': () => {
            loadCategoryFilter();
            fetchLiveProducts();
        },
        'view-customers': () => fetchCustomers(true),
        'view-suppliers': () => window.loadSuppliersSection && window.loadSuppliersSection(),
        'view-warehouses': () => window.loadWarehousesSection && window.loadWarehousesSection(),
        'view-purchase-orders': () => window.loadPurchaseOrdersSection && window.loadPurchaseOrdersSection(),
        'view-finance': () => {
            if (window.initFinanceEmbed) window.initFinanceEmbed();
            if (window.initProfitLossReport) window.initProfitLossReport();
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
        'view-staff-audit': () => {
            initAdminPaginationInstances();
            if (typeof fetchStaffAuditSummary === 'function') fetchStaffAuditSummary();
        },
        'view-hrm-employees': () => window.loadHrmEmployeesSection && window.loadHrmEmployeesSection(),
        'view-hrm-attendance': () => window.loadHrmAttendanceSection && window.loadHrmAttendanceSection(),
        'view-hrm-payroll': () => window.loadHrmPayrollSection && window.loadHrmPayrollSection(),
        'view-hrm-leaves': () => window.loadHrmLeavesSection && window.loadHrmLeavesSection(),
        'view-shipping-payments': fetchMasterSettings,
        'view-loyalty-program': fetchMasterSettings,
        'view-store-config': fetchMasterSettings,
        'view-banners': () => window.loadBanners && window.loadBanners(),
        'view-messages': fetchAdminMessages,
        'view-crm-abandoned': () => window.loadAbandonedCarts && window.loadAbandonedCarts('all'),
        'view-chat': () => window.initChatModule && window.initChatModule(),
        'view-chat-analytics': () => window.loadChatAnalytics && window.loadChatAnalytics('7d'),
        'view-canned-responses': () => window.loadCannedResponsesUI && window.loadCannedResponsesUI(),
        'view-newsletter-subscribers': () => window.loadNewsletterSubscribersSection && window.loadNewsletterSubscribersSection(),
        'view-newsletter-campaigns': () => window.loadNewsletterCampaignsSection && window.loadNewsletterCampaignsSection(),
        // Staff Management lives in js/admin-staff.js (Super Admin only)
        'view-staff': () => window.loadStaffSection && window.loadStaffSection(),
        // File Manager lives in js/admin-file-manager.js (Super Admin only)
        'view-file-manager': () => window.loadFileManagerSection && window.loadFileManagerSection(),
        'view-settings': fetchAdminSettings,
        'view-reviews': () => window.loadAdminReviews && window.loadAdminReviews()
    };
    if (typeof refreshMap[targetId] === 'function') {
        if (targetId === 'view-manage-products') readProductListSessionState();
        refreshMap[targetId]();
    }

    if (targetId === 'view-add-product') {
        initAddProductFormUI();
        loadCategoryDropdownForProduct('prodCategory');
    }

    if (settingsTab) {
        const tabTarget = settingsTab;
        const tryActivateTab = (attempts = 0) => {
            const resolvedTab = ADMIN_SETTINGS_TAB_ALIASES[tabTarget] || tabTarget;
            const tabEl = document.querySelector(
                `[data-tab="${tabTarget}"], #tab-${tabTarget}, [href="#${tabTarget}"]`
            ) || document.querySelector(`.admin-settings-tab[data-tab="${resolvedTab}"]`);

            if (tabEl) {
                tabEl.click();
            } else if (attempts < 10) {
                setTimeout(() => tryActivateTab(attempts + 1), 150);
            }
        };
        tryActivateTab();
    }
}
window.navigateAdminSection = navigateAdminSection;

function sectionNavGroup(sectionId, clickedItem) {
    const item = clickedItem || lastClickedNavItem || document.querySelector(`.sidebar-menu li[data-target="${sectionId}"]`);
    if (!item) return null;
    const group = item.closest('.menu-group[data-nav-section]');
    return group?.getAttribute('data-nav-section') || null;
}

function syncNavAccordionState(activeSectionId, clickedItem) {
    const activeGroup = sectionNavGroup(activeSectionId, clickedItem) || 'dashboard';
    document.querySelectorAll('.sidebar-menu li.menu-group[data-nav-section]').forEach((group) => {
        const section = group.getAttribute('data-nav-section');
        const isActive = section === activeGroup;
        group.classList.toggle('open', isActive);
        group.classList.toggle('nav-group-active', isActive);
    });
}

function setupMobileSidebar() {
    const sidebar = document.getElementById('adminSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const toggle = document.getElementById('sidebarMobileToggle');
    if (!sidebar || !toggle) return;

    const closeDrawer = () => {
        sidebar.classList.remove('open');
        if (overlay) {
            overlay.hidden = true;
            overlay.classList.remove('visible');
        }
        document.body.classList.remove('sidebar-drawer-open');
    };

    const openDrawer = () => {
        sidebar.classList.add('open');
        if (overlay) {
            overlay.hidden = false;
            overlay.classList.add('visible');
        }
        document.body.classList.add('sidebar-drawer-open');
    };

    if (!toggle.dataset.bound) {
        toggle.dataset.bound = '1';
        toggle.addEventListener('click', () => {
            if (sidebar.classList.contains('open')) closeDrawer();
            else openDrawer();
        });
    }

    if (overlay && !overlay.dataset.bound) {
        overlay.dataset.bound = '1';
        overlay.addEventListener('click', closeDrawer);
    }

    if (!sidebar.dataset.mobileNavBound) {
        sidebar.dataset.mobileNavBound = '1';
        sidebar.addEventListener('click', (e) => {
            const item = e.target.closest('li[data-target]');
            if (item && window.matchMedia('(max-width: 768px)').matches) {
                closeDrawer();
            }
        });
    }
}

function setupSidebarNavigation() {
    const nav = document.querySelector('.sidebar-menu');
    if (!nav) return;

    setupMobileSidebar();
    syncNavAccordionState('view-overview');

    nav.addEventListener('click', (e) => {
        const toggle = e.target.closest('.catalog-toggle, .nav-group-toggle');
        if (toggle) {
            e.preventDefault();
            e.stopPropagation();
            const group = toggle.closest('.menu-group');
            if (!group) return;

            const section = group.getAttribute('data-nav-section');
            document.querySelectorAll('.sidebar-menu li.menu-group[data-nav-section]').forEach((g) => {
                if (g !== group) g.classList.remove('open', 'nav-group-active');
            });
            group.classList.toggle('open');
            group.classList.toggle('nav-group-active', group.classList.contains('open'));
            if (section) group.dataset.lastOpened = section;
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
                    if (typeof fetchCustomers === 'function') fetchCustomers(false);
                }
            }
        });
    }
}

/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    updateAdminPageHeader,
    getOrderCountBadge,
    getCustomerSegmentBadge,
    initAdminPaginationInstances,
    filterCustomersBySegment,
    setupCustomerSegmentTabs,
    setupAdminSPARouter,
    switchDashboardView,
    initDashboard,
    navigateAdminSection,
    setupSidebarNavigation,
    setupMobileSidebar,
    syncNavAccordionState,
    setupGlobalSearch
});
