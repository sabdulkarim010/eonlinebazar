/********************************************************************
 * Project: EonlineBazar
 * File: bulkImportController.js
 * Location: controllers/bulkImportController.js
 * Description: Admin bulk product import and CSV template download.
 ********************************************************************/

const fs = require('fs').promises;
const {
    parseImportFile,
    validateAndTransformRows,
    bulkInsertProducts
} = require('../utils/bulkImportService');
const { invalidateProductCaches } = require('../utils/cacheService');

function escapeCsvCell(value) {
    const str = String(value ?? '');
    if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function buildImportTemplateCsv() {
    const headers = [
        'name',
        'description',
        'price',
        'buyingPrice',
        'stockQuantity',
        'sku',
        'category',
        'brand',
        'lowStockThreshold',
        'weight',
        'tags',
        'status'
    ];

    const exampleRows = [
        [
            'Wireless Earbuds Pro',
            'Premium Bluetooth 5.3 earbuds with noise cancellation',
            1299,
            850,
            50,
            'PROD-EAR-001',
            'Electronics',
            'SoundMax',
            10,
            120,
            'audio,wireless,earbuds',
            'active'
        ],
        [
            'Organic Honey 500g',
            'Pure forest honey collected from Sundarbans',
            450,
            320,
            100,
            'PROD-HNY-500',
            'Grocery',
            'NaturePure',
            5,
            500,
            'organic,food,honey',
            'active'
        ]
    ];

    const lines = [
        headers.join(','),
        ...exampleRows.map(row => row.map(escapeCsvCell).join(','))
    ];

    return `\uFEFF${lines.join('\r\n')}`;
}

/**
 * GET /api/admin/products/import-template
 */
const downloadImportTemplate = (req, res) => {
    const csv = buildImportTemplateCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="product-import-template.csv"');
    res.send(csv);
};

/**
 * POST /api/admin/products/bulk-import
 */
const bulkImportProductsHandler = async (req, res) => {
    let filePath = null;

    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No import file uploaded. Use field name "importFile".'
            });
        }

        filePath = req.file.path;
        const adminId = req.admin?.id || req.adminAccount?._id;

        const rows = await parseImportFile(filePath, req.file.mimetype);
        const { valid, invalid, warnings } = await validateAndTransformRows(rows);
        const insertResult = await bulkInsertProducts(valid, adminId);

        if (insertResult.inserted > 0) {
            await invalidateProductCaches();
        }

        const dbErrors = (insertResult.errors || []).map(err => ({
            row: null,
            data: {},
            errors: [err.message || 'Database insert failed']
        }));

        return res.status(200).json({
            success: true,
            summary: {
                totalRows: rows.length,
                inserted: insertResult.inserted,
                skipped: invalid.length + insertResult.failed,
                warnings: warnings.length
            },
            invalid: [...invalid, ...dbErrors],
            warnings
        });
    } catch (err) {
        console.error('[BulkImport] Failed:', err);
        return res.status(500).json({
            success: false,
            message: err.message || 'Bulk import failed. Please try again.'
        });
    } finally {
        if (filePath) {
            await fs.unlink(filePath).catch(() => {});
        }
    }
};

module.exports = {
    downloadImportTemplate,
    bulkImportProductsHandler
};
