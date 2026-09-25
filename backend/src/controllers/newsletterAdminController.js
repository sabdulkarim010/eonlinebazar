/********************************************************************
 * Project: EonlineBazar
 * File: newsletterAdminController.js
 * Description: Admin newsletter subscribers & email campaign handlers.
 ********************************************************************/

const Newsletter = require('../models/newsletter');
const EmailCampaign = require('../models/emailCampaign');
const { dualWrite } = require('../services/dualWriteService');
const {
    fetchNewsletterSubscribersPage,
    fetchEmailCampaignsList
} = require('../services/marketingSupportReadService');
const { sendNewsletterCampaignEmail } = require('../services/mailer');
const { sanitizeCampaignHtml } = require('../utils/sanitizeHtml');
const { prepareCampaignForDispatch } = require('../services/emailCampaignDispatchService');
const { enqueueCampaignSend } = require('../queues/emailCampaignQueue');

function getEmailCampaignRepository() {
    return require('../repositories/emailCampaignRepository');
}

function getNewsletterRepository() {
    return require('../repositories/newsletterRepository');
}

async function mirrorEmailCampaign(saved) {
    await getEmailCampaignRepository().upsertFromMongo(saved);
}

const VALID_CHANNELS = ['email', 'sms', 'whatsapp'];
const VALID_SEGMENTS = ['all', 'vip', 'frequent', 'inactive', 'new'];

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

function parseTemplateData(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
        } catch (_) {
            return null;
        }
    }
    return null;
}

function getFrontendBaseUrl() {
    return String(process.env.FRONTEND_URL || process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
}

const listSubscribers = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

        const { data, pagination, stats } = await fetchNewsletterSubscribersPage({
            isActive: req.query.isActive,
            tag: req.query.tag,
            search: req.query.search,
            page,
            limit
        });

        res.json({
            success: true,
            data,
            pagination,
            stats
        });
    } catch (error) {
        console.error('List newsletter subscribers error:', error);
        res.status(500).json({ success: false, message: 'Failed to load subscribers' });
    }
};

const deleteSubscriber = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await dualWrite(
            () => Newsletter.findByIdAndDelete(id),
            async (removed) => {
                if (!removed) return;
                const repo = getNewsletterRepository();
                const pgRow = await repo.findByLegacyId(String(removed._id));
                if (pgRow) {
                    await repo.remove(pgRow.id);
                }
            },
            {
                model: 'Newsletter',
                operation: 'delete',
                mongoId: (removed) => (removed ? String(removed._id) : id)
            }
        );
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
        const channel = VALID_CHANNELS.includes(body.channel) ? body.channel : 'email';
        const rawHtml = readString(body.htmlContent, 500000);
        const htmlContent = rawHtml ? sanitizeCampaignHtml(rawHtml) : '';
        if (rawHtml && !htmlContent && channel === 'email') {
            console.warn('[CAMPAIGN-SANITIZE] Email HTML stripped entirely after sanitization');
        }
        const targetSegment = VALID_SEGMENTS.includes(body.targetSegment) ? body.targetSegment : 'all';
        const whatsappTemplate = readString(body.whatsappTemplate, 10000);

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
        const templateData = parseTemplateData(body.templateData);
        let scheduledAt = null;
        if (body.scheduledAt) {
            const parsed = new Date(body.scheduledAt);
            if (!Number.isNaN(parsed.getTime())) scheduledAt = parsed;
        }

        const campaign = await dualWrite(
            () => EmailCampaign.create({
                title,
                subject,
                htmlContent,
                templateData,
                targetTags,
                targetSegment,
                channel,
                whatsappTemplate,
                scheduledAt,
                status: 'draft',
                createdBy: req.admin?._id || req.admin?.id || null
            }),
            async (saved) => { await mirrorEmailCampaign(saved); },
            {
                model: 'EmailCampaign',
                operation: 'create',
                mongoId: (saved) => String(saved._id)
            }
        );

        res.status(201).json({ success: true, data: campaign, message: 'Campaign saved as draft' });
    } catch (error) {
        console.error('Create email campaign error:', error);
        res.status(500).json({ success: false, message: 'Failed to create campaign' });
    }
};

const updateCampaign = async (req, res) => {
    try {
        const campaign = await EmailCampaign.findById(req.params.id);
        if (!campaign) {
            return res.status(404).json({ success: false, message: 'Campaign not found' });
        }

        if (['sending', 'sent'].includes(campaign.status)) {
            return res.status(409).json({
                success: false,
                message: 'Cannot edit a campaign that is sending or already sent'
            });
        }

        const body = req.body || {};

        if (body.title !== undefined) {
            const title = readString(body.title, 200);
            if (!title) {
                return res.status(400).json({ success: false, message: 'Title cannot be empty' });
            }
            campaign.title = title;
        }

        if (body.subject !== undefined) {
            const subject = readString(body.subject, 200);
            if (!subject) {
                return res.status(400).json({ success: false, message: 'Subject cannot be empty' });
            }
            campaign.subject = subject;
        }

        if (body.channel !== undefined) {
            campaign.channel = VALID_CHANNELS.includes(body.channel) ? body.channel : campaign.channel;
        }

        if (body.htmlContent !== undefined) {
            const rawHtml = readString(body.htmlContent, 500000);
            campaign.htmlContent = rawHtml ? sanitizeCampaignHtml(rawHtml) : '';
        }

        if (body.templateData !== undefined) {
            campaign.templateData = parseTemplateData(body.templateData);
        }

        if (body.targetSegment !== undefined) {
            campaign.targetSegment = VALID_SEGMENTS.includes(body.targetSegment)
                ? body.targetSegment
                : campaign.targetSegment;
        }

        if (body.targetTags !== undefined) {
            campaign.targetTags = parseTagsInput(body.targetTags);
        }

        if (body.whatsappTemplate !== undefined) {
            campaign.whatsappTemplate = readString(body.whatsappTemplate, 10000);
        }

        if (body.scheduledAt !== undefined) {
            if (body.scheduledAt === null || body.scheduledAt === '') {
                campaign.scheduledAt = null;
            } else {
                const parsed = new Date(body.scheduledAt);
                if (!Number.isNaN(parsed.getTime())) campaign.scheduledAt = parsed;
            }
        }

        const channel = campaign.channel;
        if (channel === 'email' && !campaign.htmlContent) {
            return res.status(400).json({ success: false, message: 'HTML content is required for email campaigns' });
        }

        const updated = await dualWrite(
            () => campaign.save(),
            async (saved) => { await mirrorEmailCampaign(saved); },
            {
                model: 'EmailCampaign',
                operation: 'update',
                mongoId: (saved) => String(saved._id)
            }
        );

        res.json({ success: true, data: updated, message: 'Campaign updated' });
    } catch (error) {
        console.error('Update email campaign error:', error);
        res.status(500).json({ success: false, message: 'Failed to update campaign' });
    }
};

const listCampaigns = async (req, res) => {
    try {
        const campaigns = await fetchEmailCampaignsList();
        res.json({ success: true, data: campaigns });
    } catch (error) {
        console.error('List email campaigns error:', error);
        res.status(500).json({ success: false, message: 'Failed to load campaigns' });
    }
};

const sendCampaign = async (req, res) => {
    try {
        const prep = await prepareCampaignForDispatch(req.params.id);
        if (!prep.ok) {
            return res.status(prep.status || 400).json({
                success: false,
                message: prep.message || 'Unable to send campaign'
            });
        }

        if (prep.scheduled) {
            return res.json({
                success: true,
                message: prep.message,
                data: prep.campaign
            });
        }

        await enqueueCampaignSend(String(prep.campaign._id));

        res.json({
            success: true,
            message: 'Campaign queued for delivery. Track progress in the campaigns list.',
            data: prep.campaign
        });
    } catch (error) {
        console.error('Send email campaign error:', error);
        try {
            const { markCampaignFailed } = require('../services/emailCampaignDispatchService');
            await markCampaignFailed(req.params.id);
        } catch (_) { /* ignore */ }
        res.status(500).json({ success: false, message: 'Failed to queue campaign for delivery' });
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
    updateCampaign,
    listCampaigns,
    sendCampaign,
    testCampaign
};
