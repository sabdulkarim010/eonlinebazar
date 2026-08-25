/**
 * Profile Security
 * Barrel: client/js/profile.js
 *
 * Globals used from other modules:
 *  * - profileAuthToken
 * - showToast
 * - showInlineFeedback
 * - currentUser
 *
 * Globals this module exposes:
 *  * - setButtonLoading
 * - syncChangePasswordToggleVisibility
 * - initChangePasswordEyeToggles
 * - clearContactOtpResendTimer
 * - updateContactOtpResendButton
 * - startContactOtpResendCountdown
 * - clearContactOtpTimer
 * - resetContactOtpCells
 * - collectContactOtp
 * - initContactOtpInputs
 * - startContactOtpTimer
 * - closeContactOtpModal
 * - openContactOtpModal
 * - requestContactOtp
 * - sessionDeviceIcon
 * - timeAgo
 * - initSessionsCardHeader
 * - fetchSessions
 * - updateLogoutAllVisibility
 * - formatSessionStatus
 * - formatSessionLocationLine
 * - buildSessionLogoutButton
 * - setSessionLogoutButtonsLoading
 * - renderSessions
 */

document.addEventListener('DOMContentLoaded', () => {
    const token = window.profileAuthToken;
    if (!token) return;
    const escapeHtml = window.profileEscapeHtml;
    const safeImg = window.profileSafeImg;
    const bindImgFallback = window.profileBindImgFallback;
    const setAvatarSrc = window.profileSetAvatarSrc;
    const IMAGE_PLACEHOLDER = window.profileImagePlaceholder;
    const AVATAR_PLACEHOLDER = window.profileAvatarPlaceholder;
    const IMG_ONERROR = window.profileImgOnerror;
    const showToast = window.profileShowToast;
    const showInlineFeedback = window.profileShowInlineFeedback;
    const currentUserId = window.profileCurrentUserId;
    let currentUser = window.profileCurrentUser;


    // =================================================================
    // ১১. সিকিউরিটি এবং পাসওয়ার্ড আপডেট লজিক (Security & Password)
    // =================================================================
    function setButtonLoading(btn, loading, loadingHtml) {
        if (!btn) return;
        if (loading) {
            if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
            btn.innerHTML = loadingHtml;
            btn.disabled = true;
        } else {
            btn.innerHTML = btn.dataset.originalHtml || btn.innerHTML;
            btn.disabled = false;
        }
    }

    if (passwordForm) {
        passwordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            showInlineFeedback(passwordFeedback, '');

            const currentPassword = document.getElementById('current-password').value;
            const newPassword = document.getElementById('new-password').value;
            const confirmPassword = document.getElementById('confirm-password').value;

            if (!currentPassword) {
                showInlineFeedback(passwordFeedback, 'Please enter your current password.', 'error');
                return;
            }

            if (newPassword.length < 6) {
                showInlineFeedback(passwordFeedback, 'New password must be at least 6 characters.', 'error');
                return;
            }

            if (newPassword !== confirmPassword) {
                showInlineFeedback(passwordFeedback, 'Confirm password does not match.', 'error');
                return;
            }

            const submitBtn = passwordForm.querySelector('button[type="submit"]');

            try {
                setButtonLoading(submitBtn, true, '<i class="fa-solid fa-spinner fa-spin"></i> Updating...');

                const res = await fetch('/api/customer/profile/change-password', {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
                });

                const data = await res.json();
                setButtonLoading(submitBtn, false);

                if (res.ok && data.success) {
                    showInlineFeedback(passwordFeedback, data.message || 'Password updated successfully!', 'success');
                    showToast(data.message || 'Password updated successfully!', 'success');
                    passwordForm.reset();
                    ['current-password', 'new-password', 'confirm-password'].forEach((fieldId) => {
                        const input = document.getElementById(fieldId);
                        if (!input) return;
                        input.type = 'password';
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    });
                } else {
                    showInlineFeedback(passwordFeedback, data.message || 'Failed to change password.', 'error');
                }
            } catch (error) {
                console.error('Change Password Error:', error);
                setButtonLoading(submitBtn, false);
                showInlineFeedback(passwordFeedback, 'Server error during password update.', 'error');
            }
        });
    }

    function syncChangePasswordToggleVisibility(input, toggleBtn) {
        if (!input || !toggleBtn) return;
        const hasValue = input.value.length > 0;
        toggleBtn.classList.toggle('is-visible', hasValue);
        toggleBtn.style.display = hasValue ? 'inline-flex' : 'none';
    }

    function initChangePasswordEyeToggles() {
        const changePasswordFieldIds = ['current-password', 'new-password', 'confirm-password'];

        changePasswordFieldIds.forEach((fieldId) => {
            const input = document.getElementById(fieldId);
            if (!input) return;

            const wrap = input.closest('.input-wrapper') || input.parentElement;
            const toggleBtn = wrap?.querySelector('.toggle-password');
            if (!toggleBtn) return;

            toggleBtn.classList.add('password-toggle-btn');
            toggleBtn.setAttribute('role', 'button');
            toggleBtn.setAttribute('tabindex', '0');

            const updateVisibility = () => syncChangePasswordToggleVisibility(input, toggleBtn);
            input.addEventListener('input', updateVisibility);
            updateVisibility();

            toggleBtn.addEventListener('click', () => {
                const show = input.type === 'password';
                input.type = show ? 'text' : 'password';
                toggleBtn.classList.toggle('fa-eye-slash', !show);
                toggleBtn.classList.toggle('fa-eye', show);
            });

            toggleBtn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleBtn.click();
                }
            });
        });
    }

    initChangePasswordEyeToggles();

    // --- Contact update OTP flow ---
    function clearContactOtpResendTimer() {
        if (contactOtpResendInterval) {
            clearInterval(contactOtpResendInterval);
            contactOtpResendInterval = null;
        }
    }

    function updateContactOtpResendButton() {
        if (!contactOtpResendBtn) return;
        const ready = pendingContactUpdate.resendAvailableAt
            && Date.now() >= pendingContactUpdate.resendAvailableAt;
        contactOtpResendBtn.classList.toggle('hidden', !pendingContactUpdate.type);
        contactOtpResendBtn.disabled = !ready;
    }

    function startContactOtpResendCountdown() {
        clearContactOtpResendTimer();
        pendingContactUpdate.resendAvailableAt = Date.now() + 60 * 1000;
        updateContactOtpResendButton();
        contactOtpResendInterval = setInterval(updateContactOtpResendButton, 1000);
    }

    function clearContactOtpTimer() {
        if (contactOtpTimerInterval) {
            clearInterval(contactOtpTimerInterval);
            contactOtpTimerInterval = null;
        }
        clearContactOtpResendTimer();
    }

    function resetContactOtpCells() {
        document.querySelectorAll('#contactOtpInputs .otp-cell').forEach((cell) => {
            cell.value = '';
            cell.classList.remove('filled', 'error');
        });
    }

    function collectContactOtp() {
        return Array.from(document.querySelectorAll('#contactOtpInputs .otp-cell'))
            .map((cell) => cell.value.trim())
            .join('');
    }

    function initContactOtpInputs() {
        const cells = Array.from(document.querySelectorAll('#contactOtpInputs .otp-cell'));
        const wrap = document.getElementById('contactOtpInputs');
        if (!cells.length) return;

        cells.forEach((cell, index) => {
            cell.addEventListener('input', () => {
                cell.value = cell.value.replace(/\D/g, '').slice(0, 1);
                cell.classList.toggle('filled', !!cell.value);
                if (cell.value && index < cells.length - 1) cells[index + 1].focus();
                if (collectContactOtp().length === 6 && contactOtpForm) {
                    contactOtpForm.requestSubmit();
                }
            });

            cell.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !cell.value && index > 0) {
                    cells[index - 1].focus();
                }
            });

            cell.addEventListener('paste', (e) => {
                e.preventDefault();
                const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
                pasted.split('').forEach((digit, i) => {
                    if (cells[i]) {
                        cells[i].value = digit;
                        cells[i].classList.add('filled');
                    }
                });
                if (pasted.length === 6 && contactOtpForm) contactOtpForm.requestSubmit();
            });
        });

        if (wrap) {
            wrap.addEventListener('animationend', () => wrap.classList.remove('shake'));
        }
    }

    function startContactOtpTimer(expiresAt) {
        clearContactOtpTimer();
        if (!contactOtpTimer) return;

        function tick() {
            const remainingMs = expiresAt - Date.now();
            if (remainingMs <= 0) {
                contactOtpTimer.textContent = 'Code expired — request a new OTP.';
                contactOtpTimer.classList.add('expired');
                clearContactOtpTimer();
                return;
            }
            const mins = Math.floor(remainingMs / 60000);
            const secs = Math.floor((remainingMs % 60000) / 1000);
            contactOtpTimer.textContent = `Expires in ${mins}:${String(secs).padStart(2, '0')}`;
            contactOtpTimer.classList.remove('expired');
        }

        tick();
        contactOtpTimerInterval = setInterval(tick, 1000);
    }

    function closeContactOtpModal() {
        if (contactOtpModal) contactOtpModal.classList.add('hidden');
        showInlineFeedback(contactOtpFeedback, '');
        resetContactOtpCells();
        clearContactOtpTimer();
        pendingContactUpdate = { type: null, maskedDestination: '', expiresAt: null, resendAvailableAt: null };
        if (contactOtpResendBtn) contactOtpResendBtn.classList.add('hidden');
    }

    function openContactOtpModal(type, maskedDestination) {
        if (!contactOtpModal) return;
        pendingContactUpdate.type = type;
        pendingContactUpdate.maskedDestination = maskedDestination;
        pendingContactUpdate.expiresAt = Date.now() + 5 * 60 * 1000;

        if (contactOtpSubtext) {
            const channel = type === 'email' ? 'email' : 'phone';
            contactOtpSubtext.innerHTML = `Enter the 6-digit code sent to your ${channel}: <b>${escapeHtml(maskedDestination)}</b>`;
        }

        resetContactOtpCells();
        showInlineFeedback(contactOtpFeedback, '');
        startContactOtpTimer(pendingContactUpdate.expiresAt);
        startContactOtpResendCountdown();
        contactOtpModal.classList.remove('hidden');

        const firstCell = document.querySelector('#contactOtpInputs .otp-cell');
        if (firstCell) firstCell.focus();
    }

    async function requestContactOtp(type) {
        showInlineFeedback(contactFeedback, '');

        const input = type === 'email'
            ? document.getElementById('security-new-email')
            : document.getElementById('security-new-phone');
        const btn = type === 'email' ? requestEmailOtpBtn : requestPhoneOtpBtn;
        const value = input ? input.value.trim() : '';

        if (!value) {
            showInlineFeedback(
                contactFeedback,
                type === 'email' ? 'Please enter a new email address.' : 'Please enter a new phone number.',
                'error'
            );
            return;
        }

        try {
            setButtonLoading(btn, true, '<i class="fa-solid fa-spinner fa-spin"></i>');

            const res = await fetch('/api/customer/profile/request-contact-otp', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ type, value })
            });

            const data = await res.json();
            setButtonLoading(btn, false);

            if (res.ok && data.success) {
                showInlineFeedback(contactFeedback, data.message, 'success');
                showToast(data.message, 'success');
                openContactOtpModal(type, data.maskedDestination || value);
            } else {
                showInlineFeedback(contactFeedback, data.message || 'Could not send verification code.', 'error');
            }
        } catch (error) {
            console.error('Request contact OTP error:', error);
            setButtonLoading(btn, false);
            showInlineFeedback(contactFeedback, 'Server error while sending verification code.', 'error');
        }
    }

    if (requestEmailOtpBtn) {
        requestEmailOtpBtn.addEventListener('click', () => requestContactOtp('email'));
    }
    if (requestPhoneOtpBtn) {
        requestPhoneOtpBtn.addEventListener('click', () => requestContactOtp('mobile'));
    }

    if (contactOtpResendBtn) {
        contactOtpResendBtn.addEventListener('click', () => {
            if (!pendingContactUpdate.type || contactOtpResendBtn.disabled) return;
            requestContactOtp(pendingContactUpdate.type);
        });
    }

    if (contactOtpForm) {
        contactOtpForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            showInlineFeedback(contactOtpFeedback, '');

            const otp = collectContactOtp();
            if (otp.length !== 6) {
                showInlineFeedback(contactOtpFeedback, 'Please enter all 6 digits.', 'error');
                return;
            }

            if (pendingContactUpdate.expiresAt && Date.now() > pendingContactUpdate.expiresAt) {
                showInlineFeedback(contactOtpFeedback, 'Code expired. Please request a new OTP.', 'error');
                return;
            }

            const verifyBtn = document.getElementById('verify-contact-otp-btn');

            try {
                setButtonLoading(verifyBtn, true, '<i class="fa-solid fa-spinner fa-spin"></i> Verifying...');

                const res = await fetch('/api/customer/profile/verify-contact-otp', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ otp })
                });

                const data = await res.json();
                setButtonLoading(verifyBtn, false);

                if (res.ok && data.success) {
                    showToast(data.message, 'success');
                    closeContactOtpModal();

                    const user = data.user || {};
                    if (sidebarEmail) sidebarEmail.textContent = user.email || sidebarEmail.textContent;
                    if (profileEmail) profileEmail.value = user.email || profileEmail.value;
                    if (profilePhone) profilePhone.value = user.phone || user.mobile || profilePhone.value;
                    updateSecurityContactDisplays(user);
                    cacheProfileAddressForCheckout(user);

                    const emailInput = document.getElementById('security-new-email');
                    const phoneInput = document.getElementById('security-new-phone');
                    if (emailInput) emailInput.value = '';
                    if (phoneInput) phoneInput.value = '';

                    if (currentUser) {
                        currentUser.email = user.email || currentUser.email;
                        currentUser.mobile = user.mobile || currentUser.mobile;
                        localStorage.setItem('userInfo', JSON.stringify(currentUser));
                    }
                } else {
                    showInlineFeedback(contactOtpFeedback, data.message || 'Verification failed.', 'error');
                    const wrap = document.getElementById('contactOtpInputs');
                    if (wrap) wrap.classList.add('shake');
                    document.querySelectorAll('#contactOtpInputs .otp-cell').forEach((cell) => cell.classList.add('error'));
                }
            } catch (error) {
                console.error('Verify contact OTP error:', error);
                setButtonLoading(verifyBtn, false);
                showInlineFeedback(contactOtpFeedback, 'Server error during verification.', 'error');
            }
        });
    }

    initContactOtpInputs();

    const closeContactOtpModalBtn = document.getElementById('close-contact-otp-modal');
    const cancelContactOtpBtn = document.getElementById('cancel-contact-otp-btn');
    if (closeContactOtpModalBtn) closeContactOtpModalBtn.addEventListener('click', closeContactOtpModal);
    if (cancelContactOtpBtn) cancelContactOtpBtn.addEventListener('click', closeContactOtpModal);
    if (contactOtpModal) {
        contactOtpModal.addEventListener('click', (e) => {
            if (e.target === contactOtpModal) closeContactOtpModal();
        });
    }

    // =================================================================
    // ১২. লগআউট হ্যান্ডেলার (Secure Logout System with Custom Modal)
    // =================================================================
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // আগের ব্রাউজার অ্যালার্ট রিমুভ করে নতুন কাস্টম মডাল তৈরি করা হচ্ছে
            const overlay = document.createElement('div');
            overlay.id = 'custom-logout-overlay';
            overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 9999; opacity: 0; transition: opacity 0.3s ease; backdrop-filter: blur(3px);';
            
            const modalBox = document.createElement('div');
            modalBox.style.cssText = 'background: var(--bg-color, #ffffff); padding: 30px 25px; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); text-align: center; max-width: 350px; width: 90%; transform: translateY(-20px); transition: transform 0.3s ease; font-family: inherit;';
            
            // মডালের ভেতরের ডিজাইন (আইকন, টেক্সট এবং বাটন)
            modalBox.innerHTML = `
                <div style="width: 65px; height: 65px; background: #fee2e2; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px;">
                    <i class="fa-solid fa-right-from-bracket" style="font-size: 26px; color: #ef4444;"></i>
                </div>
                <h3 style="margin: 0 0 8px; color: var(--text-color, #1e293b); font-size: 22px; font-weight: 700;">Sign Out?</h3>
                <p style="margin: 0 0 25px; color: var(--text-muted, #64748b); font-size: 15px; line-height: 1.5;">Are you sure you want to securely log out of your account?</p>
                <div style="display: flex; gap: 12px; justify-content: center;">
                    <button id="cancel-logout-btn" style="flex: 1; padding: 12px 0; border: none; background: #f1f5f9; color: #475569; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.2s;">Cancel</button>
                    <button id="confirm-logout-btn" style="flex: 1; padding: 12px 0; border: none; background: #ef4444; color: white; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.2s;">Yes, Sign Out</button>
                </div>
            `;
            
            overlay.appendChild(modalBox);
            document.body.appendChild(overlay);
            
            // পপআপ এনিমেশন চালু করা
            setTimeout(() => {
                overlay.style.opacity = '1';
                modalBox.style.transform = 'translateY(0)';
            }, 10);
            
            // মডাল ক্লোজ করার ফাংশন
            function closeLogoutModal() {
                overlay.style.opacity = '0';
                modalBox.style.transform = 'translateY(-20px)';
                setTimeout(() => overlay.remove(), 300);
            }

            // ক্যান্সেল বাটনে ক্লিক করলে
            document.getElementById('cancel-logout-btn').addEventListener('click', closeLogoutModal);
            
            // মডালের বাইরের ফাঁকা জায়গায় ক্লিক করলে
            overlay.addEventListener('click', (e) => {
                if(e.target === overlay) closeLogoutModal();
            });
            
            // কনফার্ম (Yes, Sign Out) বাটনে ক্লিক করলে লগআউট প্রসেস শুরু হবে
            document.getElementById('confirm-logout-btn').addEventListener('click', () => {
                const confirmBtn = document.getElementById('confirm-logout-btn');
                confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Logging out...';
                confirmBtn.style.opacity = '0.8';
                
                // লোকাল স্টোরেজ ক্লিয়ার করা
                localStorage.removeItem('token');
                localStorage.removeItem('customerToken'); 
                localStorage.removeItem('checkout_name');
                localStorage.removeItem('checkout_phone');
                localStorage.removeItem('checkout_address');
                
                showToast('Logged out successfully. Redirecting...', 'success');
                
                // ১.৫ সেকেন্ড পর হোমপেজে পাঠানো
                setTimeout(() => {
                    closeLogoutModal();
                    window.location.href = '/index.html'; 
                }, 1500);
            });
        });
    }

    // =================================================================
    // ১৬. সিকিউরিটি: অ্যাক্টিভ সেশন ও রিমোট লগআউট (Sessions)
    // =================================================================
    function sessionDeviceIcon(device) {
        const d = (device || '').toLowerCase();
        if (d.includes('phone') || d.includes('android') || d.includes('iphone')) return 'fa-mobile-screen-button';
        if (d.includes('ipad') || d.includes('tablet')) return 'fa-tablet-screen-button';
        return 'fa-laptop';
    }

    function timeAgo(dateStr) {
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Active now';
        if (mins < 60) return `${mins} min ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs} hr ago`;
        const days = Math.floor(hrs / 24);
        return `${days} day${days > 1 ? 's' : ''} ago`;
    }

    function initSessionsCardHeader() {
        const head = document.querySelector('.sessions-card-head');
        const logoutBtn = document.getElementById('logout-all-btn');
        if (!head || !logoutBtn) return;

        logoutBtn.classList.remove('revoke-session-btn', 'logout-others-btn', 'btn-sm-logout');
        logoutBtn.classList.add('btn-logout-all-devices');

        if (!head.querySelector('.sessions-card-head__left')) {
            const icon = head.querySelector('.profile-card-icon');
            const textBlock = head.querySelector('.profile-card-title')?.parentElement;
            const left = document.createElement('div');
            left.className = 'sessions-card-head__left';

            if (icon) left.appendChild(icon);
            if (textBlock) left.appendChild(textBlock);

            head.insertBefore(left, logoutBtn);
        }
    }

    initSessionsCardHeader();

    async function fetchSessions() {
        const list = document.getElementById('sessions-list');
        if (!list) return;
        try {
            const res = await fetch('/api/auth/sessions', {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (res.ok && data.success) {
                renderSessions(data.sessions || []);
            } else {
                list.innerHTML = `<p class="text-center sessions-loading">Could not load sessions.</p>`;
            }
        } catch (error) {
            console.error('Fetch Sessions Error:', error);
            list.innerHTML = `<p class="text-center sessions-loading">Server error loading sessions.</p>`;
        }
    }

    function updateLogoutAllVisibility(sessions) {
        const btn = document.getElementById('logout-all-btn');
        if (!btn) return;

        const otherSessions = (sessions || []).filter(s =>
            s.isCurrentSession === false || s.isCurrent === false
        );

        if (otherSessions.length === 0) {
            btn.style.display = 'none';
        } else {
            btn.style.display = 'inline-flex';
        }
    }

    function formatSessionStatus(session) {
        if (session.isCurrent) return 'Active now';
        const ago = timeAgo(session.lastActiveAt);
        if (ago === 'Active now') return 'Last active just now';
        return `Last active ${ago}`;
    }

    function formatSessionLocationLine(session) {
        const location = session.location && session.location !== 'Unknown Location'
            ? session.location
            : 'Unknown Location';
        const ip = session.ip || 'Unknown IP';
        return `${location} • ${ip}`;
    }

    function buildSessionLogoutButton(sessionRef) {
        const id = escapeHtml(String(sessionRef));
        return `
            <button
                type="button"
                class="btn-logout-device-desktop session-logout-btn"
                data-id="${id}"
                data-current="false"
                aria-label="Log out this device"
            >
                <i class="fas fa-sign-out-alt" aria-hidden="true"></i> Log Out This Device
            </button>
            <button
                type="button"
                class="btn-logout-device-mobile session-logout-btn"
                data-id="${id}"
                data-current="false"
                title="Log Out This Device"
                aria-label="Log out this device"
            >
                <i class="fas fa-sign-out-alt" aria-hidden="true"></i>
            </button>`;
    }

    function setSessionLogoutButtonsLoading(sessionId, isLoading) {
        const buttons = document.querySelectorAll(`.session-logout-btn[data-id="${sessionId}"]`);
        buttons.forEach((btn) => {
            btn.disabled = isLoading;
            btn.innerHTML = isLoading
                ? '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>'
                : (btn.classList.contains('btn-logout-device-desktop')
                    ? '<i class="fas fa-sign-out-alt" aria-hidden="true"></i> Log Out This Device'
                    : '<i class="fas fa-sign-out-alt" aria-hidden="true"></i>');
        });
    }

    function renderSessions(sessions) {
        const list = document.getElementById('sessions-list');
        if (!list) return;

        if (!sessions || sessions.length === 0) {
            list.innerHTML = `<p class="text-center sessions-loading">No active sessions found. Please log in again to track devices.</p>`;
            updateLogoutAllVisibility(sessions || []);
            return;
        }

        list.innerHTML = '';
        sessions.forEach((s) => {
            const icon = sessionDeviceIcon(s.device);
            const sessionRef = s.id || s.sessionId;
            const deviceLabel = `${s.device || 'Unknown Device'} • ${s.browser || 'Unknown Browser'}`;
            const status = formatSessionStatus(s);
            const locationLine = formatSessionLocationLine(s);
            const item = document.createElement('div');
            item.className = 'activity-item session-device-card profile-panel-inner-card'
                + (s.isCurrent ? ' current-session' : '');

            item.innerHTML = `
                <div class="activity-icon session-device-icon" aria-hidden="true">
                    <i class="fa-solid ${icon}"></i>
                </div>
                <div class="activity-details session-device-content">
                    <div class="session-device-row session-device-row--primary">
                        <div class="session-device-primary-text">
                            <h4 class="session-title session-device-name">${escapeHtml(deviceLabel)}</h4>
                            ${s.isCurrent ? '<span class="current-badge this-device-badge">THIS DEVICE</span>' : ''}
                        </div>
                        ${s.isCurrent ? '' : buildSessionLogoutButton(sessionRef)}
                    </div>
                    <p class="session-device-row session-device-row--geo">${escapeHtml(locationLine)}</p>
                    <p class="session-device-row session-device-row--activity${s.isCurrent ? ' session-active-now' : ''}">${escapeHtml(status)}</p>
                </div>`;
            list.appendChild(item);
        });

        updateLogoutAllVisibility(sessions);
    }

    // সেশন রিমোট লগআউট (ইভেন্ট ডেলিগেশন)
    document.addEventListener('click', async (e) => {
        const logoutSessionBtn = e.target.closest('.session-logout-btn');
        if (!logoutSessionBtn) return;

        const sessionId = logoutSessionBtn.getAttribute('data-id');
        const isCurrent = logoutSessionBtn.getAttribute('data-current') === 'true';

        setSessionLogoutButtonsLoading(sessionId, true);

        try {
            const res = await fetch(`/api/auth/sessions/${sessionId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();

            if (res.ok && data.success) {
                if (data.loggedOutCurrent || isCurrent) {
                    showToast('This device has been logged out. Redirecting...', 'success');
                    localStorage.removeItem('token');
                    localStorage.removeItem('customerToken');
                    setTimeout(() => { window.location.href = '/login.html'; }, 1500);
                } else {
                    showToast('Device logged out remotely.', 'success');
                    fetchSessions();
                }
            } else {
                showToast(data.message || 'Failed to log out device.', 'danger');
                setSessionLogoutButtonsLoading(sessionId, false);
            }
        } catch (error) {
            console.error('Logout Session Error:', error);
            showToast('Server error.', 'danger');
            setSessionLogoutButtonsLoading(sessionId, false);
        }
    });

    // অন্য সব ডিভাইস লগআউট (Log Out All Other Devices)
    const logoutOthersBtn = document.getElementById('logout-all-btn');
    if (logoutOthersBtn) {
        logoutOthersBtn.addEventListener('click', async () => {
            const originalHtml = logoutOthersBtn.innerHTML;
            logoutOthersBtn.disabled = true;
            logoutOthersBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Logging out other devices...</span>';

            try {
                const res = await fetch('/api/auth/sessions/logout-others', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
                });
                const data = await res.json();

                if (res.ok && data.success) {
                    showToast(data.message || 'Other devices logged out.', 'success');
                    fetchSessions();
                } else {
                    showToast(data.message || 'Failed to log out other devices.', 'danger');
                }
            } catch (error) {
                console.error('Logout Others Error:', error);
                showToast('Server error while logging out other devices.', 'danger');
            } finally {
                logoutOthersBtn.disabled = false;
                logoutOthersBtn.innerHTML = originalHtml;
            }
        });
    }

Object.assign(window, {
    setButtonLoading,
    syncChangePasswordToggleVisibility,
    initChangePasswordEyeToggles,
    clearContactOtpResendTimer,
    updateContactOtpResendButton,
    startContactOtpResendCountdown,
    clearContactOtpTimer,
    resetContactOtpCells,
    collectContactOtp,
    initContactOtpInputs,
    startContactOtpTimer,
    closeContactOtpModal,
    openContactOtpModal,
    requestContactOtp,
    sessionDeviceIcon,
    timeAgo,
    initSessionsCardHeader,
    fetchSessions,
    updateLogoutAllVisibility,
    formatSessionStatus,
    formatSessionLocationLine,
    buildSessionLogoutButton,
    setSessionLogoutButtonsLoading,
    renderSessions
});

});
