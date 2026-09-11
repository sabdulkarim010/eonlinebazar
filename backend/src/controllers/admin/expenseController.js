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
const cloudinary = require('../../config/cloudinary');
const Expense = require('../../models/expense');
const upload = require('../../middlewares/uploadMiddleware');
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

function monthBounds(year, monthIndex) {
    const start = new Date(year, monthIndex, 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
    return { start, end };
}

function formatMonthKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

function formatMonthLabel(date) {
    return date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

async function sumExpensesBetween(start, end) {
    const rows = await Expense.aggregate([
        { $match: { date: { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    return rows[0]?.total || 0;
}

async function uploadBufferToCloudinary(file, folder) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder, resource_type: 'auto' },
            (err, result) => {
                if (err) return reject(err);
                resolve(result);
            }
        );
        stream.end(file.buffer);
    });
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
 * POST /api/admin/expenses/upload-receipt
 * Upload a receipt image/PDF to Cloudinary; returns { url } for attachmentUrl.
 */
exports.uploadExpenseReceipt = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No receipt file supplied.' });
        }

        const result = await uploadBufferToCloudinary(req.file, 'erp/expenses');
        return res.status(201).json({
            success: true,
            message: 'Receipt uploaded.',
            data: { url: result.secure_url || result.url, publicId: result.public_id }
        });
    } catch (err) {
        console.error('uploadExpenseReceipt error:', err);
        return res.status(500).json({ success: false, message: 'Failed to upload receipt.' });
    }
};

/**
 * GET /api/admin/expenses/summary
 * Totals by category for a date range (?startDate= ?endDate=) plus monthly trend
 * and this-month vs last-month stats for the dashboard cards.
 */
exports.getExpenseSummary = async (req, res) => {
    try {
        const filter = {};
        const dateRange = buildDateRangeFilter(req.query);
        if (dateRange) filter.date = dateRange;

        const now = new Date();
        const thisMonth = monthBounds(now.getFullYear(), now.getMonth());
        const lastMonth = monthBounds(now.getFullYear(), now.getMonth() - 1);
        const trendStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        trendStart.setHours(0, 0, 0, 0);

        const [rows, thisMonthTotal, lastMonthTotal, monthlyTrendRows] = await Promise.all([
            Expense.aggregate([
                { $match: filter },
                {
                    $group: {
                        _id: '$category',
                        total: { $sum: '$amount' },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { total: -1 } }
            ]),
            sumExpensesBetween(thisMonth.start, thisMonth.end),
            sumExpensesBetween(lastMonth.start, lastMonth.end),
            Expense.aggregate([
                { $match: { date: { $gte: trendStart, $lte: thisMonth.end } } },
                {
                    $group: {
                        _id: { year: { $year: '$date' }, month: { $month: '$date' } },
                        total: { $sum: '$amount' }
                    }
                },
                { $sort: { '_id.year': 1, '_id.month': 1 } }
            ])
        ]);

        const byCategory = {};
        CATEGORIES.forEach((cat) => { byCategory[cat] = { total: 0, count: 0 }; });
        let grandTotal = 0;
        rows.forEach((row) => {
            byCategory[row._id] = { total: row.total, count: row.count };
            grandTotal += row.total;
        });

        const thisMonthRows = await Expense.aggregate([
            { $match: { date: { $gte: thisMonth.start, $lte: thisMonth.end } } },
            { $group: { _id: '$category', total: { $sum: '$amount' } } },
            { $sort: { total: -1 } },
            { $limit: 1 }
        ]);
        const topCategory = thisMonthRows[0]?._id || null;
        const topCategoryTotal = thisMonthRows[0]?.total || 0;

        const vsLastMonth = lastMonthTotal > 0
            ? Math.round(((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 1000) / 10
            : (thisMonthTotal > 0 ? 100 : 0);

        const monthlyTrend = [];
        for (let i = 5; i >= 0; i -= 1) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const keyYear = d.getFullYear();
            const keyMonth = d.getMonth() + 1;
            const match = monthlyTrendRows.find(
                (row) => row._id.year === keyYear && row._id.month === keyMonth
            );
            monthlyTrend.push({
                month: formatMonthKey(d),
                label: formatMonthLabel(d),
                total: match?.total || 0
            });
        }

        return res.json({
            success: true,
            data: {
                byCategory,
                categories: CATEGORIES.map((cat) => ({
                    category: cat,
                    total: byCategory[cat].total,
                    count: byCategory[cat].count
                })),
                grandTotal,
                stats: {
                    thisMonthTotal,
                    lastMonthTotal,
                    vsLastMonth,
                    topCategory,
                    topCategoryTotal
                },
                monthlyTrend
            }
        });
    } catch (err) {
        console.error('getExpenseSummary error:', err);
        return res.status(500).json({ success: false, message: 'Failed to build expense summary.' });
    }
};

/** Multer middleware export for the upload-receipt route. */
exports.receiptUploadMiddleware = upload.single('receipt');
