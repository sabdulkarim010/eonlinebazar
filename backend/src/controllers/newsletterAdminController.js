/********************************************************************
 * Project: EonlineBazar
 * File: newsletterAdminController.js
 * Description: Admin newsletter subscribers & email campaign handlers.
 ********************************************************************/

const Newsletter = require('../models/newsletter');
const EmailCampaign = require('../models/emailCampaign');
const User = require('../models/user');
const Order = require('../models/order');
const Setting = require('../models/Setting');
const { sendNewsletterCampaignEmail } = require('../services/mailer');
const { sendSms } = require('../services/smsService');
const whatsappService = require('../services/whatsappService');

const VALID_SEGMENTS = ['all', 'vip', 'frequent', 'inactive', 'new'];
const VALID_CHANNELS = ['email', 'sms', 'whatsapp'];
const NEW_CUSTOMER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// Mirrors resolveCustomerSegment in admin/customerAdminController.js so campaign
// targeting uses the same VIP / Frequent / Inactive thresholds as the customer list.
function classifyCustomerSegment(stats, thresholds) {
    const orderCount = Number(stats.orderCount) || 0;
    const totalSpent = Number(stats.totalSpent) || 0;
    const isVip = totalSpent >= Number(thresholds.vipMinTotalSpent)
        || orderCount >= Number(thresholds.vipMinOrderCount);
    const isFrequent = !isVip && orderCount >= Number(thresholds.frequentBuyerMinOrders);
    const isInactive = orderCount === 0;
    return { orderCount, totalSpent, isVip, isFrequent, isInactive };
}

/**
 * Resolve the customers a segmented campaign should reach. Returns lightweight
 * recipient objects { name, email, phone }. `channel` decides whether an email
 * or a phone number is the required contact field.
 */
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
        Setting.getOrCreate()
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

function readString(value, max) {
    return String(value ?? '').trim().slice(0, max);
}

function parseTagsInput(value) {
    if (Array.isArray(value)) {
        return value.map((t) => readString(t, 50).toLowerCase()).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value.split(',').map((t) => readString(t, 50).toLowerCase()).filter(Boolean);
    }
    return [];
}

function getFrontendBaseUrl() {
    return String(process.env.FRONTEND_URL || process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSubscriberQuery({ isActive, tag, search }) {
    const query = {};

    if (isActive === 'true') query.isActive = true;
    else if (isActive === 'false') query.isActive = false;

    if (tag) {
        query.tags = readString(tag, 50).toLowerCase();
    }

    if (search) {
        const term = readString(search, 80);
        const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        query.$or = [{ email: regex }, { name: regex }];
    }

    return query;
}

function buildCampaignRecipientQuery(targetTags = []) {
    const query = { isActive: true };
    const tags = Array.isArray(targetTags) ? targetTags.filter(Boolean) : [];
    if (tags.length > 0) {
        query.tags = { $in: tags };
    }
    return query;
}

async function sendCampaignEmail(subscriber, campaign) {
    const baseUrl = getFrontendBaseUrl();
    const unsubscribeUrl = subscriber.unsubscribeToken
        ? `${baseUrl}/api/newsletter/unsubscribe?token=${subscriber.unsubscribeToken}`
        : `${baseUrl}/api/newsletter/unsubscribe?token=`;

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

const listSubscribers = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const skip = (page - 1) * limit;

        const query = buildSubscriberQuery({
            isActive: req.query.isActive,
            tag: req.query.tag,
            search: req.query.search
        });

        const [subscribers, total, totalActive, totalInactive] = await Promise.all([
            Newsletter.find(query).sort({ subscribedAt: -1 }).skip(skip).limit(limit).lean(),
            Newsletter.countDocuments(query),
            Newsletter.countDocuments({ isActive: true }),
            Newsletter.countDocuments({ isActive: false })
        ]);

        res.json({
            success: true,
            data: subscribers,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit) || 1
            },
            stats: {
                totalActive,
                totalInactive,
                total: totalActive + totalInactive
            }
        });
    } catch (error) {
        console.error('List newsletter subscribers error:', error);
        res.status(500).json({ success: false, message: 'Failed to load subscribers' });
    }
};

const deleteSubscriber = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await Newsletter.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Subscriber not found' });
        }
        res.json({ success: true, message: 'Subscriber deleted' });
    } catch (error) {
        console.error('Delete newsletter subscriber error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete subscriber' });
    }
};

const createCampaign = async (req, res) => {
    try {
        const body = req.body || {};
        const title = readString(body.title, 200);
        const subject = readString(body.subject, 200);
        const htmlContent = readString(body.htmlContent, 500000);

        const channel = VALID_CHANNELS.includes(body.channel) ? body.channel : 'email';
        const targetSegment = VALID_SEGMENTS.includes(body.targetSegment) ? body.targetSegment : 'all';
        const whatsappTemplate = readString(body.whatsappTemplate, 10000);

        // Email needs HTML; SMS/WhatsApp deliver a plain-text template instead.
        if (!title || !subject) {
            return res.status(400).json({ success: false, message: 'Title and subject are required' });
        }
        if (channel === 'email' && !htmlContent) {
            return res.status(400).json({ success: false, message: 'HTML content is required for email campaigns' });
        }
        if (channel === 'whatsapp' && !whatsappTemplate) {
            return res.status(400).json({ success: false, message: 'WhatsApp template message is required' });
        }
        if (channel === 'sms' && !whatsappTemplate && !htmlContent) {
            return res.status(400).json({ success: false, message: 'SMS message text is required' });
        }

        const targetTags = parseTagsInput(body.targetTags);
        let scheduledAt = null;
        if (body.scheduledAt) {
            const parsed = new Date(body.scheduledAt);
            if (!Number.isNaN(parsed.getTime())) scheduledAt = parsed;
        }

        const campaign = await EmailCampaign.create({
            title,
            subject,
            htmlContent,
            targetTags,
            targetSegment,
            channel,
            whatsappTemplate,
            scheduledAt,
            status: 'draft',
            createdBy: req.admin?._id || req.admin?.id || null
        });

        res.status(201).json({ success: true, data: campaign, message: 'Campaign saved as draft' });
    } catch (error) {
        console.error('Create email campaign error:', error);
        res.status(500).json({ success: false, message: 'Failed to create campaign' });
    }
};

const listCampaigns = async (req, res) => {
    try {
        const campaigns = await EmailCampaign.find()
            .sort({ createdAt: -1 })
            .populate('createdBy', 'username displayName')
            .lean();

        res.json({ success: true, data: campaigns });
    } catch (error) {
        console.error('List email campaigns error:', error);
        res.status(500).json({ success: false, message: 'Failed to load campaigns' });
    }
};

const sendCampaign = async (req, res) => {
    try {
        const campaign = await EmailCampaign.findById(req.params.id);
        if (!campaign) {
            return res.status(404).json({ success: false, message: 'Campaign not found' });
        }

        if (campaign.status === 'sending') {
            return res.status(409).json({ success: false, message: 'Campaign is already being sent' });
        }

        if (campaign.status === 'sent') {
            return res.status(409).json({ success: false, message: 'Campaign has already been sent' });
        }

        const scheduledAt = campaign.scheduledAt ? new Date(campaign.scheduledAt) : null;
        if (scheduledAt && scheduledAt.getTime() > Date.now()) {
            campaign.status = 'scheduled';
            await campaign.save();
            return res.json({
                success: true,
                message: 'Campaign scheduled for future delivery',
                data: campaign
            });
        }

        const channel = VALID_CHANNELS.includes(campaign.channel) ? campaign.channel : 'email';
        const segment = VALID_SEGMENTS.includes(campaign.targetSegment) ? campaign.targetSegment : 'all';

        // Legacy path: a plain email campaign with no segment still targets the
        // newsletter subscriber list (honouring targetTags). Any other channel or
        // a specific segment resolves recipients from the customer (User) base.
        const useSubscriberList = channel === 'email' && segment === 'all';

        let sentCount = 0;
        let failedCount = 0;
        let totalRecipients = 0;

        if (useSubscriberList) {
            const subscribers = await Newsletter.find(buildCampaignRecipientQuery(campaign.targetTags));
            totalRecipients = subscribers.length;

            campaign.status = 'sending';
            campaign.stats.totalRecipients = totalRecipients;
            campaign.stats.sent = 0;
            campaign.stats.failed = 0;
            await campaign.save();

            for (let i = 0; i < subscribers.length; i += 10) {
                const batch = subscribers.slice(i, i + 10);
                const results = await Promise.all(
                    batch.map((sub) => sendCampaignEmail(sub, campaign).catch(() => ({ delivered: false })))
                );
                results.forEach((r) => { r.delivered ? (sentCount += 1) : (failedCount += 1); });

                campaign.stats.sent = sentCount;
                campaign.stats.failed = failedCount;
                await campaign.save();

                if (i + 10 < subscribers.length) await sleep(1000);
            }
        } else {
            const recipients = await resolveSegmentRecipients(segment, channel);
            totalRecipients = recipients.length;

            campaign.status = 'sending';
            campaign.stats.totalRecipients = totalRecipients;
            campaign.stats.sent = 0;
            campaign.stats.failed = 0;
            await campaign.save();

            if (channel === 'whatsapp') {
                // WhatsApp broadcasts go through the gateway in one batched call.
                const result = await whatsappService.sendBroadcast(
                    recipients.map((r) => r.phone),
                    campaign.whatsappTemplate
                );
                sentCount = result.sent;
                failedCount = result.failed + (result.skipped || 0);
            } else if (channel === 'sms') {
                const smsBody = campaign.whatsappTemplate || campaign.subject;
                for (let i = 0; i < recipients.length; i += 10) {
                    const batch = recipients.slice(i, i + 10);
                    const results = await Promise.all(
                        batch.map((r) => sendSms({ to: r.phone, body: smsBody, context: 'CAMPAIGN SMS' })
                            .catch(() => ({ delivered: false })))
                    );
                    results.forEach((r) => { r.delivered ? (sentCount += 1) : (failedCount += 1); });

                    campaign.stats.sent = sentCount;
                    campaign.stats.failed = failedCount;
                    await campaign.save();

                    if (i + 10 < recipients.length) await sleep(1000);
                }
            } else {
                // Segmented email — send to customers directly (no subscriber row).
                for (let i = 0; i < recipients.length; i += 10) {
                    const batch = recipients.slice(i, i + 10);
                    const results = await Promise.all(
                        batch.map((r) => sendNewsletterCampaignEmail({
                            to: r.email,
                            subject: campaign.subject,
                            htmlContent: campaign.htmlContent,
                            unsubscribeUrl: `${getFrontendBaseUrl()}/api/newsletter/unsubscribe?token=`
                        }).catch(() => ({ delivered: false })))
                    );
                    results.forEach((r) => { r.delivered ? (sentCount += 1) : (failedCount += 1); });

                    campaign.stats.sent = sentCount;
                    campaign.stats.failed = failedCount;
                    await campaign.save();

                    if (i + 10 < recipients.length) await sleep(1000);
                }
            }
        }

        campaign.status = failedCount === totalRecipients && totalRecipients > 0 ? 'failed' : 'sent';
        campaign.sentAt = new Date();
        campaign.stats.sent = sentCount;
        campaign.stats.failed = failedCount;
        await campaign.save();

        res.json({
            success: true,
            message: `Campaign sent to ${sentCount} recipient(s) via ${channel}`,
            data: campaign
        });
    } catch (error) {
        console.error('Send email campaign error:', error);
        try {
            await EmailCampaign.findByIdAndUpdate(req.params.id, { status: 'failed' });
        } catch (_) { /* ignore */ }
        res.status(500).json({ success: false, message: 'Failed to send campaign' });
    }
};

const testCampaign = async (req, res) => {
    try {
        const campaign = await EmailCampaign.findById(req.params.id);
        if (!campaign) {
            return res.status(404).json({ success: false, message: 'Campaign not found' });
        }

        const testEmail = readString(req.body?.testEmail, 120).toLowerCase();
        const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!EMAIL_REGEX.test(testEmail)) {
            return res.status(400).json({ success: false, message: 'Valid test email is required' });
        }

        const baseUrl = getFrontendBaseUrl();
        const result = await sendNewsletterCampaignEmail({
            to: testEmail,
            subject: `[TEST] ${campaign.subject}`,
            htmlContent: campaign.htmlContent,
            unsubscribeUrl: `${baseUrl}/api/newsletter/unsubscribe?token=test-preview`
        });

        if (!result.delivered) {
            return res.status(502).json({
                success: false,
                message: result.reason || 'Failed to send test email'
            });
        }

        res.json({ success: true, message: `Test email sent to ${testEmail}` });
    } catch (error) {
        console.error('Test email campaign error:', error);
        res.status(500).json({ success: false, message: 'Failed to send test email' });
    }
};

module.exports = {
    listSubscribers,
    deleteSubscriber,
    createCampaign,
    listCampaigns,
    sendCampaign,
    testCampaign
};
