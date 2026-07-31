const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { logSecurityEvent } = require('./securityLogger');
const { ACCOUNT_STATUS } = require('../config/permissions');

async function logEmergencyAction(action, ip, details = '') {
    const owner = process.env.EMERGENCY_OWNER_NAME || 'Owner';
    await logSecurityEvent({
        action: `Emergency: ${action}`,
        actor: owner,
        actorType: 'admin',
        ipAddress: ip || 'Unknown',
        details
    });
    console.log(`[EMERGENCY] ${new Date().toISOString()} — ${action} — IP: ${ip || 'Unknown'} — ${details}`);
}

function activeBanQuery() {
    const now = new Date();
    return {
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
    };
}

async function getSystemStatus() {
    const Admin = require('../models/admin');
    const BlacklistedIP = require('../models/blacklistedIp');
    const LoginAttempt = require('../models/loginAttempt');
    const Order = require('../models/order');

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
        adminCount,
        blockedIpCount,
        recentAttempts,
        totalOrders,
        dbState
    ] = await Promise.all([
        Admin.countDocuments(),
        BlacklistedIP.countDocuments(activeBanQuery()),
        LoginAttempt.countDocuments({
            status: { $in: ['failed', 'otp_failed', 'blocked'] },
            createdAt: { $gte: since24h }
        }),
        Order.countDocuments(),
        Promise.resolve(mongoose.connection.readyState)
    ]);

    return {
        database: dbState === 1 ? 'connected' : 'disconnected',
        adminCount,
        blockedIpCount,
        recentFailedLogins: recentAttempts,
        totalOrders,
        serverTime: new Date().toISOString(),
        nodeVersion: process.version,
        uptime: Math.floor(process.uptime()) + ' seconds'
    };
}

async function getAllBlockedIPs() {
    const BlacklistedIP = require('../models/blacklistedIp');
    return BlacklistedIP.find(activeBanQuery())
        .select('ip reason createdAt expiresAt blockedAt')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
}

async function unblockIP(ip, requestIp) {
    const BlacklistedIP = require('../models/blacklistedIp');
    const LoginAttempt = require('../models/loginAttempt');

    const deleted = await BlacklistedIP.deleteMany({ ip });
    await LoginAttempt.deleteMany({ ipAddress: ip });

    await logEmergencyAction('IP Unblocked', requestIp, `Target IP: ${ip}, removed ${deleted.deletedCount} ban(s)`);

    return { success: true, message: `IP ${ip} has been unblocked` };
}

async function unblockAllIPs(requestIp) {
    const BlacklistedIP = require('../models/blacklistedIp');
    const LoginAttempt = require('../models/loginAttempt');

    const deleted = await BlacklistedIP.deleteMany({});
    await LoginAttempt.deleteMany({});

    await logEmergencyAction('All IPs Unblocked', requestIp, `Removed ${deleted.deletedCount} ban(s) and cleared login attempts`);

    return {
        success: true,
        message: `All IPs unblocked. Removed: ${deleted.deletedCount} entries`
    };
}

async function resetAdminPassword(username, newPassword, requestIp) {
    const Admin = require('../models/admin');

    const admin = await Admin.findOne({ username });
    if (!admin) return { success: false, message: 'Admin not found' };

    admin.password = await bcrypt.hash(newPassword, 12);
    admin.twoFactorEnabled = false;
    admin.status = ACCOUNT_STATUS.ACTIVE;
    admin.otp = null;
    admin.otpExpiry = null;
    await admin.save();

    await logEmergencyAction('Admin Password Reset', requestIp, `Username: ${username}, 2FA disabled`);

    return { success: true, message: `Password reset for ${username}` };
}

async function listAdmins() {
    const Admin = require('../models/admin');
    return Admin.find()
        .select('username email role status twoFactorEnabled lastLoginAt createdAt')
        .sort({ createdAt: -1 })
        .lean();
}

async function getRecentSecurityLogs() {
    const SecurityLog = require('../models/securityLog');
    return SecurityLog.find()
        .sort({ createdAt: -1 })
        .limit(20)
        .select('action ipAddress actor createdAt details')
        .lean();
}

module.exports = {
    getSystemStatus,
    getAllBlockedIPs,
    unblockIP,
    unblockAllIPs,
    resetAdminPassword,
    listAdmins,
    getRecentSecurityLogs,
    logEmergencyAction
};
