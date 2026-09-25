/********************************************************************
 * Project: EonlineBazar — WMS
 * File: WarehouseStock.js
 * Location: models/WarehouseStock.js
 * Description: Per-warehouse physical stock and soft reservations for
 * products and variants. Supports optional bin/rack location codes.
 ********************************************************************/

const mongoose = require('mongoose');

const warehouseStockSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
        index: true
    },
    variantId: {
        type: String,
        default: '',
        trim: true
    },
    variantSku: {
        type: String,
        default: '',
        trim: true
    },
    warehouseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Warehouse',
        required: true,
        index: true
    },
    /** Physical on-hand quantity at this warehouse (excludes in-transit). */
    quantity: {
        type: Number,
        default: 0,
        min: 0
    },
    /** Soft-reserved for orders — not yet deducted from physical stock. */
    reservedStockQuantity: {
        type: Number,
        default: 0,
        min: 0
    },
    /** Full location path, e.g. "Zone A / Aisle 2 / Rack B / Shelf 1 / Bin 104". */
    locationCode: {
        type: String,
        default: '',
        trim: true
    },
    binLocation: {
        type: String,
        default: '',
        trim: true
    }
}, { timestamps: true });

warehouseStockSchema.index(
    { warehouseId: 1, productId: 1, variantId: 1, variantSku: 1 },
    { unique: true }
);

module.exports = mongoose.models.WarehouseStock
    || mongoose.model('WarehouseStock', warehouseStockSchema);
