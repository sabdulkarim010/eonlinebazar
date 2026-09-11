/********************************************************************
 * Project: EonlineBazar — HRM Module
 * File: leave.js
 * Location: models/leave.js
 * Author: Abdul Karim Sheikh
 * Description: Leave applications and their approval trail. `totalDays`
 * counts both end points, so a single-day leave is 1 day rather than 0.
 ********************************************************************/

const mongoose = require('mongoose');

const LEAVE_TYPES = ['casual', 'sick', 'annual', 'unpaid'];
const LEAVE_STATUSES = ['pending', 'approved', 'rejected'];

/** Annual entitlement per leave type; 'unpaid' is deliberately uncapped. */
const LEAVE_ALLOWANCES = Object.freeze({
    casual: 12,
    sick: 12,
    annual: 20,
    unpaid: 0
});

const leaveSchema = new mongoose.Schema({
    staffId: { type: String, required: true },
    staffType: { type: String, enum: ['admin', 'employee'], default: 'admin' },
    staffUsername: { type: String, default: '', trim: true },
    staffName: { type: String, default: '', trim: true },
    leaveType: { type: String, enum: LEAVE_TYPES, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    /** Derived by the pre-save hook — inclusive of both end points. */
    totalDays: { type: Number, default: 1 },
    reason: { type: String, default: '', trim: true },
    status: { type: String, enum: LEAVE_STATUSES, default: 'pending' },
    approvedBy: { type: String, default: '', trim: true },
    approvedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '', trim: true },
    /** Medical certificate or other supporting document (sick leave). */
    attachmentUrl: { type: String, default: '', trim: true }
}, { timestamps: true });

leaveSchema.index({ staffId: 1, startDate: -1 });
leaveSchema.index({ status: 1, startDate: -1 });
leaveSchema.index({ startDate: 1, endDate: 1 });

/** Inclusive whole-day span between two dates, minimum 1. */
function countLeaveDays(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;

    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
    return days > 0 ? days : 1;
}

leaveSchema.pre('save', function applyTotalDays() {
    this.totalDays = countLeaveDays(this.startDate, this.endDate);
});

module.exports = mongoose.models.Leave || mongoose.model('Leave', leaveSchema);
module.exports.LEAVE_TYPES = LEAVE_TYPES;
module.exports.LEAVE_STATUSES = LEAVE_STATUSES;
module.exports.LEAVE_ALLOWANCES = LEAVE_ALLOWANCES;
module.exports.countLeaveDays = countLeaveDays;
