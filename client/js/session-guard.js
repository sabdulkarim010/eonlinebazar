/**
 * Project: eOnlineBazar
 * File: js/session-guard.js
 * Description: Customer session layer — fetch 401 handling, optional silent refresh,
 * checkout-safe auth drop (preserves cart + checkout draft).
 *
 * Load BEFORE other page scripts so window.fetch is patched first.
 */

(function () {
    'use strict';

    var PROTECTED_PAGES = ['/profile', '/order-details'];
    var CHECKOUT_FLOW_PAGES = ['/checkout', '/payment'];

    var PUBLIC_AUTH_ENDPOINTS = [
        '/api/customer/login',
        '/api/customer/register',
        '/api/customer/forgot-password',
        '/api/customer/reset-password',
        '/api/customer/resend-verification',
        '/api/customer/refresh-token',
        '/api/auth/login',
        '/api/auth/register',
        '/api/auth/forgot-password',
        '/api/auth/reset-password',
        '/api/auth/resend-verification',
        '/api/auth/refresh-token'
    ];

    var REFRESH_ENDPOINTS = [
        '/api/customer/refresh-token',
        '/api/auth/refresh-token'
    ];

    var LOGIN_URL = '/login';
    var loggingOut = false;
    var validatePromise = null;
    var refreshPromise = null;
    var refreshEndpointsUnavailable = false;

    function getToken() {
        if (!window.EOBStorage || !window.EOBStorageKeys) return '';
        return window.EOBStorage.get(window.EOBStorageKeys.TOKEN)
            || window.EOBStorage.get(window.EOBStorageKeys.CUSTOMER_TOKEN);
    }

    function currentPath() {
        return (window.location.pathname || '').replace(/\.html$/, '');
    }

    function isProtectedPage() {
        var path = currentPath();
        if (path === '/' || path === '/index' || path === '') return false;
        return PROTECTED_PAGES.some(function (seg) {
            return path === seg || path.indexOf(seg + '/') === 0;
        });
    }

    function isCheckoutFlowPage() {
        var path = currentPath();
        return CHECKOUT_FLOW_PAGES.indexOf(path) !== -1;
    }

    function isCommerceCheckoutActive() {
        if (isCheckoutFlowPage()) return true;
        if (!window.EOBCommerce || typeof window.EOBCommerce.getState !== 'function') {
            return false;
        }
        var state = window.EOBCommerce.getState();
        return state === 'CHECKOUT_INITIATED' || state === 'ORDER_PROCESSING';
    }

    function isAuthPage() {
        var path = currentPath();
        return path === '/login' || path === '/register' || path === '/forgot-password';
    }

    var GUEST_CHECKOUT_STORAGE_KEYS = [
        'checkout_name', 'checkout_phone', 'checkout_address', 'checkout_email',
        'checkout_district', 'checkout_upazila', 'checkout_full_address',
        'shippingDistrict', 'shippingFullName', 'shippingMobile', 'shippingAddress', 'shippingCourierNote'
    ];

    function clearGuestCheckoutStorage() {
        if (!window.EOBStorage) return;
        GUEST_CHECKOUT_STORAGE_KEYS.forEach(function (k) {
            window.EOBStorage.remove(k);
        });
    }

    function clearSessionTokensOnly() {
        if (!window.EOBStorage || !window.EOBStorageKeys) return;
        var K = window.EOBStorageKeys;
        window.EOBStorage.remove(K.TOKEN);
        window.EOBStorage.remove(K.CUSTOMER_TOKEN);
        window.EOBStorage.remove(K.CUSTOMER_DATA);
        window.EOBStorage.remove(K.USER_NAME);
    }

    function clearSession() {
        clearSessionTokensOnly();
        clearGuestCheckoutStorage();
    }

    function splitDisplayName(fullName) {
        var trimmed = String(fullName || '').trim();
        if (!trimmed) return { full: 'My Account', first: 'My Account' };
        return { full: trimmed, first: trimmed.split(/\s+/)[0] };
    }

    function updateNavbarAuthUI() {
        var token = getToken();
        var link = document.getElementById('nav-user-link');
        var line1 = document.getElementById('nav-user-line1');
        var line2 = document.getElementById('nav-user-line2');
        var navUserAvatar = document.getElementById('nav-user-avatar');

        if (token) {
            var name = window.EOBStorage && window.EOBStorageKeys
                ? window.EOBStorage.get(window.EOBStorageKeys.USER_NAME)
                : '';
            var parts = splitDisplayName(name);
            if (link) {
                link.classList.add('is-authed');
                link.style.display = 'flex';
                link.setAttribute('onclick', "window.location.href='/profile'");
                link.setAttribute('aria-label', parts.full ? ('Profile — ' + parts.full) : 'Profile');
            }
            if (line1) {
                line1.textContent = '';
                line1.style.display = 'none';
            }
            if (line2) {
                line2.textContent = parts.full;
                line2.dataset.firstName = parts.first;
                line2.classList.add('nav-user-display-name');
            }
        } else {
            if (link) {
                link.classList.remove('is-authed', 'has-avatar');
                link.style.display = 'flex';
                link.setAttribute('onclick', "window.location.href='/login'");
                link.setAttribute('aria-label', window.i18n ? window.i18n.t('nav.login') : 'Login');
            }
            if (line1) {
                line1.style.display = '';
                line1.textContent = window.i18n ? window.i18n.t('nav.login') : 'Sign in';
            }
            if (line2) {
                line2.textContent = window.i18n ? window.i18n.t('nav.profile') : 'Account';
                line2.classList.remove('nav-user-display-name');
                delete line2.dataset.firstName;
            }
            if (navUserAvatar) {
                navUserAvatar.src = '';
                navUserAvatar.style.display = 'none';
                navUserAvatar.classList.remove('is-visible');
            }
        }
    }

    function ensureSessionRevalidateModal() {
        if (document.getElementById('eobSessionRevalidateModal')) return;
        var wrap = document.createElement('div');
        wrap.id = 'eobSessionRevalidateModal';
        wrap.className = 'custom-alert-modal-overlay';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'true');
        wrap.setAttribute('aria-labelledby', 'eobSessionRevalidateTitle');
        wrap.style.display = 'none';
        wrap.innerHTML = ''
            + '<div class="custom-alert-modal-box" style="max-width:420px;">'
            + '<h3 id="eobSessionRevalidateTitle" style="margin:0 0 12px;font-size:18px;">Session expired</h3>'
            + '<p class="custom-alert-modal-message" style="margin:0 0 20px;line-height:1.5;color:#475569;">'
            + 'Your sign-in session ended. Your cart and checkout details are still saved. '
            + 'Sign in again to continue, or complete checkout as a guest if available.'
            + '</p>'
            + '<div style="display:flex;gap:10px;flex-wrap:wrap;">'
            + '<button type="button" id="eobSessionRevalidateLoginBtn" class="coupon-apply-btn" style="flex:1;">Sign in</button>'
            + '<button type="button" id="eobSessionRevalidateDismissBtn" class="coupon-remove-btn" style="flex:1;">Continue</button>'
            + '</div></div>';
        document.body.appendChild(wrap);

        document.getElementById('eobSessionRevalidateDismissBtn').addEventListener('click', function () {
            wrap.style.display = 'none';
        });
        document.getElementById('eobSessionRevalidateLoginBtn').addEventListener('click', function () {
            var next = currentPath() + (window.location.search || '');
            var loginUrl = LOGIN_URL;
            if (next && next !== '/' && next !== LOGIN_URL) {
                loginUrl += '?redirect=' + encodeURIComponent(next);
            }
            window.location.href = loginUrl;
        });
    }

    function showSessionRevalidationPrompt() {
        try {
            if (window.EOBStorage && window.EOBStorage.session) {
                window.EOBStorage.session.set('eob_session_expired', '1');
            }
        } catch (e) { /* ignore */ }

        if (typeof window.showToast === 'function') {
            window.showToast('Session expired — your checkout data is saved.', 'warning');
        }

        ensureSessionRevalidateModal();
        var modal = document.getElementById('eobSessionRevalidateModal');
        if (modal) modal.style.display = 'flex';

        var checkoutModal = document.getElementById('checkoutAlertModal');
        if (checkoutModal && checkoutModal.querySelector('.custom-alert-modal-message')) {
            checkoutModal.querySelector('.custom-alert-modal-message').innerText =
                'Your session expired. Cart and shipping details are preserved — sign in to sync your account, or continue as guest.';
            checkoutModal.style.display = 'flex';
        }
    }

    function applyNewToken(token, user) {
        if (!token) return;
        if (window.EOBCommerce && typeof window.EOBCommerce.setAuthTokens === 'function') {
            window.EOBCommerce.setAuthTokens(token, user);
        } else if (window.EOBStorage && window.EOBStorageKeys) {
            var K = window.EOBStorageKeys;
            window.EOBStorage.set(K.TOKEN, token);
            window.EOBStorage.set(K.CUSTOMER_TOKEN, token);
        }
        if (user && window.EOBStorage && window.EOBStorageKeys) {
            window.EOBStorage.setJSON(window.EOBStorageKeys.CUSTOMER_DATA, user);
            if (user.name) window.EOBStorage.set(window.EOBStorageKeys.USER_NAME, user.name);
        }
        updateNavbarAuthUI();
        try {
            if (window.SidebarDrawer && typeof window.SidebarDrawer.syncGreeting === 'function') {
                window.SidebarDrawer.syncGreeting();
            }
        } catch (e) { /* ignore */ }
    }

    function parseRefreshResponse(data) {
        if (!data || typeof data !== 'object') return null;
        var token = data.token
            || data.accessToken
            || (data.data && (data.data.token || data.data.accessToken));
        if (!token) return null;
        var user = data.user || (data.data && data.data.user) || null;
        return { token: token, user: user };
    }

    function attemptSilentRefresh() {
        if (refreshEndpointsUnavailable) return Promise.resolve(null);
        if (refreshPromise) return refreshPromise;

        var token = getToken();
        if (!token) return Promise.resolve(null);

        refreshPromise = (function () {
            var chain = Promise.resolve({ token: null, allMissing: true });
            REFRESH_ENDPOINTS.forEach(function (endpoint) {
                chain = chain.then(function (state) {
                    if (state.token) return state;
                    return nativeFetch(endpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + token
                        },
                        credentials: 'same-origin'
                    }).then(function (res) {
                        if (res.status === 404 || res.status === 501 || res.status === 405) {
                            return { token: null, allMissing: state.allMissing };
                        }
                        state.allMissing = false;
                        if (!res.ok) return { token: null, allMissing: false };
                        return res.json().catch(function () { return null; }).then(function (data) {
                            var parsed = parseRefreshResponse(data);
                            if (!parsed || !parsed.token) {
                                return { token: null, allMissing: false };
                            }
                            applyNewToken(parsed.token, parsed.user);
                            return { token: parsed.token, allMissing: false };
                        });
                    }).catch(function () {
                        return { token: null, allMissing: state.allMissing };
                    });
                });
            });
            return chain.then(function (state) {
                if (!state.token && state.allMissing) {
                    refreshEndpointsUnavailable = true;
                }
                return state.token;
            });
        })().finally(function () {
            refreshPromise = null;
        });

        return refreshPromise;
    }

    function handleUnrecoverable401() {
        if (isCommerceCheckoutActive()) {
            if (window.EOBCommerce && typeof window.EOBCommerce.dropAuthPreservingCommerce === 'function') {
                window.EOBCommerce.dropAuthPreservingCommerce(null);
            } else {
                clearSessionTokensOnly();
                if (window.EOBCommerce && typeof window.EOBCommerce.clearAuthTokens === 'function') {
                    window.EOBCommerce.clearAuthTokens();
                }
            }
            updateNavbarAuthUI();
            try {
                if (window.SidebarDrawer && typeof window.SidebarDrawer.syncGreeting === 'function') {
                    window.SidebarDrawer.syncGreeting();
                }
            } catch (e) { /* ignore */ }
            showSessionRevalidationPrompt();
            loggingOut = false;
            return;
        }

        forceLogout({ preserveCheckout: false });
    }

    function forceLogout(options) {
        options = options || {};
        if (loggingOut) return;

        if (isCommerceCheckoutActive() && options.preserveCheckout !== false) {
            handleUnrecoverable401();
            return;
        }

        loggingOut = true;
        clearSession();

        if (window.EOBCommerce && typeof window.EOBCommerce.clearAuthTokens === 'function') {
            window.EOBCommerce.clearAuthTokens();
        }

        try { updateNavbarAuthUI(); } catch (e) { /* ignore */ }
        try {
            if (window.SidebarDrawer && typeof window.SidebarDrawer.syncGreeting === 'function') {
                window.SidebarDrawer.syncGreeting();
            }
        } catch (e) { /* ignore */ }

        if (isAuthPage()) {
            loggingOut = false;
            return;
        }

        var mustRedirect = isProtectedPage() && options.redirect !== false;
        if (!mustRedirect) {
            loggingOut = false;
            return;
        }

        try {
            if (window.EOBStorage && window.EOBStorage.session) {
                window.EOBStorage.session.set('eob_session_expired', '1');
            }
        } catch (e) { /* ignore */ }

        var next = currentPath() + (window.location.search || '');
        var loginUrl = LOGIN_URL;
        if (next && next !== '/' && next !== LOGIN_URL) {
            loginUrl += '?redirect=' + encodeURIComponent(next);
        }
        window.location.replace(loginUrl);
    }

    function urlOf(input) {
        try {
            if (typeof input === 'string') return input;
            if (input && input.url) return input.url;
        } catch (e) { /* ignore */ }
        return '';
    }

    function isRefreshUrl(url) {
        return REFRESH_ENDPOINTS.some(function (p) {
            return url.indexOf(p) !== -1;
        });
    }

    function shouldHandle(url) {
        if (!url) return false;
        if (url.indexOf('/api/') === -1) return false;
        if (url.indexOf('/api/admin') !== -1) return false;
        return !PUBLIC_AUTH_ENDPOINTS.some(function (p) {
            return url.indexOf(p) !== -1;
        });
    }

    function cloneInitWithAuth(init, token) {
        var next = Object.assign({}, init || {});
        if (next._eobAuthRetried) return next;

        var headers = {};
        if (init && init.headers) {
            if (typeof Headers !== 'undefined' && init.headers instanceof Headers) {
                init.headers.forEach(function (value, key) {
                    headers[key] = value;
                });
            } else if (Array.isArray(init.headers)) {
                init.headers.forEach(function (pair) {
                    headers[pair[0]] = pair[1];
                });
            } else {
                headers = Object.assign({}, init.headers);
            }
        }
        headers.Authorization = 'Bearer ' + token;
        next.headers = headers;
        next._eobAuthRetried = true;
        return next;
    }

    var nativeFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;

    function handle401Response(input, init, response) {
        init = init || {};
        if (init._eobAuthRetried) {
            handleUnrecoverable401();
            return Promise.resolve(response);
        }

        return attemptSilentRefresh().then(function (newToken) {
            if (!newToken || !nativeFetch) {
                handleUnrecoverable401();
                return response;
            }
            var retryInit = cloneInitWithAuth(init, newToken);
            return nativeFetch(input, retryInit);
        });
    }

    if (nativeFetch && !window.__eobFetchPatched) {
        window.fetch = function (input, init) {
            return nativeFetch(input, init).then(function (response) {
                try {
                    if (
                        response
                        && response.status === 401
                        && getToken()
                        && shouldHandle(urlOf(input))
                    ) {
                        var reqUrl = urlOf(input);
                        if (isRefreshUrl(reqUrl)) {
                            handleUnrecoverable401();
                            return response;
                        }
                        return handle401Response(input, init, response);
                    }
                } catch (e) { /* never break fetch */ }
                return response;
            });
        };
        window.__eobFetchPatched = true;
    }

    function validateSession() {
        if (validatePromise) return validatePromise;

        validatePromise = (function () {
            var token = getToken();

            if (!token) {
                if (isProtectedPage()) forceLogout({ preserveCheckout: false });
                return Promise.resolve(false);
            }

            return fetch('/api/customer/profile', {
                method: 'GET',
                headers: { 'Authorization': 'Bearer ' + token }
            }).then(function (res) {
                return res.ok;
            }).catch(function () {
                return false;
            });
        })();

        return validatePromise;
    }

    window.EOBSession = {
        getToken: getToken,
        clearSession: clearSession,
        clearSessionTokensOnly: clearSessionTokensOnly,
        clearGuestCheckoutStorage: clearGuestCheckoutStorage,
        forceLogout: forceLogout,
        validate: validateSession,
        updateNavbarUI: updateNavbarAuthUI,
        isProtectedPage: isProtectedPage,
        isCheckoutFlowPage: isCheckoutFlowPage,
        isCommerceCheckoutActive: isCommerceCheckoutActive,
        attemptSilentRefresh: attemptSilentRefresh,
        handleUnrecoverable401: handleUnrecoverable401,
        PROTECTED_PAGES: PROTECTED_PAGES,
        REFRESH_ENDPOINTS: REFRESH_ENDPOINTS
    };

    document.addEventListener('DOMContentLoaded', function () {
        updateNavbarAuthUI();
        if (isProtectedPage()) {
            validateSession();
        }
    });

    document.addEventListener('languageChanged', function () {
        updateNavbarAuthUI();
        if (window.i18n) window.i18n.applyTranslations();
    });
})();
