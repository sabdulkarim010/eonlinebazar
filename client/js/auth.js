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

document.addEventListener('DOMContentLoaded', () => {
    initRealTimeValidation();
    initPasswordToggle();
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
        showCustomToast('Google sign-in failed. Please try again or use email/password.', 'error');
        window.history.replaceState({}, '', '/login');
    }

    if (urlParams.get('verified') === 'true') {
        showCustomToast("Email verified successfully! You can now sign in.", "success");
    }

    // 🔐 সেশন এক্সপায়ার/রিমোট লগআউটের কারণে এই পেজে পাঠানো হলে ইউজারকে জানানো
    if (sessionStorage.getItem('eob_session_expired')) {
        sessionStorage.removeItem('eob_session_expired');
        showCustomToast("Your session ended on this device. Please sign in again.", "error");
    }

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLoginSubmit);
    }

    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegisterSubmit);
    }
});


/* =========================================================================
   Google OAuth — show button only when configured on the server
   ========================================================================= */
async function initGoogleAuth() {
    const section = document.getElementById('google-auth-section');
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
        errorElement.style.display = "none";
        return;
    }
    
    if (isValid) {
        inputElement.classList.remove('is-invalid', 'is-invalid-text-only');
        if (inputIcons) {
            inputElement.classList.add('is-valid');
        } else {
            inputElement.classList.remove('is-valid');
        }
        errorElement.innerText = "";
        errorElement.style.display = "none";
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
        
        // CSS এর সাহায্য ছাড়াই জাভাস্ক্রিপ্ট দিয়ে ১০০% নিচে নামানোর নিখুঁত লজিক
        errorElement.style.display = "block";
        errorElement.style.width = "100%";
        errorElement.style.clear = "both";
        errorElement.style.marginTop = "5px";
        
        // যদি পাসওয়ার্ডের আইকন (Eye Icon) কন্টেইনারের কারণে এটি ফ্লেক্স বক্সের ভেতরে থাকে, 
        // তবে সেটিকে নিচে পুশ করার জন্য এবং ইনপুট বক্সের সাইজ ঠিক রাখার জন্য নিচের লজিকটি কাজ করবে
        const parent = inputElement.parentElement;
        if (parent && (parent.classList.contains('input-group') || window.getComputedStyle(parent).display === 'flex')) {
            parent.style.flexWrap = 'wrap'; // ফ্লেক্স র‍্যাপ চালু করবে যাতে এরর নিচে চলে যায়
            errorElement.style.order = "99"; // এরর মেসেজকে সবার নিচে পাঠাবে
        }
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
    const loginInput = document.getElementById('loginInput');
    const loginPass = document.getElementById('loginPass');

    if (loginInput) {
        loginInput.addEventListener('input', () => {
            const value = loginInput.value.trim();
            const isValid = value === '' || isValidLoginInput(value);
            validateField(
                loginInput,
                document.getElementById('login-input-error'),
                isValid,
                "Please enter a valid email address or mobile number."
            );
        });
    }

    if (loginPass) {
        loginPass.addEventListener('input', () => {
            const isValid = loginPass.value.length >= 6;
            validateField(
                loginPass,
                document.getElementById('login-pass-error'),
                isValid,
                "Password must be at least 6 characters.",
                false
            );
        });
    }

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
    const toggleLoginPass = document.getElementById('toggleLoginPass');
    const loginPassInput = document.getElementById('loginPass');
    const loginEyeIcon = document.getElementById('loginEyeIcon');

    if (toggleLoginPass && loginPassInput && loginEyeIcon) {
        toggleLoginPass.addEventListener('click', () => {
            const type = loginPassInput.getAttribute('type') === 'password' ? 'text' : 'password';
            loginPassInput.setAttribute('type', type);
            loginEyeIcon.className = type === 'password' ? 'fa-regular fa-eye' : 'fa-regular fa-eye-slash';
        });
    }

    const toggleRegPass = document.getElementById('toggleRegPass');
    const regPassInput = document.getElementById('regPassword');
    const regEyeIcon = document.getElementById('regEyeIcon');

    if (toggleRegPass && regPassInput && regEyeIcon) {
        toggleRegPass.addEventListener('click', () => {
            const type = regPassInput.getAttribute('type') === 'password' ? 'text' : 'password';
            regPassInput.setAttribute('type', type);
            regEyeIcon.className = type === 'password' ? 'fa-regular fa-eye' : 'fa-regular fa-eye-slash';
        });
    }
}


/* =========================================================================
   ৫. লগইন সাবমিশন হ্যান্ডলার (Real API Connection - Dual Token Sync)
   ========================================================================= */
async function handleLoginSubmit(e) {
    e.preventDefault();

    const rawLoginInput = document.getElementById('loginInput').value.trim();
    const password = document.getElementById('loginPass').value;
    const forgotPassLink = document.getElementById('forgotPasswordLink'); 
    
    const rememberMeCheckbox = document.getElementById('rememberMe');
    const rememberMe = rememberMeCheckbox ? rememberMeCheckbox.checked : false;
    const guestCartItems = window.CartMerge
        ? CartMerge.getGuestCartFromStorage()
        : (JSON.parse(localStorage.getItem('cart') || '[]') || []);

    if (!rawLoginInput || password.length < 6 || !isValidLoginInput(rawLoginInput)) {
        showCustomToast("Please fill all fields correctly.", "error");
        return;
    }

    const digitsOnly = rawLoginInput.replace(/\D/g, '');
    const loginInput = /^01[3-9]\d{8}$/.test(digitsOnly) ? digitsOnly : rawLoginInput;

    const loginBtn = document.querySelector('#loginForm .btn-primary');
    loginBtn.innerText = "Authenticating...";
    loginBtn.disabled = true;

    try {
        const response = await fetch('/api/customer/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ loginInput, password, rememberMe, guestCartItems })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // 🌟 সুনির্দিষ্ট আপডেট: দুটি নামেই টোকেন সেভ করা হলো যাতে কোনো পেজের লগইন স্টেট না ভাঙে
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
            
            if (forgotPassLink) forgotPassLink.style.display = 'none';

            if (window.analytics) {
                window.analytics.trackLogin('email');
            }

            showCustomToast("Login Successful! Redirecting...", "success");

            setTimeout(() => { window.location.href = resolvePostLoginRedirect(); }, 1500);
        } else {
            showCustomToast(data.message || "Invalid credentials or email not verified.", "error");
            loginBtn.innerText = "Sign In";
            loginBtn.disabled = false;

            if (forgotPassLink) {
                forgotPassLink.style.display = 'block';
                const forgotEmail = data.userEmail || (
                    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(rawLoginInput)
                        ? rawLoginInput
                        : ''
                );
                forgotPassLink.href = forgotEmail
                    ? `forgot-password.html?email=${encodeURIComponent(forgotEmail)}`
                    : 'forgot-password.html';
            }
        }
    } catch (error) {
        showCustomToast("Server error! Please try again.", "error");
        loginBtn.innerText = "Sign In";
        loginBtn.disabled = false;
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
        showCustomToast("Please complete all required fields correctly.", "error");
        return;
    }

    const regBtn = document.querySelector('#registerForm .btn-primary');
    regBtn.innerText = "Creating Account...";
    regBtn.disabled = true;

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
            successMsg.style.display = 'block';
            successMsg.innerHTML = `
                <div style="padding: 20px;">
                    <i class="fa-solid fa-envelope-circle-check" style="font-size: 50px; color: #10b981; margin-bottom:15px;"></i>
                    <h3 style="color: #10b981; margin-bottom: 10px; font-weight: 700;">Registration Successful! 🎉</h3>
                    <p style="color: #64748b; line-height: 1.5; font-size: 15px;">
                        We sent a verification link to <b>${email}</b>.<br>
                        Please check your inbox (and spam folder) to activate your account before logging in.
                    </p>
                </div>
            `;
        } else {
            showCustomToast(data.message || "Registration failed!", "error");
            regBtn.innerText = "Register Now";
            regBtn.disabled = false;
        }
    } catch (error) {
        showCustomToast("Server error! Please try again.", "error");
        regBtn.innerText = "Register Now";
        regBtn.disabled = false;
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



