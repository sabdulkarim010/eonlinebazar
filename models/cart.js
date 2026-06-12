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
            selected: { type: Boolean, default: true }
        }
    ]
}, { timestamps: true });

module.exports = mongoose.model('Cart', cartSchema);



