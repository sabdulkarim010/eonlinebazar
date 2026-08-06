/**
 * Project: EOnlineBazar
 * File: js/admin-banner.js
 * Description: Admin hero banner slider management — create, edit, reorder, settings.
 */

(function () {
  'use strict';

  const DESKTOP_PRESETS = ['300px', '240px', '180px'];
  const MOBILE_PRESETS = ['200px', '150px', '100px'];
  const DESKTOP_MAX = 300;
  const DESKTOP_MIN = 80;
  const MOBILE_MAX = 200;
  const MOBILE_MIN = 60;

  let editingBannerId = null;
  let bannersCache = [];
  let linkCategories = [];
  let linkPages = [];
  let linkOptionsLoaded = false;
  let suppressLinkScopeSync = false;
  let selectedPreviewId = null;
  let previewFromForm = false;

  function bannerToken() {
    return localStorage.getItem('adminToken') || '';
  }

  function bannerNotify(message, type = 'success') {
    if (typeof window.showToast === 'function') return window.showToast(message, type);
    console[type === 'error' ? 'error' : 'log'](message);
  }

  function bannerAuthHeaders(json = false) {
    const headers = { Authorization: 'Bearer ' + bannerToken() };
    if (json) headers['Content-Type'] = 'application/json';
    return headers;
  }

  function handleBannerAuth(res, data = {}) {
    if (res.status === 401) {
      localStorage.removeItem('adminToken');
      window.location.replace('/admin-login');
      return 'auth_failed';
    }
    if (res.status === 403) {
      bannerNotify(data.message || 'Access denied.', 'warning');
      return 'forbidden';
    }
    if (res.status === 429) {
      bannerNotify(data.message || 'Too many requests — please wait and try again.', 'warning');
      return 'rate_limited';
    }
    return 'ok';
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function clampPx(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function parseHeightPx(value) {
    const n = parseInt(String(value || '').trim(), 10);
    return Number.isFinite(n) ? n : null;
  }

  function slugifyPath(value) {
    return String(value || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\u0980-\u09FF\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function categoryPath(cat) {
    const slug = String(cat?.slug || '').trim() || slugifyPath(cat?.name);
    if (!slug) return '';
    return `/category/${encodeURIComponent(slug)}`;
  }

  function pagePath(page) {
    const slug = String(page?.slug || '').trim();
    if (!slug) return '';
    return `/page/${encodeURIComponent(slug)}`;
  }

  function normalizeRelativeLink(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value) || value.startsWith('//') || value.startsWith('mailto:') || value.startsWith('tel:')) {
      return value;
    }
    return value.startsWith('/') ? value : `/${value}`;
  }

  function resolveHeightFromUi(selectId, customId, presets, min, max, fallback) {
    const select = document.getElementById(selectId);
    const custom = document.getElementById(customId);
    const sel = select?.value || '';

    if (sel === 'custom') {
      const n = parseHeightPx(custom?.value);
      if (n == null) return fallback;
      return `${clampPx(n, min, max)}px`;
    }

    if (presets.includes(sel)) return sel;

    const n = parseHeightPx(sel);
    if (n == null) return fallback;
    return `${clampPx(n, min, max)}px`;
  }

  function applyHeightToUi(value, selectId, customId, customWrapId, presets, min, max, fallback) {
    const select = document.getElementById(selectId);
    const custom = document.getElementById(customId);
    const wrap = document.getElementById(customWrapId);
    if (!select) return;

    const raw = String(value || fallback).trim();
    if (presets.includes(raw)) {
      select.value = raw;
      if (custom) custom.value = parseHeightPx(raw) ?? '';
      if (wrap) wrap.hidden = true;
      return;
    }

    const n = parseHeightPx(raw);
    const px = n == null ? parseHeightPx(fallback) : clampPx(n, min, max);
    select.value = 'custom';
    if (custom) custom.value = px ?? '';
    if (wrap) wrap.hidden = false;
  }

  function onBannerHeightPresetChange(which) {
    if (which === 'desktop') {
      const wrap = document.getElementById('bannerHeightCustomWrap');
      const select = document.getElementById('bannerHeight');
      if (wrap) wrap.hidden = select?.value !== 'custom';
      if (select?.value !== 'custom') {
        const custom = document.getElementById('bannerHeightCustom');
        if (custom) custom.value = parseHeightPx(select.value) ?? '';
      }
      return;
    }
    const wrap = document.getElementById('bannerMobileHeightCustomWrap');
    const select = document.getElementById('bannerMobileHeight');
    if (wrap) wrap.hidden = select?.value !== 'custom';
    if (select?.value !== 'custom') {
      const custom = document.getElementById('bannerMobileHeightCustom');
      if (custom) custom.value = parseHeightPx(select.value) ?? '';
    }
  }

  function syncOverlayLabel() {
    const range = document.getElementById('newBannerOverlay');
    const label = document.getElementById('overlayVal');
    if (range && label) label.textContent = `${range.value}%`;
  }

  /* ── Solid background color (clearable) ── */

  function getBannerBgColor() {
    const el = document.getElementById('newBannerBgColor');
    if (!el || el.dataset.empty === '1') return '';
    return el.value || '';
  }

  function setBannerBgColor(hex) {
    const el = document.getElementById('newBannerBgColor');
    const hexInput = document.getElementById('bannerBgColorHex');
    if (!el) return;
    const cleaned = String(hex || '').trim();
    if (cleaned) {
      el.value = cleaned;
      el.dataset.empty = '0';
      el.classList.remove('is-cleared');
      if (hexInput) hexInput.value = cleaned;
    } else {
      el.dataset.empty = '1';
      el.classList.add('is-cleared');
      if (!el.value) el.value = '#1a1a2e';
      if (hexInput) hexInput.value = '';
    }
  }

  function clearBannerBgColor() {
    setBannerBgColor('');
    updateBannerLivePreview();
  }

  function onBannerBgColorInput() {
    const el = document.getElementById('newBannerBgColor');
    const hexInput = document.getElementById('bannerBgColorHex');
    if (el) {
      el.dataset.empty = '0';
      el.classList.remove('is-cleared');
      if (hexInput) hexInput.value = el.value;
    }
    updateBannerLivePreview();
  }

  function onBannerBgHexInput(input) {
    const raw = String(input?.value || '').trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(raw)) return;
    const el = document.getElementById('newBannerBgColor');
    if (!el) return;
    el.value = raw;
    el.dataset.empty = '0';
    el.classList.remove('is-cleared');
    updateBannerLivePreview();
  }

  function syncBannerTextColorHex() {
    const color = document.getElementById('newBannerTextColor');
    const hex = document.getElementById('bannerTextColorHex');
    if (color && hex) hex.value = color.value;
  }

  function onBannerTextHexInput(input) {
    const raw = String(input?.value || '').trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(raw)) return;
    const el = document.getElementById('newBannerTextColor');
    if (el) el.value = raw;
    updateBannerLivePreview();
  }

  /* ── Relative path / link scope helpers ── */

  function flattenCategories(nodes, depth = 0, out = []) {
    (nodes || []).forEach((cat) => {
      if (!cat) return;
      out.push({
        _id: cat._id,
        name: cat.name,
        slug: cat.slug,
        depth,
        path: categoryPath(cat)
      });
      const kids = cat.children || cat.subCategories || [];
      if (kids.length) flattenCategories(kids, depth + 1, out);
    });
    return out;
  }

  async function ensureBannerLinkOptions() {
    if (linkOptionsLoaded) return;
    linkOptionsLoaded = true;

    try {
      const catRes = await fetch('/api/categories');
      const catData = await catRes.json();
      if (catData.success) {
        if (Array.isArray(catData.data) && catData.data.length) {
          linkCategories = flattenCategories(catData.data);
        } else if (Array.isArray(catData.flat)) {
          linkCategories = (catData.flat || []).map((cat) => ({
            _id: cat._id,
            name: cat.name,
            slug: cat.slug,
            depth: cat.parentCategory ? 1 : 0,
            path: categoryPath(cat)
          }));
        }
      }
    } catch (err) {
      console.warn('Banner link categories failed:', err);
    }

    try {
      const pageRes = await fetch('/api/admin/pages', {
        headers: bannerAuthHeaders()
      });
      const pageData = await pageRes.json();
      if (pageRes.ok && pageData.success && Array.isArray(pageData.data)) {
        linkPages = pageData.data
          .filter((p) => p && p.slug)
          .map((p) => ({
            slug: p.slug,
            title: p.title || p.slug,
            path: pagePath(p)
          }));
      }
    } catch (err) {
      console.warn('Banner link pages failed:', err);
    }
  }

  function updateLinkFieldChrome(scope) {
    const label = document.getElementById('newBannerLinkLabel');
    const hint = document.getElementById('newBannerLinkHint');
    const input = document.getElementById('newBannerLink');
    const targetWrap = document.getElementById('bannerLinkTargetWrap');
    const targetLabel = document.getElementById('newBannerLinkTargetLabel');

    if (scope === 'external') {
      if (label) label.textContent = 'External URL';
      if (hint) hint.textContent = 'Full URL, e.g. https://example.com/promo';
      if (input) input.placeholder = 'https://example.com/promo';
      if (targetWrap) targetWrap.hidden = true;
      return;
    }

    if (label) label.textContent = 'Relative Path';
    if (hint) {
      hint.textContent = scope === 'page'
        ? 'Site-relative path, e.g. /page/deals'
        : scope === 'category'
          ? 'Site-relative path, e.g. /category/fashion-apparel'
          : 'Site-relative path, e.g. /category/fashion-apparel or /page/deals';
    }
    if (input) {
      input.placeholder = scope === 'page'
        ? '/page/deals'
        : '/category/fashion-apparel';
    }

    if (!scope || scope === '') {
      if (targetWrap) targetWrap.hidden = true;
      return;
    }

    if (targetWrap) targetWrap.hidden = false;
    if (targetLabel) {
      targetLabel.textContent = scope === 'page' ? 'Select Page' : 'Select Category';
    }
  }

  function populateLinkTargetOptions(scope, preferredPath = '') {
    const select = document.getElementById('newBannerLinkTarget');
    if (!select) return;

    const items = scope === 'category'
      ? linkCategories.filter((c) => c.path)
      : scope === 'page'
        ? linkPages.filter((p) => p.path)
        : [];

    const options = ['<option value="">Select…</option>'];
    items.forEach((item) => {
      const indent = item.depth ? `${'—'.repeat(Math.min(item.depth, 3))} ` : '';
      const label = scope === 'page'
        ? `${item.title} (${item.path})`
        : `${indent}${item.name}`;
      const selected = preferredPath && item.path === preferredPath ? ' selected' : '';
      options.push(
        `<option value="${escapeHtml(item.path)}"${selected}>${escapeHtml(label)}</option>`
      );
    });
    select.innerHTML = options.join('');

    if (preferredPath && !items.some((i) => i.path === preferredPath)) {
      select.value = '';
    }
  }

  async function onBannerLinkScopeChange() {
    await ensureBannerLinkOptions();
    const scope = document.getElementById('newBannerLinkScope')?.value || '';
    const linkInput = document.getElementById('newBannerLink');
    updateLinkFieldChrome(scope);

    if (!scope) {
      populateLinkTargetOptions('');
      return;
    }

    if (scope === 'external') {
      populateLinkTargetOptions('');
      return;
    }

    const current = normalizeRelativeLink(linkInput?.value || '');
    const matchesScope = scope === 'category'
      ? current.startsWith('/category/')
      : (current.startsWith('/page/') || current.startsWith('/pages/'));
    const preferred = matchesScope ? current : '';

    populateLinkTargetOptions(scope, preferred);

    if (preferred) {
      if (linkInput) linkInput.value = preferred;
      updateBannerLivePreview();
      return;
    }

    const select = document.getElementById('newBannerLinkTarget');
    const first = [...(select?.options || [])].find((o) => o.value);
    if (first && linkInput) {
      linkInput.value = first.value;
      select.value = first.value;
    } else if (linkInput && !matchesScope) {
      linkInput.value = '';
    }
    updateBannerLivePreview();
  }

  function onBannerLinkTargetChange() {
    if (suppressLinkScopeSync) return;
    const select = document.getElementById('newBannerLinkTarget');
    const linkInput = document.getElementById('newBannerLink');
    if (!select || !linkInput || !select.value) return;
    linkInput.value = select.value;
    updateBannerLivePreview();
  }

  function onBannerLinkManualInput() {
    const linkInput = document.getElementById('newBannerLink');
    const scopeEl = document.getElementById('newBannerLinkScope');
    const targetEl = document.getElementById('newBannerLinkTarget');
    const path = normalizeRelativeLink(linkInput?.value || '');

    if (linkInput && path !== (linkInput.value || '').trim()) {
      // Keep typing as-is; only sync target match
    }

    if (targetEl && [...targetEl.options].some((o) => o.value === path)) {
      targetEl.value = path;
    } else if (targetEl && scopeEl?.value !== 'external') {
      targetEl.value = '';
    }

    updateBannerLivePreview();
  }

  function inferLinkScope(linkUrl) {
    const raw = String(linkUrl || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw) || raw.startsWith('//') || raw.startsWith('mailto:') || raw.startsWith('tel:')) {
      return 'external';
    }
    const path = normalizeRelativeLink(raw);
    if (path.startsWith('/category/')) return 'category';
    if (path.startsWith('/page/') || path.startsWith('/pages/')) return 'page';
    return '';
  }

  async function applyLinkUrlToForm(linkUrl) {
    await ensureBannerLinkOptions();
    const scope = inferLinkScope(linkUrl);
    const path = normalizeRelativeLink(linkUrl);
    const scopeEl = document.getElementById('newBannerLinkScope');
    const linkInput = document.getElementById('newBannerLink');

    suppressLinkScopeSync = true;
    if (scopeEl) scopeEl.value = scope;
    updateLinkFieldChrome(scope);
    if (scope === 'category' || scope === 'page') {
      populateLinkTargetOptions(scope, path);
    } else {
      populateLinkTargetOptions('');
    }
    if (linkInput) linkInput.value = path;
    suppressLinkScopeSync = false;
  }

  /* ── Live preview (device frames) ── */

  function readPreviewImageSrc(previewId) {
    const img = document.querySelector(`#${previewId} img.banner-preview-img`);
    return img?.getAttribute('src') || '';
  }

  function setPreviewImg(imgEl, src) {
    if (!imgEl) return;
    if (src) {
      imgEl.src = src;
      imgEl.hidden = false;
      imgEl.style.display = 'block';
    } else {
      imgEl.removeAttribute('src');
      imgEl.hidden = true;
      imgEl.style.display = 'none';
    }
  }

  function setPreviewOverlay(el, overlay, hasImage) {
    if (!el) return;
    if (hasImage) {
      el.hidden = false;
      el.style.display = 'block';
      el.style.background = `rgba(0,0,0,${overlay})`;
    } else {
      el.hidden = true;
      el.style.display = 'none';
    }
  }

  function applyPreviewState({
    title = '',
    subtitle = '',
    btnText = '',
    imgSrc = '',
    mobileImgSrc = '',
    bgColor = '',
    overlay = 0.3,
    textColor = '#ffffff',
    label = ''
  } = {}) {
    const desktopPrev = document.getElementById('desktopBannerPreview');
    const desktopImg = document.getElementById('desktopPreviewImg');
    const desktopOverlay = document.getElementById('desktopPreviewOverlay');
    const desktopTitle = document.getElementById('desktopPreviewTitle');
    const desktopSubtitle = document.getElementById('desktopPreviewSubtitle');
    const desktopBtn = document.getElementById('desktopPreviewBtn');

    const mobilePrev = document.getElementById('mobileBannerPreview');
    const mobileImg = document.getElementById('mobilePreviewImg');
    const mobileOverlay = document.getElementById('mobilePreviewOverlay');
    const mobileTitle = document.getElementById('mobilePreviewTitle');
    const mobileSubtitle = document.getElementById('mobilePreviewSubtitle');
    const mobileBtn = document.getElementById('mobilePreviewBtn');

    const solid = bgColor || '#0d1117';
    const color = textColor || '#ffffff';
    const mobileSrc = mobileImgSrc || imgSrc;

    if (desktopPrev) desktopPrev.style.background = solid;
    if (mobilePrev) mobilePrev.style.background = solid;

    setPreviewImg(desktopImg, imgSrc);
    setPreviewImg(mobileImg, mobileSrc);
    setPreviewOverlay(desktopOverlay, overlay, Boolean(imgSrc));
    setPreviewOverlay(mobileOverlay, overlay, Boolean(mobileSrc));

    if (desktopTitle) {
      desktopTitle.textContent = title || (imgSrc || bgColor ? '(No title)' : 'Click a banner below to preview');
      desktopTitle.style.color = color;
    }
    if (desktopSubtitle) {
      if (subtitle) {
        desktopSubtitle.textContent = subtitle;
        desktopSubtitle.style.color = color;
        desktopSubtitle.style.display = 'block';
        desktopSubtitle.hidden = false;
      } else if (!title && !imgSrc && !bgColor) {
        desktopSubtitle.textContent = 'Select from Current Banners →';
        desktopSubtitle.style.color = 'rgba(255,255,255,0.8)';
        desktopSubtitle.style.display = 'block';
        desktopSubtitle.hidden = false;
      } else {
        desktopSubtitle.textContent = '';
        desktopSubtitle.style.display = 'none';
        desktopSubtitle.hidden = true;
      }
    }
    if (desktopBtn) {
      if (btnText) {
        desktopBtn.textContent = btnText;
        desktopBtn.hidden = false;
        desktopBtn.style.display = 'inline-block';
      } else {
        desktopBtn.hidden = true;
        desktopBtn.style.display = 'none';
      }
    }

    if (mobileTitle) {
      mobileTitle.textContent = title || (imgSrc || bgColor ? '(No title)' : '📱 Preview');
      mobileTitle.style.color = color;
    }
    if (mobileSubtitle) {
      if (subtitle) {
        mobileSubtitle.textContent = subtitle;
        mobileSubtitle.style.color = color;
        mobileSubtitle.hidden = false;
        mobileSubtitle.style.display = 'block';
      } else {
        mobileSubtitle.hidden = true;
        mobileSubtitle.style.display = 'none';
      }
    }
    if (mobileBtn) {
      if (btnText) {
        mobileBtn.textContent = btnText;
        mobileBtn.hidden = false;
        mobileBtn.style.display = 'inline-block';
      } else {
        mobileBtn.hidden = true;
        mobileBtn.style.display = 'none';
      }
    }

    const labelEl = document.getElementById('previewingLabel');
    if (labelEl) {
      labelEl.textContent = label || (title ? `Previewing: ${title}` : 'No banner selected');
    }
  }

  function updateBannerLivePreview() {
    previewFromForm = true;
    const title = document.getElementById('newBannerTitle')?.value?.trim() || '';
    const subtitle = document.getElementById('newBannerSubtitle')?.value?.trim() || '';
    const linkText = document.getElementById('newBannerLinkText')?.value?.trim() || '';
    const textColor = document.getElementById('newBannerTextColor')?.value || '#ffffff';
    const bgColor = getBannerBgColor();
    const overlayPct = parseInt(document.getElementById('newBannerOverlay')?.value || '30', 10);
    const overlay = (Number.isFinite(overlayPct) ? Math.min(100, Math.max(0, overlayPct)) : 30) / 100;
    const desktopImg = readPreviewImageSrc('desktopImgPreview');
    const mobileImg = readPreviewImageSrc('mobileImgPreview') || desktopImg;

    const drawerOpen = document.getElementById('bannerDrawer')?.classList.contains('is-open');
    if (!drawerOpen && !desktopImg && !bgColor && !title) {
      // Keep list selection preview unless drawer is driving the preview
      if (selectedPreviewId) {
        const item = document.querySelector(`.banner-list-item[data-id="${selectedPreviewId}"]`);
        if (item) {
          previewFromForm = false;
          previewBanner(item, { skipHighlight: true });
          return;
        }
      }
    }

    applyPreviewState({
      title,
      subtitle,
      btnText: linkText,
      imgSrc: desktopImg,
      mobileImgSrc: mobileImg,
      bgColor,
      overlay,
      textColor,
      label: drawerOpen
        ? (editingBannerId ? `Editing: ${title || '(Untitled)'}` : `Draft: ${title || '(New banner)'}`)
        : (title ? `Previewing: ${title}` : 'No banner selected')
    });
    previewFromForm = false;
  }

  function previewBanner(el, opts = {}) {
    if (!el) return;
    // Ignore clicks on action controls
    if (!opts.skipHighlight && opts.event) {
      const t = opts.event.target;
      if (t.closest('button, label, input, a, .banner-list-actions, .toggle-switch')) return;
    }

    if (!opts.skipHighlight) {
      document.querySelectorAll('.banner-list-item').forEach((item) => {
        item.classList.remove('is-previewing');
      });
      el.classList.add('is-previewing');
      selectedPreviewId = el.dataset.id || null;
    }

    const title = el.dataset.title || '';
    const subtitle = el.dataset.subtitle || '';
    const btnText = el.dataset.btnText || '';
    const imgSrc = el.dataset.img || '';
    const mobileImgSrc = el.dataset.mobileImg || imgSrc;
    const bgColor = el.dataset.bgColor || '';
    const overlay = parseInt(el.dataset.overlay || '0', 10) / 100;
    const textColor = el.dataset.textColor || '#ffffff';

    applyPreviewState({
      title,
      subtitle,
      btnText,
      imgSrc,
      mobileImgSrc,
      bgColor,
      overlay: Number.isFinite(overlay) ? overlay : 0.3,
      textColor,
      label: `Previewing: ${title || '(Untitled banner)'}`
    });
  }

  function switchPreviewTab(tab) {
    const desktopFrame = document.getElementById('desktopPreviewFrame');
    const mobileFrame = document.getElementById('mobilePreviewFrame');
    const desktopTab = document.getElementById('previewDesktopTab');
    const mobileTab = document.getElementById('previewMobileTab');

    const isDesktop = tab !== 'mobile';
    if (desktopFrame) {
      desktopFrame.hidden = !isDesktop;
      desktopFrame.style.display = isDesktop ? 'block' : 'none';
    }
    if (mobileFrame) {
      mobileFrame.hidden = isDesktop;
      mobileFrame.style.display = isDesktop ? 'none' : 'flex';
    }
    desktopTab?.classList.toggle('is-active', isDesktop);
    mobileTab?.classList.toggle('is-active', !isDesktop);
  }

  function toggleSliderSettings() {
    const body = document.getElementById('sliderSettingsBody');
    const icon = document.getElementById('settingsToggleIcon');
    const btn = document.querySelector('.banner-settings-toggle');
    if (!body) return;
    const isHidden = body.hidden || body.style.display === 'none';
    if (isHidden) {
      body.hidden = false;
      body.style.display = '';
      if (icon) icon.textContent = '▲';
      btn?.setAttribute('aria-expanded', 'true');
    } else {
      body.hidden = true;
      body.style.display = 'none';
      if (icon) icon.textContent = '▼';
      btn?.setAttribute('aria-expanded', 'false');
    }
  }

  function openBannerDrawer(mode = 'add') {
    const drawer = document.getElementById('bannerDrawer');
    const backdrop = document.getElementById('bannerDrawerBackdrop');
    if (!drawer) return;
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    drawer.style.right = '0';
    if (backdrop) {
      backdrop.hidden = false;
      backdrop.style.display = 'block';
    }
    document.body.classList.add('banner-drawer-open');
    document.body.style.overflow = 'hidden';
    updateBannerLivePreview();
  }

  function closeBannerDrawer() {
    const drawer = document.getElementById('bannerDrawer');
    const backdrop = document.getElementById('bannerDrawerBackdrop');
    if (drawer) {
      drawer.classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');
      drawer.style.right = '';
    }
    if (backdrop) {
      backdrop.hidden = true;
      backdrop.style.display = 'none';
    }
    document.body.classList.remove('banner-drawer-open');
    document.body.style.overflow = '';

    const wasEditing = Boolean(editingBannerId);
    resetBannerForm(true);
    if (wasEditing) renderBannerList(bannersCache);

    if (selectedPreviewId) {
      const item = document.querySelector(`.banner-list-item[data-id="${selectedPreviewId}"]`);
      if (item) previewBanner(item, { skipHighlight: true });
      else applyPreviewState({});
    } else {
      applyPreviewState({});
    }
  }

  function updateBannerCount(n) {
    const el = document.getElementById('bannerCount');
    if (el) el.textContent = `${n} banner${n === 1 ? '' : 's'}`;
  }

  async function loadBanners() {
    try {
      ensureBannerLinkOptions();
      const res = await fetch('/api/admin/banners', {
        headers: bannerAuthHeaders()
      });
      const data = await res.json();
      if (handleBannerAuth(res, data) !== 'ok') return;
      if (data.success) {
        bannersCache = data.banners || [];
        renderBannerList(bannersCache);
        loadBannerSettings(data.settings);
        updateBannerLivePreview();
      }
    } catch (err) {
      console.warn('Could not load banners:', err);
    }
  }

  function loadBannerSettings(settings) {
    if (!settings) return;
    const s = settings;
    const el = (id) => document.getElementById(id);
    if (el('bannerAutoPlay')) el('bannerAutoPlay').value = String(s.autoPlay !== false);
    if (el('bannerInterval')) el('bannerInterval').value = String(s.autoPlayInterval || 4000);
    if (el('bannerEffect')) el('bannerEffect').value = s.transitionEffect || 'slide';
    applyHeightToUi(
      s.height, 'bannerHeight', 'bannerHeightCustom', 'bannerHeightCustomWrap',
      DESKTOP_PRESETS, DESKTOP_MIN, DESKTOP_MAX, '300px'
    );
    applyHeightToUi(
      s.mobileHeight, 'bannerMobileHeight', 'bannerMobileHeightCustom', 'bannerMobileHeightCustomWrap',
      MOBILE_PRESETS, MOBILE_MIN, MOBILE_MAX, '200px'
    );
    if (el('bannerShowDots')) el('bannerShowDots').value = String(s.showDots !== false);
    if (el('bannerShowArrows')) el('bannerShowArrows').value = String(s.showArrows !== false);
  }

  function thumbHtml(b) {
    if (b.imageUrl) {
      return `<img class="banner-list-thumb" src="${escapeHtml(b.imageUrl)}" alt="${escapeHtml(b.title || 'Banner')}">`;
    }
    const color = b.backgroundColor || '#1a1a2e';
    return `<div class="banner-list-thumb banner-list-thumb--color" style="background:${escapeHtml(color)}" title="${escapeHtml(color)}"></div>`;
  }

  function renderBannerList(banners) {
    const container = document.getElementById('bannersList');
    if (!container) return;

    updateBannerCount(banners?.length || 0);

    if (!banners || !banners.length) {
      selectedPreviewId = null;
      container.innerHTML = `
      <div class="empty-state banner-mgr-empty">
        <div class="empty-state-icon">🖼️</div>
        <p>No banners yet. Click “Add New Banner” to create one.</p>
      </div>`;
      applyPreviewState({});
      return;
    }

    container.innerHTML = banners.map((b, i) => {
      const overlayPct = Math.round((b.overlayOpacity ?? 0.3) * 100);
      const isSelected = selectedPreviewId === b._id;
      return `
    <div class="banner-list-item${isSelected ? ' is-previewing' : ''}${editingBannerId === b._id ? ' is-editing' : ''}"
         draggable="true"
         data-id="${b._id}"
         data-pos="${i}"
         data-img="${escapeHtml(b.imageUrl || '')}"
         data-mobile-img="${escapeHtml(b.mobileImageUrl || '')}"
         data-title="${escapeHtml(b.title || '')}"
         data-subtitle="${escapeHtml(b.subtitle || '')}"
         data-btn-text="${escapeHtml(b.linkText || '')}"
         data-bg-color="${escapeHtml(b.backgroundColor || '')}"
         data-overlay="${overlayPct}"
         data-text-color="${escapeHtml(b.textColor || '#ffffff')}"
         data-link="${escapeHtml(b.linkUrl || '')}"
         onclick="previewBanner(this, { event: event })">
      <span class="banner-drag-handle drag-handle" title="Drag to reorder">⠿</span>
      ${thumbHtml(b)}
      <div class="banner-list-info">
        <div class="banner-list-title">
          ${escapeHtml(b.title || '(No title)')}
          ${b.mobileImageUrl ? '<span class="banner-badge banner-badge--mobile">📱 Mobile</span>' : ''}
          ${!b.imageUrl && b.backgroundColor ? '<span class="banner-badge banner-badge--color">Solid</span>' : ''}
          ${editingBannerId === b._id ? '<span class="banner-badge banner-badge--editing">Editing</span>' : ''}
        </div>
        <div class="banner-list-url">
          Overlay ${overlayPct}%
          ${b.linkUrl ? ' · ' + escapeHtml(b.linkUrl) : ''}
        </div>
      </div>
      <div class="banner-list-actions" onclick="event.stopPropagation()">
        <label class="toggle-switch" title="Active/Inactive">
          <input type="checkbox" ${b.isActive ? 'checked' : ''}
                 onchange="toggleBanner('${b._id}', this.checked)">
          <span class="toggle-slider"></span>
        </label>
        <button type="button" class="btn-secondary banner-edit-btn" onclick="editBanner('${b._id}')" title="Edit banner">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button type="button" class="danger-btn-sm" onclick="deleteBannerItem('${b._id}')" title="Delete banner">
          🗑️
        </button>
      </div>
    </div>`;
    }).join('');

    setupBannerDragReorder(container);

    // Auto-preview first banner if nothing selected
    if (!selectedPreviewId || !banners.some((b) => b._id === selectedPreviewId)) {
      const first = container.querySelector('.banner-list-item');
      if (first) previewBanner(first);
    } else {
      const current = container.querySelector(`.banner-list-item[data-id="${selectedPreviewId}"]`);
      if (current) previewBanner(current, { skipHighlight: true });
    }
  }

  function setupBannerDragReorder(container) {
    let dragEl = null;

    container.querySelectorAll('.banner-list-item').forEach((item) => {
      item.addEventListener('dragstart', () => {
        dragEl = item;
        item.classList.add('dragging');
      });
      item.addEventListener('dragend', async () => {
        item.classList.remove('dragging');
        dragEl = null;
        const order = [...container.querySelectorAll('.banner-list-item')].map((el, index) => ({
          id: el.dataset.id,
          position: index
        }));
        try {
          await fetch('/api/admin/banners/reorder', {
            method: 'PATCH',
            headers: bannerAuthHeaders(true),
            body: JSON.stringify({ order })
          });
        } catch (err) {
          console.warn('Banner reorder failed:', err);
        }
      });
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        const after = getBannerDragAfterElement(container, e.clientY);
        if (!dragEl) return;
        if (after == null) container.appendChild(dragEl);
        else container.insertBefore(dragEl, after);
      });
    });
  }

  function getBannerDragAfterElement(container, y) {
    const items = [...container.querySelectorAll('.banner-list-item:not(.dragging)')];
    return items.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
  }

  function previewBannerImg(input, previewId, zoneId) {
    const file = input.files[0];
    if (!file) return;

    const zone = document.getElementById(zoneId);
    const preview = document.getElementById(previewId);
    const reader = new FileReader();

    reader.onload = (e) => {
      preview.innerHTML = `
      <img class="banner-preview-img" src="${e.target.result}" alt="Preview">
    `;
      zone?.classList.add('has-image');
      updateBannerLivePreview();
    };
    reader.readAsDataURL(file);
  }

  function setUploadPreview(previewId, zoneId, imageUrl, emptyHtml) {
    const preview = document.getElementById(previewId);
    const zone = document.getElementById(zoneId);
    if (!preview || !zone) return;
    if (imageUrl) {
      preview.innerHTML = `<img class="banner-preview-img" src="${escapeHtml(imageUrl)}" alt="Preview">`;
      zone.classList.add('has-image');
    } else {
      preview.innerHTML = emptyHtml;
      zone.classList.remove('has-image');
    }
  }

  function resetBannerForm(skipPreviewRestore = false) {
    editingBannerId = null;
    const desktopEmpty =
      '<p>🖼️ Click to upload</p><small>Max 10MB · JPG, PNG, WebP</small>';
    const mobileEmpty =
      '<p>📱 Click to upload</p><small>768×400px recommended</small>';

    const fileDesktop = document.getElementById('bannerDesktopFile');
    const fileMobile = document.getElementById('bannerMobileFile');
    if (fileDesktop) fileDesktop.value = '';
    if (fileMobile) fileMobile.value = '';

    setUploadPreview('desktopImgPreview', 'desktopImgZone', null, desktopEmpty);
    setUploadPreview('mobileImgPreview', 'mobileImgZone', null, mobileEmpty);

    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = v;
    };
    setVal('newBannerTitle', '');
    setVal('newBannerSubtitle', '');
    setVal('newBannerLink', '');
    setVal('newBannerLinkText', 'Shop Now');
    setVal('newBannerTextColor', '#ffffff');
    setVal('bannerTextColorHex', '#ffffff');
    setBannerBgColor('');
    setVal('newBannerOverlay', '30');
    setVal('newBannerLinkScope', '');
    updateLinkFieldChrome('');
    populateLinkTargetOptions('');
    syncOverlayLabel();

    const formTitle = document.getElementById('bannerFormTitle');
    if (formTitle) formTitle.textContent = '➕ Add New Banner';
    const btn = document.getElementById('addBannerBtn');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '☁️ Upload &amp; Save Banner';
    }

    const imgHint = document.getElementById('bannerDesktopImgHint');
    if (imgHint) imgHint.textContent = '🖥️ Desktop Image';

    if (!skipPreviewRestore) {
      renderBannerList(bannersCache);
    }
  }

  async function editBanner(id) {
    const banner = bannersCache.find((b) => b._id === id);
    if (!banner) {
      bannerNotify('Banner not found', 'error');
      return;
    }

    editingBannerId = id;

    const desktopEmpty =
      '<p>🖼️ Click to upload</p><small>Max 10MB · JPG, PNG, WebP</small>';
    const mobileEmpty =
      '<p>📱 Click to upload</p><small>768×400px recommended</small>';

    const fileDesktop = document.getElementById('bannerDesktopFile');
    const fileMobile = document.getElementById('bannerMobileFile');
    if (fileDesktop) fileDesktop.value = '';
    if (fileMobile) fileMobile.value = '';

    setUploadPreview('desktopImgPreview', 'desktopImgZone', banner.imageUrl, desktopEmpty);
    setUploadPreview('mobileImgPreview', 'mobileImgZone', banner.mobileImageUrl, mobileEmpty);

    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = v;
    };
    setVal('newBannerTitle', banner.title || '');
    setVal('newBannerSubtitle', banner.subtitle || '');
    setVal('newBannerLinkText', banner.linkText || 'Shop Now');
    setVal('newBannerTextColor', banner.textColor || '#ffffff');
    setVal('bannerTextColorHex', banner.textColor || '#ffffff');
    setBannerBgColor(banner.backgroundColor || '');

    const overlayPct = Math.round((banner.overlayOpacity ?? 0.3) * 100);
    setVal('newBannerOverlay', String(overlayPct));
    syncOverlayLabel();

    await applyLinkUrlToForm(banner.linkUrl || '');

    const formTitle = document.getElementById('bannerFormTitle');
    if (formTitle) formTitle.textContent = '✏️ Edit Banner';
    const btn = document.getElementById('addBannerBtn');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '💾 Update Banner';
    }

    const imgHint = document.getElementById('bannerDesktopImgHint');
    if (imgHint) imgHint.textContent = '🖥️ Desktop Image (leave empty to keep current)';

    selectedPreviewId = id;
    renderBannerList(bannersCache);
    openBannerDrawer('edit');
  }

  function cancelBannerEdit(fromDrawerClose = false) {
    resetBannerForm(fromDrawerClose);
    if (!fromDrawerClose) closeBannerDrawer();
  }

  async function addNewBanner() {
    const desktopFile = document.getElementById('bannerDesktopFile')?.files?.[0];
    const bgColor = getBannerBgColor();
    const isEdit = Boolean(editingBannerId);
    const linkUrl = normalizeRelativeLink(document.getElementById('newBannerLink')?.value || '');

    if (!isEdit && !desktopFile && !bgColor) {
      bannerNotify('Please select a desktop image or a solid background color', 'error');
      return;
    }

    if (isEdit) {
      const existing = bannersCache.find((b) => b._id === editingBannerId);
      if (existing && !desktopFile && !existing.imageUrl && !bgColor) {
        bannerNotify('Banner needs an image or solid background color', 'error');
        return;
      }
    }

    const btn = document.getElementById('addBannerBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${isEdit ? 'Updating...' : 'Uploading...'}`;
    }

    const formData = new FormData();
    if (desktopFile) formData.append('bannerImage', desktopFile);

    const mobileFile = document.getElementById('bannerMobileFile')?.files?.[0];
    if (mobileFile) formData.append('mobileBannerImage', mobileFile);

    formData.append('title', document.getElementById('newBannerTitle')?.value || '');
    formData.append('subtitle', document.getElementById('newBannerSubtitle')?.value || '');
    formData.append('linkUrl', linkUrl);
    formData.append('linkText', document.getElementById('newBannerLinkText')?.value || 'Shop Now');
    formData.append('textColor', document.getElementById('newBannerTextColor')?.value || '#ffffff');
    formData.append('backgroundColor', bgColor);
    formData.append(
      'overlayOpacity',
      (parseInt(document.getElementById('newBannerOverlay')?.value || '0', 10) / 100).toFixed(2)
    );

    let succeeded = false;
    try {
      const url = isEdit ? `/api/admin/banners/${editingBannerId}` : '/api/admin/banners';
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: bannerAuthHeaders(),
        body: formData
      });
      const data = await res.json();
      if (handleBannerAuth(res, data) !== 'ok') return;

      if (data.success) {
        succeeded = true;
        bannerNotify(isEdit ? 'Banner updated successfully!' : 'Banner added successfully!', 'success');
        // Close drawer UI without recursive form reset
        editingBannerId = null;
        const drawer = document.getElementById('bannerDrawer');
        const backdrop = document.getElementById('bannerDrawerBackdrop');
        if (drawer) {
          drawer.classList.remove('is-open');
          drawer.setAttribute('aria-hidden', 'true');
          drawer.style.right = '';
        }
        if (backdrop) {
          backdrop.hidden = true;
          backdrop.style.display = 'none';
        }
        document.body.classList.remove('banner-drawer-open');
        document.body.style.overflow = '';
        resetBannerForm(true);
        await loadBanners();
      } else {
        bannerNotify(data.message || (isEdit ? 'Update failed' : 'Upload failed'), 'error');
      }
    } catch (err) {
      bannerNotify((isEdit ? 'Update' : 'Upload') + ' error: ' + err.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        if (!succeeded) {
          btn.innerHTML = isEdit
            ? '💾 Update Banner'
            : '☁️ Upload &amp; Save Banner';
        }
      }
    }
  }

  async function deleteBannerItem(id) {
    if (!confirm('Delete this banner?')) return;
    try {
      const res = await fetch('/api/admin/banners/' + id, {
        method: 'DELETE',
        headers: bannerAuthHeaders()
      });
      const data = await res.json();
      if (handleBannerAuth(res, data) !== 'ok') return;
      if (data.success) {
        if (editingBannerId === id) {
          editingBannerId = null;
          const drawer = document.getElementById('bannerDrawer');
          if (drawer?.classList.contains('is-open')) {
            drawer.classList.remove('is-open');
            drawer.setAttribute('aria-hidden', 'true');
            drawer.style.right = '';
            const backdrop = document.getElementById('bannerDrawerBackdrop');
            if (backdrop) {
              backdrop.hidden = true;
              backdrop.style.display = 'none';
            }
            document.body.classList.remove('banner-drawer-open');
            document.body.style.overflow = '';
          }
          resetBannerForm(true);
        }
        if (selectedPreviewId === id) selectedPreviewId = null;
        bannerNotify('Banner deleted', 'success');
        await loadBanners();
      }
    } catch (err) {
      bannerNotify('Delete failed', 'error');
    }
  }

  async function toggleBanner(id, isActive) {
    try {
      const res = await fetch('/api/admin/banners/' + id, {
        method: 'PATCH',
        headers: bannerAuthHeaders(true),
        body: JSON.stringify({ isActive })
      });
      const data = await res.json();
      if (handleBannerAuth(res, data) !== 'ok') return;
      bannerNotify(isActive ? 'Banner activated' : 'Banner hidden', 'success');
      const cached = bannersCache.find((b) => b._id === id);
      if (cached) cached.isActive = isActive;
    } catch (err) {
      bannerNotify('Update failed', 'error');
    }
  }

  async function saveBannerSettings() {
    const height = resolveHeightFromUi(
      'bannerHeight', 'bannerHeightCustom',
      DESKTOP_PRESETS, DESKTOP_MIN, DESKTOP_MAX, '300px'
    );
    const mobileHeight = resolveHeightFromUi(
      'bannerMobileHeight', 'bannerMobileHeightCustom',
      MOBILE_PRESETS, MOBILE_MIN, MOBILE_MAX, '200px'
    );

    const settings = {
      autoPlay: document.getElementById('bannerAutoPlay').value === 'true',
      autoPlayInterval: parseInt(document.getElementById('bannerInterval').value, 10),
      transitionEffect: document.getElementById('bannerEffect').value,
      height,
      mobileHeight,
      showDots: document.getElementById('bannerShowDots').value === 'true',
      showArrows: document.getElementById('bannerShowArrows').value === 'true'
    };

    try {
      const res = await fetch('/api/admin/banners/settings', {
        method: 'PUT',
        headers: bannerAuthHeaders(true),
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      if (handleBannerAuth(res, data) !== 'ok') return;
      if (data.success) {
        bannerNotify('Banner settings saved!', 'success');
        if (data.settings) loadBannerSettings(data.settings);
      }
    } catch (err) {
      bannerNotify('Save failed', 'error');
    }
  }

  // Expose for admin.html onclick handlers + admin.js view refresh
  window.loadBanners = loadBanners;
  window.loadBannerSettings = loadBannerSettings;
  window.renderBannerList = renderBannerList;
  window.previewBannerImg = previewBannerImg;
  window.addNewBanner = addNewBanner;
  window.editBanner = editBanner;
  window.cancelBannerEdit = cancelBannerEdit;
  window.deleteBannerItem = deleteBannerItem;
  window.toggleBanner = toggleBanner;
  window.saveBannerSettings = saveBannerSettings;
  window.onBannerHeightPresetChange = onBannerHeightPresetChange;
  window.syncBannerOverlayLabel = syncOverlayLabel;
  window.clearBannerBgColor = clearBannerBgColor;
  window.onBannerBgColorInput = onBannerBgColorInput;
  window.onBannerBgHexInput = onBannerBgHexInput;
  window.syncBannerTextColorHex = syncBannerTextColorHex;
  window.onBannerTextHexInput = onBannerTextHexInput;
  window.onBannerLinkScopeChange = onBannerLinkScopeChange;
  window.onBannerLinkTargetChange = onBannerLinkTargetChange;
  window.onBannerLinkManualInput = onBannerLinkManualInput;
  window.updateBannerLivePreview = updateBannerLivePreview;
  window.previewBanner = previewBanner;
  window.switchPreviewTab = switchPreviewTab;
  window.toggleSliderSettings = toggleSliderSettings;
  window.openBannerDrawer = openBannerDrawer;
  window.closeBannerDrawer = closeBannerDrawer;

  document.addEventListener('DOMContentLoaded', () => {
    syncOverlayLabel();
    onBannerHeightPresetChange('desktop');
    onBannerHeightPresetChange('mobile');
    updateLinkFieldChrome('');
    setBannerBgColor('');
    syncBannerTextColorHex();
    switchPreviewTab('desktop');
    applyPreviewState({});
    ensureBannerLinkOptions();

    document.getElementById('openAddBannerBtn')?.addEventListener('click', () => {
      resetBannerForm(true);
      openBannerDrawer('add');
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.getElementById('bannerDrawer')?.classList.contains('is-open')) {
        closeBannerDrawer();
      }
    });
  });
})();
