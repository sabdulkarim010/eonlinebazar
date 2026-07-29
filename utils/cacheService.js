/********************************************************************
 * Project: EonlineBazar
 * File: cacheService.js
 * Location: utils/cacheService.js
 * Description: Redis cache wrapper with graceful MongoDB fallback.
 ********************************************************************/

const redisClient = require('./redisClient');
const { isRedisAvailable } = require('./redisClient');

const DEFAULT_TTL = Number(process.env.REDIS_CACHE_TTL_SECONDS) || 300;
const isDev = process.env.NODE_ENV !== 'production';

const CACHE_KEYS = {
    STORE_SETTINGS: 'store:settings',
    CATEGORIES: 'catalog:categories:all',
    BRANDS: 'catalog:brands:all',
    POPULAR_PRODUCTS: 'products:popular',
    FEATURED_PRODUCTS: 'products:featured',
    FLASH_SALE: 'store:flash-sale',
    FOOTER_SETTINGS: 'store:footer',
    PAGE_CONTENT: (slug) => `cms:page:${slug}`,
    PRODUCT: (id) => `products:detail:${id}`,
    SEARCH_RESULTS: (queryHash) => `search:${queryHash}`
};

async function getOrSet(key, fetchFn, ttlSeconds = DEFAULT_TTL) {
    if (isRedisAvailable()) {
        try {
            const cached = await redisClient.get(key);
            if (cached !== null) {
                if (isDev) console.log(`[Cache] HIT  ${key}`);
                return JSON.parse(cached);
            }
            if (isDev) console.log(`[Cache] MISS ${key}`);
        } catch (err) {
            if (isDev) console.warn(`[Cache] GET error for ${key}:`, err.message);
        }
    }

    const result = await fetchFn();

    if (isRedisAvailable() && result !== undefined && result !== null) {
        try {
            await redisClient.set(key, JSON.stringify(result), 'EX', ttlSeconds);
        } catch (err) {
            if (isDev) console.warn(`[Cache] SET error for ${key}:`, err.message);
        }
    }

    return result;
}

async function invalidate(key) {
    if (!isRedisAvailable()) return;
    try {
        await redisClient.del(key);
        if (isDev) console.log(`[Cache] DEL  ${key}`);
    } catch (_err) {
        // silent fail
    }
}

async function invalidateMany(keys) {
    if (!isRedisAvailable() || !keys?.length) return;
    try {
        await redisClient.del(...keys);
        if (isDev) console.log(`[Cache] DEL  ${keys.length} key(s)`);
    } catch (_err) {
        // silent fail
    }
}

async function invalidatePattern(pattern) {
    if (!isRedisAvailable() || !pattern) return 0;

    let deleted = 0;

    try {
        let cursor = '0';
        do {
            const [nextCursor, keys] = await redisClient.scan(
                cursor,
                'MATCH',
                pattern,
                'COUNT',
                100
            );
            cursor = nextCursor;
            if (keys.length > 0) {
                await redisClient.del(...keys);
                deleted += keys.length;
            }
        } while (cursor !== '0');

        if (isDev && deleted > 0) {
            console.log(`[Cache] DEL pattern "${pattern}" — ${deleted} key(s)`);
        }
    } catch (_err) {
        // silent fail
    }

    return deleted;
}

async function invalidateProductCaches(productId) {
    const keys = [CACHE_KEYS.POPULAR_PRODUCTS, CACHE_KEYS.FEATURED_PRODUCTS];
    if (productId) keys.push(CACHE_KEYS.PRODUCT(productId));
    await invalidateMany(keys);
}

module.exports = {
    CACHE_KEYS,
    getOrSet,
    invalidate,
    invalidateMany,
    invalidatePattern,
    invalidateProductCaches
};
