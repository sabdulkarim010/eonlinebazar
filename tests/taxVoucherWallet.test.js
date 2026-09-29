const fs = require('fs');
const path = require('path');
const vm = require('vm');

const orderQuoteUtils = require('../client/js/utils/orderQuote.js');

function mockSummaryDocument() {
    function node(id) {
        return {
            id,
            style: { display: 'none' },
            textContent: '',
            setAttribute: jest.fn(),
            querySelector: () => null
        };
    }
    const nodes = {
        cartVatRow: node('cartVatRow'),
        cartVatLabel: node('cartVatLabel'),
        cartVatAmount: node('cartVatAmount'),
        cartDiscountRow: node('cartDiscountRow'),
        cartCouponCodeLabel: node('cartCouponCodeLabel'),
        cartDiscountAmount: node('cartDiscountAmount'),
        cartGrandTotalAmount: node('cartGrandTotalAmount')
    };
    return {
        getElementById: (id) => nodes[id] || null
    };
}

function loadVoucherWalletModule(sandbox) {
    const code = fs.readFileSync(
        path.join(__dirname, '..', 'client', 'js', 'voucherWallet.js'),
        'utf8'
    );
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return sandbox.EOBVoucherWallet;
}

describe('Tax & voucher wallet UI helpers', () => {
    test('formatTaxLineLabel shows inclusive VAT copy', () => {
        const line = orderQuoteUtils.formatTaxLineLabel({
            vatAmount: 150,
            vatPercentage: 15,
            priceTaxMode: 'INCLUSIVE',
            vatEnabled: true
        });
        expect(line.show).toBe(true);
        expect(line.label).toMatch(/included/i);
        expect(line.amount).toBe(150);
    });

    test('formatTaxLineLabel shows exclusive calculated tax copy', () => {
        const line = orderQuoteUtils.formatTaxLineLabel({
            vatAmount: 75,
            vatPercentage: 5,
            priceTaxMode: 'EXCLUSIVE',
            vatEnabled: true
        });
        expect(line.show).toBe(true);
        expect(line.label).toMatch(/Calculated tax/i);
        expect(line.amount).toBe(75);
    });

    test('applyOrderSummaryLines renders VAT and discount rows', () => {
        const documentRef = mockSummaryDocument();

        orderQuoteUtils.applyOrderSummaryLines(documentRef, 'cart', {
            vatAmount: 20,
            vatPercentage: 10,
            priceTaxMode: 'EXCLUSIVE',
            vatEnabled: true,
            discountAmount: 50,
            couponCode: 'SAVE50',
            grandTotal: 970
        });

        expect(documentRef.getElementById('cartVatRow').style.display).toBe('flex');
        expect(documentRef.getElementById('cartVatAmount').textContent).toBe('৳20');
        expect(documentRef.getElementById('cartDiscountRow').style.display).toBe('flex');
        expect(documentRef.getElementById('cartDiscountAmount').textContent).toBe('-৳50');
        expect(documentRef.getElementById('cartGrandTotalAmount').textContent).toBe('৳970');
    });

    test('voucher wallet apply updates coupon storage and triggers quote refresh callback', async () => {
        const quoteRefresh = jest.fn();
        const setAppliedCoupon = jest.fn();
        const applyCouponRequest = jest.fn(async () => ({
            ok: true,
            result: {
                data: {
                    code: 'WELCOME10',
                    discountAmount: 100,
                    subtotal: 1000,
                    finalTotal: 900,
                    discountType: 'percentage',
                    discountValue: 10
                }
            }
        }));

        const rootEl = {
            innerHTML: '',
            setAttribute: jest.fn(),
            removeAttribute: jest.fn(),
            addEventListener: jest.fn(),
            contains: () => true
        };

        const sandbox = {
            window: {},
            document: {
                getElementById: (id) => {
                    if (id === 'wallet-root') return rootEl;
                    if (id === 'cartCouponFeedbackMsg') return { textContent: '' };
                    return null;
                }
            },
            EOBOrderQuote: orderQuoteUtils,
            CouponUI: {
                getAppliedCoupon: () => null,
                setAppliedCoupon,
                setCouponFeedback: jest.fn(),
                applyCouponRequest,
                buildAppliedCouponPayload: (data) => data,
                formatSuccessMessage: () => 'Applied'
            },
            fetch: jest.fn(async () => ({
                ok: true,
                json: async () => ({
                    success: true,
                    data: {
                        vouchers: [{
                            code: 'WELCOME10',
                            discountType: 'percentage',
                            discountValue: 10,
                            minOrderAmount: 0,
                            expiryDate: new Date(Date.now() + 86400000).toISOString(),
                            eligible: true,
                            estimatedSavings: 100
                        }]
                    }
                })
            })),
            setTimeout
        };
        sandbox.window = sandbox;

        const walletApi = loadVoucherWalletModule(sandbox);
        const wallet = walletApi.createVoucherWallet({
            rootId: 'wallet-root',
            getSubtotal: () => 1000,
            getCartItems: () => [],
            getToken: () => 'token',
            feedbackElId: 'cartCouponFeedbackMsg',
            onApplied: quoteRefresh
        });

        await wallet.refresh();

        const clickHandler = rootEl.addEventListener.mock.calls.find((c) => c[0] === 'click')[1];
        const fakeBtn = {
            getAttribute: (k) => (k === 'data-voucher-action' ? 'apply' : 'WELCOME10')
        };
        clickHandler({
            target: {
                closest: () => fakeBtn
            }
        });
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));

        expect(setAppliedCoupon).toHaveBeenCalledWith(
            expect.objectContaining({ code: 'WELCOME10', discountAmount: 100 })
        );
        expect(quoteRefresh).toHaveBeenCalled();
        expect(wallet).toBeTruthy();
    });

    test('scheduleCartQuotePreview posts coupon code for backend quote sync', async () => {
        jest.useFakeTimers();
        const fetchMock = jest.fn(async () => ({
            ok: true,
            json: async () => ({
                success: true,
                data: {
                    subtotal: 500,
                    tax: 25,
                    vatAmount: 25,
                    discountAmount: 50,
                    grandTotal: 475,
                    priceTaxMode: 'INCLUSIVE'
                }
            })
        }));
        global.fetch = fetchMock;

        const onQuote = jest.fn();
        orderQuoteUtils.scheduleCartQuotePreview({
            getSelectedLines: () => [{ id: 'p1', quantity: 2 }],
            getToken: () => '',
            getAppliedCouponCode: () => 'SAVE50',
            onQuote,
            debounceMs: 100
        });

        jest.advanceTimersByTime(120);
        await Promise.resolve();
        await Promise.resolve();

        expect(fetchMock).toHaveBeenCalledWith(
            '/api/orders/quote',
            expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('SAVE50')
            })
        );
        expect(onQuote).toHaveBeenCalledWith(
            expect.objectContaining({ discountAmount: 50, vatAmount: 25 })
        );

        jest.useRealTimers();
    });
});
