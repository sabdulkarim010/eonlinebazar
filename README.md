# EOnlineBazar

### Production-Ready Enterprise E-Commerce Platform with Modular ERP, CRM, and HRM Architecture

<p align="center">
  <img src="https://img.shields.io/badge/status-production--ready-success" alt="Production Ready">
  <img src="https://img.shields.io/badge/ERP-100%25-0ea5e9" alt="ERP Complete">
  <img src="https://img.shields.io/badge/CRM-100%25-8b5cf6" alt="CRM Complete">
  <img src="https://img.shields.io/badge/HRM-100%25-f59e0b" alt="HRM Complete">
  <img src="https://img.shields.io/badge/tests-132%2F132-brightgreen" alt="132/132 Tests Passing">
  <img src="https://img.shields.io/badge/node-20+-43853d" alt="Node.js 20+">
  <img src="https://img.shields.io/badge/express-5-black" alt="Express 5">
  <img src="https://img.shields.io/badge/mongodb-Atlas-47A248" alt="MongoDB Atlas">
  <img src="https://img.shields.io/badge/mobile-React%20Native%20%2B%20Expo-61DAFB" alt="React Native + Expo">
</p>

**EOnlineBazar** is a full-stack, production-grade commerce operating system built for the Bangladesh market. It unifies a live storefront, a modular admin console, and a React Native mobile app behind three completed enterprise pillars:

| Pillar | Scope |
|--------|-------|
| **ERP** | Inventory, purchasing, POS, couriers, and financials |
| **CRM** | Recovery, referrals, support, marketing, and loyalty |
| **HRM** | RBAC, attendance, payroll, and leave management |

The web client uses vanilla JavaScript with a modular ES architecture. The API runs on Node.js and Express with MongoDB Atlas, Redis caching, PDFKit document generation, and scheduled cron jobs. Production is hosted on an Ubuntu DigitalOcean droplet behind Nginx, supervised by PM2, with media stored on Cloudinary.

---

## Table of Contents

- [Tech Stack & Infrastructure](#tech-stack--infrastructure)
- [Core Pillars & Enterprise Modules](#core-pillars--enterprise-modules)
- [Documentation Directory Index](#documentation-directory-index)
- [Quality Assurance & Testing](#quality-assurance--testing)
- [Local Setup & Environment Guide](#local-setup--environment-guide)
- [Project Layout](#project-layout)
- [Production Deployment](#production-deployment)
- [License](#license)

---

## Tech Stack & Infrastructure

| Layer | Technology | Role |
|-------|------------|------|
| **Backend** | Node.js · Express.js · MongoDB Atlas (Mongoose) | REST API, HTML page assembly, and business logic |
| **Cache** | Redis (ioredis) | Settings, catalog, sitemap, and rate-limit caching with graceful degradation |
| **Documents** | PDFKit | Order invoices, POS receipts, payroll pay slips, and financial exports |
| **Jobs** | node-cron | Abandoned-cart recovery, courier status polling, loyalty upgrades, stock alerts |
| **Frontend** | Vanilla JavaScript (Modular ES Architecture) · HTML5 · CSS3 | Storefront + admin SPA; chart-less SVG visualization |
| **Mobile** | React Native · Expo SDK / Expo Go | Customer app — cart, checkout, wallet, referrals, live support |
| **Realtime** | Socket.IO | Store notifications and the `ecommerce-chat` microservice (port `5001`) |
| **Media** | Cloudinary | Product images, avatars, banners, and payment proofs |
| **DevOps** | Ubuntu Droplet (DigitalOcean) · PM2 · Nginx | SSL termination, reverse proxy, and process supervision |

### Supporting Integrations

| Domain | Providers |
|--------|-----------|
| **Payments** | SSLCommerz · AamarPay · ShurjoPay · manual bKash / Nagad · Cash on Delivery |
| **Couriers** | Steadfast · Pathao · RedX |
| **Messaging** | SMTP / Resend · Greenweb · BulkSMS · AlphaSMS · WhatsApp gateways |
| **Auth** | JWT sessions · Google OAuth 2.0 · Admin 2FA (TOTP / Email OTP / SMS) |

---

## Core Pillars & Enterprise Modules

All modules below are **100% completed** and wired into the admin accordion navigation (**Dashboard · ERP · CRM · HRM · Settings**).

### 1. ERP Pillar — Enterprise Resource Planning

Inventory, purchasing, in-store selling, last-mile logistics, and financial reporting in one operating loop.

| Module | Description |
|--------|-------------|
| **Supplier & Warehouse Management** | Full CRUD for vendors and stock locations. One default warehouse is seeded and protected. Supplier deletion is blocked while open purchase orders exist; products are unlinked on successful removal. |
| **Purchase Order Lifecycle & Receiving** | Draft → sent → partial / received → cancelled. `receivePO` posts inbound quantities, appends product cost history, and closes the PO when receipt is complete. Sequential PO numbers and computed totals are generated on create. |
| **Advanced POS Dashboard** | Walk-in and phone orders (`orders-pos.html` + `orders-pos.js`): ERP sidebar **POS System** launch; barcode/SKU search + popular quick-grid; debounced customer phone lookup + inline quick-add (`GET /api/admin/customers?search=`, `POST /api/admin/customers/quick`); per-item discount/price override; order discount (flat/%); split payment (Cash/bKash/Card/Split) with change calc; receipt shows discount + payment breakdown (print + PDF). |
| **Expense Tracking** | Operating expense ledger (`view-erp-expenses.html` + `erp-expenses.js`): CRUD via `/api/admin/expenses`, category filters, this-month stats, monthly trend chart, receipt upload to Cloudinary — feeds the P&amp;L report. |
| **Advanced P&amp;L Report** | Superadmin finance view (`view-finance.html` + `erp-profit-loss.js`): `GET /api/admin/finance/profit-loss` with gross/net revenue, COGS, expense-ledger courier charges, margin %, Chart.js bar/donut/trend charts, top/worst products, PDF/CSV export. |
| **Courier Deep Auto-Sync** | One-click **Book & Sync** for **Steadfast**, **Pathao**, and **RedX** (`courierSyncService.js` + `admin/courierController.js`). Customer SMS + admin WhatsApp on book; cron (`0 */3 * * *`) polls in-flight parcels every **three hours** and logs `X updated, Y unchanged, Z errors`; **↻ Refresh** on shipped rows for manual status sync + wallet cashback on delivery. |
| **Expense Tracking & Financials** | Eight expense categories (`office_rent`, `utilities`, `staff_salary`, `marketing`, `courier_charges`, `packaging`, `equipment`, `other`) feed the P&L engine (revenue, COGS, courier, returns, cashback, margin). Exports are available as **PDF** and **CSV**. Visualization uses chart-less SVG (donut / bar). |

### 2. CRM Pillar — Customer Relationship Management

Acquisition, retention, support, and lifetime-value automation across every customer touchpoint.

| Module | Description |
|--------|-------------|
| **Abandoned Cart Recovery** | Daily job finds carts idle for **24 hours+**, sends email and SMS recovery messages, and stamps `abandonedNotifiedAt` so customers are never spammed. Admin CRM shows KPIs and per-cart notify actions. |
| **Customer Referral & Rewards** | Unique invite codes on signup. First qualifying order credits **wallet points** to referrer and referee. Exposed on the web profile and the mobile `ReferralScreen`. |
| **Customer Support Ticket Lifecycle** | Contact inquiries become tickets (`TKT-YYYY-XXXX`) with status flow (`open` → `in_progress` → `resolved` → `closed`), priority, assignment, and reply history. |
| **Multi-Channel Segmented Marketing** | Broadcast campaigns over **Email**, **SMS**, and **WhatsApp** with audience segments (VIP / frequent / inactive and loyalty tiers). |
| **Customer Loyalty Tier System** | **Silver**, **Gold**, and **Platinum** tiers with automatic upgrades from lifetime spend and **dynamic cashback rates** per tier. A monthly cron plus checkout-time recalculation keep tiers current. |

### 3. HRM Pillar — Human Resource Management

Staff identity, time tracking, compensation, and leave — gated by `manage_staff` and a granular RBAC matrix.

| Module | Description |
|--------|-------------|
| **Granular RBAC & Staff Activity Audit** | Super-admin vs staff with explicit permissions (`view_analytics`, `manage_orders`, `manage_inventory`, `manage_catalog`, `manage_coupons`, `manage_customers`, `manage_settings`, `manage_security`, `manage_staff`, `manage_marketing`). Every sensitive action writes a **staff activity audit** entry (`resourceType` + `resourceId`). |
| **Attendance & Shift Management** | Clock-in / clock-out with optional **GPS tagging**, one attendance row per staff per day, named shifts with a protected default, grace-period **late penalties**, plus monthly summary and late reports. |
| **Payroll Engine & Automated Pay Slips** | Attendance-driven runs: `baseSalary × min(presentDays / workingDays, 1) + overtime + bonus − deductions`. Workflow is draft → approved → paid. Each slip is a **PDFKit** pay slip with pro-rated working-day calculation. |
| **Leave Management** | **Casual**, **Sick**, and **Annual** leave (plus unpaid) with balances, a month **calendar** view, and automatic attendance sync — approving leave stamps `holiday` rows across the span. |
| **Operational Employees & Designations** | Non-login staff roster with tabbed profiles (personal, contact, employment, salary/bank, references), **designation catalog** (seeded defaults), Cloudinary **photo + document** uploads, read-only **profile modal** (attendance, payroll, leave tabs), and `employeeCount` on the enterprise dashboard. |

---

## Documentation Directory Index

Read these documents before making changes. Operational notes belong in the existing files — do not add new standalone audit documents unless the scope is genuinely new.

| Document | Summary |
|----------|---------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | **Read first.** Folder layout, CSS/JS barrels, admin ERP/CRM/HRM nav groups, enterprise models, local dev ports, and contributor rules. |
| [REFACTOR_MAP.md](REFACTOR_MAP.md) | **Read first.** File-by-file completion log for ERP, CRM, HRM, UI restructure, and follow-on phases. |
| [SYSTEM_ENTERPRISE_AUDIT.md](SYSTEM_ENTERPRISE_AUDIT.md) | Full-stack enterprise audit: feature inventory, ERP/CRM/HRM matrix, models, APIs, mobile parity, and remaining findings. |
| [.cursorrules](.cursorrules) | Cursor agent contract: never edit barrel CSS/JS directly, never restructure `routes/*.js`, search before renaming IDs, run `npm test` after changes. |

### Additional References

| Document | Summary |
|----------|---------|
| [docs/SETUP.md](docs/SETUP.md) | Chat microservice local and production setup |
| [devops/first-time-server-setup.md](devops/first-time-server-setup.md) | Ubuntu DigitalOcean droplet bootstrap (Node, PM2, Nginx) |
| [CHAT_AUDIT.md](CHAT_AUDIT.md) | Live-chat session close and teardown audit |
| [AUDIT_REPORT.md](AUDIT_REPORT.md) | Mobile app feature-parity audit |
| [PROFILE_AUDIT.md](PROFILE_AUDIT.md) | Customer profile module split diagnostics |

---

## Quality Assurance & Testing

The repository ships with **100% passing automated coverage: 132 / 132 tests** across **11 Jest suites**. Suites use an in-memory MongoDB (`mongodb-memory-server`) and Supertest — no live Atlas, SMTP, or Cloudinary calls are required.

```bash
npm test
```

| Suite | File | Tests | Focus |
|-------|------|------:|-------|
| Auth | `tests/auth.test.js` | 14 | Register, login, verification, account deletion |
| Cart | `tests/cart.test.js` | 6 | Add, hydrate images, clear |
| Order | `tests/order.test.js` | 9 | COD create, track, cancel, line-item shape |
| Payment | `tests/payment.test.js` | 3 | Gateway adapter, COD IPN, admin payment update |
| Admin | `tests/admin.test.js` | 13 | Login, orders, customer identity, master editor |
| Notes | `tests/note.test.js` | 7 | Owner-scoped notebook and expense validation |
| Product seed | `tests/product-seed.test.js` | 3 | Demo catalog upsert |
| Chat session | `tests/chat-end-session.test.js` | 8 | Guest / agent / admin end-session ownership |
| ERP | `tests/erp.test.js` | 31 | Suppliers, warehouses, `receivePO`, slugs, audit, status enum |
| HRM | `tests/hrm.test.js` | 32 | Attendance, shifts, payroll, leave, designations, employee profile/docs/photo |
| Loyalty | `tests/loyalty-tier.test.js` | 6 | Silver / Gold / Platinum thresholds and cashback |
| **Total** | | **132** | All suites green |

Expected Jest summary:

```text
Test Suites: 11 passed, 11 total
Tests:       132 passed, 132 total
```

**Console hygiene (2026-09-11):** Footer settings API responses omit local `iconUrl` values when upload files are missing (prevents `footer-icon-*` 404s). Admin settings password fields now declare proper `autocomplete` attributes, and the sandbox real-data reset key sits inside `#realResetForm`.

---

## Local Setup & Environment Guide

### Prerequisites

| Requirement | Notes |
|-------------|-------|
| **Node.js 20+** | Required for backend and test runner |
| **MongoDB Atlas** | Connection string, or local MongoDB 7 |
| **Redis** | Optional — cache degrades gracefully if unavailable |
| **Cloudinary** | Cloud name, API key, and secret |
| **SMTP** | Gmail App Password or equivalent mail provider |

### 1. Install Dependencies

```bash
git clone https://github.com/sabdulkarim010/eonlinebazar.git
cd eonlinebazar-fullstack
npm install
```

### 2. Configure Environment

Copy the environment template and fill every required value. The server **refuses to boot** if any required secret is missing (`backend/src/utils/validateEnv.js`).

```bash
cp .env.example .env
```

#### Required (Boot-Time)

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB Atlas (or local) connection string |
| `JWT_SECRET` | Long random signing secret (never use the insecure default) |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `SMTP_HOST` | SMTP hostname |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password / app password |
| `PORT` | HTTP port — use `5000` to match the documented store gateway |

#### Common Optional Variables

| Variable | Purpose |
|----------|---------|
| `REDIS_URL` | Redis cache connection |
| `FRONTEND_URL` / `STORE_PUBLIC_URL` | Public storefront origin (cart recovery links, CORS) |
| `STEADFAST_API_KEY` / `STEADFAST_API_SECRET` | Steadfast courier integration |
| `PATHAO_CLIENT_ID` / `PATHAO_CLIENT_SECRET` / `PATHAO_STORE_ID` | Pathao courier integration |
| `REDX_API_TOKEN` | RedX courier integration |
| `SSLCOMMERZ_*` / `AAMARPAY_*` / `SHURJOPAY_*` | Payment gateways (`*_IS_LIVE=true` in production) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `INTERNAL_API_KEY` | Store ↔ chat microservice authentication |
| `CHAT_SERVICE_URL` | Chat service origin (default port `5001`) |
| `COURIER_SYNC_CRON` | Override default 2-hour courier poll (`0 */2 * * *`) |
| `ABANDONED_CART_CRON` | Override daily 24h cart recovery schedule |

> Shared secrets (`JWT_SECRET`, `INTERNAL_API_KEY`, Cloudinary credentials) belong in the **repo-root `.env` only**.

### 3. Start the Development Server

```bash
npm run dev
```

This runs `nodemon backend/src/server.js`. Open `http://localhost:5000` (or the `PORT` you set).

| Service | Command | URL |
|---------|---------|-----|
| Store API + admin + storefront | `npm run dev` or `npm run dev:store` | `http://localhost:5000` |
| Chat microservice | `npm run dev:chat` | `http://localhost:5001` |
| Health check | — | `GET /api/store/health` |
| Admin panel | — | `/admin` |
| Chat agent inbox | — | `/chat-admin` |

```bash
# Optional demo catalog
npm run seed:products

# Production-style start (no nodemon)
npm start
```

### 4. Run the Test Suite

```bash
npm test
```

All **132** tests must pass before merging changes.

### Mobile (Expo)

```bash
cd mobile
cp .env.example .env
# Set EXPO_PUBLIC_API_URL and EXPO_PUBLIC_CHAT_URL
npm install
npx expo start
```

Scan the QR code with **Expo Go**, or press `a` / `i` for an Android / iOS emulator.

**Edit Profile screen** (`EditProfileScreen.js`) uses a scrollable form layout: centered avatar block, personal info (name, gender radio modal, custom day/month/year date-of-birth picker), shipping & location via `DistrictUpazilaPicker`, field badges (read-only email, security phone, auto-fill district), and a sticky **Update Profile** footer. Profile fields sync through `useAuthStore.updateProfile()` (`gender`, `dateOfBirth`, `district`, `upazila`, `thana`, `fullAddress`).

**Profile menu** — Account & Security lists Personal Info, Security Settings, and Delete Account only; Change Password lives inside Security Settings (not duplicated on the main profile menu).

**Profile avatars** — `useAuthStore.toPublicUser()` maps `avatar` from `avatar`, `profileImage`, or `photo`. `ProfileAvatar` and the Profile tab icon resolve relative paths via `BASE_URL` (`API_ORIGIN` from `endpoints.js`) with an image `onError` fallback to initials.

**Security settings** (`SecuritySettingsScreen.js`) includes inline email & phone OTP verification (reuses `useAuthStore.requestContactOtp` / `verifyContactOtp` from the ProfileEditSheet flow) below Change Password and above Active Sessions.

---

## Project Layout

```text
eonlinebazar-fullstack/
├── backend/src/                 # Express API (MVC)
│   ├── config/                  # DB, Passport, RBAC permissions
│   ├── controllers/             # Store + admin/ (ERP, CRM, HRM)
│   ├── jobs/                    # Cron: cart recovery, courier sync, loyalty, stock
│   ├── middlewares/             # Auth, RBAC, rate limits, uploads
│   ├── models/                  # Mongoose schemas
│   ├── routes/                  # Sacred route barrels — do not restructure
│   ├── services/                # Couriers, wallet, P&L, loyalty, mail, SMS
│   ├── utils/                   # Page builders, validateEnv, PDF helpers
│   └── server.js                # Canonical entry point
├── client/                      # Storefront + admin (HTML / CSS / modular JS)
│   ├── admin/partials/          # Admin sections assembled server-side
│   ├── css/admin|profile|global # Feature CSS — never edit barrel files
│   └── js/admin/modules/        # Feature JS — never edit admin-core.js directly
├── mobile/                      # React Native + Expo customer app
├── ecommerce-chat/              # Live-chat microservice (port 5001)
├── admin-dashboard/             # Vite React chat-admin SPA → /chat-admin
├── devops/                      # Nginx, droplet first-time setup
├── tests/                       # 11 Jest suites / 132 tests
├── scripts/                     # Seed and index migration
├── ARCHITECTURE.md
├── REFACTOR_MAP.md
├── SYSTEM_ENTERPRISE_AUDIT.md
└── .cursorrules
```

### Contributor Contract

1. Never add styles to `admin.css`, `profile.css`, or `style.css` — use `css/admin/*.css`, `css/profile/*.css`, or `css/global/*.css`.
2. Never add logic to `admin-core.js` — use `js/admin/modules/*.js`.
3. Never restructure files under `backend/src/routes/`.
4. Never rename functions or IDs without searching the whole repo first.

See [.cursorrules](.cursorrules) and [ARCHITECTURE.md](ARCHITECTURE.md) for full guidelines.

---

## Production Deployment

| Item | Value |
|------|--------|
| **Host** | Ubuntu droplet on **DigitalOcean** (`eonlinebazar.com`) |
| **Process manager** | **PM2** (`npm start` → `backend/src/server.js`; chat via `ecommerce-chat/ecosystem.config.js`) |
| **Reverse proxy** | **Nginx** — SSL, store `:5000`, chat `:5001`, static `/chat-admin/` |
| **Database** | **MongoDB Atlas** |
| **Media** | **Cloudinary** |
| **Health** | `GET /api/store/health` |

First-time VPS steps are documented in [devops/first-time-server-setup.md](devops/first-time-server-setup.md). Set `NODE_ENV=production`, fill production secrets, and flip `*_IS_LIVE=true` on payment gateways only after end-to-end order testing.

---

## License

ISC — Abdul Karim Sheikh. See `package.json`.

---

<p align="center">
  <strong>EOnlineBazar</strong> · Enterprise ERP · CRM · HRM · Bangladesh 🇧🇩 · © 2026
</p>

















