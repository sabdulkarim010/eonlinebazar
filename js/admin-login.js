/**
 * Project: EonlineBazar
 * Author: Abdul Karim Sheikh
 * File: js/admin-login.js
 * Description:
 */

/* ==================================================
   1. FIREBASE IMPORTS
================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

/* ==================================================
   2. FIREBASE CONFIGURATION & INITIALIZATION
================================================== */
const firebaseConfig = {
  apiKey: "AIzaSyAcw2tOeBtpk4eoljQqfSSjgOIdsJ4-Nko",
  authDomain: "eonlinebazar.firebaseapp.com",
  databaseURL: "https://eonlinebazar-default-rtdb.firebaseio.com",
  projectId: "eonlinebazar",
  storageBucket: "eonlinebazar.firebasestorage.app",
  messagingSenderId: "393136308453",
  appId: "1:393136308453:web:8c41f480248f8bf544d40c",
  measurementId: "G-HWJG569BK2"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

/* ==================================================
   3. CUSTOM PROFESSIONAL TOAST SYSTEM
================================================== */
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return; // ব্যাকএন্ড সেফটি চেক

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // টাইপ অনুযায়ী আইকন সেটআপ (সফল হলে টিক, ভুল হলে ক্রস)
    let iconClass = type === 'success' ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-xmark';
    
    toast.innerHTML = `
        <i class="${iconClass}"></i>
        <span class="toast-message">${message}</span>
    `;
    
    container.appendChild(toast);

    // ৩ সেকেন্ড পর স্মুথ অ্যানিমেশন দিয়ে টোস্টটি মুছে যাবে
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/* ==================================================
   4. LOGIN PROCESS & EVENT LISTENER
================================================== */
const loginForm = document.getElementById('loginForm');

if (loginForm) {
    loginForm.addEventListener('submit', function(event) {
        event.preventDefault(); 

        const email = document.getElementById('adminEmail').value.trim();
        const password = document.getElementById('adminPass').value.trim();

        // ফাঁকা ইনপুট চেক
        if (!email || !password) {
            showToast("Please enter your email & password", "error");
            return;
        }

        console.log("Logging in, please wait...");

        // ফায়ারবেস লগইন অথেন্টিকেশন
        signInWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                // প্রফেশনাল সাকসেস টোস্ট
                showToast("Login successfull! Redirecting to the dashboard...", "Success");
                
                // টোস্ট নোটিফিকেশনটি যেন ইউজার দেখতে পায়, তাই ১.৫ সেকেন্ড পর রিডাইরেক্ট হবে
                setTimeout(() => {
                    window.location.href = "admin.html";
                }, 1500);
            })
            .catch((error) => {
                console.error("ফায়ারবেস এরর:", error.message);
                
                // ফায়ারবেসের কমন এরর মেসেজগুলো বাংলায় সুন্দরভাবে হ্যান্ডেল করা
                let errorMessage = "Login failed! Please try again.";
                if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
                    errorMessage = "Incorrect email or password!";
                } else if (error.code === 'auth/too-many-requests') {
                    errorMessage = "Too many unsuccessful attempts. Your account is temporarily locked. Please try again later.";
                }
                
                // প্রফেশনাল এরর টোস্ট
                showToast(errorMessage, "error");
            });
    });
} else {
    console.error("Error: Required login form not found!");
}




