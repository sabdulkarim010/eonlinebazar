/********************************************************************
 * Project: EonlineBazar
 * File: wishlist.js
 * Location: models/wishlist.js
 * Description: Wishlist item subdocument schema. Items are stored as an
 * embedded array on the User model (persists until manually removed;
 * orders do not clear the wishlist).
 ********************************************************************/

const mongoose = require('mongoose');

const wishlistItemSchema = new mongoose.Schema({
    productId: { type: String, required: true },
    name: { type: String, default: '' },
    price: { type: Number, default: 0 },
    image: { type: String, default: '' },
    icon: { type: String, default: '📦' },
    addedAt: { type: Date, default: Date.now }
});

module.exports = { wishlistItemSchema };
