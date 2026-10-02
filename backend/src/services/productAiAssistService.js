/********************************************************************
 * Project: EonlineBazar
 * File: productAiAssistService.js
 * Description: AI product content + vision assist for admin Add Product.
 ********************************************************************/

'use strict';

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);

function normalizeContentLanguage(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'bangla') return 'bangla';
  return 'english';
}

/** @deprecated Admin catalog is English-only; kept for API compatibility. */
function normalizeNameLanguage(value) {
  const key = String(value || '').trim().toLowerCase();
  if (['bangla', 'english', 'both'].includes(key)) return key;
  return 'english';
}

const SEO_ENGLISH_RULE = `SEO fields (seoTitle, seoDescription, seoKeywords) MUST be clean English only — no Bengali script. seoTitle: max 60 characters. seoDescription: max 160 characters. seoKeywords: comma-separated English search terms.`;

function buildLanguageRules(_contentLanguage, _nameLanguage) {
  return {
    contentRule: 'Write shortDescription, detailedDescription, and keyHighlights in English only.',
    nameRule: 'The "name" field must be in English only (no Bengali script, no combined EN-BN titles).',
    bnRule: 'Also provide Bangla (বাংলা) translations in name_bn, description_bn, detailedDescription_bn, and keyHighlights_bn — these are separate fields and must NOT be merged into the English fields.',
    seoRule: SEO_ENGLISH_RULE
  };
}

function buildVisionPrompt({ productName, additionalContext }) {
  const { contentRule, nameRule, bnRule, seoRule } = buildLanguageRules();

  return `You are a senior e-commerce copywriter and catalog specialist for EOnlineBazar (Bangladesh).

Analyze the product from any attached photos and the hints below.
${contentRule}
${nameRule}
${bnRule}
${seoRule}

Product hint name: ${productName ? `"${productName}"` : '(infer from images if not provided)'}
${additionalContext ? `Additional context: ${additionalContext}` : ''}

Respond with ONLY a valid JSON object (no markdown fences, no commentary):
{
  "name": "English product title",
  "name_bn": "বাংলা পণ্যের নাম",
  "shortDescription": "one compelling English sentence under 160 characters",
  "description_bn": "one compelling Bangla sentence",
  "detailedDescription": "2-3 English paragraphs for the product detail page",
  "detailedDescription_bn": "2-3 Bangla paragraphs for the product detail page",
  "keyHighlights": ["English highlight 1", "English highlight 2", "English highlight 3"],
  "keyHighlights_bn": ["বাংলা হাইলাইট ১", "বাংলা হাইলাইট ২"],
  "suggestedCategory": "best matching category name from typical Bangladesh e-commerce (e.g. Fashion & Apparel, Electronics, Grocery, Health & Beauty, Home & Living, Kids Fashion)",
  "seoTitle": "English SEO title, max 60 characters",
  "seoDescription": "English meta description, max 160 characters",
  "seoKeywords": "comma-separated English keywords"
}

Rules:
- Never combine English and Bangla in a single string field.
- seoTitle MUST NOT exceed 60 characters.
- seoDescription length MUST NOT exceed 160 characters.
- keyHighlights and keyHighlights_bn: 3-6 concise bullet-style strings each.
- If images contradict the hint name, trust the images for factual attributes.`;
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Error('No JSON object in AI response');
  }
  return JSON.parse(stripped.slice(start, end + 1));
}

function normalizeHighlightList(raw) {
  if (Array.isArray(raw)) {
    return raw.map((h) => String(h).trim()).filter(Boolean);
  }
  return String(raw || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function normalizeAiProductPayload(raw) {
  const highlights = normalizeHighlightList(raw.keyHighlights ?? raw.highlights);
  const highlightsBn = normalizeHighlightList(raw.keyHighlights_bn ?? raw.highlights_bn);

  let seoTitle = String(raw.seoTitle || '').trim();
  if (seoTitle.length > 60) {
    seoTitle = seoTitle.slice(0, 60).trim();
  }

  let seoDescription = String(raw.seoDescription || raw.metaDescription || '').trim();
  if (seoDescription.length > 160) {
    seoDescription = seoDescription.slice(0, 157).trim() + '...';
  }

  const keywords = raw.seoKeywords ?? raw.keywords;
  const seoKeywords = Array.isArray(keywords)
    ? keywords.map((k) => String(k).trim()).filter(Boolean).join(', ')
    : String(keywords || '').trim();

  return {
    name: String(raw.name || raw.productName || '').trim(),
    name_bn: String(raw.name_bn || '').trim(),
    shortDescription: String(raw.shortDescription || raw.description || '').trim(),
    description_bn: String(raw.description_bn || '').trim(),
    detailedDescription: String(raw.detailedDescription || '').trim(),
    detailedDescription_bn: String(raw.detailedDescription_bn || '').trim(),
    keyHighlights: highlights,
    keyHighlights_bn: highlightsBn,
    suggestedCategory: String(raw.suggestedCategory || raw.category || '').trim(),
    seoTitle,
    seoDescription,
    seoKeywords
  };
}

function imageFilesToContentBlocks(files) {
  if (!Array.isArray(files) || files.length === 0) return [];

  return files
    .filter((file) => file && file.buffer && ALLOWED_IMAGE_MIMES.has(String(file.mimetype || '').toLowerCase()))
    .slice(0, 5)
    .map((file) => ({
      type: 'image',
      source: {
        type: 'base64',
        media_type: String(file.mimetype || 'image/jpeg').toLowerCase(),
        data: file.buffer.toString('base64')
      }
    }));
}

async function callAnthropicProductAssist({ prompt, imageBlocks }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const err = new Error('AI service not configured');
    err.statusCode = 503;
    throw err;
  }

  const model = process.env.ANTHROPIC_PRODUCT_AI_MODEL || 'claude-haiku-4-5-20251001';
  const content = [...imageBlocks, { type: 'text', text: prompt }];

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      messages: [{ role: 'user', content }]
    })
  });

  if (!response.ok) {
    const err = new Error('AI service unavailable');
    err.statusCode = 502;
    throw err;
  }

  const data = await response.json();
  const text = data.content?.find((block) => block.type === 'text')?.text
    || data.content?.[0]?.text
    || '';

  try {
    const parsed = extractJsonObject(text);
    return normalizeAiProductPayload(parsed);
  } catch (_parseErr) {
    const err = new Error('Could not parse AI response');
    err.statusCode = 500;
    throw err;
  }
}

async function generateProductAssistContent(options) {
  const productName = String(options.productName || '').trim();
  const additionalContext = String(options.additionalContext || '').trim();
  const files = options.files || [];

  if (productName.length < 2 && files.length === 0) {
    const err = new Error('Product name or at least one product photo is required');
    err.statusCode = 400;
    throw err;
  }

  const prompt = buildVisionPrompt({
    productName,
    additionalContext
  });

  const imageBlocks = imageFilesToContentBlocks(files);
  return callAnthropicProductAssist({ prompt, imageBlocks });
}

module.exports = {
  SEO_ENGLISH_RULE,
  normalizeContentLanguage,
  normalizeNameLanguage,
  buildLanguageRules,
  buildVisionPrompt,
  normalizeHighlightList,
  normalizeAiProductPayload,
  generateProductAssistContent
};
