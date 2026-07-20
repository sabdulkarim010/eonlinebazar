<div align="center">

# 🛒 EOnlineBazar

### A Full-Stack, Security-Hardened E-Commerce Platform

*A complete MERN-style online marketplace featuring JWT authentication, a multi-layered admin security suite (Email / Google Authenticator / SMS 2FA + Geo-Fencing), real-time device & session tracking, an enterprise catalog engine (Categories, Brands, Attributes, Coupons), custom store branding, and a finance analytics dashboard.*

![Node.js](https://img.shields.io/badge/Node.js-Backend-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)
![JWT](https://img.shields.io/badge/Auth-JWT-FB015B?logo=jsonwebtokens&logoColor=white)
![2FA](https://img.shields.io/badge/2FA-Email%20%7C%20TOTP%20%7C%20SMS-6f42c1?logo=googleauthenticator&logoColor=white)
![Cloudinary](https://img.shields.io/badge/Media-Cloudinary-3448C5?logo=cloudinary&logoColor=white)
![SweetAlert2](https://img.shields.io/badge/UX-SweetAlert2-7952B3?logo=sweetalert&logoColor=white)
![License](https://img.shields.io/badge/License-ISC-blue)

![Version](https://img.shields.io/badge/Version-3.0.0-success)
![Security Suite](https://img.shields.io/badge/Admin%20Security-Fortified-critical)
![Status](https://img.shields.io/badge/Status-Production%20Ready-brightgreen)
![Maintained](https://img.shields.io/badge/Maintained-Yes-blue)

</div>

---

## 📑 Table of Contents

- [Overview](#-overview)
- [What's New — v3.0.0](#-whats-new--v300-the-fortified-security--branding-release)
- [Feature Roadmap (Past & Present)](#-feature-roadmap-past--present)
- [Tech Stack](#-tech-stack)
- [Project Architecture & File Structure](#-project-architecture--file-structure)
- [Environment Variables (.env)](#-environment-variables-env)
- [Installation & Production Readiness](#-installation--production-readiness)
- [API Documentation](#-api-documentation)
- [Security Architecture](#-security-architecture)
- [Buying Price & Profit Model](#-buying-price--profit-model)
- [Changelog](#-changelog)
- [Author](#-author)

---

## 📖 Overview

**EOnlineBazar** is a production-ready, full-stack e-commerce platform built on **Node.js / Express 5** with a **MongoDB (Atlas)** database and a lightweight **Vanilla JavaScript** frontend served directly by Express. It follows a clean **MVC architecture** (`Models → Controllers → Routes`) and ships with everything a modern online store needs: secure customer authentication, a shopping cart, a persistent **My Wishlist**, order placement & live tracking, product reviews with image uploads, a loyalty wallet, an enterprise catalog engine, a dedicated **Super Admin Panel**, and a **Finance & Analytics** dashboard.

Two things set it apart:

1. **A database-backed session security layer** — every login (customer *and* admin) generates a unique session embedded inside the JWT, so users and admins can view all their **active devices** (IP, geo-location, browser & device) and **remotely log out** any device in real time.
2. **A Fortified Admin Security Suite** — multi-option Two-Factor Authentication (**Email OTP**, **Google Authenticator / TOTP**, and **SMS OTP**), **Geo-Fencing (Region Lock)**, brute-force **auto IP-blacklisting**, rate-limiting, and a full login-history / security-audit trail.

---

## 🆕 What's New — v3.0.0 (The Fortified Security & Branding Release)

This release transforms the admin surface into an **enterprise IAM-grade** control plane and introduces full store personalization.

### 🔐 Multi-Layered Two-Factor Authentication (2FA)
| Method | How it works | Powered by |
|--------|--------------|------------|
| **📧 Email OTP** | Hashed 6-digit code emailed on login (5-min expiry) | `nodemailer` (SMTP) |
| **📱 Google Authenticator (TOTP)** | Scan a QR code once, then use time-based codes with ±30s drift tolerance | `speakeasy` + `qrcode` |
| **✉️ SMS OTP** | 6-digit code delivered through a pluggable SMS gateway (console fallback in dev) | `utils/smsSender.js` |

Admins pick and switch their preferred method from the settings panel; self-service **setup + verify** flows exist for both TOTP and SMS.

### 🌍 Admin Login Region Lock (Geo-Fencing)
- Resolves the login IP → ISO country code **offline** via `geoip-lite`.
- Rejects logins (**HTTP 403**) *before any credential check* if the origin country is not in the `ALLOWED_COUNTRIES` allow-list (e.g. `BD`, `SA`).
- Developer-friendly `GEO_ALLOW_PRIVATE` bypass for localhost / LAN.

### 🎨 Custom Store Branding & Platform Settings
- **Live server-side upload** of **Store Logo** and **Favicon** to Cloudinary with **instant dynamic previews** (old assets auto-purged).
- **Custom currency formatting** — configure a Currency **Code** (e.g. `BDT`) and **Symbol** (e.g. `৳`) applied across all admin price displays.
- **Timezone Synchronization** — the admin dashboard header's **live digital clock** re-renders in the selected timezone in real time.

### 🔒 Session & Audit Hardening
- Full admin **session/device tracking** with "This Device" highlighting and remote logout.
- Secure **cookie handling** on logout (`adminToken` / `token` cleared server-side).
- Complete **login history**, **failed-attempt**, and **security event** audit feeds.

> 📌 See the full [Changelog](#-changelog) for a versioned breakdown.

---

## 🗺️ Feature Roadmap (Past & Present)

### 🛍️ Core E-Commerce Modules

#### Catalog Management Engine
- **📂 Categories** — Full CRUD; renaming a category **syncs all linked products** automatically.
- **🏷️ Brands** — Full CRUD with a clean grid layout, automatic **slug generation** (Unicode/Bengali-aware), and strict product-to-brand **database references**.
- **🎛️ Attributes (Variants)** — Professional variation system (**Size**, **Color**, **Material**…) with per-variant **SKU, price & separate stock tracking**.
- **🎟️ Coupons & Discounts** — Enterprise promo engine (Shopify/Daraz-style):
  - Percentage **or** flat discounts, optional **max-discount cap**.
  - **Min order amount**, **global usage limit**, **per-user limit**, and **expiry date**.
  - Race-safe **atomic redemption** (`usedCount`) — usage is claimed on successful order placement, released on failure.
  - Storefront **apply / validate** endpoint with optional customer auth for per-user enforcement.

#### Product & Order Systems
- **🛍️ Product Catalog** — Up to 10 images, categories, brand, variations, highlights, stock levels, **selling price + buying price** (live profit preview), and detailed descriptions.
- **📦 Order Management & Tracking** — Place orders, view history, public order tracking, and per-item **buying-price snapshots** at checkout for accurate profit reporting.
- **🛒 Shopping Cart** — Server-synced cart with quantity updates, selection toggles, guest-cart merge, and post-order cleanup.
- **⭐ Reviews & Ratings** — Star ratings and reviews with optional photo upload; averages update automatically.
- **📍 Address Book** — Manage multiple delivery addresses with default-address sync.
- **💰 Wallet & Loyalty Points** — Convert points to wallet balance (100 points = ৳10) with transaction history.

#### ❤️ My Wishlist

A fully implemented customer favourites system with MongoDB-backed persistence and seamless AJAX interactions across the storefront and profile dashboard.

- **Persistent Storage** — Wishlist items are saved persistently in MongoDB as an embedded array on the user's account (`User.wishlist`), linked to their profile. Favourites remain intact after placing orders, logging out, or starting a new session — items are only removed when the customer explicitly deletes them.
- **AJAX-powered Toggle** — Storefront product grids (home, search, etc.) use a sleek client-side **Fetch API** integration: clicking the heart icon calls `POST /api/wishlist/toggle` to add or remove items dynamically, with instant visual feedback and custom Toast notifications — no hard page refreshes required.
- **Unified Profile Integration** — The **My Wishlist** panel is fully integrated into the Customer Profile dashboard (`/profile` → **My Cart** tab). Each item ships with a functional **blue Cart button** (adds straight to the active cart summary via `/api/cart/add`) and a **red Delete button** that removes the item instantly from the DOM after a successful toggle, backed by custom Toast success/error feedback.
- **Optimized Mini-Card UI** — Wishlist items render in a compact, scaled-down **premium mini-card grid** (`wishlist-grid` / `wishlist-card`) with responsive breakpoints, designed for high visual consistency with the rest of the customer dashboard styling.

### 🛡️ Advanced Security Suite (Recent Updates)
- **Multi-layered Two-Factor Authentication** — Email OTP, Google Authenticator / TOTP, and SMS OTP (console gateway with Twilio/custom hooks ready).
- **Admin Login Region Lock (Geo-Fencing)** — permitted-country allow-list (`BD`, `SA`, …) enforced offline before credentials are checked.
- **Brute-Force Protection & Auto IP-Blacklisting** — `express-rate-limit` throttle + an Intrusion-Detection engine that bans an IP for 24h after 5 failed attempts in 15 minutes.
- **Manual IP Blacklist Manager** — list / block / unblock IPs (auto vs manual source, TTL-expiring).
- **Active Devices & Sessions** — IP, geo-location, OS/Browser/Device tracking with remote termination and **secure session/cookie logs**.
- **Security & Audit Dashboard** — login history, failed/blocked attempts, and a full security event trail.

### ⚙️ Admin & Platform Settings
- **Custom Store Branding** — live server-side Logo & Favicon upload with instant dynamic previews (Cloudinary).
- **Custom Currency Formatting** — Currency Code (`BDT`) & Symbol (`৳`) applied to every admin price column.
- **Timezone Synchronization** — dynamically updates the admin dashboard header's **live digital clock**.
- **Account & Profile** — username/password change (current-password gated), display name, store name, and admin avatar upload.

### 🖥️ Super Admin Panel (`/admin`)
- **📊 Dashboard Overview** — Live metrics (total/verified/pending/blocked users) and a **6-month registration growth chart** (Chart.js).
- **👥 Customer Management** — View, edit, block, suspend, reactivate; order-count badges; per-customer order history modal.
- **📦 Live Orders** — Real-time table with status updates, invoice view/print, search, filter, and pagination.
- **🛍️ Product CRUD** — Add/edit with images, buying/selling price, live profit preview, bulk delete, CSV export, and print-ready tables.
- **🔔 Professional UX** — SweetAlert2 toasts + modal confirmations, asynchronous DOM re-rendering (instant UI sync, no manual refresh).

### 💹 Finance & Analytics (`/finance-analytics`)
- Secure password gate (`ADMIN_DASHBOARD_PASSWORD`) with a dedicated finance token (also accepts an admin JWT).
- KPIs: Total Revenue, Net Profit, Daily/Monthly Profit, Avg. Order Value, Profit Margin.
- Charts: 12-month Revenue vs Profit (line) and Top Selling Categories (pie).

### 🌐 Platform
- **Clean URLs** — Automatic `.html` stripping and 301 redirects for SEO-friendly routes.
- **Server-side page guards** for the finance dashboard and 2FA handoff page.

---

## 🧰 Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript, Chart.js, Toastr, SweetAlert2 |
| **Backend** | Node.js, Express.js 5 |
| **Database** | MongoDB (Atlas) via Mongoose ODM |
| **Authentication** | JSON Web Tokens (`jsonwebtoken`), `bcryptjs` |
| **2FA** | `speakeasy` (TOTP), `qrcode` (QR generation), `nodemailer` (Email OTP), SMS gateway abstraction |
| **Security & Intelligence** | `express-rate-limit`, `geoip-lite` (geo-fencing + geo-location), `request-ip`, `ua-parser-js` |
| **File / Media** | `multer`, `sharp`, `cloudinary`, `streamifier` |
| **Config** | `dotenv` |

### Core Dependencies

```json
"bcryptjs"           "cloudinary"        "dotenv"        "express"
"express-rate-limit" "geoip-lite"        "jsonwebtoken"  "mongoose"
"multer"             "nodemailer"        "qrcode"        "request-ip"
"sharp"              "speakeasy"         "streamifier"   "ua-parser-js"
```

---

## 📁 Project Architecture & File Structure

A clean **MVC** backend paired with a static, Express-served frontend:

```
eonlinebazar-fullstack/
│
├── config/
│   └── db.js                          # MongoDB (Atlas) connection
│
├── models/                            # Mongoose schemas (data layer)
│   ├── user.js                        # Customer + addresses, embedded wishlist[], wallet, accountStatus
│   ├── wishlist.js                    # Wishlist item subdocument schema (productId, name, price, image…)
│   ├── userSession.js                 # Active customer device / login sessions
│   ├── admin.js                       # Admin account, 2FA config & platform settings (currency, timezone, branding)
│   ├── adminSession.js                # Active admin device / login sessions
│   ├── loginAttempt.js                # Login history & failed/blocked attempt audit
│   ├── blacklistedIp.js               # Auto + manual IP bans (TTL-expiring)
│   ├── securityLog.js                 # Admin/customer security & auth event log
│   ├── product.js                     # Products (images, buyingPrice, variations, reviews)
│   ├── category.js                    # Product categories
│   ├── brand.js                       # Product brands (slug + product references)
│   ├── attribute.js                   # Product attributes / variants (Size, Color…)
│   ├── coupon.js                      # Coupons & discounts (usage limits, per-user tracking)
│   ├── order.js                       # Orders with buyingPrice snapshots per line item
│   ├── cart.js                        # Shopping cart
│   └── review.js                      # Product reviews & ratings
│
├── controllers/                       # Business logic (controller layer)
│   ├── authController.js              # Customer session list / revoke / logout-others
│   ├── userController.js              # Customer auth, profile, wishlist CRUD, addresses, wallet
│   ├── wishlistController.js          # Wishlist toggle (add/remove) with product snapshot enrichment
│   ├── adminController.js             # Admin customers, settings, branding, logs, profile
│   ├── adminSecurityController.js     # 2-step login, admin sessions, IP blacklist, login history
│   ├── twoFactorController.js         # Self-service 2FA manager (Email / TOTP / SMS)
│   ├── productController.js           # Product CRUD + reviews
│   ├── brandController.js             # Brand CRUD + slug generation
│   ├── attributeController.js         # Attribute / variant CRUD
│   ├── couponController.js            # Coupon CRUD + storefront apply/validate/redeem
│   ├── orderController.js             # Orders, tracking, buyingPrice snapshots
│   ├── cartController.js              # Cart operations
│   ├── reviewController.js            # Review system
│   └── financeController.js           # Revenue, profit & chart analytics
│
├── routes/                            # Express route definitions (routing layer)
│   ├── authRoutes.js                  # /api/auth
│   ├── userRoutes.js                  # /api/customer (+ wishlist GET/POST/DELETE)
│   ├── wishlistRoutes.js              # /api/wishlist (toggle endpoint)
│   ├── adminRoutes.js                 # /api/admin (+ 2FA, sessions, blacklist)
│   ├── productRoutes.js               # /api/products
│   ├── categoryRoutes.js              # /api/categories (handler logic inline)
│   ├── brandRoutes.js                 # /api/brands
│   ├── attributeRoutes.js            # /api/attributes
│   ├── couponRoutes.js                # /api/coupons
│   ├── orderRoutes.js                 # /api/orders
│   ├── cartRoutes.js                  # /api/cart
│   ├── reviewRoutes.js                # /api/reviews
│   └── financeRoutes.js              # /api/finance
│
├── middlewares/                       # Cross-cutting request pipeline
│   ├── authMiddleware.js              # verifyUser (session-aware) & verifyAdmin (role JWT)
│   ├── adminSecurity.js               # checkBlacklist gate, rate limiter, intrusion detection
│   ├── geoFencing.js                  # Admin login Region Lock (geoip-lite)
│   └── uploadMiddleware.js            # Multer + Cloudinary stream upload (5 MB images)
│
├── utils/                             # Shared helpers
│   ├── deviceParser.js                # Client IP + geo-location + User-Agent fingerprinting
│   ├── mailer.js                      # SMTP transport + branded 2FA OTP email template
│   ├── smsSender.js                   # SMS 2FA delivery abstraction (console/Twilio/custom)
│   └── securityLogger.js             # Fire-and-forget security event writer
│
├── client/                            # Static frontend (served by Express)
│   ├── index.html                     # Storefront home
│   ├── login.html / register.html     # Customer auth
│   ├── forgot-password.html           # OTP password reset
│   ├── product-details.html           # Product detail + reviews
│   ├── search.html                    # Search results (?q=)
│   ├── cart.html / checkout.html      # Cart & checkout flow
│   ├── payment.html                   # Payment page
│   ├── profile.html                   # Customer dashboard (cart, wishlist, wallet, addresses, sessions)
│   ├── order-track.html / order-details.html
│   ├── about.html / contact.html / footer.html
│   ├── admin-login.html               # Admin authentication
│   ├── verify-otp.html                # 2-Step Verification (Email / TOTP / SMS)
│   ├── admin.html                     # Super Admin panel (SPA)
│   ├── finance-login.html             # Finance password gate
│   ├── finance-analytics.html         # Finance & analytics dashboard
│   ├── css/                           # Page-scoped stylesheets (admin.css, verify-otp.css…)
│   ├── js/                            # Page scripts (admin.js, wishlist.js, profile.js, session-guard.js…)
│   └── images/                        # Static assets (favicon.png…)
│
├── server.js                          # App entry: middleware, routes, clean URLs, page guards
├── seed.js                            # Database seeding
├── products.json                      # Sample product data
├── package.json
└── README.md
```

---

## 🔑 Environment Variables (.env)

Create a `.env` file in the project root. **Never commit this file** — add it to `.gitignore`.

```env
# ===============================================================
# 🌐 SERVER
# ===============================================================
PORT=3000

# ===============================================================
# 🗄️ DATABASE (MongoDB Atlas)
# ===============================================================
MONGO_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/eonlinebazar?retryWrites=true&w=majority

# ===============================================================
# 🔐 AUTHENTICATION & ADMIN BOOTSTRAP
# ===============================================================
JWT_SECRET=your_strong_random_secret_key
# First login with username "admin" + this password auto-creates the admin account
ADMIN_PASSWORD=your_admin_password
# Password gate for the Finance & Analytics dashboard
ADMIN_DASHBOARD_PASSWORD=your_finance_dashboard_password
# Optional finance tuning:
# FINANCE_TOKEN_TTL=8h
# FINANCE_DEFAULT_COST_RATIO=0.70

# ===============================================================
# 🌍 GEO-FENCING (Admin Login Region Lock)
# Comma-separated ISO 3166-1 alpha-2 codes allowed to log in.
# BD = Bangladesh, SA = Saudi Arabia. Leave EMPTY to disable geo-fencing.
# ===============================================================
ALLOWED_COUNTRIES=BD,SA
# Allow logins from local/private IPs (dev machines) even when geo-fenced.
GEO_ALLOW_PRIVATE=true

# ===============================================================
# 📱 SMS 2FA GATEWAY
# SMS_PROVIDER = console | twilio | custom
#   console → OTP printed to the server terminal (default, dev-safe)
#   twilio  → uncomment creds below and enable in utils/smsSender.js
#   custom  → wire your local HTTP gateway in utils/smsSender.js
# ===============================================================
SMS_PROVIDER=console
SMS_SENDER_ID=EOBAZAR
# TWILIO_ACCOUNT_SID=
# TWILIO_AUTH_TOKEN=
# TWILIO_FROM_NUMBER=
# SMS_API_URL=
# SMS_API_KEY=

# ===============================================================
# 🔑 GOOGLE AUTHENTICATOR (TOTP)
# Issuer label shown inside the authenticator app
# ===============================================================
TOTP_ISSUER=EonlineBazar Admin

# ===============================================================
# 📧 EMAIL / SMTP (Email OTP + password reset)
# Use a Gmail App Password (not your normal password).
# SMTP_* takes priority; EMAIL_* is a backward-compatible fallback.
# Port 465 → implicit TLS · Port 587 → STARTTLS
# ===============================================================
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_gmail_app_password
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_gmail_app_password

# ===============================================================
# ☁️ CLOUDINARY (image / branding uploads)
# ===============================================================
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### Variable Reference

| Variable | Required | Purpose |
|----------|:--------:|---------|
| `PORT` | ⛔ | Server port (defaults to `3000`) |
| `MONGO_URI` | ✅ | MongoDB Atlas connection string |
| `JWT_SECRET` | ✅ | Secret used to sign/verify all JWTs |
| `ADMIN_PASSWORD` | ✅ | Bootstraps the first `admin` account |
| `ADMIN_DASHBOARD_PASSWORD` | ✅ | Finance dashboard password gate |
| `ALLOWED_COUNTRIES` | ⛔ | Geo-fence allow-list (empty = disabled) |
| `GEO_ALLOW_PRIVATE` | ⛔ | Permit localhost/LAN through geo-fence (dev) |
| `SMS_PROVIDER` | ⛔ | `console` (default) / `twilio` / `custom` |
| `SMS_SENDER_ID` | ⛔ | Sender label prepended to SMS body |
| `TOTP_ISSUER` | ⛔ | Label shown in Google Authenticator |
| `SMTP_HOST/PORT/USER/PASS` | ✅* | Email OTP & password-reset delivery |
| `EMAIL_USER/EMAIL_PASS` | ⛔ | Legacy SMTP fallback |
| `CLOUDINARY_*` | ✅ | Image, avatar & branding uploads |

> \* Without SMTP configured, Email OTPs are printed to the server terminal so login is never blocked.

---

## 🚀 Installation & Production Readiness

### Prerequisites
- **Node.js** v18+ and npm
- **MongoDB** (Atlas recommended)
- **Cloudinary** account (image + branding uploads)
- **Gmail** with an App Password (email OTP / password reset)

### 1. Clone & install dependencies

```bash
git clone https://github.com/<your-username>/eonlinebazar-fullstack.git
cd eonlinebazar-fullstack
npm install
```

`npm install` pulls the full stack, including the security-suite packages:

```bash
# Installed automatically via package.json — listed here for clarity:
npm install express mongoose dotenv jsonwebtoken bcryptjs \
  geoip-lite speakeasy qrcode nodemailer express-rate-limit \
  request-ip ua-parser-js cloudinary multer sharp streamifier
```

### 2. Configure environment variables

Create your `.env` file using the [template above](#-environment-variables-env).

### 3. (Optional) Seed the database

```bash
node seed.js
```

### 4. Run the development server

```bash
node server.js
```

The app runs at **http://localhost:3000**.

> 💡 For auto-reload during development:
> ```bash
> npm i -D nodemon
> npx nodemon server.js
> ```

### 5. Production deployment checklist

- [ ] Set a strong, unique `JWT_SECRET` and rotate default admin passwords.
- [ ] Restrict `ALLOWED_COUNTRIES` and set `GEO_ALLOW_PRIVATE=false`.
- [ ] Configure a real SMS provider (`SMS_PROVIDER=twilio` or `custom`) if using SMS 2FA.
- [ ] Configure production SMTP credentials for reliable email OTP delivery.
- [ ] Ensure `trust proxy` works behind your CDN/reverse proxy (already enabled in `server.js`).
- [ ] Serve over **HTTPS** so secure cookies and 2FA flows behave correctly.
- [ ] Harden the currently-open order routes with `verifyAdmin` (see API notes).
- [ ] Use a process manager (e.g. **PM2**) or containerize for zero-downtime restarts:
  ```bash
  npm i -g pm2
  pm2 start server.js --name eonlinebazar
  ```

| Page | URL |
|------|-----|
| Storefront | `/` |
| Customer login | `/login` |
| Admin login | `/admin-login` (alias `/admin/login`) |
| 2-Step Verification | `/admin/verify-otp` |
| Admin panel | `/admin` (alias `/admin/dashboard`) |
| Finance dashboard | `/finance-analytics` (alias `/admin/finance`) |

---

## 🔌 API Documentation

Base URL: `http://localhost:3000`

> **Auth legend:** `Public` · `User` = customer Bearer JWT (`verifyUser`) · `Admin` = admin Bearer JWT (`verifyAdmin`) · `Finance` = finance session token

### 🔑 Authentication & Sessions

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/customer/register` | Register & send verification email | Public |
| `POST` | `/api/customer/login` | Log in, create session & issue JWT | Public |
| `POST` | `/api/customer/forgot-password` | Send password-reset OTP | Public |
| `POST` | `/api/customer/reset-password` | Reset password with OTP | Public |
| `GET`  | `/api/auth/sessions` | List active devices (flags current) | User |
| `DELETE` | `/api/auth/sessions/:id` | Remotely log out a device | User |
| `POST` | `/api/auth/sessions/logout-others` | Log out all other devices | User |

### 👤 Profile, Wishlist & Addresses

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET`  | `/api/customer/profile` | Get profile | User |
| `PUT`  | `/api/customer/update-profile` | Update name / phone / address | User |
| `PUT`  | `/api/customer/change-password` | Change password | User |
| `POST` | `/api/customer/update-avatar` | Upload avatar (Cloudinary) | User |
| `POST` | `/api/customer/convert-points` | Convert loyalty points to wallet | User |
| `GET`  | `/api/customer/wishlist` | List saved wishlist items | User |
| `POST` | `/api/customer/wishlist` | Add item to wishlist | User |
| `DELETE` | `/api/customer/wishlist/:productId` | Remove item from wishlist | User |
| `POST` | `/api/wishlist/toggle` | AJAX heart-icon toggle (add/remove with product snapshot) | User |
| `GET/POST/PUT/DELETE` | `/api/customer/addresses` | Address book CRUD | User |

### 🛍️ Products & Reviews

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET`  | `/api/products` | List all products | Public |
| `GET`  | `/api/products/:id` | Get single product | Public |
| `POST` | `/api/products` | Create product (up to 10 images) | Admin |
| `PUT`  | `/api/products/:id` | Update product | Admin |
| `DELETE` | `/api/products/:id` | Delete product | Admin |
| `GET`  | `/api/reviews/:productId` | Get product reviews | Public |
| `POST` | `/api/reviews` | Add/update review (with photo) | User |

### 🛒 Cart & 📦 Orders

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET`  | `/api/cart` | Get cart | User |
| `POST` | `/api/cart/add` | Add item | User |
| `PUT`  | `/api/cart/update-quantity` | Update quantity | User |
| `PUT`  | `/api/cart/toggle-selection` | Select / unselect item | User |
| `DELETE` | `/api/cart/remove/:productId` | Remove item | User |
| `POST` | `/api/cart/merge` | Merge guest cart | User |
| `DELETE` | `/api/cart/clear-ordered` | Clear checked-out items | User |
| `POST` | `/api/orders` | Place order (snapshots `buyingPrice`, redeems coupon) | User |
| `GET`  | `/api/orders/my-orders` | User's order history | User |
| `GET`  | `/api/orders/track` | Public order tracking | Public |
| `GET`  | `/api/orders/:id` | Single order details | User |
| `GET`  | `/api/orders` | All orders (admin panel) | Public¹ |
| `PUT`  | `/api/orders/:id` | Update order status | Public¹ |
| `DELETE` | `/api/orders/:id` | Delete order | Public¹ |

### 🗂️ Catalog — Categories, Brands, Attributes

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET`  | `/api/categories` | List categories | Public |
| `POST` | `/api/categories` | Create category | Admin |
| `PUT`  | `/api/categories/:id` | Rename (syncs linked products) | Admin |
| `DELETE` | `/api/categories/:id` | Delete category | Admin |
| `GET`  | `/api/brands` | List brands | Public |
| `POST` | `/api/brands` | Create brand (auto slug) | Admin |
| `PUT`  | `/api/brands/:id` | Update brand | Admin |
| `DELETE` | `/api/brands/:id` | Delete brand | Admin |
| `GET`  | `/api/attributes` | List attributes | Public |
| `POST` | `/api/attributes` | Create attribute | Admin |
| `PUT`  | `/api/attributes/:id` | Update attribute | Admin |
| `DELETE` | `/api/attributes/:id` | Delete attribute | Admin |

### 🎟️ Coupons

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/coupons/apply` | Validate coupon & return price breakdown | Public/User² |
| `GET`  | `/api/coupons` | List coupons | Admin |
| `GET`  | `/api/coupons/:id` | Get single coupon | Admin |
| `POST` | `/api/coupons` | Create coupon | Admin |
| `PUT`  | `/api/coupons/:id` | Update coupon | Admin |
| `PATCH` | `/api/coupons/:id/toggle` | Activate / deactivate coupon | Admin |
| `DELETE` | `/api/coupons/:id` | Delete coupon | Admin |

### 🔐 Admin Authentication & 2FA

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/admin/login` | **Step 1** — verify credentials behind blacklist → geo-fence → rate-limit, then dispatch the selected 2FA challenge | Public |
| `POST` | `/api/admin/verify-otp` | **Step 2** — verify Email/SMS OTP or TOTP, issue 24h JWT + create `AdminSession` | Public |
| `GET`  | `/api/admin/verify-token` | Validate admin JWT on panel load | Admin |
| `GET`  | `/api/admin/2fa/status` | Current 2FA config (method, masked email/phone) | Admin |
| `POST` | `/api/admin/2fa/totp/setup` | Generate TOTP secret + QR code | Admin |
| `POST` | `/api/admin/2fa/totp/verify` | Confirm scan & activate Google Authenticator | Admin |
| `POST` | `/api/admin/2fa/totp/disable` | Remove TOTP (revert to Email OTP) | Admin |
| `POST` | `/api/admin/2fa/sms/send` | Save phone & send SMS setup code | Admin |
| `POST` | `/api/admin/2fa/sms/verify` | Confirm SMS code & activate SMS 2FA | Admin |
| `PUT`  | `/api/admin/2fa/method` | Choose active method (`email`/`totp`/`sms`) | Admin |
| `POST` | `/api/admin/logout` | Revoke current session + clear cookies | Admin |

### 🖥️ Admin Sessions, Blacklist & Audit

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET`  | `/api/admin/sessions` | List active admin devices (flags "This Device") | Admin |
| `POST` | `/api/admin/sessions/logout/:id` | Remotely terminate a device session | Admin |
| `POST` | `/api/admin/sessions/logout-others` | Log out all other admin devices | Admin |
| `GET`  | `/api/admin/blacklist` | List blocked IPs (auto + manual) | Admin |
| `POST` | `/api/admin/blacklist` | Manually blacklist an IP (`{ ip, reason, hours }`) | Admin |
| `DELETE` | `/api/admin/blacklist/:id` | Unblock an IP (by id or address) | Admin |
| `GET`  | `/api/admin/login-history` | Login history & failed/blocked attempts feed | Admin |
| `GET`  | `/api/admin/logs` | Security & auth event logs | Admin |

### 🛠️ Admin — Customers & Platform Settings

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET`  | `/api/admin/customers` | List customers (includes `orderCount`) | Admin |
| `GET`  | `/api/admin/customers/:id` | Customer profile | Admin |
| `PUT`  | `/api/admin/customers/:id` | Edit customer | Admin |
| `PATCH` | `/api/admin/customers/:id/status` | Block / suspend / activate | Admin |
| `GET`  | `/api/admin/customers/:id/orders` | Customer order history | Admin |
| `GET`  | `/api/admin/settings` | Platform & profile settings | Admin |
| `PUT`  | `/api/admin/settings` | Save settings (currency, timezone… — current-password gated) | Admin |
| `POST` | `/api/admin/upload-branding` | Upload store logo or favicon (`assetType`) | Admin |
| `GET`  | `/api/admin/profile` | Admin profile image URL | Admin |
| `POST` | `/api/admin/update-profile-pic` | Upload admin avatar | Admin |

### 📊 Finance & Analytics

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/finance/admin-login` | Issue finance session token | Public |
| `GET`  | `/api/finance/overview` | Revenue, profit, margin KPIs | Finance |
| `GET`  | `/api/finance/chart-data` | 12-month charts & category breakdown | Finance |

> ¹ Order list/update/delete routes are currently unauthenticated at the route layer — harden with `verifyAdmin` for production.
> ² `/api/coupons/apply` uses optional customer auth: a valid Bearer token enables per-user limit enforcement; guests can still preview.
> **Customer account status:** `active` · `suspended` · `blocked` — suspended/blocked users cannot log in.

---

## 🛡️ Security Architecture

### Customer sessions (stateful JWT)
1. Login verifies password → creates `UserSession` (IP, geo, device, browser) → JWT embeds `id` + `sid` (7 days).
2. `verifyUser` checks JWT signature **and** session existence; revoked sessions return **401**.
3. Remote logout deletes the session record — instant invalidation on the next request.

### Admin authentication pipeline (defense-in-depth)

The admin login route runs a layered gate **before** the controller executes:

```
POST /api/admin/login
   → checkBlacklist   (403 if IP is banned)
   → geoFence         (403 if origin country ∉ ALLOWED_COUNTRIES)
   → adminLoginLimiter (429 if rate-limited)
   → controller       (verify credentials → dispatch 2FA challenge)
```

1. **Step 1** — credentials verified, then a 2FA challenge is dispatched for the admin's chosen method:
   - **Email** → hashed 6-digit OTP emailed (5-min epoch-ms expiry).
   - **SMS** → 6-digit OTP sent via the configured gateway (console fallback in dev).
   - **TOTP** → no code sent; admin reads the current code from Google Authenticator.
   A short-lived signed `otpToken` carries the chosen method into Step 2.
2. **Step 2** — `POST /api/admin/verify-otp` validates the code (`speakeasy.totp.verify` for TOTP, timezone-safe epoch-ms compare for Email/SMS), issues a **24h JWT** embedding a session id (`sid`), and creates an `AdminSession`.
3. `verifyAdmin` rejects customer tokens **and** validates the `AdminSession` (remote logout ⇒ instant 401 on the device's next request).

### 🌍 Geo-Fencing (Region Lock)
- `geoip-lite` resolves the login IP → alpha-2 country code **offline** (no external API call).
- Origin countries outside `ALLOWED_COUNTRIES` are blocked with **403** and recorded in the audit feed.
- Private/localhost IPs bypass the fence when `GEO_ALLOW_PRIVATE=true`; the middleware **fails open** on geoip errors so a glitch never locks admins out.

### 🔐 Multi-Option 2FA
- **Email OTP** — via `utils/mailer.js` (branded HTML template; console fallback if SMTP is down).
- **Google Authenticator (TOTP)** — `speakeasy` secret with a "scan QR → verify once" activation flow; pending secrets are never active until proven.
- **SMS OTP** — `utils/smsSender.js` abstraction: `console` (dev), `twilio`, or `custom` HTTP gateway — swappable via a single function.
- Secrets (`totpSecret`, `otp`, `smsSetupOtp`) are stored with `select: false` and never returned in normal queries.

### 🚨 Brute-Force Protection & Auto IP-Blacklisting
- `express-rate-limit` throttles the auth routes per-IP.
- The Intrusion-Detection engine bans an IP for **24h** after **5 failed attempts in 15 minutes** (`BlacklistedIP`, TTL-expiring).
- `checkBlacklist` returns **403** before any controller runs. Admins can also **manually** block/unblock IPs.

### 📋 Security logging & audit
Events written to `SecurityLog` (via `utils/securityLogger.js`) and `LoginAttempt` include:
- Admin login success/failure, OTP requested/failed, geo-blocks, and 2FA method/config changes.
- Customer login success/failure/blocked/suspended attempts.
- Admin customer edits & status changes; settings & branding updates; IP auto/manual bans.

Viewable in the admin panel under **Security & Audit** (Login History + IP Blacklist Manager) and **Security Logs**.

### Additional hardening
- Passwords: `bcryptjs` hashing. Trust-proxy enabled for accurate client IPs behind CDNs.
- Upload safety: images only, max 5 MB, memory storage → Cloudinary stream.
- Sensitive pages: `Cache-Control: no-store`; secure cookies cleared on logout.

---

## 💰 Buying Price & Profit Model

| Layer | Field | Purpose |
|-------|-------|---------|
| Product catalog | `buyingPrice` | Cost basis set by admin when creating/editing products |
| Order line item | `buyingPrice` (snapshot) | Frozen at checkout — profit stays accurate even if catalog price changes |
| Order document | `totalBuyingPrice` | Sum of line-item buying costs |
| Finance module | Computed profit | `(sellingPrice − buyingPrice) × qty` with fallbacks |
| Admin UI | Profit preview | Live margin badge on Manage Products & edit modal |

> **Net Profit logic:** `(sellingPrice − buyingPrice) × quantity` using the **buying-price snapshot** on each order line at checkout. Falls back to catalog `buyingPrice`, then `costPrice`, then `FINANCE_DEFAULT_COST_RATIO` (default `0.70`).

---

## 📜 Changelog

### `v3.0.0` — The Fortified Security & Branding Release
**🔐 Multi-Layered 2FA**
- Added **Google Authenticator / TOTP** (`speakeasy` + `qrcode`) with a scan-QR → verify activation flow.
- Added **SMS OTP** delivery via a pluggable gateway abstraction (`console` / Twilio / custom).
- Self-service 2FA manager: choose and switch between Email, TOTP, and SMS.

**🌍 Access Control & Hardening**
- **Geo-Fencing (Admin Region Lock)** via `geoip-lite` with an `ALLOWED_COUNTRIES` allow-list.
- **Auto IP-blacklisting** (intrusion detection) + manual IP blacklist manager.
- Full admin **session/device tracking**, remote logout, and secure cookie handling.
- **Login history**, failed-attempt, and security-audit dashboards.

**🎨 Branding & Platform Settings**
- Live **Store Logo & Favicon** upload with instant previews (Cloudinary).
- **Custom currency** (code + symbol) applied across the admin panel.
- **Timezone synchronization** driving the header's live digital clock.

**🎟️ Catalog**
- Enterprise **Coupon & Discount** engine with usage limits, per-user tracking, and race-safe redemption.

### `v2.0.0` — Admin Panel Enterprise Release
- Fixed the Finance panel infinite-loading loop; added asynchronous state/DOM re-rendering for instant UI updates.
- Integrated SweetAlert2 toasts & confirmations across all admin actions.
- New modules: **Manage Brands** (CRUD + slug + references) and **Manage Attributes/Variants** (per-variant SKU/price/stock).
- Add/Edit Product upgrades: brand dropdown + dynamic variation arrays.

### `v1.0.0` — Initial Release
- Full-stack storefront with JWT auth, session/device tracking, cart, orders, reviews, wallet, and profile dashboard.
- Super Admin Panel with dashboard metrics, customer management, live orders, product CRUD, and security logs.
- Finance & Analytics dashboard with revenue/profit KPIs and charts.

---

## 👤 Author

**Abdul Karim Sheikh**

---

<div align="center">

*Built with ❤️ using Node.js, Express & MongoDB.*

</div>


