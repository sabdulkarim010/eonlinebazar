const { DEFAULT_SETTINGS, getStoreSettings } = require('../services/storeSettingsService');
const whatsappService = require('../services/whatsappService');
const { DEFAULT_PUBLIC_WHATSAPP } = whatsappService;
const { getPublicPaymentPayload } = require('../services/paymentMethodService');

const FALLBACK_WHATSAPP_SETTINGS = Object.freeze({
    publicSupportWhatsApp: DEFAULT_PUBLIC_WHATSAPP || '',
    privateAdminAlertWhatsApp: '',
    enableWhatsAppOrderAlerts: false
});

async function loadPublicWhatsAppSettings() {
    const fn = whatsappService.getPublicWhatsAppSettings;
    if (typeof fn !== 'function') {
        return { ...FALLBACK_WHATSAPP_SETTINGS };
    }
    try {
        return await fn();
    } catch (_err) {
        return { ...FALLBACK_WHATSAPP_SETTINGS };
    }
}

async function storeSettingsMiddleware(req, res, next) {
    try {
        const [settings, whatsappSettings, paymentSettings] = await Promise.all([
            getStoreSettings(),
            loadPublicWhatsAppSettings(),
            getPublicPaymentPayload()
        ]);
        const storeLogo = settings.logoPath || settings.logoUrl || settings.storeLogo || '';
        res.locals.settings = {
            ...settings,
            ...whatsappSettings,
            ...paymentSettings,
            storeLogo
        };
        res.locals.storeLogo = storeLogo;
    } catch (error) {
        console.error('Store settings middleware error:', error);
        res.locals.settings = {
            ...DEFAULT_SETTINGS,
            methods: [],
            paymentGateways: {},
            enabledPaymentMethods: [],
            activePaymentMethods: [],
            activePaymentGateways: {},
            storeLogo: ''
        };
        res.locals.storeLogo = '';
    }
    next();
}

module.exports = storeSettingsMiddleware;
