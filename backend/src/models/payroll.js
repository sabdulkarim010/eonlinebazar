/********************************************************************
 * Project: EonlineBazar — HRM Module
 * File: payroll.js
 * Location: models/payroll.js
 * Author: Abdul Karim Sheikh
 * Description: One salary run per staff member per month. Attendance
 * counts are snapshotted at generation time so approving a pay slip
 * months later still shows the numbers it was calculated from.
 ********************************************************************/

const mongoose = require('mongoose');

const PAYROLL_STATUSES = ['draft', 'approved', 'paid'];

const payrollSchema = new mongoose.Schema({
    staffId: { type: String, required: true },
    staffType: { type: String, enum: ['admin', 'employee'], default: 'admin' },
    staffUsername: { type: String, default: '', trim: true },
    staffName: { type: String, default: '', trim: true },
    /** 1–12 calendar month (not zero-based, unlike Date#getMonth). */
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },
    baseSalary: { type: Number, default: 0 },
    bonus: { type: Number, default: 0 },
    /** Overtime in hours; the payable amount is overtime * overtimeRate. */
    overtime: { type: Number, default: 0 },
    overtimeRate: { type: Number, default: 0 },
    overtimeAmount: { type: Number, default: 0 },
    deductions: { type: Number, default: 0 },
    /** Derived by the pre-save hook — never written by hand. */
    totalSalary: { type: Number, default: 0 },
    workingDays: { type: Number, default: 0 },
    presentDays: { type: Number, default: 0 },
    absentDays: { type: Number, default: 0 },
    lateDays: { type: Number, default: 0 },
    status: { type: String, enum: PAYROLL_STATUSES, default: 'draft' },
    paidAt: { type: Date, default: null },
    paymentMethod: { type: String, default: '', trim: true },
    paySlipGenerated: { type: Boolean, default: false },
    notes: { type: String, default: '', trim: true },
    createdBy: { type: String, default: '', trim: true }
}, { timestamps: true });

// One run per staff member per month — regenerating overwrites the draft
// instead of stacking duplicate rows in the ledger.
payrollSchema.index({ staffId: 1, year: -1, month: -1 }, { unique: true });
payrollSchema.index({ year: -1, month: -1, status: 1 });

/**
 * Pro-rated earned salary plus additions, minus deductions.
 * Attendance-driven: a staff member present for half the working days earns
 * half the base. `workingDays` of 0 pays the full base (nothing to pro-rate).
 */
function computeTotalSalary(doc) {
    const base = Number(doc.baseSalary) || 0;
    const workingDays = Number(doc.workingDays) || 0;
    const presentDays = Number(doc.presentDays) || 0;

    const earnedBase = workingDays > 0
        ? base * Math.min(presentDays / workingDays, 1)
        : base;

    const overtimeAmount = (Number(doc.overtime) || 0) * (Number(doc.overtimeRate) || 0);
    const total = earnedBase + overtimeAmount + (Number(doc.bonus) || 0) - (Number(doc.deductions) || 0);

    return {
        overtimeAmount: Math.round(overtimeAmount * 100) / 100,
        totalSalary: Math.round(Math.max(0, total) * 100) / 100
    };
}

payrollSchema.pre('save', function applyTotals() {
    const { overtimeAmount, totalSalary } = computeTotalSalary(this);
    this.overtimeAmount = overtimeAmount;
    this.totalSalary = totalSalary;
});

module.exports = mongoose.models.Payroll || mongoose.model('Payroll', payrollSchema);
module.exports.PAYROLL_STATUSES = PAYROLL_STATUSES;
module.exports.computeTotalSalary = computeTotalSalary;
