/********************************************************************
 * Project: EonlineBazar — System Settings Phase 4 Part 2
 * File: systemHealthService.js
 * Description: Real-time diagnostics — DB latency, memory, sync queue, cache.
 ********************************************************************/

'use strict';

const os = require('os');
const mongoose = require('mongoose');
const Settings = require('../models/Settings');
const FailedSync = require('../models/FailedSync');
const { isRedisAvailable } = require('../utils/redisClient');
const redisClient = require('../utils/redisClient');
const { purgeApplicationCaches } = require('./cacheService');
const { reconcileFailedSyncs, listUnresolvedFailures } = require('./failedSyncService');
const { getRateLimitHitStats } = require('./rateLimitHitTracker');

const LATENCY_DEGRADED_MS = Number(process.env.HEALTH_DB_DEGRADED_MS) || 500;
const HEAP_DEGRADED_BYTES = Number(process.env.HEALTH_HEAP_DEGRADED_BYTES) || 800 * 1024 * 1024;
const HEAP_CRITICAL_BYTES = Number(process.env.HEALTH_HEAP_CRITICAL_BYTES) || 1536 * 1024 * 1024;

function classifyLatency(ms, ok) {
    if (!ok || ms == null || !Number.isFinite(ms)) return 'offline';
    if (ms >= LATENCY_DEGRADED_MS) return 'degraded';
    return 'healthy';
}

function classifyMemory(heapUsed) {
    if (heapUsed >= HEAP_CRITICAL_BYTES) return 'offline';
    if (heapUsed >= HEAP_DEGRADED_BYTES) return 'degraded';
    return 'healthy';
}

async function measureMongoLatency() {
    const started = Date.now();
    try {
        const state = mongoose.connection.readyState;
        if (state !== 1) {
            return {
                ok: false,
                latencyMs: null,
                status: 'offline',
                readyState: state
            };
        }
        await Settings.findOne().select('_id').lean().maxTimeMS(5000);
        const latencyMs = Date.now() - started;
        return {
            ok: true,
            latencyMs,
            status: classifyLatency(latencyMs, true),
            readyState: state
        };
    } catch (err) {
        return {
            ok: false,
            latencyMs: Date.now() - started,
            status: 'offline',
            error: err.message || String(err)
        };
    }
}

async function measurePostgresLatency() {
    const started = Date.now();
    try {
        const prisma = require('../config/prismaClient');
        await prisma.$queryRawUnsafe('SELECT 1');
        const latencyMs = Date.now() - started;
        return {
            ok: true,
            latencyMs,
            status: classifyLatency(latencyMs, true)
        };
    } catch (err) {
        return {
            ok: false,
            latencyMs: Date.now() - started,
            status: 'offline',
            error: err.message || String(err)
        };
    }
}

async function measureRedisHealth() {
    if (!isRedisAvailable()) {
        return {
            driver: 'none',
            status: 'offline',
            connected: false,
            latencyMs: null,
            message: 'Redis unavailable — cache reads use in-memory / direct DB fallback.'
        };
    }

    const started = Date.now();
    try {
        await redisClient.ping();
        const latencyMs = Date.now() - started;
        let keyCount = null;
        try {
            keyCount = await redisClient.dbsize();
        } catch (_) { /* ignore */ }

        return {
            driver: 'redis',
            status: classifyLatency(latencyMs, true),
            connected: true,
            latencyMs,
            keyCount
        };
    } catch (err) {
        return {
            driver: 'redis',
            status: 'offline',
            connected: false,
            latencyMs: Date.now() - started,
            error: err.message || String(err)
        };
    }
}

async function collectSyncQueueStatus() {
    const [unresolvedCount, pendingPgSync, rateLimitStats] = await Promise.all([
        FailedSync.countDocuments({ resolvedAt: null }),
        Settings.countDocuments({ pendingPgSync: true }),
        getRateLimitHitStats()
    ]);

    return {
        unresolvedDualWriteFailures: unresolvedCount,
        settingsPendingPgSync: pendingPgSync,
        rateLimitHits24h: rateLimitStats.total24h,
        rateLimitSource: rateLimitStats.source
    };
}

function collectServerMetrics() {
    const mem = process.memoryUsage();
    const load = os.loadavg();

    return {
        uptimeSeconds: Math.floor(process.uptime()),
        nodeVersion: process.version,
        memory: {
            rssBytes: mem.rss,
            heapUsedBytes: mem.heapUsed,
            heapTotalBytes: mem.heapTotal,
            externalBytes: mem.external,
            status: classifyMemory(mem.heapUsed)
        },
        loadAverage: {
            '1m': load[0],
            '5m': load[1],
            '15m': load[2]
        },
        platform: os.platform(),
        cpuCount: os.cpus()?.length || 0
    };
}

/**
 * @returns {Promise<object>} Full health snapshot for admin dashboard.
 */
async function buildSystemHealthReport() {
    const [mongo, postgres, redis, sync, server] = await Promise.all([
        measureMongoLatency(),
        measurePostgresLatency(),
        measureRedisHealth(),
        collectSyncQueueStatus(),
        Promise.resolve(collectServerMetrics())
    ]);

    const dbStatuses = [mongo.status, postgres.status];
    let overall = 'healthy';
    if (dbStatuses.includes('offline') || server.memory.status === 'offline') {
        overall = 'offline';
    } else if (
        dbStatuses.includes('degraded')
        || (isRedisAvailable() && redis.status === 'degraded')
        || server.memory.status === 'degraded'
    ) {
        overall = 'degraded';
    }

    return {
        generatedAt: new Date().toISOString(),
        overallStatus: overall,
        databases: {
            mongodb: mongo,
            postgresql: postgres
        },
        cache: {
            redis,
            inMemoryFallback: !isRedisAvailable()
        },
        syncQueue: sync,
        server
    };
}

async function purgeSystemCaches() {
    return purgeApplicationCaches();
}

async function triggerManualSyncReconcile() {
    const preview = await listUnresolvedFailures(500);
    const result = await reconcileFailedSyncs();
    const remaining = await FailedSync.countDocuments({ resolvedAt: null });

    return {
        ...result,
        pendingBefore: preview.length,
        unresolvedRemaining: remaining
    };
}

module.exports = {
    buildSystemHealthReport,
    purgeSystemCaches,
    triggerManualSyncReconcile,
    measureMongoLatency,
    measurePostgresLatency,
    measureRedisHealth,
    classifyLatency,
    classifyMemory,
    LATENCY_DEGRADED_MS
};
