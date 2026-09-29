const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { buildVerifyPayload, resolvePaymentPhase } = require('../backend/src/services/paymentStatusService');

function loadPaymentStatusClient() {
    let code = fs.readFileSync(
        path.join(__dirname, '..', 'client', 'js', 'checkout', 'paymentStatusSync.js'),
        'utf8'
    );
    code = code.replace(/^export const PaymentFlowStatus/m, 'const PaymentFlowStatus');
    code = code.replace(/^export function /gm, 'function ');
    code = code.replace(/\nexport \{[\s\S]*?\};?\s*$/m, '\n');
    code = code.replace(/^export async function /gm, 'async function ');

    const sandbox = {
        fetch: jest.fn(),
        setTimeout: (fn) => {
            fn();
            return 0;
        },
        clearTimeout: () => {}
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return sandbox;
}

describe('Payment status service (backend)', () => {
    test('resolvePaymentPhase returns PAYMENT_SUCCESS when paid', () => {
        expect(resolvePaymentPhase({
            paymentMethod: 'COD',
            payment: { status: 'paid', paidAt: new Date() }
        })).toBe('PAYMENT_SUCCESS');
    });

    test('resolvePaymentPhase returns COD_PENDING for manual pending orders', () => {
        expect(resolvePaymentPhase({
            paymentMethod: 'Cash on Delivery',
            payment: { status: 'pending' }
        })).toBe('COD_PENDING');
    });

    test('resolvePaymentPhase returns PAYMENT_FAILED for failed gateway payment', () => {
        expect(resolvePaymentPhase({
            paymentMethod: 'SSLCommerz',
            payment: { status: 'failed', methodType: 'automated' }
        })).toBe('PAYMENT_FAILED');
    });
});

describe('Payment status sync (client)', () => {
    test('mapVerifyResponseToStatus does not treat pending automated as success', () => {
        const mod = loadPaymentStatusClient();
        const status = mod.mapVerifyResponseToStatus({
            phase: 'GATEWAY_VERIFYING',
            paid: false,
            paymentStatus: 'pending'
        }, 'automated');
        expect(status).toBe('GATEWAY_VERIFYING');
        expect(status).not.toBe('PAYMENT_SUCCESS');
    });

    test('resolveStatusAfterOrderCreate uses GATEWAY_INITIATED for automated methods', () => {
        const mod = loadPaymentStatusClient();
        const status = mod.resolveStatusAfterOrderCreate({ data: { payment: { status: 'pending' } } }, { type: 'automated' });
        expect(status).toBe('GATEWAY_INITIATED');
    });

    test('pollPaymentVerification stops at PAYMENT_SUCCESS without false COD success', async () => {
        const mod = loadPaymentStatusClient();
        mod.EOBCheckoutState = {
            _s: {},
            get(k) { return this._s[k]; },
            set(k, v) { this._s[k] = v; }
        };

        mod.fetch = jest.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    success: true,
                    data: { phase: 'GATEWAY_VERIFYING', paid: false, paymentStatus: 'pending' }
                })
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    success: true,
                    data: buildVerifyPayload({
                        orderId: 'EOB999',
                        status: 'Pending',
                        paymentMethod: 'SSLCommerz',
                        grandTotal: 500,
                        payment: { status: 'paid', paidAt: new Date(), methodType: 'automated' }
                    })
                })
            });

        const result = await mod.pollPaymentVerification('EOB999', {
            maxAttempts: 3,
            intervalMs: 1,
            methodType: 'automated'
        });

        expect(result.status).toBe('PAYMENT_SUCCESS');
        expect(mod.fetch).toHaveBeenCalledTimes(2);
    });
});
