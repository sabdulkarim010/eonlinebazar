/********************************************************************
 * Project: EonlineBazar
 * File: notificationController.js
 * Location: controllers/admin/notificationController.js
 * Description: In-app notification center — list, unread count, mark read.
 ********************************************************************/

const AdminNotification = require('../../models/adminNotification');

function recipientFilter(adminId) {
    return { recipientId: { $in: [String(adminId), 'all'] } };
}

/**
 * GET /api/admin/notifications
 * Paginated notifications for the signed-in admin.
 */
exports.getMyNotifications = async (req, res) => {
    try {
        const adminId = String(req.adminAccount._id);
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
        const skip = (page - 1) * limit;
        const filter = recipientFilter(adminId);

        const [notifications, total, unreadCount] = await Promise.all([
            AdminNotification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            AdminNotification.countDocuments(filter),
            AdminNotification.countDocuments({ ...filter, isRead: false })
        ]);

        return res.status(200).json({
            success: true,
            data: notifications,
            unreadCount,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1
            }
        });
    } catch (err) {
        console.error('getMyNotifications error:', err);
        return res.status(500).json({ success: false, message: 'Failed to load notifications.' });
    }
};

/**
 * GET /api/admin/notifications/unread-count
 */
exports.getUnreadCount = async (req, res) => {
    try {
        const adminId = String(req.adminAccount._id);
        const unreadCount = await AdminNotification.countDocuments({
            ...recipientFilter(adminId),
            isRead: false
        });

        return res.status(200).json({ success: true, unreadCount });
    } catch (err) {
        console.error('getUnreadCount error:', err);
        return res.status(500).json({ success: false, message: 'Failed to load unread count.' });
    }
};

/**
 * PATCH /api/admin/notifications/:id/read
 */
exports.markAsRead = async (req, res) => {
    try {
        const adminId = String(req.adminAccount._id);
        const doc = await AdminNotification.findOneAndUpdate(
            { _id: req.params.id, ...recipientFilter(adminId) },
            { $set: { isRead: true } },
            { returnDocument: 'after' }
        );

        if (!doc) {
            return res.status(404).json({ success: false, message: 'Notification not found.' });
        }

        return res.status(200).json({ success: true, data: doc });
    } catch (err) {
        console.error('markAsRead error:', err);
        return res.status(500).json({ success: false, message: 'Failed to mark notification as read.' });
    }
};

/**
 * PATCH /api/admin/notifications/mark-all-read
 */
exports.markAllAsRead = async (req, res) => {
    try {
        const adminId = String(req.adminAccount._id);
        await AdminNotification.updateMany(
            { ...recipientFilter(adminId), isRead: false },
            { $set: { isRead: true } }
        );

        return res.status(200).json({ success: true, message: 'All notifications marked as read.' });
    } catch (err) {
        console.error('markAllAsRead error:', err);
        return res.status(500).json({ success: false, message: 'Failed to mark all notifications as read.' });
    }
};
