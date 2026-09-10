/********************************************************************
 * Project: EonlineBazar
 * File: emailCampaign.js
 * Location: models/emailCampaign.js
 * Description: Admin email campaign schema — draft/scheduled/sent
 * newsletters with recipient stats and tag targeting.
 ********************************************************************/

const mongoose = require('mongoose');

const emailCampaignSchema = new mongoose.Schema({
    title: { type: String, required: true },
    subject: { type: String, required: true },
    htmlContent: { type: String, required: true },
    status: {
        type: String,
        enum: ['draft', 'scheduled', 'sending', 'sent', 'failed'],
        default: 'draft'
    },
    targetTags: [String],
    // 🎯 Segment targeting — recipients resolved from the User model by segment
    // (thresholds live in Setting.js). 'all' keeps the legacy subscriber behaviour
    // for email campaigns without a specific segment.
    targetSegment: {
        type: String,
        enum: ['all', 'vip', 'frequent', 'inactive', 'new'],
        default: 'all'
    },
    // 📣 Delivery channel — email (newsletter/SMTP), sms, or whatsapp broadcast.
    channel: {
        type: String,
        enum: ['email', 'sms', 'whatsapp'],
        default: 'email'
    },
    // Message body used for the WhatsApp broadcast channel (htmlContent is email-only).
    whatsappTemplate: {
        type: String,
        default: ''
    },
    scheduledAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    stats: {
        totalRecipients: { type: Number, default: 0 },
        sent: { type: Number, default: 0 },
        failed: { type: Number, default: 0 }
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.EmailCampaign || mongoose.model('EmailCampaign', emailCampaignSchema);
