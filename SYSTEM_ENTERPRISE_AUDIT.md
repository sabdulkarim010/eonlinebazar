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
| Expense ledger | ✅ | `expense.js`, `expenseCategory.js`, `expenseController.js`, `expenseCategoryController.js` | Dynamic category catalog + expense CRUD + summary; feeds P&L |
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
| Operating expense tracking | ✅ COMPLETE | `expense.js`, `expenseCategory.js`, `expenseController.js`, `view-erp-expenses.html`, `erp-expenses.js` — dynamic categories, Other custom input, CRUD, receipt upload, category summary + monthly trend; feeds P&L |
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

**2026-09-12** — Admin sidebar consolidated to **7 enterprise SaaS modules** + Dashboard: **Sales & Orders**, **Catalog & Inventory**, **Marketing & Content**, **HRM & Staff**, **Accounts & Finance**, and **System Settings**. Categories, Brands, Attributes moved from Settings → Catalog; Hero Banners, Navbar Links, Coupons moved from Settings → Marketing; CRM items folded into Sales & Orders; Staff Audit/Security/Sessions accessed via unified Settings hub tabs.

**2026-09-12 (prior)** — 8-category accordion (Catalog, Sales, CRM, Marketing, Finance, HRM, Settings & Security) — superseded by 7-module layout above.

## UNIFIED SYSTEM SETTINGS HUB — 2026-09-12

| Tab | Content | Files |
|-----|---------|-------|
| Store Branding & Info | Store name/currency/timezone, delivery rules, logo/favicon | `view-settings.html`, `settings-platform.js` |
| General Configuration | VAT/tax rate, order prefix, maintenance mode, catalog pagination; embeds `view-store-config` | `settings-hub.js`, `Setting.js`, `masterSettingsController.js` |
| Shipping & Payments | Embeds `view-shipping-payments` (SMS, courier, payment methods) | `settings-hub.js`, `settings-cms.js` |
| Security & Access | Admin profile, 2FA, hub links → Staff Audit, Sessions, Security Logs | `view-settings.html`, `settings-2fa.js` |
| System Utilities | Cache, sandbox, file manager link | `view-settings.html`, `settings-platform.js` |

SweetAlert2 toasts on tab switch and master-settings saves. Enterprise features added: **VAT/tax** config, **maintenance mode** toggle (+ health endpoint flag), **order CSV export**, **reorder-level** stock badges in inventory.

## ENTERPRISE FEATURE ADDITIONS — 2026-09-12

| Feature | Status | Evidence |
|---------|--------|----------|
| VAT/Tax configuration | ✅ | `Setting.vatRate`, General Configuration tab, `masterSettingsController` |
| Low stock / reorder indicator | ✅ | `products-table.js` — `.stock-reorder` badge when stock ≤ reorderPoint |
| Order report CSV export | ✅ | `GET /api/admin/orders/export-csv`, toolbar in `view-orders.html` |
| Financial P&L CSV/PDF export | ✅ | Existing `erp-profit-loss.js` + `exportController.js` |
| Maintenance mode toggle | ✅ | `Setting.maintenanceMode`, General tab, `GET /api/store/health` exposes flag |

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

---

## COMPREHENSIVE ENTERPRISE AUDIT — 2026-09-12

**Scope:** Read-only verification audit (Parts 0–7). No source code modified.  
**Auditor:** Cursor Agent — full repository scan of sidebar, HRM/staff decoupling, console fixes, SweetAlert2, dead code, phase regression, and enterprise gap analysis.

**DECISION:** The 7-module sidebar design is final and intentional — supersedes the earlier 8-category plan. No further sidebar restructuring needed.

---

### Part 1 — Sidebar Reorganization Verification

| Check | Status | Evidence |
|-------|--------|----------|
| 8-category structure (Dashboard, Catalog & Inventory, Sales & POS, CRM & Support, Marketing & Growth, Finance & Accounts, HRM, Settings & Security) | ❌ **MISSING** | Current `sidebar.html` uses a **7-module + Dashboard** layout: Sales & Orders, Catalog & Inventory, Marketing & Content, HRM & Staff, Accounts & Finance, System Settings. CRM items are folded into Sales & Orders; naming differs from the 8-category spec. Prior 8-category plan documented in REFACTOR_MAP was **superseded** (see SIDEBAR REORGANIZATION section above). |
| Settings & Security — 3 labeled sidebar sub-groups (Security & Access, Store & Catalog Setup, System & Utilities) | ❌ **MISSING** | Sidebar has a single **System Settings → Settings Hub** entry (`data-target="view-settings"`). The three logical groups exist as **tabs inside** `view-settings.html` (Branding, General, Shipping, Security, Utilities), not as sidebar accordion sub-groups. |
| No duplicate `data-section` values in sidebar | ✅ **N/A / PASS** | Sidebar does not use `data-section`; it uses `data-nav-section` (6 unique: sales, catalog, marketing, hrm, finance, settings) and `data-target` (30 unique nav targets, zero duplicates). |
| No orphaned sidebar links (every `data-target` resolves to a DOM section) | ✅ **EXISTS** | All 30 `data-target` values map to registered partials or nested section IDs: e.g. `manage-category` / `manage-coupons` live inside `view-catalog.html`; `view-manage-products` / `view-add-product` inside `view-products.html`. None point to missing IDs. |
| "Admin Access & Roles" link exists | ✅ **EXISTS** | `sidebar.html` line 140: `data-target="view-staff"`, breadcrumb **Admin Access & Roles**, `data-superadmin-only="true"`. Section registered in `adminPageBuilder.js` VIEW_PARTIALS. |

**Note:** Audit checklist referenced `data-section` and `adminPageBuilder.js` orphan check — builder registers **partials**, not individual nested section IDs. Orphan check was performed against assembled DOM section IDs across all partials; all sidebar targets resolve.

---

### Part 2 — HRM/Staff Decoupling Verification

| Check | Status | Evidence |
|-------|--------|----------|
| Employees table Actions — "Grant Access" button REMOVED from main table | ✅ **EXISTS** | `hrm-employees.js` `renderEmployeeTable()` (lines 119–130): Actions = View Profile, Edit, Terminate/Reactivate only. No grant button in table HTML. |
| Employee Detail modal — Access tab with 3-state logic (no access / active / suspended) | ✅ **EXISTS** | `view-hrm-employees.html` profile tab `profile-tab-access`; `renderAccessTabState1()` (no access → Grant), `renderAccessTabLinkedState()` (active vs suspended badges + Suspend/Re-activate/Revoke). |
| `view-staff.html` — "Create Staff Account" form REMOVED | ✅ **EXISTS** | No create-staff form in partial. Subtitle explicitly states assign-from-roster model. |
| `view-staff.html` — "Assign Access to Employee" flow EXISTS | ✅ **EXISTS** | `#staffAssignPanel` with search + "Link System Account" button; wired in `admin-staff.js` → `openGrantAccessModal()`. |
| Super Admin auto-sync to Employee model | ✅ **EXISTS** | `server.js` lines 108–116 calls `syncSuperAdminEmployee()` from `backend/src/services/superAdminHrmSync.js`, which creates/links Employee with `designation: 'Super Admin'`, `role: 'Super Admin'`. Verified by code presence (no DB query). |
| Attendance/Payroll dropdowns — optgroups System Admins vs Operational Employees | ✅ **EXISTS** | `hrm-attendance.js` `hrmLoadStaffOptions()` lines 128–147: `<optgroup label="System Staff">` and `<optgroup label="Operational Employees">`. Payroll calls same helper via `window.hrmLoadStaffOptions()` in `hrm-payroll.js` lines 123, 270. |
| Backend `unlinkSystemAccess` + `reactivateSystemAccess` in employeeController | ✅ **EXISTS** | `employeeController.js` exports both; routes in `adminRoutes.js` lines 539–540. |
| Backend routes for unlink-access and reactivate-access | ✅ **EXISTS** | `POST /api/admin/hrm/employees/:id/reactivate-access`, `POST /api/admin/hrm/employees/:id/unlink-access` with `verifyAdmin` + `checkPermission('manage_staff')`. Covered in `tests/hrm.test.js`. |

---

### Part 3 — Console Error Fix Verification

| Check | Status | Evidence |
|-------|--------|----------|
| `closeStaffPermissionsPanel` defined and exposed on `window` | ✅ **EXISTS** | Defined in `client/js/admin-staff.js` line 732; `window.closeStaffPermissionsPanel = closeStaffPermissionsPanel` line 741. Referenced from `view-staff.html` onclick handlers. **Note:** Lives in `client/js/admin-staff.js` (loaded via `scripts.html`), not under `client/js/admin/modules/` — grep under `client/js/admin/` alone returns no match, but the function is correctly wired. |
| Other onclick-referenced functions in `admin-staff.js` missing `window.*` export | ✅ **NONE FOUND** | Dynamically rendered staff row actions: `openStaffEditModal`, `toggleStaffStatus`, `resetStaffPassword`, `deleteStaffAccount` — all exported on `window` (lines 701, 788, 815, 866). |
| Other onclick-referenced functions in `hrm-employees.js` missing `window.*` export | ✅ **NONE FOUND** | All 30+ onclick handlers from `view-hrm-employees.html` have matching `window.*` exports (lines 1356–1596). Includes grant/suspend/revoke/reactivate access flows. |

---

### Part 4 — SweetAlert2 Coverage Audit

| Check | Status | Evidence |
|-------|--------|----------|
| SweetAlert2 CDN in admin base template | ✅ **EXISTS** | `client/admin/partials/head.html` — CSS + JS (`sweetalert2@11.14.5`). |
| Remaining native `alert(` / `confirm(` in `client/js/admin/` | ✅ **ZERO REMAINING** | Full-directory grep finds **no** live `alert(` or `confirm(` calls — only a comment in `catalog-categories.js` line 535 documenting the Swal replacement. |
| Conversion estimate | **~100% alert/confirm converted; 0 remaining** | All destructive/confirm flows use `Swal.fire()` or `window.showCustomConfirm()` (defined in `core-realtime.js`, wraps Swal). |

**UX caveat (not counted as alert/confirm):** `window.prompt()` still used in 5 admin files for free-text input — `admin-staff.js` (manual password), `hrm-leaves.js` (reject reason), `orders-actions.js` (return reject reason), `settings-2fa.js` (OTP email), `catalog-navbar.js` (URL/HTML embed). These were outside the alert/confirm conversion scope but remain inconsistent with full SweetAlert2 UX.

---

### Part 5 — Duplicate / Dead Code Scan

| Check | Status | Findings |
|-------|--------|----------|
| Duplicate route definitions (same HTTP method + path twice on same mount) | ✅ **NONE PROBLEMATIC** | Cross-file path collisions (e.g. `GET /` in multiple route files) are on **different Express mount prefixes** (`/api/products`, `/api/brands`, etc.) — expected. Within `adminRoutes.js`, duplicate method+path pairs are intentional HTTP verb aliases (`POST`+`PUT` on `/settings`, `/master-settings`, `/footer-settings`). Legacy compat pairs: `/users/:id/avatar` vs `/customers/:id/avatar`. |
| Duplicate `data-target` in sidebar | ✅ **NONE** | 30 unique targets, each appears once. |
| `data-target` count vs `adminPageBuilder.js` VIEW_PARTIALS | ⚠️ **EXPECTED MISMATCH** | Builder registers 31 view **partials**; sidebar has 30 nav targets because nested IDs (`manage-category`, `view-add-product`, etc.) live inside partials (`view-catalog.html`, `view-products.html`). Not a wiring bug. |
| Orphaned HTML partials (not in `adminPageBuilder.js`) | ✅ **NONE** | All 44 files in `client/admin/partials/` are either VIEW_PARTIALS (31), MODAL_PARTIALS (8), or shell (head, body-open, sidebar, header, scripts). |
| Orphaned JS modules (not imported in any barrel) | ⚠️ **2 DEAD FILES** | `client/js/admin/modules/crm-abandoned.js` — superseded by `crm-abandoned-carts.js` (imported in `admin-customers.js`). `client/js/admin/modules/view-finance.js` — superseded by `erp-profit-loss.js` (imported in `admin-products.js`). |
| `Setting.js` vs `Settings.js` consolidation | ⚠️ **PARTIAL — BOTH ACTIVE** | Not consolidated. Both models actively used: `Setting.js` = loyalty/VAT/flash/referral; `Settings.js` = delivery/SMS/courier/rate-limits/gateways. Unified **read** via `GET /api/admin/all-settings`; writes still split across `/settings` and `/master-settings`. Deprecation notes in both model files. |
| Legacy `view-master-settings` partial still exists | ✅ **DELETED** | File not found; removed from `adminPageBuilder.js`. Replaced by `view-shipping-payments`, `view-loyalty-program`, `view-store-config`. |

---

### Part 6 — Full Phase Verification (Spot-Check Regression)

| Phase / Feature | Status | Spot-Check Evidence |
|-----------------|--------|---------------------|
| Phase 1 — RBAC/HRM foundation | ✅ **INTACT** | `permissions.js`, `checkPermission` on admin routes, staff audit, `manage_staff` gating on all `/hrm/*` routes. |
| Phase 2 — ERP core (Supplier/PO/Warehouse) | ✅ **INTACT** | Models present; `tests/erp.test.js` (39 tests); sidebar links + `erp-*.js` modules wired. |
| Phase 3 — CRM automation | ⚠️ **PARTIAL** | Abandoned carts UI (`view-crm-abandoned`, `crm-abandoned-carts.js`) intact; **no dedicated CRM automation test file**. |
| Phase 4 — UI restructure | ✅ **INTACT** | Accordion sidebar, breadcrumbs (`core-breadcrumb.js`), cursor pagination on products/customers. |
| Phase A — HRM Attendance/Payroll/Leave | ✅ **INTACT** | Partials + modules + `tests/hrm.test.js` (41 tests incl. grant/revoke/reactivate/unlink access). |
| Phase B — ERP POS/Courier/P&L | ⚠️ **PARTIAL** | POS (`view-pos`, `orders-pos.js`), courier routes, P&L (`erp-profit-loss.js`, real Expense aggregation in `profitLossController.js`) — **no dedicated POS/expense/P&L integration tests**. |
| Phase C — CRM Tiers | ✅ **INTACT** | `tests/loyalty-tier.test.js`; `view-loyalty-program.html` + `settings-loyalty.js`. |
| Employee module + Designation system | ✅ **INTACT** | Full CRUD, designation manager, photo/documents; tested in `hrm.test.js`. |
| Sidebar 8-category reorganization | ❌ **NOT PRESENT** | Superseded by 7-module layout (see Part 1). |
| Settings sub-groups (sidebar) | ❌ **NOT IN SIDEBAR** | Implemented as Settings Hub tabs instead. |
| HRM/Staff decoupling | ✅ **INTACT** | See Part 2 — all items pass. |
| SweetAlert2 rollout | ✅ **INTACT** | See Part 4 — zero native alert/confirm remain. |

---

### Part 7 — Enterprise Readiness Gap Analysis

#### Security gaps

| Gap | Severity | Detail |
|-----|----------|--------|
| `GET /api/admin/courier/status` | Low | `verifyAdmin` only — no `checkPermission`; any authenticated admin can read courier config status. |
| `GET /api/admin/stock/check-now` | Low | `verifyAdmin` only — triggers stock alert check without permission gate. |
| `GET /api/admin/analytics/status` | Low | `verifyAdmin` only — exposes analytics job status to any admin. |
| HRM grant-access restricted to superadmin? | Info | `grantSystemAccess` uses `manage_staff` permission, not `requireSuperAdmin` — intentional for HR managers but worth documenting. |
| Dual settings write paths | Low | `Setting.js` + `Settings.js` + separate PUT endpoints increase misconfiguration risk until data migration completes. |

#### UX inconsistencies

| Issue | Detail |
|-------|--------|
| SweetAlert2 vs `window.prompt` | 5 modules still use native prompt for text input (password, reject reasons, embed URLs). |
| Pagination vs load-all | Products/customers use cursor pagination; HRM employees/payroll/attendance load up to 100 rows with no cursor/load-more. |
| Sidebar doc vs reality | REFACTOR_MAP and some audit notes describe 8-category sidebar; live UI is 7-module — documentation drift. |
| Legacy chat partials | `view-chat`, `view-chat-analytics`, `view-canned-responses` still assembled but sidebar links to external `/chat-admin`. |

#### Missing "glue"

| Item | Status |
|------|--------|
| Financial P&L pulls real Expense data | ✅ **REAL** — `profitLossController.js` aggregates `Expense` model by category into `expensesTotal`; not placeholder. |
| Accounts Overview cash flow | ✅ **REAL** — `accountsSummaryController.js` aggregates expenses + supplier payables. |
| Settings model consolidation | ❌ **NOT DONE** — dual singleton models remain; unified read only. |

#### Test coverage gaps

| Area | Tests | Gap |
|------|-------|-----|
| HRM (attendance, payroll, leave, employees, access) | `hrm.test.js` — 41 tests | ✅ Strong |
| ERP (supplier, warehouse, PO) | `erp.test.js` — 39 tests | ✅ Strong |
| Loyalty tiers | `loyalty-tier.test.js` — 8 tests | ✅ Present |
| Admin settings/VAT/maintenance | `admin.test.js` | ✅ Partial |
| **Expense ledger API** | None | ❌ No `expense.test.js` |
| **P&L / profit-loss API** | None | ❌ No finance P&L integration test |
| **POS manual orders** | None | ❌ No dedicated POS test |
| **CRM abandoned carts** | None | ❌ No abandoned-cart test |
| **Courier booking/sync** | None | ❌ No courier integration test |

#### Mobile app parity

| Admin Feature | Mobile Counterpart | Status |
|---------------|-------------------|--------|
| Loyalty tiers / points | `LoyaltyPointsScreen.js`, `WalletScreen.js` | ✅ Customer-facing parity |
| Employee / HRM system | None | ❌ No mobile admin or staff self-service for attendance/leave |
| ERP (suppliers, PO, warehouses) | None | ❌ Admin-only |
| Expense tracking / P&L | None | ❌ Admin-only (expected) |

---

### Duplicates & Dead Code Found

1. **Dead JS modules:** `crm-abandoned.js`, `view-finance.js` — not imported in any barrel; superseded by active replacements.
2. **Legacy chat partials:** `view-chat.html`, `view-chat-analytics.html`, `view-canned-responses.html` — still in page builder but sidebar bypasses them for `/chat-admin`.
3. **Dual settings models:** `Setting.js` + `Settings.js` — both actively written; consolidation incomplete.
4. **Route aliases (intentional, not bugs):** Multiple HTTP verbs on same admin settings paths; customer/user avatar route pairs.
5. **Documentation drift:** REFACTOR_MAP entries for 8-category sidebar + Settings sidebar sub-groups do not match current 7-module sidebar + Settings Hub tabs.

**No duplicate `data-target` values. No orphaned sidebar nav targets. No orphaned admin partials.**

---

### 100% Complete

- HRM/Staff decoupling (employee table cleanup, Access tab 3-state, assign-from-roster, superadmin HRM sync, unlink/reactivate endpoints)
- Admin Access console fix (`closeStaffPermissionsPanel` + full `admin-staff.js` module load)
- SweetAlert2 native alert/confirm elimination across `client/js/admin/`
- ERP Phase 2 core (suppliers, warehouses, POs) with integration tests
- HRM Phase A (attendance, payroll, leave, designations, employees) with integration tests
- Settings split from legacy `view-master-settings` into focused partials
- P&L real expense aggregation (not placeholder)
- Loyalty tier backend + tests + mobile customer screens
- All sidebar `data-target` values resolve to live DOM sections
- Admin Access & Roles sidebar link present and registered

---

### Needs Attention (partial/inconsistent)

- **`sidebar.html`** — 7-module layout active; 8-category reorganization from audit checklist not implemented (superseded design — docs should be reconciled)
- **`view-settings.html`** — Settings sub-groups exist as hub tabs, not sidebar accordion labels as specified in prior plan
- **`Setting.js` + `Settings.js`** — dual write paths; unified read only via `/all-settings`
- **`client/js/admin/modules/crm-abandoned.js`** — orphaned dead file; delete or document
- **`client/js/admin/modules/view-finance.js`** — orphaned dead file; superseded by `erp-profit-loss.js`
- **`admin-staff.js` line 846** — `window.prompt()` for manual password reset (Swal input would be consistent)
- **`hrm-employees.js` `loadEmployees()`** — hard limit 100, no pagination/load-more
- **`adminRoutes.js`** — `GET /courier/status`, `GET /stock/check-now`, `GET /analytics/status` lack `checkPermission`
- **REFACTOR_MAP.md / ARCHITECTURE.md** — describe 8-category nav; live sidebar is 7-module (documentation drift)

---

### Missing / Not Yet Built

- 8-category sidebar structure with CRM & Support and Marketing & Growth as separate top-level groups (if still desired — currently folded into 7-module design)
- Settings & Security sidebar sub-groups (Security & Access, Store & Catalog Setup, System & Utilities) — only exist as Settings Hub tabs
- `Setting.js` / `Settings.js` data migration and single write API
- Integration tests: expense ledger, P&L report, POS manual orders, abandoned carts, courier sync
- Mobile HRM self-service (clock-in, leave apply) for operational staff
- Removal or archival of legacy chat partials if `/chat-admin` is permanent
- Full SweetAlert2 input dialogs replacing remaining `window.prompt()` calls

---

### PRIORITY ROADMAP TO TRUE ENTERPRISE-GRADE

1. **Reconcile documentation with live sidebar** — Update ARCHITECTURE.md and REFACTOR_MAP to reflect 7-module layout OR re-implement 8-category sidebar if product decision requires it. Eliminates agent/developer confusion.
2. **Consolidate settings models** — Migrate `Setting.js` + `Settings.js` into single schema + single write endpoint; retire dual PUT paths.
3. **Add finance integration tests** — `expense.test.js` + P&L endpoint test covering real Expense aggregation (protects Phase B glue).
4. **Delete dead JS modules** — Remove `crm-abandoned.js` and `view-finance.js` (or add deprecation header + remove from disk in a cleanup pass).
5. **Permission hardening** — Add `checkPermission` to `/courier/status`, `/stock/check-now`, `/analytics/status`.
6. **HRM table pagination** — Cursor or load-more on employees, payroll, attendance lists (match products/customers UX).
7. **Replace `window.prompt()` with Swal input** — Password reset, leave reject reason, return reject reason (5 call sites).
8. **CRM + POS test coverage** — Abandoned cart recovery API test; manual POS order creation test.
9. **Legacy chat partial cleanup** — Remove unused `view-chat*` from page builder if external chat admin is permanent.
10. **Mobile staff self-service (optional)** — Attendance clock-in / leave apply for linked employees without full admin panel.

---

*Audit completed 2026-09-12. Files scanned: `.cursorrules`, `ARCHITECTURE.md`, `REFACTOR_MAP.md`, `client/admin/partials/sidebar.html`, all admin partials vs `adminPageBuilder.js`, `client/js/admin/**`, `client/js/admin-staff.js`, `backend/src/routes/adminRoutes.js`, `backend/src/controllers/admin/employeeController.js`, `backend/src/services/superAdminHrmSync.js`, `backend/src/server.js`, `tests/*.test.js`, `mobile/src/`.*

---

## FINAL CLEANUP — 2026-09-12

| Task | Status | Summary |
|------|--------|---------|
| **1 — Sidebar decision (doc only)** | ✅ | Added DECISION note under COMPREHENSIVE ENTERPRISE AUDIT: 7-module sidebar is final; supersedes 8-category plan. |
| **2 — Settings model consolidation** | ✅ | Merged all `Setting.js` fields into `Settings.js`; deprecated `Setting.js` (re-export shim). Updated 15+ controllers/services/utils. Added `scripts/mergeSettingsModels.js` (run once before deploy on existing DBs). |
| **3 — Orphaned JS modules** | ✅ | Deleted `crm-abandoned.js` (superseded by `crm-abandoned-carts.js` in `admin-customers.js`). Deleted `view-finance.js` + removed `scripts.html` import; `core-nav.js` now calls only `initProfitLossReport()` from `erp-profit-loss.js`. |
| **4 — SweetAlert2 input dialogs** | ✅ | Replaced all remaining `window.prompt()` in `client/js/admin/` — `catalog-navbar.js`, `hrm-leaves.js`, `orders-actions.js`, `settings-2fa.js`. |
| **5 — Finance & CRM tests** | ✅ | Added `tests/expense.test.js`, `tests/profitLoss.test.js`, `tests/pos.test.js`, `tests/abandonedCart.test.js`. **146 / 146 tests passing** (15 suites). |
| **6 — RBAC tightening** | ✅ | Added `checkPermission` to: `GET /analytics/status` (`view_analytics`), `GET /courier/status` (`manage_orders`), `GET /stock/check-now` (`manage_inventory`), `GET /products/import-template` (`manage_inventory`), `GET /cache/stats` + `DELETE /cache/key/:pattern` (`manage_settings`), `POST /ai/product-assist` (`manage_inventory`), `POST /sync-data` (`manage_settings`), `GET/DELETE /newsletter/subscribers` (`manage_marketing`). |

**Post-cleanup status updates:**

- `Setting.js` vs `Settings.js` → ✅ **CONSOLIDATED** (single write path via `Settings.getOrCreate()`; migration script for legacy `master` row)
- Dead JS modules → ✅ **REMOVED**
- SweetAlert2 `window.prompt()` in admin modules → ✅ **ZERO REMAINING**
- Finance integration tests → ✅ **COMPLETE**
- RBAC gaps on utility admin routes → ✅ **FIXED**

**Migration note:** Run `node scripts/mergeSettingsModels.js` once against production MongoDB before deploy to copy any values still stored only on the deprecated `key: master` row.

---

## Jest & Mongoose Hygiene — 2026-09-12

| Task | Status | Summary |
|------|--------|---------|
| Payment catalog seed log noise | ✅ | `seedDefaultPaymentMethods()` skips the success `console.log` when `NODE_ENV=test`. |
| Mongoose `findOneAndUpdate` deprecation | ✅ | Replaced `{ new: true }` with `{ returnDocument: 'after' }` on all backend `findOneAndUpdate` call sites (`walletService`, `courierController`, `orderAdminController`, `sandboxService`, `bannerController`). |
| Jest teardown / open handles | ✅ | `tests/setup.js` `afterAll` now clears timers, closes the Mongoose connection, and stops the in-memory MongoDB server; removed `--forceExit` from `npm test`. **146 / 146 tests passing** without forced exit. |

**Remaining (non-blocking):** Some `findByIdAndUpdate` paths (e.g. supplier/warehouse ERP updates) still use `{ new: true }` and emit Mongoose deprecation warnings during tests — migrate separately if desired.

---

## NOTIFICATION CENTER & BULK EXPORT — 2026-09-12

| Task | Status | Summary |
|------|--------|---------|
| AdminNotification model | ✅ COMPLETE | `backend/src/models/adminNotification.js` — `recipientId`, `type` (order/stock/leave/payroll/security/system), `title`, `message`, `link`, `isRead`, `createdAt`; compound index `{ recipientId: 1, isRead: 1, createdAt: -1 }`. |
| Notification service | ✅ COMPLETE | `notificationService.js` — `createNotification()`, `notifyAdminsWithPermission()`; retains `sendAdminNotification()` for socket-only callers. Wired on: new order (`manage_orders`), stock alert cron (`manage_inventory`), leave application (`manage_staff`), courier Delivered sync (`manage_orders`). |
| Notification API | ✅ COMPLETE | `GET /api/admin/notifications`, `GET /api/admin/notifications/unread-count`, `PATCH /api/admin/notifications/:id/read`, `PATCH /api/admin/notifications/mark-all-read` — `verifyAdmin` only (personal inbox). |
| Admin bell dropdown UI | ✅ COMPLETE | Header bell (`header.html`) + `client/js/admin/modules/notifications.js` — unread badge, dropdown list (title/message/relative time/unread dot), mark-all-read, click navigates via `link` + marks read, 30s unread-count poll; socket `admin_notification` triggers refresh. |
| Bulk CSV export — Customers | ✅ COMPLETE | `GET /api/admin/customers/export` + Export CSV button on `view-customers.html`; respects search, tier, segment filters. |
| Bulk CSV export — Orders | ✅ COMPLETE | `GET /api/admin/orders/export` (+ legacy `/export-csv` alias); respects status, search, date, sandbox filters; orders toolbar button updated. |
| Bulk CSV export — Products | ✅ COMPLETE | `GET /api/admin/products/export`; respects search, category, stock status, price range; inventory Export CSV button calls server. |
| Bulk CSV export — Employees | ✅ COMPLETE | `GET /api/admin/hrm/employees/export`; respects search, department, designation, type, status; Export CSV on `view-hrm-employees.html`. |
| Tests | ✅ COMPLETE | `tests/admin.test.js` +5 — notifications list/read + customers/products/orders CSV export. **151 / 151 tests passing.** |

---

## ACTIVITY FEED & ROLE DASHBOARDS — 2026-09-12

| Task | Status | Summary |
|------|--------|---------|
| Unified activity feed API | ✅ COMPLETE | `backend/src/controllers/admin/activityFeedController.js` — `GET /api/admin/activity-feed` paginated, filterable by `resourceType`, `actor`, `dateFrom`/`dateTo`; returns normalized `{ actor, action, resourceType, resourceLabel, timestamp, details }`; gated by `verifyAdmin` + `manage_security` (superadmin bypass). |
| Activity feed UI | ✅ COMPLETE | `client/admin/partials/view-activity-feed.html` + `client/js/admin/modules/activity-feed.js` — timeline grouped by Today/Yesterday/Earlier, actor avatars, plain-language descriptions, resource badges, filter bar; registered in `adminPageBuilder.js`, sidebar (System Settings), and Settings Hub security tab. |
| Role-based dashboard widgets | ✅ COMPLETE | `client/js/admin/admin-dashboard.js` — `applyDashboardWidgetPermissions()` hides ERP (orders/inventory), CRM (customers), Finance (revenue), and HRM widgets based on `window.hasAdminPermission` / `window.isAdminSuperAdmin` from `admin-staff.js`; superadmin always sees all widgets. |
| RBAC section map | ✅ COMPLETE | `view-activity-feed` → `manage_security` in `permissions.js`. |
| Tests | ✅ COMPLETE | `tests/admin.test.js` +2 — activity feed success + staff 403 without `manage_security`. **153 / 153 tests passing.** |

---

## BACKUP & TAX CONFIG — 2026-09-12

| Task | Status | Summary |
|------|--------|---------|
| Database backup export | ✅ COMPLETE | `backend/src/services/backupService.js` — Mongoose-native full JSON export (no `mongodump` binary; portable in `node:20-alpine` Docker). `exportFullBackup()` iterates all registered models, writes one dated JSON file to a temp path, streams as download. |
| Backup API | ✅ COMPLETE | `backend/src/controllers/admin/backupController.js` — `GET /api/admin/system/backup-now` (superadmin only via `verifyAdmin` + `requireSuperAdmin`), `GET /api/admin/system/backup-status` for `lastBackupAt`. SecurityLog entry on each download. |
| Backup admin UI | ✅ COMPLETE | `client/admin/partials/view-system-backup.html` + `client/js/admin/modules/system-backup.js` — Download Full Backup button, last-backup timestamp, warning for large datasets, restore placeholder (“contact your developer”). Registered in `adminPageBuilder.js`, sidebar + Settings Hub utilities (superadmin-only). |
| Tax / VAT settings model | ✅ COMPLETE | `Settings.js` — `vatEnabled`, `vatPercentage`, `vatInclusive`, `taxRegistrationNumber`, `lastBackupAt`; legacy `vatRate` kept in sync with `vatPercentage`. |
| Tax / VAT admin UI | ✅ COMPLETE | “Tax & VAT” card on `view-shipping-payments.html` (Shipping & Payments tab) with enable toggle, percentage, inclusive pricing, tax reg. number, save via master-settings. |
| Checkout VAT calculation | ✅ COMPLETE | `orderCheckoutController.js` + `deliveryChargeService.js` — when `vatEnabled` and not `vatInclusive`, adds `vatPercentage` of merchandise subtotal (after discount) as `vatAmount`; stored on `Order` for historical invoices. |
| Invoice PDF VAT line | ✅ COMPLETE | `invoicePdf.js` — shows VAT line and tax registration number when present on the order snapshot. |
| Tests | ✅ COMPLETE | `tests/admin.test.js` +3 backup API tests + expanded Tax/VAT settings test; `tests/order.test.js` +1 additive VAT checkout test. **157 / 157 tests passing.** |

---

## SUPPORT SLA & SECURITY MONITORING — 2026-09-12

| Task | Status | Summary |
|------|--------|---------|
| Ticket SLA fields | ✅ COMPLETE | `ContactMessage.js` — `firstResponseAt` (set on first admin email reply); `resolvedAt` already stamped when status → `resolved`/`closed` in `contactController.js`. |
| SLA report API | ✅ COMPLETE | `backend/src/controllers/admin/supportSlaController.js` — `GET /api/admin/support/sla-report?from=&to=` returns avg first-response hours, avg resolution hours, open-ticket breach counts (24h/48h/72h), and per-agent breakdown; gated by `manage_customers`. |
| SLA admin UI | ✅ COMPLETE | `view-messages.html` SLA Overview panel — stat cards + agent performance table; loaded by `fetchSupportSlaReport()` in `messages-inbox.js`. |
| Rate-limit hit tracking | ✅ COMPLETE | `backend/src/services/rateLimitHitTracker.js` — in-memory daily counter with optional Redis; incremented on 429 from `rateLimiter.js` dynamic API limiter and `adminSecurity.js` admin login limiter. |
| Security monitor API | ✅ COMPLETE | `backend/src/controllers/admin/securityMonitorController.js` — `GET /api/admin/security/rate-limit-stats` returns top 5 failed-login IPs (24h), active blacklist entries with expiry, and 24h rate-limit hit total; gated by `manage_security`. |
| Security monitor UI | ✅ COMPLETE | `view-security.html` Security Monitor panel — rate-limit counter, top offender table with quick Blacklist action, blacklisted IPs table with Remove; `fetchSecurityMonitorStats()` + `quickBlacklistIp()` in `settings-security.js`. |
| Tests | ✅ COMPLETE | `tests/admin.test.js` +3 — SLA report, security monitor stats, RBAC 403. **160 / 160 tests passing.** |

---

## Backup UI View Isolation Fix — 2026-09-12

| Task | Status | Summary |
|------|--------|---------|
| Root cause | ✅ COMPLETE | `[data-superadmin-only].superadmin-visible { display: block !important }` in `_settings-footer.css` forced `#view-system-backup` visible on every admin page for superadmins after `applySuperAdminOnlyVisibility()`. |
| CSS isolation | ✅ COMPLETE | `_settings-footer.css` excludes `.admin-section` from superadmin chrome display rules; `_layout.css` adds `.admin-section:not(.active) { display: none !important }` so only the SPA-active view renders. |
| Navigation guards | ✅ COMPLETE | `core-nav.js` — `hideIsolatedAdminViews()` + `hidden` / `aria-hidden` toggles in `navigateAdminSection` and `switchDashboardView`; `admin-staff.js` skips full-page `.admin-section` elements in `applySuperAdminOnlyVisibility()`. |
| Partial markup | ✅ COMPLETE | `view-system-backup.html` — default `hidden` + removed `data-superadmin-only` from the section (sidebar/hub links retain superadmin gating). |
| Builder registry | ✅ COMPLETE | `adminPageBuilder.js` documents `ISOLATED_VIEW_PARTIALS` for client-side view isolation. |
| Tests | ✅ COMPLETE | **160 / 160 tests passing** — no regression. |

---

## Dynamic Expense Category Management — 2026-09-12

| Task | Status | Summary |
|------|--------|---------|
| ExpenseCategory model | ✅ COMPLETE | `expenseCategory.js` — `name`, `slug`, `isActive`, `isSystemDefault`, `allowCustomInput`, timestamps; 8 system defaults seeded on bootstrap via `expenseCategoryService.js`. |
| Expense schema update | ✅ COMPLETE | `expense.js` — `category` (dynamic slug string), `customCategoryName` (optional, for "Other" quick input); legacy `CATEGORIES` static retained for backward compatibility. |
| Category API | ✅ COMPLETE | `/api/admin/expense-categories` (active list), `/admin` (full manager), `POST`, `PATCH /:id/toggle`, `PATCH /other-custom-toggle`, `DELETE /:id` — all gated `manage_settings`; system defaults undeletable; delete blocked when expenses linked. |
| Expense CRUD validation | ✅ COMPLETE | `expenseController.js` validates against live category catalog; requires `customCategoryName` when Other + `allowCustomInput` enabled. |
| P&L integration | ✅ COMPLETE | `profitLossController.js` aggregates expenses by dynamic category slugs from `ExpenseCategory` collection. |
| Expense Tracking UI (Option 1) | ✅ COMPLETE | `erp-expenses.js` + `view-erp-expenses.html` — dropdowns populated from API; conditional "Specify Custom Category Name" field when Other selected and master toggle on. |
| System Settings manager (Option 2) | ✅ COMPLETE | New **Finance Settings** tab in `view-settings.html` + `settings-expense-categories.js` — category table, per-category active toggle, add custom category, master Other-input switch, safe delete. |
| Security audit | ✅ COMPLETE | `expense_category` added to `securityLog.js` RESOURCE_TYPES; category writes logged. |
| Tests | ✅ COMPLETE | `tests/expenseCategory.test.js` (6 tests) + updated harness seed; **166 / 166 tests passing.** |

---

## POSTGRESQL MIGRATION — STAGE 1 SCHEMA DESIGN — 2026-09-13

**Status: 🔶 PARTIAL — design only. The live database is still MongoDB.**

Stage 1 of a 5-stage MongoDB → PostgreSQL (Prisma + Neon) migration. This phase
produced **planning artifacts only**. Nothing in the running system reads them.

| Task | Status | Summary |
|------|--------|---------|
| Target schema | ✅ COMPLETE (design) | `prisma/schema.prisma` — **67 models, 55 enums**, derived from all **40** Mongoose model files in `backend/src/models/` (read in full) plus the enum sources in `config/permissions.js`. `postgresql` datasource on `env("DATABASE_URL")`. |
| Migration plan | ✅ COMPLETE | `DATABASE_MIGRATION_AUDIT.md` — 5-stage roadmap, model-by-model mapping table with Low/Med/High risk per model, full cascade strategy, index replication notes, excluded/deferred field register. |
| Live system impact | ✅ NONE | **Zero `.js` files changed.** No model, controller, route, service or script touched. No `.env` or `DATABASE_URL` read or written. No `prisma generate` / `migrate` / `db push` run. No `npm install` run (commands documented for Stage 2). |
| Primary keys | ✅ | `String @id @default(uuid())` throughout — matches the project's existing string-ID patterns (`Employee.linkedAdminId`, `Attendance.staffId`) and avoids an int/string translation during backfill. |
| Backfill key | ✅ | `legacyId String? @unique` on every top-level model holds the original Mongo `_id`, making the Stage 3 backfill idempotent and letting loose string refs resolve to real FKs. |
| Currency precision | ✅ | `@db.Decimal(12, 2)` on **every** money field (~50 columns across 20 models). Percentages/rates use `Decimal(5, 2)` and hours use `Decimal(6, 2)` so they never share the money scale. Loyalty points stay `Int`. |
| Cascade safety | ✅ | `Cascade` only for parent-owned rows. Cross-aggregate relations are `SetNull` or `Restrict`: deleting a Category cannot delete Products, deleting a Supplier cannot delete Purchase Orders (Restrict), deleting a Product cannot delete Order Items. The single deliberate exception is `CartItem → Product` (Cascade), since an open cart is not history. |
| Index parity | ✅ | Every `.index(...)` and `unique: true` replicated. Sparse-unique → nullable-unique. Compound prefix order preserved. New indexes added on the resolved FK columns. |
| Embedded arrays extracted | ✅ | 27 embedded arrays / sub-documents became their own tables — including the nested cases: `FooterSettings.columns[].links[]`, `Order.payment.ipnHistory[]`, and `Product.variants[].attributes` (a `Map<String,String>` → `product_variant_attributes`). |
| Settings consolidation confirmed | ✅ | Verified `Setting.js` is now a 12-line re-export shim and **`Settings.js` won**; the Prisma schema has exactly one `settings` table. `ARCHITECTURE.md` still described the pre-consolidation dual-singleton layout — corrected in this pass. |

### HIGH RISK items flagged for review before Stage 2

| Item | Why |
|------|-----|
| `Order.items[]` is `strict: false` | Live order lines can carry arbitrary undeclared fields. Captured in `OrderItem.extraFields Json?` rather than dropped; must be audited before Stage 5. |
| `Order.payment.ipnHistory[].raw` is `Mixed` | The only true `Mixed` field in the store models → `Json?`. |
| `Settings.defaultCourierProvider` | Its Mongoose enum lists the same three providers **twice, in two casings**. Left as `String`; normalise in Stage 3 before promoting to an enum. |
| `Order.subTotal` **and** `Order.subtotal` | Two separately-written fields differing only in capitalisation. Both preserved — collapsing them now would lose data. |
| `User.walletHistory[].type` | Free `String` documenting five mixed-case values with no enum guard. Left as `String`. |
| Enums containing `''` | `Employee.gender`/`bloodGroup`/`maritalStatus`, `Order.cancelledBy`, `PaymentMethod.provider`, `Settings.smsGatewayProvider`/`whatsAppAlertProvider`. The `''` member is dropped and the column made nullable; Stage 3 maps `''` → `NULL`. |
| Polymorphic HRM staff refs | `Attendance`/`Payroll`/`Leave` key staff by `staffId` + `staffType` (`admin` \| `employee`). Resolved by keeping both and adding nullable `adminId`/`employeeId` FKs. |
| `Admin.employeeRef` vs `Employee.linkedAdminId` | The same 1:1 edge stored twice. Only `Employee.linkedAdminId` is stored in Postgres; the Admin side becomes a back-relation. |
| `PaymentMethod` gateway secrets | `apiStorePassword`/`apiKey` are AES-256-GCM envelopes from `utils/cryptoVault.js`. Stage 3 must copy the ciphertext verbatim and must not re-encrypt. |
| `select: false` fields on `Admin` | Prisma has no column-level `select: false`. The six OTP/TOTP secret columns need explicit `select` handling in the Stage 2 repository layer. |
| Three Mongo index behaviours have no Prisma equivalent | The weighted `ProductTextIndex` (needs `tsvector` + GIN via raw SQL), and the TTL indexes on `LoginAttempt` (30 days) and `BlacklistedIp` (`expiresAt`) — both need scheduled sweep jobs. |
| Constraints tightened vs Mongoose | `Product.productId`, `PurchaseOrder.poNumber`, `Employee.employeeId`, `Category.slug` are unique-but-not-required in Mongo and NOT NULL here; `BannerSettings.key` is new. Each needs a count query against production before Stage 3. |

### Chat microservice — deferred

All 7 models in `ecommerce-chat/models/` were read and inventoried but are **out of
scope for Stage 1**: they live in a separate MongoDB (`ecommerce_chat`) behind the
port-5001 service, and migrating them means unifying the `Agent` ↔ `Admin` staff
directory — a project in its own right. `ChatRoom` is the deepest-nested schema in
the codebase (6 sub-schemas, one doubly nested).

**Tests:** unchanged — no source code was modified, so the suite is unaffected.
**Not committed:** left uncommitted for review, as requested.

---

## POSTGRESQL MIGRATION — STAGE 2 STEP 1 — 2026-09-13

**Environment setup and baseline migration.** Prisma is connected to the Neon
PostgreSQL database and the 67-table baseline schema now physically exists.
Full detail lives in `DATABASE_MIGRATION_AUDIT.md`; this is the status summary.

| Item | Status |
|------|--------|
| Prisma installed (`prisma` + `@prisma/client`, both pinned `7.10.0` exactly) | ✅ COMPLETE |
| Schema validated (`npx prisma validate`) — 67 models, 55 enums, zero errors | ✅ COMPLETE |
| Schema formatted (`npx prisma format`) | ✅ COMPLETE |
| Baseline migration `20260913131445_init_postgres_baseline` created **and applied** to Neon | ✅ COMPLETE |
| Prisma Client generated — 67 model files, exact name match against the schema | ✅ COMPLETE |
| MongoDB isolation proven — **166/166 tests still passing** | ✅ COMPLETE |
| Neon structure verified — 67 tables, no drift (`migrate diff` → *no difference*) | ✅ COMPLETE |
| Driver adapter + Prisma client singleton | ❌ NOT STARTED — next step |
| Dual-write repository layer | ❌ NOT STARTED — Stage 2 remainder |
| `LoginAttempt` / `BlacklistedIp` TTL sweep jobs | ❌ NOT STARTED — Stage 2 remainder |
| `ProductTextIndex` → `tsvector` + GIN raw SQL migration | ❌ NOT STARTED — Stage 2 remainder |
| Stage 3 backfill / Stage 4 read cutover | ⚠️ PARTIAL — **Stage 3 COMPLETE (2026-09-15)**; **Stage 4 Steps 1–6 COMPLETE (2026-09-16)** — User+owned tables live HTTP **PASS** (8/8, 0 fallbacks) after data sync; CartItem gap **0/7**; **228/228** tests; flags stay OFF until ops enable; PaymentMethod backfill still required before Order read cutover |

**Isolation guarantee:** zero `.js` files under `backend/src/` were modified — no
model, controller, route, service or script. No application code queries
PostgreSQL. The live MongoDB system serves every request exactly as before, and
the full test suite confirms it. `prisma db push` was **not** used, and no
`--accept-data-loss` or force flag was used anywhere.

**Two findings worth carrying forward:**

1. **npm's `latest` tag for `prisma` served a pre-release.** On 2026-09-13
   `npm install prisma --save-dev` resolved to `8.0.0-rc.14` while
   `@prisma/client@latest` was the stable `7.10.0` — a CLI a full major ahead of
   the client. Both packages are now pinned exactly, with no `^` range. Check
   `npm view prisma dist-tags` before any future Prisma upgrade here.
2. **Prisma 7's `prisma-client` generator emits TypeScript only.** All 75
   generated files are `.ts`; this backend is plain CommonJS JavaScript with no TS
   toolchain, so the client cannot be `require()`d as-is. Harmless today (no
   application code may touch Postgres yet) but it must be settled before the
   repository layer is written — see the three options in
   `DATABASE_MIGRATION_AUDIT.md`.

**Schema correctness note:** the one validation error found (`P1012`, the
`datasource url` property) was a Prisma 6 → 7 configuration incompatibility, not a
modelling defect. It was fixed by moving the URL into a new root
`prisma.config.js` and switching the generator. **No model, field, relation, enum,
index or constraint was changed to make validation pass.**

---

## Stage 2 Step 2 — Neon Adapter + Repository Layer (Simple Models) — 2026-09-13

**Status:** ✅ COMPLETE (not yet wired into the live app)

| Item | Status |
|------|--------|
| `@prisma/adapter-neon` + `@neondatabase/serverless` installed | ✅ |
| `backend/src/config/prismaClient.js` singleton (PrismaNeonHttp + pooled URL) | ✅ |
| Repository layer: Category, Designation, Brand, Warehouse, Supplier | ✅ |
| Reimplemented slug hooks (Category, Brand) | ✅ |
| Reimplemented default-warehouse exclusivity (Warehouse) | ✅ |
| Reimplemented Restrict guards (Designation, Supplier) | ✅ |
| Main Jest suite (`npm test`) | ✅ 166/166 |
| Neon repository integration tests (`npm run test:repositories`) | ✅ 75/75 |
| Controllers / routes / Mongoose models touched | ❌ none (by design) |

## Stage 2 Step 2, Part 2 — Admin Repository (Security-Critical) — 2026-09-13

**Status:** ✅ COMPLETE (not yet wired into the live app)

| Item | Status |
|------|--------|
| `adminRepository.js` — bcryptjs hashing (12 rounds), double-hash guard | ✅ |
| `select: false` secrecy — 6 OTP/TOTP fields omitted from default queries | ✅ |
| `findByIdWithSecrets` / `findByUsernameWithSecrets` opt-in | ✅ |
| `remove()` superadmin guard (mirrors `staffController.findStaffById`) | ✅ |
| Neon repository tests (`npm run test:repositories`) | ✅ 87/87 |
| Main Jest suite (`npm test`) | ✅ 166/166 |
| Controllers / routes / Mongoose models touched | ❌ none (by design) |

See `DATABASE_MIGRATION_AUDIT.md` § STAGE 2 STEP 2 for function lists and test output.

## Stage 2 Step 2, Part 3 — User Repository — 2026-09-13

**Status:** ✅ COMPLETE (not yet wired into the live app)

| Item | Status |
|------|--------|
| `userRepository.js` — referral codes (8-char alphabet, 6-attempt retry) | ✅ |
| Legacy `name` hook determined dead for Postgres-only records | ✅ |
| Addresses / wishlist / wallet sub-resource helpers | ✅ |
| Wallet credit/debit via sequential writes (Neon HTTP, no `$transaction`) | ✅ |
| Cascade delete verified (Address, WishlistItem, WalletTransaction, etc.) | ✅ |
| VIP/Frequent/Inactive segmentation | ❌ deferred (requires Order data) |
| Neon repository tests (`npm run test:repositories`) | ✅ 99/99 |
| Main Jest suite (`npm test`) | ✅ 166/166 |
| Controllers / routes / Mongoose models touched | ❌ none (by design) |

## Stage 2 Step 2, Part 4 — HRM Repositories (Polymorphic Staff) — 2026-09-13

**Status:** ✅ COMPLETE (not yet wired into the live app)

| Item | Status |
|------|--------|
| `hrmStaffResolver.js` — dual staffId/staffType + FK resolution | ✅ |
| `employeeRepository.js` — EMP-001, terminate→admin block, docs/refs | ✅ |
| `attendanceRepository.js` — computeHoursWorked replicated | ✅ |
| `payrollRepository.js` — computeTotalSalary replicated (workingDays=0) | ✅ |
| `leaveRepository.js` — countLeaveDays inclusive calendar count | ✅ |
| Polymorphic FK tests (admin + employee staffType) | ✅ |
| PDF payslip / SecurityLog / leave→attendance stamping | ❌ out of scope |
| Neon repository tests (`npm run test:repositories`) | ✅ 122/122 |
| Main Jest suite (`npm test`) | ✅ 166/166 |
| Controllers / routes / Mongoose models touched | ❌ none (by design) |

## Stage 2 Step 2, Part 5 — Product & Order Repositories (Embedded Decomposition) — 2026-09-13

**Status:** ✅ COMPLETE (not yet wired into the live app)

| Item | Status |
|------|--------|
| `productRepository.js` — CRUD, slug (brand algorithm), variant Map→table, cost history, embedded reviews | ✅ |
| `orderRepository.js` — nested create/reassembly, extraFields, payment/IPN/proof/notifications | ✅ |
| Variant attribute update strategy (delete+recreate) | ✅ documented |
| Order.create() partial-write risk (no transaction) | ⚠️ documented — future rollback or TX driver |
| Text search placeholder (no tsvector/GIN yet) | ⚠️ deferred |
| Cascade tests: OrderItem SetNull vs CartItem Cascade on product delete | ✅ |
| Weighted full-text search / status side-effects / review model merge | ❌ out of scope |
| Neon repository tests (`npm run test:repositories`) | ✅ 135/135 |
| Main Jest suite (`npm test`) | ✅ 166/166 |
| Controllers / routes / Mongoose models touched | ❌ none (by design) |

## Stage 2 Step 3, Part 1 — Category Dual-Write Pilot — 2026-09-14

**Status:** ✅ COMPLETE — first live controller wired; MongoDB still authoritative for reads

| Item | Status |
|------|--------|
| `dualWriteService.js` — Mongo-first, Postgres best-effort, failure isolated from API | ✅ |
| `categoryController.js` — create/update/delete only (`adminCreateCategory`, `adminUpdateCategory`, `adminDeleteCategory`) | ✅ |
| All category READ endpoints unchanged | ✅ |
| `legacyId` on Postgres create + `findByLegacyId()` for parent FK resolution | ✅ |
| Parent not yet in Postgres → null FK + `[DUAL-WRITE-PARENT-MISSING]` log | ✅ |
| Lazy repository require (Jest app graph loads without Prisma `.mts`) | ✅ |
| dualWriteService Jest tests | ✅ 3/3 |
| Main Jest suite (`npm test`) | ✅ 169/169 |
| Neon repository tests (`npm run test:repositories`) | ✅ 135/135 |
| Routes touched | ❌ none (by design) |
| Other controllers touched | ❌ none (by design) |

See `DATABASE_MIGRATION_AUDIT.md` § STAGE 2 STEP 3, PART 1 for flow detail and log shapes.

## Stage 2 Step 3, Part 2 — Dual-Write: Designation, Brand, Warehouse, Supplier — 2026-09-14

**Status:** ✅ COMPLETE — five models now dual-write; MongoDB still authoritative for reads

| Item | Status |
|------|--------|
| Designation — create/update/delete wired | ✅ |
| Brand — create/update/delete wired (slug via brandRepository) | ✅ |
| Warehouse — create/update/delete wired; setDefault on default promotion | ✅ |
| Supplier — create/update/delete wired | ✅ |
| legacyId + findByLegacyId on all four repositories | ✅ |
| dualWriteService.js modified | ❌ none (reused as-is) |
| All READ endpoints for four models unchanged | ✅ |
| Supplier Restrict delete cross-DB drift | ⚠️ documented reconciliation risk |
| Main Jest suite (`npm test`) | ✅ 169/169 |
| Neon repository tests (`npm run test:repositories`) | ✅ 135/135 |
| Routes / other controllers touched | ❌ none |

See `DATABASE_MIGRATION_AUDIT.md` § STAGE 2 STEP 3, PART 2.

## Stage 2 Step 3, Part 3 — Dual-Write: CMS/Settings Group — 2026-09-14

**Status:** ✅ COMPLETE — ten models now dual-write (Category + 4 catalog/ERP + 5 CMS/settings); MongoDB still authoritative for reads

| Item | Status |
|------|--------|
| PageContent — create/update wired | ✅ |
| NavbarLink — create/update/delete wired | ✅ |
| FooterSettings — update + badge add/delete wired (singleton) | ✅ |
| FooterSettings paymentBadges tri-state (skip vs replace []) | ✅ tested |
| Banner — create/update/delete wired | ✅ |
| BannerSettings — update wired (singleton key=global) | ✅ |
| Settings — delivery/cache/rate-limit + master save wired (singleton) | ✅ |
| Five new repositories (none existed from Step 2) | ✅ |
| bodyHtml via existing markdownToHtml.js (no new npm dep) | ✅ |
| dualWriteService.js modified | ❌ none (reused as-is) |
| All READ endpoints unchanged | ✅ |
| Main Jest suite (`npm test`) | ✅ 169/169 |
| Neon repository tests (`npm run test:repositories`) | ✅ 137/137 |
| Routes / deprecated Setting.js shim touched | ❌ none |

See `DATABASE_MIGRATION_AUDIT.md` § STAGE 2 STEP 3, PART 3.

## Stage 2 Step 3, Part 4 — Dual-Write: Security/Audit Group — 2026-09-14

**Status:** ✅ COMPLETE — fourteen models now dual-write; MongoDB still authoritative for reads

| Item | Status |
|------|--------|
| SecurityLog — single shared point in `logSecurityEvent()` | ✅ |
| LoginAttempt — shared `persistLoginAttempt()` utility | ✅ |
| BlacklistedIP — manual add/remove + auto-ban wired | ✅ |
| BlacklistedIP null expiresAt = permanent (Postgres null verified) | ✅ tested |
| StockAlert — create with LOW_STOCK / OUT_OF_STOCK child rows | ✅ tested |
| LoginAttempt / BlacklistedIP TTL sweep jobs | ❌ out of scope (deferred) |
| Four new repositories (none existed from Step 2) | ✅ |
| dualWriteService.js modified | ❌ none (reused as-is) |
| All READ/list endpoints unchanged | ✅ |
| Main Jest suite (`npm test`) | ✅ 169/169 |
| Neon repository tests (`npm run test:repositories`) | ✅ 140/140 |
| Routes touched | ❌ none |

See `DATABASE_MIGRATION_AUDIT.md` § STAGE 2 STEP 3, PART 4.

## Stage 2 Step 3, Part 5 — Dual-Write: HRM Group — 2026-09-14

**Status:** ✅ COMPLETE — eighteen models now dual-write; MongoDB still authoritative for reads

| Item | Status |
|------|--------|
| Employee — create/update/terminate/photo/doc/grantAccess/unlinkAccess wired | ✅ |
| Attendance — markAttendance/clockIn/clockOut wired | ✅ |
| Payroll — generate/approve/markPaid wired (Mongo totals mirrored, not recomputed) | ✅ |
| Leave — apply/approve/reject wired; approve stamps attendance dual-write | ✅ |
| Polymorphic staffType → adminId/employeeId resolution inside repositories only | ✅ tested |
| terminate() → admin-suspend via repository.terminate() (not duplicated) | ✅ |
| Shift CRUD / generatePaySlip / updateSalaryConfig / revoke+reactivate access | ❌ out of scope (reported) |
| dualWriteService.js modified | ❌ none (reused as-is) |
| All READ/list endpoints unchanged | ✅ |
| Main Jest suite (`npm test`) | ✅ 169/169 |
| Neon repository tests (`npm run test:repositories`) | ✅ 141/141 |
| Routes touched | ❌ none |

See `DATABASE_MIGRATION_AUDIT.md` § STAGE 2 STEP 3, PART 5.

## Stage 2 Step 3, Part 6 — Dual-Write: Marketing/Support Group — 2026-09-14

**Status:** ✅ COMPLETE — twenty-two models now dual-write; MongoDB still authoritative for reads

| Item | Status |
|------|--------|
| Newsletter — subscribe/unsubscribe wired | ✅ |
| EmailCampaign — create + per-batch send stats wired | ✅ |
| ContactMessage — 7 distinct write actions wired | ✅ |
| Review — create/update/moderate/delete wired | ✅ |
| Review FK resolution — null fallback + `[DUAL-WRITE-FK-MISSING]` log | ✅ tested |
| User dual-write in Step 3 | ❌ not yet — Reviews may have null userId until backfill |
| deleteSubscriber / campaign subscriber counter / testCampaign | ❌ out of scope (reported) |
| dualWriteService.js modified | ❌ none (reused as-is) |
| All READ/list endpoints unchanged | ✅ |
| Main Jest suite (`npm test`) | ✅ 169/169 |
| Neon repository tests (`npm run test:repositories`) | ✅ 144/144 |
| Routes touched | ❌ none |

See `DATABASE_MIGRATION_AUDIT.md` § STAGE 2 STEP 3, PART 6.

## Stage 2 Step 3, Part 7 — Dual-Write: User + Owned Tables — 2026-09-14

**Status:** ✅ COMPLETE — User group dual-write live

| Item | Status |
|------|--------|
| User register/update/delete (soft) wired | ✅ |
| Address add/update/delete wired | ✅ |
| Wishlist add/remove wired (nullable product FK) | ✅ |
| Wallet credit/debit/points conversion wired | ✅ |
| Cart CRUD wired (required product FK on CartItem) | ✅ |
| Referral code pass-through from Mongo (not regenerated) | ✅ tested |
| Part 6 Review userId gap closes for new writes | ✅ tested |
| dualWriteService.js modified | ❌ none (reused as-is) |
| All READ/list endpoints unchanged | ✅ |
| Main Jest suite (`npm test`) | ✅ 169/169 |
| Neon repository tests (`npm run test:repositories`) | ✅ 147/147 |
| Routes touched | ❌ none |

See `DATABASE_MIGRATION_AUDIT.md` § STAGE 2 STEP 3, PART 7.

## Stage 2 Step 3, Part 8 — Dual-Write: Order — 2026-09-14

**Status:** ✅ COMPLETE — Order model group (Admin deliberately deferred to Part 9)

| Item | Status |
|------|--------|
| Checkout + manual POS order create wired | ✅ |
| Admin/customer status + cancel + return flows wired | ✅ |
| Payment IPN + gateway session + payment proof wired | ✅ |
| Courier book/sync status fields wired (no wallet duplicate) | ✅ |
| Order notification flags wired | ✅ |
| Partial-write `[DUAL-WRITE-ORDER-PARTIAL]` logging with failedStage | ✅ tested |
| userId/productId null-and-log fallback on Order | ✅ tested |
| subTotal/subtotal both passed through unchanged | ✅ |
| dualWriteService.js modified | ❌ none (reused as-is) |
| All READ/list endpoints unchanged | ✅ |
| Main Jest suite (`npm test`) | ✅ 169/169 |
| Neon repository tests (`npm run test:repositories`) | ✅ 152/152 |
| Routes touched | ❌ none |

See `DATABASE_MIGRATION_AUDIT.md` § STAGE 2 STEP 3, PART 8.

## Stage 2 Step 3, Part 9 — Dual-Write: Admin (Final — Stage 2 Step 3 Complete) — 2026-09-14

**Status:** ✅ COMPLETE — **Stage 2 Step 3 dual-write rollout finished across all 9 parts / all model groups**

| Item | Status |
|------|--------|
| Staff create/update/status/reset-password/delete wired | ✅ |
| Part 5 deferred: updateSalaryConfig, revokeSystemAccess, reactivateSystemAccess | ✅ |
| 2FA (TOTP/SMS) + auth OTP flows wired | ✅ |
| Profile + settings + internal chat admin image wired | ✅ |
| Independent bcrypt salts — both verify same password (expected) | ✅ tested |
| `[DUAL-WRITE-FAILURE]` never logs secret field values | ✅ tested |
| Superadmin deletion still blocked | ✅ tested |
| dualWriteService.js modified | ❌ none (reused as-is) |
| All Admin READ/list endpoints unchanged | ✅ |
| Main Jest suite (`npm test`) | ✅ 169/169 |
| Neon repository tests (`npm run test:repositories`) | ✅ 157/157 |
| Routes touched | ❌ none |

See `DATABASE_MIGRATION_AUDIT.md` § STAGE 2 STEP 3, PART 9.

## Stage 3, Step 1 — Backfill: Designation, Brand, Warehouse, Supplier, Category — 2026-09-14

**Status:** ✅ COMPLETE — first dependency group backfilled via standalone scripts

| Item | Status |
|------|--------|
| `backfillModel()` framework (idempotent `legacyId` skip) | ✅ |
| Designation / Brand / Warehouse / Supplier / Category backfill | ✅ |
| Category two-pass parentCategoryId wiring | ✅ verified (2/2 linked) |
| Application code modified | ❌ none (repositories reused as-is) |
| MongoDB writes | ❌ none (read-only) |
| Main Jest suite (`npm test`) | ✅ 169/169 |
| Neon repository tests (`npm run test:repositories`) | ✅ 157/157 |

See `DATABASE_MIGRATION_AUDIT.md` § STAGE 3, STEP 1.

## Stage 3, Step 2 — Backfill: CMS/Settings + Security/Audit — 2026-09-14

**Status:** ✅ COMPLETE — 9 models backfilled (3 singletons with key=global idempotency)

| Item | Status |
|------|--------|
| PageContent / NavbarLink / Banner via backfillModel() | ✅ |
| BannerSettings / FooterSettings / Settings singleton backfill | ✅ idempotent |
| SecurityLog (899 docs, batch 500) / LoginAttempt (139) | ✅ |
| BlacklistedIP (null expiresAt via upsertFromMongo) | ✅ |
| StockAlert + 1396 child rows (kind discrimination) | ✅ verified |
| backfillRunner.js modified | ❌ none |
| Application code modified | ❌ none |
| Main Jest suite (`npm test`) | ✅ 169/169 |
| Neon repository tests (`npm run test:repositories`) | ✅ 157/157 |

See `DATABASE_MIGRATION_AUDIT.md` § STAGE 3, STEP 2.

## Stage 3, Step 3 — Backfill: User + HRM + Marketing/Support — 2026-09-14

**Status:** ✅ COMPLETE — 16 models / sub-resources backfilled with in-memory FK maps

| Item | Status |
|------|--------|
| User backfill + explicit `referralCode` pass-through | ✅ 4/7 created (3 failed: missing firstName) |
| Address / WishlistItem / WalletTransaction / Cart / CartItem | ✅ custom backfill + product map |
| Employee + EmployeeDocument / EmployeeReference | ✅ 3 employees, 1 document |
| Attendance / Payroll / Leave (polymorphic staff maps) | ⚠️ 1/2 attendance (Admin not in Neon yet) |
| Newsletter / EmailCampaign / ContactMessage / Review | ✅ ContactMessage 6, Review 2 |
| In-memory Product/User/Admin/Employee FK maps | ✅ Step 3 active work under 30s vs StockAlert ~37min |
| Review userId health check | ✅ 2/2 non-null userId |
| backfillRunner.js modified | ❌ none |
| Application code modified | ❌ none |
| Main Jest suite (`npm test`) | ✅ 169/169 |
| Neon repository tests (`npm run test:repositories`) | ✅ 157/157 |

See `DATABASE_MIGRATION_AUDIT.md` § STAGE 3, STEP 3.

## Stage 3, Step 4 — Backfill: Admin + Product + Gap Repair — 2026-09-14

**Status:** ✅ COMPLETE — Admin (3), Product (14 + 45 variants), gap repairs applied

| Item | Status |
|------|--------|
| Admin backfill + bcrypt hash preserved (3/3, no double-hash) | ✅ |
| Product + ProductVariant backfill with in-memory FK maps | ✅ 14/14, 45 variants |
| CartItem gap repair | ✅ 7 rows created (0→7) |
| Review/WishlistItem productId repair | ✅ 1 Review + 14 WishlistItem repaired |
| HRM Attendance re-attempt | ❌ 0/1 — orphaned `nurjahan` row permanently excluded (see 2026-09-15 note) |
| 3 User firstName failures | ❌ OPEN — documented, no invented placeholders |
| 1 Attendance orphaned staff | ❌ OPEN — deleted Admin not in Mongo/Postgres; permanently excluded |
| backfillRunner.js modified | ❌ none |
| `npm test` | ✅ 169/169 |
| `npm run test:repositories` | ✅ 157/157 |

See `DATABASE_MIGRATION_AUDIT.md` § STAGE 3, STEP 4.

## Orphaned Attendance gap confirmed permanent — 2026-09-15

**Status:** ✅ DOCUMENTED — no code/backfill fix applied

Investigation confirmed Attendance `6aa42b47265447ac6ddf014e` references Admin username
`nurjahan` / `staffId` `6a644b4a…` absent from both Mongo Admin collection (3 live admins
all backfilled) and Postgres. Pre-existing Mongo data-integrity debt; Postgres FK enforcement
correctly rejects unmigratable row. Same permanent-exclusion category as 3 users missing
`firstName`. `tests/hrm.test.js` corrected (local calendar date for today-stats; comments).

| Item | Status |
|------|--------|
| Re-run / staffUsername resolver fix | ❌ not applicable — no target Admin exists |
| Invent placeholder Admin | ❌ rejected |
| `tests/hrm.test.js` | ✅ local date + documented comments |
| `npm test` | ✅ 169/169 |

## Stage 3 Step 5 — Order backfill (Stage 3 COMPLETE) — 2026-09-15

**Status:** ✅ COMPLETE — Stage 3 (Backfill) finished across all 8 dependency groups.

Order is the most financially sensitive model. Backfill classifies each Mongo order as
**Case A** (no PG row → full create), **B** (complete PG row → skip), or **C** (partial PG
row → repair only missing children). FK resolution uses in-memory maps (user, product,
paymentMethod, admin) built once; `payment.methodId` and `paymentProof.reviewedBy` are
resolved to PG ids (null fallback) — a correctness fix the repo's `createFromMongo()` does
not do. No application code, repositories, routes, or `dualWriteService.js` changed.

| Item | Status |
|------|--------|
| Orders processed | ✅ 25 — Case A=25, B=0, C=0, failed=0 |
| `SUM(grandTotal)` Mongo vs Postgres | ✅ 129,464 == 129,464 (diff 0) |
| `SUM(totalAmount)` Mongo vs Postgres | ✅ 129,464 == 129,464 |
| Mongo-has-payment orders missing PG `OrderPayment` | ✅ 0 (of 16) |
| FK null fallbacks | userId 0 · item productId 25 (legacy SKUs) · methodId 15 (PaymentMethod not migrated) · reviewedBy 0 |
| `subTotal`/`subtotal` collapse | ❌ never — both passed independently |
| backfillRunner.js / repositories modified | ❌ none |
| `npm test` | ✅ 169/169 |
| `npm run test:repositories` | ✅ 157/157 |

**Permanent gaps at Stage 3 close:** 3 users missing `firstName`, 1 orphaned Attendance
(`nurjahan`). **Stage 4 prerequisite:** backfill PaymentMethod before Order read cutover
(15 orders currently read `methodId` as null). See `DATABASE_MIGRATION_AUDIT.md` §
STAGE 3, STEP 5.

## Stage 4 Step 1 — Read-cutover framework + group 1 — 2026-09-15

**Status:** ✅ COMPLETE — feature-flag framework and first cutover group (Category, Brand,
Supplier, Warehouse, Designation) wired for **reads only**. All `READ_PG_*` flags default
OFF; Mongo remains the live read path until deliberately enabled per environment.

| Item | Status |
|------|--------|
| `readCutoverFlags.js` + `readRouter.js` | ✅ per-group env flags; `[READ-CUTOVER-FALLBACK]` on Postgres error |
| `readShapeHelpers.js` | ✅ `_id` ← `legacyId`; category parent populate; enum normalisation |
| Category / Brand / Supplier / Warehouse / Designation read endpoints | ✅ wired (writes + dualWrite unchanged) |
| Hybrid enrichments (until later groups cut over) | ⚠️ supplier `suppliedProducts` + POs, warehouse `productCount`, category slug-page products — still Mongo |
| Default (flags OFF) regression | ✅ `npm test` 183/183 |
| Flag-ON + fallback unit tests | ✅ 14 new tests in `tests/services/` |
| `npm run test:repositories` | ✅ 157/157 |
| Flags enabled in production | ❌ deliberate post-review step only |

## Stage 4 Step 1 cleanup — Data parity fix — 2026-09-15

**Status:** ✅ COMPLETE — Postgres-only cleanup after Step 1 verification drift report.

| Item | Status |
|------|--------|
| Delete 2 designation test artifacts (`legacyId: null`) | ✅ exact pgIds only |
| Category `isActive` sync (Mongo authoritative) | ✅ 9 corrected; 5 unchanged |
| Timestamps sync (Category×14, Brand×1, Warehouse×1, Designation×8) | ✅ |
| Warehouse Main `isDefault` restore | ✅ |
| Category slug / productCount | ⏸️ intentionally deferred |
| Brand backfill slug/status/description | ⏸️ left AS-IS per decision |
| Re-verification | ⚠️ Supplier **PASS**; others **FAIL** on `__v` shape + out-of-scope fields only |
| Process fixes | ✅ categoryRepository default; designation/warehouse test cleanup guards |
| `npm test` / `test:repositories` | ✅ 183/183, 157/157 |

## Stage 4 Step 2 — Read-cutover CMS/Settings group — 2026-09-15

**Status:** ✅ COMPLETE (framework + wiring) — ⚠️ **3/5 models need Postgres data sync before enable**

| Item | Status |
|------|--------|
| New flags: `READ_PG_PAGECONTENT`, `NAVBARLINK`, `FOOTERSETTINGS`, `BANNER`, `SETTINGS` | ✅ all default OFF |
| `readShapeHelpers.js` CMS transforms | ✅ nested FooterSettings/Settings reassembly; banner Decimal→Number; PageContent stored bodyHtml |
| `settingsReadService.fetchSettingsDocument()` | ✅ routed singleton read |
| Read endpoints wired (controllers + delivery/flash/reward/rate-limit read paths) | ✅ writes unchanged |
| Verification (process env) | ✅ NavbarLink **PASS**, Banner **PASS**; PageContent/FooterSettings/Settings **DATA PARITY FAIL** (timestamp/sync drift — see audit) |
| `npm test` / `test:repositories` | ✅ 194/194, 157/157 |

## Stage 4 Step 2 cleanup — Data sync + live threshold bug fix — 2026-09-15

**Status:** ✅ COMPLETE — Postgres data sync for PageContent (7 rows), FooterSettings (full child resync), Settings (timestamps); live `resolveFreeShippingThreshold` null→0 bug fixed in `announcementSettings.js` (read-only, affects Mongo checkout today).

| Item | Status |
|------|--------|
| PageContent timestamp sync | ✅ 7/7 rows |
| FooterSettings full resync + test copyright guard | ✅ 2 cols / 9 links / 4 social / 5 gw / 5 badges |
| Settings timestamps (threshold kept 1000) | ✅ |
| Live freeShippingThreshold bug fix | ✅ Mongo + Postgres read paths both return 1000 |
| Re-verification (5 CMS/Settings models) | ✅ PASS (master-settings: `serverNow` only) |
| `npm test` / `test:repositories` | ✅ 198/198, 157/157 |

## Stage 4 Step 3 — Read-cutover Security/Audit group — 2026-09-15

**Status:** ✅ FRAMEWORK COMPLETE — routed reads for SecurityLog, LoginAttempt, BlacklistedIP, StockAlert; flags default OFF; BlacklistedIP hot path uses indexed `findUnique({ ip })`.

| Item | Status |
|------|--------|
| New flags: `READ_PG_SECURITYLOG`, `LOGINATTEMPT`, `BLACKLISTEDIP`, `STOCKALERT` | ✅ all default OFF |
| Hot-path BlacklistedIP + LoginAttempt intrusion count wired | ✅ `adminSecurity.js` |
| SecurityLog pagination + staff audit groupBy | ✅ |
| StockAlert kind reassembly (LOW_STOCK / OUT_OF_STOCK) | ✅ unit + repository tests |
| Verification | ✅ LoginAttempt **PASS**, BlacklistedIP **PASS**; SecurityLog **DATA PARITY FAIL** (recent rows missing in PG); StockAlert repo-level **DATA PARITY FAIL** |
| `npm test` / `test:repositories` | ✅ 204/204, 157/157 |

## Stage 4 Step 3 — Root cause fixed + data sync complete — 2026-09-16

**Status:** ✅ COMPLETE — production dual-write restored; historical gap synced; backupController SecurityLog bugs fixed. **Flags remain OFF.**

| Item | Status |
|------|--------|
| Root cause | ✅ Missing `@prisma/adapter-neon` on production PM2 host + `prisma generate` not run; fixed on server (Node 22 + manual install). Code fix: StockAlert persist-before-notifications |
| Phase A cron dual-write | ✅ Confirmed 2026-09-16T03:00 UTC (StockAlert + Courier SecurityLog) |
| Phase B sync | ✅ **16** SecurityLog + **48** StockAlert = **64** rows; post-cutoff gap **0**; overall **931/931**, **1271/1271** |
| backupController.js | ✅ `setting` resourceType; `actor` / `ipAddress` params |
| HTTP verification (4 models) | ✅ **PASS** all endpoints |
| Repo sample script | ⚠️ `_id` buffer shape + SecurityLog `updatedAt` micro-drift only (rows present; not enable blockers) |
| `npm test` / `test:repositories` | ✅ 204/204, 157/157 |

## Stage 4 Step 4 — Read-cutover HRM group (polymorphic staff) — 2026-09-16

**Status:** ✅ COMPLETE — first polymorphic-staff read-cutover group wired; **live HTTP verification PASS**. **Flags remain OFF.**

| Item | Status |
|------|--------|
| New flags: `READ_PG_EMPLOYEE`, `ATTENDANCE`, `PAYROLL`, `LEAVE` | ✅ all default OFF |
| Employee reads | ✅ list, stats, detail, profile composite (attendance + payroll + leave + documents) |
| Attendance reads | ✅ list (+ todayStats), monthly summary; polymorphic staff filter |
| Payroll reads | ✅ list + rollup summary + employee designation decoration |
| Leave reads | ✅ list, balance aggregate, calendar feed |
| Polymorphic staff resolution | ✅ admin + employee staffId via FK→legacyId maps; unit-tested both staff types |
| Parity fixes (2026-09-16) | ✅ `aggregateStats` groupBy sort; full employee lean/toObject shape; `mongoVersion` column; Postgres data sync (timestamps, linkedAdminId, enums, attendance gap) |
| Live HTTP verification | ✅ Employee 4/4, Attendance 4/4, Payroll 1/1, Leave 3/3; **0 fallbacks** |
| `npm test` / `test:repositories` | ✅ 212/212, 157/157 |

## Stage 4 Step 6 — Read-cutover User + owned tables — 2026-09-16

**Status:** ✅ COMPLETE — read wiring + data sync + live HTTP verification **PASS**; **flags remain OFF** until ops enable.

| Item | Status |
|------|--------|
| New flags: `READ_PG_USER`, `ADDRESS`, `WISHLIST`, `WALLET`, `CART` | ✅ all default OFF |
| Customer profile / addresses / wishlist / cart / dashboard wallet reads | ✅ wired via `userReadService.js` |
| Admin customer list + detail reads | ✅ wired |
| Referral info read (`referralCode` pass-through) | ✅ code + live PASS post-sync |
| CartItem gap (Mongo vs Postgres line count) | ✅ **0 missing / 7 total** |
| Data sync (`stage4-step6-user-data-sync.local.js`) | ✅ 7 users, 5 addresses, 13 wallet txns, 3-user backfill |
| Live HTTP verification | ✅ 8/8 PASS, 0 fallbacks |
| `npm test` / `test:repositories` | ✅ 228/228, 157/157 |

## Stage 2 Step 3, Part 2.4 — Dual-Write: PurchaseOrder + PurchaseOrderItem — 2026-09-20

**Status:** ✅ COMPLETE

| Item | Status |
|------|--------|
| `purchaseOrderRepository.js` — upsert with item delete/re-insert | ✅ |
| `getPurchaseOrderWithItems()` — Prisma include replaces `.populate()` | ✅ |
| `listPurchaseOrdersFromPG()` — status + dateFrom/dateTo filters | ✅ |
| `updatePurchaseOrderStatusInPG()` + `deletePurchaseOrderInPG()` | ✅ |
| Controller dual-write on create / update / receive / cancel | ✅ |
| PG read cutover for list + detail when `READ_PG_PURCHASE_ORDER=true` | ✅ default OFF |
| Backfill script `backfillPurchaseOrders.js` | ✅ idempotent batch-100 |
| Repository integration tests | ✅ 7/7 pass (`node --test`) |
| `[DUAL-WRITE-PURCHASEORDER-FAIL]` never throws to caller | ✅ |

## Stage 2 Step 3, Part 2.5 — Dual-Write: Shift, Note, AdminNotification, UserSession, AdminSession — 2026-09-20

**Status:** ✅ COMPLETE

| Model | Repository | Controller wired | Backfill | Tests |
|-------|------------|------------------|----------|-------|
| Shift + ShiftAssignment | ✅ | ✅ attendanceController | ✅ backfillShifts.js | ✅ 5/5 |
| Note + NoteShoppingItem | ✅ | ✅ noteController | ✅ backfillNotes.js (4 migrated) | ✅ 5/5 |
| AdminNotification | ✅ | ✅ notificationService + controller | ✅ no-op (fresh start) | ✅ 4/4 |
| UserSession | ✅ | ✅ login/authHelpers/middleware | ✅ no-op (ephemeral) | ✅ 4/4 |
| AdminSession | ✅ | ✅ authController/sessionController/middleware | ✅ no-op (ephemeral) | ✅ 4/4 |

| Item | Status |
|------|--------|
| READ_PG_SHIFT / NOTE / ADMIN_NOTIFICATION / USER_SESSION / ADMIN_SESSION flags | ✅ default OFF |
| Combined repository tests (Part 2.5) | ✅ 22/22 pass |

## Stage 2 Step 3, Part 2.6 — PG TTL Sweep Job — 2026-09-20

**Status:** ✅ COMPLETE — **Phase 2 dual-write rollout complete**

| Item | Status |
|------|--------|
| `deleteExpiredLoginAttemptsFromPG()` — 30-day retention | ✅ |
| `deleteExpiredBlacklistedIpsFromPG()` — expiresAt < now, null preserved | ✅ |
| `deleteExpiredUserSessionsFromPG()` — confirmed (Part 2.5) | ✅ |
| `deleteExpiredAdminSessionsFromPG()` — confirmed (Part 2.5) | ✅ |
| `pgTtlSweepJob.js` — daily 02:00 cron | ✅ |
| Registered in `server.js` | ✅ |
| `READ_PG_USER_SESSION` + `READ_PG_ADMIN_SESSION` flags | ✅ present |
| TTL integration tests | ✅ 4/4 pass |

## Stage 4 Step 1, Part 3.1 — Analytics Aggregate → Prisma — 2026-09-20

**Status:** ✅ COMPLETE

| Controller | Mongo aggregate / count converted | Prisma equivalent | Flag |
|------------|-----------------------------------|-------------------|------|
| `financeAnalyticsController.js` | Order `$facet`/`$group` pipeline in `aggregateFinanceByDateRange` | `orderRepository.findAll()` + in-memory P&L (`computeFinanceMetricsPg`) | `READ_PG_FINANCE_ANALYTICS` |
| `profitLossController.js` | Expense `$match` + `$group` by category | `getExpenseSummaryByCategory()` (`prisma.expense.groupBy`) | `READ_PG_PROFIT_LOSS` |
| `accountsSummaryController.js` | Expense `$sum` all-time; PO open `$match` + `$sum` | `getTotalExpensesAllFromPG()`; `sumOpenPurchaseOrderTotalFromPG()` | `READ_PG_ACCOUNTS_SUMMARY` |
| `crmController.js` | *(no `.aggregate()`)* — `countDocuments`/`find` | `prisma.cart.count` / `findMany` with `items: { some: {} }` | `READ_PG_CRM` |
| `enterpriseSummaryController.js` | *(no `.aggregate()`)* — 17× `countDocuments` | `prisma.*.count`, repo helpers, raw SQL low-stock | `READ_PG_ENTERPRISE_SUMMARY` |

All flags default **OFF** (Mongo reads unchanged until env `=true`).

## Stage 4 Step 1, Part 3.2 — Master Verification Script — 2026-09-20

**Status:** ✅ COMPLETE

| Item | Status |
|------|--------|
| `backend/scripts/verifyFullMigration.js` | ✅ |
| Section 1 — 28 model count comparison table | ✅ |
| Section 2 — SUM(grandTotal) financial integrity (±0.01) | ✅ |
| Section 3 — all `readCutoverFlags` ON/OFF snapshot | ✅ |
| Section 4 — MIGRATION READY verdict | ✅ |
| Run: `cd backend && node scripts/verifyFullMigration.js` | ✅ |

## Stage 4 Step 1, Part 3.2b — Verification Fixes — 2026-09-20

**Status:** ✅ COMPLETE — `MIGRATION READY: YES ✅`

| Fix | Action |
|-----|--------|
| PaymentMethod backfill | Ran `backfillPaymentMethods.js` — 6 upserted |
| Orphan PG cleanup | `cleanTestDataFromPG.js` — 7 categories, 5 orders deleted; 1 cart re-synced |
| Expected skips | AdminNotification + Settings excluded from mismatch verdict |
| Re-verify | `verifyFullMigration.js` — 0 mismatches, financial PASS |

## Stage 4 Step 1, Part 3.3 — Flag Rollout System — 2026-09-20

**Status:** ✅ COMPLETE

| Item | Status |
|------|--------|
| `enableFlags.js` — doctl env helper + `--status` (45 flags) | ✅ |
| `monitorCutover.js` — fallback / dual-write / TTL log monitor | ✅ |
| `backend/docs/ROLLOUT_GUIDE.md` | ✅ |
| `backend/docs/DECOMMISSION_GUIDE.md` | ✅ |

## Attendance System Upgrade — 2026-09-20

**Status:** ✅ COMPLETE

| Item | Status |
|------|--------|
| Daily Sheet tab (merged employee + attendance for date) | ✅ `GET /api/admin/hrm/attendance/daily-sheet` |
| Per-row auto-save status (Present/Late/Half-Day/Absent/Leave/Holiday) | ✅ `POST /mark` with lock guard |
| Bulk Mark All Present / Absent | ✅ `POST /bulk-mark` |
| AttendanceLock model (Mongo + Prisma) | ✅ `attendanceLock.js`, `AttendanceLock` table |
| Lock/unlock date (Super Admin only) | ✅ `POST/DELETE /lock`, `GET /lock-status` |
| Locked date writes return HTTP 423 | ✅ mark, clock-in/out, bulk, manual entry |
| Manual Entry tab + recent 30 table | ✅ `POST /manual-entry`, `GET /manual-entries` |
| Super Admin override locked date on manual entry | ✅ `overrideLock` body flag |
| Attendance audit fields (modifiedBy, modifiedAt, isManualEntry) | ✅ Mongo + Prisma |
| Repository tests (daily sheet, bulk mark, lock) | ✅ `attendance.repository.test.js`, `attendanceLock.repository.test.js` |
| Jest suite | ✅ 228/228 passing |

## Admin-Employee Profile Link — 2026-09-20

**Status:** ✅ COMPLETE

| Item | Status |
|------|--------|
| Merged sidebar profile API (`GET /api/admin/profile/me/full`) | ✅ Employee photo preferred over Admin.image |
| Super Admin link endpoint (`PUT /api/admin/profile/link-employee`) | ✅ 409 if employee already linked to another admin |
| Bidirectional photo sync | ✅ Admin profile pic ↔ Employee.photo via Cloudinary URLs |
| Bidirectional name sync (Super Admin) | ✅ Admin displayName → linked Employee fullName |
| Frontend sidebar module (`adminSidebar.js`) | ✅ sessionStorage cache + refresh on save/upload |
| Settings Hub link UI | ✅ Active employee dropdown (super-admin only) |
| PG repository merge helper | ✅ `getAdminWithEmployeeData` + `READ_PG_ADMIN` flag |
| Repository tests | ✅ 3 new cases in `admin.repository.test.js` |
| Jest suite | ✅ 228/228 passing |

## Jest + Prisma ESM Compatibility Fix — 2026-09-20

**Status:** ✅ COMPLETE

| Item | Status |
|------|--------|
| Jest parses `generated/prisma/client.mts` without ESM error | ✅ via `moduleNameMapper` → `tests/mocks/prismaGeneratedClient.js` |
| Jest integration tests use Mongo reads (READ_PG pinned off) | ✅ `tests/setup.js` + `tests/app.js` |
| `npm test` all suites pass | ✅ **26/26 suites, 228/228 tests** |
| Repository tests (`npm run test:repositories`) unchanged | ✅ real Prisma client via `node --test` |

## Audit System Initialized — 2026-09-20

**Status:** ✅ COMPLETE

Full `.cursorrules` rewrite with Project Identity, Audit File Map, Auto-Audit Rules (5 steps), Database Rules (PG primary), New Feature Checklist, and Commit Message Format.

Domain audit files under `docs/audit/` created from live codebase scans — each includes **File Inventory**, **Feature Checklist**, **Known Issues**, **Dependencies**, and **Change Log** (not placeholders).

| Area audit file | Status | Notes |
|-----------------|--------|-------|
| `docs/audit/ADMIN_PANEL_AUDIT.md` | ✅ | 46 partials, 53 admin modules inventoried |
| `docs/audit/CUSTOMER_FRONTEND_AUDIT.md` | ✅ | 21 HTML pages, profile/checkout/PDP modules |
| `docs/audit/AUTH_SECURITY_AUDIT.md` | ✅ | Auth controllers, RBAC, 2FA, session repos |
| `docs/audit/HRM_AUDIT.md` | ✅ | Full audit + bug fixes 2026-09-20 — 26/26 HRM features complete |
| `docs/audit/ORDERS_AUDIT.md` | ✅ | 14 order routes; 2 low-severity PG verify gaps |
| `docs/audit/PRODUCTS_AUDIT.md` | ✅ | Catalog + ERP; slug schema gap noted |
| `docs/audit/PAYMENTS_FINANCE_AUDIT.md` | ✅ | Gateways, P&L, wallet, expenses |
| `docs/audit/CMS_AUDIT.md` | ✅ | Banners, pages, navbar, footer, branding |
| `docs/audit/MARKETING_AUDIT.md` | ⚠️ | UltraMsg WhatsApp subscription suspended |
| `docs/audit/CHAT_AUDIT.md` | ⚠️ | Close/teardown gaps; OpenAI quota issue |
| `docs/audit/DEVOPS_AUDIT.md` | ✅ | Docker, Nginx, PM2, CI, migration ops |

Root `CHAT_AUDIT.md` → redirect stub. Backend API status remains here. DB migration → `DATABASE_MIGRATION_AUDIT.md`.

## HRM Full Audit — 2026-09-20

**Status:** ⚠️ PARTIAL — core module complete; 2 bugs open (audit-only, no fixes applied)

| Item | Status | Notes |
|------|--------|-------|
| Backend models (employee, attendance, lock, shift, leave, payroll) | ✅ | Mongo + Prisma dual-write |
| Controllers + repositories + `/api/admin/hrm/*` routes | ✅ | 50+ HRM endpoints wired |
| Frontend (employees, attendance, payroll, leaves partials + JS + CSS) | ✅ | Daily Sheet default tab |
| Admin sidebar loader (`adminSidebar.js`) | ✅ | Loads via `admin-core.js`; calls `GET /profile/me/full` |
| Admin–employee profile merge (photo) | ⚠️ | Works when `linkedAdminId` FK present; PG misses `employeeRef`-only links |
| Admin–employee profile merge (name) | ❌ | `buildAdminEmployeeProfileShape` uses Admin `displayName` only; employee `fullName` not shown in sidebar |
| Employee name → Admin sync on HRM update | ❌ | `updateEmployee` does not push `fullName` to linked Admin |
| Staff past-date attendance restriction | ❌ | No backend or UI guard; lock is only control |
| Attendance date lock (Super Admin) | ✅ | HTTP 423 on locked writes |
| Repository + integration tests | ✅ | `tests/repositories/*`, `tests/hrm.test.js` |

**Bug 1 (sidebar link):** Photo sync works on employee upload; name never reflects Employee record; PG read path orphan-link gap.  
**Bug 2 (attendance dates):** Staff with `manage_staff` can mark/clock-in for any past date via API or Daily Sheet date picker.

See `docs/audit/HRM_AUDIT.md` for file/line evidence and full inventory.

## HRM Bug Fix — 2026-09-20

**Status:** ✅ COMPLETE

| Item | Status | Notes |
|------|--------|-------|
| Sidebar shows linked Employee `fullName` + photo | ✅ | `buildAdminEmployeeProfileShape` + PG `employeeRef` fallback |
| Employee name update syncs linked Admin | ✅ | `syncLinkedAdminName` in `employeeController.js` |
| Sidebar refresh after HRM employee save | ✅ | `hrm-employees.js` clears cache + reloads profile |
| Staff past-date attendance blocked (API) | ✅ | HTTP 403 on mark/clock/bulk when date ≠ today |
| Super Admin / HR bypass for past dates | ✅ | Manual Entry exempt; superadmin always allowed |
| Daily Sheet past-date view-only UI | ✅ | Banner + disabled actions; `max=today` on date picker |
| Jest regression suite | ✅ | **228/228** passing |

## Production Bug Fix — 2026-09-20

**Status:** ✅ COMPLETE

| Item | Status | Notes |
|------|--------|-------|
| Enterprise summary low-stock PG query | ✅ | Fixed `stock_quantity` → `"stockQuantity"` in `countLowStockProductsFromPG()` |
| `GET /api/admin/profile/me/full` | ✅ | Route registered via `adminProfileController.getAdminProfileFull` before `/profile` |
| `GET /api/admin/hrm/attendance/daily-sheet` | ✅ | Named attendance routes ordered before bare list route; all HRM attendance writes verified |
| Server boot Prisma errors | ✅ | No column errors on startup |
| Jest regression suite | ✅ | **228/228** passing |

## HRM Attendance Edit Controls + Save Feedback — 2026-09-20

**Status:** ✅ COMPLETE

| Item | Status | Notes |
|------|--------|-------|
| Manual Entry HR/Super Admin only (API) | ✅ | `requireHrOrSuperAdmin` on `POST /hrm/attendance/manual-entry` → 403 |
| Manual Entry tab hidden for non-HR | ✅ | `applyManualEntryTabVisibility()` via `window.adminRole` |
| Daily Sheet inline edit (check-in/out/note) | ✅ | ✏️ row expand; `PUT /hrm/attendance/update` dual-write |
| Attendance remove (HR/Super Admin) | ✅ | `DELETE /hrm/attendance/remove`; 🗑️ hidden for staff |
| Per-row save feedback (Daily Sheet) | ✅ | Spinner → ✓ Saved / ✗ Failed without disabling table |
| Employee modal save feedback | ✅ | Saving… → ✓ Saved! → close after 1s |
| Bulk/manual/lock toasts | ✅ | `showHrmToast` wraps existing `showToast` |
| Jest regression suite | ✅ | **228/228** passing |

## Production Route Fix — 2026-09-20

**Status:** ✅ Fixed — four production 404/500 errors resolved

| Issue | Status | Fix |
|-------|--------|-----|
| `GET /api/admin/profile/me/full` 404 | ✅ | Route moved to top of `adminRoutes.js` (line ~140), before `/me/*` and all param routes |
| `GET /api/admin/enterprise-summary` 500 | ✅ | `countLowStockProductsFromPG()` uses quoted `"stockQuantity"` / `"lowStockThreshold"` on `"products"`; per-metric `safeMetric()` returns partial 200 |
| `GET /api/admin/hrm/attendance/daily-sheet` 404 | ✅ | Named attendance routes reordered; `daily-sheet` first; `view_attendance` permission added |
| `DELETE /api/admin/hrm/attendance/lock` 404 | ✅ | Route confirmed + `requireSuperAdmin` middleware; `unlockAttendanceDate` export verified |
| Jest regression suite | ✅ | **228/228** passing |

## Final Polish Group 4 — 2026-09-20

**Status:** ✅ **100% Enterprise Ready** — full report: `docs/audit/MASTER_ENTERPRISE_AUDIT.md`

| Feature | Status | Notes |
|---------|--------|-------|
| Auth rate limiting | ✅ | `authLimiter` / `otpLimiter` / `apiLimiter` on login, OTP, and global `/api/*` |
| Return/refund workflow | ✅ | `returnRequest` schema; admin queue tab; customer 7-day return modal |
| Loyalty points polish | ✅ | Earn on delivery (existing); redeem at checkout; profile loyalty dashboard card |
| Maintenance mode | ✅ | Middleware 503 + IP allowlist; Settings Hub toggle + custom message |
| Admin UI polish | ✅ | Empty states, loading patterns, table horizontal scroll on key lists |
| Jest regression suite | ✅ | **228/228** passing |

## Medium Priority Group 3 — 2026-09-20

**Status:** ✅ Complete (superseded by Group 4 at 100%) — full report: `docs/audit/MASTER_ENTERPRISE_AUDIT.md`

| Feature | Status | Notes |
|---------|--------|-------|
| Invoice PDF generation | ✅ | `invoiceService.js`; admin `GET /orders/:id/invoice`; customer alias route; download buttons |
| Financial export Excel/PDF | ✅ | `exportService.js`; `GET /finance/export`; 3-sheet Excel + P&L PDF |
| Order status timeline | ✅ | `statusHistory[]` + PG `OrderStatusHistory`; vertical admin timeline |
| Health check + error logging | ✅ | `GET /health`; `errorLogger.js` daily logs + admin notify on 500 |
| Attendance payroll integration | ✅ | `calculatePayrollFromAttendance()`; preview endpoint + breakdown modal |
| Jest regression suite | ✅ | **228/228** passing |

## High Priority Features Group 2 — 2026-09-20

**Status:** ✅ **89% Enterprise Ready** — full report: `docs/audit/MASTER_ENTERPRISE_AUDIT.md`

| Feature | Status | Notes |
|---------|--------|-------|
| Attendance Settings panel | ✅ | `GET/PUT /settings/attendance`; Shifts tab card; Daily Sheet late + default check-in |
| Granular staff permissions UI | ✅ | 25 permissions; grouped staff panel; `PUT /staff/:id/permissions` |
| Product SEO persisted | ✅ | `seoTitle`/`seoDescription`/`seoKeywords` Mongo + PG |
| Bulk order status update | ✅ | `PUT /orders/bulk-status`; frontend bulk Apply |
| Wishlist notifications | ✅ | Daily cron 10:00 AM; price drop + back-in-stock emails |
| Jest regression suite | ✅ | **228/228** passing |

### Enterprise gap summary (A–H) — post Group 2

| Area | Status |
|------|--------|
| A. HRM & Staff | ✅ Mostly complete — settings + granular RBAC; no performance KPIs |
| B. Sales & Orders | ✅ Mostly complete — bulk status added |
| C. Products & Inventory | ✅ Mostly complete — SEO persisted; WhatsApp mitigated |
| D. Customer Experience | ✅ Mostly complete — wishlist notifications added |
| E. Finance & Accounts | ✅ Complete |
| F. CMS & Settings | ⚠️ Partial — no multi-language |
| G. Security | ✅ Mostly complete — whitelist missing |
| H. Performance & DevOps | ✅ Mostly complete — PG backup + Redis optional |

## Critical Bug Fix Group 1 — 2026-09-20

**Status:** ✅ **82% Enterprise Ready** — full report: `docs/audit/MASTER_ENTERPRISE_AUDIT.md`

| Fix | Status | Notes |
|-----|--------|-------|
| Attendance Register tab infinite loading | ✅ | `hrm-tab-register` → `loadAttendanceList()`; 10s timeout + error row |
| HRM fetch `res.ok` checks | ✅ | `hrmFetchJson()` on all read paths; toast + spinner cleanup on error |
| WhatsApp gateway suspended | ✅ | Safe UltraMsg handling; `GET /settings/gateway-status`; UI banner + disabled Send |
| Clock-in/out UI wired | ✅ | Daily Sheet "Set Now"; Register "Clock Out Now" → `POST /clock-out` |
| PostgreSQL backup | ✅ | `exportPostgresBackup()` ZIP; `GET /system/backup-postgres`; backup UI button |
| Register pagination limit=100 | ✅ | Default limit 50; prev/next pagination with filter preservation |
| Jest regression suite | ✅ | **228/228** passing |

### Enterprise gap summary (A–H) — post-fix

| Area | Status |
|------|--------|
| A. HRM & Staff | ✅ Mostly complete — superseded by Group 2 above |
| B. Sales & Orders | ✅ Mostly complete — superseded by Group 2 above |
| C. Products & Inventory | ✅ Mostly complete — superseded by Group 2 above |
| D. Customer Experience | ✅ Mostly complete — superseded by Group 2 above |
| E. Finance & Accounts | ✅ Complete |
| F. CMS & Settings | ⚠️ Partial — no multi-language; template editors limited |
| G. Security | ✅ Mostly complete — whitelist missing |
| H. Performance & DevOps | ✅ Mostly complete — PG manual backup added; Redis optional |

## Master Enterprise Audit — 2026-09-20

Initial deep scan identified 6 critical bugs (74% ready). All fixed in Critical Bug Fix Group 1 above.

## Deep Production Audit — 2026-09-21

**Status:** ⚠️ **Audit only — no fixes applied** — full report: `docs/audit/PRODUCTION_ISSUES_AUDIT.md`

| Item | Status | Notes |
|------|--------|-------|
| Console errors A–H traced to root cause | ✅ Documented | 52 actionable issues |
| `GET /settings/gateway-status` 500 | ❌ Open | Mongo-only `Settings.getOrCreate()` |
| `GET /settings/attendance` 500 | ❌ Open | Same Mongo settings read path |
| Register clock-out for employees | ❌ Open | `findAdmin`-only resolver; employee `staffId` → 404 |
| Socket.io admin timeout | ❌ Open | Nginx missing WebSocket upgrade on store `/socket.io/` |
| Grant-access "Access already granted" | ✅ Fixed | `syncLinkedAdminIdToPostgres`; HTTP 409; staff directory refresh |
| Grant modal 8 vs 25 permissions | ✅ Fixed | Dynamic API-grouped grid from `/api/admin/permissions` |
| Pagination vs Orders reference | ⚠️ Open | 6/13 sections match Orders `AdminPagination` style |
| Cloudinary 404 images | ⚠️ Open | DB URL vs deleted/wrong cloud assets |
| ERR_ADDRESS_UNREACHABLE polls | ⚠️ Infra | Correct relative URLs; network/server uptime |
| HRM enterprise self-service gaps | ❌ Missing | Portal, attendance export, offboarding |
| Jest regression suite | ✅ | **228/228** passing |

## Critical Fix Group A — 2026-09-21

**Status:** ✅ **Complete** — all five critical production fixes shipped in code; Nginx WebSocket requires droplet runbook apply

| # | Fix | Status | Key files |
|---|-----|--------|-----------|
| 1 | Clock-out employee resolution | ✅ Fixed | `hrmStaffResolver.js`, `attendanceController.js`, `hrm-attendance.js` |
| 2 | Settings gateway + attendance 500 | ✅ Fixed | `settingsReadService.js`, `gatewayStatusService.js`, `attendanceSettingsService.js` |
| 3 | Socket.io admin WebSocket | ✅ Runbook | `devops/NGINX_WEBSOCKET_FIX.md` (apply on production) |
| 4 | Grant-access PG/Mongo drift | ✅ Fixed | `syncLinkedAdminIdToPostgres`, HTTP 409, staff directory + dropdown refresh |
| 5 | Grant modal 25 permissions | ✅ Fixed | Dynamic grouped grid from `GET /api/admin/permissions` |
| — | Jest regression suite | ✅ | **228/228** passing |

## Fix Group B — Pagination + Staff Directory — 2026-09-21

**Status:** ✅ **Complete**

| Item | Status | Notes |
|------|--------|-------|
| Unified pagination utility | ✅ Fixed | `pagination-util.js` + `_pagination.css`; Orders-style apg-wrapper |
| 13 admin sections paginated | ✅ Fixed | Employees, attendance, leave, payroll, customers, products, coupons, expenses, reviews, newsletter, contact, security logs, stock alerts |
| Staff Directory rebuild | ✅ Fixed | Assign modal, Edit Permissions modal, Suspend/Revoke row actions |
| Revoke access API | ✅ Fixed | `DELETE /api/admin/staff/:id/access` — suspend + clear HRM link |
| Customer page-based pagination | ✅ Fixed | `customerAdminController` returns `{ total, page, totalPages }` when `?page=` set |
| Jest regression suite | ✅ | **228/228** passing |

## Critical Fixes 1–5 — 2026-09-21

**Status:** ✅ **Code fixes applied** — Nginx fix is runbook-only (`devops/NGINX_WEBSOCKET_FIX.md`)

| Item | Status | Notes |
|------|--------|-------|
| Clock-out employee resolution | ✅ Fixed | `resolveClockStaff` + register `staffType` |
| Settings gateway + attendance 500 | ✅ Fixed | `fetchSettingsDocumentSafe`; safe defaults |
| Socket.io admin timeout | ⚠️ Runbook | Apply `devops/NGINX_WEBSOCKET_FIX.md` on production droplet |
| Grant-access PG/Mongo drift | ✅ Fixed | `reconcileLinkedAdminAccess`; assign list filter |
| Grant modal 25 permissions | ✅ Fixed | Dynamic grid from `/api/admin/permissions` |
| Jest regression suite | ✅ | **228/228** passing |

## HRM Modal Fix + Sidebar Labels — 2026-09-21

**Status:** ✅ **Complete**

| Item | Status | Notes |
|------|--------|-------|
| Modal viewport overflow | ✅ Fixed | `.admin-modal` pattern — max-height, scrollable body, fixed header/footer |
| Assign System Access flow | ✅ Fixed | Employee search, 25 permissions, presets, Link Account + 409 handling |
| Employee Access tab | ✅ Fixed | No-access / has-access states; Grant pre-fill; Suspend/Activate/Revoke |
| Sidebar label customization | ✅ Fixed | `SidebarLabel` model; Super Admin GET/PUT API; inline ✏️ edit |
| Jest regression suite | ✅ | **228/228** passing |

## Critical Production Bugs — 2026-09-21

**Status:** ✅ **Complete**

| Item | Status | Notes |
|------|--------|-------|
| SyntaxError in admin JS | ✅ Fixed | Access tab event listeners; avatar onerror safe fallback; admin-staff classic script |
| gateway-status 500 | ✅ Fixed | `settingsController` service require paths corrected |
| Grant System Access no-op | ✅ Fixed | Employees page uses local `#grantAccessModal` |
| SMTP ENETUNREACH IPv6 | ✅ Fixed | `userProfileController` explicit host + `family: 4` |
| PG health disconnected | ✅ Fixed | 3s query timeout; returns `degraded` on Neon cold start |
| Jest regression suite | ✅ | **228/228** passing |

## HRM Access Fix Round 2 — 2026-09-21

**Status:** ✅ **Complete**

| Item | Status | Notes |
|------|--------|-------|
| Quick Grant Access modal | ✅ Fixed | `#quickGrantModal` on Employees page; `openQuickGrantModal()`; EMP-ID username; 25-permission grid + presets |
| Super Admin Access tab | ✅ Fixed | `GET /hrm/employees/:id/access-info` → `isSuperAdmin`; tab hidden; 👑 notice when applicable |
| Sidebar label edit | ✅ Fixed | ✏️ pencils removed from sidebar; **Customize Menu Labels** in Settings → Security |
| HRM compact layout | ✅ Fixed | Tighter header, stats, filter bar, table, modal sections in `_hrm.css` / `_layout.css` |
| gateway-status 500 | ✅ Verified | `require('../services/gatewayStatusService')` path correct; service loads |
| SMTP IPv6 | ✅ Verified | `mailer.js` + `userProfileController` use `family: 4` |
| Jest regression suite | ✅ | **228/228** passing |

## Email + WhatsApp Notification Overhaul — 2026-09-21

**Status:** ✅ **Complete**

| Item | Status | Notes |
|------|--------|-------|
| Email via Resend API | ✅ | Primary provider; 3k/month free tier |
| Email Brevo fallback | ✅ | Automatic chain Resend → Brevo → log |
| SMTP removed from mailer | ✅ | `mailer.js` + `emailService.js`; fixes ENETUNREACH on DO |
| WhatsApp via Baileys | ✅ | Self-hosted QR scan; replaces UltraMsg |
| Admin Notifications tab | ✅ | `view-settings.html` + `settings-notifications.js` |
| Gateway status endpoint | ✅ | Structured `{ email, whatsapp, sms }`; no 500 |
| Notification API routes | ✅ | config, test-email, whatsapp-status/enable/disconnect |
| Setup guide | ✅ | `docs/NOTIFICATION_SETUP.md` |
| Jest regression suite | ✅ | **228/228** passing |

## HRM Access Final Redesign — 2026-09-21

**Status:** ✅ **Complete**

| Item | Status | Notes |
|------|--------|-------|
| Separated Access vs Staff Directory flows | ✅ Fixed | Employee Access tab = permissions only; Staff Directory = login creation (Assign New Access) |
| Access tab — no account | ✅ Fixed | "No System Account" + Staff Directory link + read-only permission preview; no Grant button |
| Access tab — has account | ✅ Fixed | Username, status, Last Login, grouped toggles, Save Permissions, Suspend/Activate |
| Super Admin Access tab | ✅ Fixed | Tab removed from DOM entirely for linked super-admin employees (e.g. EMP-003) |
| Bearer auth on admin fetch | ✅ Fixed | `authHeaders()` in `hrm-employees.js` + `admin-staff.js`; matches `verifyAdmin` Authorization header |
| Grant-access 409 handling | ✅ Fixed | Info toast, close modal, refresh staff list |
| Active Admins stat count | ✅ Fixed | `GET /api/admin/staff` returns `activeCount`; refreshed after grant/suspend/revoke |
| Removed quick-grant modal | ✅ Fixed | `#quickGrantModal` / `#manageAccessModal` removed from Employees page |
| Jest regression suite | ✅ | **228/228** passing |

## Access Tab Removed + Staff Directory Final — 2026-09-21

**Status:** ✅ **Complete**

| Item | Status | Notes |
|------|--------|-------|
| Employee modal — no Access tab | ✅ Fixed | 5 tabs only: Overview, Documents, Attendance, Payroll, Leave |
| Access tab code removed | ✅ Fixed | All access JS/HTML removed from `hrm-employees.js` + `view-hrm-employees.html` |
| Assign System Access modal redesign | ✅ Fixed | 3-step modal; debounced employee search; perm toggles; presets; validation |
| Employee search dropdown | ✅ Fixed | Fetches `?hasAccess=false&all=true`; shows photo, name, EMP-ID, dept |
| Username auto-fill | ✅ Fixed | First name lowercase (e.g. "dalia") |
| Staff row actions | ✅ Fixed | Edit Permissions, Suspend/Activate, Revoke all wired with Bearer auth |
| Jest regression suite | ✅ | **228/228** passing |

## Assign Access Fix — 2026-09-21

**Status:** ✅ **Complete**

| Item | Status | Notes |
|------|--------|-------|
| Employee search dropdown | ✅ Fixed | `loadAssignEmployees()` + `assignable=true`; fallback fetch; debounced name/EMP-ID filter |
| Username field | ✅ Fixed | Empty on open; placeholder `e.g. john-doe`; value set only after employee select |
| Permission items visible | ✅ Fixed | Force reload catalog; `data-key` toggles; explicit grid row CSS |
| Submit + validation | ✅ Fixed | Field errors; 409 handling; staff list refresh |
| Backend assignable filter | ✅ Fixed | `$and` Mongo query; assignable-only PG filter avoids over-excluding |
| Jest regression suite | ✅ | **228/228** passing |

## Staff Access Final Fix — 2026-09-21

**Status:** ✅ **Complete**

| Item | Status | Notes |
|------|--------|-------|
| Search icon overlap | ✅ Fixed | `emp-search-wrap` + left padding on input; icon does not cover typed text |
| Clear search button | ✅ Fixed | × toggles on input; clears selection, dropdown, and username |
| Modal reset on open | ✅ Fixed | `resetAssignModal()` clears all fields, errors, toggles, presets |
| Permission items visible | ✅ Fixed | `renderAssignPermissions()` + `#permissionsGrid`; handles all API shapes |
| Revoke full cleanup | ✅ Fixed | Deletes admin account; clears Mongo + PG `Employee.linkedAdminId` |
| Orphan record repair | ✅ Fixed | `POST /api/admin/staff/cleanup-orphans` + Super Admin **Fix DB** button |
| Jest regression suite | ✅ | **228/228** passing |

## Staff UI Polish — 2026-09-21

**Status:** ✅ **Complete**

| Item | Status | Notes |
|------|--------|-------|
| Search icon overlap | ✅ Fixed | `#empSearchInput` with 40px left padding + inline SVG icon |
| Permission cards | ✅ Fixed | Group cards with visible rows, toggle switches, group "All" checkbox |
| Permission items force-visible | ✅ Fixed | `#permissionsGrid` scoped CSS overrides; strict `isValidPermissionEntry` filter removes `sectionPermissions` leak |
| Sidebar labels endpoint | ✅ Fixed | `sidebarLabelRepository` lazy Prisma + try/catch; `listSidebarLabels` returns `{ labels: {} }` not 500 when PG model missing |
| Actions column | ✅ Fixed | Three icon buttons with CSS tooltips (Edit / Suspend / Revoke) |
| Jest regression suite | ✅ | **228/228** passing |

## HRM Final Polish — 2026-09-22

**Status:** ✅ **Complete**

| Item | Status | Notes |
|------|--------|-------|
| Employee modal tab sizing | ✅ Fixed | Fixed-width tabs; only color changes on active |
| Permanent employee delete | ✅ Fixed | Super Admin `DELETE /hrm/employees/:id` + row delete button |
| Daily Sheet office times | ✅ Fixed | Present → check-in/out from attendance settings |
| Flexible weekend days | ✅ Fixed | `weekendDays: [0,6]` + 7-day pill UI |
| Daily Sheet pagination | ✅ Fixed | Backend page/limit + `AdminPagination` UI |
| Jest regression suite | ✅ | **228/228** passing |

## HRM Complete — SweetAlert + Polish — 2026-09-22

**Status:** ✅ **Complete**

| Item | Status | Notes |
|------|--------|-------|
| Delete in Edit modal (Danger Zone) | ✅ Fixed | Removed table-row trash; Super Admin zone + Swal confirm |
| SweetAlert2 HRM standard | ✅ Fixed | All HRM confirms via Swal; module header comments |
| Daily Sheet inline actions | ✅ Fixed | `.daily-sheet-actions` flex row |
| Console poll/socket errors | ✅ Fixed | `adminIsLiveServer()` guard; socket `path: '/socket.io'` |
| Jest regression suite | ✅ | **228/228** passing |

## HRM System — 100% Complete — 2026-09-22

**Status:** ✅ **Complete**

| Item | Status | Notes |
|------|--------|-------|
| Compact employees page header | ✅ Fixed | Single-row title + actions |
| Profile modal 5 tabs only | ✅ Fixed | Removed stray tabs; profile tabs no flex stretch |
| Super Admin employee protected | ✅ Fixed | Backend 403 + frontend danger zone hidden |
| Edit modal danger zone | ✅ Fixed | Bottom of edit form with Swal delete |
| Modal tab consistent height | ✅ Fixed | min-height on profile/edit panels |
| Searchable Apply Leave picker | ✅ Fixed | `createSearchableSelect` on staff field |
| Super Admin excluded from ops lists | ✅ Fixed | Daily sheet, staff roster, all=true dropdowns |
| Jest regression suite | ✅ | **229/229** passing |

## HRM FINAL — 2026-09-22

**Status:** ✅ **Complete**

| Item | Status | Notes |
|------|--------|-------|
| Two-stage employee delete | ✅ Fixed | Soft deactivate + password-gated permanent delete |
| Profile modal More tab | ✅ Fixed | 6 tabs; Terminate / Deactivate / Permanent Delete |
| SweetAlert2 z-index | ✅ Fixed | Always on top of modals via `.swal-on-top` |
| Super Admin terminate disabled | ✅ Fixed | Table + More tab; `adminRole` on list API |
| Edit modal danger zone removed | ✅ Fixed | Delete actions moved to View modal More tab |
| Add Employee button order | ✅ Fixed | Primary blue button first in header actions |
| Employee soft-delete fields | ✅ Fixed | `isDeleted` / `deletedAt`; filtered from lists |
| `ADMIN_DELETE_PASSWORD` env | ✅ Fixed | Required for permanent delete route |
| Jest regression suite | ✅ | **231/231** passing |

## Daily Sheet status dropdown contrast — 2026-09-22

**Status:** ✅ Fixed

| Item | Status | Notes |
|------|--------|-------|
| `.att-split-menu` invisible options | ✅ Fixed | Dark `#0f172a` panel + `color: inherit` → white panel + explicit text/hover colors in `_hrm.css` |
| Jest regression suite | ✅ | **231/231** passing |

## RBAC — attendance-only staff boot gating — 2026-09-22

**Status:** ✅ Fixed

| Item | Status | Notes |
|------|--------|-------|
| `initDashboard()` permission-aware boot | ✅ Fixed | Awaits `waitForAdminPermissions()`; gates orders, analytics, settings, catalog, security log fetches |
| `waitForAdminPermissions()` | ✅ Added | Polls until `admin-staff.js` loads `currentAdmin` from `/me` + `/permissions` |
| HRM attendance staff dropdown | ✅ Fixed | `hrmLoadStaffOptions()` only when `manage_staff`; Daily Sheet uses `view_attendance` route |
| `GET /hrm/employees` read for attendance | ✅ Fixed | `checkPermission('manage_staff', 'view_attendance')`; sensitive fields stripped for attendance-only readers |
| 403 toast noise on limited staff login | ✅ Fixed | `SILENT_403_PATHS` in `handleAdminApiAuthResponse()` |
| Jest regression suite | ✅ | **231/231** passing |

## RBAC — sidebar gaps + boot 403s + profile photo — 2026-09-22

**Status:** ✅ Fixed

| Item | Status | Notes |
|------|--------|-------|
| `view-erp-expenses` / `view-settings` in SECTION_PERMISSIONS | ✅ Fixed | Both require `manage_settings` — Finance + Settings groups hide for attendance-only staff |
| `hideEmptyMenuGroups()` | ✅ Fixed | Runs after item + `[data-permission]` hiding; collapses empty `li.menu-group` |
| Boot: suppliers/warehouses/pages | ✅ Fixed | Gated in `core-nav.js`, `admin-banner.js`; expenses section early exit |
| Sidebar profile photo (PG read) | ✅ Fixed | `admin.image` included in profile select; `/me` fallback + reload after RBAC boot |
| Jest regression suite | ✅ | **231/231** passing |

## Frontend tab + action permission gating — 2026-09-23

**Status:** ✅ Complete

| Item | Status | Notes |
|------|--------|-------|
| Sidebar `data-permission` | ✅ | 31 nav items tagged; group headers auto-hide when empty |
| Attendance tab gating | ✅ | 5 tabs + Mark/Lock/Bulk buttons use granular keys |
| Leave / Payroll actions | ✅ | Apply Leave, approve/reject, Generate Payroll gated |
| `hasPermission()` implications | ✅ | Frontend reads `permissionImplications` from `/api/admin/permissions` |
| Permission modal (47 keys) | ✅ | Dynamic `renderPermissionCheckboxes()` — Marketing + Accounts groups render |
| Jest regression suite | ✅ | **231/231** passing |

## Granular RBAC permission expansion — 2026-09-23

**Status:** ✅ Complete (backend catalog + route guards)

| Item | Status | Notes |
|------|--------|-------|
| Permission catalog | ✅ | **47** keys (25 legacy + 22 new granular) in `permissions.js` |
| SECTION_PERMISSIONS | ✅ | 32 sidebar `data-target` entries mapped to specific keys + 7 legacy section keys |
| PERMISSION_IMPLICATIONS | ✅ | `manage_staff`, `manage_orders`, `manage_inventory`, `manage_marketing`, `manage_settings` imply children |
| Attendance route guards | ✅ | `view_daily_sheet`, `view_attendance_register`, `view_shifts`, `view_late_report`, granular mark/manual |
| HRM route guards | ✅ | `view_employees`, `view_payroll`, `view_leave_requests`, `apply_leave_for_staff`, `approve_leave` |
| `.cursorrules` Permission System Rules | ✅ | Documented 5-step permission workflow |
| Jest regression suite | ✅ | **231/231** passing |

## Sales sidebar granular permission keys — 2026-09-23

**Status:** ✅ Complete

| Item | Status | Notes |
|------|--------|-------|
| Dedicated Sales keys | ✅ | `access_pos`, `view_abandoned_carts`, `access_live_chat`, `manage_tickets` (+ existing `view_customers`, `view_reviews`) — **51** total catalog keys |
| SECTION_PERMISSIONS | ✅ | POS / abandoned / live chat / tickets no longer share `manage_orders` |
| Live Chat gating | ✅ | `view-live-chat` → `access_live_chat` on sidebar external link |
| PERMISSION_IMPLICATIONS | ✅ | `manage_orders` bundles Sales children for coarse Full Admin grants only |
| ROLE_PRESETS | ✅ | Order Manager, HR Manager, Inventory Manager, POS Operator use explicit granular lists |
| Nurjahan scenario (`view_orders` only) | ✅ | Only Orders & Fulfillment visible under Sales & Orders |
| `.cursorrules` rule #6 | ✅ | One unique permission key per sidebar item |
| Jest regression suite | ✅ | **231/231** passing |

## view_orders API + preset_only coarse keys — 2026-09-23

**Status:** ✅ Complete

| Item | Status | Notes |
|------|--------|-------|
| GET /api/orders | ✅ | `view_orders` OR `manage_orders` |
| Order route granularity | ✅ | Read/export/invoice/return-requests accept `view_orders`; refund/status use granular write keys |
| Sales & Orders group | ✅ | Single modal group for all 11 sales keys |
| preset_only coarse keys | ✅ | 5 keys hidden from modal; **46** toggles visible |
| manage_orders implications | ✅ | `[]` — no sidebar side effects from coarse grant |
| fetchLiveOrders gating | ✅ | `canFetchLiveOrders()` in refreshMap, boot, sync, realtime |
| Live Chat external link | ✅ | Explicit permission hide in `applyRoleToSidebar()` |
| Jest regression suite | ✅ | **231/231** passing |

## HRM + Orders RBAC gap fixes (A–I) — 2026-09-23

**Status:** ✅ Complete

| Item | Status | Notes |
|------|--------|-------|
| applyManualEntryTabVisibility crash | ✅ | Aliased to `applyAttendanceTabPermissions` |
| HRM route granular guards (F1–F10) | ✅ | Attendance edit/bulk/unlock/remove, payroll, employees |
| Orders roster/courier routes (C/D) | ✅ | `update_order_status`, `manage_couriers`; frontend gated |
| Order status UI (E) | ✅ | Dropdown only for `update_order_status`; view-only badge |
| Payroll/employee FE gates (G/H) | ✅ | Approve/paid + edit pencil permission-gated |
| Cloudinary cache bust (I) | ✅ | CDN hosts skipped in `appendCacheBust()` |
| Jest regression suite | ✅ | **231/231** passing |

## Master Audit P1 Fixes — 2026-09-23

**Status:** ✅ Complete (items 1–3 of 4; item 4 = ops task)

| Item | Status | Notes |
|------|--------|-------|
| P1-1 Return Requests stack overflow | ✅ | `hideReturnRequestsPanel()` + `window.restoreOrdersListTab()` — no mutual calls between tab switchers |
| P1-2 Reviews API permission | ✅ | `GET /api/admin/reviews` → `checkPermission('manage_orders', 'view_reviews')`; moderate/delete unchanged |
| P1-3 Abandoned carts API permission | ✅ | CRM routes accept `manage_marketing`, `view_abandoned_carts`, `manage_orders` |
| P1-4 Dual-write failure tracking | ✅ | `FailedSync` model; `failedSyncService`; `dualWriteService` records failures; startup reconcile; `GET /api/admin/system/sync-failures` (superadmin) |
| Jest regression suite | ✅ | **231/231** passing |

## Master Audit P2 Fixes — 2026-09-23

**Status:** ✅ Complete (items 1–4)

| Item | Status | Notes |
|------|--------|-------|
| P2-1 Live Chat teardown / WebSocket | ✅ | `teardownLiveChat()` in `chat-admin.js`; called on section leave, logout, `beforeunload`; nginx `/socket.io/` upgrade block |
| P2-2 Cloudinary 404 employee photos | ✅ | `safeEmployeePhoto()` in HRM modules; `.emp-avatar-*` CSS; profile modal fallback |
| P2-3 HRM self-service permissions | ✅ | `view_own_attendance`, `apply_own_leave`, `view_own_payslip`; self-service API routes; leaves/payroll UI |
| P2-4 Superadmin 2FA enforcement | ✅ | `verifyAdmin` 403 when superadmin lacks 2FA (test env exempt); `#twoFaWarning` on Staff page |
| Jest regression suite | ✅ | **231/231** passing |

## P3 Granular RBAC Route Guards — 2026-09-23

**Status:** ✅ Complete

| Item | Status | Notes |
|------|--------|-------|
| Catalog & inventory routes | ✅ | Products, suppliers, warehouses, POs, categories/brands/attributes — coarse + granular keys |
| Marketing routes | ✅ | Banners, navbar, coupons, master-settings loyalty; newsletter unchanged |
| Finance routes | ✅ | Accounts summary, analytics, expenses, P&L — `view_accounts` / `view_financial_reports` / `manage_expenses` |
| Customers & support | ✅ | Customer GET + tickets/messages use `view_customers` / `manage_tickets` |
| PERMISSION_IMPLICATIONS | ✅ | `manage_inventory`, `manage_marketing`, `manage_customers`, `manage_settings` synced |
| Permission groups | ✅ | Catalog, Marketing, Sales & Orders, Accounts group labels corrected |
| Frontend section gates | ✅ | 15 section load functions use `hasAnyAdminPermission` |
| Jest regression suite | ✅ | **231/231** passing |

## P4 Performance & Security Polish — 2026-09-23

**Status:** ✅ Complete (core items 1–6)

| Item | Status | Notes |
|------|--------|-------|
| P4-1 Database indexes | ✅ | 7 Mongo index defs + 5 Prisma `@@index` additions (migrate pending) |
| P4-2 Rate limiting | ✅ | `express-rate-limit` ^8.6; auth + api limiters; 2FA routes guarded |
| P4-3 Input sanitization | ✅ | Employee update + leave apply string trim/slice; no joi/zod yet |
| P4-4 Dead code cleanup | ✅ | Removed `[HRM-SAVE]`, `[EMP-UPDATE]`, `[PERMS-FILTER]` debug logs |
| P4-5 Error boundaries | ✅ | `window.error` + `unhandledrejection` handlers in admin-staff.js |
| P4-6 Documentation | ✅ | README, MASTER audit, .cursorrules production checklist |
| Jest regression suite | ✅ | **231/231** passing |



