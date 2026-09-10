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
            emojiIcon: { type: String, default: null },
            variantImage: { type: String, default: null },
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
            variantSku: { type: String, default: '' },
            selectedColor: { type: String, default: '' },
            selectedSize: { type: String, default: '' }
        }
    ],
    // 🛒 Abandoned cart tracking (CRM automation — abandonedCartJob.js)
    // lastActivityAt bumps on every cart mutation; abandonedNotifiedAt is set
    // once a recovery email/SMS has been dispatched so we never re-notify.
    lastActivityAt: {
        type: Date,
        default: Date.now
    },
    abandonedNotifiedAt: {
        type: Date,
        default: null
    }
}, { timestamps: true });

// Every save is a cart change — keep lastActivityAt fresh and re-arm the
// recovery flag so a returning shopper who edits their cart can be notified
// again if they abandon it a second time.
cartSchema.pre('save', function markCartActivity() {
    if (this.isModified('items')) {
        this.lastActivityAt = new Date();
        this.abandonedNotifiedAt = null;
    }
});

// Abandoned cart cron query: filter by owner + recency of last update.
cartSchema.index({ userId: 1, updatedAt: -1 });

module.exports = mongoose.model('Cart', cartSchema);



