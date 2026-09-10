/********************************************************************
 * Project: EonlineBazar — ERP Core
 * File: supplier.js
 * Location: models/supplier.js
 * Author: Abdul Karim Sheikh
 * Description: Vendor/supplier directory for the ERP module. A supplier
 * is the counterparty on a Purchase Order and the origin of a product's
 * cost history, so `suppliedProducts` is a convenience roster only —
 * the authoritative product link is Product.supplierId.
 ********************************************************************/

const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    contactPerson: {
        type: String,
        default: '',
        trim: true
    },
    phone: {
        type: String,
        default: '',
        trim: true
    },
    email: {
        type: String,
        default: '',
        trim: true,
        lowercase: true
    },
    address: {
        type: String,
        default: '',
        trim: true
    },
    /** Roster of products this vendor supplies — display/filter aid, not a hard constraint. */
    suppliedProducts: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
    }],
    notes: {
        type: String,
        default: '',
        trim: true
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

// Directory listing sorts newest-first and filters by status; search is by name.
supplierSchema.index({ status: 1, createdAt: -1 });
supplierSchema.index({ name: 1 });

module.exports = mongoose.models.Supplier || mongoose.model('Supplier', supplierSchema);
