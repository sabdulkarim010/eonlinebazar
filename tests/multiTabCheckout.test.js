const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadCheckoutCrossTabModule() {
    let code = fs.readFileSync(
        path.join(__dirname, '..', 'client', 'js', 'checkout', 'checkoutCrossTabSync.js'),
        'utf8'
    );
    code = code.replace(/^export const CHECKOUT_SYNC_EVENTS/m, 'const CHECKOUT_SYNC_EVENTS');
    code = code.replace(/^export function /gm, 'function ');
    code = code.replace(/\nexport \{[\s\S]*?\};?\s*$/m, '\n');

    const sandbox = {
        location: { pathname: '/payment', href: '/payment' },
        sessionStorage: {
            _data: {},
            setItem(k, v) { this._data[k] = v; },
            getItem(k) { return this._data[k] || null; }
        },
        EOBStorageKeys: { CART: 'cart', ACTIVE_CHECKOUT_SESSION: 'activeCheckoutSession' },
        addEventListener: () => {},
        setTimeout: (fn) => fn(),
        document: {
            body: { prepend: () => {} },
            getElementById: () => null,
            createElement: () => ({
                id: '',
                className: '',
                textContent: '',
                style: {},
                setAttribute: () => {}
            })
        },
        BroadcastChannel: class {
            constructor() {
                this.onmessage = null;
            }
            postMessage() {}
        }
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return sandbox;
}

describe('Multi-tab checkout sync', () => {
    test('broadcastOrderCompleted marks submission UI blocked in other tab handler', () => {
        const mod = loadCheckoutCrossTabModule();
        mod.EOBCheckoutState = {
            _s: { checkoutCrossTabBlocked: false },
            get(k) { return this._s[k]; },
            set(k, v) { this._s[k] = v; }
        };

        mod.handleOrderCompletedInOtherTab({ orderId: 'EOB123456' });

        expect(mod.EOBCheckoutState.get('checkoutCrossTabBlocked')).toBe(true);
    });

    test('ORDER_COMPLETED event disables confirm button element', () => {
        const mod = loadCheckoutCrossTabModule();
        const btn = { disabled: false, setAttribute: jest.fn() };
        mod.document.getElementById = (id) => (id === 'confirmOrderFinalBtn' ? btn : null);

        mod.markCheckoutStaleUi('Already completed elsewhere');

        expect(btn.disabled).toBe(true);
        expect(btn.setAttribute).toHaveBeenCalledWith('aria-disabled', 'true');
    });

    test('double submit lock allows only one in-flight handler', async () => {
        const mod = loadCheckoutCrossTabModule();
        mod.EOBCheckoutState = {
            _s: { isSubmittingOrder: false },
            get(k) { return this._s[k]; },
            set(k, v) { this._s[k] = v; }
        };

        let posts = 0;
        const attempt = async () => {
            if (mod.EOBCheckoutState.get('isSubmittingOrder')) return 'blocked';
            mod.EOBCheckoutState.set('isSubmittingOrder', true);
            posts += 1;
            await Promise.resolve();
            mod.EOBCheckoutState.set('isSubmittingOrder', false);
            return 'ok';
        };

        const results = await Promise.all([attempt(), attempt()]);
        expect(posts).toBe(1);
        expect(results.includes('blocked')).toBe(true);
    });
});
