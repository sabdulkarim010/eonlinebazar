/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/profile/account.js
 * Description: Profile fetch/update, avatar upload, dashboard stats, and address helpers.
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

    // =================================================================
    // ৬. ইউজারের প্রোфাইল ডাটা ফেচ করা (Fetch Profile & Auto-Cache)
    // =================================================================
    // =================================================================
    // 5.5 Profile address cascading (District -> Upazila)
    // =================================================================
    let profileUpazilaSelect = null;

    function initProfileUpazilaSelect() {
        const upazilaEl = document.getElementById('profile-upazila');
        if (!upazilaEl || profileUpazilaSelect) return;
        profileUpazilaSelect = window.initSearchableSelectFromNative(upazilaEl, {
            placeholder: 'Select upazila / thana',
            options: [],
            value: '',
            disabled: true
        });
    }

    function setProfileDistrictValue(district = '') {
        const searchInput = document.getElementById('district-search-input');
        const hidden = document.getElementById('district');
        if (searchInput) {
            searchInput.value = district || '';
            searchInput.classList.toggle('has-value', Boolean(district));
        }
        if (hidden) hidden.value = district || '';
    }

    function populateProfileUpazilaOptions(district, selectedUpazila = '') {
        if (!profileUpazilaSelect) initProfileUpazilaSelect();
        const upazilas = typeof window.getUpazilasForDistrict === 'function'
            ? window.getUpazilasForDistrict(district)
            : [];

        if (!district || upazilas.length === 0) {
            profileUpazilaSelect?.setOptions([], '');
            profileUpazilaSelect?.setDisabled(true);
            return;
        }

        profileUpazilaSelect?.setOptions(upazilas, selectedUpazila || '');
        profileUpazilaSelect?.setDisabled(false);
    }

    if (typeof window.initDistrictSearch === 'function') {
        window.initDistrictSearch('district-search-input', 'district', 'district-dropdown-list');
    }
    initProfileUpazilaSelect();

    const districtHiddenInput = document.getElementById('district');
    if (districtHiddenInput) {
        districtHiddenInput.addEventListener('change', () => {
            populateProfileUpazilaOptions(districtHiddenInput.value, '');
            const upazilaEl = document.getElementById('profile-upazila');
            if (upazilaEl) upazilaEl.dispatchEvent(new Event('change', { bubbles: true }));
        });
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

        setProfileDistrictValue(district);
        populateProfileUpazilaOptions(district, upazila);

        if (profileFullAddress) profileFullAddress.value = fullAddress;
        if (profileAddress) {
            profileAddress.value = buildCompositeAddress({ fullAddress, upazila, district }) || user.address || '';
        }
    }

    const profileDistrictInput = () => document.getElementById('district');
    const profileUpazilaInput = () => document.getElementById('profile-upazila');

    const boundProfileDistrict = profileDistrictInput();
    if (boundProfileDistrict) {
        boundProfileDistrict.addEventListener('change', () => {
            populateProfileUpazilaOptions(boundProfileDistrict.value);
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
                    setAvatarSrc(sidebarAvatar, data.avatar);
                    setAvatarSrc(navAvatar, data.avatar);
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
                applyAnnouncementUI(data.announcement);

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

            const district = document.getElementById('district')?.value?.trim() || '';
            const upazila = document.getElementById('profile-upazila')?.value?.trim() || '';
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
            if (updatedData.name.length < 2) {
                showToast('Full Name must be at least 2 characters.', 'warning');
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
                    setAvatarSrc(sidebarAvatar, data.avatarUrl);
                    setAvatarSrc(navAvatar, data.avatarUrl); 
                } else {
                    showToast(data.message || 'Avatar upload failed.', 'danger');
                }
            } catch (error) {
                console.error('Avatar Upload Error:', error);
                showToast('Server error while uploading photo.', 'danger');
            }
        });
    }

    fetchUserProfile();
    fetchDashboardStats();
    fetchUserOrders();
    fetchWishlist();

Object.assign(window, {
    initProfileUpazilaSelect,
    setProfileDistrictValue,
    populateProfileUpazilaOptions,
    buildCompositeAddress,
    formatDateForInput,
    isValidProfileDob,
    cacheProfileAddressForCheckout,
    applyProfileAddressToUI,
    fetchUserProfile,
    fetchDashboardStats
});

});
