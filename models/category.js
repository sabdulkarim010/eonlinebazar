/********************************************************************
 * Project: EonlineBazar
 * File: category.js
 * Location: models/category.js
 * Author: Abdul Karim Sheikh
 * Description: Professional hierarchical category schema (Daraz-style)
 * with slug, visuals, navbar/homepage flags, SEO meta, and cashback.
 ********************************************************************/

const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true
  },
  description: { type: String, default: '' },

  // Visual
  imageUrl: { type: String, default: null },
  iconUrl: { type: String, default: null },
  bannerImageUrl: { type: String, default: null },
  color: { type: String, default: '#f97316' },

  // Hierarchy
  parentCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },

  // Settings
  isActive: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  showInNavbar: { type: Boolean, default: true },
  showInHomepage: { type: Boolean, default: false },
  position: { type: Number, default: 0 },

  // Business
  customCashback: { type: Number, default: null },

  // Meta (SEO)
  metaTitle: { type: String, default: '' },
  metaDescription: { type: String, default: '' },

  // Stats (updated periodically)
  productCount: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Hierarchy + storefront query indexes (slug uniqueness comes from field unique: true)
categorySchema.index({ parentCategory: 1, position: 1, name: 1 });
categorySchema.index({ isActive: 1, parentCategory: 1, position: 1 });
categorySchema.index({ isActive: 1, showInNavbar: 1, parentCategory: 1, position: 1 });
categorySchema.index({ isActive: 1, showInHomepage: 1, parentCategory: 1, position: 1 });

// Auto-generate slug from name
// Mongoose 9 does not pass `next` to middleware — calling next() throws
// "TypeError: next is not a function" on category.save().
categorySchema.pre('save', function () {
  if (this.isModified('name')) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9\u0980-\u09FF\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
    this.updatedAt = new Date();
  }
});

// Virtual: has children
categorySchema.virtual('hasChildren', {
  ref: 'Category',
  localField: '_id',
  foreignField: 'parentCategory',
  count: true
});

module.exports = mongoose.model('Category', categorySchema);
