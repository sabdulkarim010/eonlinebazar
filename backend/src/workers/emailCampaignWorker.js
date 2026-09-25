/********************************************************************
 * Project: EonlineBazar — Email Campaign Worker
 * File: emailCampaignWorker.js
 * Description: BullMQ worker that processes email/SMS/WhatsApp campaigns.
 ********************************************************************/

'use strict';

const { QUEUE_NAME, JOB_NAME, executeCampaignSend, isRedisUsable } = require('../queues/emailCampaignQueue');

let bullWorker = null;
let bullWorkerConnection = null;

function startEmailCampaignWorker() {
    if (!isRedisUsable()) {
        console.log('[EmailCampaignWorker] Inline mode — Redis/BullMQ worker not started');
        return;
    }

    if (bullWorker) return;

    const { Worker } = require('bullmq');
    if (!bullWorkerConnection) {
        const { createBullMqConnection } = require('../utils/redisClient');
        bullWorkerConnection = createBullMqConnection();
    }

    bullWorker = new Worker(
        QUEUE_NAME,
        async (job) => {
            const campaignId = job.data?.campaignId;
            if (!campaignId) {
                console.warn('[EmailCampaignWorker] Job missing campaignId:', job.id);
                return;
            }
            await executeCampaignSend(campaignId);
        },
        { connection: bullWorkerConnection, concurrency: 1 }
    );

    bullWorker.on('failed', (job, err) => {
        console.error('[EmailCampaignWorker] Job failed:', job?.id, job?.data?.campaignId, err?.message || err);
    });

    bullWorker.on('completed', (job) => {
        console.log('[EmailCampaignWorker] Job completed:', job?.id, job?.data?.campaignId);
    });

    console.log('[EmailCampaignWorker] BullMQ worker started');
}

module.exports = {
    startEmailCampaignWorker
};
