/********************************************************************
 * Project: EonlineBazar — Enterprise PIM
 * File: pimController.js
 * Description: N-dimensional variant matrix preview/apply + async jobs.
 ********************************************************************/

const fs = require('fs').promises;
const path = require('path');
const {
    previewVariantMatrix,
    applyVariantMatrix,
    generateVariantCombinations,
    normalizeAttributeDefinitions
} = require('../../services/productPimService');
const { listOutboxEvents, dispatchPendingOutboxEvents } = require('../../services/outboxService');
const {
    enqueueJob,
    getJobStatus,
    resolveJobDownloadPath
} = require('../../queues/importExportQueue');
const {
    parseImportFile,
    validateAndTransformRows
} = require('../../services/bulkImportService');

exports.previewMatrix = async (req, res) => {
    try {
        const { id } = req.params;
        const preview = await previewVariantMatrix(id, req.body?.attributes, {
            defaultPrice: req.body?.defaultPrice,
            defaultBuyingPrice: req.body?.defaultBuyingPrice,
            defaultStock: req.body?.defaultStock,
            skuPrefix: req.body?.skuPrefix
        });

        return res.json({ success: true, data: preview });
    } catch (err) {
        const status = err.message.includes('not found') ? 404 : 400;
        return res.status(status).json({ success: false, message: err.message });
    }
};

exports.applyMatrix = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await applyVariantMatrix(id, req.body?.attributes, {
            defaultPrice: req.body?.defaultPrice,
            defaultBuyingPrice: req.body?.defaultBuyingPrice,
            defaultStock: req.body?.defaultStock,
            skuPrefix: req.body?.skuPrefix
        });

        return res.json({
            success: true,
            message: `Applied ${result.combinationCount} variant combination(s).`,
            data: {
                productId: String(result.product._id),
                combinationCount: result.combinationCount,
                matrixDefinition: result.matrixDefinition,
                variants: result.variants
            }
        });
    } catch (err) {
        const status = err.message.includes('not found') ? 404 : 400;
        return res.status(status).json({ success: false, message: err.message });
    }
};

exports.generateCombinations = async (req, res) => {
    try {
        const attributes = normalizeAttributeDefinitions(req.body?.attributes);
        const variants = generateVariantCombinations(req.body?.productId || 'SKU', attributes, {
            skuPrefix: req.body?.skuPrefix,
            defaultPrice: req.body?.defaultPrice,
            defaultBuyingPrice: req.body?.defaultBuyingPrice,
            defaultStock: req.body?.defaultStock
        });

        return res.json({
            success: true,
            data: {
                combinationCount: variants.length,
                variants
            }
        });
    } catch (err) {
        return res.status(400).json({ success: false, message: err.message });
    }
};

exports.enqueueBulkImport = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No import file uploaded. Use field name "importFile".'
            });
        }

        const job = await enqueueJob('BULK_PRODUCT_IMPORT', {
            filePath: req.file.path,
            mimetype: req.file.mimetype,
            originalName: req.file.originalname,
            adminId: req.adminId || req.adminAccount?._id || null
        }, req.adminId || null);

        return res.status(202).json({
            success: true,
            message: 'Bulk import queued.',
            data: {
                jobId: String(job._id),
                status: job.status,
                progress: job.progress
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message || 'Failed to queue import.' });
    }
};

exports.enqueueProductExport = async (req, res) => {
    try {
        const format = String(req.body?.format || 'csv').toLowerCase();
        const jobType = format === 'xlsx' ? 'PRODUCT_EXPORT_XLSX' : 'PRODUCT_EXPORT_CSV';

        const job = await enqueueJob(jobType, { format }, req.adminId || null);

        return res.status(202).json({
            success: true,
            message: 'Product export queued.',
            data: {
                jobId: String(job._id),
                status: job.status,
                progress: job.progress
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message || 'Failed to queue export.' });
    }
};

exports.getJobStatus = async (req, res) => {
    try {
        const job = await getJobStatus(req.params.jobId);
        if (!job) {
            return res.status(404).json({ success: false, message: 'Job not found.' });
        }

        return res.json({
            success: true,
            data: {
                jobId: String(job._id),
                type: job.type,
                status: job.status,
                progress: job.progress,
                result: job.result,
                resultUrl: job.resultUrl || null,
                errorMessage: job.errorMessage || '',
                createdAt: job.createdAt,
                startedAt: job.startedAt,
                completedAt: job.completedAt
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

exports.downloadJobResult = async (req, res) => {
    try {
        const filePath = await resolveJobDownloadPath(req.params.jobId);
        if (!filePath) {
            return res.status(404).json({ success: false, message: 'Export file not ready.' });
        }

        const filename = path.basename(filePath);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.sendFile(path.resolve(filePath));
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

exports.listOutbox = async (req, res) => {
    try {
        const events = await listOutboxEvents({
            status: req.query.status,
            eventType: req.query.eventType,
            limit: req.query.limit
        });
        return res.json({ success: true, data: events });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

exports.dispatchOutbox = async (req, res) => {
    try {
        const summary = await dispatchPendingOutboxEvents(req.body?.limit);
        return res.json({ success: true, data: summary });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
