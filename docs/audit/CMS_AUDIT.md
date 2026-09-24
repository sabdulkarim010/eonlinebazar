# CMS AUDIT — EonlineBazar

**Last updated:** 2026-09-24 (Page Content Manager preview/edit mode UX)  
**Scope:** Banners, CMS pages, navbar links, footer settings, store branding, PWA  
**Status:** ✅ COMPLETE

---

## File Inventory

| Path | Role |
|------|------|
| `backend/src/routes/bannerRoutes.js` | Banner CRUD |
| `backend/src/routes/navbarLinkRoutes.js` | Navbar link CRUD |
| `backend/src/controllers/bannerController.js` | Banner + flash sale logic |
| `backend/src/controllers/pageContentController.js` | CMS page content |
| `backend/src/controllers/navbarLinkController.js` | Navbar links |
| `backend/src/controllers/footerSettingsController.js` | Footer config |
| `backend/src/controllers/storeController.js` | Store branding (logo, favicon) |
| `backend/src/controllers/masterSettingsController.js` | Master settings (flash sale IDs) |
| `backend/src/models/banner.js` | Banner model |
| `backend/src/models/PageContent.js` | CMS pages |
| `backend/src/models/NavbarLink.js` | Navbar links |
| `backend/src/models/FooterSettings.js` | Footer settings |
| `backend/src/models/Settings.js` | Global settings singleton (flash sale, branding refs) |
| `backend/src/repositories/bannerRepository.js` | PG banner |
| `backend/src/repositories/pageContentRepository.js` | PG page content |
| `backend/src/repositories/navbarLinkRepository.js` | PG navbar links |
| `backend/src/repositories/footerSettingsRepository.js` | PG footer settings |
| `backend/src/repositories/settingsRepository.js` | PG settings |
| `backend/src/utils/footerIconPaths.js` | Footer icon URL sanitization |
| `client/admin/partials/view-banners.html` | Banner manager |
| `client/js/admin/modules/settings-cms.js` | CMS pages admin |
| `client/js/admin/modules/catalog-navbar.js` | Navbar + pages |
| `client/js/admin/modules/settings-footer.js` | Footer settings |
| `client/js/admin/modules/settings-platform.js` | Branding + maintenance mode settings |
| `backend/src/middlewares/maintenanceModeMiddleware.js` | Customer storefront 503 gate (admin bypass) |
| `client/js/banner-slider.js` | Storefront banner carousel |
| `client/js/page-content-loader.js` | CMS page renderer |
| `client/js/footerRenderer.js` | Dynamic footer render |
| `client/js/store-branding.js` | Logo/favicon injection |
| `client/cms-page.html` | CMS page shell |
| `public/manifest.json` | PWA manifest |

---

## Feature Checklist

- [x] Hero banner CRUD + carousel — `bannerController.js`, `banner-slider.js`
- [x] Flash sale product IDs in settings — `Settings.js`, master settings
- [x] CMS pages (Markdown/HTML) — `pageContentController.js`, `cms-page.html`
- [x] Navbar link management — `navbarLinkController.js`, `catalog-navbar.js`
- [x] Footer settings + icon sanitization — `footerSettingsController.js`, `footerIconPaths.js`
- [x] Store branding (logo, favicon, WhatsApp) — `storeController.js`, `settings-platform.js`
- [x] PWA manifest + service worker toggle — `manifest.json`, settings flag
- [x] SEO sitemap consumer — `seoRoutes.js` (see storefront)
- [x] PG dual-write + read cutover — `READ_PG_BANNER`, `READ_PG_PAGECONTENT`, `READ_PG_NAVBARLINK`, `READ_PG_FOOTERSETTINGS`, `READ_PG_SETTINGS`
- [x] Stage 4 Step 2 CMS/Settings data sync verified — see `DATABASE_MIGRATION_AUDIT.md`
- [x] Maintenance mode with custom message + IP allowlist — Settings Hub; `maintenanceModeMiddleware.js`
- [x] Page Content Manager preview/edit toggle — read-only preview default; Edit Page pencil; Save/Cancel in edit mode; dirty-tracker integration

---

## Known Issues / Gaps

| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| — | — | — | CMS module complete; PG sync PASS per migration audit |

---

## Dependencies & Integrations

- **Unified settings read:** `GET /api/admin/all-settings`
- **Permission:** `manage_catalog` on banner/category writes; admin verify on banners
- **Related audits:** `CUSTOMER_FRONTEND_AUDIT.md`, `ADMIN_PANEL_AUDIT.md`, `MARKETING_AUDIT.md`

---

## Change Log

### Page Content Manager preview/edit UX — 2026-09-24

- Default read-only preview mode with formatted title, subtitle, body, publish badge, contact meta
- Header **Edit Page** pencil toggles edit mode (Quill + inputs); footer **Save Changes** / **Cancel**
- Tab switch or Cancel reverts unsaved edits; successful save returns to preview
- Integrated with `settings-dirty-tracker.js` (`data-settings-dirty-scope="pageContentManager"`) and Ctrl+S quick save when editing
- Files: `settings-cms.js`, `view-store-config.html`, `_cms.css`, `settings-hub.js`, `settings-dirty-tracker.js`
- Tests: **248/248** passing

### Group 4 — Maintenance mode — 2026-09-20

- `maintenanceAllowedIPs` on Settings; admin toggle with warning banner; middleware serves branded 503 HTML
- Admin panel and `/api/admin/*` remain available during maintenance
- Tests: Jest **228/228** passing

### Audit system initialized — codebase scan — 2026-09-20

- Inventoried CMS controllers, 5 PG repositories, admin + storefront modules
- Status: ✅ COMPLETE
