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
