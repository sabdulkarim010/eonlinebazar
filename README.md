<div align="center">

# 🛒 EOnlineBazar

### A Full-Stack E-Commerce Web Application

*Shop smarter — a complete MERN-style online marketplace with JWT authentication, real-time active-device & session tracking, a customer profile dashboard, and a full-featured admin panel.*

![Node.js](https://img.shields.io/badge/Node.js-Backend-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)
![JWT](https://img.shields.io/badge/Auth-JWT-FB015B?logo=jsonwebtokens&logoColor=white)
![License](https://img.shields.io/badge/License-ISC-blue)

</div>

---

## 📖 Overview

**EOnlineBazar** is a production-ready, full-stack e-commerce platform built on **Node.js / Express** with a **MongoDB (Atlas)** database and a lightweight, dependency-free **Vanilla JavaScript** frontend. It follows a clean **MVC architecture** (Models → Controllers → Routes) and ships with everything a modern online store needs: secure customer authentication, a shopping cart, order placement & live tracking, product reviews with image uploads, a loyalty wallet, and a dedicated admin dashboard.

Its standout feature is a **database-backed session security layer**: every login generates a unique session that is embedded inside the JWT, allowing users to view all their **active devices** (with IP, location, browser & device detection) and **remotely log out** any device in real time.

---

## ✨ Key Features

- **🔐 JWT Authentication** — Secure customer registration & login with `bcryptjs` password hashing and 7-day signed JSON Web Tokens.
- **📧 Email Verification & OTP Password Reset** — Account verification links and 6-digit OTP-based password recovery, sent via `nodemailer` (Gmail).
- **🖥️ Active Devices & Session Tracking** — Every login is recorded in a dedicated `UserSession` collection with **IP address**, **geo-location** (city, country), **browser**, and **device** detection.
- **🚪 Remote Logout** — Instantly revoke any device; the next request from that device is rejected by the session-aware middleware (forced logout). Includes a "log out all other devices" action.
- **🛍️ Product Catalog** — Browse products with multiple images, categories, highlights, stock levels, and detailed descriptions.
- **⭐ Reviews & Ratings** — Logged-in customers can post star ratings and reviews (with optional photo upload); average ratings update automatically.
- **🛒 Shopping Cart** — Persistent, server-synced cart with add, update quantity, toggle item selection, guest-cart merging, and post-order cleanup.
- **📦 Order Management & Tracking** — Place orders, view personal order history, and track order status via a public tracking endpoint.
- **❤️ Wishlist** — Save favourite products that persist across sessions.
- **📍 Address Book** — Manage multiple delivery addresses with a default-address sync for faster checkout.
- **💰 Wallet & Loyalty Points** — Earn loyalty points and convert them into wallet balance (100 points = ৳10) with full transaction history.
- **👤 Responsive Profile Dashboard** — Update profile details, change password, and upload an avatar (auto-compressed to 300×300 via `sharp`, stored on Cloudinary).
- **🛠️ Admin Panel** — Admin login, customer management, product CRUD (up to 10 images per product), category management, order status updates, and admin profile picture handling.
- **📊 Finance & Analytics Panel** — A secure, admin-only dashboard that aggregates every order to compute **Total Revenue**, **Net Profit** (per-item `costPrice` vs `sellingPrice` difference), **Daily Profit**, and **Monthly Profit**, with interactive **Revenue vs Profit** (line) and **Top Selling Categories** (pie) charts rendered via Chart.js.
- **🌐 Clean URLs** — Automatic `.html` stripping and 301 redirects for SEO-friendly, extension-less routes.

---

## 🧰 Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript (no framework) |
| **Backend** | Node.js, Express.js 5 |
| **Database** | MongoDB (Atlas) via Mongoose ODM |
| **Authentication** | JSON Web Tokens (`jsonwebtoken`), `bcryptjs` |
| **Session Intelligence** | `geoip-lite` (location), `request-ip` (client IP), `ua-parser-js` (device/browser) |
| **File / Media** | `multer` (uploads), `sharp` (image compression), `cloudinary` + `streamifier` (CDN storage) |
| **Email** | `nodemailer` (verification & OTP) |
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

The project follows the **MVC pattern**, separating data models, business logic (controllers), and routing.

```
eonlinebazar-fullstack/
│
├── config/
│   └── db.js                     # MongoDB (Atlas) connection via Mongoose
│
├── models/                       # Mongoose schemas (Data Layer)
│   ├── user.js                   # User + embedded addresses, wishlist, wallet
│   ├── userSession.js            # Active device / login session records
│   ├── admin.js                  # Admin account
│   ├── product.js                # Products with images, reviews & ratings
│   ├── category.js               # Product categories
│   ├── order.js                  # Customer orders
│   ├── cart.js                   # Shopping cart
│   └── review.js                 # Product reviews
│
├── controllers/                  # Business logic (Controller Layer)
│   ├── authController.js         # Active sessions: list / revoke / logout-others
│   ├── userController.js         # Auth, profile, wishlist, addresses, wallet
│   ├── adminController.js        # Admin login, customers, profile image
│   ├── productController.js      # Product CRUD + reviews
│   ├── orderController.js        # Orders, tracking, dashboard stats
│   ├── cartController.js         # Cart operations
│   ├── reviewController.js       # Review system
│   └── financeController.js      # 📊 Finance analytics: revenue, profit & charts
│
├── routes/                       # API endpoints (Routing Layer)
│   ├── authRoutes.js             # /api/auth      (session management)
│   ├── userRoutes.js             # /api/customer  (auth, profile, wishlist...)
│   ├── adminRoutes.js            # /api/admin
│   ├── productRoutes.js          # /api/products
│   ├── orderRoutes.js            # /api/orders
│   ├── cartRoutes.js             # /api/cart
│   ├── categoryRoutes.js         # /api/categories
│   ├── reviewRoutes.js           # /api/reviews
│   └── financeRoutes.js          # /api/finance (admin-protected analytics)
│
├── middlewares/
│   ├── authMiddleware.js         # verifyUser (session-aware) & verifyAdmin (JWT)
│   └── uploadMiddleware.js       # Multer memory storage + image filter (5 MB)
│
├── client/                       # Frontend (static, served by Express)
│   ├── *.html                    # index, login, register, profile, cart, checkout...
│   ├── finance-analytics.html    # 📊 Finance & Analytics dashboard (HTML only)
│   ├── finance-login.html        # 🔒 Finance dashboard password login (HTML only)
│   ├── css/                      # Page-scoped stylesheets
│   │   ├── finance-analytics.css # 📊 Finance panel styling (glassmorphism, responsive)
│   │   └── finance-login.css     # 🔒 Finance login styling
│   ├── js/                       # Vanilla JS for each page
│   │   ├── finance-analytics.js  # 📊 Finance panel logic (fetch + Chart.js render)
│   │   └── finance-login.js      # 🔒 Finance login logic (password → token)
│   └── images/                   # Static assets (favicon, etc.)
│
├── server.js                     # App entry point: middleware, routes, clean URLs
├── seed.js                       # Database seeding script
├── products.json                 # Sample product data
├── package.json
└── README.md
```

---

## 🔌 API Documentation

Base URL: `http://localhost:3000`

> **Auth column legend:** `Public` = no token · `User` = customer Bearer JWT (`verifyUser`) · `Admin` = admin Bearer JWT (`verifyAdmin`)

### 🔑 Authentication & Sessions

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/customer/register` | Register a new account & send verification email | Public |
| `POST` | `/api/customer/login` | Log in, create a session & issue a JWT | Public |
| `POST` | `/api/customer/forgot-password` | Send a 6-digit password-reset OTP via email | Public |
| `POST` | `/api/customer/reset-password` | Reset password using the OTP | Public |
| `GET`  | `/api/auth/sessions` | List all active devices/sessions (flags the current one) | User |
| `DELETE` | `/api/auth/sessions/:id` | Remotely log out a specific device (by `_id` or `sessionId`) | User |
| `POST` | `/api/auth/sessions/logout-others` | Log out every device except the current one | User |

### 👤 Profile & Account

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET`  | `/api/customer/profile` | Get the logged-in user's profile | User |
| `PUT`  | `/api/customer/update-profile` | Update name / phone / address | User |
| `PUT`  | `/api/customer/change-password` | Change the current password | User |
| `POST` | `/api/customer/update-avatar` | Upload & compress profile photo (Cloudinary) | User |
| `POST` | `/api/customer/convert-points` | Convert loyalty points to wallet balance | User |

### ❤️ Wishlist & 📍 Addresses

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET`  | `/api/customer/wishlist` | Get wishlist items | User |
| `POST` | `/api/customer/wishlist` | Add an item to the wishlist | User |
| `DELETE` | `/api/customer/wishlist/:productId` | Remove a wishlist item | User |
| `GET`  | `/api/customer/addresses` | List saved addresses | User |
| `POST` | `/api/customer/addresses` | Add a new address | User |
| `PUT`  | `/api/customer/addresses/:addressId` | Update an address | User |
| `DELETE` | `/api/customer/addresses/:addressId` | Delete an address | User |

### 🛍️ Products & Reviews

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET`  | `/api/products` | Get all products | Public |
| `GET`  | `/api/products/:id` | Get a single product | Public |
| `POST` | `/api/products` | Create a product (up to 10 images) | Admin |
| `PUT`  | `/api/products/:id` | Update a product | Admin |
| `DELETE` | `/api/products/:id` | Delete a product | Admin |
| `POST` | `/api/products/:id/reviews` | Add a review/rating to a product | User |
| `GET`  | `/api/reviews/:productId` | Get all reviews for a product | Public |
| `POST` | `/api/reviews` | Add or update a review (with photo) | User |

### 🛒 Cart

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET`  | `/api/cart` | Get the user's cart | User |
| `POST` | `/api/cart/merge` | Merge guest cart into the user's cart | User |
| `POST` | `/api/cart/add` | Add a product to the cart | User |
| `PUT`  | `/api/cart/update-quantity` | Update an item's quantity | User |
| `PUT`  | `/api/cart/toggle-selection` | Select / unselect an item | User |
| `DELETE` | `/api/cart/remove/:productId` | Remove an item | User |
| `DELETE` | `/api/cart/clear-ordered` | Clear selected items after checkout | User |

### 📦 Orders

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/orders` | Place a new order | User |
| `GET`  | `/api/orders/my-orders` | Get the logged-in user's orders | User |
| `GET`  | `/api/orders/dashboard-stats` | Get order dashboard statistics | User |
| `GET`  | `/api/orders/track` | Track an order (public lookup) | Public |
| `GET`  | `/api/orders/:id` | Get a single order's details | User |
| `GET`  | `/api/orders` | Get all orders (admin panel) | Public¹ |
| `PUT`  | `/api/orders/:id` | Update order status | Public¹ |
| `DELETE` | `/api/orders/:id` | Delete an order | Public¹ |

### 🗂️ Categories & 🛠️ Admin

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET`  | `/api/categories` | List all categories | Public |
| `POST` | `/api/categories` | Create a category | Public¹ |
| `PUT`  | `/api/categories/:id` | Rename a category (syncs products) | Public¹ |
| `DELETE` | `/api/categories/:id` | Delete a category | Public¹ |
| `POST` | `/api/admin/login` | Admin login (issues 24h JWT) | Public |
| `GET`  | `/api/admin/customers` | List all customers | Public¹ |
| `GET`  | `/api/admin/profile` | Get admin profile image | Public |
| `POST` | `/api/admin/update-profile-pic` | Upload admin profile picture | Public¹ |

> ¹ These management endpoints are currently unauthenticated at the route layer. For a hardened production deployment, protect them with the `verifyAdmin` middleware.

### 📊 Finance & Analytics

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/finance/admin-login` | Validate the dashboard password (`ADMIN_DASHBOARD_PASSWORD`) and issue a short-lived finance session token | Public |
| `GET`  | `/api/finance/overview` | KPI summary — Total Revenue, Net Profit, Daily & Monthly Profit, Total Orders, Avg. Order Value & Profit Margin | Finance² |
| `GET`  | `/api/finance/chart-data` | Chart datasets — last-12-months Revenue vs Profit (line) & Top Selling Categories by revenue (pie) | Finance² |

> ² **Finance** = a Bearer token issued by `POST /api/finance/admin-login`. Requests without a valid token receive **`401 Unauthorized`**. The `verifyFinanceToken` middleware also accepts a valid admin-panel token (`role: 'admin'`) for backward compatibility.

> **Access flow:** the dashboard UI is served at **`/finance-analytics`** (also aliased at `/admin/finance`). On load, `finance-analytics.js` checks `localStorage` for the finance token; if missing or rejected with `401`, the browser is redirected to the password login page at **`/finance-login`**. A correct password stores the token and returns to the dashboard.

> **Net Profit logic:** profit is computed per order item as `(sellingPrice − costPrice) × quantity`. When an item has no stored `costPrice`, it is resolved from the product catalog, and otherwise estimated from a configurable `FINANCE_DEFAULT_COST_RATIO` (default `0.70`).

---

## ⚙️ Installation & Setup Guide

### Prerequisites

- **Node.js** v18+ and npm
- A **MongoDB** database (a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster works great)
- A **Cloudinary** account (for image uploads)
- A **Gmail** account with an App Password (for emails)

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/eonlinebazar-fullstack.git
cd eonlinebazar-fullstack
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root. **Never commit this file** — use placeholder values like below:

```env
# Server
PORT=3000

# Database
MONGO_URI=your_mongodb_connection_string

# Authentication
JWT_SECRET=your_strong_secret_key

# Admin bootstrap
ADMIN_PASSWORD=your_admin_password

# Finance & Analytics dashboard (dedicated password gate)
ADMIN_DASHBOARD_PASSWORD=your_finance_dashboard_password
# Optional: finance session token lifetime (default 8h)
# FINANCE_TOKEN_TTL=8h
# Optional: fallback cost ratio for profit estimation (default 0.70)
# FINANCE_DEFAULT_COST_RATIO=0.70

# Email (Gmail App Password recommended)
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_gmail_app_password

# Cloudinary (image storage)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### 4. (Optional) Seed the database

```bash
node seed.js
```

### 5. Start the server

```bash
node server.js
```

> 💡 For auto-reload during development, install nodemon (`npm i -D nodemon`) and run `nodemon server.js`. You can also add convenience scripts to `package.json`:
> ```json
> "scripts": {
>   "start": "node server.js",
>   "dev": "nodemon server.js"
> }
> ```

The app will be available at **http://localhost:3000**, with the API served under `/api/*`.

---

## 🛡️ Security Architecture

EOnlineBazar combines **stateless JWTs** with a **stateful session store** to get the best of both worlds — fast token verification *and* instant remote revocation.

### 1. Token issuance (login)
On a successful login, the server:
1. Verifies the password with `bcryptjs`.
2. Generates a unique **`sessionId` (UUID)** and persists a record in the dedicated **`UserSession`** collection, capturing the **IP** (`request-ip`), **geo-location** (`geoip-lite`), **device** and **browser** (parsed from the User-Agent).
3. Signs a JWT containing both the user `id` **and** the `sid` (session ID), valid for **7 days**.

```js
const token = jwt.sign({ id: user._id, sid: sessionId }, JWT_SECRET, { expiresIn: '7d' });
```

### 2. Request validation (session-aware middleware)
On every protected request, `verifyUser`:
1. Verifies the JWT signature.
2. Reads the `sid` from the token and looks it up in `UserSession`.
3. If the matching session **still exists**, it updates `lastActiveAt` (a single, lightweight DB call) and lets the request through.
4. If the session **no longer exists** (because it was revoked), it responds with **`401 Unauthorized`** — effectively a **forced logout** for that device.

```js
const session = await UserSession.findOneAndUpdate(
    { sessionId: decoded.sid },
    { $set: { lastActiveAt: new Date() } },
    { new: true }
);
if (!session) return res.status(401).json({ success: false, message: "Session expired or logged out." });
```

### 3. Remote logout
Deleting a session record (via `DELETE /api/auth/sessions/:id` or `logout-others`) **immediately invalidates** that device's token on its next request — no need to wait for the JWT to expire. An ownership guard ensures users can only revoke their **own** sessions.

### Additional hardening
- **Password hashing:** all passwords stored as `bcryptjs` hashes (salt rounds = 10).
- **Trust proxy:** `app.set('trust proxy', true)` ensures real client IPs behind proxies/CDNs (Render, Nginx, Cloudflare).
- **Upload safety:** Multer restricts uploads to images only, max **5 MB**, held in memory (never written to disk) before streaming to Cloudinary.
- **No-store caching:** sensitive pages are served with `Cache-Control: no-store`.

---

## 👤 Author

**Abdul Karim Sheikh**

---

<div align="center">

*Built with ❤️ using Node.js, Express & MongoDB.*

</div>



