/********************************************************************
 * Project: EonlineBazar
 * File: newsletter.js
 * Location: models/newsletter.js
 * Description: Newsletter subscriber schema — email list with tags,
 * unsubscribe token, and delivery tracking.
 ********************************************************************/

const mongoose = require('mongoose');

const newsletterSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    name: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    source: {
        type: String,
        enum: ['footer_form', 'checkout', 'popup', 'manual'],
        default: 'footer_form'
    },
    subscribedAt: { type: Date, default: Date.now },
    unsubscribedAt: { type: Date, default: null },
    unsubscribeToken: { type: String, default: null },
    tags: [String],
    emailsSent: { type: Number, default: 0 },
    lastEmailAt: { type: Date, default: null }
});

module.exports = mongoose.models.Newsletter || mongoose.model('Newsletter', newsletterSchema);
