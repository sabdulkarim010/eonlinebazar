const SecurityLog = require('../models/securityLog');
const { dualWrite } = require('../services/dualWriteService');

function getSecurityLogRepository() {
    return require('../repositories/securityLogRepository');
}

function getClientIp(req) {
    return req.clientIp || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'Unknown';
}

function mapMongoSecurityLogToPostgresWrite(doc) {
    const plain = doc.toObject ? doc.toObject() : doc;
    return {
        action: plain.action,
        actor: plain.actor,
        actorType: plain.actorType,
        ipAddress: plain.ipAddress,
        details: plain.details,
        resourceType: plain.resourceType,
        resourceId: plain.resourceId,
        createdAt: plain.createdAt,
        legacyId: String(doc._id)
    };
}

async function logSecurityEvent({
    action,
    actor = 'system',
    actorType = 'system',
    ipAddress,
    details = '',
    resourceType = null,
    resourceId = null,
    source = 'api'
}) {
    try {
        await dualWrite(
            () => SecurityLog.create({
                action,
                actor,
                actorType,
                ipAddress: ipAddress || 'Unknown',
                details,
                resourceType: resourceType || undefined,
                resourceId: resourceId != null && resourceId !== '' ? String(resourceId) : undefined
            }),
            async (saved) => {
                await getSecurityLogRepository().create(mapMongoSecurityLogToPostgresWrite(saved));
            },
            {
                model: 'SecurityLog',
                operation: 'create',
                source,
                mongoId: (saved) => String(saved._id)
            }
        );
    } catch (err) {
        console.error('[SecurityLog] Mongo write failed:', err.message);
        if (err.stack) {
            console.error(err.stack);
        }
    }
}

module.exports = { logSecurityEvent, getClientIp };
