const Admin = require('../models/admin');
const { normalizeBrandingPublicUrl } = require('./brandingPaths');

const DEFAULT_SETTINGS = Object.freeze({
    storeName: 'EonlineBazar',
    logoPath: '',
    faviconPath: '/images/favicon.png',
    logoUrl: '',
    faviconUrl: '/images/favicon.png',
    currency: 'BDT',
    currencySymbol: '৳',
    timezone: 'Asia/Dhaka'
});

let cachedSettings = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 15 * 1000;

function mapAdminToSettings(admin) {
    if (!admin) return { ...DEFAULT_SETTINGS };

    const logoPath = normalizeBrandingPublicUrl(admin.logoUrl || '');
    const faviconPath = normalizeBrandingPublicUrl(admin.faviconUrl || '') || DEFAULT_SETTINGS.faviconPath;

    return {
        storeName: admin.storeName || DEFAULT_SETTINGS.storeName,
        logoPath,
        faviconPath,
        logoUrl: logoPath,
        faviconUrl: faviconPath,
        storeLogo: logoPath,
        currency: admin.currency || DEFAULT_SETTINGS.currency,
        currencySymbol: admin.currencySymbol || DEFAULT_SETTINGS.currencySymbol,
        timezone: admin.timezone || DEFAULT_SETTINGS.timezone
    };
}

async function fetchStoreSettingsFromDb() {
    const admin = await Admin.findOne()
        .select('storeName logoUrl faviconUrl currency currencySymbol timezone')
        .lean();
    return mapAdminToSettings(admin);
}

async function getStoreSettings({ forceRefresh = false } = {}) {
    const now = Date.now();
    if (!forceRefresh && cachedSettings && now < cacheExpiresAt) {
        return cachedSettings;
    }

    const settings = await fetchStoreSettingsFromDb();
    cachedSettings = settings;
    cacheExpiresAt = now + CACHE_TTL_MS;
    return settings;
}

function clearStoreSettingsCache() {
    cachedSettings = null;
    cacheExpiresAt = 0;
}

module.exports = {
    DEFAULT_SETTINGS,
    getStoreSettings,
    clearStoreSettingsCache,
    mapAdminToSettings
};
