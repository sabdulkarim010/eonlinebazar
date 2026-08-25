/**
 * Profile Tabs & Drawer
 * Barrel: client/js/profile.js
 *
 * Globals used from other modules:
 *  * - fetchUserOrders
 * - fetchDashboardStats
 * - fetchWishlist
 * - fetchAddresses
 * - fetchSessions
 * - fetchWalletData
 *
 * Globals this module exposes:
 *  * - profileAuthToken
 * - activateProfileTab
 * - closeProfileDrawer
 * - showToast
 */

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token') || localStorage.getItem('customerToken');
    
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    // লগইন করা ইউজারের তথ্য (রিভিউ এডিট প্রি-লোড করার জন্য প্রয়োজন)
    let currentUser = null;
    try {
        currentUser = JSON.parse(localStorage.getItem('userInfo') || localStorage.getItem('user') || 'null');
    } catch (e) {
        currentUser = null;
    }
    const currentUserId = currentUser ? (currentUser._id || currentUser.id || '') : '';

    // ছোট HTML/attribute-escape হেল্পার (XSS-নিরাপদ ও attribute break রোধ)
    const escapeHtml = (str) => String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const IMAGE_PLACEHOLDER = '/images/placeholder-product.svg';
    const AVATAR_PLACEHOLDER = "data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"100\" viewBox=\"0 0 24 24\" fill=\"%23cbd5e1\"><circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4 20c0-4 4-6 8-6s8 2 8 6\"/></svg>";
    const IMG_ONERROR = "this.onerror=null;this.src='" + IMAGE_PLACEHOLDER + "';";

    function isInvalidImageValue(img) {
        if (img == null) return true;
        const v = String(img).trim();
        if (!v || v === 'null' || v === 'undefined') return true;
        if (v.includes('undefined') || v.includes('via.placeholder.com')) return true;
        if (window.EOBUrlUtils && window.EOBUrlUtils.isUnsafeAssetPath(v)) return true;
        const PT = window.ProductThumbnail;
        if (PT && typeof PT.isUnsafeAssetPath === 'function' && PT.isUnsafeAssetPath(v)) return true;
        if (/^https?:\/\//i.test(v)) {
            try {
                const u = new URL(v);
                if (!u.hostname || u.hostname.length < 2 || /^[&?#/]+$/.test(u.hostname)) return true;
            } catch (_) {
                return true;
            }
        }
        return false;
    }

    function safeImg(img, fallback) {
        const fb = fallback || IMAGE_PLACEHOLDER;
        if (isInvalidImageValue(img)) return fb;
        const v = String(img).trim();
        const CDU = window.CartDisplayUtils;
        if (CDU && typeof CDU.resolveItemImageUrl === 'function') {
            const resolved = CDU.resolveItemImageUrl(v);
            if (resolved && !isInvalidImageValue(resolved)) return resolved;
        }
        const PT = window.ProductThumbnail;
        if (PT && typeof PT.resolveProductImagePath === 'function') {
            const resolved = PT.toDisplayImageUrl
                ? (PT.toDisplayImageUrl(v) || PT.resolveProductImagePath(v))
                : PT.resolveProductImagePath(v);
            if (resolved && !isInvalidImageValue(resolved)) return resolved;
        }
        if (v.startsWith('http') || v.startsWith('/') || v.startsWith('data:')) return v;
        return fb;
    }

    function bindImgFallback(imgEl, fallback) {
        if (!imgEl || imgEl.dataset.eobFallbackBound) return;
        imgEl.dataset.eobFallbackBound = '1';
        const fb = fallback || IMAGE_PLACEHOLDER;
        imgEl.addEventListener('error', function handleImgError() {
            if (this.dataset.fallbackApplied === '1') return;
            this.dataset.fallbackApplied = '1';
            this.src = fb;
        });
    }

    function setAvatarSrc(el, url) {
        if (!el) return;
        el.src = safeImg(url, AVATAR_PLACEHOLDER);
        bindImgFallback(el, AVATAR_PLACEHOLDER);
    }

    /** Standardized main tab header markup for dynamic generators */
    function buildProfileTabHeader({ iconClass = 'fa-solid fa-circle-info', title = '', subtitle = '', titleHtml = '', id = '', extraClass = '' } = {}) {
        const idAttr = id ? ` id="${escapeHtml(id)}"` : '';
        const classes = ['profile-tab-header', extraClass].filter(Boolean).join(' ');
        const titleContent = titleHtml || escapeHtml(title);
        const subtitleBlock = subtitle
            ? `<p class="profile-tab-header__subtitle">${escapeHtml(subtitle)}</p>`
            : '';
        return `
            <header class="${classes}"${idAttr}>
                <div class="profile-tab-header__icon profile-card-icon" aria-hidden="true"><i class="${escapeHtml(iconClass)}"></i></div>
                <div class="profile-tab-header__text">
                    <h2 class="profile-tab-header__title">${titleContent}</h2>
                    ${subtitleBlock}
                </div>
            </header>`;
    }

    document.querySelectorAll('.profile-tab-header__back, .btn-back-icon').forEach((el) => el.remove());

    window.buildProfileTabHeader = buildProfileTabHeader;

    // 🔐 পেজ লোডেই সার্ভারে সেশন যাচাই করা হয়। কোনো ডিভাইস রিমোটলি লগআউট হলে
    // সার্ভার 401 দেবে এবং session-guard.js সাথে সাথে টোকেন মুছে লগইন পেজে পাঠাবে।
    if (window.EOBSession && typeof window.EOBSession.validate === 'function') {
        window.EOBSession.validate();
    }

    // --- সিলেক্টরস (এখানে আইডি সংশোধন করা হয়েছে) ---
    const sidebarName = document.getElementById('sidebar-name');
    const sidebarEmail = document.getElementById('sidebar-email');
    const sidebarAvatar = document.getElementById('sidebar-avatar');
    const navAvatar = document.getElementById('nav-avatar');
    const avatarInput = document.getElementById('avatar-input');

    if (sidebarAvatar) {
        sidebarAvatar.src = AVATAR_PLACEHOLDER;
        bindImgFallback(sidebarAvatar, AVATAR_PLACEHOLDER);
    }
    if (navAvatar) {
        navAvatar.src = AVATAR_PLACEHOLDER;
        bindImgFallback(navAvatar, AVATAR_PLACEHOLDER);
    }
    
    const profileForm = document.getElementById('profile-form');
    const profileName = document.getElementById('profile-name');
    const profileEmail = document.getElementById('profile-email');
    const profilePhone = document.getElementById('profile-phone');
    const profileGender = document.getElementById('profile-gender');
    const profileDob = document.getElementById('profile-dob');
    const profileDistrict = document.getElementById('district');
    const profileUpazila = document.getElementById('profile-upazila');
    const profileFullAddress = document.getElementById('profile-full-address');
    const profileAddress = document.getElementById('profile-address');
    
    const passwordForm = document.getElementById('password-form');
    const passwordFeedback = document.getElementById('password-feedback');
    const contactFeedback = document.getElementById('contact-feedback');
    const securityCurrentEmail = document.getElementById('security-current-email');
    const securityCurrentPhone = document.getElementById('security-current-phone');
    const contactOtpModal = document.getElementById('contact-otp-modal');
    const contactOtpForm = document.getElementById('contact-otp-form');
    const contactOtpSubtext = document.getElementById('contact-otp-subtext');
    const contactOtpFeedback = document.getElementById('contact-otp-feedback');
    const contactOtpTimer = document.getElementById('contactOtpTimer');
    const contactOtpResendBtn = document.getElementById('contact-otp-resend-btn');
    const requestEmailOtpBtn = document.getElementById('request-email-otp-btn');
    const requestPhoneOtpBtn = document.getElementById('request-phone-otp-btn');

    let pendingContactUpdate = { type: null, maskedDestination: '', expiresAt: null, resendAvailableAt: null };
    let contactOtpTimerInterval = null;
    let contactOtpResendInterval = null;
    
    const ordersListTbody = document.getElementById('orders-list-tbody');
    const ordersPaginationEl = document.getElementById('orders-pagination');
    const ORDERS_PER_PAGE = 10;
    let ordersCurrentPage = 1;
    const mainBalanceAmount = document.getElementById('main-balance-amount');
    const mainPointsAmount = document.getElementById('main-points-amount');
    const logoutBtn = document.getElementById('logout-btn');

    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    
    const profileMenuToggle = document.getElementById('profile-menu-toggle');
    const drawerOverlay = document.getElementById('profile-drawer-overlay');
    const sidebar = document.getElementById('sidebar-menu') || document.querySelector('.profile-sidebar');
    const menuItems = document.querySelectorAll('.sidebar-menu .menu-item[data-tab]');
    const tabContents = document.querySelectorAll('.tab-content');

    function showInlineFeedback(el, message, type = 'success') {
        if (!el) {
            if (message) showToast(message, type === 'success' ? 'success' : 'danger');
            return;
        }
        if (!message) {
            el.classList.add('hidden');
            el.textContent = '';
            el.classList.remove('is-success', 'is-error');
            return;
        }
        const icon = type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation';
        el.innerHTML = `<i class="fa-solid ${icon}"></i><span>${escapeHtml(message)}</span>`;
        el.classList.remove('hidden', 'is-success', 'is-error');
        el.classList.add(type === 'success' ? 'is-success' : 'is-error');
    }

    function updateSecurityContactDisplays(user = {}) {
        if (securityCurrentEmail) securityCurrentEmail.textContent = user.email || '—';
        if (securityCurrentPhone) {
            securityCurrentPhone.textContent = user.phone || user.mobile || '—';
        }
    }
    function showToast(message, type = 'success') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    // =================================================================
    // ৩. ডায়নামিক থিম সিস্টেম (Dark Mode Switcher)
    // =================================================================
    function initTheme() {
        const savedTheme = localStorage.getItem('eob_theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        if (themeToggleBtn) {
            const icon = themeToggleBtn.querySelector('i');
            if (icon) {
                icon.className = savedTheme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
            }
        }
    }

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            const newTheme = isDark ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('eob_theme', newTheme);
            const icon = themeToggleBtn.querySelector('i');
            if (icon) {
                icon.className = isDark ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
            }
            showToast(`${newTheme.charAt(0).toUpperCase() + newTheme.slice(1)} mode activated!`, 'success');
        });
    }
    initTheme();

    // =================================================================
    // ৪. মোবাইল অফ-ক্যানভাস ড্রয়ার (Responsive Drawer)
    // =================================================================
    function isMobileProfileLayout() {
        return window.innerWidth <= 768;
    }

    function setProfileDrawerOpen(isOpen) {
        if (!sidebar) return;
        sidebar.classList.toggle('open', isOpen);
        if (drawerOverlay) {
            drawerOverlay.classList.toggle('open', isOpen);
            drawerOverlay.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
        }
        if (profileMenuToggle) {
            profileMenuToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            profileMenuToggle.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
        }
        document.body.classList.toggle('profile-drawer-open', isOpen);
    }

    function openProfileDrawer() {
        if (!isMobileProfileLayout()) return;
        setProfileDrawerOpen(true);
    }

    function closeProfileDrawer() {
        setProfileDrawerOpen(false);
    }

    function toggleProfileDrawer() {
        if (!sidebar || !isMobileProfileLayout()) return;
        setProfileDrawerOpen(!sidebar.classList.contains('open'));
    }

    if (profileMenuToggle && sidebar) {
        profileMenuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleProfileDrawer();
        });
    }

    if (drawerOverlay) {
        drawerOverlay.addEventListener('click', closeProfileDrawer);
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar?.classList.contains('open')) {
            closeProfileDrawer();
        }
    });

    window.addEventListener('resize', () => {
        if (!isMobileProfileLayout() && sidebar?.classList.contains('open')) {
            closeProfileDrawer();
        }
    });

    // =================================================================
    // ৫. ড্যাশবোর্ড ট্যাব সুইচিং (Tab System)
    // =================================================================
    function resolveProfileTabKey(raw) {
        if (!raw) return null;
        const key = String(raw).trim().toLowerCase();
        const aliases = {
            dashboard: 'dashboard-overview',
            orders: 'my-orders',
            'my-orders': 'my-orders',
            'orders-section': 'my-orders',
            'recent-orders': 'my-orders'
        };
        if (aliases[key]) return aliases[key];
        return document.getElementById(key) ? key : null;
    }

    function getProfileScrollTarget(tabId) {
        if (tabId === 'my-orders') {
            return document.getElementById('orders-section') || document.getElementById('my-orders');
        }
        return document.getElementById(tabId);
    }

    function renderProfileCartSection() {
        const render = () => {
            if (typeof window.renderCartDrawerItems === 'function') {
                window.renderCartDrawerItems();
            }
        };

        if (typeof window.fetchLiveDBCart === 'function') {
            return window.fetchLiveDBCart().then(render).catch(render);
        }

        render();
        return Promise.resolve();
    }

    function refreshTabData(targetTab) {
        if (['my-orders', 'dashboard-overview'].includes(targetTab) && typeof fetchUserOrders === 'function') {
            fetchUserOrders();
        }
        if (targetTab === 'dashboard-overview' && typeof fetchDashboardStats === 'function') {
            fetchDashboardStats();
        }
        if (targetTab === 'my-cart') {
            fetchWishlist().then(() => renderProfileCartSection());
        }
        if (targetTab === 'addresses-settings' && typeof fetchAddresses === 'function') fetchAddresses();
        if (targetTab === 'security-settings' && typeof fetchSessions === 'function') fetchSessions();
        if (targetTab === 'wallet-points' && typeof fetchWalletData === 'function') fetchWalletData();
    }

    function activateProfileTab(targetTab, { scroll = false } = {}) {
        if (!targetTab || !document.getElementById(targetTab)) return;

        menuItems.forEach((item) => item.classList.remove('active'));
        tabContents.forEach((content) => content.classList.remove('active'));

        menuItems.forEach((item) => {
            if (item.getAttribute('data-tab') === targetTab) {
                item.classList.add('active');
            }
        });

        const activeSection = document.getElementById(targetTab);
        if (activeSection) {
            activeSection.classList.add('active');
        }

        if (isMobileProfileLayout()) closeProfileDrawer();

        refreshTabData(targetTab);

        if (scroll) {
            const section = getProfileScrollTarget(targetTab);
            if (section) {
                requestAnimationFrame(() => {
                    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                });
            }
        }
    }

    function applyInitialProfileTabFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const tabParam = urlParams.get('tab');
        const hashParam = (window.location.hash || '').replace(/^#/, '').trim();
        const requestedTab = tabParam || hashParam;

        if (requestedTab) {
            const initialTab = resolveProfileTabKey(requestedTab);
            activateProfileTab(initialTab || 'dashboard-overview', { scroll: Boolean(initialTab) });

            // Strip ?tab= (and hash) so reload always lands on clean /profile → Dashboard
            window.history.replaceState({}, document.title, window.location.pathname);
        } else {
            activateProfileTab('dashboard-overview');
        }
    }

    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            activateProfileTab(item.getAttribute('data-tab'));
            window.history.replaceState({}, document.title, '/profile');
        });
    });

    const liveSupportNavBtn = document.getElementById('live-support-nav-btn');
    if (liveSupportNavBtn) {
        liveSupportNavBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (isMobileProfileLayout()) closeProfileDrawer();
            if (window.OrderChat && typeof window.OrderChat.openGeneral === 'function') {
                liveSupportNavBtn.disabled = true;
                try {
                    await window.OrderChat.openGeneral();
                } finally {
                    liveSupportNavBtn.disabled = false;
                }
            }
        });
    }

    const headerCartBtn = document.querySelector('.cart-badge-container[data-tab="my-cart"]');
    if (headerCartBtn) {
        headerCartBtn.addEventListener('click', (e) => {
            e.preventDefault();
            activateProfileTab('my-cart', { scroll: true });
            window.history.replaceState({}, document.title, '/profile');
        });
    }

    applyInitialProfileTabFromUrl();

    window.profileAuthToken = token;
    window.profileCurrentUser = currentUser;
    window.profileCurrentUserId = currentUserId;
    window.profileEscapeHtml = escapeHtml;
    window.profileSafeImg = safeImg;
    window.profileBindImgFallback = bindImgFallback;
    window.profileSetAvatarSrc = setAvatarSrc;
    window.profileImagePlaceholder = IMAGE_PLACEHOLDER;
    window.profileAvatarPlaceholder = AVATAR_PLACEHOLDER;
    window.profileImgOnerror = IMG_ONERROR;
    window.profileShowToast = showToast;
    window.profileShowInlineFeedback = showInlineFeedback;


Object.assign(window, {
    isInvalidImageValue,
    safeImg,
    bindImgFallback,
    setAvatarSrc,
    buildProfileTabHeader,
    showInlineFeedback,
    updateSecurityContactDisplays,
    showToast,
    initTheme,
    isMobileProfileLayout,
    setProfileDrawerOpen,
    openProfileDrawer,
    closeProfileDrawer,
    toggleProfileDrawer,
    resolveProfileTabKey,
    getProfileScrollTarget,
    renderProfileCartSection,
    refreshTabData,
    activateProfileTab,
    applyInitialProfileTabFromUrl
});

});
