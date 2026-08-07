const OpenAI = require('openai');
const {
  AIKnowledgeBase,
  StoreConfig,
} = require('../models/AIKnowledgeBase.model');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DEFAULT_HANDOVER_KEYWORDS = [
  'রাগ',
  'প্রতারণা',
  'ঠকানো',
  'মানুষ',
  'এজেন্ট',
  'ম্যানেজার',
  'অভিযোগ',
  'manager',
  'human',
  'agent',
  'speak to someone',
  'talk to human',
  'fraud',
  'scam',
  'refund now',
  'complaint',
  'lawyer',
  'police',
  'angry',
  'frustrated',
];

/**
 * Build Bangla-first system prompt with store config + knowledge base.
 */
async function buildSystemPrompt(orderContext = null) {
  const [store, knowledgeEntries] = await Promise.all([
    StoreConfig.findOne().lean(),
    AIKnowledgeBase.find({ is_active: true }).lean(),
  ]);

  const storeName = store?.store_name || 'YourShop BD';
  const persona = store?.ai_persona_name || 'Aria';
  const tagline = store?.store_tagline || '';
  const phone = store?.contact_phone || 'N/A';
  const email = store?.contact_email || 'N/A';
  const address = store?.address || 'N/A';
  const shipping = store?.shipping_policy || 'N/A';
  const returns = store?.return_policy || 'N/A';
  const delivery = store?.delivery_time || 'N/A';
  const hours = store?.business_hours || 'N/A';

  const kbText =
    knowledgeEntries.length > 0
      ? knowledgeEntries
          .map(
            (k, i) =>
              `${i + 1}. [${k.category}] প্রশ্ন: ${k.question}\n   উত্তর: ${k.answer}\n   কীওয়ার্ড: ${(k.keywords || []).join(', ')}`
          )
          .join('\n')
      : 'কোনো জ্ঞানভাণ্ডার এন্ট্রি নেই।';

  let orderSection = '';
  if (orderContext) {
    orderSection = `
## অর্ডার কনটেক্সট
${typeof orderContext === 'string' ? orderContext : JSON.stringify(orderContext, null, 2)}
`;
  }

  return `আপনি ${persona}, ${storeName} এর বন্ধুত্বপূর্ণ ও পেশাদার AI কাস্টমার সাপোর্ট অ্যাসিস্ট্যান্ট।
ট্যাগলাইন: ${tagline}

## স্টোর তথ্য
- স্টোর: ${storeName}
- ফোন: ${phone}
- ইমেইল: ${email}
- ঠিকানা: ${address}
- ডেলিভারি সময়: ${delivery}
- শিপিং নীতি: ${shipping}
- রিটার্ন নীতি: ${returns}
- ব্যবসার সময়: ${hours}

## জ্ঞানভাণ্ডার (Knowledge Base)
${kbText}
${orderSection}
## আচরণ নির্দেশনা
1. সবসময় বাংলায় উত্তর দিন। যদি কাস্টমার ইংরেজিতে লেখেন, তখন ইংরেজিতে উত্তর দিন।
2. কাস্টমারকে সবসময় "আপনি" বলে সম্বোধন করুন।
3. সংক্ষিপ্ত, স্পষ্ট ও সহায়ক উত্তর দিন।
4. কখনো মিথ্যা প্রতিশ্রুতি দেবেন না (যেমন: গ্যারান্টিড রিফান্ড, নিশ্চিত ডেলিভারি তারিখ যদি জানা না থাকে)।
5. জ্ঞানভাণ্ডার ও স্টোর তথ্যের বাইরে অনুমান করে উত্তর দেবেন না; অনিশ্চিত হলে স্বীকার করুন।
6. যদি কাস্টমার রাগান্বিত হন, প্রতারণার অভিযোগ করেন, ম্যানেজার/মানুষ চান, জটিল রিফান্ড/অভিযোগ করেন, অথবা আপনি সমাধান দিতে না পারেন — উত্তরের শেষে অবশ্যই এই ট্যাগ যোগ করুন: [HANDOVER_REQUIRED]
7. হ্যান্ডওভারের সময় কাস্টমারকে জানান যে একজন লাইভ এজেন্ট শীঘ্রই যোগ দেবেন।
8. অর্ডার-সম্পর্কিত প্রশ্নে উপলব্ধ অর্ডার কনটেক্সট ব্যবহার করুন।`;
}

/**
 * Keyword-based handover detection (Bangla + English).
 */
async function detectHandoverNeeded(message) {
  if (!message || typeof message !== 'string') return false;

  const store = await StoreConfig.findOne().select('handover_keywords').lean();
  const keywords = [
    ...DEFAULT_HANDOVER_KEYWORDS,
    ...(store?.handover_keywords || []),
  ];

  const lower = message.toLowerCase();
  return keywords.some((kw) => {
    const needle = String(kw).toLowerCase().trim();
    return needle && lower.includes(needle);
  });
}

/**
 * Get AI response using gpt-4o-mini with last 10 messages.
 */
async function getAIResponse(messages = [], orderContext = null) {
  const systemPrompt = await buildSystemPrompt(orderContext);

  const recent = messages.slice(-10).map((m) => ({
    role: m.sender_type === 'USER' ? 'user' : 'assistant',
    content: m.message,
  }));

  // Fallback if OpenAI key missing
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('your-openai')) {
    const lastUser = [...messages].reverse().find((m) => m.sender_type === 'USER');
    const needsHandover = lastUser
      ? await detectHandoverNeeded(lastUser.message)
      : false;

    return {
      message: needsHandover
        ? 'আপনার অনুরোধটি গুরুত্বপূর্ণ। একজন লাইভ এজেন্ট শীঘ্রই আপনার সাথে যোগাযোগ করবেন।'
        : 'ধন্যবাদ! আমি আপনার প্রশ্নটি পেয়েছি। আরও বিস্তারিত জানালে আমি সাহায্য করতে পারব।',
      handover: needsHandover,
      confidence: 0.4,
      tokens_used: 0,
    };
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      max_tokens: 600,
      messages: [
        { role: 'system', content: systemPrompt },
        ...recent,
      ],
    });

    let reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      'দুঃখিত, আমি এই মুহূর্তে উত্তর দিতে পারছি না। অনুগ্রহ করে একটু পরে আবার চেষ্টা করুন।';

    let handover = reply.includes('[HANDOVER_REQUIRED]');
    reply = reply.replace(/\[HANDOVER_REQUIRED\]/g, '').trim();

    const lastUser = [...messages].reverse().find((m) => m.sender_type === 'USER');
    if (!handover && lastUser) {
      handover = await detectHandoverNeeded(lastUser.message);
    }

    const tokens_used = completion.usage?.total_tokens || 0;
    const confidence = handover ? 0.55 : 0.85;

    return {
      message: reply,
      handover,
      confidence,
      tokens_used,
    };
  } catch (err) {
    console.error('[AI Service] OpenAI error:', err.message);
    return {
      message:
        'দুঃখিত, AI সেবায় সাময়িক সমস্যা হয়েছে। অনুগ্রহ করে একটু পরে আবার চেষ্টা করুন, অথবা লাইভ এজেন্টের সাথে কথা বলুন।',
      handover: true,
      confidence: 0.2,
      tokens_used: 0,
    };
  }
}

/**
 * Welcome quick-reply buttons by chat type.
 */
function getWelcomeQuickReplies(type = 'GENERAL') {
  if (type === 'ORDER_SUPPORT') {
    return [
      { label: 'অর্ডার স্ট্যাটাস', value: 'আমার অর্ডারের বর্তমান স্ট্যাটাস জানতে চাই' },
      { label: 'ডেলিভারি সময়', value: 'আমার অর্ডার কবে ডেলিভারি হবে?' },
      { label: 'রিটার্ন/রিফান্ড', value: 'রিটার্ন বা রিফান্ড করতে চাই' },
      { label: 'লাইভ এজেন্ট', value: 'আমি একজন লাইভ এজেন্টের সাথে কথা বলতে চাই' },
    ];
  }

  return [
    { label: 'ডেলিভারি চার্জ', value: 'ডেলিভারি চার্জ কত?' },
    { label: 'পেমেন্ট পদ্ধতি', value: 'কী কী পেমেন্ট পদ্ধতি আছে?' },
    { label: 'রিটার্ন পলিসি', value: 'রিটার্ন পলিসি কী?' },
    { label: 'যোগাযোগ', value: 'আপনাদের যোগাযোগের নম্বর কী?' },
  ];
}

module.exports = {
  buildSystemPrompt,
  detectHandoverNeeded,
  getAIResponse,
  getWelcomeQuickReplies,
};
