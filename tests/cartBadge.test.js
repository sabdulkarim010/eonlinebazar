const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadCartDisplayUtils() {
    const code = fs.readFileSync(
        path.join(__dirname, '..', 'client', 'js', 'cartDisplayUtils.js'),
        'utf8'
    );
    const window = {
        EOBStorage: { getJSON: () => [], remove: () => {}, setJSON: () => {} },
        EOBStorageKeys: { CART: 'cart' },
        addEventListener: () => {},
        document: { querySelectorAll: () => [] }
    };
    window.window = window;
    vm.createContext(window);
    vm.runInContext(code, window);
    return window.CartDisplayUtils;
}

describe('Cart badge quantity', () => {
    let CDU;

    beforeAll(() => {
        CDU = loadCartDisplayUtils();
    });

    test('computeTotalCartQuantity sums line quantities (3 + 2 = 5)', () => {
        const total = CDU.computeTotalCartQuantity([
            { productId: 'a', quantity: 3 },
            { productId: 'b', quantity: 2 }
        ]);
        expect(total).toBe(5);
    });

    test('computeTotalCartQuantity treats invalid qty as 0', () => {
        const total = CDU.computeTotalCartQuantity([
            { productId: 'a', quantity: 2 },
            { productId: 'b', quantity: 'x' },
            { productId: 'c' }
        ]);
        expect(total).toBe(2);
    });

    test('resolveCartBadgeCount prefers payload.badgeCount', () => {
        expect(CDU.resolveCartBadgeCount({ badgeCount: 7 }, [{ quantity: 1 }])).toBe(7);
    });

    test('resolveCartBadgeCount falls back to items sum', () => {
        const items = [{ quantity: 4 }, { quantity: 1 }];
        expect(CDU.resolveCartBadgeCount(null, items)).toBe(5);
    });
});
