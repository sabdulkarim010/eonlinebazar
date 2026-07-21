/********************************************************************
 * Project: EonlineBazar
 * File: deliveryEstimateService.js
 * Location: utils/deliveryEstimateService.js
 * Description: Business-day delivery window estimates by shipping zone.
 ********************************************************************/

const DELIVERY_ESTIMATE_RULES = {
    inside: { minDays: 2, maxDays: 3, label: '2-3 Business Days' },
    outside: { minDays: 4, maxDays: 6, label: '4-6 Business Days' }
};

function normalizeZone(zone) {
    return String(zone || '').trim().toLowerCase() === 'outside' ? 'outside' : 'inside';
}

function isBusinessDay(date) {
    const day = date.getDay();
    // Bangladesh weekend: Friday (5) and Saturday (6)
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
    const rules = DELIVERY_ESTIMATE_RULES[normalizedZone];
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

module.exports = {
    DELIVERY_ESTIMATE_RULES,
    normalizeZone,
    isBusinessDay,
    addBusinessDays,
    formatEstimateDate,
    formatEstimateLabel,
    getDeliveryEstimate
};
