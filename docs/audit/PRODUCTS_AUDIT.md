# PRODUCT & STOCK OPERATIONS AUDIT — EonlineBazar

**Last updated:** 2026-10-01 (English-only admin + AI, BN storefront fields, newest-first inventory)  
**Scope:** Inventory management, add/edit product, categories, brands, attributes, suppliers, warehouses, purchase orders, WMS transfers & stock ledger (formerly "Catalog & Inventory" nav group)  
**Status:** ⚠️ PARTIAL — WMS backend complete; transfer UI pending; attribute PG read gap remains

---

## File Inventory

| Path | Role |
|------|------|
| `backend/src/routes/productRoutes.js` | Product CRUD + search |
| `backend/src/routes/categoryRoutes.js` | Category tree CRUD |
| `backend/src/routes/brandRoutes.js` | Brand CRUD |
| `backend/src/routes/attributeRoutes.js` | Attribute CRUD |
| `backend/src/controllers/productController.js` | Product logic + slug + ERP fields |
| `backend/src/controllers/admin/productAiController.js` | AI product assist API (multipart vision) |
| `backend/src/services/productAiAssistService.js` | Anthropic vision prompt + JSON normalize |
| `tests/services/productAiAssistService.test.js` | AI assist normalization unit tests |
| `backend/src/controllers/categoryController.js` | Category logic |
| `backend/src/controllers/brandController.js` | Brand logic |
| `backend/src/controllers/attributeController.js` | Attribute logic |
| `backend/src/controllers/bulkImportController.js` | CSV/Excel bulk import |
| `backend/src/controllers/admin/supplierController.js` | Supplier CRUD |
| `backend/src/controllers/admin/warehouseController.js` | Warehouse CRUD |
| `backend/src/controllers/admin/purchaseOrderController.js` | PO lifecycle + receive |
| `backend/src/models/product.js` | Product + variants + costHistory + `name_bn` / description BN fields |
| `client/js/utils/productLocale.js` | Storefront EN/BN product field picker |
| `prisma/migrations/20261001120000_product_bilingual_fields/` | PG columns for BN product copy |
| `backend/src/models/category.js` / `brand.js` / `attribute.js` | Catalog models |
| `backend/src/models/supplier.js` / `warehouse.js` / `purchaseOrder.js` | ERP models |
| `backend/src/repositories/productRepository.js` | PG product dual-write/read |
| `backend/src/repositories/categoryRepository.js` | PG category (reference pattern) |
| `backend/src/repositories/brandRepository.js` | PG brand |
| `backend/src/repositories/attributeRepository.js` | PG attribute |
| `backend/src/repositories/supplierRepository.js` | PG supplier |
| `backend/src/repositories/warehouseRepository.js` | PG warehouse |
| `backend/src/repositories/purchaseOrderRepository.js` | PG purchase order |
| `backend/src/repositories/stockAlertRepository.js` | PG stock alerts |
| `backend/src/services/stockAlertService.js` | Low-stock notifications |
| `backend/src/services/inventoryIntelligenceService.js` | Sales velocity, dynamic ROP, auto PO |
| `backend/src/jobs/stockAlertCron.js` | Intelligence scan + stock alert cron |
| `backend/src/controllers/admin/inventoryIntelligenceController.js` | Velocity + auto PO API |
| `backend/src/models/ProductVariant.js` | N-dimensional variant schema exports |
| `backend/src/models/Outbox.js` | Transactional outbox event store |
| `backend/src/models/BackgroundJob.js` | Async job status tracking |
| `backend/src/services/productPimService.js` | Variant matrix Cartesian generation |
| `backend/src/services/outboxService.js` | Outbox write + dispatcher |
| `backend/src/queues/importExportQueue.js` | BullMQ bulk import/export worker |
| `backend/src/controllers/admin/pimController.js` | PIM matrix + jobs + outbox API |
| `backend/src/middleware/rbacMiddleware.js` | Scope-based RBAC (`products:read`, etc.) |
| `backend/src/middlewares/uploadMiddleware.js` | `productImagesUploadSafe` — JSON 400 for product image multer errors |
| `backend/src/config/cloudinary.js` | Shared Cloudinary v2 config (product + category uploads) |
| `backend/src/jobs/outboxDispatcherJob.js` | Outbox polling dispatcher cron |
| `backend/src/services/warehouseService.js` | Default warehouse seed |
| `backend/src/models/StockLedger.js` | Immutable stock movement audit trail |
| `backend/src/models/WarehouseStock.js` | Per-warehouse stock + reservations |
| `backend/src/models/WarehouseTransfer.js` | Inter-warehouse transfer documents |
| `backend/src/services/stockLedgerService.js` | `recordStockMovement()` dual-write |
| `backend/src/services/wmsService.js` | Transfers, reservations, fulfillment |
| `backend/src/controllers/admin/warehouseTransferController.js` | Transfer CRUD + ship/receive |
| `backend/src/repositories/stockLedgerRepository.js` | PG stock ledger mirror |
| `backend/src/repositories/warehouseStockRepository.js` | PG warehouse stock mirror |
| `backend/src/repositories/warehouseTransferRepository.js` | PG transfer mirror |
| `tests/repositories/product.repository.test.js` | Product repo tests |
| `tests/repositories/category.repository.test.js` | Category repo tests |
| `client/js/admin/modules/products-*.js` | Product form, table, variants, bulk, AI |
| `client/js/admin/modules/catalog-*.js` | Categories, brands, attributes, coupons, navbar |
| `client/js/admin/modules/erp-*.js` | Suppliers, warehouses, POs |
| `client/admin/partials/view-products.html` | Product management UI |
| `client/admin/partials/view-suppliers.html` / `view-warehouses.html` / `view-purchase-orders.html` | ERP views |

---

## Feature Checklist

- [x] Product CRUD + variant matrix — `productController.js`, `products-form.js`
- [x] Add Product: Cloudinary via shared config; duplicate SKU → 409; multer → 400 — `productController.js`, `productRoutes.js`, `uploadMiddleware.js`
- [x] Category dropdown for `edit_products` / `view_products` — `GET /api/categories/admin/all` RBAC + graceful Mongo count degrade
- [x] Product search + cursor pagination — `products-table.js`
- [x] Category tree CRUD — `catalog-categories.js`
- [x] Brand CRUD — `catalog-brands.js`
- [x] Attribute CRUD — `catalog-attributes.js`
- [x] Bulk CSV/Excel import — `bulkImportController.js`, `products-bulk.js`
- [x] AI product assist — English admin fields + separate BN storefront copy — `products-ai.js`, `productAiAssistService.js`, hidden BN fields in `view-products.html`
- [x] Admin inventory default sort newest-first — `core-state.js`, `products-table.js` → `sort=newest`
- [x] Public `GET /api/products/:id` routed read (PG/Mongo) incl. BN fields — `productController.getProductById`, `productReadService`
- [x] Supplier directory — `supplierController.js`, `erp-suppliers.js`
- [x] Multi-warehouse inventory — `warehouseController.js`, default warehouse seed
- [x] Purchase order lifecycle — `purchaseOrderController.js`, receive workflow
- [x] Stock alerts (cron + notify) — `stockAlertService.js`
- [x] ERP fields on product (supplierId, warehouseId, reorderPoint) — `product.js`
- [x] Slug auto-generation — `productController.js`
- [x] PG repositories for all catalog/ERP models — 38 repo files total
- [x] Product SEO fields persisted — `seoTitle`, `seoDescription`, `seoKeywords` (Mongo + PG + form)
- [ ] Product `slug` schema field | Index exists; no Mongoose field on schema
- [x] Admin inventory list uses PG when `READ_PG_PRODUCT=true` | `productController.searchProducts` → `productReadService.searchProducts(req)` via `routedRead`
- [ ] Attribute reads use PG when `READ_PG_ATTRIBUTE=true` | `attributeController.getAttributes` Mongo-only
- [x] PO reads use `routedRead` PG-FALLBACK | `fetchPurchaseOrdersList` / `fetchPurchaseOrderById`
- [x] PO receive dual-writes product stock to PG | `updateProductInPG` after GRN; variant SKU/id supported
- [x] Inter-warehouse stock transfer | `wmsService.js` — draft → in_transit → received/discrepancy
- [x] Stock movement ledger | Immutable `StockLedger` + `recordStockMovement()` dual-write
- [x] Warehouse location hierarchy | Zone > Aisle > Rack > Shelf > Bin on `warehouse.js`
- [x] Order stock reservation + fulfillment | `reserveStockForOrder` / `fulfillReservedStock`
- [ ] Transfer admin UI | Backend API only (`/api/admin/warehouse-transfers`)
- [x] Sales velocity + dynamic ROP | `inventoryIntelligenceService.js` — N-day window, lead-time formula
- [x] Auto draft PO generator | Groups by supplier; skips open PO duplicates
- [x] Intelligence cron scan | `stockAlertCron.js` — REORDER_NEEDED + metrics persistence
- [x] N-dimensional PIM variant matrix | `productPimService.generateVariantCombinations`
- [x] Transactional outbox pattern | `Outbox` model + `outboxService` + dispatcher cron
- [x] Async bulk import/export jobs | BullMQ + `BackgroundJob` progress tracking
- [x] Scope-based RBAC middleware | `products:read`, `pim:manage`, `import:run`, etc.
- [x] Server-side low-stock filter in search | `lowStock=true` query param; Mongo `$expr` + PG raw SQL before pagination
- [ ] Server-side low-stock filter in export CSV | Export still unfiltered
- [ ] Granular sidebar permissions for Categories / Brands / Attributes | All three share `manage_catalog`

---

## Known Issues / Gaps

| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| `Failed to load products` — weak error handling | High | Fixed | `products-table.js` checks `res.ok`, parses `data.message`, renders detailed error row |
| Admin list bypasses `READ_PG_PRODUCT` | High | Fixed | `searchProducts` delegates to `productReadService.searchProducts(req)` with `routedRead` |
| Low-stock filter wrong pagination totals | High | Fixed | Server-side `lowStock=true`; client post-filter removed |
| PO receive skips PG product stock sync | High | Fixed | Phase 2.1 — `updateProductInPG` after GRN |
| Variant PO receive does not increment stock | Medium | Fixed | Phase 2.1 — variantId/variantSku on receive |
| PO PG read no Mongo fallback | Medium | Fixed | Phase 2.1 — `routedRead('purchaseorder', …)` |
| No stock movement ledger | High | Fixed | Phase 3.1 — immutable StockLedger |
| No inter-warehouse transfer | High | Fixed | Phase 3.1 — WarehouseTransfer FSM |
| Attribute reads ignore `READ_PG_ATTRIBUTE` | Medium | Open | `attributeController.js:72–75` |
| `view_products`-only staff: boot skips product fetch | Medium | Open | `core-nav.js:648` gates on `manage_inventory` only |
| Edit product uses table cache not admin API | Medium | Open | `products-form.js:504` vs `GET /api/admin/products/:id` |
| Bulk actions visible without `edit_products` | Medium | Fixed | `data-permission="edit_products"` on bulk/edit/delete controls |
| Category filter API requires `manage_catalog` | Medium | Fixed | `GET /api/categories/admin/all` allows `edit_products` + `view_products`; Mongo count aggregate degrades to PG `productCount` |
| Cloudinary raw import on product create | High | Fixed | `productController.js` uses `config/cloudinary.js` |
| Duplicate SKU returns 500 on create | Medium | Fixed | `E11000` → HTTP 409 with clear message |
| Product image multer errors → 500 | Medium | Fixed | `productImagesUploadSafe` on POST/PUT `/api/products` |
| Add Product UI ignores `errorDetail` | Medium | Fixed | `products-form.js` toast shows API detail |
| Warehouse UI shows `code` field that does not exist | Low | Open | `erp-warehouses.js:56` vs `warehouse.js` schema |
| Product slug schema field missing | Low | Open | Sparse unique index exists; field not declared on schema |
| Debug `console.log` on product create | Low | Open | `productController.js:539–541` |
| Nav label rename pending | Low | Fixed | Sidebar, breadcrumbs, permissions group, ARCHITECTURE.md, README.md updated |

---

## Dependencies & Integrations

- **PG flags:** `READ_PG_PRODUCT`, `READ_PG_CATEGORY`, `READ_PG_BRAND`, `READ_PG_ATTRIBUTE`, `READ_PG_SUPPLIER`, `READ_PG_WAREHOUSE`, `READ_PG_PURCHASE_ORDER`, `READ_PG_WAREHOUSE_TRANSFER`, `READ_PG_STOCK_LEDGER`, `READ_PG_STOCKALERT`
- **Permissions:** `manage_inventory`, `manage_catalog` on write routes
- **Related audits:** `ADMIN_PANEL_AUDIT.md`, `ORDERS_AUDIT.md`, `CMS_AUDIT.md`

---

## Change Log

### Product visibility, duplicate SKU, SEO head — 2026-10-01

- 409 duplicate `productId` user message (no raw DB `errorDetail`); launch sets `status: 'active'` (maps `published`)
- PG dual-write resolves `categoryId` from `categoryName`; SEO fields on PG list/detail shapes
- `GET /api/products` uses `productReadService` routed read (Mongo/PG parity)
- Product PDP server HTML injects `seoTitle` / `seoDescription` / `seoKeywords`
- AI SEO prompt: mandatory bilingual Bangla + English keywords

### AI Product Assistant upgrade — 2026-10-01

- Modal: multi-image vision dropzone, content/name language selectors (`view-products.html`, `products-ai.js`, `_products-form.css`)
- Backend: `POST /api/admin/ai/product-assist` multipart (`aiImages`, languages) → structured JSON via Anthropic vision
- Form apply: name, descriptions, highlights, category, SEO fields — `applyAiProductPayload`
- Tests: `tests/services/productAiAssistService.test.js`

### Add Product workflow hardening — 2026-10-01

- Cloudinary: shared `config/cloudinary.js` in `productController.js`
- Categories: `adminGetCategories` Mongo aggregate wrapped (fallback to stored counts); route RBAC includes `edit_products`, `view_products`
- Create: Mongoose duplicate key (`productId` / `slug`) → 409 JSON
- Routes: `productImagesUploadSafe(10)` for POST/PUT product uploads
- Frontend: `uploadProduct` surfaces `errorDetail` in error toast
- Tests: `npm test` 516/516 pass

### Storefront Step 3.1.3 — Bounded public catalog endpoints — 2026-09-29

- `GET /api/products?featured=true` (cap limit 10, sort top-rated)
- `GET /api/products/lookup?ids=` (max 30 IDs)
- `GET /api/products/flash-deals?limit=` (flash sale product IDs only)
- Tests: `tests/payloadOptimization.test.js`

### Phase 3.3 — Enterprise PIM, outbox, async queue, scope RBAC — 2026-09-25

- `ProductVariant.js`, `product.js` — N-dimensional `variantMatrixDefinition`
- `productPimService.js` — Cartesian variant generation + apply matrix
- `Outbox.js`, `outboxService.js`, `outboxDispatcherJob.js` — transactional outbox
- `BackgroundJob.js`, `importExportQueue.js` — BullMQ with inline fallback for tests
- `rbacMiddleware.js` — scope permissions mapped to legacy keys
- `pimController.js` — PIM preview/apply, async import/export, job status, outbox admin
- Permissions: `manage_pim`, `transfers_approve`
- Tests: `tests/services/phase3Part3_3.test.js`; Jest **307/307**

### Phase 3.2 — Inventory intelligence: velocity, ROP, auto PO — 2026-09-25

- `inventoryIntelligenceService.js` — 30-day sales velocity, dynamic ROP, auto draft PO by supplier
- `stockAlertCron.js` — intelligence scan + legacy alerts; persists metrics on `StockAlert`
- `inventoryIntelligenceController.js` — `GET /velocity`, `POST /trigger-auto-po`
- `adminRoutes.js` — `/api/admin/inventory-intelligence/*`
- Tests: `tests/services/phase3Part3_2.test.js`; Jest **300/300**

### Phase 3.1 — WMS engine: ledger, transfers, reservations — 2026-09-25

- `StockLedger.js`, `WarehouseStock.js`, `WarehouseTransfer.js` — new WMS models
- `warehouse.js` — `locationHierarchy` (Zone > Aisle > Rack > Shelf > Bin)
- `stockLedgerService.js` — `recordStockMovement()` with Mongo + PG dual-write
- `wmsService.js` — transfer pipeline, `reserveStockForOrder`, `fulfillReservedStock`
- `warehouseTransferController.js` — CRUD + ship/receive; `GET /api/admin/stock-ledger`
- `adminRoutes.js` — `/api/admin/warehouse-transfers/*` routes
- Prisma schema — `StockLedger`, `WarehouseStock`, `WarehouseTransfer` models
- Tests: `tests/services/phase3Part3_1.test.js`; Jest **294/294**

### Phase 2.1 — PO dual-write, admin search RBAC, UI gates — 2026-09-25

- `purchaseOrderController.js` — variant GRN increments variant + parent stock; `updateProductInPG` dual-write; PO list/detail via `routedRead('purchaseorder', …)`
- `purchaseOrder.js` — optional `variantId` / `variantSku` on line items
- `productRepository.js` — `updateStockInPG` syncs `stockQuantity`
- `adminRoutes.js` — `GET /api/admin/products/search` with `view_products` | `manage_inventory`
- `products-table.js` — admin search endpoint; `data-permission` gating for edit actions
- `view-products.html` — RBAC attributes on bulk import/delete/checkbox column
- Tests: `tests/services/phase2Part2.test.js`; Jest **287/287**

### Phase 1.3 — Nav rename to Product & Stock Operations — 2026-09-25

- `sidebar.html` — parent accordion label **Product & Stock Operations** (child items unchanged)
- `core-breadcrumb.js` — breadcrumb group string updated for all 8 catalog/inventory sections
- `permissions.js` — display `group` label only; keys (`manage_catalog`, `view_products`, etc.) unchanged
- `ARCHITECTURE.md`, `README.md` — module name updated
- Tests: Jest **282/282**

### Phase 1.2 — Server-side low-stock search filter — 2026-09-25

- Removed `applyLowStockClientFilter` from `products-table.js`; sends `lowStock=true` when filter is Low Stock
- `productReadService.searchProducts` — parses `lowStock`; Mongo `$expr` per-product threshold (default 10); PG `$queryRaw` with same rule applied before count/pagination
- `productController.searchProducts` — exposes `lowStock` in `appliedFilters`
- Tests: `tests/services/phase1Part2LowStock.test.js`; Jest **282/282**

### English admin + BN storefront + newest-first — 2026-10-01

- Mongoose + Prisma: `name_bn`, `description_bn`, `detailedDescription_bn`, `highlights_bn`; dual-write via `productDualWriteHelpers.js` / `productRepository.js`
- AI assist: English-only primary + SEO; Bangla in separate JSON keys; admin language dropdowns removed
- Storefront: `ProductLocale` + `languageChanged` re-render on home, search, PDP
- Tests: Jest **521/521**

### Phase 1.1 — Product search PG cutover + admin error handling — 2026-09-25

- `productReadService.searchProducts(req)` — full filter parity (category tree, brand, stock, price, sort); returns `{ success, products, total, page, pages, limit }`; PG path uses Prisma findMany+count with Mongo fallback via `routedRead`
- `productController.searchProducts` — delegates list/count to read service; retains flash-sale enrichment + storefront filter metadata
- `products-table.js` — `res.ok` check, JSON parse guard, detailed `table-status-error` row with API message or HTTP status
- Tests: Jest **280/280** passing

### Comprehensive end-to-end module audit — 2026-09-25

- Audited all 8 sub-modules: inventory, add/edit, categories, brands, attributes, suppliers, warehouses, POs
- Root-caused `Failed to load products` to `products-table.js` catch block (network/non-JSON/JS throw); API 500 currently surfaces as empty list, not error row
- Documented PG read cutover gaps (product search, attributes, PO reads), PO receive stock sync gap, missing stock transfer/ledger
- Documented permission/UI mismatches (`view_products` vs `edit_products`, shared `manage_catalog` key)
- Recommended nav rename: **Catalog & Inventory** → **Product & Stock Operations** (`sidebar.html`, `core-breadcrumb.js`, `ARCHITECTURE.md`, `permissions.js` group label)
- Tests not re-run (audit-only pass)

### Phase 2 — Admin review product enrichment PG cutover — 2026-09-24

- `userReadService.js`: `fetchProductsForAdminReviews` — PG `prisma.product.findMany` when `READ_PG_PRODUCT=true`, Mongo `Product.find` fallback
- `reviewAdminController.js`: `getAllReviews` uses routed product lookup for name/image enrichment
- Tests: `tests/services/phase2ReadCutover.test.js` — Jest **270/270**

### Product SEO persistence — 2026-09-20

- Added `seoTitle`, `seoDescription`, `seoKeywords` to Product (Mongo + Prisma migration)
- `productController` create/update + `productRepository` dual-write
- Admin form fields + live preview in `view-products.html`, `products-form.js`
- Price/stock tracking fields for wishlist job: `previousPrice`, `restockedAt`
- Tests: Jest **228/228** passing

### Audit system initialized — codebase scan — 2026-09-20

- Inventoried routes, controllers, 8 repositories, admin UI modules
- Status: ✅ COMPLETE (slug schema gap noted)
