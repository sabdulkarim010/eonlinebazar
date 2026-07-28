/********************************************************************
 * Project: EonlineBazar
 * File: product.js
 * Location: models/product.js
 * Description: Product Schema supporting multiple images, stock limits, 
 * built-in tracking for product ratings, total reviews, and customer review array.
 * Supports Simple Products and Combination Variant Products (SKU matrix).
 ********************************************************************/

const mongoose = require('mongoose');

/**
 * Combination variant row (Amazon/Shopify-style matrix).
 * Each row is one sellable SKU with its own attributes map, price, and stock.
 */
const variantSchema = new mongoose.Schema({
    /** Human-readable combination label, e.g. "Size: S | Color: Pink" */
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
    sku:       { type: String, trim: true, default: '' },
    price:     { type: Number, default: 0 },
    buyingPrice: { type: Number, default: 0 },
    stock:     { type: Number, default: 0 },
    image:     { type: String, trim: true, default: '' },

    // Legacy flat fields — kept for backward compatibility when reading old docs
    attribute: { type: String, trim: true, default: '' },
    value:     { type: String, trim: true, default: '' }
}, { _id: false });

const productSchema = new mongoose.Schema({
    productId: { 
        type: String, 
       // required: true, 
        unique: true 
    },
    name: { 
        type: String, 
       // required: true 
    },
    price: { 
        type: Number, 
        required: true 
    },
    buyingPrice: { 
        type: Number, 
        default: 0 
    },
    category: { 
        type: String, 
        default: 'General' 
    },
    brand: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Brand',
        default: null
    },
    brandName: {
        type: String,
        default: ''
    },

    /** True when product uses combination variant matrix; false for simple products. */
    hasVariants: {
        type: Boolean,
        default: false
    },

    /** Primary stock for simple products (hasVariants === false). */
    stockQuantity: {
        type: Number,
        default: 0
    },

    /** Total available stock — equals stockQuantity for simple products, or sum of variant stocks. */
    stock: { 
        type: Number, 
        default: 0 
    },

    variants: {
        type: [variantSchema],
        default: []
    },
    description: { 
        type: String, 
        default: '' 
    },
    detailedDescription: {
        type: String,
        default: ''
    },
    highlights: { 
        type: [String], 
        default: [] 
    },
    tags: {
        type: [String],
        default: []
    },
    icon: { 
        type: String, 
        default: '📦' 
    },
    image: { 
        type: String, 
        default: '' 
    },
    images: {
        type: [String],
        default: []
    },
    rating: {
        type: Number,
        default: 0
    },
    numOfReviews: {
        type: Number,
        default: 0
    },
    reviews: [
        {
            user: { 
                type: mongoose.Schema.Types.ObjectId, 
                ref: 'User', 
                required: true 
            },
            name: { 
                type: String, 
                required: true 
            },
            rating: { 
                type: Number, 
                required: true 
            },
            comment: { 
                type: String, 
                required: true 
            },
            createdAt: { 
                type: Date, 
                default: Date.now 
            }
        }
    ]
}, { timestamps: true });

productSchema.index(
    {
        name: 'text',
        tags: 'text',
        brandName: 'text',
        category: 'text',
        highlights: 'text',
        description: 'text',
        detailedDescription: 'text'
    },
    {
        name: 'ProductTextIndex',
        default_language: 'english',
        weights: {
            name: 10,
            tags: 8,
            brandName: 6,
            category: 5,
            highlights: 3,
            description: 2,
            detailedDescription: 1
        }
    }
);

productSchema.index({ category: 1 });
productSchema.index({ slug: 1 }, { sparse: true });

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);
