const mongoose = require('mongoose');

const RESOURCE_TYPES = [
    'product',
    'order',
    'customer',
    'staff',
    'setting',
    'coupon',
    'banner',
    'category',
    'review',
    // ERP (Phase 2)
    'supplier',
    'warehouse',
    'purchase_order',
    // ERP Finance
    'expense',
    'expense_category',
    // HRM
    'attendance',
    'shift',
    'payroll',
    'leave',
    'employee',
    'designation'
];

const securityLogSchema = new mongoose.Schema({
    action: { type: String, required: true, trim: true },
    actor: { type: String, default: 'system', trim: true },
    actorType: { type: String, enum: ['admin', 'customer', 'system'], default: 'system' },
    ipAddress: { type: String, default: 'Unknown' },
    details: { type: String, default: '' },
    resourceType: {
        type: String,
        enum: RESOURCE_TYPES,
        default: null
    },
    resourceId: { type: String, default: null, trim: true },
    actorId: { type: String, default: null, trim: true },
    targetStaffId: { type: String, default: null, trim: true },
    hrmActionType: { type: String, default: null, trim: true },
    previousValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null }
}, { timestamps: true });

securityLogSchema.index({ createdAt: -1 });
securityLogSchema.index({ actor: 1, actorType: 1, createdAt: -1 });
securityLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });
securityLogSchema.index({ hrmActionType: 1, createdAt: -1 });
securityLogSchema.index({ targetStaffId: 1, createdAt: -1 });

module.exports = mongoose.model('SecurityLog', securityLogSchema);
module.exports.RESOURCE_TYPES = RESOURCE_TYPES;
