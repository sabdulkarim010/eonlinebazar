const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadCartDisplayUtils() {
    const code = fs.readFileSync(
        path.join(__dirname, '..', 'client', 'js', 'cartDisplayUtils.js'),
        'utf8'
    );
    const window = { EOBStorage: { getJSON: () => [], remove: () => {} }, EOBStorageKeys: { CART: 'cart' } };
    window.window = window;
    vm.createContext(window);
    vm.runInContext(code, window);
    return window.CartDisplayUtils;
}

describe('Cart API payload helpers', () => {
    let CDU;

    beforeAll(() => {
        CDU = loadCartDisplayUtils();
    });

    test('buildCartAddPayload omits price and name', () => {
        const payload = CDU.buildCartAddPayload({
            productId: 'abc123',
            quantity: 2,
            name: 'Evil',
            price: 1,
            unitPrice: 2,
            variantId: 'v1'
        });
        expect(payload.productId).toBe('abc123');
        expect(payload.quantity).toBe(2);
        expect(payload.variantId).toBe('v1');
        expect(payload.price).toBeUndefined();
        expect(payload.name).toBeUndefined();
        expect(payload.unitPrice).toBeUndefined();
    });

    test('stripGuestCartForMerge keeps productId, variantId, quantity only', () => {
        const rows = CDU.stripGuestCartForMerge([{
            id: 'p1',
            name: 'Shirt',
            price: 999,
            quantity: 1,
            variantId: 'sku-1',
            image: 'http://evil.example/x.png'
        }]);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toEqual({
            productId: 'p1',
            quantity: 1,
            variantId: 'sku-1'
        });
    });
});
