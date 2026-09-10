/********************************************************************
 * Project: EonlineBazar — ERP Core
 * File: purchaseOrder.js
 * Location: models/purchaseOrder.js
 * Author: Abdul Karim Sheikh
 * Description: Purchase Order (PO) schema — the goods-receiving side of
 * inventory. A PO moves draft → sent → partial → received; receiving a
 * line raises Product.stockQuantity by the quantity accepted and appends
 * the unit cost to the product's costHistory.
 ********************************************************************/

const mongoose = require('mongoose');

const PO_STATUSES = ['draft', 'sent', 'partial', 'received', 'cancelled'];

/**
 * One ordered line. `qty` is what was ordered, `receivedQty` is the running
 * total accepted into stock — a partial delivery leaves receivedQty < qty.
 */
const purchaseOrderItemSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    /** Name snapshot so a deleted product still prints on the PO. */
    productName: { type: String, default: '', trim: true },
    qty: { type: Number, default: 1, min: 0 },
    unitCost: { type: Number, default: 0, min: 0 },
    receivedQty: { type: Number, default: 0, min: 0 }
}, { _id: true });

const purchaseOrderSchema = new mongoose.Schema({
    poNumber: {
        type: String,
        unique: true,
        trim: true,
        uppercase: true
    },
    supplierId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Supplier',
        required: true
    },
    /** Destination for received goods — falls back to the default warehouse. */
    warehouseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Warehouse',
        default: null
    },
    items: {
        type: [purchaseOrderItemSchema],
        default: []
    },
    status: {
        type: String,
        enum: PO_STATUSES,
        default: 'draft'
    },
    totalCost: { type: Number, default: 0, min: 0 },
    expectedDate: { type: Date, default: null },
    receivedDate: { type: Date, default: null },
    notes: { type: String, default: '', trim: true },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        default: null
    },
    createdByName: { type: String, default: '', trim: true },
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

/** Sum of qty × unitCost across every line. */
purchaseOrderSchema.methods.computeTotalCost = function computeTotalCost() {
    return (this.items || []).reduce(
        (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.unitCost) || 0),
        0
    );
};

/**
 * Derive status from receiving progress. Draft/sent POs with nothing received
 * keep their current status; cancelled POs are never re-derived.
 */
purchaseOrderSchema.methods.deriveReceivingStatus = function deriveReceivingStatus() {
    if (this.status === 'cancelled') return 'cancelled';

    const items = this.items || [];
    if (!items.length) return this.status;

    const fullyReceived = items.every(
        (item) => (Number(item.receivedQty) || 0) >= (Number(item.qty) || 0)
    );
    if (fullyReceived) return 'received';

    const anyReceived = items.some((item) => (Number(item.receivedQty) || 0) > 0);
    return anyReceived ? 'partial' : this.status;
};

/**
 * Sequential, human-readable PO number scoped to the current month
 * (e.g. PO-2609-0007). Collisions are resolved by the caller's retry loop.
 */
purchaseOrderSchema.statics.generatePoNumber = async function generatePoNumber() {
    const now = new Date();
    const prefix = `PO-${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}`;

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const issuedThisMonth = await this.countDocuments({
        createdAt: { $gte: monthStart, $lt: nextMonthStart }
    });

    return `${prefix}-${String(issuedThisMonth + 1).padStart(4, '0')}`;
};

// Keep totalCost in sync on every write so reports never recompute it.
purchaseOrderSchema.pre('save', function () {
    this.totalCost = this.computeTotalCost();
});

purchaseOrderSchema.statics.STATUSES = PO_STATUSES;

purchaseOrderSchema.index({ supplierId: 1, createdAt: -1 });
purchaseOrderSchema.index({ status: 1, createdAt: -1 });
purchaseOrderSchema.index({ createdAt: -1 });

module.exports = mongoose.models.PurchaseOrder
    || mongoose.model('PurchaseOrder', purchaseOrderSchema);
