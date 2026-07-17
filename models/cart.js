//File Name: models/cart.js


const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // আপনার User মডেলের নামের সাথে মিল থাকতে হবে
        required: true
    },
    items: [
        {
            productId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Product', // আপনার Product মডেলের নামের সাথে মিল থাকতে হবে
                required: true
            },
            name: { type: String, required: true },
            price: { type: Number, required: true },
            image: { type: String, default: '' },
            icon: { type: String, default: '📦' },
            quantity: { type: Number, required: true, default: 1 },
            selected: { type: Boolean, default: true },
            // 🌟 ভ্যারিয়েন্ট তথ্য (Shopify স্টাইল) — একই প্রোডাক্টের ভিন্ন ভ্যারিয়েন্ট
            // কার্টে আলাদা লাইন হিসেবে থাকবে। সম্পূর্ণ অপশনাল, তাই সাধারণ
            // প্রোডাক্টের সাথে backward-compatible।
            variantId: { type: String, default: '' },        // ইউনিক লাইন কী (sku বা attribute::value)
            variantLabel: { type: String, default: '' },     // ডিসপ্লের জন্য, যেমন "Size: M"
            variantAttribute: { type: String, default: '' }, // যেমন "Size"
            variantValue: { type: String, default: '' },     // যেমন "M"
            variantSku: { type: String, default: '' }
        }
    ]
}, { timestamps: true });

module.exports = mongoose.model('Cart', cartSchema);



