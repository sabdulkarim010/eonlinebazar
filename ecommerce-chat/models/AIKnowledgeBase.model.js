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
      default: 'EonlineBazar',
    },
    store_tagline: {
      type: String,
      default: 'Your trusted online shop in Bangladesh',
    },
    contact_phone: {
      type: String,
      default: '01XXXXXXXXX',
    },
    contact_email: {
      type: String,
      default: 'support@eonlinebazar.com',
    },
    address: {
      type: String,
      default: '',
    },
    shipping_policy: {
      type: String,
      default:
        'ঢাকার মধ্যে: ৬০ টাকা, ১-২ দিন।\nঢাকার বাইরে: ১২০ টাকা, ৩-৫ দিন।\n১০০০ টাকার উপরে অর্ডারে ফ্রি ডেলিভারি।',
    },
    return_policy: {
      type: String,
      default:
        'পণ্য পাওয়ার ৭ দিনের মধ্যে রিটার্ন করা যাবে।\nপণ্য অব্যবহৃত ও মূল প্যাকেজিংয়ে থাকতে হবে।\nরিটার্নের জন্য হেল্পলাইনে কল করুন বা চ্যাটে জানান।',
    },
    delivery_time: {
      type: String,
      default:
        'অর্ডার কনফার্মের ২৪ ঘণ্টার মধ্যে পাঠানো হয়। ঢাকা: ১-২ দিন, বাইরে: ৩-৫ দিন।',
    },
    business_hours: {
      type: String,
      default: 'Sat–Thu: 9AM–9PM, Fri: 2PM–8PM',
    },
    ai_persona_name: {
      type: String,
      default: 'Aria',
    },
    ai_language: {
      type: String,
      enum: ['auto', 'bn', 'en'],
      default: 'auto',
    },
    handover_keywords: {
      type: [String],
      default: [
        'রাগ',
        'প্রতারণা',
        'ম্যানেজার',
        'human',
        'manager',
        'refund now',
        'fraud',
      ],
    },
    canned_responses: {
      type: [
        {
          shortcut: { type: String, required: true },
          text: { type: String, required: true },
        },
      ],
      default: [
        {
          shortcut: '/thanks',
          text: 'আমাদের সাথে কেনাকাটার জন্য ধন্যবাদ! 😊',
        },
        {
          shortcut: '/wait',
          text: 'একটু অপেক্ষা করুন, এখনই সমাধান করছি।',
        },
        {
          shortcut: '/sorry',
          text: 'এই অসুবিধার জন্য আন্তরিকভাবে দুঃখিত।',
        },
        {
          shortcut: '/bye',
          text: 'ধন্যবাদ! আর কোনো সমস্যায় আমাদের সাথে যোগাযোগ করুন। 🙏',
        },
      ],
    },
  },
  {
    timestamps: true,
  }
);

const AIKnowledgeBase = mongoose.model('AIKnowledgeBase', aiKnowledgeBaseSchema);
const StoreConfig = mongoose.model('StoreConfig', storeConfigSchema);

module.exports = { AIKnowledgeBase, StoreConfig };
