/********************************************************************
 * Admin notification helpers — persisted in-app alerts + socket events.
 ********************************************************************/

const Admin = require('../models/admin');
const AdminNotification = require('../models/adminNotification');
const { ROLES, ACCOUNT_STATUS } = require('../config/permissions');
const { emitToAdmins } = require('./socketService');

const { NOTIFICATION_TYPES } = AdminNotification;

/**
 * Notify signed-in admins (real-time panel) about operational events.
 * Kept for backward compatibility with existing socket-only callers.
 */
async function sendAdminNotification(payload = {}) {
    const type = String(payload.type || 'admin_alert').trim();
    const data = {
        ...payload,
        type,
        at: new Date().toISOString()
    };

    try {
        emitToAdmins(type, data);
    } catch (err) {
        console.warn('[notificationService] emitToAdmins failed:', err.message);
    }

    return { success: true, data };
}

/**
 * Persist a notification for one admin (or broadcast with recipientId 'all').
 */
async function createNotification(recipientId, type, title, message, link = '') {
    const normalizedType = String(type || 'system').trim().toLowerCase();
    if (!NOTIFICATION_TYPES.includes(normalizedType)) {
        throw new Error(`Invalid notification type: ${type}`);
    }

    const doc = await AdminNotification.create({
        recipientId: String(recipientId),
        type: normalizedType,
        title: String(title || '').trim(),
        message: String(message || '').trim(),
        link: link ? String(link).trim() : '',
        isRead: false
    });

    try {
        emitToAdmins('admin_notification', {
            id: String(doc._id),
            recipientId: doc.recipientId,
            type: doc.type,
            title: doc.title,
            message: doc.message,
            link: doc.link,
            createdAt: doc.createdAt
        });
    } catch (err) {
        console.warn('[notificationService] admin_notification emit failed:', err.message);
    }

    return doc;
}

/**
 * Create the same notification for every active admin who holds a permission
 * (super admins always receive it).
 */
async function notifyAdminsWithPermission(permission, type, title, message, link = '') {
    const admins = await Admin.find({
        status: ACCOUNT_STATUS.ACTIVE,
        $or: [
            { role: ROLES.SUPER_ADMIN },
            { permissions: permission }
        ]
    }).select('_id').lean();

    if (!admins.length) return [];

    return Promise.all(
        admins.map((admin) => createNotification(String(admin._id), type, title, message, link))
    );
}

module.exports = {
    sendAdminNotification,
    createNotification,
    notifyAdminsWithPermission
};
