/**
 * Admin SPA deep links — ?view= query param (replaces legacy #hash routes).
 */

export const ADMIN_VIEW_QUERY = 'view';

const SETTINGS_VIEW_PREFIX = 'settings-';

const FULL_PAGE_VIEW_ROUTES = Object.freeze({
  'activity-feed': { sectionId: 'view-activity-feed' },
  'settings-backup': { sectionId: 'view-system-backup' },
  'settings-health': { sectionId: 'view-settings-health' },
  pos: { sectionId: 'view-pos', openPosModal: true }
});

const SETTINGS_TAB_ALIASES = Object.freeze({
  hub: 'branding'
});

export const VALID_SETTINGS_TABS = Object.freeze([
  'branding',
  'general',
  'shipping',
  'finance',
  'notifications',
  'security',
  'utilities'
]);

function parseSettingsTabFromViewKey(viewKey) {
  const raw = String(viewKey || '').trim().toLowerCase();
  if (!raw.startsWith(SETTINGS_VIEW_PREFIX)) return null;
  const tabId = raw.slice(SETTINGS_VIEW_PREFIX.length);
  if (SETTINGS_TAB_ALIASES[tabId]) return SETTINGS_TAB_ALIASES[tabId];
  return VALID_SETTINGS_TABS.includes(tabId) ? tabId : null;
}

export function viewKeyForSettingsTab(tabId) {
  const normalized = String(tabId || '').trim().toLowerCase();
  if (!normalized || !VALID_SETTINGS_TABS.includes(normalized)) return '';
  if (normalized === 'branding') return 'settings-hub';
  return `${SETTINGS_VIEW_PREFIX}${normalized}`;
}

export function getAdminViewFromUrl(locationRef = window.location) {
  const params = new URLSearchParams(locationRef.search || '');
  return String(params.get(ADMIN_VIEW_QUERY) || '').trim().toLowerCase();
}

export function getSettingsTabFromUrl(locationRef = window.location) {
  return parseSettingsTabFromViewKey(getAdminViewFromUrl(locationRef));
}

/** @deprecated use getSettingsTabFromUrl — kept for callers that still reference hash helpers */
export function getSettingsTabFromHash() {
  return getSettingsTabFromUrl();
}

export function buildAdminQueryUrl(viewKey, { preserveUnrelatedParams = false } = {}) {
  const params = preserveUnrelatedParams
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();

  params.delete('section');
  params.delete('page');
  params.delete('tab');

  const key = String(viewKey || '').trim();
  if (key) params.set(ADMIN_VIEW_QUERY, key);
  else params.delete(ADMIN_VIEW_QUERY);

  const qs = params.toString();
  return `${window.location.pathname}${qs ? `?${qs}` : ''}`;
}

export function updateAdminViewUrl(viewKey, { replace = true } = {}) {
  const nextUrl = buildAdminQueryUrl(viewKey);
  const currentUrl = `${window.location.pathname}${window.location.search}`;
  if (currentUrl === nextUrl) return;

  if (replace) history.replaceState(null, '', nextUrl);
  else history.pushState(null, '', nextUrl);
}

export function syncAdminRouteUrl({ sectionId, settingsTab, navItem } = {}) {
  let viewKey = navItem?.getAttribute?.('data-admin-view')
        || navItem?.getAttribute?.('data-nav-hash')?.replace(/^#/, '');

  if (!viewKey) {
    if (sectionId === 'view-settings' && settingsTab) {
      viewKey = viewKeyForSettingsTab(settingsTab);
    } else if (sectionId) {
      viewKey = sectionId;
    }
  }

  if (viewKey) updateAdminViewUrl(viewKey, { replace: true });
}

export function migrateAdminLegacyUrl() {
  const url = new URL(window.location.href);
  let changed = false;

  for (const legacyKey of ['section', 'page']) {
    if (url.searchParams.has(legacyKey)) {
      url.searchParams.delete(legacyKey);
      changed = true;
    }
  }

  const hashKey = url.hash.replace(/^#/, '').trim().toLowerCase();
  if (hashKey && !url.searchParams.get(ADMIN_VIEW_QUERY)) {
    url.searchParams.set(ADMIN_VIEW_QUERY, hashKey);
    changed = true;
  }
  if (url.hash) {
    url.hash = '';
    changed = true;
  }

  if (!changed) return;

  history.replaceState(null, '', `${url.pathname}${url.search}`);
}

export function resolveAdminViewRoute(viewKey) {
  const key = String(viewKey || '').trim().toLowerCase();
  if (!key) return null;

  if (FULL_PAGE_VIEW_ROUTES[key]) {
    return { type: 'section', ...FULL_PAGE_VIEW_ROUTES[key] };
  }

  const tabId = parseSettingsTabFromViewKey(key);
  if (tabId) {
    return { type: 'settings-tab', sectionId: 'view-settings', tabId };
  }

  if (key.startsWith('view-') || key.startsWith('manage-')) {
    return { type: 'section', sectionId: key };
  }

  return null;
}

function activateSettingsTabFromRoute(tabId) {
  const switchTab = window.requestSettingsTabSwitch || window.activateUnifiedSettingsTab;
  if (typeof switchTab !== 'function') return false;

  const viewSettings = document.getElementById('view-settings');
  if (!viewSettings?.classList.contains('active')) return false;

  switchTab(tabId, { skipDirtyCheck: true, updateUrl: false });
  return true;
}

export function applyAdminRouteFromUrl() {
  const viewKey = getAdminViewFromUrl();
  if (!viewKey) return false;

  const route = resolveAdminViewRoute(viewKey);
  if (!route) return false;

  if (route.type === 'settings-tab') {
    if (activateSettingsTabFromRoute(route.tabId)) return true;

    window.__pendingSettingsTabFromUrl = route.tabId;
    const settingsNav = document.querySelector('.sidebar-menu li[data-target="view-settings"]');
    if (typeof window.navigateAdminSection === 'function') {
      window.navigateAdminSection('view-settings', settingsNav);
    }
    return true;
  }

  if (route.type === 'section') {
    if (route.openPosModal && typeof window.openPOSModal === 'function') {
      window.openPOSModal();
      return true;
    }

    const navItem = document.querySelector(`.sidebar-menu li[data-target="${route.sectionId}"]`);
    if (navItem && typeof window.navigateAdminSection === 'function') {
      window.navigateAdminSection(route.sectionId, navItem);
      return true;
    }
  }

  return false;
}

export function bindAdminUrlPopState() {
  if (window.__adminUrlPopStateBound) return;
  window.__adminUrlPopStateBound = true;

  window.addEventListener('popstate', () => {
    applyAdminRouteFromUrl();
  });
}

Object.assign(window, {
  ADMIN_VIEW_QUERY,
  VALID_SETTINGS_TABS,
  viewKeyForSettingsTab,
  getAdminViewFromUrl,
  getSettingsTabFromUrl,
  getSettingsTabFromHash,
  buildAdminQueryUrl,
  updateAdminViewUrl,
  syncAdminRouteUrl,
  migrateAdminLegacyUrl,
  resolveAdminViewRoute,
  applyAdminRouteFromUrl,
  bindAdminUrlPopState
});
