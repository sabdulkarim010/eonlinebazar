/**
 * ==========================================================================
 * File: client/js/header.js
 * Header search category scope selector (#searchCategorySelect).
 * Populates top-level parents only; stores category ID; no redirect on change.
 * ==========================================================================
 */
(function (global) {
    'use strict';

    const SCOPE_STORAGE_KEY = 'eobSearchCategoryScope';

    function getSearchCategorySelect() {
        return document.getElementById('searchCategorySelect')
            || document.getElementById('categorySelect')
            || document.querySelector('.search-box-container .search-category')
            || document.querySelector('.search-category');
    }

    function categoryParentId(cat) {
        if (!cat || cat.parentCategory == null || cat.parentCategory === '') return null;
        return String(cat.parentCategory._id || cat.parentCategory);
    }

    function getTopLevelCategories(categories) {
        if (!Array.isArray(categories) || !categories.length) return [];
        // Tree payload: top-level nodes only (already parents)
        const looksLikeTree = categories.some(
            (c) => Array.isArray(c?.children) || Array.isArray(c?.subCategories)
        );
        if (looksLikeTree) {
            return categories.filter((c) => !categoryParentId(c));
        }
        return categories.filter((c) => !categoryParentId(c));
    }

    function slugify(value) {
        return String(value || '')
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9\u0980-\u09FF\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    function extractCategories(payload) {
        if (Array.isArray(payload)) return payload;
        if (!payload || typeof payload !== 'object') return [];
        if (Array.isArray(payload.flat)) return payload.flat;
        if (Array.isArray(payload.data)) return payload.data;
        if (Array.isArray(payload.categories)) return payload.categories;
        return [];
    }

    /**
     * Populate #searchCategorySelect with top-level categories only.
     * option.value = category _id (scope ID); data-slug for clean listing URLs.
     */
    function populateSearchCategorySelect(categories, preferredValue) {
        const select = getSearchCategorySelect();
        if (!select || !Array.isArray(categories)) return;

        const previous = preferredValue
            || select.value
            || select.dataset.pendingScope
            || localStorage.getItem(SCOPE_STORAGE_KEY)
            || 'all';

        select.innerHTML = '<option value="all">All Categories</option>';

        getTopLevelCategories(categories).forEach((cat) => {
            if (!cat?._id && !cat?.slug && !cat?.name) return;
            const option = document.createElement('option');
            const id = cat._id ? String(cat._id) : '';
            const slug = String(cat.slug || '').trim() || slugify(cat.name);
            // Prefer ID for recursive API filtering; fall back to slug
            option.value = id || slug || cat.name;
            option.textContent = cat.name || slug;
            option.dataset.level = '0';
            if (id) option.dataset.categoryId = id;
            if (slug) option.dataset.slug = slug;
            if (cat.name) option.dataset.name = cat.name;
            select.appendChild(option);
        });

        // Restore by ID, slug, or name
        const match = [...select.options].find((opt) => {
            if (opt.value === previous) return true;
            if (opt.dataset.slug && opt.dataset.slug === previous) return true;
            if (opt.dataset.name && opt.dataset.name === previous) return true;
            if (opt.dataset.categoryId && opt.dataset.categoryId === previous) return true;
            return false;
        });
        select.value = match ? match.value : 'all';
        persistScope(select);
    }

    function persistScope(select) {
        const el = select || getSearchCategorySelect();
        if (!el) return;
        const val = String(el.value || 'all');
        el.dataset.pendingScope = val;
        try {
            if (val && val !== 'all') {
                localStorage.setItem(SCOPE_STORAGE_KEY, val);
            } else {
                localStorage.removeItem(SCOPE_STORAGE_KEY);
            }
        } catch (_) { /* ignore quota / private mode */ }
    }

    /**
     * Read pending scope without navigating.
     * @returns {{ categoryId: string, slug: string, categoryName: string, category: string }}
     */
    function readScope() {
        const select = getSearchCategorySelect();
        if (!select) {
            return { categoryId: '', slug: '', categoryName: '', category: '' };
        }
        const val = String(select.value || '').trim();
        if (!val || val === 'all') {
            return { categoryId: '', slug: '', categoryName: '', category: '' };
        }
        const selected = select.selectedOptions[0];
        const slug = selected?.dataset?.slug || '';
        const categoryId = selected?.dataset?.categoryId || val;
        const categoryName = String(selected?.textContent || '').trim();
        // `category` is the token used in API / URL query (prefer ID)
        return {
            categoryId,
            slug,
            categoryName,
            category: categoryId || slug || val
        };
    }

    async function loadSearchCategorySelect() {
        try {
            // Prefer dedicated tree endpoint (parents + nested); use flat for filtering parents
            const res = await fetch('/api/categories/tree');
            const data = await res.json();
            let categories = extractCategories(data);

            // If tree-only payload, parents are top-level nodes — good for select
            if (!categories.length) {
                const fallback = await fetch('/api/categories').then((r) => r.json());
                const flat = Array.isArray(fallback?.flat) ? fallback.flat : null;
                categories = flat && flat.length ? flat : extractCategories(fallback);
            }

            if (!categories.length) return;
            populateSearchCategorySelect(categories);
        } catch (err) {
            console.warn('Search category select load error:', err);
        }
    }

    /**
     * Bind change handler: store scope ID only — never redirect / submit.
     * Enter / search-icon handlers stay in main.js or search.js.
     */
    function bindScopeSelect() {
        const select = getSearchCategorySelect();
        if (!select || select.dataset.scopeBound === '1') return;
        select.dataset.scopeBound = '1';
        select.addEventListener('change', (event) => {
            event.preventDefault();
            event.stopPropagation();
            persistScope(select);
        });
    }

    function initHeaderSearchScope() {
        bindScopeSelect();
        return loadSearchCategorySelect();
    }

    const api = {
        getSearchCategorySelect,
        populateSearchCategorySelect,
        loadSearchCategorySelect,
        readScope,
        persistScope,
        bindScopeSelect,
        initHeaderSearchScope,
        getTopLevelCategories
    };

    global.HeaderSearch = api;
    // Back-compat for main.js / search.js call sites
    global.getSearchCategorySelect = getSearchCategorySelect;
    global.populateSearchCategorySelect = populateSearchCategorySelect;
    global.loadSearchCategorySelect = loadSearchCategorySelect;
    global.loadCategoryDropdown = loadSearchCategorySelect;
})(typeof window !== 'undefined' ? window : globalThis);

document.addEventListener('DOMContentLoaded', () => {
    if (window.HeaderSearch) {
        window.HeaderSearch.bindScopeSelect();
    }
});







