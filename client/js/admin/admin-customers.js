/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/admin-customers.js
 * Description: Customer list, details, and support inbox.
 */

import './admin-core.js';

/* ==========================================================================
   SECTION 6: CUSTOMER MANAGEMENT (সকল কাস্টমারদের তালিকা ও পরিচালনা)
   ========================================================================== */

/**
 * ৬.১: কাস্টমারদের ডাটা টেবিলে প্রদর্শন করা
 * @param {Array} customers - ডাটাবেজ থেকে পাওয়া কাস্টমার অ্যারে
 */
function getCustomerDisplayName(user = {}) {
    const stored = String(user.name || '').trim();
    const fromParts = `${user.firstName || ''} ${user.lastName || ''}`.trim();
    return stored || fromParts || 'N/A';
}

function getCustomerStatusHtml(user) {
    const accountStatus = user.accountStatus || 'active';
    if (accountStatus === 'blocked') {
        return '<span class="status-badge status-blocked customers-status-badge"><i class="fa-solid fa-ban"></i> Blocked</span>';
    }
    if (accountStatus === 'suspended') {
        return '<span class="status-badge status-suspended customers-status-badge"><i class="fa-solid fa-pause"></i> Suspended</span>';
    }
    const verifyClass = user.isVerified ? 'status-verified' : 'status-pending';
    const verifyText = user.isVerified ? 'Verified' : 'Pending';
    return `<span class="status-badge ${verifyClass} customers-status-badge">${verifyText}</span>`;
}

function buildCustomerCopyCell(displayHtml, copyValue) {
    const safeCopy = escapeHtml(String(copyValue ?? ''));
    return `
        <span class="customers-copy-cell">
            <span class="customers-copy-cell__text">${displayHtml}</span>
            <button type="button" class="customers-copy-cell__btn" data-copy="${safeCopy}" onclick="copyCustomerField(this)" title="Copy to clipboard" aria-label="Copy">
                <i class="fa-regular fa-copy" aria-hidden="true"></i>
            </button>
        </span>`;
}

/** Hover-to-copy field for Live Orders — zero layout impact (button is absolutely positioned). */
function buildOrderCopyField(displayHtml, copyValue) {
    const raw = String(copyValue ?? '').trim();
    if (!raw || raw === '—') return displayHtml;

    const safeCopy = escapeHtml(raw);
    return `
        <span class="group inline-flex items-center justify-center max-w-full relative min-w-0">
            <span class="min-w-0">${displayHtml}</span>
            <button type="button"
                class="order-field-copy-btn opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer p-1 rounded hover:bg-gray-100"
                data-copy="${safeCopy}"
                onclick="copyCustomerField(this)"
                title="Copy"
                aria-label="Copy">
                <i class="fa-regular fa-copy" aria-hidden="true"></i>
            </button>
        </span>`;
}

function getOrderSearchInputEl() {
    return document.getElementById('order-search') || document.getElementById('orderSearchInput');
}

function normalizeOrderStatusKey(status) {
    return String(status || 'pending').trim().toLowerCase();
}

function getStatusSelectClass(status) {
    const key = normalizeOrderStatusKey(status);
    if (key.includes('process')) return 'processing';
    if (key.includes('ship')) return 'shipped';
    if (key.includes('deliver')) return 'delivered';
    if (key.includes('cancel')) return 'cancelled';
    if (key.includes('return')) return 'returned';
    return 'pending';
}

function orderMatchesStatusTab(order, tabStatus) {
    if (tabStatus === 'all') return true;
    const orderKey = normalizeOrderStatusKey(order.status);
    const tabKey = normalizeOrderStatusKey(tabStatus);
    if (tabKey === 'cancelled') return orderKey === 'cancelled' || orderKey === 'canceled';
    return orderKey === tabKey;
}

function orderMatchesDateFilter(order, dateValue) {
    if (!dateValue) return true;
    if (!order.createdAt) return false;
    const orderDate = new Date(order.createdAt);
    const y = orderDate.getFullYear();
    const m = String(orderDate.getMonth() + 1).padStart(2, '0');
    const d = String(orderDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}` === dateValue;
}

function buildOrderProductsSummary(items) {
    if (!Array.isArray(items) || items.length === 0) {
        return '<span class="order-products-empty">—</span>';
    }
    const first = items[0];
    const firstName = escapeHtml(first.name || 'Product');
    const extra = items.length - 1;
    if (extra <= 0) {
        return `<span class="order-products-primary">${firstName}</span>`;
    }
    return `<span class="order-products-primary">${firstName}</span> <span class="order-products-more">(+${extra} more)</span>`;
}

function buildOrderExpandedPanel(order) {
    const address = escapeHtml(order.customerAddress || '—');
    const items = Array.isArray(order.items) ? order.items : [];
    const productsHtml = items.length
        ? `<ul class="order-expanded-products">${items.map((item) =>
            `<li><strong>${escapeHtml(item.name || 'Product')}</strong> × ${Number(item.quantity) || 1}${item.variantLabel ? ` <span class="order-expanded-variant">(${escapeHtml(item.variantLabel)})</span>` : ''}</li>`
        ).join('')}</ul>`
        : '<p class="order-expanded-muted">No line items recorded.</p>';

    const subTotal = Number(order.subTotal ?? order.subtotal) || 0;
    const discountAmount = Number(order.discountAmount) || 0;
    const deliveryCharge = Number(order.deliveryCharge ?? order.shippingFee) || 0;
    const processingFee = Number(order.processingFee ?? order.payment?.processingFee) || 0;
    const grandTotal = getOrderGrandTotal(order);
    const paymentMethod = escapeHtml(order.paymentMethod || order.payment?.name || 'COD');
    const paymentStatus = escapeHtml(order.payment?.status || (order.paymentMethod === 'COD' ? 'cod' : 'unpaid'));
    const proofStatus = order.paymentProof?.status && order.paymentProof.status !== 'none'
        ? escapeHtml(order.paymentProof.status)
        : null;

    const timelineHostId = `order-timeline-${order._id}`;

    return `
        <div class="order-expanded-panel">
            <div class="order-expanded-grid">
                <div class="order-expanded-section">
                    <h4>Full Address</h4>
                    <p class="order-expanded-address">${address}</p>
                </div>
                <div class="order-expanded-section">
                    <h4>All Products</h4>
                    ${productsHtml}
                </div>
                <div class="order-expanded-section">
                    <h4>Payment Details</h4>
                    <dl class="order-expanded-payment">
                        <div><dt>Method</dt><dd>${paymentMethod}</dd></div>
                        <div><dt>Status</dt><dd>${paymentStatus}</dd></div>
                        <div><dt>Subtotal</dt><dd>${formatAdminPrice(subTotal)}</dd></div>
                        ${discountAmount > 0 ? `<div><dt>Discount</dt><dd>-${formatAdminPrice(discountAmount)}</dd></div>` : ''}
                        <div><dt>Shipping</dt><dd>${formatAdminPrice(deliveryCharge)}</dd></div>
                        ${processingFee > 0 ? `<div><dt>Processing Fee</dt><dd>${formatAdminPrice(processingFee)}</dd></div>` : ''}
                        <div><dt>Grand Total</dt><dd><strong>${formatAdminPrice(grandTotal)}</strong></dd></div>
                        ${proofStatus ? `<div><dt>Proof</dt><dd>${proofStatus}</dd></div>` : ''}
                    </dl>
                </div>
                <div class="order-expanded-section order-expanded-section--timeline">
                    <h4>Status Timeline</h4>
                    <div id="${timelineHostId}" class="order-expanded-timeline-host"></div>
                </div>
            </div>
        </div>`;
}

function hydrateOrderExpandedTimeline(orderId, status) {
    const host = document.getElementById(`order-timeline-${orderId}`);
    if (!host || !window.OrderStatusTimeline?.renderOrderStatusTimeline) return;
    window.OrderStatusTimeline.renderOrderStatusTimeline(host, status);
}

function updateOrderTabCounts() {
    const counts = {
        all: globalOrders.length,
        pending: 0,
        processing: 0,
        shipped: 0,
        delivered: 0,
        cancelled: 0
    };

    globalOrders.forEach((order) => {
        const key = normalizeOrderStatusKey(order.status);
        if (key === 'pending' || key === 'placed') counts.pending += 1;
        else if (key.includes('process')) counts.processing += 1;
        else if (key.includes('ship') && !key.includes('deliver')) counts.shipped += 1;
        else if (key.includes('deliver')) counts.delivered += 1;
        else if (key === 'cancelled' || key === 'canceled') counts.cancelled += 1;
    });

    const setCount = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(val);
    };

    setCount('count-all', counts.all);
    setCount('count-pending', counts.pending);
    setCount('count-processing', counts.processing);
    setCount('count-shipped', counts.shipped);
    setCount('count-delivered', counts.delivered);
    setCount('count-cancelled', counts.cancelled);
}

/** Address cell — inline copy control visible on row hover. */
function buildOrderAddressCopyField(address) {
    const raw = String(address ?? '').trim();
    const display = raw || '—';
    if (!raw || raw === '—') {
        return `<span class="order-address-text">${escapeHtml(display)}</span>`;
    }

    const safeCopy = escapeHtml(raw);
    return `
        <span class="group inline-flex items-center justify-start gap-1 min-w-0 max-w-full relative">
            <span class="order-address-text min-w-0">${escapeHtml(display)}</span>
            <button type="button"
                class="order-address-copy-btn opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer p-1 rounded hover:bg-gray-200 text-gray-500 shrink-0"
                data-copy="${safeCopy}"
                onclick="copyCustomerField(this)"
                title="Copy address"
                aria-label="Copy address">
                <i class="fa-regular fa-copy" aria-hidden="true"></i>
            </button>
        </span>`;
}

window.copyCustomerField = function(btn) {
    const value = btn?.getAttribute('data-copy') || '';
    if (!value) return;

    const onCopied = () => showToast('Copied!', 'success');
    const onFailed = () => showToast('Could not copy to clipboard.', 'warning');

    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(value).then(onCopied).catch(onFailed);
        return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy') ? onCopied() : onFailed();
    } catch {
        onFailed();
    } finally {
        textarea.remove();
    }
};

function renderCustomerTable(customers, totalFiltered) {
    const tbody = document.getElementById('customerTableBody');
    if (!tbody) return;

    if (customers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="loading-container">No records found.</td></tr>`;
        updateCustomersBulkToolbar();
        return;
    }

    let tableHTML = '';
    customers.forEach((user, index) => {
        const displayId = user._id ? user._id.toString().slice(-6).toUpperCase() : `USR-${index + 1}`;
        const accountStatus = user.accountStatus || 'active';
        const uid = user._id;
        const totalSpent = Number(user.totalSpent) || 0;
        const isChecked = selectedCustomerIds.has(String(uid)) ? 'checked' : '';

        let statusActionBtn = '';
        if (accountStatus === 'blocked') {
            statusActionBtn = `<button class="action-btn activate" onclick="setCustomerStatus('${uid}', 'active')" title="Unblock / Activate"><i class="fa-solid fa-unlock"></i></button>`;
        } else if (accountStatus === 'suspended') {
            statusActionBtn = `
                <button class="action-btn activate" onclick="setCustomerStatus('${uid}', 'active')" title="Reactivate"><i class="fa-solid fa-play"></i></button>
                <button class="action-btn block" onclick="setCustomerStatus('${uid}', 'blocked')" title="Block User"><i class="fa-solid fa-ban"></i></button>`;
        } else {
            statusActionBtn = `
                <button class="action-btn suspend" onclick="setCustomerStatus('${uid}', 'suspended')" title="Suspend User"><i class="fa-solid fa-pause"></i></button>
                <button class="action-btn block" onclick="setCustomerStatus('${uid}', 'blocked')" title="Block User"><i class="fa-solid fa-ban"></i></button>`;
        }

        const userIdCopy = user._id ? user._id.toString() : displayId;
        const emailDisplay = user.email || 'N/A';
        const mobileDisplay = user.mobile || 'N/A';

        tableHTML += `
            <tr class="customers-row">
                <td class="customers-td customers-td--check no-print">
                    <input type="checkbox" class="customer-row-checkbox" value="${uid}" ${isChecked} onchange="toggleCustomerSelection(this)">
                </td>
                <td class="customers-td customers-td--id">${buildCustomerCopyCell(`<b>#${escapeHtml(displayId)}</b>`, userIdCopy)}</td>
                <td class="customers-td customers-td--name"><span class="customers-name">${escapeHtml(getCustomerDisplayName(user))}${user.isVip ? ' <span class="customers-vip-crown" aria-hidden="true">👑</span>' : ''}</span></td>
                <td class="customers-td customers-td--email">${emailDisplay !== 'N/A' ? buildCustomerCopyCell(escapeHtml(emailDisplay), emailDisplay) : 'N/A'}</td>
                <td class="customers-td customers-td--mobile">${mobileDisplay !== 'N/A' ? buildCustomerCopyCell(escapeHtml(mobileDisplay), mobileDisplay) : 'N/A'}</td>
                <td class="customers-td customers-td--num">${getOrderCountBadge(user.orderCount)}</td>
                <td class="customers-td customers-td--num"><span class="spent-badge">${formatAdminPrice(totalSpent)}</span></td>
                <td class="customers-td customers-td--segment">${getCustomerSegmentBadge(user)}</td>
                <td class="customers-td customers-td--status">${getCustomerStatusHtml(user)}</td>
                <td class="col-actions customers-td customers-td--actions">
                    <div class="customer-actions-row">
                        <button type="button" class="action-btn view" onclick="viewCustomerDetails('${uid}')" title="View Profile"><i class="fa-solid fa-eye"></i></button>
                        <button type="button" class="action-btn edit" onclick="editCustomer('${uid}')" title="Edit Profile"><i class="fa-solid fa-pen-to-square"></i></button>
                        <button type="button" class="action-btn orders" onclick="viewCustomerOrders('${uid}')" title="Order History"><i class="fa-solid fa-clock-rotate-left"></i></button>
                        <button type="button" class="action-btn delete" onclick="deleteCustomer('${uid}')" title="Delete Customer Permanently"><i class="fa-solid fa-trash"></i></button>
                        ${statusActionBtn}
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = tableHTML;

    const selectAll = document.getElementById('customers-select-all');
    if (selectAll) {
        const pageBoxes = tbody.querySelectorAll('.customer-row-checkbox');
        selectAll.checked = pageBoxes.length > 0 && Array.from(pageBoxes).every(cb => cb.checked);
    }
    updateCustomersBulkToolbar();
}

window.toggleSelectAllCustomers = function(source) {
    document.querySelectorAll('.customer-row-checkbox').forEach(cb => {
        cb.checked = source.checked;
        if (source.checked) selectedCustomerIds.add(cb.value);
        else selectedCustomerIds.delete(cb.value);
    });
    updateCustomersBulkToolbar();
};

window.toggleCustomerSelection = function(checkbox) {
    if (checkbox.checked) selectedCustomerIds.add(checkbox.value);
    else selectedCustomerIds.delete(checkbox.value);
    updateCustomersBulkToolbar();
    const allChecked = Array.from(document.querySelectorAll('.customer-row-checkbox')).every(cb => cb.checked);
    const selectAll = document.getElementById('customers-select-all');
    if (selectAll) selectAll.checked = allChecked;
};

function updateCustomersBulkToolbar() {
    const toolbar = document.getElementById('customers-bulk-toolbar');
    const countEl = document.getElementById('customers-selected-count');
    const count = selectedCustomerIds.size;
    if (toolbar) toolbar.style.display = count > 0 ? 'flex' : 'none';
    if (countEl) countEl.textContent = `${count} selected`;
}

/**
 * ৬.২: কাস্টমার টেবিলে এরর মেসেজ দেখানোর ফাংশন
 * @param {string} msg - এরর মেসেজ
 */
function showCustomerError(msg) {
    const tbody = document.getElementById('customerTableBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="table-status-error">${msg}</td></tr>`;
}

/**
 * ৬.৩: কাস্টমার প্রোফাইল দেখার মোডাল
 */
window.viewCustomerDetails = async function(userId) {
    try {
        const res = await fetch(`/api/admin/customers/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();
        if (!result.success || !result.data) {
            return showToast(result.message || 'Failed to load customer.', 'error');
        }

        const u = result.data;
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? '—'; };

        set('cvName', getCustomerDisplayName(u));
        set('cvEmail', u.email);
        set('cvMobile', u.mobile);
        set('cvPhone', u.phone || 'N/A');
        set('cvVerified', u.isVerified ? 'Verified' : 'Pending');
        set('cvAccountStatus', (u.accountStatus || 'active').charAt(0).toUpperCase() + (u.accountStatus || 'active').slice(1));
        set('cvWallet', formatAdminPrice(u.walletBalance || 0));
        set('cvPoints', Number(u.loyaltyPoints || 0).toLocaleString());
        set('cvOrderCount', `${Number(u.orderCount || 0).toLocaleString()} order${Number(u.orderCount || 0) !== 1 ? 's' : ''}`);
        set('cvAddress', u.address || 'Not provided');
        set('cvJoined', u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—');

        const editFromView = document.getElementById('cvEditFromViewBtn');
        if (editFromView) {
            editFromView.onclick = () => {
                closeCustomerViewModal();
                editCustomer(userId);
            };
        }

        document.getElementById('customerViewModal').style.display = 'flex';
    } catch (e) {
        showToast('Server error loading customer profile.', 'error');
    }
};

function populateAdminUpazilaSelect(districtSelect, upazilaSelect, district, selectedUpazila = '') {
    if (!upazilaSelect) return;

    upazilaSelect.innerHTML = '<option value="">Select upazila / thana</option>';
    const resolvedDistrict = String(district || districtSelect?.value || '').trim();

    if (!resolvedDistrict) {
        upazilaSelect.disabled = true;
        upazilaSelect.value = '';
        return;
    }

    const upazilas = typeof window.getUpazilasForDistrict === 'function'
        ? window.getUpazilasForDistrict(resolvedDistrict)
        : [];

    upazilas.forEach((upazila) => {
        const option = document.createElement('option');
        option.value = upazila;
        option.textContent = upazila;
        upazilaSelect.appendChild(option);
    });

    upazilaSelect.disabled = upazilas.length === 0;
    if (selectedUpazila) upazilaSelect.value = selectedUpazila;
}

function parseCompositeAddressParts(compositeAddress = '', district = '', upazila = '') {
    const parts = String(compositeAddress || '').split(',').map((part) => part.trim()).filter(Boolean);
    let resolvedUpazila = String(upazila || '').trim();
    let resolvedDistrict = String(district || '').trim();

    if (resolvedDistrict && parts.length && parts[parts.length - 1] === resolvedDistrict) {
        parts.pop();
    }
    if (resolvedUpazila && parts.length && parts[parts.length - 1] === resolvedUpazila) {
        parts.pop();
    } else if (!resolvedUpazila && parts.length >= 1) {
        resolvedUpazila = parts[parts.length - 1];
        parts.pop();
    }

    return {
        district: resolvedDistrict,
        upazila: resolvedUpazila,
        street: parts.join(', ').trim() || String(compositeAddress || '').trim()
    };
}

function bindAdminDistrictUpazilaHandlers(districtSelect, upazilaSelect, onDistrictChange) {
    if (!districtSelect || districtSelect.dataset.boundUpazila === '1') return;
    districtSelect.dataset.boundUpazila = '1';

    districtSelect.addEventListener('change', () => {
        populateAdminUpazilaSelect(districtSelect, upazilaSelect, districtSelect.value, '');
        if (typeof onDistrictChange === 'function') onDistrictChange();
    });
}

window.closeCustomerViewModal = function() {
    const modal = document.getElementById('customerViewModal');
    if (modal) modal.style.display = 'none';
};

/**
 * ৬.৪: কাস্টমার এডিট মোডাল
 */
window.editCustomer = async function(userId) {
    try {
        const res = await fetch(`/api/admin/customers/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();
        if (!result.success || !result.data) {
            return showToast(result.message || 'Failed to load customer.', 'error');
        }

        const u = result.data;
        document.getElementById('editCustomerId').value = u._id;
        const editName = getCustomerDisplayName(u);
        document.getElementById('editCustomerName').value = editName === 'N/A' ? '' : editName;
        document.getElementById('editCustomerEmail').value = u.email || '';
        document.getElementById('editCustomerMobile').value = u.mobile || '';
        document.getElementById('editCustomerPhone').value = u.phone || '';
        document.getElementById('editCustomerVerified').value = u.isVerified ? 'true' : 'false';

        const districtSelect = document.getElementById('editCustomerDistrict');
        const upazilaSelect = document.getElementById('editCustomerUpazila');
        const fullAddressField = document.getElementById('editCustomerFullAddress');

        populateDistrictSelect(districtSelect, u.district || '');
        bindAdminDistrictUpazilaHandlers(districtSelect, upazilaSelect);

        const parsedAddress = parseCompositeAddressParts(
            u.fullAddress || u.address || '',
            u.district || '',
            u.upazila || u.thana || ''
        );
        const districtValue = u.district || parsedAddress.district || districtSelect.value || '';
        if (districtValue) districtSelect.value = districtValue;
        populateAdminUpazilaSelect(
            districtSelect,
            upazilaSelect,
            districtValue,
            u.upazila || u.thana || parsedAddress.upazila || ''
        );
        if (fullAddressField) {
            fullAddressField.value = u.fullAddress || parsedAddress.street || '';
        }

        document.getElementById('customerEditModal').style.display = 'flex';
    } catch (e) {
        showToast('Server error loading customer for edit.', 'error');
    }
};

window.closeCustomerEditModal = function() {
    const modal = document.getElementById('customerEditModal');
    if (modal) modal.style.display = 'none';
};

window.saveCustomerEdits = async function() {
    const userId = document.getElementById('editCustomerId').value;
    const name = document.getElementById('editCustomerName').value.trim();
    const email = document.getElementById('editCustomerEmail').value.trim();
    const mobile = document.getElementById('editCustomerMobile').value.replace(/\D/g, '');
    const district = document.getElementById('editCustomerDistrict')?.value?.trim() || '';
    const upazila = document.getElementById('editCustomerUpazila')?.value?.trim() || '';
    const fullAddress = document.getElementById('editCustomerFullAddress')?.value?.trim() || '';

    if (!name || !email || !mobile) {
        return showToast('Name, email, and mobile are required.', 'warning');
    }
    if (name.length < 2) {
        return showToast('Full name must be at least 2 characters.', 'warning');
    }
    if (!/^01[3-9]\d{8}$/.test(mobile)) {
        return showToast('Mobile must be a valid 11-digit Bangladeshi number.', 'warning');
    }
    if (!district) {
        return showToast('Please select a district.', 'warning');
    }
    if (!upazila) {
        return showToast('Please select an upazila / thana.', 'warning');
    }
    if (!fullAddress) {
        return showToast('Street / village / house details are required.', 'warning');
    }

    const btn = document.getElementById('saveCustomerBtn');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...'; }

    try {
        const res = await fetch(`/api/admin/customers/${userId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                name,
                email,
                mobile,
                phone: document.getElementById('editCustomerPhone').value.trim(),
                district,
                upazila,
                thana: upazila,
                fullAddress,
                isVerified: document.getElementById('editCustomerVerified').value === 'true'
            })
        });
        const result = await res.json();
        if (result.success) {
            showToast('Customer updated successfully!', 'success');
            closeCustomerEditModal();
            fetchDashboardData();
        } else {
            showToast(result.message || 'Update failed.', 'error');
        }
    } catch (e) {
        showToast('Server error while saving customer.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    }
};

/**
 * ৬.৪ক: কাস্টমার স্থায়ীভাবে ডিলিট
 */
function deleteCustomer(userId) {
    showCustomConfirm(
        'Delete Customer',
        'Are you sure you want to permanently delete this customer? This action cannot be undone.',
        async () => {
            try {
                const res = await fetch(`/api/admin/customers/${userId}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` }
                });
                const result = await res.json();
                if (result.success) {
                    selectedCustomerIds.delete(String(userId));
                    showToast(result.message || 'Customer deleted.', 'success');
                    fetchDashboardData();
                } else {
                    showToast(result.message || 'Failed to delete customer.', 'error');
                }
            } catch (e) {
                showToast('Server error deleting customer.', 'error');
            }
        },
        'danger'
    );
}
window.deleteCustomer = deleteCustomer;

/**
 * ৬.৫: Block / Suspend / Activate কাস্টমার
 */
window.setCustomerStatus = function(userId, status) {
    const labels = {
        blocked: { title: 'Block Customer', msg: 'This user will be unable to log in. Continue?', type: 'danger' },
        suspended: { title: 'Suspend Customer', msg: 'This user will be temporarily suspended from logging in. Continue?', type: 'danger' },
        active: { title: 'Activate Customer', msg: 'Restore this account to active status?', type: 'warning' }
    };
    const cfg = labels[status] || labels.active;

    showCustomConfirm(cfg.title, cfg.msg, async () => {
        try {
            const res = await fetch(`/api/admin/customers/${userId}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ status })
            });
            const result = await res.json();
            if (result.success) {
                showToast(result.message || 'Status updated.', 'success');
                fetchDashboardData();
            } else {
                showToast(result.message || 'Failed to update status.', 'error');
            }
        } catch (e) {
            showToast('Server error updating account status.', 'error');
        }
    }, cfg.type);
};

/**
 * ৬.৬: কাস্টমারের অর্ডার হিস্ট্রি মোডাল
 */
window.viewCustomerOrders = async function(userId) {
    const modal = document.getElementById('customerOrdersModal');
    const tbody = document.getElementById('customerOrdersTableBody');
    const label = document.getElementById('coCustomerLabel');

    if (modal) modal.style.display = 'flex';
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="loading-cell">Loading orders...</td></tr>';

    try {
        const res = await fetch(`/api/admin/customers/${userId}/orders`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();

        if (!result.success) {
            if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="loading-cell">${result.message || 'Failed to load orders.'}</td></tr>`;
            return;
        }

        if (label && result.customer) {
            label.textContent = `Orders for ${result.customer.name} (${result.customer.email})`;
        }

        const orders = result.data || [];
        if (!tbody) return;

        if (orders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="loading-cell" style="text-align:center;">No orders placed yet.</td></tr>';
            return;
        }

        tbody.innerHTML = orders.map(order => {
            const dateStr = order.createdAt
                ? new Date(order.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                : '—';
            const statusClass = (order.status || 'pending').toLowerCase();
            return `
                <tr>
                    <td><b>${order.orderId || 'N/A'}</b></td>
                    <td>${dateStr}</td>
                    <td><b>${formatAdminPrice(getOrderGrandTotal(order))}</b></td>
                    <td><span class="status-badge status-${statusClass === 'delivered' ? 'verified' : 'pending'}">${order.status || 'Pending'}</span></td>
                    <td>${order.paymentMethod || 'COD'}</td>
                </tr>`;
        }).join('');
    } catch (e) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="loading-cell">Server error loading orders.</td></tr>';
    }
};

window.closeCustomerOrdersModal = function() {
    const modal = document.getElementById('customerOrdersModal');
    if (modal) modal.style.display = 'none';
};



/* ==========================================================================
   CUSTOMER MESSAGES INBOX (/api/admin/messages)
   ========================================================================== */

/* shared state: adminMessagesCache lives on window (admin-core) */

/* shared state: inquiryDetailActiveId lives on window (admin-core) */

/* shared state: messagesFilterTab lives on window (admin-core) */

/* shared state: messagesSearchQuery lives on window (admin-core) */

function formatMessageDate(value) {
    if (!value) return '—';
    try {
        return new Date(value).toLocaleString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    } catch (_) {
        return String(value);
    }
}

function formatMessageListTime(value) {
    if (!value) return '—';
    try {
        const d = new Date(value);
        const now = new Date();
        if (d.toDateString() === now.toDateString()) {
            return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        }
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (_) {
        return String(value);
    }
}

function resolveMessageStatus(msg) {
    if (msg.status === 'replied' || msg.status === 'read' || msg.status === 'unread') {
        return msg.status;
    }
    return msg.isRead ? 'read' : 'unread';
}

function getMessageStatusBadge(status, uppercase = false) {
    const labels = { unread: 'Unread', read: 'Read', replied: 'Replied' };
    const classes = {
        unread: 'support-status-pill--unread',
        read: 'support-status-pill--read',
        replied: 'support-status-pill--replied'
    };
    const safeStatus = labels[status] ? status : 'unread';
    const label = uppercase ? labels[safeStatus].toUpperCase() : labels[safeStatus];
    return `<span class="support-status-pill ${classes[safeStatus]}">${label}</span>`;
}

function getCustomerInitial(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return '?';
    return trimmed.charAt(0).toUpperCase();
}

function getAvatarColor(name) {
    const palette = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#059669', '#0891b2', '#4f46e5'];
    let hash = 0;
    const str = String(name || '');
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return palette[Math.abs(hash) % palette.length];
}

function findCachedMessage(id) {
    return adminMessagesCache.find((item) => String(item.id || item._id) === String(id));
}

function formatPhoneDisplay(phone) {
    const value = String(phone || '').trim();
    return value || '—';
}

function getMessageSnippet(text, maxLen = 90) {
    const raw = String(text || '').replace(/\s+/g, ' ').trim();
    if (!raw) return 'No message content';
    return raw.length > maxLen ? `${raw.slice(0, maxLen)}…` : raw;
}

function getFilteredMessages() {
    let list = adminMessagesCache.slice();

    if (messagesFilterTab === 'unread') {
        list = list.filter((m) => resolveMessageStatus(m) === 'unread');
    } else if (messagesFilterTab === 'replied') {
        list = list.filter((m) => resolveMessageStatus(m) === 'replied');
    }

    const q = messagesSearchQuery.trim().toLowerCase();
    if (q) {
        list = list.filter((m) => {
            const name = String(m.name || '').toLowerCase();
            const email = String(m.email || '').toLowerCase();
            const subject = String(m.subject || '').toLowerCase();
            return name.includes(q) || email.includes(q) || subject.includes(q);
        });
    }

    return list;
}

function updateMessagesStats() {
    const all = adminMessagesCache.length;
    const unread = adminMessagesCache.filter((m) => resolveMessageStatus(m) === 'unread').length;
    const replied = adminMessagesCache.filter((m) => resolveMessageStatus(m) === 'replied').length;

    const allEl = document.getElementById('supportTabCountAll');
    const unreadEl = document.getElementById('supportTabCountUnread');
    const repliedEl = document.getElementById('supportTabCountReplied');

    if (allEl) allEl.textContent = String(all);
    if (unreadEl) unreadEl.textContent = String(unread);
    if (repliedEl) repliedEl.textContent = String(replied);
}

function showInquiryDetailEmpty() {
    const emptyEl = document.getElementById('inquiryDetailEmpty');
    const paneEl = document.getElementById('inquiryDetailPane');
    if (emptyEl) emptyEl.style.display = '';
    if (paneEl) paneEl.style.display = 'none';
}

function populateInquiryDetailPane(msg) {
    const emptyEl = document.getElementById('inquiryDetailEmpty');
    const paneEl = document.getElementById('inquiryDetailPane');
    if (!msg || !paneEl) {
        showInquiryDetailEmpty();
        return;
    }

    const status = resolveMessageStatus(msg);
    const phone = formatPhoneDisplay(msg.phone);
    const id = String(msg.id || msg._id);

    if (emptyEl) emptyEl.style.display = 'none';
    paneEl.style.display = 'flex';

    const subjectEl = document.getElementById('inquiryDetailSubjectLine');
    const statusEl = document.getElementById('inquiryDetailStatusBadge');
    const avatarEl = document.getElementById('inquiryDetailSenderAvatar');
    const nameEl = document.getElementById('inquiryDetailSenderName');
    const emailEl = document.getElementById('inquiryDetailEmail');
    const phoneEl = document.getElementById('inquiryDetailPhone');
    const copyEmailBtn = document.getElementById('inquiryDetailCopyEmail');
    const copyPhoneBtn = document.getElementById('inquiryDetailCopyPhone');
    const dateEl = document.getElementById('inquiryDetailDate');
    const messageEl = document.getElementById('inquiryDetailMessage');
    const sentReplyEl = document.getElementById('inquiryDetailSentReply');
    const sentReplyTextEl = document.getElementById('inquiryDetailSentReplyText');
    const sentReplyAtEl = document.getElementById('inquiryDetailSentReplyAt');
    const replyTextEl = document.getElementById('inquiryDetailReplyText');
    const charCountEl = document.getElementById('inquiryDetailCharCount');
    const markReadBtn = document.getElementById('inquiryDetailMarkReadBtn');

    if (subjectEl) subjectEl.textContent = msg.subject || '(No subject)';
    if (statusEl) statusEl.innerHTML = getMessageStatusBadge(status, true);

    if (avatarEl) {
        avatarEl.textContent = getCustomerInitial(msg.name);
        avatarEl.style.background = getAvatarColor(msg.name);
    }
    if (nameEl) nameEl.textContent = msg.name || 'Unknown';

    if (emailEl) {
        if (msg.email) {
            emailEl.href = `mailto:${msg.email}`;
            emailEl.textContent = msg.email;
        } else {
            emailEl.removeAttribute('href');
            emailEl.textContent = '—';
        }
    }
    if (copyEmailBtn) {
        copyEmailBtn.dataset.copy = msg.email || '';
        copyEmailBtn.style.display = msg.email ? '' : 'none';
    }

    if (phoneEl) {
        if (phone !== '—') {
            phoneEl.href = `tel:${phone}`;
            phoneEl.textContent = phone;
        } else {
            phoneEl.removeAttribute('href');
            phoneEl.textContent = '—';
        }
    }
    if (copyPhoneBtn) {
        copyPhoneBtn.dataset.copy = phone !== '—' ? phone : '';
        copyPhoneBtn.style.display = phone !== '—' ? '' : 'none';
    }

    if (dateEl) dateEl.textContent = formatMessageDate(msg.createdAt);
    if (messageEl) messageEl.textContent = msg.message || '—';

    if (sentReplyEl && sentReplyTextEl && sentReplyAtEl) {
        if (status === 'replied' && msg.replyMessage) {
            sentReplyEl.style.display = '';
            sentReplyTextEl.textContent = msg.replyMessage;
            sentReplyAtEl.textContent = msg.repliedAt ? `Sent ${formatMessageDate(msg.repliedAt)}` : '';
        } else {
            sentReplyEl.style.display = 'none';
            sentReplyTextEl.textContent = '';
            sentReplyAtEl.textContent = '';
        }
    }

    if (replyTextEl) {
        replyTextEl.value = '';
        replyTextEl.disabled = status === 'replied';
    }
    if (charCountEl) charCountEl.textContent = '0';

    if (markReadBtn) {
        if (status === 'replied') {
            markReadBtn.style.display = 'none';
        } else {
            markReadBtn.style.display = '';
            const isUnread = status === 'unread';
            markReadBtn.innerHTML = isUnread
                ? '<i class="fa-solid fa-envelope-open"></i><span>Mark Read</span>'
                : '<i class="fa-solid fa-envelope"></i><span>Mark Unread</span>';
            markReadBtn.title = isUnread ? 'Mark as read' : 'Mark as unread';
        }
    }

    paneEl.dataset.activeId = id;
}

function selectInquiry(id, options = {}) {
    const sid = String(id);
    const msg = findCachedMessage(sid);
    if (!msg) {
        inquiryDetailActiveId = null;
        showInquiryDetailEmpty();
        renderMessagesInbox(adminMessagesCache);
        return;
    }

    inquiryDetailActiveId = sid;
    populateInquiryDetailPane(msg);
    renderMessagesInbox(adminMessagesCache);

    if (options.markRead && resolveMessageStatus(msg) === 'unread') {
        markMessageRead(sid, true).catch((err) => showToast(err.message, 'error'));
    }
}

function clearInquirySelection() {
    inquiryDetailActiveId = null;
    showInquiryDetailEmpty();
}

function renderMessagesPage(page, limit) {
    initAdminPaginationInstances();
    const pg = messagePg;
    const effectivePage = page ?? pg?.currentPage ?? 1;
    const effectiveLimit = limit ?? pg?.currentLimit ?? 10;

    if (pg) {
        pg.currentPage = effectivePage;
        pg.currentLimit = effectiveLimit;
    }

    renderMessagesInbox(adminMessagesCache, effectivePage, effectiveLimit);
}

function updateMessagesBulkToolbar() {
    const toolbar = document.getElementById('messages-bulk-toolbar');
    const countEl = document.getElementById('messages-selected-count');
    const count = selectedMessageIds.size;
    if (toolbar) toolbar.classList.toggle('is-visible', count > 0);
    if (countEl) countEl.textContent = `${count} selected`;
}

window.toggleMessageSelection = function(id, checked) {
    const sid = String(id);
    if (checked) selectedMessageIds.add(sid);
    else selectedMessageIds.delete(sid);
    updateMessagesBulkToolbar();
};

window.bulkDeleteMessages = function() {
    const ids = Array.from(selectedMessageIds);
    if (!ids.length) return;

    showCustomConfirm('Delete Selected Messages', `Delete ${ids.length} message(s)? This cannot be undone.`, async () => {
        try {
            const results = await Promise.all(ids.map(id =>
                fetch(`/api/admin/messages/${id}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` }
                }).then(r => r.json())
            ));
            const deleted = results.filter(r => r.success).length;
            if (deleted > 0) {
                ids.forEach(id => {
                    adminMessagesCache = adminMessagesCache.filter(m => String(m.id || m._id) !== String(id));
                    selectedMessageIds.delete(String(id));
                    if (inquiryDetailActiveId === String(id)) clearInquirySelection();
                });
                updateMessagesBulkToolbar();
                if (messagePg) messagePg.stayOnPage();
                else renderMessagesInbox(adminMessagesCache);
                showToast(`${deleted} message(s) deleted.`, 'success');
            } else {
                showToast('Could not delete selected messages.', 'error');
            }
        } catch (err) {
            showToast('Server error during bulk delete.', 'error');
        }
    }, 'danger');
};

function renderMessagesInbox(messages = adminMessagesCache, page, limit) {
    const listEl = document.getElementById('messagesInboxList');
    if (!listEl) return;

    adminMessagesCache = Array.isArray(messages) ? messages.slice() : [];
    updateMessagesStats();

    const filtered = getFilteredMessages();
    initAdminPaginationInstances();

    const effectivePage = page ?? messagePg?.currentPage ?? 1;
    const effectiveLimit = limit ?? messagePg?.currentLimit ?? 10;

    if (!adminMessagesCache.length) {
        listEl.innerHTML = '<div class="support-inbox-list-empty">No messages yet.</div>';
        inquiryDetailActiveId = null;
        showInquiryDetailEmpty();
        if (messagePg) messagePg.setTotal(0);
        updateMessagesBulkToolbar();
        return;
    }

    if (!filtered.length) {
        listEl.innerHTML = '<div class="support-inbox-list-empty">No inquiries match your filters.</div>';
        if (messagePg) messagePg.setTotal(0);
        updateMessagesBulkToolbar();
        return;
    }

    if (inquiryDetailActiveId && !filtered.some((m) => String(m.id || m._id) === inquiryDetailActiveId)) {
        inquiryDetailActiveId = null;
        showInquiryDetailEmpty();
    }

    const start = (effectivePage - 1) * effectiveLimit;
    const paginated = filtered.slice(start, start + effectiveLimit);

    if (messagePg) {
        messagePg.currentPage = effectivePage;
        messagePg.currentLimit = effectiveLimit;
        messagePg.setTotal(filtered.length);
    }

    listEl.innerHTML = paginated.map((msg) => {
        const id = escapeHtml(msg.id || msg._id);
        const sid = String(msg.id || msg._id);
        const status = resolveMessageStatus(msg);
        const isActive = inquiryDetailActiveId === sid;
        const isChecked = selectedMessageIds.has(sid);
        const initial = escapeHtml(getCustomerInitial(msg.name));
        const avatarColor = getAvatarColor(msg.name);
        const snippet = escapeHtml(getMessageSnippet(msg.message));
        const subject = escapeHtml(msg.subject || '(No subject)');
        const time = escapeHtml(formatMessageListTime(msg.createdAt));

        return `
            <div class="support-inbox-list-row ${isActive ? 'is-active-row' : ''}">
                <input type="checkbox" class="message-row-checkbox" value="${id}"
                    ${isChecked ? 'checked' : ''}
                    onclick="event.stopPropagation(); toggleMessageSelection('${sid}', this.checked)"
                    aria-label="Select message">
                <button type="button"
                    class="support-inbox-list-item ${isActive ? 'is-active border-l-4 border-blue-600 bg-blue-50/60 dark:bg-slate-800' : ''} ${status === 'unread' ? 'is-unread' : ''}"
                    data-id="${id}"
                    role="option"
                    aria-selected="${isActive ? 'true' : 'false'}">
                    <span class="support-inbox-list-avatar" style="background:${avatarColor}">${initial}</span>
                    <span class="support-inbox-list-body">
                        <span class="support-inbox-list-top">
                            <strong class="support-inbox-list-name">${escapeHtml(msg.name || 'Unknown')}</strong>
                            <time class="support-inbox-list-time">${time}</time>
                        </span>
                        <span class="support-inbox-list-subject">${subject}</span>
                        <span class="support-inbox-list-snippet">${snippet}</span>
                    </span>
                </button>
            </div>`;
    }).join('');

    updateMessagesBulkToolbar();

    if (inquiryDetailActiveId) {
        const activeMsg = findCachedMessage(inquiryDetailActiveId);
        if (activeMsg) populateInquiryDetailPane(activeMsg);
    }
}

window.fetchAdminMessages = async function fetchAdminMessages() {
    const section = document.getElementById('view-messages');
    if (!section) return;

    const listEl = document.getElementById('messagesInboxList');
    const prevActive = inquiryDetailActiveId;
    if (listEl) listEl.innerHTML = '<div class="support-inbox-list-loading text-center"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';

    try {
        const res = await fetch('/api/admin/messages', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Failed to load messages.');

        inquiryDetailActiveId = prevActive;
        renderMessagesInbox(data.data || [], messagePg?.currentPage || 1, messagePg?.currentLimit || 10);

        if (prevActive && !findCachedMessage(prevActive)) {
            inquiryDetailActiveId = null;
            showInquiryDetailEmpty();
            renderMessagesInbox(adminMessagesCache);
        }
    } catch (err) {
        console.error('Messages inbox error:', err);
        if (listEl) listEl.innerHTML = `<div class="support-inbox-list-empty">${escapeHtml(err.message)}</div>`;
    }
};

async function markMessageUnread(id) {
    const res = await fetch(`/api/admin/messages/${id}/unread`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message || 'Failed to mark as unread.');

    const idx = adminMessagesCache.findIndex((m) => String(m.id || m._id) === String(id));
    if (idx >= 0 && result.data) {
        adminMessagesCache[idx] = result.data;
        if (inquiryDetailActiveId === String(id)) populateInquiryDetailPane(result.data);
        renderMessagesInbox(adminMessagesCache);
    } else {
        await fetchAdminMessages();
    }
    showToast('Marked as unread.', 'success');
}

async function markMessageRead(id, silent = false) {
    const res = await fetch(`/api/admin/messages/${id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message || 'Failed to mark as read.');

    const idx = adminMessagesCache.findIndex((m) => String(m.id || m._id) === String(id));
    if (idx >= 0 && result.data) {
        adminMessagesCache[idx] = result.data;
        if (inquiryDetailActiveId === String(id)) populateInquiryDetailPane(result.data);
        renderMessagesInbox(adminMessagesCache);
    } else {
        await fetchAdminMessages();
    }
    if (!silent) showToast('Marked as read.', 'success');
}

async function toggleDetailReadStatus() {
    if (!inquiryDetailActiveId) return;
    const msg = findCachedMessage(inquiryDetailActiveId);
    if (!msg) return;

    const status = resolveMessageStatus(msg);
    if (status === 'replied') return;

    try {
        if (status === 'unread') {
            await markMessageRead(inquiryDetailActiveId);
        } else {
            await markMessageUnread(inquiryDetailActiveId);
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function deleteMessage(id) {
    const res = await fetch(`/api/admin/messages/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message || 'Failed to delete message.');
    showToast('Message deleted.', 'success');

    if (inquiryDetailActiveId === String(id)) {
        clearInquirySelection();
    }
    selectedMessageIds.delete(String(id));
    adminMessagesCache = adminMessagesCache.filter(m => String(m.id || m._id) !== String(id));
    if (messagePg) messagePg.stayOnPage();
    else await fetchAdminMessages();
}

async function sendInquiryReply() {
    const id = inquiryDetailActiveId;
    const textarea = document.getElementById('inquiryDetailReplyText');
    const sendBtn = document.getElementById('inquiryDetailSendBtn');
    if (!id || !textarea || !sendBtn) return;

    const replyMessage = textarea.value.trim();
    if (replyMessage.length < 5) {
        showToast('Reply must be at least 5 characters.', 'warning');
        textarea.focus();
        return;
    }

    const originalBtnHtml = sendBtn.innerHTML;
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

    try {
        const res = await fetch(`/api/inquiries/${id}/reply`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ replyMessage })
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message || 'Failed to send reply.');

        const idx = adminMessagesCache.findIndex((m) => String(m.id || m._id) === String(id));
        if (idx >= 0 && result.data) {
            adminMessagesCache[idx] = result.data;
            populateInquiryDetailPane(result.data);
            renderMessagesInbox(adminMessagesCache);
        } else {
            await fetchAdminMessages();
        }

        showToast('Reply sent successfully!', 'success');
    } catch (err) {
        showToast(err.message || 'Failed to send reply.', 'error');
    } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = originalBtnHtml;
    }
}

function setMessagesFilterTab(tab) {
    messagesFilterTab = tab;
    document.querySelectorAll('.support-inbox-tab').forEach((btn) => {
        const isActive = btn.dataset.filter === tab;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    if (messagePg) messagePg.resetPage();
    renderMessagesPage(1, messagePg?.currentLimit);
}

function setupMessagesInbox() {
    document.getElementById('messagesRefreshBtn')?.addEventListener('click', fetchAdminMessages);

    document.querySelectorAll('.support-inbox-tab').forEach((btn) => {
        btn.addEventListener('click', () => setMessagesFilterTab(btn.dataset.filter || 'all'));
    });

    document.getElementById('messagesSearchInput')?.addEventListener('input', (e) => {
        messagesSearchQuery = e.target.value || '';
        if (messagePg) messagePg.resetPage();
        renderMessagesPage(1, messagePg?.currentLimit);
    });

    document.getElementById('messagesInboxList')?.addEventListener('click', (e) => {
        const item = e.target.closest('.support-inbox-list-item');
        if (!item) return;
        selectInquiry(item.dataset.id, { markRead: true });
    });

    document.getElementById('messagesInboxList')?.addEventListener('keydown', (e) => {
        const item = e.target.closest('.support-inbox-list-item');
        if (item && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            selectInquiry(item.dataset.id, { markRead: true });
        }
    });

    document.getElementById('inquiryDetailMarkReadBtn')?.addEventListener('click', () => {
        toggleDetailReadStatus();
    });

    document.getElementById('inquiryDetailDeleteBtn')?.addEventListener('click', () => {
        if (!inquiryDetailActiveId) return;
        const delId = inquiryDetailActiveId;
        showCustomConfirm('Delete message?', 'This inquiry will be permanently removed.', () => {
            deleteMessage(delId).catch((err) => showToast(err.message, 'error'));
        }, 'danger');
    });

    document.getElementById('inquiryDetailSendBtn')?.addEventListener('click', () => {
        sendInquiryReply();
    });

    document.getElementById('inquiryDetailCopyEmail')?.addEventListener('click', (e) => {
        copyCustomerField(e.currentTarget);
    });

    document.getElementById('inquiryDetailCopyPhone')?.addEventListener('click', (e) => {
        copyCustomerField(e.currentTarget);
    });

    document.getElementById('inquiryDetailReplyText')?.addEventListener('input', (e) => {
        const counter = document.getElementById('inquiryDetailCharCount');
        if (counter) counter.textContent = String(e.target.value.length);
    });
}


/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    bindAdminDistrictUpazilaHandlers,
    buildCustomerCopyCell,
    buildOrderAddressCopyField,
    buildOrderCopyField,
    buildOrderExpandedPanel,
    buildOrderProductsSummary,
    clearInquirySelection,
    deleteCustomer,
    deleteMessage,
    findCachedMessage,
    formatMessageDate,
    formatMessageListTime,
    formatPhoneDisplay,
    getAvatarColor,
    getCustomerDisplayName,
    getCustomerInitial,
    getCustomerStatusHtml,
    getFilteredMessages,
    getMessageSnippet,
    getMessageStatusBadge,
    getOrderSearchInputEl,
    getStatusSelectClass,
    hydrateOrderExpandedTimeline,
    markMessageRead,
    markMessageUnread,
    normalizeOrderStatusKey,
    orderMatchesDateFilter,
    orderMatchesStatusTab,
    parseCompositeAddressParts,
    populateAdminUpazilaSelect,
    populateInquiryDetailPane,
    renderCustomerTable,
    renderMessagesInbox,
    renderMessagesPage,
    resolveMessageStatus,
    selectInquiry,
    sendInquiryReply,
    setMessagesFilterTab,
    setupMessagesInbox,
    showCustomerError,
    showInquiryDetailEmpty,
    toggleDetailReadStatus,
    updateCustomersBulkToolbar,
    updateMessagesBulkToolbar,
    updateMessagesStats,
    updateOrderTabCounts
});

