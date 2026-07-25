const { DEFAULT_SETTINGS, getStoreSettings } = require('../utils/storeSettingsService');
const { getPublicWhatsAppSettings } = require('../utils/whatsappService');

async function storeSettingsMiddleware(req, res, next) {
    try {
        const [settings, whatsappSettings] = await Promise.all([
            getStoreSettings(),
            getPublicWhatsAppSettings()
        ]);
        const storeLogo = settings.logoPath || settings.logoUrl || settings.storeLogo || '';
        res.locals.settings = { ...settings, ...whatsappSettings, storeLogo };
        res.locals.storeLogo = storeLogo;
    } catch (error) {
        console.error('Store settings middleware error:', error);
        res.locals.settings = { ...DEFAULT_SETTINGS, storeLogo: '' };
        res.locals.storeLogo = '';
    }
    next();
}

module.exports = storeSettingsMiddleware;
