/**
 * Auto-fill missing Bangla product fields from English on admin save.
 * Uses Anthropic when ANTHROPIC_API_KEY is set; no-op otherwise (tests/dev).
 */
'use strict';

const { normalizeHighlightList } = require('./productAiAssistService');

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

function isEmptyBn(value) {
  if (value == null) return true;
  if (Array.isArray(value)) return value.filter(Boolean).length === 0;
  return !String(value).trim();
}

function buildTranslatePrompt(payload) {
  const highlights = Array.isArray(payload.highlights) ? payload.highlights : [];
  return `You are a professional Bengali (বাংলা) e-commerce translator for Bangladesh.

Translate ONLY the English product catalog fields below into natural, customer-friendly Bengali.
Do NOT change meaning. Do NOT mix English into Bengali fields.

Respond with ONLY a valid JSON object (no markdown):
{
  "name_bn": "…",
  "description_bn": "…",
  "detailedDescription_bn": "…",
  "highlights_bn": ["…", "…"]
}

English fields:
name: ${String(payload.name || '').trim()}
description: ${String(payload.description || '').trim()}
detailedDescription: ${String(payload.detailedDescription || '').trim()}
highlights: ${JSON.stringify(highlights)}`;
}

async function callAnthropicTranslate(prompt, fetchImpl = global.fetch) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const model = process.env.ANTHROPIC_PRODUCT_AI_MODEL || 'claude-haiku-4-5-20251001';
  const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
    })
  });

  if (!response.ok) {
    throw new Error(`AI translate HTTP ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.find((block) => block.type === 'text')?.text
    || data.content?.[0]?.text
    || '';
  return extractJsonObject(text);
}

/**
 * @param {Record<string, unknown>} target Fields to persist (mutated in place)
 * @param {Record<string, unknown>|null} [existing] Existing Mongo doc for partial updates
 * @param {{ fetchImpl?: typeof fetch }} [options]
 */
async function enrichMissingBanglaFields(target, existing = null, options = {}) {
  if (!target || typeof target !== 'object') return target;

  const nameEn = String(target.name ?? existing?.name ?? '').trim();
  const descEn = String(target.description ?? existing?.description ?? '').trim();
  const detailedEn = String(
    target.detailedDescription ?? existing?.detailedDescription ?? ''
  ).trim();
  const highlightsEn = Array.isArray(target.highlights)
    ? target.highlights
    : (Array.isArray(existing?.highlights) ? existing.highlights : []);

  const needName = nameEn && isEmptyBn(target.name_bn ?? existing?.name_bn);
  const needDesc = descEn && isEmptyBn(target.description_bn ?? existing?.description_bn);
  const needDetailed = detailedEn && isEmptyBn(
    target.detailedDescription_bn ?? existing?.detailedDescription_bn
  );
  const needHighlights = highlightsEn.length > 0 && isEmptyBn(
    target.highlights_bn ?? existing?.highlights_bn
  );

  if (!needName && !needDesc && !needDetailed && !needHighlights) {
    return target;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return target;
  }

  try {
    const prompt = buildTranslatePrompt({
      name: nameEn,
      description: descEn,
      detailedDescription: detailedEn,
      highlights: highlightsEn
    });
    const parsed = await callAnthropicTranslate(prompt, options.fetchImpl);
    if (!parsed || typeof parsed !== 'object') return target;

    if (needName && parsed.name_bn) {
      target.name_bn = String(parsed.name_bn).trim();
    }
    if (needDesc && parsed.description_bn) {
      target.description_bn = String(parsed.description_bn).trim();
    }
    if (needDetailed && parsed.detailedDescription_bn) {
      target.detailedDescription_bn = String(parsed.detailedDescription_bn).trim();
    }
    if (needHighlights && parsed.highlights_bn) {
      target.highlights_bn = normalizeHighlightList(parsed.highlights_bn);
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('[productAutoTranslate]', err.message || err);
    }
  }

  return target;
}

module.exports = {
  enrichMissingBanglaFields,
  buildTranslatePrompt,
  isEmptyBn
};
