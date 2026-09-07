/********************************************************************
 * Admin notification helpers — socket events for order/return alerts.
 ********************************************************************/

const { emitToAdmins } = require('./socketService');

/**
 * Notify signed-in admins (real-time panel) about operational events.
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

module.exports = {
    sendAdminNotification
};
