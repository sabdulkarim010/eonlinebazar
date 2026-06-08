/**
 * Project: eOnlineBazar
 * Author: Abdul Karim Sheikh
 * File: js/forgot-password.js
 */

document.addEventListener('DOMContentLoaded', () => {
    // লগিন পেজ থেকে ইমেইল নিয়ে আসা (যদি থাকে)
    const urlParams = new URLSearchParams(window.location.search);
    const emailParam = urlParams.get('email');
    if (emailParam) {
        document.getElementById('resetEmail').value = emailParam;
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

    // ফর্ম সাবমিট হ্যান্ডলার
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', handleSendOtp);
    }

    const resetPasswordForm = document.getElementById('resetPasswordForm');
    if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', handleResetPassword);
    }
});

// OTP পাঠানোর API কল
async function handleSendOtp(e) {
    e.preventDefault();
    const email = document.getElementById('resetEmail').value.trim();
    
    if (!email) {
        alert("Please enter your email address.");
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
            // Step 1 লুকিয়ে Step 2 দেখাবো
            document.getElementById('request-reset-section').style.display = 'none';
            document.getElementById('verify-reset-section').style.display = 'block';
        } else {
            alert(data.message || "Failed to send OTP.");
            sendOtpBtn.innerText = "Send OTP";
            sendOtpBtn.disabled = false;
        }
    } catch (error) {
        alert("Server error! Please try again.");
        sendOtpBtn.innerText = "Send OTP";
        sendOtpBtn.disabled = false;
    }
}

// নতুন পাসওয়ার্ড সেট করার API কল
async function handleResetPassword(e) {
    e.preventDefault();
    
    const email = document.getElementById('resetEmail').value.trim();
    const otp = document.getElementById('resetOtp').value.trim();
    const newPassword = document.getElementById('newPassword').value;

    if (!otp || newPassword.length < 6) {
        alert("Please enter a valid OTP and a password of at least 6 characters.");
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
            alert("Password reset successful! You can now login.");
            window.location.href = '/login';
        } else {
            alert(data.message || "Invalid OTP or request failed.");
            resetBtn.innerText = "Reset Password";
            resetBtn.disabled = false;
        }
    } catch (error) {
        alert("Server error! Please try again.");
        resetBtn.innerText = "Reset Password";
        resetBtn.disabled = false;
    }
}



