/********************************************************************
 * Project: EonlineBazar — ERP Finance
 * File: expenseController.js
 * Location: controllers/admin/expenseController.js
 * Author: Abdul Karim Sheikh
 * Description: CRUD + summary for the operating-expense ledger that
 * powers the advanced Profit & Loss report. Every write is audited to
 * SecurityLog with resourceType 'expense'.
 ********************************************************************/

const mongoose = require('mongoose');
const Expense = require('../../models/expense');
const { logSecurityEvent, getClientIp } = require('../../utils/securityLogger');

const CATEGORIES = Expense.CATEGORIES;

function parsePagination(query) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 200);
    return { page, limit, skip: (page - 1) * limit };
}

/** Build an inclusive date-range filter from startDate/endDate query params. */
function buildDateRangeFilter(query) {
    const range = {};
    const start = query.startDate ? new Date(query.startDate) : null;
    const end = query.endDate ? new Date(query.endDate) : null;

    if (start && !Number.isNaN(start.getTime())) {
        start.setHours(0, 0, 0, 0);
        range.$gte = start;
    }
    if (end && !Number.isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
    }
    return Object.keys(range).length ? range : null;
}

/** Validate + normalize a category slug; returns '' when invalid. */
function normalizeCategory(value) {
    const cat = String(value || '').trim().toLowerCase();
    return CATEGORIES.includes(cat) ? cat : '';
}

/**
 * POST /api/admin/expenses
 * Records a single operating expense.
 */
exports.createExpense = async (req, res) => {
    try {
        const category = normalizeCategory(req.body.category);
        if (!category) {
            return res.status(400).json({
                success: false,
                message: `category is required and must be one of: ${CATEGORIES.join(', ')}`
            });
        }

        const amount = Number(req.body.amount);
        if (!Number.isFinite(amount) || amount < 0) {
            return res.status(400).json({
                success: false,
                message: 'amount is required and must be a non-negative number.'
            });
        }

        const rawDate = req.body.date ? new Date(req.body.date) : new Date();
        const date = Number.isNaN(rawDate.getTime()) ? new Date() : rawDate;

        const expense = await Expense.create({
            category,
            amount,
            description: String(req.body.description || '').trim(),
            date,
            reference: String(req.body.reference || '').trim(),
            recordedBy: req.admin?.username || req.admin?.displayName || 'admin',
            attachmentUrl: String(req.body.attachmentUrl || '').trim()
        });

        await logSecurityEvent({
            action: 'Expense Recorded',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${category} · ৳${amount} · ${expense.description || 'no description'}`,
            resourceType: 'expense',
            resourceId: String(expense._id)
        });

        return res.status(201).json({ success: true, message: 'Expense recorded.', data: expense });
    } catch (err) {
        console.error('createExpense error:', err);
        return res.status(500).json({ success: false, message: 'Failed to record expense.' });
    }
};

/**
 * GET /api/admin/expenses
 * Paginated expense list. Filters: ?startDate= ?endDate= ?category=
 */
exports.getAllExpenses = async (req, res) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const filter = {};

        const dateRange = buildDateRangeFilter(req.query);
        if (dateRange) filter.date = dateRange;

        const category = normalizeCategory(req.query.category);
        if (category) filter.category = category;

        const [total, expenses, totalAgg] = await Promise.all([
            Expense.countDocuments(filter),
            Expense.find(filter).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
            Expense.aggregate([
                { $match: filter },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ])
        ]);

        return res.json({
            success: true,
            data: expenses,
            totalAmount: totalAgg[0]?.total || 0,
            pagination: {
                total,
                page,
                limit,
                totalPages: total > 0 ? Math.ceil(total / limit) : 0,
                hasMore: page * limit < total
            }
        });
    } catch (err) {
        console.error('getAllExpenses error:', err);
        return res.status(500).json({ success: false, message: 'Failed to load expenses.' });
    }
};

/**
 * PATCH /api/admin/expenses/:id
 * Partial update — only supplied fields change.
 */
exports.updateExpense = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid expense id.' });
        }

        const update = {};
        if (req.body.category !== undefined) {
            const category = normalizeCategory(req.body.category);
            if (!category) {
                return res.status(400).json({
                    success: false,
                    message: `category must be one of: ${CATEGORIES.join(', ')}`
                });
            }
            update.category = category;
        }
        if (req.body.amount !== undefined) {
            const amount = Number(req.body.amount);
            if (!Number.isFinite(amount) || amount < 0) {
                return res.status(400).json({ success: false, message: 'amount must be a non-negative number.' });
            }
            update.amount = amount;
        }
        if (req.body.description !== undefined) update.description = String(req.body.description).trim();
        if (req.body.reference !== undefined) update.reference = String(req.body.reference).trim();
        if (req.body.attachmentUrl !== undefined) update.attachmentUrl = String(req.body.attachmentUrl).trim();
        if (req.body.date !== undefined) {
            const parsed = new Date(req.body.date);
            if (!Number.isNaN(parsed.getTime())) update.date = parsed;
        }

        const expense = await Expense.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true });
        if (!expense) {
            return res.status(404).json({ success: false, message: 'Expense not found.' });
        }

        await logSecurityEvent({
            action: 'Expense Updated',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${expense.category} · ৳${expense.amount}`,
            resourceType: 'expense',
            resourceId: String(expense._id)
        });

        return res.json({ success: true, message: 'Expense updated.', data: expense });
    } catch (err) {
        console.error('updateExpense error:', err);
        return res.status(500).json({ success: false, message: 'Failed to update expense.' });
    }
};

/**
 * DELETE /api/admin/expenses/:id
 */
exports.deleteExpense = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid expense id.' });
        }

        const expense = await Expense.findByIdAndDelete(id);
        if (!expense) {
            return res.status(404).json({ success: false, message: 'Expense not found.' });
        }

        await logSecurityEvent({
            action: 'Expense Deleted',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${expense.category} · ৳${expense.amount}`,
            resourceType: 'expense',
            resourceId: String(expense._id)
        });

        return res.json({ success: true, message: 'Expense deleted.' });
    } catch (err) {
        console.error('deleteExpense error:', err);
        return res.status(500).json({ success: false, message: 'Failed to delete expense.' });
    }
};

/**
 * GET /api/admin/expenses/summary
 * Totals by category for a date range (?startDate= ?endDate=).
 */
exports.getExpenseSummary = async (req, res) => {
    try {
        const filter = {};
        const dateRange = buildDateRangeFilter(req.query);
        if (dateRange) filter.date = dateRange;

        const rows = await Expense.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: '$category',
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { total: -1 } }
        ]);

        // Emit a stable, zero-filled bucket per category so the UI can render
        // every row even when a category has no spend in the period.
        const byCategory = {};
        CATEGORIES.forEach((cat) => { byCategory[cat] = { total: 0, count: 0 }; });
        let grandTotal = 0;
        rows.forEach((row) => {
            byCategory[row._id] = { total: row.total, count: row.count };
            grandTotal += row.total;
        });

        return res.json({
            success: true,
            data: {
                byCategory,
                categories: CATEGORIES.map((cat) => ({
                    category: cat,
                    total: byCategory[cat].total,
                    count: byCategory[cat].count
                })),
                grandTotal
            }
        });
    } catch (err) {
        console.error('getExpenseSummary error:', err);
        return res.status(500).json({ success: false, message: 'Failed to build expense summary.' });
    }
};
