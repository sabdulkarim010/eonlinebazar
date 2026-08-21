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
     → 2FA on: reveal six-digit OTP boxes (never leave the page)
   Step 2: 6-digit code + auto-submit → /admin
================================================== */

let otpTimerInterval = null;
let otpAutoSubmitTimer = null;
let otpAutoSubmitting = false;

function otpBoxes() {
    return Array.from(document.querySelectorAll('#otpBoxContainer .otp-box'));
}

function getOtpValue() {
    return otpBoxes().map((box) => String(box.value || '').replace(/\D/g, '')).join('');
}

function syncHiddenOtpField() {
    const hidden = document.getElementById('admin2faCode');
    if (hidden) hidden.value = getOtpValue();
}

function setOtpStatus(message, kind) {
    const el = document.getElementById('otpStatusText');
    if (!el) return;
    el.textContent = message;
    el.className = 'otp-status' + (kind === 'ok' ? ' is-ok' : kind === 'bad' ? ' is-bad' : '');
}

function setOtpIconState(state) {
    const wrap = document.getElementById('otpIconWrapper');
    if (!wrap) return;
    wrap.classList.remove('is-success', 'is-error');
    if (state === 'success') {
        wrap.classList.add('is-success');
        wrap.textContent = '✓';
    } else if (state === 'error') {
        wrap.classList.add('is-error');
        wrap.textContent = '🔐';
    } else {
        wrap.textContent = '🔐';
    }
}

function fillOtpBoxes(digits, { focusLast = true } = {}) {
    const boxes = otpBoxes();
    const chars = String(digits || '').replace(/\D/g, '').slice(0, 6).split('');
    boxes.forEach((box, i) => {
        box.value = chars[i] || '';
        box.classList.toggle('is-filled', Boolean(chars[i]));
        box.classList.remove('is-success', 'is-error');
    });
    syncHiddenOtpField();
    if (focusLast) {
        const nextEmpty = boxes.find((box) => !box.value);
        (nextEmpty || boxes[boxes.length - 1])?.focus();
    }
}

function clearOtpBoxes({ focus = false } = {}) {
    otpAutoSubmitting = false;
    if (otpAutoSubmitTimer) {
        clearTimeout(otpAutoSubmitTimer);
        otpAutoSubmitTimer = null;
    }
    otpBoxes().forEach((box) => {
        box.value = '';
        box.classList.remove('is-filled', 'is-success', 'is-error');
    });
    syncHiddenOtpField();
    setOtpIconState('idle');
    setOtpStatus('Enter all 6 digits to sign in automatically');
    if (focus) otpBoxes()[0]?.focus();
}

function shakeOtpBoxes() {
    const row = document.getElementById('otpBoxContainer');
    if (!row) return;
    row.classList.remove('is-shaking');
    void row.offsetWidth;
    row.classList.add('is-shaking');
    otpBoxes().forEach((box) => {
        box.classList.remove('is-success', 'is-filled');
        box.classList.add('is-error');
    });
    setTimeout(() => {
        row.classList.remove('is-shaking');
        otpBoxes().forEach((box) => box.classList.remove('is-error'));
    }, 450);
}

function markOtpSuccessPending() {
    otpBoxes().forEach((box) => {
        box.classList.add('is-filled', 'is-success');
    });
    setOtpIconState('success');
    setOtpStatus('Code complete — signing in...', 'ok');
}

function startOtpTimer() {
    const timerEl = document.getElementById('otpTimer');
    const barEl = document.getElementById('otpTimerBar');

    function tick() {
        const remaining = 30 - (Math.floor(Date.now() / 1000) % 30);
        const pct = (remaining / 30) * 100;
        if (timerEl) {
            timerEl.textContent = remaining + 's';
            timerEl.classList.toggle('is-urgent', remaining <= 8);
        }
        if (barEl) barEl.style.width = pct + '%';
    }

    tick();
    return setInterval(tick, 1000);
}

function stopOtpTimer() {
    if (otpTimerInterval) {
        clearInterval(otpTimerInterval);
        otpTimerInterval = null;
    }
}

function checkOtpComplete() {
    syncHiddenOtpField();
    if (getOtpValue().length !== 6) return;
    if (otpAutoSubmitting || adminLoginInFlight) return;
    otpAutoSubmitting = true;
    markOtpSuccessPending();
    otpAutoSubmitTimer = setTimeout(() => {
        otpAutoSubmitTimer = null;
        if (typeof window.handleAdminLogin === 'function') window.handleAdminLogin();
    }, 450);
}

function otpInputHandler(input) {
    const raw = String(input.value || '').replace(/\D/g, '');
    if (raw.length > 1) {
        fillOtpBoxes(raw);
        if (raw.length === 6) checkOtpComplete();
        return;
    }
    const digit = raw.slice(0, 1);
    input.value = digit;
    input.classList.toggle('is-filled', Boolean(digit));
    input.classList.remove('is-error', 'is-success');
    syncHiddenOtpField();
    if (!digit) return;

    const next = document.querySelector(`.otp-box[data-index="${Number(input.dataset.index) + 1}"]`);
    if (next) next.focus();
    checkOtpComplete();
}

function otpKeydownHandler(event, input) {
    const index = Number(input.dataset.index);

    if (event.key === 'Backspace') {
        if (input.value) {
            input.value = '';
            input.classList.remove('is-filled', 'is-success');
            syncHiddenOtpField();
            event.preventDefault();
            return;
        }
        const prev = document.querySelector(`.otp-box[data-index="${index - 1}"]`);
        if (prev) {
            prev.value = '';
            prev.classList.remove('is-filled', 'is-success');
            prev.focus();
            syncHiddenOtpField();
        }
        event.preventDefault();
        return;
    }

    if (event.key === 'Enter') {
        event.preventDefault();
        if (getOtpValue().length === 6) checkOtpComplete();
        else if (typeof window.handleAdminLogin === 'function') window.handleAdminLogin();
        return;
    }

    if (event.key === 'ArrowLeft') {
        event.preventDefault();
        document.querySelector(`.otp-box[data-index="${index - 1}"]`)?.focus();
    }
    if (event.key === 'ArrowRight') {
        event.preventDefault();
        document.querySelector(`.otp-box[data-index="${index + 1}"]`)?.focus();
    }
}

function otpPasteHandler(event) {
    event.preventDefault();
    const pasted = ((event.clipboardData || window.clipboardData).getData('text') || '')
        .replace(/\D/g, '')
        .slice(0, 6);
    if (!pasted) return;
    fillOtpBoxes(pasted);
    if (pasted.length === 6) checkOtpComplete();
}

function bindOtpBoxes() {
    const row = document.getElementById('otpBoxContainer');
    if (!row || row.dataset.bound === '1') return;
    row.dataset.bound = '1';
    row.addEventListener('paste', otpPasteHandler);
    otpBoxes().forEach((box) => {
        box.addEventListener('input', () => otpInputHandler(box));
        box.addEventListener('keydown', (event) => otpKeydownHandler(event, box));
        box.addEventListener('focus', () => box.select());
    });

    const hidden = document.getElementById('admin2faCode');
    if (hidden) {
        hidden.addEventListener('input', () => {
            const digits = String(hidden.value || '').replace(/\D/g, '').slice(0, 6);
            if (digits.length) {
                fillOtpBoxes(digits);
                if (digits.length === 6) checkOtpComplete();
            }
        });
    }
}

function setLoginChromeVisible(visible) {
    document.querySelectorAll('.admin-heading, .admin-desc').forEach((el) => {
        el.style.display = visible ? '' : 'none';
    });
}

function backToLogin() {
    stopOtpTimer();
    const tfaSection = document.getElementById('admin2faSection');
    const loginStep = document.getElementById('adminLoginStep');
    if (tfaSection) {
        tfaSection.classList.remove('show');
        tfaSection.setAttribute('aria-hidden', 'true');
    }
    if (loginStep) loginStep.classList.remove('is-hidden');
    setLoginChromeVisible(true);
    clearOtpBoxes();
    if (typeof hideAdminError === 'function') hideAdminError();
    if (typeof setAdminLoading === 'function') setAdminLoading(false);
    document.getElementById('adminPassword')?.focus();
}

function revealAdmin2faStep(message, options) {
    const tfaSection = document.getElementById('admin2faSection');
    const tfaInfo = document.getElementById('admin2faInfo');
    const loginStep = document.getElementById('adminLoginStep');
    const prompt = message || 'Open Google Authenticator and enter the 6-digit code';
    const method = options?.method || 'totp';
    const iconEl = document.getElementById('otpIconWrapper');
    if (iconEl) {
        const iconTarget = iconEl.querySelector('span') || iconEl;
        if (method === 'email') {
            iconEl.style.background = 'linear-gradient(135deg, #0369a1, #0ea5e9)';
            iconTarget.textContent = '📧';
        } else if (method === 'sms') {
            iconEl.style.background = 'linear-gradient(135deg, #15803d, #22c55e)';
            iconTarget.textContent = '📱';
        } else {
            iconEl.style.background = 'linear-gradient(135deg, #1e40af, #3b82f6)';
            iconTarget.textContent = '🔐';
        }
    }
    const clearInput = !options || options.clearInput !== false;

    if (tfaInfo) tfaInfo.textContent = prompt;
    if (loginStep) loginStep.classList.add('is-hidden');
    setLoginChromeVisible(false);
    if (tfaSection) {
        tfaSection.classList.add('show');
        tfaSection.setAttribute('aria-hidden', 'false');
    }
    if (typeof setAdminLoading === 'function') setAdminLoading(false);
    if (clearInput) clearOtpBoxes();

    stopOtpTimer();
    otpTimerInterval = startOtpTimer();
    setTimeout(() => otpBoxes()[0]?.focus(), 60);
}

function readAdmin2faCode() {
    syncHiddenOtpField();
    return getOtpValue();
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
        shakeOtpBoxes();
        setOtpStatus('Please enter all 6 digits', 'bad');
        otpBoxes()[0]?.focus();
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
            otpAutoSubmitting = false;
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
            markOtpSuccessPending();
            localStorage.setItem('adminToken', data.token);
            if (data.image) localStorage.setItem('adminProfilePic', data.image);
            showToast('Login successful! Redirecting to the dashboard...', 'success');
            window.location.href = '/admin';
            return;
        }

        if (data.success && data.otpRequired) {
            if (tfaVisible && twoFactorCode) {
                otpAutoSubmitting = false;
                shakeOtpBoxes();
                clearOtpBoxes({ focus: true });
                setOtpIconState('error');
                setOtpStatus('Invalid code. Try again.', 'bad');
                if (typeof showAdminError === 'function') {
                    showAdminError('Invalid 2FA Code, please try again');
                }
                setTimeout(() => setOtpIconState('idle'), 1600);
                return;
            }
            const method = data.method || 'totp';
            const defaultPrompt = method === 'email'
                ? 'Enter the 6-digit code sent to your email.'
                : method === 'sms'
                    ? 'Enter the 6-digit code sent to your phone.'
                    : 'Open Google Authenticator and enter the 6-digit code.';
            const prompt = data.prompt || data.message || defaultPrompt;
            revealAdmin2faStep(prompt, { method });
            return;
        }

        const invalid2fa = data.reason === 'INVALID_OTP' || data.reason === 'OTP_EXPIRED' || data.reason === 'OTP_NOT_FOUND';
        if (invalid2fa) {
            otpAutoSubmitting = false;
            shakeOtpBoxes();
            clearOtpBoxes({ focus: true });
            setOtpIconState('error');
            setOtpStatus(data.message || 'Invalid code. Try again.', 'bad');
            setTimeout(() => setOtpIconState('idle'), 1600);
        }
        if (typeof showAdminError === 'function') {
            showAdminError(
                invalid2fa
                    ? (data.message || 'Invalid 2FA Code, please try again')
                    : (data.message || 'Invalid username or password.')
            );
        }
    } catch (err) {
        console.error('Error:', err);
        otpAutoSubmitting = false;
        if (tfaVisible) {
            shakeOtpBoxes();
            setOtpStatus('Network error. Please try again.', 'bad');
        }
        if (typeof showAdminError === 'function') {
            showAdminError('Something went wrong. Please try again.');
        }
    } finally {
        adminLoginInFlight = false;
        otpAutoSubmitting = false;
        if (typeof setAdminLoading === 'function') setAdminLoading(false);
    }
}

window.handleAdminLogin = handleAdminLogin;
window.backToLogin = backToLogin;

bindOtpBoxes();
document.getElementById('otpBackBtn')?.addEventListener('click', backToLogin);

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
        const loginStep = document.getElementById('adminLoginStep');
        if (tfaSection) {
            tfaSection.classList.remove('show');
            tfaSection.setAttribute('aria-hidden', 'true');
        }
        if (loginStep) loginStep.classList.remove('is-hidden');
        if (typeof setLoginChromeVisible === 'function') setLoginChromeVisible(true);
        if (typeof clearOtpBoxes === 'function') clearOtpBoxes();
        if (typeof stopOtpTimer === 'function') stopOtpTimer();

        if (typeof hideAdminError === 'function') hideAdminError();
    }
});



