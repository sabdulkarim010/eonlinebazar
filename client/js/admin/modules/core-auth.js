/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/core-auth.js
 * Description: Admin token verification and auth response helpers.
 */
/* ==========================================================================
   CORE MODULE 1: DASHBOARD SECURITY & INITIALIZATION (নিরাপত্তা ও প্রাথমিককরণ)
   ========================================================================== */

// ১.১: লোকাল স্টোরেজ থেকে অ্যাডমিন টোকেন সংগ্রহ

/* shared state: token lives on window (admin-core) */

// ১.২: টোকেন না থাকলে সরাসরি লগইন পেজে রিডাইরেক্ট (সিকিউরিটি গেটওয়ে)
if (!token) {
    window.location.replace('/admin-login');
}

/**
 * Shared admin API auth/rate-limit handler.
 * Returns 'rate_limited' | 'auth_failed' | 'forbidden' | 'ok' — never redirects on HTTP 429.
 */
function handleAdminApiAuthResponse(res, data = {}) {
    if (res.status === 429) {
        const msg = data.message || 'Too many requests — please wait and try again.';
        if (typeof showToast === 'function') showToast(msg, 'warning');
        return 'rate_limited';
    }
    // Only redirect on genuine 401 — not 403 (permission/geo/rate-limit side effects)
    if (res.status === 401) {
        localStorage.removeItem('adminToken');
        window.location.replace('/admin-login');
        return 'auth_failed';
    }
    if (res.status === 403) {
        const msg = data.message || 'Access denied.';
        if (typeof showToast === 'function') showToast(msg, 'warning');
        return 'forbidden';
    }
    return 'ok';
}

/** Track consecutive poll/API errors and pause auto-refresh after repeated failures. */

/* shared state: adminPollErrorCounts lives on window (admin-core) */

/* shared state: MAX_ADMIN_POLL_ERRORS lives on window (admin-core) */

function trackAdminPollError(pollKey, res) {
    if (!adminPollErrorCounts[pollKey]) adminPollErrorCounts[pollKey] = 0;

    if (res && res.status === 429) {
        adminPollErrorCounts[pollKey]++;
        if (adminPollErrorCounts[pollKey] >= MAX_ADMIN_POLL_ERRORS) {
            console.warn(`[Admin] Too many 429s on ${pollKey}, pausing auto-refresh`);
            return true;
        }
        return false;
    }
    if (res && !res.ok) {
        adminPollErrorCounts[pollKey]++;
        return adminPollErrorCounts[pollKey] >= MAX_ADMIN_POLL_ERRORS;
    }
    adminPollErrorCounts[pollKey] = 0;
    return false;
}

function resetAdminPollErrors(pollKey) {
    adminPollErrorCounts[pollKey] = 0;
}

/**
 * ১.৩: ব্যাকএন্ডের সাথে অ্যাডমিন টোকেন লাইভ ভেরিফিকেশন করা
 * ড্যাশবোর্ড লোড হওয়ার সময় ব্যাকএন্ড API-এর মাধ্যমে চেক করে টোকেনটি আসল ও সচল কিনা
 */
async function verifyAdminTokenOnLoad() {
    try {
        const res = await fetch('/api/admin/verify-token', {
            method: 'GET',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        const data = await res.json();

        const authResult = handleAdminApiAuthResponse(res, data);
        if (authResult === 'rate_limited' || authResult === 'auth_failed') {
            return;
        }

        if (!res.ok || !data.success) {
            console.warn('Admin token verification failed:', data.message || res.status);
            return;
        }

        initAdminSocket();
    } catch (err) {
        console.error("Security Verification Critical Error:", err);
        // সার্ভার ডাউন বা কানেকশন এরর হলে নিরাপত্তা স্বার্থে কনসোলে এরর দেখানো
    }
}

/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    handleAdminApiAuthResponse,
    trackAdminPollError,
    resetAdminPollErrors,
    verifyAdminTokenOnLoad
});
