/**
 * Shared shipping calculator & delivery estimate for cart and checkout.
 */
(function initShippingEstimatorModule(global) {
    const DEFAULT_SETTINGS = {
        shopHomeCity: 'Dhaka',
        deliveryInsideCity: 60,
        deliveryOutsideCity: 120,
        freeShippingMinAmount: 1000
    };

    const ESTIMATE_RULES = {
        inside: { minDays: 2, maxDays: 3, label: '2-3 Business Days' },
        outside: { minDays: 4, maxDays: 6, label: '4-6 Business Days' }
    };

    let cachedSettings = null;
    let settingsPromise = null;

    function roundMoney(value) {
        return Math.round((Number(value) || 0) * 100) / 100;
    }

    function normalizeZone(zone) {
        return String(zone || '').trim().toLowerCase() === 'outside' ? 'outside' : 'inside';
    }

    function isBusinessDay(date) {
        const day = date.getDay();
        return day !== 5 && day !== 6;
    }

    function addBusinessDays(fromDate, businessDays) {
        const result = new Date(fromDate);
        let added = 0;
        while (added < businessDays) {
            result.setDate(result.getDate() + 1);
            if (isBusinessDay(result)) added += 1;
        }
        return result;
    }

    function formatEstimateDate(date) {
        return date.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    }

    function formatEstimateLabel(minDate, maxDate) {
        const minLabel = formatEstimateDate(minDate);
        const maxLabel = formatEstimateDate(maxDate);
        if (minLabel === maxLabel) return minLabel;
        return `${minLabel} – ${maxLabel}`;
    }

    function getDeliveryEstimate(zone = 'inside', fromDate = new Date()) {
        const normalizedZone = normalizeZone(zone);
        const rules = ESTIMATE_RULES[normalizedZone];
        const start = fromDate instanceof Date ? fromDate : new Date(fromDate);
        const minDate = addBusinessDays(start, rules.minDays);
        const maxDate = addBusinessDays(start, rules.maxDays);

        return {
            zone: normalizedZone,
            minBusinessDays: rules.minDays,
            maxBusinessDays: rules.maxDays,
            businessDayLabel: rules.label,
            minDate: minDate.toISOString(),
            maxDate: maxDate.toISOString(),
            label: formatEstimateLabel(minDate, maxDate)
        };
    }

    async function fetchDeliverySettings(forceRefresh = false) {
        if (cachedSettings && !forceRefresh) return cachedSettings;

        if (!settingsPromise || forceRefresh) {
            settingsPromise = fetch('/api/store/delivery-settings', { cache: 'no-store' })
                .then((res) => res.json())
                .then((data) => {
                    if (data && data.success && data.data) {
                        cachedSettings = {
                            shopHomeCity: data.data.shopHomeCity || DEFAULT_SETTINGS.shopHomeCity,
                            deliveryInsideCity: Number(data.data.deliveryInsideCity) || DEFAULT_SETTINGS.deliveryInsideCity,
                            deliveryOutsideCity: Number(data.data.deliveryOutsideCity) || DEFAULT_SETTINGS.deliveryOutsideCity,
                            freeShippingMinAmount: Number(data.data.freeShippingMinAmount) || DEFAULT_SETTINGS.freeShippingMinAmount
                        };
                        return cachedSettings;
                    }
                    cachedSettings = { ...DEFAULT_SETTINGS };
                    return cachedSettings;
                })
                .catch(() => {
                    cachedSettings = { ...DEFAULT_SETTINGS };
                    return cachedSettings;
                });
        }

        return settingsPromise;
    }

    function resolveDeliveryZone(settings, customerDistrict) {
        const config = { ...DEFAULT_SETTINGS, ...(settings || {}) };
        if (typeof global.districtsMatch === 'function') {
            return global.districtsMatch(customerDistrict, config.shopHomeCity) ? 'inside' : 'outside';
        }
        const left = String(customerDistrict || '').trim().toLowerCase();
        const right = String(config.shopHomeCity || '').trim().toLowerCase();
        return left && right && left === right ? 'inside' : 'outside';
    }

    function toShippingLocationLabel(zone) {
        return normalizeZone(zone) === 'outside' ? 'Outside City' : 'Inside City';
    }

    function calculateShippingQuote(settings, { district = '', subtotal = 0 } = {}) {
        const config = { ...DEFAULT_SETTINGS, ...(settings || {}) };
        const merchandiseSubtotal = Math.max(0, Number(subtotal) || 0);
        const threshold = Number(config.freeShippingMinAmount);
        const effectiveDistrict = String(district || '').trim() || config.shopHomeCity;
        const zone = resolveDeliveryZone(config, effectiveDistrict);
        const qualifiesForFreeShipping = threshold === 0 || merchandiseSubtotal >= threshold;

        let deliveryCharge = 0;
        if (!qualifiesForFreeShipping) {
            deliveryCharge = zone === 'outside'
                ? Number(config.deliveryOutsideCity) || 0
                : Number(config.deliveryInsideCity) || 0;
        }

        const estimate = getDeliveryEstimate(zone);

        return {
            district: effectiveDistrict,
            zone,
            shippingLocationType: toShippingLocationLabel(zone),
            deliveryCharge: roundMoney(deliveryCharge),
            freeShippingApplied: qualifiesForFreeShipping,
            estimatedDelivery: estimate
        };
    }

    function getSavedShippingDistrict(fallback = '') {
        return localStorage.getItem('shippingDistrict')
            || localStorage.getItem('checkout_district')
            || fallback
            || DEFAULT_SETTINGS.shopHomeCity;
    }

    function persistShippingDistrict(district) {
        const value = String(district || '').trim();
        if (!value) return;
        localStorage.setItem('shippingDistrict', value);
        localStorage.setItem('checkout_district', value);
    }

    function populateDistrictSelect(selectEl, selectedValue = '') {
        if (!selectEl || !Array.isArray(global.BANGLADESH_DISTRICTS)) return;

        selectEl.innerHTML = '<option value="">Select your district</option>';
        global.BANGLADESH_DISTRICTS.forEach((district) => {
            const option = document.createElement('option');
            option.value = district;
            option.textContent = district;
            selectEl.appendChild(option);
        });

        if (selectedValue) selectEl.value = selectedValue;
    }

    function formatCurrency(amount) {
        const value = roundMoney(amount);
        return value === 0 ? '৳0' : `৳${value}`;
    }

    global.ShippingEstimator = {
        DEFAULT_SETTINGS,
        ESTIMATE_RULES,
        fetchDeliverySettings,
        calculateShippingQuote,
        getDeliveryEstimate,
        getSavedShippingDistrict,
        persistShippingDistrict,
        populateDistrictSelect,
        resolveDeliveryZone,
        toShippingLocationLabel,
        formatCurrency,
        roundMoney
    };
})(window);
