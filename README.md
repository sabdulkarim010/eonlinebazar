<div align="center">

# EOnlineBazar — Full-Stack E-Commerce Platform

**Bangladesh-focused e-commerce platform built with Node.js / Express 5, MongoDB, and Vanilla JS.**

![Version](https://img.shields.io/badge/Version-5.0.0-success)
![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-7-47A248?logo=mongodb&logoColor=white)
![Redis](https://img.shields.io/badge/Cache-Redis-DC382D?logo=redis&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Real--time-Socket.IO-010101?logo=socketdotio&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-Enabled-5A0FC8)
![Tests](https://img.shields.io/badge/Tests-19%20passing-brightgreen)
![License](https://img.shields.io/badge/License-ISC-blue)

*বাংলাদেশের জন্য তৈরি — SSLCommerz, bKash/Nagad, Steadfast/Pathao/RedX, বাংলা/ইংরেজি UI*

</div>

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Architecture](#architecture)
4. [Features](#features)
   - [Phase 1 — Security & Foundation](#phase-1--security--foundation)
   - [Phase 2 — Operational Reliability](#phase-2--operational-reliability)
   - [Phase 3 — Growth Features](#phase-3--growth-features)
   - [Phase 4 — Scale & Polish](#phase-4--scale--polish)
   - [Core E-Commerce](#core-e-commerce-pre-existing-verified-working)
5. [API Routes](#api-routes)
6. [Project Structure](#project-structure)
7. [Environment Variables](#environment-variables)
8. [Quick Start (Local)](#quick-start-local)
9. [Testing](#testing)
10. [Health Check](#health-check)
11. [Project Status](#project-status)
12. [Pre-Launch Checklist](#pre-launch-checklist)
13. [Author & License](#author--license)

---

## Overview

**EOnlineBazar** is a **Bangladesh-focused**, **production-ready** full-stack e-commerce platform. It is built on **Node.js / Express 5**, **MongoDB (Mongoose)**, and a **Vanilla JavaScript** storefront — no React, Vue, or Webpack build step required. The server renders HTML pages from the `client/` directory and exposes a REST API under `/api/*`.

**Version 5.0.0** marks the completion of four development phases:

| Phase | Theme | Outcome |
|-------|-------|---------|
| Phase 1 | Security & Foundation | Hardened auth, payment gateways, Docker, smoke tests |
| Phase 2 | Operational Reliability | Live couriers, payment proof workflow, low-stock alerts |
| Phase 3 | Growth Features | Search, bulk import, Redis cache, Google OAuth, SEO |
| Phase 4 | Scale & Polish | Socket.IO, PWA, i18n, newsletter & email campaigns |

The platform is designed for the Bangladesh market: BDT pricing, local payment methods (SSLCommerz, bKash, Nagad, COD), local couriers (Steadfast, Pathao, RedX), Bengali UI support, and SMS/WhatsApp notification providers popular in BD.

| Metric | Value |
|--------|-------|
| Version | **5.0.0** |
| Mongoose models | 22 |
| Controllers | 25 |
| Route modules | 18 |
| Smoke tests | 19 (all passing) |
| Production readiness | ~98% |

---

## Tech Stack

### Backend

| Technology | Role |
|------------|------|
| **Node.js 20+** | Runtime |
| **Express 5** | HTTP server, routing, middleware |
| **MongoDB + Mongoose 9** | Primary database & ODM |
| **ioredis** | Optional Redis cache layer (graceful degradation) |
| **Socket.IO 4** | Real-time admin notifications |
| **Passport.js** | Google OAuth 2.0 social login |
| **jsonwebtoken** | JWT auth with session-embedded tokens |
| **node-cron** | Scheduled low-stock alert checks |
| **Nodemailer** | Transactional & campaign email |
| **Cloudinary** | Image storage (products, proofs, reviews) |
| **pdfkit** | PDF invoice generation |
| **xlsx + csv-parser** | Bulk product import |
| **helmet, cors, express-rate-limit, express-mongo-sanitize, hpp** | Security middleware stack |

### Frontend

| Technology | Role |
|------------|------|
| **Vanilla JavaScript** | All client-side logic — no bundler |
| **HTML5 + CSS3** | Server-rendered pages in `client/` |
| **SweetAlert2** | Dialogs and confirmations |
| **Chart.js** | Finance analytics dashboard charts |
| **Service Worker + manifest.json** | PWA offline support & install prompt |

### Integrations

| Category | Providers |
|----------|-----------|
| **Payments** | SSLCommerz, Aamarpay, ShurjoPay + manual wallets (bKash, Nagad, COD) |
| **Couriers** | Steadfast, Pathao (OAuth), RedX (Bearer token) |
| **SMS** | Greenweb BD, BulkSMS BD, AlphaSMS |
| **WhatsApp** | UltraMsg, Green API, CallMeBot |
| **Storage** | Cloudinary |
| **Auth** | JWT, Google OAuth 2.0 |

### DevOps & Testing

| Technology | Role |
|------------|------|
| **Docker + Docker Compose** | Containerized deployment (app + MongoDB + Redis) |
| **Jest + Supertest** | API smoke tests |
| **mongodb-memory-server** | In-memory MongoDB for test isolation |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Client (Browser)                            │
│  Vanilla JS · HTML pages · PWA SW · i18n · Socket.IO client       │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTP / WebSocket
┌──────────────────────────────▼──────────────────────────────────────┐
│                    Express 5 Server (server.js)                     │
│  Security middleware · Passport · Rate limit · Geo-fence · RBAC     │
├──────────────┬───────────────┬──────────────┬───────────────────────┤
│   Routes     │  Controllers  │  Middleware  │  Utils / Services    │
│  /api/*      │  25 handlers  │  auth, RBAC  │  mailer, SMS, cache  │
│  /admin/*    │               │  upload, geo │  couriers, SEO, PDF  │
├──────────────┴───────────────┴──────────────┴───────────────────────┤
│                         Mongoose Models (22)                        │
└──────────────┬──────────────────────────────┬───────────────────────┘
               │                              │
        ┌──────▼──────┐                ┌──────▼──────┐
        │  MongoDB 7  │                │  Redis 7    │
        │  (primary)  │                │  (optional) │
        └─────────────┘                └─────────────┘
               │
        ┌──────▼──────────────────────────────────────┐
        │  External Services                          │
        │  Cloudinary · SSLCommerz · Pathao · SMTP   │
        │  Greenweb SMS · UltraMsg · Google OAuth     │
        └─────────────────────────────────────────────┘
```

**Request flow (checkout example):**

1. Customer adds items to cart (guest or authenticated).
2. Checkout re-validates prices, stock, coupons, wallet balance, and cashback rules server-side.
3. Payment method selected — manual wallet (proof upload) or automated gateway redirect.
4. Order created with status `pending`; IPN/webhook confirms gateway payments.
5. Admin receives Socket.IO notification; courier booked from admin panel.
6. Order progresses: `pending → processing → shipped → delivered`.

---

## Features

### Phase 1 — Security & Foundation

Production-grade security and infrastructure baseline.

| Feature | Details |
|---------|---------|
| **Boot-time environment validation** | `utils/validateEnv.js` runs before the server starts. Missing `JWT_SECRET`, `MONGODB_URI`, or other critical vars cause an immediate exit with a clear error — no silent fallbacks. |
| **Helmet** | Sets secure HTTP headers (CSP, X-Frame-Options, etc.). |
| **CORS** | Configurable cross-origin policy tied to `FRONTEND_URL`. |
| **Rate limiting** | `express-rate-limit` on auth and sensitive endpoints to mitigate brute-force and abuse. |
| **NoSQL injection protection** | `express-mongo-sanitize` strips `$` and `.` operators from user input. |
| **HPP protection** | `hpp` middleware prevents HTTP parameter pollution. |
| **JWT with hardened secrets** | Tokens embed a session ID. Server refuses to start without a strong `JWT_SECRET` — no default fallback string. |
| **Email verification** | `GET /api/customer/verify/:token` and resend route. Toggle enforcement via `REQUIRE_EMAIL_VERIFICATION=true`. |
| **SSLCommerz integration** | Full redirect + IPN flow for Bangladesh's most popular payment gateway. |
| **Aamarpay integration** | Redirect checkout + server-side IPN verification. |
| **ShurjoPay integration** | Redirect checkout + return/cancel URLs + IPN handler. |
| **IPN verification (all gateways)** | `paymentIpnController.js` validates signatures/hashes before marking orders paid. |
| **Docker support** | Multi-stage `Dockerfile` (Node 20 Alpine) with built-in `HEALTHCHECK`. |
| **Docker Compose** | `docker-compose.yml` spins up app + MongoDB 7 + Redis 7 on a shared network. |
| **Health endpoint** | `GET /api/store/health` — used by Docker and uptime monitors. |
| **19 smoke tests** | Jest + Supertest suites for auth, cart, order, payment, and admin (see [Testing](#testing)). |

---

### Phase 2 — Operational Reliability

Day-to-day store operations: couriers, payment reconciliation, and automated alerts.

| Feature | Details |
|---------|---------|
| **Steadfast courier (fully live)** | 1-click order dispatch from admin panel via Steadfast API key/secret. |
| **Pathao courier (live booking)** | OAuth token flow + Bearer token; creates shipments via Pathao Merchant API. |
| **RedX courier (live booking)** | Bearer token authentication; creates shipments via RedX API. |
| **Customer payment proof upload** | For manual payment methods (bKash, Nagad): customer submits TRX ID + screenshot uploaded to Cloudinary. |
| **Admin payment proof review** | Admin approves or rejects proofs with optional notes; order status updated accordingly. |
| **Low-stock cron alert system** | `node-cron` job on configurable schedule (`LOW_STOCK_CHECK_INTERVAL`). Sends alerts when stock falls below threshold. |
| **Multi-channel alert delivery** | Low-stock alerts sent via **email** (Nodemailer), **SMS** (Greenweb/BulkSMS/AlphaSMS), and **WhatsApp** (UltraMsg/Green API/CallMeBot). |
| **StockAlert history model** | `models/stockAlert.js` — persistent log of every alert fired (product, threshold, timestamp, channels used). |
| **Payment Reconciliation Dashboard** | Admin panel page (`payment-reconciliation.html`) to match gateway records against orders. |
| **Mark gateway orders as paid** | Manual override for admins when IPN is delayed or missed. |
| **Bengali 404 page** | `public/404.html` — user-friendly not-found page in Bengali. |
| **Global error handler** | Express error middleware returns consistent JSON for API routes and friendly pages for HTML routes. |

> **Note (বাংলা):** Pathao ও RedX লাইভ API ব্যবহার করতে `.env`-এ `PATHAO_IS_LIVE=true` এবং `REDX_IS_LIVE=true` সেট করুন। Steadfast ইতিমধ্যে production-ready।

---

### Phase 3 — Growth Features

Tools to grow traffic, catalog size, and discoverability.

| Feature | Details |
|---------|---------|
| **Advanced product search** | Filter by price range, brand, minimum rating, in-stock only. Sort by price, rating, newest. All filters encoded in URL query params for sharing (`/search?minPrice=100&brand=...`). |
| **Bulk product import (CSV/Excel)** | Admin uploads `.csv` or `.xlsx` files; parsed by `csv-parser` and `xlsx`. Creates/updates products in batch. |
| **Downloadable import template** | Admin can download a pre-formatted template with required column headers. |
| **Redis caching** | Cached entities: store settings, categories, brands, popular/featured products, flash sale config, footer settings, CMS page content, individual product details, search result hashes. |
| **Graceful Redis degradation** | If Redis is unavailable, every cache read falls through to MongoDB with no errors surfaced to the customer. |
| **Admin cache management** | Endpoints to flush specific keys or entire cache from admin panel (`cacheController.js`). |
| **Google OAuth 2.0 login** | Passport.js strategy; customers can sign in with Google alongside email/password. |
| **SEO meta tags** | Per-page `<title>`, `<meta description>`, canonical URLs injected server-side. |
| **Open Graph tags** | `og:title`, `og:description`, `og:image`, `og:url` for Facebook/LinkedIn previews. |
| **Twitter Cards** | `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`. |
| **JSON-LD structured data** | Product schema (`@type: Product`) with price, availability, and rating for Google rich results. |
| **Dynamic sitemap.xml** | Auto-generated from published products, categories, and CMS pages (`routes/seoRoutes.js`). |
| **robots.txt** | Served dynamically; allows crawlers on public pages, blocks admin/API paths. |

**Redis cache keys:**

| Key pattern | Cached data | Default TTL |
|-------------|-------------|-------------|
| `store:settings` | Store name, logo, payment methods | 300 s |
| `catalog:categories:all` | Full category tree | 300 s |
| `catalog:brands:all` | All brands | 300 s |
| `products:popular` / `products:featured` | Curated product lists | 300 s |
| `store:flash-sale` | Active flash sale config | 300 s |
| `store:footer` | Footer columns & links | 300 s |
| `cms:page:{slug}` | Individual CMS page content | 300 s |
| `products:detail:{id}` | Single product document | 300 s |
| `search:{hash}` | Search result set | 300 s |

---

### Phase 4 — Scale & Polish

Real-time admin experience, PWA, internationalization, and marketing tools.

| Feature | Details |
|---------|---------|
| **Socket.IO admin notifications** | Admin clients connect to `/admin` namespace with JWT. Events pushed on: new order, new contact message, payment proof submitted, low-stock alert. |
| **Admin notification bell** | Bell icon in admin header with unread badge count. |
| **Notification dropdown** | Shows last 10 events with timestamp and type; click to navigate to relevant section. |
| **PWA manifest** | `public/manifest.json` — app name, icons (72–512 px), theme color, shortcuts (Search, My Orders). |
| **Service worker** | `public/service-worker.js` — caches static assets and key API responses for offline browsing. |
| **Install prompt banner** | Custom banner prompts eligible browsers to install the app to home screen. |
| **Bengali / English i18n toggle** | Language switcher in site header; preference stored in `localStorage`. |
| **100+ translation keys** | `public/js/i18n.js` covers navigation, homepage, product, cart, checkout, orders, auth, search, footer, and common UI strings. |
| **Dynamic content re-render** | Switching language re-applies all `data-i18n` attributes without page reload. |
| **Newsletter subscription** | Public subscribe form; stores email in `models/newsletter.js`. |
| **Unsubscribe token** | Secure one-click unsubscribe link sent in every campaign email. |
| **Email campaign system** | Create drafts, send test email to admin, batch send to all active subscribers. |
| **Campaign model** | `models/emailCampaign.js` — tracks subject, HTML body, status (draft/sent), send stats. |
| **Admin newsletter management** | Admin panel section: subscriber list (search, export, delete), campaign list (create, edit, send). |

> **Note (বাংলা):** PWA ইনস্টল করতে HTTPS প্রয়োজন। লোকাল ডেভেলপমেন্টে `localhost`-এ কাজ করবে; production-এ SSL সার্টিফিকেট সেট করুন।

---

### Core E-Commerce *(pre-existing, verified working)*

The foundation built before Phases 1–4 — all features remain fully operational.

#### Platform Scale

| Component | Count | Location |
|-----------|-------|----------|
| Mongoose models | 22 | `models/` |
| Controllers | 25 | `controllers/` |
| Route modules | 18 | `routes/` |

#### Catalog & Storefront

- **Enterprise catalog engine** — Categories, brands, multi-attribute variant matrix with per-combination stock tracking.
- **Flash sale countdown** — Scheduled start/end with live countdown timer on homepage and product cards.
- **Product reviews** — Verified-purchase badge; customers upload review photos to Cloudinary.
- **Wishlist** — Persistent wishlist for authenticated users; heart toggle on product cards.
- **Low-stock FOMO badges** — "Only X left!" badges when stock falls below configurable threshold.
- **Dynamic store branding** — Admin-uploaded logo, favicon, store name applied across all pages.
- **CMS pages** — Admin-editable legal pages (Privacy, Terms, Return Policy) with markdown support.
- **Dynamic footer** — Configurable columns, social links, payment icons, and page links.
- **Contact inbox** — Customer messages stored in `ContactMessage` model; admin replies from panel.
- **Free-shipping threshold** — Dynamic progress bar in cart ("Add ৳X more for free delivery").
- **Live dashboard announcements** — Admin-configured banner messages on homepage.

#### Cart & Checkout

- **Guest cart** — Unauthenticated users can add items; cart stored in session/localStorage.
- **Guest checkout** — Place orders without creating an account.
- **Cart merge on login** — Guest cart items automatically merged when user logs in or registers.
- **Full checkout pipeline** — Server-side price re-validation on every checkout attempt (prevents tampering).
- **Coupon engine** — Percentage/fixed discounts, usage limits, expiry dates, category restrictions.
- **Store wallet** — Customer loyalty wallet; balance deducted at checkout with admin-controlled rules.
- **Cashback** — Configurable cashback percentage credited to wallet after delivery.
- **Dynamic shipping quotes** — Delivery charge calculated by district/upazila from admin-configured zones.
- **Delivery estimates** — Estimated delivery date shown at checkout based on zone and courier.
- **Database-driven payment methods** — Manual wallets (bKash, Nagad, COD) and automated gateways configured from admin panel; credentials encrypted at rest.

#### Orders & Fulfillment

- **Order lifecycle** — `pending → processing → shipped → delivered` with admin status updates.
- **Customer cancel** — Customers can cancel orders while status is `pending`.
- **Return request** — Post-delivery return workflow with admin approve/reject.
- **PDF invoice download** — 1-click invoice generation via `pdfkit` from order details page.
- **Visual order status timeline** — Step indicator on order tracking page.
- **Public order tracking** — Track by order ID + phone number without login.
- **1-click courier dispatch** — Admin selects Steadfast, Pathao, or RedX and books shipment from order detail.
- **Staff manual order entry** — Admin creates phone/POS orders on behalf of customers.
- **WhatsApp order alerts** — Background notification to store WhatsApp on every new order (UltraMsg, Green API, or CallMeBot).

#### Admin Panel & Security

- **RBAC — 9 permissions** | Permission | Description |
  |------------|-------------|
  | `view_analytics` | Dashboard overview, sales metrics, revenue charts |
  | `manage_orders` | View/update orders, approve returns, process refunds |
  | `manage_inventory` | Create, edit, delete products and stock levels |
  | `manage_catalog` | Categories, brands, product attributes |
  | `manage_coupons` | Discount codes and redemption limits |
  | `manage_customers` | Customer profiles, order history, account status |
  | `manage_settings` | Store branding, delivery charges, reward settings |
  | `manage_security` | Security logs, login history, IP blacklist |
  | `manage_staff` | Create staff accounts and assign permissions |

- **RBAC — 3 role presets** (one-click assignment in staff creation form):

  | Preset | Permissions granted |
  |--------|----------------------|
  | **Full Admin** | All 9 permissions |
  | **Inventory Manager** | `manage_inventory`, `manage_catalog` |
  | **Customer Support** | `manage_orders`, `manage_customers` |

- **Admin 2FA** — Three methods: email OTP, TOTP (Google Authenticator via `speakeasy`), SMS OTP.
- **Geo-fencing** — Admin login restricted to allowed countries (`ADMIN_GEO_ALLOWED_COUNTRIES=BD` by default).
- **Brute-force protection** — Account lockout after `MAX_LOGIN_ATTEMPTS` failed logins for `LOGIN_BAN_DURATION_MINUTES`.
- **IP blacklist** — Admin can block malicious IPs; enforced on every request.
- **Active device tracking** — Every login records IP, geo-location, browser, and device; remote logout supported.
- **Admin refund controls** — Refund with safe undo window to prevent accidental double-refunds.
- **Unified master settings** — Single admin panel for announcements, free-shipping threshold, cashback %, loyalty points, refund windows, VIP segmentation thresholds, flash sale scheduling.
- **Finance analytics dashboard** — Separate login (`FINANCE_ADMIN_EMAIL`); P&L reports with itemized profit formulas, dynamic date-range filtering, Chart.js visualizations, persistent dark/light theme.

#### Data Models (22)

| Model | Purpose |
|-------|---------|
| `user` | Customer accounts, wallet, VIP tier |
| `userSession` | Customer active sessions / devices |
| `admin` | Admin & staff accounts with RBAC permissions |
| `adminSession` | Admin active sessions / devices |
| `product` | Products with variant matrix and stock |
| `category` | Product categories (nested) |
| `brand` | Product brands |
| `attribute` | Variant attributes (Size, Color, etc.) |
| `cart` | Shopping cart items |
| `order` | Orders with full lifecycle and payment state |
| `coupon` | Discount codes |
| `review` | Product reviews with photos |
| `wishlist` | Customer wishlists |
| `PaymentMethod` | Dynamic payment method catalog |
| `Settings` / `Setting` | Master store settings |
| `FooterSettings` | Footer column configuration |
| `PageContent` | CMS legal/info pages |
| `ContactMessage` | Customer contact form submissions |
| `newsletter` | Newsletter subscriber emails |
| `emailCampaign` | Email campaign drafts and send history |
| `stockAlert` | Low-stock alert history log |
| `securityLog` | Admin security audit trail |
| `loginAttempt` | Failed login tracking for brute-force protection |
| `blacklistedIp` | Blocked IP addresses |

---

## API Routes

All REST endpoints are prefixed under `/api`. Admin panel routes use `/admin/api`.

| Prefix | Module | Key endpoints |
|--------|--------|---------------|
| `/api/auth` | Authentication | Google OAuth, token refresh |
| `/api/customer` | Customer | Register, login, verify email, profile, sessions |
| `/api/products` | Products | CRUD, search, bulk import, variants |
| `/api/categories` | Categories | CRUD, tree |
| `/api/brands` | Brands | CRUD |
| `/api/attributes` | Attributes | CRUD, variant matrix |
| `/api/cart` | Cart | Add, update, remove, clear, merge |
| `/api/wishlist` | Wishlist | Add, remove, list |
| `/api/orders` | Orders | Create, track, cancel, return, invoice PDF |
| `/api/payments` | Payments | Gateway redirect, IPN webhooks, proof upload |
| `/api/coupons` | Coupons | Validate, apply |
| `/api/reviews` | Reviews | Create, list, moderate |
| `/api/store` | Store | Public settings, health, delivery zones, flash sale |
| `/api/contact` | Contact | Submit contact form |
| `/api/inquiries` | Inquiries | Customer inquiry threads |
| `/api/newsletter` | Newsletter | Subscribe, unsubscribe |
| `/api/finance` | Finance | P&L analytics (separate auth) |
| `/admin/api` | Admin | Full admin CRUD, RBAC, 2FA, cache, campaigns, reconciliation |
| `/sitemap.xml` | SEO | Dynamic sitemap |
| `/robots.txt` | SEO | Crawler rules |

---

## Project Structure

```
eonlinebazar-fullstack/
│
├── server.js                      # Entry point — Express, Socket.IO, cron, clean URLs
├── Dockerfile                     # Node 20 Alpine + HEALTHCHECK
├── docker-compose.yml             # App + MongoDB 7 + Redis 7
├── docker-compose.prod.yml        # Production overrides
├── .env.example                   # Complete environment variable reference
├── package.json                   # Dependencies & Jest config
├── seed.js                        # Optional database seeder
│
├── config/
│   ├── db.js                      # MongoDB connection
│   ├── passport.js                # Google OAuth strategy
│   └── permissions.js             # RBAC permission catalog (single source of truth)
│
├── models/                        # 22 Mongoose schemas
├── controllers/                   # 25 request handlers
├── routes/                        # 18 Express route modules
│
├── middleware/
│   └── securityMiddleware.js      # Helmet, CORS, rate limit, sanitize, HPP
├── middlewares/
│   ├── authMiddleware.js          # JWT verification
│   ├── rbac.js                    # Permission enforcement
│   ├── adminSecurity.js           # Admin 2FA, geo-fence
│   ├── geoFencing.js              # Country-based access control
│   └── uploadMiddleware.js        # Multer + Cloudinary upload
│
├── utils/
│   ├── validateEnv.js             # Boot-time env validation
│   ├── cacheService.js            # Redis getOrSet / invalidate
│   ├── redisClient.js             # ioredis connection with fallback
│   ├── socketService.js           # Socket.IO admin namespace
│   ├── mailer.js                  # Nodemailer wrapper
│   ├── smsService.js              # Multi-provider SMS
│   ├── stockAlertService.js       # Low-stock cron + notifications
│   ├── courierService.js          # Steadfast / Pathao / RedX adapters
│   ├── seoPageService.js          # Server-side SEO injection
│   ├── seoHelper.js               # Meta tag & JSON-LD builders
│   ├── invoicePdf.js              # PDF invoice generator
│   ├── brandingHtml.js            # Dynamic logo/name injection
│   └── paymentMethodService.js    # Encrypted gateway credentials
│
├── client/                        # Storefront (served by Express)
│   ├── index.html                 # Homepage
│   ├── search.html                # Advanced search with URL filters
│   ├── product-details.html       # Product page with reviews & variants
│   ├── cart.html                  # Shopping cart
│   ├── checkout.html              # Checkout flow
│   ├── payment.html               # Payment & proof upload
│   ├── profile.html               # Customer account & orders
│   ├── login.html / register.html # Auth pages
│   ├── admin.html                 # Super Admin Panel
│   ├── admin-login.html           # Admin auth + 2FA
│   ├── finance-analytics.html     # P&L dashboard
│   ├── payment-reconciliation.html
│   ├── css/                       # Stylesheets
│   └── js/                        # Vanilla JS modules
│       ├── main.js                # Homepage logic
│       ├── search.js              # Filter engine
│       ├── cart.js / checkout.js  # Cart & checkout
│       ├── pwa.js                 # Service worker registration & install banner
│       ├── admin.js               # Admin panel (orders, products, settings)
│       ├── admin-newsletter.js    # Newsletter & campaign management
│       └── session-guard.js       # Auth state management
│
├── public/                        # Static assets (served at /)
│   ├── manifest.json              # PWA manifest
│   ├── service-worker.js          # Offline caching strategy
│   ├── 404.html                   # Bengali not-found page
│   ├── js/i18n.js                 # Bengali/English translations (100+ keys)
│   └── images/
│       ├── icons/                 # PWA icons (72–512 px)
│       ├── og-default.jpg         # Default Open Graph image (replace before launch)
│       └── screenshot-mobile.jpg  # PWA store screenshot
│
├── tests/                         # Jest smoke tests
│   ├── setup.js                   # In-memory MongoDB + test helpers
│   ├── app.js                     # Express app factory for Supertest
│   ├── auth.test.js               # 6 tests
│   ├── cart.test.js               # 3 tests
│   ├── order.test.js              # 4 tests
│   ├── payment.test.js            # 3 tests
│   └── admin.test.js              # 3 tests
│
└── scripts/
    └── generate-pwa-icons.js      # Generate placeholder PWA icon set
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all values before starting the server.

```bash
cp .env.example .env
```

The server validates critical variables at boot and **exits immediately** if any are missing.

### APP

| Variable | Example | Description |
|----------|---------|-------------|
| `PORT` | `5000` | HTTP port |
| `NODE_ENV` | `production` | `development` or `production` |
| `FRONTEND_URL` | `https://yourdomain.com` | Base URL for CORS, OAuth callbacks, email links |
| `DEFAULT_OG_IMAGE_URL` | `https://yourdomain.com/images/og-default.jpg` | Fallback Open Graph image |
| `REQUIRE_EMAIL_VERIFICATION` | `true` | Block login until email is verified |

### DATABASE

| Variable | Example | Description |
|----------|---------|-------------|
| `MONGODB_URI` | `mongodb+srv://...` | MongoDB connection string (Atlas or local) |

### REDIS *(optional — app works without it)*

| Variable | Example | Description |
|----------|---------|-------------|
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `REDIS_CACHE_TTL_SECONDS` | `300` | Default cache TTL in seconds |

### JWT

| Variable | Example | Description |
|----------|---------|-------------|
| `JWT_SECRET` | 64-char random string | **Required.** No fallback — server won't start without it |
| `JWT_EXPIRES_IN` | `7d` | Token expiry |

### CLOUDINARY

| Variable | Description |
|----------|-------------|
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | API key |
| `CLOUDINARY_API_SECRET` | API secret |

### SMTP / EMAIL

| Variable | Description |
|----------|-------------|
| `SMTP_HOST` | SMTP server (e.g. `smtp.gmail.com`) |
| `SMTP_PORT` | Port (587 for TLS) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password or app password |
| `EMAIL_FROM` | Sender address (e.g. `EOnlineBazar <shop@yourdomain.com>`) |

### SMS PROVIDERS

| Variable | Provider |
|----------|----------|
| `GREENWEB_SMS_API_KEY` | Greenweb BD |
| `GREENWEB_SMS_SENDER_ID` | Greenweb BD sender ID |
| `BULKSMS_BD_API_KEY` | BulkSMS BD |
| `ALPHASMS_API_KEY` | AlphaSMS |

### WHATSAPP

| Variable | Provider |
|----------|----------|
| `ULTRAMSG_INSTANCE_ID` / `ULTRAMSG_TOKEN` | UltraMsg |
| `GREEN_API_INSTANCE` / `GREEN_API_TOKEN` | Green API |
| `CALLMEBOT_PHONE` / `CALLMEBOT_API_KEY` | CallMeBot |

### PAYMENT GATEWAYS

| Variable | Gateway | Notes |
|----------|---------|-------|
| `SSLCOMMERZ_STORE_ID` | SSLCommerz | |
| `SSLCOMMERZ_STORE_PASSWORD` | SSLCommerz | |
| `SSLCOMMERZ_IS_LIVE` | SSLCommerz | Set `true` for production |
| `AAMARPAY_STORE_ID` | Aamarpay | |
| `AAMARPAY_SIGNATURE_KEY` | Aamarpay | |
| `AAMARPAY_IS_LIVE` | Aamarpay | Set `true` for production |
| `SHURJOPAY_USERNAME` | ShurjoPay | |
| `SHURJOPAY_PASSWORD` | ShurjoPay | |
| `SHURJOPAY_PREFIX` | ShurjoPay | Merchant prefix (e.g. `SP`) |
| `SHURJOPAY_IS_LIVE` | ShurjoPay | Set `true` for production |
| `SHURJOPAY_RETURN_URL` | ShurjoPay | Post-payment redirect |
| `SHURJOPAY_CANCEL_URL` | ShurjoPay | Cancel redirect |

### COURIERS

| Variable | Courier | Notes |
|----------|---------|-------|
| `STEADFAST_API_KEY` | Steadfast | |
| `STEADFAST_API_SECRET` | Steadfast | |
| `PATHAO_CLIENT_ID` | Pathao | OAuth credentials |
| `PATHAO_CLIENT_SECRET` | Pathao | |
| `PATHAO_USERNAME` | Pathao | Merchant account |
| `PATHAO_PASSWORD` | Pathao | |
| `PATHAO_STORE_ID` | Pathao | |
| `PATHAO_IS_LIVE` | Pathao | Set `true` for production |
| `REDX_API_TOKEN` | RedX | Bearer token |
| `REDX_IS_LIVE` | RedX | Set `true` for production |

### ENCRYPTION

| Variable | Description |
|----------|-------------|
| `PAYMENT_CREDENTIAL_ENCRYPTION_KEY` | 64-char hex string for encrypting gateway credentials at rest |

### FINANCE MODULE

| Variable | Description |
|----------|-------------|
| `FINANCE_ADMIN_EMAIL` | Separate login email for P&L dashboard |
| `FINANCE_ADMIN_PASSWORD` | Strong password for finance dashboard |

### GOOGLE OAUTH

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `GOOGLE_CALLBACK_URL` | e.g. `https://yourdomain.com/api/auth/google/callback` |
| `SESSION_SECRET` | 64-char random string for Express sessions |

### SESSION / SECURITY

| Variable | Default | Description |
|----------|---------|-------------|
| `ADMIN_GEO_ALLOWED_COUNTRIES` | `BD` | Comma-separated ISO country codes for admin login |
| `MAX_LOGIN_ATTEMPTS` | `5` | Failed attempts before lockout |
| `LOGIN_BAN_DURATION_MINUTES` | `1440` | Lockout duration (minutes) |

### LOW STOCK ALERTS

| Variable | Default | Description |
|----------|---------|-------------|
| `LOW_STOCK_ALERT_ENABLED` | `true` | Enable/disable cron job |
| `LOW_STOCK_CHECK_INTERVAL` | `0 * * * *` | Cron expression (default: every hour) |
| `LOW_STOCK_DEFAULT_THRESHOLD` | `10` | Stock level that triggers alert |
| `ADMIN_ALERT_EMAIL` | — | Email address for alert notifications |

> **Tip (বাংলা):** `.env.example` ফাইলে সব variable-এর সম্পূর্ণ তালিকা আছে। Production-এ GitHub/Render secrets-এ সব key সেট করুন — `.env` ফাইল কখনো commit করবেন না।

---

## Quick Start (Local)

### Prerequisites

- **Node.js 20+** and **npm**
- **MongoDB 7** (local install or Docker)
- **Redis 7** *(optional but recommended for caching)*

### Option A — Run with Node.js

```bash
# 1. Clone the repository
git clone https://github.com/your-org/eonlinebazar-fullstack.git
cd eonlinebazar-fullstack

# 2. Configure environment
cp .env.example .env
# Edit .env — fill in MONGODB_URI, JWT_SECRET, and other keys

# 3. Install dependencies
npm install

# 4. (Optional) Seed sample data
node seed.js

# 5. Start the server
node server.js
```

Open **http://localhost:5000** in your browser.

| Page | URL |
|------|-----|
| Storefront | `http://localhost:5000` |
| Search | `http://localhost:5000/search` |
| Admin login | `http://localhost:5000/admin-login` |
| Finance dashboard | `http://localhost:5000/finance-login` |
| Health check | `http://localhost:5000/api/store/health` |

### Option B — Run with Docker Compose *(includes MongoDB + Redis)*

```bash
cp .env.example .env          # Fill in all values
docker-compose up --build
```

| Service | Container port | Host port | Image |
|---------|---------------|-----------|-------|
| App | 5000 | 5000 | Built from `Dockerfile` |
| MongoDB | 27017 | 27017 | `mongo:7` |
| Redis | 6379 | 6379 | `redis:7-alpine` |

For production deployment, use `docker-compose.prod.yml` for additional overrides.

---

## Testing

The project includes **19 smoke tests** across 5 Jest suites. Tests run against an in-memory MongoDB instance — no external database required.

```bash
npm test
```

**Expected output:**

```
Test Suites: 5 passed, 5 total
Tests:       19 passed, 19 total
```

### Test coverage by suite

| Suite | Tests | What is verified |
|-------|-------|-----------------|
| `auth.test.js` | 6 | Registration, duplicate email rejection, login (valid/invalid), email verification (valid/invalid token) |
| `cart.test.js` | 3 | Add item to cart, retrieve cart with items, clear cart |
| `order.test.js` | 4 | Create COD order, fetch order by ID, public tracking, customer cancel |
| `payment.test.js` | 3 | SSLCommerz adapter without credentials, COD IPN endpoint, admin payment status update |
| `admin.test.js` | 3 | Admin login, fetch orders list, update order status to `processing` |
| **Total** | **19** | |

### Test stack

| Tool | Purpose |
|------|---------|
| **Jest 30** | Test runner (`--runInBand --forceExit`) |
| **Supertest 7** | HTTP assertion against Express app |
| **mongodb-memory-server 11** | Ephemeral MongoDB for test isolation |

---

## Health Check

```
GET /api/store/health
```

Used by the Docker `HEALTHCHECK` directive and external uptime monitors (UptimeRobot, Better Stack, etc.).

**Example response:**

```json
{
  "success": true,
  "status": "ok",
  "uptime": 8642,
  "database": "connected",
  "timestamp": "2026-07-30T01:00:00.000Z"
}
```

**Docker health check** (from `Dockerfile`):

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/store/health || exit 1
```

---

## Project Status

| Phase | Focus area | Status |
|-------|-----------|--------|
| **Phase 1** | Security & Foundation | ✅ Complete |
| **Phase 2** | Operational Reliability | ✅ Complete |
| **Phase 3** | Growth Features | ✅ Complete |
| **Phase 4** | Scale & Polish | ✅ Complete |

**Estimated completion: ~98% production-ready**

All four development phases are code-complete and tested. The remaining ~2% is configuration, branding assets, and third-party account setup — not missing features.

---

## Pre-Launch Checklist

Complete these steps before going live. None require code changes.

| # | Task | Details |
|---|------|---------|
| 1 | **Fill in `.env` with real API keys** | Payment gateways, SMS, couriers, SMTP, Cloudinary, WhatsApp — placeholders will not work in production |
| 2 | **Replace PWA icons** | Swap generated icons in `public/images/icons/` with your branded PNGs (72, 96, 128, 144, 152, 192, 384, 512 px) |
| 3 | **Replace OG image** | Replace `public/images/og-default.jpg` with a **1200×630** branded image for social media previews |
| 4 | **Set up Google OAuth** | Create OAuth 2.0 credentials in [Google Cloud Console](https://console.cloud.google.com/); set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` |
| 5 | **Configure hosting environment** | On Render, Railway, VPS, or similar: set `MONGODB_URI`, `FRONTEND_URL`, and all API keys as environment secrets |
| 6 | **Enable live payment flags** | Set `SSLCOMMERZ_IS_LIVE=true`, `AAMARPAY_IS_LIVE=true`, `SHURJOPAY_IS_LIVE=true` when switching from sandbox to production |
| 7 | **Enable live courier flags** | Set `PATHAO_IS_LIVE=true`, `REDX_IS_LIVE=true` for live shipment booking |
| 8 | **Enable HTTPS** | Required for PWA install, Google OAuth callbacks, and payment gateway IPN verification |
| 9 | **Run smoke tests** | Execute `npm test` and confirm all 19 tests pass before deploying |
| 10 | **Seed or import products** | Use `node seed.js` for demo data, or bulk import via admin CSV/Excel upload |

> **Note (বাংলা):**
> - SSLCommerz ও Aamarpay-এ sandbox mode-এ আগে টেস্ট করুন, তারপর live flag চালু করুন।
> - Pathao credentials Pathao Merchant Panel থেকে নিন।
> - PWA ইনস্টল ও Google Login-এ HTTPS বাধ্যতামূলক।
> - Render-এ deploy করলে `FRONTEND_URL` আপনার Render domain-এ সেট করুন (যেমন `https://eonlinebazar.onrender.com`)।

---

## Author & License

**Author:** Abdul Karim Sheikh

**License:** ISC

Built for the Bangladesh e-commerce market — from secure checkout to live courier dispatch, real-time admin alerts, and bilingual storefront, all in one self-contained stack.

---

<div align="center">

**EOnlineBazar v5.0.0**

Phase 1 ✅ · Phase 2 ✅ · Phase 3 ✅ · Phase 4 ✅

</div>









