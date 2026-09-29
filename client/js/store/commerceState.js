/**
 * Commerce state machine + pub/sub for cart, auth, checkout, and payment flows.
 * Persistence: EOBStorage only. Legacy: window.cart / window.globalProductCatalog proxies.
 */
(function initEOBCommerce(global) {
    'use strict';

    const storage = () => global.EOBStorage;
    const keys = () => global.EOBStorageKeys;

    const STATES = Object.freeze({
        GUEST_ANONYMOUS: 'GUEST_ANONYMOUS',
        LOGGED_IN: 'LOGGED_IN',
        CART_MUTATING: 'CART_MUTATING',
        CHECKOUT_INITIATED: 'CHECKOUT_INITIATED',
        ORDER_PROCESSING: 'ORDER_PROCESSING'
    });

    const TRANSITIONS = Object.freeze({
        GUEST_ANONYMOUS: new Set(['LOGGED_IN', 'CART_MUTATING', 'CHECKOUT_INITIATED']),
        LOGGED_IN: new Set(['GUEST_ANONYMOUS', 'CART_MUTATING', 'CHECKOUT_INITIATED']),
        CART_MUTATING: new Set(['GUEST_ANONYMOUS', 'LOGGED_IN', 'CHECKOUT_INITIATED']),
        CHECKOUT_INITIATED: new Set(['ORDER_PROCESSING', 'GUEST_ANONYMOUS', 'LOGGED_IN', 'CART_MUTATING']),
        ORDER_PROCESSING: new Set(['GUEST_ANONYMOUS', 'LOGGED_IN', 'CHECKOUT_INITIATED'])
    });

    let _cart = [];
    let _globalProductCatalog = [];
    let _state = STATES.GUEST_ANONYMOUS;
    let _resumeState = null;
    /** @type {Map<string, Set<Function>>} */
    const _listeners = new Map();

    function requireStorage() {
        if (!storage()) {
            throw new Error('EOBStorage must load before commerceState.js');
        }
    }

    function emit(eventName, payload) {
        const set = _listeners.get(eventName);
        if (!set || !set.size) return;
        set.forEach((fn) => {
            try {
                fn(payload);
            } catch (err) {
                if (global.console && global.console.error) {
                    global.console.error('[EOBCommerce] subscriber error:', eventName, err);
                }
            }
        });
    }

    function subscribe(eventName, callback) {
        if (typeof callback !== 'function') return () => {};
        const key = String(eventName || '');
        if (!key) return () => {};
        if (!_listeners.has(key)) _listeners.set(key, new Set());
        _listeners.get(key).add(callback);
        return function unsubscribe() {
            const bucket = _listeners.get(key);
            if (bucket) bucket.delete(callback);
        };
    }

    function getState() {
        return _state;
    }

    function resolveAuthState() {
        return getAuthToken() ? STATES.LOGGED_IN : STATES.GUEST_ANONYMOUS;
    }

    function canTransition(from, to) {
        if (!STATES[from] || !STATES[to]) return false;
        if (from === to) return true;
        const allowed = TRANSITIONS[from];
        return allowed ? allowed.has(to) : false;
    }

    function transitionTo(next, options) {
        const opts = options || {};
        const target = STATES[next] ? next : null;
        if (!target) {
            return { ok: false, reason: 'unknown_state', from: _state, to: next };
        }
        if (_state === target) {
            return { ok: true, from: _state, to: target, noop: true };
        }
        if (!opts.force && !canTransition(_state, target)) {
            return { ok: false, reason: 'invalid_transition', from: _state, to: target };
        }
        const prev = _state;
        _state = target;
        emit('state:changed', { from: prev, to: target });
        return { ok: true, from: prev, to: target };
    }

    function computeCartPayload(items) {
        const list = Array.isArray(items) ? items : [];
        const selected = list.filter((item) => item.selected !== false);
        let totalQty = 0;
        let subtotal = 0;
        selected.forEach((item) => {
            const q = Math.max(1, Number(item.quantity) || 1);
            totalQty += q;
            subtotal += (Number(item.price) || 0) * q;
        });
        const badgeCount = list.reduce(
            (total, item) => total + Math.max(0, Number(item.quantity) || 0),
            0
        );
        return {
            items: list,
            lineCount: list.length,
            selectedLineCount: selected.length,
            totalQty,
            badgeCount,
            subtotal: Math.round(subtotal * 100) / 100
        };
    }

    function getCart() {
        return _cart;
    }

    function setCart(items, options) {
        const opts = options || {};
        _cart = Array.isArray(items) ? items : [];
        if (opts.persistGuest && !getAuthToken()) {
            persistGuestCartToStorage(_cart);
        }
        emit('cart:updated', computeCartPayload(_cart));
        return _cart;
    }

    function commitCart(options) {
        const opts = options || {};
        if (opts.persistGuest !== false && !getAuthToken()) {
            persistGuestCartToStorage(_cart);
        }
        if (!opts.silent) {
            emit('cart:updated', computeCartPayload(_cart));
        }
        return computeCartPayload(_cart);
    }

    function beginCartMutation() {
        if (_state === STATES.CART_MUTATING) return { ok: true, noop: true };
        _resumeState = _state;
        return transitionTo(STATES.CART_MUTATING, { force: true });
    }

    function endCartMutation() {
        if (_state !== STATES.CART_MUTATING) return { ok: true, noop: true };
        const target = _resumeState || resolveAuthState();
        _resumeState = null;
        if (target === STATES.CHECKOUT_INITIATED && !hasValidCheckoutSession()) {
            return transitionTo(resolveAuthState(), { force: true });
        }
        return transitionTo(target, { force: true });
    }

    function runCartMutation(mutator) {
        const result = beginCartMutation();
        if (!result.ok) return { ok: false, reason: result.reason || 'mutation_blocked' };
        try {
            if (typeof mutator === 'function') mutator();
            commitCart();
            endCartMutation();
            return { ok: true };
        } catch (err) {
            endCartMutation();
            return { ok: false, reason: 'mutation_error', error: err };
        }
    }

    function getCatalog() {
        return _globalProductCatalog;
    }

    function setCatalog(products) {
        _globalProductCatalog = Array.isArray(products) ? products : [];
        return _globalProductCatalog;
    }

    function mergeCatalog(products) {
        const incoming = Array.isArray(products) ? products : [];
        if (!incoming.length) return _globalProductCatalog;
        const byId = new Map();
        _globalProductCatalog.forEach((p) => {
            const id = String(p._id || p.id || p.productId || '');
            if (id) byId.set(id, p);
        });
        incoming.forEach((p) => {
            const id = String(p._id || p.id || p.productId || '');
            if (id) byId.set(id, p);
        });
        _globalProductCatalog = Array.from(byId.values());
        return _globalProductCatalog;
    }

    function getAuthToken() {
        if (!storage()) return '';
        const K = keys();
        return storage().get(K.TOKEN) || storage().get(K.CUSTOMER_TOKEN) || '';
    }

    function readCachedUser() {
        if (!storage()) return null;
        const K = keys();
        return storage().getJSON(K.CUSTOMER_DATA, null)
            || storage().getJSON(K.USER_INFO, null)
            || storage().getJSON(K.USER, null);
    }

    function setAuthTokens(token, userOverride) {
        requireStorage();
        const K = keys();
        if (!token) {
            storage().remove(K.TOKEN);
            storage().remove(K.CUSTOMER_TOKEN);
            emit('auth:changed', { user: null, token: null });
            if (_state === STATES.ORDER_PROCESSING || hasValidCheckoutSession()) {
                transitionTo(STATES.CHECKOUT_INITIATED, { force: true });
            } else {
                transitionTo(STATES.GUEST_ANONYMOUS, { force: true });
            }
            return;
        }
        storage().set(K.TOKEN, token);
        storage().set(K.CUSTOMER_TOKEN, token);
        const user = userOverride !== undefined ? userOverride : readCachedUser();
        emit('auth:changed', { user, token });
        if (_state !== STATES.CHECKOUT_INITIATED && _state !== STATES.ORDER_PROCESSING) {
            transitionTo(STATES.LOGGED_IN, { force: true });
        }
    }

    function dropAuthPreservingCommerce(userOverride) {
        setAuthTokens(null, userOverride !== undefined ? userOverride : null);
    }

    function clearAuthTokens() {
        setAuthTokens(null);
    }

    function readGuestCartFromStorage(catalog) {
        requireStorage();
        const CDU = global.CartDisplayUtils;
        if (CDU && typeof CDU.getNormalizedGuestCart === 'function') {
            return CDU.getNormalizedGuestCart(catalog || _globalProductCatalog);
        }
        const raw = storage().getJSON(keys().CART, []);
        return Array.isArray(raw) ? raw : [];
    }

    function persistGuestCartToStorage(items) {
        requireStorage();
        const CDU = global.CartDisplayUtils;
        if (CDU && typeof CDU.persistGuestCart === 'function') {
            return CDU.persistGuestCart(items);
        }
        storage().setJSON(keys().CART, Array.isArray(items) ? items : []);
        if (CDU && typeof CDU.broadcastCartCrossTabChange === 'function') {
            CDU.broadcastCartCrossTabChange();
        }
        return items;
    }

    function removeGuestCartStorage() {
        requireStorage();
        storage().remove(keys().CART);
    }

    function isBuyNowMode() {
        requireStorage();
        return storage().get(keys().IS_BUY_NOW_MODE) === 'true';
    }

    function setBuyNowMode(enabled) {
        requireStorage();
        const K = keys();
        if (enabled) storage().set(K.IS_BUY_NOW_MODE, 'true');
        else storage().remove(K.IS_BUY_NOW_MODE);
    }

    function getBuyNowItems() {
        requireStorage();
        const items = storage().getJSON(keys().BUY_NOW_ITEM, []);
        return Array.isArray(items) ? items : [];
    }

    function setBuyNowItems(items) {
        requireStorage();
        storage().setJSON(keys().BUY_NOW_ITEM, Array.isArray(items) ? items : []);
    }

    function clearBuyNowFlow() {
        setBuyNowMode(false);
        requireStorage();
        storage().remove(keys().BUY_NOW_ITEM);
    }

    function hasValidCheckoutSession() {
        if (!storage()) return false;
        const raw = storage().get(keys().ACTIVE_CHECKOUT_SESSION);
        if (raw === 'true') return true;
        const session = storage().getJSON(keys().ACTIVE_CHECKOUT_SESSION, null);
        return Boolean(session && typeof session === 'object' && Array.isArray(session.items) && session.items.length > 0);
    }

    function getCheckoutSessionObject() {
        requireStorage();
        const session = storage().getJSON(keys().ACTIVE_CHECKOUT_SESSION, null);
        if (session && typeof session === 'object') return session;
        return null;
    }

    function setCheckoutSessionObject(session) {
        requireStorage();
        if (!session || typeof session !== 'object' || !Array.isArray(session.items) || session.items.length === 0) {
            return { ok: false, reason: 'invalid_checkout_session' };
        }
        storage().setJSON(keys().ACTIVE_CHECKOUT_SESSION, session);
        transitionTo(STATES.CHECKOUT_INITIATED, { force: true });
        emit('checkout:session_changed', { activeSession: session });
        return { ok: true };
    }

    function markCheckoutSessionActiveFlag() {
        requireStorage();
        storage().set(keys().ACTIVE_CHECKOUT_SESSION, 'true');
        transitionTo(STATES.CHECKOUT_INITIATED, { force: true });
        emit('checkout:session_changed', { activeSession: 'true' });
    }

    function clearCheckoutSession() {
        requireStorage();
        storage().remove(keys().ACTIVE_CHECKOUT_SESSION);
        emit('checkout:session_changed', { activeSession: null });
        if (_state === STATES.CHECKOUT_INITIATED || _state === STATES.ORDER_PROCESSING) {
            transitionTo(resolveAuthState(), { force: true });
        }
    }

    function cacheCheckoutField(key, value) {
        requireStorage();
        if (value === null || value === undefined || value === '') {
            storage().remove(key);
        } else {
            storage().set(key, value);
        }
    }

    function beginOrderProcessing() {
        if (_state === STATES.ORDER_PROCESSING) {
            return { ok: true, noop: true };
        }
        if (!hasValidCheckoutSession()) {
            return { ok: false, reason: 'checkout_session_required' };
        }
        if (_state !== STATES.CHECKOUT_INITIATED) {
            const promoted = transitionTo(STATES.CHECKOUT_INITIATED, { force: true });
            if (!promoted.ok && !hasValidCheckoutSession()) {
                return { ok: false, reason: 'checkout_init_required' };
            }
        }
        return transitionTo(STATES.ORDER_PROCESSING);
    }

    function abortOrderProcessing() {
        if (_state !== STATES.ORDER_PROCESSING) return { ok: true, noop: true };
        if (hasValidCheckoutSession()) {
            return transitionTo(STATES.CHECKOUT_INITIATED, { force: true });
        }
        return transitionTo(resolveAuthState(), { force: true });
    }

    function completeOrderProcessing(options) {
        const opts = options || {};
        clearCheckoutSession();
        if (opts.clearBuyNow !== false) clearBuyNowFlow();
        if (Array.isArray(opts.clearGuestCart)) {
            _cart = opts.clearGuestCart;
            if (!getAuthToken()) persistGuestCartToStorage(_cart);
            emit('cart:updated', computeCartPayload(_cart));
        }
        return transitionTo(resolveAuthState(), { force: true });
    }

    function hydrateFromStorage() {
        if (!storage()) return;
        try {
            const token = getAuthToken();
            if (token) {
                transitionTo(STATES.LOGGED_IN, { force: true });
            } else {
                _cart = readGuestCartFromStorage(_globalProductCatalog);
                transitionTo(STATES.GUEST_ANONYMOUS, { force: true });
            }
            if (hasValidCheckoutSession()) {
                transitionTo(STATES.CHECKOUT_INITIATED, { force: true });
                const session = getCheckoutSessionObject();
                emit('checkout:session_changed', {
                    activeSession: session || storage().get(keys().ACTIVE_CHECKOUT_SESSION)
                });
            }
            emit('auth:changed', { user: readCachedUser(), token: token || null });
            emit('cart:updated', computeCartPayload(_cart));
        } catch (_) {
            transitionTo(STATES.GUEST_ANONYMOUS, { force: true });
        }
    }

    const CommerceState = {
        STATES,
        getState,
        canTransition,
        transitionTo,
        subscribe,
        emit,
        getCart,
        setCart,
        commitCart,
        beginCartMutation,
        endCartMutation,
        runCartMutation,
        getCatalog,
        setCatalog,
        mergeCatalog,
        getAuthToken,
        setAuthTokens,
        dropAuthPreservingCommerce,
        clearAuthTokens,
        readGuestCartFromStorage,
        persistGuestCartToStorage,
        removeGuestCartStorage,
        isBuyNowMode,
        setBuyNowMode,
        getBuyNowItems,
        setBuyNowItems,
        clearBuyNowFlow,
        hasValidCheckoutSession,
        getCheckoutSessionObject,
        setCheckoutSessionObject,
        markCheckoutSessionActiveFlag,
        clearCheckoutSession,
        cacheCheckoutField,
        beginOrderProcessing,
        abortOrderProcessing,
        completeOrderProcessing,
        hydrateFromStorage,
        computeCartPayload
    };

    global.EOBCommerce = CommerceState;

    try {
        Object.defineProperty(global, 'cart', {
            configurable: true,
            enumerable: true,
            get: getCart,
            set(items) {
                setCart(items, { persistGuest: !getAuthToken() });
            }
        });
        Object.defineProperty(global, 'globalProductCatalog', {
            configurable: true,
            enumerable: true,
            get: getCatalog,
            set: setCatalog
        });
    } catch (_) {
        global.cart = _cart;
        global.globalProductCatalog = _globalProductCatalog;
    }

    hydrateFromStorage();
})(typeof window !== 'undefined' ? window : globalThis);
