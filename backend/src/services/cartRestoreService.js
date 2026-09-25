/********************************************************************
 * Project: EonlineBazar — CRM Cart Recovery
 * File: cartRestoreService.js
 * Description: Secure one-click abandoned-cart restore tokens + cart merge.
 ********************************************************************/

'use strict';

const jwt = require('jsonwebtoken');
const Cart = require('../models/cart');
const Product = require('../models/product');
const { dualWrite } = require('./dualWriteService');
const { findVariantIndex } = require('../utils/variantHelpers');
const { resolveAvailableStock } = require('../controllers/orderControllerHelpers');

const DEFAULT_EXPIRY_MS = 72 * 60 * 60 * 1000;
const TOKEN_PURPOSE = 'cart_restore';

function getCartRepository() {
    return require('../repositories/cartRepository');
}

function getRestoreSecret() {
    return process.env.CART_RESTORE_SECRET || process.env.JWT_SECRET || 'cart-restore-dev-secret';
}

function getStorePublicUrl() {
    return String(process.env.STORE_PUBLIC_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '');
}

function generateCartRestoreToken(cartId, expiryMs = DEFAULT_EXPIRY_MS) {
    const safeExpiry = Math.max(60_000, Number(expiryMs) || DEFAULT_EXPIRY_MS);
    return jwt.sign(
        {
            purpose: TOKEN_PURPOSE,
            cartId: String(cartId)
        },
        getRestoreSecret(),
        { expiresIn: Math.floor(safeExpiry / 1000) }
    );
}

function verifyCartRestoreToken(token) {
    const decoded = jwt.verify(String(token || ''), getRestoreSecret());
    if (decoded?.purpose !== TOKEN_PURPOSE || !decoded?.cartId) {
        const err = new Error('Invalid cart restore token.');
        err.code = 'INVALID_TOKEN';
        throw err;
    }
    return decoded;
}

function buildRestoreCheckoutUrl(token) {
    const base = getStorePublicUrl();
    const query = `restoreToken=${encodeURIComponent(token)}`;
    return base ? `${base}/checkout.html?${query}` : `/checkout.html?${query}`;
}

function buildCartRecoveryUrl(cartId, expiryMs) {
    const token = generateCartRestoreToken(cartId, expiryMs);
    return {
        token,
        restoreUrl: buildRestoreCheckoutUrl(token)
    };
}

async function mirrorCart(savedCart) {
    if (!savedCart?._id) return;
    await getCartRepository().syncFromMongo(savedCart);
}

async function saveCartDocument(cart) {
    return dualWrite(
        () => cart.save(),
        async (saved) => { await mirrorCart(saved); },
        {
            model: 'Cart',
            operation: 'cartRestore',
            mongoId: (saved) => String(saved._id)
        }
    );
}

async function loadCartByTokenPayload(payload) {
    const cart = await Cart.findById(payload.cartId);
    if (!cart) return null;
    return cart;
}

async function restoreCartItemsWithStockCheck(cart) {
    const restoredItems = [];
    const skippedItems = [];
    const nextItems = [];

    for (const item of cart.items || []) {
        const plain = typeof item.toObject === 'function' ? item.toObject() : { ...item };
        const product = await Product.findById(plain.productId);
        if (!product) {
            skippedItems.push({
                name: plain.name,
                reason: 'Product unavailable'
            });
            continue;
        }

        const vIdx = findVariantIndex(product, plain);
        const available = resolveAvailableStock(product, vIdx);
        const requestedQty = Math.max(1, Number(plain.quantity) || 1);
        const qty = Math.min(requestedQty, available);

        if (qty <= 0) {
            skippedItems.push({
                name: plain.name,
                reason: 'Out of stock'
            });
            continue;
        }

        nextItems.push({
            ...plain,
            quantity: qty,
            selected: true
        });
        restoredItems.push({
            productId: plain.productId,
            name: plain.name,
            quantity: qty,
            price: plain.price
        });
    }

    cart.items = nextItems;
    cart.lastActivityAt = new Date();
    await saveCartDocument(cart);

    return { restoredItems, skippedItems, cart };
}

async function restoreCartFromToken(token) {
    let payload;
    try {
        payload = verifyCartRestoreToken(token);
    } catch (err) {
        const isExpired = err.name === 'TokenExpiredError'
            || String(err.message || '').toLowerCase().includes('jwt expired');
        return {
            success: false,
            status: isExpired ? 410 : 400,
            message: isExpired ? 'Cart restore link has expired.' : 'Invalid cart restore token.'
        };
    }

    const cart = await loadCartByTokenPayload(payload);
    if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
        return {
            success: false,
            status: 404,
            message: 'Cart not found or no restorable items remain.'
        };
    }

    const { restoredItems, skippedItems } = await restoreCartItemsWithStockCheck(cart);

    if (!restoredItems.length) {
        return {
            success: false,
            status: 422,
            message: 'None of the saved cart items are currently in stock.',
            skippedItems
        };
    }

    const checkoutUrl = buildRestoreCheckoutUrl(token);
    return {
        success: true,
        status: 200,
        message: 'Cart restored successfully.',
        itemsRestored: restoredItems.length,
        skippedItems,
        redirectUrl: checkoutUrl,
        checkoutUrl,
        restoreToken: token
    };
}

module.exports = {
    DEFAULT_EXPIRY_MS,
    generateCartRestoreToken,
    verifyCartRestoreToken,
    buildRestoreCheckoutUrl,
    buildCartRecoveryUrl,
    restoreCartFromToken
};
