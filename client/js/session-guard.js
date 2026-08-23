/**
 * Project: eOnlineBazar
 * Author: Abdul Karim Sheikh
 * File: js/session-guard.js
 * Description: Client-side session security layer that keeps the frontend in
 * sync with the database-backed JWT sessions on the server.
 *
 *   1. Global 401 interceptor  -> a protected API 401 (remote logout / expired
 *      JWT) clears the local token. Redirect to /login happens ONLY on
 *      account pages (/profile, /order-details). Public storefront pages
 *      (/, catalog, cart, checkout, CMS) stay put and show Sign in / Account.
 *   2. validateSession()       -> pings the server on page load to confirm the
 *      stored token still maps to a live session.
 *   3. updateNavbarAuthUI()    -> flips the header between signed-in name display
 *      and "Sign in / Account" depending on whether a valid token exists.
 *
 * IMPORTANT: This file must be loaded BEFORE any other page script so that it
 * can wrap window.fetch before those scripts make any requests.
 */

(function () {
    'use strict';

    // টোকেন দুটি নামেই সেভ করা হয় (token / customerToken) — দুটোই হ্যান্ডেল করা হলো
    var TOKEN_KEYS = ['token', 'customerToken'];

    // Login is required only for account surfaces — never for the public homepage.
    var PROTECTED_PAGES = ['/profile', '/order-details'];

    // এই পাবলিক রুটগুলোতে 401 এলে লগআউট ট্রিগার করা যাবে না (লগইন/রেজিস্টার ব্যর্থ হলে)
    var PUBLIC_AUTH_ENDPOINTS = [
        '/api/customer/login',
        '/api/customer/register',
        '/api/customer/forgot-password',
        '/api/customer/reset-password',
        '/api/customer/resend-verification',
        '/api/auth/login',
        '/api/auth/register',
        '/api/auth/forgot-password',
        '/api/auth/reset-password',
        '/api/auth/resend-verification'
    ];

    var LOGIN_URL = '/login';

    // রিডাইরেক্ট লুপ ঠেকাতে একবারের বেশি লগআউট চলবে না
    var loggingOut = false;
    // একই সময়ে একাধিক validate() কল হলে একটিই নেটওয়ার্ক রিকোয়েস্ট হবে
    var validatePromise = null;

    function getToken() {
        return localStorage.getItem('token') || localStorage.getItem('customerToken');
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

    function isAuthPage() {
        var path = currentPath();
        return path === '/login' || path === '/register' || path === '/forgot-password';
    }

    // লোকাল স্টোরেজ থেকে গেস্ট চেকআউট / প্রোফাইল-ক্যাশে ডাটা মুছে ফেলা
    var GUEST_CHECKOUT_STORAGE_KEYS = [
        'checkout_name', 'checkout_phone', 'checkout_address', 'checkout_email',
        'checkout_district', 'checkout_upazila', 'checkout_full_address',
        'shippingDistrict', 'shippingFullName', 'shippingMobile', 'shippingAddress', 'shippingCourierNote'
    ];

    function clearGuestCheckoutStorage() {
        GUEST_CHECKOUT_STORAGE_KEYS.forEach(function (k) {
            localStorage.removeItem(k);
        });
    }

    // লোকাল স্টোরেজ থেকে সব সেশন/ইউজার সম্পর্কিত ডাটা মুছে ফেলা
    function clearSession() {
        var keys = TOKEN_KEYS.concat([
            'customerData', 'userName'
        ]);
        keys.forEach(function (k) {
            localStorage.removeItem(k);
        });
        clearGuestCheckoutStorage();
    }

    // নেভবার/হেডার ইউআই লগইন স্টেট অনুযায়ী আপডেট করা
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
            var name = localStorage.getItem('userName');
            var parts = splitDisplayName(name);
            if (link) {
                link.classList.add('is-authed');
                link.setAttribute('onclick', "window.location.href='/profile'");
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
            if (link) link.classList.remove('is-authed');
            if (line1) {
                line1.style.display = '';
                line1.textContent = window.i18n ? window.i18n.t('nav.login') : 'Sign in';
            }
            if (line2) {
                line2.textContent = window.i18n ? window.i18n.t('nav.profile') : 'Account';
                line2.classList.remove('nav-user-display-name');
                delete line2.dataset.firstName;
            }
            if (link) link.setAttribute('onclick', "window.location.href='/login'");
            if (navUserAvatar) {
                navUserAvatar.src = '';
                navUserAvatar.style.display = 'none';
            }
        }
    }

    /**
     * Clear the local customer session. Redirect to /login ONLY on account pages.
     * On the public storefront (home, search, product, cart, checkout, CMS)
     * keep the visitor on the page and restore the Sign in / Account header.
     */
    function forceLogout(options) {
        options = options || {};
        if (loggingOut) return;
        loggingOut = true;

        clearSession();
        try { updateNavbarAuthUI(); } catch (e) { /* DOM না থাকলেও সমস্যা নেই */ }
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

        try { sessionStorage.setItem('eob_session_expired', '1'); } catch (e) { /* ignore */ }

        var next = currentPath() + (window.location.search || '');
        var loginUrl = LOGIN_URL;
        if (next && next !== '/' && next !== LOGIN_URL) {
            loginUrl += '?redirect=' + encodeURIComponent(next);
        }
        window.location.replace(loginUrl);
    }

    // কোন রিকোয়েস্টের 401-এ অটো-লগআউট হবে তা ঠিক করা
    function urlOf(input) {
        try {
            if (typeof input === 'string') return input;
            if (input && input.url) return input.url;
        } catch (e) { /* ignore */ }
        return '';
    }

    function shouldHandle(url) {
        if (!url) return false;
        if (url.indexOf('/api/') === -1) return false;
        // অ্যাডমিন প্যানেল আলাদা টোকেন ব্যবহার করে — তাই এড়িয়ে যাওয়া হলো
        if (url.indexOf('/api/admin') !== -1) return false;
        // পাবলিক অথ রুট (লগইন/রেজিস্টার) ব্যর্থ হলে লগআউট ট্রিগার করা যাবে না
        var isPublicAuth = PUBLIC_AUTH_ENDPOINTS.some(function (p) {
            return url.indexOf(p) !== -1;
        });
        return !isPublicAuth;
    }

    // ---------------------------------------------------------------
    // গ্লোবাল fetch ইন্টারসেপ্টর: যেকোনো প্রোটেক্টেড API 401 দিলে অটো-লগআউট
    // ---------------------------------------------------------------
    if (typeof window.fetch === 'function' && !window.__eobFetchPatched) {
        var nativeFetch = window.fetch.bind(window);
        window.fetch = function (input, init) {
            return nativeFetch(input, init).then(function (response) {
                try {
                    if (
                        response &&
                        response.status === 401 &&
                        getToken() &&
                        shouldHandle(urlOf(input))
                    ) {
                        forceLogout();
                    }
                } catch (e) { /* ইন্টারসেপ্টরের কারণে আসল রিকোয়েস্ট যেন না ভাঙে */ }
                return response;
            });
        };
        window.__eobFetchPatched = true;
    }

    /**
     * পেজ লোডে সার্ভারে টোকেন যাচাই করা।
     * টোকেন না থাকলে (এবং প্রোটেক্টেড পেজ হলে) সরাসরি লগইন পেজে পাঠানো।
     * পাবলিক স্টোরফ্রন্টে টোকেন না থাকলে কিছুই হয় না — গেস্ট ব্রাউজ করতে পারে।
     * টোকেন থাকলে /api/customer/profile কল করা হয়; রিমোটলি লগআউট হলে সার্ভার 401
     * দেবে এবং উপরের ইন্টারসেপ্টর সেশন ক্লিয়ার করবে (লগইন রিডাইরেক্ট শুধু প্রোটেক্টেড পেজে)।
     */
    function validateSession() {
        if (validatePromise) return validatePromise;

        validatePromise = (function () {
            var token = getToken();

            if (!token) {
                if (isProtectedPage()) forceLogout();
                return Promise.resolve(false);
            }

            return fetch('/api/customer/profile', {
                method: 'GET',
                headers: { 'Authorization': 'Bearer ' + token }
            }).then(function (res) {
                // 401 হলে ইন্টারসেপ্টর ইতিমধ্যে forceLogout() চালিয়ে দিয়েছে
                return res.ok;
            }).catch(function () {
                // নেটওয়ার্ক এরর হলে ইউজারকে জোর করে লগআউট করা হবে না
                return false;
            });
        })();

        return validatePromise;
    }

    // অন্য স্ক্রিপ্ট থেকে ব্যবহারের জন্য পাবলিক API
    window.EOBSession = {
        getToken: getToken,
        clearSession: clearSession,
        clearGuestCheckoutStorage: clearGuestCheckoutStorage,
        forceLogout: forceLogout,
        validate: validateSession,
        updateNavbarUI: updateNavbarAuthUI,
        isProtectedPage: isProtectedPage,
        PROTECTED_PAGES: PROTECTED_PAGES
    };

    // পেজ লোড হলে: নেভবার ঠিক করা + প্রোটেক্টেড পেজে সেশন যাচাই করা
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









