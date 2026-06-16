/*********************************************************************************
 * Project     : EOnlineBazar
 * File        : order-details.js
 * Location    : js/order-details.js
 * Author      : Abdul Karim Sheikh
 * Description : API থেকে অর্ডারের বিস্তারিত তথ্য ফেচ এবং ডাইনামিক রেন্ডারিং পরিচালনা করে।
 * ডেলিভারি স্ট্যাটাসের ওপর ভিত্তি করে 'Track Order' বা 'Review/Edit' 
 * বাটন নিয়ন্ত্রণ করে। এছাড়াও, প্রোডাক্টের ছবি প্রদর্শন এবং ইউজারের 
 * পূর্ববর্তী রিভিউ থাকলে তা মডালে লোড করে এডিট করার সুবিধা প্রদান করে।
 *********************************************************************************/

document.addEventListener('DOMContentLoaded', () => {
    
    // =========================================================
    // 🌟 SECTION 1: GLOBAL VARIABLES & DOM ELEMENTS
    // =========================================================
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('id');
    const token = localStorage.getItem('token');
    
    // লোকাল স্টোরেজ থেকে ইউজারের ইনফরমেশন নেওয়া 
    const userInfoString = localStorage.getItem('userInfo') || localStorage.getItem('user');
    const userInfo = userInfoString ? JSON.parse(userInfoString) : null;

    // সমস্ত DOM এলিমেন্ট 
    const elements = {
        loadingSpinner: document.getElementById('loading-spinner'),
        orderContent: document.getElementById('order-content'),
        trackBtn: document.getElementById('track-order-btn'),
        itemsContainer: document.getElementById('order-items-container'),
        
        // মডাল এলিমেন্টস
        modal: document.getElementById('review-modal'),
        closeBtn: document.getElementById('close-review-modal'),
        modalTitle: document.getElementById('review-modal-title'),
        stars: document.querySelectorAll('.star-item'),
        commentInput: document.getElementById('review-comment'),
        photoInput: document.getElementById('review-photo'),
        submitBtn: document.getElementById('submit-review-btn'),
        uploadContainer: document.querySelector('.file-upload-container')
    };

    let currentReviewProductId = null;
    let selectedRating = 5; // ডিফল্ট রেটিং

    // =========================================================
    // 🌟 SECTION 2: INITIAL CHECK
    // =========================================================
    if (!token) {
        showError('Please login to view order details.');
        return;
    }
    if (!orderId) {
        showError('Invalid Order ID.');
        return;
    }

    function showError(message) {
        if (elements.loadingSpinner) {
            elements.loadingSpinner.innerHTML = `<span style="color: var(--danger); font-weight: 600;"><i class="fa-solid fa-triangle-exclamation"></i> ${message}</span>`;
        }
    }

    // =========================================================
    // 🌟 SECTION 3: FETCH & RENDER ORDER DATA
    // =========================================================
    async function fetchOrderDetails() {
        try {
            const response = await fetch(`/api/orders/${orderId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const rawData = await response.json();

            if (response.ok) {
                const order = rawData.order || rawData.data || rawData;
                renderOrderDetails(order);
            } else {
                showError(rawData.message || 'Order not found');
            }
        } catch (error) {
            console.error("Fetch Order Error:", error);
            showError('Unable to connect to the server. Please check your network connection.');
        } finally {
            if (elements.loadingSpinner) elements.loadingSpinner.classList.add('hidden');
        }
    }

    function renderOrderDetails(order) {
        // বেসিক ইনফরমেশন
        const displayId = order.orderId || (order._id ? order._id.substring(order._id.length - 6).toUpperCase() : orderId);
        document.getElementById('order-id-display').textContent = `#${displayId}`;
        
        const orderDate = new Date(order.createdAt || Date.now()).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        document.getElementById('order-date').textContent = orderDate;

        // স্ট্যাটাস ও Track Order বাটন লজিক
        const status = (order.status || 'pending').toLowerCase();
        const statusEl = document.getElementById('order-status');
        if (statusEl) {
            statusEl.textContent = status;
            statusEl.className = `status-badge ${status}`;
        }

        if (elements.trackBtn) {
            if (status !== 'delivered') {
                elements.trackBtn.classList.remove('hidden');
                elements.trackBtn.href = `/order-track.html?id=${order._id || orderId}`;
            } else {
                elements.trackBtn.classList.add('hidden'); 
            }
        }

        // কাস্টমার ইনফরমেশন
        document.getElementById('customer-name').textContent = order.customerName || userInfo?.name || 'N/A';
        document.getElementById('customer-phone').textContent = order.customerPhone || 'N/A';
        document.getElementById('shipping-address').textContent = order.customerAddress || 'N/A';

        // অর্ডার আইটেম ও প্রোডাক্ট ইমেজ রেন্ডার
        if (elements.itemsContainer) {
            elements.itemsContainer.innerHTML = ''; 
            let subtotal = 0;
            const items = order.items || order.products || [];

            if (items.length === 0) {
                elements.itemsContainer.innerHTML = '<tr><td colspan="4" class="text-center">No items found.</td></tr>';
            } else {
                items.forEach(item => {
                    const price = item.price || 0;
                    const qty = item.quantity || 1;
                    const itemTotal = price * qty;
                    subtotal += itemTotal;
                    
                    const targetId = item.id || item.productId || item._id;
                    const targetName = item.name || item.product?.name || 'Product';

                    // Review/Edit বাটন
                    let actionButtonHTML = '';
                    if (status === 'delivered') {
                        actionButtonHTML = `<button onclick="window.openReviewModal('${targetId}', '${targetName}')" class="btn-review-table"><i class="fa-solid fa-pen-to-square"></i> Review / Edit</button>`;
                    }

                    // প্রোডাক্ট ইমেজ রেন্ডারিং
                    const imageHtml = item.image 
                        ? `<img src="${item.image}" alt="${targetName}" style="width: 45px; height: 45px; object-fit: cover; border-radius: 6px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">` 
                        : `<div style="width: 45px; height: 45px; background: #e2e8f0; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #64748b;">No Img</div>`;

                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>
                            <div style="display: flex; align-items: center; gap: 12px;">
                                ${imageHtml}
                                <div style="display: flex; flex-direction: column; align-items: flex-start;">
                                    <span style="font-weight: 500;">${targetName}</span>
                                    ${actionButtonHTML}
                                </div>
                            </div>
                        </td>
                        <td>৳${price}</td>
                        <td>${qty}</td>
                        <td style="font-weight: 600;">৳${itemTotal}</td>
                    `;
                    elements.itemsContainer.appendChild(row);
                });
            }

            const shippingFee = order.shippingFee || order.deliveryCharge || 0;
            const totalAmount = order.totalAmount || (subtotal + shippingFee);

            document.getElementById('subtotal-amount').textContent = `৳${subtotal}`;
            document.getElementById('shipping-fee').textContent = `৳${shippingFee}`;
            document.getElementById('total-amount').textContent = `৳${totalAmount}`;
        }

        if (elements.orderContent) elements.orderContent.classList.remove('hidden');
    }

// =========================================================
    // 🌟 SECTION 4: MODAL & REVIEW SUBMIT LOGIC
    // =========================================================
    function setupModalEvents() {
        if (!elements.modal) return;

        elements.closeBtn.onclick = () => {
            elements.modal.classList.add('hidden');
            removePreviewImage(); 
        };

        window.onclick = (event) => {
            if (event.target === elements.modal) {
                elements.modal.classList.add('hidden');
                removePreviewImage();
            }
        };

        elements.stars.forEach(star => {
            star.onclick = (e) => {
                selectedRating = parseInt(e.target.getAttribute('data-value'));
                updateStarsUI(selectedRating);
            };
        });

        elements.submitBtn.onclick = async () => {
            const comment = elements.commentInput.value.trim();
            if (!comment) {
                // খালি কমেন্ট দিলে প্রফেশনাল ওয়ার্নিং
                Swal.fire({
                    icon: 'warning',
                    title: 'Oops...',
                    text: 'Please provide a comment to submit your review.',
                    confirmButtonColor: '#198754'
                });
                return;
            }

            const formData = new FormData();
            formData.append('orderId', orderId);
            formData.append('productId', currentReviewProductId);
            formData.append('rating', selectedRating);
            formData.append('comment', comment);
            
            if (elements.photoInput.files.length > 0) {
                formData.append('photo', elements.photoInput.files[0]);
            }

            elements.submitBtn.textContent = 'Submitting...';
            elements.submitBtn.disabled = true;

            try {
                const response = await fetch('/api/reviews', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });

                const result = await response.json();

                // 🌟 UX Fix: অ্যালার্ট আসার আগেই বাটনের স্ট্যাটাস রিসেট
                elements.submitBtn.textContent = 'Submit Review';
                elements.submitBtn.disabled = false;

                if (response.ok) {
                    // সফল হলে SweetAlert2 সাকসেস মেসেজ
                    Swal.fire({
                        title: 'Success!',
                        text: result.message || 'Your review has been submitted successfully!',
                        icon: 'success',
                        confirmButtonText: 'OK',
                        confirmButtonColor: '#198754'
                    }).then((swalResult) => {
                        if (swalResult.isConfirmed) {
                            // OK তে ক্লিক করলে মডাল বন্ধ হবে এবং ডাটা রিফ্রেশ হবে
                            elements.modal.classList.add('hidden');
                            removePreviewImage();
                            fetchOrderDetails(); 
                        }
                    });
                } else {
                    // API থেকে কোনো এরর আসলে SweetAlert2 এরর মেসেজ
                    Swal.fire({
                        icon: 'error',
                        title: 'Submission Failed',
                        text: result.message,
                        confirmButtonColor: '#d33' // লাল রঙের বাটন
                    });
                }
            } catch (error) {
                console.error("Submit Error:", error);
                elements.submitBtn.textContent = 'Submit Review';
                elements.submitBtn.disabled = false;
                
                // নেটওয়ার্ক বা অন্য কোনো সমস্যা হলে SweetAlert2 এরর মেসেজ
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'An error occurred while submitting your review. Please try again later.',
                    confirmButtonColor: '#d33'
                });
            }
        };
    }

    function updateStarsUI(rating) {
        elements.stars.forEach(s => {
            if (parseInt(s.getAttribute('data-value')) <= rating) {
                s.classList.add('active');
            } else {
                s.classList.remove('active');
            }
        });
    }

    function removePreviewImage() {
        const oldPreview = document.getElementById('existing-photo-preview');
        if (oldPreview) oldPreview.remove();
        if (elements.photoInput) elements.photoInput.value = ''; 
    }

    // =========================================================
    // 🌟 SECTION 5: FETCH PREVIOUS REVIEW & LOAD INTO MODAL
    // =========================================================
    window.openReviewModal = async (productId, productName) => {
        currentReviewProductId = productId;
        elements.modalTitle.textContent = `Review: ${productName}`;
        elements.commentInput.value = '';
        removePreviewImage();
        
        selectedRating = 5; 
        updateStarsUI(5);
        elements.submitBtn.textContent = 'Submit Review';
        elements.modal.classList.remove('hidden');

        try {
            elements.commentInput.placeholder = "Loading previous review data...";
            
            const currentUserId = userInfo ? (userInfo._id || userInfo.id) : '';
            const fetchUrl = `/api/reviews/${productId}?orderId=${orderId}&userId=${currentUserId}`;
            
            const response = await fetch(fetchUrl);
            const data = await response.json();

            if (data.success && data.reviews && data.reviews.length > 0) {
                // 🌟 Bug Fix Safeguard: অ্যারে থেকে নিখুঁতভাবে এই নির্দিষ্ট প্রোডাক্টের রিভিউটি খুঁজে নেওয়া হচ্ছে
                const myReview = data.reviews.find(r => 
                    (r.productId && r.productId.toString() === productId.toString()) || 
                    (r.product && r.product.toString() === productId.toString())
                ) || data.reviews[0]; 

                if (myReview) {
                    elements.commentInput.value = myReview.comment || '';
                    selectedRating = myReview.rating || 5;
                    updateStarsUI(selectedRating);
                    elements.submitBtn.textContent = 'Update Review';

                    if (myReview.photo) {
                        const previewHtml = `
                            <div id="existing-photo-preview">
                                <span>Your Previously Uploaded Photo:</span>
                                <img src="${myReview.photo}" alt="Previous Review Photo">
                            </div>
                        `;
                        elements.uploadContainer.insertAdjacentHTML('beforeend', previewHtml);
                    }
                }
            }
        } catch (err) {
            console.error("Error fetching existing review:", err);
        } finally {
            // যদি কোনো পূর্ববর্তী রিভিউ না থাকে, তাহলে ডিফল্ট প্লেসহোল্ডার সেট হবে
            if (!elements.commentInput.value) {
                elements.commentInput.placeholder = "Share your experience with this product...";
            }
        }
    };

    // =========================================================
    // 🌟 SECTION 6: INITIALIZATION
    // =========================================================
    setupModalEvents();
    fetchOrderDetails();
});




