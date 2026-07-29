const mongoose = require('mongoose');
const { getStoreSettings } = require('../utils/storeSettingsService');
const { getPublicWhatsAppSettings } = require('../utils/whatsappService');
const { getPublicPaymentPayload } = require('../utils/paymentMethodService');
const {
    getDeliverySettings,
    computeDeliveryCharge,
    resolveDeliveryZone,
    toShippingLocationLabel,
    getFreeShippingProgress,
    roundMoney
} = require('../utils/deliveryChargeService');
const { getDeliveryEstimate } = require('../utils/deliveryEstimateService');
const { BANGLADESH_DISTRICTS } = require('../utils/bangladeshDistricts');
const { loadRewardSettings } = require('../utils/rewardSettings');
const { toPublicAnnouncementPayload } = require('../utils/announcementSettings');
const Setting = require('../models/Setting');
const { loadFlashSaleSettings, toPublicFlashSalePayload } = require('../utils/flashSaleService');
const FooterSettings = require('../models/FooterSettings');
const PageContent = require('../models/PageContent');
const { getPublishedPageSlugs, filterFooterColumnsByPublishedPages } = require('../utils/pagePublishService');
const { getOrSet, CACHE_KEYS } = require('../utils/cacheService');

const getPublicStoreBranding = async (req, res) => {
    try {
        const data = await getOrSet(CACHE_KEYS.STORE_SETTINGS, async () => {
            const [settings, whatsappSettings, paymentSettings] = await Promise.all([
                getStoreSettings({ forceRefresh: true }),
                getPublicWhatsAppSettings({ forceRefresh: true }),
                getPublicPaymentPayload({ forceRefresh: true })
            ]);

            return {
                storeName: settings.storeName,
                logoUrl: settings.logoPath,
                faviconUrl: settings.faviconPath,
                logoPath: settings.logoPath,
                faviconPath: settings.faviconPath,
                storeLogo: settings.logoPath,
                publicSupportWhatsApp: whatsappSettings.publicSupportWhatsApp,
                paymentMethods: paymentSettings.methods,
                paymentGateways: paymentSettings.paymentGateways,
                enabledPaymentMethods: paymentSettings.enabledPaymentMethods,
                activePaymentGateways: paymentSettings.activePaymentGateways,
                activePaymentMethods: paymentSettings.activePaymentMethods
            };
        }, 300);

        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Get Public Store Branding Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load store branding.' });
    }
};

const getHealth = (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date(),
        environment: process.env.NODE_ENV,
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
};

module.exports = {
    getHealth,
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
    getPublicAnnouncement: async (req, res) => {
        try {
            const [masterDoc, rewardSettings, deliverySettings] = await Promise.all([
                Setting.getOrCreate(),
                loadRewardSettings(),
                getDeliverySettings()
            ]);

            const announcement = toPublicAnnouncementPayload(
                { ...masterDoc.toObject(), freeShippingThreshold: deliverySettings.freeShippingThreshold },
                rewardSettings
            );

            res.status(200).json({ success: true, data: { ...announcement, rewardSettings } });
        } catch (error) {
            console.error('Get Public Announcement Error:', error);
            res.status(500).json({ success: false, message: 'Failed to load announcement.' });
        }
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
            const freeShipping = getFreeShippingProgress(settings, subtotal);

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
                    freeShippingThreshold: settings.freeShippingThreshold,
                    freeShipping,
                    shopHomeCity: settings.shopHomeCity,
                    estimatedDelivery: estimate
                }
            });
        } catch (error) {
            console.error('Get Public Shipping Quote Error:', error);
            res.status(500).json({ success: false, message: 'Failed to calculate shipping quote.' });
        }
    },
    getPublicFlashSale: async (req, res) => {
        try {
            const data = await getOrSet(CACHE_KEYS.FLASH_SALE, async () => {
                const flashSettings = await loadFlashSaleSettings();
                return toPublicFlashSalePayload(flashSettings);
            }, 60);

            res.status(200).json({ success: true, data });
        } catch (error) {
            console.error('Get Public Flash Sale Error:', error);
            res.status(500).json({ success: false, message: 'Failed to load flash sale settings.' });
        }
    },
    getPublicPaymentMethods: async (req, res) => {
        try {
            const data = await getPublicPaymentPayload({ forceRefresh: req.query.refresh === '1' });
            res.status(200).json({ success: true, data });
        } catch (error) {
            console.error('Get Public Payment Methods Error:', error);
            res.status(500).json({ success: false, message: 'Failed to load payment methods.' });
        }
    },
    getPublicFooterSettings: async (req, res) => {
        try {
            const data = await getOrSet(CACHE_KEYS.FOOTER_SETTINGS, async () => {
                const [doc, publishedSlugs] = await Promise.all([
                    FooterSettings.getOrCreate(),
                    getPublishedPageSlugs()
                ]);
                const payload = doc.toPublicObject();
                payload.columns = filterFooterColumnsByPublishedPages(payload.columns, publishedSlugs);
                return payload;
            }, 3600);

            res.status(200).json({ success: true, data });
        } catch (error) {
            console.error('Get Public Footer Settings Error:', error);
            res.status(500).json({ success: false, message: 'Failed to load footer settings.' });
        }
    },
    getPublicPageContent: async (req, res) => {
        try {
            const slug = req.params.slug;
            const data = await getOrSet(CACHE_KEYS.PAGE_CONTENT(slug), async () => {
                const page = await PageContent.getPublishedBySlug(slug);
                if (!page) return null;
                return page.toPublicObject();
            }, 300);

            if (!data) {
                return res.status(404).json({ success: false, message: 'Page not found.' });
            }
            res.status(200).json({ success: true, data });
        } catch (error) {
            console.error('Get Public Page Content Error:', error);
            res.status(500).json({ success: false, message: 'Failed to load page content.' });
        }
    }
};
