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
