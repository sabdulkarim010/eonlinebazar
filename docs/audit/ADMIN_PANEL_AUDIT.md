# ADMIN PANEL AUDIT — EonlineBazar

**Last updated:** 2026-09-28 (Dashboard Phase 4.3 — financial RBAC masking)  
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
| `client/admin/partials/view-settings.html` | Unified settings hub shell + sticky save bar |
| `client/admin/partials/view-settings-health.html` | System Health KPI view |
| `client/js/admin/modules/settings-secret-fields.js` | Mask/unmask toggles for integration secrets |
| `client/js/admin/modules/settings-health.js` | Health view data loaders |
| `client/admin/partials/view-orders.html` | Order management table |
| `client/admin/partials/view-pos.html` | Full-page POS layout |
| `client/admin/partials/view-products.html` | Product CRUD + bulk import |
| `client/admin/partials/view-customers.html` | Customer list + VIP segments |
| `client/admin/partials/view-hrm-*.html` | Employees, attendance, payroll, leaves (4 views) |
| `client/admin/partials/view-erp-expenses.html` | Expense ledger UI |
| `client/admin/partials/view-finance.html` | P&L report embed |
| `client/admin/partials/view-accounts.html` | Accounts overview cards |
| `client/admin/partials/view-chart-of-accounts.html` | Chart of accounts GL table |
| `client/js/admin/modules/erp-chart-of-accounts.js` | COA loader + search |
| `client/admin/partials/modals-*.html` | Orders, products, catalog, customers, CMS, payments modals |
| `client/js/admin/admin-main.js` | Admin SPA entry |
| `client/js/admin/admin-core.js` | Core barrel → modules/core-*.js |
| `client/js/admin/admin-products.js` | Products barrel → catalog + ERP modules |
| `client/js/admin/admin-orders.js` | Orders barrel |
| `client/js/admin/admin-settings.js` | Settings barrel |
| `client/js/admin/admin-dashboard.js` | Analytics widgets |
| `backend/src/controllers/admin/dashboardOverviewBffController.js` | Unified PG dashboard BFF (`GET /api/admin/dashboard/overview`) |
| `backend/src/controllers/admin/dashboardQuickActionsController.js` | Quick action status + maintenance toggle |
| `client/js/admin/modules/core-nav.js` | Accordion nav, mobile drawer, section routing |
| `client/js/admin/modules/admin-url-routing.js` | `?view=` deep links (replaces `#hash` routes) |
| `client/js/admin/modules/core-breadcrumb.js` | Dashboard > Group > Section breadcrumbs |
| `client/js/admin/modules/settings-hub.js` | Settings tab routing |
| `client/js/admin/modules/settings-utils.js` | Shared `settingsFetchJson` (25s + GET retry) |
| `client/js/admin/modules/orders-pos.js` | POS checkout, barcode, multi-line split payment, wallet |
| `client/js/admin/modules/pos-shift-ui.js` | POS shift open/close + offline batch sync queue |
| `client/js/admin/modules/notifications.js` | In-app notification center |
| `client/js/admin/modules/adminSidebar.js` | Sidebar profile — merged Admin + linked Employee via `/api/admin/profile/me/full` |
| `client/js/admin/modules/admin-stock-alerts.js` | Dashboard inventory alerts client-side pagination |
| `client/js/admin/modules/pagination-util.js` | Shared AdminPagination.ensure / render for list sections |
| `client/css/admin/_layout.css` | Dashboard grids, enterprise widgets, KPI sub-stat stacks |
| `client/css/admin/` | Module CSS (never edit `admin.css` barrel directly) |

**Counts (verified 2026-09-20):** 46 HTML partials, 53 JS modules under `client/js/admin/modules/`.

---

## Feature Checklist

- [x] 7-module enterprise sidebar navigation — `sidebar.html`, `core-nav.js`
- [x] Breadcrumb trail — `core-breadcrumb.js`
- [x] Mobile sidebar drawer + accordion groups — `core-nav.js`, `_responsive.css`
- [x] Dashboard KPIs + enterprise summary widgets — `view-overview.html`, `admin-dashboard.js`
- [x] Dashboard responsive KPI grid + vertical sub-stats (HRM attendance/payroll, payment split) — `_layout.css`, Phase 3.1
- [x] KPI sparklines + color-coded growth badges (GMV, revenue, orders, customers) — Phase 3.2
- [x] BFF chart engine: dual-axis sales trend, order funnel, top products — Phase 3.3
- [x] Global date range selector (presets + custom) wired to overview BFF — Phase 3.4
- [x] Executive quick action toolbar (orders, products, payroll, maintenance) — Phase 4.1
- [x] Live pulse badge + 60s background overview refresh — Phase 4.2
- [x] Financial zone RBAC — BFF masking + locked KPI overlays (`view_financial_reports`) — Phase 4.3
- [x] Dashboard BFF PG overview + AbortController dedup — `admin-dashboard.js` + Redis cache on overview API
- [x] Customer growth chart + insights from BFF (no `customers?limit=50` on overview)
- [x] Inventory alerts list from BFF PG thresholds (`admin-stock-alerts.js`)
- [ ] Dashboard full cutover — sales charts still on legacy `dashboard-analytics`; enterprise widgets on `enterprise-summary`
- [x] Unified settings hub (tabbed) — `view-settings.html`, `settings-hub.js`
- [x] Clean admin deep links (`/admin?view=settings-security`) — `admin-url-routing.js`, `core-nav.js`
- [x] Order management + master editor — `view-orders.html`, `orders-table.js`, `orders-editor.js`
- [x] Full-page POS — `view-pos.html`, `orders-pos.js`
- [x] Product CRUD + variants + bulk import — `view-products.html`, `products-*.js`
- [x] Catalog management (categories, brands, attributes, coupons, navbar) — `catalog-*.js`
- [x] Customer management + cursor pagination — `view-customers.html`, `customers-table.js`
- [x] Admin customer delete with PG dual-write + safety guards — `customerAdminController.js`, `customers-modals.js`
- [x] Unified AdminPagination (Showing X–Y of Z) — newsletter subscribers, contact inbox, security logs, dashboard stock alerts
- [x] HRM views (employees, attendance, payroll, leave) — `view-hrm-*.html`, `hrm-*.js`
- [x] ERP (suppliers, warehouses, POs, expenses) — `erp-*.js`, `view-suppliers.html`, etc.
- [x] Finance P&L + balance sheet tabs, accounts overview, chart of accounts, tax/VAT — `view-finance.html`, `view-tax-vat.html`, related `erp-*.js` modules
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

### Dashboard Phase 4.3 — Granular financial RBAC — 2026-09-28

- BFF masks GMV/revenue/AOV/payment split when admin lacks `view_financial_reports` / `view_accounts` (post-cache per request).
- `meta.maskedZones: ['financials']` + `permissions.canViewFinancials`.
- Overview: `zone-locked` overlays on sensitive KPI cards; charts omit revenue datasets when masked.
- Tests: **403/403** Jest.

### Dashboard Phase 4.2 — Live auto-pulse refresh — 2026-09-28

- Date toolbar: live pulse indicator, relative “last updated” label, manual refresh control.
- Background polling every 60s on overview (pauses when tab hidden, section inactive, or rate-limited).
- `admin:section-changed` event from `core-nav.js` for pulse lifecycle.
- Tests: **401/401** Jest (unchanged).

### Dashboard Phase 4.1 — Executive quick actions — 2026-09-28

- Overview toolbar: create order, add product, payroll, maintenance toggle (`data-permission` gated).
- API: `GET /api/admin/dashboard/quick-actions/status`, `POST .../maintenance-toggle` (dual-write settings).
- Tests: **401/401** Jest.

### Dashboard Phase 3.4 — Global date range selector — 2026-09-28

- Toolbar: `#dashboard-period-select`, custom from/to + Apply; URL `period`/`from`/`to` sync.
- BFF: `yesterday` preset; cache scope `period:from:to`; prior window length matches selection.
- Tests: **399/399** Jest.

### Dashboard Phase 3.3 — Advanced visual analytics — 2026-09-28

- BFF `charts`: `salesTrend`, `orderFunnel`, `topProducts` (PG aggregates, Redis-cached with overview).
- Overview: full-width dual-axis sales chart + 2-col funnel / top products grid (`chart-sales-trend`, etc.).
- Tests: **396/396** Jest.

### Dashboard Phase 3.2 — Sparklines & growth badges — 2026-09-28

- BFF: period-scoped `revenueTrend`, `ordersTrend`, `gmvTrend`; `registrationTrend` uses `{ date, value, count }`.
- Overview KPI cards: Chart.js mini sparklines + `.kpi-growth-badge` pills.
- Tests: **394/394** Jest.

### Dashboard Phase 3.1 — Modern grid & truncation fixes — 2026-09-28

- CSS: `.dashboard-kpi-grid`, `.kpi-sub-stats`, `.kpi-sub-stat-row`; enterprise widget stack rows; `auto-fit` enterprise grid.
- Overview: HRM attendance/payroll as vertical rows; COD/digital share rows + **Payment mix** card (`byMethod`).
- JS: `applyHrmEnterpriseWidgetStats`, `renderPaymentSplitBreakdown` (BFF + enterprise summary HRM).
- Tests: **392/392** Jest (unchanged).

### Dashboard BFF Phase 2.3 — Order pipeline & CRM — 2026-09-28

- BFF: `orderPipeline` lifecycle counts + `crm` repeat purchase rate & ContactMessage SLA metrics.
- Overview UI: expanded SLA pipeline cards + CRM retention row.
- Tests: **392/392** Jest.

### Dashboard BFF Phase 2.2 — Period growth (Δ%) — 2026-09-28

- Query params: `?period=7d|30d|this_month|today` (+ optional `from`/`to`); scoped Redis cache keys.
- Prior-period windows + `calcGrowthDelta` on revenue, orders, customers, GMV.
- Overview UI shows Δ% labels (default fetch `period=30d`).
- Tests: **390/390** Jest.

### Dashboard BFF Phase 2.1 — Advanced financial KPIs — 2026-09-28

- BFF `financials`: GMV, net revenue, AOV, COD vs digital + `byMethod` breakdown (Prisma).
- Overview UI: financial metrics row in `view-overview.html`; bound in `applyDashboardOverviewBff`.
- Tests: **388/388** Jest.

### Dashboard BFF Phase 1.3 — Chart & inventory divergence fix — 2026-09-28

- BFF: 30-day `registrationTrend`, customer insight counts, dynamic `alertsList` (enterprise low-stock rules).
- Frontend: `renderRegistrationTrendChart`, `renderInventoryAlertsList`; removed overview `limit=50` fetch.
- Tests: **387/387** Jest.

### Dashboard BFF Phase 1.2 — Redis cache + frontend fetch — 2026-09-28

- Overview API: Redis key `admin:dashboard:overview`, 60s TTL, `source: "cache"` on hits; Prisma fallback if Redis down.
- `admin-dashboard.js`: `AbortController` cancels in-flight dashboard loads; BFF KPIs applied after parallel legacy chart/summary fetches.
- Tests: **385/385** Jest (dashboardOverviewBff cache tests).

### Dashboard BFF Phase 1.1 — Prisma overview API — 2026-09-28

- Added `dashboardOverviewBffController.js` — parallel Prisma aggregates (orders, revenue, customers, low stock).
- Route: `GET /api/admin/dashboard/overview` (`view_analytics`); legacy `dashboard-analytics` / `enterprise-summary` unchanged.
- Tests: `tests/dashboardOverviewBff.test.js` — **383/383** Jest passing.

### System Settings Phase 4 Part 1 — Sidebar & hub UI — 2026-09-27

- Sidebar System Settings accordion expanded to 5 RBAC-gated entries with hash deep links.
- Configuration Hub premium header, sticky unsaved-changes bar, secret field toggles.
- Tests: **364/364**.

### Page Content Manager preview/edit mode — 2026-09-24

- General tab CMS card: read-only preview default; Edit Page pencil; Save/Cancel in edit mode
- Tab switch + Cancel revert unsaved edits; save returns to preview; dirty-tracker wired
- Tests: **248/248** passing

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

### Phase 3 Admin UI Verification Pass — 2026-09-25

- **POS:** Shift open now auto-reveals Split Payment panel (Cash + bKash lines); shift-closed hint banner; wallet/`applyPosWalletToSplit` exposed on window
- **Customers:** RFM segments merged from Mongo on PG customer reads; badges render in list + profile modal
- **Orders:** COD risk panel shows for all COD orders; badge layout cleaned in order ID column
- **Shared:** `escapeHtml`/`escHtml` on window via core-helpers (no admin-staff load-order dependency)
- Tests: **280/280** pass

### Phase 3 Backend API UI Integration — 2026-09-25

- **POS:** Shift status bar + open/close modals; multi-line split payments (`payments[]`); wallet balance badge + Use Wallet; offline queue + Sync button → `POST /api/admin/pos/orders/batch-sync`
- **Customers:** RFM segment badges, filter dropdown, Recalculate RFM button; wallet transaction history in profile modal
- **Orders:** COD risk badges (LOW/MEDIUM/HIGH); courier live status chip + expanded courier panel
- **Abandoned carts:** Recovery stage column + copy restore link
- Tests: **280/280** pass

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

### Phase 3 Part 2 — Balance sheet tab + Tax/VAT view — 2026-09-27

- `view-finance.html`: P&amp;L / Balance Sheet tabs; `erp-profit-loss.js` loads balance sheet API
- `view-tax-vat.html` + sidebar; CSV export via `export=csv`
- Tests: Jest **346/346**

### Phase 3 Part 1 — Chart of accounts nav + view — 2026-09-27

- Sidebar: Chart of Accounts between Financial Reports and Expense Tracking
- `view-chart-of-accounts` registered in `adminPageBuilder.js`; `loadChartOfAccountsSection` in `core-nav.js`
- Tests: Jest **344/344**

### Admin URL routing + settings fetch reliability — 2026-09-28

- Replaced hash fragments with `?view=` query params; legacy `#settings-*` migrated on load
- `ensureCleanAdminUrl` no longer strips deep-link params (only legacy `section`/`page`)
- Settings GETs: PG read deadline (`PG_ADMIN_READ_TIMEOUT_MS`), deduped `fetchAdminSettings`, client retry
- Tests: **381/381** Jest pass

### Audit system initialized — codebase scan — 2026-09-20

- Created full File Inventory + Feature Checklist from live partial/module scan
- Status: ✅ COMPLETE (legacy chat + external finance apps noted as partial items)
