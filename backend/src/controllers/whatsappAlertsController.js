/********************************************************************
 * Project: EonlineBazar
 * File: whatsappAlertsController.js
 * Location: controllers/whatsappAlertsController.js
 * Description: Admin endpoints for pending WhatsApp order alerts
 * (wa.me fallback queue when the API gateway cannot auto-send).
 ********************************************************************/

const {
    getPendingWhatsAppAlerts,
    dismissPendingWhatsAppAlert
} = require('../services/whatsappService');

const getPendingWhatsAppAlertsHandler = (req, res) => {
    try {
        const alerts = getPendingWhatsAppAlerts({ undeliveredOnly: true });
        res.status(200).json({
            success: true,
            count: alerts.length,
            data: alerts
        });
    } catch (error) {
        console.error('Get pending WhatsApp alerts error:', error);
        res.status(500).json({ success: false, message: 'Failed to load WhatsApp alerts.' });
    }
};

const dismissWhatsAppAlertHandler = (req, res) => {
    try {
        const dismissed = dismissPendingWhatsAppAlert(req.params.id);
        if (!dismissed) {
            return res.status(404).json({ success: false, message: 'Alert not found.' });
        }
        res.status(200).json({ success: true, message: 'Alert dismissed.' });
    } catch (error) {
        console.error('Dismiss WhatsApp alert error:', error);
        res.status(500).json({ success: false, message: 'Failed to dismiss alert.' });
    }
};

module.exports = {
    getPendingWhatsAppAlertsHandler,
    dismissWhatsAppAlertHandler
};
