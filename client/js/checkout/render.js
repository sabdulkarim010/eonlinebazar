/**
 * Checkout Render
 * Barrel: client/js/checkout.js
 *
 * Globals used from other modules:
 *  * - cart
 * - globalProductCatalog
 * - customerToken
 * - getCheckoutItems
 * - checkoutCDU
 * - validationState
 *
 * Globals this module exposes:
 *  * - resolveShippingZoneLabel
 * - updateDeliveryZoneHint
 * - fetchDeliverySettings
 * - fetchCustomerProfileForCheckout
 * - initCheckoutWalletControls
 * - updateCheckoutWalletUI
 * - calculateWalletApplication
 * - renderCheckoutWalletSummary
 * - fetchSavedAddressesForCheckout
 * - escapeCheckoutHtml
 * - formatSavedAddressCardLine
 * - updateSaveAddressCheckboxState
 * - forceUncheckSavedAddressRadio
 * - resetSavedAddressRadioVisualState
 * - clearSavedAddressSelection
 * - revertCheckoutFormToProfileSettings
 * - notifyShippingLocationFieldsChanged
 * - handleSavedAddressRadioClick
 * - handleSavedAddressCardMouseDown
 * - renderSavedAddressCards
 * - autoSelectDefaultSavedAddress
 * - applySavedAddressToCheckoutForm
 * - initSavedAddressManualEditWatchers
 * - cacheCheckoutProfileLocally
 * - updateGuestCheckoutUI
 * - initializeCheckoutPage
 * - initDistrictSelector
 * - initUpazilaSelector
 * - getCheckoutSubtotal
 * - getFreeShippingProgress
 * - calculateDeliveryCharge
 * - updateCheckoutDeliveryEstimate
 * - renderFreeShippingStatus
 * - updateCheckoutTotals
 * - parseCheckoutCartResponse
 * - buildCheckoutItemImageHtml
 * - fetchCartData
 * - renderCheckoutCart
 * - syncCheckoutCouponUI
 */

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

function updateGuestCheckoutUI() {
    const banner = document.getElementById('guestCheckoutBanner');
    const saveToggle = document.querySelector('.checkout-save-address-toggle');
    const emailGroup = document.getElementById('guestEmailFieldGroup');
    const addressEl = document.getElementById('shippingAddress');
    const savedSection = document.getElementById('savedAddressesSection');

    if (typeof isGuestCheckoutUser !== 'function' || !isGuestCheckoutUser()) {
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
    if (savedSection) savedSection.hidden = true;
    if (addressEl) {
        addressEl.placeholder = 'House, road, village, area — enter your full delivery address';
    }
}

if (typeof updateGuestCheckoutUI === 'function') {
    window.updateGuestCheckoutUI = updateGuestCheckoutUI;
}

async function initializeCheckoutPage() {
    if (typeof updateGuestCheckoutUI === 'function') {
        updateGuestCheckoutUI();
    } else if (typeof window.updateGuestCheckoutUI === 'function') {
        window.updateGuestCheckoutUI();
    }

    if (typeof isGuestCheckoutUser === 'function' && isGuestCheckoutUser()) {
        if (typeof prepareGuestCheckoutSession === 'function') prepareGuestCheckoutSession();
        await fetchDeliverySettings();
        recalculateCheckoutDelivery();
        if (typeof bindProceedToPaymentButton === 'function') bindProceedToPaymentButton();
        else if (typeof window.bindProceedToPaymentButton === 'function') window.bindProceedToPaymentButton();
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
    if (typeof bindProceedToPaymentButton === 'function') bindProceedToPaymentButton();
    else if (typeof window.bindProceedToPaymentButton === 'function') window.bindProceedToPaymentButton();
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

function parseCheckoutCartResponse(payload) {
    if (checkoutCDU().parseCartApiResponse) {
        return checkoutCDU().parseCartApiResponse(payload);
    }
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.data)) return payload.data;
    if (payload && Array.isArray(payload.cart)) return payload.cart;
    return [];
}

function buildCheckoutItemImageHtml(item, catalogProduct) {
    const CDU = checkoutCDU();
    const catalog = catalogProduct || (CDU.findCatalogProduct
        ? CDU.findCatalogProduct(item, globalProductCatalog)
        : null);

    if (window.ProductThumbnail?.buildForCartItem) {
        const thumbHtml = window.ProductThumbnail.buildForCartItem(item, catalog, {
            variant: 'compact',
            showEmoji: true,
            size: '52px',
            alt: item?.name || 'Product'
        });
        return '<div class="cart-item-thumb-wrap" style="width:52px;height:52px;' +
            'flex-shrink:0;overflow:hidden;border-radius:8px;display:flex;align-items:center;justify-content:center">' +
            thumbHtml + '</div>';
    }

    if (CDU.buildItemImageHtml) {
        return CDU.buildItemImageHtml(item, '52px', catalog);
    }
    if (typeof window.buildItemImageHtml === 'function') {
        return window.buildItemImageHtml(item, '52px', catalog);
    }
    return '<div class="no-photo-badge"><span>NO PHOTO</span></div>';
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
            cart = parseCheckoutCartResponse(dbCartItems).map(mapCheckoutCartItem);
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

        const basePriceEl = clone.querySelector('.cart-item-base-price-text');
        if (basePriceEl) basePriceEl.innerText = `৳${Number(cleanPrice).toLocaleString()}`;
        const qtyLabel = clone.querySelector('.cart-item-qty-label');
        if (qtyLabel) qtyLabel.textContent = `× ${cleanQty}`;
        const lineTotalEl = clone.querySelector('.cart-item-total');
        if (lineTotalEl) lineTotalEl.innerText = `৳${(cleanPrice * cleanQty).toLocaleString()}`;

        const vId = item.variantId || '';
        const deleteBtn = clone.querySelector('.checkout-row-delete-btn-main');
        if (deleteBtn) deleteBtn.onclick = () => temporarilyRemoveFromCheckout(item.id, vId);

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
Object.assign(window, {
    resolveShippingZoneLabel,
    updateDeliveryZoneHint,
    fetchDeliverySettings,
    fetchCustomerProfileForCheckout,
    initCheckoutWalletControls,
    updateCheckoutWalletUI,
    calculateWalletApplication,
    renderCheckoutWalletSummary,
    fetchSavedAddressesForCheckout,
    escapeCheckoutHtml,
    formatSavedAddressCardLine,
    updateSaveAddressCheckboxState,
    forceUncheckSavedAddressRadio,
    resetSavedAddressRadioVisualState,
    clearSavedAddressSelection,
    revertCheckoutFormToProfileSettings,
    notifyShippingLocationFieldsChanged,
    handleSavedAddressRadioClick,
    handleSavedAddressCardMouseDown,
    renderSavedAddressCards,
    autoSelectDefaultSavedAddress,
    applySavedAddressToCheckoutForm,
    initSavedAddressManualEditWatchers,
    cacheCheckoutProfileLocally,
    updateGuestCheckoutUI,
    initializeCheckoutPage,
    initDistrictSelector,
    initUpazilaSelector,
    getCheckoutSubtotal,
    getFreeShippingProgress,
    calculateDeliveryCharge,
    updateCheckoutDeliveryEstimate,
    renderFreeShippingStatus,
    updateCheckoutTotals,
    parseCheckoutCartResponse,
    buildCheckoutItemImageHtml,
    fetchCartData,
    renderCheckoutCart,
    syncCheckoutCouponUI
});
