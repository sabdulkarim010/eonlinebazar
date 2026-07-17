/**
 * Project: EonlineBazar
 * Author: Abdul Karim Sheikh
 * File: js/verify-otp.js
 * Description: Admin Login — Step 2 of the Fortified 2FA flow. Reads the
 * short-lived OTP token from sessionStorage, collects the 6-digit code,
 * and exchanges it for the final admin JWT via /api/admin/verify-otp.
 */

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const iconClass = type === 'success' ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-xmark';
    toast.innerHTML = `<i class="${iconClass}"></i><span class="toast-message">${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

const otpToken = sessionStorage.getItem('adminOtpToken');
let meta = {};
try { meta = JSON.parse(sessionStorage.getItem('adminOtpMeta') || '{}'); } catch (_) { meta = {}; }

// No pending challenge → send the user back to login
if (!otpToken) {
    window.location.replace('/admin-login');
}

// Subtext: show masked email if available
const subtext = document.getElementById('otpSubtext');
if (subtext) {
    if (meta.emailDelivered && meta.maskedEmail) {
        subtext.innerHTML = `Enter the 6-digit code sent to <b>${meta.maskedEmail}</b>.`;
    } else {
        subtext.innerHTML = `Enter the 6-digit code. <b>(Email not configured — check the server console.)</b>`;
    }
}

/* ---------- OTP cell UX: auto-advance, backspace, paste ---------- */
const cells = Array.from(document.querySelectorAll('.otp-cell'));

function collectOtp() {
    return cells.map(c => c.value.trim()).join('');
}

cells.forEach((cell, idx) => {
    cell.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 1);
        e.target.classList.toggle('filled', !!e.target.value);
        if (e.target.value && idx < cells.length - 1) cells[idx + 1].focus();
    });

    cell.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !cell.value && idx > 0) {
            cells[idx - 1].focus();
            cells[idx - 1].value = '';
            cells[idx - 1].classList.remove('filled');
        }
    });

    cell.addEventListener('paste', (e) => {
        e.preventDefault();
        const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, cells.length);
        digits.split('').forEach((d, i) => {
            if (cells[i]) { cells[i].value = d; cells[i].classList.add('filled'); }
        });
        const next = Math.min(digits.length, cells.length - 1);
        cells[next].focus();
    });
});

if (cells[0]) cells[0].focus();

/* ---------- Countdown timer ---------- */
const timerEl = document.getElementById('otpTimer');
let secondsLeft = (meta.expiresInMinutes || 5) * 60;

const countdown = setInterval(() => {
    if (!timerEl) return clearInterval(countdown);
    if (secondsLeft <= 0) {
        clearInterval(countdown);
        timerEl.textContent = 'Code expired. Please go back and log in again.';
        timerEl.classList.add('expired');
        return;
    }
    const m = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
    const s = String(secondsLeft % 60).padStart(2, '0');
    timerEl.textContent = `Code expires in ${m}:${s}`;
    secondsLeft--;
}, 1000);

/* ---------- Submit ---------- */
const otpForm = document.getElementById('otpForm');
otpForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const otp = collectOtp();
    if (otp.length !== 6) {
        showToast('Please enter all 6 digits.', 'error');
        return;
    }

    const submitBtn = otpForm.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Verifying…'; }

    try {
        const response = await fetch('/api/admin/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ otpToken, otp })
        });

        const data = await response.json();

        if (response.status === 403 || response.status === 429) {
            showToast(data.message || 'Access denied.', 'error');
            return;
        }

        if (data.success && data.token) {
            localStorage.setItem('adminToken', data.token);
            if (data.image) localStorage.setItem('adminProfilePic', data.image);
            sessionStorage.removeItem('adminOtpToken');
            sessionStorage.removeItem('adminOtpMeta');

            showToast('Verified! Redirecting to the dashboard…', 'success');
            setTimeout(() => { window.location.href = '/admin'; }, 1000);
        } else {
            showToast(data.message || 'Verification failed.', 'error');
            // Expired / invalid session → restart the whole flow
            if (data.restart) {
                sessionStorage.removeItem('adminOtpToken');
                sessionStorage.removeItem('adminOtpMeta');
                setTimeout(() => { window.location.href = '/admin-login'; }, 1600);
            } else {
                cells.forEach(c => { c.value = ''; c.classList.remove('filled'); });
                cells[0].focus();
            }
        }
    } catch (err) {
        console.error('OTP verify error:', err);
        showToast('Something went wrong. Please try again.', 'error');
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Verify & Sign In'; }
    }
});
