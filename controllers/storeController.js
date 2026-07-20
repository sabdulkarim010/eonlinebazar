const { getStoreSettings } = require('../utils/storeSettingsService');

const getPublicStoreBranding = async (req, res) => {
    try {
        const settings = await getStoreSettings();

        res.status(200).json({
            success: true,
            data: {
                storeName: settings.storeName,
                logoUrl: settings.logoPath,
                faviconUrl: settings.faviconPath,
                logoPath: settings.logoPath,
                faviconPath: settings.faviconPath
            }
        });
    } catch (error) {
        console.error('Get Public Store Branding Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load store branding.' });
    }
};

module.exports = {
    getPublicStoreBranding
};
