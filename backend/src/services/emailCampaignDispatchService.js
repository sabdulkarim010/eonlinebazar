/********************************************************************
 * Project: EonlineBazar
 * File: emailCampaignDispatchService.js
 * Description: Async email/SMS/WhatsApp campaign dispatch — batch
 * processing, stats updates, and completion marking.
 ********************************************************************/

'use strict';

const Newsletter = require('../models/newsletter');
const EmailCampaign = require('../models/emailCampaign');
const User = require('../models/user');
const Order = require('../models/order');
const Settings = require('../models/Settings');
const { dualWrite } = require('../services/dualWriteService');
const { sendNewsletterCampaignEmail } = require('./mailer');
const { sendSms } = require('./smsService');
const whatsappService = require('./whatsappService');
const { buildConfirmedSubscriberQuery } = require('../utils/newsletterSubscriberHelpers');
const { generateUnsubscribeToken, buildUnsubscribeUrl } = require('./newsletterTokenService');

const VALID_SEGMENTS = ['all', 'vip', 'frequent', 'inactive', 'new'];
const VALID_CHANNELS = ['email', 'sms', 'whatsapp'];
const NEW_CUSTOMER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1000;

function getEmailCampaignRepository() {
    return require('../repositories/emailCampaignRepository');
}

async function mirrorEmailCampaign(saved) {
    await getEmailCampaignRepository().upsertFromMongo(saved);
}

async function saveCampaignDoc(campaign, operation) {
    return dualWrite(
        () => campaign.save(),
        async (saved) => { await mirrorEmailCampaign(saved); },
        {
            model: 'EmailCampaign',
            operation,
            mongoId: (saved) => String(saved._id)
        }
    );
}

function getFrontendBaseUrl() {
    return String(process.env.FRONTEND_URL || process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildCampaignRecipientQuery(targetTags = []) {
    const tags = Array.isArray(targetTags) ? targetTags.filter(Boolean) : [];
    const extra = tags.length > 0 ? { tags: { $in: tags } } : {};
    return buildConfirmedSubscriberQuery(extra);
}

function buildRecipientUnsubscribeUrl({ subscriberId, email, campaignId, legacyToken }) {
    if (subscriberId && email) {
        const token = generateUnsubscribeToken({ subscriberId, email, campaignId });
        return buildUnsubscribeUrl(token);
    }
    if (legacyToken) {
        return buildUnsubscribeUrl(legacyToken);
    }
    return buildUnsubscribeUrl('');
}

function classifyCustomerSegment(stats, thresholds) {
    const orderCount = Number(stats.orderCount) || 0;
    const totalSpent = Number(stats.totalSpent) || 0;
    const isVip = totalSpent >= Number(thresholds.vipMinTotalSpent)
        || orderCount >= Number(thresholds.vipMinOrderCount);
    const isFrequent = !isVip && orderCount >= Number(thresholds.frequentBuyerMinOrders);
    const isInactive = orderCount === 0;
    return { orderCount, totalSpent, isVip, isFrequent, isInactive };
}

async function resolveSegmentRecipients(segment, channel) {
    const [users, orderStats, masterSettings] = await Promise.all([
        User.find({ isDeleted: { $ne: true }, accountStatus: 'active' })
            .select('firstName lastName name email phone mobile createdAt')
            .lean(),
        Order.aggregate([
            { $match: { user: { $ne: null }, status: { $nin: ['Cancelled', 'Canceled'] } } },
            {
                $group: {
                    _id: '$user',
                    orderCount: { $sum: 1 },
                    totalSpent: {
                        $sum: {
                            $add: [
                                { $ifNull: ['$grandTotal', 0] },
                                { $ifNull: ['$walletApplied', 0] }
                            ]
                        }
                    }
                }
            }
        ]),
        Settings.getOrCreate()
    ]);

    const statsMap = new Map(orderStats.map((row) => [String(row._id), {
        orderCount: row.orderCount || 0,
        totalSpent: Math.round(Number(row.totalSpent) || 0)
    }]));

    const thresholds = {
        vipMinTotalSpent: masterSettings.vipMinTotalSpent,
        vipMinOrderCount: masterSettings.vipMinOrderCount,
        frequentBuyerMinOrders: masterSettings.frequentBuyerMinOrders
    };

    const now = Date.now();

    return users
        .filter((user) => {
            if (segment === 'all') return true;
            const meta = classifyCustomerSegment(statsMap.get(String(user._id)) || {}, thresholds);
            const isNew = user.createdAt && (now - new Date(user.createdAt).getTime()) <= NEW_CUSTOMER_WINDOW_MS;
            if (segment === 'vip') return meta.isVip;
            if (segment === 'frequent') return meta.isFrequent;
            if (segment === 'inactive') return meta.isInactive && !isNew;
            if (segment === 'new') return Boolean(isNew);
            return true;
        })
        .map((user) => ({
            name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.name || '',
            email: String(user.email || '').trim(),
            phone: String(user.phone || user.mobile || '').trim()
        }))
        .filter((r) => (channel === 'email' ? Boolean(r.email) : Boolean(r.phone)));
}

async function sendCampaignEmail(subscriber, campaign) {
    const unsubscribeUrl = buildRecipientUnsubscribeUrl({
        subscriberId: String(subscriber._id),
        email: subscriber.email,
        campaignId: String(campaign._id),
        legacyToken: subscriber.unsubscribeToken
    });

    const result = await sendNewsletterCampaignEmail({
        to: subscriber.email,
        subject: campaign.subject,
        htmlContent: campaign.htmlContent,
        unsubscribeUrl
    });

    if (result.delivered) {
        subscriber.emailsSent = (subscriber.emailsSent || 0) + 1;
        subscriber.lastEmailAt = new Date();
        await subscriber.save();
    }

    return result;
}

async function markCampaignFailed(campaignId) {
    await dualWrite(
        () => EmailCampaign.findByIdAndUpdate(campaignId, { status: 'failed' }, { returnDocument: 'after' }),
        async (saved) => {
            if (saved) await mirrorEmailCampaign(saved);
        },
        {
            model: 'EmailCampaign',
            operation: 'send-failed',
            mongoId: String(campaignId)
        }
    );
}

/**
 * Process an entire campaign asynchronously (worker or inline fallback).
 */
async function executeCampaignSend(campaignId) {
    const campaign = await EmailCampaign.findById(campaignId);
    if (!campaign) {
        console.warn('[EmailCampaign] Campaign not found for dispatch:', campaignId);
        return { ok: false, reason: 'not_found' };
    }

    if (campaign.status === 'sent') {
        return { ok: false, reason: 'already_sent' };
    }

    const channel = VALID_CHANNELS.includes(campaign.channel) ? campaign.channel : 'email';
    const segment = VALID_SEGMENTS.includes(campaign.targetSegment) ? campaign.targetSegment : 'all';
    const useSubscriberList = channel === 'email' && segment === 'all';

    let sentCount = Number(campaign.stats?.sent) || 0;
    let failedCount = Number(campaign.stats?.failed) || 0;
    let totalRecipients = Number(campaign.stats?.totalRecipients) || 0;

    try {
        if (useSubscriberList) {
            const subscribers = await Newsletter.find(buildCampaignRecipientQuery(campaign.targetTags));
            totalRecipients = subscribers.length;

            if (campaign.status !== 'sending') {
                campaign.status = 'sending';
            }
            campaign.stats.totalRecipients = totalRecipients;
            if (!campaign.stats.sent && !campaign.stats.failed) {
                campaign.stats.sent = 0;
                campaign.stats.failed = 0;
            }
            await saveCampaignDoc(campaign, 'send-start');

            for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
                const batch = subscribers.slice(i, i + BATCH_SIZE);
                const results = await Promise.all(
                    batch.map((sub) => sendCampaignEmail(sub, campaign).catch(() => ({ delivered: false })))
                );
                results.forEach((r) => { r.delivered ? (sentCount += 1) : (failedCount += 1); });

                campaign.stats.sent = sentCount;
                campaign.stats.failed = failedCount;
                await saveCampaignDoc(campaign, 'send-progress');

                if (i + BATCH_SIZE < subscribers.length) await sleep(BATCH_DELAY_MS);
            }
        } else {
            const recipients = await resolveSegmentRecipients(segment, channel);
            totalRecipients = recipients.length;

            if (campaign.status !== 'sending') {
                campaign.status = 'sending';
            }
            campaign.stats.totalRecipients = totalRecipients;
            campaign.stats.sent = 0;
            campaign.stats.failed = 0;
            await saveCampaignDoc(campaign, 'send-start');

            if (channel === 'whatsapp') {
                const result = await whatsappService.sendBroadcast(
                    recipients.map((r) => r.phone),
                    campaign.whatsappTemplate
                );
                sentCount = result.sent;
                failedCount = result.failed + (result.skipped || 0);
            } else if (channel === 'sms') {
                const smsBody = campaign.whatsappTemplate || campaign.subject;
                for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
                    const batch = recipients.slice(i, i + BATCH_SIZE);
                    const results = await Promise.all(
                        batch.map((r) => sendSms({ to: r.phone, body: smsBody, context: 'CAMPAIGN SMS' })
                            .catch(() => ({ delivered: false })))
                    );
                    results.forEach((r) => { r.delivered ? (sentCount += 1) : (failedCount += 1); });

                    campaign.stats.sent = sentCount;
                    campaign.stats.failed = failedCount;
                    await saveCampaignDoc(campaign, 'send-progress');

                    if (i + BATCH_SIZE < recipients.length) await sleep(BATCH_DELAY_MS);
                }
            } else {
                for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
                    const batch = recipients.slice(i, i + BATCH_SIZE);
                    const results = await Promise.all(
                        batch.map(async (r) => {
                            let unsubscribeUrl = buildUnsubscribeUrl('');
                            const matchedSub = await Newsletter.findOne({
                                email: String(r.email || '').trim().toLowerCase(),
                                isActive: true
                            }).select('_id email unsubscribeToken').lean();
                            if (matchedSub) {
                                unsubscribeUrl = buildRecipientUnsubscribeUrl({
                                    subscriberId: String(matchedSub._id),
                                    email: matchedSub.email,
                                    campaignId: String(campaign._id),
                                    legacyToken: matchedSub.unsubscribeToken
                                });
                            }
                            return sendNewsletterCampaignEmail({
                                to: r.email,
                                subject: campaign.subject,
                                htmlContent: campaign.htmlContent,
                                unsubscribeUrl
                            }).catch(() => ({ delivered: false }));
                        })
                    );
                    results.forEach((r) => { r.delivered ? (sentCount += 1) : (failedCount += 1); });

                    campaign.stats.sent = sentCount;
                    campaign.stats.failed = failedCount;
                    await saveCampaignDoc(campaign, 'send-progress');

                    if (i + BATCH_SIZE < recipients.length) await sleep(BATCH_DELAY_MS);
                }
            }
        }

        campaign.status = failedCount === totalRecipients && totalRecipients > 0 ? 'failed' : 'sent';
        campaign.sentAt = new Date();
        campaign.stats.sent = sentCount;
        campaign.stats.failed = failedCount;
        await saveCampaignDoc(campaign, 'send-complete');

        console.log(`[EmailCampaign] Completed ${campaignId} — sent=${sentCount}, failed=${failedCount}, total=${totalRecipients}`);
        return { ok: true, sentCount, failedCount, totalRecipients };
    } catch (err) {
        console.error('[EmailCampaign] Dispatch error:', campaignId, err.message);
        await markCampaignFailed(campaignId);
        throw err;
    }
}

/**
 * Validate campaign, set status to sending, and return the campaign doc.
 */
async function prepareCampaignForDispatch(campaignId) {
    const campaign = await EmailCampaign.findById(campaignId);
    if (!campaign) {
        return { ok: false, status: 404, message: 'Campaign not found' };
    }

    if (campaign.status === 'sending') {
        return { ok: false, status: 409, message: 'Campaign is already being sent' };
    }

    if (campaign.status === 'sent') {
        return { ok: false, status: 409, message: 'Campaign has already been sent' };
    }

    const scheduledAt = campaign.scheduledAt ? new Date(campaign.scheduledAt) : null;
    if (scheduledAt && scheduledAt.getTime() > Date.now()) {
        campaign.status = 'scheduled';
        await saveCampaignDoc(campaign, 'schedule');
        return {
            ok: true,
            scheduled: true,
            message: 'Campaign scheduled for future delivery',
            campaign
        };
    }

    campaign.status = 'sending';
    campaign.stats.totalRecipients = campaign.stats?.totalRecipients || 0;
    campaign.stats.sent = 0;
    campaign.stats.failed = 0;
    await saveCampaignDoc(campaign, 'send-queued');

    return { ok: true, scheduled: false, campaign };
}

module.exports = {
    executeCampaignSend,
    prepareCampaignForDispatch,
    markCampaignFailed,
    saveCampaignDoc,
    BATCH_SIZE,
    BATCH_DELAY_MS
};
