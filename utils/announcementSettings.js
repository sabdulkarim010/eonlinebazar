/********************************************************************
 * Project: EonlineBazar
 * File: announcementSettings.js
 * Location: utils/announcementSettings.js
 * Description: Shared helpers for profile dashboard announcements.
 * The announcement text is derived from the same free-shipping
 * threshold and reward rates that checkout and the wallet use, so the
 * customer never sees a figure the cart will not honour.
 ********************************************************************/

const Setting = require('../models/Setting');

const FALLBACK_THRESHOLD = 2000;

const DEFAULT_ANNOUNCEMENT = Object.freeze({
    announcementText: '',
    announcementDiscount: String(FALLBACK_THRESHOLD),
    freeShippingThreshold: FALLBACK_THRESHOLD,
    isAnnouncementActive: true
});

const DEFAULT_DISPLAY_TEXT =
    'Enjoy Free Shipping on orders over ৳2,000! Earn double loyalty points on every purchase this week.';

const formatTaka = (value) => `৳${Number(value || 0).toLocaleString('en-US')}`;

/**
 * Pulls a usable number out of the legacy free-text discount field.
 * Values such as "10%" are display-only and yield null.
 */
function parseLegacyDiscountAmount(rawValue) {
    const raw = String(rawValue ?? '').trim();
    if (!raw || raw.includes('%')) return null;

    const parsed = Number(raw.replace(/[,৳\s]/g, ''));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Resolves the free-shipping threshold from the master document, falling
 * back through the legacy fields so pre-existing stores keep their value.
 * @param {object} doc - master Setting document (or plain object)
 * @param {number} [legacyFallback] - Settings.freeShippingMinAmount
 */
function resolveFreeShippingThreshold(doc = {}, legacyFallback = null) {
    const configured = Number(doc?.freeShippingThreshold);
    if (Number.isFinite(configured) && configured >= 0) return configured;

    const fallback = Number(legacyFallback);
    if (Number.isFinite(fallback) && fallback >= 0) return fallback;

    const legacyDiscount = parseLegacyDiscountAmount(doc?.announcementDiscount);
    if (legacyDiscount !== null) return legacyDiscount;

    return FALLBACK_THRESHOLD;
}

function normalizeAnnouncementSettings(doc = {}, legacyFallback = null) {
    const freeShippingThreshold = resolveFreeShippingThreshold(doc, legacyFallback);
    const announcementDiscount = String(
        doc?.announcementDiscount ?? String(freeShippingThreshold)
    ).trim();

    return {
        announcementText: String(doc?.announcementText ?? '').trim(),
        announcementDiscount,
        freeShippingThreshold,
        isAnnouncementActive: doc?.isAnnouncementActive !== false
    };
}

/**
 * Builds the auto-generated announcement: a free-shipping sentence driven by
 * the live threshold, plus a rewards sentence driven by the live cashback and
 * loyalty rates when those are enabled.
 */
function buildDefaultAnnouncementText(thresholdValue, rewardSettings = null) {
    const threshold = Number(thresholdValue);
    const shippingSentence = Number.isFinite(threshold) && threshold > 0
        ? `Enjoy Free Shipping on orders over ${formatTaka(threshold)}!`
        : 'Enjoy Free Shipping on every order!';

    const cashback = Number(rewardSettings?.cashbackPercentage);
    const takaPerPoint = Number(rewardSettings?.takaToPointsRatio);
    const perks = [];

    if (Number.isFinite(cashback) && cashback > 0) {
        perks.push(`${cashback}% cashback straight to your wallet`);
    }
    if (Number.isFinite(takaPerPoint) && takaPerPoint > 0) {
        perks.push(`1 loyalty point for every ${formatTaka(takaPerPoint)} you spend`);
    }

    if (perks.length === 0) {
        return shippingSentence;
    }

    return `${shippingSentence} Earn ${perks.join(' and ')}.`;
}

function resolveAnnouncementDisplayText(settings, rewardSettings = null) {
    const normalized = normalizeAnnouncementSettings(settings);
    if (!normalized.isAnnouncementActive) {
        return null;
    }

    if (normalized.announcementText) {
        return normalized.announcementText;
    }

    return buildDefaultAnnouncementText(normalized.freeShippingThreshold, rewardSettings);
}

/**
 * Structured facts behind the announcement so the customer dashboard can
 * render live chips instead of parsing the sentence.
 */
function buildAnnouncementHighlights(normalized, rewardSettings = null) {
    const highlights = [];
    const threshold = Number(normalized.freeShippingThreshold);

    highlights.push({
        key: 'freeShipping',
        icon: 'truck-fast',
        label: 'Free Shipping',
        value: threshold > 0 ? `Orders over ${formatTaka(threshold)}` : 'On every order'
    });

    const cashback = Number(rewardSettings?.cashbackPercentage);
    if (Number.isFinite(cashback) && cashback > 0) {
        highlights.push({
            key: 'cashback',
            icon: 'wallet',
            label: 'Cashback',
            value: `${cashback}% per delivered order`
        });
    }

    const takaPerPoint = Number(rewardSettings?.takaToPointsRatio);
    if (Number.isFinite(takaPerPoint) && takaPerPoint > 0) {
        highlights.push({
            key: 'points',
            icon: 'star',
            label: 'Loyalty Points',
            value: `1 point per ${formatTaka(takaPerPoint)}`
        });
    }

    return highlights;
}

function toPublicAnnouncementPayload(settings, rewardSettings = null) {
    const normalized = normalizeAnnouncementSettings(settings);
    return {
        ...normalized,
        displayText: resolveAnnouncementDisplayText(normalized, rewardSettings),
        defaultText: buildDefaultAnnouncementText(normalized.freeShippingThreshold, rewardSettings),
        highlights: normalized.isAnnouncementActive
            ? buildAnnouncementHighlights(normalized, rewardSettings)
            : []
    };
}

async function loadAnnouncementSettings() {
    const doc = await Setting.getOrCreate();
    return normalizeAnnouncementSettings(doc);
}

module.exports = {
    FALLBACK_THRESHOLD,
    DEFAULT_ANNOUNCEMENT,
    DEFAULT_DISPLAY_TEXT,
    formatTaka,
    parseLegacyDiscountAmount,
    resolveFreeShippingThreshold,
    normalizeAnnouncementSettings,
    buildDefaultAnnouncementText,
    buildAnnouncementHighlights,
    resolveAnnouncementDisplayText,
    toPublicAnnouncementPayload,
    loadAnnouncementSettings
};
