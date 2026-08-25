/**
 * EonlineBazar — Admin Login History Controller
 * Extracted from: controllers/adminSecurityController.js
 * Routes that use this: routes/adminRoutes.js
 *
 * When adding new endpoints:
 * 1. Add handler here
 * 2. Export from barrel (original controller file)
 * 3. Add route in routes/[file].routes.js
 */

const LoginAttempt = require('../../models/loginAttempt');

/* ==================================================================
   LOGIN HISTORY & FAILED ATTEMPTS (audit feed)
   GET /api/admin/login-history
   ================================================================== */
exports.getLoginHistory = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
        const skip = (page - 1) * limit;

        const [attempts, total, successCount, failedCount, blockedCount] = await Promise.all([
            LoginAttempt.find({})
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            LoginAttempt.countDocuments({}),
            LoginAttempt.countDocuments({ status: 'success' }),
            LoginAttempt.countDocuments({ status: { $in: ['failed', 'otp_failed'] } }),
            LoginAttempt.countDocuments({ status: 'blocked' })
        ]);

        const data = attempts.map(a => ({
            id: a._id,
            username: a.username,
            ip: a.ipAddress,
            location: a.location,
            os: a.os,
            browser: a.browser,
            deviceType: a.deviceType,
            status: a.status,
            details: a.details,
            timestamp: a.createdAt
        }));

        const summary = {
            total,
            success: successCount,
            failed: failedCount,
            blocked: blockedCount
        };

        res.status(200).json({
            success: true,
            summary,
            data,
            total,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1
            }
        });
    } catch (error) {
        console.error('Get Login History Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load login history.' });
    }
};
