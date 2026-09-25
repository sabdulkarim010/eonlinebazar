/********************************************************************
 * POS cash register shift — open/close reconciliation per register.
 ********************************************************************/

const mongoose = require('mongoose');

const POS_SHIFT_STATUSES = ['OPEN', 'CLOSED'];

const posShiftSchema = new mongoose.Schema({
    registerName: { type: String, required: true, trim: true },
    cashierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    cashierName: { type: String, default: '', trim: true },
    startingCash: { type: Number, default: 0, min: 0 },
    expectedCash: { type: Number, default: 0, min: 0 },
    expectedDigital: { type: Number, default: 0, min: 0 },
    totalCashSales: { type: Number, default: 0, min: 0 },
    totalDigitalSales: { type: Number, default: 0, min: 0 },
    totalSales: { type: Number, default: 0, min: 0 },
    orderCount: { type: Number, default: 0, min: 0 },
    actualCash: { type: Number, default: null },
    cashDiscrepancy: { type: Number, default: 0 },
    status: { type: String, enum: POS_SHIFT_STATUSES, default: 'OPEN' },
    openNotes: { type: String, default: '', trim: true },
    closeNotes: { type: String, default: '', trim: true },
    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: null }
}, { timestamps: true });

posShiftSchema.index({ registerName: 1, status: 1 });
posShiftSchema.index({ cashierId: 1, status: 1 });
posShiftSchema.index({ openedAt: -1 });

posShiftSchema.statics.STATUSES = POS_SHIFT_STATUSES;

module.exports = mongoose.model('PosShift', posShiftSchema);
