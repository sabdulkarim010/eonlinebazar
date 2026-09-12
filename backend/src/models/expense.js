/********************************************************************
 * Project: EonlineBazar — ERP Finance
 * File: expense.js
 * Location: models/expense.js
 * Description: Operating-expense ledger for the advanced Profit & Loss
 * report. Each row is a single business cost recorded against a dynamic
 * category slug (see ExpenseCategory) so the P&L engine can aggregate
 * spend by category over any period.
 ********************************************************************/

const mongoose = require('mongoose');

/** Legacy slug list — kept for backward-compatible tests and migrations. */
const LEGACY_EXPENSE_CATEGORIES = [
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
        required: true,
        trim: true,
        lowercase: true
    },
    customCategoryName: {
        type: String,
        default: '',
        trim: true
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

/** @deprecated Use ExpenseCategory collection — kept for legacy callers. */
expenseSchema.statics.CATEGORIES = LEGACY_EXPENSE_CATEGORIES;
expenseSchema.statics.LEGACY_CATEGORIES = LEGACY_EXPENSE_CATEGORIES;

module.exports = mongoose.models.Expense || mongoose.model('Expense', expenseSchema);
