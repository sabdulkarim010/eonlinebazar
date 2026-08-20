/**
 * Dynamic payment brand logos — resolved from the PaymentMethod catalog
 * (injected via window.__STORE_SETTINGS__ or admin preview payloads).
 */
(function (global) {
    const LEGACY_GATEWAY_IDS = ['bKash', 'Nagad', 'Visa', 'MasterCard', 'COD'];

    const DEFAULT_GATEWAY_NAMES = {
        bKash: 'bKash',
        bkash: 'bKash',
        Nagad: 'Nagad',
        nagad: 'Nagad',
        Visa: 'VISA',
        visa: 'VISA',
        MasterCard: 'MasterCard',
        mastercard: 'MasterCard',
        COD: 'Cash on Delivery',
        cod: 'Cash on Delivery'
    };

    function getSettingsSource() {
        return global.__STORE_SETTINGS__ || {};
    }

    function getPaymentGatewaysMap(settings = getSettingsSource()) {
        const nested = settings.systemSettings;
        const src = nested && typeof nested === 'object' ? { ...settings, ...nested } : settings;
        if (src.paymentGateways && typeof src.paymentGateways === 'object') {
            return src.paymentGateways;
        }
        return {};
    }

    function getEnabledPaymentMethods(settings = getSettingsSource()) {
        const nested = settings.systemSettings;
        const src = nested && typeof nested === 'object' ? { ...settings, ...nested } : settings;

        if (Array.isArray(src.enabledPaymentMethods) && src.enabledPaymentMethods.length) {
            return src.enabledPaymentMethods.filter((method) => method && method.id);
        }

        if (Array.isArray(src.methods) && src.methods.length) {
            return src.methods.map((method) => ({
                id: method.code || method.id,
                name: method.name || method.code || method.id,
                logoUrl: method.logoUrl || ''
            }));
        }

        const gateways = getPaymentGatewaysMap(src);
        return Object.entries(gateways)
            .filter(([, entry]) => entry?.enabled !== false)
            .map(([id, entry]) => ({
                id,
                name: entry?.name || DEFAULT_GATEWAY_NAMES[id] || id,
                logoUrl: entry?.logoUrl || ''
            }));
    }

    function getPaymentBrandMeta(id, settings = getSettingsSource()) {
        if (!id) return null;

        const enabled = getEnabledPaymentMethods(settings);
        const fromEnabled = enabled.find((method) => String(method.id) === String(id));
        if (fromEnabled) {
            return {
                id: fromEnabled.id,
                title: fromEnabled.name || DEFAULT_GATEWAY_NAMES[id] || id,
                label: fromEnabled.name || DEFAULT_GATEWAY_NAMES[id] || id,
                logoUrl: fromEnabled.logoUrl || ''
            };
        }

        const gateways = getPaymentGatewaysMap(settings);
        const entry = gateways[id];
        if (!entry && !LEGACY_GATEWAY_IDS.includes(id) && !DEFAULT_GATEWAY_NAMES[id]) {
            return {
                id,
                title: id,
                label: id,
                logoUrl: ''
            };
        }

        return {
            id,
            title: entry?.name || DEFAULT_GATEWAY_NAMES[id] || id,
            label: entry?.name || DEFAULT_GATEWAY_NAMES[id] || id,
            logoUrl: entry?.logoUrl || ''
        };
    }

    function getPaymentImageSrc(id, settings = getSettingsSource()) {
        return getPaymentBrandMeta(id, settings)?.logoUrl || '';
    }

    function getPaymentLogoHtml(id, variant = 'storefront', settings = getSettingsSource()) {
        const meta = getPaymentBrandMeta(id, settings);
        if (!meta) return '';

        const variantClass = variant === 'admin' ? 'payment-brand-logo--admin' : 'payment-brand-logo--storefront';
        const slug = String(id).toLowerCase().replace(/[^a-z0-9]+/g, '-');

        if (meta.logoUrl) {
            return `<img src="${meta.logoUrl}" alt="${meta.title}" class="payment-brand-logo ${variantClass} payment-brand-logo--${slug}" loading="lazy" decoding="async">`;
        }

        return `<span class="payment-name-badge payment-name-badge--${slug}">${meta.label}</span>`;
    }

    function renderPaymentLogoRow(methodIds, variant = 'storefront', settings = getSettingsSource()) {
        const enabledMethods = getEnabledPaymentMethods(settings);
        const byId = Object.fromEntries(enabledMethods.map((method) => [method.id, method]));
        const list = Array.isArray(methodIds) ? methodIds : enabledMethods.map((method) => method.id);

        return list.map((id) => {
            const method = byId[id];
            if (method) {
                if (method.logoUrl) {
                    const variantClass = variant === 'admin' ? 'payment-brand-logo--admin' : 'payment-brand-logo--storefront';
                    const slug = String(id).toLowerCase().replace(/[^a-z0-9]+/g, '-');
                    return `<img src="${method.logoUrl}" alt="${method.name}" class="payment-brand-logo ${variantClass} payment-brand-logo--${slug}" loading="lazy" decoding="async">`;
                }
                return `<span class="payment-name-badge payment-name-badge--${String(id).toLowerCase().replace(/[^a-z0-9]+/g, '-')}">${method.name}</span>`;
            }
            return getPaymentLogoHtml(id, variant, settings);
        }).join('');
    }

    global.PaymentBrandLogos = {
        PAYMENT_GATEWAY_IDS: LEGACY_GATEWAY_IDS,
        DEFAULT_GATEWAY_NAMES,
        getPaymentGatewaysMap,
        getEnabledPaymentMethods,
        getPaymentBrandMeta,
        getPaymentImageSrc,
        getPaymentLogoHtml,
        renderPaymentLogoRow
    };
})(window);










