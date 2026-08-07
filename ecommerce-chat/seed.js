require('dotenv').config();

const mongoose = require('mongoose');
const Agent = require('./models/Agent.model');
const {
  AIKnowledgeBase,
  StoreConfig,
} = require('./models/AIKnowledgeBase.model');

const MONGO_URI =
  process.env.MONGO_URI || 'mongodb://localhost:27017/ecommerce_chat';

const storeConfigSeed = {
  store_name: 'YourShop BD',
  store_tagline: 'বাংলাদেশের বিশ্বস্ত অনলাইন শপ',
  contact_phone: '01700000000',
  contact_email: 'support@yourshop.com',
  address: 'হাউস ১২, রোড ৫, ধানমন্ডি, ঢাকা-১২০৫',
  shipping_policy:
    'ঢাকার ভিতরে ডেলিভারি চার্জ ৬০ টাকা, ঢাকার বাইরে ১২০ টাকা। ১০০০ টাকার উপরে অর্ডারে ঢাকার ভিতরে ফ্রি ডেলিভারি।',
  return_policy:
    'পণ্য গ্রহণের ৭ দিনের মধ্যে অব্যবহৃত ও ট্যাগসহ পণ্য রিটার্ন করা যাবে। ইলেকট্রনিক্স ও অন্তর্বাসে রিটার্ন প্রযোজ্য নয়।',
  delivery_time:
    'ঢাকার ভিতরে ১–২ কর্মদিবস, ঢাকার বাইরে ২–৫ কর্মদিবস।',
  business_hours: 'শনি–বৃহস্পতি, সকাল ১০টা – রাত ৮টা (শুক্রবার বন্ধ)',
  ai_persona_name: 'Aria',
  ai_language: 'bn',
  handover_keywords: [
    'রাগ',
    'প্রতারণা',
    'ঠকানো',
    'ম্যানেজার',
    'এজেন্ট',
    'মানুষ',
    'অভিযোগ',
    'manager',
    'human',
    'agent',
    'fraud',
    'scam',
    'refund now',
    'complaint',
  ],
  canned_responses: [
    {
      shortcut: '/hello',
      text: 'আস্সালামু আলাইকুম! YourShop BD-তে স্বাগতম। আমি কীভাবে সাহায্য করতে পারি?',
    },
    {
      shortcut: '/wait',
      text: 'অনুগ্রহ করে একটু অপেক্ষা করুন, আমি আপনার তথ্য যাচাই করছি।',
    },
    {
      shortcut: '/thanks',
      text: 'ধন্যবাদ! আর কোনো সাহায্য লাগলে জানাবেন।',
    },
  ],
};

const knowledgeSeed = [
  {
    category: 'SHIPPING',
    question: 'ডেলিভারি চার্জ কত?',
    answer:
      'ঢাকার ভিতরে ডেলিভারি চার্জ ৬০ টাকা এবং ঢাকার বাইরে ১২০ টাকা। ১০০০ টাকার উপরে অর্ডারে ঢাকার ভিতরে ফ্রি ডেলিভারি পাওয়া যায়।',
    keywords: ['ডেলিভারি চার্জ', 'shipping', 'delivery charge', 'কত টাকা'],
  },
  {
    category: 'SHIPPING',
    question: 'ডেলিভারি কতদিনে হয়?',
    answer:
      'সাধারণত ঢাকার ভিতরে ১–২ কর্মদিবস এবং ঢাকার বাইরে ২–৫ কর্মদিবসের মধ্যে ডেলিভারি হয়ে থাকে।',
    keywords: ['ডেলিভারি সময়', 'কবে পাব', 'delivery time', 'কতদিন'],
  },
  {
    category: 'RETURN',
    question: 'রিটার্ন পলিসি কী?',
    answer:
      'পণ্য হাতে পাওয়ার ৭ দিনের মধ্যে অব্যবহৃত ও ট্যাগসহ পণ্য রিটার্ন করা যাবে। ইলেকট্রনিক্স ও অন্তর্বাসে রিটার্ন প্রযোজ্য নয়। রিটার্নের জন্য সাপোর্টে অর্ডার আইডি সহ যোগাযোগ করুন।',
    keywords: ['রিটার্ন', 'return', 'ফেরত', 'exchange', 'বদল'],
  },
  {
    category: 'PAYMENT',
    question: 'কী কী পেমেন্ট পদ্ধতি আছে?',
    answer:
      'আমরা bKash, Nagad, Rocket এবং Cash on Delivery (COD) সাপোর্ট করি। ম্যানুয়াল পেমেন্টের ক্ষেত্রে ট্রানজেকশন আইডি পাঠাতে হবে।',
    keywords: ['পেমেন্ট', 'bKash', 'Nagad', 'Rocket', 'COD', 'payment'],
  },
  {
    category: 'ORDER',
    question: 'অর্ডার কীভাবে ট্র্যাক করব?',
    answer:
      'আপনার অর্ডার আইডি দিয়ে ওয়েবসাইটের Track Order পেজ থেকে স্ট্যাটাস দেখতে পারবেন। প্রয়োজনে অর্ডার আইডি এখানে পাঠালে আমরা সাহায্য করব।',
    keywords: ['ট্র্যাক', 'track', 'অর্ডার স্ট্যাটাস', 'order status'],
  },
  {
    category: 'CONTACT',
    question: 'যোগাযোগের নম্বর কী?',
    answer:
      'আমাদের হটলাইন: ০১৭০০০০০০০০। ইমেইল: support@yourshop.com। ব্যবসার সময়: শনি–বৃহস্পতি, সকাল ১০টা – রাত ৮টা।',
    keywords: ['যোগাযোগ', 'ফোন', 'নম্বর', 'contact', 'hotline', 'support'],
  },
];

async function seed() {
  try {
    console.log('🌱 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected:', MONGO_URI);

    console.log('🧹 Clearing Agent, AIKnowledgeBase, StoreConfig...');
    await Promise.all([
      Agent.deleteMany({}),
      AIKnowledgeBase.deleteMany({}),
      StoreConfig.deleteMany({}),
    ]);

    console.log('🏪 Seeding StoreConfig...');
    await StoreConfig.create(storeConfigSeed);

    console.log('📚 Seeding AIKnowledgeBase (6 entries)...');
    await AIKnowledgeBase.insertMany(knowledgeSeed);

    console.log('👤 Creating SUPER_ADMIN agent...');
    await Agent.create({
      name: 'Super Admin',
      email: 'admin@yourshop.com',
      password: 'Admin@1234',
      role: 'SUPER_ADMIN',
      is_online: false,
      max_concurrent_chats: 10,
    });

    console.log('\n═══════════════════════════════════════════════════');
    console.log('✅ Seed completed successfully!');
    console.log('═══════════════════════════════════════════════════');
    console.log('Admin login:');
    console.log('  Email:    admin@yourshop.com');
    console.log('  Password: Admin@1234');
    console.log('');
    console.log('⚠️  IMPORTANT: Change this password after first login!');
    console.log('═══════════════════════════════════════════════════\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

seed();
