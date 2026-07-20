/********************************************************************
 * Project: EonlineBazar
 * File: Setting.js
 * Location: models/Setting.js
 * Description: Singleton master settings — cashback, loyalty points,
 * conversion rates, and refund windows controlled from Admin Panel.
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
