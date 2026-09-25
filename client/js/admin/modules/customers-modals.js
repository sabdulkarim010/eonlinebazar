/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/customers-modals.js
 * Description: Customer view/edit/status modals and order-history modal.
 */
/* Dependencies: token, showToast, showCustomConfirm, getCustomerDisplayName, populateAdminUpazilaSelect, parseCompositeAddressParts (window) */
/* Exposes: window.bindAdminDistrictUpazilaHandlers, window.closeCustomerAvatarLightbox, window.closeCustomerEditModal, window.closeCustomerOrdersModal, window.closeCustomerViewModal, window.deleteCustomer, window.editCustomer, window.getUpazilasForDistrict, window.openCustomerAvatarLightbox, window.parseCompositeAddressParts, window.populateAdminUpazilaSelect, window.removeCustomerAvatar, window.saveCustomerEdits, window.setCustomerStatus, window.triggerCustomerAvatarUpload, window.viewCustomerDetails, window.viewCustomerOrders */

import '../admin-core.js';

const CUSTOMER_AVATAR_PALETTE = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#059669', '#0891b2', '#4f46e5', '#0f766e'];

const parseCustomerApiResponse = (res, fallbackMessage) =>
    window.parseCustomerApiResponse(res, fallbackMessage);

const refreshCustomerListAfterChange = () => window.refreshCustomerListAfterChange();

const CUSTOMER_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function resolveCustomerActionId(rawId, record = null) {
    if (typeof window.getCustomerPrimaryKey === 'function') {
        const fromRecord = record ? window.getCustomerPrimaryKey(record) : '';
        if (fromRecord) return fromRecord;
    }
    const id = String(rawId || '').trim();
    if (!id || CUSTOMER_EMAIL_PATTERN.test(id)) return '';
    return id;
}

function customerApiPath(rawId, suffix = '') {
    const id = resolveCustomerActionId(rawId);
    if (!id) return '';
    const tail = suffix ? (suffix.startsWith('/') ? suffix : `/${suffix}`) : '';
    return `/api/admin/customers/${encodeURIComponent(id)}${tail}`;
}
const CUSTOMER_AVATAR_MAX_BYTES = 5 * 1024 * 1024;

let viewedCustomer = null;

function getCustomerAvatarUrl(customer = {}) {
    const candidates = [
        customer.profilePicture,
        customer.avatar,
        customer.avatarUrl,
        customer.profileImage
    ];
    for (const value of candidates) {
        const url = String(value || '').trim();
        if (url) return url;
    }
    return '';
}

function getCustomerAvatarInitial(name = '') {
    const trimmed = String(name || '').trim();
    if (!trimmed || trimmed === 'N/A') return '?';
    return trimmed.charAt(0).toUpperCase();
}

function getCustomerAvatarColor(userId = '') {
    const seed = String(userId || '');
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    return CUSTOMER_AVATAR_PALETTE[Math.abs(hash) % CUSTOMER_AVATAR_PALETTE.length];
}

function appendCustomerAvatarOverlay(mount) {
    const overlay = document.createElement('span');
    overlay.className = 'customer-profile-avatar-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '<i class="fa-solid fa-expand"></i>';
    mount.appendChild(overlay);
}

function paintCustomerAvatar(mount, customer = {}, options = {}) {
    if (!mount) return;

    const withOverlay = !!options.withOverlay;
    const ariaLabelPrefix = options.ariaLabelPrefix || 'Photo of';
    const name = getCustomerDisplayName(customer);
    const initial = getCustomerAvatarInitial(name);
    const color = getCustomerAvatarColor(customer._id || customer.id || name);
    const pictureUrl = getCustomerAvatarUrl(customer);

    const showInitial = () => {
        mount.replaceChildren();
        mount.style.background = color;
        mount.removeAttribute('data-has-photo');
        const letter = document.createElement('span');
        letter.className = 'customer-profile-avatar-initial';
        letter.textContent = initial;
        mount.appendChild(letter);
        if (withOverlay) appendCustomerAvatarOverlay(mount);
        mount.setAttribute('aria-label', `${ariaLabelPrefix} ${name}`);
    };

    if (!pictureUrl) {
        showInitial();
        return;
    }

    mount.replaceChildren();
    mount.style.background = '#e2e8f0';
    mount.setAttribute('data-has-photo', 'true');
    const img = document.createElement('img');
    img.src = pictureUrl;
    img.alt = name;
    img.className = 'customer-profile-avatar-img';
    img.addEventListener('error', showInitial, { once: true });
    mount.appendChild(img);
    if (withOverlay) appendCustomerAvatarOverlay(mount);
    mount.setAttribute('aria-label', `${ariaLabelPrefix} ${name}`);
}

function renderCustomerProfileAvatar(customer = {}) {
    paintCustomerAvatar(document.getElementById('cvAvatar'), customer, {
        withOverlay: true,
        ariaLabelPrefix: 'View or update photo for'
    });
}

function renderCustomerEditAvatar(customer = {}) {
    paintCustomerAvatar(document.getElementById('editCustomerAvatar'), customer, {
        withOverlay: false,
        ariaLabelPrefix: 'Photo of'
    });
}

function renderCustomerAvatarLightboxPreview(customer = {}) {
    const preview = document.getElementById('cvAvatarLightboxPreview');
    const nameEl = document.getElementById('cvAvatarLightboxName');
    const removeBtn = document.getElementById('cvAvatarRemoveBtn');
    if (!preview) return;

    const name = getCustomerDisplayName(customer);
    const pictureUrl = getCustomerAvatarUrl(customer);
    const color = getCustomerAvatarColor(customer._id || customer.id || name);

    if (nameEl) nameEl.textContent = name === 'N/A' ? '' : name;

    preview.replaceChildren();
    if (pictureUrl) {
        preview.style.background = '#e2e8f0';
        const img = document.createElement('img');
        img.src = pictureUrl;
        img.alt = `${name} profile photo`;
        img.addEventListener('error', () => {
            preview.replaceChildren();
            const fallback = document.createElement('div');
            fallback.className = 'customer-avatar-lightbox-preview-initial';
            fallback.style.background = color;
            fallback.textContent = getCustomerAvatarInitial(name);
            preview.appendChild(fallback);
        }, { once: true });
        preview.appendChild(img);
    } else {
        const fallback = document.createElement('div');
        fallback.className = 'customer-avatar-lightbox-preview-initial';
        fallback.style.background = color;
        fallback.textContent = getCustomerAvatarInitial(name);
        preview.appendChild(fallback);
    }

    if (removeBtn) {
        removeBtn.disabled = !pictureUrl;
        removeBtn.style.display = pictureUrl ? '' : 'none';
    }
}

function applyCustomerAvatarState(url, publicId) {
    if (!viewedCustomer) return;
    const nextUrl = String(url || '').trim();
    viewedCustomer.avatar = nextUrl;
    viewedCustomer.avatarUrl = nextUrl || null;
    viewedCustomer.profilePicture = nextUrl;
    viewedCustomer.profileImage = nextUrl;
    if (publicId !== undefined) viewedCustomer.avatarPublicId = publicId || '';

    if (Array.isArray(window.allCustomers)) {
        const row = window.allCustomers.find((c) => String(c._id) === String(viewedCustomer._id));
        if (row) {
            row.avatar = viewedCustomer.avatar;
            row.avatarUrl = viewedCustomer.avatarUrl;
            row.profilePicture = nextUrl;
            row.profileImage = nextUrl;
        }
    }

    renderCustomerProfileAvatar(viewedCustomer);
    renderCustomerAvatarLightboxPreview(viewedCustomer);
    renderCustomerEditAvatar(viewedCustomer);
}

function bindCustomerAvatarLightboxOnce() {
    const input = document.getElementById('cvAvatarFileInput');
    if (input && input.dataset.bound !== '1') {
        input.dataset.bound = '1';
        input.addEventListener('change', onCustomerAvatarFileSelected);
    }
    if (document.body.dataset.customerAvatarEscBound === '1') return;
    document.body.dataset.customerAvatarEscBound = '1';
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (document.querySelector('.swal2-container')) return;
        window.closeCustomerAvatarLightbox();
    });
}

function setCustomerAvatarUploadBusy(isBusy) {
    const uploadBtn = document.getElementById('cvAvatarUploadBtn');
    const removeBtn = document.getElementById('cvAvatarRemoveBtn');
    if (uploadBtn) {
        uploadBtn.disabled = !!isBusy;
        uploadBtn.innerHTML = isBusy
            ? '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...'
            : '<i class="fa-solid fa-cloud-arrow-up"></i> Upload New Image';
    }
    if (removeBtn && getCustomerAvatarUrl(viewedCustomer || {})) {
        removeBtn.disabled = !!isBusy;
    }
}

async function onCustomerAvatarFileSelected(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file || !viewedCustomer?._id) return;

    if (!String(file.type || '').startsWith('image/')) {
        return showToast('Please choose an image file.', 'warning');
    }
    if (file.size > CUSTOMER_AVATAR_MAX_BYTES) {
        return showToast('Image size should be less than 5MB.', 'warning');
    }

    const formData = new FormData();
    formData.append('avatar', file);
    setCustomerAvatarUploadBusy(true);

    try {
        const avatarId = resolveCustomerActionId(viewedCustomer._id, viewedCustomer);
        if (!avatarId) {
            return showToast('Invalid customer ID — cannot upload photo.', 'error');
        }

        const res = await fetch(`/api/admin/users/${encodeURIComponent(avatarId)}/avatar`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const result = await res.json();
        if (!result.success) {
            return showToast(result.message || 'Failed to update photo.', 'error');
        }
        applyCustomerAvatarState(result.avatarUrl || result.data?.avatar, result.data?.avatarPublicId);
        showToast(result.message || 'Customer photo updated.', 'success');
    } catch (err) {
        showToast('Server error while uploading photo.', 'error');
    } finally {
        setCustomerAvatarUploadBusy(false);
    }
}

window.openCustomerAvatarLightbox = function() {
    if (!viewedCustomer) return;
    bindCustomerAvatarLightboxOnce();
    renderCustomerAvatarLightboxPreview(viewedCustomer);
    const lightbox = document.getElementById('customerAvatarLightbox');
    if (lightbox) lightbox.style.display = 'flex';
};

window.closeCustomerAvatarLightbox = function() {
    const lightbox = document.getElementById('customerAvatarLightbox');
    if (lightbox) lightbox.style.display = 'none';
};

window.triggerCustomerAvatarUpload = function() {
    const input = document.getElementById('cvAvatarFileInput');
    if (input) input.click();
};

window.removeCustomerAvatar = async function() {
    if (!viewedCustomer?._id || !getCustomerAvatarUrl(viewedCustomer)) return;

    let confirmed = false;
    if (typeof window.Swal === 'object' && typeof window.Swal.fire === 'function') {
        confirmed = (await Swal.fire({
            title: 'Remove profile photo?',
            text: "This will permanently remove the customer's profile picture.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, remove',
            cancelButtonText: 'Cancel',
            confirmButtonColor: '#ef4444',
            customClass: { container: 'customer-avatar-swal' }
        })).isConfirmed;
    }

    if (!confirmed) return;

    const removeBtn = document.getElementById('cvAvatarRemoveBtn');
    const originalHtml = removeBtn ? removeBtn.innerHTML : '';
    if (removeBtn) {
        removeBtn.disabled = true;
        removeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Removing...';
    }

    try {
        const avatarId = resolveCustomerActionId(viewedCustomer._id, viewedCustomer);
        if (!avatarId) {
            return showToast('Invalid customer ID — cannot remove photo.', 'error');
        }

        const res = await fetch(`/api/admin/users/${encodeURIComponent(avatarId)}/avatar`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();
        if (!result.success) {
            return showToast(result.message || 'Failed to remove photo.', 'error');
        }
        applyCustomerAvatarState('', '');
        showToast(result.message || 'Customer photo removed.', 'success');
    } catch (err) {
        showToast('Server error while removing photo.', 'error');
    } finally {
        if (removeBtn) {
            removeBtn.innerHTML = originalHtml || '<i class="fa-solid fa-trash"></i> Remove Image';
        }
        renderCustomerAvatarLightboxPreview(viewedCustomer || {});
    }
};

window.viewCustomerDetails = async function(userId) {
    try {
        const customerPath = customerApiPath(userId);
        if (!customerPath) {
            return showToast('Invalid customer ID — cannot load profile.', 'error');
        }

        const res = await fetch(customerPath, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const { ok, result, message } = await parseCustomerApiResponse(res, 'Failed to load customer.');
        if (!ok || !result.success || !result.data) {
            return showToast(message || result.message || 'Failed to load customer.', 'error');
        }

        const u = result.data;
        const resolvedId = resolveCustomerActionId(userId, u);
        viewedCustomer = u;
        bindCustomerAvatarLightboxOnce();
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? '—'; };

        renderCustomerProfileAvatar(u);
        set('cvName', getCustomerDisplayName(u));
        set('cvEmail', u.email);
        set('cvMobile', u.mobile);
        set('cvPhone', u.phone || 'N/A');
        set('cvVerified', u.isVerified ? 'Verified' : 'Pending');
        set('cvAccountStatus', (u.accountStatus || 'active').charAt(0).toUpperCase() + (u.accountStatus || 'active').slice(1));
        set('cvWallet', formatAdminPrice(u.walletBalance || 0));
        const rfmEl = document.getElementById('cvRfmSegment');
        if (rfmEl) {
            rfmEl.innerHTML = typeof window.getRfmSegmentBadge === 'function'
                ? (window.getRfmSegmentBadge(u) || '—')
                : (u.rfmSegment || '—');
        }
        set('cvPoints', Number(u.loyaltyPoints || 0).toLocaleString());
        const tierEl = document.getElementById('cvTier');
        if (tierEl) {
            tierEl.innerHTML = typeof getCustomerTierBadge === 'function'
                ? getCustomerTierBadge(u)
                : (u.loyaltyTier || 'none');
        }
        set('cvLifetimeSpend', formatAdminPrice(Number(u.lifetimeSpend) || 0));
        set('cvTierCashback', `${Number(u.tierCashbackRate || 0).toFixed(1)}%`);
        set('cvTierUpgraded', u.tierUpgradedAt
            ? new Date(u.tierUpgradedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
            : '—');
        set('cvOrderCount', `${Number(u.orderCount || 0).toLocaleString()} order${Number(u.orderCount || 0) !== 1 ? 's' : ''}`);
        set('cvAddress', u.address || 'Not provided');
        set('cvJoined', u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—');

        renderCustomerWalletAdjust(u);
        await loadCustomerWalletHistory(resolvedId || userId);

        const editFromView = document.getElementById('cvEditFromViewBtn');
        if (editFromView) {
            editFromView.onclick = () => {
                closeCustomerViewModal();
                editCustomer(resolvedId || userId);
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
    if (typeof window.closeCustomerAvatarLightbox === 'function') {
        window.closeCustomerAvatarLightbox();
    }
    viewedCustomer = null;
    const modal = document.getElementById('customerViewModal');
    if (modal) modal.style.display = 'none';
};

/**
 * ৬.৪: কাস্টমার এডিট মোডাল
 */
window.editCustomer = async function(userId) {
    try {
        const customerPath = customerApiPath(userId);
        if (!customerPath) {
            return showToast('Invalid customer ID — cannot edit profile.', 'error');
        }

        const res = await fetch(customerPath, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const { ok, result, message } = await parseCustomerApiResponse(res, 'Failed to load customer.');
        if (!ok || !result.success || !result.data) {
            return showToast(message || result.message || 'Failed to load customer.', 'error');
        }

        const u = result.data;
        const resolvedId = resolveCustomerActionId(userId, u);
        document.getElementById('editCustomerId').value = resolvedId || u._id;
        const editName = getCustomerDisplayName(u);
        renderCustomerEditAvatar(u);
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

    const savePath = customerApiPath(userId);
    if (!savePath) {
        return showToast('Invalid customer ID — cannot save changes.', 'error');
    }

    try {
        const res = await fetch(savePath, {
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
        const { ok, result, message } = await parseCustomerApiResponse(res, 'Update failed.');
        if (ok && result.success) {
            showToast('Customer updated successfully!', 'success');
            closeCustomerEditModal();
            await refreshCustomerListAfterChange();
        } else {
            showToast(message || result.message || 'Update failed.', 'error');
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
    const resolvedId = resolveCustomerActionId(userId);
    if (!resolvedId) {
        showToast('Invalid customer ID — cannot delete this row.', 'error');
        return;
    }

    showCustomConfirm(
        'Delete Customer',
        'Are you sure you want to permanently delete this customer? This action cannot be undone.',
        async () => {
            try {
                const deletePath = customerApiPath(resolvedId);
                if (!deletePath) {
                    showToast('Invalid customer ID — cannot delete this row.', 'error');
                    return;
                }

                const res = await fetch(deletePath, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` }
                });
                const { ok, result, message } = await parseCustomerApiResponse(res, 'Failed to delete customer.');
                if (ok && result.success) {
                    selectedCustomerIds.delete(String(resolvedId));
                    if (typeof window.closeCustomerViewModal === 'function') {
                        window.closeCustomerViewModal();
                    }
                    showToast(result.message || 'Customer deleted.', 'success');
                    await refreshCustomerListAfterChange();
                } else {
                    showToast(message || result.message || 'Failed to delete customer.', 'error');
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

    const resolvedId = resolveCustomerActionId(userId);
    if (!resolvedId) {
        showToast('Invalid customer ID — cannot update status.', 'error');
        return;
    }

    showCustomConfirm(cfg.title, cfg.msg, async () => {
        try {
            const statusPath = customerApiPath(resolvedId, 'status');
            if (!statusPath) {
                showToast('Invalid customer ID — cannot update status.', 'error');
                return;
            }

            const res = await fetch(statusPath, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ status })
            });
            const { ok, result, message } = await parseCustomerApiResponse(res, 'Failed to update status.');
            if (ok && result.success) {
                showToast(result.message || 'Status updated.', 'success');
                await refreshCustomerListAfterChange();
            } else {
                showToast(message || result.message || 'Failed to update status.', 'error');
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
        const ordersPath = customerApiPath(userId, 'orders');
        if (!ordersPath) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="loading-cell">Invalid customer ID.</td></tr>';
            return;
        }

        const res = await fetch(ordersPath, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const { ok, result, message } = await parseCustomerApiResponse(res, 'Failed to load orders.');

        if (!ok || !result.success) {
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="5" class="loading-cell">${message || result.message || 'Failed to load orders.'}</td></tr>`;
            }
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

async function loadCustomerWalletHistory(userId) {
    const host = document.getElementById('cvWalletHistoryBody');
    if (!host) return;
    host.innerHTML = '<p class="cv-wallet-history-empty">Loading transactions…</p>';

    const path = customerApiPath(userId, 'wallet/transactions');
    if (!path) {
        host.innerHTML = '<p class="cv-wallet-history-empty">Invalid customer ID.</p>';
        return;
    }

    try {
        const res = await fetch(`${path}?limit=20`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success || !data.data) {
            host.innerHTML = '<p class="cv-wallet-history-empty">Could not load wallet history.</p>';
            return;
        }

        const rows = Array.isArray(data.data.transactions) ? data.data.transactions : [];
        if (!rows.length) {
            host.innerHTML = '<p class="cv-wallet-history-empty">No wallet transactions yet.</p>';
            return;
        }

        host.innerHTML = `
            <table class="cv-wallet-history-table">
                <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Note</th></tr></thead>
                <tbody>
                    ${rows.map((row) => {
                        const type = String(row.type || row.direction || 'credit').toLowerCase();
                        const amount = Number(row.amount) || 0;
                        const when = row.createdAt || row.date
                            ? new Date(row.createdAt || row.date).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : '—';
                        const sign = type.includes('debit') || amount < 0 ? '-' : '+';
                        return `<tr>
                            <td>${escapeHtml(when)}</td>
                            <td>${escapeHtml(type)}</td>
                            <td>${sign}৳${Math.abs(amount).toLocaleString('en-US')}</td>
                            <td>${escapeHtml(row.description || row.note || row.reason || '—')}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>`;
    } catch (err) {
        console.error('wallet history load failed:', err);
        host.innerHTML = '<p class="cv-wallet-history-empty">Failed to load wallet history.</p>';
    }
}

function renderCustomerWalletAdjust(customer) {
    const host = document.getElementById('cvWalletAdjustHost');
    const customerKey = resolveCustomerActionId(customer?._id, customer);
    if (!host || !customerKey) {
        if (host) host.innerHTML = '';
        return;
    }

    const balance = Number(customer.walletBalance) || 0;
    const safeKey = escapeHtml(customerKey);
    host.innerHTML = `
        <div class="wallet-adjust-section">
            <div class="wallet-adjust-title">💰 Wallet Balance: ৳${balance.toLocaleString()}</div>
            <div class="wallet-adjust-row">
                <select id="walletAdjustType" class="wallet-adjust-select">
                    <option value="credit">+ Credit</option>
                    <option value="debit">- Debit</option>
                </select>
                <input type="number" id="walletAdjustAmount" class="wallet-adjust-input" placeholder="Amount (৳)" min="0" step="0.01">
                <input type="text" id="walletAdjustNote" class="wallet-adjust-note" placeholder="Reason">
                <button type="button" class="wallet-adjust-btn" data-wallet-customer-id="${safeKey}" onclick="adjustWalletBalance(this.dataset.walletCustomerId)">Apply</button>
            </div>
        </div>`;
}

window.adjustWalletBalance = async function adjustWalletBalance(userId) {
    const type = document.getElementById('walletAdjustType')?.value;
    const amount = document.getElementById('walletAdjustAmount')?.value;
    const note = document.getElementById('walletAdjustNote')?.value;

    if (!amount || Number(amount) <= 0 || !String(note || '').trim()) {
        showToast('Amount and reason are required.', 'error');
        return;
    }

    const resolvedId = resolveCustomerActionId(userId);
    if (!resolvedId) {
        showToast('Invalid customer ID — cannot adjust wallet.', 'error');
        return;
    }

    try {
        const walletPath = customerApiPath(resolvedId, 'wallet');
        const res = await fetch(walletPath, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ amount: Number(amount), type, description: note.trim() })
        });
        const { ok, result: data, message } = await parseCustomerApiResponse(res, 'Wallet adjustment failed.');

        if (ok && data.success) {
            showToast(`Wallet ${type === 'credit' ? 'credited' : 'debited'} by ৳${Number(amount).toLocaleString()}. New balance: ৳${Number(data.newBalance || 0).toLocaleString()}`, 'success');
            if (viewedCustomer && String(viewedCustomer._id) === String(userId)) {
                viewedCustomer.walletBalance = data.newBalance;
                const walletEl = document.getElementById('cvWallet');
                if (walletEl) walletEl.textContent = formatAdminPrice(data.newBalance || 0);
                if (viewedCustomer) {
                    viewedCustomer.walletBalance = data.newBalance;
                    loadCustomerWalletHistory(resolvedId);
                }
                renderCustomerWalletAdjust(viewedCustomer);
            }
            await refreshCustomerListAfterChange();
        } else {
            showToast(message || data.message || 'Wallet adjustment failed.', 'error');
        }
    } catch (err) {
        console.error('adjustWalletBalance error:', err);
        showToast('Network error adjusting wallet.', 'error');
    }
};

/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    adjustWalletBalance: window.adjustWalletBalance,
    bindAdminDistrictUpazilaHandlers,
    loadCustomerWalletHistory,
    parseCompositeAddressParts,
    populateAdminUpazilaSelect,
    renderCustomerWalletAdjust
});

