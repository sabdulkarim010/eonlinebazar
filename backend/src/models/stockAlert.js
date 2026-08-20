/********************************************************************
 * Project: EonlineBazar
 * File: stockAlert.js
 * Location: models/stockAlert.js
 * Description: Persisted log of low-stock / out-of-stock alert runs.
 ********************************************************************/

const mongoose = require('mongoose');

const stockAlertProductSchema = new mongoose.Schema({
    name: { type: String, default: '' },
    productId: { type: String, default: '' },
    stock: { type: Number, default: 0 },
    threshold: { type: Number, default: 0 }
}, { _id: false });

const outOfStockProductSchema = new mongoose.Schema({
    name: { type: String, default: '' },
    productId: { type: String, default: '' }
}, { _id: false });

const stockAlertSchema = new mongoose.Schema({
    checkedAt: { type: Date, required: true },
    lowStockCount: { type: Number, default: 0 },
    outOfStockCount: { type: Number, default: 0 },
    lowStockProducts: { type: [stockAlertProductSchema], default: [] },
    outOfStockProducts: { type: [outOfStockProductSchema], default: [] },
    alertsSent: {
        email: { type: Boolean, default: false },
        sms: { type: Boolean, default: false },
        whatsapp: { type: Boolean, default: false }
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.StockAlert || mongoose.model('StockAlert', stockAlertSchema);
