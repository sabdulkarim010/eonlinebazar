/********************************************************************
 * Project: EonlineBazar
 * File: note.js
 * Location: backend/src/models/note.js
 * Description: Private per-user notebook entries — notes, expenses,
 * income, and shopping lists. Never shared across accounts.
 ********************************************************************/

const mongoose = require('mongoose');

const NOTE_TYPES = ['note', 'general', 'expense', 'income', 'shopping'];
const NOTE_CATEGORIES = ['food', 'transport', 'shopping', 'bill', 'health', 'education', 'other'];
const NOTE_COLORS = ['#FFFEF0', '#FFF0F0', '#F0FFF0', '#F0F0FF', '#FFF5E6'];

const shoppingItemSchema = new mongoose.Schema({
    name: { type: String, trim: true, maxlength: 80, default: '' },
    price: { type: Number, min: 0, default: 0 },
    checked: { type: Boolean, default: false }
}, { _id: false });

const noteSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120
    },
    content: {
        type: String,
        default: '',
        trim: true,
        maxlength: 4000
    },
    type: {
        type: String,
        enum: NOTE_TYPES,
        default: 'note',
        index: true
    },
    amount: {
        type: Number,
        min: 0,
        default: undefined
    },
    category: {
        type: String,
        enum: NOTE_CATEGORIES,
        default: 'other'
    },
    shoppingItems: {
        type: [shoppingItemSchema],
        default: []
    },
    tags: {
        type: [String],
        default: []
    },
    pinned: {
        type: Boolean,
        default: false
    },
    color: {
        type: String,
        default: '#FFFEF0'
    },
    date: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

noteSchema.index({ user: 1, createdAt: -1 });
noteSchema.index({ user: 1, type: 1, createdAt: -1 });
noteSchema.index({ user: 1, date: -1 });

module.exports = mongoose.model('Note', noteSchema);
module.exports.NOTE_TYPES = NOTE_TYPES;
module.exports.NOTE_CATEGORIES = NOTE_CATEGORIES;
module.exports.NOTE_COLORS = NOTE_COLORS;
