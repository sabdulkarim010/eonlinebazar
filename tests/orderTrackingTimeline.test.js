const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadOrderStatusTimeline() {
    const code = fs.readFileSync(
        path.join(__dirname, '..', 'client', 'js', 'orderStatusTimeline.js'),
        'utf8'
    );
    const sandbox = { document: { getElementById: () => null } };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return sandbox.OrderStatusTimeline;
}

function loadExpressCheckout() {
    const code = fs.readFileSync(
        path.join(__dirname, '..', 'client', 'js', 'expressCheckout.js'),
        'utf8'
    );
    const location = { href: '' };
    const commerce = {
        setBuyNowMode: jest.fn(),
        setBuyNowItems: jest.fn(),
        markCheckoutSessionActiveFlag: jest.fn()
    };
    const sandbox = {
        location,
        EOBCommerce: commerce,
        EOBCheckoutState: { set: jest.fn() },
        EOBStorage: { set: jest.fn(), setJSON: jest.fn(), remove: jest.fn() },
        EOBStorageKeys: {},
        showToast: jest.fn()
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return { EC: sandbox.EOBExpressCheckout, commerce, location, sandbox };
}

describe('Order tracking timeline', () => {
    let OST;

    beforeAll(() => {
        OST = loadOrderStatusTimeline();
    });

    test('delivered order marks all steps completed', () => {
        const model = OST.resolveTimelineFromOrder({
            status: 'Delivered',
            payment: { status: 'paid' },
            createdAt: '2026-01-01T00:00:00Z'
        });
        expect(model.variant).toBe('progress');
        expect(model.steps.every((s) => s.state === 'completed')).toBe(true);
    });

    test('processing order highlights processing step as active after payment verified', () => {
        const model = OST.resolveTimelineFromOrder({
            status: 'Processing',
            payment: { status: 'paid' },
            paymentMethod: 'bKash'
        });
        const processing = model.steps.find((s) => s.id === 'processing');
        const shipped = model.steps.find((s) => s.id === 'shipped');
        expect(processing.state).toBe('active');
        expect(shipped.state).toBe('pending');
        expect(model.steps.find((s) => s.id === 'payment').state).toBe('completed');
    });

    test('cancelled order uses cancelled variant', () => {
        const model = OST.resolveTimelineFromOrder({ status: 'Cancelled' });
        expect(model.variant).toBe('cancelled');
        expect(model.steps[0].state).toBe('cancelled');
    });

    test('unpaid gateway keeps payment step active', () => {
        const model = OST.resolveTimelineFromOrder({
            status: 'Pending',
            payment: { status: 'unpaid' },
            paymentMethod: 'SSLCommerz'
        });
        const payment = model.steps.find((s) => s.id === 'payment');
        expect(payment.state).toBe('active');
        expect(model.paymentOk).toBe(false);
    });

    test('shipped order sets shipped step active in model', () => {
        const model = OST.resolveTimelineFromOrder({
            status: 'Shipped',
            payment: { status: 'paid' }
        });
        expect(model.steps.find((s) => s.id === 'shipped').state).toBe('active');
        expect(model.steps.find((s) => s.id === 'delivered').state).toBe('pending');
    });
});

describe('Express Buy Now checkout', () => {
    test('startExpressCheckout persists buy-now session and redirects', () => {
        const { EC, commerce, location } = loadExpressCheckout();
        const item = { id: 'p1', productId: 'p1', name: 'Shirt', price: 500, quantity: 1 };
        const result = EC.startExpressCheckout({ items: [item], redirectTo: '/checkout.html' });

        expect(result.ok).toBe(true);
        expect(commerce.setBuyNowMode).toHaveBeenCalledWith(true);
        expect(commerce.setBuyNowItems).toHaveBeenCalledWith([item]);
        expect(commerce.markCheckoutSessionActiveFlag).toHaveBeenCalled();
        expect(location.href).toBe('/checkout.html');
    });

    test('catalog express skips redirect when out of stock', () => {
        const { EC, location } = loadExpressCheckout();
        const result = EC.startExpressFromCatalogProduct({
            _id: 'p2',
            name: 'Hat',
            price: 100,
            stock: 0,
            variants: []
        }, 1);

        expect(result.ok).toBe(false);
        expect(result.reason).toBe('out_of_stock');
        expect(location.href).toBe('');
    });

    test('variant products redirect to PDP with buyNow flag', () => {
        const { EC, location } = loadExpressCheckout();
        const result = EC.startExpressFromCatalogProduct({
            _id: 'p3',
            name: 'Shoe',
            price: 2000,
            stock: 10,
            hasVariants: true,
            variants: [{ attributes: { Color: 'Red', Size: 'M' }, stock: 5 }]
        }, 1);

        expect(result.reason).toBe('variant_required');
        expect(location.href).toContain('product-details');
        expect(location.href).toContain('buyNow=1');
    });
});
