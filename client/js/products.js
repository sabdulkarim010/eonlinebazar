/**
 * ==========================================================================
 * File Name: js/products.js
 * Project: eOnlineBazar
 * Description: Shared catalog pagination UI — Amazon-style Load More,
 * items-per-page selector, and numbered page pills for Home / Search.
 * ==========================================================================
 */

(function (global) {
    'use strict';

    const PAGE_SIZE_OPTIONS = [12, 24, 48, 96];
    const DEFAULT_PAGE_SIZE = 24;

    function normalizePageSize(value, fallback = DEFAULT_PAGE_SIZE) {
        const n = parseInt(value, 10);
        if (PAGE_SIZE_OPTIONS.includes(n)) return n;
        const fb = parseInt(fallback, 10);
        return PAGE_SIZE_OPTIONS.includes(fb) ? fb : DEFAULT_PAGE_SIZE;
    }

    function clampPage(page, totalPages) {
        const p = Math.max(1, parseInt(page, 10) || 1);
        const max = Math.max(1, parseInt(totalPages, 10) || 1);
        return Math.min(p, max);
    }

    /**
     * Amazon-style "Show: 12 | 24 | 48 | 96" control.
     */
    function renderPageSizeSelector(container, options = {}) {
        if (!container) return;

        const limit = normalizePageSize(options.limit);
        const onChange = typeof options.onChange === 'function' ? options.onChange : null;
        const label = options.label || 'Show:';

        container.innerHTML = '';
        container.classList.add('catalog-page-size');
        container.setAttribute('role', 'group');
        container.setAttribute('aria-label', 'Items per page');

        const labelEl = document.createElement('span');
        labelEl.className = 'catalog-page-size__label';
        labelEl.textContent = label;
        container.appendChild(labelEl);

        PAGE_SIZE_OPTIONS.forEach((size, index) => {
            if (index > 0) {
                const sep = document.createElement('span');
                sep.className = 'catalog-page-size__sep';
                sep.setAttribute('aria-hidden', 'true');
                sep.textContent = '|';
                container.appendChild(sep);
            }

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'catalog-page-size__opt' + (size === limit ? ' is-active' : '');
            btn.textContent = String(size);
            btn.setAttribute('aria-pressed', size === limit ? 'true' : 'false');
            btn.addEventListener('click', () => {
                if (size === limit || !onChange) return;
                onChange(size);
            });
            container.appendChild(btn);
        });
    }

    /**
     * Numbered page pills: ‹ 1 2 3 … N ›
     */
    function renderPaginationPills(container, options = {}) {
        if (!container) return;

        const page = Math.max(1, parseInt(options.page, 10) || 1);
        const totalPages = Math.max(0, parseInt(options.totalPages, 10) || 0);
        const onPageChange = typeof options.onPageChange === 'function' ? options.onPageChange : null;

        container.innerHTML = '';
        container.classList.add('catalog-pagination');

        if (totalPages <= 1) {
            container.hidden = true;
            return;
        }
        container.hidden = false;

        const makeBtn = (label, targetPage, opts = {}) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'page-btn catalog-page-btn' + (opts.active ? ' active' : '');
            btn.innerHTML = label;
            if (opts.disabled) {
                btn.disabled = true;
            } else if (onPageChange) {
                btn.addEventListener('click', () => onPageChange(targetPage));
            }
            return btn;
        };

        container.appendChild(makeBtn('<i class="fa fa-angle-left" aria-hidden="true"></i>', page - 1, {
            disabled: page <= 1
        }));

        const windowSize = 2;
        const start = Math.max(1, page - windowSize);
        const end = Math.min(totalPages, page + windowSize);

        if (start > 1) {
            container.appendChild(makeBtn('1', 1));
            if (start > 2) {
                const dots = document.createElement('span');
                dots.className = 'catalog-pagination__dots';
                dots.textContent = '…';
                container.appendChild(dots);
            }
        }

        for (let i = start; i <= end; i++) {
            container.appendChild(makeBtn(String(i), i, { active: i === page }));
        }

        if (end < totalPages) {
            if (end < totalPages - 1) {
                const dots = document.createElement('span');
                dots.className = 'catalog-pagination__dots';
                dots.textContent = '…';
                container.appendChild(dots);
            }
            container.appendChild(makeBtn(String(totalPages), totalPages));
        }

        container.appendChild(makeBtn('<i class="fa fa-angle-right" aria-hidden="true"></i>', page + 1, {
            disabled: page >= totalPages
        }));
    }

    /**
     * Full-width Amazon-style "View More Products" / Load More button.
     */
    function renderLoadMoreButton(container, options = {}) {
        if (!container) return;

        const hasMore = options.hasMore === true;
        const loading = options.loading === true;
        const onLoadMore = typeof options.onLoadMore === 'function' ? options.onLoadMore : null;
        const label = options.label || 'View More Products';
        const loadingLabel = options.loadingLabel || 'Loading…';

        container.innerHTML = '';
        container.classList.add('catalog-load-more-wrap');

        if (!hasMore) {
            container.hidden = true;
            return;
        }
        container.hidden = false;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'catalog-load-more-btn';
        btn.disabled = loading;
        btn.setAttribute('aria-busy', loading ? 'true' : 'false');
        btn.innerHTML = loading
            ? `<i class="fa fa-spinner fa-spin" aria-hidden="true"></i> ${loadingLabel}`
            : `<span>${label}</span> <i class="fa fa-chevron-down" aria-hidden="true"></i>`;

        if (onLoadMore) {
            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                onLoadMore();
            });
        }

        container.appendChild(btn);
    }

    /**
     * Mark newly appended cards for a short enter animation.
     */
    function markCardsEntering(cards) {
        const list = Array.isArray(cards) ? cards : [];
        list.forEach((card) => {
            if (!card || !card.classList) return;
            card.classList.add('catalog-card-enter');
            card.addEventListener('animationend', () => {
                card.classList.remove('catalog-card-enter');
            }, { once: true });
        });
    }

    global.ProductCatalogUI = {
        PAGE_SIZE_OPTIONS,
        DEFAULT_PAGE_SIZE,
        normalizePageSize,
        clampPage,
        renderPageSizeSelector,
        renderPaginationPills,
        renderLoadMoreButton,
        markCardsEntering
    };
})(typeof window !== 'undefined' ? window : globalThis);






