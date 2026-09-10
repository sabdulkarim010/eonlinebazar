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
| **Financial Reports** | ✅ `view-finance.html` | ❌ No dedicated module | ✅ `financeAnalyticsController.js` | ✅ `/api/finance/*` (separate JWT) | ❌ **Placeholder only** | Section is a single CTA linking to external `/finance-analytics`; no embedded charts in SPA. `refreshMap` entry is `{}` (no-op). |

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
| `view-finance` | ✅ | ❌ none | ✅ `financeAnalyticsController` | ✅ `/api/finance/*` (external app) | ❌ Placeholder CTA | ✅ |
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

*End of Phase 2 audit. Only `PHASE2_AUDIT.md` was created; no source files were modified.*
