const { DEFAULT_SETTINGS, getStoreSettings } = require('../utils/storeSettingsService');

async function storeSettingsMiddleware(req, res, next) {
    try {
        const settings = await getStoreSettings();
        const storeLogo = settings.logoPath || settings.logoUrl || settings.storeLogo || '';
        res.locals.settings = { ...settings, storeLogo };
        res.locals.storeLogo = storeLogo;
    } catch (error) {
        console.error('Store settings middleware error:', error);
        res.locals.settings = { ...DEFAULT_SETTINGS, storeLogo: '' };
        res.locals.storeLogo = '';
    }
    next();
}

module.exports = storeSettingsMiddleware;
