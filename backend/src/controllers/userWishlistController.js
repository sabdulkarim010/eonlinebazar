/********************************************************************
 * Project: EonlineBazar
 * File: userWishlistController.js
 * Location: backend/src/controllers/userWishlistController.js
 * Description: Customer wishlist fetch, add, and remove (User.wishlist array).
 ********************************************************************/

const mongoose = require('mongoose');
const User = require('../models/user');
const Product = require('../models/product');

function enrichWishlistItem(item, product) {
    const plain = item && typeof item.toObject === 'function' ? item.toObject() : { ...item };
    const catalog = product && typeof product.toObject === 'function'
        ? product.toObject()
        : (product || {});

    const image = (
        plain.image
        || (Array.isArray(catalog.images) && catalog.images[0])
        || catalog.image
        || catalog.thumbnail
        || ''
    );
    const emojiIcon = plain.emojiIcon || plain.icon || catalog.icon || '📦';

    return {
        productId: plain.productId,
        name: plain.name || catalog.name || '',
        price: plain.price != null ? Number(plain.price) : Number(catalog.price) || 0,
        image,
        images: catalog.images || [],
        icon: emojiIcon,
        emojiIcon,
        addedAt: plain.addedAt
    };
}

async function enrichWishlistItems(wishlist = []) {
    const items = Array.isArray(wishlist) ? wishlist : [];
    if (items.length === 0) return [];

    const productIds = [...new Set(items.map((item) => String(item.productId)).filter(Boolean))];
    const objectIds = productIds.filter((id) => mongoose.Types.ObjectId.isValid(id));

    const products = await Product.find({
        $or: [
            { _id: { $in: objectIds } },
            { productId: { $in: productIds } }
        ]
    }).select('name price images image icon productId thumbnail');

    const productByKey = new Map();
    products.forEach((product) => {
        productByKey.set(String(product._id), product);
        if (product.productId) productByKey.set(String(product.productId), product);
    });

    return items.map((item) =>
        enrichWishlistItem(item, productByKey.get(String(item.productId)))
    );
}

exports.getWishlist = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('wishlist');
        if (!user) return res.status(404).json({ success: false, message: "User not found." });
        const enriched = await enrichWishlistItems(user.wishlist || []);
        res.status(200).json({ success: true, wishlist: enriched });
    } catch (error) {
        console.error("Get Wishlist Error:", error);
        res.status(500).json({ success: false, message: "Failed to load wishlist." });
    }
};

exports.addToWishlist = async (req, res) => {
    try {
        const { productId, name, price, image, icon } = req.body;
        if (!productId) {
            return res.status(400).json({ success: false, message: "Product ID is required." });
        }

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        const alreadyExists = user.wishlist.some(item => String(item.productId) === String(productId));
        if (alreadyExists) {
            return res.status(200).json({ success: true, message: "Already in your wishlist.", wishlist: user.wishlist });
        }

        user.wishlist.unshift({
            productId,
            name: name || '',
            price: Number(price) || 0,
            image: image || '',
            icon: icon || '📦'
        });
        await user.save();

        res.status(200).json({ success: true, message: "Added to wishlist!", wishlist: user.wishlist });
    } catch (error) {
        console.error("Add Wishlist Error:", error);
        res.status(500).json({ success: false, message: "Failed to add to wishlist." });
    }
};

exports.removeFromWishlist = async (req, res) => {
    try {
        const { productId } = req.params;
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        user.wishlist = user.wishlist.filter(item => String(item.productId) !== String(productId));
        await user.save();

        res.status(200).json({ success: true, message: "Removed from wishlist.", wishlist: user.wishlist });
    } catch (error) {
        console.error("Remove Wishlist Error:", error);
        res.status(500).json({ success: false, message: "Failed to remove from wishlist." });
    }
};
