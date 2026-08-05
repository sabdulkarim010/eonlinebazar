/********************************************************************
 * Project: EonlineBazar
 * File: navbarLinkController.js
 * Location: controllers/navbarLinkController.js
 * Author: Abdul Karim Sheikh
 * Description: Public + admin CRUD for top-bar NavbarLink items.
 * Optional Quill CMS pages sync to PageContent at /page/:slug.
 ********************************************************************/

const NavbarLink = require('../models/NavbarLink');
const PageContent = require('../models/PageContent');
const { isValidSlug, normalizeSlug } = require('../models/PageContent');
const { isReservedAppSlug } = require('../utils/pagePublishService');
const { sanitizeHtml } = require('../utils/sanitizeHtml');
const { getOrSet, invalidate, CACHE_KEYS } = require('../utils/cacheService');

function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeUrl(raw) {
    const url = String(raw || '').trim();
    if (!url) return '';
    // Allow absolute http(s), protocol-relative, mailto/tel, or site-relative paths
    if (/^(https?:\/\/|\/\/|mailto:|tel:|\/)/i.test(url)) return url;
    // Bare paths like "deals" → "/deals"
    if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) return `/${url.replace(/^\/+/, '')}`;
    return url;
}

function normalizeTarget(raw) {
    return String(raw || '').trim() === '_blank' ? '_blank' : '_self';
}

function parsePublished(value, fallback = true) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const s = String(value).trim().toLowerCase();
    if (['false', '0', 'no', 'off'].includes(s)) return false;
    if (['true', '1', 'yes', 'on'].includes(s)) return true;
    return fallback;
}

function parseHasCustomPage(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const s = String(value).trim().toLowerCase();
    if (['false', '0', 'no', 'off'].includes(s)) return false;
    if (['true', '1', 'yes', 'on'].includes(s)) return true;
    return fallback;
}

function customPageUrl(slug) {
    return `/page/${slug}`;
}

/** Decode entity-escaped markup then sanitize — stores raw <p> not &lt;p&gt;. */
function sanitizePageHtml(pageHtml) {
    let rawHtml = String(pageHtml || '');
    for (let i = 0; i < 3; i += 1) {
        if (!/&(?:amp|lt|gt|quot|apos|#39|#x27);/i.test(rawHtml)) break;
        rawHtml = rawHtml
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;|&apos;|&#x27;/gi, "'");
    }
    return sanitizeHtml(rawHtml, { maxLength: 200000 });
}

async function syncCustomCmsPage({ title, slug, pageHtml, isPublished }) {
    const normalized = normalizeSlug(slug);
    if (!isValidSlug(normalized)) {
        const err = new Error('Invalid page slug. Use lowercase letters, numbers, and hyphens only.');
        err.statusCode = 400;
        throw err;
    }
    if (isReservedAppSlug(normalized)) {
        const err = new Error(`Slug "/${normalized}" is reserved by the app and cannot be used for a CMS page.`);
        err.statusCode = 400;
        throw err;
    }

    const html = sanitizePageHtml(pageHtml);
    const page = await PageContent.upsertHtmlPage({
        title,
        slug: normalized,
        subtitle: '',
        bodyHtml: html,
        isPublished
    });

    await invalidate(CACHE_KEYS.PAGE_CONTENT(normalized));
    return page;
}

/** GET /api/navbar-links — published links for the storefront top bar */
const getPublicNavbarLinks = async (req, res) => {
    try {
        const links = await getOrSet(CACHE_KEYS.NAVBAR_LINKS, async () => {
            const docs = await NavbarLink.findPublishedSorted();
            return docs.map((d) => d.toPublicObject());
        }, 300);
        res.status(200).json({ success: true, data: links });
    } catch (error) {
        console.error('Navbar links public fetch error:', error);
        res.status(500).json({ success: false, message: 'Failed to load navbar links.' });
    }
};

/** GET /api/navbar-links/admin — all links for Catalog Management */
const getAdminNavbarLinks = async (req, res) => {
    try {
        const docs = await NavbarLink.find().sort({ sortOrder: 1, title: 1 });
        res.status(200).json({
            success: true,
            data: docs.map((d) => d.toAdminObject())
        });
    } catch (error) {
        console.error('Navbar links admin fetch error:', error);
        res.status(500).json({ success: false, message: 'Failed to load navbar links.' });
    }
};

/** POST /api/navbar-links/admin */
const createNavbarLink = async (req, res) => {
    try {
        const title = String(req.body.title || '').trim();
        const slugInput = String(req.body.slug || '').trim();
        const target = normalizeTarget(req.body.target);
        const isPublished = parsePublished(req.body.isPublished, true);
        const hasCustomPage = parseHasCustomPage(req.body.hasCustomPage, false);
        let sortOrder = Number(req.body.sortOrder);
        let url = normalizeUrl(req.body.url);
        const pageHtml = sanitizePageHtml(req.body.pageHtml || '');

        if (!title) {
            return res.status(400).json({ success: false, message: 'Title is required.' });
        }

        if (!Number.isFinite(sortOrder)) {
            const last = await NavbarLink.findOne().sort({ sortOrder: -1 }).select('sortOrder').lean();
            sortOrder = (Number(last?.sortOrder) || 0) + 1;
        }

        let slug = slugInput ? NavbarLink.slugify(slugInput) : NavbarLink.slugify(title);
        if (hasCustomPage) {
            // CMS pages require ASCII slugs (same rules as PageContent).
            slug = normalizeSlug(slugInput || title);
            if (!isValidSlug(slug)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid page slug. Use lowercase letters, numbers, and hyphens only.'
                });
            }
        }
        if (!slug) {
            return res.status(400).json({ success: false, message: 'A valid slug is required.' });
        }

        const dup = await NavbarLink.findOne({ slug: new RegExp(`^${escapeRegex(slug)}$`, 'i') });
        if (dup) {
            return res.status(400).json({ success: false, message: 'A link with this slug already exists.' });
        }

        if (hasCustomPage) {
            if (isReservedAppSlug(slug)) {
                return res.status(400).json({
                    success: false,
                    message: `Slug "/${slug}" is reserved and cannot be used for a custom page.`
                });
            }
            await syncCustomCmsPage({ title, slug, pageHtml, isPublished });
            url = customPageUrl(slug);
        } else if (!url) {
            return res.status(400).json({ success: false, message: 'URL is required.' });
        }

        const doc = await NavbarLink.create({
            title,
            url,
            slug,
            target,
            isPublished,
            hasCustomPage,
            pageHtml: hasCustomPage ? pageHtml : '',
            sortOrder
        });

        await invalidate(CACHE_KEYS.NAVBAR_LINKS);

        res.status(201).json({
            success: true,
            message: hasCustomPage
                ? `Navbar link created with CMS page at ${customPageUrl(slug)}.`
                : 'Navbar link created.',
            data: doc.toAdminObject()
        });
    } catch (error) {
        console.error('Navbar link create error:', error);
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Duplicate slug — choose another.' });
        }
        if (error.statusCode) {
            return res.status(error.statusCode).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: 'Failed to create navbar link.' });
    }
};

/** PUT/PATCH /api/navbar-links/admin/:id */
const updateNavbarLink = async (req, res) => {
    try {
        const doc = await NavbarLink.findById(req.params.id);
        if (!doc) {
            return res.status(404).json({ success: false, message: 'Navbar link not found.' });
        }

        if (req.body.title !== undefined) {
            const title = String(req.body.title || '').trim();
            if (!title) {
                return res.status(400).json({ success: false, message: 'Title is required.' });
            }
            doc.title = title;
        }

        if (req.body.slug !== undefined) {
            let slug = NavbarLink.slugify(req.body.slug);
            const willBeCustom = req.body.hasCustomPage !== undefined
                ? parseHasCustomPage(req.body.hasCustomPage, doc.hasCustomPage)
                : doc.hasCustomPage;
            if (willBeCustom) {
                slug = normalizeSlug(req.body.slug || doc.title);
            }
            if (slug) {
                const dup = await NavbarLink.findOne({
                    _id: { $ne: doc._id },
                    slug: new RegExp(`^${escapeRegex(slug)}$`, 'i')
                });
                if (dup) {
                    return res.status(400).json({ success: false, message: 'A link with this slug already exists.' });
                }
            }
            doc.slug = slug || (willBeCustom ? normalizeSlug(doc.title) : NavbarLink.slugify(doc.title));
        }

        if (req.body.target !== undefined) {
            doc.target = normalizeTarget(req.body.target);
        }

        if (req.body.isPublished !== undefined) {
            doc.isPublished = parsePublished(req.body.isPublished, doc.isPublished);
        }

        if (req.body.sortOrder !== undefined && req.body.sortOrder !== '') {
            const n = Number(req.body.sortOrder);
            if (Number.isFinite(n)) doc.sortOrder = n;
        }

        if (req.body.hasCustomPage !== undefined) {
            doc.hasCustomPage = parseHasCustomPage(req.body.hasCustomPage, doc.hasCustomPage);
        }

        if (req.body.pageHtml !== undefined) {
            doc.pageHtml = sanitizePageHtml(req.body.pageHtml || '');
        }

        if (doc.hasCustomPage) {
            const slug = normalizeSlug(doc.slug || doc.title);
            if (!isValidSlug(slug)) {
                return res.status(400).json({
                    success: false,
                    message: 'A valid slug is required for custom CMS pages.'
                });
            }
            if (isReservedAppSlug(slug)) {
                return res.status(400).json({
                    success: false,
                    message: `Slug "/${slug}" is reserved and cannot be used for a custom page.`
                });
            }
            doc.slug = slug;
            doc.url = customPageUrl(slug);
            await syncCustomCmsPage({
                title: doc.title,
                slug,
                pageHtml: doc.pageHtml,
                isPublished: doc.isPublished
            });
        } else if (req.body.url !== undefined) {
            const url = normalizeUrl(req.body.url);
            if (!url) {
                return res.status(400).json({ success: false, message: 'URL is required.' });
            }
            doc.url = url;
            doc.pageHtml = '';
        }

        await doc.save();
        await invalidate(CACHE_KEYS.NAVBAR_LINKS);

        res.status(200).json({
            success: true,
            message: 'Navbar link updated.',
            data: doc.toAdminObject()
        });
    } catch (error) {
        console.error('Navbar link update error:', error);
        if (error.statusCode) {
            return res.status(error.statusCode).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: 'Failed to update navbar link.' });
    }
};

/** DELETE /api/navbar-links/admin/:id */
const deleteNavbarLink = async (req, res) => {
    try {
        const deleted = await NavbarLink.findByIdAndDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Navbar link not found.' });
        }
        await invalidate(CACHE_KEYS.NAVBAR_LINKS);
        // Leave linked PageContent in place — it may also be used from footer / direct URL.
        res.status(200).json({ success: true, message: 'Navbar link deleted.' });
    } catch (error) {
        console.error('Navbar link delete error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete navbar link.' });
    }
};

/** PATCH /api/navbar-links/admin/reorder — body: { order: [{ id, sortOrder }] } */
const reorderNavbarLinks = async (req, res) => {
    try {
        const order = Array.isArray(req.body.order) ? req.body.order : [];
        if (!order.length) {
            return res.status(400).json({ success: false, message: 'Order array is required.' });
        }

        const ops = order
            .map((item, index) => {
                const id = item.id || item._id;
                if (!id) return null;
                const sortOrder = Number.isFinite(Number(item.sortOrder))
                    ? Number(item.sortOrder)
                    : index;
                return {
                    updateOne: {
                        filter: { _id: id },
                        update: { $set: { sortOrder } }
                    }
                };
            })
            .filter(Boolean);

        if (ops.length) {
            await NavbarLink.bulkWrite(ops);
        }

        await invalidate(CACHE_KEYS.NAVBAR_LINKS);

        const docs = await NavbarLink.find().sort({ sortOrder: 1, title: 1 });
        res.status(200).json({
            success: true,
            message: 'Display order updated.',
            data: docs.map((d) => d.toAdminObject())
        });
    } catch (error) {
        console.error('Navbar link reorder error:', error);
        res.status(500).json({ success: false, message: 'Failed to reorder navbar links.' });
    }
};

module.exports = {
    getPublicNavbarLinks,
    getAdminNavbarLinks,
    createNavbarLink,
    updateNavbarLink,
    deleteNavbarLink,
    reorderNavbarLinks
};
