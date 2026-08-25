/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/orders-invoice.js
 * Description: Invoice modal, payment-proof review, shipping edit, and print.
 */
/* Dependencies: token, globalOrders, currentInvoiceOrderId, showToast, showAdminSuccess, buildAdminOrderStatusCell (window) */
/* Exposes: window.buildAdminCompositeAddress, window.closeEditOrderShippingModal, window.closeInvoiceModal, window.openEditOrderShippingModal, window.printInvoice, window.renderInvoicePaymentProofSection, window.reviewInvoicePaymentProof, window.saveOrderShippingEdits, window.viewInvoice */

import '../admin-core.js';

const LIVE_ORDERS_TABLE_COLS = window.LIVE_ORDERS_TABLE_COLS;
const ORDER_COURIER_SEND_CLASSES = window.ORDER_COURIER_SEND_CLASSES;
const ORDER_COURIER_SENT_CLASSES = window.ORDER_COURIER_SENT_CLASSES;
const COURIER_TRACKING_BASE_URLS = window.COURIER_TRACKING_BASE_URLS;
const COURIER_PROVIDER_LABELS = window.COURIER_PROVIDER_LABELS;
const COURIER_BLOCKED_STATUSES = window.COURIER_BLOCKED_STATUSES;

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

    currentInvoiceOrderId = orderId;

    const subTotal = Number(order.subTotal ?? order.subtotal) || 0;
    const discountAmount = Number(order.discountAmount) || 0;
    const deliveryCharge = Number(order.deliveryCharge ?? order.shippingFee) || 0;
    const processingFee = Number(order.processingFee ?? order.payment?.processingFee) || 0;
    const grandTotal = Number(order.grandTotal ?? order.totalAmount)
        || Math.max(0, subTotal - discountAmount + deliveryCharge + processingFee);
    const shippingLocationType = order.shippingLocationType
        || (order.deliveryLocationType === 'outside' ? 'Outside City' : 'Inside City');
    const shippingDistrict = order.shippingDistrict || 'N/A';

    // মডালে কাস্টমার ডাটা পুশ করা
    document.getElementById('invOrderId').innerText = order.orderId || '#' + orderId.slice(-6).toUpperCase();
    document.getElementById('invCustomerName').innerText = order.customerName || 'N/A';
    document.getElementById('invCustomerPhone').innerText = order.customerPhone || 'N/A';
    document.getElementById('invCustomerAddress').innerText = order.customerAddress || 'N/A';
    
    document.getElementById('invPaymentMethod').innerText = order.paymentMethod ? order.paymentMethod : "COD";
    document.getElementById('invShippingLocation').innerText = `${shippingDistrict} (${shippingLocationType})`;
    document.getElementById('invNote').innerText = order.note && order.note.trim() !== "" ? order.note : "No note provided";

    // 🚚 কুরিয়ার বুকিং ডিটেইলস — শুধু বুক করা অর্ডারের জন্য দেখানো হয়
    const courierRow = document.getElementById('invCourierRow');
    const courierInfoEl = document.getElementById('invCourierInfo');
    const invTrackingId = String(order.courierTrackingId || '').trim();
    if (courierRow && courierInfoEl) {
        if (invTrackingId) {
            const invProvider = normalizeAdminCourierSlug(order.courierProvider || adminCourierConfig.provider || 'steadfast');
            const invProviderLabel = COURIER_PROVIDER_LABELS[invProvider] || invProvider;
            const consignment = order.courierConsignmentId ? ` · Consignment: ${order.courierConsignmentId}` : '';
            courierInfoEl.innerText = `${invProviderLabel} — ${invTrackingId}${consignment}`;
            courierRow.style.display = '';
        } else {
            courierRow.style.display = 'none';
        }
    }

    document.getElementById('invSubTotal').innerText = formatAdminPrice(subTotal);

    const discountRow = document.getElementById('invDiscountRow');
    if (discountAmount > 0 && discountRow) {
        discountRow.style.display = 'flex';
        document.getElementById('invDiscountAmount').innerText = `-${formatAdminPrice(discountAmount)}`;
        document.getElementById('invCouponCode').innerText = order.couponCode || '';
    } else if (discountRow) {
        discountRow.style.display = 'none';
    }

    const deliveryEl = document.getElementById('invDeliveryCharge');
    if (deliveryEl) {
        deliveryEl.innerText = deliveryCharge === 0 ? 'Free Shipping' : formatAdminPrice(deliveryCharge);
    }

    document.getElementById('invTotalAmount').innerText = formatAdminPrice(grandTotal);

    // আইটেম লিস্ট জেনারেট করা
    const itemsContainer = document.getElementById('invItemsList');
    let itemsHTML = '';
    if (order.items) {
        order.items.forEach(item => {
            itemsHTML += `<div style="display:flex; justify-content:space-between; padding: 10px 0; border-bottom: 1px dashed #e2e8f0;">
                <span><i class="fa-solid fa-cube text-muted"></i> ${item.name} (x${item.quantity})</span>
                <b class="text-main">${formatAdminPrice((item.price || 0) * (item.quantity || 1))}</b>
            </div>`;
        });
    }
    itemsContainer.innerHTML = itemsHTML;

    renderInvoicePaymentProofSection(order);

    modal.style.display = 'flex'; // মডাল প্রদর্শন
};

function renderInvoicePaymentProofSection(order) {
    const section = document.getElementById('invPaymentProofSection');
    if (!section) return;

    const isManual = String(order.payment?.type || '').toLowerCase() === 'manual';
    const proof = order.paymentProof || {};
    const proofStatus = String(proof.status || 'none').toLowerCase();

    if (!isManual) {
        section.style.display = 'none';
        return;
    }

    section.style.display = '';

    const statusEl = document.getElementById('invPaymentProofStatus');
    const trxEl = document.getElementById('invPaymentProofTrxId');
    const submittedEl = document.getElementById('invPaymentProofSubmittedAt');
    const screenshotWrap = document.getElementById('invPaymentProofScreenshotWrap');
    const screenshotLink = document.getElementById('invPaymentProofScreenshotLink');
    const screenshotImg = document.getElementById('invPaymentProofScreenshot');
    const adminNoteEl = document.getElementById('invPaymentProofAdminNote');
    const reviewActions = document.getElementById('invPaymentProofReviewActions');
    const rejectNoteInput = document.getElementById('invPaymentProofRejectNote');

    const statusLabels = {
        none: 'Not submitted',
        submitted: 'Awaiting review',
        approved: 'Approved',
        rejected: 'Rejected'
    };

    if (statusEl) {
        statusEl.textContent = statusLabels[proofStatus] || proofStatus;
        statusEl.className = `payment-proof-status-pill ${proofStatus}`;
    }
    if (trxEl) trxEl.textContent = proof.trxId || '—';
    if (submittedEl) {
        submittedEl.textContent = proof.submittedAt
            ? new Date(proof.submittedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
            : '—';
    }

    const screenshotUrl = String(proof.screenshotUrl || '').trim();
    if (screenshotWrap && screenshotLink && screenshotImg) {
        if (screenshotUrl) {
            screenshotLink.href = screenshotUrl;
            screenshotImg.src = screenshotUrl;
            screenshotWrap.style.display = '';
        } else {
            screenshotWrap.style.display = 'none';
            screenshotLink.href = '#';
            screenshotImg.removeAttribute('src');
        }
    }

    if (adminNoteEl) {
        const note = String(proof.adminNote || '').trim();
        if (note && proofStatus === 'rejected') {
            adminNoteEl.textContent = `Admin note: ${note}`;
            adminNoteEl.style.display = '';
        } else {
            adminNoteEl.textContent = '';
            adminNoteEl.style.display = 'none';
        }
    }

    if (reviewActions) {
        reviewActions.style.display = proofStatus === 'submitted' ? '' : 'none';
    }
    if (rejectNoteInput) rejectNoteInput.value = '';
}

window.reviewInvoicePaymentProof = async function(action) {
    const orderId = currentInvoiceOrderId;
    if (!orderId) return showToast('No order selected.', 'warning');

    const normalizedAction = String(action || '').trim().toLowerCase();
    if (!['approve', 'reject'].includes(normalizedAction)) return;

    const rejectNoteInput = document.getElementById('invPaymentProofRejectNote');
    const adminNote = rejectNoteInput ? rejectNoteInput.value.trim() : '';

    const approveBtn = document.getElementById('invApprovePaymentProofBtn');
    const rejectBtn = document.getElementById('invRejectPaymentProofBtn');
    const restore = normalizedAction === 'approve'
        ? setButtonLoading(approveBtn, 'Approving...')
        : setButtonLoading(rejectBtn, 'Rejecting...');

    try {
        const response = await fetch(`/api/admin/orders/${orderId}/review-payment-proof`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ action: normalizedAction, adminNote })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showToast(result.message || 'Payment proof updated.', 'success');
            const updated = result.data || {};
            const idx = globalOrders.findIndex(o => String(o._id) === String(orderId));
            if (idx > -1) {
                globalOrders[idx] = { ...globalOrders[idx], ...updated };
                filterAndRenderOrders();
            }
            viewInvoice(orderId);
        } else {
            showToast(result.message || 'Failed to review payment proof.', 'error');
        }
    } catch (err) {
        console.error('Review payment proof error:', err);
        showToast('Server error while reviewing payment proof.', 'error');
    } finally {
        restore();
    }
};

/**
 * ৭.৭: ইনভয়েস মডাল বন্ধ করার ফাংশন
 */
window.closeInvoiceModal = function() {
    const modal = document.getElementById('invoiceModal');
    if (modal) modal.style.display = 'none';
    currentInvoiceOrderId = null;
};

function buildAdminCompositeAddress({ street = '', upazila = '', district = '' } = {}) {
    return [street, upazila, district].filter(Boolean).join(', ');
}

window.openEditOrderShippingModal = function(orderId) {
    const resolvedOrderId = orderId || currentInvoiceOrderId;
    const order = globalOrders.find(o => String(o._id) === String(resolvedOrderId));
    if (!order) return showToast('Order not found.', 'error');

    currentInvoiceOrderId = order._id;
    document.getElementById('editShippingOrderId').value = order._id;

    const labelEl = document.getElementById('editShippingOrderLabel');
    if (labelEl) {
        labelEl.textContent = `Order #${order.orderId || order._id.slice(-6).toUpperCase()}`;
    }

    document.getElementById('editShippingName').value = order.customerName || '';
    document.getElementById('editShippingPhone').value = order.customerPhone || '';
    document.getElementById('editShippingNote').value = order.note || '';

    const districtSelect = document.getElementById('editShippingDistrict');
    const upazilaSelect = document.getElementById('editShippingUpazila');
    const parsed = parseCompositeAddressParts(
        order.customerAddress || '',
        order.shippingDistrict || '',
        ''
    );

    populateDistrictSelect(districtSelect, order.shippingDistrict || parsed.district || '');
    bindAdminDistrictUpazilaHandlers(districtSelect, upazilaSelect);

    const districtValue = order.shippingDistrict || parsed.district || districtSelect.value || '';
    if (districtValue) districtSelect.value = districtValue;
    populateAdminUpazilaSelect(districtSelect, upazilaSelect, districtValue, parsed.upazila || '');
    document.getElementById('editShippingStreet').value = parsed.street || '';

    document.getElementById('orderShippingEditModal').style.display = 'flex';
};

window.closeEditOrderShippingModal = function() {
    const modal = document.getElementById('orderShippingEditModal');
    if (modal) modal.style.display = 'none';
};

window.saveOrderShippingEdits = async function() {
    const orderId = document.getElementById('editShippingOrderId').value;
    const customerName = document.getElementById('editShippingName').value.trim();
    const customerPhone = document.getElementById('editShippingPhone').value.replace(/\D/g, '');
    const shippingDistrict = document.getElementById('editShippingDistrict')?.value?.trim() || '';
    const shippingUpazila = document.getElementById('editShippingUpazila')?.value?.trim() || '';
    const shippingStreetAddress = document.getElementById('editShippingStreet').value.trim();
    const note = document.getElementById('editShippingNote').value.trim();

    if (!customerName) return showToast('Full name is required.', 'warning');
    if (customerName.length < 2) return showToast('Full name must be at least 2 characters.', 'warning');
    if (!/^01[3-9]\d{8}$/.test(customerPhone)) {
        return showToast('Mobile must be a valid 11-digit Bangladeshi number.', 'warning');
    }
    if (!shippingDistrict) return showToast('Please select a district.', 'warning');
    if (!shippingUpazila) return showToast('Please select an upazila / thana.', 'warning');
    if (!shippingStreetAddress) return showToast('Delivery address is required.', 'warning');

    const btn = document.getElementById('saveOrderShippingBtn');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    }

    try {
        const res = await fetch(`/api/admin/orders/${orderId}/address`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                customerName,
                customerPhone,
                shippingDistrict,
                shippingUpazila,
                shippingStreetAddress,
                customerAddress: buildAdminCompositeAddress({
                    street: shippingStreetAddress,
                    upazila: shippingUpazila,
                    district: shippingDistrict
                }),
                note
            })
        });
        const result = await res.json();

        if (res.ok && result.success) {
            const updated = result.data || {};
            const idx = globalOrders.findIndex(o => String(o._id) === String(orderId));
            if (idx > -1) {
                globalOrders[idx] = { ...globalOrders[idx], ...updated };
                filterAndRenderOrders();
            }
            showToast(result.message || 'Shipping details updated.', 'success');
            closeEditOrderShippingModal();
            if (currentInvoiceOrderId === orderId) {
                viewInvoice(orderId);
            }
        } else {
            showToast(result.message || 'Failed to update shipping details.', 'error');
        }
    } catch (error) {
        showToast('Server error while saving shipping details.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
};

window.printInvoice = function() {
    document.body.classList.add('printing-invoice');
    const cleanup = () => {
        document.body.classList.remove('printing-invoice');
        window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
};

/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    buildAdminCompositeAddress,
    renderInvoicePaymentProofSection
});

