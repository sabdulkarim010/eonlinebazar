const { DEFAULT_SETTINGS, getStoreSettings } = require('../utils/storeSettingsService');

async function storeSettingsMiddleware(req, res, next) {
    try {
        res.locals.settings = await getStoreSettings();
    } catch (error) {
        console.error('Store settings middleware error:', error);
        res.locals.settings = { ...DEFAULT_SETTINGS };
    }
    next();
}

module.exports = storeSettingsMiddleware;
