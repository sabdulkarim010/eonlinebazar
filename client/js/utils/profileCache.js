/**
 * Profile dashboard metrics — Stale-While-Revalidate + persisted cache (per user).
 */
(function initEOBProfileCache(global) {
    'use strict';

    const CACHE_VERSION = 1;
    const CACHE_KEY_PREFIX = 'eob_profile_metrics_v1';
    const DEFAULT_TTL_MS = 15 * 60 * 1000;

    function storageKey(userId) {
        return `${CACHE_KEY_PREFIX}:${String(userId || '').trim()}`;
    }

    function readRaw(userId) {
        if (!userId || !global.EOBStorage) return null;
        try {
            const row = global.EOBStorage.getJSON(storageKey(userId), null);
            if (!row || row.v !== CACHE_VERSION || row.userId !== String(userId)) return null;
            return row;
        } catch (_) {
            return null;
        }
    }

    function writeRaw(userId, payload) {
        if (!userId || !global.EOBStorage) return;
        const row = {
            v: CACHE_VERSION,
            userId: String(userId),
            cachedAt: payload.cachedAt || new Date().toISOString(),
            profile: payload.profile || null,
            dashboard: payload.dashboard || null
        };
        global.EOBStorage.setJSON(storageKey(userId), row);
    }

    function purgeForUser(userId) {
        if (!userId || !global.EOBStorage) return;
        global.EOBStorage.remove(storageKey(userId));
    }

    function purgeAll() {
        try {
            const storage = global.localStorage;
            if (!storage) return;
            const toRemove = [];
            for (let i = 0; i < storage.length; i += 1) {
                const key = storage.key(i);
                if (key && key.startsWith(CACHE_KEY_PREFIX)) toRemove.push(key);
            }
            toRemove.forEach((key) => {
                if (global.EOBStorage?.remove) {
                    global.EOBStorage.remove(key);
                } else {
                    storage.removeItem(key);
                }
            });
        } catch (_) {
            purgeForUser(getActiveUserIdFromStorage());
        }
    }

    function getActiveUserIdFromStorage() {
        try {
            const user = global.EOBStorage.getJSON(global.EOBStorageKeys?.USER_INFO, null)
                || global.EOBStorage.getJSON(global.EOBStorageKeys?.USER, null);
            return user ? String(user._id || user.id || '') : '';
        } catch (_) {
            return '';
        }
    }

    function formatCachedTimeLabel(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }

    function normalizeDashboardPayload(rawData) {
        if (!rawData) return null;
        return {
            totalOrders: rawData.totalOrders ?? rawData.data?.totalOrders ?? 0,
            pendingOrders: rawData.pendingOrders ?? rawData.data?.pendingOrders ?? 0,
            balance: rawData.balance ?? rawData.data?.balance ?? 0,
            loyaltyPoints: rawData.loyaltyPoints ?? rawData.data?.loyaltyPoints ?? 0,
            recentOrders: rawData.recentOrders || rawData.data?.recentOrders || []
        };
    }

    function normalizeProfilePayload(data) {
        if (!data || typeof data !== 'object') return null;
        return {
            name: data.name || '',
            email: data.email || '',
            phone: data.phone || data.mobile || '',
            avatar: data.avatar || '',
            gender: data.gender || '',
            dateOfBirth: data.dateOfBirth || '',
            walletBalance: Number(data.walletBalance) || 0,
            loyaltyPoints: Number(data.loyaltyPoints) || 0,
            loyaltySummary: data.loyaltySummary || null,
            pointsHistory: Array.isArray(data.pointsHistory) ? data.pointsHistory : [],
            walletHistory: Array.isArray(data.walletHistory) ? data.walletHistory : [],
            rewardSettings: data.rewardSettings || null,
            announcement: data.announcement || null,
            address: {
                district: data.district || data.shippingDistrict || '',
                upazila: data.upazila || data.shippingUpazila || '',
                fullAddress: data.fullAddress || data.address || '',
                address: data.address || ''
            }
        };
    }

    function applyDashboardMetricsToDom(metrics) {
        if (!metrics) return;
        const doc = typeof document !== 'undefined' ? document : null;
        if (!doc) return;
        const totalOrdersEl = doc.getElementById('stat-total-orders');
        const pendingOrdersEl = doc.getElementById('stat-pending-orders');
        const balanceEl = doc.getElementById('stat-wallet-balance');
        const pointsEl = doc.getElementById('stat-loyalty-points');

        if (totalOrdersEl) totalOrdersEl.textContent = String(metrics.totalOrders ?? 0);
        if (pendingOrdersEl) pendingOrdersEl.textContent = String(metrics.pendingOrders ?? 0);
        if (balanceEl) {
            const bal = Number(metrics.balance) || 0;
            balanceEl.textContent = `৳${bal.toLocaleString()}`;
        }
        if (pointsEl) pointsEl.textContent = String(metrics.loyaltyPoints ?? 0);
    }

    function setStatusBanner(state) {
        const banner = document.getElementById('profile-cache-status-banner');
        const textEl = document.getElementById('profile-cache-status-text');
        const retryBtn = document.getElementById('profile-cache-retry-btn');
        const skeleton = document.getElementById('profile-dashboard-skeleton');
        if (!banner || !textEl) return;

        const mode = state?.mode || 'hidden';

        if (mode === 'hidden' || mode === 'online') {
            banner.classList.add('hidden');
            banner.classList.remove('is-offline', 'is-error');
            if (skeleton) skeleton.classList.add('hidden');
            return;
        }

        banner.classList.remove('hidden');

        if (mode === 'offline') {
            banner.classList.add('is-offline');
            banner.classList.remove('is-error');
            const label = formatCachedTimeLabel(state.cachedAt);
            textEl.textContent = label
                ? `Viewing offline summary from ${label}`
                : 'Viewing saved offline summary';
        } else if (mode === 'error') {
            banner.classList.add('is-error');
            banner.classList.remove('is-offline');
            textEl.textContent = 'Unable to load profile summary. Check your connection.';
            if (skeleton) skeleton.classList.remove('hidden');
        }

        if (retryBtn) {
            retryBtn.style.display = mode === 'online' ? 'none' : 'inline-flex';
        }
    }

    function bindRetryButton(handler) {
        const retryBtn = document.getElementById('profile-cache-retry-btn');
        if (!retryBtn || retryBtn.dataset.bound === '1') return;
        retryBtn.dataset.bound = '1';
        retryBtn.addEventListener('click', () => {
            if (typeof handler === 'function') handler({ force: true });
        });
    }

    let authEvictionBound = false;

    function bindAuthEviction() {
        if (authEvictionBound) return;
        authEvictionBound = true;

        const onAuthChange = (payload) => {
            if (!payload || !payload.token) {
                purgeAll();
                setStatusBanner({ mode: 'hidden' });
                return;
            }
            const uid = payload.user?._id || payload.user?.id || getActiveUserIdFromStorage();
            if (!uid) return;
            const cached = readRaw(uid);
            if (cached && cached.userId !== String(uid)) {
                purgeAll();
            }
        };

        if (global.EOBCommerce?.subscribe) {
            global.EOBCommerce.subscribe('auth:changed', onAuthChange);
        }
    }

    async function fetchJson(url, token) {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller
            ? setTimeout(() => controller.abort(), 15000)
            : null;

        try {
            const res = await global.fetch(url, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                signal: controller?.signal
            });
            const body = await res.json();
            if (!res.ok) {
                const err = new Error(body?.message || `Request failed (${res.status})`);
                err.status = res.status;
                throw err;
            }
            return body;
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    /**
     * SWR loader: cache-first render, background revalidate, offline banner on failure.
     */
    async function loadProfileDashboardMetrics(options = {}) {
        const {
            userId,
            token,
            onProfile,
            onDashboard,
            onNetworkState,
            force = false
        } = options;

        if (!userId || !token) return { ok: false, reason: 'missing_auth' };

        bindAuthEviction();

        const cached = !force ? readRaw(userId) : null;
        if (cached) {
            if (cached.profile && typeof onProfile === 'function') {
                onProfile(cached.profile, { source: 'cache', cachedAt: cached.cachedAt });
            }
            if (cached.dashboard && typeof onDashboard === 'function') {
                onDashboard(cached.dashboard, { source: 'cache', cachedAt: cached.cachedAt });
            }
        } else if (typeof onNetworkState === 'function') {
            onNetworkState({ mode: 'loading' });
        }

        try {
            const [profileRes, dashboardRes] = await Promise.all([
                fetchJson('/api/customer/profile', token),
                fetchJson('/api/orders/dashboard-stats', token)
            ]);

            const profile = normalizeProfilePayload(profileRes);
            const dashboard = normalizeDashboardPayload(
                dashboardRes?.success === false ? null : dashboardRes
            );

            writeRaw(userId, {
                cachedAt: new Date().toISOString(),
                profile,
                dashboard
            });

            if (profile && typeof onProfile === 'function') {
                onProfile(profile, { source: 'network' });
            }
            if (dashboard && typeof onDashboard === 'function') {
                onDashboard(dashboard, { source: 'network' });
            }
            if (typeof onNetworkState === 'function') {
                onNetworkState({ mode: 'online', cachedAt: new Date().toISOString() });
            }

            return { ok: true, source: 'network' };
        } catch (error) {
            if (cached) {
                if (typeof onNetworkState === 'function') {
                    onNetworkState({ mode: 'offline', cachedAt: cached.cachedAt, error });
                }
                return { ok: true, source: 'cache', stale: true };
            }
            if (typeof onNetworkState === 'function') {
                onNetworkState({ mode: 'error', error });
            }
            return { ok: false, error };
        }
    }

    const api = {
        CACHE_VERSION,
        readSnapshot: readRaw,
        writeSnapshot: writeRaw,
        purgeForUser,
        purgeAll,
        normalizeDashboardPayload,
        normalizeProfilePayload,
        applyDashboardMetricsToDom,
        formatCachedTimeLabel,
        setStatusBanner,
        bindRetryButton,
        bindAuthEviction,
        loadProfileDashboardMetrics
    };

    global.EOBProfileCache = api;
    bindAuthEviction();

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : global);
