/********************************************************************
 * Project: EonlineBazar
 * File: newsletterController.js
 * Description: Public newsletter subscribe / confirm / unsubscribe handlers.
 ********************************************************************/

const crypto = require('crypto');
const Newsletter = require('../models/newsletter');
const {
    sendNewsletterWelcomeEmail,
    sendNewsletterConfirmEmail
} = require('../services/mailer');
const { dualWrite } = require('../services/dualWriteService');
const { isSubscriberConfirmed } = require('../utils/newsletterSubscriberHelpers');
const {
    DEFAULT_CONFIRM_MS,
    generateConfirmToken,
    generateUnsubscribeToken,
    verifyConfirmToken,
    verifyUnsubscribeToken,
    buildConfirmUrl,
    buildUnsubscribeUrl
} = require('../services/newsletterTokenService');

function mirrorNewsletter(saved) {
    return require('../repositories/newsletterRepository').upsertFromMongo(saved);
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readString(value, max) {
    return String(value ?? '').trim().slice(0, max);
}

function getFrontendBaseUrl() {
    return String(process.env.FRONTEND_URL || process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
}

async function persistSubscriber(subscriber, operation) {
    return dualWrite(
        () => subscriber.save(),
        async (saved) => { await mirrorNewsletter(saved); },
        {
            model: 'Newsletter',
            operation,
            mongoId: (saved) => String(saved._id)
        }
    );
}

const subscribe = async (req, res) => {
    try {
        const body = req.body || {};
        const email = readString(body.email, 120).toLowerCase();
        const name = readString(body.name, 80) || null;
        const source = readString(body.source, 30) || 'footer_form';

        if (!EMAIL_REGEX.test(email)) {
            return res.status(400).json({ success: false, message: 'সঠিক ইমেইল ঠিকানা দিন' });
        }

        const allowedSources = ['footer_form', 'checkout', 'popup', 'manual'];
        const normalizedSource = allowedSources.includes(source) ? source : 'footer_form';

        let subscriber = await Newsletter.findOne({ email });

        if (subscriber && isSubscriberConfirmed(subscriber)) {
            return res.status(200).json({
                success: false,
                message: 'এই ইমেইলটি ইতিমধ্যে সাবস্ক্রাইব করা আছে'
            });
        }

        const now = new Date();
        const confirmExpiresAt = new Date(now.getTime() + DEFAULT_CONFIRM_MS);
        const confirmToken = generateConfirmToken(
            subscriber?._id || email,
            email,
            DEFAULT_CONFIRM_MS
        );

        if (subscriber) {
            subscriber.isActive = true;
            subscriber.isConfirmed = false;
            subscriber.unsubscribedAt = null;
            subscriber.subscribedAt = now;
            subscriber.confirmToken = confirmToken;
            subscriber.confirmTokenExpiresAt = confirmExpiresAt;
            subscriber.confirmedAt = null;
            if (name) subscriber.name = name;
            subscriber.source = normalizedSource;
        } else {
            subscriber = new Newsletter({
                email,
                name,
                source: normalizedSource,
                isActive: true,
                isConfirmed: false,
                subscribedAt: now,
                confirmToken,
                confirmTokenExpiresAt: confirmExpiresAt,
                unsubscribeToken: crypto.randomBytes(32).toString('hex')
            });
        }

        await persistSubscriber(subscriber, 'subscribe-pending');

        const confirmUrl = buildConfirmUrl(
            generateConfirmToken(String(subscriber._id), email, DEFAULT_CONFIRM_MS)
        );

        sendNewsletterConfirmEmail({
            to: email,
            name: subscriber.name,
            confirmUrl,
            storeUrl: getFrontendBaseUrl() || '/'
        }).catch((err) => console.error('[NEWSLETTER] Confirm email error:', err.message));

        res.status(201).json({
            success: true,
            message: 'নিশ্চিতকরণ ইমেইল পাঠানো হয়েছে। ইনবক্স চেক করে সাবস্ক্রিপশন সম্পন্ন করুন।'
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(200).json({
                success: false,
                message: 'এই ইমেইলটি ইতিমধ্যে সাবস্ক্রাইব করা আছে'
            });
        }
        console.error('Newsletter subscribe error:', error);
        res.status(500).json({ success: false, message: 'সাবস্ক্রিপশন ব্যর্থ হয়েছে। আবার চেষ্টা করুন।' });
    }
};

const confirm = async (req, res) => {
    try {
        const token = readString(req.query.token, 2048);
        if (!token) {
            return res.status(400).type('html').send(buildConfirmPage(false, 'missing_token'));
        }

        const verified = verifyConfirmToken(token);
        if (!verified.ok) {
            const status = verified.status || 400;
            return res.status(status).type('html').send(buildConfirmPage(false, 'invalid_token'));
        }

        const { subscriberId, email } = verified.decoded;
        let subscriber = await Newsletter.findById(subscriberId);
        if (!subscriber && email) {
            subscriber = await Newsletter.findOne({ email: String(email).toLowerCase() });
        }

        if (!subscriber) {
            return res.status(404).type('html').send(buildConfirmPage(false, 'not_found'));
        }

        if (isSubscriberConfirmed(subscriber)) {
            return res.type('html').send(buildConfirmPage(true, 'already_confirmed'));
        }

        subscriber.isActive = true;
        subscriber.isConfirmed = true;
        subscriber.confirmedAt = new Date();
        subscriber.confirmToken = null;
        subscriber.confirmTokenExpiresAt = null;
        if (!subscriber.unsubscribeToken) {
            subscriber.unsubscribeToken = crypto.randomBytes(32).toString('hex');
        }

        await persistSubscriber(subscriber, 'confirm');

        const baseUrl = getFrontendBaseUrl();
        const unsubscribeUrl = buildUnsubscribeUrl(
            generateUnsubscribeToken({
                subscriberId: String(subscriber._id),
                email: subscriber.email
            })
        );

        sendNewsletterWelcomeEmail({
            to: subscriber.email,
            name: subscriber.name,
            unsubscribeUrl,
            storeUrl: baseUrl || '/'
        }).catch((err) => console.error('[NEWSLETTER] Welcome email error:', err.message));

        return res.type('html').send(buildConfirmPage(true, 'confirmed'));
    } catch (error) {
        console.error('Newsletter confirm error:', error);
        res.status(500).type('html').send(buildConfirmPage(false, 'server_error'));
    }
};

async function resolveSubscriberFromUnsubscribeToken(token) {
    if (!token) return null;

    const jwtResult = verifyUnsubscribeToken(token);
    if (jwtResult.ok) {
        const { subscriberId, email } = jwtResult.decoded;
        let subscriber = await Newsletter.findById(subscriberId);
        if (!subscriber && email) {
            subscriber = await Newsletter.findOne({ email: String(email).toLowerCase() });
        }
        return subscriber;
    }

    return Newsletter.findOne({ unsubscribeToken: token });
}

async function unsubscribeSubscriber(subscriber) {
    if (!subscriber || subscriber.isActive === false) {
        return { ok: false, already: subscriber?.isActive === false };
    }

    subscriber.isActive = false;
    subscriber.unsubscribedAt = new Date();
    await persistSubscriber(subscriber, 'unsubscribe');
    return { ok: true };
}

const unsubscribeGet = async (req, res) => {
    try {
        const token = readString(req.query.token, 2048);
        if (!token) {
            return res.status(400).type('html').send(buildUnsubscribePage(false));
        }

        const subscriber = await resolveSubscriberFromUnsubscribeToken(token);
        if (!subscriber) {
            return res.status(404).type('html').send(buildUnsubscribePage(false));
        }

        const result = await unsubscribeSubscriber(subscriber);
        const baseUrl = getFrontendBaseUrl() || '/';
        res.type('html').send(buildUnsubscribePage(result.ok || result.already, baseUrl));
    } catch (error) {
        console.error('Newsletter unsubscribe error:', error);
        res.status(500).type('html').send(buildUnsubscribePage(false));
    }
};

/** RFC 8058 one-click unsubscribe (List-Unsubscribe-Post). */
const unsubscribePost = async (req, res) => {
    try {
        const token = readString(req.query.token || req.body?.token, 2048);
        if (!token) {
            return res.status(400).json({ success: false, message: 'Unsubscribe token is required.' });
        }

        const subscriber = await resolveSubscriberFromUnsubscribeToken(token);
        if (!subscriber) {
            return res.status(404).json({ success: false, message: 'Invalid unsubscribe token.' });
        }

        await unsubscribeSubscriber(subscriber);
        return res.status(200).json({ success: true, message: 'Unsubscribed successfully.' });
    } catch (error) {
        console.error('Newsletter one-click unsubscribe error:', error);
        res.status(500).json({ success: false, message: 'Failed to process unsubscribe request.' });
    }
};

function buildConfirmPage(success, reason = '') {
    const homeUrl = getFrontendBaseUrl() || '/';
    if (!success) {
        const message = reason === 'missing_token'
            ? 'নিশ্চিতকরণ লিংকটি অনুপস্থিত।'
            : reason === 'not_found'
                ? 'সাবস্ক্রাইবার খুঁজে পাওয়া যায়নি।'
                : 'নিশ্চিতকরণ লিংকটি মেয়াদোত্তীর্ণ বা অবৈধ।';
        return `<!DOCTYPE html><html lang="bn"><head><meta charset="UTF-8"><title>নিশ্চিতকরণ — EOnlineBazar</title></head><body style="font-family:Segoe UI,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;"><div style="background:#1e293b;border-radius:12px;padding:32px;max-width:480px;text-align:center;border:1px solid #334155;"><h1 style="color:#f87171;font-size:1.25rem;">${message}</h1><p><a href="${homeUrl}" style="color:#38bdf8;">হোমপেজে ফিরে যান</a></p></div></body></html>`;
    }

    const title = reason === 'already_confirmed'
        ? 'ইতিমধ্যে নিশ্চিত করা হয়েছে'
        : 'সাবস্ক্রিপশন নিশ্চিত হয়েছে';
    return `<!DOCTYPE html><html lang="bn"><head><meta charset="UTF-8"><title>${title} — EOnlineBazar</title></head><body style="font-family:Segoe UI,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;"><div style="background:#1e293b;border-radius:12px;padding:32px;max-width:480px;text-align:center;border:1px solid #334155;"><h1 style="color:#4ade80;font-size:1.25rem;">✓ ${title}</h1><p style="color:#94a3b8;">ধন্যবাদ! এখন থেকে আপনি আমাদের নিউজলেটার পাবেন।</p><p><a href="${homeUrl}" style="color:#38bdf8;">স্টোর দেখুন</a></p></div></body></html>`;
}

function buildUnsubscribePage(success, homeUrl = '/') {
    if (!success) {
        return `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>আনসাবস্ক্রাইব — EOnlineBazar</title>
  <style>
    body { font-family: 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; }
    .card { background: #1e293b; border-radius: 12px; padding: 32px; max-width: 480px; text-align: center; border: 1px solid #334155; }
    h1 { font-size: 1.25rem; margin: 0 0 12px; color: #f87171; }
    p { color: #94a3b8; line-height: 1.6; margin: 0; }
    a { color: #38bdf8; }
  </style>
</head>
<body>
  <div class="card">
    <h1>লিংকটি সঠিক নয়</h1>
    <p>আনসাবস্ক্রাইব লিংকটি মেয়াদোত্তীর্ণ বা অবৈধ। <a href="${homeUrl}">হোমপেজে ফিরে যান</a></p>
  </div>
</body>
</html>`;
    }

    return `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>আনসাবস্ক্রাইব সফল — EOnlineBazar</title>
  <style>
    body { font-family: 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; }
    .card { background: #1e293b; border-radius: 12px; padding: 32px; max-width: 480px; text-align: center; border: 1px solid #334155; }
    h1 { font-size: 1.25rem; margin: 0 0 12px; color: #4ade80; }
    p { color: #94a3b8; line-height: 1.6; margin: 0; }
    a { color: #38bdf8; text-decoration: none; font-weight: 600; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <h1>✓ আনসাবস্ক্রাইব সফল</h1>
    <p>আপনি সফলভাবে আনসাবস্ক্রাইব করেছেন।<br>
    আবার সাবস্ক্রাইব করতে চাইলে <a href="${homeUrl}">এখানে ক্লিক করুন</a></p>
  </div>
</body>
</html>`;
}

module.exports = {
    subscribe,
    confirm,
    unsubscribe: unsubscribeGet,
    unsubscribePost,
    resolveSubscriberFromUnsubscribeToken,
    unsubscribeSubscriber
};
