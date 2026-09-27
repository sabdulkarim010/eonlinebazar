/********************************************************************
 * Project: EonlineBazar — System health & diagnostics API
 * File: systemHealthController.js
 ********************************************************************/

'use strict';

const {
    buildSystemHealthReport,
    purgeSystemCaches,
    triggerManualSyncReconcile
} = require('../../services/systemHealthService');
const { logSecurityEvent, getClientIp } = require('../../utils/securityLogger');

function actorFromReq(req) {
    const account = req.adminAccount;
    return {
        actor: account?.username || 'unknown',
        actorId: account?._id != null ? String(account._id) : undefined
    };
}

async function getSystemHealth(req, res) {
    try {
        const data = await buildSystemHealthReport();
        return res.status(200).json({ success: true, data });
    } catch (err) {
        console.error('[systemHealth] getSystemHealth:', err);
        return res.status(500).json({
            success: false,
            message: 'Could not collect system health metrics.'
        });
    }
}

async function purgeSystemCache(req, res) {
    try {
        const result = await purgeSystemCaches();
        const { actor, actorId } = actorFromReq(req);

        await logSecurityEvent({
            action: 'SYSTEM_CACHE_PURGE',
            actor,
            actorId,
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `Purged application cache — ${result.keysDeleted} key(s); redis=${result.redisConnected}`,
            resourceType: 'setting',
            resourceId: 'system-health'
        });

        return res.status(200).json({
            success: true,
            message: 'Application cache purged.',
            data: result
        });
    } catch (err) {
        console.error('[systemHealth] purgeSystemCache:', err);
        return res.status(500).json({
            success: false,
            message: 'Cache purge failed.'
        });
    }
}

async function triggerManualSync(req, res) {
    try {
        const result = await triggerManualSyncReconcile();
        const { actor, actorId } = actorFromReq(req);

        await logSecurityEvent({
            action: 'SYSTEM_MANUAL_SYNC',
            actor,
            actorId,
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `Manual sync reconcile — attempted=${result.attempted}, resolved=${result.resolved}, remaining=${result.unresolvedRemaining}`,
            resourceType: 'setting',
            resourceId: 'system-health'
        });

        return res.status(200).json({
            success: true,
            message: 'Manual sync reconciliation completed.',
            data: result
        });
    } catch (err) {
        console.error('[systemHealth] triggerManualSync:', err);
        return res.status(500).json({
            success: false,
            message: 'Manual sync failed.'
        });
    }
}

module.exports = {
    getSystemHealth,
    purgeSystemCache,
    triggerManualSync
};
