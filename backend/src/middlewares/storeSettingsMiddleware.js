const { DEFAULT_SETTINGS, getStoreSettings } = require('../services/storeSettingsService');
const { getPublicWhatsAppSettings } = require('../services/whatsappService');
const { getPublicPaymentPayload } = require('../services/paymentMethodService');

async function storeSettingsMiddleware(req, res, next) {
    try {
        const [settings, whatsappSettings, paymentSettings] = await Promise.all([
            getStoreSettings(),
            getPublicWhatsAppSettings(),
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
