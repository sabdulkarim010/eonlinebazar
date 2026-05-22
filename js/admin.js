/**
 * Project: EonlineBazar
 * Author: Abdul Karim Sheikh
 * File: js/admin.js
 * Description:
 */

/* ==================================================
   1. FIREBASE IMPORTS
================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, onValue, update, remove, push, set } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

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
const database = getDatabase(app);
const storage = getStorage(app);

/* ==================================================
   3. GLOBAL VARIABLES
================================================== */
const tableBody = document.getElementById('adminOrderTableBody');
let allOrders = {}; 

/* ==================================================
   4. CUSTOM PROFESSIONAL UI FUNCTIONS (TOAST & MODAL)
================================================== */

// Toast Notification System
window.showToast = function(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconClass = type === 'success' ? 'fa-circle-check' : 
                    type === 'error' ? 'fa-circle-xmark' : 'fa-triangle-exclamation';
    
    toast.innerHTML = `
        <i class="fa-solid ${iconClass}"></i>
        <span class="toast-message">${message}</span>
    `;
    
    container.appendChild(toast);

    // Auto remove after 3 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// Custom Confirmation Modal System
window.showCustomConfirm = function(title, message, onConfirm, type = 'warning') {
    const modal = document.getElementById('customConfirmModal');
    const titleEl = document.getElementById('confirmTitle');
    const messageEl = document.getElementById('confirmMessage');
    const iconBox = document.getElementById('confirmIconBox');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    const confirmBtn = document.getElementById('confirmSuccessBtn');

    titleEl.innerText = title;
    messageEl.innerText = message;
    
    iconBox.className = `confirm-icon-box ${type}`;
    iconBox.innerHTML = type === 'danger' ? '<i class="fa-solid fa-triangle-exclamation"></i>' : '<i class="fa-solid fa-circle-question"></i>';
    confirmBtn.className = type === 'danger' ? 'btn-confirm danger-action' : 'btn-confirm';

    modal.style.display = 'flex';

    // Remove old event listeners to prevent multiple triggers
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    newCancelBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    newConfirmBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        if(onConfirm) onConfirm();
    });
};

/* ==================================================
   5. AUTHENTICATION & LOGOUT LOGIC
================================================== */
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "admin-login.html";
    } else {
        fetchLiveOrders();
    }
});

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        showCustomConfirm(
            "Logout Confirmation", 
            "Are you sure you want to securely log out from the admin panel?", 
            () => {
                signOut(auth).then(() => {
                    window.location.href = "admin-login.html";
                }).catch((error) => {
                    showToast("Logout failed: " + error.message, "error");
                });
            }, 
            "warning"
        );
    });
}

/* ==================================================
   6. UI & TAB SWITCHING LOGIC
================================================== */
window.switchTab = function(sectionId, element) {
    document.querySelectorAll('.admin-section').forEach(section => section.classList.remove('active'));
    document.querySelectorAll('.sidebar-menu li').forEach(li => li.classList.remove('active'));
    
    document.getElementById(sectionId).classList.add('active');
    element.classList.add('active');
    
    document.getElementById('page-title').innerText = element.querySelector('span').innerText.trim();
};

window.previewImage = function(event) {
    const previewBox = document.getElementById('imgPreviewBox');
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function() {
            previewBox.innerHTML = `<img src="${reader.result}" alt="Preview" style="max-width: 100%; max-height: 120px; border-radius: 8px; border: 2px solid #e2e8f0;">`;
        }
        reader.readAsDataURL(file);
    }
};

/* ==================================================
   7. FETCH LIVE ORDERS FROM DATABASE
================================================== */
function fetchLiveOrders() {
    const ordersRef = ref(database, 'orders');
    onValue(ordersRef, (snapshot) => {
        if(tableBody) tableBody.innerHTML = ''; 
        allOrders = {}; 

        if (snapshot.exists()) {
            snapshot.forEach((childSnapshot) => {
                const orderId = childSnapshot.key;
                const order = childSnapshot.val();
                allOrders[orderId] = order; 
                
                let itemsList = '';
                if(order.items) {
                    order.items.forEach(item => {
                        itemsList += `<li style="font-size:12px; margin-bottom:4px;"><i class="fa-solid fa-check" style="color:#10b981; font-size:10px; margin-right:4px;"></i>${item.name} (Qty: ${item.quantity})</li>`;
                    });
                }

                // 🌟 ডাটাবেজ থেকে আমাদের তৈরি করা আইডিটি নেওয়া হচ্ছে
                const displayOrderId = order.orderId ? order.orderId : `#${orderId.substring(orderId.length - 6).toUpperCase()}`;

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><span style="background:#eff6ff; color:#2563eb; padding:4px 8px; border-radius:4px; font-weight:600; font-size:12px;">${displayOrderId}</span></td>
                    <td><b>${order.customerName}</b><br><span style="color:#64748b; font-size:12px;"><i class="fa-solid fa-phone"></i> ${order.customerPhone}</span></td>
                    <td style="max-width: 200px; line-height: 1.4;">${order.customerAddress}</td>
                    <td><ul style="list-style:none; padding:0; margin:0;">${itemsList}</ul></td>
                    <td><b style="color:#10b981;">৳ ${order.totalAmount}</b></td>
                    <td>
                        <select onchange="changeOrderStatus('${orderId}', this.value)" style="border: 1px solid #e2e8f0; color: #475569;">
                            <option value="Pending" ${order.status === 'Pending' ? 'selected' : ''}>Pending</option>
                            <option value="Processing" ${order.status === 'Processing' ? 'selected' : ''}>Processing</option>
                            <option value="Shipped" ${order.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
                            <option value="Delivered" ${order.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                        </select>
                    </td>
                    <td>
                        <div class="action-btn-group">
                            <button onclick="viewInvoice('${orderId}')" class="btn-view" title="View Invoice"><i class="fa-solid fa-eye"></i></button>
                            <button onclick="deleteOrder('${orderId}')" class="btn-delete" title="Delete Order"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </td>
                `;
                if(tableBody) tableBody.appendChild(tr);
            });
        } else {
            if(tableBody) {
                tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="loading-container">
                        <i class="fa-solid fa-folder-open" style="font-size: 40px; color: #cbd5e1; margin-bottom: 12px;"></i>
                        <p>No active orders found.</p>
                    </td>
                </tr>`;
            }
        }
    });
}

/* ==================================================
   8. ORDER ACTIONS (STATUS, DELETE, INVOICE)
================================================== */
window.changeOrderStatus = function(orderId, newStatus) {
    const specificOrderRef = ref(database, 'orders/' + orderId);
    update(specificOrderRef, { status: newStatus })
    .then(() => {
        showToast(`Order status updated to ${newStatus}!`, 'success');
    })
    .catch((error) => {
        showToast("Error updating status!", 'error');
    });
};

window.deleteOrder = function(orderId) {
    showCustomConfirm(
        "Delete Order", 
        "Are you sure you want to permanently delete this order? This action cannot be undone.", 
        () => {
            remove(ref(database, 'orders/' + orderId)).then(() => {
                showToast("Order deleted successfully!", "success");
            }).catch(err => {
                showToast("Failed to delete order.", "error");
            });
        }, 
        "danger"
    );
};

// js/admin.js ফাইলের ৮ নং সেকশনের ইনভয়েস ফাংশন
window.viewInvoice = function(orderId) {
    const order = allOrders[orderId]; 
    const modal = document.getElementById('invoiceModal');
    const content = document.getElementById('invoiceContent');

    if (order) {
        let itemsHTML = '';
        if(order.items) {
            order.items.forEach(item => {
                itemsHTML += `
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:14px; border-bottom:1px dashed #e2e8f0; padding-bottom:4px;">
                        <span>${item.name} (x${item.quantity})</span>
                        <b>৳ ${item.price * item.quantity}</b>
                    </div>
                `;
            });
        }

        // 🌟 ইনভয়েসের ভেতরে সঠিক আইডিটি দেখানোর কোড
        const displayOrderId = order.orderId ? order.orderId : '#' + orderId.substring(orderId.length - 6).toUpperCase();

        content.innerHTML = `
            <div style="text-align:center; margin-bottom:24px;">
                <h2 style="color:#2563eb; font-weight:700; margin-bottom:4px;">eOnlineBazar</h2>
                <p style="color:#64748b; font-size:14px;">Official Invoice</p>
            </div>
            
            <div style="background:#f8fafc; padding:16px; border-radius:8px; margin-bottom:20px;">
                <p style="margin-bottom:6px; font-size:14px;"><b>Order ID:</b> <span style="float:right; font-weight:bold; color:#2563eb;">${displayOrderId}</span></p>
                <p style="margin-bottom:6px; font-size:14px;"><b>Customer:</b> <span style="float:right;">${order.customerName}</span></p>
                <p style="margin-bottom:6px; font-size:14px;"><b>Phone:</b> <span style="float:right;">${order.customerPhone}</span></p>
                <p style="margin-bottom:0; font-size:14px;"><b>Address:</b> <span style="float:right; text-align:right; max-width:60%;">${order.customerAddress}</span></p>
            </div>

            <div style="margin-bottom:20px;">
                <h4 style="margin-bottom:12px; color:#475569; font-size:14px; text-transform:uppercase;">Order Details</h4>
                ${itemsHTML}
            </div>

            <div style="display:flex; justify-content:space-between; background:#eff6ff; padding:16px; border-radius:8px; border:1px solid #bfdbfe;">
                <span style="font-weight:600; color:#1e293b;">Total Amount</span>
                <b style="color:#2563eb; font-size:18px;">৳ ${order.totalAmount}</b>
            </div>
        `;
        modal.style.display = 'flex'; 
    } else {
        showToast("Order details not found!", "error");
    }
};

/* ==================================================
   9. PRODUCT UPLOAD LOGIC (STORAGE & DATABASE)
================================================== */
window.uploadProduct = async function() {
    const name = document.getElementById('prodName').value;
    const price = document.getElementById('prodPrice').value;
    const emoji = document.getElementById('prodEmoji').value;
    const file = document.getElementById('prodImageFile').files[0];

    if (!name || !price || !file) {
        showToast("Please fill all the details and select an image!", "warning");
        return;
    }

    // Show processing toast
    showToast("Uploading product... please wait.", "info");

    const imgRef = storageRef(storage, 'products/' + Date.now() + '_' + file.name);
    
    try {
        const snapshot = await uploadBytes(imgRef, file);
        const imageUrl = await getDownloadURL(snapshot.ref);

        const prodRef = push(ref(database, 'products'));
        await set(prodRef, {
            name: name,
            price: price,
            emoji: emoji,
            image: imageUrl,
            timestamp: Date.now()
        });

        showToast("Success! Product uploaded to Cloud Database.", "success");
        
        // Reset form completely
        document.getElementById('addProductForm').reset();
        document.getElementById('imgPreviewBox').innerHTML = `
            <i class="fa-solid fa-cloud-arrow-up cloud-icon"></i>
            <p class="no-image-text">Drag & drop or click to upload image</p>
        `;
        
    } catch (error) {
        console.error("Upload failed:", error);
        showToast("Failed to upload the product!", "error");
    }
};



