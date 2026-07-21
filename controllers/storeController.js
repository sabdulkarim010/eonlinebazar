const { getStoreSettings } = require('../utils/storeSettingsService');
const {
    getDeliverySettings,
    computeDeliveryCharge,
    resolveDeliveryZone,
    toShippingLocationLabel,
    roundMoney
} = require('../utils/deliveryChargeService');
const { getDeliveryEstimate } = require('../utils/deliveryEstimateService');
const { BANGLADESH_DISTRICTS } = require('../utils/bangladeshDistricts');

const getPublicStoreBranding = async (req, res) => {
    try {
        const settings = await getStoreSettings({ forceRefresh: true });

        res.status(200).json({
            success: true,
            data: {
                storeName: settings.storeName,
                logoUrl: settings.logoPath,
                faviconUrl: settings.faviconPath,
                logoPath: settings.logoPath,
                faviconPath: settings.faviconPath,
                storeLogo: settings.logoPath
            }
        });
    } catch (error) {
        console.error('Get Public Store Branding Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load store branding.' });
    }
};

module.exports = {
    getPublicStoreBranding,
    getPublicDeliverySettings: async (req, res) => {
        try {
            const data = await getDeliverySettings();
            res.status(200).json({ success: true, data });
        } catch (error) {
            console.error('Get Public Delivery Settings Error:', error);
            res.status(500).json({ success: false, message: 'Failed to load delivery settings.' });
        }
    },
    getPublicDistricts: (req, res) => {
        res.status(200).json({ success: true, data: BANGLADESH_DISTRICTS });
    },
    getPublicShippingQuote: async (req, res) => {
        try {
            const district = String(req.query.district || '').trim();
            const subtotal = Math.max(0, Number(req.query.subtotal) || 0);
            const settings = await getDeliverySettings();
            const zone = district
                ? resolveDeliveryZone(settings, district)
                : 'inside';
            const deliveryCharge = roundMoney(computeDeliveryCharge(settings, {
                customerDistrict: district || settings.shopHomeCity,
                subtotal
            }));
            const estimate = getDeliveryEstimate(zone);

            res.status(200).json({
                success: true,
                data: {
                    district: district || settings.shopHomeCity,
                    zone,
                    shippingLocationType: toShippingLocationLabel(zone),
                    deliveryCharge,
                    deliveryInsideCity: settings.deliveryInsideCity,
                    deliveryOutsideCity: settings.deliveryOutsideCity,
                    freeShippingMinAmount: settings.freeShippingMinAmount,
                    shopHomeCity: settings.shopHomeCity,
                    estimatedDelivery: estimate
                }
            });
        } catch (error) {
            console.error('Get Public Shipping Quote Error:', error);
            res.status(500).json({ success: false, message: 'Failed to calculate shipping quote.' });
        }
    }
};
