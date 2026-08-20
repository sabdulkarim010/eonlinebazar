/********************************************************************
 * Project: EonlineBazar
 * File: cartMergeService.js
 * Location: services/cartMergeService.js
 * Description: Shared guest → user cart merge logic (login + API).
 ********************************************************************/

const Cart = require('../models/cart');

function isColorKey(name) {
    const n = String(name || '').trim().toLowerCase();
    return n === 'color' || n === 'colour';
}

function isSizeKey(name) {
    return String(name || '').trim().toLowerCase() === 'size';
}

function attrsToPlainObject(raw) {
    if (!raw || typeof raw !== 'object') return {};
    if (raw instanceof Map) {
        const out = {};
        raw.forEach((v, k) => { out[String(k)] = String(v); });
        return out;
    }
    const out = {};
    Object.entries(raw).forEach(([k, v]) => { out[String(k)] = String(v); });
    return out;
}

function extractColorSize(src = {}, attrs = {}) {
    let selectedColor = String(src.selectedColor || '').trim();
    let selectedSize = String(src.selectedSize || '').trim();
    const plain = attrsToPlainObject(attrs);

    Object.entries(plain).forEach(([k, v]) => {
        const val = String(v || '').trim();
        if (!val) return;
        if (isColorKey(k) && !selectedColor) selectedColor = val;
        if (isSizeKey(k) && !selectedSize) selectedSize = val;
    });

    if (!selectedColor && !selectedSize) {
        const label = String(src.variantLabel || '').trim();
        if (label) {
            label.split(/\||,/).map(s => s.trim()).filter(Boolean).forEach(pair => {
                const idx = pair.indexOf(':');
                if (idx === -1) return;
                const key = pair.slice(0, idx).trim();
                const val = pair.slice(idx + 1).trim();
                if (isColorKey(key) && !selectedColor) selectedColor = val;
                if (isSizeKey(key) && !selectedSize) selectedSize = val;
            });
        }
    }

    return { selectedColor, selectedSize };
}

function normalizeVariant(src = {}) {
    if (src.selectedVariant && typeof src.selectedVariant === 'object') {
        const sv = src.selectedVariant;
        const attrs = sv.attributes && typeof sv.attributes === 'object' ? attrsToPlainObject(sv.attributes) : {};
        const attrPairs = Object.entries(attrs).map(([k, v]) => `${k}: ${v}`).join(', ');
        const sku = String(sv.sku || src.variantSku || src.sku || '').trim();
        let variantId = String(sv.variantId || src.variantId || '').trim();
        if (!variantId) {
            variantId = sku || getCombinationKeyFromAttrs(attrs);
        }
        const variantLabel = String(src.variantLabel || '').trim() || attrPairs;
        const colorSize = extractColorSize(src, attrs);
        return {
            variantId,
            variantLabel,
            variantAttribute: attrPairs || String(src.variantAttribute || '').trim(),
            variantValue: Object.values(attrs).join(', ') || String(src.variantValue || '').trim(),
            variantSku: sku,
            ...colorSize
        };
    }

    const attribute = String(src.variantAttribute || src.attribute || '').trim();
    const value = String(src.variantValue || src.value || '').trim();
    const sku = String(src.variantSku || src.sku || '').trim();
    let variantId = String(src.variantId || '').trim();
    if (!variantId && (attribute || value || sku)) {
        variantId = sku || `${attribute}::${value}`;
    }
    const variantLabel = String(src.variantLabel || '').trim() ||
        (attribute && value ? `${attribute}: ${value}` : (value || ''));
    const colorSize = extractColorSize(src, {
        ...(isColorKey(attribute) ? { [attribute]: value } : {}),
        ...(isSizeKey(attribute) ? { [attribute]: value } : {})
    });
    return { variantId, variantLabel, variantAttribute: attribute, variantValue: value, variantSku: sku, ...colorSize };
}

function getCombinationKeyFromAttrs(attributes) {
    return Object.entries(attributes || {})
        .map(([k, v]) => `${String(k).trim().toLowerCase()}=${String(v).trim().toLowerCase()}`)
        .sort()
        .join('|');
}

function isSameLine(dbItem, productId, variantId) {
    return String(dbItem.productId) === String(productId) &&
        String(dbItem.variantId || '') === String(variantId || '');
}

function buildCartItem(item) {
    const variant = normalizeVariant(item);
    const productId = item.id || item.productId;
    if (!productId) return null;

    const displayImage = String(
        item.selectedImage
        || item.variantImage
        || item.image
        || item.products
        || (item.selectedVariant && item.selectedVariant.image)
        || ''
    ).trim();
    const displayIcon = item.emojiIcon || item.icon || '';

    return {
        productId,
        name: item.name,
        price: Number(item.price) || 0,
        image: displayImage,
        variantImage: displayImage,
        icon: displayIcon,
        emojiIcon: displayIcon,
        quantity: Math.max(1, Number(item.quantity) || 1),
        selected: item.selected !== false,
        ...variant
    };
}

/**
 * Normalize guest cart payload from login body, merge API, or session store.
 */
function normalizeGuestCartItems(rawItems) {
    if (!rawItems) return [];
    const list = Array.isArray(rawItems) ? rawItems : [];
    return list
        .map(buildCartItem)
        .filter(Boolean);
}

/**
 * Merge guest items into the authenticated user's DB cart (variant-aware).
 * Returns the saved Cart document.
 */
async function mergeGuestCartIntoUserCart(userId, guestItems = []) {
    const cartItems = normalizeGuestCartItems(guestItems);
    if (!userId || cartItems.length === 0) {
        const existing = await Cart.findOne({ userId });
        return existing || { userId, items: [] };
    }

    let userCart = await Cart.findOne({ userId });

    if (!userCart) {
        userCart = new Cart({ userId, items: cartItems });
    } else {
        cartItems.forEach((localItem) => {
            const localId = localItem.productId;
            const existingItem = userCart.items.find((dbItem) =>
                isSameLine(dbItem, localId, localItem.variantId)
            );
            if (existingItem) {
                existingItem.quantity += localItem.quantity;
                if (localItem.image) {
                    existingItem.image = localItem.image;
                    existingItem.variantImage = localItem.variantImage || localItem.image;
                }
                if (localItem.icon || localItem.emojiIcon) {
                    const icon = localItem.emojiIcon || localItem.icon;
                    existingItem.icon = icon;
                    existingItem.emojiIcon = icon;
                }
            } else {
                userCart.items.push(localItem);
            }
        });
    }

    await userCart.save();
    return userCart;
}

function toClientCartItem(item = {}) {
    const displayImage = String(
        item.variantImage || item.image || item.products || ''
    ).trim();
    const displayIcon = item.emojiIcon || item.icon || '';
    return {
        id: item.productId || item.id,
        productId: item.productId || item.id,
        name: item.name,
        price: Number(item.price) || 0,
        products: displayImage,
        image: displayImage,
        selectedImage: displayImage,
        variantImage: displayImage,
        icon: displayIcon,
        emojiIcon: displayIcon,
        quantity: item.quantity || 1,
        selected: item.selected !== false,
        variantId: item.variantId || '',
        variantLabel: item.variantLabel || '',
        variantAttribute: item.variantAttribute || '',
        variantValue: item.variantValue || '',
        variantSku: item.variantSku || '',
        selectedColor: item.selectedColor || '',
        selectedSize: item.selectedSize || ''
    };
}

function resolveGuestCartFromRequest(req) {
    const fromBody = req.body?.guestCartItems
        ?? req.body?.cartItems
        ?? req.body?.guestCart;
    if (fromBody) return fromBody;

    if (req.session?.cart) return req.session.cart;
    return [];
}

module.exports = {
    normalizeVariant,
    isSameLine,
    buildCartItem,
    normalizeGuestCartItems,
    mergeGuestCartIntoUserCart,
    toClientCartItem,
    resolveGuestCartFromRequest
};
