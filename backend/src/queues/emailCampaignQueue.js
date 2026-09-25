/********************************************************************
 * Project: EonlineBazar — Email Campaign Queue
 * File: emailCampaignQueue.js
 * Description: BullMQ queue for async campaign dispatch with inline
 * fallback when Redis is unavailable.
 ********************************************************************/

'use strict';

const { executeCampaignSend } = require('../services/emailCampaignDispatchService');

const QUEUE_NAME = 'email-campaigns';
const JOB_NAME = 'SEND_CAMPAIGN';

let bullQueue = null;
let bullQueueConnection = null;

function isRedisUsable() {
    if (process.env.NODE_ENV === 'test') return false;
    if (process.env.DISABLE_BULLMQ === 'true') return false;
    try {
        const redis = require('../utils/redisClient');
        return Boolean(redis?.isRedisAvailable?.() || redis?.isReady);
    } catch (_) {
        return false;
    }
}

function getBullQueueConnection() {
    if (!bullQueueConnection) {
        const { createBullMqConnection } = require('../utils/redisClient');
        bullQueueConnection = createBullMqConnection();
    }
    return bullQueueConnection;
}

function getBullQueue() {
    if (bullQueue) return bullQueue;

    const { Queue } = require('bullmq');
    bullQueue = new Queue(QUEUE_NAME, { connection: getBullQueueConnection() });
    return bullQueue;
}

function scheduleInlineCampaign(campaignId) {
    setImmediate(() => {
        executeCampaignSend(campaignId).catch((err) => {
            console.error('[EmailCampaignQueue] Inline dispatch failed:', campaignId, err?.message || err);
        });
    });
}

/**
 * Enqueue a campaign for async delivery. Falls back to inline processing when Redis is down.
 */
async function enqueueCampaignSend(campaignId) {
    const id = String(campaignId || '').trim();
    if (!id) {
        throw new Error('Campaign id is required');
    }

    if (isRedisUsable()) {
        try {
            const queue = getBullQueue();
            await queue.add(
                JOB_NAME,
                { campaignId: id },
                {
                    jobId: `campaign-${id}-${Date.now()}`,
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 5000 },
                    removeOnComplete: 100,
                    removeOnFail: 50
                }
            );
            console.log(`[EmailCampaignQueue] Enqueued campaign ${id}`);
            return { mode: 'queue' };
        } catch (err) {
            console.warn('[EmailCampaignQueue] BullMQ enqueue failed, falling back to inline:', err?.message || err);
            scheduleInlineCampaign(id);
            return { mode: 'inline-fallback' };
        }
    }

    scheduleInlineCampaign(id);
    return { mode: 'inline' };
}

module.exports = {
    QUEUE_NAME,
    JOB_NAME,
    enqueueCampaignSend,
    executeCampaignSend,
    isRedisUsable,
    getBullQueue
};
