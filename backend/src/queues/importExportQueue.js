/********************************************************************
 * Project: EonlineBazar — Async Import/Export Queue
 * File: importExportQueue.js
 * Description: BullMQ workers for heavy bulk import/export tasks with
 * Mongo-backed job status and inline fallback when Redis is unavailable.
 ********************************************************************/

'use strict';

const fs = require('fs').promises;
const path = require('path');
const BackgroundJob = require('../models/BackgroundJob');
const Product = require('../models/product');
const {
    parseImportFile,
    validateAndTransformRows,
    bulkInsertProducts
} = require('../services/bulkImportService');
const { invalidateProductCaches } = require('../services/cacheService');
const { recordOutboxEvent } = require('../services/outboxService');

const QUEUE_NAME = 'import-export';
const EXPORT_DIR = path.join(__dirname, '..', '..', 'uploads', 'exports');

let bullQueue = null;
let bullWorker = null;
let bullQueueConnection = null;
let bullWorkerConnection = null;

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

async function ensureExportDir() {
    await fs.mkdir(EXPORT_DIR, { recursive: true });
}

async function updateJob(jobId, patch) {
    return BackgroundJob.findByIdAndUpdate(jobId, patch, { new: true });
}

async function processBulkImportJob(jobDoc) {
    const filePath = jobDoc.payload?.filePath;
    const mimetype = jobDoc.payload?.mimetype;
    const adminId = jobDoc.payload?.adminId;

    await updateJob(jobDoc._id, { status: 'processing', progress: 5, startedAt: new Date() });

    const rows = await parseImportFile(filePath, mimetype);
    await updateJob(jobDoc._id, { progress: 35 });

    const { valid, invalid, warnings } = await validateAndTransformRows(rows);
    await updateJob(jobDoc._id, { progress: 60 });

    const insertResult = await bulkInsertProducts(valid, adminId);
    if (insertResult.inserted > 0) {
        await invalidateProductCaches();
        await recordOutboxEvent('PRODUCT_CREATED', {
            source: 'BULK_IMPORT',
            inserted: insertResult.inserted
        });
    }

    await updateJob(jobDoc._id, {
        status: 'completed',
        progress: 100,
        completedAt: new Date(),
        result: {
            totalRows: rows.length,
            inserted: insertResult.inserted,
            skipped: invalid.length + insertResult.failed,
            warnings: warnings.length,
            invalid: invalid.slice(0, 50)
        }
    });

    if (filePath) {
        await fs.unlink(filePath).catch(() => {});
    }
}

async function processProductExportJob(jobDoc) {
    await updateJob(jobDoc._id, { status: 'processing', progress: 10, startedAt: new Date() });
    await ensureExportDir();

    const products = await Product.find({})
        .sort({ createdAt: -1 })
        .limit(10000)
        .lean();

    await updateJob(jobDoc._id, { progress: 55 });

    const lines = [
        'Product ID,Name,Category,Sell Price,Buy Price,Stock,Status'
    ];

    for (const product of products) {
        lines.push([
            product.productId || String(product._id),
            `"${String(product.name || '').replace(/"/g, '""')}"`,
            product.category || '',
            product.price ?? '',
            product.buyingPrice ?? '',
            product.stockQuantity ?? product.stock ?? 0,
            product.status || 'active'
        ].join(','));
    }

    const filename = `products-export-${jobDoc._id}-${Date.now()}.csv`;
    const absolutePath = path.join(EXPORT_DIR, filename);
    await fs.writeFile(absolutePath, `\uFEFF${lines.join('\r\n')}`, 'utf8');

    const resultUrl = `/api/admin/jobs/${jobDoc._id}/download`;

    await updateJob(jobDoc._id, {
        status: 'completed',
        progress: 100,
        completedAt: new Date(),
        resultUrl,
        result: {
            rowCount: products.length,
            filename,
            absolutePath
        }
    });
}

async function executeJob(jobId) {
    const jobDoc = await BackgroundJob.findById(jobId);
    if (!jobDoc) return;

    try {
        if (jobDoc.type === 'BULK_PRODUCT_IMPORT') {
            await processBulkImportJob(jobDoc);
        } else if (jobDoc.type === 'PRODUCT_EXPORT_CSV') {
            await processProductExportJob(jobDoc);
        } else {
            await updateJob(jobId, {
                status: 'failed',
                errorMessage: `Unsupported job type: ${jobDoc.type}`,
                completedAt: new Date()
            });
        }
    } catch (err) {
        await updateJob(jobId, {
            status: 'failed',
            progress: 100,
            errorMessage: err.message || String(err),
            completedAt: new Date()
        });
        throw err;
    }
}

function scheduleInlineJob(jobId) {
    setImmediate(() => {
        executeJob(jobId).catch((err) => {
            console.error('[ImportExportQueue] Inline job failed:', err.message || err);
        });
    });
}

async function enqueueJob(type, payload = {}, createdBy = null) {
    const jobDoc = await BackgroundJob.create({
        type,
        status: 'pending',
        progress: 0,
        payload,
        createdBy
    });

    if (isRedisUsable()) {
        try {
            const queue = getBullQueue();
            await queue.add(type, { jobId: String(jobDoc._id) }, {
                removeOnComplete: 100,
                removeOnFail: 50
            });
        } catch (err) {
            console.warn('[ImportExportQueue] BullMQ enqueue failed, falling back to inline:', err?.message || err);
            scheduleInlineJob(jobDoc._id);
        }
    } else {
        scheduleInlineJob(jobDoc._id);
    }

    return jobDoc;
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

function startImportExportWorker() {
    if (!isRedisUsable()) {
        console.log('[ImportExportQueue] Inline mode — Redis/BullMQ worker not started');
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
            const jobId = job.data?.jobId;
            if (!jobId) return;
            await executeJob(jobId);
        },
        { connection: bullWorkerConnection, concurrency: 2 }
    );

    bullWorker.on('failed', (job, err) => {
        console.error('[ImportExportQueue] BullMQ job failed:', job?.id, err?.message || err);
    });

    console.log('[ImportExportQueue] BullMQ worker started');
}

async function getJobStatus(jobId) {
    return BackgroundJob.findById(jobId).lean();
}

async function resolveJobDownloadPath(jobId) {
    const job = await BackgroundJob.findById(jobId).lean();
    if (!job || job.status !== 'completed') return null;
    return job.result?.absolutePath || null;
}

module.exports = {
    enqueueJob,
    executeJob,
    getJobStatus,
    resolveJobDownloadPath,
    startImportExportWorker,
    EXPORT_DIR
};
