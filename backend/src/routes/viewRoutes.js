/********************************************************************
 * Project: EonlineBazar
 * File: viewRoutes.js
 * Location: backend/src/routes/viewRoutes.js
 * Description: HTML view routing — clean URLs for storefront and admin
 * pages, chat-admin SPA, static assets, CMS catch-all, and branded 404.
 ********************************************************************/

const path = require('path');
const fs = require('fs');
const express = require('express');
const seoRoutes = require('./seoRoutes');
const { serveProductDetailsWithSeo, serveSearchWithSeo } = require('../services/seoPageService');
const { applyBrandingToHtml } = require('../utils/brandingHtml');
const { DEFAULT_SETTINGS } = require('../services/storeSettingsService');

const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const CLIENT_DIR = path.join(REPO_ROOT, 'client');
const PUBLIC_DIR = path.join(REPO_ROOT, 'public');
const CHAT_ADMIN_DIST = path.join(REPO_ROOT, 'admin-dashboard', 'dist');
const CHAT_ADMIN_INDEX = path.join(CHAT_ADMIN_DIST, 'index.html');

function sendClientHtml(res, filename) {
    const absPath = path.join(CLIENT_DIR, filename);
    const settings = res.locals.settings || DEFAULT_SETTINGS;
    const html = applyBrandingToHtml(fs.readFileSync(absPath, 'utf8'), settings, { filename });
    res.type('html').send(html);
}

function mountViewRoutes(app) {
    /********************************************************************
     # CHAT ADMIN DASHBOARD (Vite SPA)
     # Must be registered BEFORE client static files, CMS /:slug catch-all,
     # and the branded 404 handler — otherwise /chat-admin is treated as a
     # CMS page slug and returns "Page Unavailable".
     ********************************************************************/
    app.use(
        '/chat-admin',
        express.static(CHAT_ADMIN_DIST, {
            index: 'index.html',
            fallthrough: true,
            // Hashed Vite assets under /chat-admin/assets/*
            setHeaders(res, filePath) {
                if (filePath.match(/\.(js|css)$/)) {
                    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                } else if (filePath.match(/\.(png|jpg|jpeg|gif|svg|ico|webp)$/)) {
                    res.setHeader('Cache-Control', 'public, max-age=604800');
                }
            }
        })
    );

    // Exact path + SPA deep links (Express 5 named wildcard)
    app.get(['/chat-admin', '/chat-admin/', '/chat-admin/*splat'], (req, res) => {
        if (!fs.existsSync(CHAT_ADMIN_INDEX)) {
            return res.status(503).type('text').send('Chat admin dashboard build not found. Run: cd admin-dashboard && npm run build');
        }
        res.sendFile(CHAT_ADMIN_INDEX);
    });

    /********************************************************************
     # FRONTEND UI ROUTES (ক্লিন ইউআরএল লজিক)
     ********************************************************************/

    app.get('/', (req, res) => {
        sendClientHtml(res, 'index.html');
    });

    app.get('/index', (req, res) => {
        sendClientHtml(res, 'index.html');
    });

    app.get('/profile', (req, res) => {
        sendClientHtml(res, 'profile.html');
    });

    app.get('/login', (req, res) => {
        sendClientHtml(res, 'login.html');
    });

    app.get('/register', (req, res) => {
        sendClientHtml(res, 'register.html');
    });

    app.get('/forgot-password', (req, res) => {
        sendClientHtml(res, 'forgot-password.html');
    });

    app.get('/order-track', (req, res) => {
        sendClientHtml(res, 'order-track.html');
    });

    app.get('/order-details', (req, res) => {
        sendClientHtml(res, 'order-details.html');
    });

    app.get('/product-details', serveProductDetailsWithSeo);
    app.get('/search', serveSearchWithSeo);
    app.get('/products', serveSearchWithSeo);

    app.get('/category/:slug', (req, res) => {
        req.query.category = req.params.slug;
        return serveSearchWithSeo(req, res);
    });

    app.get('/cart', (req, res) => {
        sendClientHtml(res, 'cart.html');
    });

    app.get('/checkout', (req, res) => {
        sendClientHtml(res, 'checkout.html');
    });

    app.get('/payment', (req, res) => {
        sendClientHtml(res, 'payment.html');
    });

    app.get('/about', (req, res) => {
        sendClientHtml(res, 'about.html');
    });

    app.get('/contact', (req, res) => {
        sendClientHtml(res, 'contact.html');
    });

    app.get('/privacy-policy', (req, res) => {
        sendClientHtml(res, 'cms-page.html');
    });

    app.get('/privacy', (req, res) => {
        sendClientHtml(res, 'cms-page.html');
    });

    app.get('/terms', (req, res) => {
        sendClientHtml(res, 'cms-page.html');
    });

    app.get('/terms-conditions', (req, res) => {
        sendClientHtml(res, 'cms-page.html');
    });

    app.get('/terms-and-conditions', (req, res) => {
        sendClientHtml(res, 'cms-page.html');
    });

    app.get('/careers', (req, res) => {
        sendClientHtml(res, 'cms-page.html');
    });

    app.get('/pages/:slug', (req, res) => {
        sendClientHtml(res, 'cms-page.html');
    });

    app.get('/page/:slug', (req, res) => {
        sendClientHtml(res, 'cms-page.html');
    });

    app.get('/page.html', (req, res) => {
        sendClientHtml(res, 'cms-page.html');
    });

    app.get('/page', (req, res) => {
        sendClientHtml(res, 'cms-page.html');
    });

    app.get('/footer', (req, res) => {
        sendClientHtml(res, 'footer.html');
    });

    app.get('/admin', (req, res) => {
        sendClientHtml(res, 'admin.html');
    });

    app.get('/admin/dashboard', (req, res) => {
        sendClientHtml(res, 'admin.html');
    });

    app.get('/admin/messages', (req, res) => {
        sendClientHtml(res, 'admin.html');
    });

    app.get('/admin/navbar-links', (req, res) => {
        sendClientHtml(res, 'admin.html');
    });

    app.get('/admin/file-manager', (req, res) => {
        sendClientHtml(res, 'admin.html');
    });

    app.get('/admin-login', (req, res) => {
        sendClientHtml(res, 'admin-login.html');
    });

    app.get('/admin/login', (req, res) => {
        sendClientHtml(res, 'admin-login.html');
    });

    app.get('/admin/access-denied', (req, res) => {
        res.status(403);
        sendClientHtml(res, 'access-denied.html');
    });

    app.get('/admin/logout', (req, res) => {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.clearCookie('adminToken', { path: '/' });
        res.clearCookie('token', { path: '/' });
        return res.redirect('/admin/login?loggedout=1');
    });

    function serveAdminOtpPage(req, res) {
        sendClientHtml(res, 'verify-otp.html');
    }
    app.get('/admin/verify-otp', serveAdminOtpPage);
    app.get('/verify-otp', serveAdminOtpPage);

    app.get('/finance-login', (req, res) => {
        sendClientHtml(res, 'finance-login.html');
    });

    function serveFinanceDashboard(req, res) {
        sendClientHtml(res, 'finance-analytics.html');
    }

    app.get('/finance-analytics', serveFinanceDashboard);
    app.get('/admin/finance', serveFinanceDashboard);

    function servePaymentReconciliationPage(req, res) {
        sendClientHtml(res, 'payment-reconciliation.html');
    }
    app.get('/admin/payment-reconciliation', servePaymentReconciliationPage);

    app.get('/admin/order-details/:orderId', (req, res) => {
        sendClientHtml(res, 'admin.html');
    });

    app.get('/admin/*splat', (req, res) => {
        res.redirect('/admin/dashboard');
    });

    app.use(seoRoutes);

    app.get('/manifest.json', (req, res) => {
        res.setHeader('Content-Type', 'application/manifest+json');
        res.sendFile(path.join(PUBLIC_DIR, 'manifest.json'));
    });
    app.get('/service-worker.js', (req, res) => {
        const swPath = path.join(PUBLIC_DIR, 'service-worker.js');

        try {
            let swContent = fs.readFileSync(swPath, 'utf8');
            swContent = swContent.replace(
                '__BUILD_TIMESTAMP__',
                global.SERVER_START_TIME || Date.now().toString()
            );
            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Service-Worker-Allowed', '/');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.send(swContent);
        } catch (err) {
            res.status(404).send('// Service worker not found');
        }
    });

    const staticAssetOptions = {
        index: false,
        etag: true,
        lastModified: true,
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('.html')) {
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.setHeader('Pragma', 'no-cache');
            } else if (filePath.match(/\.(js|css)$/)) {
                res.setHeader('Cache-Control', 'public, max-age=3600');
            } else if (filePath.match(/\.(png|jpg|jpeg|gif|svg|ico|webp)$/)) {
                res.setHeader('Cache-Control', 'public, max-age=604800');
            }
        }
    };

    const PRIVATE_HTTP_BASENAMES = new Set(['admin_notes.md']);
    app.use((req, res, next) => {
        const base = path.basename(String(req.path || '')).toLowerCase();
        if (PRIVATE_HTTP_BASENAMES.has(base)) {
            return res.status(404).json({
                success: false,
                message: 'Not found'
            });
        }
        next();
    });

    if (fs.existsSync(PUBLIC_DIR)) {
        app.use(express.static(PUBLIC_DIR, staticAssetOptions));
    }
    app.use(express.static(CLIENT_DIR, staticAssetOptions));

    const CMS_RESERVED_SLUGS = new Set([
        'index', 'profile', 'login', 'register', 'forgot-password',
        'order-track', 'order-details', 'product-details', 'search',
        'cart', 'checkout', 'payment', 'footer', 'admin', 'admin-login',
        'finance-login', 'finance-analytics', 'verify-otp', 'api',
        'uploads', 'css', 'js', 'images', 'assets', 'public', 'pages',
        'page', 'manifest', 'service-worker', 'robots', 'sitemap', 'favicon',
        'chat-admin'
    ]);

    app.get('/:slug', (req, res, next) => {
        const slug = String(req.params.slug || '').toLowerCase();
        if (!slug || slug.includes('.') || CMS_RESERVED_SLUGS.has(slug)) {
            return next();
        }
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
            return next();
        }
        return sendClientHtml(res, 'cms-page.html');
    });

    app.use((req, res) => {
        if (req.path.startsWith('/api/') || req.path.startsWith('/admin/api/')) {
            return res.status(404).json({
                success: false,
                message: `Route not found: ${req.method} ${req.path}`
            });
        }
        if (req.path === '/chat-admin' || req.path.startsWith('/chat-admin/')) {
            if (fs.existsSync(CHAT_ADMIN_INDEX)) {
                return res.sendFile(CHAT_ADMIN_INDEX);
            }
        }
        const settings = res.locals.settings || DEFAULT_SETTINGS;
        const notFoundHtml = applyBrandingToHtml(
            fs.readFileSync(path.join(PUBLIC_DIR, '404.html'), 'utf8'),
            settings,
            { filename: '404.html' }
        );
        res.status(404).type('html').send(notFoundHtml);
    });
}

module.exports = { mountViewRoutes };
