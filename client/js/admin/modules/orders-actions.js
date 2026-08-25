/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/orders-actions.js
 * Description: Order status updates, courier booking, bulk operations, returns/refunds, WhatsApp alerts.
 */
/* Dependencies: token, globalOrders, adminCourierConfig, showToast, showCustomConfirm, renderOrderTable, filterAndRenderOrders, fetchLiveOrders (window) */
/* Exposes: window.approveOrderReturn, window.buildAdminOrderStatusCell, window.buildAdminPaymentProofPendingBadge, window.buildCourierActionHtml, window.bulkApplyOrderStatus, window.bulkDeleteOrders, window.cacheAdminCourierSettings, window.changeOrderStatus, window.closeOrderReasonModal, window.deleteOrder, window.fetchPendingWhatsAppAlerts, window.getCourierTrackingUrl, window.normalizeAdminCourierSlug, window.refreshAdminCourierStatus, window.renderWhatsAppAlertDropdown, window.sendOrderToCourier, window.setupWhatsAppAlertBadge, window.showOrderReasonDetails, window.toggleSelectAllOrders, window.undoOrderRefund, window.updateOrdersBulkToolbar */

import '../admin-core.js';

const LIVE_ORDERS_TABLE_COLS = window.LIVE_ORDERS_TABLE_COLS;
const ORDER_COURIER_SEND_CLASSES = window.ORDER_COURIER_SEND_CLASSES;
const ORDER_COURIER_SENT_CLASSES = window.ORDER_COURIER_SENT_CLASSES;
const COURIER_TRACKING_BASE_URLS = window.COURIER_TRACKING_BASE_URLS;
const COURIER_PROVIDER_LABELS = window.COURIER_PROVIDER_LABELS;
const COURIER_BLOCKED_STATUSES = window.COURIER_BLOCKED_STATUSES;

/* ==========================================================================
   WHATSAPP PENDING ALERT BADGE (wa.me fallback queue)
   ========================================================================== */

/* shared state: whatsappAlertPollTimer lives on window (admin-core) */

function renderWhatsAppAlertDropdown(alerts = []) {
    const dropdown = document.getElementById('whatsappAlertDropdown');
    const wrap = document.getElementById('whatsappAlertBadgeWrap');
    const countEl = document.getElementById('whatsappAlertBadgeCount');
    if (!dropdown || !wrap || !countEl) return;

    const count = alerts.length;
    countEl.textContent = String(count);
    wrap.style.display = count > 0 ? 'block' : 'none';

    if (count === 0) {
        dropdown.style.display = 'none';
        dropdown.innerHTML = '';
        return;
    }

    dropdown.innerHTML = alerts.map((alert) => `
        <div class="whatsapp-alert-item" data-alert-id="${escHtml(alert.id)}">
            <div class="whatsapp-alert-item-head">
                <strong>#${escHtml(alert.orderId || 'Order')}</strong>
                <button type="button" class="whatsapp-alert-dismiss" data-dismiss-id="${escHtml(alert.id)}" title="Dismiss">×</button>
            </div>
            <p class="whatsapp-alert-reason">${escHtml(alert.reason || 'Tap to send via WhatsApp')}</p>
            <a href="${escHtml(alert.waMeUrl || '#')}" target="_blank" rel="noopener noreferrer" class="whatsapp-alert-send-link">
                <i class="fa-brands fa-whatsapp"></i> Open WhatsApp
            </a>
        </div>
    `).join('');

    dropdown.querySelectorAll('[data-dismiss-id]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const alertId = btn.getAttribute('data-dismiss-id');
            try {
                await fetch(`/api/admin/whatsapp-alerts/${encodeURIComponent(alertId)}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            } catch (err) {
                console.warn('Dismiss WhatsApp alert failed:', err);
            }
            fetchPendingWhatsAppAlerts();
        });
    });
}

async function fetchPendingWhatsAppAlerts() {
    try {
        const res = await fetch('/api/admin/whatsapp-alerts/pending', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 429) {
            if (trackAdminPollError('whatsappAlerts', res)) {
                if (whatsappAlertPollTimer) {
                    clearInterval(whatsappAlertPollTimer);
                    whatsappAlertPollTimer = null;
                }
            }
            return;
        }
        if (res.status === 401) {
            handleAdminApiAuthResponse(res, {});
            return;
        }

        if (!res.ok) {
            trackAdminPollError('whatsappAlerts', res);
            return;
        }

        const data = await res.json();
        resetAdminPollErrors('whatsappAlerts');
        if (data.success) {
            renderWhatsAppAlertDropdown(Array.isArray(data.data) ? data.data : []);
        }
    } catch (err) {
        adminPollErrorCounts.whatsappAlerts = (adminPollErrorCounts.whatsappAlerts || 0) + 1;
        console.warn('[Admin] Fetch error (whatsapp alerts):', err.message);
        if (adminPollErrorCounts.whatsappAlerts >= MAX_ADMIN_POLL_ERRORS && whatsappAlertPollTimer) {
            console.warn('[Admin] Too many errors on whatsappAlerts, pausing auto-refresh');
            clearInterval(whatsappAlertPollTimer);
            whatsappAlertPollTimer = null;
        }
    }
}

function setupWhatsAppAlertBadge() {
    const btn = document.getElementById('whatsappAlertBadgeBtn');
    const dropdown = document.getElementById('whatsappAlertDropdown');

    if (btn && dropdown) {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        });

        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
    }

    fetchPendingWhatsAppAlerts();
    if (whatsappAlertPollTimer) clearInterval(whatsappAlertPollTimer);
    whatsappAlertPollTimer = setInterval(fetchPendingWhatsAppAlerts, 30000);
}

/* ============================================================
   🚚 COURIER BOOKING (Steadfast / Pathao / RedX)
   ============================================================ */

function normalizeAdminCourierSlug(value) {
    const raw = String(value || '').trim();
    const aliases = { Steadfast: 'steadfast', Pathao: 'pathao', RedX: 'redx', redX: 'redx' };
    return aliases[raw] || raw.toLowerCase();
}

// Filled from the Master Settings payload that fetchLiveOrders() already loads,
// so the button can name the store's configured provider.

/* shared state: adminCourierConfig lives on window (admin-core) */

function cacheAdminCourierSettings(settings) {
    if (!settings) return;
    const provider = normalizeAdminCourierSlug(settings.defaultCourierProvider || 'steadfast');
    const hasSteadfastKeys = Boolean(
        String(settings.courierApiKey || '').trim() && String(settings.courierSecretKey || '').trim()
    );
    adminCourierConfig = {
        ...adminCourierConfig,
        provider,
        // Steadfast keys from Master Settings; Pathao/RedX readiness comes from /courier/status.
        isConfigured: provider === 'steadfast' ? hasSteadfastKeys : adminCourierConfig.isConfigured,
        mockMode: provider === 'steadfast' ? !hasSteadfastKeys : adminCourierConfig.mockMode
    };
}

async function refreshAdminCourierStatus() {
    try {
        const response = await fetch('/api/admin/courier/status', {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` }
        });
        const result = await response.json();
        if (!result.success || !result.data) return;

        adminCourierConfig = {
            provider: normalizeAdminCourierSlug(result.data.provider || adminCourierConfig.provider),
            isConfigured: Boolean(result.data.isConfigured),
            mockMode: Boolean(result.data.mockMode),
            supportsBooking: Boolean(result.data.supportsBooking)
        };
    } catch (err) {
        console.warn('Could not refresh courier status:', err);
    }
}

function getCourierTrackingUrl(provider, trackingId) {
    const slug = normalizeAdminCourierSlug(provider);
    const base = COURIER_TRACKING_BASE_URLS[slug] || COURIER_TRACKING_BASE_URLS[provider];
    const code = String(trackingId || '').trim();
    if (!base || !code) return '';
    return `${base}${encodeURIComponent(code)}`;
}

function buildAdminPaymentProofPendingBadge(order) {
    if (String(order?.paymentProof?.status || '').toLowerCase() !== 'submitted') return '';
    return `<span class="order-payment-proof-pending-badge" title="Payment proof awaiting review"><i class="fa-solid fa-receipt"></i> Proof Pending</span>`;
}

/**
 * Renders either the tracking badge (already booked) or the one-click booking
 * button (not booked yet) for an order row.
 */
function buildCourierActionHtml(order) {
    const trackingId = String(order.courierTrackingId || '').trim();
    const provider = normalizeAdminCourierSlug(order.courierProvider || adminCourierConfig.provider || 'steadfast');
    const safeProvider = escapeToastText(COURIER_PROVIDER_LABELS[provider] || provider);

    if (trackingId) {
        const safeTracking = escapeToastText(trackingId);
        const trackingUrl = getCourierTrackingUrl(provider, trackingId);
        const badgeLabel = `<span class="order-courier-sent-text">Sent ${safeTracking}</span>`;

        return trackingUrl
            ? `<a href="${trackingUrl}" target="_blank" rel="noopener noreferrer" class="${ORDER_COURIER_SENT_CLASSES} courier-tracking-badge" title="Track ${safeTracking} on ${safeProvider}">${badgeLabel}</a>`
            : `<span class="${ORDER_COURIER_SENT_CLASSES} courier-tracking-badge" title="${safeTracking} · ${safeProvider}">${badgeLabel}</span>`;
    }

    if (COURIER_BLOCKED_STATUSES.includes(String(order.status || '').trim().toLowerCase())) {
        return '<span class="order-courier-empty" aria-hidden="true">—</span>';
    }

    return `<button type="button" class="${ORDER_COURIER_SEND_CLASSES}" onclick="sendOrderToCourier('${order._id}')" title="Book this parcel with ${safeProvider}">
                <span class="send-courier-icon shrink-0" aria-hidden="true">🚚</span>
                <span class="send-courier-label">Send to Courier</span>
            </button>`;
}

/**
 * ৭.৪খ: এক ক্লিকে কুরিয়ার পার্সেল বুকিং
 * Steadfast API-তে পার্সেল তৈরি করে ট্র্যাকিং আইডি সংরক্ষণ করে।
 * @param {string} orderId - অর্ডারের ডাটাবেজ আইডি
 */
window.sendOrderToCourier = function(orderId) {
    const order = globalOrders.find(o => String(o._id) === String(orderId));
    const provider = normalizeAdminCourierSlug(order?.courierProvider || adminCourierConfig.provider || 'steadfast');
    const providerLabel = COURIER_PROVIDER_LABELS[provider] || provider;
    const displayId = order?.orderId || String(orderId).slice(-6).toUpperCase();
    const isMockMode = adminCourierConfig.mockMode;

    const confirmTitle = isMockMode ? `Send to ${providerLabel} (Mock Mode)` : `Send to ${providerLabel}`;
    const confirmBody = isMockMode
        ? `No courier API credentials are configured. Order #${displayId} will receive a mock tracking ID (e.g. SF-PENDING-XXXXX), be marked as Shipped, and saved to the database.`
        : `Book order #${displayId} as a ${providerLabel} parcel? This creates a real consignment and marks the order as Shipped.`;

    showCustomConfirm(
        confirmTitle,
        confirmBody,
        async () => {
            const bookBtn = document.querySelector(`tr[data-order-id="${orderId}"] .send-courier-btn`);
            const restore = setButtonLoading(bookBtn, isMockMode ? 'Booking (Mock)...' : 'Booking...');

            try {
                const response = await fetch(`/api/admin/orders/${orderId}/send-courier`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ courier: provider })
                });

                const result = await response.json();

                if (result.success) {
                    const toastMsg = result.mockMode
                        ? (result.message || 'Mock parcel booked! Order marked as Shipped.')
                        : (result.message || 'Parcel booked successfully!');
                    showToast(toastMsg, 'success');
                    const idx = globalOrders.findIndex(o => String(o._id) === String(orderId));
                    const updated = result.data?.order || result.order;
                    if (idx !== -1 && updated) {
                        globalOrders[idx] = { ...globalOrders[idx], ...updated };
                    } else if (idx !== -1) {
                        globalOrders[idx] = {
                            ...globalOrders[idx],
                            status: 'Shipped',
                            courierTrackingId: result.trackingId || result.data?.trackingId || globalOrders[idx].courierTrackingId,
                            courierProvider: provider
                        };
                    } else {
                        fetchLiveOrders();
                        return;
                    }
                    applyOrderFilters(false);
                    return;
                }

                showToast(result.message || 'Courier booking failed.', 'error');
                // A 409 means the order was already booked elsewhere — resync so
                // the row shows the tracking badge instead of the button.
                if (response.status === 409) fetchLiveOrders();
            } catch (error) {
                console.error('Courier booking error:', error);
                showToast('Server connection error! Parcel was not booked.', 'error');
            } finally {
                restore();
            }
        }
    );
};

function buildAdminOrderStatusCell(order) {
    const orderId = order._id;
    const statusLower = String(order.status || 'pending').toLowerCase();
    const isCancelled = statusLower === 'cancelled' || statusLower === 'canceled';
    const isReturnRequested = statusLower === 'return requested';
    const isReturned = statusLower === 'returned';
    const isRefunded = statusLower === 'refunded';

    let badgeHtml = '';

    if (isCancelled) {
        const by = order.cancelledBy === 'Admin' ? 'Admin' : 'Customer';
        const badgeClass = by === 'Admin' ? 'status-cancelled-admin' : 'status-cancelled-customer';
        badgeHtml = `<span class="status-badge ${badgeClass}"><i class="fa-solid fa-ban"></i> Cancelled (${by})</span>`;
    } else if (isReturnRequested) {
        badgeHtml = `<span class="status-badge status-return-requested"><i class="fa-solid fa-rotate-left"></i> Return Requested</span>`;
    } else if (isReturned) {
        badgeHtml = `<span class="status-badge status-returned"><i class="fa-solid fa-check-double"></i> Returned</span>`;
    } else if (isRefunded) {
        badgeHtml = `<span class="status-badge status-returned"><i class="fa-solid fa-money-bill-wave"></i> Refunded</span>`;
    } else {
        const selectClass = getStatusSelectClass(order.status);
        badgeHtml = `
            <select onchange="changeOrderStatus('${orderId}', this.value)" class="status-select ${selectClass}">
                <option value="Pending" ${order.status === 'Pending' ? 'selected' : ''}>⏳ Pending</option>
                <option value="Processing" ${order.status === 'Processing' ? 'selected' : ''}>⚙️ Processing</option>
                <option value="Shipped" ${order.status === 'Shipped' ? 'selected' : ''}>🚚 Shipped</option>
                <option value="Delivered" ${order.status === 'Delivered' ? 'selected' : ''}>✅ Delivered</option>
                <option value="Cancelled" ${order.status === 'Cancelled' ? 'selected' : ''}>❌ Cancelled</option>
            </select>`;
    }

    const reasonDetails = getOrderReasonDetails(order);
    const reasonBtn = reasonDetails
        ? `<button type="button" class="view-reason-btn" onclick="showOrderReasonDetails('${orderId}')" title="View ${reasonDetails.actionType.toLowerCase()} reason">
                <i class="fa-solid fa-circle-info"></i><span>View Reason</span>
           </button>`
        : '';

    const undoRefundBtn = canUndoRefund(order)
        ? `<button type="button" class="undo-refund-btn" onclick="undoOrderRefund('${orderId}')" title="Reverse refund and restore return request">
                <i class="fa-solid fa-rotate-left"></i><span class="undo-refund-label">Undo Refund</span>
           </button>`
        : '';

    const approveReturnBtn = isReturnRequested
        ? `<button type="button" class="order-action-pill approve-return-btn" onclick="approveOrderReturn('${orderId}')" title="Approve Return &amp; Refund Wallet">
                <i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i><span class="approve-return-label">Approve</span>
           </button>`
        : '';

    return `<div class="order-status-cell">${badgeHtml}${approveReturnBtn}${undoRefundBtn}${reasonBtn}</div>`;
}

window.showOrderReasonDetails = function(orderId) {
    const order = globalOrders.find(o => String(o._id) === String(orderId));
    const details = getOrderReasonDetails(order);

    if (!order || !details) {
        showToast('No reason details found for this order.', 'warning');
        return;
    }

    const displayId = order.orderId || String(order._id).slice(-6).toUpperCase();
    const modal = document.getElementById('orderReasonModal');
    const orderIdEl = document.getElementById('orderReasonOrderId');
    const actionTypeEl = document.getElementById('orderReasonActionType');
    const initiatedByEl = document.getElementById('orderReasonInitiatedBy');
    const reasonTextEl = document.getElementById('orderReasonText');
    const subtitleEl = document.getElementById('orderReasonModalSubtitle');

    if (orderIdEl) orderIdEl.textContent = `#${displayId}`;
    if (actionTypeEl) actionTypeEl.textContent = details.actionType;
    if (initiatedByEl) initiatedByEl.textContent = details.initiatedBy;
    if (reasonTextEl) reasonTextEl.textContent = details.reason;
    if (subtitleEl) {
        subtitleEl.textContent = details.actionType === 'Cancellation'
            ? `This order was cancelled by the ${details.initiatedBy.toLowerCase()}.`
            : 'This is the reason the customer submitted for their return request.';
    }
    if (modal) modal.style.display = 'flex';
};

window.closeOrderReasonModal = function() {
    const modal = document.getElementById('orderReasonModal');
    if (modal) modal.style.display = 'none';
};

window.toggleSelectAllOrders = function(checkbox) {
    document.querySelectorAll('#view-orders .order-row-select').forEach((el) => {
        el.checked = checkbox.checked;
    });
    updateOrdersBulkToolbar();
};

window.updateOrdersBulkToolbar = function() {
    const selected = document.querySelectorAll('#view-orders .order-row-select:checked').length;
    const toolbar = document.getElementById('orders-bulk-toolbar');
    const countEl = document.getElementById('orders-selected-count');
    if (toolbar) toolbar.style.display = selected > 0 ? 'flex' : 'none';
    if (countEl) countEl.textContent = `${selected} order${selected !== 1 ? 's' : ''} selected`;
};

window.bulkDeleteOrders = function() {
    const selected = [...document.querySelectorAll('#view-orders .order-row-select:checked')]
        .map((el) => el.value);
    if (!selected.length) return;

    showCustomConfirm(
        'Delete Selected Orders',
        `Delete ${selected.length} order(s)? This cannot be undone.`,
        async () => {
            try {
                const response = await fetch('/api/admin/orders/bulk-delete', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ orderIds: selected })
                });
                const result = await response.json();
                if (result.success) {
                    selected.forEach((id) => {
                        globalOrders = globalOrders.filter((o) => String(o._id) !== String(id));
                        expandedOrderIds.delete(String(id));
                    });
                    const totalOrderBadge = document.getElementById('total-orders-badge');
                    if (totalOrderBadge) totalOrderBadge.innerText = `Total: ${globalOrders.length}`;
                    showAdminSuccess('Orders Deleted', `${result.deleted ?? selected.length} order(s) removed.`);
                    applyOrderFilters(false);
                } else {
                    showToast(result.message || 'Bulk delete failed.', 'error');
                }
            } catch (err) {
                showToast('Server error during bulk delete.', 'error');
            }
        },
        'danger'
    );
};

window.bulkApplyOrderStatus = async function() {
    const selected = [...document.querySelectorAll('#view-orders .order-row-select:checked')]
        .map((el) => el.value);
    if (!selected.length) return;

    const newStatus = document.getElementById('bulk-order-status')?.value;
    if (!newStatus) return;

    let successCount = 0;
    for (const orderId of selected) {
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
            if (result.success) successCount += 1;
        } catch (_) { /* continue */ }
    }

    if (successCount > 0) {
        showToast(`Updated ${successCount} order(s) to ${newStatus}.`, 'success');
        selected.forEach((orderId) => {
            const idx = globalOrders.findIndex((o) => String(o._id) === String(orderId));
            if (idx !== -1) globalOrders[idx] = { ...globalOrders[idx], status: newStatus };
        });
        applyOrderFilters(false);
    } else {
        showToast('Could not update selected orders.', 'error');
    }
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
            const idx = globalOrders.findIndex(o => String(o._id) === String(orderId));
            if (idx !== -1) {
                globalOrders[idx] = {
                    ...globalOrders[idx],
                    status: newStatus,
                    ...(result.data?.order || result.order || {})
                };
            }
            showToast(`Order status changed to ${newStatus}!`, 'success');
            applyOrderFilters(false);
        } else showToast("Error updating status!", 'error');
    } catch (error) {
        showToast("Server connection error!", 'error');
    }
};

/**
 * ৭.৪ক: Return Requested অর্ডার অনুমোদন ও ওয়ালেট রিফান্ড
 */
window.approveOrderReturn = function(orderId) {
    showCustomConfirm(
        'Approve Return',
        'Approve this return and refund the order total to the customer wallet?',
        async () => {
            const approveBtn = document.querySelector(`tr[data-order-id="${orderId}"] .approve-return-btn`);
            const originalHtml = approveBtn ? approveBtn.innerHTML : '';

            if (approveBtn) {
                approveBtn.disabled = true;
                approveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            }

            try {
                const response = await fetch(`/api/admin/orders/${orderId}/approve-return`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    const idx = globalOrders.findIndex(o => String(o._id) === String(orderId));
                    if (idx !== -1) {
                        const updated = result.data?.order || {};
                        globalOrders[idx] = {
                            ...globalOrders[idx],
                            status: updated.status || 'Returned',
                            refundedAt: updated.refundedAt || new Date().toISOString(),
                            refundAmount: updated.refundAmount ?? result.data?.refundAmount ?? getOrderGrandTotal(globalOrders[idx]),
                            statusBeforeRefund: updated.statusBeforeRefund || 'Return Requested'
                        };
                    }
                    showAdminSuccess(
                        'Return Approved',
                        result.message || `Refund processed. Order marked as Returned.`
                    );
                    filterAndRenderOrders();
                } else {
                    showToast(result.message || 'Failed to approve return.', 'error');
                    if (approveBtn) {
                        approveBtn.disabled = false;
                        approveBtn.innerHTML = originalHtml;
                    }
                }
            } catch (error) {
                console.error('Approve return error:', error);
                showToast('Server connection error!', 'error');
                if (approveBtn) {
                    approveBtn.disabled = false;
                    approveBtn.innerHTML = originalHtml;
                }
            }
        },
        'warning'
    );
};

/**
 * ৭.৪খ: Returned/Refunded অর্ডারের রিফান্ড নিরাপদে উল্টানো (Safe Undo Refund)
 */
window.undoOrderRefund = function(orderId) {
    const order = globalOrders.find(o => String(o._id) === String(orderId));
    const refundAmount = order ? getOrderGrandTotal(order) : 0;

    showCustomConfirm(
        'Undo Refund',
        refundAmount > 0
            ? `Reverse the ৳${refundAmount.toLocaleString()} wallet refund? The amount will be deducted from the customer's wallet and the order will return to Return Requested.`
            : 'Reverse this refund? The amount will be deducted from the customer wallet and the order will return to Return Requested.',
        async () => {
            const undoBtn = document.querySelector(`tr[data-order-id="${orderId}"] .undo-refund-btn`);
            const originalHtml = undoBtn ? undoBtn.innerHTML : '';

            if (undoBtn) {
                undoBtn.disabled = true;
                undoBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            }

            try {
                const response = await fetch(`/api/admin/orders/${orderId}/undo-refund`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    const idx = globalOrders.findIndex(o => String(o._id) === String(orderId));
                    if (idx !== -1) {
                        const updated = result.data?.order || {};
                        globalOrders[idx] = {
                            ...globalOrders[idx],
                            status: updated.status || 'Return Requested',
                            refundedAt: null,
                            refundAmount: 0,
                            statusBeforeRefund: ''
                        };
                    }

                    if (typeof Swal !== 'undefined') {
                        Swal.fire({
                            icon: 'success',
                            title: 'Refund Undone',
                            text: result.message || 'Refund reversed successfully.',
                            confirmButtonColor: '#3b82f6'
                        });
                    } else {
                        showAdminSuccess('Refund Undone', result.message || 'Refund reversed successfully.');
                    }
                    filterAndRenderOrders();
                } else {
                    const errMsg = result.message || 'Failed to undo refund.';
                    if (typeof Swal !== 'undefined') {
                        Swal.fire({
                            icon: 'error',
                            title: errMsg.includes('already spent') ? 'Cannot Undo Refund' : 'Undo Failed',
                            text: errMsg,
                            confirmButtonColor: '#ef4444'
                        });
                    } else {
                        showToast(errMsg, 'error');
                    }
                    if (undoBtn) {
                        undoBtn.disabled = false;
                        undoBtn.innerHTML = originalHtml;
                    }
                }
            } catch (error) {
                console.error('Undo refund error:', error);
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'error',
                        title: 'Server Error',
                        text: 'Could not connect to the server. Please try again.',
                        confirmButtonColor: '#ef4444'
                    });
                } else {
                    showToast('Server connection error!', 'error');
                }
                if (undoBtn) {
                    undoBtn.disabled = false;
                    undoBtn.innerHTML = originalHtml;
                }
            }
        },
        'danger'
    );
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
            const result = await response.json();
            if (response.ok && result.success) {
                removeOrderFromState(orderId);
                showAdminSuccess('Order Deleted', result.message || 'Order removed from live queue.');
            } else {
                showToast(result.message || "Failed to delete order.", "error");
            }
        } catch (err) { showToast("Server error!", "error"); }
    }, "danger");
};

/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    buildAdminOrderStatusCell,
    buildAdminPaymentProofPendingBadge,
    buildCourierActionHtml,
    cacheAdminCourierSettings,
    fetchPendingWhatsAppAlerts,
    getCourierTrackingUrl,
    normalizeAdminCourierSlug,
    refreshAdminCourierStatus,
    renderWhatsAppAlertDropdown,
    setupWhatsAppAlertBadge
});

