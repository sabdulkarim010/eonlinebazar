/********************************************************************
 * Project: EonlineBazar — Settings safe defaults (zero-DB fallback)
 * File: settingsDefaults.js
 ********************************************************************/

'use strict';

const { getDefaultTaxSettings } = require('../services/taxSettingsService');

const DEFAULT_SETTINGS_KEY = 'global';

function getDefaultSettingsDocument() {
    return {
        key: DEFAULT_SETTINGS_KEY,
        revisionId: 0,
        shopHomeCity: 'Dhaka',
        deliveryInsideCity: 60,
        deliveryOutsideCity: 120,
        freeShippingMinAmount: 1000,
        freeShippingThreshold: 1000,
        cashbackPercentage: 1,
        takaToPointsRatio: 100,
        pointsToTakaConversionRate: 10,
        refundUndoWindowHours: 72,
        announcementText: '',
        announcementDiscount: '2000',
        isAnnouncementActive: true,
        enableSmsNotifications: false,
        smsGatewayProvider: '',
        smsApiKey: '',
        smsSenderId: '',
        defaultCourierProvider: '',
        courierApiKey: '',
        courierSecretKey: '',
        publicSupportWhatsApp: '',
        privateAdminAlertWhatsApp: '',
        enableWhatsAppOrderAlerts: false,
        whatsAppAlertProvider: '',
        whatsAppAlertApiKey: '',
        whatsAppAlertInstanceId: '',
        whatsAppAlertWebhookUrl: '',
        rateLimitEnabled: true,
        rateLimitWindowMs: 900000,
        rateLimitMaxRequests: 1000,
        bypassAdminAndLocalhost: true,
        sandboxMode: false,
        serviceWorkerEnabled: true,
        flashSaleEnabled: false,
        flashSaleTitle: 'Flash Sale',
        flashSaleEndDate: null,
        flashSaleDiscountPercent: 0,
        flashSaleProductIds: [],
        vipMinTotalSpent: 10000,
        vipMinOrderCount: 5,
        frequentBuyerMinOrders: 3,
        referralRewardAmount: 100,
        enableTieredLoyalty: false,
        silverThreshold: 5000,
        goldThreshold: 15000,
        platinumThreshold: 50000,
        silverCashback: 1.5,
        goldCashback: 2.5,
        platinumCashback: 4.0,
        defaultProductsPerPage: 24,
        vatRate: 0,
        vatEnabled: false,
        vatPercentage: 0,
        vatInclusive: true,
        taxRegistrationNumber: '',
        taxSettings: getDefaultTaxSettings(),
        orderPrefix: 'ORD',
        maintenanceMode: false,
        maintenanceMessage: 'We are currently performing scheduled maintenance. Please check back soon.',
        maintenanceAllowedIPs: [],
        pendingPgSync: false,
        _fallbackDefaults: true
    };
}

module.exports = {
    DEFAULT_SETTINGS_KEY,
    getDefaultSettingsDocument
};
