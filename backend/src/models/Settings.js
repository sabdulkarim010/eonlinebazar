/********************************************************************
 * Project: EonlineBazar
 * File: Settings.js
 * Location: models/Settings.js
 * Author: Abdul Karim Sheikh
 * Description: Singleton system settings — delivery, loyalty, SMS,
 * courier, rate limits, payment gateways, flash sale, and storefront
 * announcement. Consolidated from the former Setting.js + Settings.js
 * pair (2026-09-12). Run scripts/mergeSettingsModels.js once before
 * deploy if upgrading from the dual-model layout.
 ********************************************************************/

const mongoose = require('mongoose');

const SETTINGS_KEY = 'global';

const settingsSchema = new mongoose.Schema({
    key: {
        type: String,
        default: SETTINGS_KEY,
        unique: true,
        immutable: true
    },
    shopHomeCity: {
        type: String,
        default: 'Dhaka',
        trim: true
    },
    deliveryInsideCity: {
        type: Number,
        default: 60,
        min: 0
    },
    deliveryOutsideCity: {
        type: Number,
        default: 120,
        min: 0
    },
    freeShippingMinAmount: {
        type: Number,
        default: 1000,
        min: 0
    },
    // Canonical free-shipping threshold (mirrors freeShippingMinAmount).
    freeShippingThreshold: {
        type: Number,
        default: null,
        min: 0
    },
    cashbackPercentage: {
        type: Number,
        default: 1,
        min: 0,
        max: 100
    },
    takaToPointsRatio: {
        type: Number,
        default: 100,
        min: 0
    },
    pointsToTakaConversionRate: {
        type: Number,
        default: 10,
        min: 0
    },
    refundUndoWindowHours: {
        type: Number,
        default: 72,
        min: 0
    },
    announcementText: {
        type: String,
        default: '',
        trim: true
    },
    announcementDiscount: {
        type: String,
        default: '2000',
        trim: true
    },
    isAnnouncementActive: {
        type: Boolean,
        default: true
    },
    enableSmsNotifications: {
        type: Boolean,
        default: false
    },
    smsGatewayProvider: {
        type: String,
        enum: ['Greenweb BD', 'BulkSMS BD', 'AlphaSMS', 'Generic API', ''],
        default: '',
        trim: true
    },
    smsApiKey: {
        type: String,
        default: '',
        trim: true
    },
    smsSenderId: {
        type: String,
        default: '',
        trim: true
    },
    defaultCourierProvider: {
        type: String,
        enum: ['Steadfast', 'Pathao', 'RedX', 'steadfast', 'pathao', 'redx', ''],
        default: '',
        trim: true
    },
    courierApiKey: {
        type: String,
        default: '',
        trim: true
    },
    courierSecretKey: {
        type: String,
        default: '',
        trim: true
    },
    publicSupportWhatsApp: {
        type: String,
        default: '',
        trim: true
    },
    privateAdminAlertWhatsApp: {
        type: String,
        default: '',
        trim: true
    },
    enableWhatsAppOrderAlerts: {
        type: Boolean,
        default: false
    },
    whatsAppAlertProvider: {
        type: String,
        enum: ['CallMeBot', 'UltraMsg', 'Green API', 'Generic', ''],
        default: '',
        trim: true
    },
    whatsAppAlertApiKey: {
        type: String,
        default: '',
        trim: true
    },
    whatsAppAlertInstanceId: {
        type: String,
        default: '',
        trim: true
    },
    whatsAppAlertWebhookUrl: {
        type: String,
        default: '',
        trim: true
    },
    activePaymentGateways: {
        bKash: { type: Boolean, default: true },
        Nagad: { type: Boolean, default: true },
        Visa: { type: Boolean, default: true },
        MasterCard: { type: Boolean, default: true },
        COD: { type: Boolean, default: true }
    },
    rateLimitEnabled: {
        type: Boolean,
        default: true
    },
    rateLimitWindowMs: {
        type: Number,
        default: 900000,
        min: 60000
    },
    rateLimitMaxRequests: {
        type: Number,
        default: 1000,
        min: 1
    },
    bypassAdminAndLocalhost: {
        type: Boolean,
        default: true
    },
    sandboxMode: {
        type: Boolean,
        default: false
    },
    serviceWorkerEnabled: {
        type: Boolean,
        default: true
    },
    paymentGateways: {
        bKash: {
            enabled: { type: Boolean, default: true },
            name: { type: String, default: 'bKash', trim: true },
            logoUrl: { type: String, default: '', trim: true }
        },
        Nagad: {
            enabled: { type: Boolean, default: true },
            name: { type: String, default: 'Nagad', trim: true },
            logoUrl: { type: String, default: '', trim: true }
        },
        Visa: {
            enabled: { type: Boolean, default: true },
            name: { type: String, default: 'VISA', trim: true },
            logoUrl: { type: String, default: '', trim: true }
        },
        MasterCard: {
            enabled: { type: Boolean, default: true },
            name: { type: String, default: 'MasterCard', trim: true },
            logoUrl: { type: String, default: '', trim: true }
        },
        COD: {
            enabled: { type: Boolean, default: true },
            name: { type: String, default: 'Cash on Delivery', trim: true },
            logoUrl: { type: String, default: '', trim: true }
        }
    },
    flashSaleEnabled: {
        type: Boolean,
        default: false
    },
    flashSaleTitle: {
        type: String,
        default: 'Flash Sale',
        trim: true
    },
    flashSaleEndDate: {
        type: Date,
        default: null
    },
    flashSaleDiscountPercent: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    flashSaleProductIds: {
        type: [String],
        default: []
    },
    vipMinTotalSpent: {
        type: Number,
        default: 10000,
        min: 0
    },
    vipMinOrderCount: {
        type: Number,
        default: 5,
        min: 0
    },
    frequentBuyerMinOrders: {
        type: Number,
        default: 3,
        min: 0
    },
    referralRewardAmount: {
        type: Number,
        default: 100,
        min: 0
    },
    enableTieredLoyalty: {
        type: Boolean,
        default: false
    },
    silverThreshold: {
        type: Number,
        default: 5000,
        min: 0
    },
    goldThreshold: {
        type: Number,
        default: 15000,
        min: 0
    },
    platinumThreshold: {
        type: Number,
        default: 50000,
        min: 0
    },
    silverCashback: {
        type: Number,
        default: 1.5,
        min: 0,
        max: 100
    },
    goldCashback: {
        type: Number,
        default: 2.5,
        min: 0,
        max: 100
    },
    platinumCashback: {
        type: Number,
        default: 4.0,
        min: 0,
        max: 100
    },
    defaultProductsPerPage: {
        type: Number,
        default: 24,
        min: 1,
        max: 100
    },
    vatRate: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    vatEnabled: {
        type: Boolean,
        default: false
    },
    vatPercentage: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    vatInclusive: {
        type: Boolean,
        default: true
    },
    taxRegistrationNumber: {
        type: String,
        default: '',
        trim: true
    },
    lastBackupAt: {
        type: Date,
        default: null
    },
    orderPrefix: {
        type: String,
        default: 'ORD',
        trim: true,
        maxlength: 12
    },
    maintenanceMode: {
        type: Boolean,
        default: false
    },
    maintenanceMessage: {
        type: String,
        default: 'We are currently performing scheduled maintenance. Please check back soon.',
        trim: true
    }
}, {
    timestamps: true
});

settingsSchema.statics.getOrCreate = async function getOrCreate() {
    let settings = await this.findOne({ key: SETTINGS_KEY });
    if (!settings) {
        settings = await this.create({ key: SETTINGS_KEY });
    }
    return settings;
};

module.exports = mongoose.model('Settings', settingsSchema);
