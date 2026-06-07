/**
 * Project: EonlineBazar
 * Author: Abdul Karim Sheikh
 * File: js/order-track.js
 * Description: Order Tracking Logic fully optimized for MongoDB API
 */

/* ==========================================================================
   SECTION 1: DOM ELEMENTS (এইচটিএমএল থেকে আইডিগুলো সিলেক্ট করা)
   ========================================================================== */
// Form Elements
const trackForm = document.getElementById('orderTrackForm');
const trackOrderIdInput = document.getElementById('trackOrderId');
const trackMobileInput = document.getElementById('trackMobile');

// State Elements (Loading, Result, Error)
const loadingSpinner = document.getElementById('loadingSpinner');
const trackingResult = document.getElementById('trackingResult');
const errorState = document.getElementById('errorState');

// Result Text Elements
const resOrderId = document.getElementById('resOrderId');
const resTotal = document.getElementById('resTotal');
const statusTitle = document.getElementById('resStatusTitle');
const statusDesc = document.getElementById('resStatusDesc');
const statusMessageBox = document.querySelector('.status-message-box');

// Delivery Estimate Elements
const trackDeliveryContainer = document.getElementById('trackDeliveryContainer');
const trackDeliveryDateSpan = document.getElementById('trackDeliveryDate');


/* ==========================================================================
   SECTION 2: EVENT LISTENERS (ফর্ম সাবমিট করার ফাংশন)
   ========================================================================== */
trackForm.addEventListener('submit', async function(e) {
    e.preventDefault();

    // ১. ইউজারের ইনপুট নেওয়া এবং ফরম্যাট করা
    const searchOrderId = trackOrderIdInput.value.trim().toUpperCase();
    const searchMobile = trackMobileInput.value.trim();

    // ২. ফাঁকা ইনপুট চেক করা
    if (!searchOrderId || !searchMobile) {
        alert("Please enter both Order ID and Mobile Number.");
        return;
    }

    // ৩. UI State আপডেট: স্পিনার শো করা
    hideAllStates();
    loadingSpinner.classList.remove('hidden');

    // ৪. সার্ভার থেকে ডাটা আনা শুরু
    await fetchAndMatchOrder(searchOrderId, searchMobile);
});


/* ==========================================================================
   SECTION 3: CORE TRACKING LOGIC (এপিআই কল এবং ডাটা ম্যাচিং)
   ========================================================================== */
async function fetchAndMatchOrder(searchOrderId, searchMobile) {
    try {
        // শুধুমাত্র নির্দিষ্ট অর্ডারের জন্য সার্ভারে রিকোয়েস্ট পাঠানো হচ্ছে
        const response = await fetch(`/api/orders/track?orderId=${searchOrderId}&phone=${searchMobile}`);
        
        if (!response.ok) {
            // যদি সার্ভার 404 (Not Found) পাঠায়, তার মানে অর্ডার মেলেনি
            showErrorState();
            return;
        }
        
        const foundOrder = await response.json();
        
        // ফলাফল দেখানো
        if (foundOrder) {
            displayTrackingResult(foundOrder);
        }

    } catch (error) {
        console.error("MongoDB Fetch Error:", error);
        alert("Something went wrong with the server! Please try again later.");
        hideAllStates();
    }
}





// ট্র্যাকিং রেজাল্ট স্ক্রিনে দেখানোর ফাংশন
function displayTrackingResult(order) {
    hideAllStates();
    
    // ১. বেসিক ইনফো সেট করা
    resOrderId.innerText = order.orderId;
    resTotal.innerText = `৳ ${order.totalAmount}`;

    // ২. স্ট্যাটাস এবং স্টেপার আপডেট করা
    const status = order.status || "Pending";
    updateStepper(status);
    updateStatusMessage(status);

    // ৩. ডেলিভারি ডেট হিসাব করা এবং দেখানো
    if (trackDeliveryContainer && trackDeliveryDateSpan) {
        let deliveryDate = order.estimatedDelivery;

        if (!deliveryDate) {
            const backupDate = new Date(order.createdAt ? order.createdAt : Date.now());
            backupDate.setDate(backupDate.getDate() + 4); // ৪ দিন পরের ডেট
            deliveryDate = backupDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
        }

        trackDeliveryDateSpan.innerText = deliveryDate;
        trackDeliveryContainer.style.display = 'block'; 
    }

    // ৪. ফাইনালি রেজাল্ট বক্স শো করা
    trackingResult.classList.remove('hidden');
}


/* ==========================================================================
   SECTION 4: UI & STEPPER UPDATES (ডিজাইন ও কালার পরিবর্তন)
   ========================================================================== */
// প্রোগ্রেস বার (Stepper) আপডেট করার লজিক
function updateStepper(currentStatus) {
    const steps = ['Pending', 'Processing', 'Shipped', 'Delivered'];
    
    // সব ক্লাস রিসেট করা
    document.querySelectorAll('.step').forEach(el => el.classList.remove('active', 'completed'));
    document.querySelectorAll('.step-line').forEach(el => el.classList.remove('completed'));

    let currentIndex = steps.indexOf(currentStatus);
    if(currentIndex === -1) currentIndex = 0; 

    steps.forEach((stepName, index) => {
        const stepEl = document.getElementById(`step${stepName}`);
        const lineEl = document.getElementById(`line${index}`); 

        if (index < currentIndex) {
            // আগের ধাপগুলো কমপ্লিট
            if (stepEl) stepEl.classList.add('completed');
            if (lineEl) lineEl.classList.add('completed');
        } else if (index === currentIndex) {
            // বর্তমান ধাপ একটিভ
            if (stepEl) stepEl.classList.add('active');
            if (lineEl) lineEl.classList.add('completed');
        }
    });
}

// স্ট্যাটাস মেসেজ এবং বক্সের কালার আপডেট
function updateStatusMessage(status) {
    statusMessageBox.className = 'status-message-box'; // Reset classes
    
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


/* ==========================================================================
   SECTION 5: HELPER FUNCTIONS (ছোট ছোট সাহায্যকারী ফাংশন)
   ========================================================================== */
// সব স্ট্যাটাস একসাথে লুকানোর ফাংশন
function hideAllStates() {
    if (loadingSpinner) loadingSpinner.classList.add('hidden');
    if (trackingResult) trackingResult.classList.add('hidden');
    if (errorState) errorState.classList.add('hidden');
}

// অর্ডার খুঁজে না পেলে এরর দেখানোর ফাংশন
function showErrorState() {
    hideAllStates();
    if (errorState) errorState.classList.remove('hidden');
}













