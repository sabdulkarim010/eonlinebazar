# EOnlineBazar 🛒
### Bangladesh's Full-Stack E-Commerce Platform

![Version](https://img.shields.io/badge/version-5.0.0-blue)
![Node](https://img.shields.io/badge/node-20+-green)
![License](https://img.shields.io/badge/license-MIT-yellow)
![Tests](https://img.shields.io/badge/tests-19%20passed-brightgreen)
![Status](https://img.shields.io/badge/status-production--ready-success)

A feature-complete, production-ready e-commerce platform built specifically for the Bangladesh market. Supports manual wallets (bKash, Nagad), local courier APIs (Pathao, RedX, Steadfast), local payment gateways (SSLCommerz, AamarPay, ShurjoPay), and a Bangladesh-specific address system (district / upazila).

---

## ✨ Features

### 🏗️ Architecture

| Area | Details |
|------|---------|
| **Stack** | Node.js 20, Express 5, MongoDB 7, Vanilla JS |
| **Pattern** | MVC — 25 models, 30 controllers, 20 route modules |
| **Auth** | JWT + session tracking + Google OAuth 2.0 |
| **Cache** | Redis (ioredis) with graceful degradation |
| **Real-time** | Socket.IO WebSocket notifications |
| **Storage** | Cloudinary (images, avatars, payment proofs) |
| **Testing** | Jest + Supertest + mongodb-memory-server (19 tests) |
| **DevOps** | Docker + Docker Compose + health endpoint |

### 🛡️ Phase 1 — Security & Foundation

- Boot-time environment validation (fails fast on missing secrets)
- Helmet + CORS + rate limiting + NoSQL injection protection
- JWT hardening (no fallback secrets, session-aware)
- Email verification with token expiry (48h)
- SSLCommerz, AamarPay, ShurjoPay gateway integration with IPN
- 19 smoke tests covering auth, cart, order, payment, and admin flows
- Docker + docker-compose + `/api/store/health` endpoint

### 🚀 Phase 2 — Operational Reliability

- Live courier booking: Pathao (OAuth2), RedX (Bearer), Steadfast
- Customer payment proof upload (TRX ID + screenshot → Cloudinary)
- Admin proof review: approve / reject with notes
- Low-stock cron alerts via Email + SMS + WhatsApp
- Payment Reconciliation Dashboard (gateway vs manual vs COD)
- Manual payment override (mark-as-paid with audit trail)
- Proper 404 page (Bengali) + global error handler

### 📈 Phase 3 — Growth Features

- Advanced search: price range, brand, rating, sort, inStock filter
- URL-shareable filters with browser history `pushState`
- Bulk product import via CSV / Excel (xlsx + csv-parser)
- Redis caching for settings, categories, brands, products (5 layers)
- Admin cache management (stats, flush, pattern delete)
- Google OAuth 2.0 sign-in (Passport.js)
- SEO: meta tags, Open Graph, Twitter Cards, JSON-LD structured data
- Dynamic `sitemap.xml` + `robots.txt`

### 🌟 Phase 4 — Scale & Polish

- Socket.IO real-time admin notifications (new order, payment, stock)
- Admin notification bell with dropdown (last 10, unread badge)
- PWA: Web App Manifest + Service Worker + offline cache
- Bengali / English language toggle (localStorage, 100+ keys)
- Newsletter subscription with unsubscribe token
- Email campaign system (draft → test → batch send)
- Admin newsletter management dashboard

### 🏪 Core E-Commerce (Verified Working)

- Full checkout: price re-validation, coupon, wallet, cashback / points
- Guest cart + checkout + merge on login
- Complete order lifecycle with status tracking
- Customer cancel / return request workflow
- PDF invoice download (PDFKit)
- Admin RBAC (9 permissions, 3 role presets)
- Admin 2FA: Email OTP, Google Authenticator (TOTP), SMS OTP
- Geo-fencing + brute-force protection + IP blacklist
- Finance analytics dashboard (P&L, Chart.js, date filtering)
- Wishlist + verified-purchase reviews (with Cloudinary photos)
- Flash sale countdown + WhatsApp order alerts

---

## 🧰 Tech Stack

| Layer | Technology |
|-------|------------|
| **Runtime** | Node.js 20+ |
| **Framework** | Express 5 |
| **Database** | MongoDB 7 (Mongoose) |
| **Cache** | Redis 7 (ioredis) |
| **Real-time** | Socket.IO 4 |
| **Media** | Cloudinary |
| **Auth** | JWT, Passport.js, bcrypt |
| **Email** | Nodemailer (Gmail / SMTP) |
| **SMS** | Greenweb BD, BulkSMS BD, AlphaSMS |
| **WhatsApp** | UltraMsg, Green API, CallMeBot |
| **Payments** | SSLCommerz, AamarPay, ShurjoPay |
| **Couriers** | Steadfast, Pathao, RedX |
| **PDF** | PDFKit |
| **Testing** | Jest, Supertest, mongodb-memory-server |
| **DevOps** | Docker, Docker Compose |

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- MongoDB Atlas account (or local MongoDB)
- Cloudinary account
- Gmail with App Password enabled

### Local Setup

```bash
# 1. Clone the repository
git clone https://github.com/your-org/eonlinebazar-fullstack.git
cd eonlinebazar-fullstack

# 2. Copy environment template
cp .env.example .env

# 3. Fill in required values (see Environment Variables section)
# 4. Install dependencies
npm install

# 5. Start the server
node server.js

# 6. Open in browser
# http://localhost:5000
```

### Docker Setup

```bash
docker-compose up --build
```

Includes MongoDB 7 and Redis 7 automatically. The app reads configuration from `.env`.

### Run Tests

```bash
npm test
```

**Expected output:** 19 passed, 5 suites

### Health Check

```http
GET http://localhost:5000/api/store/health
```

---

## 🔑 Environment Variables

Copy `.env.example` and fill in your values. See `.env.example` for full documentation with inline comments.

### Required (app won't start without these)

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | 64-character random signing secret |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password / app password |
| `PORT` | Server port (default `5000`) |

### Payment Gateways (fill when going live)

| Variable | Gateway |
|----------|---------|
| `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWORD` | SSLCommerz |
| `AAMARPAY_STORE_ID`, `AAMARPAY_SIGNATURE_KEY` | AamarPay |
| `SHURJOPAY_USERNAME`, `SHURJOPAY_PASSWORD` | ShurjoPay |

Set `*_IS_LIVE=true` for each gateway when switching to production.

### Courier APIs

| Variable | Courier |
|----------|---------|
| `STEADFAST_API_KEY`, `STEADFAST_API_SECRET` | Steadfast |
| `PATHAO_CLIENT_ID`, `PATHAO_CLIENT_SECRET`, `PATHAO_STORE_ID` | Pathao |
| `REDX_API_TOKEN` | RedX |

### Optional but Recommended

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth login |
| `REDIS_URL` | Caching — app works without it (graceful degradation) |
| `SESSION_SECRET` | Required if using Google OAuth |
| `PAYMENT_CREDENTIAL_ENCRYPTION_KEY` | AES-256-GCM for stored payment credentials |
| `LOW_STOCK_ALERT_ENABLED` | Enable automated low-stock cron alerts |

---

## 📁 Project Structure

```
eonlinebazar-fullstack/
├── client/                      # Storefront & admin UI (HTML / CSS / Vanilla JS)
│   ├── css/                     # Page stylesheets
│   ├── js/                      # Frontend logic (cart, checkout, admin, PWA, i18n)
│   ├── images/                  # Product placeholders, payment logos, branding
│   ├── partials/                # Reusable HTML fragments
│   ├── products/                # Static product assets
│   └── uploads/                 # Local branding uploads
├── config/
│   ├── db.js                    # MongoDB connection
│   ├── passport.js              # Google OAuth strategy
│   └── permissions.js           # Admin RBAC permission map
├── controllers/                 # 30 route handlers (MVC)
├── middleware/
│   └── securityMiddleware.js    # Helmet, rate limits, sanitization
├── middlewares/
│   ├── authMiddleware.js        # JWT verification
│   ├── adminSecurity.js         # Admin session & 2FA guards
│   ├── geoFencing.js            # Country-based access control
│   ├── rbac.js                  # Role-based access control
│   ├── storeSettingsMiddleware.js
│   └── uploadMiddleware.js      # Multer + Cloudinary uploads
├── models/                      # 25 Mongoose schemas
├── public/                      # Static files served at root
│   ├── images/                  # PWA icons, OG image, payment logos
│   ├── js/                      # Shared i18n bundle
│   ├── uploads/                 # Public upload directory
│   ├── 404.html                 # Bengali 404 page
│   └── service-worker.js        # PWA offline cache
├── routes/                      # 20 Express route modules
├── scripts/
│   ├── generate-pwa-icons.js
│   └── generate-payment-pngs.js
├── tests/                       # Jest smoke tests (5 suites, 19 tests)
│   ├── app.js                   # Test Express app (no listen)
│   ├── setup.js                 # In-memory MongoDB helpers
│   ├── auth.test.js
│   ├── cart.test.js
│   ├── order.test.js
│   ├── payment.test.js
│   └── admin.test.js
├── utils/                       # Business logic & integrations (40+ modules)
│   ├── validateEnv.js           # Boot-time env validation
│   ├── cacheService.js          # Redis caching layer
│   ├── courierService.js        # Pathao, RedX, Steadfast
│   ├── paymentGatewayAdapters.js
│   ├── socketService.js         # Socket.IO notifications
│   ├── mailer.js                # Nodemailer
│   ├── whatsappService.js
│   ├── invoicePdf.js            # PDFKit invoice generation
│   ├── bulkImportService.js     # CSV / Excel product import
│   ├── seoHelper.js             # Meta tags & structured data
│   └── cryptoVault.js           # AES-256-GCM credential encryption
├── docker-compose.yml           # App + MongoDB + Redis
├── docker-compose.prod.yml      # Production overrides
├── Dockerfile
├── server.js                    # Entry point
├── seed.js                      # Database seeder
└── package.json
```

---

## 🔒 Security Features

- **Boot-time validation** — server refuses to start if required secrets are missing (`utils/validateEnv.js`)
- **JWT with embedded session ID** — remote logout works across devices
- **Admin 2FA** — TOTP (Google Authenticator) + Email OTP + SMS OTP
- **Geo-fencing** — restrict admin login by country (BD default)
- **Brute-force protection** — 5 failed attempts → 24h IP ban
- **Manual IP blacklist manager**
- **AES-256-GCM encryption** for stored payment credentials
- **NoSQL injection protection** (express-mongo-sanitize)
- **XSS protection** (custom sanitizer, Express 5 compatible)
- **HTTP parameter pollution protection** (hpp)
- **Rate limiting**
  - General API: 200 requests / 15 min
  - Auth: 10 requests / 15 min
  - Coupon: 5 requests / min
  - Order creation: 3 requests / min

---

## 🧪 Test Coverage

19 smoke tests across 5 suites — all use in-memory MongoDB (`mongodb-memory-server`). No real database, email, or Cloudinary calls during tests.

| Suite | File | Tests | Coverage |
|-------|------|-------|----------|
| Auth | `tests/auth.test.js` | 6 | Register, login, email verify |
| Cart | `tests/cart.test.js` | 3 | Add, get, clear cart |
| Order | `tests/order.test.js` | 4 | Create, get, track, cancel |
| Payment | `tests/payment.test.js` | 3 | Gateway config, IPN, admin update |
| Admin | `tests/admin.test.js` | 3 | Login, orders list, status update |

```bash
npm test
# Test Suites: 5 passed, 5 total
# Tests:       19 passed, 19 total
```

---

## 🚢 Deployment (Render)

1. Push your repository to GitHub
2. Create a new **Web Service** on [Render](https://render.com)
3. **Build Command:** `npm install`
4. **Start Command:** `node server.js`
5. Add all environment variables from `.env.example`
6. Deploy

For containerized deployment, use the included `Dockerfile` and `docker-compose.prod.yml`.

---

## ✅ Pre-Launch Checklist

- [ ] Fill all `.env` values with production credentials
- [ ] Set `NODE_ENV=production`
- [ ] Set `*_IS_LIVE=true` for payment gateways
- [ ] Replace `public/images/icons/` with branded PWA icons (512×512)
- [ ] Replace `public/images/og-default.jpg` with branded 1200×630 image
- [ ] Set up Google OAuth credentials in Google Cloud Console
- [ ] Configure `FRONTEND_URL` to your production domain
- [ ] Test a complete order flow end-to-end
- [ ] Enable `LOW_STOCK_ALERT_ENABLED=true`
- [ ] Set `REQUIRE_EMAIL_VERIFICATION=true`

---

## 📊 Project Status

| Phase | Description | Status |
|-------|-------------|--------|
| **Phase 1** | Security, JWT, email verify, payment gateways, tests | ✅ Complete |
| **Phase 2** | Courier APIs, payment proof, stock alerts, 404 page | ✅ Complete |
| **Phase 3** | Search filters, bulk import, Redis, OAuth, SEO | ✅ Complete |
| **Phase 4** | WebSocket, PWA, i18n, newsletter system | ✅ Complete |

**Overall: ~98% production-ready**

Remaining: API keys configuration + branded assets + go-live testing

---

## 👤 Admin Access

| Page | URL |
|------|-----|
| Admin Panel | `/admin` |
| Finance Dashboard | `/finance-analytics` |
| Payment Reconciliation | `/admin/payment-reconciliation` |
| Health Check | `/api/store/health` |

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">
  Built for Bangladesh 🇧🇩 · EOnlineBazar © 2026
</p>
