/**
 * Unit tests for customer telemetry helpers (loaded in a minimal jsdom-like window).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadTelemetry(windowOverrides = {}) {
    const code = fs.readFileSync(
        path.join(__dirname, '..', 'client', 'js', 'utils', 'telemetry.js'),
        'utf8'
    );
    const window = {
        location: { href: 'http://localhost/cart', pathname: '/cart' },
        navigator: { userAgent: 'jest' },
        document: {
            querySelectorAll: () => []
        },
        addEventListener: () => {},
        setTimeout: (fn) => {
            if (typeof fn === 'function') fn();
            return 1;
        },
        clearTimeout: () => {},
        onerror: null,
        fetch: jest.fn(() => Promise.resolve({ status: 404 })),
        ...windowOverrides
    };
    window.window = window;
    vm.createContext(window);
    vm.runInContext(code, window);
    return window;
}

describe('EOBTelemetry', () => {
    test('filters extension and script noise', () => {
        const win = loadTelemetry();
        const { isNoisyError } = win.EOBTelemetry._test;
        expect(isNoisyError('Script error.', '')).toBe(true);
        expect(isNoisyError('ResizeObserver loop limit exceeded', '')).toBe(true);
        expect(isNoisyError('TypeError: boom', 'https://eonlinebazar.com/js/cart.js')).toBe(false);
    });

    test('logError on critical commerce state does not throw', () => {
        const abort = jest.fn();
        const endCart = jest.fn();
        const win = loadTelemetry({
            EOBCommerce: {
                getState: () => 'ORDER_PROCESSING',
                abortOrderProcessing: abort,
                endCartMutation: endCart,
                hasValidCheckoutSession: () => true
            },
            showToast: jest.fn()
        });
        expect(() => {
            win.EOBTelemetry.logError(new Error('payment failed'), { area: 'payment' });
        }).not.toThrow();
        expect(abort).toHaveBeenCalled();
    });

    test('recoverFrozenUi resets stuck submit button', () => {
        const btn = {
            id: 'confirmOrderFinalBtn',
            disabled: true,
            innerHTML: '<i class="fa-solid fa-spinner fa-spin"></i> Processing',
            removeAttribute: jest.fn(),
            dataset: {}
        };
        const win = loadTelemetry({
            document: {
                querySelectorAll: (sel) => {
                    if (sel === 'button, input[type="submit"]') return [btn];
                    return [];
                }
            },
            showToast: jest.fn()
        });
        win.EOBTelemetry.recoverFrozenUi({ area: 'payment', critical: true });
        expect(btn.disabled).toBe(false);
        expect(btn.innerHTML).toContain('Confirm & Place Order');
    });

    test('initGlobalErrorHandlers installs listeners once', () => {
        let errorHandlerCount = 0;
        const win = loadTelemetry({
            addEventListener: (type) => {
                if (type === 'unhandledrejection') errorHandlerCount += 1;
            }
        });
        win.EOBTelemetry.initGlobalErrorHandlers();
        win.EOBTelemetry.initGlobalErrorHandlers();
        expect(typeof win.onerror).toBe('function');
        expect(errorHandlerCount).toBe(1);
    });
});
