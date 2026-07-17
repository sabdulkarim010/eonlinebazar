/**
 * Project: EonlineBazar
 * Author: Abdul Karim Sheikh
 * File: js/admin-login.js
 * Description: Admin Login — Step 1 of the Fortified 2FA flow. Verifies
 * username & password, then hands off to /admin/verify-otp for OTP entry.
 * Also surfaces blacklist (403) and rate-limit (429) warnings cleanly.
 */

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
   2. LOGIN PROCESS (Step 1: password → OTP challenge)
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

            // Blacklisted IP (403) or rate limit (429) => clear warning, no retry loop
            if (response.status === 403 || response.status === 429) {
                showToast(data.message || 'Access denied.', 'error');
                return;
            }

            if (data.success && data.otpRequired) {
                // Step 1 passed → carry the short-lived OTP token to the verify page
                sessionStorage.setItem('adminOtpToken', data.otpToken);
                sessionStorage.setItem('adminOtpMeta', JSON.stringify({
                    maskedEmail: data.maskedEmail || '',
                    emailDelivered: !!data.emailDelivered,
                    expiresInMinutes: data.expiresInMinutes || 5
                }));

                showToast(data.message || 'Verification code sent. Redirecting…', 'success');
                setTimeout(() => { window.location.href = '/admin/verify-otp'; }, 1200);

            } else if (data.success && data.token) {
                // Backward-compat: direct token without 2FA
                localStorage.setItem('adminToken', data.token);
                showToast('Login successful! Redirecting to the dashboard...', 'success');
                setTimeout(() => { window.location.href = '/admin'; }, 1200);

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
   3. CLEAR FORM ON BACK BUTTON
================================================== */
window.addEventListener('pageshow', function (event) {
    if (event.persisted || (window.performance && window.performance.navigation.type === 2)) {
        const form = document.getElementById('loginForm');
        if (form) form.reset();
    }
});
