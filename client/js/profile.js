/**
 * File Name: profile.js
 * Location: client/js/profile.js
 * Description: Advanced Frontend Controller for EonlineBazar User Dashboard
 * Developer: Abdul Karim
 */

document.addEventListener('DOMContentLoaded', () => {
    // =================================================================
    // ১. গ্লোবাল ভেরিয়েবল এবং টোকেন ভেরিফিকেশন (Initialization & Security)
    // =================================================================
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
    
    const profileForm = document.getElementById('profile-form');
    const profileName = document.getElementById('profile-name');
    const profileEmail = document.getElementById('profile-email');
    const profilePhone = document.getElementById('profile-phone');
    const profileGender = document.getElementById('profile-gender');
    const profileDob = document.getElementById('profile-dob');
    const profileDistrict = document.getElementById('profile-district');
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
    const requestEmailOtpBtn = document.getElementById('request-email-otp-btn');
    const requestPhoneOtpBtn = document.getElementById('request-phone-otp-btn');

    let pendingContactUpdate = { type: null, maskedDestination: '', expiresAt: null };
    let contactOtpTimerInterval = null;
    
    const ordersListTbody = document.getElementById('orders-list-tbody');
    const mainBalanceAmount = document.getElementById('main-balance-amount');
    const mainPointsAmount = document.getElementById('main-points-amount');
    const logoutBtn = document.getElementById('logout-btn');

    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    
    // এইচটিএমএল-এর 'id="mobile-menu-toggle"' এর সাথে মিল রেখে পরিবর্তন করা হলো
    const mobileToggleBtn = document.getElementById('mobile-menu-toggle'); 
    const sidebar = document.querySelector('.sidebar');
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
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-wrapper';
            document.body.appendChild(container);
        }
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        let icon = type === 'danger' ? 'fa-circle-exclamation' : (type === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-check');
        toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'toastSlideIn 0.3s ease reverse forwards';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
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
    // ৪. মোবাইল ড্রয়ার টগল লজিক (Responsive Drawer)
    // =================================================================
    if (mobileToggleBtn && sidebar) {
        mobileToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('open');
            console.log("৩-লাইন বাটনে ক্লিক হয়েছে, সাইডবার টগল করা হলো।"); // টেস্টিং এর জন্য
        });
        
        document.addEventListener('click', (e) => {
            if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== mobileToggleBtn) {
                sidebar.classList.remove('open');
            }
        });
    } else {
        console.error("মোবাইল টগল বাটন অথবা সাইডবার এলিমেন্ট খুঁজে পাওয়া যায়নি!");
    }

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

    function refreshTabData(targetTab) {
        if (['my-orders', 'dashboard-overview'].includes(targetTab) && typeof fetchUserOrders === 'function') {
            fetchUserOrders();
        }
        if (targetTab === 'dashboard-overview' && typeof fetchDashboardStats === 'function') {
            fetchDashboardStats();
        }
        if (targetTab === 'my-cart') {
            if (typeof fetchLiveDBCart === 'function') fetchLiveDBCart();
            if (typeof fetchWishlist === 'function') fetchWishlist();
        }
        if (targetTab === 'addresses-settings' && typeof fetchAddresses === 'function') fetchAddresses();
        if (targetTab === 'security-settings' && typeof fetchSessions === 'function') fetchSessions();
        if (targetTab === 'wallet-points' && typeof fetchWalletData === 'function') fetchWalletData();
    }

    function updateTopBackButton(activeTabName) {
        const backBtn = document.querySelector('.top-back-btn') || document.getElementById('profile-back-link');
        if (!backBtn) return;

        const isDashboard = !activeTabName
            || activeTabName === 'dashboard-overview'
            || activeTabName === 'dashboard';

        if (isDashboard) {
            backBtn.textContent = '← Back to Home';
            backBtn.setAttribute('href', '/');
            backBtn.setAttribute('aria-label', 'Back to Home');
            backBtn.onclick = null;
            return;
        }

        backBtn.textContent = '← Back to Dashboard';
        backBtn.setAttribute('href', '/profile');
        backBtn.setAttribute('aria-label', 'Back to Dashboard');
        backBtn.onclick = function (e) {
            e.preventDefault();
            activateProfileTab('dashboard-overview', { scroll: true });
            window.history.pushState({}, document.title, '/profile');
        };
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

        if (window.innerWidth <= 768 && sidebar) sidebar.classList.remove('open');

        refreshTabData(targetTab);

        if (scroll) {
            const section = getProfileScrollTarget(targetTab);
            if (section) {
                requestAnimationFrame(() => {
                    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                });
            }
        }

        updateTopBackButton(targetTab);
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
        });
    });

    applyInitialProfileTabFromUrl();

    const defaultActiveTab = document.querySelector('.tab-content.active');
    updateTopBackButton(defaultActiveTab ? defaultActiveTab.id : 'dashboard-overview');

    // =================================================================
    // ৬. ইউজারের প্রোфাইল ডাটা ফেচ করা (Fetch Profile & Auto-Cache)
    // =================================================================
    // =================================================================
    // 5.5 Profile address cascading (District -> Upazila)
    // =================================================================
    function populateProfileDistrictOptions(selectedDistrict = '') {
        if (!profileDistrict || !Array.isArray(window.BANGLADESH_DISTRICTS)) return;

        profileDistrict.innerHTML = '<option value="">Select district</option>';
        window.BANGLADESH_DISTRICTS.forEach((district) => {
            const option = document.createElement('option');
            option.value = district;
            option.textContent = district;
            profileDistrict.appendChild(option);
        });

        if (selectedDistrict) profileDistrict.value = selectedDistrict;
    }

    function populateProfileUpazilaOptions(district, selectedUpazila = '') {
        if (!profileUpazila) return;

        profileUpazila.innerHTML = '<option value="">Select upazila / thana</option>';
        const upazilas = typeof window.getUpazilasForDistrict === 'function'
            ? window.getUpazilasForDistrict(district)
            : [];

        if (!district || upazilas.length === 0) {
            profileUpazila.disabled = true;
            return;
        }

        upazilas.forEach((upazila) => {
            const option = document.createElement('option');
            option.value = upazila;
            option.textContent = upazila;
            profileUpazila.appendChild(option);
        });

        profileUpazila.disabled = false;
        if (selectedUpazila) profileUpazila.value = selectedUpazila;
    }

    function buildCompositeAddress({ fullAddress = '', upazila = '', district = '' } = {}) {
        return [fullAddress, upazila, district].filter(Boolean).join(', ');
    }

    function formatDateForInput(dateValue) {
        if (!dateValue) return '';
        const parsed = new Date(dateValue);
        if (Number.isNaN(parsed.getTime())) return '';
        const year = parsed.getFullYear();
        const month = String(parsed.getMonth() + 1).padStart(2, '0');
        const day = String(parsed.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function isValidProfileDob(value) {
        if (!value) return true;
        const dob = new Date(value);
        if (Number.isNaN(dob.getTime())) return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const minAgeDate = new Date(today.getFullYear() - 120, today.getMonth(), today.getDate());
        return dob <= today && dob >= minAgeDate;
    }

    function cacheProfileAddressForCheckout(user = {}) {
        const composite = buildCompositeAddress({
            fullAddress: user.fullAddress || '',
            upazila: user.upazila || user.thana || '',
            district: user.district || ''
        }) || user.address || '';

        localStorage.setItem('checkout_name', user.name || '');
        localStorage.setItem('checkout_phone', user.phone || user.mobile || '');
        localStorage.setItem('checkout_address', composite);
        localStorage.setItem('checkout_district', user.district || '');
        localStorage.setItem('checkout_upazila', user.upazila || user.thana || '');
        localStorage.setItem('checkout_full_address', user.fullAddress || '');
        localStorage.setItem('shippingDistrict', user.district || '');
    }

    function applyProfileAddressToUI(user = {}) {
        const district = user.district || '';
        const upazila = user.upazila || user.thana || '';
        const fullAddress = user.fullAddress || '';

        populateProfileDistrictOptions(district);
        populateProfileUpazilaOptions(district, upazila);

        if (profileFullAddress) profileFullAddress.value = fullAddress;
        if (profileAddress) {
            profileAddress.value = buildCompositeAddress({ fullAddress, upazila, district }) || user.address || '';
        }
    }

    populateProfileDistrictOptions();

    if (profileDistrict) {
        profileDistrict.addEventListener('change', () => {
            populateProfileUpazilaOptions(profileDistrict.value);
        });
    }

    async function fetchUserProfile() {
        try {
            const res = await fetch('/api/customer/profile', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await res.json();

            if (res.ok) {
                if (sidebarName) sidebarName.textContent = data.name || 'User';
                if (sidebarEmail) sidebarEmail.textContent = data.email || '';
                
                // সাইডবার এবং টপ নেভবার উভয় জায়গায় অবতার আপডেট
                if (data.avatar) {
                    if (sidebarAvatar) sidebarAvatar.src = data.avatar;
                    if (navAvatar) navAvatar.src = data.avatar;
                }

                if (profileName) profileName.value = data.name || '';
                if (profileEmail) profileEmail.value = data.email || '';
                if (profilePhone) profilePhone.value = data.phone || data.mobile || '';
                updateSecurityContactDisplays(data);
                if (profileGender) profileGender.value = data.gender || '';
                if (profileDob) profileDob.value = formatDateForInput(data.dateOfBirth);
                applyProfileAddressToUI(data);

                const displayNameEls = document.querySelectorAll('.user-display-name');
                displayNameEls.forEach(el => {
                    el.textContent = data.name || 'User';
                });

                // ওয়ালেট ও পয়েন্ট ডিসপ্লে আপডেট (Wallet tab)
                updateWalletDisplay(data.walletBalance || 0, data.loyaltyPoints || 0);
                renderCashbackHistory(data.walletHistory || []);
                applyRewardSettingsUI(data.rewardSettings);

                cacheProfileAddressForCheckout(data);

            } else {
                showToast(data.message || 'Failed to load profile.', 'danger');
            }
        } catch (error) {
            console.error('Fetch Profile Error:', error);
            showToast('Server error while loading profile.', 'danger');
        }
    }

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
            processing: 'processing',
            shipped: 'shipped',
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

    function buildOrderThumbnailHtml(items) {
        const PT = window.ProductThumbnail;
        const safeItems = Array.isArray(items) ? items : [];
        const first = safeItems[0] || {};
        const moreCount = Math.max(0, safeItems.length - 1);
        const badge = moreCount > 0
            ? `<span class="order-card-more-badge">+${moreCount}</span>`
            : '';

        const media = PT
            ? PT.buildThumbnailHtml(first, { variant: 'compact', loading: 'lazy', escapeHtml })
            : '';

        return `<div class="order-card-thumb-wrap">${media}${badge}</div>`;
    }

    function buildOrderPreviewHtml(items, grandTotal) {
        const safeItems = Array.isArray(items) ? items : [];
        const thumb = buildOrderThumbnailHtml(safeItems);
        const totalBlock = `<div class="order-card-total-mobile"><span class="order-total-amount">৳${Number(grandTotal || 0).toLocaleString()}</span></div>`;

        if (safeItems.length === 0) {
            return `<div class="order-card-body">${thumb}<div class="order-card-product-info"><span class="order-card-product-name">Unknown Item</span></div>${totalBlock}</div>`;
        }

        const first = safeItems[0];
        const name = first.name || 'Unknown Item';
        const qty = first.quantity || first.qty || 1;
        const moreCount = safeItems.length - 1;
        const moreText = moreCount > 0
            ? `<span class="order-card-more-text">+${moreCount} more item${moreCount > 1 ? 's' : ''}</span>`
            : '';

        return `<div class="order-card-body">
            ${thumb}
            <div class="order-card-product-info">
                <span class="order-card-product-name">${escapeHtml(name)}</span>
                <span class="order-card-product-meta">
                    <span class="order-card-product-qty">×${qty}</span>
                    ${moreText}
                </span>
            </div>
            ${totalBlock}
        </div>`;
    }

    function buildOrderActionsHtml(order) {
        const orderId = order._id || order.orderId || '';
        const displayOrderId = getDisplayOrderId(order);
        const status = String(order.status || 'Pending').toLowerCase();
        const buttons = [];

        buttons.push(`<button type="button" class="order-action-btn btn-order-invoice" data-id="${escapeHtml(orderId)}" data-invoice-id="${escapeHtml(displayOrderId)}" data-action="invoice" title="Download invoice PDF">
            <i class="fa-solid fa-file-pdf" aria-hidden="true"></i><span>Invoice</span>
        </button>`);

        if (status === 'pending') {
            buttons.push(`<button type="button" class="order-action-btn btn-order-cancel order-action-btn--compact" data-id="${escapeHtml(orderId)}" data-action="cancel" title="Cancel this order">
                <span>Cancel</span>
            </button>`);
        }

        if (isWithinReturnWindow(order)) {
            buttons.push(`<button type="button" class="order-action-btn btn-order-return order-action-btn--desktop-only" data-id="${escapeHtml(orderId)}" data-action="return" title="Request a return">
                <i class="fa-solid fa-rotate-left" aria-hidden="true"></i><span>Return</span>
            </button>`);
        }

        return `<div class="order-actions-cell">${buttons.join('')}</div>`;
    }

    function buildOrderRowHtml(order) {
        const orderDate = formatOrderDate(order.createdAt);
        const currentStatus = order.status || 'Pending';
        const statusBadgeClass = getStatusBadgeClass(currentStatus);
        const displayOrderId = getDisplayOrderId(order);
        const orderId = order._id || '';
        const grandTotal = Number(order.grandTotal ?? order.totalAmount) || 0;
        const previewHtml = buildOrderPreviewHtml(order.items, grandTotal);
        const actionsHtml = buildOrderActionsHtml(order);
        const actionsCellClass = actionsHtml
            ? 'order-actions-td order-card-actions-cell'
            : 'order-actions-td order-card-actions-cell order-card-actions-cell--empty';

        return `
            <tr class="clickable-order-row order-card-row" data-id="${escapeHtml(orderId)}" tabindex="0" role="link" aria-label="View order #${escapeHtml(displayOrderId)}">
                <td class="order-card-id-cell" data-label="Order ID"><span class="order-id-link">#${escapeHtml(displayOrderId)}</span></td>
                <td class="order-card-date-cell" data-label="Date"><span class="order-card-date-text">${orderDate}</span></td>
                <td class="order-card-preview-cell" data-label="Products">${previewHtml}</td>
                <td class="order-total-cell order-card-total-cell order-card-total-desktop" data-label="Total Amount"><span class="order-total-amount">৳${grandTotal.toLocaleString()}</span></td>
                <td class="order-card-status-cell" data-label="Status"><span class="status-badge ${statusBadgeClass}">${escapeHtml(currentStatus)}</span></td>
                <td class="${actionsCellClass}" data-label="Actions">${actionsHtml}</td>
            </tr>
        `;
    }

    // Legacy helper kept for any inline references — preview renderer replaces stacked list in order cards.
    function buildOrderItemsHtml(items, order = {}) {
        const total = Number(order.grandTotal ?? order.totalAmount) || 0;
        return buildOrderPreviewHtml(items, total);
    }

    // =================================================================
    // ৬.১ ড্যাশবোর্ড স্ট্যাটাস ফেচ করা (Fetch Dashboard Stats)
    // =================================================================
    async function fetchDashboardStats() {
        try {
            console.log("ড্যাশবোর্ড ফেচ রিকোয়েস্ট পাঠানো হচ্ছে...");
            
            const res = await fetch('/api/orders/dashboard-stats', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const rawData = await res.json();
            console.log("সার্ভার থেকে পাওয়া আসল ডাটা:", rawData);

            if (res.ok && rawData.success) {
                const totalOrdersEl = document.getElementById('stat-total-orders');
                const pendingOrdersEl = document.getElementById('stat-pending-orders');
                const balanceEl = document.getElementById('stat-wallet-balance');
                const pointsEl = document.getElementById('stat-loyalty-points');

                if (totalOrdersEl) {
                    totalOrdersEl.textContent = (rawData.totalOrders !== undefined) ? rawData.totalOrders : (rawData.data?.totalOrders || 0);
                }
                if (pendingOrdersEl) {
                    pendingOrdersEl.textContent = (rawData.pendingOrders !== undefined) ? rawData.pendingOrders : (rawData.data?.pendingOrders || 0);
                }
                if (balanceEl) {
                    const currentBalance = (rawData.balance !== undefined) ? rawData.balance : (rawData.data?.balance || 0);
                    balanceEl.textContent = '৳' + currentBalance.toLocaleString();
                }
                if (pointsEl) {
                    pointsEl.textContent = (rawData.loyaltyPoints !== undefined) ? rawData.loyaltyPoints : (rawData.data?.loyaltyPoints || 0);
                }
                
                const dashboardTableBody = document.getElementById('dashboard-orders-tbody'); 
                
                if (dashboardTableBody) {
                    const recentOrders = rawData.recentOrders || rawData.data?.recentOrders || [];

                    if (recentOrders.length === 0) {
                        dashboardTableBody.innerHTML = `<tr class="orders-state-row"><td colspan="6" class="text-center orders-empty-cell"><i class="fa-solid fa-box-open orders-empty-icon"></i>No recent orders yet.</td></tr>`;
                    } else {
                        dashboardTableBody.innerHTML = recentOrders.map(order => buildOrderRowHtml(order)).join('');
                    }
                }

            } else {
                console.error("সার্ভার রেসপন্স ওকে নয়:", rawData.message);
            }
        } catch (error) {
            console.error('Error fetching dashboard stats:', error);
        }
    }

    // =================================================================
    // ৭. প্রোফাইল ইনফরমেশন আপডেট করা (Update Profile Details)
    // =================================================================
    if (profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const district = profileDistrict?.value?.trim() || '';
            const upazila = profileUpazila?.value?.trim() || '';
            const fullAddress = profileFullAddress?.value?.trim() || '';
            const gender = profileGender?.value || '';
            const dateOfBirth = profileDob?.value || '';

            if (dateOfBirth && !isValidProfileDob(dateOfBirth)) {
                showToast('Please enter a valid date of birth.', 'warning');
                return;
            }

            if (!district) {
                showToast('Please select your district.', 'warning');
                return;
            }
            if (!upazila) {
                showToast('Please select your upazila / thana.', 'warning');
                return;
            }
            if (!fullAddress) {
                showToast('Please enter your village, street, or house details.', 'warning');
                return;
            }

            const updatedData = {
                name: profileName.value.trim(),
                gender,
                dateOfBirth,
                district,
                upazila,
                thana: upazila,
                fullAddress,
                address: buildCompositeAddress({ fullAddress, upazila, district })
            };

            if (!updatedData.name) {
                showToast('Full Name is required!', 'warning');
                return;
            }

            try {
                const submitBtn = profileForm.querySelector('button[type="submit"]');
                const originalText = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...';
                submitBtn.disabled = true;

                const res = await fetch('/api/customer/update-profile', {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(updatedData)
                });

                const data = await res.json();

                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;

                if (res.ok) {
                    showToast('Profile updated successfully!', 'success');
                    const user = data.user || data;
                    if (sidebarName) sidebarName.textContent = user.name || updatedData.name;
                    if (profileGender) profileGender.value = user.gender || gender || '';
                    if (profileDob) profileDob.value = formatDateForInput(user.dateOfBirth || dateOfBirth);
                    applyProfileAddressToUI(user);
                    cacheProfileAddressForCheckout(user);
                } else {
                    showToast(data.message || 'Update failed.', 'danger');
                }
            } catch (error) {
                console.error('Update Profile Error:', error);
                showToast('Server error during update.', 'danger');
                
                const submitBtn = profileForm.querySelector('button[type="submit"]');
                if(submitBtn) {
                    submitBtn.innerHTML = '<i class="fa-regular fa-floppy-disk"></i> <span>Update Profile</span>';
                    submitBtn.disabled = false;
                }
            }
        });
    }







// =================================================================
    // ৮. প্রোফাইল ছবি/অবতার আপলোড লজিক (Avatar Upload & Preview)
    // =================================================================
    if (avatarInput) {
        avatarInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (file.size > 5 * 1024 * 1024) {
                showToast('Image size should be less than 5MB', 'warning');
                return;
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                if (sidebarAvatar) sidebarAvatar.src = event.target.result;
                if (navAvatar) navAvatar.src = event.target.result; 
            };
            reader.readAsDataURL(file);

            const formData = new FormData();
            formData.append('avatar', file);

            try {
                showToast('Uploading image...', 'warning');
                
                const res = await fetch('/api/customer/update-avatar', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });

                const data = await res.json();

                if (res.ok) {
                    showToast('Profile picture updated successfully!', 'success');
                    if (sidebarAvatar) sidebarAvatar.src = data.avatarUrl; 
                    if (navAvatar) navAvatar.src = data.avatarUrl; 
                } else {
                    showToast(data.message || 'Avatar upload failed.', 'danger');
                }
            } catch (error) {
                console.error('Avatar Upload Error:', error);
                showToast('Server error while uploading photo.', 'danger');
            }
        });
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
    async function fetchUserOrders() {
        if (!ordersListTbody) return;
        
        try {
            ordersListTbody.innerHTML = `<tr class="orders-state-row"><td colspan="6" class="text-center orders-loading-cell"><i class="fa-solid fa-spinner fa-spin orders-loading-icon"></i><br><br>Loading your orders...</td></tr>`;

            const res = await fetch('/api/orders/my-orders', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache' 
                }
            });

            const rawData = await res.json();

            if (res.ok) {
                ordersListTbody.innerHTML = ''; 

                let orderList = rawData.data || rawData.orders || (Array.isArray(rawData) ? rawData : []);

                if (!orderList || orderList.length === 0) {
                    ordersListTbody.innerHTML = `<tr class="orders-state-row"><td colspan="6" class="text-center orders-empty-cell"><i class="fa-solid fa-box-open orders-empty-icon"></i><br>You haven't placed any orders yet.</td></tr>`;
                    return;
                }

                orderList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                ordersListTbody.innerHTML = orderList.map(order => buildOrderRowHtml(order)).join('');

            } else {
                ordersListTbody.innerHTML = `<tr class="orders-state-row"><td colspan="6" class="text-center orders-error-cell"><i class="fa-solid fa-triangle-exclamation"></i> Failed to load orders. (${escapeHtml(rawData.message || 'Error')})</td></tr>`;
            }
        } catch (error) {
            console.error('Fetch Orders Error:', error);
            ordersListTbody.innerHTML = `<tr class="orders-state-row"><td colspan="6" class="text-center orders-error-cell"><i class="fa-solid fa-server"></i> Server connection error.</td></tr>`;
        }
    }

    // =================================================================
    // ১০. রিভিউ মডাল ও স্টার সাবমিশন লজিক (Review Modal & Rating)
    // =================================================================
    const reviewModal = document.getElementById('review-modal');
    const closeReviewBtn = document.getElementById('close-review-modal');
    const reviewForm = document.getElementById('review-form');
    const reviewProductIdInput = document.getElementById('review-product-id');
    const reviewOrderIdInput = document.getElementById('review-order-id');
    const reviewProductNameEl = document.getElementById('review-modal-product-name');
    const reviewPhotoInput = document.getElementById('review-photo');
    const reviewPhotoLabel = document.getElementById('review-photo-label');
    const reviewPhotoPreview = document.getElementById('review-photo-preview');
    const submitReviewBtn = document.getElementById('submit-review-btn');

    function closeReviewModal() {
        if (reviewModal) reviewModal.classList.add('hidden');
    }

    if (closeReviewBtn && reviewModal) {
        closeReviewBtn.addEventListener('click', closeReviewModal);
    }

    window.addEventListener('click', (e) => {
        if (e.target === reviewModal) closeReviewModal();
    });

    // রিভিউ মডাল রিসেট করার হেল্পার
    function resetReviewForm() {
        if (reviewForm) reviewForm.reset();
        document.querySelectorAll('input[name="rating"]').forEach(r => { r.checked = false; });
        if (reviewPhotoLabel) reviewPhotoLabel.textContent = 'Click to upload a product photo';
        if (reviewPhotoPreview) {
            reviewPhotoPreview.innerHTML = '';
            reviewPhotoPreview.classList.add('hidden');
        }
        if (submitReviewBtn) {
            submitReviewBtn.innerHTML = '<i class="fa-regular fa-paper-plane"></i> Submit Review';
            submitReviewBtn.disabled = false;
        }
    }

    // ⭐ ডেলিভার্ড প্রোডাক্টের "Write Review" বাটন থেকে মডাল ওপেন করা + আগের রিভিউ প্রি-লোড
    async function openReviewModal(orderId, productId, productName) {
        if (!reviewModal) return;

        resetReviewForm();
        if (reviewProductIdInput) reviewProductIdInput.value = productId || '';
        if (reviewOrderIdInput) reviewOrderIdInput.value = orderId || '';
        if (reviewProductNameEl) reviewProductNameEl.textContent = productName || 'Product';
        reviewModal.classList.remove('hidden');

        // এই নির্দিষ্ট অর্ডার+প্রোডাক্টের জন্য ইউজারের আগের রিভিউ থাকলে সেটি এডিট মোডে লোড হবে
        try {
            const query = `?orderId=${encodeURIComponent(orderId)}${currentUserId ? `&userId=${encodeURIComponent(currentUserId)}` : ''}`;
            const res = await fetch(`/api/reviews/${productId}${query}`);
            const data = await res.json();

            if (data.success && Array.isArray(data.reviews) && data.reviews.length > 0) {
                const myReview = data.reviews.find(r =>
                    String(r.productId) === String(productId)
                ) || data.reviews[0];

                if (myReview) {
                    const ratingRadio = document.getElementById(`star${myReview.rating}`);
                    if (ratingRadio) ratingRadio.checked = true;

                    const commentInput = document.getElementById('review-comment');
                    if (commentInput) commentInput.value = myReview.comment || '';

                    if (submitReviewBtn) submitReviewBtn.innerHTML = '<i class="fa-regular fa-pen-to-square"></i> Update Review';

                    if (myReview.photo && reviewPhotoPreview) {
                        reviewPhotoPreview.innerHTML = `
                            <span class="review-photo-preview-label">Previously uploaded photo:</span>
                            <img src="${escapeHtml(myReview.photo)}" alt="Your review photo">`;
                        reviewPhotoPreview.classList.remove('hidden');
                    }
                }
            }
        } catch (err) {
            console.error('Error loading existing review:', err);
        }
    }

    // "Write Review" বাটনে ক্লিক (ইভেন্ট ডেলিগেশন — ডায়নামিক রো সাপোর্ট করে)
    document.addEventListener('click', (e) => {
        const reviewBtn = e.target.closest('.btn-write-review');
        if (!reviewBtn) return;
        e.preventDefault();
        // রিভিউ বাটন অর্ডার-রো'র ভেতরে থাকায় রো-ক্লিক নেভিগেশন আটকানো হচ্ছে
        e.stopImmediatePropagation();
        openReviewModal(
            reviewBtn.getAttribute('data-order-id'),
            reviewBtn.getAttribute('data-product-id'),
            reviewBtn.getAttribute('data-product-name')
        );
    });

    // ফটো সিলেক্ট করলে প্রিভিউ দেখানো
    if (reviewPhotoInput) {
        reviewPhotoInput.addEventListener('change', () => {
            const file = reviewPhotoInput.files[0];
            if (!file) return;

            if (file.size > 5 * 1024 * 1024) {
                showToast('Image size should be less than 5MB.', 'warning');
                reviewPhotoInput.value = '';
                return;
            }

            if (reviewPhotoLabel) reviewPhotoLabel.textContent = file.name;
            if (reviewPhotoPreview) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    reviewPhotoPreview.innerHTML = `<img src="${ev.target.result}" alt="Selected photo">`;
                    reviewPhotoPreview.classList.remove('hidden');
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // 🌟 রিভিউ সাবমিট — ভেরিফায়েড রিভিউ কন্ট্রোলারে (/api/reviews) ক্লিনভাবে কানেক্ট করা
    if (reviewForm) {
        reviewForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const productId = reviewProductIdInput ? reviewProductIdInput.value : '';
            const orderId = reviewOrderIdInput ? reviewOrderIdInput.value : '';
            const commentInput = document.getElementById('review-comment');
            const comment = commentInput ? commentInput.value.trim() : '';
            const selectedRatingInput = document.querySelector('input[name="rating"]:checked');

            if (!orderId || !productId) {
                showToast('Missing order or product reference. Please reopen the review form.', 'danger');
                return;
            }
            if (!selectedRatingInput) {
                showToast('Please select a star rating!', 'warning');
                return;
            }
            if (!comment) {
                showToast('Please write a short review before submitting.', 'warning');
                return;
            }

            const rating = selectedRatingInput.value;
            const submitBtn = reviewForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;

            try {
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';
                submitBtn.disabled = true;

                // FormData ব্যবহার — কারণ রিভিউ কন্ট্রোলার ছবি (multipart) সাপোর্ট করে
                const formData = new FormData();
                formData.append('orderId', orderId);
                formData.append('productId', productId);
                formData.append('rating', rating);
                formData.append('comment', comment);
                if (reviewPhotoInput && reviewPhotoInput.files.length > 0) {
                    formData.append('photo', reviewPhotoInput.files[0]);
                }

                const res = await fetch('/api/reviews', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }, // Content-Type নয় — ব্রাউজার boundary সেট করবে
                    body: formData
                });

                const data = await res.json();

                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;

                if (res.ok && data.success) {
                    showToast(data.message || 'Thank you! Your review has been submitted.', 'success');
                    closeReviewModal();
                    resetReviewForm();
                } else {
                    showToast(data.message || 'Submission failed.', 'danger');
                }
            } catch (error) {
                console.error('Submit Review Error:', error);
                showToast('Server error while submitting review.', 'danger');
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        });
    }

    // =================================================================
    // ১১. সিকিউরিটি এবং পাসওয়ার্ড আপডেট লজিক (Security & Password)
    // =================================================================
    function setButtonLoading(btn, loading, loadingHtml) {
        if (!btn) return;
        if (loading) {
            if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
            btn.innerHTML = loadingHtml;
            btn.disabled = true;
        } else {
            btn.innerHTML = btn.dataset.originalHtml || btn.innerHTML;
            btn.disabled = false;
        }
    }

    if (passwordForm) {
        passwordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            showInlineFeedback(passwordFeedback, '');

            const currentPassword = document.getElementById('current-password').value;
            const newPassword = document.getElementById('new-password').value;
            const confirmPassword = document.getElementById('confirm-password').value;

            if (!currentPassword) {
                showInlineFeedback(passwordFeedback, 'Please enter your current password.', 'error');
                return;
            }

            if (newPassword.length < 6) {
                showInlineFeedback(passwordFeedback, 'New password must be at least 6 characters.', 'error');
                return;
            }

            if (newPassword !== confirmPassword) {
                showInlineFeedback(passwordFeedback, 'Confirm password does not match.', 'error');
                return;
            }

            const submitBtn = passwordForm.querySelector('button[type="submit"]');

            try {
                setButtonLoading(submitBtn, true, '<i class="fa-solid fa-spinner fa-spin"></i> Updating...');

                const res = await fetch('/api/customer/profile/change-password', {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
                });

                const data = await res.json();
                setButtonLoading(submitBtn, false);

                if (res.ok && data.success) {
                    showInlineFeedback(passwordFeedback, data.message || 'Password updated successfully!', 'success');
                    showToast(data.message || 'Password updated successfully!', 'success');
                    passwordForm.reset();
                } else {
                    showInlineFeedback(passwordFeedback, data.message || 'Failed to change password.', 'error');
                }
            } catch (error) {
                console.error('Change Password Error:', error);
                setButtonLoading(submitBtn, false);
                showInlineFeedback(passwordFeedback, 'Server error during password update.', 'error');
            }
        });
    }

    document.querySelectorAll('.toggle-password').forEach((icon) => {
        icon.addEventListener('click', () => {
            const targetId = icon.getAttribute('data-target');
            const passwordInput = targetId ? document.getElementById(targetId) : null;
            if (!passwordInput) return;

            const show = passwordInput.type === 'password';
            passwordInput.type = show ? 'text' : 'password';
            icon.classList.toggle('fa-eye-slash', !show);
            icon.classList.toggle('fa-eye', show);
        });
    });

    // --- Contact update OTP flow ---
    function clearContactOtpTimer() {
        if (contactOtpTimerInterval) {
            clearInterval(contactOtpTimerInterval);
            contactOtpTimerInterval = null;
        }
    }

    function resetContactOtpCells() {
        document.querySelectorAll('#contactOtpInputs .otp-cell').forEach((cell) => {
            cell.value = '';
            cell.classList.remove('filled', 'error');
        });
    }

    function collectContactOtp() {
        return Array.from(document.querySelectorAll('#contactOtpInputs .otp-cell'))
            .map((cell) => cell.value.trim())
            .join('');
    }

    function initContactOtpInputs() {
        const cells = Array.from(document.querySelectorAll('#contactOtpInputs .otp-cell'));
        const wrap = document.getElementById('contactOtpInputs');
        if (!cells.length) return;

        cells.forEach((cell, index) => {
            cell.addEventListener('input', () => {
                cell.value = cell.value.replace(/\D/g, '').slice(0, 1);
                cell.classList.toggle('filled', !!cell.value);
                if (cell.value && index < cells.length - 1) cells[index + 1].focus();
                if (collectContactOtp().length === 6 && contactOtpForm) {
                    contactOtpForm.requestSubmit();
                }
            });

            cell.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !cell.value && index > 0) {
                    cells[index - 1].focus();
                }
            });

            cell.addEventListener('paste', (e) => {
                e.preventDefault();
                const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
                pasted.split('').forEach((digit, i) => {
                    if (cells[i]) {
                        cells[i].value = digit;
                        cells[i].classList.add('filled');
                    }
                });
                if (pasted.length === 6 && contactOtpForm) contactOtpForm.requestSubmit();
            });
        });

        if (wrap) {
            wrap.addEventListener('animationend', () => wrap.classList.remove('shake'));
        }
    }

    function startContactOtpTimer(expiresAt) {
        clearContactOtpTimer();
        if (!contactOtpTimer) return;

        function tick() {
            const remainingMs = expiresAt - Date.now();
            if (remainingMs <= 0) {
                contactOtpTimer.textContent = 'Code expired — request a new OTP.';
                contactOtpTimer.classList.add('expired');
                clearContactOtpTimer();
                return;
            }
            const mins = Math.floor(remainingMs / 60000);
            const secs = Math.floor((remainingMs % 60000) / 1000);
            contactOtpTimer.textContent = `Expires in ${mins}:${String(secs).padStart(2, '0')}`;
            contactOtpTimer.classList.remove('expired');
        }

        tick();
        contactOtpTimerInterval = setInterval(tick, 1000);
    }

    function closeContactOtpModal() {
        if (contactOtpModal) contactOtpModal.classList.add('hidden');
        showInlineFeedback(contactOtpFeedback, '');
        resetContactOtpCells();
        clearContactOtpTimer();
        pendingContactUpdate = { type: null, maskedDestination: '', expiresAt: null };
    }

    function openContactOtpModal(type, maskedDestination) {
        if (!contactOtpModal) return;
        pendingContactUpdate.type = type;
        pendingContactUpdate.maskedDestination = maskedDestination;
        pendingContactUpdate.expiresAt = Date.now() + 5 * 60 * 1000;

        if (contactOtpSubtext) {
            const channel = type === 'email' ? 'email' : 'phone';
            contactOtpSubtext.innerHTML = `Enter the 6-digit code sent to your ${channel}: <b>${escapeHtml(maskedDestination)}</b>`;
        }

        resetContactOtpCells();
        showInlineFeedback(contactOtpFeedback, '');
        startContactOtpTimer(pendingContactUpdate.expiresAt);
        contactOtpModal.classList.remove('hidden');

        const firstCell = document.querySelector('#contactOtpInputs .otp-cell');
        if (firstCell) firstCell.focus();
    }

    async function requestContactOtp(type) {
        showInlineFeedback(contactFeedback, '');

        const input = type === 'email'
            ? document.getElementById('security-new-email')
            : document.getElementById('security-new-phone');
        const btn = type === 'email' ? requestEmailOtpBtn : requestPhoneOtpBtn;
        const value = input ? input.value.trim() : '';

        if (!value) {
            showInlineFeedback(
                contactFeedback,
                type === 'email' ? 'Please enter a new email address.' : 'Please enter a new phone number.',
                'error'
            );
            return;
        }

        try {
            setButtonLoading(btn, true, '<i class="fa-solid fa-spinner fa-spin"></i>');

            const res = await fetch('/api/customer/profile/request-contact-otp', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ type, value })
            });

            const data = await res.json();
            setButtonLoading(btn, false);

            if (res.ok && data.success) {
                showInlineFeedback(contactFeedback, data.message, 'success');
                showToast(data.message, 'success');
                openContactOtpModal(type, data.maskedDestination || value);
            } else {
                showInlineFeedback(contactFeedback, data.message || 'Could not send verification code.', 'error');
            }
        } catch (error) {
            console.error('Request contact OTP error:', error);
            setButtonLoading(btn, false);
            showInlineFeedback(contactFeedback, 'Server error while sending verification code.', 'error');
        }
    }

    if (requestEmailOtpBtn) {
        requestEmailOtpBtn.addEventListener('click', () => requestContactOtp('email'));
    }
    if (requestPhoneOtpBtn) {
        requestPhoneOtpBtn.addEventListener('click', () => requestContactOtp('mobile'));
    }

    if (contactOtpForm) {
        contactOtpForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            showInlineFeedback(contactOtpFeedback, '');

            const otp = collectContactOtp();
            if (otp.length !== 6) {
                showInlineFeedback(contactOtpFeedback, 'Please enter all 6 digits.', 'error');
                return;
            }

            if (pendingContactUpdate.expiresAt && Date.now() > pendingContactUpdate.expiresAt) {
                showInlineFeedback(contactOtpFeedback, 'Code expired. Please request a new OTP.', 'error');
                return;
            }

            const verifyBtn = document.getElementById('verify-contact-otp-btn');

            try {
                setButtonLoading(verifyBtn, true, '<i class="fa-solid fa-spinner fa-spin"></i> Verifying...');

                const res = await fetch('/api/customer/profile/verify-contact-otp', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ otp })
                });

                const data = await res.json();
                setButtonLoading(verifyBtn, false);

                if (res.ok && data.success) {
                    showToast(data.message, 'success');
                    closeContactOtpModal();

                    const user = data.user || {};
                    if (sidebarEmail) sidebarEmail.textContent = user.email || sidebarEmail.textContent;
                    if (profileEmail) profileEmail.value = user.email || profileEmail.value;
                    if (profilePhone) profilePhone.value = user.phone || user.mobile || profilePhone.value;
                    updateSecurityContactDisplays(user);
                    cacheProfileAddressForCheckout(user);

                    const emailInput = document.getElementById('security-new-email');
                    const phoneInput = document.getElementById('security-new-phone');
                    if (emailInput) emailInput.value = '';
                    if (phoneInput) phoneInput.value = '';

                    if (currentUser) {
                        currentUser.email = user.email || currentUser.email;
                        currentUser.mobile = user.mobile || currentUser.mobile;
                        localStorage.setItem('userInfo', JSON.stringify(currentUser));
                    }
                } else {
                    showInlineFeedback(contactOtpFeedback, data.message || 'Verification failed.', 'error');
                    const wrap = document.getElementById('contactOtpInputs');
                    if (wrap) wrap.classList.add('shake');
                    document.querySelectorAll('#contactOtpInputs .otp-cell').forEach((cell) => cell.classList.add('error'));
                }
            } catch (error) {
                console.error('Verify contact OTP error:', error);
                setButtonLoading(verifyBtn, false);
                showInlineFeedback(contactOtpFeedback, 'Server error during verification.', 'error');
            }
        });
    }

    initContactOtpInputs();

    const closeContactOtpModalBtn = document.getElementById('close-contact-otp-modal');
    const cancelContactOtpBtn = document.getElementById('cancel-contact-otp-btn');
    if (closeContactOtpModalBtn) closeContactOtpModalBtn.addEventListener('click', closeContactOtpModal);
    if (cancelContactOtpBtn) cancelContactOtpBtn.addEventListener('click', closeContactOtpModal);
    if (contactOtpModal) {
        contactOtpModal.addEventListener('click', (e) => {
            if (e.target === contactOtpModal) closeContactOtpModal();
        });
    }

    // =================================================================
    // ১২. লগআউট হ্যান্ডেলার (Secure Logout System with Custom Modal)
    // =================================================================
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // আগের ব্রাউজার অ্যালার্ট রিমুভ করে নতুন কাস্টম মডাল তৈরি করা হচ্ছে
            const overlay = document.createElement('div');
            overlay.id = 'custom-logout-overlay';
            overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 9999; opacity: 0; transition: opacity 0.3s ease; backdrop-filter: blur(3px);';
            
            const modalBox = document.createElement('div');
            modalBox.style.cssText = 'background: var(--bg-color, #ffffff); padding: 30px 25px; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); text-align: center; max-width: 350px; width: 90%; transform: translateY(-20px); transition: transform 0.3s ease; font-family: inherit;';
            
            // মডালের ভেতরের ডিজাইন (আইকন, টেক্সট এবং বাটন)
            modalBox.innerHTML = `
                <div style="width: 65px; height: 65px; background: #fee2e2; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px;">
                    <i class="fa-solid fa-right-from-bracket" style="font-size: 26px; color: #ef4444;"></i>
                </div>
                <h3 style="margin: 0 0 8px; color: var(--text-color, #1e293b); font-size: 22px; font-weight: 700;">Sign Out?</h3>
                <p style="margin: 0 0 25px; color: var(--text-muted, #64748b); font-size: 15px; line-height: 1.5;">Are you sure you want to securely log out of your account?</p>
                <div style="display: flex; gap: 12px; justify-content: center;">
                    <button id="cancel-logout-btn" style="flex: 1; padding: 12px 0; border: none; background: #f1f5f9; color: #475569; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.2s;">Cancel</button>
                    <button id="confirm-logout-btn" style="flex: 1; padding: 12px 0; border: none; background: #ef4444; color: white; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.2s;">Yes, Sign Out</button>
                </div>
            `;
            
            overlay.appendChild(modalBox);
            document.body.appendChild(overlay);
            
            // পপআপ এনিমেশন চালু করা
            setTimeout(() => {
                overlay.style.opacity = '1';
                modalBox.style.transform = 'translateY(0)';
            }, 10);
            
            // মডাল ক্লোজ করার ফাংশন
            function closeLogoutModal() {
                overlay.style.opacity = '0';
                modalBox.style.transform = 'translateY(-20px)';
                setTimeout(() => overlay.remove(), 300);
            }

            // ক্যান্সেল বাটনে ক্লিক করলে
            document.getElementById('cancel-logout-btn').addEventListener('click', closeLogoutModal);
            
            // মডালের বাইরের ফাঁকা জায়গায় ক্লিক করলে
            overlay.addEventListener('click', (e) => {
                if(e.target === overlay) closeLogoutModal();
            });
            
            // কনফার্ম (Yes, Sign Out) বাটনে ক্লিক করলে লগআউট প্রসেস শুরু হবে
            document.getElementById('confirm-logout-btn').addEventListener('click', () => {
                const confirmBtn = document.getElementById('confirm-logout-btn');
                confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Logging out...';
                confirmBtn.style.opacity = '0.8';
                
                // লোকাল স্টোরেজ ক্লিয়ার করা
                localStorage.removeItem('token');
                localStorage.removeItem('customerToken'); 
                localStorage.removeItem('checkout_name');
                localStorage.removeItem('checkout_phone');
                localStorage.removeItem('checkout_address');
                
                showToast('Logged out successfully. Redirecting...', 'success');
                
                // ১.৫ সেকেন্ড পর হোমপেজে পাঠানো
                setTimeout(() => {
                    closeLogoutModal();
                    window.location.href = '/index.html'; 
                }, 1500);
            });
        });
    }

    // =================================================================
    // ১২. ওয়ালেট ও লয়্যালটি পয়েন্ট (Wallet & Points Converter)
    // =================================================================
    let cachedRewardSettings = {
        cashbackPercentage: 1,
        takaToPointsRatio: 100,
        pointsToTakaConversionRate: 10,
        pointsConversionUnit: 100
    };

    function applyRewardSettingsUI(settings) {
        if (!settings) return;
        cachedRewardSettings = { ...cachedRewardSettings, ...settings };

        const unit = Number(cachedRewardSettings.pointsConversionUnit || 100);
        const takaRate = Number(cachedRewardSettings.pointsToTakaConversionRate ?? 10);

        const rateEl = document.getElementById('conversion-rate-text');
        if (rateEl) {
            rateEl.innerHTML = `<i class="fa-solid fa-circle-info"></i> Conversion Rate: ${unit} Points = ৳${takaRate.toLocaleString()} Wallet Balance`;
        }

        const pointsInput = document.getElementById('points-to-convert');
        if (pointsInput) {
            pointsInput.min = unit;
            pointsInput.step = unit;
            pointsInput.placeholder = `Minimum ${unit} points (multiples of ${unit})`;
        }
    }

    function updateWalletDisplay(balance, points) {
        const balanceEl = document.getElementById('main-balance-amount');
        const pointsEl = document.getElementById('current-points-calc');
        if (balanceEl) balanceEl.textContent = '৳' + Number(balance || 0).toLocaleString();
        if (pointsEl) pointsEl.textContent = Number(points || 0).toLocaleString() + ' XP';
    }

    function renderCashbackHistory(history) {
        const list = document.getElementById('cashback-list');
        if (!list) return;
        if (!history || history.length === 0) {
            list.innerHTML = `<li class="history-item empty">No recent cashback transactions.</li>`;
            return;
        }
        list.innerHTML = '';
        history.slice(0, 12).forEach(tx => {
            const date = new Date(tx.date).toLocaleDateString('en-US', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            const txType = String(tx.type || '').toLowerCase();
            const isDeduct = txType === 'debit';
            const isRefund = txType === 'refund';
            const sign = isDeduct ? '-' : '+';
            const itemClass = isRefund ? 'history-item history-item--refund' : 'history-item';
            const icon = isRefund
                ? '<i class="fa-solid fa-rotate-left history-icon history-icon--refund"></i>'
                : (txType === 'conversion'
                    ? '<i class="fa-solid fa-arrows-rotate history-icon"></i>'
                    : '<i class="fa-solid fa-gift history-icon"></i>');
            const label = tx.note || tx.type || 'Transaction';

            list.innerHTML += `
                <li class="${itemClass}">
                    <span class="history-item-main">
                        ${icon}
                        <span class="history-item-copy">
                            <span class="history-item-note">${escapeHtml(label)}</span>
                            <small class="history-item-date">${date}</small>
                        </span>
                    </span>
                    <span class="history-amount ${isDeduct ? 'deduct' : ''} ${isRefund ? 'refund' : ''}">${sign}৳${Number(tx.amount || 0).toLocaleString()}</span>
                </li>
            `;
        });
    }

    async function fetchWalletData() {
        try {
            const res = await fetch('/api/customer/profile', {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (res.ok) {
                updateWalletDisplay(data.walletBalance || 0, data.loyaltyPoints || 0);
                renderCashbackHistory(data.walletHistory || []);
                applyRewardSettingsUI(data.rewardSettings);
            }
        } catch (error) {
            console.error('Fetch Wallet Error:', error);
        }
    }

    const convertPointsBtn = document.getElementById('convert-points-btn');
    if (convertPointsBtn) {
        convertPointsBtn.addEventListener('click', async () => {
            const input = document.getElementById('points-to-convert');
            const points = Number(input ? input.value : 0);
            const minPoints = Number(cachedRewardSettings.pointsConversionUnit || 100);

            if (!points || points <= 0) {
                showToast('Please enter the number of points to convert.', 'warning');
                return;
            }
            if (points < minPoints) {
                showToast(`Minimum ${minPoints} points are required.`, 'warning');
                return;
            }
            if (points % minPoints !== 0) {
                showToast(`Points must be in multiples of ${minPoints}.`, 'warning');
                return;
            }

            const originalText = convertPointsBtn.innerHTML;
            convertPointsBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Converting...';
            convertPointsBtn.disabled = true;

            try {
                const res = await fetch('/api/customer/convert-points', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ points })
                });
                const data = await res.json();

                convertPointsBtn.innerHTML = originalText;
                convertPointsBtn.disabled = false;

                if (res.ok && data.success) {
                    showToast(data.message, 'success');
                    if (input) input.value = '';
                    updateWalletDisplay(data.walletBalance, data.loyaltyPoints);
                    renderCashbackHistory(data.walletHistory || []);
                    applyRewardSettingsUI(data.rewardSettings);
                    // ড্যাশবোর্ড স্ট্যাট কার্ডও আপডেট করা
                    const balanceCard = document.getElementById('stat-wallet-balance');
                    const pointsCard = document.getElementById('stat-loyalty-points');
                    if (balanceCard) balanceCard.textContent = '৳' + Number(data.walletBalance).toLocaleString();
                    if (pointsCard) pointsCard.textContent = Number(data.loyaltyPoints).toLocaleString();
                } else {
                    showToast(data.message || 'Conversion failed.', 'danger');
                }
            } catch (error) {
                console.error('Convert Points Error:', error);
                convertPointsBtn.innerHTML = originalText;
                convertPointsBtn.disabled = false;
                showToast('Server error during conversion.', 'danger');
            }
        });
    }

    // =================================================================
    // ১৪. উইশলিস্ট (My Wishlist)
    // =================================================================
    async function fetchWishlist() {
        const container = document.getElementById('wishlist-items-list');
        if (!container) return;
        try {
            const res = await fetch('/api/customer/wishlist', {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (res.ok && data.success) {
                renderWishlist(data.wishlist || []);
            } else {
                container.innerHTML = `<p class="text-center empty-cart-text">Could not load wishlist.</p>`;
            }
        } catch (error) {
            console.error('Fetch Wishlist Error:', error);
            container.innerHTML = `<p class="text-center empty-cart-text">Server error loading wishlist.</p>`;
        }
    }

    function renderWishlist(items) {
        const container = document.getElementById('wishlist-items-list');
        if (!container) return;

        if (!items || items.length === 0) {
            container.innerHTML = `
                <div class="wishlist-empty">
                    <i class="fa-regular fa-heart"></i>
                    <p>Your wishlist is empty.</p>
                    <a href="/" class="shop-now-link">Browse products</a>
                </div>`;
            return;
        }

        container.innerHTML = '';
        items.forEach(item => {
            const PT = window.ProductThumbnail;
            const meta = PT ? PT.getDisplayMeta(item) : { image: item.image || '', emoji: item.icon || '' };
            const media = PT
                ? PT.buildThumbnailHtml(item, { variant: 'compact', alt: item.name, escapeHtml })
                : '';

            const card = document.createElement('div');
            card.className = 'wishlist-card';
            card.dataset.productId = String(item.productId || '');
            card.innerHTML = `
                <div class="wishlist-media">${media}</div>
                <div class="wishlist-info">
                    <h4 class="wishlist-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name || 'Product')}</h4>
                    <span class="wishlist-price">৳${Number(item.price || 0).toLocaleString()}</span>
                </div>
                <div class="wishlist-actions">
                    <button type="button" class="wishlist-cart-btn" data-id="${escapeHtml(item.productId)}" data-name="${escapeHtml(item.name || '')}" data-price="${Number(item.price || 0)}" data-image="${escapeHtml(meta.image)}" data-icon="${escapeHtml(meta.emoji)}" title="Add to cart">
                        <i class="fa-solid fa-cart-plus"></i>
                    </button>
                    <button type="button" class="wishlist-remove-btn" data-id="${escapeHtml(item.productId)}" title="Remove from wishlist">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            `;
            container.appendChild(card);
        });
    }

    async function addWishlistItemToCart(cartBtn) {
        const productId = cartBtn.getAttribute('data-id');
        const name = cartBtn.getAttribute('data-name') || '';
        const price = cartBtn.getAttribute('data-price') || '0';
        const image = cartBtn.getAttribute('data-image') || '';
        const icon = cartBtn.getAttribute('data-icon') || '';
        const productIcon = icon || '';

        if (!productId) {
            showToast('Product reference missing.', 'danger');
            return;
        }

        const originalHtml = cartBtn.innerHTML;
        cartBtn.disabled = true;
        cartBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

        try {
            const res = await fetch('/api/cart/add', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    productId,
                    quantity: 1,
                    name,
                    price: Number(price),
                    image,
                    icon: productIcon
                })
            });

            const data = await res.json();

            if (!res.ok) {
                showToast(data.message || 'Could not add to cart.', 'danger');
                return;
            }

            if (typeof window.syncCartFromServerItems === 'function' && Array.isArray(data)) {
                window.syncCartFromServerItems(data);
            } else if (typeof window.fetchLiveDBCart === 'function') {
                await window.fetchLiveDBCart();
            } else if (typeof window.renderCartDrawerItems === 'function') {
                window.renderCartDrawerItems();
            }

            showToast('Success: Added to cart!', 'success');
        } catch (error) {
            console.error('Wishlist add-to-cart error:', error);
            showToast('Server error while adding to cart.', 'danger');
        } finally {
            cartBtn.disabled = false;
            cartBtn.innerHTML = originalHtml;
        }
    }

    async function removeWishlistItem(removeBtn) {
        const productId = removeBtn.getAttribute('data-id');
        const card = removeBtn.closest('.wishlist-card');

        if (!productId) {
            showToast('Product reference missing.', 'danger');
            return;
        }

        const originalHtml = removeBtn.innerHTML;
        removeBtn.disabled = true;
        removeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

        try {
            const res = await fetch('/api/wishlist/toggle', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ productId })
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                showToast(data.message || 'Failed to remove.', 'danger');
                removeBtn.disabled = false;
                removeBtn.innerHTML = originalHtml;
                return;
            }

            if (card) {
                card.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
                card.style.opacity = '0';
                card.style.transform = 'scale(0.96)';
                setTimeout(() => {
                    card.remove();
                    const container = document.getElementById('wishlist-items-list');
                    if (container && !container.querySelector('.wishlist-card')) {
                        renderWishlist([]);
                    }
                }, 250);
            } else {
                await fetchWishlist();
            }

            showToast('Removed from Wishlist', 'success');
        } catch (error) {
            console.error('Remove Wishlist Error:', error);
            showToast('Server error.', 'danger');
            removeBtn.disabled = false;
            removeBtn.innerHTML = originalHtml;
        }
    }

    // উইশলিস্টের রিমুভ ও অ্যাড-টু-কার্ট (ইভেন্ট ডেলিগেশন)
    document.addEventListener('click', async (e) => {
        const removeBtn = e.target.closest('.wishlist-remove-btn');
        const cartBtn = e.target.closest('.wishlist-cart-btn');

        if (removeBtn) {
            e.preventDefault();
            e.stopPropagation();
            await removeWishlistItem(removeBtn);
            return;
        }

        if (cartBtn) {
            e.preventDefault();
            e.stopPropagation();
            await addWishlistItemToCart(cartBtn);
        }
    });

    // =================================================================
    // ১৫. ঠিকানা ম্যানেজমেন্ট (Addresses CRUD + Modal)
    // =================================================================
    const addressModal = document.getElementById('address-modal');
    const addressForm = document.getElementById('address-form');
    const addressModalTitle = document.getElementById('address-modal-title');
    const addressDistrict = document.getElementById('address-district');
    const addressUpazila = document.getElementById('address-upazila');

    function populateAddressDistrictOptions(selectedDistrict = '') {
        if (!addressDistrict || !Array.isArray(window.BANGLADESH_DISTRICTS)) return;

        addressDistrict.innerHTML = '<option value="">Select district</option>';
        window.BANGLADESH_DISTRICTS.forEach((district) => {
            const option = document.createElement('option');
            option.value = district;
            option.textContent = district;
            addressDistrict.appendChild(option);
        });

        if (selectedDistrict) addressDistrict.value = selectedDistrict;
    }

    function populateAddressUpazilaOptions(district, selectedUpazila = '') {
        if (!addressUpazila) return;

        addressUpazila.innerHTML = '<option value="">Select upazila / thana</option>';
        const upazilas = typeof window.getUpazilasForDistrict === 'function'
            ? window.getUpazilasForDistrict(district)
            : [];

        if (!district || upazilas.length === 0) {
            addressUpazila.disabled = true;
            return;
        }

        upazilas.forEach((upazila) => {
            const option = document.createElement('option');
            option.value = upazila;
            option.textContent = upazila;
            addressUpazila.appendChild(option);
        });

        addressUpazila.disabled = false;
        if (selectedUpazila) addressUpazila.value = selectedUpazila;
    }

    function formatSavedAddressDisplay(addr = {}) {
        return buildCompositeAddress({
            fullAddress: addr.fullAddress || '',
            upazila: addr.upazilaOrThana || addr.upazila || addr.thana || '',
            district: addr.district || ''
        }) || addr.fullAddress || '';
    }

    populateAddressDistrictOptions();

    if (addressDistrict) {
        addressDistrict.addEventListener('change', () => {
            populateAddressUpazilaOptions(addressDistrict.value);
        });
    }

    function openAddressModal(editData = null) {
        if (!addressModal) return;
        const idField = document.getElementById('address-id');
        const labelField = document.getElementById('address-label');
        const phoneField = document.getElementById('address-phone');
        const fullField = document.getElementById('address-full');
        const defaultField = document.getElementById('address-default');

        if (editData) {
            addressModalTitle.textContent = 'Edit Address';
            idField.value = editData._id;
            labelField.value = editData.label || '';
            phoneField.value = editData.phone || '';
            fullField.value = editData.fullAddress || '';
            defaultField.checked = !!editData.isDefault;
            populateAddressDistrictOptions(editData.district || '');
            populateAddressUpazilaOptions(
                editData.district || '',
                editData.upazilaOrThana || editData.upazila || editData.thana || ''
            );
        } else {
            addressModalTitle.textContent = 'Add New Address';
            addressForm.reset();
            idField.value = '';
            populateAddressDistrictOptions();
            populateAddressUpazilaOptions('');
        }
        addressModal.classList.remove('hidden');
    }

    function closeAddressModal() {
        if (addressModal) addressModal.classList.add('hidden');
    }

    const addAddressCard = document.getElementById('add-address-card');
    if (addAddressCard) addAddressCard.addEventListener('click', () => openAddressModal());

    const closeAddressBtn = document.getElementById('close-address-modal');
    const cancelAddressBtn = document.getElementById('cancel-address-btn');
    if (closeAddressBtn) closeAddressBtn.addEventListener('click', closeAddressModal);
    if (cancelAddressBtn) cancelAddressBtn.addEventListener('click', closeAddressModal);
    if (addressModal) {
        addressModal.addEventListener('click', (e) => { if (e.target === addressModal) closeAddressModal(); });
    }

    async function fetchAddresses() {
        const grid = document.getElementById('address-grid');
        if (!grid) return;
        try {
            const res = await fetch('/api/customer/addresses', {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (res.ok && data.success) {
                renderAddresses(data.addresses || []);
            }
        } catch (error) {
            console.error('Fetch Addresses Error:', error);
        }
    }

    function renderAddresses(addresses) {
        const grid = document.getElementById('address-grid');
        if (!grid) return;

        // "Add New Address" কার্ডটি রেখে বাকি কার্ড রিসেট করা
        grid.querySelectorAll('.address-card').forEach(el => el.remove());

        const addCard = document.getElementById('add-address-card');
        addresses.forEach(addr => {
            const displayAddress = formatSavedAddressDisplay(addr);
            const card = document.createElement('div');
            card.className = 'card address-card' + (addr.isDefault ? ' active' : '');
            card.innerHTML = `
                <span class="address-tag">
                    <i class="fa-solid fa-location-dot"></i> ${escapeHtml(addr.label || 'Address')}${addr.isDefault ? ' (Default)' : ''}
                </span>
                <p class="address-text">${escapeHtml(displayAddress)}</p>
                ${addr.phone ? `<p class="address-phone-text"><i class="fa-solid fa-phone"></i> ${escapeHtml(addr.phone)}</p>` : ''}
                <div class="address-card-actions">
                    ${!addr.isDefault ? `<button class="btn-address-default" data-id="${addr._id}" title="Set as default delivery address"><i class="fa-solid fa-star"></i> Set Default</button>` : ''}
                    <button class="btn-address-edit" data-id="${addr._id}"><i class="fa-regular fa-pen-to-square"></i> Edit</button>
                    <button class="btn-address-delete" data-id="${addr._id}"><i class="fa-regular fa-trash-can"></i> Delete</button>
                </div>
            `;
            card._addressData = addr;
            grid.insertBefore(card, addCard);
        });
    }

    // অ্যাড্রেস এডিট / ডিলিট (ইভেন্ট ডেলিগেশন)
    document.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.btn-address-edit');
        const deleteBtn = e.target.closest('.btn-address-delete');
        const defaultBtn = e.target.closest('.btn-address-default');

        if (editBtn) {
            const card = editBtn.closest('.address-card');
            if (card && card._addressData) openAddressModal(card._addressData);
        }

        if (deleteBtn) {
            const addressId = deleteBtn.getAttribute('data-id');
            if (!confirm('Delete this address?')) return;
            try {
                const res = await fetch(`/api/customer/addresses/${addressId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    showToast('Address deleted.', 'success');
                    renderAddresses(data.addresses || []);
                } else {
                    showToast(data.message || 'Failed to delete.', 'danger');
                }
            } catch (error) {
                console.error('Delete Address Error:', error);
                showToast('Server error.', 'danger');
            }
        }

        if (defaultBtn) {
            const card = defaultBtn.closest('.address-card');
            const addr = card?._addressData;
            if (!addr) return;

            try {
                const res = await fetch(`/api/customer/addresses/${addr._id}`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        label: addr.label || 'Home',
                        phone: addr.phone || '',
                        district: addr.district || '',
                        upazilaOrThana: addr.upazilaOrThana || addr.upazila || addr.thana || '',
                        fullAddress: addr.fullAddress || '',
                        isDefault: true
                    })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    showToast('Default address updated.', 'success');
                    renderAddresses(data.addresses || []);
                    const defaultAddress = (data.addresses || []).find((item) => item.isDefault);
                    if (defaultAddress) {
                        applyProfileAddressToUI({
                            district: defaultAddress.district,
                            upazila: defaultAddress.upazilaOrThana,
                            fullAddress: defaultAddress.fullAddress,
                            phone: defaultAddress.phone
                        });
                        cacheProfileAddressForCheckout({
                            name: profileName?.value || '',
                            phone: defaultAddress.phone || profilePhone?.value || '',
                            district: defaultAddress.district,
                            upazila: defaultAddress.upazilaOrThana,
                            fullAddress: defaultAddress.fullAddress
                        });
                    }
                } else {
                    showToast(data.message || 'Failed to set default address.', 'danger');
                }
            } catch (error) {
                console.error('Set Default Address Error:', error);
                showToast('Server error.', 'danger');
            }
        }
    });

    if (addressForm) {
        addressForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const addressId = document.getElementById('address-id').value;
            const district = addressDistrict?.value?.trim() || '';
            const upazilaOrThana = addressUpazila?.value?.trim() || '';
            const payload = {
                label: document.getElementById('address-label').value.trim(),
                phone: document.getElementById('address-phone').value.trim(),
                district,
                upazilaOrThana,
                fullAddress: document.getElementById('address-full').value.trim(),
                isDefault: document.getElementById('address-default').checked
            };

            if (!district) {
                showToast('Please select a district.', 'warning');
                return;
            }
            if (!upazilaOrThana) {
                showToast('Please select an upazila / thana.', 'warning');
                return;
            }
            if (!payload.fullAddress) {
                showToast('Street / village / house details are required.', 'warning');
                return;
            }

            const saveBtn = document.getElementById('save-address-btn');
            const originalText = saveBtn.innerHTML;
            saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
            saveBtn.disabled = true;

            try {
                const url = addressId ? `/api/customer/addresses/${addressId}` : '/api/customer/addresses';
                const method = addressId ? 'PUT' : 'POST';
                const res = await fetch(url, {
                    method,
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();

                saveBtn.innerHTML = originalText;
                saveBtn.disabled = false;

                if (res.ok && data.success) {
                    showToast(data.message || 'Address saved!', 'success');
                    renderAddresses(data.addresses || []);
                    closeAddressModal();

                    if (payload.isDefault) {
                        const defaultAddress = (data.addresses || []).find((item) => item.isDefault);
                        if (defaultAddress) {
                            applyProfileAddressToUI({
                                district: defaultAddress.district,
                                upazila: defaultAddress.upazilaOrThana,
                                fullAddress: defaultAddress.fullAddress,
                                phone: defaultAddress.phone
                            });
                            cacheProfileAddressForCheckout({
                                name: profileName?.value || '',
                                phone: defaultAddress.phone || profilePhone?.value || '',
                                district: defaultAddress.district,
                                upazila: defaultAddress.upazilaOrThana,
                                fullAddress: defaultAddress.fullAddress
                            });
                        }
                    }
                } else {
                    showToast(data.message || 'Failed to save address.', 'danger');
                }
            } catch (error) {
                console.error('Save Address Error:', error);
                saveBtn.innerHTML = originalText;
                saveBtn.disabled = false;
                showToast('Server error while saving address.', 'danger');
            }
        });
    }

    // =================================================================
    // ১৬. সিকিউরিটি: অ্যাক্টিভ সেশন ও রিমোট লগআউট (Sessions)
    // =================================================================
    function sessionDeviceIcon(device) {
        const d = (device || '').toLowerCase();
        if (d.includes('phone') || d.includes('android') || d.includes('iphone')) return 'fa-mobile-screen-button';
        if (d.includes('ipad') || d.includes('tablet')) return 'fa-tablet-screen-button';
        return 'fa-laptop';
    }

    function timeAgo(dateStr) {
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Active now';
        if (mins < 60) return `${mins} min ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs} hr ago`;
        const days = Math.floor(hrs / 24);
        return `${days} day${days > 1 ? 's' : ''} ago`;
    }

    async function fetchSessions() {
        const list = document.getElementById('sessions-list');
        if (!list) return;
        try {
            const res = await fetch('/api/auth/sessions', {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (res.ok && data.success) {
                renderSessions(data.sessions || []);
            } else {
                list.innerHTML = `<p class="text-center sessions-loading">Could not load sessions.</p>`;
            }
        } catch (error) {
            console.error('Fetch Sessions Error:', error);
            list.innerHTML = `<p class="text-center sessions-loading">Server error loading sessions.</p>`;
        }
    }

    function renderSessions(sessions) {
        const list = document.getElementById('sessions-list');
        if (!list) return;

        if (!sessions || sessions.length === 0) {
            list.innerHTML = `<p class="text-center sessions-loading">No active sessions found. Please log in again to track devices.</p>`;
            return;
        }

        list.innerHTML = '';
        sessions.forEach(s => {
            const icon = sessionDeviceIcon(s.device);
            const sessionRef = s.id || s.sessionId;
            const status = s.isCurrent ? 'Active now' : `Last active: ${timeAgo(s.lastActiveAt)}`;
            const location = s.location && s.location !== 'Unknown Location' ? s.location : '';
            const item = document.createElement('div');
            item.className = 'activity-item' + (s.isCurrent ? ' current-session' : '');
            item.innerHTML = `
                <div class="activity-icon"><i class="fa-solid ${icon}"></i></div>
                <div class="activity-details">
                    <h4 class="session-title">
                        <span>${s.device || 'Unknown Device'} • ${s.browser || 'Unknown Browser'}</span>
                        ${s.isCurrent ? '<span class="current-badge">This Device</span>' : ''}
                    </h4>
                    <p class="session-meta">
                        ${location ? `<span><i class="fa-solid fa-location-dot"></i> ${location}</span>` : ''}
                        <span><i class="fa-solid fa-network-wired"></i> ${s.ip || 'Unknown IP'}</span>
                        <span class="${s.isCurrent ? 'session-active-now' : ''}"><i class="fa-regular fa-clock"></i> ${status}</span>
                    </p>
                </div>
                ${s.isCurrent ? '' : `
                <button class="session-logout-btn" data-id="${sessionRef}" data-current="false" title="Log out this device">
                    <i class="fa-solid fa-right-from-bracket"></i> Log Out This Device
                </button>`}
            `;
            list.appendChild(item);
        });
    }

    // সেশন রিমোট লগআউট (ইভেন্ট ডেলিগেশন)
    document.addEventListener('click', async (e) => {
        const logoutSessionBtn = e.target.closest('.session-logout-btn');
        if (!logoutSessionBtn) return;

        const sessionId = logoutSessionBtn.getAttribute('data-id');
        const isCurrent = logoutSessionBtn.getAttribute('data-current') === 'true';

        logoutSessionBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        logoutSessionBtn.disabled = true;

        try {
            const res = await fetch(`/api/auth/sessions/${sessionId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();

            if (res.ok && data.success) {
                if (data.loggedOutCurrent || isCurrent) {
                    showToast('This device has been logged out. Redirecting...', 'success');
                    localStorage.removeItem('token');
                    localStorage.removeItem('customerToken');
                    setTimeout(() => { window.location.href = '/login.html'; }, 1500);
                } else {
                    showToast('Device logged out remotely.', 'success');
                    fetchSessions();
                }
            } else {
                showToast(data.message || 'Failed to log out device.', 'danger');
                logoutSessionBtn.disabled = false;
                logoutSessionBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Logout';
            }
        } catch (error) {
            console.error('Logout Session Error:', error);
            showToast('Server error.', 'danger');
            logoutSessionBtn.disabled = false;
            logoutSessionBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Log Out';
        }
    });

    // অন্য সব ডিভাইস লগআউট (Log Out All Other Devices)
    const logoutOthersBtn = document.getElementById('logout-others-btn');
    if (logoutOthersBtn) {
        logoutOthersBtn.addEventListener('click', async () => {
            const originalHtml = logoutOthersBtn.innerHTML;
            logoutOthersBtn.disabled = true;
            logoutOthersBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Logging out other devices...</span>';

            try {
                const res = await fetch('/api/auth/sessions/logout-others', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
                });
                const data = await res.json();

                if (res.ok && data.success) {
                    showToast(data.message || 'Other devices logged out.', 'success');
                    fetchSessions();
                } else {
                    showToast(data.message || 'Failed to log out other devices.', 'danger');
                }
            } catch (error) {
                console.error('Logout Others Error:', error);
                showToast('Server error while logging out other devices.', 'danger');
            } finally {
                logoutOthersBtn.disabled = false;
                logoutOthersBtn.innerHTML = originalHtml;
            }
        });
    }

    // =================================================================
    // ১৭. ইনিশিয়াল ডাটা লোড (Initial Data Fetching)
    // =================================================================
    fetchUserProfile();
    fetchDashboardStats();
    fetchUserOrders(); 
    fetchWishlist();


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
            return;
        }
        if (actionBtn.classList.contains('btn-order-return')) {
            openOrderActionModal(orderId, 'return');
            return;
        }
        if (actionBtn.classList.contains('btn-order-invoice')) {
            const invoiceId = actionBtn.getAttribute('data-invoice-id');
            if (typeof window.downloadOrderInvoice === 'function') {
                window.downloadOrderInvoice(orderId, invoiceId, actionBtn);
            }
            return;
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


});






