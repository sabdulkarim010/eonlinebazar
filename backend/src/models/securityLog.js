const mongoose = require('mongoose');

const securityLogSchema = new mongoose.Schema({
    action: { type: String, required: true, trim: true },
    actor: { type: String, default: 'system', trim: true },
    actorType: { type: String, enum: ['admin', 'customer', 'system'], default: 'system' },
    ipAddress: { type: String, default: 'Unknown' },
    details: { type: String, default: '' }
}, { timestamps: true });

securityLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('SecurityLog', securityLogSchema);
