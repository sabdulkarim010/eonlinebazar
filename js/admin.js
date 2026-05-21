import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, onValue, update, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// আপনার ফায়ারবেস কনফিগারেশন
const firebaseConfig = {
    apiKey: "AIzaSyAcw2t0eBtpk4eoljQqfSSjgOIdsJ4-Nko",
    authDomain: "eonlinebazar.firebaseapp.com",
    databaseURL: "https://eonlinebazar-default-rtdb.firebaseio.com",
    projectId: "eonlinebazar",
    storageBucket: "eonlinebazar.firebasestorage.app",
    messagingSenderId: "393136308453",
    appId: "1:393136308453:web:13e669af67b948844d40c"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const tableBody = document.getElementById('adminOrderTableBody');
let allOrders = {}; // সব অর্ডারের ডাটা এখানে জমা থাকবে

/* ==================================================
   ১. ট্যাব স্যুইচিং লজিক
================================================== */
window.switchTab = function(sectionId, element) {
    document.querySelectorAll('.admin-section').forEach(section => section.classList.remove('active'));
    document.querySelectorAll('.sidebar-menu li').forEach(li => li.classList.remove('active'));
    
    document.getElementById(sectionId).classList.add('active');
    element.classList.add('active');
    
    document.getElementById('page-title').innerText = element.innerText.trim();
};

/* ==================================================
   ২. ছবির প্রিভিউ লজিক
================================================== */
window.previewImage = function(event) {
    const previewBox = document.getElementById('imgPreviewBox');
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function() {
            previewBox.innerHTML = `<img src="${reader.result}" alt="Preview">`;
        }
        reader.readAsDataURL(file);
    }
};

/* ==================================================
   ৩. ফায়ারবেস থেকে লাইভ অর্ডার আনা
================================================== */
const ordersRef = ref(database, 'orders');
onValue(ordersRef, (snapshot) => {
    tableBody.innerHTML = ''; 
    allOrders = {}; // নতুন ডাটা আসার আগে আগেরগুলো ক্লিয়ার করুন

    if (snapshot.exists()) {
        snapshot.forEach((childSnapshot) => {
            const orderId = childSnapshot.key;
            const order = childSnapshot.val();
            allOrders[orderId] = order; // গ্লোবাল অবজেক্টে ডাটা সেভ করুন
            
            let itemsList = '';
            order.items.forEach(item => {
                itemsList += `<li style="font-size:13px;">${item.name} (Qty: ${item.quantity})</li>`;
            });

            let statusColor = order.status === 'Pending' ? '#ffc107' : 
                              order.status === 'Processing' ? '#17a2b8' : 
                              order.status === 'Shipped' ? '#007bff' : '#28a745';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><b>#${orderId.substring(orderId.length - 6).toUpperCase()}</b></td>
                <td><b>${order.customerName}</b><br><i class="fa-solid fa-phone"></i> ${order.customerPhone}</td>
                <td>${order.customerAddress}</td>
                <td><ul style="padding-left: 15px; margin: 0;">${itemsList}</ul></td>
                <td><b>৳ ${order.totalAmount}</b></td>
                <td>
                    <select onchange="changeOrderStatus('${orderId}', this.value)" id="status-${orderId}" style="padding: 5px; border-radius: 5px; border: 1px solid ${statusColor}; font-weight: bold;">
                        <option value="Pending" ${order.status === 'Pending' ? 'selected' : ''}>Pending</option>
                        <option value="Processing" ${order.status === 'Processing' ? 'selected' : ''}>Processing</option>
                        <option value="Shipped" ${order.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
                        <option value="Delivered" ${order.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                    </select>
                    <span id="msg-${orderId}" style="font-size: 10px; margin-left: 5px; color: #27ae60; font-weight: bold;"></span>
                </td>
                <td>
                    <button onclick="viewInvoice('${orderId}')" style="background: #28a745; color: white; padding: 6px 10px; border: none; border-radius: 4px; cursor: pointer; margin-bottom: 5px;"><i class="fa-solid fa-eye"></i></button>
                    <button onclick="deleteOrder('${orderId}')" style="background: #dc3545; color: white; padding: 6px 10px; border: none; border-radius: 4px; cursor: pointer;"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    } else {
        tableBody.innerHTML = `<tr><td colspan="7" class="loading-text">এখনো কোনো নতুন অর্ডার আসেনি!</td></tr>`;
    }
});

/* ==================================================
   ৪. অ্যাডমিন অ্যাকশন ফাংশনসমূহ
================================================== */
window.changeOrderStatus = function(orderId, newStatus) {
    const msgSpan = document.getElementById('msg-' + orderId);
    const specificOrderRef = ref(database, 'orders/' + orderId);
    
    msgSpan.innerText = "Updating...";
    
    update(specificOrderRef, { status: newStatus })
    .then(() => {
        msgSpan.innerText = "✓ Updated!";
        setTimeout(() => { msgSpan.innerText = ""; }, 2000);
    })
    .catch((error) => {
        msgSpan.innerText = "Error!";
        msgSpan.style.color = "red";
    });
};

window.deleteOrder = function(orderId) {
    if(confirm("আপনি কি নিশ্চিত যে এই অর্ডারটি মুছে ফেলতে চান?")) {
        remove(ref(database, 'orders/' + orderId));
    }
};

/* ==================================================
   ৫. ইনভয়েস পপ-আপ লজিক
================================================== */
window.viewInvoice = function(orderId) {
    const order = allOrders[orderId]; 
    const modal = document.getElementById('invoiceModal');
    const content = document.getElementById('invoiceContent');

    if (order) {
        content.innerHTML = `
            <h2 style="text-align:center;">Invoice</h2>
            <p><b>Order ID:</b> #${orderId.substring(orderId.length - 6).toUpperCase()}</p>
            <p><b>Customer:</b> ${order.customerName}</p>
            <p><b>Phone:</b> ${order.customerPhone}</p>
            <p><b>Address:</b> ${order.customerAddress}</p>
            <hr>
            <p><b>Total Payable:</b> ৳ ${order.totalAmount}</p>
        `;
        modal.style.display = 'flex'; 
    } else {
        alert("অর্ডারের তথ্য পাওয়া যায়নি!");
    }
};

/* ==================================================
   ৬. প্রোডাক্ট আপলোড লজিক (Firebase Storage + Database)
================================================== */
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { push, set } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const storage = getStorage(app);

window.uploadProduct = async function() {
    const name = document.getElementById('prodName').value;
    const price = document.getElementById('prodPrice').value;
    const emoji = document.getElementById('prodEmoji').value;
    const file = document.getElementById('prodImageFile').files[0];

    if (!name || !price || !file) {
        alert("দয়া করে সব তথ্য পূরণ করুন!");
        return;
    }

    // ১. স্টোরেজে ছবি আপলোড
    const imgRef = storageRef(storage, 'products/' + Date.now() + '_' + file.name);
    
    try {
        const snapshot = await uploadBytes(imgRef, file);
        const imageUrl = await getDownloadURL(snapshot.ref);

        // ২. ডাটাবেজে প্রোডাক্ট ডাটা সেভ
        const prodRef = push(ref(database, 'products'));
        await set(prodRef, {
            name: name,
            price: price,
            emoji: emoji,
            image: imageUrl,
            timestamp: Date.now()
        });

        alert("নতুন প্রোডাক্ট সফলভাবে আপলোড হয়েছে!");
        document.getElementById('addProductForm').reset();
        document.getElementById('imgPreviewBox').innerHTML = '<span class="no-image-text">No Image Chosen</span>';
        
    } catch (error) {
        console.error("আপলোডে সমস্যা হয়েছে:", error);
        alert("প্রোডাক্ট আপলোড করতে ব্যর্থ হয়েছে!");
    }
};