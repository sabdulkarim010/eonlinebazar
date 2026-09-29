/**
 * Storefront skeleton loaders — stable layout placeholders (CLS-friendly).
 */
(function initEOBSkeletons(global) {
    const MARKER = 'data-eob-skeleton';

    function clampCount(count, min, max) {
        const n = Number(count);
        if (!Number.isFinite(n)) return min;
        return Math.min(max, Math.max(min, Math.floor(n)));
    }

    function renderProductCardSkeleton(count = 8) {
        const n = clampCount(count, 1, 48);
        const cards = [];
        for (let i = 0; i < n; i += 1) {
            cards.push(`
                <div class="product-card eob-skeleton-card" ${MARKER}="product-card" aria-hidden="true">
                    <div class="product-img-box"><span class="eob-skeleton eob-skeleton--media" ${MARKER}="product-media"></span></div>
                    <div class="product-info">
                        <span class="eob-skeleton eob-skeleton--title" ${MARKER}="product-title"></span>
                        <span class="eob-skeleton eob-skeleton--price" ${MARKER}="product-price"></span>
                    </div>
                    <span class="eob-skeleton eob-skeleton--btn" ${MARKER}="product-action"></span>
                </div>`);
        }
        return cards.join('');
    }

    function renderProductGridSkeleton(count = 8, gridClass = 'product-layout-grid') {
        const n = clampCount(count, 1, 48);
        return `<div class="${gridClass} eob-skeleton-host" ${MARKER}="product-grid" aria-busy="true" aria-label="Loading products">${renderProductCardSkeleton(n)}</div>`;
    }

    function renderBannerSkeleton() {
        return `<div class="eob-skeleton eob-skeleton-banner eob-skeleton-host" ${MARKER}="hero-banner" aria-hidden="true" role="presentation"></div>`;
    }

    function renderCategoryStripSkeleton(count = 6) {
        const n = clampCount(count, 3, 12);
        const pills = [];
        for (let i = 0; i < n; i += 1) {
            pills.push(`
                <div class="eob-skeleton-category-pill" ${MARKER}="category-pill" aria-hidden="true">
                    <span class="eob-skeleton-block eob-skeleton--icon"></span>
                    <span class="eob-skeleton-block eob-skeleton--label"></span>
                </div>`);
        }
        return `
            <div class="eob-skeleton-categories eob-skeleton-host" ${MARKER}="category-strip" aria-busy="true">
                <div class="eob-skeleton-categories__header">
                    <span class="eob-skeleton-block eob-skeleton--heading"></span>
                    <span class="eob-skeleton-block eob-skeleton--link"></span>
                </div>
                <div class="eob-skeleton-categories__grid">${pills.join('')}</div>
            </div>`;
    }

    function renderPdpSkeleton() {
        return `
            <div class="eob-skeleton-pdp eob-skeleton-host" ${MARKER}="pdp" aria-busy="true" aria-label="Loading product">
                <div class="eob-skeleton-pdp__gallery">
                    <span class="eob-skeleton-block eob-skeleton-pdp__gallery-main" ${MARKER}="pdp-gallery"></span>
                    <div class="eob-skeleton-pdp__thumbs">
                        <span class="eob-skeleton-block" ${MARKER}="pdp-thumb"></span>
                        <span class="eob-skeleton-block" ${MARKER}="pdp-thumb"></span>
                        <span class="eob-skeleton-block" ${MARKER}="pdp-thumb"></span>
                    </div>
                </div>
                <div class="eob-skeleton-pdp__info">
                    <span class="eob-skeleton-block eob-skeleton--line eob-skeleton--line-sm"></span>
                    <span class="eob-skeleton-block eob-skeleton--title"></span>
                    <span class="eob-skeleton-block eob-skeleton--line"></span>
                    <span class="eob-skeleton-block eob-skeleton--price"></span>
                    <span class="eob-skeleton-block eob-skeleton--variant"></span>
                    <span class="eob-skeleton-block eob-skeleton--variant"></span>
                    <span class="eob-skeleton-block eob-skeleton--cta"></span>
                </div>
            </div>`;
    }

    function renderCartLineSkeleton(count = 3, variant = 'checkout') {
        const n = clampCount(count, 1, 12);
        const rows = [];
        const rowClass = variant === 'drawer' ? 'eob-skeleton-row eob-skeleton-row--drawer' : 'eob-skeleton-row';
        for (let i = 0; i < n; i += 1) {
            rows.push(`
                <div class="${rowClass}" ${MARKER}="cart-line" aria-hidden="true">
                    <span class="eob-skeleton-block eob-skeleton--thumb"></span>
                    <div class="eob-skeleton--body">
                        <span class="eob-skeleton-block eob-skeleton--name"></span>
                        <span class="eob-skeleton-block eob-skeleton--meta"></span>
                    </div>
                    <span class="eob-skeleton-block eob-skeleton--total"></span>
                </div>`);
        }
        return `<div class="eob-skeleton-cart-lines eob-skeleton-host" ${MARKER}="cart-lines" aria-busy="true">${rows.join('')}</div>`;
    }

    function renderCartSummarySkeleton() {
        return `
            <div class="eob-skeleton-summary-lines" ${MARKER}="summary-lines" aria-hidden="true">
                <span class="eob-skeleton-block eob-skeleton--wide"></span>
                <span class="eob-skeleton-block eob-skeleton--half"></span>
                <span class="eob-skeleton-block eob-skeleton--half"></span>
                <span class="eob-skeleton-block eob-skeleton--grand"></span>
            </div>`;
    }

    function countSkeletonMarkers(html) {
        const str = String(html || '');
        const matches = str.match(/data-eob-skeleton="[^"]+"/g);
        return matches ? matches.length : 0;
    }

    function countSkeletonNodes(root) {
        if (!root || typeof root.querySelectorAll !== 'function') return 0;
        return root.querySelectorAll(`[${MARKER}]`).length;
    }

    function clearSkeletonNodes(root) {
        if (!root || typeof root.querySelectorAll !== 'function') return;
        const selectors = [
            '.eob-skeleton-host',
            '.eob-skeleton-card',
            '.eob-skeleton-pdp',
            '.eob-skeleton-categories',
            '.eob-skeleton-banner',
            '.eob-skeleton-cart-lines',
            '.eob-summary-skeleton-overlay'
        ].join(', ');
        root.querySelectorAll(selectors).forEach((el) => el.remove());
    }

    function mountSkeletonHtml(container, html) {
        if (!container) return false;
        clearSkeletonNodes(container);
        container.innerHTML = html;
        container.classList.add('eob-skeleton-host');
        container.setAttribute('aria-busy', 'true');
        return true;
    }

    function swapSkeletonForContent(container, contentHtml, options = {}) {
        if (!container) return false;
        const fadeMs = Number(options.fadeMs) || 0;
        const apply = () => {
            clearSkeletonNodes(container);
            container.classList.remove('eob-skeleton-host', 'eob-skeleton-fade-out');
            container.removeAttribute('aria-busy');
            container.innerHTML = contentHtml;
            container.classList.add('eob-content-reveal');
        };
        if (fadeMs > 0 && container.classList.contains('eob-skeleton-host')) {
            container.classList.add('eob-skeleton-fade-out');
            global.setTimeout(apply, fadeMs);
            return true;
        }
        apply();
        return true;
    }

    function mountCartLinesSkeleton(container, count, variant) {
        return mountSkeletonHtml(container, renderCartLineSkeleton(count, variant));
    }

    function setCheckoutSummarySkeleton(active) {
        const section = global.document && global.document.getElementById('orderSummarySection');
        if (!section) return;
        const existing = section.querySelector('.eob-summary-skeleton-overlay');
        if (!active) {
            existing?.remove();
            section.classList.remove('eob-summary-loading');
            return;
        }
        if (existing) return;
        section.classList.add('eob-summary-loading');
        const overlay = global.document.createElement('div');
        overlay.className = 'eob-summary-skeleton-overlay eob-skeleton-host';
        overlay.setAttribute(MARKER, 'summary-overlay');
        overlay.innerHTML = renderCartSummarySkeleton();
        section.appendChild(overlay);
    }

    const api = {
        MARKER,
        renderProductCardSkeleton,
        renderProductGridSkeleton,
        renderBannerSkeleton,
        renderCategoryStripSkeleton,
        renderPdpSkeleton,
        renderCartLineSkeleton,
        renderCartSummarySkeleton,
        countSkeletonMarkers,
        countSkeletonNodes,
        clearSkeletonNodes,
        mountSkeletonHtml,
        swapSkeletonForContent,
        mountCartLinesSkeleton,
        setCheckoutSummarySkeleton
    };

    global.EOBSkeletons = api;
})(typeof window !== 'undefined' ? window : global);
