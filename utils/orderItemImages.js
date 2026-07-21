const mongoose = require('mongoose');
const Product = require('../models/product');

const GENERIC_EMOJI_ICONS = new Set(['📦', '']);

function isValidImagePath(value) {
    if (!value) return false;
    const v = String(value).trim();
    if (!v) return false;
    const lower = v.toLowerCase();
    if (lower.startsWith('http://') || lower.startsWith('https://')) return true;
    if (lower.startsWith('/uploads/')) return true;
    if (/\.(jpg|jpeg|png|webp|gif|svg|heic)(\?.*)?$/i.test(lower)) return true;
    if ((lower.startsWith('/') || lower.startsWith('products/') || lower.startsWith('uploads/')) &&
        /\.(jpg|jpeg|png|webp|gif|svg|heic)/i.test(lower)) {
        return true;
    }
    return false;
}

function isSpecificEmoji(value) {
    const v = String(value || '').trim();
    if (!v || GENERIC_EMOJI_ICONS.has(v)) return false;
    return v.length <= 8 && !/[\\/.]/.test(v);
}

/**
 * Resolve the best available image path/url for an order line item.
 */
function pickImageFromSources(item = {}, product = null) {
    const candidates = [
        item.image,
        item.imageUrl,
        item.products,
        item.productImage,
        item.product && item.product.image,
        item.product && item.product.imageUrl,
        Array.isArray(item.images) ? item.images[0] : '',
        product && product.image,
        product && product.imageUrl,
        product && Array.isArray(product.images) ? product.images[0] : ''
    ];

    for (const candidate of candidates) {
        const value = String(candidate || '').trim();
        if (value && isValidImagePath(value)) return value;
    }
    return '';
}

function pickEmojiFromSources(item = {}, product = null) {
    const candidates = [
        item.emoji,
        item.icon,
        item.product && item.product.emoji,
        item.product && item.product.icon,
        product && product.emoji,
        product && product.icon
    ];

    for (const candidate of candidates) {
        if (isSpecificEmoji(candidate)) return String(candidate).trim();
    }
    return '';
}

function buildProductMediaRef(product, resolvedImage, resolvedEmoji) {
    if (!product) return null;

    const image = resolvedImage ||
        pickImageFromSources({}, product) ||
        String(product.image || '').trim();
    const imageUrl = String(product.imageUrl || image || '').trim();
    const emoji = resolvedEmoji || pickEmojiFromSources({}, product);

    return {
        _id: product._id,
        productId: product.productId || String(product._id || ''),
        name: product.name || '',
        image,
        imageUrl: imageUrl || image,
        emoji,
        icon: emoji || (isSpecificEmoji(product.icon) ? product.icon : ''),
        images: Array.isArray(product.images) ? product.images : []
    };
}

function buildItemLookupQueries(items = []) {
    const objectIds = new Set();
    const productIds = new Set();

    for (const item of items) {
        const targetId = item.id || item.productId || item._id;
        if (!targetId) continue;

        const idStr = String(targetId);
        if (mongoose.Types.ObjectId.isValid(idStr)) {
            objectIds.add(idStr);
        }
        productIds.add(idStr);
    }

    const orClauses = [];
    if (objectIds.size > 0) {
        orClauses.push({ _id: { $in: [...objectIds] } });
    }
    if (productIds.size > 0) {
        orClauses.push({ productId: { $in: [...productIds] } });
    }

    return orClauses;
}

function indexProducts(products = []) {
    const map = new Map();

    for (const product of products) {
        if (product._id) map.set(String(product._id), product);
        if (product.productId) map.set(String(product.productId), product);
    }

    return map;
}

function resolveProductForItem(item, productMap) {
    const targetId = item.id || item.productId || item._id;
    if (!targetId) return null;
    return productMap.get(String(targetId)) || null;
}

function applyItemMediaFields(item, product) {
    const resolvedImage = pickImageFromSources(item, product);
    const resolvedEmoji = pickEmojiFromSources(item, product);

    if (resolvedImage) {
        item.image = resolvedImage;
        item.imageUrl = resolvedImage;
    }

    if (resolvedEmoji) {
        item.emoji = resolvedEmoji;
        item.icon = resolvedEmoji;
    }

    item.product = buildProductMediaRef(product, resolvedImage, resolvedEmoji);

    return item;
}

async function loadProductsForItems(items = []) {
    const orClauses = buildItemLookupQueries(items);
    if (orClauses.length === 0) return new Map();

    const products = await Product.find({ $or: orClauses })
        .select('name image imageUrl images icon productId')
        .lean();

    return indexProducts(products);
}

async function enrichOrderItemsWithImages(orderObj) {
    if (!orderObj || !Array.isArray(orderObj.items) || orderObj.items.length === 0) {
        return orderObj;
    }

    const productMap = await loadProductsForItems(orderObj.items);

    for (const item of orderObj.items) {
        const product = resolveProductForItem(item, productMap);
        applyItemMediaFields(item, product);
    }

    return orderObj;
}

async function enrichOrdersWithImages(orders = []) {
    if (!Array.isArray(orders) || orders.length === 0) return [];

    const plainOrders = orders.map((order) => (
        order && typeof order.toObject === 'function' ? order.toObject() : { ...order }
    ));

    const allItems = plainOrders.flatMap((order) => order.items || []);
    const productMap = await loadProductsForItems(allItems);

    for (const order of plainOrders) {
        if (!Array.isArray(order.items)) continue;
        for (const item of order.items) {
            const product = resolveProductForItem(item, productMap);
            applyItemMediaFields(item, product);
        }
    }

    return plainOrders;
}

module.exports = {
    isValidImagePath,
    isSpecificEmoji,
    pickImageFromSources,
    pickEmojiFromSources,
    buildProductMediaRef,
    applyItemMediaFields,
    enrichOrderItemsWithImages,
    enrichOrdersWithImages
};
