/********************************************************************
 * Project: EonlineBazar
 * File: ContactMessage.js
 * Description: Customer contact form submissions for admin inbox.
 ********************************************************************/

const mongoose = require('mongoose');

const INQUIRY_STATUSES = ['unread', 'read', 'replied'];

const contactMessageSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    phone: { type: String, default: '', trim: true, maxlength: 20 },
    subject: { type: String, default: '', trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
    status: {
        type: String,
        enum: INQUIRY_STATUSES,
        default: 'unread',
        index: true
    },
    replyMessage: { type: String, default: '', trim: true, maxlength: 10000 },
    repliedAt: { type: Date, default: null },
    isRead: { type: Boolean, default: false, index: true }
}, { timestamps: true });

contactMessageSchema.index({ createdAt: -1 });

contactMessageSchema.methods.resolveStatus = function resolveStatus() {
    if (this.status && INQUIRY_STATUSES.includes(this.status)) {
        return this.status;
    }
    return this.isRead ? 'read' : 'unread';
};

contactMessageSchema.methods.toAdminObject = function toAdminObject() {
    const status = this.resolveStatus();

    return {
        id: String(this._id),
        name: this.name,
        email: this.email,
        phone: this.phone || '',
        subject: this.subject || '',
        message: this.message,
        status,
        replyMessage: this.replyMessage || '',
        repliedAt: this.repliedAt || null,
        isRead: status !== 'unread',
        createdAt: this.createdAt,
        updatedAt: this.updatedAt
    };
};

module.exports = mongoose.model('ContactMessage', contactMessageSchema);
