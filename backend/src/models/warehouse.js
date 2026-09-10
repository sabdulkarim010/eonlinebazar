/********************************************************************
 * Project: EonlineBazar — ERP Core
 * File: warehouse.js
 * Location: models/warehouse.js
 * Author: Abdul Karim Sheikh
 * Description: Stock locations for the ERP module. Products carry an
 * optional warehouseId, so a store that never opens a second location
 * keeps working against the single seeded default warehouse.
 ********************************************************************/

const mongoose = require('mongoose');

const warehouseSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    /** Short label shown in dropdowns, e.g. "Dhaka — Mirpur". */
    location: {
        type: String,
        default: '',
        trim: true
    },
    address: {
        type: String,
        default: '',
        trim: true
    },
    managerName: {
        type: String,
        default: '',
        trim: true
    },
    phone: {
        type: String,
        default: '',
        trim: true
    },
    /** Exactly one warehouse holds this flag — enforced by the controller. */
    isDefault: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

warehouseSchema.index({ status: 1, createdAt: -1 });
warehouseSchema.index({ isDefault: -1 });

module.exports = mongoose.models.Warehouse || mongoose.model('Warehouse', warehouseSchema);
