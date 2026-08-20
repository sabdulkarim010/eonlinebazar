/********************************************************************
 * Project: EonlineBazar
 * File: cacheController.js
 * Location: controllers/cacheController.js
 * Description: Admin endpoints for Redis cache stats and management.
 ********************************************************************/

const redisClient = require('../utils/redisClient');
const { isRedisAvailable } = require('../utils/redisClient');
const { invalidatePattern } = require('../services/cacheService');

function parseInfoSection(infoText, section) {
    const regex = new RegExp(`# ${section}\\r?\\n([\\s\\S]*?)(?=\\r?\\n# |$)`);
    const match = infoText.match(regex);
    if (!match) return {};

    const result = {};
    match[1].split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const colon = trimmed.indexOf(':');
        if (colon === -1) return;
        result[trimmed.slice(0, colon)] = trimmed.slice(colon + 1);
    });
    return result;
}

const getCacheStats = async (req, res) => {
    try {
        if (!isRedisAvailable()) {
            return res.status(200).json({
                success: true,
                data: {
                    connected: false,
                    message: 'Redis is not connected — caching is disabled; all reads fall back to MongoDB.'
                }
            });
        }

        const [infoText, dbSize] = await Promise.all([
            redisClient.info(),
            redisClient.dbsize()
        ]);

        const memory = parseInfoSection(infoText, 'Memory');
        const stats = parseInfoSection(infoText, 'Stats');

        res.status(200).json({
            success: true,
            data: {
                connected: true,
                memoryUsed: memory.used_memory_human || null,
                memoryUsedBytes: Number(memory.used_memory) || null,
                keyspaceHits: Number(stats.keyspace_hits) || 0,
                keyspaceMisses: Number(stats.keyspace_misses) || 0,
                totalKeys: dbSize,
                hitRate: (() => {
                    const hits = Number(stats.keyspace_hits) || 0;
                    const misses = Number(stats.keyspace_misses) || 0;
                    const total = hits + misses;
                    return total > 0 ? Math.round((hits / total) * 10000) / 100 : null;
                })()
            }
        });
    } catch (error) {
        console.error('Get Cache Stats Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load cache stats.' });
    }
};

const flushCache = async (req, res) => {
    try {
        if (!isRedisAvailable()) {
            return res.status(503).json({
                success: false,
                message: 'Redis is not connected — nothing to flush.'
            });
        }

        await redisClient.flushdb();

        res.status(200).json({
            success: true,
            message: 'Cache cleared'
        });
    } catch (error) {
        console.error('Flush Cache Error:', error);
        res.status(500).json({ success: false, message: 'Failed to flush cache.' });
    }
};

const deleteCacheByPattern = async (req, res) => {
    try {
        const pattern = decodeURIComponent(req.params.pattern || '').trim();
        if (!pattern) {
            return res.status(400).json({ success: false, message: 'Pattern is required.' });
        }

        const deletedCount = await invalidatePattern(pattern);

        res.status(200).json({
            success: true,
            message: `Deleted ${deletedCount} key(s) matching "${pattern}".`,
            deletedCount
        });
    } catch (error) {
        console.error('Delete Cache Pattern Error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete cache keys.' });
    }
};

module.exports = {
    getCacheStats,
    flushCache,
    deleteCacheByPattern
};
