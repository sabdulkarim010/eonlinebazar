# EonlineBazar — Architecture Guide

# READ THIS before making changes



## Frontend Structure

client/

├── css/

│   ├── admin.css          ← BARREL — edit files in admin/

│   ├── admin/             ← Admin panel module CSS

│   │   ├── _settings.css  ← BARREL → _settings-*.css

│   │   └── _products.css  ← BARREL → _products-*.css

│   ├── profile.css        ← BARREL — edit files in profile/

│   ├── profile/           ← Profile page module CSS

│   ├── style.css          ← BARREL — edit files in global/

│   └── global/            ← Shared global styles

├── js/

│   ├── admin/

│   │   ├── admin-main.js      ← entry (imports barrels)

│   │   ├── admin-core.js      ← BARREL → modules/core-*.js

│   │   ├── admin-products.js  ← BARREL → products-* + catalog-* + erp-*

│   │   ├── admin-orders.js    ← BARREL → modules/orders-*.js

│   │   ├── admin-customers.js ← BARREL → customers-* + messages-inbox.js

│   │   ├── admin-settings.js  ← BARREL → modules/settings-*.js

│   │   ├── admin-dashboard.js ← analytics widgets

│   │   └── modules/           ← Actual logic files (incl. adminSidebar.js — merged sidebar profile; sidebarLabels.js — Super Admin menu rename; settings-utils.js — settingsFetchJson 15s timeout; settings-dirty-tracker.js — unsaved-changes guard + save chips; pagination-util.js — unified AdminPagination)

│   ├── profile.js         ← BARREL → js/profile/*.js

│   ├── profile/           ← Profile page modules (tabs, orders, wallet, notes, …)

│   ├── product-details.js ← BARREL → js/pdp/*.js

│   ├── pdp/               ← Product detail page modules

│   ├── checkout.js        ← BARREL → js/checkout/*.js

│   └── checkout/          ← Checkout modules

├── admin/

│   └── partials/          ← Admin HTML sections + modal groups

├── profile/

│   └── partials/          ← Profile HTML sections

└── partials/              ← Shared storefront header/footer/WhatsApp



## Backend Structure

backend/src/

├── controllers/

│   ├── admin/             ← Admin-specific controllers (ERP, CRM, HRM, WMS, intelligence)

│   ├── auth/              ← Auth-specific controllers

│   ├── adminController.js           ← BARREL

│   ├── adminSecurityController.js   ← BARREL

│   └── authController.js            ← BARREL

├── routes/                ← NEVER split routes — keep as barrel files

├── data/demoProducts.js   ← DEMO-* catalog for seed:products / POST /api/products/seed-demo

└── utils/

    ├── adminPageBuilder.js    ← assembles admin/partials (including modals-*)

    ├── profilePageBuilder.js  ← assembles profile.html shell + profile/partials

    └── injectSharedPartials.js



### prisma/ + prisma.config.js (repo root) — CONNECTED, NOT YET READ BY THE APP

`prisma/schema.prisma` is the PostgreSQL (Neon) target schema for the database
migration. As of **2026-09-13 (Stage 2 Step 1)** Prisma `7.10.0` is installed and
the baseline migration `20260913131445_init_postgres_baseline` has been applied to
Neon, so all 67 tables now physically exist. **No application code reads it** —
the live database is MongoDB and `backend/src/models/*.js` remains the only source
of truth. Do not import the Prisma client in application code until the Stage 2
dual-write repository layer is built. See `DATABASE_MIGRATION_AUDIT.md`.

| Path | Role |
|------|------|
| `prisma/schema.prisma` | 67 models, 55 enums. Datasource declares `provider` only — **Prisma 7 forbids `url` here** |
| `prisma.config.js` | repo-root **CLI-only** config; supplies `datasource.url` from `DATABASE_URL`. Not loaded by the app |
| `prisma/migrations/` | SQL migration history — commit every migration, never hand-edit an applied one |
| `generated/prisma/` | generated client, **gitignored**. Recreate with `npx prisma generate` after `npm install` |

Both Prisma packages are **pinned exactly** (`prisma@7.10.0`,
`@prisma/client@7.10.0`, no `^`) because npm's `latest` tag for `prisma` has
served a `8.0.0-rc` pre-release. Do not run `npm i prisma@latest` here without
checking `npm view prisma dist-tags` first.

Use `prisma migrate`, never `prisma db push` — this schema will carry real
financial data and needs rollback history.



## Admin Navigation (Enterprise SaaS — 7 modules)

The admin sidebar uses **7 primary modules** plus **Dashboard** (`client/admin/partials/sidebar.html`): **Sales & Orders**, **Product & Stock Operations**, **Marketing & Content**, **HRM & Staff**, **Accounts & Finance**, and **System Settings** (unified tabbed hub). Breadcrumbs are rendered by `client/js/admin/modules/core-breadcrumb.js`; tab routing lives in `client/js/admin/modules/settings-hub.js`.



| Group | Key sections |

|-------|----------------|

| Dashboard | Overview KPIs, analytics widgets |

| Sales & Orders | POS, Orders, Customers, Support Tickets, Live Chat, Reviews, Abandoned Carts |

| Product & Stock Operations | Inventory, Add Product, Categories, Brands, Attributes, Suppliers, Warehouses, POs |

| Marketing & Content | Campaigns, Newsletter, Coupons, Hero Banners, Navbar Links, Loyalty Program |

| HRM & Staff | Employees, System Staff Directory, Attendance, Payroll, Leave |

| Accounts & Finance | Accounts Overview (cash flow + liquidity), Financial Reports (P&L + export), Expense Tracking, Payment Reconciliation |

| System Settings | Unified hub (`view-settings.html`) — single sidebar entry; inner tabs for Branding, General (VAT/tax, maintenance), Shipping & Payments, Finance Settings (expense categories), Security & Access, System Utilities |



## Enterprise Models (Phase 2+)

| Model | File | Purpose |

|-------|------|---------|

| Supplier | `backend/src/models/supplier.js` | Vendor directory |

| PurchaseOrder | `backend/src/models/purchaseOrder.js` | PO receiving workflow |

| Warehouse | `backend/src/models/warehouse.js` | Multi-location inventory + bin hierarchy |

| WarehouseStock | `backend/src/models/WarehouseStock.js` | Per-warehouse quantity + reservations |

| StockLedger | `backend/src/models/StockLedger.js` | Immutable stock movement audit trail |

| WarehouseTransfer | `backend/src/models/WarehouseTransfer.js` | Inter-warehouse transfer state machine |

| ProductVariant | `backend/src/models/ProductVariant.js` | N-dimensional variant matrix schemas |

| Outbox | `backend/src/models/Outbox.js` | Transactional outbox for domain events |

| BackgroundJob | `backend/src/models/BackgroundJob.js` | Async import/export job tracking |

| Employee | `backend/src/models/employee.js` | Non-login operational staff — full profile, documents, references |
| Designation | `backend/src/models/designation.js` | Job title catalog (Manager, Delivery Man, …) seeded on bootstrap |
| Attendance | `backend/src/models/attendance.js` | One row per staff per day (clock in/out, late, shift, manual-entry audit) |
| AttendanceLock | `backend/src/models/attendanceLock.js` | Per-date attendance lock (Super Admin); blocks writes with HTTP 423 |

| Shift | `backend/src/models/shift.js` | Named working windows + late grace period |

| Payroll | `backend/src/models/payroll.js` | Monthly salary run, draft → approved → paid |

| Leave | `backend/src/models/leave.js` | Leave applications, approvals, balances |

| AdminNotification | `backend/src/models/adminNotification.js` | In-app admin notification center (order/stock/leave/payroll/security/system) |
| ExpenseCategory | `backend/src/models/expenseCategory.js` | Dynamic expense category catalog — seeded defaults + admin custom categories; `allowCustomInput` on "Other" |
| Expense | `backend/src/models/expense.js` | Operating expense ledger row — `category` slug + optional `customCategoryName` |
| SidebarLabel | `backend/src/models/SidebarLabel.js` | Super Admin custom sidebar menu labels (Mongo fallback; PG mirror via `sidebarLabelRepository.js`) |



## HRM Module (Phase 5)

`/api/admin/hrm/*` — all routes require `verifyAdmin` + `checkPermission('manage_staff')`.



| Area | Endpoints | Notes |

|------|-----------|-------|

| Attendance | `GET /attendance`, `POST /attendance/mark`, `POST /attendance/clock-in`, `POST /attendance/clock-out`, `GET /attendance/summary`, `GET /attendance/late-report` | `date` normalized to platform TZ midnight via `backend/src/utils/attendanceDate.js` (default `Asia/Dhaka`); `getPlatformDayBounds()` drives today KPI range queries (enterprise summary + PG attendance counts) |

**Frontend HRM API layer:** All admin HRM + Staff modules call through `client/js/admin/modules/hrm-api.js` (`hrmFetchJson` / `hrmApi`) — 25s timeout, debounced error toasts, optional `silent: true` for background loads. Imported via `admin-settings.js` before `hrm-*.js` modules; exposed on `window` for classic `admin-staff.js`.

| Shifts | `GET /shifts`, `POST /shifts`, `PATCH /shifts/:id`, `DELETE /shifts/:id` | Exactly one `isDefault` shift; it cannot be deleted |

| Payroll | `GET /payroll`, `POST /payroll/generate`, `PATCH /payroll/:id/approve`, `PATCH /payroll/:id/paid`, `GET /payroll/:id/payslip`, `POST /payroll/salary-config` | Generation reads attendance; only drafts can be regenerated |

| Leave | `GET /leaves`, `POST /leaves/apply`, `PATCH /leaves/:id/approve`, `PATCH /leaves/:id/reject`, `GET /leaves/balance`, `GET /leaves/calendar` | Approving a leave writes `holiday` attendance rows across the span |

| Staff roster | `GET /hrm/staff` | Dropdown roster; includes the employment record for `manage_staff` holders |
| Designations | `GET/POST/PATCH/DELETE /hrm/designations` | Job title catalog; delete blocked while employees use the name |
| Employees | `GET/POST/PATCH/DELETE /hrm/employees` | Non-login operational staff CRUD; auto `EMP-001` ids |
| Employee profile | `GET /hrm/employees/:id/profile` | Full record + attendance summary + payroll history + leave balance |
| Employee media | `POST /hrm/employees/:id/photo`, `POST/DELETE …/documents/:docId` | Cloudinary photo + document attachments |



**Payroll formula:** `baseSalary × min(presentDays / workingDays, 1) + (overtime × overtimeRate) + bonus − deductions`. Base salary lives on the `Admin` document (`baseSalary`), so there is no separate salary-config collection.



## Settings Model (single consolidated singleton)

| Model | Key | Owns |

|-------|-----|------|

| `Settings.js` | `global` | Delivery charges, SMS/courier gateways, rate limits, payment gateway config, **plus** cashback, loyalty points/tiers, VIP thresholds, flash sale, referral rewards, VAT/tax, maintenance mode |

| `Setting.js` | — | **Deprecated shim** (2026-09-12). Body is `module.exports = require('./Settings')` so old imports keep resolving. Do not add fields here. |



**Consolidated 2026-09-12.** The former `key: 'master'` singleton was merged into the `global` document. `scripts/mergeSettingsModels.js` copies any values still stored only on the legacy `master` row and must be run once against an existing database before deploy.

**Unified read:** `GET /api/admin/all-settings`. Writes still go through both `/api/admin/settings` and `/api/admin/master-settings`, which now target the same document.



## Mobile App (Expo)

mobile/

├── App.js                     ← root stack; hydrates Zustand in useEffect; ErrorBoundary around NavigationContainer

├── index.js                   ← entry (gesture-handler → splash preventAutoHide → registerRootComponent)

├── .env.example               ← EXPO_PUBLIC_API_URL, EXPO_PUBLIC_CHAT_URL, EXPO_PUBLIC_APP_ENV

├── package.json               ← "main": "index.js" (classic App.js + React Navigation v7, not expo-router)

├── metro.config.js            ← Expo default Metro (Hermes-safe; no extra transformers)

├── src/

│   ├── splash.js              ← SplashScreen.preventAutoHideAsync() before screens/stores load

│   ├── api/                   ← Axios client and backend endpoints

│   ├── components/            ← Reusable UI (headers, cards, auth, profile Action Hub, DistrictUpazilaPicker, AddressForm, ErrorBoundary)

│   ├── navigation/            ← Stack and Tab navigators

│   ├── data/                  ← Bangladesh locations (district IDs + upazilas); Home/Shop use the API

│   ├── theme/                 ← Light/dark palettes

│   ├── screens/               ← Application pages (incl. ProductDetails, Wishlist, OrderDetails, DeleteAccount, Legal)

│   ├── services/              ← Axios instance (EXPO_PUBLIC_API_URL or https://eonlinebazar.com/api)

│   ├── config/chatConfig.js   ← Chat API/socket URLs (EXPO_PUBLIC_CHAT_URL)

│   ├── utils/                 ← Shared helpers (product mapping, media URLs)

│   └── store/                 ← Zustand (cart, auth, orders, products, wishlist, toast, theme)

├── app.json                   ← scheme eonlinebazar, android.package com.eonlinebazar.app, newArchEnabled false, expo-splash-screen plugin (not expo-router)

├── eas.json                   ← preview = internal APK; production AAB



### Local Development Setup (Mobile)

Copy `mobile/.env.example` to `mobile/.env`.
Use your machine's LAN IP address (not localhost) when testing
on a physical device. Run ipconfig (Windows) or ifconfig (Mac/Linux)
to find your IP. Expo DevTools also shows the correct URL.

### Mobile environment setup

Copy `mobile/.env.example` to `mobile/.env` for local development (`mobile/.env` is gitignored). For production builds, set the same vars in EAS secrets:



```

EXPO_PUBLIC_API_URL=http://localhost:3000/api

EXPO_PUBLIC_CHAT_URL=http://localhost:5001

EXPO_PUBLIC_APP_ENV=development

```



Restart Expo after changing env vars (`npx expo start -c`).



## Page assembly

- GET /admin → adminPageBuilder.js (partials; admin.html is not used)

- GET /profile → profilePageBuilder.js (thin shell client/profile.html + partials)



## Enterprise Feature Status (Phase 4 complete)

| Area | Status |

|------|--------|

| ERP — inventory, orders, POs, suppliers, warehouses | ✅ |

| CRM — customers, RFM segmentation, multi-stage abandoned carts, campaigns, tickets, chat, reviews, loyalty | ✅ |

| HRM — staff, RBAC, audit, security logs, sessions | ✅ |

| HRM — attendance, shifts, payroll, leave (Phase 5) | ✅ |

| Admin grouped nav + breadcrumbs + mobile drawer | ✅ |

| Cursor pagination (customers, products, mobile shop) | ✅ |

| Unified settings read API | ✅ |

| Enterprise dashboard widgets | ✅ |

| DB index migration script | ✅ `npm run migrate:indexes` |



## Local Development Quick Reference

### Dev servers

| Service | Command | URL |
|---------|---------|-----|
| Store gateway | `npm run dev:store` | `http://localhost:5000` |
| Chat microservice | `npm run dev:chat` | port **5001** |
| Admin dashboard (Vite) | `cd admin-dashboard && npm run dev` | `:5173` (or `:3000` depending on Vite config) |
| Built chat-admin SPA | served by store gateway | `http://localhost:5000/chat-admin` |

### Important reminders

- Shared secrets (`JWT_SECRET`, `INTERNAL_API_KEY`, Cloudinary) belong in **repo-root `.env`** only.
- Rebuild chat-admin after env changes: `cd admin-dashboard && npm run build`, then copy `dist/` → `backend/public/chat-admin/`.
- `.env` is gitignored and must never be committed. Verify with `git check-ignore -v .env` if in doubt.

### PostgreSQL / Neon environment variables (migration only)

Both live in the repo-root `.env`. Neither is read by the running application yet
— they configure the Prisma CLI. See `DATABASE_MIGRATION_AUDIT.md`.

| Variable | Endpoint | Used by |
|----------|----------|---------|
| `DATABASE_URL` | **direct** (non-pooled) Neon endpoint | Prisma CLI: `validate`, `migrate`, `diff`, `generate`. Migrate needs a direct TCP connection |
| `DATABASE_URL_POOLED` | Neon `-pooler` endpoint | reserved for the runtime client via a driver adapter (Stage 2, next step). **Never use for migrations** |

Runtime uses `backend/src/config/neonRetry.js` for Neon HTTP resilience:
**3s fetch timeout** (`NEON_FETCH_TIMEOUT_MS`, default 3000) with **1 attempt** (fail-fast to Mongo).
Repository tests keep 90s timeout and 4 retries when `REPOSITORY_TEST=1`.
`readRouter.js` wraps PG reads in `withNeonRetry` and consults `pgCircuitBreaker.js` (3 timeouts / 60s → bypass PG 30s).
Compact fallback logs: `[PG-FALLBACK] <model> timed out -> served via Mongo` (no stack traces).
Optional tuning: `NEON_FETCH_TIMEOUT_MS`, `NEON_RETRY_ATTEMPTS`, `NEON_READ_ROUTER_ATTEMPTS`,
`PG_CB_FAILURE_THRESHOLD`, `PG_CB_FAILURE_WINDOW_MS`, `PG_CB_OPEN_DURATION_MS`, `REPO_TEST_FILE_DELAY_MS`.
Redis boot noise: `REDIS_ERROR_DEBOUNCE_MS` (default 30s) deduplicates `Redis unavailable` warnings when Redis is offline.

After `npm install`, run `npx prisma generate` to recreate the gitignored
`generated/prisma/` client. The MongoDB variables (`MONGODB_URI` and the rest)
are unaffected and remain the live system's configuration.

### Chat environment variables

| Variable | Where |
|----------|-------|
| `CHAT_SERVICE_URL` / `CHAT_SERVICE_PORT` | repo-root `.env` |
| `INTERNAL_API_KEY` | repo-root `.env` (same value chat service reads via loadEnv) |
| `MAIN_STORE_API_URL`, `SOCKET_CORS_ORIGIN` | `ecommerce-chat/.env` |
| `VITE_API_URL`, `VITE_SOCKET_URL` | `admin-dashboard/.env` (use `:5000` for gateway) |

See also: `docs/SETUP.md`, `ecommerce-chat/docs/SETUP.md`, `devops/first-time-server-setup.md`.

### Notification environment variables (email + WhatsApp)

| Variable | Purpose |
|----------|---------|
| `RESEND_API_KEY` | Resend API key (primary email) |
| `RESEND_FROM_EMAIL` | Verified sender, e.g. `EonlineBazar <noreply@eonlinebazar.com>` |
| `BREVO_API_KEY` | Brevo fallback API key |
| `BREVO_FROM_EMAIL` | Brevo sender address |
| `EMAIL_PROVIDER` | `resend` \| `brevo` \| `disabled` |
| `WA_ENABLED` | `true` to start Baileys WhatsApp on boot |
| `ADMIN_WHATSAPP_NUMBER` | Digits for admin test messages |
| `ADMIN_DELETE_PASSWORD` | Required for `DELETE /api/admin/hrm/employees/:id/permanent` — permanent employee removal |

Services: `backend/src/services/emailService.js`, `mailer.js`, `whatsappService.js`, `notificationConfigService.js`, `newsletterTokenService.js` (double opt-in confirm + JWT unsubscribe), `emailCampaignDispatchService.js`, `loyaltyLedgerService.js` (immutable point ledger + atomic credit/debit). Admin UI: **System Settings → Notifications**. Setup: `docs/NOTIFICATION_SETUP.md`.

Platform branding read path: `backend/src/services/platformSettingsReadService.js` — PG-first admin settings for `GET /api/admin/platform-settings` (`routedRead('admin')` + safe defaults). Settings singleton reads: `settingsReadService.js`. Settings change history (read-only): `settingsHistoryReadService.js` + `settingsHistoryFilter.js` → `GET /api/admin/settings-history`; UI in Security tab (`settings-history.js`). Sanitized JSON backup: `settingsExportImportService.js` + `settingsExportSanitizer.js` → `GET/POST /api/admin/settings-export|import`; Utilities tab (`settings-backup-restore.js`). Quick save: `Ctrl+S`/`Cmd+S` in `settings-hub.js` via `triggerSettingsQuickSave()` in `settings-dirty-tracker.js`.

Settings hub deep links: `/admin#settings-{tab}` (e.g. `#settings-finance`) — tab routing in `settings-hub.js`; unsaved-state tracking in `settings-dirty-tracker.js`.

## Documentation Index

| Document | Purpose |
|----------|---------|
| `ARCHITECTURE.md` | **Read first** — folder layout, barrels, nav groups, env setup, dev rules |
| `REFACTOR_MAP.md` | **Read first** — file-by-file refactor status and change log |
| `SYSTEM_ENTERPRISE_AUDIT.md` | Full-stack enterprise audit (ERP/CRM/HRM, chat, mobile, settings) |
| `DATABASE_MIGRATION_AUDIT.md` | MongoDB → PostgreSQL (Prisma + Neon) migration — roadmap, dual-write, read cutover flags |
| `docs/NOTIFICATION_SETUP.md` | Resend, Brevo, and Baileys WhatsApp configuration |
| `.cursorrules` | Cursor agent contract — pre-task reading, audit file map, code placement rules |
| `README.md` | Quick start, env vars, deployment |
| `docs/SETUP.md` | Chat microservice setup (Bengali) |
| `devops/first-time-server-setup.md` | Production VPS first-time setup |

### Area audit files (`docs/audit/`)

Each domain has a dedicated audit file. Read the relevant file before working in that area; update it after finishing. See `.cursorrules` Audit File Map for the full list.

| Area | Audit file |
|------|------------|
| Admin panel | `docs/audit/ADMIN_PANEL_AUDIT.md` |
| Customer storefront | `docs/audit/CUSTOMER_FRONTEND_AUDIT.md` |
| Auth & security | `docs/audit/AUTH_SECURITY_AUDIT.md` |
| HRM | `docs/audit/HRM_AUDIT.md` |
| Orders & checkout | `docs/audit/ORDERS_AUDIT.md` |
| Products & catalog | `docs/audit/PRODUCTS_AUDIT.md` |
| Payments & finance | `docs/audit/PAYMENTS_FINANCE_AUDIT.md` |
| CMS | `docs/audit/CMS_AUDIT.md` |
| Marketing | `docs/audit/MARKETING_AUDIT.md` |
| Chat microservice | `docs/audit/CHAT_AUDIT.md` |
| DevOps / deployment | `docs/audit/DEVOPS_AUDIT.md` |

**Legacy root audits** (historical — new findings go to `docs/audit/`): `CHAT_AUDIT.md` (redirect), `AUDIT_REPORT.md` (mobile), `PROFILE_AUDIT.md` (profile module).

When adding audit findings or operational notes, **update the mapped audit file above** — do not create new standalone audit files outside `docs/audit/` except `DATABASE_MIGRATION_AUDIT.md`.

## Rules for new developers

1. NEVER add code to barrel files (admin.css, admin-core.js, admin-products.js, admin-settings.js, profile.js, etc.) — **exception:** one-line `import` additions to barrels are allowed when wiring a new module.
2. ALWAYS add to the relevant module file.
3. ALWAYS update REFACTOR_MAP.md when creating new files.
4. CSS @media queries go in `_responsive.css` of that module group.
5. `window.functionName = fn` for any function used in HTML `onclick=""`.
6. Run tests after every change: `npm test` (all tests must pass).

