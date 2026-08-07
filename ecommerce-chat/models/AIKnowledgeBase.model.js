const mongoose = require('mongoose');

const aiKnowledgeBaseSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: [
        'SHIPPING',
        'RETURN',
        'PAYMENT',
        'SIZE_GUIDE',
        'PRODUCT',
        'ORDER',
        'CONTACT',
        'GENERAL',
      ],
      required: true,
      index: true,
    },
    question: {
      type: String,
      required: true,
      trim: true,
    },
    answer: {
      type: String,
      required: true,
      trim: true,
    },
    keywords: {
      type: [String],
      default: [],
    },
    is_active: {
      type: Boolean,
      default: true,
      index: true,
    },
    usage_count: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

const storeConfigSchema = new mongoose.Schema(
  {
    store_name: {
      type: String,
      required: true,
      default: 'YourShop BD',
    },
    store_tagline: {
      type: String,
      default: 'আপনার বিশ্বস্ত অনলাইন শপ',
    },
    contact_phone: {
      type: String,
      default: '',
    },
    contact_email: {
      type: String,
      default: '',
    },
    address: {
      type: String,
      default: '',
    },
    shipping_policy: {
      type: String,
      default: '',
    },
    return_policy: {
      type: String,
      default: '',
    },
    delivery_time: {
      type: String,
      default: '',
    },
    business_hours: {
      type: String,
      default: 'শনি–বৃহস্পতি, সকাল ১০টা – রাত ৮টা',
    },
    ai_persona_name: {
      type: String,
      default: 'Aria',
    },
    ai_language: {
      type: String,
      default: 'bn',
    },
    handover_keywords: {
      type: [String],
      default: [
        'রাগ',
        'প্রতারণা',
        'মানব',
        'এজেন্ট',
        'ম্যানেজার',
        'manager',
        'human',
        'agent',
        'fraud',
        'refund now',
        'complaint',
        'scam',
      ],
    },
    canned_responses: [
      {
        shortcut: { type: String, required: true },
        text: { type: String, required: true },
      },
    ],
  },
  {
    timestamps: true,
  }
);

const AIKnowledgeBase = mongoose.model('AIKnowledgeBase', aiKnowledgeBaseSchema);
const StoreConfig = mongoose.model('StoreConfig', storeConfigSchema);

module.exports = { AIKnowledgeBase, StoreConfig };
