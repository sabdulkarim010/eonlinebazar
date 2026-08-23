/**
 * Project: eOnlineBazar
 * Author: Abdul Karim Sheikh
 * File: js/auth.js
 * Description: Advanced Real-Time Validation Engine + Full-Stack API Integration + UI Enhancements
 */

function resolvePostLoginRedirect() {
    const urlParams = new URLSearchParams(window.location.search);
    const redirect = String(urlParams.get('redirect') || '').trim();
    if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
        return redirect.replace(/\.html$/, '');
    }
    return '/profile';
}

function authT(key) {
    return window.i18n?.t(key) || key;
}

const EYE_OPEN_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_CLOSED_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

function getLoginIdentifierInput() {
    return document.getElementById('loginIdentifier') || document.getElementById('loginInput');
}

function showLoginError(message) {
    const errEl = document.getElementById('loginError');
    const errText = document.getElementById('loginErrorText');
    if (errEl && errText) {
        errText.textContent = message;
        errEl.classList.add('show');
    }
}

function hideLoginError() {
    const errEl = document.getElementById('loginError');
    if (errEl) errEl.classList.remove('show');
}

function setLoginLoading(loading) {
    const spinner = document.getElementById('loginLoading');
    const btn = document.getElementById('loginBtn');
    if (spinner) spinner.style.display = loading ? 'inline-block' : 'none';
    if (btn) btn.disabled = loading;
}

function resetLoginSubmitButton(btn) {
    const loginBtn = btn || document.getElementById('loginBtn') || document.querySelector('#loginForm .btn-primary');
    if (!loginBtn) return;
    loginBtn.disabled = false;
    setLoginLoading(false);
}

function showRegisterError(message) {
    const errEl = document.getElementById('registerError');
    const errText = document.getElementById('registerErrorText');
    if (errEl && errText) {
        errText.textContent = message;
        errEl.classList.add('show');
    }
}

function hideRegisterError() {
    const errEl = document.getElementById('registerError');
    if (errEl) errEl.classList.remove('show');
}

function setRegisterLoading(loading) {
    const spinner = document.getElementById('registerLoading');
    const btn = document.getElementById('registerBtn');
    if (spinner) spinner.style.display = loading ? 'inline-block' : 'none';
    if (btn) btn.disabled = loading;
}

function resetRegisterSubmitButton() {
    const regBtn = document.getElementById('registerBtn') || document.querySelector('#registerForm .btn-primary');
    if (!regBtn) return;
    regBtn.disabled = false;
    setRegisterLoading(false);
}

function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input || !btn) return;

    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.innerHTML = show ? EYE_CLOSED_SVG : EYE_OPEN_SVG;
    input.focus();
}

document.addEventListener('DOMContentLoaded', () => {
    initRealTimeValidation();
    initPasswordToggle();
    initLoginPasswordEyeVisibility();
    initPasswordFloatingLabels();
    initRegisterLocationDropdowns();
    initGoogleAuth();
    
    // ইমেইল ভেরিফাই করে আসার পর URL চেক করে মেসেজ দেখানো
    const urlParams = new URLSearchParams(window.location.search);

    // Google OAuth redirect — store JWT and redirect home
    if (urlParams.get('google') === 'true' && urlParams.get('token')) {
        const token = urlParams.get('token');
        localStorage.setItem('token', token);
        localStorage.setItem('customerToken', token);
        window.history.replaceState({}, '', '/');
        window.location.href = '/';
        return;
    }

    if (urlParams.get('error') === 'google_failed') {
        const googleMsg = authT('auth.google_failed');
        if (document.getElementById('loginError')) {
            showLoginError(googleMsg);
        } else {
            showCustomToast(googleMsg, 'error');
        }
        window.history.replaceState({}, '', '/login');
    }

    if (urlParams.get('verified') === 'true') {
        showCustomToast(authT('auth.email_verified'), 'success');
    }

    // 🔐 সেশন এক্সপায়ার/রিমোট লগআউটের কারণে এই পেজে পাঠানো হলে ইউজারকে জানানো
    if (sessionStorage.getItem('eob_session_expired')) {
        sessionStorage.removeItem('eob_session_expired');
        showCustomToast(authT('auth.session_expired'), 'error');
    }

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLoginSubmit);
    }

    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegisterSubmit);
    }

    const resendVerifyBtn = document.getElementById('resendVerifyBtn');
    if (resendVerifyBtn) {
        resendVerifyBtn.addEventListener('click', handleResendVerificationClick);
    }
});

function isEmailAddress(value) {
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(String(value || '').trim());
}

function setResendEmail(email) {
    const btn = document.getElementById('resendVerifyBtn');
    if (btn) btn.dataset.email = email || '';
}

function showVerifyNotice(email, message) {
    const notice = document.getElementById('verifyNotice');
    const text = document.getElementById('verifyNoticeText');
    if (!notice) return;
    if (text && message) text.textContent = message;
    setResendEmail(email);
    notice.hidden = false;
}

function hideVerifyNotice() {
    const notice = document.getElementById('verifyNotice');
    const status = document.getElementById('resendVerifyStatus');
    if (notice) notice.hidden = true;
    if (status) status.textContent = '';
}

async function handleResendVerificationClick() {
    const btn = document.getElementById('resendVerifyBtn');
    const status = document.getElementById('resendVerifyStatus');
    const email = (btn && btn.dataset.email) || '';

    if (!email) {
        if (status) status.textContent = 'Enter the email you registered with and try again.';
        return;
    }

    if (btn) btn.disabled = true;
    if (status) status.textContent = 'Sending…';

    try {
        const response = await fetch('/api/customer/resend-verification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await response.json();
        if (status) {
            status.textContent = data.success
                ? 'Verification email sent. Check your inbox and spam folder.'
                : (data.message || 'Could not resend the email. Please try again.');
        }
    } catch (error) {
        if (status) status.textContent = 'Could not resend the email. Please try again.';
    } finally {
        if (btn) btn.disabled = false;
    }
}


/* =========================================================================
   Google OAuth — show button only when configured on the server
   ========================================================================= */
async function initGoogleAuth() {
    const section = document.getElementById('googleLoginSection')
        || document.getElementById('google-auth-section');
    if (!section) return;

    try {
        const response = await fetch('/api/auth/google/status');
        const data = await response.json();
        if (data.configured) {
            section.style.display = 'block';
        }
    } catch (error) {
        console.warn('Could not load Google auth status:', error);
    }
}


/* =========================================================================
   ১. কোর ভ্যালিডেশন ইঞ্জিন (সংশোধিত - ইনপুট বক্স ছোট হওয়া এবং ডানপাশে লেখা যাওয়া ফিক্স)
   ========================================================================= */
function validateField(inputElement, errorElement, isValid, errorMessage, inputIcons = true) {
    if (!inputElement || !errorElement) return;
    
    if (inputElement.value.trim() === "") {
        inputElement.classList.remove('is-valid', 'is-invalid', 'is-invalid-text-only');
        errorElement.innerText = "";
        errorElement.classList.remove('is-visible');
        return;
    }
    
    if (isValid) {
        inputElement.classList.remove('is-invalid', 'is-invalid-text-only');
        inputElement.classList.add('is-valid');
        errorElement.innerText = "";
        errorElement.classList.remove('is-visible');
    } else {
        inputElement.classList.remove('is-valid');
        if (inputIcons) {
            inputElement.classList.add('is-invalid');
            inputElement.classList.remove('is-invalid-text-only');
        } else {
            inputElement.classList.remove('is-invalid');
            inputElement.classList.add('is-invalid-text-only');
        }
        errorElement.innerText = errorMessage;
        errorElement.classList.add('is-visible');
    }
}



/* =========================================================================
   ২. এন্টি-স্প্যাম ইঞ্জিন
   ========================================================================= */
function isSpamText(text) {
    const cleanText = text.trim().toLowerCase();
    if (cleanText.length < 5) return false;
    if (/([a-z\u0980-\u09ff])\1\1/.test(cleanText)) return true;
    if (/^[a-z\s]+$/.test(cleanText)) {
        const vowels = (cleanText.match(/[aeiou]/g) || []).length;
        const consonants = (cleanText.match(/[bcdfghjklmnpqrstvwxyz]/g) || []).length;
        if (vowels === 0 && consonants > 4) return true;
        if (/[bcdfghjklmnpqrstvwxyz]{5,}/.test(cleanText)) return true;
    }
    return false;
}

function syncPasswordFloatingLabel(input) {
    if (!input) return;
    input.classList.toggle('has-value', input.value.length > 0);
}

function initPasswordFloatingLabels() {
    document.querySelectorAll('.floating-group.password-group:not(.password-group--flat) input[type="password"]').forEach((input) => {
        input.removeAttribute('placeholder');
        const sync = () => syncPasswordFloatingLabel(input);
        input.addEventListener('input', sync);
        input.addEventListener('change', sync);
        input.addEventListener('blur', sync);
        sync();
    });
}

function initPasswordEyeVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const syncEyeVisibility = () => {
        const eyeBtn = input.parentElement?.querySelector('.auth-eye-btn')
            || document.getElementById(inputId === 'loginPassword' ? 'passwordToggleBtn' : 'toggleRegPass');
        if (!eyeBtn) return;

        const hasValue = input.value.trim().length > 0;
        if (eyeBtn.classList.contains('auth-eye-btn')) {
            eyeBtn.classList.toggle('visible', hasValue);
        } else {
            eyeBtn.style.display = hasValue ? 'inline-flex' : 'none';
        }
        eyeBtn.setAttribute('aria-hidden', hasValue ? 'false' : 'true');
        eyeBtn.tabIndex = hasValue ? 0 : -1;
    };

    input.addEventListener('input', syncEyeVisibility);
    input.addEventListener('change', syncEyeVisibility);
    syncEyeVisibility();
}

function initLoginPasswordEyeVisibility() {
    initPasswordEyeVisibility('loginPassword');
    initPasswordEyeVisibility('regPassword');
}

/* =========================================================================
   ৩. রিয়াল-টাইম ইনপুট ট্র্যাকার 
   ========================================================================= */
function isValidLoginInput(value) {
    const trimmed = value.trim();
    const isEmail = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed);
    const digitsOnly = trimmed.replace(/\D/g, '');
    const isMobile = /^01[3-9]\d{8}$/.test(digitsOnly);
    return isEmail || isMobile;
}

function initRealTimeValidation() {
    const loginInput = getLoginIdentifierInput();
    const loginPassword = document.getElementById('loginPassword');

    function validateLoginInputField() {
        if (!loginInput) return;
        const value = loginInput.value.trim();
        const isValid = value === '' || isValidLoginInput(value);
        validateField(
            loginInput,
            document.getElementById('login-input-error'),
            isValid,
            authT('auth.login_input_invalid')
        );
    }

    function validateLoginPasswordField() {
        if (!loginPassword) return;
        const len = loginPassword.value.length;
        const isValid = len === 0 || len >= 6;
        validateField(
            loginPassword,
            document.getElementById('login-pass-error'),
            isValid,
            authT('auth.password_min'),
            false
        );
    }

    if (loginInput) {
        loginInput.addEventListener('input', validateLoginInputField);
    }

    if (loginPassword) {
        loginPassword.addEventListener('input', validateLoginPasswordField);
    }

    document.addEventListener('languageChanged', () => {
        validateLoginInputField();
        validateLoginPasswordField();
    });

    const regFirstName = document.getElementById('regFirstName');
    const regLastName = document.getElementById('regLastName');
    const regContact = document.getElementById('regContact');
    const regEmail = document.getElementById('regEmail');
    const regPassword = document.getElementById('regPassword');

    function validateNameField(input, errorId, fieldLabel) {
        if (!input) return;
        const value = input.value.trim();
        const isLengthValid = value.length >= 2 && value.length <= 30;
        const isNotSpam = !isSpamText(value);

        let errMsg = "";
        if (!isLengthValid) errMsg = `${fieldLabel} must be between 2 and 30 characters.`;
        else if (!isNotSpam) errMsg = `Invalid ${fieldLabel.toLowerCase()} pattern detected.`;

        validateField(input, document.getElementById(errorId), isLengthValid && isNotSpam, errMsg);
    }

    if (regFirstName) {
        regFirstName.addEventListener('input', () => validateNameField(regFirstName, 'reg-firstname-error', 'First name'));
    }

    if (regLastName) {
        regLastName.addEventListener('input', () => validateNameField(regLastName, 'reg-lastname-error', 'Last name'));
    }

    if (regContact) {
        regContact.addEventListener('input', () => {
            regContact.value = regContact.value.replace(/\D/g, '');
            const value = regContact.value.trim();
            const isValidContact = /^01[3-9]\d{8}$/.test(value);
            
            let errMsg = "";
            if (value.length < 11) errMsg = "Mobile number must be exactly 11 digits.";
            else if (!isValidContact) errMsg = "Invalid format. Must be a valid BD number.";

            validateField(regContact, document.getElementById('reg-contact-error'), (value.length === 11 && isValidContact), errMsg);
        });
    }

    if (regEmail) {
        regEmail.addEventListener('input', () => {
            const value = regEmail.value.trim();
            const isValid = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value) && !isSpamText(value);
            validateField(regEmail, document.getElementById('reg-email-error'), isValid, "Please enter a valid email address.");
        });
    }

    if (regPassword) {
        regPassword.addEventListener('input', () => {
            const isValid = regPassword.value.length >= 6;
            validateField(regPassword, document.getElementById('reg-password-error'), isValid, "Password must be at least 6 characters.");
        });
    }

    const regDistrict = document.getElementById('reg-district');
    const regUpazila = document.getElementById('regUpazila');

    function syncRegFloatingLabel(fieldId, searchInputId) {
        const hidden = document.getElementById(fieldId);
        const textInput = document.getElementById(searchInputId)
            || hidden?.closest('.searchable-select')?.querySelector('.searchable-select-input');
        if (textInput) {
            textInput.classList.toggle('has-value', Boolean(hidden?.value));
        }
    }

    if (regDistrict) {
        regDistrict.addEventListener('change', () => syncRegFloatingLabel('reg-district', 'reg-district-search-input'));
        syncRegFloatingLabel('reg-district', 'reg-district-search-input');
    }

    if (regUpazila) {
        regUpazila.addEventListener('change', () => syncRegFloatingLabel('regUpazila', null));
        syncRegFloatingLabel('regUpazila', null);
    }
}

/* =========================================================================
   ৩.৫. রেজিস্ট্রেশন District → Upazila ক্যাসকেডিং
   ========================================================================= */
function initRegisterLocationDropdowns() {
    const regDistrict = document.getElementById('reg-district');
    const regUpazila = document.getElementById('regUpazila');
    if (!regDistrict || !regUpazila) return;

    let regUpazilaSelect = null;

    function syncRegFloatingLabel(fieldId, searchInputId) {
        const hidden = document.getElementById(fieldId);
        const textInput = searchInputId
            ? document.getElementById(searchInputId)
            : hidden?.closest('.searchable-select')?.querySelector('.searchable-select-input');
        if (textInput) {
            textInput.classList.toggle('has-value', Boolean(hidden?.value));
        }
    }

    function initRegUpazilaSelect() {
        if (regUpazilaSelect) return;
        regUpazilaSelect = window.initSearchableSelectFromNative(regUpazila, {
            placeholder: 'Select Upazila',
            options: [],
            value: '',
            disabled: true,
            onChange: () => syncRegFloatingLabel('regUpazila', null)
        });
    }

    function populateRegUpazilaOptions(district, selectedUpazila = '') {
        initRegUpazilaSelect();
        const upazilas = typeof window.getUpazilasForDistrict === 'function'
            ? window.getUpazilasForDistrict(district)
            : [];

        if (!district || upazilas.length === 0) {
            regUpazilaSelect?.setOptions([], '');
            regUpazilaSelect?.setDisabled(true);
            return;
        }

        regUpazilaSelect?.setOptions(upazilas, selectedUpazila || '');
        regUpazilaSelect?.setDisabled(false);
    }

    if (typeof window.initDistrictSearch === 'function') {
        window.initDistrictSearch('reg-district-search-input', 'reg-district', 'reg-district-dropdown');
    }

    initRegUpazilaSelect();

    regDistrict.addEventListener('change', () => {
        populateRegUpazilaOptions(regDistrict.value, '');
        syncRegFloatingLabel('reg-district', 'reg-district-search-input');
        regUpazila.dispatchEvent(new Event('change', { bubbles: true }));
    });

    regUpazila.addEventListener('change', () => syncRegFloatingLabel('regUpazila', null));
    syncRegFloatingLabel('reg-district', 'reg-district-search-input');
    syncRegFloatingLabel('regUpazila', null);
}

/* =========================================================================
   ৪. পাসওয়ার্ড শো/হাইড লজিক (Eye Icon)
   ========================================================================= */
function initPasswordToggle() {
    function bindSvgToggle(toggleBtn, inputId) {
        if (!toggleBtn) return;
        toggleBtn.addEventListener('click', () => togglePasswordVisibility(inputId, toggleBtn));
    }

    function bindFaToggle(toggleBtn, input, eyeIcon) {
        if (!toggleBtn || !input || !eyeIcon) return;

        toggleBtn.addEventListener('click', () => {
            const show = input.getAttribute('type') === 'password';
            input.setAttribute('type', show ? 'text' : 'password');
            eyeIcon.className = show ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
            const titleKey = show ? 'auth.hide_password' : 'auth.show_password';
            toggleBtn.setAttribute('title', authT(titleKey));
            toggleBtn.setAttribute('aria-label', authT(titleKey));
            if (toggleBtn.hasAttribute('data-i18n-title')) {
                toggleBtn.setAttribute('data-i18n-title', titleKey);
            }
            input.focus();
        });
    }

    bindSvgToggle(document.getElementById('loginPasswordEye'), 'loginPassword');
    bindSvgToggle(document.getElementById('regPasswordEye'), 'regPassword');

    bindFaToggle(
        document.getElementById('passwordToggleBtn'),
        document.getElementById('loginPassword'),
        document.getElementById('loginEyeIcon')
    );

    bindFaToggle(
        document.getElementById('toggleRegPass'),
        document.getElementById('regPassword'),
        document.getElementById('regEyeIcon')
    );
}


/* =========================================================================
   ৫. লগইন সাবমিশন হ্যান্ডলার (Real API Connection - Dual Token Sync)
   ========================================================================= */
async function handleLoginSubmit(e) {
    e.preventDefault();

    const loginIdentifierEl = getLoginIdentifierInput();
    const rawLoginInput = loginIdentifierEl ? loginIdentifierEl.value.trim() : '';
    const password = document.getElementById('loginPassword').value;
    const forgotPassLink = document.getElementById('forgotPasswordLink');

    const rememberMeCheckbox = document.getElementById('rememberMe');
    const rememberMe = rememberMeCheckbox ? rememberMeCheckbox.checked : false;
    const guestCartItems = window.CartMerge
        ? CartMerge.getGuestCartFromStorage()
        : (JSON.parse(localStorage.getItem('cart') || '[]') || []);

    if (!rawLoginInput || password.length < 6 || !isValidLoginInput(rawLoginInput)) {
        showLoginError(authT('auth.fill_fields'));
        return;
    }

    hideLoginError();
    hideVerifyNotice();

    const digitsOnly = rawLoginInput.replace(/\D/g, '');
    const loginInput = /^01[3-9]\d{8}$/.test(digitsOnly) ? digitsOnly : rawLoginInput;

    const loginBtn = document.getElementById('loginBtn') || document.querySelector('#loginForm .btn-primary');
    setLoginLoading(true);

    try {
        const response = await fetch('/api/customer/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ loginInput, password, rememberMe, guestCartItems })
        });

        const data = await response.json();

        if (data.success) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('customerToken', data.token);
            localStorage.setItem('customerData', JSON.stringify(data.user));

            if (data.user && data.user.name) {
                localStorage.setItem('userName', data.user.name);
            }

            if (window.CartMerge) {
                try {
                    await CartMerge.syncCartAfterLogin(data, data.token);
                } catch (cartSyncError) {
                    console.error('Cart sync after login failed:', cartSyncError);
                }
            } else if (Array.isArray(guestCartItems) && guestCartItems.length > 0) {
                localStorage.removeItem('cart');
            }

            if (forgotPassLink) forgotPassLink.href = '/forgot-password';

            if (window.analytics) {
                window.analytics.trackLogin('email');
            }

            hideLoginError();
            window.location.href = resolvePostLoginRedirect();
        } else {
            showLoginError(data.message || authT('auth.invalid_credentials'));
            resetLoginSubmitButton(loginBtn);

            if (data.needsVerification) {
                const verifyEmail = data.email || (isEmailAddress(rawLoginInput) ? rawLoginInput.trim().toLowerCase() : '');
                showVerifyNotice(verifyEmail, data.message || 'Please verify your email before logging in.');
            }

            if (forgotPassLink) {
                const forgotEmail = data.userEmail || (
                    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(rawLoginInput)
                        ? rawLoginInput
                        : ''
                );
                forgotPassLink.href = forgotEmail
                    ? `/forgot-password?email=${encodeURIComponent(forgotEmail)}`
                    : '/forgot-password';
            }
        }
    } catch (error) {
        showLoginError(authT('auth.server_error'));
        resetLoginSubmitButton(loginBtn);
    } finally {
        setLoginLoading(false);
    }
}



/* =========================================================================
   ৬. রেজিস্ট্রেশন সাবমিশন হ্যান্ডলার (Real API Connection)
   ========================================================================= */
async function handleRegisterSubmit(e) {
    e.preventDefault();

    const firstName = document.getElementById('regFirstName').value.trim();
    const lastName = document.getElementById('regLastName').value.trim();
    const regDistrictEl = document.getElementById('reg-district');
    const regUpazilaEl = document.getElementById('regUpazila');
    const district = regDistrictEl && regDistrictEl.value ? regDistrictEl.value.trim() : '';
    const upazilaOrThana = regUpazilaEl && regUpazilaEl.value ? regUpazilaEl.value.trim() : '';
    const mobile = document.getElementById('regContact').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;

    if (!firstName || !lastName || mobile.length !== 11 || !email || password.length < 6) {
        const msg = 'Please complete all required fields correctly.';
        if (document.getElementById('registerError')) {
            showRegisterError(msg);
        } else {
            showCustomToast(msg, 'error');
        }
        return;
    }

    hideRegisterError();
    hideVerifyNotice();
    setRegisterLoading(true);

    const payload = { firstName, lastName, mobile, email, password };
    if (district) payload.district = district;
    if (upazilaOrThana) payload.upazilaOrThana = upazilaOrThana;

    try {
        const response = await fetch('/api/customer/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (data.success) {
            if (window.analytics) {
                window.analytics.trackSignUp('email');
            }

            document.getElementById('register-section').style.display = 'none';
            const successMsg = document.getElementById('success-message');
            const sent = data.emailSent !== false;
            const safeEmail = String(data.email || email)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            successMsg.style.display = 'block';
            successMsg.innerHTML = `
                <i class="fa-solid fa-envelope-circle-check" style="font-size: 50px; color: #10b981; margin-bottom:15px;"></i>
                <h3>Registration Successful!</h3>
                <p>
                    ${sent
                        ? `We sent a verification link to <b>${safeEmail}</b>. Check your inbox and spam folder, then sign in.`
                        : `Your account was created, but we could not send the email to <b>${safeEmail}</b>. Use the button below to resend it.`}
                </p>
            `;
            showVerifyNotice(
                data.email || email,
                sent
                    ? 'Did not get the email? Resend the verification link.'
                    : 'Tap below to resend the verification email.'
            );
        } else {
            const failMsg = data.message || 'Registration failed!';
            if (document.getElementById('registerError')) {
                showRegisterError(failMsg);
            } else {
                showCustomToast(failMsg, 'error');
            }
            resetRegisterSubmitButton();
        }
    } catch (error) {
        const serverMsg = 'Server error! Please try again.';
        if (document.getElementById('registerError')) {
            showRegisterError(serverMsg);
        } else {
            showCustomToast(serverMsg, 'error');
        }
        resetRegisterSubmitButton();
    } finally {
        setRegisterLoading(false);
    }
}

/* =========================================================================
   ৭. কাস্টম স্লাইড-ডাউন টোস্ট ইঞ্জিন
   ========================================================================= */
function showCustomToast(message, type = "error") {
    const oldToast = document.getElementById('customToast');
    if (oldToast) oldToast.remove();

    const toast = document.createElement('div');
    toast.id = 'customToast';
    toast.className = `custom-toast ${type}`;
    
    const icon = type === "error" ? "fa-circle-exclamation" : "fa-circle-check";
    toast.style.borderLeft = type === "error" ? "4px solid #e74c3c" : "4px solid #2ecc71";
    
    toast.innerHTML = `
        <i class="fa-solid ${icon} toast-icon" style="color: ${type === "error" ? "#e74c3c" : "#2ecc71"}"></i>
        <span class="toast-message">${message}</span>
    `;

    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3500);
}


