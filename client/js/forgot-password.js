/**
 * Project: eOnlineBazar
 * Author: Abdul Karim Sheikh
 * File: js/forgot-password.js
 * Description: Secure OTP-based Password Reset & Premium Toast Sync
 */

document.addEventListener('DOMContentLoaded', () => {
    // লগিন পেজ থেকে ইমেইল নিয়ে আসা (যদি থাকে)
    const urlParams = new URLSearchParams(window.location.search);
    const emailParam = urlParams.get('email');
    if (emailParam) {
        // আপনার HTML-এর ইনপুট ID 'resetEmail' নিশ্চিত করুন
        const emailInput = document.getElementById('resetEmail');
        if (emailInput) emailInput.value = emailParam;
    }

    // পাসওয়ার্ড শো/হাইড লজিক
    const toggleNewPass = document.getElementById('toggleNewPass');
    const newPassInput = document.getElementById('newPassword');
    const newEyeIcon = document.getElementById('newEyeIcon');

    if (toggleNewPass && newPassInput && newEyeIcon) {
        toggleNewPass.addEventListener('click', () => {
            const type = newPassInput.getAttribute('type') === 'password' ? 'text' : 'password';
            newPassInput.setAttribute('type', type);
            newEyeIcon.className = type === 'password' ? 'fa-regular fa-eye' : 'fa-regular fa-eye-slash';
        });
    }

    // ফর্ম সাবমিট হ্যান্ডলার (Step 1: OTP পাঠানো)
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', handleSendOtp);
    }

    // ফর্ম সাবমিট হ্যান্ডলার (Step 2: পাসওয়ার্ড রিসেট)
    const resetPasswordForm = document.getElementById('resetPasswordForm');
    if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', handleResetPassword);
    }
});

/* =========================================================================
   ১. OTP পাঠানোর API কল (Step 1)
   ========================================================================= */
async function handleSendOtp(e) {
    e.preventDefault();
    const email = document.getElementById('resetEmail').value.trim();
    
    if (!email) {
        showToast("Please enter your email address.", "error");
        return;
    }

    const sendOtpBtn = document.getElementById('sendOtpBtn');
    sendOtpBtn.innerText = "Sending...";
    sendOtpBtn.disabled = true;

    try {
        const response = await fetch('/api/customer/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast("Verification OTP sent to your email!", "success");
            // Step 1 লুকিয়ে Step 2 দেখাবো
            document.getElementById('request-reset-section').style.display = 'none';
            document.getElementById('verify-reset-section').style.display = 'block';
        } else {
            showToast(data.message || "Failed to send OTP.", "error");
            sendOtpBtn.innerText = "Send OTP";
            sendOtpBtn.disabled = false;
        }
    } catch (error) {
        showToast("Server error! Please try again.", "error");
        sendOtpBtn.innerText = "Send OTP";
        sendOtpBtn.disabled = false;
    }
}

/* =========================================================================
   ২. নতুন পাসওয়ার্ড সেট করার API কল (Step 2)
   ========================================================================= */
async function handleResetPassword(e) {
    e.preventDefault();
    
    const email = document.getElementById('resetEmail').value.trim();
    const otp = document.getElementById('resetOtp').value.trim();
    const newPassword = document.getElementById('newPassword').value;

    if (!otp || newPassword.length < 6) {
        showToast("Please enter a valid OTP and a password of at least 6 characters.", "error");
        return;
    }

    const resetBtn = document.getElementById('resetBtn');
    resetBtn.innerText = "Resetting...";
    resetBtn.disabled = true;

    try {
        const response = await fetch('/api/customer/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp, newPassword })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast("Password reset successful! Redirecting to login...", "success");
            // 🚀 ফিক্স: '/login' এর বদলে সরাসরি 'login.html' ফাইলে পাঠানো হলো
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
        } else {
            showToast(data.message || "Invalid OTP or request failed.", "error");
            resetBtn.innerText = "Reset Password";
            resetBtn.disabled = false;
        }
    } catch (error) {
        showToast("Server error! Please try again.", "error");
        resetBtn.innerText = "Reset Password";
        resetBtn.disabled = false;
    }
}

/* =========================================================================
   ৩. প্রিমিয়াম টোস্ট মেসেজ নোটিফিকেশন সিস্টেম (UI Consistency)
   ========================================================================= */
function showToast(message, type = 'success') {
    // যদি HTML ফাইলে toast-container না থাকে তবে ডাইনামিকালি তৈরি করবে
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s reverse forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}






