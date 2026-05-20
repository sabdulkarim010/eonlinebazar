/**
 * Project: eOnlineBazar
 * Author: Abdul Karim Sheikh
 * File: js/auth.js
 * Description: Advanced Real-Time Validation Engine with Spam Protection,
 * Strict Character Limits, and Professional English Toast Notifications.
 */

document.addEventListener('DOMContentLoaded', () => {
    // ফর্ম এবং ফিল্ডের রিয়াল-টাইম ট্র্যাকিং শুরু করা
    initRealTimeValidation();
    
    // লগইন ফর্ম সাবমিট
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLoginSubmit);
    }

    // রেজিস্ট্রেশন ফর্ম সাবমিট
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegisterSubmit);
    }
});

/* =========================================================================
   ১. কোর ভ্যালিডেশন ইঞ্জিন (Core UI Signal Sync)
   ========================================================================= */
function validateField(inputElement, errorElement, isValid, errorMessage) {
    if (!inputElement || !errorElement) return;
    
    // ফিল্ড সম্পূর্ণ খালি থাকলে কোনো কালার বা মেসেজ দেখাবে না
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
   ২. কীবোর্ড স্প্যামিং এবং ফেক টেক্সট ডিটেকশন (Anti-Spam Engine)
   ========================================================================= */
function isSpamText(text) {
    const cleanText = text.trim().toLowerCase();
    if (cleanText.length < 5) return false;

    // কন্ডিশন ১: একই ক্যারেক্টার যদি পর পর ৩ বার বা তার বেশি আসে (যেমন: aaaaa, ggggg)
    if (/([a-z\u0980-\u09ff])\1\1/.test(cleanText)) return true;

    // শুধুমাত্র ইংরেজি টেক্সটের জন্য অ্যাডভান্সড রিডাবিলিটি চেক (যেমন: jfhhfgfhd)
    if (/^[a-z\s]+$/.test(cleanText)) {
        const vowels = (cleanText.match(/[aeiou]/g) || []).length;
        const consonants = (cleanText.match(/[bcdfghjklmnpqrstvwxyz]/g) || []).length;
        
        // কোনো ভাওয়েল ছাড়া শুধু কনসোনেন্ট টাইপ করলে (যেমন: kdhhdhd) তা ফেক টেক্সট
        if (vowels === 0 && consonants > 4) return true;
        
        // পর পর ৫টি কনসোনেন্ট থাকলে সাধারণত সেটি স্প্যাম টেক্সট হয়
        if (/[bcdfghjklmnpqrstvwxyz]{5,}/.test(cleanText)) return true;
    }
    
    return false;
}

/* =========================================================================
   ৩. রিয়াল-টাইম ইনপুট ট্র্যাকার (Real-Time Observers)
   ========================================================================= */
function initRealTimeValidation() {
    // --- লগইন ফিল্ড ভ্যালিডেশন ---
    const loginEmail = document.getElementById('loginEmail');
    const loginPass = document.getElementById('loginPass');

    if (loginEmail) {
        loginEmail.addEventListener('input', () => {
            const isValid = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(loginEmail.value.trim());
            validateField(loginEmail, document.getElementById('login-email-error'), isValid, "Please enter a valid email address (e.g., name@mail.com).");
        });
    }

    if (loginPass) {
        loginPass.addEventListener('input', () => {
            const isValid = loginPass.value.length >= 6;
            validateField(loginPass, document.getElementById('login-pass-error'), isValid, "Password must be at least 6 characters long.");
        });
    }

    // --- রেজিস্ট্রেশন ফিল্ড ভ্যালিডーション ---
    const regName = document.getElementById('regName');
    const regContact = document.getElementById('regContact');
    const regEmail = document.getElementById('regEmail');
    const regPassword = document.getElementById('regPassword');

    if (regName) {
        regName.addEventListener('input', () => {
            const value = regName.value.trim();
            const words = value.split(/\s+/);
            
            // নাম কমপক্ষে ২০ এবং সর্বোচ্চ ৪০ ক্যারেক্টার হতে হবে
            const isLengthValid = value.length >= 5 && value.length <= 60;
            const isTwoWords = words.length >= 2;
            const isNotSpam = !isSpamText(value);

            let errMsg = "";
            if (!isLengthValid) errMsg = "Name must be between 20 and 40 characters.";
            else if (!isTwoWords) errMsg = "Please enter your full name (at least two words).";
            else if (!isNotSpam) errMsg = "Invalid name pattern detected. Please avoid random typing.";

            const finalValid = isLengthValid && isTwoWords && isNotSpam;
            validateField(regName, document.getElementById('reg-name-error'), finalValid, errMsg);
        });
    }

    if (regContact) {
        regContact.addEventListener('input', (e) => {
            // শুধুমাত্র সংখ্যা ইনপুট নেওয়ার জন্য স্ক্রিপ্ট ফিল্টার
            regContact.value = regContact.value.replace(/\D/g, '');
            
            const value = regContact.value.trim();
            const isValidContact = /^01[3-9]\d{8}$/.test(value);
            
            let errMsg = "";
            if (value.length < 11) errMsg = "Mobile number must be exactly 11 digits.";
            else if (!isValidContact) errMsg = "Invalid format. Must be a valid Bangladeshi number.";

            validateField(regContact, document.getElementById('reg-contact-error'), (value.length === 11 && isValidContact), errMsg);
        });
    }

    if (regEmail) {
        regEmail.addEventListener('input', () => {
            const value = regEmail.value.trim();
            const isValid = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value) && !isSpamText(value);
            validateField(regEmail, document.getElementById('reg-email-error'), isValid, "Please enter a valid business email address.");
        });
    }

    if (regPassword) {
        regPassword.addEventListener('input', () => {
            const isValid = regPassword.value.length >= 6;
            validateField(regPassword, document.getElementById('reg-password-error'), isValid, "Password must be at least 6 characters long.");
        });
    }
}

/* =========================================================================
   ৪. লগইন সাবমিশন হ্যান্ডলার (Login Process)
   ========================================================================= */
function handleLoginSubmit(e) {
    e.preventDefault();

    const emailInput = document.getElementById('loginEmail');
    const passInput = document.getElementById('loginPass');
    
    const emailValid = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(emailInput.value.trim());
    const passValid = passInput.value.length >= 6;

    if (!emailValid || !passValid) {
        showCustomToast("Please correct the errors before logging in.", "error");
        return;
    }

    const loginBtn = document.querySelector('#loginForm .btn-primary');
    loginBtn.innerText = "Authenticating...";
    loginBtn.disabled = true;

    setTimeout(() => {
        document.getElementById('loginForm').style.display = 'none';
        const successMsg = document.getElementById('success-message');
        successMsg.style.display = 'block';
        successMsg.innerHTML = `
            <h3 style="color: #10b981; margin-bottom: 10px; font-weight: 700;">Login Successful! 🎉</h3>
            <p style="color: #64748b; font-size: 14px;">Welcome back! Redirecting to your dashboard...</p>
        `;

        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);
    }, 1500);
}

/* =========================================================================
   ৫. রেজিস্ট্রেশন সাবমিশন হ্যান্ডলার (Registration Process)
   ========================================================================= */
function handleRegisterSubmit(e) {
    e.preventDefault();

    const nameInput = document.getElementById('regName');
    const contactInput = document.getElementById('regContact');
    const emailInput = document.getElementById('regEmail');
    const passInput = document.getElementById('regPassword');

    // ফাইনাল ভ্যালিডেশন রান
    const nameValue = nameInput.value.trim();
    const nameWords = nameValue.split(/\s+/);
    const nameValid = nameValue.length >= 5 && nameValue.length <= 40 && nameWords.length >= 2 && !isSpamText(nameValue);
    
    const contactValue = contactInput.value.trim();
    const contactValid = contactValue.length === 11 && /^01[3-9]\d{8}$/.test(contactValue);
    
    const emailValid = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(emailInput.value.trim()) && !isSpamText(emailInput.value);
    const passValid = passInput.value.length >= 6;

    if (!nameValid || !contactValid || !emailValid || !passValid) {
        showCustomToast("Registration failed. Please complete all fields correctly.", "error");
        return;
    }

    const regBtn = document.querySelector('#registerForm .btn-primary');
    regBtn.innerText = "Creating Account...";
    regBtn.disabled = true;

    setTimeout(() => {
        document.getElementById('registerForm').style.display = 'none';
        const successMsg = document.getElementById('success-message');
        successMsg.style.display = 'block';
        successMsg.innerHTML = `
            <h3 style="color: #10b981; margin-bottom: 10px; font-weight: 700;">Account Created! 🚀</h3>
            <p style="color: #64748b; font-size: 14px;">Your registration is complete. Forwarding to sign in...</p>
        `;

        setTimeout(() => {
            window.location.href = 'login.html';
        }, 2000);
    }, 1500);
}

/* =========================================================================
   ৬. কাস্টম স্লাইড-ডাউন টোস্ট ইঞ্জিন (Premium Toast Engine)
   ========================================================================= */
function showCustomToast(message, type = "error") {
    const oldToast = document.getElementById('customToast');
    if (oldToast) oldToast.remove();

    const toast = document.createElement('div');
    toast.id = 'customToast';
    toast.className = `custom-toast ${type}`;
    
    const icon = type === "error" ? "fa-circle-exclamation" : "fa-circle-check";
    
    toast.innerHTML = `
        <i class="fa-solid ${icon} toast-icon"></i>
        <span class="toast-message">${message}</span>
    `;

    document.body.appendChild(toast);

    // অ্যানিমেশন ট্রিগার
    setTimeout(() => toast.classList.add('show'), 10);

    // ৩.৫ সেকেন্ড পর স্মুথলি আউট হবে
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3500);
}
