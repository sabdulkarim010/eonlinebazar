/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * Author: Abdul Karim
 * File: js/admin.js
 * Description: Unified Admin Engine - Combines Products, Orders, Customers, Analytics, Security & Settings.
 * Version: 2.0.0
 * Last Updated: June 2026
 */

/* ==========================================================================
   CORE MODULE 1: DASHBOARD SECURITY & INITIALIZATION (নিরাপত্তা ও প্রাথমিককরণ)
   ========================================================================== */

// ১.১: লোকাল স্টোরেজ থেকে অ্যাডমিন টোকেন সংগ্রহ
const token = localStorage.getItem('adminToken');

// ১.২: টোকেন না থাকলে সরাসরি লগইন পেজে রিডাইরেক্ট (সিকিউরিটি গেটওয়ে)
if (!token) {
    window.location.replace('/admin-login');
}

/**
 * ১.৩: ব্যাকএন্ডের সাথে অ্যাডমিন টোকেন লাইভ ভেরিফিকেশন করা
 * ড্যাশবোর্ড লোড হওয়ার সময় ব্যাকএন্ড API-এর মাধ্যমে চেক করে টোকেনটি আসল ও সচল কিনা
 */
async function verifyAdminTokenOnLoad() {
    try {
        const res = await fetch('/api/admin/verify-token', {
            method: 'GET',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        const data = await res.json();
        
        // টোকেন অবৈধ বা এক্সপায়ার হলে সেশন ক্লিয়ার করে রিডাইরেক্ট
        if (!data.success) {
            localStorage.removeItem('adminToken');
            window.location.replace('/admin-login');
        }
    } catch (err) {
        console.error("Security Verification Critical Error:", err);
        // সার্ভার ডাউন বা কানেকশন এরর হলে নিরাপত্তা স্বার্থে কনসোলে এরর দেখানো
    }
}


/* ==========================================================================
   CORE MODULE 2: GLOBAL VARIABLES & STATE MANAGEMENT (গ্লোবাল স্টেট ও ভেরিয়েবল)
   ========================================================================== */

// ২.১: ডম (DOM) এলিমেন্ট রেফারেন্স সমূহ
const tableBody = document.getElementById('adminOrderTableBody') || document.getElementById('orderTableBody');
const prodTableBody = document.getElementById('adminProductTableBody');

// ২.২: গ্লোবাল ডাটা স্টোরেজ (State)
let allOrders = {};
let allProducts = {};
let globalProducts = [];
let currentFilteredProducts = [];
let allCustomers = [];
let globalOrders = [];
let currentFilteredOrders = [];

// ২.৩: চার্ট এবং পেজিনেশন কন্ট্রোল ভেরিয়েবল
let growthChartInstance = null;
let currentPage = 1;          // প্রোডাক্ট পেজের বর্তমান পেজ নম্বর
const itemsPerPage = 10;      // প্রতি পেজে ডিফল্ট প্রোডাক্ট সংখ্যা
let currentOrderPage = 1;     // অর্ডারের বর্তমান পেজ নম্বর
let ordersPerPage = 10;       // প্রতি পেজে ডিফল্ট অর্ডারের সংখ্যা
let isStockAscending = true;


/* ==========================================================================
   CORE MODULE 3: UI UTILITIES - CUSTOM NOTIFICATIONS & ALERTS (টোস্ট ও মডাল)
   ========================================================================== */

/**
 * ৩.১: প্রফেশনাল কাস্টম টোস্ট নোটিফিকেশন (Toast Alert)
 * @param {string} message - যে বার্তাটি স্ক্রিনে দেখাতে হবে
 * @param {string} type - নোটিফিকেশনের ধরন ('success', 'error', 'info', 'warning')
 */
window.showToast = function(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) {
        // ব্যাকআপ নোটিফিকেশন যদি কন্টেইনার না থাকে
        alert(message);
        return;
    }
    
    // নতুন টোস্ট এলিমেন্ট তৈরি
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // টাইপ অনুযায়ী আইকন নির্ধারণ
    let iconClass = 'fa-circle-check';
    if (type === 'error') iconClass = 'fa-circle-xmark';
    if (type === 'warning') iconClass = 'fa-triangle-exclamation';
    if (type === 'info') iconClass = 'fa-circle-info';
    
    toast.innerHTML = `
        <i class="fa-solid ${iconClass}"></i>
        <span class="toast-message">${message}</span>
    `;
    
    container.appendChild(toast);

    // অ্যানিমেশনের মাধ্যমে স্ক্রিন থেকে টোস্ট রিমুভ করা (৩ সেকেন্ড পর)
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

/**
 * ৩.২: কাস্টম কনফার্মেশন মডাল (Delete বা গুরুত্বপূর্ণ অ্যাকশনের জন্য)
 * @param {string} title - মডালের শিরোনাম
 * @param {string} message - বিস্তারিত বার্তা
 * @param {function} onConfirm - 'Yes' ক্লিক করলে যে ফাংশনটি রান হবে
 * @param {string} type - মডালের থিম টাইপ ('warning', 'danger')
 */
window.showCustomConfirm = function(title, message, onConfirm, type = 'warning') {
    const modal = document.getElementById('customConfirmModal');
    if (!modal) {
        // ব্যাকআপ কনফার্মেশন যদি মডাল এলিমেন্ট ডমে না থাকে
        if (confirm(message) && onConfirm) onConfirm();
        return;
    }
    
    const titleEl = document.getElementById('confirmTitle');
    const messageEl = document.getElementById('confirmMessage');
    const iconBox = document.getElementById('confirmIconBox');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    const confirmBtn = document.getElementById('confirmSuccessBtn');

    titleEl.innerText = title;
    messageEl.innerText = message;
    
    // টাইপ অনুযায়ী ডেঞ্জার বা ওয়ার্নিং আইকন সেটআপ
    iconBox.className = `confirm-icon-box ${type}`;
    iconBox.innerHTML = type === 'danger' 
        ? '<i class="fa-solid fa-triangle-exclamation"></i>' 
        : '<i class="fa-solid fa-circle-question"></i>';
        
    confirmBtn.className = type === 'danger' ? 'btn-confirm danger-action' : 'btn-confirm';

    // মডাল প্রদর্শন
    modal.style.display = 'flex';

    // ইভেন্ট লিসেনার ওভারল্যাপিং এড়াতে নোড ক্লোন করা
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    // ইভেন্ট লিসেনার যুক্তকরণ
    newCancelBtn.addEventListener('click', () => modal.style.display = 'none');
    newConfirmBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        if (onConfirm) onConfirm();
    });
};


/* ==========================================================================
   CORE MODULE 4: SPA ROUTER ENGINE (সিঙ্গেল পেজ নেভিগেশন সিস্টেম)
   ========================================================================== */

/**
 * ৪.১: সাইডবার মেনু নেভিগেশন সেটআপ
 */
function setupAdminSPARouter() {
    const menuItems = document.querySelectorAll('.sidebar-menu li');
    
    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const link = item.querySelector('a');
            const targetId = link ? link.getAttribute('href').replace('#', '') : item.getAttribute('data-target');
            
            if (!targetId) return;
            if (link) e.preventDefault(); // হ্যাশট্যাগ ইউআরএল চেঞ্জ হওয়া বন্ধ করা

            // অ্যাক্টিভ ক্লাস রিমুভ ও অ্যাড করা
            menuItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            // মূল ভিউ পরিবর্তন ফাংশন কল করা
            switchDashboardView(targetId, item.innerText.trim());
        });
    });
}

/**
 * ৪.২: ডাইনামিক সেকশন সুইচিং এবং লাইভ ডাটা লোড
 * @param {string} sectionId - যে সেকশনটি অন হবে
 * @param {string} sectionTitle - পেজের মূল টাইটেল টেক্সট
 */
function switchDashboardView(sectionId, sectionTitle) {
    // সব সেকশন হাইড করা
    const allSections = document.querySelectorAll('.admin-section, .spa-section');
    allSections.forEach(sec => {
        sec.style.style.display = 'none';
        sec.classList.remove('active');
    });

    // টার্গেটেড সেকশনটি শো করা
    const targetSection = document.getElementById(sectionId) || document.getElementById(`view-${sectionId}`);
    if (targetSection) {
        targetSection.style.display = 'block';
        targetSection.classList.add('active');
    }

    // পেজ হেডার বা মেইন টাইটেল আপডেট করা
    const mainTitle = document.getElementById('page-main-title') || document.getElementById('page-title');
    if (mainTitle) {
        mainTitle.innerText = sectionTitle || 'Dashboard';
    }

    // নির্দিষ্ট পেজে ইউজার গেলে তাৎক্ষণিকভাবে ডাটাবেজ থেকে লাইভ রিফ্রেশ করা
    if (sectionId === 'manage-products-section' || sectionId === 'products') fetchLiveProducts();
    if (sectionId === 'manage-orders-section' || sectionId === 'orders') fetchLiveOrders();
    if (sectionId === 'overview' || sectionId === 'dashboard-overview') fetchDashboardData();
    if (sectionId === 'view-customers' || sectionId === 'customers') fetchDashboardData();
}



/* ==========================================================================
   SECTION 5: OVERVIEW & ANALYTICS (ড্যাশবোর্ড ওভারভিউ এবং স্ট্যাটিস্টিকস)
   ========================================================================== */

/**
 * ৫.১: ড্যাশবোর্ডে বর্তমান তারিখ প্রদর্শন
 */
function updateDashboardDate() {
    const dateEl = document.getElementById('current-date');
    if (dateEl) {
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        dateEl.innerHTML = `<i class="fa-regular fa-calendar"></i> ${new Date().toLocaleDateString('en-US', options)}`;
    }
}

/**
 * ৫.২: সার্ভার থেকে ড্যাশবোর্ডের প্রাথমিক ডাটা (কাস্টমার ও স্ট্যাটস) নিয়ে আসা
 * Overview পেজ এবং All Customers পেজ উভয়ের জন্যই এই ফাংশনটি কাজ করবে
 */
async function fetchDashboardData() {
    try {
        // 🛡️ রিকোয়েস্টে অ্যাডমিন সিকিউরিটি টোকেন পাঠানো হচ্ছে
        const response = await fetch('/api/admin/customers', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        
        const data = await response.json();
        
        // ব্যাকএন্ড রেসপন্সের বিভিন্ন ফরম্যাট হ্যান্ডেল করা
        if (data && data.success) {
            allCustomers = data.customers || data.data || [];
        } else if (Array.isArray(data)) {
            allCustomers = data;
        } else {
            allCustomers = [];
            showCustomerError("Failed to fetch data.");
        }

        // ডাটা পাওয়ার পর ড্যাশবোর্ডের কার্ড, চার্ট ও টেবিল আপডেট করা
        if (allCustomers.length > 0) {
            updateMetricsCards(allCustomers);
            renderCustomerTable(allCustomers);
            renderGrowthChart(allCustomers);
        }

    } catch (error) {
        console.error("Dashboard Fetch Error:", error);
        showCustomerError("Server connection error.");
    }
}

/**
 * ৫.৩: টপ অ্যানালিটিক্স কার্ডগুলো (Total Users, Verified, Pending) আপডেট করা
 * @param {Array} customers - ডাটাবেজ থেকে পাওয়া কাস্টমার অ্যারে
 */
function updateMetricsCards(customers) {
    const totalUsers = customers.length;
    const verifiedUsers = customers.filter(user => user.isVerified === true).length;
    const pendingUsers = totalUsers - verifiedUsers;
    const spamAlerts = customers.filter(user => user.name && (user.name.toLowerCase().includes('spam') || user.isSpam)).length;

    // DOM এলিমেন্ট আপডেট করা
    if (document.getElementById('stat-total-users')) document.getElementById('stat-total-users').innerText = totalUsers;
    if (document.getElementById('stat-verified-users')) document.getElementById('stat-verified-users').innerText = verifiedUsers;
    if (document.getElementById('stat-pending-users')) document.getElementById('stat-pending-users').innerText = pendingUsers;
    if (document.getElementById('stat-spam-blocks')) document.getElementById('stat-spam-blocks').innerText = spamAlerts;
}

/**
 * ৫.৪: কাস্টমার রেজিস্ট্রেশন গ্রোথ চার্ট (Chart.js ব্যবহার করে)
 * @param {Array} customers - ডাটাবেজ থেকে পাওয়া কাস্টমার অ্যারে
 */
function renderGrowthChart(customers) {
    const ctx = document.getElementById('userGrowthChart');
    if (!ctx || typeof Chart === 'undefined') return; 

    // পুরোনো চার্ট থাকলে তা রিমুভ করে নতুন করে রেন্ডার করা (ওভারল্যাপিং এড়াতে)
    if (growthChartInstance) growthChartInstance.destroy();

    const verifiedCount = customers.filter(u => u.isVerified).length;
    const pendingCount = customers.filter(u => !u.isVerified).length;

    growthChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June'], // ডাইনামিক করতে চাইলে এখানে লজিক বসবে
            datasets: [{
                label: 'Platform Registration Trend',
                data: [0, 0, 0, 0, pendingCount, verifiedCount], 
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 3, 
                tension: 0.4, 
                fill: true
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false 
        }
    });
}


/* ==========================================================================
   SECTION 6: CUSTOMER MANAGEMENT (সকল কাস্টমারদের তালিকা ও পরিচালনা)
   ========================================================================== */

/**
 * ৬.১: কাস্টমারদের ডাটা টেবিলে প্রদর্শন করা
 * @param {Array} customers - ডাটাবেজ থেকে পাওয়া কাস্টমার অ্যারে
 */
function renderCustomerTable(customers) {
    const tbody = document.getElementById('customerTableBody');
    if (!tbody) return;

    // যদি কোনো কাস্টমার না থাকে
    if (customers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="loading-container">No records found.</td></tr>`;
        return;
    }

    let tableHTML = '';
    customers.forEach((user, index) => {
        const statusClass = user.isVerified ? 'status-verified' : 'status-pending';
        const statusText = user.isVerified ? 'Verified' : 'Pending';
        // ইউজারের আইডি ছোট করে দেখানো
        const displayId = user._id ? user._id.toString().slice(-6).toUpperCase() : `USR-${index + 1}`;

        tableHTML += `
            <tr>
                <td><b>#${displayId}</b></td>
                <td>${user.name || 'N/A'}</td>
                <td>${user.email || 'N/A'}</td>
                <td>${user.mobile || 'N/A'}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    <button class="action-btn view" onclick="viewCustomerDetails('${user._id}')" title="View Customer Logs">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = tableHTML;
}

/**
 * ৬.২: কাস্টমার টেবিলে এরর মেসেজ দেখানোর ফাংশন
 * @param {string} msg - এরর মেসেজ
 */
function showCustomerError(msg) {
    const tbody = document.getElementById('customerTableBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="table-status-error">${msg}</td></tr>`;
}

/**
 * ৬.৩: নির্দিষ্ট কাস্টমারের বিস্তারিত দেখা (ভবিষ্যতের ফিচার)
 * @param {string} userId - কাস্টমারের ডাটাবেজ আইডি
 */
window.viewCustomerDetails = function(userId) {
    // এখানে ভবিষ্যতে কাস্টমার প্রোফাইলের মডাল ওপেন করার লজিক যুক্ত হবে
    showToast(`Accessing security logs for ID: ${userId}`, 'info');
};



/* ==========================================================================
   SECTION 7: LIVE ORDER MANAGEMENT (লাইভ অর্ডার ও ইনভয়েস ইঞ্জিন)
   ========================================================================== */

/**
 * ৭.১: ডাটাবেজ থেকে লাইভ সমস্ত অর্ডার ফেচ করা
 * এটি সিকিউর হেডার (Token) ব্যবহার করে ব্যাকএন্ড থেকে রিয়েল-টাইম অর্ডার নিয়ে আসে
 */
async function fetchLiveOrders() {
    if (!tableBody) return;
    
    // ডাটা লোড হওয়ার সময় ইউজার ফ্রেন্ডলি মেসেজ দেখানো
    tableBody.innerHTML = `<tr><td colspan="8" class="loading-cell">Syncing live orders...</td></tr>`; 
    
    try {
        const response = await fetch('/api/orders', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        // ব্যাকএন্ড ডাটা ফরম্যাট যাচাই ও রিভার্স (সর্বশেষ অর্ডার আগে দেখানোর জন্য) করা
        if (data && data.success && Array.isArray(data.data)) {
            globalOrders = data.data; 
        } else if (Array.isArray(data)) {
            globalOrders = data.reverse(); 
        } else {
            globalOrders = [];
        }
        
        // ড্যাশবোর্ডের টোটাল অর্ডার ব্যাজ কাউন্টার আপডেট
        const totalOrderBadge = document.getElementById('total-orders-badge');
        if (totalOrderBadge) totalOrderBadge.innerText = `Total: ${globalOrders.length}`;
        
        // টেবিল রেন্ডার করার মূল ফাংশন কল
        filterAndRenderOrders(); 
    } catch (error) {
        console.error("অর্ডারের ডাটা প্রসেস করতে এরর হয়েছে:", error);
        tableBody.innerHTML = `<tr><td colspan="8" class="table-status-error">Failed to load live orders.</td></tr>`;
    }
}

/**
 * ৭.২: অর্ডার ফিল্টারিং এবং রিয়েল-টাইম সার্চিং লজিক
 * অর্ডার আইডি, কাস্টমারের নাম বা ফোন নাম্বার টাইপ করলেই টেবিল ইনস্ট্যান্ট আপডেট হবে
 */
window.filterAndRenderOrders = function() {
    const searchInput = document.getElementById('orderSearchInput');
    const filterSelect = document.getElementById('orderStatusFilter');

    const search = (searchInput ? searchInput.value : '').toLowerCase();
    const statusFilter = (filterSelect ? filterSelect.value : 'all').toLowerCase();

    // সার্চ কি-ওয়ার্ড এবং ড্রপডাউন স্ট্যাটাস ফিল্টারের সাথে ম্যাচিং করানো
    currentFilteredOrders = globalOrders.filter(order => {
        const orderIdStr = (order.orderId || order._id || '').toLowerCase();
        const nameStr = (order.customerName || '').toLowerCase();
        const phoneStr = (order.customerPhone || '').toLowerCase();
        
        const matchSearch = orderIdStr.includes(search) || nameStr.includes(search) || phoneStr.includes(search);
        const matchStatus = (statusFilter === 'all' || (order.status || 'pending').toLowerCase() === statusFilter);
        
        return matchSearch && matchStatus;
    });

    // ফিল্টার অ্যাপ্লাই করার পর পেজ নাম্বার ১ এ রিসেট করা
    currentOrderPage = 1;
    renderOrderTable();
};

/**
 * ৭.৩: ডাইনামিক অর্ডার টেবিল রেন্ডারিং এবং পেজিনেশন প্রসেসর
 * ফিল্টারকৃত ডাটাকে লিমিট অনুযায়ী টেবিলে সুন্দর করে সাজিয়ে ফুটিয়ে তোলে
 */
window.renderOrderTable = function() {
    if (!tableBody) return;
    
    const totalItems = currentFilteredOrders.length;
    const totalPages = Math.ceil(totalItems / ordersPerPage) || 1;
    
    if (currentOrderPage > totalPages) currentOrderPage = totalPages;
    const startIdx = (currentOrderPage - 1) * ordersPerPage;
    const paginatedOrders = currentFilteredOrders.slice(startIdx, startIdx + ordersPerPage);

    // পেজিনেশনের ফুটার বাটন ও ইনফো টেক্সট আপডেট
    if (document.getElementById('order-start-idx')) {
        document.getElementById('order-start-idx').innerText = totalItems === 0 ? 0 : startIdx + 1;
        document.getElementById('order-end-idx').innerText = startIdx + paginatedOrders.length;
        document.getElementById('order-total-entries').innerText = totalItems; 
    }

    // ডাইনামিক পেজ নম্বর বাটন জেনারেট করা
    renderOrderPaginationControls(totalPages);

    // ডাটা না থাকলে খালি টেবিল মেসেজ দেখানো
    tableBody.innerHTML = paginatedOrders.length === 0 ? `<tr><td colspan="8" class="loading-cell">No matching orders found.</td></tr>` : '';

    // লুপ চালিয়ে প্রতিটি অর্ডার রো (Row) তৈরি করা
    paginatedOrders.forEach((order) => {
        const orderId = order._id;
        const displayId = order.orderId || orderId.slice(-6).toUpperCase();
        
        // তারিখ ও সময় ফরম্যাটিং
        let dateHtml = `<span>N/A</span>`;
        if (order.createdAt) {
            const dateObj = new Date(order.createdAt);
            const dateStr = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            dateHtml = `<b>${dateStr}</b><br><small><i class="fa-regular fa-clock"></i> ${timeStr}</small>`;
        }
        
        // কাস্টমারের কেনা প্রোডাক্টের তালিকা তৈরি
        let itemsList = '';
        if (order.items) {
            order.items.forEach(item => itemsList += `<li><i class="fa-solid fa-cube"></i> ${item.name} <b>(x${item.quantity})</b></li>`);
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><b>#${displayId}</b></td>
            <td>${dateHtml}</td>
            <td>
                <b>${order.customerName}</b><br>
                <small><i class="fa-solid fa-phone"></i> ${order.customerPhone}</small>
            </td>
            <td><span>${order.customerAddress}</span></td>
            <td><ul style="padding-left: 0; list-style:none; margin:0;">${itemsList}</ul></td>
            <td><b>৳ ${order.totalAmount}</b></td>
            <td>
                <select onchange="changeOrderStatus('${orderId}', this.value)" class="filter-box">
                    <option value="Pending" ${order.status === 'Pending' ? 'selected' : ''}>⏳ Pending</option>
                    <option value="Processing" ${order.status === 'Processing' ? 'selected' : ''}>⚙️ Processing</option>
                    <option value="Shipped" ${order.status === 'Shipped' ? 'selected' : ''}>🚚 Shipped</option>
                    <option value="Delivered" ${order.status === 'Delivered' ? 'selected' : ''}>✅ Delivered</option>
                    <option value="Cancelled" ${order.status === 'Cancelled' ? 'selected' : ''}>❌ Cancelled</option>
                </select>
            </td>
            <td class="col-actions">
                <button class="page-nav-btn" onclick="viewInvoice('${orderId}')" title="View Invoice"><i class="fa-solid fa-file-invoice"></i></button>
                <button class="page-nav-btn" onclick="deleteOrder('${orderId}')" title="Delete Order"><i class="fa-solid fa-trash-can"></i></button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
};

/**
 * ৭.৪: লাইভ অর্ডার স্ট্যাটাস পরিবর্তন ইঞ্জিন
 * @param {string} orderId - অর্ডারের ডাটাবেজ আইডি
 * @param {string} newStatus - নতুন সিলেক্টেড স্ট্যাটাস
 */
window.changeOrderStatus = async function(orderId, newStatus) {
    try {
        const response = await fetch(`/api/orders/${orderId}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status: newStatus })
        });
        const result = await response.json();
        if (result.success) {
            showToast(`Order status changed to ${newStatus}!`, 'success');
            fetchLiveOrders(); // ডাটা রিলোড করে টেবিল সিঙ্ক করা
        } else showToast("Error updating status!", 'error');
    } catch (error) {
        showToast("Server connection error!", 'error');
    }
};

/**
 * ۷.৫: সিঙ্গেল অর্ডার ডিলিট করার লজিক (নিরাপত্তা প্রম্পট সহ)
 * @param {string} orderId - ডিলিট করার জন্য অর্ডার আইডি
 */
window.deleteOrder = function(orderId) {
    showCustomConfirm("Delete Order", "Are you sure you want to permanently delete this order?", async () => {
        try {
            const response = await fetch(`/api/orders/${orderId}`, { 
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if ((await response.json()).success) {
                showToast("Order deleted successfully!", "success");
                fetchLiveOrders(); 
            } else showToast("Failed to delete order.", "error");
        } catch (err) { showToast("Server error!", "error"); }
    }, "danger");
};


/* ==========================================================================
   SECTION 7.1: INVOICE ENGINE (অর্ডার ইনভয়েস মডাল কন্ট্রোলার)
   ========================================================================== */

/**
 * ৭.৬: নির্দিষ্ট অর্ডারের কাস্টম ডিজিটাল ইনভয়েস মডাল ওপেন করা
 * @param {string} orderId - ইনভয়েস দেখার জন্য অর্ডার আইডি
 */
window.viewInvoice = function(orderId) {
    const order = globalOrders.find(o => o._id === orderId); 
    const modal = document.getElementById('invoiceModal');
    if (!order || !modal) return showToast("Invoice data not found!", "error");

    // মডালে কাস্টমার ডাটা পুশ করা
    document.getElementById('invOrderId').innerText = order.orderId || '#' + orderId.slice(-6).toUpperCase();
    document.getElementById('invCustomerName').innerText = order.customerName || 'N/A';
    document.getElementById('invCustomerPhone').innerText = order.customerPhone || 'N/A';
    document.getElementById('invCustomerAddress').innerText = order.customerAddress || 'N/A';
    document.getElementById('invTotalAmount').innerText = `৳ ${order.totalAmount || 0}`;

    // আইটেম লিস্ট জেনারেট করা
    const itemsContainer = document.getElementById('invItemsList');
    let itemsHTML = '';
    if (order.items) {
        order.items.forEach(item => {
            itemsHTML += `<div style="display:flex; justify-content:space-between; padding: 10px 0; border-bottom: 1px dashed #e2e8f0;">
                <span><i class="fa-solid fa-cube text-muted"></i> ${item.name} (x${item.quantity})</span>
                <b class="text-main">৳ ${item.price * item.quantity}</b>
            </div>`;
        });
    }
    itemsContainer.innerHTML = itemsHTML;
    modal.style.display = 'flex'; // মডাল প্রদর্শন
};

/**
 * ৭.৭: ইনভয়েস মডাল বন্ধ করার ফাংশন
 */
window.closeInvoiceModal = function() {
    const modal = document.getElementById('invoiceModal');
    if (modal) modal.style.display = 'none';
};


/* ==========================================================================
   SECTION 7.2: ORDER PAGINATION CONTROLS (অর্ডার পেজিনেশন নেভিগেশন)
   ========================================================================== */

/**
 * ৭.৮: প্রতি পেজে কতটি অর্ডার দেখাবে তা পরিবর্তন করার ফাংশন
 */
window.changeOrderPageSize = function() {
    const select = document.getElementById('orderItemsPerPage');
    if (select) {
        ordersPerPage = parseInt(select.value);
        currentOrderPage = 1; // পেজ সাইজ পাল্টালে আবার ১ম পেজে নিয়ে আসা
        renderOrderTable();
    }
};

/**
 * ৭.৯: পরবর্তী পেজে যাওয়ার নেভিগেশন বাটন
 */
window.goToNextOrderPage = function() {
    const totalItems = currentFilteredOrders.length;
    const totalPages = Math.ceil(totalItems / ordersPerPage) || 1;
    if (currentOrderPage < totalPages) {
        currentOrderPage++;
        renderOrderTable();
    }
};

/**
 * ৭.১০: পূর্ববর্তী পেজে যাওয়ার নেভিগেশন বাটন
 */
window.goToPreviousOrderPage = function() {
    if (currentOrderPage > 1) {
        currentOrderPage--;
        renderOrderTable();
    }
};

/**
 * ৭.১১: নির্দিষ্ট পেজ নম্বরে ডাইরেক্ট যাওয়ার নেভিগেশন
 */
window.goToOrderPage = function(pageNumber) {
    currentOrderPage = pageNumber;
    renderOrderTable();
};

/**
 * ৭.১২: টেবিলের নিচে ডাইনামিক পেজ নম্বর বাটন স্ট্রাকচার তৈরি করা
 * @param {number} totalPages - মোট পেজের সংখ্যা
 */
function renderOrderPaginationControls(totalPages) {
    const paginationContainer = document.getElementById('dynamic-order-pages');
    if (!paginationContainer) return;

    paginationContainer.innerHTML = ''; // পুরোনো বাটন বা ডুপ্লিকেট ক্লিয়ার করা
    
    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.classList.add('page-num-btn');
        if (i === currentOrderPage) {
            btn.classList.add('active-page');
        }
        btn.innerText = i;
        btn.onclick = () => goToOrderPage(i);
        paginationContainer.appendChild(btn);
    }

    // প্রথম বা শেষ পেজে থাকলে Next/Prev বাটনগুলোকে ডিজেবল (Disable) করা
    const prevBtn = document.getElementById('btn-prev-order');
    const nextBtn = document.getElementById('btn-next-order');
    
    if (prevBtn) prevBtn.disabled = currentOrderPage === 1;
    if (nextBtn) nextBtn.disabled = currentOrderPage === totalPages;
}

// সার্চ এবং স্ট্যাটাস চেঞ্জের জন্য ইভেন্ট লিসেনার ইনিশিয়ালাইজেশন
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('orderSearchInput');
    const filterSelect = document.getElementById('orderStatusFilter');
    
    if (searchInput) searchInput.addEventListener('input', window.filterAndRenderOrders);
    if (filterSelect) filterSelect.addEventListener('change', window.filterAndRenderOrders);
});



/* ==========================================================================
   SECTION 8: ADD NEW PRODUCT ENGINE (নতুন প্রোডাক্ট আপলোড মডিউল)
   ========================================================================== */

// ৮.১: প্রোডাক্ট আপলোডের সময় ফাইল ট্র্যাকিং এর জন্য গ্লোবাল ডাটা ট্রান্সফার অবজেক্ট
let selectedFilesAdd = new DataTransfer(); 

/**
 * ৮.২: ছবি সিলেক্ট করার পর ডাইনামিক লাইভ প্রিভিউ জেনারেটর (ক্রস বাটন সহ)
 * @param {Event} event - ফাইল ইনপুট চেঞ্জ ইভেন্ট
 */
window.previewImage = function(event) {
    const files = event.target.files;
    if (files && files.length > 0) {
        // নতুন সিলেক্ট করা ফাইলগুলো গ্লোবাল লিস্টে যোগ করা
        Array.from(files).forEach(file => selectedFilesAdd.items.add(file));
    }
    event.target.files = selectedFilesAdd.files; // অরিজিনাল ইনপুট ফাইল আপডেট
    renderAddPreviews();
};

/**
 * ৮.৩: সিলেক্টেড ছবিগুলোর প্রিভিউ ডমে (DOM) রেন্ডার করা
 */
function renderAddPreviews() {
    const previewBox = document.getElementById('imgPreviewBox');
    if (!previewBox) return;
    previewBox.innerHTML = '';

    // কোনো ফাইল সিলেক্ট না থাকলে ডিফল্ট প্লেসহোল্ডার দেখানো
    if (selectedFilesAdd.files.length === 0) {
        previewBox.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i><p>Upload Images</p>`;
        return;
    }

    // প্রতিটা ফাইলের জন্য FileReader দিয়ে প্রিভিউ থাম্বনেইল এবং ডিলিট বাটন তৈরি
    Array.from(selectedFilesAdd.files).forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = e => {
            previewBox.innerHTML += `
            <div style="position:relative; display:inline-block; margin:5px;">
                <img src="${e.target.result}" style="height:80px; border-radius:5px; object-fit: cover;">
                <button type="button" onclick="removeAddImage(${index})" style="position:absolute; top:-5px; right:-5px; background:#ef4444; color:white; border:none; border-radius:50%; width:22px; height:22px; cursor:pointer; font-size:14px; font-weight:bold; line-height:1;">&times;</button>
            </div>`;
        };
        reader.readAsDataURL(file);
    });
}

/**
 * ৮.৪: প্রিভিউ থেকে নির্দিষ্ট কোনো ছবি বাদ দেওয়ার (ক্রস বাটন) ফাংশন
 * @param {number} index - ফাইল লিস্টের ইনডেক্স নম্বর
 */
window.removeAddImage = function(index) {
    const dt = new DataTransfer();
    const files = selectedFilesAdd.files;
    for (let i = 0; i < files.length; i++) {
        if (i !== index) dt.items.add(files[i]);
    }
    selectedFilesAdd = dt;
    document.getElementById('prodImageFile').files = selectedFilesAdd.files;
    renderAddPreviews();
};

/**
 * ৮.৫: ব্যাকএন্ড ক্লাউড সার্ভারে নতুন প্রোডাক্ট ডাটা এবং ইমেজ আপলোড করা
 * এতে Detailed Description এবং Highlights এর মতো আধুনিক ফিল্ড অন্তর্ভুক্ত রয়েছে
 */
window.uploadProduct = async function() {
    const id = document.getElementById('prodId').value.trim();
    const name = document.getElementById('prodName').value.trim();
    const price = document.getElementById('prodPrice').value.trim();
    const stock = document.getElementById('prodStock').value.trim();
    const category = document.getElementById('prodCategory').value;
    const emoji = document.getElementById('prodEmoji').value.trim();
    const desc = document.getElementById('prodDesc').value.trim();
    
    // নতুন মাল্টি-ফাংশনাল ফিল্ড ডাটা সংগ্রহ
    const detailedDesc = document.getElementById('prodDetailedDesc') ? document.getElementById('prodDetailedDesc').value.trim() : '';
    const highlightsInput = document.getElementById('prodHighlights') ? document.getElementById('prodHighlights').value.trim() : '';
    
    const files = document.getElementById('prodImageFile').files; 

    // ডাটা ভ্যালিডেশন চেক
    if (!name || !id || !price || !stock) return showToast("Required fields missing!", "warning");
    if (!emoji && files.length === 0) return showToast("Provide an Emoji or Image!", "warning");

    // বাটন লোডিং স্টেট অ্যানিমেশন চালু
    const btn = document.activeElement; 
    let originalText = '';
    if (btn && btn.tagName === 'BUTTON') { 
        originalText = btn.innerHTML;
        btn.disabled = true; 
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...'; 
    }

    // হাইলাইটস ইনপুটকে কমা দিয়ে ভাগ করে অ্যারে স্ট্রাকচারে রূপান্তর
    const highlightsArray = highlightsInput 
        ? highlightsInput.split(',').map(item => item.trim()).filter(item => item !== '') 
        : [];

    // মাল্টিপার্ট ফর্ম ডাটা (FormData) অবজেক্ট তৈরি
    const formData = new FormData();
    formData.append('id', id); 
    formData.append('name', name); 
    formData.append('price', price);
    formData.append('stock', stock); 
    formData.append('category', category);
    formData.append('icon', emoji); 
    formData.append('description', desc);
    formData.append('detailedDescription', detailedDesc); 
    formData.append('highlights', JSON.stringify(highlightsArray)); 
    
    // একাধিক ছবি থাকলে সবগুলোকে ব্যাকএন্ড রাউটের 'productImages' কী-তে অ্যাপেন্ড করা
    if (files.length > 0) {
        for (let i = 0; i < files.length; i++) {
            formData.append('productImages', files[i]);
        }
    }

    try {
        const res = await fetch('/api/products', { 
            method: 'POST', 
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData 
        });
        const result = await res.json();

        if (result.success) {
            showToast("Product uploaded successfully! 🎉", "success");
            document.getElementById('addProductForm').reset();
            
            // ডাটা ট্রান্সফার রিসেট ও প্রিভিউ ক্লিয়ার
            selectedFilesAdd = new DataTransfer();
            document.getElementById('prodImageFile').files = selectedFilesAdd.files;
            renderAddPreviews();
            
            // প্রোডাক্ট লিস্ট লাইভ আপডেট করা
            fetchLiveProducts();
        } else {
            showToast("Upload failed: " + (result.message || "Unknown error"), "error");
        }
    } catch (e) { 
        showToast("Server error during product upload!", "error"); 
    } finally { 
        // বাটনের লোডিং স্টেট রিমুভ ও আগের টেক্সট ফিরিয়ে আনা
        if (btn && btn.tagName === 'BUTTON') { btn.disabled = false; btn.innerHTML = originalText; } 
    }
};


/* ==========================================================================
   SECTION 9: MANAGE PRODUCTS ENGINE (প্রোডাক্ট তালিকা ও মাল্টি-ফিল্টারিং)
   ========================================================================== */

let currentSort = { key: 'productId', asc: false }; // ডিফল্ট সোর্টিং স্টেট
let selectedProductIds = new Set();               // বাল্ক ডিলিটের জন্য চেক করা আইডি সেট

/**
 * ৯.১: ক্লাউড ডাটাবেজ থেকে সকল প্রোডাক্ট ডাটা লাইভ সিঙ্ক করা
 */
window.fetchLiveProducts = async function() {
    if (!prodTableBody) return;
    prodTableBody.innerHTML = `<tr><td colspan="8" class="loading-cell"><div class="custom-spinner"></div><p>Syncing secure cloud server database...</p></td></tr>`;
    
    try {
        const res = await fetch('/api/products', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        globalProducts = await res.json() || [];
        
        const totalBadge = document.getElementById('total-products-badge');
        if (totalBadge) totalBadge.innerText = `Total: ${globalProducts.length}`;
        
        // ডাটা আসার পর ফিল্টার এবং সর্ট ইঞ্জিন রান করা
        filterAndRenderProducts(); 
    } catch (e) { 
        prodTableBody.innerHTML = `<tr><td colspan="8" class="table-status-error">Failed to load products.</td></tr>`; 
    }
};

/**
 * ৯.২: সার্চ কি-ওয়ার্ড, ক্যাটাগরি, স্টক স্ট্যাটাস ও প্রাইস রেঞ্জ অনুযায়ী প্রোডাক্ট ফিল্টারিং
 */
window.filterAndRenderProducts = function() {
    const search = (document.getElementById('searchProduct') ? document.getElementById('searchProduct').value : '').toLowerCase();
    const cat = document.getElementById('filterCategory') ? document.getElementById('filterCategory').value : 'All';
    const stockStatus = document.getElementById('filterStockStatus') ? document.getElementById('filterStockStatus').value : 'All';
    const priceRange = document.getElementById('filterPriceRange') ? document.getElementById('filterPriceRange').value : 'All';

    // ১. ফিল্টারিং প্রসেস
    currentFilteredProducts = globalProducts.filter(p => {
        const matchSearch = (p.name || '').toLowerCase().includes(search) || (p.productId || p.id || '').toLowerCase().includes(search) || (p.category || '').toLowerCase().includes(search);
        const matchCat = (cat === 'All' || p.category === cat);
        
        // স্টক স্ট্যাটাস ফিল্টার লজিক
        let matchStock = true;
        if (stockStatus === 'InStock') matchStock = p.stock >= 5;
        else if (stockStatus === 'LowStock') matchStock = p.stock > 0 && p.stock < 5;
        else if (stockStatus === 'OutOfStock') matchStock = p.stock == 0;

        // প্রাইস ফিল্টার লজিক
        let matchPrice = true;
        if (priceRange === '0-500') matchPrice = p.price <= 500;
        else if (priceRange === '500-2000') matchPrice = p.price > 500 && p.price <= 2000;
        else if (priceRange === '2000+') matchPrice = p.price > 2000;

        return matchSearch && matchCat && matchStock && matchPrice;
    });

    // ২. সোর্টিং প্রসেস
    currentFilteredProducts.sort((a, b) => {
        let valA = a[currentSort.key] || '';
        let valB = b[currentSort.key] || '';
        
        if (currentSort.key === 'price' || currentSort.key === 'stock') {
            valA = Number(valA); valB = Number(valB);
        } else {
            valA = valA.toString().toLowerCase(); valB = valB.toString().toLowerCase();
        }

        if (valA < valB) return currentSort.asc ? -1 : 1;
        if (valA > valB) return currentSort.asc ? 1 : -1;
        return 0;
    });

    currentPage = 1; // সার্চ বা ফিল্টার করলে পেজ ১ নম্বর এ রিসেট হবে
    renderProductTable();
};

/**
 * ৯.৩: কলাম হেডারে ক্লিক করলে ডাইনামিক সর্ট টগল করার ফাংশন
 * @param {string} key - যে অবজেক্ট প্রোপার্টি অনুযায়ী সর্ট হবে (price, stock ইত্যাদি)
 */
window.handleSort = function(key) {
    if (currentSort.key === key) {
        currentSort.asc = !currentSort.asc; 
    } else {
        currentSort.key = key;
        currentSort.asc = true;
    }
    filterAndRenderProducts();
};


/* ==========================================================================
   SECTION 9.1: PRODUCT TABLE RENDERING (টেবিল রেন্ডার ও স্টক অ্যালার্ট)
   ========================================================================== */

window.changePageSize = function() {
    currentPage = 1;
    renderProductTable();
};

/**
 * ৯.৪: প্রোডাক্ট ডাটা টেবিল জেনারেটর এবং কন্ডিশনাল স্টক ব্যাজ বাইন্ডিং
 */
window.renderProductTable = function() {
    if (!prodTableBody) return;
    
    const limit = parseInt(document.getElementById('itemsPerPage') ? document.getElementById('itemsPerPage').value : 10);
    const totalItems = currentFilteredProducts.length;
    const totalPages = Math.ceil(totalItems / limit) || 1;
    
    if (currentPage > totalPages) currentPage = totalPages;
    const startIdx = (currentPage - 1) * limit;
    const paginated = currentFilteredProducts.slice(startIdx, startIdx + limit);

    // এন্ট্রি কাউন্টার টেক্সট আপডেট
    if (document.getElementById('page-start-idx')) {
        document.getElementById('page-start-idx').innerText = totalItems === 0 ? 0 : startIdx + 1;
        document.getElementById('page-end-idx').innerText = startIdx + paginated.length;
        document.getElementById('page-total-entries').innerText = totalItems;
    }

    prodTableBody.innerHTML = paginated.length === 0 ? `<tr><td colspan="8" class="loading-cell">No matching products found.</td></tr>` : '';

    paginated.forEach(prod => {
        // ইমেজ ইউআরএল প্রসেস লজিক (মাল্টিপল অ্যারে থেকে প্রথম ছবি নির্বাচন)
        let imgSrc = '';
        if (prod.images && prod.images.length > 0) imgSrc = prod.images[0];
        else if (prod.image) imgSrc = prod.image;
        else if (prod.imageUrl) imgSrc = prod.imageUrl;
        
        if (imgSrc && !imgSrc.startsWith('/') && !imgSrc.startsWith('http')) imgSrc = `/products/${imgSrc}`;
        let imgHtml = imgSrc ? `<img src="${imgSrc}" onerror="this.outerHTML='<span>${prod.icon||'📦'}</span>';" class="product-img-sm">` : `<span style="font-size:24px;">${prod.icon||'📦'}</span>`;

        // স্টক লেভেলের উপর ভিত্তি করে ডাইনামিক স্টাইলিশ ব্যাজ তৈরি
        let stockHtml = '';
        let currentStock = Number(prod.stock);

        if (currentStock <= 0) { 
            stockHtml = `<span class="stock-status stock-out"><i class="fa-solid fa-ban"></i> Out of Stock</span>`;
        } else if (currentStock <= 5) {
            stockHtml = `<span class="stock-status stock-low"><i class="fa-solid fa-triangle-exclamation"></i> Low: ${currentStock}</span>`;
        } else {
            stockHtml = `<span class="stock-status stock-normal"><i class="fa-solid fa-check-circle"></i> In Stock: ${currentStock}</span>`;
        }

        // বাল্ক সিলেকশন চেকবক্স স্টেট চেক করা
        const isChecked = selectedProductIds.has(prod._id) ? 'checked' : '';

        prodTableBody.innerHTML += `
            <tr>
                <td class="col-checkbox">
                    <input type="checkbox" class="row-checkbox" value="${prod._id}" ${isChecked} onchange="toggleSingleSelection(this)">
                </td>
                <td><b>${prod.productId || prod.id || 'N/A'}</b></td>
                <td>${imgHtml}</td>
                <td>${prod.name}</td>
                <td><span class="status-badge status-verified">${prod.category || 'General'}</span></td>
                <td><b>৳ ${prod.price}</b></td>
                <td>${stockHtml}</td> 
                <td class="col-actions">
                    <button class="action-btn edit" onclick="editProduct('${prod._id}')" title="Edit Product"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button class="action-btn delete" onclick="deleteProduct('${prod._id}')" title="Delete Product"><i class="fa-solid fa-trash-can"></i></button>
                </td>
            </tr>
        `;
    });

    // প্রোডাক্ট পেজিনেশন নম্বর বাটন রেন্ডার করা
    renderPaginationButtons(totalPages);
    
    // সিলেক্ট অল চেকবক্স হ্যান্ডলার সিঙ্ক
    const selectAllCheckbox = document.getElementById('selectAllProducts');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = paginated.length > 0 && Array.from(document.querySelectorAll('.row-checkbox')).every(cb => cb.checked);
    }
};

/**
 * ৯.৫: ডাইনামিক পেজিনেশন বাটন ট্র্যাকার ও জেনারেটর
 * @param {number} totalPages - মোট প্রোডাক্ট পেজ সংখ্যা
 */
function renderPaginationButtons(totalPages) {
    const container = document.getElementById('dynamic-page-numbers');
    if (!container) return;
    
    let html = '';
    for (let i = 1; i <= totalPages; i++) {
        // ডাইনামিক ইলিপসিস (...) স্ট্রাকচার তৈরি যদি পেজ অনেক বেশি থাকে
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            html += `<button type="button" class="page-num-btn ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
        } else if (i === currentPage - 2 || i === currentPage + 2) {
            html += `<span style="padding: 5px;">...</span>`;
        }
    }
    container.innerHTML = html;

    document.getElementById('btn-prev-page').disabled = currentPage === 1;
    document.getElementById('btn-next-page').disabled = currentPage === totalPages || totalPages === 0;
}

window.goToPage = function(page) { currentPage = page; renderProductTable(); };
window.goToNextPage = function() { currentPage++; renderProductTable(); };
window.goToPreviousPage = function() { if (currentPage > 1) { currentPage--; renderProductTable(); } };


/* ==========================================================================
   SECTION 9.2: BULK OPERATIONS & DATA EXPORT (CSV এক্সপোর্ট মডিউল)
   ========================================================================== */

/**
 * ৯.৬: টেবিলের সকল চেকবক্স একসাথে অন/অফ করা
 */
window.toggleSelectAll = function(source) {
    const checkboxes = document.querySelectorAll('.row-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = source.checked;
        if (source.checked) selectedProductIds.add(cb.value);
        else selectedProductIds.delete(cb.value);
    });
    updateBulkActionPanel();
};

/**
 * ৯.৭: সিঙ্গেল আইটেম চেকবক্স সিলেক্ট করা
 */
window.toggleSingleSelection = function(checkbox) {
    if (checkbox.checked) selectedProductIds.add(checkbox.value);
    else selectedProductIds.delete(checkbox.value);
    updateBulkActionPanel();
    
    const allChecked = Array.from(document.querySelectorAll('.row-checkbox')).every(cb => cb.checked);
    document.getElementById('selectAllProducts').checked = allChecked;
};

function updateBulkActionPanel() {
    const countSpan = document.getElementById('selected-count');
    if (countSpan) countSpan.innerText = `${selectedProductIds.size} selected`;
}

/**
 * ৯.৮: একাধিক সিলেক্টেড প্রোডাক্ট একসাথে এক ক্লিকে ডিলিট করার কোর ফাংশন
 */
window.handleBulkDelete = function() {
    if (selectedProductIds.size === 0) return showToast("No products selected!", "warning");
    
    showCustomConfirm("Bulk Delete", `Are you sure you want to delete ${selectedProductIds.size} products? This cannot be undone.`, async () => {
        try {
            const deletePromises = Array.from(selectedProductIds).map(id => 
                fetch(`/api/products/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }})
            );
            await Promise.all(deletePromises);
            
            showToast(`${selectedProductIds.size} products deleted successfully!`, "success");
            selectedProductIds.clear();
            updateBulkActionPanel();
            document.getElementById('selectAllProducts').checked = false;
            fetchLiveProducts(); // টেবিল রিফ্রেশ
        } catch (e) {
            showToast("Error in bulk deletion process!", "error");
        }
    }, "danger");
};

/**
 * ৯.৯: একক প্রোডাক্ট ডিলিট করার লজিক
 */
window.deleteProduct = (id) => {
    showCustomConfirm("Delete Product", "Permanently delete this product?", async () => {
        try {
            const res = await fetch(`/api/products/${id}`, { 
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if ((await res.json()).success) {
                showToast("Product deleted!", "success"); 
                selectedProductIds.delete(id); 
                updateBulkActionPanel();
                fetchLiveProducts();
            } else showToast("Failed to delete.", "error");
        } catch (e) { showToast("Server error", "error"); }
    }, "danger");
};

/**
 * ৯.১০: এক্সপোর্ট বাটন হ্যান্ডলার - সম্পূর্ণ ডাটাকে প্রফেশনাল CSV ফরম্যাটে ডাউনলোড করার সিস্টেম
 */
document.getElementById('btn-export-csv')?.addEventListener('click', () => {
    if (currentFilteredProducts.length === 0) return showToast("No data to export", "warning");
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "ID,Name,Category,Price,Stock\n"; 
    
    currentFilteredProducts.forEach(p => {
        let row = `"${p.productId || p.id || ''}","${p.name}","${p.category}","${p.price}","${p.stock}"`;
        csvContent += row + "\r\n";
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Products_Export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("CSV Exported successfully!", "success");
});

document.getElementById('btn-print-table')?.addEventListener('click', () => {
    window.print();
});


/* ==========================================================================
   SECTION 10: ADVANCED PRODUCT EDIT & LIVE PREVIEW ENGINE (এডিট মডিউল)
   ========================================================================== */

let selectedFilesEdit = new DataTransfer(); // এডিট মোডালের ইমেজ ট্র্যাকার

/**
 * ১০.১: এডিট মডাল ওপেন করা এবং ফর্মে ডাইনামিক ডাটা ইনজেক্ট করা
 * @param {string} id - প্রোডাক্টের অবজেক্ট আইডি
 */
window.editProduct = function(id) {
    selectedFilesEdit = new DataTransfer(); 

    const previewBox = document.getElementById('editImgPreviewBox');
    if (previewBox) previewBox.innerHTML = ''; 
    
    const fileInput = document.getElementById('prodImageFile'); 
    if (fileInput) {
        fileInput.value = ''; 
        fileInput.files = selectedFilesEdit.files; 
    }

    const product = globalProducts.find(p => p._id === id);
    if (!product) return showToast("Product not found!", "error");

    const modal = document.getElementById('editProductModal'); 
    if (!modal) return showToast("Edit Product Modal ID not found in HTML!", "warning");

    // ফর্মে ওল্ড ডাটা বসানো
    if (document.getElementById('editProdMongoId')) document.getElementById('editProdMongoId').value = product._id;
    if (document.getElementById('editProdId')) document.getElementById('editProdId').value = product.productId || product.id || '';
    if (document.getElementById('editProdName')) document.getElementById('editProdName').value = product.name || '';
    if (document.getElementById('editProdPrice')) document.getElementById('editProdPrice').value = product.price || '';
    if (document.getElementById('editProdStock')) document.getElementById('editProdStock').value = product.stock || '';
    if (document.getElementById('editProdCategory')) document.getElementById('editProdCategory').value = product.category || 'General';
    if (document.getElementById('editProdEmoji')) document.getElementById('editProdEmoji').value = product.icon || '📦';
    if (document.getElementById('editProdDesc')) document.getElementById('editProdDesc').value = product.description || '';
    
    // অ্যাডভান্সড ডেসক্রিপশন এবং হাইলাইটস ডাটা ইনজেকশন
    if (document.getElementById('editDetailedDescription')) document.getElementById('editDetailedDescription').value = product.detailedDescription || '';
    if (document.getElementById('editHighlights')) document.getElementById('editHighlights').value = product.highlights && Array.isArray(product.highlights) ? product.highlights.join(', ') : '';

    // এক্সিসটিং ইমেজের ডাইনামিক থাম্বনেইল থাম্ব শো করানো
    if (previewBox) {
        if (product.images && product.images.length > 0) {
            let imgsHtml = '';
            product.images.forEach(img => {
                let imgSrc = img.startsWith('http') ? img : `/products/${img}`;
                imgsHtml += `<img src="${imgSrc}" style="max-height: 80px; margin-right: 5px; border-radius: 6px;">`;
            });
            previewBox.innerHTML = imgsHtml;
        } else if (product.image) {
            let imgSrc = product.image.startsWith('http') ? product.image : `/products/${product.image}`;
            previewBox.innerHTML = `<img src="${imgSrc}" style="max-height: 80px; margin-right: 5px; border-radius: 6px;">`;
        } else {
            previewBox.innerHTML = `<span style="font-size:38px;">${product.icon || '📦'}</span>`;
        }
    }

    modal.style.display = 'flex';
};

/**
 * ১০.২: এডিট মোডাল বন্ধ ও রিসেট করা
 */
window.closeEditModal = function() {
    const modal = document.getElementById('editProductModal');
    if (modal) {
        modal.style.display = 'none';
        selectedFilesEdit = new DataTransfer();
        const editFileInput = document.querySelector('#editProductModal input[type="file"]'); 
        if (editFileInput) {
            editFileInput.value = '';
            editFileInput.files = selectedFilesEdit.files;
        }
    }
};

// ইভেন্ট ডেলিগেশন দিয়ে এডিট মোডালের ফাইল আপলোড লাইভ লিসেনিং করা
document.addEventListener('change', function(e) {
    if (e.target && e.target.closest('#editProductModal') && e.target.type === 'file') {
        const files = e.target.files;
        if (files && files.length > 0) {
            Array.from(files).forEach(file => selectedFilesEdit.items.add(file));
        }
        e.target.files = selectedFilesEdit.files;
        renderEditPreviews();
    }
});

function renderEditPreviews() {
    const previewBox = document.getElementById('editImgPreviewBox');
    if (!previewBox) return;
    
    const hasFiles = selectedFilesEdit.files.length > 0;
    if (hasFiles) {
        previewBox.innerHTML = '';
        Array.from(selectedFilesEdit.files).forEach((file, index) => {
            const reader = new FileReader();
            reader.onload = function(event) {
                previewBox.innerHTML += `
                <div style="position:relative; display:inline-block; margin:5px;">
                    <img src="${event.target.result}" style="height:80px; border-radius:6px; object-fit: contain;">
                    <button type="button" onclick="removeEditImage(${index})" style="position:absolute; top:-5px; right:-5px; background:#ef4444; color:white; border:none; border-radius:50%; width:22px; height:22px; cursor:pointer; font-size:14px; font-weight:bold; line-height:1;">&times;</button>
                </div>`;
            };
            reader.readAsDataURL(file);
        });
    }
}

window.removeEditImage = function(index) {
    const dt = new DataTransfer();
    const files = selectedFilesEdit.files;
    for (let i = 0; i < files.length; i++) {
        if (i !== index) dt.items.add(files[i]);
    }
    selectedFilesEdit = dt;
    const editFileInput = document.querySelector('#editProductModal input[type="file"]');
    if (editFileInput) editFileInput.files = selectedFilesEdit.files;
    renderEditPreviews();
};

/**
 * ১০.৩: মডিফাইড ডাটা পুশ করে ক্লাউড ডাটাবেজে প্রোডাক্ট আপডেট সেভ করা
 */
window.updateProductDetails = async function() {
    const mongoId = document.getElementById('editProdMongoId').value;
    const productId = document.getElementById('editProdId').value.trim();
    const name = document.getElementById('editProdName').value.trim();
    const price = document.getElementById('editProdPrice').value.trim();
    const stock = document.getElementById('editProdStock').value.trim();
    const category = document.getElementById('editProdCategory').value.trim();
    const emoji = document.getElementById('editProdEmoji').value.trim();
    const desc = document.getElementById('editProdDesc').value.trim();
    
    const detailedDesc = document.getElementById('editDetailedDescription') ? document.getElementById('editDetailedDescription').value.trim() : '';
    const highlightsInput = document.getElementById('editHighlights') ? document.getElementById('editHighlights').value.trim() : '';
    
    const editFileInput = document.querySelector('#editProductModal input[type="file"]');
    const files = editFileInput ? editFileInput.files : null;

    if (!name || !price || !stock) return showToast("Required fields missing!", "warning");

    const btn = document.getElementById('saveEditBtn');
    let originalText = '';
    if (btn) { originalText = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...'; }

    const highlightsArray = highlightsInput 
        ? highlightsInput.split(',').map(item => item.trim()).filter(item => item !== '') 
        : [];

    const formData = new FormData();
    formData.append('id', productId);
    formData.append('name', name);
    formData.append('price', price);
    formData.append('stock', stock);
    formData.append('category', category);
    formData.append('icon', emoji);
    formData.append('description', desc);
    formData.append('detailedDescription', detailedDesc);
    formData.append('highlights', JSON.stringify(highlightsArray)); 
    
    if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
            formData.append('productImages', files[i]);
        }
    }

    try {
        const res = await fetch(`/api/products/${mongoId}`, { 
            method: 'PUT', 
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData 
        });
        
        const result = await res.json();
        if (result.success) {
            showToast("Product updated successfully! 🎉", "success");
            window.closeEditModal();
            fetchLiveProducts(); // রিফ্রেশ টেবিল ডাটা
        } else {
            showToast(result.message || "Update failed!", "error");
        }
    } catch (e) { 
        showToast("Server error during update!", "error"); 
    } finally { 
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; } 
    }
};

// সার্চ বা ফিল্টার ইভেন্ট বাইন্ডিং সেটআপ
document.addEventListener('DOMContentLoaded', () => {
    const searchProduct = document.getElementById('searchProduct');
    if (searchProduct) searchProduct.addEventListener('input', window.filterAndRenderProducts);
    
    ['filterCategory', 'filterStockStatus', 'filterPriceRange'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', window.filterAndRenderProducts);
    });
});



/* ==========================================================================
   SECTION 11: SECURITY LOGS (অ্যাডমিন প্যানেল অ্যাক্টিভিটি এবং লগ ট্র্যাকিং)
   ========================================================================== */

/**
 * ১১.১: সার্ভার থেকে অ্যাডমিন ও সিস্টেমের সিকিউরিটি লগস নিয়ে আসা
 */
async function fetchSecurityLogs() {
    const logsBody = document.getElementById('securityLogsBody');
    if (!logsBody) return;

    logsBody.innerHTML = `<tr><td colspan="5" class="loading-cell">Fetching security logs...</td></tr>`;

    try {
        const response = await fetch('/api/admin/logs', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        const logs = data.success ? data.data : (Array.isArray(data) ? data : []);

        if (logs.length === 0) {
            logsBody.innerHTML = `<tr><td colspan="5" class="loading-cell">No security logs found.</td></tr>`;
            return;
        }

        let logsHTML = '';
        logs.forEach(log => {
            // অ্যাকশন অনুযায়ী ব্যাজের কালার নির্ধারণ
            let actionClass = 'status-pending'; // default
            if (log.action.toLowerCase().includes('delete') || log.action.toLowerCase().includes('failed')) actionClass = 'stock-out';
            else if (log.action.toLowerCase().includes('login') || log.action.toLowerCase().includes('success')) actionClass = 'status-verified';
            else if (log.action.toLowerCase().includes('update') || log.action.toLowerCase().includes('edit')) actionClass = 'stock-low';

            logsHTML += `
                <tr>
                    <td><b>#${log._id ? log._id.slice(-6).toUpperCase() : 'SYS'}</b></td>
                    <td>${new Date(log.timestamp).toLocaleString('en-GB')}</td>
                    <td><span class="status-badge ${actionClass}">${log.action}</span></td>
                    <td>${log.ipAddress || 'Unknown IP'}</td>
                    <td>${log.details || 'N/A'}</td>
                </tr>
            `;
        });
        logsBody.innerHTML = logsHTML;
    } catch (error) {
        console.error("Logs Fetch Error:", error);
        logsBody.innerHTML = `<tr><td colspan="5" class="table-status-error">Server connection failed.</td></tr>`;
    }
}


/* ==========================================================================
   SECTION 12: ADMIN SETTINGS & SYSTEM INITIALIZATION (সেটিংস ও সিস্টেম বুট)
   ========================================================================== */

/**
 * ১২.১: অ্যাডমিন প্রোফাইল পিকচার লাইভ প্রিভিউ ও সার্ভারে আপলোড
 * @param {Event} event - ফাইল ইনপুট ইভেন্ট
 */
window.uploadAdminProfilePic = async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    // লোকাল প্রিভিউ দেখানো
    const reader = new FileReader();
    reader.onload = function(e) {
        const profileImg = document.getElementById('adminProfileImg');
        const headerImg = document.getElementById('headerProfileImg');
        if (profileImg) profileImg.src = e.target.result;
        if (headerImg) headerImg.src = e.target.result;
    };
    reader.readAsDataURL(file);

    // সার্ভারে আপলোড করার লজিক
    const formData = new FormData();
    formData.append('profilePicture', file);

    try {
        const res = await fetch('/api/admin/profile-picture', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const result = await res.json();
        
        if (result.success) {
            showToast("Profile picture updated successfully!", "success");
            // লোকাল স্টোরেজে সেভ করে রাখা যাতে রিলোড দিলেও থাকে
            localStorage.setItem('adminProfilePic', result.imageUrl); 
        } else {
            showToast("Failed to upload picture.", "error");
        }
    } catch (error) {
        showToast("Error uploading profile picture.", "error");
    }
};

/**
 * ১২.২: অ্যাডমিন লগআউট প্রসেস
 */
window.logout = function() {
    showCustomConfirm("Logout", "Are you sure you want to securely log out of the admin panel?", () => {
        localStorage.removeItem('adminToken');
        sessionStorage.clear();
        showToast("Logging out...", "info");
        setTimeout(() => {
            window.location.href = '/admin-login'; // লগইন পেজে রিডাইরেক্ট
        }, 1000);
    }, "danger");
};

/**
 * ১২.৩: সিস্টেম இனிশিয়ালাইজেশন (SYSTEM BOOT)
 * ড্যাশবোর্ড লোড হওয়ার সাথে সাথে এই ফাংশনটি রান করে পুরো সিস্টেম সচল করবে
 */
function initDashboard() {
    // ১. ড্যাশবোর্ডের ডেট আপডেট করা
    updateDashboardDate();

    // ২. লোকাল স্টোরেজ থেকে প্রোফাইল পিকচার সেট করা (যদি আগে থেকে থাকে)
    const savedPic = localStorage.getItem('adminProfilePic');
    if (savedPic) {
        const profileImg = document.getElementById('adminProfileImg');
        const headerImg = document.getElementById('headerProfileImg');
        if (profileImg) profileImg.src = savedPic;
        if (headerImg) headerImg.src = savedPic;
    }

    // ৩. কোর মডিউলগুলোর ডাটা সার্ভার থেকে সিঙ্ক করা
    fetchDashboardData();   // ওভারভিউ এবং কাস্টমার ডাটা
    fetchLiveOrders();      // লাইভ অর্ডারস
    fetchLiveProducts();    // ম্যানেজ প্রোডাক্টস ডাটা
    fetchSecurityLogs();    // সিকিউরিটি লগস
}

/* ==========================================================================
   EVENT LISTENERS & LIFECYCLE HOOKS
   ========================================================================== */

// DOM সম্পূর্ণ লোড হওয়ার পর সিস্টেম বুট করা
document.addEventListener('DOMContentLoaded', () => {
    initDashboard();

    // সেটিংস প্যানেলের প্রোফাইল আপলোড ইভেন্ট লিসেনার বাইন্ড করা
    const profileUploadInput = document.getElementById('adminProfileUpload');
    if (profileUploadInput) {
        profileUploadInput.addEventListener('change', uploadAdminProfilePic);
    }
});





/* ==========================================================================
   SECTION 13: SIDEBAR NAVIGATION (মেনু ট্যাব কন্ট্রোলার)
   ========================================================================== */

function setupSidebarNavigation() {
    // HTML এর সাইডবার মেনু এবং মেইন সেকশনগুলো সিলেক্ট করা হচ্ছে
    const menuItems = document.querySelectorAll('.sidebar-menu ul li');
    const sections = document.querySelectorAll('.admin-section');

    menuItems.forEach(menu => {
        menu.addEventListener('click', function() {
            // ১. সব মেনু থেকে active ক্লাস রিমুভ করা
            menuItems.forEach(item => item.classList.remove('active'));
            // ২. যেটিতে ক্লিক করা হয়েছে সেটিতে active ক্লাস যোগ করা
            this.classList.add('active');

            // ৩. সব সেকশন হাইড করা
            sections.forEach(section => {
                section.style.display = 'none';
                section.classList.remove('active');
            });

            // ৪. আপনার HTML এর data-target অনুযায়ী নির্দিষ্ট সেকশন শো করা
            const targetId = this.getAttribute('data-target');
            const targetSection = document.getElementById(targetId);

            if (targetSection) {
                targetSection.style.display = 'block';
                targetSection.classList.add('active');

                // ৫. পেজ পরিবর্তনের সাথে সাথে ওই পেজের ডাটা অটোমেটিক রিফ্রেশ করা
                if (targetId === 'view-orders' && typeof fetchLiveOrders === 'function') {
                    fetchLiveOrders();
                } else if (targetId === 'view-manage-products' && typeof fetchLiveProducts === 'function') {
                    fetchLiveProducts();
                } else if (targetId === 'view-customers' && typeof fetchDashboardData === 'function') {
                    fetchDashboardData();
                }
            }
        });
    });
}

/* ==========================================================================
   SECTION 14: GLOBAL SEARCH BAR (টপ হেডারের সার্চ ইঞ্জিন)
   ========================================================================== */

function setupGlobalSearch() {
    // আপনার HTML এর সার্চ ইনপুট ID 'adminSearchInput'
    const globalSearchInput = document.getElementById('adminSearchInput'); 

    if (globalSearchInput) {
        globalSearchInput.addEventListener('input', function(e) {
            const query = e.target.value.toLowerCase().trim();

            // বর্তমানে স্ক্রিনে কোন সেকশনটি ওপেন আছে তা খুঁজে বের করা
            const activeSection = document.querySelector('.admin-section[style*="display: block"]') || document.querySelector('.admin-section.active');

            if (!activeSection) return;

            // যদি Live Orders পেজে থাকেন
            if (activeSection.id === 'view-orders') {
                const orderSearch = document.getElementById('orderSearchInput');
                if (orderSearch) {
                    orderSearch.value = query;
                    if (typeof filterAndRenderOrders === 'function') filterAndRenderOrders();
                }
            } 
            // যদি Manage Products পেজে থাকেন
            else if (activeSection.id === 'view-manage-products') {
                const productSearch = document.getElementById('searchProduct');
                if (productSearch) {
                    productSearch.value = query;
                    if (typeof filterAndRenderProducts === 'function') filterAndRenderProducts();
                }
            }
        });
    }
}

/* ==========================================================================
   SECTION 15: SYNC DATA BUTTON (টপ হেডারের সিঙ্ক/রিফ্রেশ বাটন)
   ========================================================================== */

function setupSyncButton() {
    // আপনার HTML এর সিঙ্ক বাটনের ID 'refreshDataBtn'
    const syncBtn = document.getElementById('refreshDataBtn'); 

    if (syncBtn) {
        syncBtn.addEventListener('click', async function() {
            const icon = this.querySelector('i');
            if (icon) icon.classList.add('fa-spin'); // বাটন ক্লিক করলে আইকন ঘুরবে

            if (typeof showToast === 'function') showToast("Syncing all live data...", "info");

            try {
                // সবকটি ফেচ ফাংশন একসাথে কল করে ডাটা আপডেট করা
                if (typeof fetchDashboardData === 'function') await fetchDashboardData();
                if (typeof fetchLiveOrders === 'function') await fetchLiveOrders();
                if (typeof fetchLiveProducts === 'function') await fetchLiveProducts();
                
                if (typeof showToast === 'function') showToast("System Synced Successfully! 🎉", "success");
            } catch (error) {
                console.error("Sync Error:", error);
                if (typeof showToast === 'function') showToast("Sync failed. Check connection.", "error");
            } finally {
                if (icon) icon.classList.remove('fa-spin'); // ডাটা আসা শেষ হলে আইকন ঘোরা বন্ধ হবে
            }
        });
    }
}

/* ==========================================================================
   SYSTEM INITIALIZATION (সব কন্ট্রোলার একসাথে চালু করা)
   ========================================================================== */

// পেজ সম্পূর্ণ লোড হওয়ার পর আমাদের নতুন কন্ট্রোলারগুলো চালু হবে
document.addEventListener('DOMContentLoaded', () => {
    setupSidebarNavigation();
    setupGlobalSearch();
    setupSyncButton();
});



/* ==========================================================================
   SECTION 17: Logout
   ========================================================================== */

// লগআউট হ্যান্ডলার
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        // ১. লোকাল স্টোরেজ থেকে টোকেন মুছে ফেলা
        localStorage.removeItem('adminToken');
        
        // ২. ইউজারের সেশন শেষ করার মেসেজ দেখানো
        showToast("Logging out...", "info");

        // ৩. লগইন পেজে রিডাইরেক্ট করা
        setTimeout(() => {
            window.location.replace("/admin-login");
        }, 1000);
    });
}




// =========================================================================
// SECTION 18: 🌟 ADMIN PROFILE PICTURE & AUTO-REFRESH MANAGEMENT SYSTEM 🌟
// =========================================================================

/**
 * ১. ডাটাবেজ থেকে অ্যাডমিন প্রোফাইল ছবি লোড করার ফাংশন
 * পেজ যখনই রিফ্রেশ বা নতুন করে লোড হবে, এই ফাংশনটি ডাটাবেজ থেকে লেটেস্ট ছবি এনে দেখাবে।
 */
async function fetchAdminProfile() {
    try {
        const token = localStorage.getItem('adminToken');
        
        const response = await fetch('/api/admin/profile', {
            method: 'GET',
            headers: { 
                'Authorization': `Bearer ${token}` 
            }
        });
        
        const data = await response.json();
        
        // ডাটাবেজে ছবি পাওয়া গেলে তা ড্যাশবোর্ডের img ট্যাগে সেট করবে
        if (data.success && data.image) {
            const profilePic = document.getElementById('adminProfilePic');
            if (profilePic) {
                profilePic.src = data.image;
            }
        }
    } catch (error) {
        console.error("🔴 The profile image could not be fetched from the database :", error);
    }
}

// পেজ রিফ্রেশ বা প্রথমবার লোড হওয়ার সাথে সাথে ছবি লোড করার ইভেন্ট অ্যাক্টিভ করা
document.addEventListener('DOMContentLoaded', fetchAdminProfile);


/**
 * ২. প্রোফাইল পিকচার ইনপুট চেঞ্জ এবং ক্লাউডিনারি আপলোড হ্যান্ডলার
 * ইনপুট ফিল্ডে নতুন ছবি সিলেক্ট করলেই তা সরাসরি ক্লাউডিনারি ও ডাটাবেজে সেভ হবে।
 */
const profileUploadInput = document.getElementById('profileUploadInput');
const adminProfilePic = document.getElementById('adminProfilePic');

if (profileUploadInput) {
    profileUploadInput.addEventListener('change', async function(e) {
        const file = e.target.files[0];
        if (!file) return;

        // ছবির ডাটা পাঠানোর জন্য FormData তৈরি
        const formData = new FormData();
        formData.append('profilePic', file);

        try {
            const token = localStorage.getItem('adminToken');
            
            // সার্ভারের আপলোড এপিআই এন্ডপয়েন্টে রিকোয়েস্ট পাঠানো
            const response = await fetch('/api/admin/update-profile-pic', {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}` 
                },
                body: formData // বডিতে ছবি পাঠানো হচ্ছে
            });

            const data = await response.json();
            
            if (data.success) {
                // আপলোড সফল হলে সাথে সাথে ড্যাশবোর্ডের ছবি পরিবর্তন হবে
                if (adminProfilePic) {
                    adminProfilePic.src = data.imageUrl;
                }
                showToast("Profile picture updated successfully!", "success");
            } else {
                showToast(data.message || "Failed to upload image", "error");
            }
        } catch (err) {
            console.error("🔴 Failed to upload image :", err);
            showToast("Error connecting to server", "error");
        }
    });
}





/*==========================================================================================================================*/

/*==========================================================================================================================*/



