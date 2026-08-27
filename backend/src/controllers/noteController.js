/********************************************************************
 * Project: EonlineBazar
 * File: noteController.js
 * Location: backend/src/controllers/noteController.js
 * Description: Private CRUD for the logged-in user's notebook (notes,
 * expenses, income, shopping). Every query is scoped to req.user.id.
 ********************************************************************/

const mongoose = require('mongoose');
const Note = require('../models/note');

const NOTE_TYPES = ['note', 'general', 'expense', 'income', 'shopping'];
const NOTE_CATEGORIES = ['food', 'transport', 'shopping', 'bill', 'health', 'education', 'other'];
const NOTE_COLORS = ['#FFFEF0', '#FFF0F0', '#F0FFF0', '#F0F0FF', '#FFF5E6'];

const MAX_TITLE = 120;
const MAX_CONTENT = 4000;
const MAX_LIMIT = 200;
const MONEY_TYPES = new Set(['expense', 'income']);
const NOTE_LIKE = new Set(['note', 'general']);

function readString(value, max) {
    return String(value ?? '').trim().slice(0, max);
}

function parseType(value) {
    const type = String(value || '').trim().toLowerCase();
    return NOTE_TYPES.includes(type) ? type : null;
}

function parseAmount(value, type) {
    if (!MONEY_TYPES.has(type)) return undefined;
    if (value === '' || value == null) return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 99999999) return null;
    return Math.round(n * 100) / 100;
}

function parseCategory(value) {
    const cat = String(value || 'other').trim().toLowerCase();
    return NOTE_CATEGORIES.includes(cat) ? cat : 'other';
}

function parseColor(value) {
    const color = String(value || '#FFFEF0').trim();
    return NOTE_COLORS.includes(color) ? color : '#FFFEF0';
}

function parseTags(raw) {
    if (!Array.isArray(raw)) return [];
    const tags = [];
    for (const item of raw) {
        const tag = readString(item, 24).replace(/\s+/g, '-').toLowerCase();
        if (tag && !tags.includes(tag)) tags.push(tag);
        if (tags.length >= 10) break;
    }
    return tags;
}

function parseShoppingItems(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, 50).map((item) => ({
        name: readString(item && item.name, 80),
        price: Math.max(0, Math.round((Number(item && item.price) || 0) * 100) / 100),
        checked: Boolean(item && item.checked)
    })).filter((item) => item.name);
}

function parseDate(value) {
    if (!value) return new Date();
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? new Date() : d;
}

function toObjectId(id) {
    try {
        return new mongoose.Types.ObjectId(String(id));
    } catch (_) {
        return null;
    }
}

function ownedFilter(req, extra = {}) {
    return { user: req.user.id, ...extra };
}

function shoppingTotal(items) {
    return (items || []).reduce((sum, item) => sum + (Number(item.price) || 0), 0);
}

function toNoteDto(doc) {
    const n = doc && typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
    const items = Array.isArray(n.shoppingItems) ? n.shoppingItems : [];
    let amount = null;
    if (MONEY_TYPES.has(n.type)) amount = Number(n.amount) || 0;
    else if (n.type === 'shopping') amount = shoppingTotal(items);

    return {
        _id: String(n._id),
        title: n.title,
        content: n.content || '',
        type: n.type,
        amount,
        category: n.category || 'other',
        shoppingItems: items,
        tags: Array.isArray(n.tags) ? n.tags : [],
        pinned: Boolean(n.pinned),
        color: n.color || '#FFFEF0',
        date: n.date || n.createdAt,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt
    };
}

function parseNotePayload(body) {
    const title = readString(body.title, MAX_TITLE);
    const content = readString(body.content, MAX_CONTENT);
    const type = parseType(body.type) || 'note';
    const amount = parseAmount(body.amount, type);
    const shoppingItems = type === 'shopping' ? parseShoppingItems(body.shoppingItems) : [];

    if (!title) return { error: 'Title is required.' };
    if (MONEY_TYPES.has(type) && amount == null) {
        return { error: 'A valid amount is required for expenses.' };
    }

    const payload = {
        title,
        content,
        type,
        category: parseCategory(body.category),
        tags: parseTags(body.tags),
        pinned: Boolean(body.pinned),
        color: parseColor(body.color),
        date: parseDate(body.date),
        shoppingItems
    };
    if (MONEY_TYPES.has(type)) payload.amount = amount;
    return { payload, money: MONEY_TYPES.has(type) };
}

exports.getNotes = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const type = parseType(req.query.type);
        const q = readString(req.query.q, 80);

        const filter = ownedFilter(req);
        if (req.query.type) {
            if (!type) return res.status(400).json({ success: false, message: 'Invalid note type.' });
            filter.type = NOTE_LIKE.has(type) ? { $in: ['note', 'general'] } : type;
        }
        if (q) {
            const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            filter.$or = [{ title: rx }, { content: rx }];
        }

        const userOid = toObjectId(req.user.id);
        const [notes, total, totals] = await Promise.all([
            Note.find(filter).sort({ pinned: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
            Note.countDocuments(filter),
            userOid
                ? Note.aggregate([
                    { $match: { user: userOid, type: { $in: ['expense', 'income'] } } },
                    { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } }
                ])
                : Promise.resolve([])
        ]);

        const expense = totals.find((row) => row._id === 'expense') || { total: 0, count: 0 };
        const income = totals.find((row) => row._id === 'income') || { total: 0, count: 0 };
        res.status(200).json({
            success: true,
            notes: notes.map(toNoteDto),
            pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
            summary: {
                expenseTotal: Number(expense.total) || 0,
                expenseCount: Number(expense.count) || 0,
                incomeTotal: Number(income.total) || 0,
                incomeCount: Number(income.count) || 0
            }
        });
    } catch (error) {
        console.error('Get Notes Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load notes.' });
    }
};

exports.createNote = async (req, res) => {
    try {
        const parsed = parseNotePayload(req.body || {});
        if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });

        const note = await Note.create({ user: req.user.id, ...parsed.payload });
        res.status(201).json({ success: true, message: 'Note saved.', note: toNoteDto(note) });
    } catch (error) {
        console.error('Create Note Error:', error);
        res.status(500).json({ success: false, message: 'Failed to save note.' });
    }
};

exports.updateNote = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({ success: false, message: 'Note not found.' });
        }
        const parsed = parseNotePayload(req.body || {});
        if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });

        const set = { ...parsed.payload };
        const update = parsed.money
            ? { $set: set }
            : { $set: set, $unset: { amount: 1 } };

        const note = await Note.findOneAndUpdate(
            ownedFilter(req, { _id: req.params.id }),
            update,
            { returnDocument: 'after', runValidators: true }
        );
        if (!note) return res.status(404).json({ success: false, message: 'Note not found.' });

        res.status(200).json({ success: true, message: 'Note updated.', note: toNoteDto(note) });
    } catch (error) {
        console.error('Update Note Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update note.' });
    }
};

exports.deleteNote = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({ success: false, message: 'Note not found.' });
        }
        const note = await Note.findOneAndDelete(ownedFilter(req, { _id: req.params.id }));
        if (!note) return res.status(404).json({ success: false, message: 'Note not found.' });

        res.status(200).json({ success: true, message: 'Note deleted.' });
    } catch (error) {
        console.error('Delete Note Error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete note.' });
    }
};
