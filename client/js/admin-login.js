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

        try { window.history.replaceState({}, document.title, '/admin/login'); } catch (_) { /* ignore */ }
    })();
} else if (localStorage.getItem('adminToken')) {
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
                if (typeof showAdminError === 'function') {
                    showAdminError('Too many requests — please wait a moment, then try again.');
                }
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
   1. CUSTOM PROFESSIONAL TOAST SYSTEM (success / info)
================================================== */
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = type === 'success' ? '✓' : '✕';

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-12px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

/* ==================================================
   2. LOGIN PROCESS
   password + optional 2FA code → dashboard
   2FA enabled but code blank → /admin/verify-otp
================================================== */
async function handleAdminLogin() {
    if (typeof hideAdminError === 'function') hideAdminError();

    const username = document.getElementById('adminUsername')?.value.trim() || '';
    const password = document.getElementById('adminPassword')?.value.trim() || '';
    const twoFactorCode = (document.getElementById('admin2faCode')?.value || '').replace(/\D/g, '').trim();

    if (!username || !password) {
        if (typeof showAdminError === 'function') {
            showAdminError('Please enter your username & password');
        }
        return;
    }

    if (typeof setAdminLoading === 'function') setAdminLoading(true);

    try {
        const payload = { username, password };
        if (twoFactorCode) {
            payload.otp = twoFactorCode;
            payload.twoFactorCode = twoFactorCode;
        }

        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.status === 403 || response.status === 429) {
            if (typeof showAdminError === 'function') {
                showAdminError(data.message || 'Access denied.');
            }
            return;
        }

        try {
            sessionStorage.removeItem('adminOtpToken');
            sessionStorage.removeItem('adminOtpMeta');
        } catch (_) { /* ignore */ }

        // Password (+ optional 2FA) accepted — go straight to the dashboard.
        if (data.success && data.token) {
            localStorage.setItem('adminToken', data.token);
            if (data.image) localStorage.setItem('adminProfilePic', data.image);
            showToast('Login successful! Redirecting to the dashboard...', 'success');
            setTimeout(() => { window.location.href = '/admin'; }, 800);

        } else if (data.success && data.otpRequired) {
            // 2FA is on but the login-form code was left blank.
            sessionStorage.setItem('adminOtpToken', data.otpToken);
            sessionStorage.setItem('adminOtpMeta', JSON.stringify({
                method: data.method || 'email',
                channelLabel: data.channelLabel || 'Email',
                maskedTarget: data.maskedTarget || '',
                delivered: !!data.delivered,
                expiresInMinutes: data.expiresInMinutes || 5
            }));

            const tfaSection = document.getElementById('admin2faSection');
            if (tfaSection) tfaSection.classList.add('show');

            showToast(data.message || 'Verification required. Redirecting…', 'success');
            setTimeout(() => { window.location.href = '/admin/verify-otp'; }, 1100);

        } else {
            if (typeof showAdminError === 'function') {
                showAdminError(data.message || 'Invalid username or password.');
            }
        }
    } catch (err) {
        console.error('Error:', err);
        if (typeof showAdminError === 'function') {
            showAdminError('Something went wrong. Please try again.');
        }
    } finally {
        if (typeof setAdminLoading === 'function') setAdminLoading(false);
    }
}

window.handleAdminLogin = handleAdminLogin;

const loginForm = document.getElementById('adminLoginForm');

if (loginForm) {
    loginForm.addEventListener('submit', function (event) {
        event.preventDefault();
        handleAdminLogin();
    });
} else {
    console.error('Error: Required login form not found!');
}

/* ==================================================
   3. CLEAR FORM ON BACK BUTTON
================================================== */
window.addEventListener('pageshow', function (event) {
    if (event.persisted || (window.performance && window.performance.navigation.type === 2)) {
        const form = document.getElementById('adminLoginForm');
        if (form) form.reset();

        const eyeBtn = document.getElementById('adminPasswordEye');
        if (eyeBtn) eyeBtn.classList.remove('show');

        const tfaSection = document.getElementById('admin2faSection');
        if (tfaSection) tfaSection.classList.remove('show');

        if (typeof hideAdminError === 'function') hideAdminError();
    }
});



