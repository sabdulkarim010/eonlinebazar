/**
 * Default FAQ knowledge-base entries (Bangla-first bilingual).
 * Used by seed.js and POST /api/knowledge/seed-defaults.
 */
const DEFAULT_KNOWLEDGE_ENTRIES = [
  {
    category: 'SHIPPING',
    question: 'ডেলিভারি চার্জ কত? / What are the delivery charges?',
    answer:
      'ঢাকার মধ্যে মাত্র ৬০ টাকায় ১-২ দিনে ডেলিভারি।\nঢাকার বাইরে ১২০ টাকায় ৩-৫ দিনে ডেলিভারি।\n১০০০ টাকার উপরে অর্ডারে সম্পূর্ণ বিনামূল্যে ডেলিভারি! 🎉',
    keywords: [
      'ডেলিভারি',
      'চার্জ',
      'খরচ',
      'delivery',
      'charge',
      'fee',
      'shipping',
    ],
    is_active: true,
  },
  {
    category: 'SHIPPING',
    question: 'কতদিনে পণ্য পাবো?',
    answer:
      'অর্ডার কনফার্মের ২৪ ঘণ্টার মধ্যে আমরা পাঠিয়ে দিই।\nঢাকায়: ১-২ কার্যদিবস। ঢাকার বাইরে: ৩-৫ কার্যদিবস।',
    keywords: ['কতদিন', 'সময়', 'দিন', 'when', 'days', 'how long'],
    is_active: true,
  },
  {
    category: 'PAYMENT',
    question: 'কোন কোন পেমেন্ট পদ্ধতিতে অর্ডার করতে পারবো?',
    answer:
      'আমরা সাপোর্ট করি:\n✅ বিকাশ (bKash)\n✅ নগদ (Nagad)\n✅ রকেট (Rocket)\n✅ ভিসা/মাস্টারকার্ড\n✅ ক্যাশ অন ডেলিভারি (COD) — ঘরে বসে পেমেন্ট!',
    keywords: [
      'পেমেন্ট',
      'বিকাশ',
      'নগদ',
      'রকেট',
      'কার্ড',
      'ক্যাশ',
      'bkash',
      'nagad',
    ],
    is_active: true,
  },
  {
    category: 'RETURN',
    question: 'পণ্য ফেরত বা পরিবর্তন করতে পারবো?',
    answer:
      'অবশ্যই! পণ্য পাওয়ার ৭ দিনের মধ্যে রিটার্ন করতে পারবেন।\nশর্ত: পণ্য অব্যবহৃত ও মূল প্যাকেজিংয়ে থাকতে হবে।\nরিটার্নের জন্য আমাদের হেল্পলাইনে কল করুন বা চ্যাটে জানান।',
    keywords: [
      'রিটার্ন',
      'ফেরত',
      'বদলানো',
      'exchange',
      'return',
      'replace',
    ],
    is_active: true,
  },
  {
    category: 'ORDER',
    question: 'আমার অর্ডার কোথায় আছে?',
    answer:
      'আপনার অ্যাকাউন্টে লগইন করে "আমার অর্ডার" সেকশন থেকে\nরিয়েল-টাইম ট্র্যাকিং দেখতে পাবেন।\nঅর্ডার শিপ হলে SMS-এ ট্র্যাকিং নম্বর পাঠানো হয়।',
    keywords: [
      'ট্র্যাক',
      'অর্ডার',
      'কোথায়',
      'track',
      'order',
      'status',
      'where',
    ],
    is_active: true,
  },
  {
    category: 'CONTACT',
    question: 'কাস্টমার কেয়ারে কীভাবে যোগাযোগ করবো?',
    answer:
      '📞 হেল্পলাইন: 01XXXXXXXXX\n📧 ইমেইল: support@eonlinebazar.com\n⏰ অফিস সময়: শনি-বৃহস্পতি, সকাল ৯টা – রাত ৯টা\nএই চ্যাটেও আমরা সবসময় আছি! 😊',
    keywords: [
      'ফোন',
      'কল',
      'যোগাযোগ',
      'ইমেইল',
      'contact',
      'phone',
      'email',
      'helpline',
    ],
    is_active: true,
  },
  {
    category: 'PAYMENT',
    question: 'ক্যাশ অন ডেলিভারি (COD) কি পাওয়া যায়?',
    answer:
      'হ্যাঁ! সারা বাংলাদেশে ক্যাশ অন ডেলিভারি পাওয়া যায়।\nপণ্য হাতে পাওয়ার পরে টাকা দিন — কোনো ঝামেলা নেই! ✅',
    keywords: ['COD', 'ক্যাশ', 'ঘরে বসে', 'cash on delivery'],
    is_active: true,
  },
  {
    category: 'GENERAL',
    question: 'পণ্য কি আসল/অরিজিনাল?',
    answer:
      'হ্যাঁ! EonlineBazar-এর সকল পণ্য ১০০% অরিজিনাল।\nপ্রতিটি পণ্য পাঠানোর আগে কোয়ালিটি চেক করা হয়।\nনকল পণ্যের অভিযোগ পেলে সাথে সাথে ফেরত দেওয়া হয়।',
    keywords: [
      'অরিজিনাল',
      'আসল',
      'নকল',
      'কোয়ালিটি',
      'original',
      'authentic',
      'quality',
    ],
    is_active: true,
  },
];

const DEFAULT_STORE_CONFIG = {
  store_name: 'EonlineBazar',
  store_tagline: 'Your trusted online shop in Bangladesh',
  contact_phone: '01XXXXXXXXX',
  contact_email: 'support@eonlinebazar.com',
  address: '',
  shipping_policy:
    'ঢাকার মধ্যে: ৬০ টাকা, ১-২ দিন।\nঢাকার বাইরে: ১২০ টাকা, ৩-৫ দিন।\n১০০০ টাকার উপরে অর্ডারে ফ্রি ডেলিভারি।',
  return_policy:
    'পণ্য পাওয়ার ৭ দিনের মধ্যে রিটার্ন করা যাবে।\nপণ্য অব্যবহৃত ও মূল প্যাকেজিংয়ে থাকতে হবে।\nরিটার্নের জন্য হেল্পলাইনে কল করুন বা চ্যাটে জানান।',
  delivery_time:
    'অর্ডার কনফার্মের ২৪ ঘণ্টার মধ্যে পাঠানো হয়। ঢাকা: ১-২ দিন, বাইরে: ৩-৫ দিন।',
  business_hours: 'Sat–Thu: 9AM–9PM, Fri: 2PM–8PM',
  ai_persona_name: 'Aria',
  ai_language: 'auto',
  handover_keywords: [
    'রাগ',
    'প্রতারণা',
    'ম্যানেজার',
    'human',
    'manager',
    'refund now',
    'fraud',
  ],
  canned_responses: [
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
};

module.exports = {
  DEFAULT_KNOWLEDGE_ENTRIES,
  DEFAULT_STORE_CONFIG,
};
