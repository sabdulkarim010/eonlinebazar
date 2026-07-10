<div align="center">

# 🛒 EOnlineBazar

### A Full-Stack E-Commerce Web Application

*Shop smarter — a complete MERN-style online marketplace with JWT authentication, real-time active-device & session tracking, a customer profile dashboard, an enterprise admin panel, and a finance analytics module.*

![Node.js](https://img.shields.io/badge/Node.js-Backend-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)
![JWT](https://img.shields.io/badge/Auth-JWT-FB015B?logo=jsonwebtokens&logoColor=white)
![SweetAlert2](https://img.shields.io/badge/UX-SweetAlert2-7952B3?logo=sweetalert&logoColor=white)
![License](https://img.shields.io/badge/License-ISC-blue)

![Version](https://img.shields.io/badge/Version-2.0.0-success)
![Admin Panel](https://img.shields.io/badge/Admin%20Panel-Enterprise-orange)
![Status](https://img.shields.io/badge/Status-Production%20Ready-brightgreen)
![Maintained](https://img.shields.io/badge/Maintained-Yes-blue)

</div>

---

## 📖 Overview

**EOnlineBazar** is a production-ready, full-stack e-commerce platform built on **Node.js / Express** with a **MongoDB (Atlas)** database and a lightweight **Vanilla JavaScript** frontend. It follows a clean **MVC architecture** (Models → Controllers → Routes) and ships with everything a modern online store needs: secure customer authentication, a shopping cart, order placement & live tracking, product reviews with image uploads, a loyalty wallet, a dedicated **Super Admin Panel**, and a **Finance & Analytics** dashboard.

Its standout feature is a **database-backed session security layer**: every customer login generates a unique session embedded inside the JWT, allowing users to view all their **active devices** (IP, location, browser & device detection) and **remotely log out** any device in real time.

---

## 🆕 What's New — v2.0.0 (Admin Panel Enterprise Release)

This release ships a major overhaul of the **Super Admin Panel** with critical state-management fixes, real-time UI synchronization, and three brand-new enterprise catalog modules.

### 🐞 Core Bug Fixes & UX Upgrades

| Area | Improvement |
|------|-------------|
| **📊 Finance & Analytics Panel** | Resolved the **infinite loading loop** — optimized route rendering and streamlined data fetching so the dashboard mounts cleanly on first load. |
| **⚡ Real-time State Updates** | Implemented **asynchronous state/DOM re-rendering** for all product and live-order actions. Editing or deleting a product/order now updates the UI layout **instantly**, with no manual page refresh. |
| **🔔 Professional Alerts** | Integrated **SweetAlert2** feedback across every administrative action — success **toasts** for quick confirmations and **modal dialogs** for destructive operations. |
| **🎨 UI Layout Polish** | Re-positioned the **live clock** to the calendar header center and refined the **Manage Categories** table grid to eliminate text/icon overlapping. |

### 🚀 New Enterprise Modules

- **🏷️ Manage Brands** — Full **CRUD** with a clean grid layout, automatic **slug generation** (Unicode/Bengali-aware), and strict **database references** linking products to brands.
- **🎛️ Manage Attributes (Variants)** — A professional configuration system for product variations (e.g., **Size**, **Color**, **Material**) with per-variant **SKU, price & separate stock tracking**.
- **📝 Add / Edit Product Upgrades** — Form integration featuring a dedicated **Brand dropdown** and **dynamic variation arrays**, fully backward-compatible with existing products.

> 📌 See the full [Changelog](#-changelog) at the bottom for a versioned breakdown.

---

## ✨ Key Features

### Customer Storefront
- **🔐 JWT Authentication** — Registration & login with `bcryptjs` password hashing and 7-day signed tokens.
- **📧 Email Verification & OTP Password Reset** — Verification links and 6-digit OTP recovery via `nodemailer` (Gmail).
- **🖥️ Active Devices & Session Tracking** — Every login recorded in `UserSession` with IP, geo-location, browser, and device.
- **🚪 Remote Logout** — Revoke any device instantly; revoked sessions fail on the next request (forced logout).
- **🛍️ Product Catalog** — Multiple images, categories, highlights, stock levels, and detailed descriptions.
- **⭐ Reviews & Ratings** — Star ratings and reviews with optional photo upload; averages update automatically.
- **🛒 Shopping Cart** — Server-synced cart with quantity updates, selection toggles, guest-cart merge, and post-order cleanup.
- **📦 Order Management & Tracking** — Place orders, view history, and track status via a public lookup endpoint.
- **❤️ Wishlist** — Save favourites across sessions.
- **📍 Address Book** — Multiple delivery addresses with default-address sync for checkout.
- **💰 Wallet & Loyalty Points** — Convert points to wallet balance (100 points = ৳10) with transaction history.
- **👤 Profile Dashboard** — Update profile, change password, upload avatar (compressed via `sharp`, stored on Cloudinary).

### Super Admin Panel (`/admin`)
- **📊 Dashboard Overview** — Live metrics (total/verified/pending/blocked users) and a **6-month registration growth chart** (Chart.js, real `createdAt` data).
- **👥 Customer Management** — View, edit, block, suspend, and reactivate accounts; order-count badges; per-customer order history modal.
- **📦 Live Orders** — Real-time order table with status updates, invoice view/print, search, filter, and pagination.
- **🛍️ Product CRUD** — Add/edit products with up to 10 images, **selling price + buying price**, live profit preview, bulk delete, **selected-row CSV export**, and print-ready product tables. Now includes a **Brand dropdown** and **dynamic variation arrays**.
- **🗂️ Catalog Management** — Sidebar dropdown for **Categories**, **Brands**, and **Attributes**, each with inline edit modals and SweetAlert2 delete confirmations.
  - **🏷️ Manage Brands** — Full CRUD in a clean grid layout with auto **slug generation** and strict product-to-brand database references.
  - **🎛️ Manage Attributes (Variants)** — Configure variations (Size, Color, Material…) with per-variant SKU, price & **separate stock tracking**.
  - **📂 Manage Categories** — Polished table grid (no text/icon overlap); renaming a category syncs all linked products.
- **🔒 Security Logs** — Auth and admin-action audit trail (admin/customer login events, profile edits, status changes, settings updates).
- **⚙️ Admin Settings** — Username/password, display name, store name, **currency symbol** (default ৳), timezone (live clock), logo & favicon upload (Cloudinary).
- **💹 Finance & Analytics CTA** — One-click link to `/finance-analytics` from the sidebar.
- **🔔 UX** — **SweetAlert2** success toasts and modal confirmations (plus Toastr) throughout the admin panel.
- **💱 Dynamic Currency Display** — All admin price columns (products, orders, invoices, customer wallet) use the configured currency symbol from settings.
- **⚡ Instant UI Sync** — Asynchronous state/DOM re-rendering means product and live-order edits/deletes update the table layout **immediately**, with SweetAlert2 feedback and no manual refresh.
- **🕐 Live Clock** — Timezone-aware clock centered in the calendar header.

### Finance & Analytics (`/finance-analytics`)
- Secure password gate (`ADMIN_DASHBOARD_PASSWORD`) with dedicated finance token.
- KPIs: Total Revenue, Net Profit, Daily/Monthly Profit, Avg. Order Value, Profit Margin.
- Charts: 12-month Revenue vs Profit (line) and Top Selling Categories (pie).

### Platform
- **🌐 Clean URLs** — Automatic `.html` stripping and 301 redirects for SEO-friendly routes.

---

## 🧰 Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript, Chart.js, Toastr, SweetAlert2 |
| **Backend** | Node.js, Express.js 5 |
| **Database** | MongoDB (Atlas) via Mongoose ODM |
| **Authentication** | JSON Web Tokens (`jsonwebtoken`), `bcryptjs` |
| **Session Intelligence** | `geoip-lite`, `request-ip`, custom User-Agent parsing |
| **File / Media** | `multer`, `sharp`, `cloudinary`, `streamifier` |
| **Email** | `nodemailer` |
| **Config** | `dotenv` |

### Core Dependencies

```json
"bcryptjs"      "cloudinary"   "dotenv"        "express"
"geoip-lite"    "jsonwebtoken" "mongoose"      "multer"
"nodemailer"    "request-ip"   "sharp"         "streamifier"
"ua-parser-js"
```

---

## 📁 Project Structure

```
eonlinebazar-fullstack/
│
├── config/
│   └── db.js                         # MongoDB (Atlas) connection
│
├── models/
│   ├── user.js                       # User + addresses, wishlist, wallet, accountStatus
│   ├── userSession.js                # Active device / login session records
│   ├── admin.js                      # Admin account + platform settings (currency, logo…)
│   ├── product.js                    # Products with buyingPrice, images, reviews
│   ├── category.js                   # Product categories
│   ├── brand.js                      # Product brands
│   ├── attribute.js                  # Product attributes (Size, Color, etc.)
│   ├── order.js                      # Orders with buyingPrice snapshots per line item
│   ├── cart.js                       # Shopping cart
│   ├── review.js                     # Product reviews
│   └── securityLog.js                # Admin/customer security & auth event logs
│
├── controllers/
│   ├── authController.js             # Session list / revoke / logout-others
│   ├── userController.js             # Auth, profile, wishlist, addresses, wallet
│   ├── adminController.js            # Admin login, customers, settings, logs, branding
│   ├── productController.js          # Product CRUD + reviews
│   ├── orderController.js            # Orders, tracking, buyingPrice snapshots
│   ├── cartController.js             # Cart operations
│   ├── reviewController.js           # Review system
│   └── financeController.js          # Revenue, profit & chart analytics
│
├── routes/
│   ├── authRoutes.js                 # /api/auth
│   ├── userRoutes.js                 # /api/customer
│   ├── adminRoutes.js                # /api/admin
│   ├── productRoutes.js              # /api/products
│   ├── orderRoutes.js                # /api/orders
│   ├── cartRoutes.js                 # /api/cart
│   ├── categoryRoutes.js             # /api/categories
│   ├── brandRoutes.js                # /api/brands
│   ├── attributeRoutes.js            # /api/attributes
│   ├── reviewRoutes.js               # /api/reviews
│   └── financeRoutes.js              # /api/finance
│
├── middlewares/
│   ├── authMiddleware.js             # verifyUser (session-aware) & verifyAdmin (role JWT)
│   └── uploadMiddleware.js           # Multer + Cloudinary stream upload (5 MB images)
│
├── utils/
│   └── securityLogger.js             # Fire-and-forget security event writer
│
├── client/                           # Static frontend (served by Express)
│   ├── index.html                    # Storefront home
│   ├── login.html / register.html    # Customer auth
│   ├── profile.html / cart.html      # Customer dashboard & cart
│   ├── checkout.html / payment.html  # Checkout flow
│   ├── admin-login.html              # Admin authentication
│   ├── admin.html                    # Super Admin panel (SPA)
│   ├── finance-analytics.html        # Finance dashboard
│   ├── finance-login.html            # Finance password gate
│   ├── css/                          # Page-scoped stylesheets (admin.css, etc.)
│   └── js/                           # Page scripts (admin.js, finance-analytics.js, etc.)
│
├── server.js                         # App entry: middleware, routes, clean URLs
├── seed.js                           # Database seeding
├── products.json                     # Sample product data
├── package.json
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** v18+ and npm
- **MongoDB** (Atlas recommended)
- **Cloudinary** account (image uploads)
- **Gmail** with App Password (emails)

### 1. Clone & install

```bash
git clone https://github.com/<your-username>/eonlinebazar-fullstack.git
cd eonlinebazar-fullstack
npm install
```

### 2. Environment variables

Create a `.env` file in the project root (**never commit this file**):

```env
# Server
PORT=3000

# Database
MONGO_URI=your_mongodb_connection_string

# Authentication
JWT_SECRET=your_strong_secret_key

# Admin bootstrap (first login creates admin if credentials match)
ADMIN_PASSWORD=your_admin_password

# Finance & Analytics dashboard
ADMIN_DASHBOARD_PASSWORD=your_finance_dashboard_password
# FINANCE_TOKEN_TTL=8h
# FINANCE_DEFAULT_COST_RATIO=0.70

# Email (Gmail App Password)
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_gmail_app_password

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### 3. (Optional) Seed the database

```bash
node seed.js
```

### 4. Start the server

```bash
node server.js
```

The app runs at **http://localhost:3000**.

| Page | URL |
|------|-----|
| Storefront | `/` |
| Customer login | `/login` |
| Admin login | `/admin-login` |
| Admin panel | `/admin` |
| Finance dashboard | `/finance-analytics` |

> 💡 For development auto-reload: `npm i -D nodemon` then `nodemon server.js`.

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
| `GET/POST/DELETE` | `/api/customer/wishlist` | Wishlist CRUD | User |
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

### 🛒 Cart

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET`  | `/api/cart` | Get cart | User |
| `POST` | `/api/cart/add` | Add item | User |
| `PUT`  | `/api/cart/update-quantity` | Update quantity | User |
| `PUT`  | `/api/cart/toggle-selection` | Select / unselect item | User |
| `DELETE` | `/api/cart/remove/:productId` | Remove item | User |
| `POST` | `/api/cart/merge` | Merge guest cart | User |
| `DELETE` | `/api/cart/clear-ordered` | Clear checked-out items | User |

### 📦 Orders

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/orders` | Place order (snapshots `buyingPrice` per item) | User |
| `GET`  | `/api/orders/my-orders` | User's order history | User |
| `GET`  | `/api/orders/track` | Public order tracking | Public |
| `GET`  | `/api/orders/:id` | Single order details | User |
| `GET`  | `/api/orders` | All orders (admin panel) | Public¹ |
| `PUT`  | `/api/orders/:id` | Update order status | Public¹ |
| `DELETE` | `/api/orders/:id` | Delete order | Public¹ |

### 🗂️ Catalog (Categories, Brands, Attributes)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET`  | `/api/categories` | List categories | Public |
| `POST` | `/api/categories` | Create category | Admin |
| `PUT`  | `/api/categories/:id` | Rename category (syncs linked products) | Admin |
| `DELETE` | `/api/categories/:id` | Delete category | Admin |
| `GET`  | `/api/brands` | List brands | Public |
| `POST` | `/api/brands` | Create brand | Admin |
| `PUT`  | `/api/brands/:id` | Update brand | Admin |
| `DELETE` | `/api/brands/:id` | Delete brand | Admin |
| `GET`  | `/api/attributes` | List attributes | Public |
| `POST` | `/api/attributes` | Create attribute | Admin |
| `PUT`  | `/api/attributes/:id` | Update attribute | Admin |
| `DELETE` | `/api/attributes/:id` | Delete attribute | Admin |

### 🛠️ Admin API

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/admin/login` | Admin login (24h JWT with `role: 'admin'`) | Public |
| `GET`  | `/api/admin/verify-token` | Validate admin JWT on panel load | Admin |
| `GET`  | `/api/admin/customers` | List customers (includes `orderCount`) | Admin |
| `GET`  | `/api/admin/customers/:id` | Customer profile | Admin |
| `PUT`  | `/api/admin/customers/:id` | Edit customer | Admin |
| `PATCH` | `/api/admin/customers/:id/status` | Block / suspend / activate | Admin |
| `GET`  | `/api/admin/customers/:id/orders` | Customer order history | Admin |
| `GET`  | `/api/admin/logs` | Security & auth event logs | Admin |
| `GET`  | `/api/admin/settings` | Platform & profile settings | Admin |
| `PUT`  | `/api/admin/settings` | Save settings (requires current password) | Admin |
| `POST` | `/api/admin/upload-branding` | Upload store logo or favicon | Admin |
| `GET`  | `/api/admin/profile` | Admin profile image URL | Admin |
| `POST` | `/api/admin/update-profile-pic` | Upload admin avatar | Admin |

> ¹ Order list/update/delete routes are currently unauthenticated at the route layer — harden with `verifyAdmin` for production.

> **Customer account status:** `active` · `suspended` · `blocked` — suspended/blocked users cannot log in.

> **Admin panel UX:** Toastr toasts + SweetAlert2 confirmations. Currency symbol from settings applies to all admin price displays.

### 📊 Finance & Analytics

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/finance/admin-login` | Issue finance session token | Public |
| `GET`  | `/api/finance/overview` | Revenue, profit, margin KPIs | Finance |
| `GET`  | `/api/finance/chart-data` | 12-month charts & category breakdown | Finance |

> **Finance token:** issued by `POST /api/finance/admin-login`; also accepts a valid admin-panel JWT (`role: 'admin'`).

> **Finance dashboard access:** Navigate to `/finance-analytics` from the admin sidebar (uses your existing `adminToken`) or sign in at `/finance-login`. Auth is enforced client-side and via API middleware — no cookie required for admin panel users.

> **Net Profit logic:** `(sellingPrice − buyingPrice) × quantity` using the **buying price snapshot** on each order line at checkout. Falls back to catalog `buyingPrice`, then `costPrice`, then `FINANCE_DEFAULT_COST_RATIO` (default `0.70`).

---

## 🛡️ Security Architecture

### Customer sessions (stateful JWT)
1. Login verifies password → creates `UserSession` (IP, geo, device, browser) → JWT embeds `id` + `sid` (7 days).
2. `verifyUser` checks JWT signature **and** session existence; revoked sessions return **401**.
3. Remote logout deletes the session record — instant invalidation on next request.

### Admin authentication (role-based JWT)
1. Admin login issues a 24h JWT with `role: 'admin'`.
2. `verifyAdmin` rejects customer tokens even if signed with the same secret.
3. Admin panel validates token on load via `GET /api/admin/verify-token`.
4. Protected routes: products (write), catalog (write), all `/api/admin/*` endpoints.

### Security logging
Events written to `SecurityLog` via `utils/securityLogger.js`:
- Admin login success/failure
- Customer login success/failure/blocked/suspended attempts
- Admin customer edits & status changes
- Admin settings & branding updates

Viewable in the admin panel under **Security Logs**.

### Additional hardening
- Customer passwords: `bcryptjs` hashes (10 salt rounds).
- Trust proxy enabled for accurate client IPs behind CDNs.
- Upload safety: images only, max 5 MB, memory storage → Cloudinary stream.
- Sensitive pages: `Cache-Control: no-store`.

---

## 💰 Buying Price & Profit Model

| Layer | Field | Purpose |
|-------|-------|---------|
| Product catalog | `buyingPrice` | Cost basis set by admin when creating/editing products |
| Order line item | `buyingPrice` (snapshot) | Frozen at checkout — profit stays accurate even if catalog price changes |
| Order document | `totalBuyingPrice` | Sum of line-item buying costs |
| Finance module | Computed profit | `(sellingPrice − buyingPrice) × qty` with fallbacks |
| Admin UI | Profit preview | Live margin badge on Manage Products & edit modal |

---

## 📜 Changelog

### `v2.0.0` — Admin Panel Enterprise Release
**🐛 Fixes & UX**
- Fixed the **infinite loading loop** on the Finance & Analytics panel; optimized route rendering and data fetching.
- Added **asynchronous state/DOM re-rendering** for all product and live-order actions — instant UI updates without a page refresh.
- Integrated **SweetAlert2** success toasts and modal confirmations across all admin actions.
- Re-centered the **live clock** in the calendar header and fixed the **Manage Categories** grid text/icon overlap.

**✨ New Modules**
- **Manage Brands** — full CRUD, slug generation, and product-to-brand database references.
- **Manage Attributes (Variants)** — variation configuration with per-variant SKU, price & separate stock tracking.
- **Add / Edit Product** — dedicated Brand dropdown and dynamic variation arrays.

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



