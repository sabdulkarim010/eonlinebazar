/********************************************************************
 * Project: EonlineBazar — WMS
 * File: WarehouseTransfer.js
 * Location: models/WarehouseTransfer.js
 * Description: Inter-warehouse stock transfer documents with a state
 * pipeline: draft → in_transit → received | discrepancy.
 ********************************************************************/

const mongoose = require('mongoose');

const TRANSFER_STATUSES = ['draft', 'in_transit', 'received', 'discrepancy'];

const transferItemSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    productName: {
        type: String,
        default: '',
        trim: true
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
    /** Requested transfer quantity (draft). */
    qty: {
        type: Number,
        required: true,
        min: 1
    },
    /** Quantity deducted from source when shipped. */
    shippedQty: {
        type: Number,
        default: 0,
        min: 0
    },
    /** Quantity accepted at destination. */
    receivedQty: {
        type: Number,
        default: 0,
        min: 0
    },
    binLocation: {
        type: String,
        default: '',
        trim: true
    },
    locationCode: {
        type: String,
        default: '',
        trim: true
    }
}, { _id: false });

const warehouseTransferSchema = new mongoose.Schema({
    transferNumber: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    sourceWarehouseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Warehouse',
        required: true,
        index: true
    },
    destinationWarehouseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Warehouse',
        required: true,
        index: true
    },
    status: {
        type: String,
        enum: TRANSFER_STATUSES,
        default: 'draft',
        index: true
    },
    items: {
        type: [transferItemSchema],
        default: [],
        validate: {
            validator(items) {
                return Array.isArray(items) && items.length > 0;
            },
            message: 'A transfer needs at least one item line.'
        }
    },
    notes: {
        type: String,
        default: '',
        trim: true
    },
    discrepancyDetails: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    shippedAt: {
        type: Date,
        default: null
    },
    receivedAt: {
        type: Date,
        default: null
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        default: null
    },
    createdByName: {
        type: String,
        default: '',
        trim: true
    }
}, { timestamps: true });

warehouseTransferSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.models.WarehouseTransfer
    || mongoose.model('WarehouseTransfer', warehouseTransferSchema);
module.exports.TRANSFER_STATUSES = TRANSFER_STATUSES;
