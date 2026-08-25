/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/settings-platform.js
 * Description: Admin settings init, branding, and sandbox mode.
 */
import '../admin-core.js';
const COURIER_PROVIDER_LABELS = window.COURIER_PROVIDER_LABELS;

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
    const emailEl = document.getElementById('settingsAdminEmail');
    if (emailEl) emailEl.value = settings.email || '';
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
    const dropzone = document.getElementById(isLogo ? 'logoPreviewBox' : 'faviconPreviewBox');
    if (!img) return;

    if (!url) {
        img.removeAttribute('src');
        img.style.display = 'none';
        if (ph) ph.style.display = 'flex';
        if (dropzone) dropzone.classList.remove('has-preview');
        if (isLogo) updateSidebarStoreLogo(null);
        return;
    }

    if (dropzone) dropzone.classList.add('has-preview');

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

/* ============================================================
   🧪 SANDBOX MODE (Super Admin)
   ============================================================ */

async function loadSandboxStatus() {
    if (typeof window.applySuperAdminOnlyVisibility === 'function') {
        window.applySuperAdminOnlyVisibility();
    }

    if (typeof window.isAdminSuperAdmin === 'function' && !window.isAdminSuperAdmin()) {
        return;
    }

    try {
        const res = await fetch('/api/admin/sandbox/status', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (res.status === 403) return;
        const data = await res.json();
        if (!data.success) return;

        const toggle = document.getElementById('sandbox-toggle');
        const statusText = document.getElementById('sandbox-status-text');
        const card = document.querySelector('.sandbox-card');

        if (toggle) toggle.checked = data.sandboxMode;
        if (statusText) {
            statusText.textContent = data.sandboxMode
                ? '🧪 ON — Sandbox Mode Active'
                : 'OFF — Live Mode';
            statusText.className = data.sandboxMode
                ? 'sandbox-status-on'
                : 'sandbox-status-off';
        }
        if (card) {
            card.classList.toggle('active-mode', data.sandboxMode);
        }

        const sandboxCount = document.getElementById('sandbox-order-count');
        const realCount = document.getElementById('real-order-count');
        if (sandboxCount) sandboxCount.textContent = data.sandboxOrderCount || 0;
        if (realCount) realCount.textContent = data.realOrderCount || 0;

        const banner = document.getElementById('sandbox-banner');
        if (banner) banner.style.display = data.sandboxMode ? 'block' : 'none';
    } catch (err) {
        console.warn('Could not load sandbox status:', err);
    }
}

window.loadSandboxStatus = loadSandboxStatus;

window.toggleSandboxMode = async function(enabled) {
    try {
        const res = await fetch('/api/admin/sandbox/toggle', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ enabled })
        });
        const data = await res.json();
        if (data.success) {
            showToast(
                enabled
                    ? '🧪 Sandbox Mode ON — Orders are now test orders'
                    : '✅ Live Mode — Real orders active',
                enabled ? 'warning' : 'success'
            );
            loadSandboxStatus();
        } else {
            showToast(data.message || 'Failed to toggle sandbox mode', 'error');
        }
    } catch (err) {
        showToast('Failed to toggle sandbox mode', 'error');
    }
};

window.resetTestData = async function() {
    await showEnterpriseActionModal({
        title: 'Clear Test Orders?',
        message: 'Delete ALL sandbox/test orders.\n\nReal orders will NOT be affected.\nThis action cannot be undone.',
        variant: 'warning',
        confirmText: 'Clear Test Orders',
        cancelText: 'Cancel',
        onConfirm: async () => {
            const res = await fetch('/api/admin/sandbox/reset-test-data', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token }
            });
            const data = await res.json();
            if (!data.success) {
                throw new Error(data.message || 'Reset failed');
            }
            showToast(`✅ Cleared ${data.deleted.orders} test orders`, 'success');
            loadSandboxStatus();
            if (typeof fetchLiveOrders === 'function') fetchLiveOrders();
        }
    });
};

window.resetRealData = async function() {
    const keyInput = document.getElementById('real-reset-key');
    const key = keyInput?.value?.trim();
    if (!key) {
        showToast('Please enter the confirmation key', 'error');
        return;
    }

    await showEnterpriseActionModal({
        title: '⚠️ Danger: Reset Real Data',
        message: 'This will permanently DELETE all REAL orders.\n\nCustomer accounts are kept, but every live order record will be wiped.\nThis cannot be undone.',
        variant: 'danger',
        confirmText: 'Delete Real Orders',
        cancelText: 'Keep Orders',
        requireTypedPhrase: 'DELETE REAL ORDERS',
        onConfirm: async () => {
            const res = await fetch('/api/admin/sandbox/reset-real-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ confirmationKey: key })
            });
            const data = await res.json();
            if (!data.success) {
                throw new Error(data.message || 'Invalid key or reset failed');
            }
            showToast(`Deleted ${data.deleted.orders} real orders`, 'success');
            if (keyInput) keyInput.value = '';
            loadSandboxStatus();
            if (typeof fetchLiveOrders === 'function') fetchLiveOrders();
        }
    });
};

async function toggleServiceWorkerSetting(enabled) {
    const text = document.getElementById('sw-setting-text');
    if (text) {
        text.textContent = enabled ? 'Cache Enabled' : 'Cache Disabled';
    }

    try {
        await fetch('/api/admin/settings/cache', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ serviceWorkerEnabled: enabled })
        });
        showToast(
            enabled ? '✅ Cache enabled' : '⚠️ Cache disabled',
            enabled ? 'success' : 'warning'
        );
    } catch (err) {
        showToast('Could not save cache setting', 'error');
    }
}
window.toggleServiceWorkerSetting = toggleServiceWorkerSetting;

async function loadCacheVersionDisplay() {
    const versionEl = document.getElementById('cache-version-display');
    try {
        const res = await fetch('/api/store/health');
        const data = await res.json();
        if (versionEl) {
            versionEl.textContent = 'v' + (data.buildTime || Date.now());
        }
        return data;
    } catch (err) {
        if (versionEl) versionEl.textContent = 'unknown';
        return null;
    }
}

async function restartCacheBuster() {
    const data = await loadCacheVersionDisplay();
    if (data) {
        showToast('✅ Cache version is current. Deploy to force a full refresh.', 'info');
    } else {
        showToast('Could not check cache version', 'error');
    }
}
window.restartCacheBuster = restartCacheBuster;

async function loadCacheSettings() {
    try {
        const res = await fetch('/api/store/cache-settings');
        const data = await res.json();
        const enabled = data.serviceWorkerEnabled !== false;
        const toggle = document.getElementById('sw-enabled-toggle');
        const text = document.getElementById('sw-setting-text');
        if (toggle) toggle.checked = enabled;
        if (text) text.textContent = enabled ? 'Cache Enabled' : 'Cache Disabled';
    } catch (e) {
        // ignore — defaults to enabled
    }
}

async function checkGAStatus() {
    try {
        const res = await fetch('/api/admin/analytics/status', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();
        const badge = document.getElementById('ga-status-badge');
        if (!badge) return;
        if (data.enabled && data.measurementId) {
            badge.style.background = '#d1fae5';
            badge.style.color = '#065f46';
            badge.innerHTML = '✅ Active — ' + data.measurementId;
        } else {
            badge.style.background = '#fee2e2';
            badge.style.color = '#991b1b';
            badge.innerHTML = '❌ Not configured — add GOOGLE_ANALYTICS_ID to .env';
        }
    } catch (e) {
        // ignore
    }
}

async function fetchAdminSettings() {
    if (typeof window.applySuperAdminOnlyVisibility === 'function') {
        window.applySuperAdminOnlyVisibility();
    }

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
    checkGAStatus();
    loadCacheSettings();
    loadCacheVersionDisplay();
    // Load 2FA status/config for the settings panel
    if (typeof window.refreshTwoFactorSettings === 'function') window.refreshTwoFactorSettings();
    if (typeof loadSandboxStatus === 'function') loadSandboxStatus();
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
    setVal('defaultProductsPerPage', settings.defaultProductsPerPage ?? settings.productsPerPage ?? 24);

    applyFlashSaleSettingsToUI(settings);
    applyAnnouncementSettingsToUI(settings);
    applySmsSettingsToUI(settings);
    applyCourierSettingsToUI(settings);
    refreshAdminCourierStatus();
    applyWhatsAppSettingsToUI(settings);
    updateMasterSettingsPreview();
}

/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    applyAdminSettingsToUI,
    normalizeBrandingUrl,
    cacheBustBrandingUrl,
    revokeBrandingObjectUrl,
    setBrandingPreviewImage,
    updateSidebarStoreLogo,
    updateSiteFaviconLink,
    applyBrandingPreviewFromSettings,
    loadSandboxStatus,
    toggleServiceWorkerSetting,
    loadCacheVersionDisplay,
    restartCacheBuster,
    loadCacheSettings,
    checkGAStatus,
    fetchAdminSettings,
    saveAdminProfile,
    saveAdminSettings,
    populateDistrictSelect,
    populateShopHomeCityOptions,
    applyDeliverySettingsToUI,
    saveDeliverySettings,
    applyMasterSettingsToUI
});
