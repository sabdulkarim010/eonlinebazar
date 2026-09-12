/********************************************************************
 * Project: EonlineBazar
 * File: rateLimitHitTracker.js
 * Description: Lightweight 24h counter for API rate-limit (429) hits.
 * Uses in-memory storage with optional Redis when available.
 ********************************************************************/

const redisClient = require('../utils/redisClient');
const { isRedisAvailable } = require('../utils/redisClient');

const memory = { dayKey: '', total: 0, byIp: new Map() };

function todayKey(date = new Date()) {
    return date.toISOString().slice(0, 10);
}

function resetMemoryIfNewDay() {
    const key = todayKey();
    if (memory.dayKey !== key) {
        memory.dayKey = key;
        memory.total = 0;
        memory.byIp.clear();
    }
}

/**
 * Record a rate-limit hit for the given IP (called from 429 handlers).
 */
async function recordRateLimitHit(ip = 'unknown') {
    const cleanIp = String(ip || 'unknown').trim() || 'unknown';
    resetMemoryIfNewDay();
    memory.total += 1;
    memory.byIp.set(cleanIp, (memory.byIp.get(cleanIp) || 0) + 1);

    if (!isRedisAvailable()) return;

    const day = todayKey();
    const ttlSeconds = 60 * 60 * 48;
    try {
        await redisClient.incr(`ratelimit:hits:${day}`);
        await redisClient.expire(`ratelimit:hits:${day}`, ttlSeconds);
        await redisClient.incr(`ratelimit:ip:${cleanIp}:${day}`);
        await redisClient.expire(`ratelimit:ip:${cleanIp}:${day}`, ttlSeconds);
    } catch (err) {
        console.warn('[RateLimitHitTracker] Redis increment failed:', err.message);
    }
}

/**
 * Return aggregate 24h rate-limit hit count for the security monitor.
 */
async function getRateLimitHitStats() {
    resetMemoryIfNewDay();
    let total24h = memory.total;
    let source = 'memory';

    if (isRedisAvailable()) {
        try {
            const val = await redisClient.get(`ratelimit:hits:${todayKey()}`);
            if (val != null) {
                total24h = parseInt(val, 10) || 0;
                source = 'redis';
            }
        } catch (err) {
            console.warn('[RateLimitHitTracker] Redis read failed:', err.message);
        }
    }

    return { total24h, source, dayKey: todayKey() };
}

module.exports = {
    recordRateLimitHit,
    getRateLimitHitStats
};
