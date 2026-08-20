/********************************************************************
 * Project: EonlineBazar
 * File: redisClient.js
 * Location: utils/redisClient.js
 * Description: Optional Redis client — graceful degradation when unavailable.
 ********************************************************************/

const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

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
});

client.on('ready', () => {
    client.isReady = true;
});

client.on('error', (err) => {
    client.isReady = false;
    console.warn('Redis unavailable:', err.message);
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
