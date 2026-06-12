/* File Name: Controllers/cartController.js */

const Cart = require('../models/cart');

// ১. হাইব্রিড মার্জ লজিক (লগইন করার পর ফ্রন্টএন্ড থেকে লোকাল স্টোরেজের ডাটা আসবে)
exports.mergeCart = async (req, res) => {
    try {
        const { cartItems } = req.body; 
        const userId = req.user.id; 

        let userCart = await Cart.findOne({ userId });

        if (!userCart) {
            // যদি ডাটাবেজে আগে থেকে কার্ট না থাকে, নতুন তৈরি হবে
            const formattedItems = cartItems.map(item => ({
                productId: item.id,
                name: item.name,
                price: item.price,
                image: item.products,
                icon: item.icon,
                quantity: item.quantity,
                selected: item.selected !== false
            }));
            userCart = new Cart({ userId, items: formattedItems });
        } else {
            // যদি আগে থেকেই কার্ট থাকে, তাহলে মার্জ হবে
            cartItems.forEach(localItem => {
                const existingItem = userCart.items.find(dbItem => String(dbItem.productId) === String(localItem.id));
                if (existingItem) {
                    existingItem.quantity += localItem.quantity;
                } else {
                    userCart.items.push({
                        productId: localItem.id,
                        name: localItem.name,
                        price: localItem.price,
                        image: localItem.products,
                        icon: localItem.icon,
                        quantity: localItem.quantity,
                        selected: localItem.selected !== false
                    });
                }
            });
        }

        await userCart.save();
        res.status(200).json({ message: "Cart merged successfully", cart: userCart.items });
    } catch (error) {
        res.status(500).json({ message: "Server error during cart merge", error: error.message });
    }
};

// ২. ডাটাবেজ থেকে ইউজারের লাইভ কার্ট গেট করা
exports.getCart = async (req, res) => {
    try {
        const cart = await Cart.findOne({ userId: req.user.id });
        if (!cart) return res.status(200).json([]);
        res.status(200).json(cart.items);
    } catch (error) {
        res.status(500).json({ message: "Error fetching cart", error: error.message });
    }
};

// ৩. ডাটাবেজ কার্টে নতুন প্রোডাক্ট অ্যাড করা (লগইন থাকা অবস্থায় সম্পূর্ণ ডাটা সহ ফিক্স করা হয়েছে)
exports.addToCart = async (req, res) => {
    try {
        // ফ্রন্টএন্ড থেকে পাঠানো সম্পূর্ণ ডাটা রিসিভ করা হচ্ছে
        const { productId, quantity, name, price, image, icon } = req.body;
        const userId = req.user.id;

        let userCart = await Cart.findOne({ userId });

        if (!userCart) {
            userCart = new Cart({ userId, items: [] });
        }

        const itemIndex = userCart.items.findIndex(item => String(item.productId) === String(productId));

        if (itemIndex > -1) {
            userCart.items[itemIndex].quantity += quantity || 1;
        } else {
            // এখন প্রোডাক্টের নাম, দাম, ছবি সব ডাটাবেজে সেভ হবে
            userCart.items.push({ 
                productId, 
                name, 
                price, 
                image, 
                icon, 
                quantity: quantity || 1,
                selected: true // ডিফল্টভাবে সিলেক্টেড থাকবে
            });
        }

        await userCart.save();
        res.status(200).json(userCart.items);
    } catch (error) {
        res.status(500).json({ message: "Error adding to cart", error: error.message });
    }
};

// ৪. কার্ট আইটেমের কোয়ান্টিটি আপডেট
exports.updateQuantity = async (req, res) => {
    try {
        const { productId, quantity } = req.body;
        const userCart = await Cart.findOne({ userId: req.user.id });

        if (userCart) {
            const item = userCart.items.find(i => String(i.productId) === String(productId));
            if (item) {
                item.quantity = quantity;
                await userCart.save();
                return res.status(200).json(userCart.items);
            }
        }
        res.status(404).json({ message: "Item not found in cart" });
    } catch (error) {
        res.status(500).json({ message: "Error updating quantity", error: error.message });
    }
};

// ৫. কার্ট থেকে প্রোডাক্ট ডিলিট
exports.deleteCartItem = async (req, res) => {
    try {
        const { productId } = req.params;
        const userCart = await Cart.findOne({ userId: req.user.id });

        if (userCart) {
            userCart.items = userCart.items.filter(item => String(item.productId) !== String(productId));
            await userCart.save();
            return res.status(200).json(userCart.items);
        }
        res.status(404).json({ message: "Cart not found" });
    } catch (error) {
        res.status(500).json({ message: "Error deleting item", error: error.message });
    }
};

// ৬. আইটেম চেক/আনচেক (Selection Toggle)
exports.toggleSelection = async (req, res) => {
    try {
        const { productId, selected } = req.body;
        const userCart = await Cart.findOne({ userId: req.user.id });

        if (userCart) {
            const item = userCart.items.find(i => String(i.productId) === String(productId));
            if (item) {
                item.selected = selected;
                await userCart.save();
                return res.status(200).json(userCart.items);
            }
        }
        res.status(404).json({ message: "Item not found" });
    } catch (error) {
        res.status(500).json({ message: "Error toggling selection", error: error.message });
    }
};



// সঠিক লজিক (আপনার আগের ৭ নম্বর ফাংশনটির পরিবর্তে এটি ব্যবহার করুন)
exports.clearOrderedItems = async (req, res) => {
    try {
        const userId = req.user.id;
        const userCart = await Cart.findOne({ userId });

        if (userCart) {
            // শুধুমাত্র যেগুলো সিলেক্টেড নয় (selected: false), সেগুলোই থাকবে
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



// ফাইলের শেষে এই লাইনগুলো যুক্ত করুন:

module.exports = {
    mergeCart: exports.mergeCart,
    getCart: exports.getCart,
    addToCart: exports.addToCart,
    updateQuantity: exports.updateQuantity,
    deleteCartItem: exports.deleteCartItem,
    toggleSelection: exports.toggleSelection,
    clearOrderedItems: exports.clearOrderedItems // এটি আপনার নতুন ফাংশন
};



