/* File Name: Controllers/cartController.js */

const Cart = require('../models/cart');
const Product = require('../models/product');
const {
    normalizeVariant,
    isSameLine,
    normalizeGuestCartItems,
    mergeGuestCartIntoUserCart
} = require('../utils/cartMergeService');
const { isValidImagePath } = require('../utils/orderItemImages');

const PRODUCT_MEDIA_SELECT = 'name price images image icon productId stockQuantity stock thumbnail';

function isPlaceholderImage(value) {
    if (!value) return false;
    const v = String(value).trim().toLowerCase();
    return v.includes('placeholder-product')
        || v.endsWith('/images/placeholder-product.svg')
        || v.endsWith('/images/placeholder.jpg');
}

function isUnsafeAssetPath(value) {
    if (value == null) return true;
    const v = String(value).trim();
    if (!v) return true;
    if (v.startsWith('&') || v.startsWith('?')) return true;
    return /^\/[&?]/.test(v);
}

function looksLikeEmojiOrIcon(value) {
    if (!value) return false;
    const v = String(value).trim();
    if (!v || isValidImagePath(v)) return false;
    return v.length <= 8 && !/[\\/.]/.test(v);
}

function isUsableCartImage(value) {
    const v = String(value || '').trim();
    if (!v || v === 'null' || v === 'undefined') return false;
    if (v.includes('undefined') || v.includes('via.placeholder.com')) return false;
    if (isUnsafeAssetPath(v)) return false;
    if (isPlaceholderImage(v)) return false;
    if (looksLikeEmojiOrIcon(v)) return false;
    return isValidImagePath(v);
}

function pickFirstUsableImage(...candidates) {
    for (const candidate of candidates) {
        if (isUsableCartImage(candidate)) {
            return String(candidate).trim();
        }
    }
    return null;
}

function resolveCartItemDisplayImage(plain, catalog) {
    return pickFirstUsableImage(
        plain.variantImage,
        Array.isArray(catalog.images) && catalog.images.length > 0 ? catalog.images[0] : null,
        catalog.image,
        catalog.thumbnail,
        plain.image
    );
}

function extractProductId(productId) {
    if (productId && typeof productId === 'object' && productId._id) {
        return String(productId._id);
    }
    return productId ? String(productId) : '';
}

function resolvePopulatedProduct(item, productById) {
    const pid = item?.productId;
    if (pid && typeof pid === 'object' && pid._id) {
        return pid;
    }
    return productById.get(extractProductId(pid)) || null;
}

async function loadProductsForCartItems(items = []) {
    const productIds = [...new Set(
        items.map((item) => extractProductId(item.productId)).filter(Boolean)
    )];
    if (productIds.length === 0) return new Map();

    const products = await Product.find({ _id: { $in: productIds } }).select(PRODUCT_MEDIA_SELECT);
    return new Map(products.map((product) => [String(product._id), product]));
}

function mapCartItemResponse(item, product) {
    const plain = item && typeof item.toObject === 'function' ? item.toObject() : { ...item };
    const catalog = product && typeof product.toObject === 'function'
        ? product.toObject()
        : (product || {});

    const resolvedImage = resolveCartItemDisplayImage(plain, catalog);

    const emojiIcon = plain.emojiIcon || catalog.icon || plain.icon || null;

    return {
        _id: plain._id,
        productId: catalog._id || extractProductId(plain.productId),
        name: plain.name || catalog.name || 'Product',
        price: plain.price,
        quantity: plain.quantity,
        image: resolvedImage,
        images: catalog.images || [],
        emojiIcon,
        icon: emojiIcon || plain.icon || catalog.icon || '📦',
        variantImage: (plain.variantImage && isUsableCartImage(plain.variantImage))
            ? plain.variantImage
            : (resolvedImage || null),
        variant: plain.variant || null,
        variantId: plain.variantId || null,
        variantLabel: plain.variantLabel || '',
        variantAttribute: plain.variantAttribute || '',
        variantValue: plain.variantValue || '',
        variantSku: plain.variantSku || '',
        color: plain.selectedColor || plain.color || null,
        size: plain.selectedSize || plain.size || null,
        selectedColor: plain.selectedColor || '',
        selectedSize: plain.selectedSize || '',
        attributes: plain.attributes || {},
        stockQuantity: catalog.stockQuantity ?? catalog.stock ?? 99,
        selected: plain.selected !== false
    };
}

async function formatCartItemsForResponse(items = []) {
    const list = Array.isArray(items) ? items : [];
    if (list.length === 0) return [];

    const needsLookup = list.some(
        (item) => !(item.productId && typeof item.productId === 'object' && item.productId._id)
    );
    const productById = needsLookup ? await loadProductsForCartItems(list) : new Map();

    return list.map((item) =>
        mapCartItemResponse(item, resolvePopulatedProduct(item, productById))
    );
}

// ১. হাইব্রিড মার্জ লজিক (লগইন করার পর ফ্রন্টএন্ড থেকে লোকাল স্টোরেজের ডাটা আসবে)
exports.mergeCart = async (req, res) => {
    try {
        const { cartItems } = req.body;
        const userId = req.user.id;
        const guestItems = normalizeGuestCartItems(cartItems);

        if (guestItems.length === 0) {
            const existing = await Cart.findOne({ userId });
            const enriched = existing
                ? await formatCartItemsForResponse(existing.items)
                : [];
            return res.status(200).json({
                message: 'Cart merged successfully',
                cart: enriched
            });
        }

        const userCart = await mergeGuestCartIntoUserCart(userId, guestItems);
        const enriched = await formatCartItemsForResponse(userCart.items);
        res.status(200).json({ message: 'Cart merged successfully', cart: enriched });
    } catch (error) {
        res.status(500).json({ message: 'Server error during cart merge', error: error.message });
    }
};

// ২. ডাটাবেজ থেকে ইউজারের লাইভ কার্ট গেট করা
exports.getCart = async (req, res) => {
    try {
        const userId = req.user.id;
        const cart = await Cart.findOne({ userId })
            .populate('items.productId', PRODUCT_MEDIA_SELECT);

        if (!cart || !cart.items.length) {
            return res.json({ success: true, data: [] });
        }

        const itemsWithImages = await formatCartItemsForResponse(cart.items);
        return res.json({ success: true, data: itemsWithImages });
    } catch (error) {
        res.status(500).json({ message: "Error fetching cart", error: error.message });
    }
};

// ৩. ডাটাবেজ কার্টে নতুন প্রোডাক্ট অ্যাড করা (variant-aware)
function resolveCartItemImage(body = {}, product = null) {
    const fromBody = String(
        body.selectedImage
        || body.variantImage
        || body.image
        || body.products
        || ''
    ).trim();

    if (fromBody) return fromBody;

    if (product) {
        return (
            (Array.isArray(product.images) && product.images[0])
            || product.image
            || product.thumbnail
            || ''
        );
    }

    return '';
}

exports.addToCart = async (req, res) => {
    try {
        const { productId, quantity, name, price, icon } = req.body;
        const userId = req.user.id;
        const variant = normalizeVariant(req.body);

        const product = await Product.findById(productId)
            .select('images emojiIcon icon name price image thumbnail');
        const displayImage = resolveCartItemImage(req.body, product);
        const displayIcon = icon || product?.emojiIcon || product?.icon || '📦';
        const displayName = name || product?.name || 'Product';
        const displayPrice = price != null ? Number(price) : Number(product?.price) || 0;

        let userCart = await Cart.findOne({ userId });

        if (!userCart) {
            userCart = new Cart({ userId, items: [] });
        }

        const itemIndex = userCart.items.findIndex(item =>
            isSameLine(item, productId, variant.variantId)
        );

        if (itemIndex > -1) {
            userCart.items[itemIndex].quantity += quantity || 1;
            if (displayImage) {
                userCart.items[itemIndex].image = displayImage;
                userCart.items[itemIndex].variantImage = displayImage;
            }
            if (displayIcon) {
                userCart.items[itemIndex].icon = displayIcon;
                userCart.items[itemIndex].emojiIcon = displayIcon;
            }
        } else {
            userCart.items.push({
                productId,
                name: displayName,
                price: displayPrice,
                image: displayImage || (product?.images && product.images[0]) || product?.image || null,
                variantImage: displayImage || (product?.images && product.images[0]) || product?.image || null,
                icon: displayIcon,
                emojiIcon: product?.emojiIcon || product?.icon || displayIcon || null,
                quantity: quantity || 1,
                selected: true,
                ...variant
            });
        }

        await userCart.save();
        const enriched = await formatCartItemsForResponse(userCart.items);
        res.status(200).json(enriched);
    } catch (error) {
        res.status(500).json({ message: "Error adding to cart", error: error.message });
    }
};

// ৪. কার্ট আইটেমের কোয়ান্টিটি আপডেট (variant-aware)
exports.updateQuantity = async (req, res) => {
    try {
        const { productId, quantity, variantId } = req.body;
        const userCart = await Cart.findOne({ userId: req.user.id });

        if (userCart) {
            const item = userCart.items.find(i => isSameLine(i, productId, variantId));
            if (item) {
                item.quantity = quantity;
                await userCart.save();
                const enriched = await formatCartItemsForResponse(userCart.items);
                return res.status(200).json(enriched);
            }
        }
        res.status(404).json({ message: "Item not found in cart" });
    } catch (error) {
        res.status(500).json({ message: "Error updating quantity", error: error.message });
    }
};

// ৫. কার্ট থেকে প্রোডাক্ট ডিলিট (variant-aware)
exports.deleteCartItem = async (req, res) => {
    try {
        const { productId } = req.params;
        const variantId = req.query.variantId;
        const userCart = await Cart.findOne({ userId: req.user.id });

        if (userCart) {
            if (variantId === undefined) {
                userCart.items = userCart.items.filter(item => String(item.productId) !== String(productId));
            } else {
                userCart.items = userCart.items.filter(item => !isSameLine(item, productId, variantId));
            }
            await userCart.save();
            const enriched = await formatCartItemsForResponse(userCart.items);
            return res.status(200).json(enriched);
        }
        res.status(404).json({ message: "Cart not found" });
    } catch (error) {
        res.status(500).json({ message: "Error deleting item", error: error.message });
    }
};

// ৬. আইটেম চেক/আনচেক (Selection Toggle) (variant-aware)
exports.toggleSelection = async (req, res) => {
    try {
        const { productId, selected, variantId } = req.body;
        const userCart = await Cart.findOne({ userId: req.user.id });

        if (userCart) {
            const item = userCart.items.find(i => isSameLine(i, productId, variantId));
            if (item) {
                item.selected = selected;
                await userCart.save();
                const enriched = await formatCartItemsForResponse(userCart.items);
                return res.status(200).json(enriched);
            }
        }
        res.status(404).json({ message: "Item not found" });
    } catch (error) {
        res.status(500).json({ message: "Error toggling selection", error: error.message });
    }
};

exports.clearCart = async (req, res) => {
    try {
        const userId = req.user.id;
        const userCart = await Cart.findOne({ userId });

        if (!userCart) {
            return res.status(200).json([]);
        }

        userCart.items = [];
        await userCart.save();
        res.status(200).json([]);
    } catch (err) {
        console.error('Error clearing cart:', err);
        res.status(500).json({ message: 'Failed to clear cart', error: err.message });
    }
};

exports.clearOrderedItems = async (req, res) => {
    try {
        const userId = req.user.id;
        const userCart = await Cart.findOne({ userId });

        if (userCart) {
            userCart.items = userCart.items.filter(item => item.selected === false);
            await userCart.save();
            res.json({ success: true, message: "Ordered items cleared from cart." });
        } else {
            res.status(404).json({ success: false, message: "Cart not found" });
        }
    } catch (err) {
        console.error("Error clearing ordered items:", err);
        res.status(500).json({ success: false, message: "Failed to clear cart" });
    }
};

module.exports = {
    mergeCart: exports.mergeCart,
    getCart: exports.getCart,
    addToCart: exports.addToCart,
    updateQuantity: exports.updateQuantity,
    deleteCartItem: exports.deleteCartItem,
    toggleSelection: exports.toggleSelection,
    clearOrderedItems: exports.clearOrderedItems,
    clearCart: exports.clearCart
};
