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
    // 🌟 SECTION 0: SMART BACK NAVIGATION (dashboard vs my orders)
    // =========================================================
    const urlParams = new URLSearchParams(window.location.search);
    const source = urlParams.get('from');
    const backBtn = document.getElementById('smart-back-btn');

    if (backBtn) {
        if (source === 'dashboard') {
            backBtn.textContent = '← Back to Dashboard';
            backBtn.href = '/profile?tab=dashboard';
            backBtn.setAttribute('aria-label', 'Back to Dashboard');
        } else if (source === 'orders') {
            backBtn.textContent = '← Back to My Orders';
            backBtn.href = '/profile?tab=orders';
            backBtn.setAttribute('aria-label', 'Back to My Orders');
        } else if (document.referrer && document.referrer.includes('tab=orders')) {
            backBtn.textContent = '← Back to My Orders';
            backBtn.href = '/profile?tab=orders';
            backBtn.setAttribute('aria-label', 'Back to My Orders');
        } else {
            backBtn.textContent = '← Back to Dashboard';
            backBtn.href = '/profile?tab=dashboard';
            backBtn.setAttribute('aria-label', 'Back to Dashboard');
        }
    }

    // =========================================================
    // 🌟 SECTION 1: GLOBAL VARIABLES & DOM ELEMENTS
    // =========================================================
    const orderId = urlParams.get('id');
    const token = localStorage.getItem('token');
    
    // লোকাল স্টোরেজ থেকে ইউজারের ইনফরমেশন নেওয়া 
    const userInfoString = localStorage.getItem('userInfo') || localStorage.getItem('user');
    const userInfo = userInfoString ? JSON.parse(userInfoString) : null;

    // সমস্ত DOM এলিমেন্ট 
    const elements = {
        loadingSpinner: document.getElementById('loading-spinner'),
        orderContent: document.getElementById('order-content'),
        actionBar: document.getElementById('order-action-bar'),
        trackBtn: document.getElementById('track-order-btn'),
        invoiceBtn: document.getElementById('download-invoice-btn'),
        supportChatBtn: document.getElementById('order-support-chat-btn'),
        cancelBtn: document.getElementById('order-cancel-btn'),
        returnBtn: document.getElementById('order-return-btn'),
        itemsContainer: document.getElementById('order-items-container'),

        orderActionModal: document.getElementById('order-action-modal'),
        orderActionForm: document.getElementById('order-action-form'),
        orderActionTitleText: document.getElementById('order-action-modal-title-text'),
        orderActionReasonSelect: document.getElementById('order-action-reason-select'),
        orderActionOtherGroup: document.getElementById('order-action-other-group'),
        orderActionOtherReason: document.getElementById('order-action-other-reason'),
        orderActionConfirmBtn: document.getElementById('order-action-confirm-btn'),
        closeOrderActionModalBtn: document.getElementById('close-order-action-modal'),
        orderActionCloseBtn: document.getElementById('order-action-close-btn'),
        
        // মডাল এলিমেন্টস
        modal: document.getElementById('review-modal'),
        closeBtn: document.getElementById('close-review-modal'),
        modalTitle: document.getElementById('review-modal-title'),
        stars: document.querySelectorAll('.star-item'),
        commentInput: document.getElementById('review-comment'),
        photoInput: document.getElementById('review-photo'),
        submitBtn: document.getElementById('submit-review-btn'),
        uploadContainer: document.querySelector('.file-upload-container'),

        paymentInfoCard: document.getElementById('payment-info-card'),
        paymentMethodName: document.getElementById('payment-method-name'),
        paymentStatusLabel: document.getElementById('payment-status-label'),
        paymentProofSection: document.getElementById('payment-proof-section'),
        paymentProofBadge: document.getElementById('payment-proof-badge'),
        paymentProofForm: document.getElementById('payment-proof-form'),
        paymentProofTrxInput: document.getElementById('payment-proof-trx-id'),
        paymentProofScreenshotInput: document.getElementById('payment-proof-screenshot'),
        paymentProofSubmitBtn: document.getElementById('payment-proof-submit-btn'),
        paymentProofRejectionNote: document.getElementById('payment-proof-rejection-note'),
        paymentProofSuccessMsg: document.getElementById('payment-proof-success-msg')
    };

    const ORDER_ACTION_REASONS = [
        { value: 'Changed my mind', label: 'Changed my mind' },
        { value: 'Ordered by mistake', label: 'Ordered by mistake' },
        { value: 'Delivery taking too long', label: 'Delivery taking too long' },
        { value: 'Defective product', label: 'Defective product' },
        { value: 'Other', label: 'Other (type your own reason)' }
    ];

    let pendingOrderAction = { orderId: null, action: null };

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

    let currentOrderMongoId = orderId;
    let currentDisplayOrderId = orderId;
    let currentOrderData = null;

    function showError(message) {
        if (elements.loadingSpinner) {
            elements.loadingSpinner.innerHTML = `<span style="color: var(--danger); font-weight: 600;"><i class="fa-solid fa-triangle-exclamation"></i> ${message}</span>`;
        }
    }

    function resolveOrderFinancials(order) {
        const subTotal = Number(order.subTotal ?? order.subtotal) || 0;
        const discountAmount = Number(order.discountAmount) || 0;
        const deliveryCharge = Number(order.deliveryCharge ?? order.shippingFee) || 0;
        const grandTotal = Number(order.grandTotal ?? order.totalAmount)
            || Math.max(0, subTotal - discountAmount + deliveryCharge);
        const shippingDistrict = order.shippingDistrict || '';
        const shippingLocationType = order.shippingLocationType
            || (order.deliveryLocationType === 'outside' ? 'Outside City' : 'Inside City');

        return { subTotal, discountAmount, deliveryCharge, grandTotal, shippingDistrict, shippingLocationType };
    }

    function getOrderDeliveryDate(order) {
        return order.deliveredAt || order.deliveryDate || order.updatedAt || null;
    }

    function isWithinReturnWindow(order) {
        if (String(order.status || '').toLowerCase() !== 'delivered') return false;

        const deliveryDate = getOrderDeliveryDate(order);
        if (!deliveryDate) return false;

        const delivered = new Date(deliveryDate);
        if (Number.isNaN(delivered.getTime())) return false;

        const diffMs = Date.now() - delivered.getTime();
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        return diffMs >= 0 && diffMs <= sevenDaysMs;
    }

    function populateOrderActionReasons() {
        if (!elements.orderActionReasonSelect) return;

        elements.orderActionReasonSelect.innerHTML = '<option value="">Choose a reason...</option>';
        ORDER_ACTION_REASONS.forEach(({ value, label }) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            elements.orderActionReasonSelect.appendChild(option);
        });
    }

    function toggleOrderActionOtherField() {
        if (!elements.orderActionReasonSelect || !elements.orderActionOtherGroup) return;
        const isOther = elements.orderActionReasonSelect.value === 'Other';
        elements.orderActionOtherGroup.classList.toggle('hidden', !isOther);
        elements.orderActionOtherGroup.setAttribute('aria-hidden', isOther ? 'false' : 'true');
        if (elements.orderActionOtherReason) {
            elements.orderActionOtherReason.required = isOther;
            if (!isOther) elements.orderActionOtherReason.value = '';
            else elements.orderActionOtherReason.focus();
        }
    }

    function resetOrderActionForm() {
        if (elements.orderActionForm) elements.orderActionForm.reset();
        toggleOrderActionOtherField();
        if (elements.orderActionConfirmBtn) {
            elements.orderActionConfirmBtn.disabled = false;
            elements.orderActionConfirmBtn.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i> Confirm';
            elements.orderActionConfirmBtn.classList.remove('btn-order-action-cancel-theme', 'btn-order-action-return-theme');
        }
    }

    function closeOrderActionModal() {
        if (elements.orderActionModal) elements.orderActionModal.classList.add('hidden');
        pendingOrderAction = { orderId: null, action: null };
        resetOrderActionForm();
    }

    function openOrderActionModal(actionType) {
        if (!elements.orderActionModal || !currentOrderMongoId || !actionType) return;

        pendingOrderAction = { orderId: currentOrderMongoId, action: actionType };
        resetOrderActionForm();
        populateOrderActionReasons();

        if (elements.orderActionTitleText) {
            elements.orderActionTitleText.textContent = actionType === 'return' ? 'Return Request' : 'Cancel Order';
        }
        if (elements.orderActionConfirmBtn) {
            elements.orderActionConfirmBtn.classList.add(
                actionType === 'return' ? 'btn-order-action-return-theme' : 'btn-order-action-cancel-theme'
            );
        }

        elements.orderActionModal.classList.remove('hidden');
        if (elements.orderActionReasonSelect) elements.orderActionReasonSelect.focus();
    }

    function resolveOrderActionReason() {
        const selected = elements.orderActionReasonSelect ? elements.orderActionReasonSelect.value.trim() : '';
        if (!selected) return { selectedReason: '', customReason: '', reason: '' };

        if (selected === 'Other') {
            const customReason = elements.orderActionOtherReason ? elements.orderActionOtherReason.value.trim() : '';
            return { selectedReason: 'Other', customReason, reason: customReason };
        }
        return { selectedReason: selected, customReason: '', reason: selected };
    }

    async function submitOrderAction() {
        const { orderId, action } = pendingOrderAction;
        if (!orderId || !action) return;

        const { reason, selectedReason, customReason } = resolveOrderActionReason();
        if (!reason) {
            Swal.fire({
                icon: 'warning',
                title: 'Reason required',
                text: selectedReason === 'Other' || elements.orderActionReasonSelect?.value === 'Other'
                    ? 'Please type your custom reason in the text field.'
                    : 'Please select a reason before confirming.',
                confirmButtonColor: '#2563eb'
            });
            return;
        }

        const endpoint = action === 'return'
            ? `/api/orders/${encodeURIComponent(orderId)}/return`
            : `/api/orders/${encodeURIComponent(orderId)}/cancel`;

        const originalBtnHtml = elements.orderActionConfirmBtn ? elements.orderActionConfirmBtn.innerHTML : '';
        if (elements.orderActionConfirmBtn) {
            elements.orderActionConfirmBtn.disabled = true;
            elements.orderActionConfirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
        }

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ reason, selectedReason, customReason })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                closeOrderActionModal();
                Swal.fire({
                    icon: 'success',
                    title: 'Success',
                    text: data.message || 'Request processed successfully.',
                    confirmButtonColor: '#2563eb'
                }).then(() => fetchOrderDetails());
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'Request failed',
                    text: data.message || 'Please try again.',
                    confirmButtonColor: '#d33'
                });
            }
        } catch (error) {
            console.error('Order action error:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Server error while processing your request.',
                confirmButtonColor: '#d33'
            });
        } finally {
            if (elements.orderActionConfirmBtn) {
                elements.orderActionConfirmBtn.disabled = false;
                elements.orderActionConfirmBtn.innerHTML = originalBtnHtml;
            }
        }
    }

    function renderOrderActionBar(order, status) {
        const showBar = elements.actionBar;
        if (!showBar) return;

        let visibleCount = 0;

        if (elements.invoiceBtn) {
            elements.invoiceBtn.classList.remove('hidden');
            visibleCount += 1;
        }

        if (elements.trackBtn) {
            if (status !== 'delivered') {
                elements.trackBtn.classList.remove('hidden');
                elements.trackBtn.href = `/order-track.html?id=${order._id || orderId}`;
                visibleCount += 1;
            } else {
                elements.trackBtn.classList.add('hidden');
            }
        }

        if (elements.cancelBtn) {
            if (status === 'pending') {
                elements.cancelBtn.classList.remove('hidden');
                visibleCount += 1;
            } else {
                elements.cancelBtn.classList.add('hidden');
            }
        }

        if (elements.returnBtn) {
            if (isWithinReturnWindow(order)) {
                elements.returnBtn.classList.remove('hidden');
                visibleCount += 1;
            } else {
                elements.returnBtn.classList.add('hidden');
            }
        }

        showBar.classList.toggle('hidden', visibleCount === 0);
    }

    function setupOrderActionEvents() {
        if (elements.orderActionReasonSelect) {
            elements.orderActionReasonSelect.addEventListener('change', toggleOrderActionOtherField);
        }

        if (elements.orderActionForm) {
            elements.orderActionForm.addEventListener('submit', (e) => {
                e.preventDefault();
                submitOrderAction();
            });
        }

        if (elements.closeOrderActionModalBtn) {
            elements.closeOrderActionModalBtn.addEventListener('click', closeOrderActionModal);
        }

        if (elements.orderActionCloseBtn) {
            elements.orderActionCloseBtn.addEventListener('click', closeOrderActionModal);
        }

        if (elements.orderActionModal) {
            elements.orderActionModal.addEventListener('click', (e) => {
                if (e.target === elements.orderActionModal) closeOrderActionModal();
            });
        }

        if (elements.cancelBtn) {
            elements.cancelBtn.addEventListener('click', () => openOrderActionModal('cancel'));
        }

        if (elements.returnBtn) {
            elements.returnBtn.addEventListener('click', () => openOrderActionModal('return'));
        }

        if (elements.supportChatBtn) {
            elements.supportChatBtn.addEventListener('click', async () => {
                const order = currentOrderData || {
                    _id: currentOrderMongoId,
                    orderId: currentDisplayOrderId
                };
                if (window.OrderChat) {
                    elements.supportChatBtn.disabled = true;
                    try {
                        await window.OrderChat.openForOrder(order);
                    } finally {
                        elements.supportChatBtn.disabled = false;
                    }
                }
            });
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
        currentOrderData = order;
        const displayId = order.orderId || (order._id ? order._id.substring(order._id.length - 6).toUpperCase() : orderId);
        currentOrderMongoId = order._id || orderId;
        currentDisplayOrderId = displayId;
        document.getElementById('order-id-display').textContent = `#${displayId}`;
        
        const orderDate = new Date(order.createdAt || Date.now()).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        document.getElementById('order-date').textContent = orderDate;

        // স্ট্যাটাস ও Track Order বাটন লজিক
        const status = (order.status || 'pending').toLowerCase();
        const statusEl = document.getElementById('order-status');
        const statusClass = status.replace(/\s+/g, '-');
        if (statusEl) {
            statusEl.textContent = status;
            statusEl.className = `status-badge ${statusClass}`;
        }

        if (window.OrderStatusTimeline) {
            OrderStatusTimeline.renderOrderStatusUI({
                status: order.status || status,
                timelineEl: document.getElementById('order-status-timeline'),
                bannerEl: document.getElementById('order-cancelled-banner')
            });
        }

        if (window.CourierBadge) {
            CourierBadge.render(document.getElementById('courier-tracking-badge'), order);
        }

        renderOrderActionBar(order, status);

        // কাস্টমার ইনফরমেশন
        document.getElementById('customer-name').textContent = order.customerName || userInfo?.name || 'N/A';
        document.getElementById('customer-phone').textContent = order.customerPhone || 'N/A';
        document.getElementById('shipping-address').textContent = order.customerAddress || 'N/A';

        const financials = resolveOrderFinancials(order);
        const shippingDistrictEl = document.getElementById('shipping-district');
        const shippingLocationEl = document.getElementById('shipping-location-type');
        if (shippingDistrictEl) shippingDistrictEl.textContent = financials.shippingDistrict || 'N/A';
        if (shippingLocationEl) shippingLocationEl.textContent = financials.shippingLocationType;

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

                    const PT = window.ProductThumbnail;
                    const mediaHtml = PT
                        ? `<div class="order-item-media">${PT.buildThumbnailHtml(item, { variant: 'compact', alt: targetName })}</div>`
                        : `<div class="order-item-media"><div class="no-photo-badge"><span>NO PHOTO</span></div></div>`;

                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>
                            <div style="display: flex; align-items: center; gap: 12px;">
                                ${mediaHtml}
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

            const storedSubTotal = financials.subTotal;
            const displaySubtotal = storedSubTotal > 0 ? storedSubTotal : subtotal;
            const discountRow = document.getElementById('order-discount-row');
            const discountEl = document.getElementById('order-discount-amount');
            const couponCodeEl = document.getElementById('order-coupon-code');
            const shippingFeeEl = document.getElementById('shipping-fee');
            const freeShippingBadge = document.getElementById('order-free-shipping-badge');

            document.getElementById('subtotal-amount').textContent = `৳${displaySubtotal}`;

            if (financials.discountAmount > 0 && discountRow) {
                discountRow.style.display = 'flex';
                if (discountEl) discountEl.textContent = `-৳${financials.discountAmount}`;
                if (couponCodeEl) couponCodeEl.textContent = order.couponCode || '';
            } else if (discountRow) {
                discountRow.style.display = 'none';
            }

            if (shippingFeeEl) {
                shippingFeeEl.textContent = financials.deliveryCharge === 0 ? '৳0' : `৳${financials.deliveryCharge}`;
                shippingFeeEl.style.display = financials.deliveryCharge === 0 ? 'none' : 'inline';
            }
            if (freeShippingBadge) {
                freeShippingBadge.style.display = financials.deliveryCharge === 0 ? 'inline-flex' : 'none';
            }

            document.getElementById('total-amount').textContent = `৳${financials.grandTotal}`;
        }

        if (elements.orderContent) elements.orderContent.classList.remove('hidden');

        renderPaymentInfo(order);
    }

    function renderPaymentInfo(order) {
        const paymentType = String(order.payment?.type || '').toLowerCase();
        const paymentStatus = String(order.payment?.status || 'unpaid').toLowerCase();
        const proofStatus = String(order.paymentProof?.status || 'none').toLowerCase();
        const methodName = order.payment?.name || order.paymentMethod || 'N/A';

        if (elements.paymentMethodName) {
            elements.paymentMethodName.textContent = methodName;
        }
        if (elements.paymentStatusLabel) {
            const statusLabels = {
                unpaid: 'Unpaid',
                pending: 'Pending',
                paid: 'Paid',
                failed: 'Failed',
                cancelled: 'Cancelled',
                refunded: 'Refunded'
            };
            elements.paymentStatusLabel.textContent = statusLabels[paymentStatus] || paymentStatus;
        }

        if (!elements.paymentProofSection) return;

        const isManual = paymentType === 'manual';
        elements.paymentProofSection.classList.toggle('hidden', !isManual);

        if (!isManual) return;

        const badgeEl = elements.paymentProofBadge;
        const formEl = elements.paymentProofForm;
        const rejectionEl = elements.paymentProofRejectionNote;
        const successEl = elements.paymentProofSuccessMsg;

        if (badgeEl) {
            badgeEl.className = 'payment-proof-badge';
            badgeEl.classList.add('hidden');
        }
        if (formEl) formEl.classList.add('hidden');
        if (rejectionEl) rejectionEl.classList.add('hidden');
        if (successEl) successEl.classList.add('hidden');

        if (proofStatus === 'submitted') {
            if (badgeEl) {
                badgeEl.textContent = 'Payment proof submitted. Awaiting admin review.';
                badgeEl.classList.add('submitted');
                badgeEl.classList.remove('hidden');
            }
        } else if (proofStatus === 'approved') {
            if (badgeEl) {
                badgeEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> Payment Verified ✓';
                badgeEl.classList.add('approved');
                badgeEl.classList.remove('hidden');
            }
        } else if (proofStatus === 'rejected') {
            if (badgeEl) {
                badgeEl.textContent = 'Proof Rejected';
                badgeEl.classList.add('rejected');
                badgeEl.classList.remove('hidden');
            }
            const adminNote = String(order.paymentProof?.adminNote || '').trim();
            if (adminNote && rejectionEl) {
                rejectionEl.innerHTML = `<strong>Admin note:</strong> ${adminNote}`;
                rejectionEl.classList.remove('hidden');
            }
            if (formEl) formEl.classList.remove('hidden');
            if (elements.paymentProofTrxInput && order.paymentProof?.trxId) {
                elements.paymentProofTrxInput.value = order.paymentProof.trxId;
            }
        } else if (proofStatus === 'none') {
            if (formEl) formEl.classList.remove('hidden');
        }
    }

    async function submitPaymentProof(event) {
        event.preventDefault();

        const trxId = elements.paymentProofTrxInput?.value?.trim() || '';
        if (!trxId) {
            Swal.fire({
                icon: 'warning',
                title: 'TRX ID required',
                text: 'Please enter your transaction ID before submitting.',
                confirmButtonColor: '#2563eb'
            });
            return;
        }

        const formData = new FormData();
        formData.append('trxId', trxId);
        const screenshotFile = elements.paymentProofScreenshotInput?.files?.[0];
        if (screenshotFile) {
            formData.append('screenshot', screenshotFile);
        }

        const originalBtnHtml = elements.paymentProofSubmitBtn ? elements.paymentProofSubmitBtn.innerHTML : '';
        if (elements.paymentProofSubmitBtn) {
            elements.paymentProofSubmitBtn.disabled = true;
            elements.paymentProofSubmitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';
        }

        try {
            const response = await fetch(`/api/orders/${encodeURIComponent(currentOrderMongoId)}/payment-proof`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            const data = await response.json();

            if (response.ok && data.success) {
                if (elements.paymentProofSuccessMsg) {
                    elements.paymentProofSuccessMsg.textContent = data.message || 'Payment proof submitted successfully';
                    elements.paymentProofSuccessMsg.classList.remove('hidden');
                }
                if (elements.paymentProofForm) elements.paymentProofForm.classList.add('hidden');
                Swal.fire({
                    icon: 'success',
                    title: 'Submitted',
                    text: data.message || 'Payment proof submitted successfully',
                    confirmButtonColor: '#2563eb'
                }).then(() => fetchOrderDetails());
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'Submission failed',
                    text: data.message || 'Could not submit payment proof.',
                    confirmButtonColor: '#d33'
                });
            }
        } catch (error) {
            console.error('Payment proof submit error:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Server error while submitting payment proof.',
                confirmButtonColor: '#d33'
            });
        } finally {
            if (elements.paymentProofSubmitBtn) {
                elements.paymentProofSubmitBtn.disabled = false;
                elements.paymentProofSubmitBtn.innerHTML = originalBtnHtml;
            }
        }
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
    setupOrderActionEvents();
    populateOrderActionReasons();

    if (elements.paymentProofForm) {
        elements.paymentProofForm.addEventListener('submit', submitPaymentProof);
    }

    if (elements.invoiceBtn) {
        elements.invoiceBtn.addEventListener('click', () => {
            if (typeof window.downloadOrderInvoice === 'function') {
                window.downloadOrderInvoice(currentOrderMongoId, currentDisplayOrderId, elements.invoiceBtn);
            }
        });
    }

    fetchOrderDetails();
});











