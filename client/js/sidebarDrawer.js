/**
 * ==========================================================================
 * File: client/js/sidebarDrawer.js
 * Amazon-style ☰ All side drawer — Shop by Department + sub-category panel.
 * ==========================================================================
 */
(function (global) {
    'use strict';

    let categoriesCache = [];

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
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

    function listingHref(catOrSlug) {
        let slug = '';
        if (catOrSlug && typeof catOrSlug === 'object') {
            slug = String(catOrSlug.slug || '').trim() || slugify(catOrSlug.name);
        } else {
            slug = slugify(catOrSlug);
        }
        if (!slug) return '/products';
        return `/category/${encodeURIComponent(slug)}`;
    }

    function childList(cat) {
        if (!cat) return [];
        if (Array.isArray(cat.children) && cat.children.length) return cat.children;
        if (Array.isArray(cat.subCategories) && cat.subCategories.length) return cat.subCategories;
        return [];
    }

    function categoryAccent(cat) {
        return cat?.accentColor || cat?.color || '#f97316';
    }

    function categoryImage(cat) {
        return cat?.imageUrl || cat?.image || cat?.iconUrl || '';
    }

    /** Image thumb or color/icon avatar for a department row. */
    function renderDeptAvatar(cat) {
        const name = escapeHtml(cat?.name || 'Category');
        const img = categoryImage(cat);
        const color = escapeHtml(categoryAccent(cat));
        const icon = escapeHtml(cat?.icon || '🏷️');

        if (img) {
            return `<img class="nav-drawer__dept-avatar"
                         src="${escapeHtml(img)}"
                         alt="${name}"
                         width="36" height="36"
                         loading="lazy"
                         onerror="this.style.display='none';this.nextElementSibling&&(this.nextElementSibling.hidden=false)">
                    <span class="nav-drawer__dept-avatar nav-drawer__dept-avatar--fallback"
                          style="--cat-color:${color}" hidden aria-hidden="true">${icon}</span>`;
        }

        return `<span class="nav-drawer__dept-avatar nav-drawer__dept-avatar--fallback"
                      style="--cat-color:${color}" aria-hidden="true">${icon}</span>`;
    }

    function ensureDom() {
        const existing = document.getElementById('navDrawer');
        if (existing) {
            // Rebuild if markup is from an older drawer layout
            const hasAvatarLink = Boolean(document.getElementById('navDrawerAvatarLink'));
            const closeInsideHeader = Boolean(
                existing.querySelector('.nav-drawer__header .nav-drawer__close, .drawer-header .drawer-close-btn')
            );
            if (hasAvatarLink && closeInsideHeader) {
                return {
                    backdrop: document.getElementById('navDrawerBackdrop'),
                    drawer: existing
                };
            }
            existing.remove();
            document.getElementById('navDrawerBackdrop')?.remove();
        }

        const backdrop = document.createElement('div');
        backdrop.id = 'navDrawerBackdrop';
        backdrop.className = 'nav-drawer-backdrop';
        backdrop.setAttribute('aria-hidden', 'true');

        const drawer = document.createElement('aside');
        drawer.id = 'navDrawer';
        drawer.className = 'nav-drawer';
        drawer.setAttribute('role', 'dialog');
        drawer.setAttribute('aria-modal', 'true');
        drawer.setAttribute('aria-label', 'All departments');
        drawer.setAttribute('aria-hidden', 'true');
        drawer.innerHTML = `
            <div class="nav-drawer__header drawer-header">
                <div class="nav-drawer__greeting" id="navDrawerGreeting">
                    <a href="/login" class="nav-drawer__avatar-link" id="navDrawerAvatarLink" aria-label="Sign in">
                        <span class="nav-drawer__avatar-wrap">
                            <img id="navDrawerAvatar" class="nav-drawer__avatar" alt="" width="32" height="32">
                            <i class="fa fa-user-circle nav-drawer__avatar-fallback" aria-hidden="true"></i>
                        </span>
                    </a>
                    <span class="nav-drawer__greeting-text" id="navDrawerGreetingText">
                        <span class="nav-drawer__name--full">Hello, Sign in</span>
                        <span class="nav-drawer__name--short">Hello, Sign in</span>
                    </span>
                </div>
                <button type="button" class="nav-drawer__close drawer-close-btn" id="navDrawerCloseBtn" aria-label="Close menu">&times;</button>
            </div>
            <div class="nav-drawer__body">
                <div class="nav-drawer__panels">
                    <div class="nav-drawer__panel nav-drawer__panel--main" id="navDrawerMainPanel">
                        <h2 class="nav-drawer__section-title">Shop by Department</h2>
                        <ul class="nav-drawer__list" id="navDrawerDeptList"></ul>
                        <div class="nav-drawer__divider"></div>
                        <a href="/products" class="nav-drawer__footer-link">See all products</a>
                    </div>
                    <div class="nav-drawer__panel nav-drawer__panel--sub" id="navDrawerSubPanel" hidden>
                        <button type="button" class="nav-drawer__back" id="navDrawerBackBtn">
                            <i class="fa fa-chevron-left" aria-hidden="true"></i>
                            Back to All Categories
                        </button>
                        <h2 class="nav-drawer__sub-title" id="navDrawerSubTitle"></h2>
                        <ul class="nav-drawer__list" id="navDrawerSubList"></ul>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(backdrop);
        document.body.appendChild(drawer);
        return { backdrop, drawer };
    }

    function readCachedCustomer() {
        try {
            const raw = localStorage.getItem('customerData');
            if (!raw) return null;
            const data = JSON.parse(raw);
            return data && typeof data === 'object' ? data : null;
        } catch (_) {
            return null;
        }
    }

    function setGreetingLabels(fullLabel, shortLabel) {
        const textEl = document.getElementById('navDrawerGreetingText');
        if (!textEl) return;
        let fullEl = textEl.querySelector('.nav-drawer__name--full');
        let shortEl = textEl.querySelector('.nav-drawer__name--short');
        if (!fullEl || !shortEl) {
            textEl.innerHTML = `
                <span class="nav-drawer__name--full"></span>
                <span class="nav-drawer__name--short"></span>`;
            fullEl = textEl.querySelector('.nav-drawer__name--full');
            shortEl = textEl.querySelector('.nav-drawer__name--short');
        }
        if (fullEl) fullEl.textContent = fullLabel;
        if (shortEl) shortEl.textContent = shortLabel;
    }

    function setDrawerAvatar(url) {
        const img = document.getElementById('navDrawerAvatar');
        if (!img) return;
        const src = String(url || '').trim();
        if (!src) {
            img.removeAttribute('src');
            img.classList.remove('is-visible');
            img.alt = '';
            return;
        }
        img.src = src;
        img.alt = 'Profile';
        img.classList.add('is-visible');
        img.onerror = () => {
            img.removeAttribute('src');
            img.classList.remove('is-visible');
            img.alt = '';
        };
    }

    function syncGreeting() {
        const avatarLink = document.getElementById('navDrawerAvatarLink');
        if (!avatarLink) return;

        const token = localStorage.getItem('customerToken') || localStorage.getItem('token');
        const cached = readCachedCustomer();
        const name = String(
            (cached && (cached.name || cached.fullName))
            || localStorage.getItem('userName')
            || ''
        ).trim();
        const first = name ? name.split(/\s+/)[0] : '';
        const avatarUrl = (cached && (cached.avatar || cached.avatarUrl || cached.profileImage)) || '';

        if (token) {
            const fullLabel = name ? `Hello, ${name}` : 'Hello, Account';
            const shortLabel = first ? `Hello, ${first}` : 'Hello, Account';
            setGreetingLabels(fullLabel, shortLabel);
            // Profile link applies only to the avatar — not the greeting text row
            avatarLink.href = '/profile';
            avatarLink.setAttribute('aria-label', name ? `Profile for ${name}` : 'Your profile');
            setDrawerAvatar(avatarUrl);

            if (!avatarUrl || !name) {
                fetch('/api/customer/profile', {
                    headers: { Authorization: `Bearer ${token}` }
                })
                    .then((res) => (res.ok ? res.json() : null))
                    .then((data) => {
                        if (!data) return;
                        const apiName = String(data.name || data.fullName || '').trim();
                        const apiAvatar = data.avatar || data.avatarUrl || data.profileImage || '';
                        if (apiName) {
                            localStorage.setItem('userName', apiName);
                            const apiFirst = apiName.split(/\s+/)[0];
                            setGreetingLabels(`Hello, ${apiName}`, `Hello, ${apiFirst}`);
                            avatarLink.setAttribute('aria-label', `Profile for ${apiName}`);
                        }
                        if (apiAvatar) setDrawerAvatar(apiAvatar);
                        try {
                            const next = { ...(cached || {}), ...data };
                            localStorage.setItem('customerData', JSON.stringify(next));
                        } catch (_) { /* ignore */ }
                    })
                    .catch(() => { /* non-blocking */ });
            }
        } else {
            setGreetingLabels('Hello, Sign in', 'Hello, Sign in');
            avatarLink.href = '/login';
            avatarLink.setAttribute('aria-label', 'Sign in');
            setDrawerAvatar('');
        }
    }

    function renderDepartments(categories) {
        const list = document.getElementById('navDrawerDeptList');
        if (!list) return;

        const parents = Array.isArray(categories) ? categories : [];
        if (!parents.length) {
            list.innerHTML = '<li class="nav-drawer__empty">No departments available.</li>';
            return;
        }

        list.innerHTML = parents.map((cat, index) => {
            const name = escapeHtml(cat.name);
            const href = listingHref(cat);
            const children = childList(cat);
            const hasChildren = children.length > 0;
            const avatar = renderDeptAvatar(cat);

            if (hasChildren) {
                return `
                    <li class="nav-drawer__item">
                        <button type="button"
                                class="nav-drawer__expand"
                                data-drawer-expand="${index}"
                                aria-label="Browse ${name} subcategories">
                            ${avatar}
                            <span class="nav-drawer__dept-label">${name}</span>
                            <i class="fa fa-chevron-right nav-drawer__chevron" aria-hidden="true"></i>
                        </button>
                    </li>`;
            }

            return `
                <li class="nav-drawer__item">
                    <a class="nav-drawer__link" href="${href}" data-category-id="${escapeHtml(cat._id || '')}">
                        ${avatar}
                        <span class="nav-drawer__dept-label">${name}</span>
                    </a>
                </li>`;
        }).join('');
    }

    function openSubPanel(cat) {
        const drawer = document.getElementById('navDrawer');
        const subPanel = document.getElementById('navDrawerSubPanel');
        const title = document.getElementById('navDrawerSubTitle');
        const subList = document.getElementById('navDrawerSubList');
        if (!drawer || !subPanel || !title || !subList || !cat) return;

        const name = escapeHtml(cat.name);
        const parentHref = listingHref(cat);
        const children = childList(cat);

        title.textContent = cat.name || 'Department';
        subList.innerHTML = `
            <li class="nav-drawer__item">
                <a class="nav-drawer__link" href="${parentHref}">
                    <span>See all in ${name}</span>
                </a>
            </li>
            ${children.map((child) => {
                const nested = childList(child);
                if (nested.length) {
                    // Nested child with its own kids → link to parent listing (recursive filter)
                    return `
                        <li class="nav-drawer__item">
                            <a class="nav-drawer__link"
                               href="${listingHref(child)}"
                               data-category-id="${escapeHtml(child._id || '')}">
                                <span>${escapeHtml(child.name)}</span>
                            </a>
                        </li>`;
                }
                return `
                    <li class="nav-drawer__item">
                        <a class="nav-drawer__link"
                           href="${listingHref(child)}"
                           data-category-id="${escapeHtml(child._id || '')}">
                            <span>${escapeHtml(child.name)}</span>
                        </a>
                    </li>`;
            }).join('')}
        `;

        subPanel.hidden = false;
        // Force reflow so the slide transition always runs
        void subPanel.offsetWidth;
        drawer.classList.add('is-sub-open');

        const backBtn = document.getElementById('navDrawerBackBtn');
        if (backBtn) backBtn.focus();
    }

    function closeSubPanel() {
        const drawer = document.getElementById('navDrawer');
        const subPanel = document.getElementById('navDrawerSubPanel');
        if (drawer) drawer.classList.remove('is-sub-open');
        if (subPanel) {
            window.setTimeout(() => {
                if (drawer && !drawer.classList.contains('is-sub-open')) {
                    subPanel.hidden = true;
                }
            }, 300);
        }
    }

    function openDrawer() {
        const { backdrop, drawer } = ensureDom();
        syncGreeting();
        closeSubPanel();

        backdrop.classList.add('is-visible');
        backdrop.setAttribute('aria-hidden', 'false');
        drawer.classList.add('is-open');
        drawer.setAttribute('aria-hidden', 'false');
        document.body.classList.add('nav-drawer-open');

        const openBtn = document.getElementById('navDrawerOpenBtn');
        if (openBtn) openBtn.setAttribute('aria-expanded', 'true');

        const closeBtn = document.getElementById('navDrawerCloseBtn');
        if (closeBtn) closeBtn.focus();
    }

    function closeDrawer() {
        const backdrop = document.getElementById('navDrawerBackdrop');
        const drawer = document.getElementById('navDrawer');
        if (!drawer) return;

        closeSubPanel();
        drawer.classList.remove('is-open');
        drawer.setAttribute('aria-hidden', 'true');
        if (backdrop) {
            backdrop.classList.remove('is-visible');
            backdrop.setAttribute('aria-hidden', 'true');
        }
        document.body.classList.remove('nav-drawer-open');

        const openBtn = document.getElementById('navDrawerOpenBtn');
        if (openBtn) {
            openBtn.setAttribute('aria-expanded', 'false');
            openBtn.focus();
        }
    }

    function bindEvents() {
        const { backdrop, drawer } = ensureDom();
        if (drawer.dataset.bound === '1') return;
        drawer.dataset.bound = '1';

        document.getElementById('navDrawerCloseBtn')?.addEventListener('click', closeDrawer);
        document.getElementById('navDrawerBackBtn')?.addEventListener('click', closeSubPanel);
        backdrop.addEventListener('click', closeDrawer);

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape' || !drawer.classList.contains('is-open')) return;
            if (drawer.classList.contains('is-sub-open')) {
                closeSubPanel();
            } else {
                closeDrawer();
            }
        });

        document.getElementById('navDrawerDeptList')?.addEventListener('click', (e) => {
            const expandBtn = e.target.closest('[data-drawer-expand]');
            if (!expandBtn) return;
            const index = Number(expandBtn.getAttribute('data-drawer-expand'));
            const cat = categoriesCache[index];
            if (cat) openSubPanel(cat);
        });
    }

    /**
     * Initialize / refresh the drawer with a tree of parent categories
     * (each may include nested children / subCategories).
     */
    function init(categories) {
        categoriesCache = Array.isArray(categories) ? categories : [];
        ensureDom();
        bindEvents();
        renderDepartments(categoriesCache);
        syncGreeting();

        const openBtn = document.getElementById('navDrawerOpenBtn');
        if (openBtn && openBtn.dataset.drawerBound !== '1') {
            openBtn.dataset.drawerBound = '1';
            openBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openDrawer();
            });
        }
    }

    const api = {
        init,
        open: openDrawer,
        close: closeDrawer,
        openSubPanel,
        closeSubPanel,
        listingHref,
        syncGreeting
    };

    global.SidebarDrawer = api;
    // Back-compat aliases used by main.js
    global.initNavDrawer = init;
    global.openNavDrawer = openDrawer;
    global.closeNavDrawer = closeDrawer;
    global.syncNavDrawerGreeting = syncGreeting;
})(typeof window !== 'undefined' ? window : globalThis);










