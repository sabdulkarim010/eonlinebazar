# ADMIN PANEL AUDIT — EonlineBazar

**Last updated:** 2026-09-24 (Settings export/import + Ctrl+S — Phase 3 Step 2)  
**Scope:** Store admin SPA — `client/admin/partials/`, `client/js/admin/`, assembled via `adminPageBuilder.js` at `GET /admin`  
**Status:** ✅ COMPLETE

---

## File Inventory

| Path | Role |
|------|------|
| `backend/src/utils/adminPageBuilder.js` | Assembles all admin partials into single-page admin |
| `client/admin/partials/sidebar.html` | 7-module enterprise nav (Dashboard + 6 groups) |
| `client/admin/partials/header.html` | Breadcrumb container, notification bell, mobile toggle |
| `client/admin/partials/view-overview.html` | Dashboard KPIs + ERP/CRM/HRM widgets |
| `client/admin/partials/view-settings.html` | Unified settings hub shell |
| `client/admin/partials/view-orders.html` | Order management table |
| `client/admin/partials/view-pos.html` | Full-page POS layout |
| `client/admin/partials/view-products.html` | Product CRUD + bulk import |
| `client/admin/partials/view-customers.html` | Customer list + VIP segments |
| `client/admin/partials/view-hrm-*.html` | Employees, attendance, payroll, leaves (4 views) |
| `client/admin/partials/view-erp-expenses.html` | Expense ledger UI |
| `client/admin/partials/view-finance.html` | P&L report embed |
| `client/admin/partials/view-accounts.html` | Accounts overview cards |
| `client/admin/partials/modals-*.html` | Orders, products, catalog, customers, CMS, payments modals |
| `client/js/admin/admin-main.js` | Admin SPA entry |
| `client/js/admin/admin-core.js` | Core barrel → modules/core-*.js |
| `client/js/admin/admin-products.js` | Products barrel → catalog + ERP modules |
| `client/js/admin/admin-orders.js` | Orders barrel |
| `client/js/admin/admin-settings.js` | Settings barrel |
| `client/js/admin/admin-dashboard.js` | Analytics widgets |
| `client/js/admin/modules/core-nav.js` | Accordion nav, mobile drawer, section routing |
| `client/js/admin/modules/core-breadcrumb.js` | Dashboard > Group > Section breadcrumbs |
| `client/js/admin/modules/settings-hub.js` | Settings tab routing |
| `client/js/admin/modules/settings-utils.js` | Shared `settingsFetchJson` (15s timeout) |
| `client/js/admin/modules/orders-pos.js` | POS checkout, barcode, split payment |
| `client/js/admin/modules/notifications.js` | In-app notification center |
| `client/js/admin/modules/adminSidebar.js` | Sidebar profile — merged Admin + linked Employee via `/api/admin/profile/me/full` |
| `client/js/admin/modules/admin-stock-alerts.js` | Dashboard inventory alerts client-side pagination |
| `client/js/admin/modules/pagination-util.js` | Shared AdminPagination.ensure / render for list sections |
| `client/css/admin/` | Module CSS (never edit `admin.css` barrel directly) |

**Counts (verified 2026-09-20):** 46 HTML partials, 53 JS modules under `client/js/admin/modules/`.

---

## Feature Checklist

- [x] 7-module enterprise sidebar navigation — `sidebar.html`, `core-nav.js`
- [x] Breadcrumb trail — `core-breadcrumb.js`
- [x] Mobile sidebar drawer + accordion groups — `core-nav.js`, `_responsive.css`
- [x] Dashboard KPIs + enterprise summary widgets — `view-overview.html`, `admin-dashboard.js`
- [x] Unified settings hub (tabbed) — `view-settings.html`, `settings-hub.js`
- [x] Order management + master editor — `view-orders.html`, `orders-table.js`, `orders-editor.js`
- [x] Full-page POS — `view-pos.html`, `orders-pos.js`
- [x] Product CRUD + variants + bulk import — `view-products.html`, `products-*.js`
- [x] Catalog management (categories, brands, attributes, coupons, navbar) — `catalog-*.js`
- [x] Customer management + cursor pagination — `view-customers.html`, `customers-table.js`
- [x] Admin customer delete with PG dual-write + safety guards — `customerAdminController.js`, `customers-modals.js`
- [x] Unified AdminPagination (Showing X–Y of Z) — newsletter subscribers, contact inbox, security logs, dashboard stock alerts
- [x] HRM views (employees, attendance, payroll, leave) — `view-hrm-*.html`, `hrm-*.js`
- [x] ERP (suppliers, warehouses, POs, expenses) — `erp-*.js`, `view-suppliers.html`, etc.
- [x] Finance P&L embed + accounts overview — `view-finance.html`, `view-accounts.html`, `erp-profit-loss.js`
- [x] RBAC permission gating on nav sections — `permissions.js`, `core-nav.js`
- [x] In-app notification center — `notifications.js`, header bell
- [x] Filter-aware CSV export — `/api/admin/*/export` endpoints
- [x] Staff audit + security views — `settings-staff-audit.js`, `view-security.html`
- [x] System backup (superadmin) — `view-system-backup.html`, `system-backup.js`
- [x] Admin sidebar dynamic profile (name + photo) — `adminSidebar.js`, `GET /api/admin/profile/me/full`, sessionStorage cache
- [x] Super Admin link to HRM Employee record — Settings Hub card + `PUT /api/admin/profile/link-employee`
- [ ] Legacy chat sections in SPA — `view-chat.html` deprecated; use `/chat-admin`

---

## Known Issues / Gaps

| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| Legacy `view-chat` in SPA | Low | Open | Deprecation card points to `/chat-admin` React SPA |
| Finance analytics external app | Low | Open | `/finance-analytics` and payment reconciliation are separate HTML apps, not embedded in SPA |
| Duplicate POS partial | Low | Open | Both `view-pos.html` and `orders-pos.html` exist |

---

## Dependencies & Integrations

- **Assembly route:** `GET /admin` → `adminPageBuilder.js`
- **Auth:** Admin JWT + RBAC (`backend/src/middlewares/rbac.js`, `permissions.js`)
- **API prefix:** `/api/admin/*` via `adminRoutes.js`
- **Related audits:** `ORDERS_AUDIT.md`, `PRODUCTS_AUDIT.md`, `HRM_AUDIT.md`, `PAYMENTS_FINANCE_AUDIT.md`

---

## Change Log

### Settings export/import + Ctrl+S quick save — 2026-09-24

- Utilities tab: Export/Import Settings Backup card (`settings-backup-restore.js`)
- `GET /api/admin/settings-export`, `POST /api/admin/settings-import` (sanitized, confirm required)
- Global `Ctrl+S` / `Cmd+S` triggers active tab save in Settings hub
- Tests: **248/248** passing

### Settings change history card (Security tab) — 2026-09-24

- Added `settings-history.js` — table of recent settings audit events via `GET /api/admin/settings-history`
- Card in `view-settings.html` Security panel (`data-permission="manage_settings"`)
- Loading spinner, empty state, Refresh button; loads on Security tab activation
- Tests: **242/242** passing

### Customer table toolbar premium single-row layout — 2026-09-24

- Full-width toolbar: search (350px / left) + tier + segment pills + Export CSV (right group)
- All controls 40px height, gray-300 borders, blue focus rings, shadow-sm
- Segment pills moved into `customers-toolbar__actions` — same IDs/handlers unchanged
- Files: `view-customers.html`, `_customers.css`, `_responsive.css`

### Customer delete Neon timeout resilience — 2026-09-24

- `safePgLookup()` wraps direct Prisma calls in `resolveAdminCustomer()` — PG timeout degrades to `pgUserId: null` instead of 500
- `deleteCustomer` returns **503** with retry message when Neon/timeout errors escape the delete body
- Mongo fallback via `fetchCustomerById` / `dualWrite` unchanged
- Tests: Jest **231/231** passing

### Customer table ID mapping fix — 2026-09-24

- `getCustomerPrimaryKey()` resolves `legacyId` / `_id` / `id` and rejects email-shaped values
- Table actions use `data-customer-id` + event delegation (no inline email/ID in onclick strings)
- All customer API fetches use `encodeURIComponent(id)` to prevent `@` URL breakage
- `parseCustomerApiResponse()` normalizes `_id` on list/detail payloads
- Chat microservice error toasts suppressed off chat sections via `chatToast()`
- Files: `customers-table.js`, `customers-modals.js`, `core-nav.js`, `chat-admin.js`

### Admin customer delete PG/Mongo parity — 2026-09-23

- `resolveAdminCustomer()` resolves Mongo ObjectId, PG legacyId, or PG UUID for all admin customer mutations
- `deleteCustomer` dual-writes to PostgreSQL via `userRepository.remove()`; cleans Mongo Cart, Note, sessions, Cloudinary avatar
- Deletion blocked (409) when wallet balance &gt; 0 or active/pending orders exist; blockers surfaced in admin toast
- Frontend: `parseCustomerApiResponse()` validates `res.ok`; table refresh via `refreshCustomerListAfterChange()`
- Files: `customerAdminController.js`, `customers-modals.js`, `customers-table.js`
- Tests: `npm test` 231/231 pass

### Settings Fetch Timeout Helper — 2026-09-24

- `settings-utils.js`: `settingsFetchJson()` — 15s AbortController, structured errors, user toasts on timeout/500/network failure
- All settings hub modules refactored from raw `fetch()` to shared helper
- Tests: **231/231** pass

### Admin-Employee Profile Link — 2026-09-20

- Sidebar loads merged profile from `GET /api/admin/profile/me/full` (Employee photo preferred over Admin.image)
- New `adminSidebar.js`: `loadAdminSidebarProfile`, `updateSidebarDisplay`, `clearAdminSidebarCache`
- Settings Hub: super-admin "Link to Employee Record" card in `view-settings.html`
- Profile save + photo upload refresh sidebar immediately; employee photo update clears cache
- Files: `adminSidebar.js`, `core-boot.js`, `core-nav.js`, `settings-cms.js`, `view-settings.html`

### Settings Deep-Links & Discard Buttons — 2026-09-24

- `#settings-{tab}` URL hashes with `history.replaceState`; hashchange + init routing
- Per-card **Discard** buttons via `installSettingsDiscardButtons()` — reverts to pristine baseline
- Tests: **237/237** pass

### Settings Unsaved Changes Guard — 2026-09-24

- `settings-dirty-tracker.js`: dirty/pristine tracking, tab-switch confirm, `beforeunload`, save-state chips
- Wired across branding, general, security, notifications, embedded shipping forms
- Tests: **237/237** pass

### Settings Hub Design System Standardization — 2026-09-24

- Utilities tab migrated from legacy `.settings-card` + inline styles to `.saas-settings-card`
- Tab-switch SweetAlert toasts removed (`settings-hub.js`); save/action toasts retained
- Settings shell widened to 1360px; utilities + notifications 2-col grids on wide screens
- Tests: **237/237** pass

### AdminPagination.ensure rollout — 2026-09-21

- Newsletter subscribers: `newsletterPaginationContainer` in `view-catalog.html`, `admin-newsletter.js`
- Contact inbox: `contactPaginationContainer` in `view-messages.html`, `messages-inbox.js`
- Security logs: `securityLogPaginationContainer` in `view-security.html`, `settings-security.js`
- Dashboard stock alerts: `stockAlertPaginationContainer` + new `admin-stock-alerts.js`; wired from `admin-dashboard.js`
- Removed duplicate `messagePg` / `securityPg` init from `core-nav.js`

### Audit system initialized — codebase scan — 2026-09-20

- Created full File Inventory + Feature Checklist from live partial/module scan
- Status: ✅ COMPLETE (legacy chat + external finance apps noted as partial items)
