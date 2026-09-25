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

/** Nested bin location: Zone > Aisle > Rack > Shelf > Bin */
const binLocationSchema = new mongoose.Schema({
    code: { type: String, trim: true, default: '' },
    label: { type: String, trim: true, default: '' }
}, { _id: false });

const shelfLocationSchema = new mongoose.Schema({
    name: { type: String, trim: true, default: '' },
    bins: { type: [binLocationSchema], default: [] }
}, { _id: false });

const rackLocationSchema = new mongoose.Schema({
    name: { type: String, trim: true, default: '' },
    shelves: { type: [shelfLocationSchema], default: [] }
}, { _id: false });

const aisleLocationSchema = new mongoose.Schema({
    name: { type: String, trim: true, default: '' },
    racks: { type: [rackLocationSchema], default: [] }
}, { _id: false });

const zoneLocationSchema = new mongoose.Schema({
    zone: { type: String, trim: true, default: '' },
    aisles: { type: [aisleLocationSchema], default: [] }
}, { _id: false });

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
    /**
     * Physical layout hierarchy: Zone > Aisle > Rack > Shelf > Bin.
     * Example: Zone A → Aisle 2 → Rack B → Shelf 1 → Bin 104.
     */
    locationHierarchy: {
        type: [zoneLocationSchema],
        default: []
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
