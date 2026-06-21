/********************************************************************
 * Project: EonlineBazar
 * File: js/finance-login.js
 * Author: Abdul Karim Sheikh
 * Description: Logic for the Finance Dashboard password login page.
 * Submits the password to POST /api/finance/admin-login, stores the
 * returned session token in localStorage, and redirects back to the
 * finance dashboard. JavaScript only.
 ********************************************************************/

(function () {
    'use strict';

    const LOGIN_ENDPOINT = '/api/finance/admin-login';
    const DASHBOARD_URL = '/finance-analytics';
    const FINANCE_TOKEN_KEY = 'financeToken';

    const $ = (id) => document.getElementById(id);

    /* =====================================================================
       UI HELPERS
       ===================================================================== */
    function showAlert(message, type) {
        const alert = $('flAlert');
        const text = $('flAlertText');
        if (text) text.textContent = message;
        if (alert) {
            alert.hidden = false;
            alert.classList.toggle('fl-alert--success', type === 'success');
        }
    }

    function clearAlert() {
        const alert = $('flAlert');
        if (alert) {
            alert.hidden = true;
            alert.classList.remove('fl-alert--success');
        }
    }

    function setLoading(isLoading) {
        const btn = $('flSubmit');
        const input = $('flPassword');
        if (btn) {
            btn.disabled = isLoading;
            btn.classList.toggle('fl-loading', isLoading);
        }
        if (input) input.disabled = isLoading;
    }

    /* =====================================================================
       PASSWORD VISIBILITY TOGGLE
       ===================================================================== */
    function initToggle() {
        const toggle = $('flToggle');
        const input = $('flPassword');
        if (!toggle || !input) return;

        toggle.addEventListener('click', function () {
            const isHidden = input.type === 'password';
            input.type = isHidden ? 'text' : 'password';
            toggle.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
            const icon = toggle.querySelector('i');
            if (icon) {
                icon.classList.toggle('fa-eye', !isHidden);
                icon.classList.toggle('fa-eye-slash', isHidden);
            }
            input.focus();
        });
    }

    /* =====================================================================
       LOGIN SUBMIT
       ===================================================================== */
    async function handleSubmit(event) {
        event.preventDefault();
        clearAlert();

        const input = $('flPassword');
        const password = input ? input.value.trim() : '';

        if (!password) {
            showAlert('Please enter the dashboard password.');
            if (input) input.focus();
            return;
        }

        setLoading(true);

        try {
            const res = await fetch(LOGIN_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: password })
            });

            let data = {};
            try { data = await res.json(); } catch (_) { data = {}; }

            if (res.ok && data.success && data.token) {
                // টোকেন সংরক্ষণ: (১) localStorage — API Bearer হেডারের জন্য,
                // (২) কুকি — সার্ভার-সাইড পেজ গার্ড টোকেন পড়তে পারে যেন
                // (ব্রাউজার নেভিগেশনে হেডার পাঠানো যায় না বলে কুকি প্রয়োজন)।
                localStorage.setItem(FINANCE_TOKEN_KEY, data.token);
                document.cookie = 'financeToken=' + encodeURIComponent(data.token) +
                    '; path=/; max-age=' + (8 * 60 * 60) + '; SameSite=Strict';
                showAlert('Login successful! Redirecting…', 'success');
                setTimeout(function () {
                    window.location.replace(DASHBOARD_URL);
                }, 700);
                return;
            }

            // ব্যর্থ — সার্ভারের মেসেজ দেখানো
            setLoading(false);
            showAlert(data.message || 'Incorrect password. Access denied.');
            if (input) {
                input.value = '';
                input.focus();
            }
        } catch (err) {
            console.error('Finance login error:', err);
            setLoading(false);
            showAlert('Could not reach the server. Please try again.');
        }
    }

    /* =====================================================================
       INIT
       ===================================================================== */
    function init() {
        // ইতিমধ্যে টোকেন থাকলে সরাসরি ড্যাশবোর্ডে পাঠানো
        if (localStorage.getItem(FINANCE_TOKEN_KEY)) {
            window.location.replace(DASHBOARD_URL);
            return;
        }

        initToggle();

        const form = $('flForm');
        if (form) form.addEventListener('submit', handleSubmit);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
