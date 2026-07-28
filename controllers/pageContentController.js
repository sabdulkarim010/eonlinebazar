/********************************************************************
 * Project: EonlineBazar
 * File: pageContentController.js
 ********************************************************************/

const PageContent = require('../models/PageContent');
const { PAGE_SLUGS } = require('../models/PageContent');
const { logSecurityEvent, getClientIp } = require('../utils/securityLogger');

function readString(value, max) {
    return String(value ?? '').trim().slice(0, max);
}

function parseBoolean(value, fallback = true) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const str = String(value).trim().toLowerCase();
    return str === 'true' || str === 'on' || str === '1' || str === 'yes';
}

const listAdminPages = async (req, res) => {
    try {
        const pages = await PageContent.getAllForAdmin();
        res.status(200).json({
            success: true,
            data: pages.map((p) => p.toAdminObject())
        });
    } catch (error) {
        console.error('List Page Content Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load pages.' });
    }
};

const getAdminPage = async (req, res) => {
    try {
        await PageContent.ensureDefaults();
        const slug = readString(req.params.slug, 40).toLowerCase();
        const page = await PageContent.findOne({ slug });
        if (!page) {
            return res.status(404).json({ success: false, message: 'Page not found.' });
        }
        res.status(200).json({ success: true, data: page.toAdminObject() });
    } catch (error) {
        console.error('Get Page Content Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load page.' });
    }
};

const updatePageContent = async (req, res) => {
    try {
        const slug = readString(req.params.slug, 40).toLowerCase();
        if (!PAGE_SLUGS.includes(slug)) {
            return res.status(400).json({ success: false, message: 'Invalid page slug.' });
        }

        await PageContent.ensureDefaults();
        const page = await PageContent.findOne({ slug });
        if (!page) {
            return res.status(404).json({ success: false, message: 'Page not found.' });
        }

        const body = req.body || {};
        if (body.title !== undefined) {
            const title = readString(body.title, 120);
            if (!title) return res.status(400).json({ success: false, message: 'Page title is required.' });
            page.title = title;
        }
        if (body.subtitle !== undefined) page.subtitle = readString(body.subtitle, 240);
        if (body.bodyMarkdown !== undefined) page.bodyMarkdown = String(body.bodyMarkdown || '').slice(0, 50000);
        if (body.isPublished !== undefined) page.isPublished = parseBoolean(body.isPublished, true);
        if (body.isActive !== undefined && body.isPublished === undefined) {
            page.isPublished = parseBoolean(body.isActive, true);
        }
        if (body.sortOrder !== undefined) page.sortOrder = Math.max(0, Number(body.sortOrder) || 0);

        if (slug === 'contact' && body.contactMeta && typeof body.contactMeta === 'object') {
            const meta = body.contactMeta;
            page.contactMeta = {
                address: readString(meta.address, 500),
                phone: readString(meta.phone, 40),
                email: readString(meta.email, 120),
                hours: readString(meta.hours, 300),
                mapEmbedUrl: readString(meta.mapEmbedUrl, 1000)
            };
        }

        page.updatedByAdmin = req.admin?.email || req.admin?.username || 'admin';
        await page.save();

        await logSecurityEvent({
            actor: page.updatedByAdmin,
            actorType: 'admin',
            action: 'Page Content Updated',
            ipAddress: getClientIp(req),
            details: `Updated CMS page: ${slug}`
        });

        res.status(200).json({
            success: true,
            message: 'Page content saved successfully.',
            data: page.toAdminObject()
        });
    } catch (error) {
        console.error('Update Page Content Error:', error);
        res.status(500).json({ success: false, message: 'Failed to save page content.' });
    }
};

const getPublicPage = async (req, res) => {
    try {
        const slug = readString(req.params.slug, 40).toLowerCase();
        const page = await PageContent.getPublishedBySlug(slug);
        if (!page) {
            return res.status(404).json({ success: false, message: 'Page not found.' });
        }
        res.status(200).json({ success: true, data: page.toPublicObject() });
    } catch (error) {
        console.error('Get Public Page Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load page.' });
    }
};

module.exports = {
    listAdminPages,
    getAdminPage,
    updatePageContent,
    getPublicPage
};
