/**
 * Generic dynamic CMS page renderer for /pages/:slug, /:slug, and /page.html?slug=.
 * Fetches published content from /api/store/pages/:slug and renders Markdown/HTML.
 */
(function () {
    const SLUG_BY_PATH = {
        '/privacy-policy': 'privacy-policy',
        '/privacy': 'privacy-policy',
        '/terms': 'terms',
        '/terms-conditions': 'terms',
        '/terms-and-conditions': 'terms',
        '/about': 'about',
        '/careers': 'careers'
    };

    const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

    function resolveSlug() {
        const root = document.getElementById('info-page-root');
        const fromData = root?.dataset?.pageSlug;
        if (fromData && SLUG_PATTERN.test(fromData)) return fromData;

        const params = new URLSearchParams(window.location.search);
        const fromQuery = String(params.get('slug') || '').trim().toLowerCase();
        if (fromQuery && SLUG_PATTERN.test(fromQuery)) return fromQuery;

        const path = window.location.pathname.replace(/\/+$/, '') || '/';
        if (SLUG_BY_PATH[path]) return SLUG_BY_PATH[path];

        const pagesMatch = path.match(/^\/pages\/([a-z0-9]+(?:-[a-z0-9]+)*)$/i);
        if (pagesMatch) return pagesMatch[1].toLowerCase();

        const bareMatch = path.match(/^\/([a-z0-9]+(?:-[a-z0-9]+)*)$/i);
        if (bareMatch) return bareMatch[1].toLowerCase();

        return null;
    }

    function renderUnavailable(message) {
        const body = document.getElementById('cms-page-body') || document.getElementById('about-cms-root');
        const hero = document.getElementById('info-page-hero');
        if (hero) {
            hero.innerHTML = `<h1>Page Unavailable</h1><p>This page is not published or does not exist.</p>`;
        }
        if (body) {
            body.innerHTML = `<div class="info-page-unavailable"><h2>404 — Page Not Found</h2><p>${message || 'Please check back later or return to the homepage.'}</p><p><a href="/">← Back to Shop</a></p></div>`;
        }
        document.title = 'Page Unavailable - EonlineBazar';
    }

    function renderInfoPage(page) {
        const hero = document.getElementById('info-page-hero');
        const body = document.getElementById('cms-page-body') || document.getElementById('about-cms-root');

        if (hero) {
            hero.innerHTML = `
                <h1>${escapeHtml(page.title || 'Page')}</h1>
                ${page.subtitle ? `<p>${escapeHtml(page.subtitle)}</p>` : ''}`;
        }

        if (body) {
            body.innerHTML = page.bodyHtml || '<p>No content yet.</p>';
        }

        document.title = `${page.title || 'Page'} - EonlineBazar`;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    async function initPageContent() {
        const slug = resolveSlug();
        if (!slug) return;

        try {
            const res = await fetch(`/api/store/pages/${encodeURIComponent(slug)}`);
            const result = await res.json();

            if (!result.success || !result.data) {
                renderUnavailable(result.message || 'This page is currently unavailable.');
                return;
            }

            renderInfoPage(result.data);
        } catch (err) {
            console.error('Page content load error:', err);
            renderUnavailable('Unable to load this page.');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPageContent);
    } else {
        initPageContent();
    }
})();
