/**
 * Project: EonlineBazar
 * Author: Abdul Karim Sheikh
 * File: js/admin-login.js
 * Description: MongoDB Admin Login with Custom Toast Notification & Session Security
 */

/* ==================================================
   1. CUSTOM PROFESSIONAL TOAST SYSTEM (আপনার তৈরি করা সিস্টেম)
================================================== */
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return; 

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // টাইপ অনুযায়ী আইকন সেটআপ
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
   2. LOGIN PROCESS & EVENT LISTENER (MongoDB কানেকশন)
================================================== */
const loginForm = document.getElementById('loginForm');

if (loginForm) {
    loginForm.addEventListener('submit', async function(event) {
        event.preventDefault(); 

        // নতুন আইডি অনুযায়ী ডাটা নেওয়া
        const username = document.getElementById('adminUsername').value.trim();
        const password = document.getElementById('adminPass').value.trim();

        // ফাঁকা ইনপুট চেক
        if (!username || !password) {
            showToast("Please enter your username & password", "error");
            return;
        }

        try {
            // Backend নোড সার্ভারের লগইন এপিআই তে ডাটা পাঠানো
            const response = await fetch('/api/admin/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (data.success) {
            // ১. ড্যাশবোর্ডের সিকিউরিটির সাথে মিলিয়ে এখানে চাবির নাম 'adminToken' দেওয়া হলো
            localStorage.setItem('adminToken', data.token || 'true');
            
            // ২. সফল হলে আপনার প্রফেশনাল সাকসেস টোস্ট দেখাবে
            showToast("Login successful! Redirecting to the dashboard...", "success");
            
            // ৩. ১.৫ সেকেন্ড পর রিডাইরেক্ট হবে
            setTimeout(() => {
                window.location.href = "admin.html";
            }, 1500);
        
            } else {
                // バックエন্ড থেকে আসা এরর মেসেজ টোস্টে দেখানো (যেমন: Invalid username or password!)
                showToast(data.message, "error");
            }

        } catch (err) {
            console.error("Error:", err);
            showToast("Something went wrong. Please try again.", "error");
        }
    });
} else {
    console.error("Error: Required login form not found!");
}



/* ==================================================
   3. CLEAR FORM ON BACK BUTTON (ব্যাক বাটনে ডাটা ক্লিয়ার করা)
================================================== */
window.addEventListener('pageshow', function (event) {
    // যদি পেজটি ব্রাউজারের ব্যাক ক্যাশ (History) থেকে লোড হয়
    if (event.persisted || (window.performance && window.performance.navigation.type === 2)) {
        const form = document.getElementById('loginForm');
        if (form) {
            form.reset(); // ফর্মের ইউজারনেম ও পাসওয়ার্ড ফাঁকা করে দেবে
        }
    }
});



