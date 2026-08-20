/**
 * Project: EonlineBazar
 * Author: Abdul Karim Sheikh
 * File: js/admin-login.js
 * Description: Admin login — same-page 2-step UX (password, then optional 2FA).
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
   2. LOGIN PROCESS (same-page 2-step)
   Step 1: username + password
     → no 2FA: issue token and go to /admin
     → 2FA on: reveal TWO-FACTOR CODE on this form (never leave the page)
   Step 2: 6-digit code + submit again → /admin
================================================== */
function revealAdmin2faStep(message, options) {
    const tfaSection = document.getElementById('admin2faSection');
    const tfaInfo = document.getElementById('admin2faInfo');
    const tfaInput = document.getElementById('admin2faCode');
    const prompt = message || 'Enter your 6-digit Authenticator code';
    const clearInput = !options || options.clearInput !== false;

    if (tfaInfo) tfaInfo.textContent = prompt;
    if (tfaSection) {
        tfaSection.classList.add('show');
        tfaSection.setAttribute('aria-hidden', 'false');
    }
    if (typeof setAdminLoading === 'function') setAdminLoading(false);
    if (tfaInput) {
        if (clearInput) tfaInput.value = '';
        setTimeout(() => tfaInput.focus(), 50);
    }
}

function readAdmin2faCode() {
    const el = document.getElementById('admin2faCode');
    return String(el && el.value != null ? el.value : '').replace(/\D/g, '').trim();
}

let adminLoginInFlight = false;

async function handleAdminLogin() {
    if (adminLoginInFlight) return;
    if (typeof hideAdminError === 'function') hideAdminError();

    const username = document.getElementById('adminUsername')?.value.trim() || '';
    const password = document.getElementById('adminPassword')?.value.trim() || '';
    const twoFactorCode = readAdmin2faCode();
    const tfaVisible = document.getElementById('admin2faSection')?.classList.contains('show');

    if (!username || !password) {
        if (typeof showAdminError === 'function') {
            showAdminError('Please enter your username & password');
        }
        return;
    }

    if (tfaVisible && twoFactorCode.length !== 6) {
        if (typeof showAdminError === 'function') {
            showAdminError('Enter your 6-digit Authenticator code');
        }
        document.getElementById('admin2faCode')?.focus();
        return;
    }

    if (typeof setAdminLoading === 'function') setAdminLoading(true);
    adminLoginInFlight = true;

    try {
        const payload = { username, password };
        if (tfaVisible || twoFactorCode) {
            payload.otp = twoFactorCode;
            payload.twoFactorCode = twoFactorCode;
            payload.code = twoFactorCode;
            payload.totp = twoFactorCode;
        }

        console.log('[Admin Login] submitting 2FA payload', {
            username,
            tfaVisible,
            otpLength: twoFactorCode.length,
            hasOtp: Boolean(twoFactorCode)
        });

        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => ({}));

        if (response.status === 403 || response.status === 429) {
            if (typeof showAdminError === 'function') {
                showAdminError(data.message || 'Access denied.');
            }
            return;
        }

        if (data.success && data.token) {
            try {
                sessionStorage.removeItem('adminOtpToken');
                sessionStorage.removeItem('adminOtpMeta');
            } catch (_) { /* ignore */ }
            localStorage.setItem('adminToken', data.token);
            if (data.image) localStorage.setItem('adminProfilePic', data.image);
            showToast('Login successful! Redirecting to the dashboard...', 'success');
            window.location.href = '/admin';
            return;
        }

        if (data.success && data.otpRequired) {
            if (tfaVisible && twoFactorCode) {
                if (typeof showAdminError === 'function') {
                    showAdminError('Invalid 2FA Code, please try again');
                }
                document.getElementById('admin2faCode')?.focus();
                return;
            }
            const prompt = data.prompt || 'Enter your 6-digit Authenticator code';
            revealAdmin2faStep(prompt, { clearInput: true });
            showToast(data.message || prompt, 'success');
            return;
        }

        const invalid2fa = data.reason === 'INVALID_OTP' || data.reason === 'OTP_EXPIRED' || data.reason === 'OTP_NOT_FOUND';
        if (typeof showAdminError === 'function') {
            showAdminError(
                invalid2fa
                    ? (data.message || 'Invalid 2FA Code, please try again')
                    : (data.message || 'Invalid username or password.')
            );
        }
        if (invalid2fa) document.getElementById('admin2faCode')?.focus();
    } catch (err) {
        console.error('Error:', err);
        if (typeof showAdminError === 'function') {
            showAdminError('Something went wrong. Please try again.');
        }
    } finally {
        adminLoginInFlight = false;
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
        if (tfaSection) {
            tfaSection.classList.remove('show');
            tfaSection.setAttribute('aria-hidden', 'true');
        }

        if (typeof hideAdminError === 'function') hideAdminError();
    }
});



