/**
 * Profile Addresses
 * Barrel: client/js/profile.js
 *
 * Globals used from other modules:
 *  * - profileAuthToken
 * - escapeHtml
 * - showToast
 *
 * Globals this module exposes:
 *  * - populateAddressDistrictOptions
 * - populateAddressUpazilaOptions
 * - formatSavedAddressDisplay
 * - openAddressModal
 * - closeAddressModal
 * - fetchAddresses
 * - renderAddresses
 */

document.addEventListener('DOMContentLoaded', () => {
    const token = window.profileAuthToken;
    if (!token) return;
    const escapeHtml = window.profileEscapeHtml;
    const safeImg = window.profileSafeImg;
    const bindImgFallback = window.profileBindImgFallback;
    const setAvatarSrc = window.profileSetAvatarSrc;
    const IMAGE_PLACEHOLDER = window.profileImagePlaceholder;
    const AVATAR_PLACEHOLDER = window.profileAvatarPlaceholder;
    const IMG_ONERROR = window.profileImgOnerror;
    const showToast = window.profileShowToast;
    const showInlineFeedback = window.profileShowInlineFeedback;
    const currentUserId = window.profileCurrentUserId;
    let currentUser = window.profileCurrentUser;


    // =================================================================
    // ১৫. ঠিকানা ম্যানেজমেন্ট (Addresses CRUD + Modal)
    // =================================================================
    const addressModal = document.getElementById('address-modal');
    const addressForm = document.getElementById('address-form');
    const addressModalTitle = document.getElementById('address-modal-title');
    const addressDistrict = document.getElementById('address-district');
    const addressUpazila = document.getElementById('address-upazila');
    let addressLocationPair = null;

    function populateAddressDistrictOptions(selectedDistrict = '') {
        if (!addressLocationPair) {
            addressLocationPair = window.initDistrictUpazilaPair({
                districtSelectId: 'address-district',
                upazilaSelectId: 'address-upazila',
                districtPlaceholder: 'Select district',
                upazilaPlaceholder: 'Select upazila / thana',
                initialDistrict: selectedDistrict || ''
            });
        }
        if (addressLocationPair) {
            addressLocationPair.districtSelect.setValue(selectedDistrict || '');
            addressLocationPair.populateUpazila(selectedDistrict || '', '');
        }
    }

    function populateAddressUpazilaOptions(district, selectedUpazila = '') {
        if (!addressLocationPair) {
            populateAddressDistrictOptions(district);
        }
        if (addressLocationPair) {
            addressLocationPair.populateUpazila(district, selectedUpazila);
        }
    }

    function formatSavedAddressDisplay(addr = {}) {
        return buildCompositeAddress({
            fullAddress: addr.fullAddress || '',
            upazila: addr.upazilaOrThana || addr.upazila || addr.thana || '',
            district: addr.district || ''
        }) || addr.fullAddress || '';
    }

    populateAddressDistrictOptions();

    const boundAddressDistrict = document.getElementById('address-district');
    if (boundAddressDistrict) {
        boundAddressDistrict.addEventListener('change', () => {
            populateAddressUpazilaOptions(boundAddressDistrict.value);
        });
    }

    function openAddressModal(editData = null) {
        if (!addressModal) return;
        const idField = document.getElementById('address-id');
        const labelField = document.getElementById('address-label');
        const phoneField = document.getElementById('address-phone');
        const fullField = document.getElementById('address-full');
        const defaultField = document.getElementById('address-default');

        if (editData) {
            addressModalTitle.textContent = 'Edit Address';
            idField.value = editData._id;
            labelField.value = editData.label || '';
            phoneField.value = editData.phone || '';
            fullField.value = editData.fullAddress || '';
            defaultField.checked = !!editData.isDefault;
            populateAddressDistrictOptions(editData.district || '');
            populateAddressUpazilaOptions(
                editData.district || '',
                editData.upazilaOrThana || editData.upazila || editData.thana || ''
            );
        } else {
            addressModalTitle.textContent = 'Add New Address';
            addressForm.reset();
            idField.value = '';
            populateAddressDistrictOptions();
            populateAddressUpazilaOptions('', '');
        }
        addressModal.classList.remove('hidden');
    }

    function closeAddressModal() {
        if (addressModal) addressModal.classList.add('hidden');
    }

    const addAddressCard = document.getElementById('add-address-card');
    if (addAddressCard) addAddressCard.addEventListener('click', () => openAddressModal());

    const closeAddressBtn = document.getElementById('close-address-modal');
    const cancelAddressBtn = document.getElementById('cancel-address-btn');
    if (closeAddressBtn) closeAddressBtn.addEventListener('click', closeAddressModal);
    if (cancelAddressBtn) cancelAddressBtn.addEventListener('click', closeAddressModal);
    if (addressModal) {
        addressModal.addEventListener('click', (e) => { if (e.target === addressModal) closeAddressModal(); });
    }

    async function fetchAddresses() {
        const grid = document.getElementById('address-grid');
        if (!grid) return;
        try {
            const res = await fetch('/api/customer/addresses', {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (res.ok && data.success) {
                renderAddresses(data.addresses || []);
            }
        } catch (error) {
            console.error('Fetch Addresses Error:', error);
        }
    }

    function renderAddresses(addresses) {
        const grid = document.getElementById('address-grid');
        if (!grid) return;

        // "Add New Address" কার্ডটি রেখে বাকি কার্ড রিসেট করা
        grid.querySelectorAll('.address-card').forEach(el => el.remove());

        const addCard = document.getElementById('add-address-card');
        addresses.forEach(addr => {
            const displayAddress = formatSavedAddressDisplay(addr);
            const card = document.createElement('div');
            card.className = 'card address-card profile-panel-inner-card' + (addr.isDefault ? ' active' : '');
            card.innerHTML = `
                <span class="address-tag">
                    <i class="fa-solid fa-location-dot"></i> ${escapeHtml(addr.label || 'Address')}${addr.isDefault ? ' (Default)' : ''}
                </span>
                <p class="address-text">${escapeHtml(displayAddress)}</p>
                ${addr.phone ? `<p class="address-phone-text"><i class="fa-solid fa-phone"></i> ${escapeHtml(addr.phone)}</p>` : ''}
                <div class="address-card-actions">
                    ${!addr.isDefault ? `<button class="btn-address-default" data-id="${addr._id}" title="Set as default delivery address"><i class="fa-solid fa-star"></i> Set Default</button>` : ''}
                    <button class="btn-address-edit" data-id="${addr._id}"><i class="fa-regular fa-pen-to-square"></i> Edit</button>
                    <button class="btn-address-delete" data-id="${addr._id}"><i class="fa-regular fa-trash-can"></i> Delete</button>
                </div>
            `;
            card._addressData = addr;
            grid.insertBefore(card, addCard);
        });
    }

    // অ্যাড্রেস এডিট / ডিলিট (ইভেন্ট ডেলিগেশন)
    document.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.btn-address-edit');
        const deleteBtn = e.target.closest('.btn-address-delete');
        const defaultBtn = e.target.closest('.btn-address-default');

        if (editBtn) {
            const card = editBtn.closest('.address-card');
            if (card && card._addressData) openAddressModal(card._addressData);
        }

        if (deleteBtn) {
            const addressId = deleteBtn.getAttribute('data-id');
            if (!confirm('Delete this address?')) return;
            try {
                const res = await fetch(`/api/customer/addresses/${addressId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    showToast('Address deleted.', 'success');
                    renderAddresses(data.addresses || []);
                } else {
                    showToast(data.message || 'Failed to delete.', 'danger');
                }
            } catch (error) {
                console.error('Delete Address Error:', error);
                showToast('Server error.', 'danger');
            }
        }

        if (defaultBtn) {
            const card = defaultBtn.closest('.address-card');
            const addr = card?._addressData;
            if (!addr) return;

            try {
                const res = await fetch(`/api/customer/addresses/${addr._id}`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        label: addr.label || 'Home',
                        phone: addr.phone || '',
                        district: addr.district || '',
                        upazilaOrThana: addr.upazilaOrThana || addr.upazila || addr.thana || '',
                        fullAddress: addr.fullAddress || '',
                        isDefault: true
                    })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    showToast('Default address updated.', 'success');
                    renderAddresses(data.addresses || []);
                    const defaultAddress = (data.addresses || []).find((item) => item.isDefault);
                    if (defaultAddress) {
                        applyProfileAddressToUI({
                            district: defaultAddress.district,
                            upazila: defaultAddress.upazilaOrThana,
                            fullAddress: defaultAddress.fullAddress,
                            phone: defaultAddress.phone
                        });
                        cacheProfileAddressForCheckout({
                            name: profileName?.value || '',
                            phone: defaultAddress.phone || profilePhone?.value || '',
                            district: defaultAddress.district,
                            upazila: defaultAddress.upazilaOrThana,
                            fullAddress: defaultAddress.fullAddress
                        });
                    }
                } else {
                    showToast(data.message || 'Failed to set default address.', 'danger');
                }
            } catch (error) {
                console.error('Set Default Address Error:', error);
                showToast('Server error.', 'danger');
            }
        }
    });

    if (addressForm) {
        addressForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const addressId = document.getElementById('address-id').value;
            const district = document.getElementById('address-district')?.value?.trim() || '';
            const upazilaOrThana = document.getElementById('address-upazila')?.value?.trim() || '';
            const payload = {
                label: document.getElementById('address-label').value.trim(),
                phone: document.getElementById('address-phone').value.trim(),
                district,
                upazilaOrThana,
                fullAddress: document.getElementById('address-full').value.trim(),
                isDefault: document.getElementById('address-default').checked
            };

            if (!district) {
                showToast('Please select a district.', 'warning');
                return;
            }
            if (!upazilaOrThana) {
                showToast('Please select an upazila / thana.', 'warning');
                return;
            }
            if (!payload.fullAddress) {
                showToast('Street / village / house details are required.', 'warning');
                return;
            }

            const saveBtn = document.getElementById('save-address-btn');
            const originalText = saveBtn.innerHTML;
            saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
            saveBtn.disabled = true;

            try {
                const url = addressId ? `/api/customer/addresses/${addressId}` : '/api/customer/addresses';
                const method = addressId ? 'PUT' : 'POST';
                const res = await fetch(url, {
                    method,
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();

                saveBtn.innerHTML = originalText;
                saveBtn.disabled = false;

                if (res.ok && data.success) {
                    showToast(data.message || 'Address saved!', 'success');
                    renderAddresses(data.addresses || []);
                    closeAddressModal();

                    if (payload.isDefault) {
                        const defaultAddress = (data.addresses || []).find((item) => item.isDefault);
                        if (defaultAddress) {
                            applyProfileAddressToUI({
                                district: defaultAddress.district,
                                upazila: defaultAddress.upazilaOrThana,
                                fullAddress: defaultAddress.fullAddress,
                                phone: defaultAddress.phone
                            });
                            cacheProfileAddressForCheckout({
                                name: profileName?.value || '',
                                phone: defaultAddress.phone || profilePhone?.value || '',
                                district: defaultAddress.district,
                                upazila: defaultAddress.upazilaOrThana,
                                fullAddress: defaultAddress.fullAddress
                            });
                        }
                    }
                } else {
                    showToast(data.message || 'Failed to save address.', 'danger');
                }
            } catch (error) {
                console.error('Save Address Error:', error);
                saveBtn.innerHTML = originalText;
                saveBtn.disabled = false;
                showToast('Server error while saving address.', 'danger');
            }
        });
    }

Object.assign(window, {
    populateAddressDistrictOptions,
    populateAddressUpazilaOptions,
    formatSavedAddressDisplay,
    openAddressModal,
    closeAddressModal,
    fetchAddresses,
    renderAddresses
});

});
