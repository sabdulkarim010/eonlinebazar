/********************************************************************
 * Project: EonlineBazar — ERP Finance
 * File: expenseCategoryService.js
 * Location: services/expenseCategoryService.js
 * Author: Abdul Karim Sheikh
 * Description: Expense category bootstrap and shared lookup helpers
 * used by the expense ledger, P&L engine, and admin category manager.
 ********************************************************************/

const ExpenseCategory = require('../models/expenseCategory');

/** Starter catalog — slugs match legacy Expense.CATEGORIES enum values. */
const DEFAULT_EXPENSE_CATEGORIES = [
    { name: 'Office Rent', slug: 'office_rent', isSystemDefault: true },
    { name: 'Utilities', slug: 'utilities', isSystemDefault: true },
    { name: 'Staff Salary', slug: 'staff_salary', isSystemDefault: true },
    { name: 'Marketing', slug: 'marketing', isSystemDefault: true },
    { name: 'Courier Charges', slug: 'courier_charges', isSystemDefault: true },
    { name: 'Packaging', slug: 'packaging', isSystemDefault: true },
    { name: 'Equipment', slug: 'equipment', isSystemDefault: true },
    { name: 'Other', slug: 'other', isSystemDefault: true, allowCustomInput: true }
];

function slugifyCategoryName(name) {
    return String(name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

/**
 * Idempotent seed — tops up missing defaults without duplicating rows.
 */
async function seedDefaultExpenseCategories() {
    let seeded = 0;

    for (const item of DEFAULT_EXPENSE_CATEGORIES) {
        const existing = await ExpenseCategory.findOne({ slug: item.slug }).lean();
        if (existing) continue;

        await ExpenseCategory.create({
            name: item.name,
            slug: item.slug,
            isActive: true,
            isSystemDefault: item.isSystemDefault,
            allowCustomInput: !!item.allowCustomInput
        });
        seeded += 1;
    }

    if (seeded > 0) {
        console.log(`💰 Seeded ${seeded} default expense categor${seeded === 1 ? 'y' : 'ies'}.`);
    }

    return { seeded };
}

async function getActiveCategories() {
    return ExpenseCategory.find({ isActive: true }).sort({ isSystemDefault: -1, name: 1 }).lean();
}

async function getAllCategories() {
    return ExpenseCategory.find({}).sort({ isSystemDefault: -1, name: 1 }).lean();
}

async function findCategoryBySlug(slug) {
    const normalized = String(slug || '').trim().toLowerCase();
    if (!normalized) return null;
    return ExpenseCategory.findOne({ slug: normalized }).lean();
}

async function getCategorySlugList() {
    const rows = await ExpenseCategory.find({}).select('slug').lean();
    return rows.map((row) => row.slug);
}

/**
 * Build a slug → display name map for P&L and summary rollups.
 */
async function getCategoryLabelMap() {
    const rows = await ExpenseCategory.find({}).select('slug name').lean();
    const map = {};
    rows.forEach((row) => { map[row.slug] = row.name; });
    return map;
}

module.exports = {
    DEFAULT_EXPENSE_CATEGORIES,
    slugifyCategoryName,
    seedDefaultExpenseCategories,
    getActiveCategories,
    getAllCategories,
    findCategoryBySlug,
    getCategorySlugList,
    getCategoryLabelMap
};
