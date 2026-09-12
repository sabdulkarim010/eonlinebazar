/********************************************************************
 * Project: EonlineBazar — ERP Finance
 * File: expenseCategoryController.js
 * Location: controllers/admin/expenseCategoryController.js
 * Author: Abdul Karim Sheikh
 * Description: CRUD + toggles for dynamic expense categories. Powers
 * dropdowns in Expense Tracking and the Finance Settings manager.
 ********************************************************************/

const mongoose = require('mongoose');
const Expense = require('../../models/expense');
const ExpenseCategory = require('../../models/expenseCategory');
const { slugifyCategoryName } = require('../../services/expenseCategoryService');
const { logSecurityEvent, getClientIp } = require('../../utils/securityLogger');

function formatCategory(row) {
    return {
        _id: row._id,
        name: row.name,
        slug: row.slug,
        isActive: row.isActive,
        isSystemDefault: row.isSystemDefault,
        allowCustomInput: row.allowCustomInput,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
    };
}

/**
 * GET /api/admin/expense-categories
 * Active categories for expense form and filter dropdowns.
 */
exports.getActiveExpenseCategories = async (req, res) => {
    try {
        const rows = await ExpenseCategory.find({ isActive: true })
            .sort({ isSystemDefault: -1, name: 1 })
            .lean();

        return res.json({ success: true, data: rows.map(formatCategory) });
    } catch (err) {
        console.error('getActiveExpenseCategories error:', err);
        return res.status(500).json({ success: false, message: 'Failed to load expense categories.' });
    }
};

/**
 * GET /api/admin/expense-categories/admin
 * All categories (active + inactive) for the settings manager.
 */
exports.getAdminExpenseCategories = async (req, res) => {
    try {
        const rows = await ExpenseCategory.find({})
            .sort({ isSystemDefault: -1, name: 1 })
            .lean();

        const slugs = rows.map((row) => row.slug);
        const usageRows = slugs.length
            ? await Expense.aggregate([
                { $match: { category: { $in: slugs } } },
                { $group: { _id: '$category', count: { $sum: 1 } } }
            ])
            : [];

        const usageMap = {};
        usageRows.forEach((row) => { usageMap[row._id] = row.count; });

        const otherRow = rows.find((row) => row.slug === 'other');

        const data = rows.map((row) => ({
            ...formatCategory(row),
            expenseCount: usageMap[row.slug] || 0
        }));

        return res.json({
            success: true,
            data,
            otherCustomInputEnabled: otherRow ? !!otherRow.allowCustomInput : true
        });
    } catch (err) {
        console.error('getAdminExpenseCategories error:', err);
        return res.status(500).json({ success: false, message: 'Failed to load expense categories.' });
    }
};

/**
 * POST /api/admin/expense-categories
 * Create a custom expense category.
 */
exports.createExpenseCategory = async (req, res) => {
    try {
        const name = String(req.body.name || '').trim();
        if (!name) {
            return res.status(400).json({ success: false, message: 'Category name is required.' });
        }

        const slug = slugifyCategoryName(req.body.slug || name);
        if (!slug) {
            return res.status(400).json({ success: false, message: 'Could not derive a valid category slug.' });
        }

        const existing = await ExpenseCategory.findOne({
            $or: [{ name }, { slug }]
        }).lean();

        if (existing) {
            return res.status(409).json({
                success: false,
                message: existing.name === name
                    ? 'A category with this name already exists.'
                    : 'A category with this slug already exists.'
            });
        }

        const category = await ExpenseCategory.create({
            name,
            slug,
            isActive: req.body.isActive !== false,
            isSystemDefault: false,
            allowCustomInput: false
        });

        await logSecurityEvent({
            action: 'Expense Category Created',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${name} (${slug})`,
            resourceType: 'expense_category',
            resourceId: String(category._id)
        });

        return res.status(201).json({
            success: true,
            message: 'Expense category created.',
            data: formatCategory(category)
        });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ success: false, message: 'A category with this name or slug already exists.' });
        }
        console.error('createExpenseCategory error:', err);
        return res.status(500).json({ success: false, message: 'Failed to create expense category.' });
    }
};

/**
 * PATCH /api/admin/expense-categories/other-custom-toggle
 * Enable/disable the "Other" quick custom text input globally.
 */
exports.toggleOtherCustomInput = async (req, res) => {
    try {
        const enabled = req.body.enabled !== undefined
            ? !!req.body.enabled
            : req.body.allowCustomInput !== undefined
                ? !!req.body.allowCustomInput
                : null;

        if (enabled === null) {
            return res.status(400).json({ success: false, message: 'enabled (boolean) is required.' });
        }

        const other = await ExpenseCategory.findOne({ slug: 'other' });
        if (!other) {
            return res.status(404).json({ success: false, message: 'The "Other" category was not found. Run bootstrap seed.' });
        }

        other.allowCustomInput = enabled;
        await other.save();

        await logSecurityEvent({
            action: 'Expense Other Custom Input Toggled',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: enabled ? 'Enabled' : 'Disabled',
            resourceType: 'expense_category',
            resourceId: String(other._id)
        });

        return res.json({
            success: true,
            message: enabled
                ? 'Quick custom category input enabled for "Other".'
                : 'Quick custom category input disabled for "Other".',
            data: formatCategory(other)
        });
    } catch (err) {
        console.error('toggleOtherCustomInput error:', err);
        return res.status(500).json({ success: false, message: 'Failed to update Other category setting.' });
    }
};

/**
 * PATCH /api/admin/expense-categories/:id/toggle
 * Toggle isActive without deleting historical expense records.
 */
exports.toggleExpenseCategoryActive = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid category id.' });
        }

        const category = await ExpenseCategory.findById(id);
        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found.' });
        }

        category.isActive = !category.isActive;
        await category.save();

        await logSecurityEvent({
            action: 'Expense Category Toggled',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${category.name} → ${category.isActive ? 'Active' : 'Inactive'}`,
            resourceType: 'expense_category',
            resourceId: String(category._id)
        });

        return res.json({
            success: true,
            message: category.isActive ? 'Category enabled.' : 'Category disabled.',
            data: formatCategory(category)
        });
    } catch (err) {
        console.error('toggleExpenseCategoryActive error:', err);
        return res.status(500).json({ success: false, message: 'Failed to toggle category.' });
    }
};

/**
 * DELETE /api/admin/expense-categories/:id
 * Blocked for system defaults and categories linked to expense records.
 */
exports.deleteExpenseCategory = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid category id.' });
        }

        const category = await ExpenseCategory.findById(id);
        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found.' });
        }

        if (category.isSystemDefault) {
            return res.status(403).json({
                success: false,
                message: 'System default categories cannot be deleted. Disable them instead.'
            });
        }

        const inUse = await Expense.countDocuments({ category: category.slug });
        if (inUse > 0) {
            return res.status(409).json({
                success: false,
                message: `${inUse} expense record${inUse === 1 ? '' : 's'} use this category — disable it instead of deleting.`
            });
        }

        await category.deleteOne();

        await logSecurityEvent({
            action: 'Expense Category Deleted',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${category.name} (${category.slug})`,
            resourceType: 'expense_category',
            resourceId: String(id)
        });

        return res.json({ success: true, message: 'Expense category deleted.' });
    } catch (err) {
        console.error('deleteExpenseCategory error:', err);
        return res.status(500).json({ success: false, message: 'Failed to delete category.' });
    }
};
