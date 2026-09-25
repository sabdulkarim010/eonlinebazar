# PRODUCTS & CATALOG AUDIT — EonlineBazar

**Last updated:** 2026-09-24 (Phase 2 admin review product enrichment PG cutover)  
**Scope:** Products, categories, brands, attributes, inventory, suppliers, warehouses, purchase orders  
**Status:** ✅ COMPLETE

---

## File Inventory

| Path | Role |
|------|------|
| `backend/src/routes/productRoutes.js` | Product CRUD + search |
| `backend/src/routes/categoryRoutes.js` | Category tree CRUD |
| `backend/src/routes/brandRoutes.js` | Brand CRUD |
| `backend/src/routes/attributeRoutes.js` | Attribute CRUD |
| `backend/src/controllers/productController.js` | Product logic + slug + ERP fields |
| `backend/src/controllers/categoryController.js` | Category logic |
| `backend/src/controllers/brandController.js` | Brand logic |
| `backend/src/controllers/attributeController.js` | Attribute logic |
| `backend/src/controllers/bulkImportController.js` | CSV/Excel bulk import |
| `backend/src/controllers/admin/supplierController.js` | Supplier CRUD |
| `backend/src/controllers/admin/warehouseController.js` | Warehouse CRUD |
| `backend/src/controllers/admin/purchaseOrderController.js` | PO lifecycle + receive |
| `backend/src/models/product.js` | Product + variants + costHistory |
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
| `backend/src/services/stockAlertService.js` | Low-stock cron + notifications |
| `backend/src/services/warehouseService.js` | Default warehouse seed |
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
- [x] Product search + cursor pagination — `products-table.js`
- [x] Category tree CRUD — `catalog-categories.js`
- [x] Brand CRUD — `catalog-brands.js`
- [x] Attribute CRUD — `catalog-attributes.js`
- [x] Bulk CSV/Excel import — `bulkImportController.js`, `products-bulk.js`
- [x] AI product assist — `products-ai.js`, OpenAI integration
- [x] Supplier directory — `supplierController.js`, `erp-suppliers.js`
- [x] Multi-warehouse inventory — `warehouseController.js`, default warehouse seed
- [x] Purchase order lifecycle — `purchaseOrderController.js`, receive workflow
- [x] Stock alerts (cron + notify) — `stockAlertService.js`
- [x] ERP fields on product (supplierId, warehouseId, reorderPoint) — `product.js`
- [x] Slug auto-generation — `productController.js`
- [x] PG repositories for all catalog/ERP models — 38 repo files total
- [x] Product SEO fields persisted — `seoTitle`, `seoDescription`, `seoKeywords` (Mongo + PG + form)
- [ ] Product `slug` schema field | Index exists; no Mongoose field on schema

---

## Known Issues / Gaps

| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| Product slug schema field missing | Low | Open | Sparse unique index exists; field not declared on schema |

---

## Dependencies & Integrations

- **PG flags:** `READ_PG_PRODUCT`, `READ_PG_CATEGORY`, `READ_PG_BRAND`, `READ_PG_ATTRIBUTE`, `READ_PG_SUPPLIER`, `READ_PG_WAREHOUSE`, `READ_PG_PURCHASE_ORDER`, `READ_PG_STOCKALERT`
- **Permissions:** `manage_inventory`, `manage_catalog` on write routes
- **Related audits:** `ADMIN_PANEL_AUDIT.md`, `ORDERS_AUDIT.md`, `CMS_AUDIT.md`

---

## Change Log

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
