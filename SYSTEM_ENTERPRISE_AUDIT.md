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
| Footer settings | ✅ | `FooterSettings.js`, `footerSettingsController.js`, `settings-footer.js` | Missing local icon URLs sanitized on read (`sanitizeFooterIconUrl` in `footerIconPaths.js`) so deleted upload files no longer 404 in the browser |
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
| Advanced P&L report | ✅ | `profitLossController.js`, `exportController.js`, `erp-profit-loss.js`, `view-finance.html` | Embedded SPA — revenue/COGS/courier/expenses/margin, SVG charts, PDF/CSV export (superadmin) |
| Expense ledger | ✅ | `expense.js`, `expenseController.js` | Category CRUD + summary; feeds P&L |
| Customer management | ✅ | `customerAdminController.js`, `view-customers.html`, `customers-*.js` | VIP segmentation |
| Staff management | ✅ | `staffController.js`, `view-staff.html`, `admin-staff.js` | Super-admin only |
| RBAC permissions | ✅ | `rbac.js`, `permissions.js`, `admin.js` | 9 granular permissions |
| Admin 2FA | ✅ | `twoFactorController.js`, `settings-2fa.js` | TOTP + SMS |
| Security logs & audit | ✅ | `securityLog.js`, `loginAttempt.js`, `view-security.html` | IP blacklist, geo-fence |
| Admin sessions | ✅ | `adminSession.js`, `sessionController.js`, `view-sessions.html` | |
| Bulk product import | ✅ | `bulkImportController.js`, `products-bulk.js` | CSV/Excel |
| AI product assist | ✅ | `adminController.aiProductAssist` | OpenAI integration |
| Manual POS orders | ✅ | `orderAdminController.createManualOrder`, `orders-pos.html`, `orders-pos.js`, `sidebar.html` | Walk-in/phone orders; ERP sidebar POS launch; barcode/SKU search + quick grid; customer phone lookup + quick-add (`GET /api/admin/customers?search=`, `POST /api/admin/customers/quick`); item/order discounts; split payment (Cash/bKash/Card/Split); receipt with discount + payment breakdown |
| Invoice generation (PDF) | ✅ | `orderCustomerController.downloadOrderInvoice`, `orders-invoice.js` | PDFKit |
| Courier integration | ✅ | `admin/courierController.js`, `courierService.js`, `courierSyncService.js`, `courierSyncJob.js`, `orders-actions.js` | Steadfast, Pathao, RedX; Book & Sync + 3h auto-poll cron + ↻ Refresh UI; Pathao/RedX status APIs wired |
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

### Phase 5 HRM Module (completed 2026-09-11)

| Feature | Status | Files | Notes |
|---------|--------|-------|-------|
| Attendance register + marking | ✅ | `attendance.js`, `attendanceController.js`, `view-hrm-attendance.html` | One row per staff per day; re-marking updates |
| Staff self clock-in / clock-out | ✅ | `attendanceController.clockIn/clockOut` | Optional mobile GPS; hours auto-calculated |
| Shift roster + late detection | ✅ | `shift.js`, `view-hrm-attendance.html` (Shifts tab) | Grace period policy; one protected default shift |
| Attendance summary + late report | ✅ | `attendanceController.getAttendanceSummary/getLateReport` | Monthly aggregate per staff |
| Payroll generation from attendance | ✅ | `payroll.js`, `payrollController.js`, `view-hrm-payroll.html` | Pro-rated base + overtime + bonus − deductions |
| Payroll approval workflow | ✅ | `approvePayroll`, `markPaid` | draft → approved → paid, each step one-way |
| PDF pay slip | ✅ | `paySlipPdf.js` | PDFKit, same layout language as order invoice |
| Salary configuration | ✅ | `admin.js` employment fields, `updateSalaryConfig` | No separate salary-config collection |
| Leave applications + approval | ✅ | `leave.js`, `leaveController.js`, `view-hrm-leaves.html` | Approval stamps holiday attendance rows |
| Leave balances + calendar | ✅ | `getLeaveBalance`, `getLeaveCalendar` | Annual allowance per type; month grid view |
| HRM dashboard widget | ✅ | `enterpriseSummaryController.js`, `view-overview.html` | Attendance today, pending leaves, payroll status |
| 1-click system access provisioning | ✅ | `employee.js` (`linkedAdminId`), `admin.js` (`employeeRef`), `employeeController.grantSystemAccess/revokeSystemAccess/getAccessStatus`, `view-hrm-employees.html`, `hrm-employees.js` | Grant Access modal from employee table; auto-suspend linked admin on terminate/revoke |

### Remaining / Out of Scope

| Feature | Status | Notes |
|---------|--------|-------|
| Product `slug` field | 🔶 | Index exists but no schema field |

---

## SECTION 3 — ENTERPRISE CATEGORIZATION MATRIX

### 🏭 ERP (Enterprise Resource Planning)

| Capability | Status | Evidence |
|------------|--------|----------|
| Inventory & stock management | ✅ COMPLETE | `product.js`: `stockQuantity`, `stock`, `lowStockThreshold`, variant `sku`/`stock`; bulk import; stock alert cron |
| Order lifecycle management | ✅ COMPLETE | Status: Pending → Processing → Shipped → Out for Delivery → Delivered; Cancel/Return/Refund flows; `notificationsSent` flags |
| POS (walk-in / phone orders) | ✅ COMPLETE | `orders-pos.html` + `orders-pos.js` + ERP sidebar link — barcode/SKU search, quick grid, customer lookup/quick-add, item & order discounts (flat/%), split payment + change, receipt breakdown; `GET /api/products?search=`, `GET /api/admin/customers?search=`, `POST /api/admin/customers/quick` |
| Courier & logistics integration | ✅ COMPLETE | `courierService.js` + `courierSyncService.js` + `admin/courierController.js` — Steadfast/Pathao/RedX Book & Sync, 3h auto-poll cron, status map + wallet cashback on delivery, SMS + WhatsApp; `orders-actions.js` Book & Sync + ↻ Refresh |
| Invoice generation | ✅ COMPLETE | `GET /api/orders/:id/invoice` — PDFKit; POS receipt modal (`showPOSInvoiceModal`, `printPOSInvoice`, `downloadPOSInvoice`) |
| Financial reports (Advanced P&L) | ✅ COMPLETE | `profitLossController.js` — Delivered revenue, returns, COGS, courier from Expense ledger, expenses-by-category, cashback/discounts/return loss, net margin, trend series, top/worst products; Chart.js UI in `erp-profit-loss.js` + `view-finance.html`; PDF/CSV via `exportController.js` (superadmin) |
| Operating expense tracking | ✅ COMPLETE | `expense.js`, `expenseController.js`, `view-erp-expenses.html`, `erp-expenses.js` — CRUD, receipt upload, category summary + monthly trend; feeds P&L |
| Vendor/supplier management | ✅ COMPLETE | `supplier.js`, `supplierController.js`, admin ERP UI |
| Purchase orders | ✅ COMPLETE | `purchaseOrder.js`, `purchaseOrderController.js`, PO workflow |
| Warehouse/location management | ✅ COMPLETE | `warehouse.js`, `warehouseController.js`, multi-location stock |

### 🤝 CRM (Customer Relationship Management)

| Capability | Status | Evidence |
|------------|--------|----------|
| Customer database with purchase history | ✅ COMPLETE | `user.js` + admin customer detail with orders; chat CRM panel |
| Customer segmentation/analytics | ✅ COMPLETE | VIP / Frequent / Inactive segments + Silver/Gold/Platinum loyalty tiers; thresholds in `Setting.js`; tier counts on enterprise dashboard |
| Loyalty points / rewards | ✅ COMPLETE | `loyaltyPoints`, `walletBalance`, cashback on delivery, convert points API |
| Customer loyalty tiers (Silver/Gold/Platinum) | ✅ COMPLETE | `loyaltyTierService.js`, `loyaltyTierJob.js`, tier settings in `view-loyalty-program.html`, tier-aware cashback, admin + mobile display |
| SMS / Email / WhatsApp marketing | 🔶 PARTIAL | Newsletter campaigns (`EmailCampaign`); order SMS; review reminder cron; no WhatsApp broadcast campaigns |
| Live chat or support ticket system | ✅ COMPLETE (chat) | Full live chat stack; ❌ no formal ticket queue outside chat |
| Reviews & ratings system | ✅ COMPLETE | Product reviews, moderation, verified purchase, review reminders |
| Abandoned cart tracking | ✅ COMPLETE | `abandonedCartJob.js`, CRM dashboard |
| Referral system | ✅ COMPLETE | `referralController.js`, mobile + signup flow |

### 👥 HRM (Human Resource Management)

| Capability | Status | Evidence |
|------------|--------|----------|
| Staff/employee accounts | ✅ COMPLETE | `admin.js` staff role; `staffController.js`; 1-click HRM grant-access links `Employee.linkedAdminId` ↔ `Admin.employeeRef`; chat `Agent.model.js` (separate system) |
| Role-Based Access Control | ✅ COMPLETE | Roles: **`superadmin`**, **`staff`**; 9 permissions (see below) |
| Granular permissions | ✅ COMPLETE | `view_analytics`, `manage_orders`, `manage_inventory`, `manage_catalog`, `manage_coupons`, `manage_customers`, `manage_settings`, `manage_security`, `manage_staff` |
| Staff audit logs | ✅ COMPLETE | `SecurityLog`, `LoginAttempt`; admin security suite |
| Task & order assignment to staff | 🔶 PARTIAL | Chat room assign to agent; no general task/order assignment to warehouse staff |
| Attendance tracking | ✅ COMPLETE | `attendance.js`, `shift.js`, `attendanceController.js`; admin marking + staff clock-in/out with GPS, shift grace-period late detection, monthly summary and late report |
| Performance metrics | 🔶 PARTIAL | Chat analytics (response time, resolution); attendance/late reports per staff; no unified staff KPI dashboard |
| Payroll or salary management | ✅ COMPLETE | `payroll.js`, `payrollController.js`, `paySlipPdf.js`; attendance-driven generation, draft→approved→paid workflow, PDF pay slips, base salary on the Admin record |
| Leave management | ✅ COMPLETE | `leave.js`, `leaveController.js`; apply/approve/reject, annual balances per type, month calendar, approved leave stamped as holiday attendance |

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
| **Admin** | `admin.js` | username, password, role, permissions[], status, 2FA fields, branding, HRM employment record (`baseSalary`, `department`, `joiningDate`, `employeeId`) | role, status, username unique | — | `assignedRegions` for HRM |
| **Attendance** | `attendance.js` | staffId, date, clockIn/Out, hoursWorked, status, isLate, shift, gpsLocation | `{staffId,date}`, `{date,status}` | — | — |
| **Shift** | `shift.js` | name, startTime, endTime, gracePeriodMinutes, assignedStaff[], isDefault | isDefault, assignedStaff | — | — |
| **Payroll** | `payroll.js` | staffId, month, year, baseSalary, bonus, overtime, deductions, totalSalary, status | `{staffId,year,month}` unique, `{year,month,status}` | — | — |
| **Leave** | `leave.js` | staffId, leaveType, startDate, endDate, totalDays, status, approvedBy | `{staffId,startDate}`, `{status,startDate}`, `{startDate,endDate}` | — | — |
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
| **ERP Features** | 8 | 0 | 0 | **8** |
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
- Documentation — `ARCHITECTURE.md`, `REFACTOR_MAP.md`, `SYSTEM_ENTERPRISE_AUDIT.md`, `CHAT_AUDIT.md`, `AUDIT_REPORT.md`, `PROFILE_AUDIT.md`

**Folders confirmed present:** `backend/`, `client/`, `mobile/`, `ecommerce-chat/`, `admin-dashboard/`, `devops/`, `public/`, `scripts/`, `tests/`

**Folders NOT present:** Top-level `admin/` (admin is under `client/admin/`), `client/components/` (components are inline JS modules)

---

*End of audit. No existing files were modified during this discovery.*

---

## PHASE 2 AUDIT FINDINGS (appended)

# PHASE 2 AUDIT REPORT

**Audit date:** 2026-09-10  
**Scope:** Read-only full-system audit of EonlineBazar  
**Reference docs:** `ARCHITECTURE.md`, `SYSTEM_ENTERPRISE_AUDIT.md`  
**No source files were modified during this audit.**

---

## CRITICAL BUGS

### BUG 1 — Loyalty Program & Shipping & Payments show the same page (CRITICAL)

| Item | Detail |
|------|--------|
| **Symptom** | Clicking **Loyalty Program** (CRM) or **Shipping & Payments** (Settings) both open `view-master-settings`, which renders at the top of the page: **"System Settings → Announcement & Free Shipping"**. Users expect distinct destinations. |
| **Root cause 1 — Duplicate section ID** | Both sidebar items use the same `data-target="view-master-settings"`. There is only one DOM section for both links. |
| **Location** | `client/admin/partials/sidebar.html` lines 102–104 (Loyalty) and 161–163 (Shipping) |
| **Root cause 2 — Broken scroll target** | Loyalty sets `data-scroll-target="rewards-section"`, but **no element with `id="rewards-section"` exists**. The rewards form uses `id="form-system-rewards"` (line 420 of `view-master-settings.html`). `navigateAdminSection()` in `core-nav.js` (lines 580–586) scrolls to a missing ID, so the page stays at the top (Announcement card). |
| **Root cause 3 — Shared page metadata** | `ADMIN_PAGE_META['view-master-settings']` always shows title **"System Settings"** regardless of which sidebar link was clicked (`core-state.js` line 36). |
| **Root cause 4 — No deep-link differentiation** | Unlike `view-settings` items that carry `data-settings-tab` (also unhandled — see below), `view-master-settings` has no hash/sub-tab routing for shipping vs loyalty vs SMS vs courier. |

**Exact fix needed:**

1. **`client/admin/partials/sidebar.html`** — Keep Shipping on `view-master-settings`; give Loyalty either:
   - a dedicated section `view-loyalty-settings`, **or**
   - keep `view-master-settings` but fix scroll target to `form-system-rewards` and add `id="rewards-section"` on the rewards card wrapper.
2. **`client/admin/partials/view-master-settings.html`** ~line 420 — Add `id="rewards-section"` on the rewards card (or rename target in sidebar to `form-system-rewards`).
3. **`client/js/admin/modules/core-nav.js`** ~lines 573–586 — When navigating to `view-master-settings`, read `data-scroll-target` **and** update `ADMIN_PAGE_META` title from `data-breadcrumb` on the clicked item (Loyalty vs Shipping).
4. **Optional (recommended):** Split loyalty rewards + VIP thresholds into `view-loyalty-program.html` partial registered in `adminPageBuilder.js` `VIEW_PARTIALS`.

---

### BUG 1b — Settings sidebar tabs not routed (MEDIUM)

| Item | Detail |
|------|--------|
| **Symptom** | **Security & 2FA** and **Cache & Sandbox** sidebar items both open generic `view-settings` without switching tabs. |
| **Root cause** | Sidebar sets `data-settings-tab="security"` and `data-settings-tab="system"` (`sidebar.html` lines 164, 170) but `navigateAdminSection()` in `core-nav.js` never reads `data-settings-tab`. |
| **Fix** | In `core-nav.js` after showing `view-settings`, call existing tab-switch logic (similar to `settings-cms.js` tab handling ~line 1207) to activate the correct `.admin-settings-tab[data-tab="…"]`. |

---

### BUG 2 — “Empty” admin pages (investigation results)

| Page | HTML Partial | JS Module | Controller | Route | Actual UI Status | Why it feels empty |
|------|-------------|-----------|------------|-------|------------------|---------------------|
| **Suppliers** | ✅ `view-suppliers.html` | ✅ `erp-suppliers.js` (barrel: `admin-products.js`) | ✅ `supplierController.js` | ✅ `/api/admin/suppliers` | ⚠️ **Read-only table** — no Add/Edit/Delete UI | Table + headers exist; loads via `loadSuppliersSection()`. Shows spinner → data or "No suppliers found." **No create form.** |
| **Warehouses** | ✅ `view-warehouses.html` | ✅ `erp-warehouses.js` | ✅ `warehouseController.js` | ✅ `/api/admin/warehouses` | ⚠️ **Read-only table** | Same as suppliers — list only, no CRUD modals. |
| **Purchase Orders** | ✅ `view-purchase-orders.html` | ✅ `erp-purchase-orders.js` | ✅ `purchaseOrderController.js` | ✅ `/api/admin/purchase-orders` | ⚠️ **Read-only table** | List only; no Create PO / Receive workflow UI despite full backend workflow. |
| **Abandoned Carts** | ✅ `view-crm-abandoned.html` | ✅ `crm-abandoned.js` (barrel: `admin-customers.js`) | ✅ `crmController.js` | ✅ `/api/admin/crm/abandoned-carts` | ⚠️ **KPI cards only** — no cart list table | Shows 3 metric cards; **no per-cart table**, no manual recovery actions. |
| **Financial Reports** | ✅ `view-finance.html` | ✅ `erp-profit-loss.js` (barrel: `admin-products.js`) | ✅ `profitLossController.js` + `exportController.js` | ✅ `/api/admin/finance/profit-loss` (+ `/export-pdf`, `/export-csv`) | ✅ **REAL — embedded P&L** | Advanced P&L in SPA: date range, summary cards, inline-SVG donut + bar, top/worst product + expense tables, PDF/CSV export. `refreshMap` → `initProfitLossReport()`. Legacy iframe embed retained below. |

**Additional note:** If sections appear completely blank (not even headers), verify production cache: `adminPageBuilder.js` caches assembled HTML when `NODE_ENV=production` (lines 94–99). A stale cache would omit newly added partials until server restart.

---

### Sidebar vs registered section ID mismatches

| Sidebar `data-target` | In `adminPageBuilder.js` VIEW_PARTIALS? | DOM `id` exists? | Issue |
|----------------------|-------------------------------------------|------------------|-------|
| `view-overview` | ✅ | ✅ | OK |
| `view-manage-products` | ✅ (in `view-products.html`) | ✅ | OK |
| `view-add-product` | ✅ (in `view-products.html`) | ✅ | OK |
| `view-orders` | ✅ | ✅ | OK |
| `view-purchase-orders` | ✅ | ✅ | OK |
| `view-suppliers` | ✅ | ✅ | OK |
| `view-warehouses` | ✅ | ✅ | OK |
| `view-finance` | ✅ | ✅ | OK (placeholder UI) |
| `view-customers` | ✅ | ✅ | OK |
| `view-newsletter-subscribers` | ✅ (in `view-catalog.html`) | ✅ | OK |
| `view-newsletter-campaigns` | ✅ (in `view-catalog.html`) | ✅ | OK |
| `view-crm-abandoned` | ✅ | ✅ | OK |
| `view-messages` | ✅ | ✅ | OK |
| `view-reviews` | ✅ | ✅ | OK |
| `view-master-settings` | ✅ | ✅ | ⚠️ **Used twice** (Loyalty + Shipping) |
| `view-staff` | ✅ | ✅ | OK |
| `view-staff-audit` | ✅ (partial file `settings-staff-audit.html`) | ✅ | OK (filename ≠ id, but id matches sidebar) |
| `view-security` | ✅ (in `view-security.html`) | ✅ | OK |
| `view-audit` | ✅ (in `view-security.html`) | ✅ | OK |
| `view-sessions` | ✅ (in `view-security.html`) | ✅ | OK |
| `view-settings` | ✅ | ✅ | ⚠️ **Used 3×**; `data-settings-tab` not handled |
| `manage-category` | ✅ (in `view-catalog.html`) | ✅ | OK |
| `manage-brands` | ✅ (in `view-catalog.html`) | ✅ | OK |
| `manage-attributes` | ✅ (in `view-catalog.html`) | ✅ | OK |
| `manage-navbar-links` | ✅ (in `view-catalog.html`) | ✅ | OK |
| `manage-coupons` | ✅ (in `view-catalog.html`) | ✅ | OK |
| `view-banners` | ✅ | ✅ | OK |
| `view-file-manager` | ✅ | ✅ | OK |
| `view-chat` | ✅ | ✅ | Deprecated redirect notice (not in sidebar) |
| `view-chat-analytics` | ✅ | ✅ | Not in sidebar (legacy) |
| `view-canned-responses` | ✅ | ✅ | Not in sidebar (legacy) |

---

## ADMIN PANEL COMPLETENESS TABLE

| Section ID | HTML Partial | JS Module | Controller | Route | UI Status | Routing OK |
|------------|-------------|-----------|------------|-------|-----------|------------|
| `view-overview` | ✅ | ✅ `admin-dashboard.js` | ✅ `analyticsController`, `enterpriseSummaryController` | ✅ `/api/admin/dashboard-analytics`, `/enterprise-summary` | ✅ REAL | ✅ |
| `view-customers` | ✅ | ✅ `customers-table.js`, `customers-modals.js` | ✅ `adminController` | ✅ `/api/admin/customers` | ✅ REAL | ✅ |
| `view-orders` | ✅ | ✅ `orders-*.js` (barrel `admin-orders.js`) | ✅ `orderAdminController` | ✅ `/api/orders`, `/api/admin/orders/*` | ✅ REAL | ✅ |
| `view-add-product` | ✅ | ✅ `products-form.js` | ✅ `productController` | ✅ `/api/products` | ✅ REAL | ✅ |
| `view-manage-products` | ✅ | ✅ `products-table.js`, `products-bulk.js` | ✅ `productController` | ✅ `/api/products` | ✅ REAL | ✅ |
| `manage-category` | ✅ | ✅ `catalog-categories.js` | ✅ `categoryController` | ✅ `/api/categories/admin/*` | ✅ REAL | ✅ |
| `manage-brands` | ✅ | ✅ `catalog-brands.js` | ✅ `brandController` | ✅ `/api/brands` | ✅ REAL | ✅ |
| `manage-navbar-links` | ✅ | ✅ `catalog-navbar.js` | ✅ `navbarLinkController` | ✅ `/api/navbar-links/admin/*` | ✅ REAL | ✅ |
| `manage-attributes` | ✅ | ✅ `catalog-attributes.js` | ✅ `attributeController` | ✅ `/api/attributes` | ✅ REAL | ✅ |
| `manage-coupons` | ✅ | ✅ `catalog-coupons.js` | ✅ `couponController` | ✅ `/api/coupons` | ✅ REAL | ✅ |
| `view-newsletter-subscribers` | ✅ | ✅ `admin-newsletter.js` (standalone) | ✅ `newsletterAdminController` | ✅ `/api/admin/newsletter/subscribers` | ✅ REAL | ✅ |
| `view-newsletter-campaigns` | ✅ | ✅ `admin-newsletter.js` | ✅ `newsletterAdminController` | ✅ `/api/admin/newsletter/campaigns` | ✅ REAL | ✅ |
| `view-suppliers` | ✅ | ✅ `erp-suppliers.js` | ✅ `supplierController` | ✅ `/api/admin/suppliers` | ⚠️ List only | ✅ |
| `view-warehouses` | ✅ | ✅ `erp-warehouses.js` | ✅ `warehouseController` | ✅ `/api/admin/warehouses` | ⚠️ List only | ✅ |
| `view-purchase-orders` | ✅ | ✅ `erp-purchase-orders.js` | ✅ `purchaseOrderController` | ✅ `/api/admin/purchase-orders` | ⚠️ List only | ✅ |
| `view-finance` | ✅ | ✅ `erp-profit-loss.js` | ✅ `profitLossController` + `exportController` | ✅ `/api/admin/finance/profit-loss` (+ export-pdf/csv) | ✅ REAL embedded P&L | ✅ |
| `view-crm-abandoned` | ✅ | ✅ `crm-abandoned.js` | ✅ `crmController` | ✅ `/api/admin/crm/abandoned-carts` | ⚠️ KPIs only | ✅ |
| `view-messages` | ✅ | ✅ `messages-inbox.js` | ✅ `contactController` | ✅ `/api/admin/messages`, `/tickets/*` | ✅ REAL | ✅ |
| `view-reviews` | ✅ | ✅ `settings-reviews.js` | ✅ `reviewAdminController` | ✅ `/api/admin/reviews` | ✅ REAL | ✅ |
| `view-master-settings` | ✅ | ✅ `settings-cms.js` (`fetchMasterSettings`) | ✅ `masterSettingsController`, `settingsController` | ✅ `/api/admin/master-settings`, `/settings` | ✅ REAL (long form stack) | ❌ Loyalty/Shipping collision |
| `view-staff` | ✅ | ✅ `admin-staff.js` (standalone) | ✅ `staffController` | ✅ `/api/admin/staff/*` | ✅ REAL | ✅ |
| `view-staff-audit` | ✅ | ✅ `settings-staff-audit.js` | ✅ `staffAuditController` | ✅ `/api/admin/staff-audit` | ✅ REAL | ✅ |
| `view-security` | ✅ | ✅ `settings-security.js` | ✅ `adminSecurityController`, `adminController` | ✅ `/api/admin/logs` | ✅ REAL | ✅ |
| `view-sessions` | ✅ | ✅ `settings-security.js` | ✅ `adminSecurityController` | ✅ `/api/admin/sessions` | ✅ REAL | ✅ |
| `view-audit` | ✅ | ✅ `settings-security.js` | ✅ `adminSecurityController` | ✅ `/api/admin/login-history`, `/blacklist` | ✅ REAL | ✅ |
| `view-settings` | ✅ | ✅ `settings-platform.js`, `settings-2fa.js` | ✅ `adminController` | ✅ `/api/admin/profile`, `/platform-settings` | ✅ REAL | ⚠️ Tab attrs ignored |
| `view-banners` | ✅ | ✅ `admin-banner.js` (standalone) | ✅ `bannerController` | ✅ `/api/admin/banners` | ✅ REAL | ✅ |
| `view-file-manager` | ✅ | ✅ `admin-file-manager.js` (standalone) | ✅ `fileManagerController` | ✅ `/api/admin/files/*` | ✅ REAL | ✅ |
| `view-chat` | ✅ | ✅ `chat-admin.js` | N/A (deprecated) | N/A | ⚠️ Redirect notice | N/A (removed from nav) |
| `view-chat-analytics` | ✅ | ✅ `chat-admin.js` | Chat service | Chat proxy | ⚠️ Legacy | N/A |
| `view-canned-responses` | ✅ | ✅ `chat-admin.js` | Chat service | Chat proxy | ⚠️ Legacy | N/A |

---

## BACKEND API COMPLETENESS TABLE

| Route File | Endpoints (count) | Controller OK | RBAC Status | Issues |
|------------|-------------------|---------------|-------------|--------|
| `adminRoutes.js` | ~111 | ✅ | Mostly `verifyAdmin` + `checkPermission` | Newsletter subscriber list/delete: `verifyAdmin` only; AI assist, courier status, import template, cache pattern delete: no permission |
| `authRoutes.js` | 13 | ✅ | Public + `verifyUser` | OK |
| `productRoutes.js` | 7 | ✅ | Public read; admin write guarded | **`POST /seed-demo` is public** |
| `orderRoutes.js` | 14 | ✅ | Mixed | OK |
| `categoryRoutes.js` | 14 | ✅ | Write: `manage_catalog` ✅ | **`GET /admin/all`, `GET /admin/:id` — verifyAdmin only** |
| `cartRoutes.js` | 8 | ✅ | All `verifyUser` | OK |
| `couponRoutes.js` | 8 | ✅ | Admin: `manage_coupons` | Local duplicate `optionalVerifyUser` |
| `reviewRoutes.js` | 3 | ✅ | Mixed | OK |
| `bannerRoutes.js` | 7 | ✅ | Write: `manage_catalog` ✅ | **`GET /admin/banners` — verifyAdmin only** |
| `brandRoutes.js` | 4 | ✅ | Admin: `manage_catalog` | OK |
| `attributeRoutes.js` | 4 | ✅ | Admin: `manage_catalog` | OK |
| `navbarLinkRoutes.js` | 7 | ✅ | Admin: `manage_catalog` | OK |
| `newsletterRoutes.js` | 2 | ✅ | Public subscribe | OK |
| `noteRoutes.js` | 4 | ✅ | All `verifyUser` | OK |
| `contactRoutes.js` | 1 | ✅ | Public + rate limit | OK |
| `inquiryRoutes.js` | 1 | ✅ | `manage_settings` | OK |
| `userRoutes.js` | 22 | ✅ | Mixed | Includes **`GET /referral`** ✅ |
| `storeRoutes.js` | 10 | ✅ | Public | OK |
| `paymentRoutes.js` | 4 | ✅ | Public (IPN verified) | OK |
| `financeRoutes.js` | 5 | ✅ | Separate finance JWT | By design |
| `seoRoutes.js` | 2 | ✅ Inline | Public | OK |
| `staffRoutes.js` | 6 | ✅ | Superadmin + `manage_staff` | OK |
| `fileManagerRoutes.js` | 5 | ✅ | Superadmin | OK |
| `wishlistRoutes.js` | 1 | ✅ | `verifyUser` | OK |
| `emergencyRoutes.js` | 8 | ✅ | URL token + master key | OK |
| `internalRoutes.js` | 5 | ✅ | API key | OK |
| `viewRoutes.js` | ~45 HTML | N/A | Public HTML | OK |

**Import health:** All 26 route files load without broken imports (verified by subagent scan).

---

## MODEL STATUS TABLE

| Model | Phase 1 Fields Added | Missing Fields (audit doc future) | Index Issues |
|-------|---------------------|-----------------------------------|--------------|
| `securityLog.js` | ✅ `resourceType`, `resourceId` | — | ✅ Compound index on resource fields |
| `order.js` | ✅ `assignedStaffId`, `assignedAt`; status enum | `fulfillmentPriority`, `warehouseId` | No `{ user, status, createdAt }` compound (recommended) |
| `cart.js` | ✅ `lastActivityAt`, `abandonedNotifiedAt` | — | No index on `lastActivityAt` (cron may scan slow) |
| `user.js` | ✅ `referralCode`, `referredBy`, `referralEarnings` | `customerTags[]`, `lifetimeValue` | OK |
| `ContactMessage.js` | ✅ `assignedTo`, `ticketNumber`, priority/status | — | OK |
| `product.js` | ✅ `slug` field; ERP: `supplierId`, `warehouseId`, `reorderPoint`, `costHistory[]` | — | Slug mismatch **resolved** |
| `supplier.js` | N/A (Phase 2) | — | OK |
| `warehouse.js` | N/A (Phase 2) | — | OK |
| `purchaseOrder.js` | N/A (Phase 2) | — | OK |
| `admin.js` | — | `department`, `assignedRegions` | OK |
| `Setting.js` | `referralRewardAmount` | Dual-settings merge still pending | OK |
| `emailCampaign.js` | `channel`, `targetSegment` | — | OK |

**Controller/schema sample check:** Supplier, warehouse, purchase order, and referral controllers — **no missing schema fields detected**.

---

## FRONTEND MODULES (`client/js/admin/modules/`)

| File | Barrel Import | `window.*` Export | Incomplete Work |
|------|---------------|-------------------|-----------------|
| `core-state.js` | `admin-core.js` | N/A (sets globals) | — |
| `core-auth.js` | `admin-core.js` | ✅ | — |
| `core-helpers.js` | `admin-core.js` | ✅ | — |
| `core-toasts.js` | `admin-core.js` | ✅ | — |
| `core-realtime.js` | `admin-core.js` | ✅ | — |
| `core-nav.js` | `admin-core.js` | ✅ `navigateAdminSection` | Scroll/tab routing gaps |
| `core-breadcrumb.js` | `admin-core.js` | ✅ | — |
| `core-boot.js` | `admin-core.js` | ✅ | — |
| `products-*.js` (5 files) | `admin-products.js` | ✅ | — |
| `catalog-*.js` (6 files) | `admin-products.js` | ✅ | — |
| `erp-suppliers.js` | `admin-products.js` | ✅ `loadSuppliersSection` | Read-only |
| `erp-warehouses.js` | `admin-products.js` | ✅ `loadWarehousesSection` | Read-only |
| `erp-purchase-orders.js` | `admin-products.js` | ✅ `loadPurchaseOrdersSection` | Read-only |
| `orders-*.js` (5 files) | `admin-orders.js` | ✅ incl. `assignOrderToStaff` | — |
| `customers-*.js` (2 files) | `admin-customers.js` | ✅ | — |
| `messages-inbox.js` | `admin-customers.js` | ✅ | — |
| `crm-abandoned.js` | `admin-customers.js` | ✅ `loadAbandonedCartStats` | No cart list UI |
| `settings-*.js` (7 files) | `admin-settings.js` | ✅ | — |
| `chat-admin.js` | `admin-chat.js` | ✅ | Legacy; sidebar uses `/chat-admin` |

**Standalone (not in `modules/`):** `admin-staff.js`, `admin-banner.js`, `admin-file-manager.js`, `admin-newsletter.js` — all loaded from `scripts.html`.

**TODO comments in modules:** None found. `console.error` handlers present for API failures (expected).

---

## MOBILE APP STATUS

| Item | Status | Evidence |
|------|--------|----------|
| `mobile/.env.example` | ⚠️ **Misnamed** | File exists as `mobile/env.example` (no leading dot). `ARCHITECTURE.md` references `mobile/.env.example`. |
| API URL hardcoding | ⚠️ **Fallback hardcoded** | `mobile/src/services/api.js` line 5: `DEFAULT_API_URL = 'https://eonlinebazar.com/api'`; uses `EXPO_PUBLIC_API_URL` when set (line 28). |
| All 23+ screens from audit | ✅ | 24 screen files in `mobile/src/screens/` |
| `ReferralScreen` (Phase 3) | ✅ | `ReferralScreen.js`; registered in `App.js` line 159; menu in `profileMenu.js` |
| Navigation imports vs files | ✅ | All stack screens in `App.js` resolve to existing files |
| Referral API | ✅ | `GET /api/customer/referral` in `userRoutes.js`; `mobile/src/api/user.js` |
| Chat config | ✅ | `mobile/src/config/chatConfig.js` uses `EXPO_PUBLIC_CHAT_URL` |
| Missing screens | — | No dedicated public order-track screen (tracking in `OrderDetailsScreen` only) — low priority |

---

## CHAT MICROSERVICE STATUS

| Item | Status | Evidence |
|------|--------|----------|
| `agentResolver.service.js` (Phase 1) | ✅ | `ecommerce-chat/services/agentResolver.service.js` — links store admin JWT → Agent |
| Legacy `view-chat` redirect | ✅ | `view-chat.html` shows deprecation card → `/chat-admin` |
| 7 chat models | ✅ | ChatRoom, ChatMessage, Agent, ChatSettings, CannedResponse, AIKnowledgeBase, StoreUser |
| Dual staff systems | ⚠️ Partial | Agent auto-provision from store admin exists; not full SSO |

---

## PHASE 1 VERIFICATION

| Deliverable | Status | Evidence |
|-------------|--------|----------|
| `categoryRoutes.js`: `checkPermission('manage_catalog')` on writes | ✅ | Lines 24–35 in `categoryRoutes.js` |
| `bannerRoutes.js`: `checkPermission('manage_catalog')` on writes | ✅ | Lines 12–18 in `bannerRoutes.js` |
| `securityLog.js`: `resourceType`, `resourceId` | ✅ | Lines 25–35 in `securityLog.js` |
| `permissions.js`: `manage_marketing` in PERMISSIONS | ✅ | Lines 81–86 in `permissions.js` |
| `order.js`: `assignedStaffId`, `assignedAt` | ✅ | Lines 231–232 in `order.js` |
| `adminRoutes.js`: `/staff-audit` routes | ✅ | Lines 83–84 in `adminRoutes.js` |
| `staffAuditController.js` exists | ✅ | `backend/src/controllers/admin/staffAuditController.js` |

**Phase 1 verdict: All listed deliverables are implemented.**

---

## WHAT IS 100% COMPLETE

- Core e-commerce: catalog, cart, checkout, orders, payments, coupons, reviews, banners
- Admin dashboard analytics + enterprise ERP/CRM/HRM summary widgets
- Customer management with cursor pagination and VIP segmentation
- Order lifecycle: POS, courier, returns, refunds, invoice PDF, staff assignment API
- RBAC: 10 permissions, staff CRUD, sidebar gating via `admin-staff.js`
- Staff audit dashboard (`view-staff-audit`) with SecurityLog aggregation
- Security suite: logs, sessions, IP blacklist, 2FA (TOTP/SMS)
- Newsletter subscribers + email campaigns (with `manage_marketing` permission)
- Support ticket lifecycle on contact messages (assign, status, stats)
- Unified settings read API (`GET /api/admin/all-settings`)
- ERP backend: suppliers, warehouses, purchase orders (full CRUD + receive workflow)
- CRM backend: abandoned cart cron + stats API
- Referral system: backend + mobile `ReferralScreen`
- Chat microservice + React `/chat-admin` + legacy deprecation notice
- Mobile app: 24 screens, i18n, theme, wallet, loyalty, legal WebView
- Phase 1 RBAC/audit deliverables (all verified above)
- DB index migration script: `scripts/addEnterpriseIndexes.js`
- Grouped admin sidebar (ERP/CRM/HRM/Settings) + breadcrumbs

---

## WHAT IS PARTIALLY DONE (routing/UI issues)

- **Loyalty Program nav** — points to same section as Shipping; scroll target broken (`rewards-section` missing)
- **Shipping & Payments nav** — correct section but indistinguishable from Loyalty when clicked from CRM
- **Settings deep links** — Security & 2FA / Cache & Sandbox ignore `data-settings-tab`
- **ERP admin UI** — suppliers, warehouses, POs: read-only tables; backend supports full CRUD but no forms/modals
- **Abandoned Carts admin** — KPI dashboard only; no cart list or manual recovery actions
- **Financial Reports in SPA** — placeholder link; real UI remains external `/finance-analytics` with separate login
- **Newsletter subscriber admin routes** — `verifyAdmin` only (no `manage_marketing` on list/delete)
- **Category/banner list routes** — read endpoints lack `manage_catalog` check
- **Mobile env docs** — `env.example` exists but not `.env.example`; production URL still default fallback
- **Dual settings models** — `Setting.js` + `Settings.js` coexist; unified read only
- **Dual chat admin** — legacy partials remain in page builder though sidebar correctly points to `/chat-admin`

---

## WHAT IS COMPLETELY MISSING

- HRM: attendance tracking, payroll/salary modules
- ERP UI: supplier/warehouse/PO create-edit-delete forms and receive-goods workflow in admin SPA
- CRM UI: abandoned cart item list, per-cart recovery actions
- Finance: embedded P&L / margin charts inside admin SPA (only external app)
- Dedicated admin section IDs: `view-loyalty-program`, `view-shipping-settings` (or equivalent)
- `data-settings-tab` router handler in `core-nav.js`
- `mobile/.env.example` (correct filename per architecture docs)
- Product-level multi-warehouse stock allocation UI
- Order `warehouseId` / fulfillment priority fields
- Push notifications (FCM) on mobile
- Native mobile contact form screen

---

## PRIORITY FIX LIST (ordered by impact)

1. **Fix Loyalty vs Shipping routing** — add `id="rewards-section"` (or split sections); update sidebar targets; dynamic page title from breadcrumb (`sidebar.html`, `view-master-settings.html`, `core-nav.js`, `core-state.js`)
2. **Implement `data-settings-tab` handler** — Security & 2FA and Cache & Sandbox deep links (`core-nav.js`, `settings-platform.js`)
3. **Add ERP CRUD UI** — supplier/warehouse/PO create-edit modals wired to existing POST/PUT/DELETE APIs (`erp-*.js`, new modal partials)
4. **Abandoned cart list table** — extend `crmController` + `crm-abandoned.js` to show individual carts with recovery actions
5. **Embed or iframe finance dashboard** — replace `view-finance` placeholder with integrated charts + finance JWT bridge
6. **Tighten RBAC gaps** — newsletter subscriber routes, category/banner admin GET, `POST /api/products/seed-demo`
7. **Rename `mobile/env.example` → `mobile/.env.example`** and document local dev URL prominently
8. **Invalidate admin page production cache** on deploy when partials change (or bust cache key)
9. **Add recommended DB indexes** — cart abandonment, order user history, assignedStaffId
10. **Remove or fully hide legacy chat partials** from `adminPageBuilder.js` if `/chat-admin` is the only supported UI

---

## APPENDIX — Files scanned

- `ARCHITECTURE.md`, `SYSTEM_ENTERPRISE_AUDIT.md`
- `backend/src/utils/adminPageBuilder.js`
- `backend/src/routes/*.js` (26 files)
- `backend/src/models/*.js` (31 unique models)
- `backend/src/controllers/admin/*`
- `backend/src/config/permissions.js`
- `client/admin/partials/*` (34 files)
- `client/js/admin/modules/*` (49 files)
- `client/js/admin/admin-*.js`, `admin-staff.js`, `admin-newsletter.js`
- `mobile/src/**`, `mobile/App.js`, `mobile/env.example`
- `ecommerce-chat/**`

---

*End of Phase 2 audit. Merged into SYSTEM_ENTERPRISE_AUDIT.md on 2025-09-10.*

---

## SETTINGS ROUTING AUDIT (section added 2025-09-10)

**RESOLVED:** Split into `view-shipping-payments`, `view-loyalty-program`, `view-store-config` on 2026-09-10. Sidebar routing, page titles, accordion active state, and settings tab activation updated in `core-nav.js`.

**Scope:** Read-only audit of `view-master-settings.html`, sidebar deep links, and `core-nav.js` section switching. *(Historical — fixes applied 2026-09-10.)*

**Reference files:**
- `client/admin/partials/view-master-settings.html`
- `client/admin/partials/sidebar.html`
- `client/js/admin/modules/core-nav.js`
- `client/js/admin/modules/core-state.js`
- `client/js/admin/modules/core-breadcrumb.js`
- `client/js/admin/modules/settings-cms.js` (`fetchMasterSettings`)

---

### 1. Contents of `view-master-settings` (section root: `id="view-master-settings"`)

The partial is one long vertical stack inside `.system-settings-stack`. Cards appear in DOM order (top → bottom):

| # | Card heading (h4 unless noted) | Primary HTML id / anchor | Logical sidebar owner |
|---|-------------------------------|--------------------------|------------------------|
| — | **System Settings** (section h3 in `.section-header-box`) | `view-master-settings` (section) | Both (shared page title) |
| 1 | Announcement & Free Shipping | `form-system-announcement` | **Shipping & Payments** |
| 2 | SMS Notifications | `form-system-sms` | **Shipping & Payments** (ops/notifications) |
| 3 | Courier Booking | `form-system-courier` | **Shipping & Payments** |
| 4 | WhatsApp Configuration | `form-system-whatsapp` | **Shipping & Payments** (integrations) |
| 5 | Accepted Payment Methods | `paymentMethodsManager`, heading `paymentMethodsHeading` | **Shipping & Payments** |
| 6 | Catalog Pagination | `form-system-catalog` | **Neither** (catalog UX, not nav-specific) |
| 7 | Flash Sale Engine | `form-system-flash-sale` | **Neither** (marketing/promotions) |
| 8 | VIP Customer Segmentation | `form-system-vip` | **Loyalty Program** |
| 9 | *(scroll anchor — empty div)* | `rewards-section` | **Loyalty Program** (anchor only) |
| 10 | Rewards & Refund Engine | `form-system-rewards` | **Loyalty Program** |
| 11 | Footer Settings | `footerSettingsManager`, heading `footerSettingsHeading` | **Neither** (CMS/storefront chrome) |
| 12 | Page Content Manager | `pageContentManager`, heading `pageContentHeading` | **Neither** (CMS pages) |

**Summary:** ~5 cards map cleanly to **Shipping & Payments**, ~2 (+ anchor) to **Loyalty Program**, ~4 are shared CMS/catalog/marketing content with no dedicated sidebar entry. There is no sub-navigation within the page — only document scroll.

---

### 2. Sidebar links targeting `view-master-settings`

| Sidebar label | Nav group | `data-target` | `data-breadcrumb` | `data-scroll-target` | `data-settings-tab` |
|---------------|-----------|---------------|-------------------|----------------------|---------------------|
| Loyalty Program | CRM | `view-master-settings` | `Loyalty Program` | `rewards-section` | *(none)* |
| Shipping & Payments | Settings | `view-master-settings` | `Shipping & Payments` | *(none)* | *(none)* |

**Related `view-settings` deep links (same routing mechanism, different section):**

| Sidebar label | `data-target` | `data-settings-tab` |
|---------------|---------------|---------------------|
| Security & 2FA | `view-settings` | `security` |
| Cache & Sandbox | `view-settings` | `system` |

*(Store Branding also uses `view-settings` but has no `data-settings-tab`.)*

---

### 3. How section switching works (`core-nav.js`)

**Entry:** `setupSidebarNavigation()` delegates clicks on `li[data-target]` → `navigateAdminSection(targetId, clickedItem)`.

**`navigateAdminSection` flow:**

1. Toggle `.active` on the clicked sidebar item; open parent accordion group.
2. Hide all `.admin-section` elements; show `#${targetId}`.
3. **Page header:** If `data-scroll-target` is set, override `#page-main-title` with the clicked item label and clear subtitle. Otherwise call `updateAdminPageHeader(targetId, label)` — which prefers `ADMIN_PAGE_META[targetId].title` over the sidebar label when meta exists.
4. Render breadcrumb via `renderAdminBreadcrumb()` (uses `data-breadcrumb` from clicked item when present).
5. Call `syncNavAccordionState(targetId)` — derives nav group from **first** `li[data-target="${sectionId}"]` in DOM (see §4).
6. Run `refreshMap[targetId]()` — for master settings this is **`fetchMasterSettings()`** (async; loads payment methods, footer, page content after master-settings API).
7. **Deep link (100 ms `setTimeout`):** If `data-settings-tab` → `activateAdminSettingsTab(tabId)`. If `data-scroll-target` → `document.getElementById(scrollTarget).scrollIntoView({ behavior: 'smooth', block: 'start' })`.

**`activateAdminSettingsTab` (for `view-settings` only):** Maps aliases `security → profile` and `system → profile`, then toggles `.admin-settings-tab` / `.admin-settings-panel`. There are only three tabs in HTML: `profile`, `store`, `branding`. Both Security and Cache sidebar items therefore land on the same **Profile & Security** tab panel.

---

### 4. Does scroll/tab logic fire after section load?

| Mechanism | Fires? | Tied to async load? |
|-----------|--------|---------------------|
| Section show/hide | ✅ Immediately | N/A |
| `fetchMasterSettings()` | ✅ Called synchronously after show | ❌ Not awaited before scroll |
| Scroll (`data-scroll-target`) | ✅ After fixed **100 ms** | ❌ Does not wait for `fetchMasterSettings` or child fetches |
| Tab switch (`data-settings-tab`) | ✅ Same 100 ms block | ❌ Same |

**Consequence:** Scroll runs on a timer, not on `fetchMasterSettings()` completion. `fetchMasterSettings()` subsequently calls `fetchPaymentMethodsCatalog()`, `fetchFooterSettings()`, and `fetchPageContentCatalog()`, which inject DOM above the loyalty cards and can shift layout **after** scroll — pushing the viewport back toward the top content.

---

### 5. Why routing is still broken after the previous fix attempt

The prior fix (visible in current code) added:

1. Empty anchor `<div id="rewards-section">` before the rewards form (`view-master-settings.html` line 420).
2. `data-scroll-target` / `data-settings-tab` handling + `activateAdminSettingsTab()` in `navigateAdminSection()` (`core-nav.js` lines 682–691).
3. Conditional page-title override when `scrollTarget` is present (lines 618–622).

**Remaining failures (all ✅ fixed 2026-09-10):**

| Issue | Detail | Status |
|-------|--------|--------|
| **Shared section ID** | Both CRM Loyalty and Settings Shipping used `data-target="view-master-settings"`. | ✅ Split into 3 sections |
| **Weak scroll anchor** | `rewards-section` zero-height div + fragile scroll. | ✅ Removed — dedicated `view-loyalty-program` section |
| **Scroll timing vs async layout** | 100 ms scroll before async layout finished. | ✅ Scroll logic removed entirely |
| **Shipping has no scroll target** | Indistinguishable from failed Loyalty scroll. | ✅ Each sidebar link has its own section |
| **In-page title frozen** | Section `<h3>System Settings</h3>` never changed per link. | ✅ Per-section titles in new partials |
| **Header title asymmetry** | Shipping showed "System Settings" instead of breadcrumb label. | ✅ Title from `data-breadcrumb` / link text |
| **Accordion group bug** | `sectionNavGroup` always picked first DOM match. | ✅ Uses `lastClickedNavItem` |
| **`view-settings` tab aliases incomplete** | Tab activation fired before content rendered. | ✅ Retry-based `tryActivateTab()` |
| **Phase 2 note superseded partially** | Scroll anchor workaround insufficient. | ✅ Superseded by section split |

---

### 6. Recommended fix direction — ✅ implemented 2026-09-10

1. ✅ Split into `view-shipping-payments`, `view-loyalty-program`, `view-store-config`.
2. ✅ Removed scroll-after-async workaround (no longer needed).
3. ✅ Removed empty `rewards-section` anchor.
4. ✅ Page title from `data-breadcrumb` / link text in `navigateAdminSection()`.
5. ✅ `sectionNavGroup()` uses `lastClickedNavItem` / `clickedItem`.
6. ✅ Settings tab activation uses retry loop after `view-settings` renders.

---

*End of settings routing audit.*

---

## Console hygiene fixes (2026-09-11)

| Issue | Fix | Files |
|-------|-----|-------|
| Footer payment/social icon 404 (`footer-icon-*` missing from `public/uploads/footer/`) | API responses strip local `iconUrl` values when the file is absent; payment badge `<img>` tags include `onerror` hide fallback | `backend/src/utils/footerIconPaths.js`, `backend/src/models/FooterSettings.js`, `client/js/footerRenderer.js` |
| Password inputs missing `autocomplete` (DOM warnings) | `current-password` / `new-password` on admin profile & store forms; `off` on sandbox reset key | `client/admin/partials/view-settings.html` |
| `#real-reset-key` outside `<form>` | Wrapped in `#realResetForm` with `onsubmit="return false;"` (button remains `type="button"`) | `client/admin/partials/view-settings.html` |

---

## FINAL SYSTEM AUDIT — 2026-09-11

**Scope:** Read-only verification of every checklist item against live code. No source files were modified during this audit (only this document updated).

**Method:** File existence, non-empty size checks, route grep in `adminRoutes.js`, model field inspection, and HTML/JS UI verification (tables, modals, sidebar targets).

---

### 1. HRM MODULE (Phase A)

| Check | Status | Note |
|-------|--------|------|
| `backend/src/models/attendance.js` | ✅ EXISTS & COMPLETE | 3.7 KB — schema + indexes |
| `backend/src/models/shift.js` | ✅ EXISTS & COMPLETE | 1.4 KB |
| `backend/src/models/payroll.js` | ✅ EXISTS & COMPLETE | 3.6 KB |
| `backend/src/models/leave.js` | ✅ EXISTS & COMPLETE | 2.8 KB |
| `backend/src/controllers/admin/attendanceController.js` | ✅ EXISTS & COMPLETE | 23 KB — mark, clock-in/out, shifts, summary, late report |
| `backend/src/controllers/admin/payrollController.js` | ✅ EXISTS & COMPLETE | 17.5 KB — generate, approve, paid, payslip PDF |
| `backend/src/controllers/admin/leaveController.js` | ✅ EXISTS & COMPLETE | 15.6 KB — apply, approve/reject, balance, calendar |
| `client/admin/partials/view-hrm-attendance.html` | ✅ EXISTS & COMPLETE | KPI cards, register + shifts tabs, mark-attendance modal |
| `client/admin/partials/view-hrm-payroll.html` | ✅ EXISTS & COMPLETE | Generate payroll, salary config, approval table |
| `client/admin/partials/view-hrm-leaves.html` | ✅ EXISTS & COMPLETE | Pending/all/calendar tabs, apply-leave modal |
| `client/js/admin/modules/hrm-attendance.js` | ✅ EXISTS & COMPLETE | 21 KB — wired in `admin-settings.js` + `core-nav.js` refreshMap |
| `client/js/admin/modules/hrm-payroll.js` | ✅ EXISTS & COMPLETE | 15 KB |
| `client/js/admin/modules/hrm-leaves.js` | ✅ EXISTS & COMPLETE | 16 KB |
| `/api/admin/hrm/attendance` routes | ✅ EXISTS & COMPLETE | GET list/summary/late-report, POST mark/clock-in/clock-out |
| `/api/admin/hrm/payroll` routes | ✅ EXISTS & COMPLETE | GET list, POST generate/salary-config, PATCH approve/paid, GET payslip |
| `/api/admin/hrm/leaves` routes | ✅ EXISTS & COMPLETE | GET list/balance/calendar, POST apply, PATCH approve/reject |
| Bonus: `/api/admin/hrm/shifts` routes | ✅ EXISTS & COMPLETE | Full CRUD on shifts via `attendanceController` |
| `admin.js`: `baseSalary`, `department`, `joiningDate`, `employeeId` | ✅ EXISTS & COMPLETE | Lines 139–142 in `backend/src/models/admin.js` |

---

### 2. ERP MODULE (Phase B)

| Check | Status | Note |
|-------|--------|------|
| `backend/src/models/expense.js` | ✅ EXISTS & COMPLETE | 8-category expense ledger schema |
| `backend/src/services/courierSyncService.js` | ✅ EXISTS & COMPLETE | 13.5 KB — Steadfast/Pathao/RedX sync |
| `backend/src/jobs/courierSyncJob.js` | ✅ EXISTS & COMPLETE | 3.8 KB — cron status poll |
| `backend/src/controllers/admin/profitLossController.js` | ✅ EXISTS & COMPLETE | Advanced P&L engine |
| `backend/src/controllers/admin/expenseController.js` | ✅ EXISTS & COMPLETE | CRUD + summary |
| `client/admin/partials/view-erp-expenses.html` | ✅ EXISTS & COMPLETE | Expense Tracking SPA — stats, filters, table, category sidebar, receipt upload |
| `client/js/admin/modules/erp-expenses.js` | ✅ EXISTS & COMPLETE | Full CRUD + summary charts |
| `client/admin/partials/view-finance.html` — P&L section | ✅ EXISTS & COMPLETE | Full `#plReport` SPA: date range, groupBy, summary cards, Chart.js donut/bar/trend, tables, PDF/CSV export |
| `client/js/admin/modules/erp-profit-loss.js` | ✅ EXISTS & COMPLETE | loadPLReport, renderSummaryCards, renderCharts, renderTopProducts, exportPDF/exportCSV |
| `/api/admin/expenses` routes | ✅ EXISTS & COMPLETE | GET/POST/PATCH/DELETE + summary (`manage_settings`) |
| `/api/admin/finance/profit-loss` route | ✅ EXISTS & COMPLETE | Superadmin + export-pdf/csv |
| `/api/admin/orders/:id/book-courier` route | ✅ EXISTS & COMPLETE | PATCH with `manage_orders` |
| Barcode/SKU search input (POS) | ✅ EXISTS & COMPLETE | `#manualBarcodeInput` + `#posBarcodeDropdown` in `orders-pos.html`; `initBarcodeSearch` / `searchProductByBarcode` / `addProductFromBarcode` in `orders-pos.js` (`GET /api/products?search=&limit=5`) |
| Print invoice modal (POS) | ✅ EXISTS & COMPLETE | `#posInvoiceModal` in `orders-pos.html` — discount breakdown + split payment summary on receipt |
| POS sidebar launch | ✅ EXISTS & COMPLETE | `sidebar.html` ERP — `openPOSModal()` instant counter access |
| POS customer lookup / quick-add | ✅ EXISTS & COMPLETE | Debounced phone lookup; inline quick-add panel; `POST /api/admin/customers/quick` |
| POS discounts & split payment | ✅ EXISTS & COMPLETE | Per-line discount/override; order discount flat/%; Cash/bKash/Card/Split + change calc |

**Resolved 2026-09-11:** Redundant `/finance-analytics` iframe removed; header-only secondary link retained.

---

### 3. CRM TIERS (Phase C)

| Check | Status | Note |
|-------|--------|------|
| `user.js`: `loyaltyTier` enum | ✅ EXISTS & COMPLETE | `enum: ['none', 'silver', 'gold', 'platinum']` |
| `user.js`: `lifetimeSpend` | ✅ EXISTS & COMPLETE | Number, default 0 |
| `user.js`: `tierCashbackRate` | ✅ EXISTS & COMPLETE | Number, default 0 |
| `backend/src/services/loyaltyTierService.js` | ✅ EXISTS & COMPLETE | 7.4 KB — tier evaluation + cashback |
| `backend/src/jobs/loyaltyTierJob.js` | ✅ EXISTS & COMPLETE | 3.6 KB — nightly tier recalc cron |
| `view-loyalty-program.html` tier settings card | ✅ EXISTS & COMPLETE | `#form-system-tiers` with Silver/Gold/Platinum thresholds + preview table |
| `ProfileScreen.js` tier badge | ✅ EXISTS & COMPLETE | Tier badge + progress text toward next tier |

---

### 4. SETTINGS ROUTING FIX

| Check | Status | Note |
|-------|--------|------|
| `view-shipping-payments.html` | ✅ EXISTS & COMPLETE | Registered in `adminPageBuilder.js` |
| `view-loyalty-program.html` | ✅ EXISTS & COMPLETE | Dedicated loyalty/VIP partial |
| `view-store-config.html` | ✅ EXISTS & COMPLETE | Catalog/flash-sale/footer/CMS cards |
| `view-master-settings.html` deleted | ✅ EXISTS & COMPLETE | File not found; removed from `adminPageBuilder.js` |
| Sidebar → Loyalty Program | ✅ EXISTS & COMPLETE | `data-target="view-loyalty-program"` |
| Sidebar → Shipping & Payments | ✅ EXISTS & COMPLETE | `data-target="view-shipping-payments"` |

---

### 5. EMPTY PAGES UI (Fix 2)

| Check | Status | Note |
|-------|--------|------|
| `view-suppliers.html` | ✅ EXISTS & COMPLETE | Add Supplier button + table + `#supplierModal`; CRUD in `erp-suppliers.js` |
| `view-warehouses.html` | ✅ EXISTS & COMPLETE | Add Warehouse button + table + `#warehouseModal`; CRUD in `erp-warehouses.js` |
| `view-purchase-orders.html` | ✅ EXISTS & COMPLETE | Create PO modal + Receive workflow modal; full JS in `erp-purchase-orders.js` |
| `view-crm-abandoned.html` | ✅ EXISTS & COMPLETE | KPI cards **and** abandoned cart list table with filter tabs + notify actions (`crm-abandoned-carts.js`) |

*Previous Phase 2 audit (2026-09-10) flagged these as read-only/KPI-only — all four now have full CRUD or list+action UI.*

---

### 6. EMPLOYEE MODEL (non-system staff)

| Check | Status | Note |
|-------|--------|------|
| `backend/src/models/employee.js` | ✅ EXISTS & COMPLETE | Ultra-dynamic operational staff: identity (DOB, gender, blood group), contact (email, dual addresses), employment (designation, type, shift), salary/bank (monthly/daily/hourly, bKash), Cloudinary documents[], references[], photo upload; auto `EMP-001` ids; linked to attendance/payroll/leave via `staffType` |
| `backend/src/models/designation.js` | ✅ EXISTS & COMPLETE | Job title catalog (Manager, Delivery Man, etc.) with department, active flag, employee-count guard on delete; seeded on bootstrap |

---

### 7. MOBILE APP

| Check | Status | Note |
|-------|--------|------|
| `mobile/.env.example` exists | ✅ EXISTS & COMPLETE | Present in `mobile/` directory (not `mobile/env.example`) |
| `api.js` uses `EXPO_PUBLIC_API_URL` | ✅ EXISTS & COMPLETE | `process.env.EXPO_PUBLIC_API_URL \|\| 'https://eonlinebazar.com/api'` |
| `ReferralScreen.js` | ✅ EXISTS & COMPLETE | Registered in `App.js` stack as `Referral` |
| `ProfileScreen.js` loyalty tier badge | ✅ EXISTS & COMPLETE | Silver/Gold/Platinum badges + spend-to-next-tier text |

**Minor note:** Production API URL remains the fallback when env is unset — intentional for store builds; local dev should set `EXPO_PUBLIC_API_URL`.

---

### 8. PHASE 1 RBAC VERIFICATION

| Check | Status | Note |
|-------|--------|------|
| `categoryRoutes.js`: `checkPermission('manage_catalog')` on writes | ✅ EXISTS & COMPLETE | POST/PATCH/PUT/DELETE admin routes guarded |
| `bannerRoutes.js`: `checkPermission('manage_catalog')` on writes | ✅ EXISTS & COMPLETE | POST/PATCH/PUT/DELETE admin routes guarded |
| `permissions.js`: `manage_marketing` in PERMISSIONS array | ✅ EXISTS & COMPLETE | Key at line 81; mapped to newsletter + abandoned-cart sections |
| `order.js`: `assignedStaffId` | ✅ EXISTS & COMPLETE | Line 236 |
| `securityLog.js`: `resourceType` | ✅ EXISTS & COMPLETE | Field + compound index with `resourceId` |
| `staffAuditController.js` | ✅ EXISTS & COMPLETE | `/api/admin/staff-audit` routes with `manage_security` |

---

### 100% COMPLETE

All checklist items in sections **1–5, 7–8** are implemented and verified in code:

- **HRM (Phase A):** Models, controllers, admin partials, JS modules, API routes, and Admin employment fields — full attendance/shift/payroll/leave stack.
- **ERP (Phase B):** Expense ledger, courier sync service + cron, P&L controller + embedded SPA UI, expense routes, book-courier, POS barcode scan, POS invoice modal.
- **CRM Tiers (Phase C):** User tier fields, loyalty tier service + cron, admin tier settings, mobile tier badge.
- **Settings routing:** Split into three dedicated partials; legacy `view-master-settings.html` removed; sidebar targets correct.
- **Empty pages fix:** Suppliers, warehouses, purchase orders, and abandoned carts all have real table + modal/workflow UI.
- **Mobile:** `.env.example`, env-based API URL, ReferralScreen, ProfileScreen tier display.
- **Phase 1 RBAC:** Catalog/banner write guards, `manage_marketing`, order assignment field, security log resourceType, staff audit controller.

---

### PRIORITY FIX LIST — ✅ ALL 4 COMPLETED (2026-09-11)

| # | Fix | Status | Evidence |
|---|-----|--------|----------|
| 1 | **Ultra-dynamic Employee module** | ✅ | `employee.js` (full profile fields + docs), `designation.js`, `designationController.js`, `employeeController.js` (photo/doc/profile APIs), `view-hrm-employees.html` (tabbed form + profile modal + designation manager), `hrm-employees.js`; designation in attendance/payroll dropdowns; `employeeCount` on enterprise dashboard |
| 2 | **Remove redundant finance embed** | ✅ | Duplicate iframe removed from `view-finance.html`; header-only "Open Finance Dashboard" link retained |
| 3 | **Tighten RBAC on read routes** | ✅ | `manage_catalog` on category/banner admin GET; newsletter `send-campaign` already has `manage_marketing` |
| 4 | **Document mobile local dev env** | ✅ | `mobile/.env.example` comments + `ARCHITECTURE.md` Local Development Setup (Mobile) section |

---

### REMAINING (outside this fix batch)

| Item | Notes |
|------|-------|
| **Mobile API fallback** | Production URL remains intentional default when env unset |
| **Dual staff identity** | Store `Admin` vs chat `Agent` — partial SSO via `agentResolver.service.js` |
| **Legacy chat partials** | `view-chat*` remain in page builder; sidebar points to `/chat-admin` |
| **Push notifications (FCM)** | Future CRM retention feature |

---

## SIDEBAR REORGANIZATION

**2026-09-12** — Admin sidebar live with **8 premium categories**: Dashboard (top-level), Catalog & Inventory, Sales & POS, CRM & Support, Marketing & Growth, Finance & Accounts, HRM, and Settings & Security. All existing `data-target` nav links preserved; accordion groups and breadcrumb labels updated in `sidebar.html`, `core-breadcrumb.js`, and `_layout.css`.

**2026-09-12** — **Settings & Security** accordion split into **3 labeled sub-groups** inside the same parent toggle: Security & Access, Store & Catalog Setup, and System & Utilities. All existing `data-target` / `data-settings-tab` values preserved unchanged; non-clickable `.nav-subheader` labels added in `sidebar.html` + `_layout.css`.

---

## STAFF ACCESS & HRM DECOUPLING — 2026-09-12

| Item | Status |
|------|--------|
| Employee table cleanup — grant/manage access removed from Actions column; View / Edit / Status toggle only | ✅ |
| Link System Account flow moved to Employee Profile **Access** tab | ✅ |
| Admin Access page redesign — premium stat cards, staff directory, permissions slide-over | ✅ |
| Direct staff creation UI removed from Admin Access page; **Assign New Access** from unlinked employees | ✅ |
| `GET /api/admin/hrm/employees?hasAccess=false` filter for unlinked employees | ✅ |
| Super Admin auto-sync to HRM Employee record on server bootstrap | ✅ |
| Attendance / Payroll staff dropdowns — optgroups with `Name — Designation` labels | ✅ |
| SweetAlert2 rollout across entire admin panel (`alert` / `confirm` replaced) | ✅ |

---

## ADMIN ACCESS CONSOLE FIX & DYNAMIC CONTROL — 2026-09-12

| Part | Status | Note |
|------|--------|------|
| **A — Console error** | ✅ | Root cause: `window.closeStaffEditModal = closeStaffPermissionsPanel` referenced the function before assignment, throwing `ReferenceError` and aborting entire `admin-staff.js` module load. |
| **B — Sidebar navigation** | ✅ | Link existed but stayed hidden because module crash prevented `applySuperAdminOnlyVisibility()`; normalized `data-target` to `view-staff` to match `adminPageBuilder.js`. |
| **C — Dynamic 3-state access tab** | ✅ | Employee profile Access tab renders Grant / Active / Suspended states; added `reactivate-access` + `unlink-access` endpoints and `refreshEmployeeAccessTab` live refresh. |
| **D — SweetAlert2** | ✅ | Already loaded via admin `head.html`; all grant/suspend/revoke/reactivate flows use Swal (no native `alert`/`confirm` in HRM access paths). |

---

*End of Final System Audit — 2026-09-11. Files scanned: `backend/src/models/`, `backend/src/controllers/admin/`, `backend/src/routes/adminRoutes.js`, `backend/src/services/`, `backend/src/jobs/`, `client/admin/partials/`, `client/js/admin/modules/`, `mobile/src/`.*



