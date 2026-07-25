/********************************************************************
 * Project: EonlineBazar
 * File: Settings.js
 * Location: models/Settings.js
 * Author: Abdul Karim Sheikh
 * Description: Singleton system settings — delivery charges and
 * free-shipping thresholds controlled from the Admin Panel.
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
    // 🚚 Courier gateway credentials — saved from Admin Master Settings and
    // read at booking time, so providers/keys can be rotated without a deploy.
    defaultCourierProvider: {
        type: String,
        enum: ['Steadfast', 'Pathao', 'RedX', ''],
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
    // 📱 Dual WhatsApp — public customer chat vs private admin order alerts
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
