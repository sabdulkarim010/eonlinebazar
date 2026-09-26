# SETTINGS MODULE AUDIT — EonlineBazar

**Last updated:** 2026-09-26  
**Scope:** System Settings hub (`view-settings.html`), Settings Hub routing, Sidebar Labels, Finance/Security/Notifications/Utilities tabs, and all related backend APIs (`/api/admin/settings*`, `/api/admin/platform-settings`, `/api/admin/master-settings`, `/api/admin/sidebar-labels`, `/api/admin/settings-history`, footer/payment/expense settings).  
**Status:** ✅ COMPLETE — Phase 1–3 enterprise settings suite complete (history, export/import, Ctrl+S quick save)

---

## File Inventory

| Path | Role |
|------|------|
| `client/admin/partials/view-settings.html` | Unified 7-tab settings hub shell |
| `client/admin/partials/view-shipping-payments.html` | Embedded in Shipping tab (VAT, announcement, SMS, courier, payment methods) |
| `client/admin/partials/view-store-config.html` | Embedded in General tab (loyalty, footer CMS, rewards) |
| `client/js/admin/admin-settings.js` | Settings module barrel |
| `client/js/admin/modules/settings-hub.js` | Tab routing, embed mount, general-config save |
| `client/js/admin/modules/settings-platform.js` | Branding, delivery, sandbox, cache, platform fetch |
| `client/js/admin/modules/settings-utils.js` | Shared `settingsFetchJson` — 15s timeout + error toasts |
| `client/js/admin/modules/settings-dirty-tracker.js` | Dirty/pristine tracking, tab guards, save-state chips |
| `client/js/admin/modules/settings-menu-labels.js` | Super Admin sidebar label editor |
| `client/js/admin/modules/sidebarLabels.js` | Sidebar label apply on load (read-only) |
| `client/js/admin/modules/settings-notifications.js` | Email + WhatsApp notification tab |
| `client/js/admin/modules/settings-security.js` | Security logs, sessions, rate limits, blacklist |
| `client/js/admin/modules/settings-history.js` | Settings change history table (Security tab) |
| `backend/src/utils/settingsHistoryFilter.js` | Shared Mongo/PG filter for settings audit events |
| `backend/src/services/settingsHistoryReadService.js` | Routed read for settings-related SecurityLog rows |
| `backend/src/controllers/admin/settingsHistoryController.js` | `GET /api/admin/settings-history` handler |
| `tests/services/settingsHistoryReadService.test.js` | Unit tests — filter matching + read routing |
| `backend/src/utils/settingsExportSanitizer.js` | Secret stripping + import allowlists |
| `backend/src/services/settingsExportImportService.js` | Sanitized JSON export/import apply |
| `backend/src/controllers/admin/settingsExportImportController.js` | `GET/POST /api/admin/settings-export|import` |
| `client/js/admin/modules/settings-backup-restore.js` | Utilities tab export/import UI |
| `tests/services/settingsExportImportService.test.js` | Unit tests — sanitizer + export/import |
| `client/js/admin/modules/settings-2fa.js` | 2FA setup in Security tab |
| `client/js/admin/modules/settings-expense-categories.js` | Finance tab expense category manager |
| `client/js/admin/modules/settings-payments.js` | Payment method CRUD (embedded shipping) |
| `client/js/admin/modules/settings-cms.js` | Profile/platform form handlers, footer, loyalty binds |
| `client/css/admin/_settings*.css` | Modular settings styling (barrel: `_settings.css`) |
| `backend/src/controllers/settingsController.js` | Delivery, cache, rate-limit, gateway, notifications, attendance |
| `backend/src/controllers/masterSettingsController.js` | Unified master settings read/write |
| `backend/src/controllers/admin/adminSettingsController.js` | Platform settings + branding upload |
| `backend/src/controllers/admin/sidebarLabelController.js` | Sidebar label CRUD (Super Admin) |
| `backend/src/repositories/settingsRepository.js` | PG Settings singleton |
| `backend/src/models/SidebarLabel.js` | Mongoose SidebarLabel (Mongo fallback + mirror) |
| `backend/src/repositories/sidebarLabelRepository.js` | PG primary + Mongo fallback/mirror |
| `backend/src/services/settingsReadService.js` | PG read router + Mongo fallback (Settings singleton reads) |
| `backend/src/services/platformSettingsReadService.js` | PG-first platform admin read + Mongo fallback + safe defaults |
| `tests/services/platformSettingsReadService.test.js` | Unit tests — PG/Mongo routing and DB failure defaults |
| `backend/src/services/dualWriteService.js` | Mongo-first writes; PG mirror best-effort |
| `backend/src/services/attendanceSettingsService.js` | Attendance settings with safe read |
| `backend/src/services/notificationConfigService.js` | Notification config read/save |
| `backend/src/routes/adminRoutes.js` | All settings route mounts |
| `prisma/schema.prisma` | `Settings`, `SidebarLabel` models |
| `tests/repositories/sidebarLabel.repository.test.js` | SidebarLabel PG integration tests |

---

## Feature Checklist

- [x] Unified Settings Hub (7 tabs) — `view-settings.html`, `settings-hub.js`
- [x] Store Branding & Info — platform settings, delivery rules, logo/favicon
- [x] General Configuration — order prefix, maintenance mode, embedded store config
- [x] Shipping & Payments — embedded `view-shipping-payments.html`
- [x] Finance Settings — expense category manager
- [x] Notifications — Resend/Brevo email + Baileys WhatsApp
- [x] Security & Access — profile, 2FA, hub links to audit/sessions/logs
- [x] System Utilities — GA link, cache, sandbox (super-admin), backup links
- [x] Sidebar label customization (Super Admin) — Settings → Security
- [x] Sidebar label reset — `DELETE /api/admin/sidebar-labels`
- [x] Dual-write on Settings singleton writes (Mongo → PG)
- [x] PG read fallback to Mongo via `readRouter` / `fetchSettingsDocumentSafe`
- [x] Sidebar label Mongo fallback + PG mirror — `SidebarLabel.js`, `sidebarLabelRepository.js`
- [x] Batch sidebar label save — `PUT /api/admin/sidebar-labels` + `settings-menu-labels.js`
- [x] Centralized settings fetch timeout — `settings-utils.js` `settingsFetchJson` (15s)
- [x] Platform settings PG-first read + safe defaults — `platformSettingsReadService.js`, `getAdminSettings`
- [x] Settings change history UI — `GET /api/admin/settings-history`, Security tab card, `settings-history.js`
- [x] Unsaved-changes warnings hub-wide — `settings-dirty-tracker.js` tab guard + `beforeunload`
- [x] Live save-state indicators per form — `settings-save-state-chip` near save buttons
- [x] Deep-link settings tabs — `#settings-{tab}` hash + `history.replaceState`
- [x] Per-section Discard buttons — `settings-discard-btn` wired to dirty tracker
- [x] Utilities tab SaaS card design — `.saas-settings-card` + `_settings-system.css` utilities grid
- [x] Tab-switch toast noise removed — `settings-hub.js` (save/action toasts only)
- [x] Settings hub wide layout — `.admin-settings-shell` max-width 1360px
- [ ] Live save-state indicators per form — **partial** (button spinners only)
- [x] Settings JSON export/import (sanitized) — Utilities tab + `settings-export` / `settings-import` APIs
- [x] Global keyboard shortcut Ctrl+S / Cmd+S quick save — `settings-hub.js` + `settings-dirty-tracker.js`
- [ ] Reset-to-defaults (global settings) — **partial** (menu labels only; optional future enhancement)

---

## A) Critical Bugs & Broken APIs

| # | Issue | Severity | Root cause | Evidence |
|---|-------|----------|------------|----------|
| A1 | **`PUT /api/admin/sidebar-labels/:key` → 500 on save** | **High** | **Fixed 2026-09-24** — PG primary + Mongo fallback; batch `PUT /api/admin/sidebar-labels`. | `sidebarLabelRepository.js`, `sidebarLabelController.js` |
| A2 | **No Mongo model for SidebarLabel** | **High** | **Fixed 2026-09-24** — `backend/src/models/SidebarLabel.js` added. | `SidebarLabel.js` |
| A3 | **Partial save on menu labels** | **Medium** | **Fixed 2026-09-24** — single batch PUT from frontend. | `settings-menu-labels.js` |
| A4 | **`getMasterSettings` / `getAnnouncementSettings` can 500** | **Medium** | Read uses `fetchSettingsDocument()` (has PG→Mongo fallback), but controller catch still returns 500 if **both** DBs fail. No safe-default payload. | `masterSettingsController.js:238-255` |
| A5 | **`getNotificationConfig` returns 500 on read failure** | **Medium** | Controller has no safe fallback (unlike `getGatewayStatus` which returns defaults on 200). Service uses `fetchSettingsDocumentSafe` internally but outer controller catch is 500. | `settingsController.js:268-276` |
| A6 | **`getAdminSettings` (platform-settings) Mongo-only** | **Medium** | **Fixed 2026-09-24** — `platformSettingsReadService` PG-first via `routedRead('admin')`; safe defaults on total DB failure (200, not 500). | `platformSettingsReadService.js`, `adminSettingsController.js` |
| A7 | **Hub security link cards ignore `data-settings-hub-tab`** | **Low** | `openSettingsHubSection(sectionId)` accepts one arg; second `tabId` from click handler is discarded. Links navigate to standalone sections (intended) but attribute is dead code. | `settings-hub.js:149-173` |
| A8 | **Notifications tab not wired in `activateUnifiedSettingsTab`** | **Low** | Tab click handler in `settings-notifications.js` loads data; programmatic tab activation (deep-link via `core-nav.js`) may skip notification load unless click fires. | `settings-hub.js:125-142`, `settings-notifications.js:252-255` |

### Sidebar Labels 500 — Diagnosis summary

Repository tests **pass locally** against Neon (`tests/repositories/sidebarLabel.repository.test.js` — 3/3). Likely production causes:

1. Migration `20260921073000_add_sidebar_labels` not applied on prod Neon.
2. Deploy missing `npx prisma generate` → `prisma.sidebarLabel` undefined → `SIDEBAR_LABEL_UNAVAILABLE`.
3. Neon connection timeout on `upsert` (reads tolerate; writes throw).
4. Super Admin gate is **403**, not 500 — role mismatch ruled out if error is 500.

**Recommended fix (Phase 1):** Add Mongo `SidebarLabel` collection + dual-write; wrap `upsertSidebarLabel` in PG-try/Mongo-fallback (mirror `findAllMap` resilience); add batch `PUT /api/admin/sidebar-labels` to replace N sequential calls.

---

## B) Resilience & Timeout Vulnerabilities

| Area | Read path | Write path | Gap |
|------|-----------|------------|-----|
| Settings singleton | ✅ `fetchSettingsDocument` → PG with Mongo fallback | ✅ Mongo-first `dualWrite` | Writes fail if **Mongo** down (PG cannot be primary write yet) |
| Sidebar labels | ✅ `findAllMap` returns `{}` on error | ❌ PG-only, throws → 500 | **Critical** |
| Platform settings (Admin doc) | ❌ Mongo only | ✅ `adminDualWrite` | Read vulnerable to Mongo timeout |
| Master settings | ✅ PG read + fallback | ⚠️ `Settings.getOrCreate()` for writes | Write needs Mongo |
| Rate limit settings | ⚠️ `loadRateLimitSettings` uses read service | ⚠️ `Settings.getOrCreate()` direct | Inconsistent read/write sources |
| Delivery settings update | ✅ read via service | ⚠️ `Settings.getOrCreate()` direct | Same |
| Footer settings | ✅ `routedRead` + dual-write | ✅ dual-write | Good pattern |
| Notification config | ✅ `fetchSettingsDocumentSafe` | ⚠️ `Settings.getOrCreate()` | Read OK; write Mongo-dependent |
| Attendance settings | ✅ Never throws; returns defaults | ⚠️ Mongo write | Controller still has 500 catch (unreachable today) |
| Gateway status | ✅ Safe defaults on 200 | N/A | Fixed pattern to replicate |

### Frontend timeout exposure

| Module | Timeout handling | Risk |
|--------|------------------|------|
| `hrm-attendance.js` | ✅ `AbortController` + "Request timed out" toast | Good reference |
| All `settings-*.js` modules | ❌ Raw `fetch()` — no timeout | Slow Neon/Mongo → hung UI or browser default timeout → generic error toasts |
| All listed `settings-*.js` modules | ✅ | `settingsFetchJson()` — 15s AbortController; structured `{ success: false, timeout, error }` |

**Fixed 2026-09-24:** `settings-utils.js` centralizes timeout, console warnings, and user toasts. Spinners reset via existing `finally` / `setButtonLoading` patterns.

---

## C) UI/UX Design Flaws & Space Inefficiencies

### Layout & visual consistency

| Issue | Severity | Details |
|-------|----------|---------|
| **Dual design systems in one hub** | Medium | Branding/Finance/Notifications use `.saas-settings-card` (modern). System Utilities uses legacy `.settings-card` with inline `style=""` attributes — feels dated vs Stripe/Shopify panels. |
| **Hub max-width 1120px** | Low | `.admin-settings-shell { max-width: 1120px }` — fine on laptop; wastes space on 1440px+ monitors where enterprise settings often use two-column layouts. |
| **Tab bar overflow** | Low | 7 tabs with icons scroll horizontally on narrow viewports — OK, but no scroll hint/gradient. |
| **Embedded sections hide headers** | Medium | `mountEmbeddedSettingsSection` hides `.section-header-box` — correct for dedup, but Shipping/General lose contextual titles inside embed mount; user relies on tab label only. |
| **Duplicate password fields** | Medium | Branding tab (`platformCurrentPassword`) and Security tab (`settingsCurrentPassword`) both required for different forms — confusing; users may enter password in wrong tab. |
| **Tab-switch toast noise** | Low | Every tab click fires SweetAlert toast (`settingsHubToast`) — unnecessary for power users; Shopify/Stripe don't toast on navigation. |
| **Security tab is a link farm** | Medium | Five cards jump to **separate sidebar sections** (`view-staff-audit`, `view-security`, etc.) instead of inline panels — breaks "unified hub" mental model. |
| **Finance tab single-purpose** | Low | Only expense categories — no VAT link (VAT lives under Shipping embed); finance settings feel incomplete in-tab. |
| **Inline styles in Utilities** | Medium | GA card, cache card, sandbox use hardcoded colors/margins — inconsistent with tokenized `_settings-system.css`. |
| **Notifications WhatsApp inline style** | Low | `style="margin-top:1rem"` on form-group — should be CSS class. |

### Form UX gaps

| Gap | Enterprise standard | Current state |
|-----|---------------------|---------------|
| Unsaved changes guard | `beforeunload` + tab switch confirm | ❌ Only in chat-admin React (`SettingsPage.jsx`), not store admin hub |
| Save state indicator | "Saved" / "Saving…" / "Unsaved" chip per section | ⚠️ Button loading states only |
| Field-level validation feedback | Inline errors under inputs | ⚠️ Mostly alert/toast on failure |
| Reset to defaults | Per-section and global | ⚠️ Menu labels only |
| Settings search | Stripe settings search | ❌ Missing |
| Change diff preview | Show what will change before save | ❌ Missing |

### Accessibility

- Tab list uses `role="tablist"` / `role="tabpanel"` — ✅ good.
- Super-admin cards use `hidden` + `data-superadmin-only` — ✅.
- Some toggle labels nest `<label>` inside `<label>` (WhatsApp enable) — ⚠️ invalid HTML pattern.

---

## D) Recommended Enterprise-Level Upgrades

### Phase 1 — Critical fixes (1–2 days)

1. **Sidebar labels resilience**
   - Add Mongoose `SidebarLabel` model + dual-write in repository.
   - Controller: PG try → Mongo fallback on timeout; never 500 for transient DB errors.
   - Batch endpoint: `PUT /api/admin/sidebar-labels` with `{ labels: { key: string } }`.
   - Deploy checklist: verify migration applied + `prisma generate` in CI/CD.

2. **Settings fetch helper (frontend)**
   - `settingsFetchJson(url, opts, { timeoutMs: 20000 })` in shared module.
   - User-facing: "Database busy — retrying…" vs "Request timed out."

3. **Platform settings read path** — ✅ Done (2026-09-24)
   - `GET /platform-settings` → `platformSettingsReadService` (PG-first, Mongo fallback, safe defaults).

### Phase 2 — UX polish (3–5 days)

4. **Unsaved changes system** — dirty tracking per form; confirm on tab/section leave.
5. **Utilities tab redesign** — ✅ Done (2026-09-24) — `.saas-settings-card` + utilities grid CSS.
6. **Security tab inline embeds** — optionally embed sessions/audit as accordion panels instead of navigating away.
7. **Remove tab-switch toasts** — ✅ Done (2026-09-24) — tab clicks silent; save/reset/network toasts retained.
8. **Unsaved-changes guard + save chips** — ✅ Done (2026-09-24) — `settings-dirty-tracker.js`.
9. **Deep-link URLs** — ✅ Done (2026-09-24) — `#settings-branding` … `#settings-utilities`.
10. **Per-section Discard buttons** — ✅ Done (2026-09-24) — `installSettingsDiscardButtons()`.
11. **Settings-wide "Reset section to defaults"** — master settings, delivery, rate limits (global reset still partial).

### Phase 3 — Enterprise features (1–2 weeks)

9. **Settings change history panel** — filter `logSecurityEvent` where `resourceType: 'setting'`; show who/when/old→new diff.
10. ~~**Settings export/import JSON**~~ — ✅ Phase 3 Step 2 (`settings-export` / `settings-import`).
11. **Role-scoped settings visibility** — Finance tab keys separate from `manage_settings` coarse key.
12. **Deep-link URLs** — `/admin#settings/finance` with tab persistence in sessionStorage.
13. **Keyboard shortcuts** — `Ctrl+S` save active form.

---

## API Route Inventory (Settings domain)

| Method | Route | Permission | Controller | Resilience |
|--------|-------|------------|------------|------------|
| GET | `/api/admin/all-settings` | verifyAdmin | settingsController | ✅ read service |
| GET/PUT/POST | `/api/admin/settings` | manage_settings (write) | settingsController | ⚠️ write Mongo-only |
| GET/PUT/POST | `/api/admin/rate-limit-settings` | manage_settings | settingsController | ⚠️ mixed |
| POST | `/api/admin/settings/cache` | manage_settings | settingsController | ⚠️ write Mongo-only |
| GET | `/api/admin/settings/gateway-status` | verifyAdmin | settingsController | ✅ safe defaults |
| GET/POST/PUT | `/api/admin/settings/notification-config` | manage_settings | settingsController | ⚠️ read 500 possible |
| POST | `/api/admin/settings/test-email` | manage_settings | settingsController | — |
| GET/POST | `/api/admin/settings/whatsapp-*` | manage_settings | settingsController | ✅ status safe |
| GET/PUT | `/api/admin/settings/attendance` | manage_staff / view | settingsController | ✅ read safe |
| GET/PUT/POST | `/api/admin/master-settings` | manage_settings + aliases | masterSettingsController | ⚠️ read 500 if both DBs fail |
| PUT/POST | `/api/admin/master-settings/update` | manage_settings + aliases | masterSettingsController | ⚠️ write Mongo-only |
| GET/PUT | `/api/admin/platform-settings` | manage_settings (write) | adminSettingsController | ✅ read PG-first + safe defaults |
| POST | `/api/admin/upload-branding` | manage_settings | adminSettingsController | dual-write |
| GET/PUT/POST | `/api/admin/footer-settings` | manage_settings | footerSettingsController | ✅ |
| GET/POST/PATCH/DELETE | `/api/admin/payment-methods` | manage_settings | paymentMethodController | dual-write |
| GET/POST/PATCH/DELETE | `/api/admin/expense-categories*` | manage_settings | expenseCategoryController | PG repo |
| GET | `/api/admin/sidebar-labels` | requireSuperAdmin | sidebarLabelController | ✅ degrades |
| PUT | `/api/admin/sidebar-labels/:key` | requireSuperAdmin | sidebarLabelController | ❌ 500 on PG fail |
| DELETE | `/api/admin/sidebar-labels` | requireSuperAdmin | sidebarLabelController | ⚠️ returns 0 on error (OK) |
| GET/POST | `/api/admin/sandbox/*` | requireSuperAdmin | sandboxController | — |
| GET | `/api/admin/system/backup-*` | requireSuperAdmin | backupController | — |

---

## Known Issues / Gaps

| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| Sidebar label save 500 | High | Fixed | PG primary + Mongo fallback; batch API (2026-09-24) |
| Settings frontend no fetch timeout | Medium | Fixed | `settingsFetchJson()` in `settings-utils.js` (2026-09-24) |
| Platform settings Mongo-only read | Medium | Fixed | `platformSettingsReadService.js` — PG-first + defaults (2026-09-24) |
| Dual design systems in Utilities tab | Medium | Fixed | Migrated to `.saas-settings-card` (2026-09-24) |
| Tab-switch SweetAlert toasts | Low | Fixed | Removed from `activateUnifiedSettingsTab` (2026-09-24) |
| Hub max-width cramped on desktop | Low | Fixed | `1360px` shell width (2026-09-24) |
| No unsaved-changes warnings | Medium | Fixed | Tab guard + `beforeunload` (2026-09-24) |
| No live save-state chip | Medium | Fixed | `settings-save-state-chip` per form (2026-09-24) |
| No deep-link URLs for settings tabs | Low | Fixed | `#settings-{tab}` hash routing (2026-09-24) |
| No per-section discard | Medium | Fixed | `settings-discard-btn` + `revertSettingsScopeToBaseline` (2026-09-24) |
| No settings change history UI | Medium | Open | Events logged but not surfaced in hub |
| No unsaved-changes warnings | Medium | Open | Chat admin has pattern; store admin hub lacks it |
| Security tab navigates away from hub | Low | Open | By design but breaks unified hub UX |
| Sequential sidebar label PUTs | Low | Fixed | Batch `PUT /api/admin/sidebar-labels` (2026-09-24) |

---

## Dependencies & Integrations

- **PostgreSQL/Neon:** Primary read for Settings (`READ_PG_SETTINGS=true`); SidebarLabel PG-only.
- **MongoDB:** Authoritative write path for Settings singleton via `dualWriteService`.
- **Cloudinary + local uploads:** Branding assets via `uploadStoreBranding`.
- **Resend/Brevo:** Email notification config (`notificationConfigService`).
- **Baileys WhatsApp:** Self-hosted QR pairing (`whatsappService`).
- **Security logging:** `logSecurityEvent` for many setting changes — basis for future audit UI.
- **Cross-audit:** `ADMIN_PANEL_AUDIT.md`, `AUTH_SECURITY_AUDIT.md`, `CMS_AUDIT.md`, `PAYMENTS_FINANCE_AUDIT.md`, `PRODUCTION_ISSUES_AUDIT.md`.

---

## Change Log

### Sidebar category section labels — 2026-09-26

- Menu label keys extended with `nav-section:{catalog|marketing|hrm|finance|settings}` for accordion headers.
- `settings-menu-labels.js` renders section headers in Customize Menu Labels; `sidebarLabels.js` applies to `.catalog-toggle-label`.

### Comprehensive Settings Module A-Z Audit — 2026-09-24

- Read-only audit of backend APIs, DB resilience, frontend hub UI/JS, and enterprise feature gaps.
- Identified root cause pattern for sidebar-labels 500: PG-only writes without Mongo fallback.
- Documented 8 critical/medium bugs, 10+ resilience gaps, 12 UI/UX issues, and 3-phase upgrade roadmap.
- No code changes in this pass — report only; fixes scheduled for step-by-step execution.
- Test status: `sidebarLabel.repository.test.js` 3/3 pass locally against Neon.

### Phase 1 Step 2 — Settings Fetch Timeout Helper — 2026-09-24

- Added `client/js/admin/modules/settings-utils.js` — `settingsFetchJson()` with 15s AbortController.
- Refactored raw `fetch()` in: `settings-platform.js`, `settings-notifications.js`, `settings-security.js`, `settings-payments.js`, `settings-expense-categories.js`, `settings-menu-labels.js`.
- On timeout/network/500: console warning + toast *"Request timed out. Please check connection and retry."*
- Returns `{ success: false, timeout, error }` so callers reset spinners cleanly.
- Tests: **231/231** pass.

### Phase 3 Step 2 — JSON Export/Import & Ctrl+S Quick Save — 2026-09-24

- Added `GET /api/admin/settings-export` — sanitized JSON (platform, settings singleton, sidebar labels, categories); secrets stripped.
- Added `POST /api/admin/settings-import` — schema validation, `confirm: true` required; allowlisted fields only; dual-write apply.
- Utilities tab card: Export Settings Backup + Import Settings Backup (SweetAlert confirmation before import).
- Global `Ctrl+S` / `Cmd+S` in Settings hub — saves dirty scope first, else tab default form; prevents browser save dialog.
- Tests: `settingsExportImportService.test.js` **6/6** pass; full suite **248/248**.

### Phase 3 Step 1 — Settings Change History / Audit Log UI — 2026-09-24

- Added `GET /api/admin/settings-history` — filters existing `SecurityLog` rows (`resourceType: 'setting'` OR settings-related action text); paginated (default 50, max 100).
- Added `settingsHistoryReadService.js` + `settingsHistoryFilter.js` — read-only routed queries; no changes to `logSecurityEvent` write path.
- Added `findSettingsHistory` / `countSettingsHistory` on `securityLogRepository.js` (Prisma OR filter).
- Security tab card: Date & Time, Admin, Action, Summary columns; loading spinner + empty state; Refresh button.
- Frontend uses `settingsFetchJson()`; loads when Security tab activates.
- Tests: `settingsHistoryReadService.test.js` **5/5** pass; full suite **242/242**.

### Phase 2 Step 3 — Deep-Link URLs & Per-Section Discard — 2026-09-24

- Settings tab deep links: `#settings-branding`, `#settings-general`, `#settings-shipping`, `#settings-finance`, `#settings-notifications`, `#settings-security`, `#settings-utilities`.
- Hash updated via `history.replaceState` on tab switch; `hashchange` listener + init auto-opens Settings when hash present.
- `installSettingsDiscardButtons()` injects secondary **Discard** buttons beside save buttons (hub + embedded shipping/general forms).
- `revertSettingsScopeToBaseline()` reverts one card/form; clears dirty chip/highlight; tab guard no longer warns after discard.
- Tests: **237/237** pass.

### Phase 2 Step 2 — Unsaved Changes Guard & Live Save State Chip — 2026-09-24

- Added `client/js/admin/modules/settings-dirty-tracker.js` — per-form baseline snapshots, dirty detection, tab-switch confirm (SweetAlert / native fallback), `beforeunload` guard.
- Injected `settings-save-state-chip` near save buttons when forms are dirty; card highlight via `.has-unsaved-changes`.
- Wired `markSettingsFormSaved()` after successful saves in hub, CMS, notifications, menu labels; baseline refresh after data loads.
- Tab clicks route through `requestSettingsTabSwitch()`; immediate-save toggles excluded via `data-settings-immediate-save`.
- Tests: **237/237** pass.

### Phase 2 Step 1 — Design System Standardization & UI Cleanup — 2026-09-24

- Refactored System Utilities tab in `view-settings.html` — legacy `.settings-card` + inline styles → `.saas-settings-card` with header/body/footer structure.
- Added utilities layout CSS in `_settings-system.css` (2-col grid ≥992px, accent borders, GA badge classes, toggle rows).
- Updated `checkGAStatus()` in `settings-platform.js` — badge states via CSS classes (`util-ga-badge--active/inactive`).
- Removed tab-switch SweetAlert toasts from `settings-hub.js`; save success/failure toasts unchanged.
- Widened `.admin-settings-shell` to `max-width: 1360px`; notifications tab 2-col grid on wide screens.
- Cleaned WhatsApp toggle inline styles in notifications tab (`notif-wa-toggle-*` classes).
- Tests: **237/237** pass.

### Phase 1 Step 3 — Platform Settings Read Resilience — 2026-09-24

- Added `backend/src/services/platformSettingsReadService.js` — `routedRead('admin')` PG-first; Mongo secondary when PG empty or errors; `fetchPlatformAdminSettingsSafe()` returns defaults on total failure.
- Updated `getAdminSettings` in `adminSettingsController.js` — `{ success: true, data }` preserved for `settings-platform.js`; adds `settings` + `fallback: true` on safe-default path; no 500 on DB outage.
- PUT/write paths unchanged (`updateAdminSettings`, `uploadStoreBranding` still Mongo + dual-write).
- Tests: `platformSettingsReadService.test.js` **6/6** pass; full suite **237/237**.

### Phase 1 Step 1 — Sidebar Labels Fix — 2026-09-24

- Added `backend/src/models/SidebarLabel.js` (Mongoose).
- Rewrote `sidebarLabelRepository.js`: PG-primary reads/writes, Mongo fallback + best-effort mirror (skips mirror when Mongo disconnected).
- Added `PUT /api/admin/sidebar-labels` batch endpoint; kept `PUT /sidebar-labels/:key` for backwards compatibility.
- Updated `settings-menu-labels.js` to single batch save.
- Tests: `sidebarLabel.repository.test.js` **4/4** pass.
