/**
 * EonlineBazar — Admin Session Controller
 * Extracted from: controllers/adminSecurityController.js
 * Routes that use this: routes/adminRoutes.js
 *
 * When adding new endpoints:
 * 1. Add handler here
 * 2. Export from barrel (original controller file)
 * 3. Add route in routes/[file].routes.js
 */

const mongoose = require('mongoose');
const AdminSession = require('../../models/adminSession');
const { fingerprint } = require('../../utils/deviceParser');
const { logSecurityEvent } = require('../../utils/securityLogger');

/* ==================================================================
   ACTIVE SESSIONS / DEVICES
   ================================================================== */

// GET /api/admin/sessions
exports.getAdminSessions = async (req, res) => {
    try {
        const currentSid = req.admin && req.admin.sid;
        const sessions = await AdminSession
            .find({ adminUsername: req.admin.username, status: 'active' })
            .sort({ lastActive: -1 })
            .lean();

        const data = sessions.map(s => ({
            id: s._id,
            sessionId: s.sessionId,
            ip: s.ipAddress,
            location: s.location || 'Unknown Location',
            os: s.os,
            browser: s.browser,
            deviceType: s.deviceType,
            device: s.device,
            createdAt: s.createdAt,
            lastActive: s.lastActive,
            isCurrent: currentSid ? s.sessionId === currentSid : false
        }));

        res.status(200).json({ success: true, sessions: data });
    } catch (error) {
        console.error('Get Admin Sessions Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load active sessions.' });
    }
};

// POST /api/admin/logout — revoke the current admin session (full sign-out)
exports.logoutCurrent = async (req, res) => {
    try {
        const username = req.admin && req.admin.username;
        const sid = req.admin && req.admin.sid;
        const fp = fingerprint(req);

        if (sid) {
            await AdminSession.deleteOne({ sessionId: sid, adminUsername: username });
        } else if (username) {
            // Legacy tokens without sid: wipe all sessions for this admin
            await AdminSession.deleteMany({ adminUsername: username });
        }

        await logSecurityEvent({
            action: 'Admin Logout',
            actor: username || 'unknown',
            actorType: 'admin',
            ipAddress: fp.ipAddress,
            details: sid ? `Signed out session ${sid}` : 'Signed out (no sid on token)'
        });

        res.clearCookie('adminToken', { path: '/' });
        res.clearCookie('token', { path: '/' });

        return res.status(200).json({
            success: true,
            message: 'Logged out successfully.',
            redirect: '/admin/login'
        });
    } catch (error) {
        console.error('Admin Logout Error:', error);
        res.clearCookie('adminToken', { path: '/' });
        res.clearCookie('token', { path: '/' });
        return res.status(200).json({
            success: true,
            message: 'Logged out locally.',
            redirect: '/admin/login'
        });
    }
};

// POST /api/admin/sessions/logout/:id  (log out a specific device)
exports.logoutSession = async (req, res) => {
    try {
        const { id } = req.params;
        const orMatch = [{ sessionId: id }];
        if (mongoose.Types.ObjectId.isValid(id)) orMatch.push({ _id: id });

        const target = await AdminSession.findOne({ adminUsername: req.admin.username, $or: orMatch });
        if (!target) {
            return res.status(404).json({ success: false, message: 'Session not found or already logged out.' });
        }

        const isCurrent = req.admin.sid && target.sessionId === req.admin.sid;
        await target.deleteOne();

        await logSecurityEvent({
            action: 'Admin Session Terminated',
            actor: req.admin.username,
            actorType: 'admin',
            ipAddress: fingerprint(req).ipAddress,
            details: isCurrent ? 'Logged out current device' : `Remotely logged out ${target.device} (${target.ipAddress})`
        });

        res.status(200).json({
            success: true,
            message: isCurrent ? 'This device has been logged out.' : 'Device logged out remotely.',
            loggedOutCurrent: !!isCurrent
        });
    } catch (error) {
        console.error('Logout Admin Session Error:', error);
        res.status(500).json({ success: false, message: 'Failed to log out the device.' });
    }
};

// POST /api/admin/sessions/logout-others
exports.logoutOtherSessions = async (req, res) => {
    try {
        const currentSid = req.admin && req.admin.sid;
        if (!currentSid) {
            return res.status(400).json({ success: false, message: 'Current session could not be identified.' });
        }

        const result = await AdminSession.deleteMany({
            adminUsername: req.admin.username,
            sessionId: { $ne: currentSid }
        });

        await logSecurityEvent({
            action: 'Admin Sessions Purged',
            actor: req.admin.username,
            actorType: 'admin',
            ipAddress: fingerprint(req).ipAddress,
            details: `Logged out ${result.deletedCount} other device(s)`
        });

        res.status(200).json({
            success: true,
            message: result.deletedCount > 0
                ? `Logged out ${result.deletedCount} other device(s) successfully.`
                : 'No other active devices found.',
            removed: result.deletedCount
        });
    } catch (error) {
        console.error('Logout Other Admin Sessions Error:', error);
        res.status(500).json({ success: false, message: 'Failed to log out other devices.' });
    }
};
