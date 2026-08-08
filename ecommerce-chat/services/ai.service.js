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

function languageInstruction(aiLanguage = 'auto') {
  if (aiLanguage === 'bn') {
    return `LANGUAGE RULE (CRITICAL):
- Always respond ONLY in Bangla.
- Never switch to English mid-response.
- This rule overrides everything else.`;
  }
  if (aiLanguage === 'en') {
    return `LANGUAGE RULE (CRITICAL):
- Always respond ONLY in English.
- Never switch to Bangla mid-response.
- This rule overrides everything else.`;
  }
  return `LANGUAGE RULE (CRITICAL):
- Detect the language of the customer's last message.
- If they write in Bangla → respond ONLY in Bangla.
- If they write in English → respond ONLY in English.
- If they mix both → respond in Bangla (default).
- Never switch languages mid-response.
- This rule overrides everything else.`;
}

/**
 * Build bilingual system prompt with store config + full knowledge base.
 */
async function buildSystemPrompt(orderContext = null) {
  const [store, knowledgeEntries] = await Promise.all([
    StoreConfig.findOne().lean(),
    // Include ALL active entries regardless of language — AI will rephrase.
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
  const aiLanguage = store?.ai_language || 'auto';

  const kbText =
    knowledgeEntries.length > 0
      ? knowledgeEntries
          .map(
            (k, i) =>
              `${i + 1}. [${k.category}] Q: ${k.question}\n   A: ${k.answer}\n   Keywords: ${(k.keywords || []).join(', ')}`
          )
          .join('\n')
      : 'No knowledge base entries.';

  let orderSection = '';
  if (orderContext) {
    orderSection = `
## ORDER CONTEXT
${typeof orderContext === 'string' ? orderContext : JSON.stringify(orderContext, null, 2)}
`;
  }

  return `You are ${persona}, the friendly and professional AI customer support assistant for ${storeName}.
Tagline: ${tagline}

${languageInstruction(aiLanguage)}

## STORE INFO
- Store: ${storeName}
- Phone: ${phone}
- Email: ${email}
- Address: ${address}
- Delivery time: ${delivery}
- Shipping policy: ${shipping}
- Return policy: ${returns}
- Business hours: ${hours}

## KNOWLEDGE BASE (reference material — all languages included)
Use the knowledge base answers as reference, but rephrase them naturally in whatever language the customer is using.
Do not copy answers verbatim if the customer's language differs from the stored answer language.

${kbText}
${orderSection}
## BEHAVIOR RULES
1. Address the customer politely (আপনি / you).
2. Keep answers short, clear, and helpful.
3. Never make false promises (guaranteed refunds, exact delivery dates when unknown).
4. Do not invent facts outside store info and knowledge base; admit uncertainty when needed.
5. If the customer is angry, alleges fraud, asks for a manager/human, has a complex refund/complaint, or you cannot solve it — end with: [HANDOVER_REQUIRED]
6. On handover, tell the customer a live agent will join shortly.
7. Use order context when answering order-related questions.`;
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
      { label: '📦 Where is my order?', value: 'Where is my order right now?' },
      { label: '🔄 Return this order', value: 'I want to return this order' },
      { label: '❌ Cancel order', value: 'I want to cancel my order' },
      { label: '👤 Talk to Agent', value: 'Connect me to a live agent' },
    ];
  }

  return [
    { label: '🚚 Delivery Charges', value: 'What are the delivery charges?' },
    { label: '📦 Track My Order', value: 'How do I track my order?' },
    { label: '🔄 Return Policy', value: 'Can I return a product?' },
    { label: '👤 Talk to Human', value: 'I want to talk to a live agent' },
  ];
}

module.exports = {
  buildSystemPrompt,
  detectHandoverNeeded,
  getAIResponse,
  getWelcomeQuickReplies,
};
