/********************************************************************
 * Project: EonlineBazar
 * File: cartMergeService.js
 * Location: utils/cartMergeService.js
 * Description: Shared guest → user cart merge logic (login + API).
 ********************************************************************/

const Cart = require('../models/cart');

function normalizeVariant(src = {}) {
    const attribute = String(src.variantAttribute || src.attribute || '').trim();
    const value = String(src.variantValue || src.value || '').trim();
    const sku = String(src.variantSku || src.sku || '').trim();
    let variantId = String(src.variantId || '').trim();
    if (!variantId && (attribute || value || sku)) {
        variantId = sku || `${attribute}::${value}`;
    }
    const variantLabel = String(src.variantLabel || '').trim() ||
        (attribute && value ? `${attribute}: ${value}` : (value || ''));
    return { variantId, variantLabel, variantAttribute: attribute, variantValue: value, variantSku: sku };
}

function isSameLine(dbItem, productId, variantId) {
    return String(dbItem.productId) === String(productId) &&
        String(dbItem.variantId || '') === String(variantId || '');
}

function buildCartItem(item) {
    const variant = normalizeVariant(item);
    const productId = item.id || item.productId;
    if (!productId) return null;

    return {
        productId,
        name: item.name,
        price: Number(item.price) || 0,
        image: item.image || item.products || '',
        icon: item.icon || '',
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
            } else {
                userCart.items.push(localItem);
            }
        });
    }

    await userCart.save();
    return userCart;
}

function toClientCartItem(item = {}) {
    return {
        id: item.productId || item.id,
        productId: item.productId || item.id,
        name: item.name,
        price: Number(item.price) || 0,
        products: item.image || '',
        image: item.image || '',
        icon: item.icon || '',
        quantity: item.quantity || 1,
        selected: item.selected !== false,
        variantId: item.variantId || '',
        variantLabel: item.variantLabel || '',
        variantAttribute: item.variantAttribute || '',
        variantValue: item.variantValue || '',
        variantSku: item.variantSku || ''
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
