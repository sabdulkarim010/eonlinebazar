/**
 * Project: EonlineBazar — Fortified Admin Security Suite
 * File: js/verify-otp.js
 * Description: Premium 2-Step Verification controller.
 *   Supports Email OTP, SMS OTP, and Google Authenticator (TOTP).
 *   UX: auto-advance, backspace-to-previous, paste-to-fill, auto-submit.
 */

(function () {
    'use strict';

    /* ============================================================
       Toast helper
    ============================================================ */
    function showToast(message, type = 'success') {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icon = type === 'success' ? 'fa-circle-check'
            : type === 'info' ? 'fa-circle-info'
            : 'fa-circle-xmark';
        toast.innerHTML = `<i class="fa-solid ${icon}"></i><span class="toast-message">${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(90px)';
            setTimeout(() => toast.remove(), 320);
        }, 3600);
    }

    /* ============================================================
       Guard: a valid handoff token must exist
    ============================================================ */
    const otpToken = sessionStorage.getItem('adminOtpToken');
    let meta = {};
    try { meta = JSON.parse(sessionStorage.getItem('adminOtpMeta') || '{}'); } catch (_) { meta = {}; }

    if (!otpToken) {
        window.location.replace('/admin-login');
        return;
    }

    /* ============================================================
       Render method-specific copy (Email / SMS / Authenticator)
    ============================================================ */
    const method = (meta.method || 'email').toLowerCase();
    const badge = document.getElementById('otpMethodBadge');
    const badgeLabel = document.getElementById('otpMethodLabel');
    const subtext = document.getElementById('otpSubtext');
    const shield = document.getElementById('otpShield');
    const timerEl = document.getElementById('otpTimer');

    const METHOD_UI = {
        email: {
            label: 'Email',
            icon: 'fa-envelope',
            shield: 'fa-envelope-open-text',
            text: meta.delivered && meta.maskedTarget
                ? `Enter the 6-digit code sent to <b>${meta.maskedTarget}</b>.`
                : 'Enter the 6-digit code. <b>Email delivery failed or SMTP is not configured — check the server console for the code.</b>'
        },
        sms: {
            label: 'SMS',
            icon: 'fa-comment-sms',
            shield: 'fa-comment-sms',
            text: meta.delivered && meta.maskedTarget
                ? `Enter the 6-digit code texted to <b>${meta.maskedTarget}</b>.`
                : 'Enter the 6-digit code. <b>SMS gateway is in fallback mode — check the server console for the code.</b>'
        },
        totp: {
            label: 'Authenticator',
            icon: 'fa-key',
            shield: 'fa-mobile-screen-button',
            text: 'Open <b>Google Authenticator</b> and enter the current 6-digit code for EonlineBazar Admin.'
        }
    };

    const ui = METHOD_UI[method] || METHOD_UI.email;
    if (badgeLabel) badgeLabel.textContent = ui.label;
    if (badge) badge.querySelector('i').className = `fa-solid ${ui.icon}`;
    if (shield) shield.querySelector('i').className = `fa-solid ${ui.shield}`;
    if (subtext) subtext.innerHTML = ui.text;

    /* ============================================================
       OTP input engine
    ============================================================ */
    const cells = Array.from(document.querySelectorAll('.otp-cell'));
    const inputsWrap = document.getElementById('otpInputs');
    const form = document.getElementById('otpForm');
    const submitBtn = document.getElementById('otpSubmitBtn');
    let isSubmitting = false;

    const collectOtp = () => cells.map(c => c.value.trim()).join('');

    function clearError() {
        cells.forEach(c => c.classList.remove('error'));
        if (inputsWrap) inputsWrap.classList.remove('shake');
    }

    function flagError() {
        cells.forEach(c => c.classList.add('error'));
        if (inputsWrap) {
            inputsWrap.classList.remove('shake');
            void inputsWrap.offsetWidth; // reflow to restart animation
            inputsWrap.classList.add('shake');
        }
    }

    function resetCells(focusFirst = true) {
        cells.forEach(c => { c.value = ''; c.classList.remove('filled', 'error'); });
        if (focusFirst && cells[0]) cells[0].focus();
    }

    function maybeAutoSubmit() {
        if (collectOtp().length === 6) {
            // (d) Auto-submit as soon as the 6th digit is entered
            if (typeof form.requestSubmit === 'function') form.requestSubmit();
            else form.dispatchEvent(new Event('submit', { cancelable: true }));
        }
    }

    cells.forEach((cell, idx) => {
        // Typing a digit
        cell.addEventListener('input', (e) => {
            clearError();
            // keep only the last typed digit (handles overwrite)
            const digit = e.target.value.replace(/\D/g, '').slice(-1);
            e.target.value = digit;
            e.target.classList.toggle('filled', !!digit);

            // (a) Auto-advance to the next input
            if (digit && idx < cells.length - 1) {
                cells[idx + 1].focus();
                cells[idx + 1].select();
            }
            maybeAutoSubmit();
        });

        // Key handling: backspace, arrows
        cell.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace') {
                clearError();
                if (cell.value) {
                    cell.value = '';
                    cell.classList.remove('filled');
                } else if (idx > 0) {
                    // (b) Move focus to the previous input on backspace
                    cells[idx - 1].focus();
                    cells[idx - 1].value = '';
                    cells[idx - 1].classList.remove('filled');
                }
                e.preventDefault();
            } else if (e.key === 'ArrowLeft' && idx > 0) {
                cells[idx - 1].focus();
                e.preventDefault();
            } else if (e.key === 'ArrowRight' && idx < cells.length - 1) {
                cells[idx + 1].focus();
                e.preventDefault();
            }
        });

        // Select content on focus for effortless overwrite
        cell.addEventListener('focus', (e) => e.target.select());

        // (c) Paste support — fill all boxes from a pasted 6-digit code
        cell.addEventListener('paste', (e) => {
            e.preventDefault();
            clearError();
            const raw = (e.clipboardData || window.clipboardData).getData('text') || '';
            const digits = raw.replace(/\D/g, '').slice(0, cells.length);
            if (!digits) return;

            digits.split('').forEach((d, i) => {
                cells[i].value = d;
                cells[i].classList.add('filled');
            });
            const nextIndex = Math.min(digits.length, cells.length - 1);
            cells[nextIndex].focus();
            cells[nextIndex].select();
            maybeAutoSubmit();
        });
    });

    if (cells[0]) cells[0].focus();

    /* ============================================================
       Countdown timer (skipped for TOTP — codes rotate automatically)
    ============================================================ */
    if (method === 'totp') {
        if (timerEl) timerEl.innerHTML = 'Your authenticator code refreshes every 30 seconds.';
    } else {
        let secondsLeft = (meta.expiresInMinutes || 5) * 60;
        const tick = () => {
            if (!timerEl) return;
            if (secondsLeft <= 0) {
                clearInterval(countdown);
                timerEl.textContent = 'Code expired. Please go back and log in again.';
                timerEl.classList.add('expired');
                return;
            }
            const m = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
            const s = String(secondsLeft % 60).padStart(2, '0');
            timerEl.innerHTML = `Code expires in <span class="mono">${m}:${s}</span>`;
            secondsLeft--;
        };
        tick();
        const countdown = setInterval(tick, 1000);
    }

    /* ============================================================
       Submit → verify
    ============================================================ */
    function setLoading(on) {
        isSubmitting = on;
        if (!submitBtn) return;
        submitBtn.disabled = on;
        submitBtn.classList.toggle('loading', on);
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (isSubmitting) return;

        const otp = collectOtp();
        if (otp.length !== 6) {
            flagError();
            showToast('Please enter all 6 digits.', 'error');
            return;
        }

        setLoading(true);
        try {
            const response = await fetch('/api/admin/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ otpToken, otp })
            });
            const data = await response.json();

            if (response.status === 403 || response.status === 429) {
                showToast(data.message || 'Access denied.', 'error');
                setLoading(false);
                return;
            }

            if (data.success && data.token) {
                localStorage.setItem('adminToken', data.token);
                if (data.image) localStorage.setItem('adminProfilePic', data.image);
                sessionStorage.removeItem('adminOtpToken');
                sessionStorage.removeItem('adminOtpMeta');
                showToast('Verified! Redirecting to your dashboard…', 'success');
                setTimeout(() => { window.location.href = '/admin'; }, 900);
                return;
            }

            // Failure paths
            flagError();
            const reasonLabel = data.reason && data.reason !== 'INVALID_OTP' ? ` (${data.reason})` : '';
            showToast((data.message || 'Verification failed.') + reasonLabel, 'error');

            if (data.restart) {
                sessionStorage.removeItem('adminOtpToken');
                sessionStorage.removeItem('adminOtpMeta');
                setTimeout(() => { window.location.href = '/admin-login'; }, 1700);
            } else {
                setTimeout(() => resetCells(true), 450);
                setLoading(false);
            }
        } catch (err) {
            console.error('OTP verify error:', err);
            showToast('Something went wrong. Please try again.', 'error');
            setLoading(false);
        }
    });
})();
