/********************************************************************
 * Project: EonlineBazar — ERP Finance
 * File: expense.js
 * Location: models/expense.js
 * Author: Abdul Karim Sheikh
 * Description: Operating-expense ledger for the advanced Profit & Loss
 * report. Each row is a single business cost (rent, salary, marketing,
 * courier charges, packaging, etc.) recorded against a date so the P&L
 * engine can aggregate spend by category over any period.
 ********************************************************************/

const mongoose = require('mongoose');

/** Grantable expense buckets — kept in sync with the P&L cost breakdown. */
const EXPENSE_CATEGORIES = [
    'office_rent',
    'utilities',
    'staff_salary',
    'marketing',
    'courier_charges',
    'packaging',
    'equipment',
    'other'
];

const expenseSchema = new mongoose.Schema({
    category: {
        type: String,
        enum: EXPENSE_CATEGORIES,
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    description: {
        type: String,
        default: '',
        trim: true
    },
    date: {
        type: Date,
        default: Date.now
    },
    // Invoice / receipt reference number for reconciliation.
    reference: {
        type: String,
        default: '',
        trim: true
    },
    recordedBy: {
        type: String,
        default: '',
        trim: true
    },
    attachmentUrl: {
        type: String,
        default: '',
        trim: true
    }
}, { timestamps: true });

// P&L date-range scans sort newest-first; category rollups filter by category then date.
expenseSchema.index({ date: -1 });
expenseSchema.index({ category: 1, date: -1 });

expenseSchema.statics.CATEGORIES = EXPENSE_CATEGORIES;

module.exports = mongoose.models.Expense || mongoose.model('Expense', expenseSchema);
