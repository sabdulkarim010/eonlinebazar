/**
 * Checkout order idempotency + submit lock (POST /api/orders).
 */

function randomHex(bytes = 16) {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const buf = new Uint8Array(bytes);
        crypto.getRandomValues(buf);
        return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
    }
    let out = '';
    for (let i = 0; i < bytes; i += 1) {
        out += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
    }
    return out;
}

function generateCheckoutIdempotencyKey() {
    return `eob_idempotency_${Date.now()}_${randomHex(16)}`;
}

function computeCheckoutAttemptFingerprint(items) {
    const list = Array.isArray(items) ? items : [];
    return list
        .map((item) => {
            const pid = item.productId || item.id || '';
            const vid = item.variantId || '';
            const qty = Math.max(1, Number(item.quantity) || 1);
            return `${pid}:${vid}:${qty}`;
        })
        .sort()
        .join('|');
}

function getCheckoutStateApi() {
    return typeof window !== 'undefined' ? window.EOBCheckoutState : null;
}

function readCheckoutSessionRecord() {
    if (typeof window === 'undefined' || !window.EOBStorageKeys) return null;
    const commerce = window.EOBCommerce;
    if (commerce && typeof commerce.getCheckoutSessionObject === 'function') {
        const fromCommerce = commerce.getCheckoutSessionObject();
        if (fromCommerce && typeof fromCommerce === 'object' && !Array.isArray(fromCommerce)) {
            return fromCommerce;
        }
    }
    const session = window.EOBStorage.getJSON(window.EOBStorageKeys.ACTIVE_CHECKOUT_SESSION, null);
    if (!session || typeof session !== 'object' || Array.isArray(session)) {
        return null;
    }
    return session;
}

function readSessionIdempotency() {
    const session = readCheckoutSessionRecord();
    if (!session) return null;
    return {
        key: session.idempotencyKey || '',
        fingerprint: session.idempotencyFingerprint || ''
    };
}

function writeSessionIdempotency(key, fingerprint) {
    if (typeof window === 'undefined' || !window.EOBStorageKeys) return;
    let session = readCheckoutSessionRecord();
    if (!session) {
        session = {};
    }
    session.idempotencyKey = key;
    session.idempotencyFingerprint = fingerprint;
    window.EOBStorage.setJSON(window.EOBStorageKeys.ACTIVE_CHECKOUT_SESSION, session);
}

function ensureCheckoutIdempotencyKey(items) {
    const fingerprint = computeCheckoutAttemptFingerprint(items);
    const stateApi = getCheckoutStateApi();
    const fromSession = readSessionIdempotency();

    if (
        fromSession?.key
        && fromSession.fingerprint === fingerprint
        && stateApi?.get('idempotencyKey') === fromSession.key
    ) {
        stateApi.set('idempotencyFingerprint', fingerprint);
        return fromSession.key;
    }

    const existingKey = stateApi?.get('idempotencyKey');
    const existingFp = stateApi?.get('idempotencyFingerprint');
    if (existingKey && existingFp === fingerprint) {
        writeSessionIdempotency(existingKey, fingerprint);
        return existingKey;
    }

    const key = generateCheckoutIdempotencyKey();
    if (stateApi) {
        stateApi.set('idempotencyKey', key);
        stateApi.set('idempotencyFingerprint', fingerprint);
    }
    writeSessionIdempotency(key, fingerprint);
    return key;
}

function invalidateCheckoutIdempotencyKey(reason) {
    const stateApi = getCheckoutStateApi();
    if (stateApi) {
        stateApi.set('idempotencyKey', null);
        stateApi.set('idempotencyFingerprint', null);
        stateApi.set('idempotencyInvalidatedReason', reason || 'cart_changed');
    }
    if (typeof broadcastCheckoutSessionInvalidated === 'function') {
        broadcastCheckoutSessionInvalidated({ reason: reason || 'cart_changed' });
    }
    if (typeof window !== 'undefined' && window.EOBStorageKeys) {
        const session = readCheckoutSessionRecord();
        if (session) {
            delete session.idempotencyKey;
            delete session.idempotencyFingerprint;
            window.EOBStorage.setJSON(window.EOBStorageKeys.ACTIVE_CHECKOUT_SESSION, session);
        }
    }
}

function clearCheckoutIdempotencyAfterSuccess() {
    const stateApi = getCheckoutStateApi();
    if (stateApi) {
        stateApi.set('idempotencyKey', null);
        stateApi.set('idempotencyFingerprint', null);
        stateApi.set('isSubmittingOrder', false);
    }
}

function getCheckoutIdempotencyKey() {
    const stateApi = getCheckoutStateApi();
    const fromState = stateApi?.get('idempotencyKey');
    if (fromState) return fromState;
    const fromSession = readSessionIdempotency();
    return fromSession?.key || '';
}

function buildIdempotencyHeaders(baseHeaders = {}) {
    const headers = { ...baseHeaders };
    const key = getCheckoutIdempotencyKey();
    if (key) headers['X-Idempotency-Key'] = key;
    return headers;
}

function beginOrderSubmitLock() {
    const stateApi = getCheckoutStateApi();
    if (stateApi?.get('isSubmittingOrder') === true) {
        return false;
    }
    if (stateApi) stateApi.set('isSubmittingOrder', true);
    if (typeof window !== 'undefined') window.isSubmittingOrder = true;
    return true;
}

function endOrderSubmitLock() {
    const stateApi = getCheckoutStateApi();
    if (stateApi) stateApi.set('isSubmittingOrder', false);
    if (typeof window !== 'undefined') window.isSubmittingOrder = false;
}

function isOrderSubmitLocked() {
    const stateApi = getCheckoutStateApi();
    return stateApi?.get('isSubmittingOrder') === true
        || (typeof window !== 'undefined' && window.isSubmittingOrder === true);
}

const idempotencyExports = {
    generateCheckoutIdempotencyKey,
    computeCheckoutAttemptFingerprint,
    ensureCheckoutIdempotencyKey,
    invalidateCheckoutIdempotencyKey,
    clearCheckoutIdempotencyAfterSuccess,
    getCheckoutIdempotencyKey,
    buildIdempotencyHeaders,
    beginOrderSubmitLock,
    endOrderSubmitLock,
    isOrderSubmitLocked
};

if (typeof window !== 'undefined') {
    Object.assign(window, idempotencyExports);
}

export {
    generateCheckoutIdempotencyKey,
    computeCheckoutAttemptFingerprint,
    ensureCheckoutIdempotencyKey,
    invalidateCheckoutIdempotencyKey,
    clearCheckoutIdempotencyAfterSuccess,
    getCheckoutIdempotencyKey,
    buildIdempotencyHeaders,
    beginOrderSubmitLock,
    endOrderSubmitLock,
    isOrderSubmitLocked
};
