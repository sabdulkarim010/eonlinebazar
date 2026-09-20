/********************************************************************
 * Public health probe — Mongo, PostgreSQL, Redis, uptime.
 ********************************************************************/

const mongoose = require('mongoose');
const redisClient = require('../utils/redisClient');
const { getPrisma } = require('../config/prismaClient');

function formatUptime(ms) {
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

async function probePostgres() {
    try {
        const prisma = getPrisma();
        await prisma.$queryRaw`SELECT 1`;
        return 'connected';
    } catch {
        return 'disconnected';
    }
}

async function probeRedis() {
    try {
        if (typeof redisClient.isRedisAvailable === 'function' && redisClient.isRedisAvailable()) {
            return 'connected';
        }
        if (redisClient.status === 'ready') return 'connected';
        return 'unavailable';
    } catch {
        return 'unavailable';
    }
}

async function getHealthPayload() {
    const mongo = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    const [postgresql, redis] = await Promise.all([
        probePostgres(),
        probeRedis()
    ]);

    const services = {
        mongodb: mongo,
        postgresql,
        redis,
        server: 'ok'
    };

    let status = 'ok';
    if (mongo === 'disconnected' || postgresql === 'disconnected') {
        status = 'degraded';
    }
    if (mongo === 'disconnected' && postgresql === 'disconnected') {
        status = 'down';
    }

    const started = Number(global.SERVER_START_TIME) || Date.now();
    const pkg = require('../../../package.json');

    return {
        status,
        timestamp: new Date().toISOString(),
        services,
        version: pkg.version || '1.0.0',
        uptime: formatUptime(Date.now() - started)
    };
}

module.exports = {
    getHealthPayload
};
