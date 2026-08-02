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
const checkoutCDU = () => window.CartDisplayUtils || {};

function readGuestCartForCheckout() {
    if (checkoutCDU().getNormalizedGuestCart) {
        return checkoutCDU().getNormalizedGuestCart(globalProductCatalog);
    }
    try {
        return JSON.parse(localStorage.getItem('cart') || '[]');
    } catch (_) {
        localStorage.removeItem('cart');
        return [];
    }
}

function saveGuestCartForCheckout(items) {
    if (checkoutCDU().persistGuestCart) {
        return checkoutCDU().persistGuestCart(items);
    }
    localStorage.setItem('cart', JSON.stringify(items));
    return items;
}

function mapCheckoutCartItem(item = {}) {
    const catalogProduct = checkoutCDU().findCatalogProduct
        ? checkoutCDU().findCatalogProduct(item, globalProductCatalog)
        : globalProductCatalog.find((p) =>
            String(p._id) === String(item.productId || item.id) ||
            String(p.productId) === String(item.productId || item.id) ||
            String(p.id) === String(item.productId || item.id)
        );
    if (checkoutCDU().normalizeCartItem) {
        return checkoutCDU().normalizeCartItem(item, catalogProduct);
    }
    const displayImage = String(
        item.selectedImage || item.variantImage || item.image || item.products || ''
    ).trim();
    return {
        id: item.productId || item.id,
        name: item.name,
        price: Number(item.price),
        products: displayImage,
        image: displayImage,
        selectedImage: displayImage,
        variantImage: displayImage,
        images: item.images || catalogProduct?.images || [],
        icon: item.icon || item.emojiIcon || catalogProduct?.icon || '',
        emojiIcon: item.emojiIcon || item.icon || catalogProduct?.icon || '',
        quantity: item.quantity,
        selected: item.selected !== false,
        variantId: item.variantId || '',
        variantLabel: item.variantLabel || '',
        variantAttribute: item.variantAttribute || '',
        variantValue: item.variantValue || '',
        variantSku: item.variantSku || '',
        selectedColor: item.selectedColor || '',
        selectedSize: item.selectedSize || '',
        selectedVariant: item.selectedVariant || null
    };
}
let deliverySettings = {
    shopHomeCity: 'Dhaka',
    deliveryInsideCity: 60,
    deliveryOutsideCity: 120,
    freeShippingMinAmount: 1000,
    freeShippingThreshold: 1000
};
let selectedShippingDistrict = '';
let selectedShippingUpazila = '';
let checkoutProfileCache = null;
let savedCheckoutAddresses = [];
let selectedSavedAddressId = null;
let isApplyingSavedAddress = false;

// 🌟 টোকেন চেক (কাস্টমার লগইন আছে কি না জানার জন্য)
function getCheckoutAuthToken() {
    return localStorage.getItem('token') || localStorage.getItem('customerToken');
}

function isGuestCheckoutUser() {
    return !getCheckoutAuthToken();
}

const customerToken = getCheckoutAuthToken();

let validationState = {
    name: false,
    mobile: false,
    address: false,
    district: false,
    upazila: false
};

let checkoutCouponsAvailable = false;
let checkoutCouponController = null;
let checkoutWalletBalance = 0;
let checkoutBeginTracked = false;
let applyWalletAtCheckout = false;

function getAppliedCoupon() {
    return window.CouponUI ? window.CouponUI.getAppliedCoupon() : null;
}

function setAppliedCoupon(data) {
    if (window.CouponUI) window.CouponUI.setAppliedCoupon(data);
}

function hideCheckoutCouponSection() {
    checkoutCouponsAvailable = false;
    const container = document.getElementById('checkout-coupon-container');
    if (container) container.style.display = 'none';
    setAppliedCoupon(null);
    CouponUI?.syncCouponPanel({ prefix: 'checkout', subtotal: 0, couponsAvailable: false });
}

async function refreshCheckoutCouponAvailability() {
    if (checkoutCouponController?.recheckAvailability) {
        return checkoutCouponController.recheckAvailability();
    }

    const available = await (window.CouponUI?.checkActiveCoupons() || Promise.resolve(false));
    checkoutCouponsAvailable = available;
    const container = document.getElementById('checkout-coupon-container');
    if (container) container.style.display = available ? 'block' : 'none';
    if (!available) setAppliedCoupon(null);
    return available;
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
    if (window.CouponUI) {
        checkoutCouponController = await CouponUI.bindCouponForm({
            prefix: 'checkout',
            getSubtotal: getCheckoutSubtotal,
            getToken: () => getCheckoutAuthToken(),
            onAvailabilityChange: (available) => {
                checkoutCouponsAvailable = available;
            },
            onTotalsChange: (subtotal) => updateCheckoutTotals(subtotal)
        });
        checkoutCouponsAvailable = checkoutCouponController?.couponsAvailable === true;
    }

    ensureCheckoutLocationSelectors();
    syncCheckoutSelectPlaceholders();
    initSavedAddressManualEditWatchers();
    await initializeCheckoutPage();
    initLiveValidationEngine();
    initCheckoutWalletControls();
    
    const proceedBtn = document.getElementById('proceedToPaymentBtn');
    if (proceedBtn) proceedBtn.addEventListener('click', handleProceedToPayment);

    fetch('/api/products')
        .then(res => res.json())
        .then(data => {
            globalProductCatalog = Array.isArray(data) ? data : (data.data || data.products || []);
            window.globalProductCatalog = globalProductCatalog;
            fetchCartData();
        })
        .catch(err => {
            console.error("Catalog load error:", err);
            fetchCartData();
        });
});

let checkoutLocationPair = null;

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
        localStorage.setItem('shippingDistrict', selectedShippingDistrict);
        localStorage.setItem('checkout_district', selectedShippingDistrict);
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
        localStorage.setItem('checkout_upazila', selectedShippingUpazila);
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
        ? `Matched with shop home city (${deliverySettings.shopHomeCity}) — ৳${deliverySettings.deliveryInsideCity}, est. 2-3 business days.`
        : `Outside shop home city (${deliverySettings.shopHomeCity}) — ৳${deliverySettings.deliveryOutsideCity}, est. 4-6 business days.`;
}

async function fetchDeliverySettings() {
    try {
        const res = await fetch('/api/store/delivery-settings');
        const data = await res.json();
        if (data.success && data.data) {
            // The admin panel's Master Settings threshold is authoritative; the
            // legacy field is kept mirrored, so either key resolves the same.
            const threshold = Number(
                data.data.freeShippingThreshold ?? data.data.freeShippingMinAmount
            ) || 0;

            deliverySettings = {
                shopHomeCity: data.data.shopHomeCity || 'Dhaka',
                deliveryInsideCity: Number(data.data.deliveryInsideCity) || 0,
                deliveryOutsideCity: Number(data.data.deliveryOutsideCity) || 0,
                freeShippingMinAmount: threshold,
                freeShippingThreshold: threshold
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
        if (res.ok && data) {
            checkoutWalletBalance = Math.max(0, Number(data.walletBalance) || 0);
            updateCheckoutWalletUI();
            return data;
        }
    } catch (err) {
        console.error('Failed to load profile for checkout:', err);
    }
    return null;
}

function initCheckoutWalletControls() {
    const checkbox = document.getElementById('applyWalletCheckbox');
    if (!checkbox) return;

    checkbox.addEventListener('change', () => {
        applyWalletAtCheckout = checkbox.checked && checkoutWalletBalance > 0;
        updateCheckoutTotals(getCheckoutSubtotal());
    });
}

function updateCheckoutWalletUI() {
    const panel = document.getElementById('checkoutWalletPanel');
    const balanceEl = document.getElementById('checkoutWalletBalance');
    const availableLabel = document.getElementById('checkoutWalletAvailableLabel');
    const checkbox = document.getElementById('applyWalletCheckbox');

    if (!panel) return;

    if (!customerToken || checkoutWalletBalance <= 0) {
        panel.style.display = 'none';
        applyWalletAtCheckout = false;
        if (checkbox) checkbox.checked = false;
        return;
    }

    panel.style.display = 'block';
    const formatted = checkoutWalletBalance.toLocaleString('en-US');
    if (balanceEl) balanceEl.innerText = `৳${formatted}`;
    if (availableLabel) availableLabel.innerText = `(Available: ৳${formatted})`;
}

function calculateWalletApplication(grandTotal) {
    if (!applyWalletAtCheckout || checkoutWalletBalance <= 0) {
        return { walletApplied: 0, payableTotal: grandTotal };
    }
    const walletApplied = Math.min(checkoutWalletBalance, grandTotal);
    const payableTotal = Math.round((grandTotal - walletApplied) * 100) / 100;
    return { walletApplied, payableTotal };
}

function renderCheckoutWalletSummary(grandTotal) {
    const deductRow = document.getElementById('checkoutWalletDeductRow');
    const payableRow = document.getElementById('checkoutPayableRow');
    const walletAppliedEl = document.getElementById('checkoutWalletApplied');
    const payableEl = document.getElementById('checkoutPayableTotal');
    const { walletApplied, payableTotal } = calculateWalletApplication(grandTotal);

    if (deductRow) deductRow.style.display = walletApplied > 0 ? 'flex' : 'none';
    if (payableRow) payableRow.style.display = walletApplied > 0 ? 'flex' : 'none';
    if (walletAppliedEl) walletAppliedEl.innerText = `-৳${walletApplied.toLocaleString('en-US')}`;
    if (payableEl) payableEl.innerText = `৳${payableTotal.toLocaleString('en-US')}`;

    return { walletApplied, payableTotal };
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
            <label class="saved-address-card${addr.isDefault ? ' saved-address-card--default' : ''}" data-address-id="${escapeCheckoutHtml(id)}">
                <input type="radio" name="savedDeliveryAddress" value="${escapeCheckoutHtml(id)}">
                <div class="saved-address-card__top">
                    <span class="saved-address-card__label">${label}${addr.isDefault ? ' <span class="saved-address-card__default">Default</span>' : ''}</span>
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

function autoSelectDefaultSavedAddress(addresses = []) {
    const defaultAddr = (Array.isArray(addresses) ? addresses : []).find((addr) => addr.isDefault);
    if (!defaultAddr || !defaultAddr._id) return false;

    const container = document.getElementById('savedAddressCards');
    if (!container) return false;

    const card = container.querySelector(`.saved-address-card[data-address-id="${defaultAddr._id}"]`);
    if (!card) return false;

    const radio = card.querySelector('input[type="radio"]');
    if (!radio) return false;

    document.querySelectorAll('.saved-address-card input[type="radio"]').forEach((otherRadio) => {
        if (otherRadio !== radio) {
            forceUncheckSavedAddressRadio(otherRadio, otherRadio.closest('.saved-address-card'));
        }
    });

    radio.checked = true;
    radio.setAttribute('data-was-checked', 'true');
    card.classList.add('is-selected');

    selectedSavedAddressId = defaultAddr._id;
    applySavedAddressToCheckoutForm(defaultAddr, checkoutProfileCache);
    updateSaveAddressCheckboxState();
    return true;
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
    ].forEach((key) => localStorage.removeItem(key));
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
    const cachedEmail = localStorage.getItem('checkout_email');

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
}

function updateGuestCheckoutUI() {
    const banner = document.getElementById('guestCheckoutBanner');
    const saveToggle = document.querySelector('.checkout-save-address-toggle');
    const emailGroup = document.getElementById('guestEmailFieldGroup');
    const addressEl = document.getElementById('shippingAddress');

    if (!isGuestCheckoutUser()) {
        if (banner) banner.hidden = true;
        if (saveToggle) saveToggle.style.display = '';
        if (emailGroup) emailGroup.style.display = '';
        if (addressEl) {
            addressEl.placeholder = 'House, road, village, area — loaded from your profile when available';
        }
        return;
    }

    if (banner) banner.hidden = false;
    if (saveToggle) saveToggle.style.display = 'none';
    if (emailGroup) emailGroup.style.display = 'block';
    if (addressEl) {
        addressEl.placeholder = 'House, road, village, area — enter your full delivery address';
    }
}

async function initializeCheckoutPage() {
    updateGuestCheckoutUI();

    if (isGuestCheckoutUser()) {
        prepareGuestCheckoutSession();
        await fetchDeliverySettings();
        recalculateCheckoutDelivery();
        return;
    }

    const [, profile, addresses] = await Promise.all([
        fetchDeliverySettings(),
        fetchCustomerProfileForCheckout(),
        fetchSavedAddressesForCheckout()
    ]);

    checkoutProfileCache = profile;

    renderSavedAddressCards(addresses);

    const defaultSelected = autoSelectDefaultSavedAddress(addresses);

    if (!defaultSelected) {
        if (profile) {
            applyProfileToCheckoutForm(profile);
        } else {
            applyCheckoutAddressFallback();
        }
    }

    recalculateCheckoutDelivery();
}

function initDistrictSelector() {
    ensureCheckoutLocationSelectors();
}

function initUpazilaSelector() {
    ensureCheckoutLocationSelectors();
}

function getCheckoutSubtotal() {
    const checkedItems = getCheckoutItems();
    return checkedItems.reduce((sum, item) => {
        const price = parseFloat(item.price) || 0;
        const qty = parseInt(item.quantity, 10) || 1;
        return sum + (price * qty);
    }, 0);
}

/**
 * Free-shipping state for a subtotal, mirroring the server's rule so the badge
 * and the charged fee can never disagree.
 */
function getFreeShippingProgress(subtotal) {
    const rawThreshold = Number(
        deliverySettings.freeShippingThreshold ?? deliverySettings.freeShippingMinAmount
    );
    const threshold = Number.isFinite(rawThreshold) && rawThreshold > 0 ? rawThreshold : 0;
    const merchandiseSubtotal = Math.max(0, Number(subtotal) || 0);

    if (threshold === 0) {
        return { threshold: 0, unlocked: true, remaining: 0, progressPercent: 100 };
    }

    const unlocked = merchandiseSubtotal >= threshold;
    return {
        threshold,
        unlocked,
        remaining: unlocked ? 0 : Math.round((threshold - merchandiseSubtotal) * 100) / 100,
        progressPercent: Math.min(100, Math.round((merchandiseSubtotal / threshold) * 100))
    };
}

function calculateDeliveryCharge(subtotal) {
    if (getFreeShippingProgress(subtotal).unlocked) {
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

function updateCheckoutDeliveryEstimate(subtotal) {
    const dateRangeEl = document.getElementById('checkoutDeliveryDateRange');
    const badgeEl = document.getElementById('checkoutDeliveryBadge');
    const estimateRow = document.getElementById('checkoutDeliveryEstimateRow');
    const SE = window.ShippingEstimator;

    if (!dateRangeEl || !SE) return;

    const district = selectedShippingDistrict || deliverySettings.shopHomeCity;
    const quote = SE.calculateShippingQuote(deliverySettings, {
        district,
        subtotal
    });

    if (!selectedShippingDistrict) {
        dateRangeEl.textContent = 'Select district';
        if (badgeEl) badgeEl.classList.remove('is-outside');
        if (estimateRow) estimateRow.style.opacity = '0.75';
        return;
    }

    if (estimateRow) estimateRow.style.opacity = '1';
    dateRangeEl.textContent = quote.estimatedDelivery
        ? quote.estimatedDelivery.label
        : quote.estimatedDelivery?.businessDayLabel || '—';

    if (badgeEl) {
        badgeEl.classList.toggle('is-outside', quote.zone === 'outside');
        badgeEl.title = quote.estimatedDelivery
            ? `${quote.estimatedDelivery.businessDayLabel} (${quote.shippingLocationType})`
            : '';
    }
}

/**
 * Shows "🎉 Free Shipping Unlocked!" once the subtotal clears the admin
 * threshold, and otherwise tells the customer exactly how much more to add.
 */
function renderFreeShippingStatus(subtotal, badgeEl) {
    const progress = getFreeShippingProgress(subtotal);
    const wrapEl = document.getElementById('checkoutFreeShippingProgress');
    const textEl = document.getElementById('checkoutFreeShippingProgressText');
    const barEl = document.getElementById('checkoutFreeShippingProgressBar');

    if (badgeEl) {
        badgeEl.textContent = '🎉 Free Shipping Unlocked!';
        badgeEl.style.display = progress.unlocked ? 'inline-flex' : 'none';
    }

    if (!wrapEl || !textEl || !barEl) return;

    // Nothing useful to show when every order already ships free.
    if (progress.threshold === 0) {
        wrapEl.style.display = 'none';
        return;
    }

    wrapEl.style.display = 'block';
    wrapEl.classList.toggle('is-unlocked', progress.unlocked);
    barEl.style.width = `${progress.progressPercent}%`;
    textEl.textContent = progress.unlocked
        ? (window.ShippingEstimator?.formatFreeShippingUnlockedMessage?.() || '🎉 Free Shipping Unlocked!')
        : (window.ShippingEstimator?.formatFreeShippingRemainingMessage?.(progress.remaining) || `Add ৳${progress.remaining.toLocaleString('en-US')} more for FREE shipping`);
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
    renderFreeShippingStatus(subtotal, freeShippingBadge);
    if (grandTotalText) grandTotalText.innerText = `৳${grandTotal}`;

    const walletSummary = renderCheckoutWalletSummary(grandTotal);
    updateCheckoutDeliveryEstimate(subtotal);

    return {
        subtotal,
        merchandisePayable,
        deliveryCharge,
        grandTotal,
        walletApplied: walletSummary.walletApplied,
        payableTotal: walletSummary.payableTotal
    };
}

function buildCheckoutItemImageHtml(item, catalogProduct) {
    const CDU = checkoutCDU();
    const catalog = catalogProduct || (CDU.findCatalogProduct
        ? CDU.findCatalogProduct(item, globalProductCatalog)
        : null);
    if (CDU.buildItemImageHtml) {
        return CDU.buildItemImageHtml(item, '52px', catalog);
    }
    if (typeof window.buildItemImageHtml === 'function') {
        return window.buildItemImageHtml(item, '52px', catalog);
    }
    return '<div class="no-photo-badge"><span>NO PHOTO</span></div>';
}

/* =========================================================================
   ২. কোর লজিক: চেকআউট আইটেম ফিল্টার (Buy Now vs Cart)
   ========================================================================= */
function getCheckoutItems() {
    const isBuyNow = localStorage.getItem('isBuyNowMode') === 'true';
    
    if (isBuyNow) {
        let buyNowItems = [];
        try {
            buyNowItems = JSON.parse(localStorage.getItem('buy_now_item') || '[]');
            if (!Array.isArray(buyNowItems)) buyNowItems = [];
        } catch (_) {
            buyNowItems = [];
        }
        return checkoutCDU().normalizeCartArray
            ? checkoutCDU().normalizeCartArray(buyNowItems, globalProductCatalog)
            : buyNowItems;
    }

    const currentCart = customerToken ? cart : readGuestCartForCheckout();
    return currentCart.filter(item => item.selected !== false);
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
            const items = Array.isArray(dbCartItems)
                ? dbCartItems
                : (Array.isArray(dbCartItems?.data) ? dbCartItems.data : []);
            cart = items.map(mapCheckoutCartItem);
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
    if (checkoutCDU().normalizeCartArray && checkedItems.length > 0) {
        checkedItems = checkoutCDU().normalizeCartArray(checkedItems, globalProductCatalog);
    }
    
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
        const freeShippingProgress = document.getElementById('checkoutFreeShippingProgress');
        if (freeShippingProgress) freeShippingProgress.style.display = 'none';
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
        const CDU = checkoutCDU();

        const realProduct = CDU.findCatalogProduct
            ? CDU.findCatalogProduct(item, globalProductCatalog)
            : globalProductCatalog.find((p) =>
                String(p._id) === String(item.id || item.productId) ||
                String(p.productId) === String(item.id || item.productId) ||
                String(p.id) === String(item.id || item.productId)
            );
        const productUrl = CDU.getProductDetailUrl ? CDU.getProductDetailUrl(item, realProduct) : '#';

        if (mediaFrame) {
            mediaFrame.innerHTML = buildCheckoutItemImageHtml(item, realProduct);
        }

        const mediaLink = clone.querySelector('.cart-product-link--media');
        if (mediaLink) mediaLink.href = productUrl;

        const nameLink = clone.querySelector('.cart-item-name-link');
        if (nameLink) {
            nameLink.href = productUrl;
            nameLink.textContent = item.name;
        }

        const badgesWrap = clone.querySelector('.cart-variant-badges-wrap');
        if (badgesWrap && CDU.buildVariantBadgesHtml) {
            badgesWrap.innerHTML = CDU.buildVariantBadgesHtml(item, realProduct);
        }

        clone.querySelector('.cart-item-base-price-text').innerText = `৳${Number(cleanPrice).toLocaleString()}`;
        const qtyLabel = clone.querySelector('.cart-item-qty-label');
        if (qtyLabel) qtyLabel.textContent = `× ${cleanQty}`;
        clone.querySelector('.cart-item-total').innerText = `৳${(cleanPrice * cleanQty).toLocaleString()}`;

        const vId = item.variantId || '';
        clone.querySelector('.checkout-row-delete-btn-main').onclick = () => temporarilyRemoveFromCheckout(item.id, vId);

        container.appendChild(clone);
    });

    const totals = updateCheckoutTotals(calculatedTotal);

    if (!checkoutBeginTracked && checkedItems.length > 0 && window.analytics) {
        checkoutBeginTracked = true;
        window.analytics.trackBeginCheckout(checkedItems, totals.grandTotal);
    }

    refreshCheckoutCouponAvailability().then((available) => {
        if (!available) updateCheckoutTotals(calculatedTotal);
    });
}

function syncCheckoutCouponUI(subtotal) {
    if (!window.CouponUI) return subtotal;
    const result = CouponUI.syncCouponPanel({
        prefix: 'checkout',
        subtotal,
        couponsAvailable: checkoutCouponsAvailable,
        preserveFeedback: true
    });
    return result.merchandisePayable;
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
    let currentCart = customerToken ? cart : readGuestCartForCheckout();
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
            saveGuestCartForCheckout(currentCart);
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
    let currentCart = customerToken ? cart : readGuestCartForCheckout();
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
            saveGuestCartForCheckout(currentCart);
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
        errorMessages.push("⚠️ Please enter your Full Name (at least 2 characters).");
    }
    if (!validationState.mobile) {
        errorMessages.push("⚠️ Please enter a valid 11-digit Mobile Number.");
    }
    if (!validationState.address) {
        errorMessages.push("⚠️ Please enter your Delivery Address.");
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
    const emailVal = document.getElementById('shippingEmail')?.value.trim() || '';
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
    const walletSummary = calculateWalletApplication(totalAmount);
    const payableAfterWallet = walletSummary.payableTotal;
    const SE = window.ShippingEstimator;
    const shippingQuote = SE
        ? SE.calculateShippingQuote(deliverySettings, { district: shippingDistrict, subtotal })
        : null;

    const checkoutOrderSession = {
        orderId: `EOB${Math.floor(100000 + Math.random() * 900000)}`, 
        customerName: nameVal,
        customerPhone: mobileVal,
        customerEmail: emailVal,
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
        estimatedDelivery: shippingQuote?.estimatedDelivery || null,
        totalAmount,
        grandTotal: totalAmount,
        walletApplied: walletSummary.walletApplied,
        payableAfterWallet,
        applyWallet: applyWalletAtCheckout && walletSummary.walletApplied > 0,
        status: "Pending",
        items: checkedItems,
        note: noteVal
    };

    localStorage.setItem('activeCheckoutSession', JSON.stringify(checkoutOrderSession));

    if (!isGuestCheckoutUser()) {
        localStorage.setItem('checkout_name', nameVal);
        localStorage.setItem('checkout_phone', mobileVal);
        if (emailVal) localStorage.setItem('checkout_email', emailVal);
    }
    
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
        }

        input.addEventListener('input', () => {
            if (!isGuestCheckoutUser()) {
                localStorage.setItem(field.id, input.value);
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





