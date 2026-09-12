/********************************************************************
 * Project: EonlineBazar
 * File: Setting.js
 * Location: models/Setting.js
 * Description: Singleton master settings — cashback, loyalty points,
 * conversion rates, refund windows, free-shipping threshold, and the
 * storefront announcement, all controlled from the Admin Panel.
 *
 * @deprecated Read path — prefer GET /api/admin/all-settings (merged with
 * Settings.js). Writes still use PUT /api/admin/master-settings until a
 * full data migration consolidates both models.
 ********************************************************************/

const mongoose = require('mongoose');

const MASTER_SETTING_KEY = 'master';

const settingSchema = new mongoose.Schema({
    key: {
        type: String,
        default: MASTER_SETTING_KEY,
        unique: true,
        immutable: true
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
    // Canonical free-shipping threshold for the whole store. `null` means it
    // was never configured here, so readers fall back to the legacy
    // Settings.freeShippingMinAmount value to keep existing stores intact.
    freeShippingThreshold: {
        type: Number,
        default: null,
        min: 0
    },
    announcementText: {
        type: String,
        default: '',
        trim: true
    },
    // Legacy free-text mirror of the threshold, kept so older announcement
    // payloads (which allowed values like "10%") keep rendering.
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
    // ⚡ Flash Sale control panel (Master Settings / Catalog)
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
    // 👑 VIP segmentation thresholds (Admin Customer Management)
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
    // 🤝 Referral program — wallet credit given to a referrer once the customer
    // they invited completes their first order. Set to 0 to disable rewards.
    referralRewardAmount: {
        type: Number,
        default: 100,
        min: 0
    },
    // 🏅 Customer loyalty tiers — lifetime spend thresholds + tier cashback rates
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
    // Storefront catalog / search default page size (overridable via ?limit=)
    defaultProductsPerPage: {
        type: Number,
        default: 24,
        min: 1,
        max: 100
    },
    // Enterprise store configuration
    vatRate: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
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

settingSchema.statics.getOrCreate = async function getOrCreate() {
    let settings = await this.findOne({ key: MASTER_SETTING_KEY });
    if (!settings) {
        settings = await this.create({ key: MASTER_SETTING_KEY });
    }
    return settings;
};

module.exports = mongoose.model('Setting', settingSchema);
