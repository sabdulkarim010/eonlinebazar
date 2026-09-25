/********************************************************************
 * Project: EonlineBazar — Enterprise PIM
 * File: productPimService.js
 * Description: N-dimensional variant matrix generation and apply helpers.
 ********************************************************************/

'use strict';

const mongoose = require('mongoose');
const Product = require('../models/product');
const {
    cartesianCombinations,
    formatCombinationLabel,
    getCombinationKey,
    applyProductStockFields
} = require('../utils/variantHelpers');
const { recordOutboxEvent } = require('./outboxService');

function slugifyToken(value) {
    return String(value || '')
        .trim()
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toUpperCase();
}

function normalizeAttributeDefinitions(attributes) {
    if (!Array.isArray(attributes)) return [];

    return attributes
        .map((axis) => ({
            name: String(axis?.name || axis?.attribute || '').trim(),
            values: [...new Set(
                (Array.isArray(axis?.values) ? axis.values : [])
                    .map((v) => String(v).trim())
                    .filter(Boolean)
            )]
        }))
        .filter((axis) => axis.name && axis.values.length > 0);
}

/**
 * Calculate Cartesian product of N attribute axes and build variant rows.
 *
 * @param {string|object} productIdOrDoc Mongo id or product document
 * @param {Array<{ name, values[] }>} attributes
 * @param {object} [options]
 */
function generateVariantCombinations(productIdOrDoc, attributes, options = {}) {
    const cleaned = normalizeAttributeDefinitions(attributes);
    const combos = cartesianCombinations(cleaned);
    if (!combos.length) return [];

    const productRef = typeof productIdOrDoc === 'object' ? productIdOrDoc : null;
    const skuPrefix = String(
        options.skuPrefix
        || productRef?.productId
        || productIdOrDoc
        || 'SKU'
    ).trim();

    const defaultPrice = Number(options.defaultPrice ?? productRef?.price) || 0;
    const defaultBuyingPrice = Number(options.defaultBuyingPrice ?? productRef?.buyingPrice) || 0;
    const defaultStock = Number(options.defaultStock) || 0;
    const defaultImage = String(options.defaultImage || productRef?.image || '').trim();

    const existingByKey = new Map();
    if (productRef?.variants) {
        for (const variant of productRef.variants) {
            const attrs = variant.attributes instanceof Map
                ? Object.fromEntries(variant.attributes)
                : (variant.attributes || {});
            if (variant.attribute && variant.value) {
                attrs[variant.attribute] = variant.value;
            }
            existingByKey.set(getCombinationKey(attrs), variant);
        }
    }

    return combos.map((attrs) => {
        const key = getCombinationKey(attrs);
        const existing = existingByKey.get(key);
        const label = formatCombinationLabel(attrs);
        const skuSuffix = Object.values(attrs).map(slugifyToken).filter(Boolean).join('-');
        const generatedSku = `${slugifyToken(skuPrefix)}-${skuSuffix}`.replace(/-+/g, '-');

        return {
            name: existing?.name || label,
            attributes: attrs,
            sku: String(existing?.sku || generatedSku).trim(),
            price: Number(existing?.price ?? defaultPrice) || defaultPrice,
            buyingPrice: Number(existing?.buyingPrice ?? defaultBuyingPrice) || defaultBuyingPrice,
            stock: Number(existing?.stock ?? defaultStock) || defaultStock,
            image: String(existing?.image || defaultImage).trim()
        };
    });
}

async function loadProductForPim(productId) {
    if (!mongoose.Types.ObjectId.isValid(String(productId))) {
        throw new Error('Invalid product id.');
    }
    const product = await Product.findById(productId);
    if (!product) throw new Error('Product not found.');
    return product;
}

async function previewVariantMatrix(productId, attributes, options = {}) {
    const product = await loadProductForPim(productId);
    const matrixDefinition = normalizeAttributeDefinitions(
        attributes || product.variantMatrixDefinition
    );

    const variants = generateVariantCombinations(product, matrixDefinition, options);
    return {
        productId: String(product._id),
        productSku: product.productId,
        matrixDefinition,
        combinationCount: variants.length,
        variants
    };
}

async function applyVariantMatrix(productId, attributes, options = {}) {
    const product = await loadProductForPim(productId);
    const matrixDefinition = normalizeAttributeDefinitions(
        attributes || product.variantMatrixDefinition
    );

    if (!matrixDefinition.length) {
        throw new Error('At least one attribute axis with values is required.');
    }

    const variants = generateVariantCombinations(product, matrixDefinition, options);
    product.variantMatrixDefinition = matrixDefinition;
    product.variants = variants;
    product.hasVariants = variants.length > 0;

    const payload = applyProductStockFields(product.toObject());
    product.stock = payload.stock;
    product.stockQuantity = payload.stockQuantity;
    product.price = payload.price;
    product.buyingPrice = payload.buyingPrice;

    await product.save();

    await recordOutboxEvent('VARIANT_MATRIX_APPLIED', {
        productId: String(product._id),
        productSku: product.productId,
        combinationCount: variants.length
    });

    return {
        product,
        matrixDefinition,
        combinationCount: variants.length,
        variants
    };
}

module.exports = {
    generateVariantCombinations,
    normalizeAttributeDefinitions,
    previewVariantMatrix,
    applyVariantMatrix
};
