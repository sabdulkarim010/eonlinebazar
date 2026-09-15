/********************************************************************
 * Project: EonlineBazar
 * File: pageContentController.js
 ********************************************************************/

const PageContent = require('../models/PageContent');
const { isValidSlug, normalizeSlug } = require('../models/PageContent');
const FooterSettings = require('../models/FooterSettings');
const { logSecurityEvent, getClientIp } = require('../utils/securityLogger');
const { getOrSet, invalidate, CACHE_KEYS } = require('../services/cacheService');
const { isReservedAppSlug } = require('../services/pagePublishService');
const { dualWrite } = require('../services/dualWriteService');
const { routedRead } = require('../services/readRouter');
const { isPgReadEnabled } = require('../config/readCutoverFlags');
const {
    pageContentToAdminShape,
    pageContentToPublicShape,
    mapPageContentsToAdminShape
} = require('../services/readShapeHelpers');

function getPageContentRepository() {
    return require('../repositories/pageContentRepository');
}

function mapMongoPageToPostgresWrite(page) {
    const plain = page.toObject ? page.toObject() : page;
    return {
        slug: plain.slug,
        title: plain.title,
        subtitle: plain.subtitle,
        bodyMarkdown: plain.bodyMarkdown,
        bodyHtml: plain.bodyHtml,
        contentFormat: plain.contentFormat,
        isPublished: plain.isPublished,
        sortOrder: plain.sortOrder,
        updatedByAdmin: plain.updatedByAdmin,
        contactMeta: plain.contactMeta,
        legacyId: String(page._id)
    };
}

function readString(value, max) {
    return String(value ?? '').trim().slice(0, max);
}

function parseBoolean(value, fallback = true) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const str = String(value).trim().toLowerCase();
    return str === 'true' || str === 'on' || str === '1' || str === 'yes';
}

/** Strip accidental HTML entity encoding so DB stores raw <p> not &lt;p&gt;. */
function decodeHtmlEntities(value) {
    let html = String(value ?? '');
    if (!html) return '';
    const map = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&#x27;': "'",
        '&apos;': "'"
    };
    for (let i = 0; i < 3; i += 1) {
        if (!/&(?:amp|lt|gt|quot|apos|#39|#x27);/i.test(html)) break;
        const next = html.replace(/&(?:amp|lt|gt|quot|apos|#39|#x27);/gi, (m) => map[m.toLowerCase()] || map[m] || m);
        if (next === html) break;
        html = next;
    }
    return html;
}

function normalizeBodyHtml(value) {
    return decodeHtmlEntities(String(value || '')).slice(0, 200000);
}

async function fetchAllAdminPages() {
    return routedRead(
        'pagecontent',
        async () => {
            const pages = await PageContent.getAllForAdmin();
            return pages.map((p) => p.toAdminObject());
        },
        async () => {
            const rows = await getPageContentRepository().findAll();
            return mapPageContentsToAdminShape(rows);
        }
    );
}

async function fetchAdminPageBySlug(slug) {
    return routedRead(
        'pagecontent',
        async () => {
            const page = await PageContent.findOne({ slug });
            return page ? page.toAdminObject() : null;
        },
        async () => {
            const row = await getPageContentRepository().findBySlug(slug);
            return pageContentToAdminShape(row);
        }
    );
}

async function fetchPublicPageBySlug(slug) {
    return routedRead(
        'pagecontent',
        async () => {
            const page = await PageContent.getPublishedBySlug(slug);
            return page ? page.toPublicObject() : null;
        },
        async () => {
            const row = await getPageContentRepository().findBySlug(slug);
            return pageContentToPublicShape(row);
        }
    );
}

const listAdminPages = async (req, res) => {
    try {
        const pages = await fetchAllAdminPages();
        res.status(200).json({
            success: true,
            data: pages
        });
    } catch (error) {
        console.error('List Page Content Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load pages.' });
    }
};

const getAdminPage = async (req, res) => {
    try {
        const slug = normalizeSlug(req.params.slug);
        if (!isValidSlug(slug)) {
            return res.status(400).json({ success: false, message: 'Invalid page slug.' });
        }
        const page = await fetchAdminPageBySlug(slug);
        if (!page) {
            return res.status(404).json({ success: false, message: 'Page not found.' });
        }
        res.status(200).json({ success: true, data: page });
    } catch (error) {
        console.error('Get Page Content Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load page.' });
    }
};

/**
 * Create a new CMS page immediately (POST /api/admin/pages).
 * Optionally adds an internal footer link in one step.
 */
const createPage = async (req, res) => {
    try {
        const body = req.body || {};
        const title = readString(body.title, 120);
        const slugInput = readString(body.slug, 80) || title;
        const slug = normalizeSlug(slugInput);

        if (!title) {
            return res.status(400).json({ success: false, message: 'Page title is required.' });
        }
        if (!isValidSlug(slug)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid page slug. Use lowercase letters, numbers, and hyphens only.'
            });
        }
        if (isReservedAppSlug(slug)) {
            return res.status(400).json({
                success: false,
                message: `Slug "/${slug}" is reserved by the app and cannot be used for a CMS page.`
            });
        }

        let page;
        try {
            page = await PageContent.createPage({
                title,
                slug,
                subtitle: readString(body.subtitle, 240),
                bodyMarkdown: body.bodyMarkdown !== undefined
                    ? String(body.bodyMarkdown || '').slice(0, 50000)
                    : undefined,
                bodyHtml: body.bodyHtml !== undefined
                    ? normalizeBodyHtml(body.bodyHtml)
                    : undefined,
                contentFormat: body.contentFormat === 'html' ? 'html' : 'markdown',
                isPublished: parseBoolean(body.isPublished, true),
                sortOrder: body.sortOrder
            });
        } catch (createErr) {
            const status = createErr.statusCode || 500;
            return res.status(status).json({
                success: false,
                message: createErr.message || 'Failed to create page.'
            });
        }

        page.updatedByAdmin = req.admin?.email || req.admin?.username || 'admin';
        await dualWrite(
            () => page.save(),
            async (saved) => {
                await getPageContentRepository().create(mapMongoPageToPostgresWrite(saved));
            },
            {
                model: 'PageContent',
                operation: 'create',
                mongoId: (saved) => String(saved._id)
            }
        );

        let footerLinkAdded = false;
        let footerData = null;
        const addToFooter = parseBoolean(body.addToFooter, false);
        if (addToFooter) {
            const linkResult = await addInternalFooterLink({
                title: page.title,
                slug: page.slug,
                columnIndex: body.footerColumnIndex,
                columnTitle: body.footerColumnTitle
            });
            footerLinkAdded = linkResult.added;
            footerData = linkResult.footer;
        }

        await invalidate(CACHE_KEYS.PAGE_CONTENT(page.slug));
        if (footerLinkAdded) await invalidate(CACHE_KEYS.FOOTER_SETTINGS);

        await logSecurityEvent({
            actor: page.updatedByAdmin,
            actorType: 'admin',
            action: 'Page Content Created',
            ipAddress: getClientIp(req),
            details: `Created CMS page: ${page.slug}${footerLinkAdded ? ' (+ footer link)' : ''}`
        });

        res.status(201).json({
            success: true,
            message: footerLinkAdded
                ? 'Page created and linked in Footer Columns.'
                : 'Page created successfully.',
            data: page.toAdminObject(),
            footerLinkAdded,
            footer: footerData
        });
    } catch (error) {
        console.error('Create Page Content Error:', error);
        res.status(500).json({ success: false, message: 'Failed to create page.' });
    }
};

const updatePageContent = async (req, res) => {
    try {
        const slug = normalizeSlug(req.params.slug);
        if (!isValidSlug(slug)) {
            return res.status(400).json({ success: false, message: 'Invalid page slug.' });
        }

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
        if (body.contentFormat !== undefined) {
            page.contentFormat = body.contentFormat === 'html' ? 'html' : 'markdown';
        }
        if (body.bodyHtml !== undefined && (page.contentFormat === 'html' || body.contentFormat === 'html')) {
            page.contentFormat = 'html';
            page.bodyHtml = normalizeBodyHtml(body.bodyHtml);
            page.bodyMarkdown = '';
        } else if (body.bodyMarkdown !== undefined) {
            page.contentFormat = 'markdown';
            page.bodyMarkdown = String(body.bodyMarkdown || '').slice(0, 50000);
        }
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
        await dualWrite(
            () => page.save(),
            async (saved) => {
                const repo = getPageContentRepository();
                const pgRow = await repo.findByLegacyId(String(saved._id));
                if (!pgRow) {
                    const err = new Error('Page not found.');
                    err.code = 'NOT_FOUND';
                    throw err;
                }
                await repo.update(pgRow.id, mapMongoPageToPostgresWrite(saved));
            },
            {
                model: 'PageContent',
                operation: 'update',
                mongoId: (saved) => String(saved._id)
            }
        );

        await invalidate(CACHE_KEYS.PAGE_CONTENT(slug));
        await invalidate(CACHE_KEYS.FOOTER_SETTINGS);

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

/**
 * One-click: add an existing CMS page as an internal footer column link.
 * POST /api/admin/pages/:slug/footer-link
 */
const addPageToFooter = async (req, res) => {
    try {
        const slug = normalizeSlug(req.params.slug);
        if (!isValidSlug(slug)) {
            return res.status(400).json({ success: false, message: 'Invalid page slug.' });
        }

        const page = await PageContent.findOne({ slug });
        if (!page) {
            return res.status(404).json({ success: false, message: 'Page not found.' });
        }

        const body = req.body || {};
        const result = await addInternalFooterLink({
            title: readString(body.label, 80) || page.title,
            slug: page.slug,
            columnIndex: body.columnIndex,
            columnTitle: body.columnTitle
        });

        if (!result.added && result.reason === 'exists') {
            return res.status(200).json({
                success: true,
                message: 'This page is already linked in the selected footer column.',
                alreadyLinked: true,
                footer: result.footer
            });
        }

        await invalidate(CACHE_KEYS.FOOTER_SETTINGS);

        await logSecurityEvent({
            actor: req.admin?.email || req.admin?.username || 'admin',
            actorType: 'admin',
            action: 'Page Linked To Footer',
            ipAddress: getClientIp(req),
            details: `Linked CMS page /${slug} to footer column`
        });

        res.status(200).json({
            success: true,
            message: 'Page linked to Footer Columns.',
            alreadyLinked: false,
            footer: result.footer
        });
    } catch (error) {
        console.error('Add Page To Footer Error:', error);
        const status = error.statusCode || 500;
        res.status(status).json({
            success: false,
            message: error.message || 'Failed to add page to footer.'
        });
    }
};

/**
 * Shared helper — append an internal /slug link to a footer column.
 */
async function addInternalFooterLink({ title, slug, columnIndex, columnTitle } = {}) {
    const doc = await FooterSettings.getOrCreate();
    if (!Array.isArray(doc.columns) || !doc.columns.length) {
        const err = new Error('No footer columns exist. Add a column under Footer Settings first.');
        err.statusCode = 400;
        throw err;
    }

    let colIdx = Number(columnIndex);
    if (!Number.isInteger(colIdx) || colIdx < 0 || colIdx >= doc.columns.length) {
        const wanted = readString(columnTitle, 60).toLowerCase();
        colIdx = wanted
            ? doc.columns.findIndex((c) => String(c.columnTitle || '').trim().toLowerCase() === wanted)
            : 0;
        if (colIdx < 0) colIdx = 0;
    }

    const column = doc.columns[colIdx];
    const url = `/${slug}`;
    const exists = (column.links || []).some((link) => {
        const linkUrl = String(link.url || '').trim().replace(/\/+$/, '') || '/';
        return linkUrl === url || linkUrl === `/pages/${slug}`;
    });

    if (exists) {
        return { added: false, reason: 'exists', footer: doc.toAdminObject() };
    }

    if ((column.links || []).length >= 20) {
        const err = new Error('Selected footer column already has the maximum number of links.');
        err.statusCode = 400;
        throw err;
    }

    column.links.push({
        label: readString(title, 80) || slug,
        url,
        isExternal: false,
        isActive: true
    });

    await doc.save();
    return { added: true, reason: 'created', footer: doc.toAdminObject() };
}

const getPublicPage = async (req, res) => {
    try {
        const slug = normalizeSlug(req.params.slug);
        if (!isValidSlug(slug)) {
            return res.status(400).json({ success: false, message: 'Invalid page slug.' });
        }
        const page = isPgReadEnabled('pagecontent')
            ? await fetchPublicPageBySlug(slug)
            : await getOrSet(CACHE_KEYS.PAGE_CONTENT(slug), () => fetchPublicPageBySlug(slug), 300);
        if (!page) {
            return res.status(404).json({ success: false, message: 'Page not found.' });
        }
        res.status(200).json({ success: true, data: page });
    } catch (error) {
        console.error('Get Public Page Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load page.' });
    }
};

module.exports = {
    listAdminPages,
    getAdminPage,
    createPage,
    updatePageContent,
    addPageToFooter,
    getPublicPage,
    fetchPublicPageBySlug
};
