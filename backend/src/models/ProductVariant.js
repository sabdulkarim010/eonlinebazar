/********************************************************************
 * Project: EonlineBazar — Enterprise PIM
 * File: ProductVariant.js
 * Location: models/ProductVariant.js
 * Description: Reusable variant + N-dimensional attribute schemas for
 * the product matrix (Color × Size × Material × …).
 ********************************************************************/

const mongoose = require('mongoose');

/** One axis in the variant matrix, e.g. Color → [Red, Blue]. */
const variantAttributeDefinitionSchema = new mongoose.Schema({
    name: {
        type: String,
        trim: true,
        required: true
    },
    values: {
        type: [String],
        default: []
    }
}, { _id: false });

/**
 * Sellable SKU row — supports arbitrary N-dimensional attributes,
 * with price/stock overrides at variant level.
 */
const variantSchema = new mongoose.Schema({
    name: {
        type: String,
        trim: true,
        default: ''
    },
    attributes: {
        type: Map,
        of: String,
        default: () => new Map()
    },
    sku: { type: String, trim: true, default: '' },
    price: { type: Number, default: 0 },
    buyingPrice: { type: Number, default: 0 },
    stock: { type: Number, default: 0 },
    image: { type: String, trim: true, default: '' },
    attribute: { type: String, trim: true, default: '' },
    value: { type: String, trim: true, default: '' }
}, { _id: false });

module.exports = {
    variantAttributeDefinitionSchema,
    variantSchema
};
