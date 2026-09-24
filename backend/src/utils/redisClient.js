/********************************************************************
 * Project: EonlineBazar
 * File: redisClient.js
 * Location: utils/redisClient.js
 * Description: Optional Redis client — graceful degradation when unavailable.
 ********************************************************************/

const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_ERROR_DEBOUNCE_MS = Number(process.env.REDIS_ERROR_DEBOUNCE_MS || 30000);

let lastRedisErrorMessage = '';
let lastRedisErrorAt = 0;
let redisUnavailableLogged = false;

function logRedisUnavailable(message) {
    const msg = String(message || 'unknown').trim();
    const now = Date.now();

    if (redisUnavailableLogged && msg === lastRedisErrorMessage && now - lastRedisErrorAt < REDIS_ERROR_DEBOUNCE_MS) {
        return;
    }

    lastRedisErrorMessage = msg;
    lastRedisErrorAt = now;
    redisUnavailableLogged = true;
    console.warn('Redis unavailable:', msg);
}

const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    lazyConnect: false,
    retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 200, 1000);
    }
});

client.isReady = false;

client.on('connect', () => {
    client.isReady = true;
    redisUnavailableLogged = false;
});

client.on('ready', () => {
    client.isReady = true;
    redisUnavailableLogged = false;
});

client.on('error', (err) => {
    client.isReady = false;
    logRedisUnavailable(err?.message);
});

client.on('close', () => {
    client.isReady = false;
});

client.on('end', () => {
    client.isReady = false;
});

function isRedisAvailable() {
    return client.isReady === true && client.status === 'ready';
}

module.exports = client;
module.exports.isRedisAvailable = isRedisAvailable;
module.exports.logRedisUnavailable = logRedisUnavailable;
