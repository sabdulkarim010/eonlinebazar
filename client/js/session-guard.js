/**
 * Project: eOnlineBazar
 * Author: Abdul Karim Sheikh
 * File: js/session-guard.js
 * Description: Client-side session security layer that keeps the frontend in
 * sync with the database-backed JWT sessions on the server.
 *
 *   1. Global 401 interceptor  -> any protected API call that returns 401
 *      (e.g. the device was remotely logged out) instantly clears the token
 *      and redirects to the login page.
 *   2. validateSession()       -> pings the server on page load to confirm the
 *      stored token still maps to a live session.
 *   3. updateNavbarAuthUI()    -> flips the header between "Hello, <name>" and
 *      "Sign in / Account" depending on whether a valid token exists.
 *
 * IMPORTANT: This file must be loaded BEFORE any other page script so that it
 * can wrap window.fetch before those scripts make any requests.
 */

(function () {
    'use strict';

    // টোকেন দুটি নামেই সেভ করা হয় (token / customerToken) — দুটোই হ্যান্ডেল করা হলো
    var TOKEN_KEYS = ['token', 'customerToken'];

    // লগইন বাধ্যতামূলক এমন পেজগুলো (ক্লিন URL ও .html — দুই ফরম্যাটেই কাজ করে)
    var PROTECTED_PAGES = ['/profile', '/checkout', '/payment', '/order-details'];

    // এই পাবলিক রুটগুলোতে 401 এলে লগআউট ট্রিগার করা যাবে না (লগইন/রেজিস্টার ব্যর্থ হলে)
    var PUBLIC_AUTH_ENDPOINTS = [
        '/api/customer/login',
        '/api/customer/register',
        '/api/customer/forgot-password',
        '/api/customer/reset-password'
    ];

    var LOGIN_URL = '/login.html';

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
        return PROTECTED_PAGES.some(function (seg) {
            return path === seg || path.indexOf(seg) === 0;
        });
    }

    function isAuthPage() {
        var path = currentPath();
        return path === '/login' || path === '/register' || path === '/forgot-password';
    }

    // লোকাল স্টোরেজ থেকে সব সেশন/ইউজার সম্পর্কিত ডাটা মুছে ফেলা
    function clearSession() {
        var keys = TOKEN_KEYS.concat([
            'customerData', 'userName',
            'checkout_name', 'checkout_phone', 'checkout_address'
        ]);
        keys.forEach(function (k) {
            localStorage.removeItem(k);
        });
    }

    // নেভবার/হেডার ইউআই লগইন স্টেট অনুযায়ী আপডেট করা
    function updateNavbarAuthUI() {
        var token = getToken();
        var link = document.getElementById('nav-user-link');
        var line1 = document.getElementById('nav-user-line1');
        var line2 = document.getElementById('nav-user-line2');
        var navUserAvatar = document.getElementById('nav-user-avatar');

        if (token) {
            var name = localStorage.getItem('userName');
            if (line1) line1.textContent = 'Hello,';
            if (line2) line2.textContent = name || 'My Account';
            if (link) link.setAttribute('onclick', "window.location.href='/profile'");
        } else {
            // টোকেন না থাকলে সাথে সাথে "Sign in / Account" দেখাবে
            if (line1) line1.textContent = 'Sign in';
            if (line2) line2.textContent = 'Account';
            if (link) link.setAttribute('onclick', "window.location.href='/login'");
            if (navUserAvatar) {
                navUserAvatar.src = '';
                navUserAvatar.style.display = 'none';
            }
        }
    }

    /**
     * টোকেন মুছে ফেলে ইউজারকে লগআউট করা এবং প্রয়োজনে লগইন পেজে পাঠানো।
     * রিমোট লগআউট বা টোকেন এক্সপায়ার হলে এই ফাংশনটিই কেন্দ্রীয়ভাবে কাজ করে।
     */
    function forceLogout(options) {
        options = options || {};
        if (loggingOut) return;
        loggingOut = true;

        clearSession();
        try { updateNavbarAuthUI(); } catch (e) { /* DOM না থাকলেও সমস্যা নেই */ }

        // অলরেডি লগইন/রেজিস্টার পেজে থাকলে আর রিডাইরেক্ট করার দরকার নেই
        if (isAuthPage()) {
            loggingOut = false;
            return;
        }

        // লগইন পেজে গিয়ে ইউজারকে জানানোর জন্য একটি ফ্ল্যাগ রাখা
        try { sessionStorage.setItem('eob_session_expired', '1'); } catch (e) { /* ignore */ }

        window.location.replace(LOGIN_URL);
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
     * টোকেন না থাকলে (এবং প্রোটেক্টেড পেজ হলে) সরাসরি লগআউট।
     * টোকেন থাকলে /api/customer/profile কল করা হয়; রিমোটলি লগআউট হলে সার্ভার 401
     * দেবে এবং উপরের ইন্টারসেপ্টর তখনই লগআউট করিয়ে দেবে।
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
})();
