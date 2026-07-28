/**
 * Loads CMS page content and renders premium info-page layout.
 */
(function () {
    const SLUG_BY_PATH = {
        '/privacy-policy': 'privacy-policy',
        '/terms': 'terms',
        '/about': 'about',
        '/careers': 'careers'
    };

    function resolveSlug() {
        const root = document.getElementById('info-page-root');
        const fromData = root?.dataset?.pageSlug;
        if (fromData) return fromData;
        const path = window.location.pathname.replace(/\/+$/, '') || '/';
        return SLUG_BY_PATH[path] || null;
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
