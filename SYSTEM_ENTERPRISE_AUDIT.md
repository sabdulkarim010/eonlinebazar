# SYSTEM ENTERPRISE AUDIT — EonlineBazar Full-Stack

**Audit date:** 2026-09-10  
**Auditor scope:** Non-destructive read-only scan of entire repository  
**Repository:** `d:\eonlinebazar-fullstack`  
**Production domain detected:** `https://eonlinebazar.com`

---

## SECTION 1 — PROJECT OVERVIEW

### Tech Stack

| Layer | Technology | Version / Notes |
|-------|-----------|-----------------|
| Runtime | Node.js | **20** (Dockerfile `node:20-alpine`) |
| Backend framework | Express | 5.2.x |
| Database | MongoDB | 7 (docker-compose) |
| ODM | Mongoose | 9.6.x |
| Cache | Redis | 7-alpine (optional; sitemap + rate-limit settings) |
| Auth | JWT (Bearer) | Admin + Customer; Google OAuth (Passport) |
| Session | express-session | OAuth + admin/customer session tracking |
| Realtime | Socket.IO | 4.8.x (store notifications + chat proxy) |
| File storage | Cloudinary | Product/banner/avatar uploads |
| Email | Nodemailer + Resend | Order emails, OTP, newsletter |
| SMS | Multi-gateway | Greenweb, BulkSMS, AlphaSMS, Generic |
| PDF | PDFKit | Order invoices |
| Payments | SSLCommerz, Aamarpay, ShurjoPay, Stripe adapters | Manual bKash/Nagad/COD |
| Mobile | Expo / React Native | Expo ~57, React Native 0.86, React Navigation v7 |
| Chat microservice | Separate Node app | `ecommerce-chat/` on port **5001** |
| Chat admin SPA | Vite + React | `admin-dashboard/` → `/chat-admin` |
| Testing | Jest + Supertest | `npm test` |
| Containerization | Docker + docker-compose | App + Mongo + Redis |
| Reverse proxy | Nginx | `devops/nginx.conf` — SSL, chat proxy |

### Folder Structure (2–3 levels)

```
eonlinebazar-fullstack/
├── backend/
│   └── src/
│       ├── config/          # DB, passport, permissions
│       ├── controllers/     # 61 controllers (+ admin/, auth/ subdirs)
│       ├── middlewares/     # auth, RBAC, rate limit, security, chat proxy
│       ├── models/          # 28 Mongoose models
│       ├── routes/          # 27 route barrel files (SACRED — do not restructure)
│       ├── services/        # 23 business services
│       ├── jobs/            # Cron jobs (review reminder)
│       ├── utils/           # Page builders, helpers
│       └── server.js        # Main entry point
├── client/
│   ├── admin/partials/      # Admin SPA HTML sections (assembled server-side)
│   ├── profile/partials/    # Customer profile tabs
│   ├── partials/            # Shared header/footer/chat
│   ├── css/                 # Barrels → admin/, profile/, global/
│   ├── js/                  # Storefront + admin modules
│   └── *.html               # 21 storefront/admin HTML pages
├── mobile/
│   ├── App.js               # Root stack navigator
│   └── src/
│       ├── api/             # REST endpoint helpers
│       ├── components/      # Reusable UI
│       ├── navigation/      # Tab + stack
│       ├── screens/         # 23 screens
│       ├── store/           # Zustand state
│       └── services/        # Axios client
├── ecommerce-chat/          # Live chat microservice (port 5001)
│   ├── models/              # 7 chat models
│   ├── routes/              # chat, admin, knowledge, upload, order
│   ├── socket/              # Socket.IO handlers
│   └── services/            # AI, CRM enrichment, uploads
├── admin-dashboard/         # React chat admin SPA (Vite)
│   └── src/pages/           # Login, Dashboard, Settings, Profile
├── devops/                  # nginx.conf, Docker, server setup
├── public/                  # PWA manifest, static uploads, icons
├── scripts/                 # Seed, icon generation
├── tests/                   # Jest integration tests
├── docker-compose.yml
├── Dockerfile
├── package.json
└── .env.example             # (exists; permission-restricted in audit env)
```

**Note:** There is no top-level `admin/` folder — admin UI lives in `client/admin/` and is assembled by `backend/src/utils/adminPageBuilder.js`.

### Entry Points & Server Configuration

| Entry | Path | Port | Purpose |
|-------|------|------|---------|
| Main store API + HTML | `backend/src/server.js` | `PORT` (default 3000, prod **5000**) | E-commerce backend |
| Chat microservice | `ecommerce-chat/server.js` | **5001** | Live chat, AI bot, agent inbox |
| Mobile app | `mobile/index.js` → `App.js` | — | Expo React Native |
| Chat admin SPA | `admin-dashboard/` (built dist) | served at `/chat-admin` | Agent dashboard |

**Bootstrap sequence (server.js):**
1. Load `.env` from repo root; validate required vars
2. Mount chat API/WebSocket proxy **before** body parsers
3. Connect MongoDB → RBAC backfill → payment method seed → cron jobs → Redis
4. Security middleware (Helmet, CORS, rate limits, sanitize, HPP)
5. Mount 20+ API route prefixes
6. Mount HTML view routes (storefront, admin, profile, CMS)
7. Global error handler

### Authentication Methods

| Actor | Method | Details |
|-------|--------|---------|
| **Customer** | JWT Bearer + UserSession | Login/register; optional guest checkout |
| **Admin (store)** | JWT Bearer + AdminSession | Username/password + OTP/2FA (TOTP/SMS/email) |
| **Finance dashboard** | Scoped JWT (`scope: finance-dashboard`) | Separate password (`ADMIN_DASHBOARD_PASSWORD`) |
| **Google OAuth** | Passport + express-session | `/api/auth/google` |
| **Chat agent** | JWT (shared `JWT_SECRET`) | Separate Agent model in chat DB |
| **Internal services** | `INTERNAL_API_KEY` | Chat → store CRM enrichment |
| **Emergency panel** | URL token + master key | `/sys/:token/*` |

### Deployment Setup (Detected)

| Component | Configuration |
|-----------|---------------|
| **Production host** | DigitalOcean — `eonlinebazar.com` |
| **Docker** | `Dockerfile` (Node 20), `docker-compose.yml` (app + mongo + redis) |
| **Nginx** | SSL termination, proxy store `:5000`, chat `:5001`, static `/chat-admin/` |
| **Mobile builds** | EAS — preview APK, production AAB (`mobile/eas.json`) |
| **Health check** | `GET /api/store/health` |
| **Chat proxy paths** | `/api/chat-admin/*`, `/chat-api/*`, `/chat-socket/socket.io` |
| **PM2** | `ecommerce-chat/ecosystem.config.js` for chat service |

---

## SECTION 2 — FULL FEATURE INVENTORY

Status key: ✅ COMPLETE | 🔶 PARTIAL | ❌ MISSING/BROKEN

### Core E-Commerce

| Feature | Status | Files | Notes |
|---------|--------|-------|-------|
| Product catalog (CRUD, search, variants) | ✅ | Model: `product.js`; Controller: `productController.js`; Route: `productRoutes.js`; UI: `view-products.html`, `products-*.js`, mobile `ShopScreen`, `ProductDetailsScreen` | Text search index; variant SKU/stock matrix |
| Categories (tree, navbar, homepage) | ✅ | `category.js`, `categoryController.js`, `categoryRoutes.js`, `catalog-categories.js`, `CategoryGrid.js` | Nested categories with banners |
| Brands | ✅ | `brand.js`, `brandController.js`, `catalog-brands.js` | |
| Attributes | ✅ | `attribute.js`, `attributeController.js`, `catalog-attributes.js` | |
| Shopping cart | ✅ | `cart.js`, `cartController.js`, `cartRoutes.js`, `cart.html`, mobile `CartScreen` | Guest merge on login |
| Wishlist | ✅ | `wishlist.js` (embedded), `userWishlistController.js`, mobile `WishlistScreen` | |
| Checkout & order placement | ✅ | `orderCheckoutController.js`, `checkout.js`, mobile `CheckoutScreen` | COD + gateway + wallet |
| Order management (admin) | ✅ | `orderAdminController.js`, `orders-*.js`, `view-orders.html` | Status updates, bulk delete, master editor |
| Order tracking (customer) | ✅ | `orderCustomerController.js`, `order-track.html`, mobile `OrderDetailsScreen` | Public track by phone/orderId |
| Payment gateways | ✅ | `paymentIpnController.js`, `paymentGatewayService.js`, `payment.html` | SSLCommerz, Aamarpay, manual proof |
| Payment reconciliation | ✅ | `paymentReconciliationController.js`, `payment-reconciliation.html` | Separate HTML app |
| Coupons | ✅ | `coupon.js`, `couponController.js`, `catalog-coupons.js` | Apply, per-user limits |
| Reviews & ratings | ✅ | `review.js`, `reviewController.js`, `view-reviews.html`, mobile `ReviewsSection.js` | Moderation, verified purchase |
| Banners / flash sale | ✅ | `banner.js`, `bannerController.js`, `view-banners.html` | Carousel + flash sale settings |
| CMS pages | ✅ | `PageContent.js`, `pageContentController.js`, `settings-cms.js` | Markdown/HTML pages |
| Footer settings | ✅ | `FooterSettings.js`, `footerSettingsController.js`, `settings-footer.js` | |
| Navbar links | ✅ | `NavbarLink.js`, `navbarLinkController.js`, `catalog-navbar.js` | |
| Store branding | ✅ | `storeController.js`, `settings-platform.js` | Logo, favicon, WhatsApp |
| PWA | ✅ | `public/manifest.json`, `_pwa.css` | Service worker toggle in settings |
| SEO (sitemap, robots) | ✅ | `seoRoutes.js`, `seoPageService.js` | Redis-cached sitemap |

### Customer Account

| Feature | Status | Files | Notes |
|---------|--------|-------|-------|
| Registration / login | ✅ | `auth/registerController.js`, `auth/loginController.js`, `login.html`, mobile auth screens | Email verification |
| Google OAuth | ✅ | `auth/oauthController.js`, passport config | |
| Profile management | ✅ | `userProfileController.js`, `profile/`, mobile `EditProfileScreen` | OTP for email/phone change |
| Addresses (BD districts) | ✅ | `userProfileController.js`, mobile `AddressesScreen`, `DistrictUpazilaPicker.js` | 64 districts + upazilas |
| Wallet & loyalty points | ✅ | `walletService.js`, `wallet.js`, mobile `WalletScreen`, `LoyaltyPointsScreen` | Convert points ↔ taka |
| Customer notebook (notes/expenses) | ✅ | `note.js`, `noteController.js`, mobile `NotebookScreen` | Private user-scoped |
| Session management | ✅ | `userSession.js`, mobile `SecuritySettingsScreen` | Logout other devices |
| Account deletion | ✅ | `loginController.js`, mobile `DeleteAccountScreen` | Play Store compliance |
| Forgot / reset password | ✅ | `passwordController.js`, `forgot-password.html`, mobile `ForgotPasswordScreen` | OTP flow |

### Admin & Operations

| Feature | Status | Files | Notes |
|---------|--------|-------|-------|
| Admin dashboard analytics | ✅ | `analyticsController.js`, `view-overview.html`, `admin-dashboard.js` | KPIs, charts |
| Finance analytics | ✅ | `financeAnalyticsController.js`, `finance-analytics.html` | Profit/margin — separate login |
| Customer management | ✅ | `customerAdminController.js`, `view-customers.html`, `customers-*.js` | VIP segmentation |
| Staff management | ✅ | `staffController.js`, `view-staff.html`, `admin-staff.js` | Super-admin only |
| RBAC permissions | ✅ | `rbac.js`, `permissions.js`, `admin.js` | 9 granular permissions |
| Admin 2FA | ✅ | `twoFactorController.js`, `settings-2fa.js` | TOTP + SMS |
| Security logs & audit | ✅ | `securityLog.js`, `loginAttempt.js`, `view-security.html` | IP blacklist, geo-fence |
| Admin sessions | ✅ | `adminSession.js`, `sessionController.js`, `view-sessions.html` | |
| Bulk product import | ✅ | `bulkImportController.js`, `products-bulk.js` | CSV/Excel |
| AI product assist | ✅ | `adminController.aiProductAssist` | OpenAI integration |
| Manual POS orders | ✅ | `orderAdminController.createManualOrder`, `orders-pos.js` | Walk-in/phone orders |
| Invoice generation (PDF) | ✅ | `orderCustomerController.downloadOrderInvoice`, `orders-invoice.js` | PDFKit |
| Courier integration | ✅ | `courierController.js`, `courierService.js`, `orders-actions.js` | Steadfast, Pathao, RedX |
| Returns & refunds | ✅ | `orderAdminController.js`, `orderCustomerController.js` | Per-item returns, wallet/bKash refund |
| Stock alerts | ✅ | `stockAlertService.js`, `stockAlert.js` | Cron + email/SMS/WhatsApp |
| WhatsApp order alerts | ✅ | `whatsappService.js`, `whatsappAlertsController.js` | Admin pending alerts |
| Newsletter | ✅ | `newsletter.js`, `newsletterAdminController.js`, `admin-newsletter.js` | Subscribers + email campaigns |
| Contact inquiries | ✅ | `ContactMessage.js`, `contactController.js`, `view-messages.html` | |
| File manager | ✅ | `fileManagerController.js`, `view-file-manager.html` | Super-admin only |
| Sandbox mode | ✅ | `sandboxController.js`, `sandboxService.js` | Test data isolation |
| Cache management | ✅ | `cacheController.js`, `cacheService.js` | Redis flush |
| Emergency control panel | ✅ | `emergencyRoutes.js`, `emergencyService.js` | `/sys/:token` |

### Live Chat & Support

| Feature | Status | Files | Notes |
|---------|--------|-------|-------|
| Storefront chat widget | ✅ | `client/js/chat-widget.js`, `ecommerce-chat/public/js/chat-widget.js` | FAB, socket, AI bot |
| Chat microservice | ✅ | `ecommerce-chat/` (full stack) | Separate MongoDB |
| React chat admin (`/chat-admin`) | ✅ | `admin-dashboard/src/` | Agent inbox, CRM panel |
| Legacy admin chat (`view-chat`) | ✅ | `view-chat.html`, `chat-admin.js` | **Duplicates React chat admin** |
| Chat analytics | ✅ | `view-chat-analytics.html`, chat admin analytics API | |
| Canned responses | ✅ | `CannedResponse.model.js`, `view-canned-responses.html` | |
| AI knowledge base | ✅ | `AIKnowledgeBase.model.js`, `ai.service.js` | OpenAI + KB fallback |
| Mobile live support | ✅ | `LiveSupportScreen.js`, `AriaChatPanel.js`, `useAriaChat.js` | AI + human handover |
| Chat CRM enrichment | ✅ | `internalChatController.js`, `storeProfile.service.js` | Profile + order history |

### Mobile App

| Feature | Status | Files | Notes |
|---------|--------|-------|-------|
| Full shopping flow | ✅ | 23 screens, Zustand stores | Production API default |
| EN/BN i18n | ✅ | `translations.js`, `useLanguageStore.js` | |
| Live chat | ✅ | `LiveSupportScreen`, `api/chat.js` | |
| Legal pages (WebView) | ✅ | `LegalScreen.js`, `legalWebView.js` | CMS embed |
| Dark/light theme | ✅ | `useThemeStore.js`, `tokens.js` | |

### Phase 1–4 Enterprise Features (completed 2026-09-10)

| Feature | Status | Files | Notes |
|---------|--------|-------|-------|
| Staff audit + RBAC gaps (Phase 1) | ✅ | `staffAuditController.js`, `settings-staff-audit.js`, `permissions.js` | manage_marketing, order assign |
| Vendor/supplier management (Phase 2) | ✅ | `supplier.js`, `supplierController.js`, `view-suppliers.html`, `erp-suppliers.js` | `/api/admin/suppliers` |
| Purchase orders (Phase 2) | ✅ | `purchaseOrder.js`, `purchaseOrderController.js`, `view-purchase-orders.html` | draft→received workflow |
| Multi-warehouse / locations (Phase 2) | ✅ | `warehouse.js`, `warehouseController.js`, `view-warehouses.html` | `/api/admin/warehouses` |
| Abandoned cart tracking (Phase 3) | ✅ | `abandonedCartJob.js`, `view-crm-abandoned.html`, `crmController.js` | Email + SMS recovery |
| Referral system (Phase 3) | ✅ | `referralController.js`, `ReferralScreen.js` | Wallet reward on first order |
| Support ticket lifecycle (Phase 3) | ✅ | `ContactMessage.js`, `messages-inbox.js`, ticket API | Status, assignee, priority |
| WhatsApp marketing campaigns (Phase 3) | ✅ | `whatsappService.sendBroadcast`, `newsletterAdminController.js` | Segment + channel dispatch |
| Unified ERP/CRM/HRM navigation (Phase 4) | ✅ | `sidebar.html`, `core-nav.js`, `core-breadcrumb.js` | Accordion groups + mobile drawer |
| Enterprise dashboard widgets (Phase 4) | ✅ | `enterpriseSummaryController.js`, `view-overview.html` | ERP + CRM + HRM KPIs |
| Unified settings read API (Phase 4) | ✅ | `GET /api/admin/all-settings` | Settings.js + Setting.js merge |
| Cursor pagination (Phase 4) | ✅ | `customerAdminController.js`, `productController.js`, mobile `ProductGrid.js` | Load-more pattern |
| Mobile `.env.example` (Phase 4) | ✅ | `mobile/.env.example` | EXPO_PUBLIC_* documented |
| DB index migration (Phase 4) | ✅ | `scripts/addEnterpriseIndexes.js` | `npm run migrate:indexes` |
| Legacy chat admin deprecation (Phase 3) | ✅ | `view-chat.html` redirect notice | Primary UI at `/chat-admin` |

### Remaining / Out of Scope

| Feature | Status | Notes |
|---------|--------|-------|
| Attendance tracking | ❌ | No HRM attendance module |
| Payroll / salary | ❌ | No payroll module |
| Product `slug` field | 🔶 | Index exists but no schema field |

---

## SECTION 3 — ENTERPRISE CATEGORIZATION MATRIX

### 🏭 ERP (Enterprise Resource Planning)

| Capability | Status | Evidence |
|------------|--------|----------|
| Inventory & stock management | ✅ COMPLETE | `product.js`: `stockQuantity`, `stock`, `lowStockThreshold`, variant `sku`/`stock`; bulk import; stock alert cron |
| Order lifecycle management | ✅ COMPLETE | Status: Pending → Processing → Shipped → Out for Delivery → Delivered; Cancel/Return/Refund flows; `notificationsSent` flags |
| Courier & logistics integration | ✅ COMPLETE | `courierService.js` — Steadfast, Pathao, RedX; tracking IDs on order; admin book + customer track URLs |
| Invoice generation | ✅ COMPLETE | `GET /api/orders/:id/invoice` — PDFKit; admin print modal |
| Financial reports | 🔶 PARTIAL | `finance-analytics.html` + `/api/finance/*` — profit/revenue/margin; no full P&L, expenses, or vendor costs |
| Vendor/supplier management | ✅ COMPLETE | `supplier.js`, `supplierController.js`, admin ERP UI |
| Purchase orders | ✅ COMPLETE | `purchaseOrder.js`, `purchaseOrderController.js`, PO workflow |
| Warehouse/location management | ✅ COMPLETE | `warehouse.js`, `warehouseController.js`, multi-location stock |

### 🤝 CRM (Customer Relationship Management)

| Capability | Status | Evidence |
|------------|--------|----------|
| Customer database with purchase history | ✅ COMPLETE | `user.js` + admin customer detail with orders; chat CRM panel |
| Customer segmentation/analytics | 🔶 PARTIAL | VIP / Frequent / Inactive segments in admin; thresholds in `Setting.js`; no RFM scoring or campaigns by segment |
| Loyalty points / rewards | ✅ COMPLETE | `loyaltyPoints`, `walletBalance`, cashback on delivery, convert points API |
| SMS / Email / WhatsApp marketing | 🔶 PARTIAL | Newsletter campaigns (`EmailCampaign`); order SMS; review reminder cron; no WhatsApp broadcast campaigns |
| Live chat or support ticket system | ✅ COMPLETE (chat) | Full live chat stack; ❌ no formal ticket queue outside chat |
| Reviews & ratings system | ✅ COMPLETE | Product reviews, moderation, verified purchase, review reminders |
| Abandoned cart tracking | ✅ COMPLETE | `abandonedCartJob.js`, CRM dashboard |
| Referral system | ✅ COMPLETE | `referralController.js`, mobile + signup flow |

### 👥 HRM (Human Resource Management)

| Capability | Status | Evidence |
|------------|--------|----------|
| Staff/employee accounts | ✅ COMPLETE | `admin.js` staff role; `staffController.js`; chat `Agent.model.js` (separate system) |
| Role-Based Access Control | ✅ COMPLETE | Roles: **`superadmin`**, **`staff`**; 9 permissions (see below) |
| Granular permissions | ✅ COMPLETE | `view_analytics`, `manage_orders`, `manage_inventory`, `manage_catalog`, `manage_coupons`, `manage_customers`, `manage_settings`, `manage_security`, `manage_staff` |
| Staff audit logs | ✅ COMPLETE | `SecurityLog`, `LoginAttempt`; admin security suite |
| Task & order assignment to staff | 🔶 PARTIAL | Chat room assign to agent; no general task/order assignment to warehouse staff |
| Attendance tracking | ❌ MISSING | |
| Performance metrics | 🔶 PARTIAL | Chat analytics (response time, resolution); no staff KPI dashboard |
| Payroll or salary management | ❌ MISSING | |

**Current RBAC roles:**

| Role | Value | Access |
|------|-------|--------|
| Super Admin | `superadmin` | All permissions; staff CRUD; file manager; sandbox; cache flush |
| Staff | `staff` | Explicit `permissions[]` array only |

---

## SECTION 4 — DATABASE & API GAP ANALYSIS

### MongoDB Models — Main Store (`backend/src/models/`)

#### Summary Table

| Model | Path | Key Fields | Indexes | Issues | Suggested Additions |
|-------|------|------------|---------|--------|---------------------|
| **Admin** | `admin.js` | username, password, role, permissions[], status, 2FA fields, branding | role, status, username unique | — | `department`, `assignedRegions` for HRM |
| **AdminSession** | `adminSession.js` | sessionId, adminUsername, device, status | sessionId, adminUsername, status | — | — |
| **User** | `user.js` | email, mobile, wallet, loyaltyPoints, addresses[], wishlist[] | email unique, mobile, googleId sparse, isDeleted | Legacy name migration hook | `referralCode`, `referredBy`, `customerTags[]`, `lifetimeValue` |
| **UserSession** | `userSession.js` | sessionId, userId, device, ip | sessionId, userId | — | — |
| **Product** | `product.js` | productId, name, price, buyingPrice, stockQuantity, lowStockThreshold, variants[]{sku,stock}, brand, category | Text index, category, price, brand, stockQuantity | **Index on `slug` but no slug field** | `supplierId`, `warehouseId`, `reorderPoint`, `costHistory[]` |
| **Order** | `order.js` | orderId, user, items[], status, payment{}, courier*, returnItems[], totalBuyingPrice | orderId, user, status, createdAt, payment.transactionId | Status is free String (no enum) | `assignedStaffId`, `fulfillmentPriority`, `warehouseId` |
| **Cart** | `cart.js` | userId, items[]{productId, qty, variant*, selected} | — | No TTL/abandonment tracking | `lastActivityAt`, `abandonedNotifiedAt` |
| **Category** | `category.js` | name, slug, parentCategory, isFeatured, showInNavbar | Compound indexes on active/navbar/homepage | — | — |
| **Brand** | `brand.js` | name, slug, status | slug | — | `supplierId` link |
| **Coupon** | `coupon.js` | code, discountType, usageLimit, usedBy[] | code unique | — | `segmentTarget`, `campaignId` |
| **Review** | `review.js` | userId, productId, orderId, rating, isHidden | productId | — | — |
| **Note** | `note.js` | user, type, amount, category, tags[] | user+createdAt, user+type | — | — |
| **PaymentMethod** | `PaymentMethod.js` | code, type, provider, apiConfig (encrypted) | isActive+sortOrder | — | — |
| **Setting** | `Setting.js` | cashback, points ratios, VIP thresholds, flash sale | key=master | Dual settings confusion | Merge with Settings long-term |
| **Settings** | `Settings.js` | delivery, SMS, courier, rate limit, payment gateways | key=global | Dual settings confusion | — |
| **FooterSettings** | `FooterSettings.js` | columns[], socialLinks[], paymentBadges | key unique | — | — |
| **PageContent** | `PageContent.js` | slug, title, bodyMarkdown/Html | slug unique | — | — |
| **NavbarLink** | `NavbarLink.js` | title, url, slug, pageHtml | isPublished+sortOrder | — | — |
| **Attribute** | `attribute.js` | name, slug, values[] | slug | — | — |
| **Banner** | `banner.js` | title, imageUrl, position, isActive | — | — | — |
| **ContactMessage** | `ContactMessage.js` | name, email, message, status | status, isRead, createdAt | — | `assignedTo`, `ticketNumber` for CRM |
| **Newsletter** | `newsletter.js` | email, tags[], unsubscribeToken | email unique | — | — |
| **EmailCampaign** | `emailCampaign.js` | title, subject, htmlContent, stats | — | — | `channel` (sms/whatsapp) |
| **SecurityLog** | `securityLog.js` | action, actor, actorType, ip, details | createdAt desc | — | `resourceType`, `resourceId` |
| **LoginAttempt** | `loginAttempt.js` | username, ip, status | ip+status+createdAt; TTL 30d | — | — |
| **BlacklistedIP** | `blacklistedIp.js` | ip, reason, expiresAt | ip unique; TTL | — | — |
| **StockAlert** | `stockAlert.js` | lowStockProducts[], alertsSent | — | — | — |
| **wishlist** | `wishlist.js` | (embedded schema only) | — | — | — |

### Chat Microservice Models (`ecommerce-chat/models/`)

| Model | Purpose | Key Fields |
|-------|---------|------------|
| ChatRoom | Conversation rooms | user_id, status, priority, labels[], customer_profile, order metadata, queue metrics |
| ChatMessage | Messages | message_type, sender, read_by[], attachments, is_internal |
| Agent | Chat staff | adminId (link to store admin), role, avatar |
| ChatSettings | Bot config | botName, welcomeMessage, quickReplies[] |
| CannedResponse | Quick replies | title, content, category |
| AIKnowledgeBase | FAQ entries | question, answer, category |
| StoreUser | Read-only User populate | For avatar enrichment |

**Gap:** Separate MongoDB (`ecommerce_chat`) — no unified user/staff directory.

### API Routes Summary

**Total REST endpoints (approximate):** ~**230** across 27 route files

| Mount | Route File | Endpoints | Auth Pattern |
|-------|-----------|-----------|--------------|
| `/api/admin` | adminRoutes.js | ~100 | JWT + RBAC (mostly) |
| `/api/customer`, `/api/users` | userRoutes.js | ~23 | Mixed public + verifyUser |
| `/api/auth` | authRoutes.js | ~13 | Public + verifyUser |
| `/api/orders` | orderRoutes.js | ~14 | Mixed |
| `/api/products` | productRoutes.js | ~8 | Public read; admin write |
| `/api/categories` | categoryRoutes.js | ~14 | Public read; admin write (no RBAC on admin) |
| `/api/cart` | cartRoutes.js | ~8 | All verifyUser |
| `/api/store` | storeRoutes.js | ~11 | All public |
| `/api/payments` | paymentRoutes.js | ~4 | Public (IPN signature verified) |
| `/api/finance` | financeRoutes.js | ~5 | Finance JWT |
| `/api/internal` | internalRoutes.js | ~4 | API key |
| `/sys` | emergencyRoutes.js | ~8 | URL token + master key |
| Others | coupons, reviews, banners, notes, etc. | ~40 | Mixed |

### API Gap Flags

| Issue | Severity | Details |
|-------|----------|---------|
| **Unprotected admin routes** | Medium | Category admin, banner admin, newsletter admin — `verifyAdmin` only, no `checkPermission` |
| **Public seed endpoint** | Low | `POST /api/products/seed-demo` — prod-gated but public |
| **Order status as free string** | Low | No enum validation on `order.status` |
| **Missing pagination** | Medium | Some list endpoints return full collections (customers, products with limits but inconsistent) |
| **N+1 query risks** | Medium | Customer list with per-user order stats aggregation; product list with brand populate |
| **Dual settings APIs** | Low | `/api/admin/settings` vs `/api/admin/master-settings` — two singleton models |
| **Finance separate auth** | Info | By design — separate password from admin panel |
| **Chat agent vs store staff** | Medium | Two user systems without SSO |

---

## SECTION 5 — ADMIN PANEL UI AUDIT

### Current Admin Pages (Store Admin SPA)

Assembled from `client/admin/partials/` via `adminPageBuilder.js`:

| Section ID | Page / Feature | Permission |
|------------|----------------|------------|
| `view-overview` | Dashboard KPIs & charts | view_analytics |
| `view-customers` | Customer list + VIP segments | manage_customers |
| `view-orders` | Live orders, POS, courier, returns | manage_orders |
| `view-messages` | Contact inquiry inbox | manage_settings |
| `view-chat` | Legacy live chat workspace | (chat agent token) |
| `view-chat-analytics` | Chat volume/resolution charts | (chat agent token) |
| `view-canned-responses` | Quick reply CRUD | (chat agent token) |
| `view-add-product` | Add product form | manage_inventory |
| `view-manage-products` | Product table + bulk import | manage_inventory |
| `manage-category` | Category tree | manage_catalog |
| `manage-brands` | Brand CRUD | manage_catalog |
| `manage-navbar-links` | Navbar + CMS pages | manage_catalog |
| `manage-attributes` | Product attributes | manage_catalog |
| `manage-coupons` | Coupon management | manage_coupons |
| `view-reviews` | Review moderation | manage_orders |
| `view-newsletter-subscribers` | Newsletter list | verifyAdmin |
| `view-newsletter-campaigns` | Email campaigns | verifyAdmin |
| `view-staff` | Staff accounts | manage_staff (superadmin) |
| `view-file-manager` | Server file browser | superadmin |
| `view-security` | Security logs | manage_security |
| `view-sessions` | Admin sessions | all admins |
| `view-audit` | IP blacklist & audit | manage_security |
| `view-master-settings` | Shipping, loyalty, VIP, integrations | manage_settings |
| `view-banners` | Hero banner manager | verifyAdmin |
| `view-settings` | Admin profile, branding, payments, footer, CMS | mixed |

**External admin apps (not in SPA):**
- `/finance-analytics` — Finance dashboard
- `/admin/payment-reconciliation` — Payment reconciliation
- `/chat-admin` — React chat agent dashboard (separate SPA)

### Navigation Issues (Scattered / Messy)

1. **Flat 20+ sidebar items** — no ERP/CRM/HRM grouping
2. **Chat features split** — 3 items in store admin + separate React app at `/chat-admin`
3. **Finance tools external** — sidebar CTAs leave the SPA
4. **Catalog + Newsletter nested** — good pattern, but inconsistent with flat top-level items
5. **Security Suite nested** — good, but sessions/audit buried
6. **Duplicate chat admin** — legacy `view-chat` vs React `/chat-admin`
7. **No breadcrumbs** — SPA section switching only via sidebar
8. **Permission gating inconsistent** — some sections use JS hide; some routes lack backend RBAC

### Proposed Clean Navigation Structure

```
Admin Panel
├── Dashboard (overview KPIs)
├── 🏭 ERP
│   ├── Inventory Management          ← view-manage-products, view-add-product, bulk import
│   ├── Orders & Fulfillment          ← view-orders, POS, returns, master editor
│   ├── Courier & Tracking            ← (within orders-actions) + dedicated page
│   ├── Invoices & Billing            ← orders-invoice, payment reconciliation
│   ├── Financial Reports             ← finance-analytics (integrate into SPA)
│   └── Vendors & Suppliers           ← NEW (missing)
├── 🤝 CRM
│   ├── Customer Database             ← view-customers
│   ├── Marketing Campaigns           ← newsletter subscribers + campaigns + NEW abandoned cart
│   ├── Support Tickets               ← view-messages + /chat-admin (unify)
│   ├── Reviews & Feedback            ← view-reviews
│   └── Loyalty Program               ← master-settings rewards + wallet admin
├── 👥 HRM
│   ├── Staff Management              ← view-staff
│   ├── Roles & Permissions           ← (within view-staff)
│   ├── Audit Logs                    ← view-security, view-audit
│   ├── Task Assignment               ← NEW (chat assign is partial)
│   └── Attendance & Performance      ← NEW (chat analytics partial)
└── ⚙️ Settings
    ├── Store Branding & CMS          ← view-settings, catalog navbar, pages
    ├── Payment Methods               ← settings-payments
    ├── Shipping & Delivery           ← view-master-settings
    ├── Security & 2FA                ← view-security, settings-2fa
    ├── Hero Banners                  ← view-banners
    ├── Catalog (Categories/Brands)   ← manage-category, manage-brands, attributes, coupons
    └── System (Cache, Sandbox)       ← view-master-settings, superadmin tools
```

### Existing → Proposed Menu Mapping

| Proposed Item | Current Location |
|---------------|------------------|
| Dashboard | `view-overview` |
| Inventory Management | `view-add-product`, `view-manage-products` |
| Orders & Fulfillment | `view-orders` |
| Courier & Tracking | Embedded in `orders-actions.js` |
| Invoices & Billing | `modals-invoice.html`, `/admin/payment-reconciliation` |
| Financial Reports | `/finance-analytics` |
| Customer Database | `view-customers` |
| Marketing Campaigns | `view-newsletter-*` |
| Support Tickets | `view-messages`, `/chat-admin`, `view-chat` |
| Reviews & Feedback | `view-reviews` |
| Loyalty Program | `view-master-settings` (rewards section) |
| Staff Management | `view-staff` |
| Roles & Permissions | `view-staff` (permission checkboxes) |
| Audit Logs | `view-security`, `view-audit`, `view-sessions` |
| Store Branding | `view-settings` |
| Catalog | `view-catalog.html` submenu |
| Hero Banners | `view-banners` |
| File Manager | `view-file-manager` (superadmin) |

---

## SECTION 6 — MOBILE APP AUDIT

### All Screens (23)

| Screen | ERP | CRM | HRM | API Dependencies |
|--------|-----|-----|-----|------------------|
| HomeScreen | — | Marketing | — | `/store/banners`, `/store/flash-sale`, `/categories/homepage` |
| ShopScreen | Catalog | — | — | `/products/search` |
| ProductDetailsScreen | Inventory view | Reviews | — | `/products/:id`, `/reviews/:id` |
| CartScreen | — | — | — | `/cart/*` |
| CheckoutScreen | Orders | — | — | `/orders`, `/payments/*`, `/coupons/apply` |
| OrderSuccessScreen | Orders | — | — | — |
| OrdersScreen | Orders | — | — | `/orders/my-orders` |
| OrderDetailsScreen | Fulfillment | — | — | `/orders/:id`, cancel, return, invoice |
| WishlistScreen | — | CRM | — | `/customer/wishlist` |
| LoginScreen | — | — | — | `/auth/login` |
| RegisterScreen | — | — | — | `/auth/register` |
| ForgotPasswordScreen | — | — | — | `/auth/forgot-password`, reset |
| ProfileScreen | — | CRM hub | — | `/customer/profile` |
| EditProfileScreen | — | CRM | — | Profile update, OTP |
| ChangePasswordScreen | — | — | — | `/customer/change-password` |
| SecuritySettingsScreen | — | — | — | `/auth/sessions` |
| DeleteAccountScreen | — | — | — | `DELETE /auth/account` |
| AddressesScreen | — | CRM | — | `/customer/addresses` |
| WalletScreen | — | Loyalty | — | Profile wallet fields |
| LoyaltyPointsScreen | — | Loyalty | — | `/customer/convert-points` |
| NotebookScreen | — | Personal CRM | — | `/api/notes` |
| LegalScreen | — | CMS | — | `/store/pages/:slug` (WebView) |
| LiveSupportScreen | — | Support | — | Chat API `/chat/start`, socket |

### Navigation Structure

**Tabs:** Home | Shop | Cart | Orders | Profile  
**Stack routes:** ProductDetails, Checkout, OrderSuccess, OrderDetails, Wishlist, Auth screens, Profile sub-screens, Legal, LiveSupport

### API Issues

| Issue | Severity | Location |
|-------|----------|----------|
| Hardcoded production API | **High** | `mobile/src/services/api.js` → `https://eonlinebazar.com/api` |
| No `.env.example` | Medium | Missing `EXPO_PUBLIC_API_URL` docs |
| Orders API module incomplete | Low | Create/list in `useOrderStore`, not `api/orders.js` |
| No dedicated search screen | Low | Search via Shop tab params |
| No public order track screen | Low | Tracking in OrderDetails only |
| Chat URLs env-dependent | Medium | `chatConfig.js` — needs proxy in dev |

### Screens Needing New Backend Endpoints

| Screen / Feature | Needed Endpoint | Status |
|------------------|-----------------|--------|
| Abandoned cart recovery | `POST /api/cart/abandon-notify` | ❌ Not built |
| Referral sharing | `GET /api/customer/referral` | ❌ Not built |
| Push notifications | FCM token registration | ❌ Not built |
| Native contact form | Already have `POST /api/contact` | ✅ Exists, no mobile screen |

---

## SECTION 7 — SECURITY & PERFORMANCE AUDIT

### Unprotected / Weakly Protected Routes

| Route | Risk | Recommendation |
|-------|------|----------------|
| `POST /api/products/seed-demo` | Demo data injection | Require admin auth always |
| Category/banner admin routes | Staff without catalog permission | Add `checkPermission('manage_catalog')` |
| Newsletter admin routes | Any admin can send campaigns | Add `manage_settings` or new permission |
| `GET /api/orders/track` | Public order lookup | Acceptable; ensure minimal data exposure |
| `POST /api/payments/initiate` | Order spam | Already rate-limited (3/min) |
| Emergency `/sys/:token/*` | Full system control | Ensure strong tokens; rotate regularly |

### Input Validation & Sanitization

| Layer | Status |
|-------|--------|
| express-mongo-sanitize | ✅ Applied |
| Custom XSS sanitizer | ✅ Angle brackets stripped (passwords/URLs skipped) |
| HPP | ✅ Applied |
| Mongoose schema validation | 🔶 Partial — order.status is free string |
| File upload limits | ✅ Multer + Cloudinary; 10M nginx client_max_body_size for chat |

### Exposed Sensitive Data

| Area | Status |
|------|--------|
| Admin `toSafeObject()` | ✅ Password/OTP fields excluded |
| Payment gateway credentials | ✅ Encrypted via cryptoVault |
| Customer profile in public APIs | ✅ Auth required |
| Order track endpoint | 🔶 Review — may expose customer phone/address |
| Internal API | ✅ API key guarded |

### Rate Limiting

| Limiter | Scope |
|---------|-------|
| Dynamic API limiter | All `/api/*` — configurable via Settings (default 1000/15min) |
| Auth limiter | Login/register/forgot — 10/15min |
| Order limiter | POST orders — 3/min |
| Coupon limiter | Apply — 5/min |
| Admin login | 20/15min + auto IP ban after 5 failures |
| Emergency | 10/15min |
| Bypass | localhost, admin JWT (configurable) |

### Performance Concerns

| Issue | Location | Impact |
|-------|----------|--------|
| Full customer list without cursor pagination | `getAllCustomers` | Large datasets |
| Product text search without projection | `searchProducts` | Memory on large catalogs |
| Sitemap generation | `seoRoutes.js` | Mitigated by Redis cache |
| Dual MongoDB for chat | ecommerce-chat | Operational complexity |
| No compound index on Order `(user, status, createdAt)` | order.js | Slow my-orders queries at scale |
| Product slug index without field | product.js | Dead index |

### Missing Database Indexes (Recommended)

```javascript
// Order — customer order history
{ user: 1, status: 1, createdAt: -1 }

// Cart — abandoned cart queries
{ userId: 1, updatedAt: -1 }

// User — segmentation queries
{ loyaltyPoints: -1 }, { walletBalance: -1 }

// Review — moderation queue
{ isHidden: 1, createdAt: -1 }

// ContactMessage — ticket inbox
{ status: 1, createdAt: -1 }
```

---

## SECTION 8 — PHASED IMPLEMENTATION ROADMAP

### Phase 1 (Week 1–2): Foundation — HRM & RBAC

**Goals:** Unify staff identity, tighten RBAC gaps, enhance audit trail.

| Task | Files to Create/Modify | Dependencies |
|------|------------------------|--------------|
| Add RBAC to category/banner/newsletter admin routes | `categoryRoutes.js`, `bannerRoutes.js`, `adminRoutes.js` | None |
| Extend SecurityLog with resourceType/resourceId | `securityLog.js`, `securityLogger.js`, controllers | None |
| Staff activity dashboard (who changed what) | NEW `staffAuditController.js`, `view-staff-audit.html`, `settings-staff-audit.js` | SecurityLog extension |
| Link chat Agent ↔ store Admin (SSO) | `agentResolver.service.js`, `staffController.js` | JWT_SECRET shared |
| Order assignment to staff | `order.js` (+assignedStaffId), `orderAdminController.js`, `orders-actions.js` | RBAC |
| Permission for marketing | NEW `manage_marketing` in `permissions.js` | RBAC migration |

### Phase 2 (Week 3–4): ERP Core

**Goals:** Vendor management, purchase orders, warehouse basics, financial consolidation.

| Task | Files to Create/Modify | Dependencies |
|------|------------------------|--------------|
| Supplier model + CRUD | NEW `supplier.js`, `supplierController.js`, `supplierRoutes.js` | Admin UI section |
| Purchase order model + workflow | NEW `purchaseOrder.js`, controller, routes | Supplier model |
| Product.supplierId link | `product.js`, `products-form.js` | Supplier model |
| Warehouse/location model (single→multi) | NEW `warehouse.js`, stock allocation on Product | Migration script |
| Integrate finance-analytics into admin SPA | `core-nav.js`, `view-finance.html`, embed or refactor | Finance JWT bridge |
| Order status enum validation | `order.js`, `orderAdminController.js` | Data migration for legacy statuses |
| Fix product slug field or remove dead index | `product.js` | Decision needed |

### Phase 3 (Week 5–6): CRM & Automation

**Goals:** Marketing automation, abandoned cart, unified support, referrals.

| Task | Files to Create/Modify | Dependencies |
|------|------------------------|--------------|
| Abandoned cart model + cron | `cart.js`, NEW `abandonedCartJob.js`, email/SMS templates | Mailer, SMS service |
| Referral system | `user.js`, NEW `referralController.js`, mobile + web UI | Wallet service |
| Unified support inbox | Merge `view-messages` + chat into CRM section | Chat proxy stable |
| Segment-based campaigns | `emailCampaign.js`, `newsletterAdminController.js` | Customer segments exist |
| WhatsApp campaign adapter | Extend `whatsappService.js` | Provider API keys |
| Support ticket lifecycle | `ContactMessage.js` (+ticketNumber, assignedTo) | CRM UI |
| Deprecate legacy `view-chat` | Remove `chat-admin.js` from store admin; redirect to `/chat-admin` | React chat admin complete |

### Phase 4 (Week 7–8): UI Restructuring & Polish

**Goals:** ERP/CRM/HRM navigation, mobile env docs, performance indexes.

| Task | Files to Create/Modify | Dependencies |
|------|------------------------|--------------|
| Rebuild admin sidebar with grouped nav | `sidebar.html`, `core-nav.js`, `_layout.css` | Phase 1–3 features mapped |
| Admin breadcrumb component | NEW `core-breadcrumb.js` | Nav restructure |
| Mobile `.env.example` | NEW `mobile/.env.example` | None |
| Database index migration script | NEW `scripts/addEnterpriseIndexes.js` | Index list from Section 7 |
| Consolidate Settings models | `Setting.js` + `Settings.js` → unified API | Careful migration |
| Admin dashboard ERP/CRM/HRM widgets | `view-overview.html`, `admin-dashboard.js` | Analytics APIs |
| Performance: cursor pagination on customers/products | Controllers + frontend tables | None |
| Documentation update | `ARCHITECTURE.md`, `REFACTOR_MAP.md` | All phases |

---

## SECTION 9 — SUMMARY STATISTICS

| Category | ✅ Complete | 🔶 Partial | ❌ Missing | Total |
|----------|------------|-----------|-----------|-------|
| **ERP Features** | 4 | 1 | 3 | **8** |
| **CRM Features** | 4 | 2 | 2 | **8** |
| **HRM Features** | 4 | 2 | 2 | **8** |
| **API Endpoints** | ~200 | ~20 (RBAC gaps) | ~15 (enterprise gaps) | **~235** |
| **Admin Pages** | 22 | 3 (external/chat dup) | 5 (enterprise) | **30** |
| **Mobile Screens** | 21 | 2 (search, track) | 0 broken | **23** |

### Repository Component Counts

| Component | Count |
|-----------|-------|
| Backend Mongoose models | 28 |
| Chat microservice models | 7 |
| Backend route files | 27 |
| Backend controllers | 61 |
| Backend services | 23 |
| Admin JS modules | 34 |
| Admin view partials | 16 |
| Storefront HTML pages | 21 |
| Mobile screens | 23 |
| Mobile API helper files | 14 |
| React chat admin pages | 5 |
| Cron jobs | 2 |
| Jest test files | Multiple in `tests/` |

### Critical Findings (Top 10)

1. **Dual chat admin UIs** — legacy store admin + React `/chat-admin` duplicate effort
2. **Dual staff systems** — store Admin vs chat Agent without unified SSO
3. **Hardcoded mobile production API** — local dev friction
4. **RBAC gaps** — category, banner, newsletter admin routes lack permission checks
5. **No vendor/PO/warehouse** — ERP incomplete for wholesale operations
6. **No abandoned cart / referral** — CRM automation gaps
7. **Finance apps outside admin SPA** — fragmented navigation
8. **Dual settings models** — `Setting` vs `Settings` confusion
9. **Product slug dead index** — schema/index mismatch
10. **Order status free string** — no enum validation

---

## APPENDIX A — Microservices Architecture

```
                    ┌─────────────────────────────────────┐
                    │           Nginx (443/SSL)            │
                    └──────────┬──────────────┬───────────┘
                               │              │
              /api/* (store)   │   /api/chat-admin/*
              /chat-api/*      │   /chat-socket/*
                               ▼              ▼
                    ┌──────────────┐  ┌──────────────┐
                    │ Store Backend│  │ ecommerce-   │
                    │ :5000        │  │ chat :5001   │
                    │ (Express)    │  │ (Express)    │
                    └──────┬───────┘  └──────┬───────┘
                           │                  │
                           ▼                  ▼
                    ┌──────────────┐  ┌──────────────┐
                    │ MongoDB      │  │ MongoDB      │
                    │ (main store) │  │ (ecommerce_  │
                    │              │  │  chat)       │
                    └──────────────┘  └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ Redis (opt)  │
                    └──────────────┘

Clients:
  • Web storefront (client/*.html)
  • Store admin SPA (GET /admin)
  • Chat admin React (GET /chat-admin)
  • Mobile app (Expo → /api)
  • Chat widget (JS → chat proxy)
```

---

## APPENDIX B — Files Scanned

This audit scanned (non-exhaustive list of top-level areas):

- `backend/src/` — all models, routes, controllers, middlewares, services, jobs
- `client/` — all HTML, admin partials, JS modules, CSS barrels
- `mobile/src/` — all screens, navigation, API, stores, components
- `ecommerce-chat/` — models, routes, socket, services
- `admin-dashboard/src/` — pages, components, services
- Root config — `package.json`, `docker-compose.yml`, `Dockerfile`, `devops/nginx.conf`
- Documentation — `ARCHITECTURE.md`, `REFACTOR_MAP.md`, `ADMIN_NOTES.md`

**Folders confirmed present:** `backend/`, `client/`, `mobile/`, `ecommerce-chat/`, `admin-dashboard/`, `devops/`, `public/`, `scripts/`, `tests/`

**Folders NOT present:** Top-level `admin/` (admin is under `client/admin/`), `client/components/` (components are inline JS modules)

---

*End of audit. No existing files were modified during this discovery.*







