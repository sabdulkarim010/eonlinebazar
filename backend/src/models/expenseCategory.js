/********************************************************************
 * Project: EonlineBazar — ERP Finance
 * File: expenseCategory.js
 * Location: models/expenseCategory.js
 * Author: Abdul Karim Sheikh
 * Description: Dynamic expense category catalog for the operating-
 * expense ledger. Admins can add custom categories, toggle visibility,
 * and centrally enable/disable the "Other" quick custom input field.
 ********************************************************************/

const mongoose = require('mongoose');

const expenseCategorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isSystemDefault: {
        type: Boolean,
        default: false
    },
    allowCustomInput: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

expenseCategorySchema.index({ isActive: 1, slug: 1 });

module.exports = mongoose.models.ExpenseCategory
    || mongoose.model('ExpenseCategory', expenseCategorySchema);
