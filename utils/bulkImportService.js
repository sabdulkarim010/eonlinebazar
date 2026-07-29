/********************************************************************
 * Project: EonlineBazar
 * File: bulkImportService.js
 * Location: utils/bulkImportService.js
 * Description: Parse CSV/Excel uploads, validate rows, and bulk-insert products.
 ********************************************************************/

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const Product = require('../models/product');
const Category = require('../models/category');
const Brand = require('../models/brand');
const { applyProductStockFields } = require('./variantHelpers');

function isExcelFile(mimetype, filePath) {
    const mime = String(mimetype || '').toLowerCase();
    const ext = path.extname(String(filePath || '')).toLowerCase();
    return (
        mime.includes('excel') ||
        mime.includes('spreadsheetml') ||
        ext === '.xlsx' ||
        ext === '.xls'
    );
}

function isCsvFile(mimetype, filePath) {
    const mime = String(mimetype || '').toLowerCase();
    const ext = path.extname(String(filePath || '')).toLowerCase();
    return mime === 'text/csv' || mime.includes('csv') || ext === '.csv';
}

function parseCsvFile(filePath) {
    return new Promise((resolve, reject) => {
        const rows = [];
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => rows.push(row))
            .on('end', () => resolve(rows))
            .on('error', reject);
    });
}

function parseExcelFile(filePath) {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];
    const sheet = workbook.Sheets[sheetName];
    return xlsx.utils.sheet_to_json(sheet, { defval: '' });
}

/**
 * A) Read and parse an uploaded import file.
 * @param {string} filePath
 * @param {string} mimetype
 * @returns {Promise<Array<Object>>}
 */
async function parseImportFile(filePath, mimetype) {
    if (!filePath) {
        throw new Error('No file path provided.');
    }

    if (isExcelFile(mimetype, filePath)) {
        return parseExcelFile(filePath);
    }

    if (isCsvFile(mimetype, filePath)) {
        return parseCsvFile(filePath);
    }

    throw new Error('Unsupported file type. Please upload a .csv, .xlsx, or .xls file.');
}

function normalizeRowKeys(row) {
    const normalized = {};
    if (!row || typeof row !== 'object') return normalized;

    Object.entries(row).forEach(([key, value]) => {
        const cleanKey = String(key || '').trim().toLowerCase();
        if (!cleanKey) return;
        if (value === null || value === undefined) {
            normalized[cleanKey] = '';
        } else if (typeof value === 'string') {
            normalized[cleanKey] = value.trim();
        } else {
            normalized[cleanKey] = value;
        }
    });

    return normalized;
}

function parseNumber(value) {
    if (value === null || value === undefined || value === '') return NaN;
    if (typeof value === 'number') return value;
    const cleaned = String(value).replace(/,/g, '').trim();
    if (!cleaned) return NaN;
    return Number(cleaned);
}

function parseTags(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
        return value.map(v => String(v).trim()).filter(Boolean);
    }
    return String(value)
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
}

function parseStatus(value) {
    const token = String(value || '').trim().toLowerCase();
    if (!token || token === 'active') return 'active';
    if (token === 'inactive') return 'inactive';
    return null;
}

function buildLookupMap(docs, field = 'name') {
    const map = new Map();
    docs.forEach(doc => {
        const key = String(doc[field] || '').trim().toLowerCase();
        if (key && !map.has(key)) map.set(key, doc);
    });
    return map;
}

/**
 * B) Validate each row and transform to Product documents.
 * @param {Array<Object>} rows
 * @returns {Promise<{ valid: Object[], invalid: Object[], warnings: Object[] }>}
 */
async function validateAndTransformRows(rows) {
    const valid = [];
    const invalid = [];
    const warnings = [];

    if (!Array.isArray(rows) || rows.length === 0) {
        return { valid, invalid, warnings };
    }

    const [categories, brands] = await Promise.all([
        Category.find({}).select('name').lean(),
        Brand.find({}).select('name').lean()
    ]);

    const categoryMap = buildLookupMap(categories);
    const brandMap = buildLookupMap(brands);

    rows.forEach((rawRow, index) => {
        const rowNum = index + 2; // header is row 1
        const row = normalizeRowKeys(rawRow);
        const errors = [];
        const rowWarnings = [];

        const name = row.name || row.productname || '';
        const description = row.description || '';
        const priceRaw = row.price ?? row.sellprice ?? row['sell price'];
        const buyingPriceRaw = row.buyingprice ?? row.buyprice ?? row['buy price'];
        const stockRaw = row.stockquantity ?? row.stock ?? row.qty ?? row.quantity;
        const sku = row.sku || row.productid || row.id || '';
        const categoryName = row.category || '';
        const brandName = row.brand || '';
        const lowStockRaw = row.lowstockthreshold ?? row.lowstock ?? row.threshold;
        const weightRaw = row.weight;
        const tagsRaw = row.tags;
        const statusRaw = row.status;

        if (!name) errors.push('name is required');
        if (!String(priceRaw ?? '').trim() && priceRaw !== 0) {
            errors.push('price is required');
        }
        if (!String(stockRaw ?? '').trim() && stockRaw !== 0) {
            errors.push('stockQuantity is required');
        }

        const price = parseNumber(priceRaw);
        const stockQuantity = parseNumber(stockRaw);

        if (String(priceRaw ?? '').trim() !== '' && (Number.isNaN(price) || price <= 0)) {
            errors.push('price must be a positive number');
        }
        if (String(stockRaw ?? '').trim() !== '' && (Number.isNaN(stockQuantity) || stockQuantity < 0)) {
            errors.push('stockQuantity must be a number >= 0');
        }

        let buyingPrice = 0;
        if (String(buyingPriceRaw ?? '').trim() !== '') {
            buyingPrice = parseNumber(buyingPriceRaw);
            if (Number.isNaN(buyingPrice) || buyingPrice < 0) {
                errors.push('buyingPrice must be a non-negative number');
            }
        }

        let lowStockThreshold = 10;
        if (String(lowStockRaw ?? '').trim() !== '') {
            lowStockThreshold = parseNumber(lowStockRaw);
            if (Number.isNaN(lowStockThreshold) || lowStockThreshold < 0) {
                errors.push('lowStockThreshold must be a non-negative number');
            }
        }

        let weight = null;
        if (String(weightRaw ?? '').trim() !== '') {
            weight = parseNumber(weightRaw);
            if (Number.isNaN(weight) || weight < 0) {
                errors.push('weight must be a non-negative number (grams)');
            }
        }

        const status = parseStatus(statusRaw);
        if (statusRaw && status === null) {
            errors.push("status must be 'active' or 'inactive'");
        }

        if (errors.length > 0) {
            invalid.push({ row: rowNum, data: rawRow, errors });
            return;
        }

        let resolvedCategory = 'General';
        if (categoryName) {
            const catDoc = categoryMap.get(categoryName.toLowerCase());
            if (catDoc) {
                resolvedCategory = catDoc.name;
            } else {
                resolvedCategory = null;
                rowWarnings.push(`Category "${categoryName}" not found, skipped`);
            }
        }

        let brand = null;
        let resolvedBrandName = '';
        if (brandName) {
            const brandDoc = brandMap.get(brandName.toLowerCase());
            if (brandDoc) {
                brand = brandDoc._id;
                resolvedBrandName = brandDoc.name;
            } else {
                rowWarnings.push(`Brand "${brandName}" not found, skipped`);
            }
        }

        const productId = sku || `PROD-${Date.now()}-${index}`;

        const productDoc = applyProductStockFields({
            productId,
            name,
            description,
            price,
            buyingPrice: buyingPrice || 0,
            stockQuantity,
            lowStockThreshold,
            category: resolvedCategory || 'General',
            brand,
            brandName: resolvedBrandName,
            hasVariants: false,
            variants: [],
            tags: parseTags(tagsRaw),
            status: status || 'active',
            weight,
            icon: '📦',
            images: [],
            image: ''
        });

        valid.push(productDoc);

        rowWarnings.forEach(message => {
            warnings.push({ row: rowNum, message });
        });
    });

    return { valid, invalid, warnings };
}

/**
 * C) Insert validated products with ordered: false.
 * @param {Array<Object>} validProducts
 * @param {import('mongoose').Types.ObjectId|string} adminId
 */
async function bulkInsertProducts(validProducts, adminId) {
    if (!Array.isArray(validProducts) || validProducts.length === 0) {
        return { inserted: 0, failed: 0, errors: [] };
    }

    const docs = validProducts.map(product => ({
        ...product,
        createdBy: adminId || null
    }));

    try {
        const insertedDocs = await Product.insertMany(docs, { ordered: false });
        return {
            inserted: insertedDocs.length,
            failed: 0,
            errors: []
        };
    } catch (err) {
        const inserted = Array.isArray(err.insertedDocs) ? err.insertedDocs.length : 0;
        const writeErrors = Array.isArray(err.writeErrors) ? err.writeErrors : [];

        if (writeErrors.length > 0 || inserted > 0) {
            return {
                inserted,
                failed: writeErrors.length,
                errors: writeErrors.map(w => ({
                    index: w.index,
                    message: w.errmsg || w.message || 'Insert failed'
                }))
            };
        }

        throw err;
    }
}

module.exports = {
    parseImportFile,
    validateAndTransformRows,
    bulkInsertProducts
};
