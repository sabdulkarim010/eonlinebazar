/**
 * Project: EonlineBazar
 * Author: Abdul Karim Sheikh
 * File: js/admin-login.js
 * Description: Admin Login — password auth (OTP temporarily bypassed).
 * Also surfaces blacklist (403) and rate-limit (429) warnings cleanly.
 */

/* Arrived here from /admin/logout → revoke the server session, then wipe all
   local auth state. Must run BEFORE the "already logged in" guard so we don't
   bounce straight back into the dashboard. */
const cameFromLogout = new URLSearchParams(window.location.search).get('loggedout') === '1';

if (cameFromLogout) {
    (async function finishAdminLogout() {
        try {
            const token = localStorage.getItem('adminToken');
            if (token) {
                try {
                    await fetch('/api/admin/logout', {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + token,
                            'Content-Type': 'application/json'
                        },
                        credentials: 'same-origin',
                        keepalive: true
                    });
                } catch (_) { /* still clear local session below */ }
            }
        } catch (_) { /* ignore */ }

        try {
            localStorage.removeItem('adminToken');
            localStorage.removeItem('adminProfilePic');
            sessionStorage.removeItem('adminOtpToken');
            sessionStorage.removeItem('adminOtpMeta');
            sessionStorage.clear();
        } catch (_) { /* ignore */ }

        // Strip the ?loggedout=1 flag so a refresh won't re-run this.
        try { window.history.replaceState({}, document.title, '/admin/login'); } catch (_) { /* ignore */ }
    })();
} else if (localStorage.getItem('adminToken')) {
    /* Already logged in — verify before redirect to avoid admin ↔ login bounce loops */
    (async function verifyBeforeDashboardRedirect() {
        const existingToken = localStorage.getItem('adminToken');
        if (!existingToken) return;

        try {
            const response = await fetch('/api/admin/verify-token', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${existingToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 429) {
                showToast('Too many requests — please wait a moment, then try again.', 'error');
                return;
            }

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    try {
                        sessionStorage.removeItem('adminOtpToken');
                        sessionStorage.removeItem('adminOtpMeta');
                    } catch (_) { /* ignore */ }
                    window.location.replace('/admin');
                } else {
                    localStorage.removeItem('adminToken');
                }
                return;
            }

            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem('adminToken');
            }
        } catch (_) {
            /* Network error — stay on login; user can retry manually */
        }
    })();
}

/* ==================================================
   1. CUSTOM PROFESSIONAL TOAST SYSTEM
================================================== */
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let iconClass = type === 'success' ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-xmark';

    toast.innerHTML = `
        <i class="${iconClass}"></i>
        <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

/* ==================================================
   2. PASSWORD VISIBILITY TOGGLE
================================================== */
(function initAdminPasswordToggle() {
    const toggleBtn = document.getElementById('toggleAdminPass');
    const passwordInput = document.getElementById('adminPass');
    const eyeIcon = document.getElementById('adminEyeIcon');

    if (!toggleBtn || !passwordInput || !eyeIcon) return;

    toggleBtn.addEventListener('click', () => {
        const show = passwordInput.type === 'password';
        passwordInput.type = show ? 'text' : 'password';
        eyeIcon.className = show ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
        toggleBtn.setAttribute('title', show ? 'Hide password' : 'Show password');
        toggleBtn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        passwordInput.focus();
    });
})();

/* ==================================================
   3. LOGIN PROCESS (password → dashboard; OTP bypassed)
================================================== */
const loginForm = document.getElementById('loginForm');

if (loginForm) {
    loginForm.addEventListener('submit', async function (event) {
        event.preventDefault();

        const username = document.getElementById('adminUsername').value.trim();
        const password = document.getElementById('adminPass').value.trim();

        if (!username || !password) {
            showToast('Please enter your username & password', 'error');
            return;
        }

        const submitBtn = loginForm.querySelector('button[type="submit"]');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Verifying…'; }

        try {
            const response = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            // Blacklisted IP (403), Geo-blocked region (403), or rate limit (429)
            // => show a clear warning, no retry loop
            if (response.status === 403 || response.status === 429) {
                showToast(data.message || 'Access denied.', 'error');
                return;
            }

            // Clear any stale challenge before starting a new one
            try {
                sessionStorage.removeItem('adminOtpToken');
                sessionStorage.removeItem('adminOtpMeta');
            } catch (_) { /* ignore */ }

            // 2FA disabled → server returns a final token directly
            if (data.success && data.token) {
                localStorage.setItem('adminToken', data.token);
                if (data.image) localStorage.setItem('adminProfilePic', data.image);
                showToast('Login successful! Redirecting to the dashboard...', 'success');
                setTimeout(() => { window.location.href = '/admin'; }, 800);

            // 2FA required → hand off to the 2-step verification page
            } else if (data.success && data.otpRequired) {
                sessionStorage.setItem('adminOtpToken', data.otpToken);
                sessionStorage.setItem('adminOtpMeta', JSON.stringify({
                    method: data.method || 'email',
                    channelLabel: data.channelLabel || 'Email',
                    maskedTarget: data.maskedTarget || '',
                    delivered: !!data.delivered,
                    expiresInMinutes: data.expiresInMinutes || 5
                }));
                showToast(data.message || 'Verification required. Redirecting…', 'success');
                setTimeout(() => { window.location.href = '/admin/verify-otp'; }, 1100);

            } else {
                showToast(data.message || 'Invalid username or password.', 'error');
            }
        } catch (err) {
            console.error('Error:', err);
            showToast('Something went wrong. Please try again.', 'error');
        } finally {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Login'; }
        }
    });
} else {
    console.error('Error: Required login form not found!');
}

/* ==================================================
   4. CLEAR FORM ON BACK BUTTON
================================================== */
window.addEventListener('pageshow', function (event) {
    if (event.persisted || (window.performance && window.performance.navigation.type === 2)) {
        const form = document.getElementById('loginForm');
        if (form) form.reset();
    }
});
