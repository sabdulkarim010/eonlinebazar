/**
 * Checkout Validation
 * Barrel: client/js/checkout.js
 *
 * Globals used from other modules:
 *  * - validationState
 * - selectedShippingDistrict
 * - selectedShippingUpazila
 * - checkoutProfileCache
 * - isApplyingSavedAddress
 *
 * Globals this module exposes:
 *  * - getCheckoutDistrictEl
 * - getCheckoutUpazilaEl
 * - ensureCheckoutLocationSelectors
 * - handleCheckoutDistrictChange
 * - handleCheckoutUpazilaChange
 * - populateCheckoutDistrictOptions
 * - updateCheckoutSelectPlaceholder
 * - syncCheckoutSelectPlaceholders
 * - buildStreetAddressText
 * - buildCompleteDeliveryAddress
 * - populateCheckoutUpazilaOptions
 * - applyProfileToCheckoutForm
 * - resetCheckoutValidationState
 * - clearGuestCheckoutStorage
 * - clearGuestCheckoutFormFields
 * - prepareGuestCheckoutSession
 * - applyCheckoutAddressFallback
 * - recalculateCheckoutDelivery
 * - updateFieldUI
 * - detectSpamPattern
 * - initLiveValidationEngine
 */

window.checkoutLocationPair = null;

function getCheckoutDistrictEl() {
    return document.getElementById('shippingDistrict');
}

function getCheckoutUpazilaEl() {
    return document.getElementById('shippingUpazila');
}

function ensureCheckoutLocationSelectors() {
    if (checkoutLocationPair) return checkoutLocationPair;

    checkoutLocationPair = window.initDistrictUpazilaPair({
        districtSelectId: 'shippingDistrict',
        upazilaSelectId: 'shippingUpazila',
        districtPlaceholder: 'Select your district',
        upazilaPlaceholder: 'Select upazila / thana',
        onDistrictChange: handleCheckoutDistrictChange,
        onUpazilaChange: handleCheckoutUpazilaChange
    });

    return checkoutLocationPair;
}

function handleCheckoutDistrictChange() {
    const selectEl = getCheckoutDistrictEl();
    if (!selectEl) return;

    if (isApplyingSavedAddress) {
        updateDeliveryZoneHint();
        recalculateCheckoutDelivery();
        return;
    }

    selectedShippingDistrict = selectEl.value.trim();
    validationState.district = Boolean(selectedShippingDistrict);
    if (!isGuestCheckoutUser()) {
        window.EOBStorage.set(window.EOBStorageKeys.SHIPPING_DISTRICT, selectedShippingDistrict);
        window.EOBStorage.set(window.EOBStorageKeys.CHECKOUT_DISTRICT, selectedShippingDistrict);
    }

    selectedShippingUpazila = '';
    validationState.upazila = false;
    populateCheckoutUpazilaOptions(selectedShippingDistrict);

    updateCheckoutSelectPlaceholder(selectEl);
    recalculateCheckoutDelivery();
}

function handleCheckoutUpazilaChange() {
    const selectEl = getCheckoutUpazilaEl();
    if (!selectEl) return;

    if (isApplyingSavedAddress) {
        recalculateCheckoutDelivery();
        return;
    }

    selectedShippingUpazila = selectEl.value.trim();
    validationState.upazila = Boolean(selectedShippingUpazila);
    updateCheckoutSelectPlaceholder(selectEl);
    if (!isGuestCheckoutUser()) {
        window.EOBStorage.set(window.EOBStorageKeys.CHECKOUT_UPAZILA, selectedShippingUpazila);
    }
}

function populateCheckoutDistrictOptions(selectedValue = '') {
    const pair = ensureCheckoutLocationSelectors();
    if (!pair) return;

    pair.districtSelect.setValue(selectedValue || '');
    selectedShippingDistrict = selectedValue || '';
    updateCheckoutSelectPlaceholder(getCheckoutDistrictEl());
}

function updateCheckoutSelectPlaceholder(selectEl) {
    if (!selectEl) return;
    const instance = window.getSearchableSelectInstance(selectEl);
    if (instance && instance.root) {
        instance.root.classList.toggle('searchable-select--placeholder', !selectEl.value);
        return;
    }
    selectEl.classList.toggle('checkout-select--placeholder', !selectEl.value);
}

function syncCheckoutSelectPlaceholders() {
    updateCheckoutSelectPlaceholder(document.getElementById('shippingDistrict'));
    updateCheckoutSelectPlaceholder(document.getElementById('shippingUpazila'));
}

function buildStreetAddressText({ fullAddress = '', upazila = '', thana = '' } = {}) {
    const parts = [];
    const street = String(fullAddress || '').trim();
    const thanaLabel = String(thana || '').trim();
    const upazilaLabel = String(upazila || '').trim();

    if (street) parts.push(street);
    if (thanaLabel && thanaLabel !== upazilaLabel) parts.push(thanaLabel);
    if (upazilaLabel) parts.push(upazilaLabel);

    return parts.join(', ');
}

function buildCompleteDeliveryAddress({ streetText = '', upazila = '', district = '' } = {}) {
    const locality = String(upazila || '').trim();
    const parts = [streetText, locality, district].filter(Boolean);
    return parts.join(', ');
}

function populateCheckoutUpazilaOptions(district, selectedUpazila = '') {
    const pair = ensureCheckoutLocationSelectors();
    const selectEl = getCheckoutUpazilaEl();
    if (!pair || !selectEl) return;

    if (!district) {
        pair.populateUpazila('', '');
        selectedShippingUpazila = '';
        validationState.upazila = false;
        updateCheckoutSelectPlaceholder(selectEl);
        return;
    }

    pair.populateUpazila(district, selectedUpazila || '');
    selectedShippingUpazila = selectedUpazila || selectEl.value.trim();
    validationState.upazila = Boolean(selectedShippingUpazila);
    updateCheckoutSelectPlaceholder(selectEl);
}

function applyProfileToCheckoutForm(profile = {}) {
    isApplyingSavedAddress = true;
    cacheCheckoutProfileLocally(profile);

    const district = profile.district || '';
    const upazila = profile.upazila || profile.thana || '';

    populateCheckoutDistrictOptions(district);
    selectedShippingDistrict = district;
    validationState.district = Boolean(district);

    populateCheckoutUpazilaOptions(district, upazila);
    selectedShippingUpazila = upazila;
    validationState.upazila = Boolean(upazila);

    const nameEl = document.getElementById('shippingFullName');
    const phoneEl = document.getElementById('shippingMobile');
    const addressEl = document.getElementById('shippingAddress');

    if (nameEl) {
        nameEl.value = profile.name || '';
        nameEl.dispatchEvent(new Event('input'));
    }
    if (phoneEl) {
        phoneEl.value = profile.phone || profile.mobile || '';
        phoneEl.dispatchEvent(new Event('input'));
    }
    if (addressEl) {
        addressEl.value = profile.fullAddress || '';
        addressEl.dispatchEvent(new Event('input'));
    }

    notifyShippingLocationFieldsChanged();
    isApplyingSavedAddress = false;
}

function resetCheckoutValidationState() {
    validationState.name = false;
    validationState.mobile = false;
    validationState.address = false;
    validationState.district = false;
    validationState.upazila = false;
}

function clearGuestCheckoutStorage() {
    if (window.EOBSession && typeof window.EOBSession.clearGuestCheckoutStorage === 'function') {
        window.EOBSession.clearGuestCheckoutStorage();
        return;
    }

    [
        'checkout_name', 'checkout_phone', 'checkout_address', 'checkout_email',
        'checkout_district', 'checkout_upazila', 'checkout_full_address',
        'shippingDistrict', 'shippingFullName', 'shippingMobile', 'shippingAddress', 'shippingCourierNote'
    ].forEach((key) => window.EOBStorage.remove(key));
}

function clearGuestCheckoutFormFields() {
    isApplyingSavedAddress = true;
    selectedShippingDistrict = '';
    selectedShippingUpazila = '';
    selectedSavedAddressId = null;
    savedCheckoutAddresses = [];
    checkoutProfileCache = null;
    resetCheckoutValidationState();

    populateCheckoutDistrictOptions('');

    const upazilaEl = getCheckoutUpazilaEl();
    if (upazilaEl) {
        populateCheckoutUpazilaOptions('', '');
        updateCheckoutSelectPlaceholder(upazilaEl);
    }

    const fields = [
        { id: 'shippingFullName', errorId: 'name-error' },
        { id: 'shippingMobile', errorId: 'mobile-error' },
        { id: 'shippingEmail', errorId: 'email-error' },
        { id: 'shippingAddress', errorId: 'address-error' },
        { id: 'shippingCourierNote', errorId: 'note-error' }
    ];

    fields.forEach(({ id, errorId }) => {
        const input = document.getElementById(id);
        if (input) {
            input.value = '';
            input.style.borderColor = '';
            input.style.backgroundColor = '';
            const wrapper = input.parentElement;
            const iconCounter = wrapper?.querySelector('.icon-counter-wrapper');
            if (iconCounter) iconCounter.innerHTML = '';
        }
        const errorEl = document.getElementById(errorId);
        if (errorEl) errorEl.innerText = '';
    });

    ['district-error', 'upazila-error'].forEach((errorId) => {
        const errorEl = document.getElementById(errorId);
        if (errorEl) errorEl.innerText = '';
    });

    const saveCheckbox = document.getElementById('saveAddressToProfile');
    if (saveCheckbox) saveCheckbox.checked = false;

    const savedSection = document.getElementById('savedAddressesSection');
    if (savedSection) savedSection.hidden = true;

    const addressEl = document.getElementById('shippingAddress');
    if (addressEl) {
        addressEl.placeholder = 'House, road, village, area — enter your full delivery address';
    }

    updateDeliveryZoneHint();
    isApplyingSavedAddress = false;
}

function prepareGuestCheckoutSession() {
    if (!isGuestCheckoutUser()) return;
    clearGuestCheckoutStorage();
    clearGuestCheckoutFormFields();
}

function applyCheckoutAddressFallback() {
    if (isGuestCheckoutUser()) return;

    isApplyingSavedAddress = true;

    const district = window.EOBStorage.get(window.EOBStorageKeys.CHECKOUT_DISTRICT)
        || window.EOBStorage.get(window.EOBStorageKeys.SHIPPING_DISTRICT)
        || '';
    const upazila = window.EOBStorage.get(window.EOBStorageKeys.CHECKOUT_UPAZILA) || '';
    const fullAddress = window.EOBStorage.get(window.EOBStorageKeys.CHECKOUT_FULL_ADDRESS) || '';

    if (district) {
        populateCheckoutDistrictOptions(district);
        selectedShippingDistrict = district;
        validationState.district = true;
        populateCheckoutUpazilaOptions(district, upazila);
        if (upazila) {
            selectedShippingUpazila = upazila;
            validationState.upazila = true;
        }
    }

    const nameEl = document.getElementById('shippingFullName');
    const phoneEl = document.getElementById('shippingMobile');
    const addressEl = document.getElementById('shippingAddress');

    const cachedName = window.EOBStorage.get(window.EOBStorageKeys.CHECKOUT_NAME);
    const cachedPhone = window.EOBStorage.get(window.EOBStorageKeys.CHECKOUT_PHONE);
    const cachedEmail = window.EOBStorage.get(window.EOBStorageKeys.CHECKOUT_EMAIL);

    if (nameEl && cachedName) {
        nameEl.value = cachedName;
        nameEl.dispatchEvent(new Event('input'));
    }
    if (phoneEl && cachedPhone) {
        phoneEl.value = cachedPhone;
        phoneEl.dispatchEvent(new Event('input'));
    }
    const emailEl = document.getElementById('shippingEmail');
    if (emailEl && cachedEmail) {
        emailEl.value = cachedEmail;
    }
    if (addressEl && fullAddress) {
        addressEl.value = fullAddress;
        addressEl.dispatchEvent(new Event('input'));
    }

    updateDeliveryZoneHint();
    isApplyingSavedAddress = false;
}

function recalculateCheckoutDelivery() {
    updateDeliveryZoneHint();
    updateCheckoutTotals(getCheckoutSubtotal());
    if (typeof requestOrderQuoteRefresh === 'function') {
        requestOrderQuoteRefresh();
    }
}

/* =========================================================================
   🛡️ ৭. লাইভ ভ্যালিডেশন ইঞ্জিন (প্রোফাইল অটো-ফিল ইন্টিগ্রেশনসহ)
   ========================================================================= */
function updateFieldUI(input, errorEl, isValid, currentCount, max) {
    if (!input || !errorEl) return;
    let wrapper = input.parentElement; 

    let iconCounterWrapper = wrapper.querySelector('.icon-counter-wrapper');
    if (!iconCounterWrapper) {
        iconCounterWrapper = document.createElement('div');
        iconCounterWrapper.className = 'icon-counter-wrapper';
        wrapper.appendChild(iconCounterWrapper);
    }

    const esc = (v) => (window.EOBSanitizer && window.EOBSanitizer.escapeHtml(v))
        || String(v == null ? '' : v);
    let counterText = max ? `${currentCount}/${max}` : `${currentCount}`;
    const safeCounterText = esc(counterText);
    
    if (input.value.trim() === "") {
        input.style.borderColor = "#cbd5e1";
        input.style.backgroundColor = "#ffffff";
        errorEl.innerText = "";
        iconCounterWrapper.innerHTML = "";
    } else if (isValid) {
        input.style.borderColor = "#10b981";
        input.style.backgroundColor = "#f0fdf4";
        errorEl.innerText = "";
        iconCounterWrapper.innerHTML = `<span style="font-size:12px; color:#64748b;">${safeCounterText}</span> <i class="fa-solid fa-check-circle" style="color:#10b981;"></i>`;
    } else {
        input.style.borderColor = "#ef4444";
        input.style.backgroundColor = "#fef2f2";
        errorEl.innerText = ""; 
        iconCounterWrapper.innerHTML = `<span style="font-size:12px; color:#ef4444;">${safeCounterText}</span>`;
    }
}

function detectSpamPattern(text) {
    return /([a-z\u0980-\u09ff])\1{2,}/i.test(text);
}

function initLiveValidationEngine() {
    const isGuest = isGuestCheckoutUser();
    const fields = [
        { id: 'shippingFullName', errorId: 'name-error', max: 50 },
        { id: 'shippingMobile', errorId: 'mobile-error', max: 11 },
        { id: 'shippingAddress', errorId: 'address-error', max: 120 },
        { id: 'shippingCourierNote', errorId: 'note-error', max: 0 }
    ];

    fields.forEach(field => {
        const input = document.getElementById(field.id);
        const errorEl = document.getElementById(field.errorId);
        if (!input) return;

        if (field.max > 0) input.setAttribute('maxlength', field.max);

        if (!isGuest) {
            let savedValue = window.EOBStorage.get(field.id);

            if (!savedValue) {
                if (field.id === 'shippingFullName') savedValue = window.EOBStorage.get(window.EOBStorageKeys.CHECKOUT_NAME);
                if (field.id === 'shippingMobile') savedValue = window.EOBStorage.get(window.EOBStorageKeys.CHECKOUT_PHONE);
                if (field.id === 'shippingAddress') {
                    const fullAddress = window.EOBStorage.get(window.EOBStorageKeys.CHECKOUT_FULL_ADDRESS) || '';
                    const upazila = window.EOBStorage.get(window.EOBStorageKeys.CHECKOUT_UPAZILA) || '';
                    savedValue = buildStreetAddressText({
                        fullAddress,
                        upazila,
                        thana: upazila
                    }) || window.EOBStorage.get(window.EOBStorageKeys.CHECKOUT_ADDRESS);
                }
            }

            if (savedValue) {
                input.value = savedValue;
                setTimeout(() => input.dispatchEvent(new Event('input')), 50);
            }
        }

        input.addEventListener('input', () => {
            if (!isGuestCheckoutUser()) {
                window.EOBStorage.set(field.id, input.value);
            }
            let val = input.value.trim();
            let len = val.length;
            let isOk = false;

            if (field.id === 'shippingFullName') {
                isOk = len >= 2 && !detectSpamPattern(val);
                validationState.name = isOk;
            }
            else if (field.id === 'shippingMobile') {
                input.value = input.value.replace(/\D/g, ''); 
                isOk = /^01[3-9]\d{8}$/.test(input.value); 
                validationState.mobile = isOk;
            }
            else if (field.id === 'shippingAddress') {
                isOk = len >= 1 && !detectSpamPattern(val);
                validationState.address = isOk;
            }
            else if (field.id === 'shippingCourierNote') {
                isOk = true; 
            }

            updateFieldUI(input, errorEl, isOk, len, field.max > 0 ? field.max : null);
        });
    });
}
Object.assign(window, {
    getCheckoutDistrictEl,
    getCheckoutUpazilaEl,
    ensureCheckoutLocationSelectors,
    handleCheckoutDistrictChange,
    handleCheckoutUpazilaChange,
    populateCheckoutDistrictOptions,
    updateCheckoutSelectPlaceholder,
    syncCheckoutSelectPlaceholders,
    buildStreetAddressText,
    buildCompleteDeliveryAddress,
    populateCheckoutUpazilaOptions,
    applyProfileToCheckoutForm,
    resetCheckoutValidationState,
    clearGuestCheckoutStorage,
    clearGuestCheckoutFormFields,
    prepareGuestCheckoutSession,
    applyCheckoutAddressFallback,
    recalculateCheckoutDelivery,
    updateFieldUI,
    detectSpamPattern,
    initLiveValidationEngine
});
