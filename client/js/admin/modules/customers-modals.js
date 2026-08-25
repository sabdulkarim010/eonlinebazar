/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/customers-modals.js
 * Description: Customer view/edit/status modals and order-history modal.
 */
/* Dependencies: token, showToast, showCustomConfirm, getCustomerDisplayName, populateAdminUpazilaSelect, parseCompositeAddressParts (window) */
/* Exposes: window.bindAdminDistrictUpazilaHandlers, window.closeCustomerEditModal, window.closeCustomerOrdersModal, window.closeCustomerViewModal, window.deleteCustomer, window.editCustomer, window.getUpazilasForDistrict, window.parseCompositeAddressParts, window.populateAdminUpazilaSelect, window.saveCustomerEdits, window.setCustomerStatus, window.viewCustomerDetails, window.viewCustomerOrders */

import '../admin-core.js';

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

/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    bindAdminDistrictUpazilaHandlers,
    parseCompositeAddressParts,
    populateAdminUpazilaSelect
});

