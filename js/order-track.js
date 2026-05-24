/* ==================================================
   ORDER TRACKING LOGIC (Firebase Integration)
================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// আপনার ফায়ারবেস কনফিগারেশন
const firebaseConfig = {
    apiKey: "AIzaSyAcw2t0eBtpk4eoljQqfSSjgOIdsJ4-Nko",
    authDomain: "eonlinebazar.firebaseapp.com",
    databaseURL: "https://eonlinebazar-default-rtdb.firebaseio.com",
    projectId: "eonlinebazar",
    storageBucket: "eonlinebazar.firebasestorage.app",
    messagingSenderId: "393136308453",
    appId: "1:393136308453:web:13e669af67b948844d40c",
    measurementId: "G-HB8RHCZQQ3"
};

// ফায়ারবেস ইনিশিয়ালাইজেশন
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// DOM Elements
const trackForm = document.getElementById('orderTrackForm');
const trackOrderIdInput = document.getElementById('trackOrderId');
const trackMobileInput = document.getElementById('trackMobile');
const loadingSpinner = document.getElementById('loadingSpinner');
const trackingResult = document.getElementById('trackingResult');
const errorState = document.getElementById('errorState');

// Result Elements
const resOrderId = document.getElementById('resOrderId');
const resTotal = document.getElementById('resTotal');
const statusTitle = document.getElementById('resStatusTitle');
const statusDesc = document.getElementById('resStatusDesc');
const statusMessageBox = document.querySelector('.status-message-box');

// Form Submit Event
trackForm.addEventListener('submit', function(e) {
    e.preventDefault();

    // ইউজারের ইনপুট নেওয়া এবং ফরম্যাট করা
    const searchOrderId = trackOrderIdInput.value.trim().toUpperCase();
    const searchMobile = trackMobileInput.value.trim();

    if (!searchOrderId || !searchMobile) {
        alert("Please enter both Order ID and Mobile Number.");
        return;
    }

    // UI State আপডেট: স্পিনার শো করা
    hideAllStates();
    loadingSpinner.classList.remove('hidden');

    // ফায়ারবেস থেকে ডেটা খোঁজা
    const ordersRef = ref(database, 'orders');
    get(ordersRef).then((snapshot) => {
        if (snapshot.exists()) {
            const allOrders = snapshot.val();
            let foundOrder = null;

            // সব অর্ডারের মধ্যে লুপ চালিয়ে ম্যাচ করা
            for (let key in allOrders) {
                let order = allOrders[key];
                // অর্ডার আইডি এবং ফোন নাম্বার ম্যাচ করছে কিনা চেক করা
                if (order.orderId === searchOrderId && order.customerPhone === searchMobile) {
                    foundOrder = order;
                    break;
                }
            }

            if (foundOrder) {
                // অর্ডার পাওয়া গেছে
                displayTrackingResult(foundOrder);
            } else {
                // অর্ডার আইডি বা নাম্বার ভুল
                showErrorState();
            }
        } else {
            // ডাটাবেজে কোনো অর্ডারই নেই
            showErrorState();
        }
    }).catch((error) => {
        console.error("Firebase Error:", error);
        alert("Something went wrong! Please try again later.");
        hideAllStates();
    });
});

// 🌟 রেজাল্ট শো করার মেইন ফাংশন 🌟
function displayTrackingResult(order) {
    hideAllStates();
    
    // বেসিক ইনফো সেট করা
    resOrderId.innerText = order.orderId;
    resTotal.innerText = `৳ ${order.totalAmount}`;

    // স্ট্যাটাস লজিক
    const status = order.status || "Pending";
    updateStepper(status);
    updateStatusMessage(status);

    // =========================================================================
    // 🚚 ফায়ারবেস থেকে ডেলিভারি ডেট এনে ট্র্যাকিং পেজে দেখানো (নতুন প্রফেশনাল ফিচার)
    // =========================================================================
    const trackDeliveryContainer = document.getElementById('trackDeliveryContainer');
    const trackDeliveryDateSpan = document.getElementById('trackDeliveryDate');

    if (trackDeliveryContainer && trackDeliveryDateSpan) {
        // ১. ফায়ারবেস ডেটা থেকে ডেলিভারি ডেটটি নেওয়া
        let deliveryDate = order.estimatedDelivery;

        // ২. যদি কোনো কারণে পুরনো অর্ডারে ডেট না থাকে, তবে ব্যাকআপ হিসেবে ৪ দিন পরের ডেট তৈরি করা
        if (!deliveryDate) {
            const backupDate = new Date(order.timestamp ? order.timestamp : Date.now());
            backupDate.setDate(backupDate.getDate() + 4);
            deliveryDate = backupDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
        }

        // ৩. বক্সে ডেট বসানো এবং বক্সটি স্ক্রিনে শো করানো
        trackDeliveryDateSpan.innerText = deliveryDate;
        trackDeliveryContainer.style.display = 'block'; 
    }
    // =========================================================================

    // রেজাল্ট বক্স শো করা
    trackingResult.classList.remove('hidden');
}

// 🌟 প্রোগ্রেস স্টেপার আপডেট করার লজিক 🌟
function updateStepper(currentStatus) {
    const steps = ['Pending', 'Processing', 'Shipped', 'Delivered'];
    
    // সব ক্লাস রিসেট করা
    document.querySelectorAll('.step').forEach(el => el.classList.remove('active', 'completed'));
    document.querySelectorAll('.step-line').forEach(el => el.classList.remove('completed'));

    let currentIndex = steps.indexOf(currentStatus);
    if(currentIndex === -1) currentIndex = 0; // Default to Pending

    steps.forEach((stepName, index) => {
        const stepEl = document.getElementById(`step${stepName}`);
        const lineEl = document.getElementById(`line${index}`); // Line comes before the step

        if (index < currentIndex) {
            // আগের স্ট্যাটাসগুলো Completed
            if (stepEl) stepEl.classList.add('completed');
            if (lineEl) lineEl.classList.add('completed');
        } else if (index === currentIndex) {
            // বর্তমান স্ট্যাটাস Active
            if (stepEl) stepEl.classList.add('active');
            if (lineEl) lineEl.classList.add('completed');
        }
    });
}

// 🌟 স্ট্যাটাস মেসেজ এবং কালার আপডেট 🌟
function updateStatusMessage(status) {
    // আগের কালার ক্লাস রিমুভ করা
    statusMessageBox.className = 'status-message-box';
    
    if (status === 'Pending') {
        statusMessageBox.classList.add('status-pending');
        statusTitle.innerText = "Order Pending";
        statusDesc.innerText = "We have received your order and it is waiting for confirmation.";
    } 
    else if (status === 'Processing') {
        statusMessageBox.classList.add('status-processing');
        statusTitle.innerText = "Order is Processing";
        statusDesc.innerText = "We are currently packing and preparing your items for shipment.";
    } 
    else if (status === 'Shipped') {
        statusMessageBox.classList.add('status-shipped');
        statusTitle.innerText = "Order Shipped";
        statusDesc.innerText = "Great news! Your order has been handed over to the courier and is on its way to you.";
    } 
    else if (status === 'Delivered') {
        statusMessageBox.classList.add('status-delivered');
        statusTitle.innerText = "Order Delivered";
        statusDesc.innerText = "Your order has been successfully delivered. Thank you for shopping with eOnlineBazar!";
    }
}

// UI Helpers
function hideAllStates() {
    loadingSpinner.classList.add('hidden');
    trackingResult.classList.add('hidden');
    errorState.classList.add('hidden');
}

function showErrorState() {
    hideAllStates();
    errorState.classList.remove('hidden');
}




