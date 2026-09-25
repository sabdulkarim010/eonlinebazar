/********************************************************************
 * Project: EonlineBazar — WMS
 * File: StockLedger.js
 * Location: models/StockLedger.js
 * Description: Immutable audit trail for every stock movement across
 * warehouses. Rows are append-only — updates and deletes are blocked.
 ********************************************************************/

const mongoose = require('mongoose');

const MOVEMENT_TYPES = [
    'SALE',
    'RETURN',
    'PO_RECEIPT',
    'DAMAGE_WRITE_OFF',
    'MANUAL_ADJUSTMENT',
    'TRANSFER_IN',
    'TRANSFER_OUT',
    'RESERVATION'
];

const stockLedgerSchema = new mongoose.Schema({
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
    changeQuantity: {
        type: Number,
        required: true
    },
    previousQuantity: {
        type: Number,
        required: true
    },
    newQuantity: {
        type: Number,
        required: true
    },
    movementType: {
        type: String,
        enum: MOVEMENT_TYPES,
        required: true,
        index: true
    },
    /** PO id, order id, transfer id, etc. */
    referenceId: {
        type: String,
        default: '',
        trim: true,
        index: true
    },
    referenceType: {
        type: String,
        default: '',
        trim: true
    },
    performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        default: null
    },
    binLocation: {
        type: String,
        default: '',
        trim: true
    },
    notes: {
        type: String,
        default: '',
        trim: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        immutable: true
    }
}, {
    timestamps: false,
    versionKey: false
});

stockLedgerSchema.index({ productId: 1, warehouseId: 1, createdAt: -1 });
stockLedgerSchema.index({ referenceId: 1, movementType: 1 });

const IMMUTABLE_MSG = 'StockLedger entries are immutable and cannot be modified or deleted.';

function blockMutation() {
    throw new Error(IMMUTABLE_MSG);
}

stockLedgerSchema.pre('updateOne', blockMutation);
stockLedgerSchema.pre('updateMany', blockMutation);
stockLedgerSchema.pre('findOneAndUpdate', blockMutation);
stockLedgerSchema.pre('findOneAndDelete', blockMutation);
stockLedgerSchema.pre('deleteOne', blockMutation);
stockLedgerSchema.pre('deleteMany', blockMutation);
stockLedgerSchema.pre('save', function ledgerSaveGuard() {
    if (!this.isNew) {
        throw new Error(IMMUTABLE_MSG);
    }
});

module.exports = mongoose.models.StockLedger || mongoose.model('StockLedger', stockLedgerSchema);
module.exports.MOVEMENT_TYPES = MOVEMENT_TYPES;
