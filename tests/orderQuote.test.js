const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { stripQuoteLine, resolveShippingDistrict } = require('../backend/src/services/orderQuoteService');

function loadQuoteClientModule() {
    let code = fs.readFileSync(
        path.join(__dirname, '..', 'client', 'js', 'checkout', 'quote.js'),
        'utf8'
    );
    code = code.replace(/\nexport\s+\{[\s\S]*?\};?\s*$/m, '\n');

    const sandbox = {
        window: {},
        document: { getElementById: () => null, querySelectorAll: () => [] },
        setTimeout,
        clearTimeout,
        fetch: jest.fn()
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return sandbox;
}

describe('Order quote service', () => {
    test('stripQuoteLine omits client price and keeps identifiers', () => {
        const row = stripQuoteLine({
            productId: 'abc',
            variantId: 'v1',
            quantity: 2,
            price: 1,
            name: 'Tampered'
        });
        expect(row).toEqual({
            productId: 'abc',
            quantity: 2,
            variantId: 'v1'
        });
    });

    test('resolveShippingDistrict reads nested shippingAddress', () => {
        expect(resolveShippingDistrict({
            shippingAddress: { district: 'Dhaka' }
        })).toBe('Dhaka');
    });
});

describe('Checkout quote client helpers', () => {
    test('normalizeActiveQuote maps server totals', () => {
        const quoteModule = loadQuoteClientModule();
        const q = quoteModule.normalizeActiveQuote({
            subtotal: 1000,
            shippingFee: 60,
            tax: 15,
            discountAmount: 100,
            grandTotal: 975,
            payableAfterWallet: 900,
            walletApplied: 75
        });
        expect(q.subtotal).toBe(1000);
        expect(q.shippingFee).toBe(60);
        expect(q.vatAmount).toBe(15);
        expect(q.grandTotal).toBe(975);
        expect(q.payableAfterWallet).toBe(900);
    });

    test('resolvePayableFromQuoteOrSession prefers server over tampered session', () => {
        const quoteModule = loadQuoteClientModule();
        const totals = quoteModule.resolvePayableFromQuoteOrSession(
            { subtotal: 500, shippingFee: 50, tax: 0, discountAmount: 0, grandTotal: 550, payableAfterWallet: 550 },
            { subtotal: 1, grandTotal: 1, payableAfterWallet: 1 }
        );
        expect(totals.source).toBe('server');
        expect(totals.grandTotal).toBe(550);
        expect(totals.payableAfterWallet).toBe(550);
    });

    test('fetchOrderQuote updates EOBCheckoutState.activeQuote', async () => {
        const state = {
            activeQuote: null,
            quoteMeta: null
        };
        const quoteModule = loadQuoteClientModule();
        quoteModule.EOBCheckoutState = {
            get: (k) => state[k],
            set: (k, v) => { state[k] = v; }
        };
        quoteModule.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => ({
                success: true,
                data: {
                    subtotal: 200,
                    shippingFee: 60,
                    tax: 0,
                    discountAmount: 0,
                    grandTotal: 260,
                    payableAfterWallet: 260
                },
                items: [{ productId: 'p1', quantity: 1, price: 200 }]
            })
        }));

        quoteModule.getCheckoutItems = () => ([{ id: 'p1', quantity: 1, price: 1 }]);
        quoteModule.getCheckoutAuthToken = () => '';
        quoteModule.selectedShippingDistrict = 'Dhaka';
        quoteModule.selectedShippingUpazila = '';
        quoteModule.applyWalletAtCheckout = false;
        quoteModule.applyLoyaltyAtCheckout = false;
        quoteModule.getAppliedCoupon = () => null;
        quoteModule.resolveShippingZoneLabel = () => 'Inside City';

        await quoteModule.fetchOrderQuote({ silent: true });

        expect(quoteModule.fetch).toHaveBeenCalledWith(
            '/api/orders/quote',
            expect.objectContaining({ method: 'POST' })
        );
        expect(state.activeQuote.grandTotal).toBe(260);
        expect(state.activeQuote.subtotal).toBe(200);
        expect(state.quoteMeta.valid).not.toBe(false);
    });
});
