/********************************************************************
 * Project: EonlineBazar
 * File: newsletterTokenService.js
 * Description: Signed JWT tokens for newsletter confirm + unsubscribe.
 ********************************************************************/

'use strict';

const jwt = require('jsonwebtoken');

const CONFIRM_PURPOSE = 'newsletter_confirm';
const UNSUBSCRIBE_PURPOSE = 'newsletter_unsubscribe';
const DEFAULT_CONFIRM_MS = 48 * 60 * 60 * 1000;
const DEFAULT_UNSUBSCRIBE_MS = 365 * 24 * 60 * 60 * 1000;

function getNewsletterSecret() {
    return process.env.NEWSLETTER_TOKEN_SECRET || process.env.JWT_SECRET || 'newsletter-token-dev-secret';
}

function getApiBaseUrl() {
    return String(process.env.API_PUBLIC_URL || process.env.FRONTEND_URL || process.env.PUBLIC_BASE_URL || '')
        .replace(/\/$/, '');
}

function signNewsletterToken(payload, expiresInSeconds) {
    return jwt.sign(payload, getNewsletterSecret(), { expiresIn: expiresInSeconds });
}

function verifyNewsletterToken(token, expectedPurpose) {
    try {
        const decoded = jwt.verify(String(token || ''), getNewsletterSecret());
        if (decoded?.purpose !== expectedPurpose) {
            return { ok: false, status: 400, message: 'Invalid token purpose.' };
        }
        return { ok: true, decoded };
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return { ok: false, status: 410, message: 'This link has expired. Please subscribe again.' };
        }
        return { ok: false, status: 400, message: 'Invalid or expired token.' };
    }
}

function generateConfirmToken(subscriberId, email, expiryMs = DEFAULT_CONFIRM_MS) {
    const ttlSec = Math.max(300, Math.floor((Number(expiryMs) || DEFAULT_CONFIRM_MS) / 1000));
    return signNewsletterToken({
        purpose: CONFIRM_PURPOSE,
        subscriberId: String(subscriberId),
        email: String(email || '').trim().toLowerCase()
    }, ttlSec);
}

function generateUnsubscribeToken({ subscriberId, email, campaignId = null }, expiryMs = DEFAULT_UNSUBSCRIBE_MS) {
    const ttlSec = Math.max(3600, Math.floor((Number(expiryMs) || DEFAULT_UNSUBSCRIBE_MS) / 1000));
    return signNewsletterToken({
        purpose: UNSUBSCRIBE_PURPOSE,
        subscriberId: String(subscriberId),
        email: String(email || '').trim().toLowerCase(),
        campaignId: campaignId ? String(campaignId) : null
    }, ttlSec);
}

function verifyConfirmToken(token) {
    return verifyNewsletterToken(token, CONFIRM_PURPOSE);
}

function verifyUnsubscribeToken(token) {
    return verifyNewsletterToken(token, UNSUBSCRIBE_PURPOSE);
}

function buildConfirmUrl(token) {
    const base = getApiBaseUrl();
    const path = `/api/newsletter/confirm?token=${encodeURIComponent(token)}`;
    return base ? `${base}${path}` : path;
}

function buildUnsubscribeUrl(token) {
    const base = getApiBaseUrl();
    const path = `/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
    return base ? `${base}${path}` : path;
}

function buildListUnsubscribeHeaders(unsubscribeUrl) {
    const url = String(unsubscribeUrl || '').trim();
    if (!url) return {};

    return {
        'List-Unsubscribe': `<${url}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    };
}

module.exports = {
    CONFIRM_PURPOSE,
    UNSUBSCRIBE_PURPOSE,
    DEFAULT_CONFIRM_MS,
    generateConfirmToken,
    generateUnsubscribeToken,
    verifyConfirmToken,
    verifyUnsubscribeToken,
    buildConfirmUrl,
    buildUnsubscribeUrl,
    buildListUnsubscribeHeaders
};
