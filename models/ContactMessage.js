/********************************************************************
 * Project: EonlineBazar
 * File: ContactMessage.js
 * Description: Customer contact form submissions for admin inbox.
 ********************************************************************/

const mongoose = require('mongoose');

const contactMessageSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    phone: { type: String, default: '', trim: true, maxlength: 20 },
    subject: { type: String, default: '', trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
    isRead: { type: Boolean, default: false, index: true }
}, { timestamps: true });

contactMessageSchema.index({ createdAt: -1 });

contactMessageSchema.methods.toAdminObject = function toAdminObject() {
    return {
        id: String(this._id),
        name: this.name,
        email: this.email,
        phone: this.phone || '',
        subject: this.subject || '',
        message: this.message,
        isRead: this.isRead === true,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt
    };
};

module.exports = mongoose.model('ContactMessage', contactMessageSchema);
