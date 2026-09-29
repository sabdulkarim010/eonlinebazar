const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadDebounceModule() {
    const code = fs.readFileSync(
        path.join(__dirname, '..', 'client', 'js', 'utils', 'debounce.js'),
        'utf8'
    );
    const sandbox = {
        setTimeout: (...args) => setTimeout(...args),
        clearTimeout: (...args) => clearTimeout(...args),
        AbortController: global.AbortController
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return sandbox.EOBDebounce;
}

function loadSearchCatalogSync() {
    const code = fs.readFileSync(
        path.join(__dirname, '..', 'client', 'js', 'searchCatalogSync.js'),
        'utf8'
    );
    const sandbox = { URLSearchParams: global.URLSearchParams };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return sandbox.EOBSearchCatalogSync;
}

describe('Search debounce & AbortController', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('rapid debounced schedules fire only one callback', () => {
        const EOBDebounce = loadDebounceModule();
        const debouncer = EOBDebounce.createAbortableDebouncer(280);
        const fn = jest.fn();

        debouncer.schedule(() => fn(), 280);
        jest.advanceTimersByTime(100);
        debouncer.schedule(() => fn(), 280);
        jest.advanceTimersByTime(100);
        debouncer.schedule(() => fn(), 280);
        jest.advanceTimersByTime(280);

        expect(fn).toHaveBeenCalledTimes(1);
    });

    test('beginRequest aborts the previous AbortController signal', () => {
        const EOBDebounce = loadDebounceModule();
        const debouncer = EOBDebounce.createAbortableDebouncer(280);

        const first = debouncer.beginRequest();
        expect(first.aborted).toBe(false);

        const second = debouncer.beginRequest();
        expect(first.aborted).toBe(true);
        expect(second.aborted).toBe(false);
    });

    test('debounced search run aborts prior in-flight signal before new fetch', async () => {
        const EOBDebounce = loadDebounceModule();
        const debouncer = EOBDebounce.createAbortableDebouncer(280);
        const signals = [];

        debouncer.schedule(async (signal) => {
            signals.push(signal);
        }, 280);

        jest.advanceTimersByTime(280);
        await Promise.resolve();

        debouncer.schedule(async (signal) => {
            signals.push(signal);
        }, 280);
        jest.advanceTimersByTime(280);
        await Promise.resolve();

        expect(signals.length).toBe(2);
        expect(signals[0].aborted).toBe(true);
        expect(signals[1].aborted).toBe(false);
    });
});

describe('Search URL state & popstate sync', () => {
    test('serialize and parse round-trip catalog filters', () => {
        const sync = loadSearchCatalogSync();
        const state = {
            query: 'shoes',
            category: 'mens-apparel',
            subCategory: '',
            minPrice: '500',
            maxPrice: '2000',
            brands: ['nike', 'adidas'],
            rating: '4',
            inStock: true,
            sort: 'price_asc',
            page: 2,
            limit: 20
        };

        const params = sync.serializeBrowserParams(state, { defaultLimit: 20 });
        const qs = params.toString();
        expect(qs).toContain('q=shoes');
        expect(qs).toContain('category=mens-apparel');
        expect(qs).toContain('minPrice=500');
        expect(qs).toContain('maxPrice=2000');
        expect(qs).toContain('sort=price_asc');
        expect(qs).toContain('page=2');

        const parsed = sync.parseUrlSearchParams(`?${qs}`, '/search');
        expect(parsed.query).toBe('shoes');
        expect(parsed.category).toBe('mens-apparel');
        expect(parsed.minPrice).toBe('500');
        expect(parsed.maxPrice).toBe('2000');
        expect(parsed.sort).toBe('price_asc');
        expect(parsed.page).toBe(2);
        expect(parsed.inStock).toBe(true);
        expect(parsed.brands).toEqual(['nike', 'adidas']);
    });

    test('subCategory maps to API category param', () => {
        const sync = loadSearchCatalogSync();
        const apiQs = sync.buildApiQueryString({
            query: '',
            category: 'parent',
            subCategory: 'child-slug',
            page: 1,
            limit: 20,
            brands: [],
            minPrice: '',
            maxPrice: '',
            rating: '',
            inStock: false,
            sort: 'newest'
        });
        expect(apiQs).toContain('category=child-slug');
        expect(apiQs).not.toContain('subCategory');
    });

    test('popstate handler restores state and triggers search (simulated)', () => {
        const sync = loadSearchCatalogSync();
        const popstateRuns = [];

        const applyPopstate = (location) => {
            const parsed = sync.parseUrlSearchParams(location.search, location.pathname);
            popstateRuns.push(parsed);
        };

        applyPopstate({ pathname: '/search', search: '?q=bag&sort=price_desc&page=1' });
        applyPopstate({ pathname: '/search', search: '?q=shoes&minPrice=100' });

        expect(popstateRuns).toHaveLength(2);
        expect(popstateRuns[0].query).toBe('bag');
        expect(popstateRuns[0].sort).toBe('price_desc');
        expect(popstateRuns[1].query).toBe('shoes');
        expect(popstateRuns[1].minPrice).toBe('100');
    });
});
