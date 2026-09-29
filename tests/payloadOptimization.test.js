const fs = require('fs');
const path = require('path');
const vm = require('vm');
const request = require('supertest');
const app = require('./app');

function loadClientModules() {
    const sandbox = {
        fetch: jest.fn(),
        URLSearchParams,
        document: { addEventListener: () => {}, readyState: 'complete', dispatchEvent: () => {} },
        location: { origin: 'https://eonlinebazar.com' },
        EOBCommerce: { subscribe: () => {}, mergeCatalog: jest.fn() },
        globalProductCatalog: []
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);

    const files = [
        'client/js/utils/apiCache.js',
        'client/js/utils/catalogClient.js'
    ];
    files.forEach((rel) => {
        const code = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
        vm.runInContext(code, sandbox);
    });
    return sandbox;
}

describe('Payload optimization — catalog client', () => {
    let sandbox;

    beforeAll(() => {
        sandbox = loadClientModules();
    });

    test('home bootstrap plan uses bounded limits (<= 20)', () => {
        const plan = sandbox.EOBCatalogClient.getHomeBootstrapFetchPlan();
        expect(plan.length).toBeGreaterThanOrEqual(3);
        plan.forEach((entry) => {
            expect(entry.maxLimit).toBeLessThanOrEqual(20);
            expect(sandbox.EOBCatalogClient.assertNoBulkCatalogPrefetch(entry.url)).toBe(true);
        });
        const bulk = '/api/products?limit=500';
        expect(sandbox.EOBCatalogClient.assertNoBulkCatalogPrefetch(bulk)).toBe(false);
    });

    test('fetchProductsList clamps limit in request URL', async () => {
        sandbox.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ products: [], pagination: {} })
        });
        sandbox.EOBApiCache.resetNetworkFetchCount();

        await sandbox.EOBCatalogClient.fetchProductsList({ page: 1, limit: 500, sort: 'sales' }, 'test:clamp');

        expect(sandbox.fetch).toHaveBeenCalledTimes(1);
        const calledUrl = sandbox.fetch.mock.calls[0][0];
        expect(calledUrl).toMatch(/limit=20/);
        expect(calledUrl).not.toMatch(/limit=500/);
    });
});

describe('Payload optimization — SWR cache', () => {
    let sandbox;

    beforeEach(() => {
        sandbox = loadClientModules();
        sandbox.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ products: [{ _id: '1', name: 'A' }], pagination: { totalProducts: 1 } })
        });
        sandbox.EOBApiCache.clearAll();
        sandbox.EOBApiCache.resetNetworkFetchCount();
    });

    test('duplicate catalog fetch within TTL hits cache (single network call)', async () => {
        const url = '/api/products?page=1&limit=10&featured=true';
        await sandbox.EOBApiCache.fetchJson(url, { cacheKey: 'dup-test' });
        await sandbox.EOBApiCache.fetchJson(url, { cacheKey: 'dup-test' });
        expect(sandbox.EOBApiCache.getNetworkFetchCount()).toBe(1);
        expect(sandbox.fetch).toHaveBeenCalledTimes(1);
    });
});

describe('Payload optimization — backend bounded routes', () => {
    test('GET /api/products/lookup returns array without bulk limit', async () => {
        const res = await request(app).get('/api/products/lookup').query({ ids: '' });
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.products)).toBe(true);
    });

    test('GET /api/products/flash-deals is bounded', async () => {
        const res = await request(app).get('/api/products/flash-deals').query({ limit: 8 });
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.products)).toBe(true);
        expect(res.body.pagination.limit).toBeLessThanOrEqual(20);
    });

    test('GET /api/products?featured=true caps page size', async () => {
        const res = await request(app).get('/api/products').query({ featured: 'true', limit: 100, page: 1 });
        expect(res.status).toBe(200);
        expect(res.body.pagination.limit).toBeLessThanOrEqual(10);
    });
});
