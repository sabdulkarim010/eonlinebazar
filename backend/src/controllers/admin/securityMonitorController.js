/********************************************************************
 * Project: EonlineBazar — Security Monitor
 * File: securityMonitorController.js
 * Description: Rate-limit and login-failure monitoring for admins.
 ********************************************************************/

const { getRateLimitHitStats } = require('../../services/rateLimitHitTracker');
const {
    fetchTopFailedLoginIps,
    fetchAllBlacklistedIps
} = require('../../services/securityAuditReadService');

const TOP_OFFENDER_LIMIT = 5;

/**
 * GET /api/admin/security/rate-limit-stats
 */
exports.getRateLimitStats = async (req, res) => {
    try {
        const now = Date.now();
        const since24h = new Date(now - 24 * 60 * 60 * 1000);

        const [topOffendersRaw, blacklistDocs, rateLimitHits] = await Promise.all([
            fetchTopFailedLoginIps({ since: since24h, limit: TOP_OFFENDER_LIMIT }),
            fetchAllBlacklistedIps(),
            getRateLimitHitStats()
        ]);

        const topOffenders = topOffendersRaw.map((row) => (
            row._id != null
                ? { _id: row._id, failedCount: row.failedCount }
                : { _id: row.ip, failedCount: row.failedCount }
        ));

        const activeBlacklist = blacklistDocs
            .map((entry) => {
                const expired = entry.expiresAt
                    ? new Date(entry.expiresAt).getTime() <= now
                    : false;
                return {
                    id: String(entry._id),
                    ip: entry.ip,
                    reason: entry.reason,
                    source: entry.source,
                    blockedBy: entry.blockedBy,
                    blockedAt: entry.blockedAt,
                    expiresAt: entry.expiresAt,
                    permanent: !entry.expiresAt,
                    active: !expired,
                    expiresInMs: entry.expiresAt
                        ? Math.max(0, new Date(entry.expiresAt).getTime() - now)
                        : null
                };
            })
            .filter((entry) => entry.active);

        res.status(200).json({
            success: true,
            data: {
                windowHours: 24,
                rateLimitHits24h: rateLimitHits.total24h,
                rateLimitTrackingSource: rateLimitHits.source,
                topFailedLoginIps: topOffenders.map((row) => ({
                    ip: row._id,
                    failedCount: row.failedCount
                })),
                blacklistedIps: activeBlacklist
            }
        });
    } catch (error) {
        console.error('Get Rate Limit Stats Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load security monitor stats.' });
    }
};
