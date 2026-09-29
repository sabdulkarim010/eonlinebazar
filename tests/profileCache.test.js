const profileCache = require('../client/js/utils/profileCache.js');

function createMockStorage() {
    const store = {};
    return {
        store,
        getJSON(key, fallback) {
            if (store[key] == null) return fallback ?? null;
            return JSON.parse(store[key]);
        },
        setJSON(key, value) {
            store[key] = JSON.stringify(value);
            if (global.localStorage?.setItem) {
                global.localStorage.setItem(key, store[key]);
            }
        },
        remove(key) {
            delete store[key];
            if (global.localStorage?.removeItem) {
                global.localStorage.removeItem(key);
            }
        },
        get(key, fallback) {
            return store[key] != null ? store[key] : fallback;
        }
    };
}

describe('EOBProfileCache', () => {
    const userId = 'user-abc-123';

    beforeEach(() => {
        profileCache.purgeAll();
    });

    test('readSnapshot returns data bound to user id', () => {
        const storage = createMockStorage();
        global.EOBStorage = storage;
        profileCache.writeSnapshot(userId, {
            cachedAt: '2026-09-29T10:45:00.000Z',
            profile: { name: 'Karim', walletBalance: 100 },
            dashboard: { totalOrders: 3, pendingOrders: 1, balance: 100, loyaltyPoints: 50, recentOrders: [] }
        });

        const hit = profileCache.readSnapshot(userId);
        expect(hit.profile.name).toBe('Karim');
        expect(hit.dashboard.totalOrders).toBe(3);
        expect(profileCache.readSnapshot('other-user')).toBeNull();
    });

    test('loadProfileDashboardMetrics renders cache first then updates from network', async () => {
        const storage = createMockStorage();
        global.EOBStorage = storage;
        global.localStorage = {
            length: 0,
            key: () => null,
            removeItem: jest.fn()
        };

        profileCache.writeSnapshot(userId, {
            cachedAt: '2026-09-29T10:45:00.000Z',
            profile: profileCache.normalizeProfilePayload({ name: 'Cached User', walletBalance: 10, loyaltyPoints: 5 }),
            dashboard: profileCache.normalizeDashboardPayload({
                success: true,
                totalOrders: 2,
                pendingOrders: 1,
                balance: 10,
                loyaltyPoints: 5,
                recentOrders: []
            })
        });

        const profileCalls = [];
        const dashboardCalls = [];
        const networkStates = [];

        global.fetch = jest.fn(async (url) => {
            if (url.includes('/api/customer/profile')) {
                return {
                    ok: true,
                    json: async () => ({ name: 'Live User', walletBalance: 99, loyaltyPoints: 12 })
                };
            }
            return {
                ok: true,
                json: async () => ({
                    success: true,
                    totalOrders: 9,
                    pendingOrders: 0,
                    balance: 99,
                    loyaltyPoints: 12,
                    recentOrders: []
                })
            };
        });

        await profileCache.loadProfileDashboardMetrics({
            userId,
            token: 'test-token',
            onProfile: (data, meta) => profileCalls.push({ data, meta }),
            onDashboard: (data, meta) => dashboardCalls.push({ data, meta }),
            onNetworkState: (state) => networkStates.push(state)
        });

        expect(profileCalls[0].meta.source).toBe('cache');
        expect(profileCalls[0].data.name).toBe('Cached User');
        expect(profileCalls[profileCalls.length - 1].meta.source).toBe('network');
        expect(profileCalls[profileCalls.length - 1].data.name).toBe('Live User');
        expect(dashboardCalls[dashboardCalls.length - 1].data.totalOrders).toBe(9);
        expect(networkStates[networkStates.length - 1].mode).toBe('online');

        const persisted = profileCache.readSnapshot(userId);
        expect(persisted.profile.name).toBe('Live User');
        expect(persisted.dashboard.totalOrders).toBe(9);
    });

    test('network failure with cache triggers offline mode', async () => {
        const storage = createMockStorage();
        global.EOBStorage = storage;
        global.localStorage = { length: 0, key: () => null, removeItem: jest.fn() };

        profileCache.writeSnapshot(userId, {
            cachedAt: '2026-09-29T10:45:00.000Z',
            profile: profileCache.normalizeProfilePayload({ name: 'Offline User' }),
            dashboard: profileCache.normalizeDashboardPayload({
                success: true,
                totalOrders: 1,
                pendingOrders: 0,
                balance: 0,
                loyaltyPoints: 0,
                recentOrders: []
            })
        });

        global.fetch = jest.fn(async () => {
            throw new Error('Network timeout');
        });

        const states = [];
        const result = await profileCache.loadProfileDashboardMetrics({
            userId,
            token: 'test-token',
            onProfile: () => {},
            onDashboard: () => {},
            onNetworkState: (state) => states.push(state)
        });

        expect(result.ok).toBe(true);
        expect(result.stale).toBe(true);
        expect(states[states.length - 1].mode).toBe('offline');
    });

    test('purgeForUser removes cached snapshot', () => {
        const storage = createMockStorage();
        global.EOBStorage = storage;
        profileCache.writeSnapshot(userId, {
            cachedAt: new Date().toISOString(),
            profile: { name: 'X' },
            dashboard: null
        });
        profileCache.purgeForUser(userId);
        expect(profileCache.readSnapshot(userId)).toBeNull();
    });

    test('purgeAll clears persisted profile metric keys (logout eviction)', () => {
        const storage = createMockStorage();
        global.EOBStorage = storage;
        const lsStore = {};
        global.localStorage = {
            setItem(key, value) {
                lsStore[key] = value;
            },
            get length() {
                return Object.keys(lsStore).length;
            },
            key(index) {
                return Object.keys(lsStore)[index] || null;
            },
            removeItem(key) {
                delete lsStore[key];
            }
        };

        profileCache.writeSnapshot(userId, {
            cachedAt: new Date().toISOString(),
            profile: { name: 'Leak Test' },
            dashboard: null
        });

        profileCache.purgeAll();
        expect(profileCache.readSnapshot(userId)).toBeNull();
        expect(lsStore[`eob_profile_metrics_v1:${userId}`]).toBeUndefined();
    });

    test('network failure without cache surfaces error mode', async () => {
        global.EOBStorage = createMockStorage();
        global.fetch = jest.fn(async () => {
            throw new Error('offline');
        });

        const states = [];
        const result = await profileCache.loadProfileDashboardMetrics({
            userId,
            token: 'token',
            onProfile: () => {},
            onDashboard: () => {},
            onNetworkState: (state) => states.push(state)
        });

        expect(result.ok).toBe(false);
        expect(states.some((s) => s.mode === 'error' || s.mode === 'loading')).toBe(true);
    });
});
