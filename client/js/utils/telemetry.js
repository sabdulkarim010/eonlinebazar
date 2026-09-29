/**
 * Customer storefront error boundary + lightweight telemetry reporter.
 * Zero hard dependencies; safe no-op when reporting endpoint is absent.
 */
(function initEOBTelemetry(global) {
    'use strict';

    var ENDPOINT = '/api/telemetry/errors';
    var MAX_BUFFER = 40;
    var FLUSH_INTERVAL_MS = 15000;
    var endpointDisabled = false;
    var handlersInstalled = false;
    var buffer = [];
    var flushTimer = null;

    var CRITICAL_COMMERCE_STATES = ['CART_MUTATING', 'ORDER_PROCESSING', 'CHECKOUT_INITIATED'];

    var NOISE_PATTERNS = [
        /^Script error\.?$/i,
        /ResizeObserver loop/i,
        /Non-Error promise rejection captured/i,
        /Loading chunk \d+ failed/i
    ];

    function safeCall(fn) {
        try {
            return fn();
        } catch (_) {
            return undefined;
        }
    }

    function isExtensionUrl(url) {
        if (!url) return false;
        var u = String(url);
        return u.indexOf('chrome-extension://') === 0
            || u.indexOf('moz-extension://') === 0
            || u.indexOf('safari-extension://') === 0
            || u.indexOf('webkit-masked-url://') === 0;
    }

    function isNoisyError(message, source) {
        var msg = String(message || '').trim();
        if (!msg && !source) return true;
        if (isExtensionUrl(source)) return true;
        for (var i = 0; i < NOISE_PATTERNS.length; i += 1) {
            if (NOISE_PATTERNS[i].test(msg)) return true;
        }
        if (msg === 'Script error.' && !source) return true;
        return false;
    }

    function collectCommerceContext() {
        return safeCall(function () {
            var commerce = global.EOBCommerce;
            if (!commerce || typeof commerce.getState !== 'function') {
                return { commerceState: null, hasCheckoutSession: false };
            }
            var state = commerce.getState();
            var hasCheckout = typeof commerce.hasValidCheckoutSession === 'function'
                ? commerce.hasValidCheckoutSession()
                : false;
            return { commerceState: state, hasCheckoutSession: !!hasCheckout };
        }) || { commerceState: null, hasCheckoutSession: false };
    }

    function collectAuthHint() {
        return safeCall(function () {
            if (!global.EOBStorage || !global.EOBStorageKeys) return 'unknown';
            var K = global.EOBStorageKeys;
            var token = global.EOBStorage.get(K.TOKEN) || global.EOBStorage.get(K.CUSTOMER_TOKEN);
            return token ? 'authenticated' : 'guest';
        }) || 'unknown';
    }

    function buildReport(level, payload) {
        var nav = global.navigator || {};
        return {
            level: level,
            message: payload.message || '',
            stack: payload.stack || '',
            name: payload.name || '',
            url: global.location ? global.location.href : '',
            path: global.location ? global.location.pathname : '',
            userAgent: nav.userAgent || '',
            auth: collectAuthHint(),
            commerce: collectCommerceContext(),
            context: payload.context || null,
            ts: Date.now()
        };
    }

    function enqueue(report) {
        buffer.push(report);
        if (buffer.length > MAX_BUFFER) {
            buffer = buffer.slice(buffer.length - MAX_BUFFER);
        }
        scheduleFlush();
    }

    function scheduleFlush() {
        if (flushTimer || endpointDisabled) return;
        flushTimer = global.setTimeout(function () {
            flushTimer = null;
            flushReports(false);
        }, FLUSH_INTERVAL_MS);
    }

    function flushReports(useBeacon) {
        if (endpointDisabled || !buffer.length) return;
        var batch = buffer.slice();
        buffer = [];
        var body = JSON.stringify({ reports: batch });

        if (useBeacon && global.navigator && typeof global.navigator.sendBeacon === 'function') {
            var sent = safeCall(function () {
                return global.navigator.sendBeacon(
                    ENDPOINT,
                    new Blob([body], { type: 'application/json' })
                );
            });
            if (sent) return;
        }

        safeCall(function () {
            if (typeof global.fetch !== 'function') return;
            global.fetch(ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: body,
                credentials: 'same-origin',
                keepalive: true
            }).then(function (res) {
                if (res.status === 404 || res.status === 501 || res.status === 405) {
                    endpointDisabled = true;
                }
            }).catch(function () { /* ignore */ });
        });
    }

    function notifyUser(message) {
        safeCall(function () {
            if (typeof global.showToast === 'function') {
                global.showToast(message, 'error');
                return;
            }
            if (typeof global.openCheckoutAlertModal === 'function') {
                global.openCheckoutAlertModal(message);
                return;
            }
            global.alert(message);
        });
    }

    function buttonLooksStuck(btn) {
        if (!btn || btn.disabled !== true) return false;
        if (btn.dataset && btn.dataset.eobLoading === '1') return true;
        var html = btn.innerHTML || '';
        if (html.indexOf('fa-spin') !== -1 || html.indexOf('spinner') !== -1) return true;
        if (btn.getAttribute && btn.getAttribute('aria-busy') === 'true') return true;
        return btn.id === 'confirmOrderFinalBtn' || btn.id === 'proceedToPaymentBtn' || btn.id === 'proceed-to-payment';
    }

    function resetStuckButton(btn) {
        if (!btn) return;
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        if (btn.dataset) btn.dataset.eobLoading = '0';
        if (btn.dataset && btn.dataset.eobDefaultHtml) {
            btn.innerHTML = btn.dataset.eobDefaultHtml;
            return;
        }
        if (btn.id === 'confirmOrderFinalBtn') {
            btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Confirm & Place Order';
            return;
        }
        if (btn.id === 'proceedToPaymentBtn' || btn.id === 'proceed-to-payment') {
            btn.innerHTML = 'Proceed to Payment';
        }
    }

    function recoverFrozenUi(contextInfo) {
        safeCall(function () {
            var commerce = global.EOBCommerce;
            if (commerce && typeof commerce.getState === 'function') {
                var st = commerce.getState();
                if (st === 'ORDER_PROCESSING' && typeof commerce.abortOrderProcessing === 'function') {
                    commerce.abortOrderProcessing();
                }
                if (st === 'CART_MUTATING' && typeof commerce.endCartMutation === 'function') {
                    commerce.endCartMutation();
                }
            }

            var nodes = global.document ? global.document.querySelectorAll('button, input[type="submit"]') : [];
            for (var i = 0; i < nodes.length; i += 1) {
                if (buttonLooksStuck(nodes[i])) resetStuckButton(nodes[i]);
            }

            if (global.document && global.document.querySelectorAll) {
                var stuck = global.document.querySelectorAll('.is-loading, .loading-overlay.is-active');
                for (var j = 0; j < stuck.length; j += 1) {
                    var el = stuck[j];
                    if (el.classList) {
                        el.classList.remove('is-loading', 'is-active');
                    }
                    if (el.style) el.style.display = '';
                }
            }
        });

        var area = (contextInfo && contextInfo.area) || 'page';
        notifyUser('Something went wrong during ' + area + '. You can try again — your cart and checkout details are still here.');
    }

    function isCriticalContext(contextInfo) {
        if (contextInfo && contextInfo.critical === true) return true;
        var commerce = collectCommerceContext();
        if (commerce.commerceState && CRITICAL_COMMERCE_STATES.indexOf(commerce.commerceState) !== -1) {
            return true;
        }
        if (contextInfo && contextInfo.area) {
            var area = String(contextInfo.area).toLowerCase();
            if (area.indexOf('cart') !== -1 || area.indexOf('checkout') !== -1 || area.indexOf('payment') !== -1) {
                return true;
            }
        }
        var path = global.location ? global.location.pathname : '';
        if (/checkout|payment|cart/i.test(path)) return true;
        return false;
    }

    function normalizeError(error, contextInfo) {
        if (error instanceof Error) {
            return {
                message: error.message,
                stack: error.stack || '',
                name: error.name || 'Error',
                context: contextInfo || null
            };
        }
        if (typeof error === 'string') {
            return { message: error, stack: '', name: 'Error', context: contextInfo || null };
        }
        if (error && typeof error === 'object') {
            return {
                message: error.message || String(error),
                stack: error.stack || '',
                name: error.name || 'Error',
                context: contextInfo || null
            };
        }
        return { message: 'Unknown error', stack: '', name: 'Error', context: contextInfo || null };
    }

    function logWarning(message, meta) {
        var payload = normalizeError(message, meta || { level: 'warning' });
        enqueue(buildReport('warning', payload));
    }

    function logError(error, contextInfo) {
        var payload = normalizeError(error, contextInfo);
        if (isNoisyError(payload.message, contextInfo && contextInfo.source)) {
            return;
        }
        enqueue(buildReport('error', payload));
        if (isCriticalContext(contextInfo)) {
            recoverFrozenUi(contextInfo);
        }
    }

    function onWindowError(message, source, lineno, colno, error) {
        if (isNoisyError(message, source)) return false;
        logError(error || new Error(String(message)), {
            source: source,
            line: lineno,
            column: colno,
            type: 'window.onerror'
        });
        return false;
    }

    function onUnhandledRejection(event) {
        var reason = event && event.reason;
        var err = reason instanceof Error ? reason : new Error(String(reason));
        if (isNoisyError(err.message, '')) return;
        logError(err, { type: 'unhandledrejection' });
    }

    function initGlobalErrorHandlers() {
        if (handlersInstalled) return;
        handlersInstalled = true;

        global.onerror = onWindowError;
        global.addEventListener('unhandledrejection', onUnhandledRejection);

        global.addEventListener('pagehide', function () {
            flushReports(true);
        });

        global.addEventListener('visibilitychange', function () {
            if (global.document && global.document.visibilityState === 'hidden') {
                flushReports(true);
            }
        });
    }

    var EOBTelemetry = {
        logError: logError,
        logWarning: logWarning,
        initGlobalErrorHandlers: initGlobalErrorHandlers,
        flush: function () { flushReports(false); },
        recoverFrozenUi: recoverFrozenUi,
        _test: {
            isNoisyError: isNoisyError,
            isCriticalContext: isCriticalContext,
            buttonLooksStuck: buttonLooksStuck
        }
    };

    global.EOBTelemetry = EOBTelemetry;
    initGlobalErrorHandlers();
})(typeof window !== 'undefined' ? window : globalThis);
