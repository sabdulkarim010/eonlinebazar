const SecurityLog = require('../models/securityLog');

function getClientIp(req) {
    return req.clientIp || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'Unknown';
}

async function logSecurityEvent({ action, actor = 'system', actorType = 'system', ipAddress, details = '' }) {
    try {
        await SecurityLog.create({ action, actor, actorType, ipAddress: ipAddress || 'Unknown', details });
    } catch (err) {
        console.error('Security log write failed:', err.message);
    }
}

module.exports = { logSecurityEvent, getClientIp };
