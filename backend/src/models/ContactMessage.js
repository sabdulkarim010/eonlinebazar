/********************************************************************
 * Project: EonlineBazar
 * File: ContactMessage.js
 * Description: Customer contact form submissions, now modelled as
 * support tickets with a lifecycle (open → in_progress → resolved →
 * closed), priority, assignment, and an auto-generated ticket number.
 * The read/unread inbox state is tracked separately on `isRead`.
 ********************************************************************/

const mongoose = require('mongoose');

// Ticket lifecycle statuses. `open` is the entry state for a new inquiry.
const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const CLOSED_STATUSES = ['resolved', 'closed'];

// Ticket numbers avoid ambiguous characters so they read cleanly over phone/chat.
const TICKET_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const contactMessageSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    phone: { type: String, default: '', trim: true, maxlength: 20 },
    subject: { type: String, default: '', trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
    // Human-friendly ticket reference, e.g. TKT-2026-A7K9.
    ticketNumber: {
        type: String,
        unique: true,
        sparse: true,
        trim: true,
        index: true
    },
    status: {
        type: String,
        enum: TICKET_STATUSES,
        default: 'open',
        index: true
    },
    priority: {
        type: String,
        enum: TICKET_PRIORITIES,
        default: 'normal',
        index: true
    },
    // Admin username the ticket is assigned to (loose ref — see Admin.username).
    assignedTo: { type: String, default: '', trim: true, maxlength: 80 },
    // First admin reply or internal note — set once on initial response.
    firstResponseAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    replyMessage: { type: String, default: '', trim: true, maxlength: 10000 },
    repliedAt: { type: Date, default: null },
    isRead: { type: Boolean, default: false, index: true }
}, { timestamps: true });

contactMessageSchema.index({ createdAt: -1 });
// Ticket inbox filters by lifecycle status, newest first.
contactMessageSchema.index({ status: 1, createdAt: -1 });

contactMessageSchema.statics.generateTicketCode = function generateTicketCode(length = 4) {
    let code = '';
    for (let i = 0; i < length; i += 1) {
        code += TICKET_CODE_ALPHABET[Math.floor(Math.random() * TICKET_CODE_ALPHABET.length)];
    }
    return code;
};

contactMessageSchema.statics.buildTicketNumber = function buildTicketNumber(code, date = new Date()) {
    const year = (date instanceof Date ? date : new Date()).getFullYear();
    return `TKT-${year}-${code}`;
};

// Assign a unique ticket number on first save. The unique+sparse index is the
// real guard; the retry loop just avoids a save error on the rare collision.
contactMessageSchema.pre('save', async function ensureTicketNumber() {
    if (this.ticketNumber) return;
    let attempts = 0;
    while (attempts < 6) {
        const candidate = this.constructor.buildTicketNumber(
            this.constructor.generateTicketCode(),
            this.createdAt || new Date()
        );
        // eslint-disable-next-line no-await-in-loop
        const clash = await this.constructor.exists({ ticketNumber: candidate });
        if (!clash) {
            this.ticketNumber = candidate;
            return;
        }
        attempts += 1;
    }
});

contactMessageSchema.methods.resolveStatus = function resolveStatus() {
    if (this.status && TICKET_STATUSES.includes(this.status)) {
        return this.status;
    }
    return 'open';
};

contactMessageSchema.methods.toAdminObject = function toAdminObject() {
    const status = this.resolveStatus();

    return {
        id: String(this._id),
        ticketNumber: this.ticketNumber || '',
        name: this.name,
        email: this.email,
        phone: this.phone || '',
        subject: this.subject || '',
        message: this.message,
        status,
        priority: this.priority || 'normal',
        assignedTo: this.assignedTo || '',
        firstResponseAt: this.firstResponseAt || null,
        resolvedAt: this.resolvedAt || null,
        replyMessage: this.replyMessage || '',
        repliedAt: this.repliedAt || null,
        isRead: this.isRead === true,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt
    };
};

module.exports = mongoose.model('ContactMessage', contactMessageSchema);
module.exports.TICKET_STATUSES = TICKET_STATUSES;
module.exports.TICKET_PRIORITIES = TICKET_PRIORITIES;
module.exports.CLOSED_STATUSES = CLOSED_STATUSES;
