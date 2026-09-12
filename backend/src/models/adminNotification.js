/********************************************************************
 * Project: EonlineBazar
 * File: adminNotification.js
 * Location: models/adminNotification.js
 * Description: In-app admin notification center — persisted alerts
 * for orders, stock, leave, payroll, security, and system events.
 ********************************************************************/

const mongoose = require('mongoose');

const NOTIFICATION_TYPES = Object.freeze([
    'order',
    'stock',
    'leave',
    'payroll',
    'security',
    'system'
]);

const adminNotificationSchema = new mongoose.Schema({
    recipientId: {
        type: String,
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: NOTIFICATION_TYPES,
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    message: {
        type: String,
        required: true,
        trim: true
    },
    link: {
        type: String,
        default: '',
        trim: true
    },
    isRead: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
});

adminNotificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('AdminNotification', adminNotificationSchema);
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
