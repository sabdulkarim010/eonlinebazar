document.addEventListener('DOMContentLoaded', () => {
    // URL থেকে Order ID বের করা
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('id');

    // DOM এলিমেন্টগুলো সিলেক্ট করা
    const loadingSpinner = document.getElementById('loading-spinner');
    const orderContent = document.getElementById('order-content');
    
    // টোকেন চেক করা (ইউজার লগইন করা আছে কি না)
    const token = localStorage.getItem('token');
    if (!token) {
        loadingSpinner.innerHTML = '<span style="color: red;"><i class="fa-solid fa-triangle-exclamation"></i> Please login to view order details.</span>';
        return;
    }

    // যদি URL এ কোনো ID না থাকে
    if (!orderId) {
        loadingSpinner.innerHTML = '<span style="color: red;"><i class="fa-solid fa-triangle-exclamation"></i> Invalid Order ID.</span>';
        return;
    }

    // ডাটা ফেচ করার ফাংশন
    async function fetchOrderDetails() {
        try {
            // আপনার ব্যাকএন্ডের রাউট অনুযায়ী API URL দিন (সাধারণত /api/orders/:id হয়)
            const response = await fetch(`/api/orders/${orderId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const rawData = await response.json();

            if (response.ok) {
                // ব্যাকএন্ড থেকে আসা ডাটার স্ট্রাকচার অনুযায়ী ভেরিয়েবল সেট করা (data.order বা শুধু data হতে পারে)
                const order = rawData.order || rawData.data || rawData;
                renderOrderDetails(order);

                // লোডিং স্পিনার হাইড করে মূল কন্টেন্ট শো করা
                loadingSpinner.classList.add('hidden');
                orderContent.classList.remove('hidden');
            } else {
                loadingSpinner.innerHTML = `<span style="color: var(--danger);"><i class="fa-solid fa-circle-exclamation"></i> Error: ${rawData.message || 'Order not found'}</span>`;
            }

        } catch (error) {
            console.error("Error fetching order details:", error);
            loadingSpinner.innerHTML = '<span style="color: var(--danger);"><i class="fa-solid fa-wifi"></i> Connection error. Please check your internet or server.</span>';
        }
    }

    // ডাটা HTML এ বসানোর ফাংশন
    function renderOrderDetails(order) {
        // ১. Order Info
        const displayId = order.orderId ? order.orderId : (order._id ? order._id.substring(order._id.length - 6).toUpperCase() : orderId);
        document.getElementById('order-id-display').textContent = `#${displayId}`;
        
        // Date Formatting
        const orderDate = new Date(order.createdAt || Date.now()).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        document.getElementById('order-date').textContent = orderDate;

        // Status 
        const statusEl = document.getElementById('order-status');
        const status = (order.status || 'Pending').toLowerCase();
        statusEl.textContent = status;
        statusEl.className = `status-badge ${status}`; // CSS ক্লাসের সাথে মেলানোর জন্য


        // ২. Customer & Shipping Info - এখানে সরাসরি ডাটাবেসের ফিল্ডের নামগুলো ব্যবহার করুন
        const name = order.customerName || 'N/A';
        const phone = order.customerPhone || 'N/A';
        const address = order.customerAddress || 'N/A';

        document.getElementById('customer-name').textContent = name;
        document.getElementById('customer-phone').textContent = phone;
        document.getElementById('shipping-address').textContent = address;



        // ৩. Order Items
        const itemsContainer = document.getElementById('order-items-container');
        itemsContainer.innerHTML = ''; // আগের কিছু থাকলে ক্লিয়ার করা
        
        let subtotal = 0;
        const items = order.items || order.products || [];

        if (items.length === 0) {
            itemsContainer.innerHTML = '<tr><td colspan="4" class="text-center">No items found in this order.</td></tr>';
        } else {
            items.forEach(item => {
                const price = item.price || 0;
                const qty = item.quantity || 1;
                const itemTotal = price * qty;
                subtotal += itemTotal;

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            ${item.image ? `<img src="${item.image}" alt="Product" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">` : ''}
                            <span>${item.name || item.product?.name || 'Unknown Product'}</span>
                        </div>
                    </td>
                    <td>৳${price}</td>
                    <td>${qty}</td>
                    <td style="font-weight: 600;">৳${itemTotal}</td>
                `;
                itemsContainer.appendChild(row);
            });
        }

        // ৪. Summary (হিসাব-নিকাশ)
        // যদি ব্যাকএন্ড থেকে সরাসরি totalAmount ও shippingFee আসে, তবে সেটিই দেখাবে। 
        // না থাকলে নিজে হিসাব করে নিবে।
        const shippingFee = order.shippingFee || order.deliveryCharge || 0;
        const totalAmount = order.totalAmount || (subtotal + shippingFee);

        document.getElementById('subtotal-amount').textContent = `৳${subtotal}`;
        document.getElementById('shipping-fee').textContent = `৳${shippingFee}`;
        document.getElementById('total-amount').textContent = `৳${totalAmount}`;
    }

    // ফাংশনটি কল করে ডাটা আনা শুরু করা
    fetchOrderDetails();
});



