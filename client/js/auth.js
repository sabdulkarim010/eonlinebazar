/**
 * Project: eOnlineBazar
 * Author: Abdul Karim Sheikh
 * File: js/auth.js
 * Description: Advanced Real-Time Validation Engine + Full-Stack API Integration + UI Enhancements
 */

document.addEventListener('DOMContentLoaded', () => {
    initRealTimeValidation();
    initPasswordToggle(); // 🌟 নতুন: পাসওয়ার্ড দেখার ফাংশন চালু করা হলো
    
    // ইমেইল ভেরিফাই করে আসার পর URL চেক করে মেসেজ দেখানো
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('verified') === 'true') {
        showCustomToast("Email verified successfully! You can now sign in.", "success");
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
   ১. কোর ভ্যালিডেশন ইঞ্জিন 
   ========================================================================= */
function validateField(inputElement, errorElement, isValid, errorMessage) {
    if (!inputElement || !errorElement) return;
    if (inputElement.value.trim() === "") {
        inputElement.classList.remove('is-valid', 'is-invalid');
        errorElement.innerText = "";
        return;
    }
    if (isValid) {
        inputElement.classList.add('is-valid');
        inputElement.classList.remove('is-invalid');
        errorElement.innerText = "";
    } else {
        inputElement.classList.add('is-invalid');
        inputElement.classList.remove('is-valid');
        errorElement.innerText = errorMessage;
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
function initRealTimeValidation() {
    const loginEmail = document.getElementById('loginEmail');
    const loginPass = document.getElementById('loginPass');

    if (loginEmail) {
        loginEmail.addEventListener('input', () => {
            const isValid = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(loginEmail.value.trim());
            validateField(loginEmail, document.getElementById('login-email-error'), isValid, "Please enter a valid email address.");
        });
    }

    if (loginPass) {
        loginPass.addEventListener('input', () => {
            const isValid = loginPass.value.length >= 6;
            validateField(loginPass, document.getElementById('login-pass-error'), isValid, "Password must be at least 6 characters.");
        });
    }

    const regName = document.getElementById('regName');
    const regContact = document.getElementById('regContact');
    const regEmail = document.getElementById('regEmail');
    const regPassword = document.getElementById('regPassword');

    if (regName) {
        regName.addEventListener('input', () => {
            const value = regName.value.trim();
            const words = value.split(/\s+/);
            const isLengthValid = value.length >= 5 && value.length <= 40;
            const isTwoWords = words.length >= 2;
            const isNotSpam = !isSpamText(value);

            let errMsg = "";
            if (!isLengthValid) errMsg = "Name must be between 5 and 40 characters.";
            else if (!isTwoWords) errMsg = "Please enter your full name (at least two words).";
            else if (!isNotSpam) errMsg = "Invalid name pattern detected.";

            validateField(regName, document.getElementById('reg-name-error'), isLengthValid && isTwoWords && isNotSpam, errMsg);
        });
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
}

/* =========================================================================
   🌟 নতুন: ৪. পাসওয়ার্ড শো/হাইড লজিক (Eye Icon)
   ========================================================================= */
function initPasswordToggle() {
    // লগিন পেজের জন্য
    const toggleLoginPass = document.getElementById('toggleLoginPass');
    const loginPassInput = document.getElementById('loginPass');
    const loginEyeIcon = document.getElementById('loginEyeIcon');

    if (toggleLoginPass && loginPassInput && loginEyeIcon) {
        toggleLoginPass.addEventListener('click', () => {
            const type = loginPassInput.getAttribute('type') === 'password' ? 'text' : 'password';
            loginPassInput.setAttribute('type', type);
            // আইকন চেঞ্জ করা (চোখ খোলা বা বন্ধ)
            loginEyeIcon.className = type === 'password' ? 'fa-regular fa-eye' : 'fa-regular fa-eye-slash';
        });
    }

    // রেজিস্ট্রেশন পেজের জন্য
    const toggleRegPass = document.getElementById('toggleRegPass');
    const regPassInput = document.getElementById('regPassword');
    const regEyeIcon = document.getElementById('regEyeIcon');

    if (toggleRegPass && regPassInput && regEyeIcon) {
        toggleRegPass.addEventListener('click', () => {
            const type = regPassInput.getAttribute('type') === 'password' ? 'text' : 'password';
            regPassInput.setAttribute('type', type);
            // আইকন চেঞ্জ করা (চোখ খোলা বা বন্ধ)
            regEyeIcon.className = type === 'password' ? 'fa-regular fa-eye' : 'fa-regular fa-eye-slash';
        });
    }
}

/* =========================================================================
   ৫. লগইন সাবমিশন হ্যান্ডলার (Real API Connection - Updated)
   ========================================================================= */
async function handleLoginSubmit(e) {
    e.preventDefault();

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPass').value;
    const forgotPassLink = document.getElementById('forgotPasswordLink'); // 🌟 ফরগেট লিংক সিলেক্ট করা
    
    // Remember me অপশন চেক করা
    const rememberMeCheckbox = document.getElementById('rememberMe');
    const rememberMe = rememberMeCheckbox ? rememberMeCheckbox.checked : false;

    if (!email || password.length < 6) {
        showCustomToast("Please fill all fields correctly.", "error");
        return;
    }

    const loginBtn = document.querySelector('#loginForm .btn-primary');
    loginBtn.innerText = "Authenticating...";
    loginBtn.disabled = true;

    try {
        const response = await fetch('/api/customer/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, rememberMe }) // 🌟 rememberMe ডাটাও পাঠানো হলো
        });
        
        const data = await response.json();
        
        if (data.success) {
            // ১. টোকেন ও কাস্টমার ডাটা সেভ করা
            localStorage.setItem('customerToken', data.token);
            localStorage.setItem('customerData', JSON.stringify(data.user));
            
            // ২. হেডারে নাম দেখানোর জন্য আলাদাভাবে 'userName' লোকাল স্টোরেজে সেট করা হলো
            if (data.user && data.user.name) {
                localStorage.setItem('userName', data.user.name);
            }
            
            // লগিন সাকসেস হলে ফরগেট পাসওয়ার্ড লিংক লুকিয়ে ফেলা
            if (forgotPassLink) forgotPassLink.style.display = 'none';

            showCustomToast("Login Successful! Redirecting...", "success");
            
            // ৩. রিডাইরেকশন ঠিক করে '/index' এর বদলে 'index.html' করা হলো
            setTimeout(() => { window.location.href = 'index.html'; }, 1500);
        } else {
            showCustomToast(data.message || "Invalid credentials or email not verified.", "error");
            loginBtn.innerText = "Sign In";
            loginBtn.disabled = false;

            // 🌟 লগিন ফেইল হলে ফরগেট পাসওয়ার্ড লিংক শো করানো
            if (forgotPassLink) {
                forgotPassLink.style.display = 'block';
                // ৪. ৪MD/Cannot GET এরর দূর করতে লিংকটি '/forgot-password' থেকে বদলে 'forgot-password.html' করা হলো
                forgotPassLink.href = `forgot-password.html?email=${encodeURIComponent(email)}`;
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

    const name = document.getElementById('regName').value.trim();
    const mobile = document.getElementById('regContact').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;

    if (!name || mobile.length !== 11 || !email || password.length < 6) {
        showCustomToast("Please complete all fields correctly.", "error");
        return;
    }

    const regBtn = document.querySelector('#registerForm .btn-primary');
    regBtn.innerText = "Creating Account...";
    regBtn.disabled = true;

    try {
        const response = await fetch('/api/customer/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, mobile, email, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
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





