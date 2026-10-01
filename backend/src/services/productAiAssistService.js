/********************************************************************
 * Project: EonlineBazar
 * File: productAiAssistService.js
 * Description: AI product content + vision assist for admin Add Product.
 ********************************************************************/

'use strict';

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);

function normalizeLanguage(value, allowed, fallback) {
  const key = String(value || '').trim().toLowerCase();
  if (allowed.includes(key)) return key;
  return fallback;
}

function normalizeContentLanguage(value) {
  return normalizeLanguage(value, ['bangla', 'english'], 'english');
}

function normalizeNameLanguage(value) {
  return normalizeLanguage(value, ['bangla', 'english', 'both'], 'english');
}

function buildLanguageRules(contentLanguage, nameLanguage) {
  const contentRule = contentLanguage === 'bangla'
    ? 'Write shortDescription, detailedDescription, keyHighlights, seoTitle, seoDescription, and seoKeywords in Bangla (বাংলা) only.'
    : 'Write shortDescription, detailedDescription, keyHighlights, seoTitle, seoDescription, and seoKeywords in English only.';

  let nameRule;
  if (nameLanguage === 'bangla') {
    nameRule = 'The "name" field must be in Bangla (বাংলা) only.';
  } else if (nameLanguage === 'both') {
    nameRule = 'The "name" field must combine English and Bangla in this exact pattern: "English Name - বাংলা নাম" (English first, then " - ", then Bangla name).';
  } else {
    nameRule = 'The "name" field must be in English only.';
  }

  return { contentRule, nameRule };
}

function buildVisionPrompt({ productName, additionalContext, contentLanguage, nameLanguage }) {
  const { contentRule, nameRule } = buildLanguageRules(contentLanguage, nameLanguage);

  return `You are a senior e-commerce copywriter and catalog specialist for EOnlineBazar (Bangladesh).

Analyze the product from any attached photos and the hints below. ${contentRule}
${nameRule}

Product hint name: ${productName ? `"${productName}"` : '(infer from images if not provided)'}
${additionalContext ? `Additional context: ${additionalContext}` : ''}

Respond with ONLY a valid JSON object (no markdown fences, no commentary):
{
  "name": "product title following the name language rule",
  "shortDescription": "one compelling sentence under 160 characters",
  "detailedDescription": "2-3 paragraphs suitable for a product detail page",
  "keyHighlights": ["highlight 1", "highlight 2", "highlight 3", "highlight 4"],
  "suggestedCategory": "best matching category name from typical Bangladesh e-commerce (e.g. Fashion & Apparel, Electronics, Grocery, Health & Beauty, Home & Living, Kids Fashion)",
  "seoTitle": "SEO title under 60 characters when possible",
  "seoDescription": "meta description MUST be 160 characters or fewer",
  "seoKeywords": "comma, separated, keywords"
}

Rules:
- seoDescription length MUST NOT exceed 160 characters.
- keyHighlights: 3-6 concise bullet-style strings.
- If images contradict the hint name, trust the images for factual attributes but still follow language rules.`;
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

function normalizeAiProductPayload(raw) {
  const highlightsRaw = raw.keyHighlights ?? raw.highlights ?? [];
  const highlights = Array.isArray(highlightsRaw)
    ? highlightsRaw.map((h) => String(h).trim()).filter(Boolean)
    : String(highlightsRaw || '').split(',').map((s) => s.trim()).filter(Boolean);

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
    shortDescription: String(raw.shortDescription || '').trim(),
    detailedDescription: String(raw.detailedDescription || '').trim(),
    keyHighlights: highlights,
    suggestedCategory: String(raw.suggestedCategory || raw.category || '').trim(),
    seoTitle: String(raw.seoTitle || '').trim(),
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
  const contentLanguage = normalizeContentLanguage(options.contentLanguage);
  const nameLanguage = normalizeNameLanguage(options.nameLanguage);
  const files = options.files || [];

  if (productName.length < 2 && files.length === 0) {
    const err = new Error('Product name or at least one product photo is required');
    err.statusCode = 400;
    throw err;
  }

  const prompt = buildVisionPrompt({
    productName,
    additionalContext,
    contentLanguage,
    nameLanguage
  });

  const imageBlocks = imageFilesToContentBlocks(files);
  return callAnthropicProductAssist({ prompt, imageBlocks });
}

module.exports = {
  normalizeContentLanguage,
  normalizeNameLanguage,
  buildLanguageRules,
  buildVisionPrompt,
  normalizeAiProductPayload,
  generateProductAssistContent
};
