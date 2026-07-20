/********************************************************************
 * Project: EonlineBazar
 * File: wishlistController.js
 * Location: controllers/wishlistController.js
 * Description: Wishlist toggle and read operations. Uses the embedded
 * wishlist array on the User model (persists across orders).
 ********************************************************************/

const mongoose = require('mongoose');
const User = require('../models/user');
const Product = require('../models/product');

async function findProductByIdOrSku(productId) {
    if (!productId) return null;

    if (mongoose.Types.ObjectId.isValid(productId)) {
        const byMongoId = await Product.findById(productId);
        if (byMongoId) return byMongoId;
    }

    return Product.findOne({ productId: String(productId) });
}

function collectProductIds(productId, product = null) {
    const ids = new Set([String(productId)]);
    if (product) {
        ids.add(String(product._id));
        if (product.productId) ids.add(String(product.productId));
    }
    return ids;
}

function findWishlistIndex(wishlist, idsToMatch) {
    return wishlist.findIndex(item => idsToMatch.has(String(item.productId)));
}

function buildWishlistItemFromProduct(product, fallback = {}) {
    const image =
        fallback.image ||
        (Array.isArray(product.images) && product.images[0]) ||
        product.image ||
        '';

    return {
        productId: String(product._id),
        name: fallback.name || product.name || '',
        price: fallback.price != null ? Number(fallback.price) : Number(product.price) || 0,
        image,
        icon: fallback.icon || product.icon || '📦'
    };
}

/**
 * POST /api/wishlist/toggle
 * Adds the product if absent; removes it if already saved.
 */
exports.toggleWishlist = async (req, res) => {
    try {
        const { productId, name, price, image, icon } = req.body;

        if (!productId) {
            return res.status(400).json({
                success: false,
                added: false,
                message: 'Product ID is required.'
            });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                added: false,
                message: 'User not found.'
            });
        }

        const product = await findProductByIdOrSku(productId);
        const idsToMatch = collectProductIds(productId, product);
        const existingIndex = findWishlistIndex(user.wishlist, idsToMatch);

        if (existingIndex > -1) {
            user.wishlist.splice(existingIndex, 1);
            await user.save();

            return res.status(200).json({
                success: true,
                added: false,
                message: 'Removed from wishlist.'
            });
        }

        if (!product) {
            return res.status(404).json({
                success: false,
                added: false,
                message: 'Product not found.'
            });
        }

        user.wishlist.unshift(buildWishlistItemFromProduct(product, { name, price, image, icon }));
        await user.save();

        return res.status(200).json({
            success: true,
            added: true,
            message: 'Added to wishlist.'
        });
    } catch (error) {
        console.error('Toggle Wishlist Error:', error);
        return res.status(500).json({
            success: false,
            added: false,
            message: 'Failed to update wishlist.'
        });
    }
};
