# SYSTEM SETTINGS & CONFIGURATION ENGINE — Enterprise Audit

**Project:** EonlineBazar  
**Module:** System Settings (Configuration Engine)  
**Audit date:** 2026-09-27  
**Auditor role:** Principal System Architect & Full-Stack Enterprise Auditor  
**Status:** ⚠️ PARTIAL — Production-capable hub with real backends; enterprise v3.0 gaps remain in RBAC granularity, secret handling parity, tax rule sophistication, and automated ops.

**Related docs:** `docs/audit/SETTINGS_AUDIT.md` (module-level change log), `docs/audit/ADMIN_PANEL_AUDIT.md`, `docs/audit/AUTH_SECURITY_AUDIT.md`, `docs/audit/PAYMENTS_FINANCE_AUDIT.md`, `DATABASE_MIGRATION_AUDIT.md`, `ARCHITECTURE.md`

---

## 1. Executive Summary

The **System Settings** surface is a **unified, tabbed Settings Hub** (`view-settings.html` + `settings-hub.js`) mounted under sidebar **System Settings → Settings Hub**, with sibling entries **Activity Feed** and **Backup & Restore**. Backend configuration is centered on a **MongoDB Settings singleton** (`backend/src/models/Settings.js`) with **PostgreSQL mirror reads/writes** via `settingsRepository.js` and `dualWriteService.js`. Storefront branding additionally lives on the **Super Admin `Admin` document** (`storeSettingsService.js`).

**What is real (not stub UI):**

| Capability | Backend | UI |
|------------|---------|-----|
| Delivery / free shipping | `settingsController`, PG+Mongo | Branding tab + embedded shipping |
| Master rewards, VAT, SMS, courier, WhatsApp order alerts | `masterSettingsController` | Embedded `view-shipping-payments.html` |
| Platform store name/currency/timezone + logo | `adminSettingsController` | Branding tab |
| Email/WhatsApp notifications | `notificationConfigService` + encrypted email keys | Notifications tab |
| Payment methods + gateway secrets | `PaymentMethod` model + `cryptoVault` | Embedded shipping/payments |
| Expense categories | PG `expenseCategoryRepository` | Finance tab |
| Settings change history | `settingsHistoryReadService` → SecurityLog | Security tab |
| Sanitized settings JSON export/import | `settingsExportImportService` | Utilities tab (super-admin) |
| Activity Feed | `activityFeedController` → SecurityLog | Standalone view + hub link |
| DB backup download | `backupService` + `backupController` | Backup & Restore (super-admin) |

**Primary risks for enterprise rollout:**

1. **Coarse RBAC** — single `manage_settings` gates most sensitive writes; `PERMISSION_IMPLICATIONS` grants `view_financial_reports` and `manage_expenses` to anyone with `manage_settings`.
2. **Secret exposure inconsistency** — notification keys encrypted/masked; **SMS/courier/WhatsApp alert keys returned in plaintext** via `GET /api/admin/master-settings` and unguarded `GET /api/admin/announcement-settings`.
3. **Write path Mongo-primary** — PG cannot authoritatively accept writes if Mongo is down (migration Phase 4 not complete).
4. **VAT model is global single-rate** — no jurisdiction rules, product-class exemptions, or B2B VAT IDs; ledger recomputes from stored order fields with fallback to current global rate.
5. **Backup/Restore asymmetry** — export-only full DB backup; no in-panel restore; settings import is config-only (by design).

---

## 2. Scope Map (Requested vs Actual)

| Requested artifact | Actual location | Notes |
|--------------------|-----------------|-------|
| `erp-settings.js` | **Not present** | Logic split across `settings-hub.js`, `settings-platform.js`, `settings-payments.js`, `settings-cms.js`, etc. (`admin-settings.js` barrel) |
| `settingsService.js` | **Not present** | Decomposed: `settingsReadService.js`, `storeSettingsService.js`, `platformSettingsReadService.js`, `settingsExportImportService.js`, `deliveryChargeService.js`, `notificationConfigService.js` |
| `settingsController.js` | ✅ `backend/src/controllers/settingsController.js` | Delivery, cache, rate limits, notifications, attendance, gateway status |
| `adminRoutes.js` | ✅ Settings domain routes §4–6, backup, activity feed, export/import | See §5 |
| `core-nav.js` | ✅ `client/js/admin/modules/core-nav.js` | Section load, hash deep-links, embed teardown |

---

## 3. Frontend Architecture

### 3.1 Sidebar — System Settings group

**File:** `client/admin/partials/sidebar.html`

| Item | `data-target` | Permission / gate |
|------|---------------|-------------------|
| Settings Hub | `view-settings` | `manage_settings` |
| Activity Feed | `view-activity-feed` | `manage_security` |
| Backup & Restore | `view-system-backup` | `data-superadmin-only="true"` (`SECTION_PERMISSIONS` → `null`, UI hidden for non–super-admin) |

**Gap:** Activity Feed is **security-scoped** while living under System Settings — correct for audit, but operators may expect it under HRM or a global “Compliance” group.

### 3.2 Settings Hub — seven tabs

**File:** `client/admin/partials/view-settings.html`  
**Router:** `client/js/admin/modules/settings-hub.js`

| Tab ID | Label | Permission on tab | Content source |
|--------|-------|-------------------|----------------|
| `branding` | Store Branding & Info | `manage_settings` | Inline forms + `settings-platform.js` |
| `general` | General Configuration | `manage_settings` | **Embed** `view-store-config.html` (loyalty, footer CMS, pages) |
| `shipping` | Shipping & Payments | `manage_settings` | **Embed** `view-shipping-payments.html` (VAT, SMS, courier, payments) |
| `finance` | Finance Settings | `manage_settings` | Expense categories (`settings-expense-categories.js`) |
| `notifications` | Notifications | `manage_settings` | Email + Baileys WhatsApp (`settings-notifications.js`) |
| `security` | Security & Access | **No tab-level `data-permission`** | Link cards + profile/2FA/history |
| `utilities` | System Utilities | `data-superadmin-only` | GA, cache, sandbox, settings JSON export/import |

**Embedded partial pattern:** `SETTINGS_EMBED_MAP` moves DOM nodes into `#settingsEmbed_general|shipping`; headers hidden; dirty-tracker + discard buttons re-bound.

**Deep linking:** `#settings-{tab}` via `history.replaceState`; `core-nav.js` activates tab on hub open.

**UX tooling (implemented):**

- `settings-dirty-tracker.js` — tab-switch confirm, `beforeunload`, save-state chips, Ctrl/Cmd+S quick save
- `settingsFetchJson()` — 15s timeout (`settings-utils.js`)

**UX gaps:**

- Security tab visible to **any logged-in admin** (tab button lacks `data-permission`); inner cards still API-gated.
- Finance tab does not surface VAT (VAT lives in Shipping embed) — split mental model vs “Finance Settings” label.
- Security tab is primarily **navigation cards** to standalone sections (`view-staff-audit`, `view-security`, etc.) — breaks “single hub” narrative.
- Notifications tab may not load on programmatic activation unless click handler runs (known A8 in `SETTINGS_AUDIT.md`).

### 3.3 Standalone System Settings views

| View | JS module | Purpose |
|------|-----------|---------|
| `view-activity-feed.html` | `activity-feed.js` | Paginated SecurityLog timeline |
| `view-system-backup.html` | `system-backup.js` | Mongo + PG backup download, status |

### 3.4 CSS modules

Barrel: `client/css/admin/_settings.css` → `_settings-branding.css`, `_settings-payments.css`, `_settings-finance.css`, `_settings-notifications.css`, `_settings-security.css`, `_settings-system.css`, `_settings-footer.css`.

Shell width: `.admin-settings-shell` max-width **1360px** (enterprise wide layout applied 2026-09-24).

---

## 4. Configuration Propagation & Caching

Understanding **when changes hit storefront vs admin** is critical for ops runbooks.

| Setting domain | Read path (storefront/admin) | Cache / invalidation | Restart required? |
|----------------|------------------------------|----------------------|-------------------|
| Store name, logo, currency | `storeSettingsMiddleware` → `getStoreSettings()` from **Admin** super-admin doc | **15s in-memory TTL** (`storeSettingsService.js`); `clearStoreSettingsCache()` on branding save | No |
| Inline head script | `brandingHtml.js` → `window.__STORE_SETTINGS__` on HTML responses | Per-request middleware | No |
| Delivery charges | `GET /api/store/delivery-settings` | Client `cache: 'no-store'` in checkout/shipping estimator | No |
| VAT at checkout | Server `getVatSettings()` on order create | **No cache** — reads Settings each checkout | No |
| Rate limits | `loadRateLimitSettings()` | Explicit `invalidateRateLimitCache()` on update | No |
| Flash sale / announcement | Master settings + dedicated services | `cacheService.invalidate` on some master saves | No |
| Maintenance mode | `maintenanceModeMiddleware` | Reads settings per request | No |
| Payment methods (public) | `getPublicPaymentPayload()` | Service-level; gateway status has its own cache | No |
| PWA cache version | `GET /api/store/cache-settings` | Updated via admin cache settings POST | No |

**Implication:** Most settings are **live within seconds**; branding may lag up to **15s** on server-rendered pages unless cache cleared on write (verify `clearStoreSettingsCache` is invoked on all branding write paths).

**Dual source of truth warning:** **Branding** (Admin model) vs **operational** settings (Settings singleton) requires admins to know which tab owns which field — enterprise v3.0 should unify or clearly label ownership.

---

## 5. Backend API Inventory (Settings Domain)

**Mount:** `backend/src/routes/adminRoutes.js` (prefix `/api/admin`)

### 5.1 Core settings singleton

| Method | Route | Permission | Handler | Notes |
|--------|-------|------------|---------|-------|
| GET | `/all-settings` | `verifyAdmin` only | `getAllSettings` | Returns global + master reward shape |
| GET | `/settings` | `verifyAdmin` | `getSettings` | Public delivery subset |
| PUT/POST | `/settings` | `manage_settings` | `updateSettings` | Delivery fields only |
| GET/PUT/POST | `/rate-limit-settings` | `manage_settings` | rate limit | Invalidates rate limit cache |
| POST | `/settings/cache` | `manage_settings` | cache version | |
| GET | `/settings/gateway-status` | `verifyAdmin` | safe defaults on error | |
| GET/PUT/POST | `/settings/notification-config` | read: `manage_settings` | masked secrets | Write encrypts email keys |
| GET/PUT/POST | `/master-settings` | `manage_settings` **or** `manage_loyalty` **or** `manage_marketing` | unified payload | **Marketing staff can read/write master fields present in body** |
| GET | `/announcement-settings` | **`verifyAdmin` only** | full `buildUnifiedPayload` | **RBAC hole — any admin** |
| GET | `/platform-settings` | `verifyAdmin` | PG-first read + safe defaults | |
| PUT | `/platform-settings` | `manage_settings` + password | branding on Admin | |
| GET | `/settings-history` | `manage_settings` | SecurityLog filter | |
| GET | `/settings-export` | `manage_settings` | sanitized JSON | |
| POST | `/settings-import` | `manage_settings` | allowlist import | Requires `confirm: true` |
| GET | `/activity-feed` | `manage_security` | SecurityLog timeline | |
| GET | `/system/backup-now` | `requireSuperAdmin` | Mongo JSON export | |
| GET | `/system/backup-postgres` | `requireSuperAdmin` | PG ZIP export | |
| GET | `/system/backup-status` | `requireSuperAdmin` | last backup timestamps | |

### 5.2 Public store routes (read-only)

| Route | Data |
|-------|------|
| `GET /api/store/delivery-settings` | Delivery + zones (no secrets) |
| `GET /api/store/cache-settings` | PWA/cache bust version |
| `GET /api/store/branding` | Public branding payload |
| `GET /api/store/payment-methods` | Enabled methods (no raw secrets) |

---

## 6. Database & Persistence

### 6.1 Settings singleton (primary document)

- **Mongo:** `Settings` collection, key `global` (`Settings.getOrCreate()`).
- **PostgreSQL:** `Settings` table via `settingsRepository.js` (`findByKey`, `upsertFromMongo`).
- **Reads:** `settingsReadService.fetchSettingsDocument()` → `routedRead('settings')` when `READ_PG_SETTINGS=true`.
- **Writes:** Mongo `save()` first, PG upsert in `dualWrite` callback — **Mongo outage blocks writes**.

### 6.2 Platform / branding

- **Mongo `Admin`** document (role `SUPER_ADMIN`): `storeName`, `logoUrl`, `faviconUrl`, `currency`, `currencySymbol`, `timezone`.
- **PG:** Admin/account mirror per migration stage (platform read uses `platformSettingsReadService`).

### 6.3 Ancillary models

| Data | Storage |
|------|---------|
| Footer CMS | `FooterSettings` + PG repo |
| Payment methods | `PaymentMethod` + PG; **API keys encrypted at rest** |
| Sidebar labels | `SidebarLabel` PG-primary + Mongo fallback |
| Expense categories | PG repository |
| Audit / activity | `SecurityLog` (Mongo + PG read services) |

### 6.4 Failure modes

| Scenario | Read behavior | Write behavior |
|----------|---------------|----------------|
| PG timeout | Falls back to Mongo via read router | N/A |
| Mongo down, PG up | Reads may succeed from PG | **Fails** (dual-write Mongo-first) |
| Both down | `platform-settings`: 200 + defaults; `master-settings`: **500**; `getSettings`: **500**; middleware: `DEFAULT_SETTINGS` | Fail |

---

## 7. Global VAT / Tax Rules Integration

### 7.1 Configuration UI

**Location:** Embedded shipping tab — `view-shipping-payments.html` → form `#form-system-tax-vat`  
**Save path:** Master settings update (VAT fields in `masterSettingsController` — `vatEnabled`, `vatPercentage`, `vatInclusive`, `taxRegistrationNumber`).

### 7.2 Checkout / order creation

**Flow:**

```
Settings document
  → deliveryChargeService.getVatSettings()
  → computeVatAmount({ merchandisePayable, vatEnabled, vatPercentage, vatInclusive })
  → orderCheckoutController persists vatAmount, vatPercentage, vatEnabled on order
```

- **Additive VAT:** When `vatEnabled && !vatInclusive`, VAT = `(subtotal - discount) * rate / 100`.
- **Inclusive pricing:** VAT line at checkout is **zero**; tax reporting relies on interpretation in ledger (see below).
- **Tests:** `tests/order.test.js` validates additive 5% VAT.

### 7.3 Tax & VAT Compliance ledger

**Service:** `backend/src/services/taxVatService.js`  
**UI:** Accounts & Finance → `view-tax-vat` (`erp-tax-vat.js`) — **not** under Settings Hub Finance tab.

**Logic:**

- Reads orders in date range (PG when enabled).
- Uses **order-stored** `vatAmount`, `vatPercentage`, `vatEnabled` when present.
- If missing, **recomputes** using **current** `getVatSettings()` — historical rate changes can skew retroactive reports if orders lacked snapshots.

### 7.4 Enterprise gaps (tax)

- No multi-rate rules (country/region/category).
- No tax-exempt SKUs or customer VAT IDs.
- No effective-dated rate schedules.
- Finance Settings tab does not link to Tax & VAT Compliance ledger or global rule editor.
- No separate “Tax Rules Engine” table — all on Settings singleton scalars.

---

## 8. Backup, Restore & Activity Engines

### 8.1 Database backup (super-admin)

**Implementation:** ✅ **Real**

- `backupService.exportFullBackup()` — iterates all Mongoose models → single JSON file.
- `exportPostgresBackup()` — critical PG tables → ZIP.
- `backupController` streams download, logs SecurityLog, updates `lastBackupAt` / `lastPostgresBackupAt` on Settings.
- **Restore:** Explicitly **not implemented** in admin (`view-system-backup.html` directs to developer).

**Risks:**

- Full Mongo JSON may contain **PII and legacy plaintext secrets** if present in documents.
- No scheduled/automated backup job in-app (manual download only).
- No encryption-at-rest for downloaded files (operator responsibility).

### 8.2 Settings JSON export/import (utilities)

**Implementation:** ✅ **Real** (config subset, not full DB)

- Sanitizer strips secrets (`settingsExportSanitizer.js`).
- Import requires confirmation flag; allowlisted fields only.
- **Not a substitute** for disaster recovery restore of orders/products.

### 8.3 Activity Feed

**Implementation:** ✅ **Real**

- `GET /api/admin/activity-feed` — paginated SecurityLog with filters (resource type, actor, date range).
- Frontend: `activity-feed.js` + standalone section; also linked from Security tab.
- **Not immutable** — standard DB rows; no WORM / append-only store / hash chain.

### 8.4 Settings change history (hub)

**Implementation:** ✅ **Real**

- `GET /api/admin/settings-history` — filtered SecurityLog (`resourceType: 'setting'` or action text heuristics).
- Displayed in Security tab; complements but **duplicates** Activity Feed for settings-only events.

---

## 9. Security, RBAC & Compliance Gaps

### 9.1 Permission model issues

| Issue | Severity | Detail |
|-------|----------|--------|
| `manage_settings` implies financial permissions | **High** | `PERMISSION_IMPLICATIONS.manage_settings` → `view_accounts`, `view_financial_reports`, `manage_expenses` |
| Master settings write aliases | **High** | `manage_loyalty` / `manage_marketing` can call master-settings update — may change VAT/SMS/courier if fields sent |
| Unguarded announcement GET | **High** | Any `verifyAdmin` receives full payload including **plaintext** `smsApiKey`, `courierApiKey`, WhatsApp alert credentials |
| Platform PUT requires password | **Medium** | Good pattern — **not replicated** on delivery/master/notification/rate-limit writes |
| Security tab without permission | **Medium** | UI information disclosure (which modules exist) |
| Utilities super-admin only | **Low** | Correct for sandbox/cache; settings import still `manage_settings` (not super-admin) — intentional delegation risk |
| Backup super-admin | **OK** | Matches sensitivity |

### 9.2 Secret handling matrix

| Secret type | At rest | On admin read API |
|-------------|---------|-------------------|
| Email (Resend/Brevo) | AES-GCM (`cryptoVault`) | Masked |
| Payment gateway keys | Encrypted on PaymentMethod | Admin CRUD with masking patterns |
| SMS / courier / WhatsApp alert keys | **Plaintext in Settings** | **Full values in master-settings** |
| Settings export | Stripped | N/A |
| Full DB backup | N/A | **May include all document fields** |

### 9.3 Validation & concurrency

- Master save is **partial body merge** (good) but **no optimistic locking** — last write wins across tabs/users.
- No ETag/version field on Settings document.
- Dirty-tracker mitigates **single-user tab switches**; not multi-admin conflicts.

---

## 10. Bugs & Technical Debt (Current State)

| ID | Issue | Severity | Status |
|----|-------|----------|--------|
| SS-01 | `GET /announcement-settings` exposes full master payload to any admin | High | Open |
| SS-02 | SMS/courier secrets plaintext in Settings + API | High | Open |
| SS-03 | `getMasterSettings` / `getNotificationConfig` 500 when both DBs fail | Medium | Partial (platform-settings fixed) |
| SS-04 | Mongo-primary writes block ops during Mongo maintenance | Medium | Migration Phase 4 |
| SS-05 | Notifications tab load on deep-link only | Low | Open (A8) |
| SS-06 | `data-settings-hub-tab` second arg ignored in hub link handler | Low | Open |
| SS-07 | Branding cache 15s TTL may stale logo on CDN/browser | Low | Monitor |
| SS-08 | `announcementDiscount` overwritten with free shipping value in delivery update | Low | Code smell in `settingsController` |

---

## 11. Enterprise Feature Gaps (v3.0 Target)

| Capability | Current | Enterprise expectation |
|------------|---------|----------------------|
| Granular settings RBAC | Single `manage_settings` | Keys: `settings_branding`, `settings_tax`, `settings_payments`, `settings_notifications`, `settings_security`, `settings_system` |
| Tax rule engine | Global % + inclusive flag | Jurisdictions, product classes, effective dates, B2B exemptions |
| Multi-currency | Currency code/symbol only | FX rates, rounding rules, display vs settlement currency |
| Payment secrets | Mixed encryption | All gateway credentials in vault; rotation audit |
| Settings versioning | SecurityLog text | Immutable audit + diff JSON + rollback |
| Health dashboard | Partial (`/api/store/health` in utilities) | SLA metrics, dependency checks, queue depth |
| Backup automation | Manual download | Scheduled S3/GCS, retention, encrypted artifacts, tested restore runbooks |
| Settings search | None | Stripe-style filter across keys |
| Environment promotion | None | Dev/staging/prod config export with secret injection |
| Feature flags | Sandbox only (super-admin) | Namespaced flags with audience rules |

---

## 12. Proposed Sidebar Structure (System Settings v3.0)

Goal: **Reduce cognitive load**, align permissions, separate **configuration** from **compliance/ops**.

```
⚙️ System Settings
├── 🎛️ Configuration Hub          → view-settings (default: Branding)
│   (internal tabs unchanged or regrouped — see §13)
├── 💳 Payments & Tax Rules       → new or split from shipping embed
├── 📣 Notifications & Channels   → optional top-level (email, SMS, WhatsApp)
├── 🔐 Access & Security          → manage_security (sessions, 2FA, IP firewall)
├── 📜 Audit & Activity           → view-activity-feed + settings history
├── 💾 Backup & DR                → super-admin (backup, import, restore runbook links)
└── 🧪 System Health              → super-admin (cache, sandbox, diagnostics)
```

**Permission alignment:**

- Map each sidebar leaf to **unique granular key** (per `.cursorrules` — no reuse of coarse keys in UI toggles).
- Mark `manage_settings` as `preset_only: true` in catalog; expose granular keys in staff modal.

---

## 13. Settings Hub Layout Recommendations (UX)

1. **Regroup tabs (7 → 6 logical):**
   - **Store & Branding** (keep)
   - **Commerce Rules** — merge General loyalty + Shipping delivery/VAT/courier/SMS (single “checkout behavior” story)
   - **Payments** — pull payment methods card to own tab (today buried in shipping embed)
   - **Finance & Tax** — expense categories + link card to Tax & VAT Compliance + inline global VAT summary (read-only) with “Edit rules” anchor
   - **Notifications**
   - **Security & Profile** — embed sessions/audit as accordions instead of link farm where feasible
   - **Advanced (super-admin)** — utilities, export/import, sandbox

2. **Visual system:** Already on `.saas-settings-card` — extend to 100% of hub; remove remaining inline styles.

3. **Save model:** Consider **one “Review changes” drawer** showing diff before commit for master settings (enterprise change management).

4. **Search:** Sticky filter input indexing tab labels + field labels (`aria-label` driven).

5. **Mobile:** Tab scroll hint gradient + “More tabs” overflow menu.

---

## 14. Phased Roadmap — Enterprise Settings v3.0

### Phase 1 — Security & resilience (1–2 weeks)

- [ ] Lock down `GET /announcement-settings` and `/settings/announcement` with `manage_settings` (or narrower read key).
- [ ] Encrypt/mask SMS, courier, WhatsApp alert credentials; never return raw keys (mirror notification pattern).
- [ ] Require re-auth (password or step-up) for **tax, payment, notification, rate-limit** writes.
- [ ] Safe-default 200 responses for `getMasterSettings` / `getNotificationConfig` on total DB failure.
- [ ] Split `PERMISSION_IMPLICATIONS` — remove financial grants from settings preset unless explicit.
- [ ] Document + verify `clearStoreSettingsCache()` on every branding write.

### Phase 2 — RBAC & data model (2–3 weeks)

- [ ] Introduce granular permission keys + `SECTION_PERMISSIONS` / tab `data-permission` mapping.
- [ ] Restrict master-settings mutations by field group (loyalty marketing cannot set VAT).
- [ ] Add `settingsRevision` integer + optimistic concurrency on Settings writes.
- [ ] PG-primary write path flag (feature-flagged) for Settings singleton.

### Phase 3 — Tax & finance integration (3–4 weeks)

- [ ] `TaxRule` model (PG + dual-write): jurisdiction, rate, inclusive flag, effectiveFrom/To, priority.
- [ ] Checkout resolver: rule chain → order snapshot stores ruleId + rate (ledger accuracy).
- [ ] Finance tab: global rule CRUD + deep link to Tax & VAT Compliance with consistent labels.

### Phase 4 — Operations & enterprise ops (4–6 weeks)

- [ ] Scheduled backup jobs + encrypted object storage + restore drill documentation (CLI/script, not panel restore if policy forbids).
- [ ] Immutable audit option (append-only table or external SIEM export webhook).
- [ ] Settings search, environment export, health dashboard widgets.
- [ ] Multi-currency foundation (display currency vs settlement).

---

## 15. File Inventory (Audit Scope)

| Path | Role |
|------|------|
| `client/admin/partials/sidebar.html` | System Settings nav group |
| `client/admin/partials/view-settings.html` | Settings Hub shell (7 tabs) |
| `client/admin/partials/view-shipping-payments.html` | VAT, payments, SMS, courier embed |
| `client/admin/partials/view-store-config.html` | Loyalty/footer embed |
| `client/admin/partials/view-activity-feed.html` | Activity Feed UI |
| `client/admin/partials/view-system-backup.html` | Backup & Restore UI |
| `client/js/admin/admin-settings.js` | Settings JS barrel |
| `client/js/admin/modules/settings-hub.js` | Tab router, embeds, hash URLs |
| `client/js/admin/modules/settings-platform.js` | Branding, delivery, VAT load/save, utilities |
| `client/js/admin/modules/settings-dirty-tracker.js` | Unsaved changes |
| `client/js/admin/modules/settings-utils.js` | Timed fetch helper |
| `client/js/admin/modules/settings-notifications.js` | Notifications tab |
| `client/js/admin/modules/settings-security.js` | Security monitors |
| `client/js/admin/modules/settings-history.js` | Settings history table |
| `client/js/admin/modules/settings-backup-restore.js` | JSON export/import |
| `client/js/admin/modules/system-backup.js` | Full DB backup UI |
| `client/js/admin/modules/activity-feed.js` | Activity Feed client |
| `client/js/admin/modules/core-nav.js` | Section navigation + settings init |
| `backend/src/controllers/settingsController.js` | Delivery, cache, notifications, rate limits |
| `backend/src/controllers/masterSettingsController.js` | Unified master/VAT/SMS/courier |
| `backend/src/controllers/admin/adminSettingsController.js` | Platform branding |
| `backend/src/controllers/admin/backupController.js` | Backup downloads |
| `backend/src/controllers/admin/activityFeedController.js` | Activity Feed API |
| `backend/src/controllers/admin/settingsHistoryController.js` | Settings history API |
| `backend/src/controllers/admin/settingsExportImportController.js` | Sanitized export/import |
| `backend/src/services/settingsReadService.js` | PG/Mongo read router |
| `backend/src/services/storeSettingsService.js` | Branding cache (Admin doc) |
| `backend/src/services/platformSettingsReadService.js` | Platform admin read |
| `backend/src/services/deliveryChargeService.js` | VAT math + delivery |
| `backend/src/services/taxVatService.js` | Tax/VAT ledger |
| `backend/src/services/backupService.js` | Export engines |
| `backend/src/services/notificationConfigService.js` | Email secrets vault |
| `backend/src/repositories/settingsRepository.js` | PG Settings |
| `backend/src/models/Settings.js` | Mongo Settings schema |
| `backend/src/middlewares/storeSettingsMiddleware.js` | SSR branding injection |
| `backend/src/utils/cryptoVault.js` | AES-GCM for secrets |
| `backend/src/config/permissions.js` | RBAC map |
| `backend/src/routes/adminRoutes.js` | Route mounts |
| `tests/admin.test.js` | Backup, activity feed, tax settings API tests |

---

## 16. Test Coverage Notes

Admin integration tests (`tests/admin.test.js`) cover:

- Tax/VAT master settings update
- Activity feed
- Database backup endpoints
- Settings-related flows (see README test table)

Repository/service tests: `platformSettingsReadService.test.js`, `settingsExportImportService.test.js`, `settingsHistoryReadService.test.js`, `sidebarLabel.repository.test.js`.

**Recommended additions for v3.0:**

- RBAC tests denying `announcement-settings` to non-settings roles
- Secret masking assertions on master-settings responses
- Optimistic concurrency tests when Phase 2 lands

---

## 17. Change Log (This Audit)

### Deep-Dive Enterprise System Settings Audit — 2026-09-27

- Read-only architectural audit of frontend hub, sidebar, backend routes, dual-write persistence, VAT/checkout/ledger integration, backup/activity engines, RBAC and secret-handling gaps.
- Deliverable: `SYSTEM_SETTINGS_AUDIT.md` (project root). No application code modified.
- Cross-reference: operational module checklist remains in `docs/audit/SETTINGS_AUDIT.md`.

### Phase 5 Encrypted DR Backup Engine — Implemented 2026-09-27

- AES-256-GCM backups, cron, validate/restore — see `docs/audit/SETTINGS_AUDIT.md` and `docs/audit/DEVOPS_AUDIT.md`.

### Phase 4 Part 2 System Health Backend & Live Monitoring — Implemented 2026-09-27

- Admin diagnostics API + System Health UI auto-refresh — see `docs/audit/SETTINGS_AUDIT.md` and `docs/audit/DEVOPS_AUDIT.md`.

### Phase 4 Part 1 Sidebar & Premium Hub UI — Implemented 2026-09-27

- Five-item System Settings sidebar, sticky save bar, secret toggles, System Health view — see `docs/audit/SETTINGS_AUDIT.md`.

### Phase 3 Global Tax & VAT Engine — Implemented 2026-09-27

- Structured `taxSettings`, checkout order tax snapshots, Tax/VAT ledger snapshot-first reporting — see `docs/audit/SETTINGS_AUDIT.md` and `docs/audit/PAYMENTS_FINANCE_AUDIT.md`.

### Phase 2 Dual-DB & Revision Locking — Implemented 2026-09-27

- PG-primary writes, Mongo mirror, revisionId / 409 conflicts, zero-safe read defaults — see `docs/audit/SETTINGS_AUDIT.md`.

### Phase 1 Security Lockdown — Implemented 2026-09-27

- Masking + encryption for integration secrets; RBAC on sensitive routes; audit logging — see `docs/audit/SETTINGS_AUDIT.md` Change Log.

---

**End of report**
