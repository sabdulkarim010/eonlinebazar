const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadQtySync(debounceMs = 350) {
    const utilsCode = fs.readFileSync(
        path.join(__dirname, '..', 'client', 'js', 'cartDisplayUtils.js'),
        'utf8'
    );
    const window = {
        EOBStorage: { getJSON: () => [], remove: () => {} },
        EOBStorageKeys: { CART: 'cart' },
        document: { querySelectorAll: () => [] },
        setTimeout: (...args) => setTimeout(...args),
        clearTimeout: (...args) => clearTimeout(...args)
    };
    window.window = window;
    vm.createContext(window);
    vm.runInContext(utilsCode, window);
    return window.CartDisplayUtils.createCartQtySyncManager({ debounceMs });
}

describe('Cart quantity debounce + rollback', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('10 rapid enqueues produce one sync call with final quantity', async () => {
        const sync = loadQtySync(350);
        const api = jest.fn().mockResolvedValue({ ok: true });
        const applyOptimistic = jest.fn();
        const lineKey = 'prod1::';

        for (let i = 0; i < 10; i += 1) {
            sync.enqueue({
                lineKey,
                beforeQty: 1,
                targetQty: i + 2,
                applyOptimistic,
                syncFn: api,
                onSuccess: jest.fn()
            });
            jest.advanceTimersByTime(50);
        }

        await jest.advanceTimersByTimeAsync(350);

        expect(api).toHaveBeenCalledTimes(1);
        expect(api).toHaveBeenCalledWith(11);
        expect(applyOptimistic).toHaveBeenCalled();
    });

    test('failed sync rolls back optimistic quantity', async () => {
        const sync = loadQtySync(100);
        const applyOptimistic = jest.fn();
        const onRollback = jest.fn();
        const lineKey = 'prod2::v1';

        sync.enqueue({
            lineKey,
            beforeQty: 3,
            targetQty: 5,
            applyOptimistic,
            syncFn: jest.fn().mockResolvedValue({ ok: false, status: 500, message: 'Server error' }),
            onRollback
        });

        await jest.advanceTimersByTimeAsync(100);

        expect(applyOptimistic).toHaveBeenCalledWith(5);
        expect(applyOptimistic).toHaveBeenCalledWith(3);
        expect(onRollback).toHaveBeenCalled();
        expect(onRollback.mock.calls[0][0]).toBe(3);
    });
});
