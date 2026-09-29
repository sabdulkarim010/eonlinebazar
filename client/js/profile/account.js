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

        window.EOBStorage.set(window.EOBStorageKeys.CHECKOUT_NAME, user.name || '');
        window.EOBStorage.set(window.EOBStorageKeys.CHECKOUT_PHONE, user.phone || user.mobile || '');
        window.EOBStorage.set(window.EOBStorageKeys.CHECKOUT_ADDRESS, composite);
        window.EOBStorage.set(window.EOBStorageKeys.CHECKOUT_DISTRICT, user.district || '');
        window.EOBStorage.set(window.EOBStorageKeys.CHECKOUT_UPAZILA, user.upazila || user.thana || '');
        window.EOBStorage.set(window.EOBStorageKeys.CHECKOUT_FULL_ADDRESS, user.fullAddress || '');
        window.EOBStorage.set(window.EOBStorageKeys.SHIPPING_DISTRICT, user.district || '');
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

    function applyUserProfileData(data, meta = {}) {
        if (!data) return;
        const fromCache = meta.source === 'cache';

        if (sidebarName) sidebarName.textContent = data.name || 'User';
        if (sidebarEmail) sidebarEmail.textContent = data.email || '';

        if (data.avatar) {
            setAvatarSrc(sidebarAvatar, data.avatar);
            setAvatarSrc(navAvatar, data.avatar);
        }

        if (profileName) profileName.value = data.name || '';
        if (profileEmail) profileEmail.value = data.email || '';
        if (profilePhone) profilePhone.value = data.phone || data.mobile || '';
        if (typeof window.updateSecurityContactDisplays === 'function') {
            window.updateSecurityContactDisplays(data);
        }
        if (profileGender) profileGender.value = data.gender || '';
        if (profileDob) profileDob.value = formatDateForInput(data.dateOfBirth);

        const addressPayload = data.address
            ? { ...data, ...data.address }
            : data;
        applyProfileAddressToUI(addressPayload);

        document.querySelectorAll('.user-display-name').forEach((el) => {
            el.textContent = data.name || 'User';
        });

        if (typeof window.updateWalletDisplay === 'function') {
            window.updateWalletDisplay(data.walletBalance || 0, data.loyaltyPoints || 0);
        }
        if (typeof window.renderCashbackHistory === 'function') {
            window.renderCashbackHistory(data.walletHistory || []);
        }
        if (typeof window.applyRewardSettingsUI === 'function') {
            window.applyRewardSettingsUI(data.rewardSettings);
        }
        if (typeof window.applyAnnouncementUI === 'function') {
            window.applyAnnouncementUI(data.announcement);
        }

        renderLoyaltyDashboardCard({
            ...data,
            loyaltyPoints: data.loyaltyPoints,
            loyaltySummary: data.loyaltySummary,
            pointsHistory: data.pointsHistory
        });

        if (!fromCache) {
            cacheProfileAddressForCheckout(addressPayload);
        }
    }

    async function fetchUserProfile() {
        const cacheApi = window.EOBProfileCache;
        try {
            const res = await fetch('/api/customer/profile', {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await res.json();

            if (res.ok) {
                applyUserProfileData(data, { source: 'network' });
                if (cacheApi && currentUserId) {
                    const snap = cacheApi.readSnapshot(currentUserId) || {};
                    cacheApi.writeSnapshot(currentUserId, {
                        cachedAt: new Date().toISOString(),
                        profile: cacheApi.normalizeProfilePayload(data),
                        dashboard: snap.dashboard || null
                    });
                }
            } else if (!cacheApi?.readSnapshot(currentUserId)) {
                showToast(data.message || 'Failed to load profile.', 'danger');
            }
        } catch (error) {
            console.error('Fetch Profile Error:', error);
            if (!window.EOBProfileCache?.readSnapshot(currentUserId)) {
                showToast('Server error while loading profile.', 'danger');
            }
        }
    }

    // =================================================================
    // ৬.১ ড্যাশবোর্ড স্ট্যাটাস ফেচ করা (Fetch Dashboard Stats)
    // =================================================================
    function renderLoyaltyDashboardCard(profile) {
        const card = document.getElementById('loyaltyDashboardCard');
        if (!card || !profile) return;

        const summary = profile.loyaltySummary || {};
        const points = Number(summary.points ?? profile.loyaltyPoints) || 0;
        card.hidden = false;

        const pointsEl = document.getElementById('loyalty-card-points');
        const tierEl = document.getElementById('loyalty-card-tier');
        const nextWrap = document.getElementById('loyalty-next-tier-wrap');
        const nextEl = document.getElementById('loyalty-card-next-tier');
        const historyEl = document.getElementById('loyalty-points-history');

        if (pointsEl) pointsEl.textContent = String(points);
        if (tierEl) tierEl.textContent = summary.tierLabel || 'Member';

        if (summary.nextTier && nextWrap && nextEl) {
            nextWrap.hidden = false;
            const needed = Math.ceil(Number(summary.nextTier.spendNeeded) || 0);
            nextEl.textContent = `Spend ৳${needed.toLocaleString()} more for ${summary.nextTier.label}`;
        } else if (nextWrap) {
            nextWrap.hidden = true;
        }

        const history = Array.isArray(profile.pointsHistory) ? profile.pointsHistory : [];
        if (historyEl) {
            if (!history.length) {
                historyEl.innerHTML = '<li class="loyalty-history-empty">No point activity yet.</li>';
            } else {
                historyEl.innerHTML = history.map((entry) => {
                    const amount = Number(entry.amount) || 0;
                    const sign = amount >= 0 ? '+' : '';
                    const label = escapeHtml(entry.note || entry.type || 'Points update');
                    const when = entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : '';
                    return `<li><span>${label}</span><strong>${sign}${amount} pts</strong><small>${when}</small></li>`;
                }).join('');
            }
        }
    }

    function renderDashboardActivityFallback(message) {
        const dashboardTableBody = document.getElementById('dashboard-orders-tbody');
        if (!dashboardTableBody) return;
        const text = escapeHtml(message || 'Unable to load recent activity.');
        dashboardTableBody.innerHTML = `<tr class="orders-state-row"><td colspan="6" class="text-center orders-error-cell"><i class="fa-solid fa-triangle-exclamation"></i> ${text}</td></tr>`;
    }

    function applyDashboardMetrics(metrics, meta = {}) {
        if (!metrics) return;
        const cacheApi = window.EOBProfileCache;
        if (cacheApi) {
            cacheApi.applyDashboardMetricsToDom(metrics);
        }

        const dashboardTableBody = document.getElementById('dashboard-orders-tbody');
        if (!dashboardTableBody) return;

        const recentOrders = metrics.recentOrders || [];
        const buildRow = window.buildOrderRowHtml;

        if (recentOrders.length === 0) {
            dashboardTableBody.innerHTML = '<tr class="orders-state-row"><td colspan="6" class="text-center orders-empty-cell"><i class="fa-solid fa-box-open orders-empty-icon"></i>No recent orders yet.</td></tr>';
        } else if (typeof buildRow !== 'function') {
            if (meta.source !== 'cache') {
                renderDashboardActivityFallback('Unable to load recent activity.');
            }
        } else {
            try {
                dashboardTableBody.innerHTML = recentOrders.map((order) => buildRow(order)).join('');
            } catch (rowError) {
                console.error('Error rendering recent orders:', rowError);
                if (meta.source !== 'cache') {
                    renderDashboardActivityFallback('Unable to load recent activity.');
                }
            }
        }
    }

    async function fetchDashboardStats() {
        const cacheApi = window.EOBProfileCache;
        try {
            const res = await fetch('/api/orders/dashboard-stats', {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const rawData = await res.json();

            if (res.ok && rawData.success !== false) {
                const metrics = cacheApi
                    ? cacheApi.normalizeDashboardPayload(rawData)
                    : rawData;
                applyDashboardMetrics(metrics, { source: 'network' });
                if (cacheApi && currentUserId) {
                    const snap = cacheApi.readSnapshot(currentUserId) || {};
                    cacheApi.writeSnapshot(currentUserId, {
                        cachedAt: new Date().toISOString(),
                        profile: snap.profile || null,
                        dashboard: metrics
                    });
                }
            } else if (!cacheApi?.readSnapshot(currentUserId)?.dashboard) {
                renderDashboardActivityFallback(rawData.message || 'Unable to load recent activity.');
            }
        } catch (error) {
            console.error('Error fetching dashboard stats:', error);
            if (!cacheApi?.readSnapshot(currentUserId)?.dashboard) {
                renderDashboardActivityFallback('Unable to load recent activity.');
            }
        }
    }

    function bootstrapProfileDashboardSwr(options = {}) {
        const cacheApi = window.EOBProfileCache;
        if (!cacheApi || !currentUserId) {
            fetchUserProfile();
            fetchDashboardStats();
            return;
        }

        cacheApi.bindRetryButton(() => bootstrapProfileDashboardSwr({ force: true }));

        cacheApi.loadProfileDashboardMetrics({
            userId: currentUserId,
            token,
            force: options.force === true,
            onProfile: (profile, meta) => applyUserProfileData(profile, meta),
            onDashboard: (dashboard, meta) => applyDashboardMetrics(dashboard, meta),
            onNetworkState: (state) => {
                if (state.mode === 'loading') {
                    cacheApi.setStatusBanner({ mode: 'error' });
                    return;
                }
                if (state.mode === 'online') {
                    cacheApi.setStatusBanner({ mode: 'online' });
                    return;
                }
                if (state.mode === 'offline') {
                    cacheApi.setStatusBanner({ mode: 'offline', cachedAt: state.cachedAt });
                    return;
                }
                if (state.mode === 'error') {
                    cacheApi.setStatusBanner({ mode: 'error' });
                }
            }
        });
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

    bootstrapProfileDashboardSwr();
    if (typeof window.fetchUserOrders === 'function') window.fetchUserOrders();
    if (typeof window.fetchWishlist === 'function') window.fetchWishlist();

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
    fetchDashboardStats,
    bootstrapProfileDashboardSwr,
    applyUserProfileData,
    applyDashboardMetrics
});

});
