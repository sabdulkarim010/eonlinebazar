/********************************************************************
 * Project: EonlineBazar
 * File: newsletterController.js
 * Description: Public newsletter subscribe / unsubscribe handlers.
 ********************************************************************/

const crypto = require('crypto');
const Newsletter = require('../models/newsletter');
const { sendNewsletterWelcomeEmail } = require('../utils/mailer');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readString(value, max) {
    return String(value ?? '').trim().slice(0, max);
}

function getFrontendBaseUrl() {
    return String(process.env.FRONTEND_URL || process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
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

        if (subscriber && subscriber.isActive) {
            return res.status(200).json({
                success: false,
                message: 'এই ইমেইলটি ইতিমধ্যে সাবস্ক্রাইব করা আছে'
            });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const now = new Date();

        if (subscriber && !subscriber.isActive) {
            subscriber.isActive = true;
            subscriber.unsubscribedAt = null;
            subscriber.subscribedAt = now;
            subscriber.unsubscribeToken = token;
            if (name) subscriber.name = name;
            subscriber.source = normalizedSource;
        } else {
            subscriber = new Newsletter({
                email,
                name,
                source: normalizedSource,
                isActive: true,
                subscribedAt: now,
                unsubscribeToken: token
            });
        }

        await subscriber.save();

        const baseUrl = getFrontendBaseUrl();
        const unsubscribeUrl = `${baseUrl}/api/newsletter/unsubscribe?token=${token}`;

        sendNewsletterWelcomeEmail({
            to: email,
            name: subscriber.name,
            unsubscribeUrl,
            storeUrl: baseUrl || '/'
        }).catch((err) => console.error('Newsletter welcome email error:', err.message));

        res.status(201).json({
            success: true,
            message: 'সাবস্ক্রিপশন সফল হয়েছে!'
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

const unsubscribe = async (req, res) => {
    try {
        const token = readString(req.query.token, 128);
        if (!token) {
            return res.status(400).type('html').send(buildUnsubscribePage(false));
        }

        const subscriber = await Newsletter.findOne({ unsubscribeToken: token });
        if (!subscriber) {
            return res.status(404).type('html').send(buildUnsubscribePage(false));
        }

        subscriber.isActive = false;
        subscriber.unsubscribedAt = new Date();
        await subscriber.save();

        const baseUrl = getFrontendBaseUrl() || '/';
        res.type('html').send(buildUnsubscribePage(true, baseUrl));
    } catch (error) {
        console.error('Newsletter unsubscribe error:', error);
        res.status(500).type('html').send(buildUnsubscribePage(false));
    }
};

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

module.exports = { subscribe, unsubscribe };
