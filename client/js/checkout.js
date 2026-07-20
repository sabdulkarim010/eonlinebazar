/***************************************************************************
 * Project: EonlineBazar
 * File: js/checkout.js
 * Author: Abdul Karim Sheikh
 * Description: Live Validation, Empty Cart UI & MongoDB Dynamic Order Sync 
 * (Fully Fixed with Hybrid DB Cart & Isolated Buy Now Logic)
 ***************************************************************************/

/* =========================================================================
   ১. গ্লোবাল ভেরিয়েবল ও ইনিশিয়ালাইজেশন
   ========================================================================= */
let globalProductCatalog = [];
let cart = []; // 🌟 ডাটাবেজ কার্ট স্টোর করার জন্য গ্লোবাল ভেরিয়েবল
let deliverySettings = {
    shopHomeCity: 'Dhaka',
    deliveryInsideCity: 60,
    deliveryOutsideCity: 120,
    freeShippingMinAmount: 1000
};
let selectedShippingDistrict = '';
let selectedShippingUpazila = '';
let checkoutProfileCache = null;
let savedCheckoutAddresses = [];
let selectedSavedAddressId = null;
let isApplyingSavedAddress = false;

// 🌟 টোকেন চেক (কাস্টমার লগইন আছে কি না জানার জন্য)
const customerToken = localStorage.getItem('token') || localStorage.getItem('customerToken');

let validationState = {
    name: false,
    mobile: false,
    address: false,
    district: false,
    upazila: false
};

let checkoutCouponsAvailable = false;

function hideCheckoutCouponSection() {
    checkoutCouponsAvailable = false;
    const container = document.getElementById('checkout-coupon-container');
    if (container) container.style.display = 'none';

    setAppliedCoupon(null);

    const discountRow = document.getElementById('checkoutDiscountRow');
    if (discountRow) discountRow.style.display = 'none';

    const msgEl = document.getElementById('checkoutCouponAppliedMsg');
    if (msgEl) msgEl.style.display = 'none';

    const removeBtn = document.getElementById('checkoutRemoveCouponBtn');
    if (removeBtn) removeBtn.style.display = 'none';

    const applyBtn = document.getElementById('checkoutApplyCouponBtn');
    if (applyBtn) applyBtn.style.display = 'inline-flex';

    const input = document.getElementById('checkoutCouponInput');
    if (input) {
        input.value = '';
        input.disabled = false;
    }
}

function showCheckoutCouponSection() {
    checkoutCouponsAvailable = true;
    const container = document.getElementById('checkout-coupon-container');
    if (container) container.style.display = 'block';
}

function getCheckoutSubtotal() {
    const checkedItems = getCheckoutItems();
    return checkedItems.reduce(
        (sum, item) => sum + (parseFloat(item.price) || 0) * (parseInt(item.quantity, 10) || 1),
        0
    );
}

async function refreshCheckoutCouponAvailability() {
    const container = document.getElementById('checkout-coupon-container');
    if (!container) return false;

    try {
        const res = await fetch('/api/coupons/active-check', { cache: 'no-store' });
        if (!res.ok) {
            hideCheckoutCouponSection();
            return false;
        }

        const data = await res.json();
        const hasActive = data && data.hasActiveCoupon === true;

        if (hasActive) {
            showCheckoutCouponSection();
            return true;
        }

        hideCheckoutCouponSection();
        return false;
    } catch (err) {
        console.error('Coupon availability check failed:', err);
        hideCheckoutCouponSection();
        return false;
    }
}

async function initCheckoutCouponVisibility() {
    const available = await refreshCheckoutCouponAvailability();
    if (!available) {
        const subtotal = getCheckoutSubtotal();
        if (subtotal > 0) updateCheckoutTotals(subtotal);
    }
}

function getAppliedCoupon() {
    try {
        return JSON.parse(localStorage.getItem('appliedCoupon')) || null;
    } catch (_) {
        return null;
    }
}

function setAppliedCoupon(data) {
    if (!data) {
        localStorage.removeItem('appliedCoupon');
        return;
    }
    localStorage.setItem('appliedCoupon', JSON.stringify(data));
}

function showCouponToast(message, type = 'success') {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: type === 'error' ? 'error' : (type === 'warning' ? 'warning' : 'success'),
            title: message,
            showConfirmButton: false,
            timer: 2800,
            timerProgressBar: true
        });
        return;
    }
    alert(message);
}

document.addEventListener('DOMContentLoaded', async () => {
    initCheckoutCouponVisibility();

    populateCheckoutDistrictOptions();
    initDistrictSelector();
    initUpazilaSelector();
    initSavedAddressManualEditWatchers();
    await initializeCheckoutPage();
    initLiveValidationEngine();
    
    const proceedBtn = document.getElementById('proceedToPaymentBtn');
    if (proceedBtn) proceedBtn.addEventListener('click', handleProceedToPayment);

    const applyBtn = document.getElementById('checkoutApplyCouponBtn');
    if (applyBtn) applyBtn.addEventListener('click', applyCheckoutCoupon);

    const removeBtn = document.getElementById('checkoutRemoveCouponBtn');
    if (removeBtn) removeBtn.addEventListener('click', removeCheckoutCoupon);

    const couponInput = document.getElementById('checkoutCouponInput');
    if (couponInput) {
        couponInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                applyCheckoutCoupon();
            }
        });
    }

    fetch('/api/products')
        .then(res => res.json())
        .then(data => {
            globalProductCatalog = data;
            fetchCartData();
        })
        .catch(err => {
            console.error("Catalog load error:", err);
            fetchCartData();
        });
});

function populateCheckoutDistrictOptions(selectedValue = '') {
    const selectEl = document.getElementById('shippingDistrict');
    if (!selectEl || !Array.isArray(window.BANGLADESH_DISTRICTS)) return;

    selectEl.innerHTML = '<option value="">Select your district</option>';
    window.BANGLADESH_DISTRICTS.forEach((district) => {
        const option = document.createElement('option');
        option.value = district;
        option.textContent = district;
        selectEl.appendChild(option);
    });

    if (selectedValue) selectEl.value = selectedValue;
}

function resolveShippingZoneLabel() {
    if (!selectedShippingDistrict || !deliverySettings.shopHomeCity) return '';
    const isInside = typeof window.districtsMatch === 'function'
        && window.districtsMatch(selectedShippingDistrict, deliverySettings.shopHomeCity);
    return isInside ? 'Inside City' : 'Outside City';
}

function updateDeliveryZoneHint() {
    const hintEl = document.getElementById('deliveryZoneHint');
    if (!hintEl) return;

    if (!selectedShippingDistrict) {
        hintEl.textContent = 'Delivery charge is calculated automatically from your district.';
        return;
    }

    const zoneLabel = resolveShippingZoneLabel();
    hintEl.textContent = zoneLabel === 'Inside City'
        ? `Matched with shop home city (${deliverySettings.shopHomeCity}) — inside-city rate applied.`
        : `Outside shop home city (${deliverySettings.shopHomeCity}) — outside-city rate applied.`;
}

async function fetchDeliverySettings() {
    try {
        const res = await fetch('/api/store/delivery-settings');
        const data = await res.json();
        if (data.success && data.data) {
            deliverySettings = {
                shopHomeCity: data.data.shopHomeCity || 'Dhaka',
                deliveryInsideCity: Number(data.data.deliveryInsideCity) || 0,
                deliveryOutsideCity: Number(data.data.deliveryOutsideCity) || 0,
                freeShippingMinAmount: Number(data.data.freeShippingMinAmount) || 0
            };
            return true;
        }
    } catch (err) {
        console.error('Failed to load delivery settings:', err);
    }
    return false;
}

async function fetchCustomerProfileForCheckout() {
    if (!customerToken) return null;

    try {
        const res = await fetch('/api/customer/profile', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${customerToken}`,
                'Content-Type': 'application/json'
            }
        });
        const data = await res.json();
        if (res.ok && data) return data;
    } catch (err) {
        console.error('Failed to load profile for checkout:', err);
    }
    return null;
}

async function fetchSavedAddressesForCheckout() {
    if (!customerToken) return [];

    try {
        const res = await fetch('/api/customer/addresses', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${customerToken}`,
                'Content-Type': 'application/json'
            }
        });
        const data = await res.json();
        if (res.ok && data.success) return data.addresses || [];
    } catch (err) {
        console.error('Failed to load saved addresses for checkout:', err);
    }
    return [];
}

function escapeCheckoutHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatSavedAddressCardLine(addr = {}) {
    const locality = [
        addr.upazilaOrThana || addr.upazila || addr.thana,
        addr.district
    ].filter(Boolean).join(', ');
    const street = addr.fullAddress || '';
    return [street, locality].filter(Boolean).join(' — ');
}

function updateSaveAddressCheckboxState() {
    const saveCheckbox = document.getElementById('saveAddressToProfile');
    if (!saveCheckbox) return;

    if (selectedSavedAddressId) {
        saveCheckbox.checked = false;
        saveCheckbox.disabled = true;
        saveCheckbox.closest('.checkout-save-address-toggle')?.classList.add('is-disabled');
    } else {
        saveCheckbox.disabled = false;
        saveCheckbox.closest('.checkout-save-address-toggle')?.classList.remove('is-disabled');
    }
}

function forceUncheckSavedAddressRadio(radio, card) {
    if (!radio) return;

    radio.checked = false;
    radio.removeAttribute('checked');
    radio.removeAttribute('data-was-checked');
    radio.blur();

    if (card) {
        card.classList.remove('is-selected');
    }

    requestAnimationFrame(() => {
        radio.checked = false;
        radio.removeAttribute('checked');
    });
}

function resetSavedAddressRadioVisualState() {
    document.querySelectorAll('.saved-address-card').forEach((card) => {
        const radio = card.querySelector('input[type="radio"]');
        forceUncheckSavedAddressRadio(radio, card);
    });
}

function clearSavedAddressSelection(revertToProfile = false) {
    selectedSavedAddressId = null;
    resetSavedAddressRadioVisualState();
    updateSaveAddressCheckboxState();
    if (revertToProfile) {
        revertCheckoutFormToProfileSettings();
    }
}

function revertCheckoutFormToProfileSettings() {
    if (checkoutProfileCache) {
        applyProfileToCheckoutForm(checkoutProfileCache);
    } else {
        applyCheckoutAddressFallback();
        recalculateCheckoutDelivery();
    }
}

function notifyShippingLocationFieldsChanged() {
    const districtEl = document.getElementById('shippingDistrict');
    const upazilaEl = document.getElementById('shippingUpazila');

    updateDeliveryZoneHint();

    if (districtEl) {
        districtEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (upazilaEl && upazilaEl.value) {
        upazilaEl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    recalculateCheckoutDelivery();
}

function handleSavedAddressRadioClick(event) {
    const radio = event.currentTarget;
    const card = radio.closest('.saved-address-card');
    if (!card) return;

    const wasChecked = radio.getAttribute('data-was-checked') === 'true';

    if (wasChecked) {
        event.preventDefault();
        event.stopPropagation();
        forceUncheckSavedAddressRadio(radio, card);
        selectedSavedAddressId = null;
        updateSaveAddressCheckboxState();
        revertCheckoutFormToProfileSettings();
        return;
    }

    document.querySelectorAll('.saved-address-card input[type="radio"]').forEach((otherRadio) => {
        if (otherRadio !== radio) {
            forceUncheckSavedAddressRadio(otherRadio, otherRadio.closest('.saved-address-card'));
        }
    });

    radio.checked = true;
    radio.setAttribute('data-was-checked', 'true');
    card.classList.add('is-selected');

    const addressId = card.getAttribute('data-address-id');
    const addr = savedCheckoutAddresses.find((item) => String(item._id) === String(addressId));
    if (!addr) return;

    selectedSavedAddressId = addr._id;
    applySavedAddressToCheckoutForm(addr, checkoutProfileCache);
    updateSaveAddressCheckboxState();
}

function handleSavedAddressCardMouseDown(event) {
    const card = event.currentTarget;
    const radio = card.querySelector('input[type="radio"]');
    if (!radio || radio.getAttribute('data-was-checked') !== 'true') return;

    event.preventDefault();
}

function renderSavedAddressCards(addresses = []) {
    const section = document.getElementById('savedAddressesSection');
    const container = document.getElementById('savedAddressCards');
    if (!section || !container) return;

    savedCheckoutAddresses = Array.isArray(addresses) ? addresses : [];

    if (!savedCheckoutAddresses.length) {
        section.hidden = true;
        container.innerHTML = '';
        return;
    }

    section.hidden = false;
    container.innerHTML = savedCheckoutAddresses.map((addr) => {
        const id = addr._id || '';
        const label = escapeCheckoutHtml(addr.label || 'Address');
        const line = escapeCheckoutHtml(formatSavedAddressCardLine(addr));
        const phone = escapeCheckoutHtml(addr.phone || '');

        return `
            <label class="saved-address-card" data-address-id="${escapeCheckoutHtml(id)}">
                <input type="radio" name="savedDeliveryAddress" value="${escapeCheckoutHtml(id)}">
                <div class="saved-address-card__top">
                    <span class="saved-address-card__label">${label}</span>
                </div>
                <p class="saved-address-card__line">${line}</p>
                ${phone ? `<p class="saved-address-card__phone"><i class="fa-solid fa-phone"></i> ${phone}</p>` : ''}
            </label>
        `;
    }).join('');

    container.querySelectorAll('.saved-address-card').forEach((card) => {
        const radio = card.querySelector('input[type="radio"]');
        if (!radio) return;

        card.addEventListener('mousedown', handleSavedAddressCardMouseDown);
        radio.addEventListener('click', handleSavedAddressRadioClick);
    });
}

function applySavedAddressToCheckoutForm(addr = {}, profile = checkoutProfileCache) {
    isApplyingSavedAddress = true;

    const district = addr.district || '';
    const upazila = addr.upazilaOrThana || addr.upazila || addr.thana || '';
    const street = addr.fullAddress || '';

    populateCheckoutDistrictOptions(district);
    selectedShippingDistrict = district;
    validationState.district = Boolean(district);
    localStorage.setItem('shippingDistrict', district);
    localStorage.setItem('checkout_district', district);

    populateCheckoutUpazilaOptions(district, upazila);
    selectedShippingUpazila = upazila;
    validationState.upazila = Boolean(upazila);
    localStorage.setItem('checkout_upazila', upazila);

    const nameEl = document.getElementById('shippingFullName');
    const phoneEl = document.getElementById('shippingMobile');
    const addressEl = document.getElementById('shippingAddress');

    if (nameEl && profile?.name) {
        nameEl.value = profile.name;
        nameEl.dispatchEvent(new Event('input'));
    }
    if (phoneEl && addr.phone) {
        phoneEl.value = addr.phone;
        phoneEl.dispatchEvent(new Event('input'));
    }
    if (addressEl) {
        addressEl.value = street;
        addressEl.dispatchEvent(new Event('input'));
    }

    localStorage.setItem('checkout_name', nameEl?.value || profile?.name || '');
    localStorage.setItem('checkout_phone', phoneEl?.value || addr.phone || '');
    localStorage.setItem('checkout_full_address', street);
    localStorage.setItem('checkout_address', buildCompleteDeliveryAddress({
        streetText: street,
        upazila,
        district
    }));

    notifyShippingLocationFieldsChanged();
    isApplyingSavedAddress = false;
}

function initSavedAddressManualEditWatchers() {
    const watchIds = ['shippingDistrict', 'shippingUpazila', 'shippingFullName', 'shippingMobile', 'shippingAddress'];
    watchIds.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => {
            if (isApplyingSavedAddress) return;
            if (selectedSavedAddressId) clearSavedAddressSelection(true);
        });
        el.addEventListener('change', () => {
            if (isApplyingSavedAddress) return;
            if (selectedSavedAddressId) clearSavedAddressSelection(true);
        });
    });
}

function cacheCheckoutProfileLocally(profile = {}) {
    const upazila = profile.upazila || profile.thana || '';
    const streetText = buildStreetAddressText({
        fullAddress: profile.fullAddress || '',
        upazila,
        thana: profile.thana || ''
    });

    localStorage.setItem('checkout_name', profile.name || '');
    localStorage.setItem('checkout_phone', profile.phone || profile.mobile || '');
    localStorage.setItem('checkout_district', profile.district || '');
    localStorage.setItem('checkout_upazila', upazila);
    localStorage.setItem('checkout_full_address', profile.fullAddress || '');
    localStorage.setItem('checkout_address', buildCompleteDeliveryAddress({
        streetText,
        district: profile.district || ''
    }));
    localStorage.setItem('shippingDistrict', profile.district || '');
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
    const selectEl = document.getElementById('shippingUpazila');
    if (!selectEl) return;

    selectEl.innerHTML = '<option value="">Select upazila / thana</option>';

    if (!district) {
        selectEl.disabled = true;
        selectedShippingUpazila = '';
        validationState.upazila = false;
        return;
    }

    const upazilas = typeof window.getUpazilasForDistrict === 'function'
        ? window.getUpazilasForDistrict(district)
        : [];

    upazilas.forEach((upazila) => {
        const option = document.createElement('option');
        option.value = upazila;
        option.textContent = upazila;
        selectEl.appendChild(option);
    });

    selectEl.disabled = upazilas.length === 0;
    if (selectedUpazila) {
        selectEl.value = selectedUpazila;
        selectedShippingUpazila = selectEl.value.trim();
        validationState.upazila = Boolean(selectedShippingUpazila);
    } else {
        selectedShippingUpazila = '';
        validationState.upazila = false;
    }
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

function applyCheckoutAddressFallback() {
    isApplyingSavedAddress = true;

    const district = localStorage.getItem('checkout_district')
        || localStorage.getItem('shippingDistrict')
        || '';
    const upazila = localStorage.getItem('checkout_upazila') || '';
    const fullAddress = localStorage.getItem('checkout_full_address') || '';

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

    const cachedName = localStorage.getItem('checkout_name');
    const cachedPhone = localStorage.getItem('checkout_phone');

    if (nameEl && cachedName) {
        nameEl.value = cachedName;
        nameEl.dispatchEvent(new Event('input'));
    }
    if (phoneEl && cachedPhone) {
        phoneEl.value = cachedPhone;
        phoneEl.dispatchEvent(new Event('input'));
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
}

async function initializeCheckoutPage() {
    const [, profile, addresses] = await Promise.all([
        fetchDeliverySettings(),
        fetchCustomerProfileForCheckout(),
        fetchSavedAddressesForCheckout()
    ]);

    checkoutProfileCache = profile;

    renderSavedAddressCards(addresses);

    if (profile) {
        applyProfileToCheckoutForm(profile);
    } else {
        applyCheckoutAddressFallback();
    }

    recalculateCheckoutDelivery();
}

function initDistrictSelector() {
    const selectEl = document.getElementById('shippingDistrict');
    if (!selectEl) return;

    selectEl.addEventListener('change', () => {
        if (isApplyingSavedAddress) {
            updateDeliveryZoneHint();
            recalculateCheckoutDelivery();
            return;
        }

        selectedShippingDistrict = selectEl.value.trim();
        validationState.district = Boolean(selectedShippingDistrict);
        localStorage.setItem('shippingDistrict', selectedShippingDistrict);
        localStorage.setItem('checkout_district', selectedShippingDistrict);

        selectedShippingUpazila = '';
        validationState.upazila = false;
        populateCheckoutUpazilaOptions(selectedShippingDistrict);

        recalculateCheckoutDelivery();
    });
}

function initUpazilaSelector() {
    const selectEl = document.getElementById('shippingUpazila');
    if (!selectEl) return;

    selectEl.addEventListener('change', () => {
        if (isApplyingSavedAddress) {
            recalculateCheckoutDelivery();
            return;
        }

        selectedShippingUpazila = selectEl.value.trim();
        validationState.upazila = Boolean(selectedShippingUpazila);
        localStorage.setItem('checkout_upazila', selectedShippingUpazila);
    });
}

function getCheckoutSubtotal() {
    const checkedItems = getCheckoutItems();
    return checkedItems.reduce((sum, item) => {
        const price = parseFloat(item.price) || 0;
        const qty = parseInt(item.quantity, 10) || 1;
        return sum + (price * qty);
    }, 0);
}

function calculateDeliveryCharge(subtotal) {
    const threshold = Number(deliverySettings.freeShippingMinAmount);
    const merchandiseSubtotal = Math.max(0, Number(subtotal) || 0);

    if (threshold === 0 || merchandiseSubtotal >= threshold) {
        return 0;
    }

    if (!selectedShippingDistrict) {
        return 0;
    }

    const isInside = typeof window.districtsMatch === 'function'
        && window.districtsMatch(selectedShippingDistrict, deliverySettings.shopHomeCity);

    return isInside
        ? Number(deliverySettings.deliveryInsideCity) || 0
        : Number(deliverySettings.deliveryOutsideCity) || 0;
}

function updateCheckoutTotals(subtotal) {
    const subtotalText = document.getElementById('checkoutSubtotal');
    const deliveryChargeEl = document.getElementById('checkoutDeliveryCharge');
    const freeShippingBadge = document.getElementById('checkoutFreeShippingBadge');
    const grandTotalText = document.getElementById('checkoutGrandTotal');

    const merchandisePayable = syncCheckoutCouponUI(subtotal);
    const deliveryCharge = calculateDeliveryCharge(subtotal);
    const grandTotal = Math.round((merchandisePayable + deliveryCharge) * 100) / 100;

    if (subtotalText) subtotalText.innerText = `৳${subtotal}`;
    if (deliveryChargeEl) {
        deliveryChargeEl.innerText = deliveryCharge === 0 ? '৳0' : `৳${deliveryCharge}`;
        deliveryChargeEl.style.display = deliveryCharge === 0 ? 'none' : 'inline';
    }
    if (freeShippingBadge) {
        const qualifiesForFreeShipping = Number(deliverySettings.freeShippingMinAmount) === 0
            || subtotal >= Number(deliverySettings.freeShippingMinAmount);
        freeShippingBadge.style.display = qualifiesForFreeShipping && deliveryCharge === 0 ? 'inline-flex' : 'none';
    }
    if (grandTotalText) grandTotalText.innerText = `৳${grandTotal}`;

    return { subtotal, merchandisePayable, deliveryCharge, grandTotal };
}

/* =========================================================================
   ২. কোর লজিক: চেকআউট আইটেম ফিল্টার (Buy Now vs Cart)
   ========================================================================= */
function getCheckoutItems() {
    const isBuyNow = localStorage.getItem('isBuyNowMode') === 'true';
    
    if (isBuyNow) {
        // Buy Now মোড হলে কার্টের কোনো আইটেম দেখাবে না, শুধু Buy Now আইটেম দেখাবে
        return JSON.parse(localStorage.getItem('buy_now_item')) || [];
    } else {
        // সাধারণ কার্ট থেকে আসলে শুধুমাত্র সিলেক্টেড আইটেম দেখাবে
        let currentCart = customerToken ? cart : (JSON.parse(localStorage.getItem('cart')) || []);
        return currentCart.filter(item => item.selected !== false);
    }
}

/* =========================================================================
   ৩. ডাটাবেজ বা লোকাল স্টোরেজ থেকে কার্ট ডাটা নিয়ে আসা
   ========================================================================= */
function fetchCartData() {
    if (customerToken) {
        // লগইন থাকলে ডাটাবেজ থেকে কার্ট আনবে
        fetch('/api/cart', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${customerToken}` }
        })
        .then(res => res.json())
        .then(dbCartItems => {
            cart = dbCartItems.map(item => ({
                id: item.productId,
                name: item.name,
                price: Number(item.price),
                products: item.image || '',
                icon: item.icon || '📦',
                quantity: item.quantity,
                selected: item.selected !== false,
                variantId: item.variantId || '',
                variantLabel: item.variantLabel || '',
                variantAttribute: item.variantAttribute || '',
                variantValue: item.variantValue || '',
                variantSku: item.variantSku || ''
            }));
            renderCheckoutCart();
        })
        .catch(err => {
            console.error("Error fetching live DB cart for checkout:", err);
            renderCheckoutCart();
        });
    } else {
        // গেস্ট ইউজারের জন্য রেন্ডার কল (getCheckoutItems লোকাল থেকে ডাটা নেবে)
        renderCheckoutCart();
    }
}

/* =========================================================================
   🛍️ ৪. কার্ট রেন্ডারিং ইঞ্জিন ও Empty Cart UI
   ========================================================================= */
function renderCheckoutCart() {
    const container = document.getElementById('checkoutItemsContainer');
    const template = document.getElementById('cartItemTemplate');
    const subtotalText = document.getElementById('checkoutSubtotal');
    const grandTotalText = document.getElementById('checkoutGrandTotal');
    const totalItemsCountText = document.getElementById('totalItemsCount'); 
    const proceedBtn = document.getElementById('proceedToPaymentBtn');
    
    const shippingSection = document.getElementById('shippingFormSection'); 
    const orderSummarySection = document.getElementById('orderSummarySection');
    
    // 🌟 সেন্ট্রাল ফাংশন থেকে আইটেম লোড করা হচ্ছে (Buy Now বা Cart অনুযায়ী)
    let checkedItems = getCheckoutItems();
    
    if (!container) return;
    container.innerHTML = '';
    
    if (totalItemsCountText) {
        totalItemsCountText.innerText = `${checkedItems.length} Items`;
    }
    
    // যদি চেকআউটে কোনো প্রোডাক্ট না থাকে
    if (checkedItems.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:50px 20px; background:#fff; border-radius:12px;">
                <div style="font-size:48px; margin-bottom:15px;">🛒</div>
                <h3 style="color:#334155; font-size:20px; margin-bottom:8px;">Your Cart is Empty</h3>
                <p style="color:#64748b; font-size:14px; margin-bottom:24px;">Please add some products from the shop to proceed.</p>
                <a href="/" style="background:var(--primary-color, #f97316); color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600; display:inline-block; transition:0.3s;">Browse Products</a>
            </div>
        `;
        
        if (subtotalText) subtotalText.innerText = `৳0`;
        if (grandTotalText) grandTotalText.innerText = `৳0`;
        const deliveryChargeEl = document.getElementById('checkoutDeliveryCharge');
        const freeShippingBadge = document.getElementById('checkoutFreeShippingBadge');
        if (deliveryChargeEl) {
            deliveryChargeEl.innerText = '৳0';
            deliveryChargeEl.style.display = 'inline';
        }
        if (freeShippingBadge) freeShippingBadge.style.display = 'none';
        if (proceedBtn) proceedBtn.style.display = 'none'; 
        if (shippingSection) shippingSection.style.display = 'none';
        if (orderSummarySection) orderSummarySection.style.display = 'none';
        setAppliedCoupon(null);
        
        return;
    } else {
        if (proceedBtn) proceedBtn.style.display = 'block'; 
        if (shippingSection) shippingSection.style.display = 'block';
        if (orderSummarySection) orderSummarySection.style.display = 'block';
    }

    let calculatedTotal = 0;
    if (!template) return;

    checkedItems.forEach(item => {
        let cleanPrice = parseFloat(item.price) || 0;
        let cleanQty = parseInt(item.quantity) || 1;
        calculatedTotal += (cleanPrice * cleanQty);

        const clone = template.content.cloneNode(true);
        const mediaFrame = clone.querySelector('.cart-media-frame-box');
        
        let realProduct = globalProductCatalog.find(p => String(p._id) === String(item.id) || String(p.productId) === String(item.id) || String(p.id) === String(item.id));
        
        let displayEmoji = (realProduct && realProduct.icon) ? realProduct.icon.trim() : (item.icon || "📦");
        let imageFile = (realProduct && realProduct.image) ? realProduct.image.trim() : ((realProduct && realProduct.products) ? realProduct.products.trim() : (item.products || item.image || ''));

        if (imageFile !== '') {
            let lowerPath = imageFile.toLowerCase();
            if (lowerPath.includes('.jpg') || lowerPath.includes('.png') || lowerPath.includes('.jpeg') || lowerPath.includes('.webp')) {
                let imagePath = imageFile;
                if (!imagePath.startsWith('/') && !imagePath.startsWith('http') && !imagePath.startsWith('products/')) {
                    imagePath = '/products/' + imagePath;
                } else if (imagePath.startsWith('products/')) {
                    imagePath = '/' + imagePath;
                }
                
                mediaFrame.innerHTML = `
                    <img src="${imagePath}" alt="${item.name}" 
                         style="width:100%; height:100%; object-fit:cover; border-radius:4px;"
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <span style="font-size:24px; display:none; justify-content:center; align-items:center; width:100%; height:100%;">${displayEmoji}</span>
                `;
            } else {
                mediaFrame.innerHTML = `<span style="font-size:24px; display:flex; justify-content:center; align-items:center; width:100%; height:100%; background:#f9f9f9; border-radius:4px;">${displayEmoji}</span>`;
            }
        } else {
            mediaFrame.innerHTML = `<span style="font-size:24px; display:flex; justify-content:center; align-items:center; width:100%; height:100%; background:#f9f9f9; border-radius:4px;">${displayEmoji}</span>`;
        }
        
        clone.querySelector('.cart-item-name-text').innerText =
            item.variantLabel ? `${item.name} — ${item.variantLabel}` : item.name;
        clone.querySelector('.cart-item-base-price-text').innerText = `৳${cleanPrice}`;
        clone.querySelector('.cart-item-total').innerText = `৳${(cleanPrice * cleanQty)}`;
        clone.querySelector('.qty-text').innerText = cleanQty;

        const vId = item.variantId || '';
        clone.querySelector('.btn-minus').onclick = () => changeItemQuantity(item.id, -1, vId);
        clone.querySelector('.btn-plus').onclick = () => changeItemQuantity(item.id, 1, vId);
        clone.querySelector('.checkout-row-delete-btn-main').onclick = () => temporarilyRemoveFromCheckout(item.id, vId);

        container.appendChild(clone);
    });

    updateCheckoutTotals(calculatedTotal);

    refreshCheckoutCouponAvailability().then((available) => {
        if (!available) updateCheckoutTotals(calculatedTotal);
    });
}

function syncCheckoutCouponUI(subtotal) {
    if (!checkoutCouponsAvailable) {
        const applied = getAppliedCoupon();
        if (applied) setAppliedCoupon(null);

        const discountRow = document.getElementById('checkoutDiscountRow');
        const msgEl = document.getElementById('checkoutCouponAppliedMsg');
        const removeBtn = document.getElementById('checkoutRemoveCouponBtn');
        const applyBtn = document.getElementById('checkoutApplyCouponBtn');
        const input = document.getElementById('checkoutCouponInput');

        if (discountRow) discountRow.style.display = 'none';
        if (msgEl) msgEl.style.display = 'none';
        if (removeBtn) removeBtn.style.display = 'none';
        if (applyBtn) applyBtn.style.display = 'none';
        if (input) {
            input.value = '';
            input.disabled = false;
        }
        return subtotal;
    }

    const applied = getAppliedCoupon();
    const discountRow = document.getElementById('checkoutDiscountRow');
    const discountEl = document.getElementById('checkoutDiscountAmount');
    const codeLabel = document.getElementById('checkoutCouponCodeLabel');
    const msgEl = document.getElementById('checkoutCouponAppliedMsg');
    const removeBtn = document.getElementById('checkoutRemoveCouponBtn');
    const applyBtn = document.getElementById('checkoutApplyCouponBtn');
    const input = document.getElementById('checkoutCouponInput');

    const subtotalMatch = applied && Math.round(Number(applied.subtotal) * 100) === Math.round(Number(subtotal) * 100);
    if (applied && applied.code && Number(applied.discountAmount) > 0 && subtotalMatch) {
        if (discountRow) discountRow.style.display = 'flex';
        if (discountEl) discountEl.innerText = `-৳${applied.discountAmount}`;
        if (codeLabel) codeLabel.innerText = applied.code;
        if (msgEl) {
            msgEl.style.display = 'block';
            msgEl.innerText = `Coupon "${applied.code}" applied — you save ৳${applied.discountAmount}`;
        }
        if (removeBtn) removeBtn.style.display = 'inline-flex';
        if (applyBtn) applyBtn.style.display = 'none';
        if (input) {
            input.value = applied.code;
            input.disabled = true;
        }
        return Number(applied.finalTotal);
    }

    if (applied && !subtotalMatch) {
        setAppliedCoupon(null);
    }

    if (discountRow) discountRow.style.display = 'none';
    if (msgEl) msgEl.style.display = 'none';
    if (removeBtn) removeBtn.style.display = 'none';
    if (applyBtn) applyBtn.style.display = 'inline-flex';
    if (input && !getAppliedCoupon()) {
        input.disabled = false;
    }
    return subtotal;
}

async function applyCheckoutCoupon() {
    if (!checkoutCouponsAvailable) {
        hideCheckoutCouponSection();
        showCouponToast('No active coupons are available at this time.', 'warning');
        updateCheckoutTotals(getCheckoutSubtotal());
        return;
    }

    const input = document.getElementById('checkoutCouponInput');
    const code = (input?.value || '').trim().toUpperCase();
    if (!code) return showCouponToast('Please enter a coupon code.', 'warning');

    const checkedItems = getCheckoutItems();
    let subtotal = 0;
    checkedItems.forEach(item => {
        subtotal += (parseFloat(item.price) || 0) * (parseInt(item.quantity) || 1);
    });

    if (subtotal <= 0) return showCouponToast('Your cart is empty.', 'warning');

    const applyBtn = document.getElementById('checkoutApplyCouponBtn');
    if (applyBtn) {
        applyBtn.disabled = true;
        applyBtn.textContent = 'Applying...';
    }

    try {
        const headers = { 'Content-Type': 'application/json' };
        if (customerToken) headers['Authorization'] = `Bearer ${customerToken}`;

        const res = await fetch('/api/coupons/apply', {
            method: 'POST',
            headers,
            body: JSON.stringify({ code, subtotal })
        });
        const result = await res.json();

        if (result.success && result.data) {
            setAppliedCoupon({
                code: result.data.code,
                discountAmount: result.data.discountAmount,
                subtotal: result.data.subtotal,
                finalTotal: result.data.finalTotal,
                discountType: result.data.discountType,
                discountValue: result.data.discountValue
            });
            showCouponToast('Coupon applied successfully!', 'success');
            renderCheckoutCart();
        } else {
            showCouponToast(result.message || 'Invalid coupon code', 'error');
        }
    } catch (err) {
        showCouponToast('Failed to apply coupon. Please try again.', 'error');
    } finally {
        if (applyBtn) {
            applyBtn.disabled = false;
            applyBtn.textContent = 'Apply';
        }
    }
}

function removeCheckoutCoupon() {
    setAppliedCoupon(null);
    const input = document.getElementById('checkoutCouponInput');
    if (input) {
        input.value = '';
        input.disabled = false;
    }
    showCouponToast('Coupon removed.', 'success');
    renderCheckoutCart();
}

/* =========================================================================
   ⚡ ৫. কোর কার্ট অ্যাকশন লজিক (Quantity & Remove) - Buy Now আইসোলেটেড
   ========================================================================= */
function changeItemQuantity(productId, amount, variantId = '') {
    const isBuyNow = localStorage.getItem('isBuyNowMode') === 'true';
    const sameLineCk = (i) => String(i.id) === String(productId) &&
        String(i.variantId || '') === String(variantId || '');

    // 🌟 যদি Buy Now মোড হয়, তবে শুধু buy_now_item আপডেট করবে, মেইন কার্টে হাত দেবে না
    if (isBuyNow) {
        let bnCart = JSON.parse(localStorage.getItem('buy_now_item')) || [];
        const item = bnCart.find(sameLineCk);
        if (item) {
            const targetQty = (parseInt(item.quantity) || 1) + amount;
            if (targetQty < 1) { 
                temporarilyRemoveFromCheckout(productId, variantId); 
                return; 
            }
            item.quantity = targetQty;
            localStorage.setItem('buy_now_item', JSON.stringify(bnCart));
            renderCheckoutCart();
        }
        return; 
    }

    // 🌟 সাধারণ কার্টের লজিক (আগের মতো)
    let currentCart = customerToken ? cart : (JSON.parse(localStorage.getItem('cart')) || []);
    const item = currentCart.find(sameLineCk);
    
    if (item) {
        const targetQty = (parseInt(item.quantity) || 1) + amount;
        
        if (targetQty < 1) { 
            temporarilyRemoveFromCheckout(productId, variantId); 
            return; 
        }

        if (customerToken) {
            fetch('/api/cart/update-quantity', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${customerToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ productId, quantity: targetQty, variantId })
            }).then(() => {
                item.quantity = targetQty;
                renderCheckoutCart();
            }).catch(err => console.error("Error updating quantity in checkout:", err));
        } else {
            item.quantity = targetQty;
            localStorage.setItem('cart', JSON.stringify(currentCart));
            renderCheckoutCart();
        }
    }
}

function temporarilyRemoveFromCheckout(productId, variantId = '') {
    const isBuyNow = localStorage.getItem('isBuyNowMode') === 'true';
    const sameLineCk = (i) => String(i.id) === String(productId) &&
        String(i.variantId || '') === String(variantId || '');

    // 🌟 যদি Buy Now মোড হয়, তবে শুধু buy_now_item থেকে ডিলিট করবে
    if (isBuyNow) {
        let bnCart = JSON.parse(localStorage.getItem('buy_now_item')) || [];
        bnCart = bnCart.filter(i => !sameLineCk(i));
        localStorage.setItem('buy_now_item', JSON.stringify(bnCart));
        
        if (bnCart.length === 0) {
            localStorage.removeItem('isBuyNowMode'); // আইটেম না থাকলে মোড অফ
        }
        renderCheckoutCart();
        return;
    }

    // 🌟 সাধারণ কার্টের লজিক (আগের মতো)
    let currentCart = customerToken ? cart : (JSON.parse(localStorage.getItem('cart')) || []);
    const item = currentCart.find(sameLineCk);
    
    if (item) {
        if (customerToken) {
            fetch('/api/cart/toggle-selection', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${customerToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ productId, selected: false, variantId })
            }).then(() => {
                item.selected = false;
                renderCheckoutCart();
            }).catch(err => console.error("Error toggling selection in checkout:", err));
        } else {
            item.selected = false;
            localStorage.setItem('cart', JSON.stringify(currentCart));
            renderCheckoutCart();
        }
    }
}

/* =========================================================================
   💳 ৬. পেমেন্ট সাবমিশন লজিক
   ========================================================================= */
function handleProceedToPayment() {
    handleProceedToPaymentAsync().catch((err) => {
        console.error('Proceed to payment error:', err);
        showCouponToast('Something went wrong. Please try again.', 'error');
    });
}

async function handleProceedToPaymentAsync() {
    // পেমেন্টের আগে হাইব্রিড কার্ট চেক (সেন্ট্রাল ফাংশন দিয়ে)
    const checkedItems = getCheckoutItems();

    if (checkedItems.length === 0) {
        openCheckoutAlertModal("Your cart is empty! Please add products.");
        return;
    }

    let errorMessages = [];
    
    if (!validationState.name) {
        errorMessages.push("⚠️ Please enter your Full Name correctly (at least 2 words).");
    }
    if (!validationState.mobile) {
        errorMessages.push("⚠️ Please enter a valid 11-digit Mobile Number.");
    }
    if (!validationState.address) {
        errorMessages.push("⚠️ Please enter your complete Delivery Address (at least 3 words).");
    }
    if (!validationState.district) {
        errorMessages.push("⚠️ Please select your District / City.");
    }
    if (!validationState.upazila) {
        errorMessages.push("⚠️ Please select your Upazila / Thana.");
    }

    if (errorMessages.length > 0) {
        const finalMessage = errorMessages.join("\n\n"); 
        openCheckoutAlertModal(finalMessage);
        return;
    }

    const nameVal = document.getElementById('shippingFullName').value.trim();
    const mobileVal = document.getElementById('shippingMobile').value.trim();
    const streetAddressVal = document.getElementById('shippingAddress').value.trim();
    const noteVal = document.getElementById('shippingCourierNote')?.value.trim() || "";
    const shippingDistrict = document.getElementById('shippingDistrict')?.value?.trim() || selectedShippingDistrict;
    const shippingUpazila = document.getElementById('shippingUpazila')?.value?.trim() || selectedShippingUpazila;
    const addressVal = buildCompleteDeliveryAddress({
        streetText: streetAddressVal,
        upazila: shippingUpazila,
        district: shippingDistrict
    });
    const shippingLocationType = resolveShippingZoneLabel() || 'Outside City';
    const deliveryLocationType = shippingLocationType === 'Inside City' ? 'inside' : 'outside';

    let subtotal = checkedItems.reduce((sum, item) => sum + (parseFloat(item.price) * parseInt(item.quantity)), 0);

    const couponsStillAvailable = await refreshCheckoutCouponAvailability();
    if (!couponsStillAvailable) {
        setAppliedCoupon(null);
    }

    const applied = getAppliedCoupon();
    let discountAmount = 0;
    let couponCode = '';
    let merchandisePayable = subtotal;

    if (applied && applied.code && Math.round(Number(applied.subtotal) * 100) === Math.round(Number(subtotal) * 100)) {
        discountAmount = Number(applied.discountAmount) || 0;
        couponCode = applied.code;
        merchandisePayable = Number(applied.finalTotal);
        if (!Number.isFinite(merchandisePayable)) merchandisePayable = Math.max(0, subtotal - discountAmount);
    } else if (applied) {
        // Stale coupon — clear before payment
        setAppliedCoupon(null);
    }

    const deliveryCharge = calculateDeliveryCharge(subtotal);
    const totalAmount = Math.round((merchandisePayable + deliveryCharge) * 100) / 100;

    const checkoutOrderSession = {
        orderId: `EOB${Math.floor(100000 + Math.random() * 900000)}`, 
        customerName: nameVal,
        customerPhone: mobileVal,
        customerAddress: addressVal,
        shippingDistrict,
        shippingUpazila,
        shippingStreetAddress: streetAddressVal,
        saveAddressToProfile: document.getElementById('saveAddressToProfile')?.checked === true,
        saveAddressAsDefault: document.getElementById('saveAddressToProfile')?.checked === true,
        addressLabel: 'Home',
        selectedSavedAddressId: selectedSavedAddressId || null,
        subtotal,
        subTotal: subtotal,
        discountAmount,
        couponCode,
        deliveryLocationType,
        shippingLocationType,
        deliveryCharge,
        shippingFee: deliveryCharge,
        totalAmount,
        grandTotal: totalAmount,
        status: "Pending",
        items: checkedItems,
        note: noteVal
    };

    localStorage.setItem('activeCheckoutSession', JSON.stringify(checkoutOrderSession));
    
    window.location.href = '/payment';
}

function openCheckoutAlertModal(msg) {
    const modal = document.getElementById('checkoutAlertModal');
    if (modal) {
        modal.querySelector('.custom-alert-modal-message').innerText = msg;
        modal.style.display = 'flex';
    } else { alert(msg); }
}

function closeCheckoutAlertModal() {
    const modal = document.getElementById('checkoutAlertModal');
    if(modal) modal.style.display = 'none';
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

    let counterText = max ? `${currentCount}/${max}` : `${currentCount}`;
    
    if (input.value.trim() === "") {
        input.style.borderColor = "#cbd5e1";
        input.style.backgroundColor = "#ffffff";
        errorEl.innerText = "";
        iconCounterWrapper.innerHTML = "";
    } else if (isValid) {
        input.style.borderColor = "#10b981";
        input.style.backgroundColor = "#f0fdf4";
        errorEl.innerText = "";
        iconCounterWrapper.innerHTML = `<span style="font-size:12px; color:#64748b;">${counterText}</span> <i class="fa-solid fa-check-circle" style="color:#10b981;"></i>`;
    } else {
        input.style.borderColor = "#ef4444";
        input.style.backgroundColor = "#fef2f2";
        errorEl.innerText = ""; 
        iconCounterWrapper.innerHTML = `<span style="font-size:12px; color:#ef4444;">${counterText}</span>`;
    }
}

function detectSpamPattern(text) {
    return /([a-z\u0980-\u09ff])\1{2,}/i.test(text);
}

function initLiveValidationEngine() {
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

        let savedValue = localStorage.getItem(field.id);
        
        if (!savedValue) {
            if (field.id === 'shippingFullName') savedValue = localStorage.getItem('checkout_name');
            if (field.id === 'shippingMobile') savedValue = localStorage.getItem('checkout_phone');
            if (field.id === 'shippingAddress') {
                const fullAddress = localStorage.getItem('checkout_full_address') || '';
                const upazila = localStorage.getItem('checkout_upazila') || '';
                savedValue = buildStreetAddressText({
                    fullAddress,
                    upazila,
                    thana: upazila
                }) || localStorage.getItem('checkout_address');
            }
        }

        if (savedValue) {
            input.value = savedValue;
            setTimeout(() => input.dispatchEvent(new Event('input')), 50);
        }

        input.addEventListener('input', () => {
            localStorage.setItem(field.id, input.value);
            let val = input.value.trim();
            let len = val.length;
            let wordsCount = val.split(/\s+/).filter(word => word.length > 0).length;
            let isOk = false;

            if (field.id === 'shippingFullName') {
                isOk = len >= 3 && wordsCount >= 2 && !detectSpamPattern(val);
                validationState.name = isOk;
            }
            else if (field.id === 'shippingMobile') {
                input.value = input.value.replace(/\D/g, ''); 
                isOk = /^01[3-9]\d{8}$/.test(input.value); 
                validationState.mobile = isOk;
            }
            else if (field.id === 'shippingAddress') {
                isOk = len >= 10 && wordsCount >= 3 && !detectSpamPattern(val);
                validationState.address = isOk;
            }
            else if (field.id === 'shippingCourierNote') {
                isOk = true; 
            }

            updateFieldUI(input, errorEl, isOk, len, field.max > 0 ? field.max : null);
        });
    });
}





