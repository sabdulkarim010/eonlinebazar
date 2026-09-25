# ORDERS & CHECKOUT AUDIT — EonlineBazar

**Last updated:** 2026-09-24 (Phase 3 Part 3 POS offline batch sync)  
**Scope:** Order lifecycle, checkout, tracking, returns, refunds, POS, couriers, invoices  
**Status:** ✅ COMPLETE

---

## File Inventory

| Path | Role |
|------|------|
| `backend/src/routes/orderRoutes.js` | All customer + admin order endpoints |
| `backend/src/controllers/orderCheckoutController.js` | Create order at checkout |
| `backend/src/controllers/orderCustomerController.js` | Customer orders, track, cancel, return, invoice |
| `backend/src/services/invoiceService.js` | Branded PDF invoice generation |
| `backend/src/utils/orderStatusHistory.js` | Status history append + PG mirror |
| `backend/src/controllers/orderAdminController.js` | Admin order CRUD, status, POS, assign, returns |
| `backend/src/controllers/admin/posOfflineSyncController.js` | Offline POS batch order sync |
| `backend/src/services/posOfflineSyncService.js` | Idempotent offline order replay + inventory/shift updates |
| `backend/src/controllers/orderPaymentProofController.js` | Payment proof upload |
| `backend/src/controllers/admin/courierController.js` | Courier book/sync |
| `backend/src/models/order.js` | Order schema (10 statuses, `returnRequest`, `pointsRedeemed`, `loyaltyDiscount`) |
| `backend/src/utils/returnRequestHelpers.js` | Build/review return request payloads |
| `backend/src/repositories/orderRepository.js` | PG order dual-write + 7-table reassembly |
| `backend/src/services/courierService.js` | Steadfast/Pathao/RedX adapters |
| `backend/src/services/courierSyncService.js` | Book & Sync + status polling |
| `backend/src/jobs/courierSyncJob.js` | 3-hour cron status poll |
| `backend/src/services/readRouter.js` | PG read cutover with Mongo fallback |
| `backend/src/utils/orderMongoLookup.js` | `findOrderByRef()` — `_id` or business `orderId` without CastError |
| `backend/src/config/readCutoverFlags.js` | `READ_PG_ORDER` flag |
| `tests/repositories/order.repository.test.js` | Order repo tests |
| `tests/repositories/order.readcutover.test.js` | Mongo vs PG shape comparison |
| `client/js/checkout.js` + `client/js/checkout/` | Checkout UI modules |
| `client/js/order-details.js` / `order-track.js` | Order view + tracking |
| `client/js/profile/orders.js` | Profile order history |
| `client/js/admin/modules/orders-table.js` | Admin order table |
| `client/js/admin/modules/orders-actions.js` | Courier, assign, status actions |
| `client/js/admin/modules/orders-editor.js` | Master order editor |
| `client/js/admin/modules/orders-pos.js` | POS system |
| `client/js/admin/modules/orders-invoice.js` | Invoice modal |
| `client/js/admin/modules/orders-return-requests.js` | Return requests queue (approve/reject) |
| `client/admin/partials/view-orders.html` | Admin orders view + Return Requests tab |
| `client/admin/partials/view-pos.html` | POS view |

---

## Feature Checklist

- [x] Checkout order creation — `POST /api/orders`, `orderCheckoutController.js`
- [x] Customer order list — `GET /api/orders/my-orders`
- [x] Public order tracking — `GET /api/orders/track`
- [x] Order cancel (user) — `POST/PUT /api/orders/:id/cancel`
- [x] Return request (full + per-item) — `POST /api/orders/:id/return`, `/return/items`, `/return-request`
- [x] Admin return requests queue — `GET /api/admin/orders/return-requests`, `PUT .../return-request`
- [x] Loyalty points redemption at checkout — `orderCheckoutController.js` + checkout loyalty panel
- [x] Payment proof upload — `PATCH /api/orders/:orderId/payment-proof`
- [x] PDF invoice download — `GET /api/orders/:id/invoice`, `GET /api/orders/my-orders/:id/invoice`
- [x] Admin PDF invoice — `GET /api/admin/orders/:id/invoice`
- [x] Persisted order status timeline — `statusHistory[]` + admin vertical timeline UI
- [x] Admin order list + status update — `GET/PUT /api/orders`
- [x] Bulk order status update — `PUT /api/admin/orders/bulk-status`; `orders-actions.js` bulk Apply
- [x] Admin manual POS orders — `orders-pos.js`, `createManualOrder`
- [x] POS offline batch sync — `POST /api/admin/pos/orders/batch-sync` (`access_pos` / `manage_orders`); idempotent `offlineOrderId`
- [x] Order assignment to staff — `assignedStaffId` on order; `PATCH /assign` accepts `update_order_status`
- [x] Staff-scoped order UI gates — delete/bulk-delete `manage_orders`; status/assign `update_order_status`; no background 403 fetches
- [x] Courier Book & Sync (Steadfast/Pathao/RedX) — `courierSyncService.js`
- [x] Courier auto-poll cron (3h) — `courierSyncJob.js`
- [x] Returns & refunds (wallet/bKash) — admin + customer controllers
- [x] VAT snapshot on order — settings-driven checkout VAT
- [x] Abandoned cart recovery — `abandonedCartJob.js` (see `MARKETING_AUDIT.md`)
- [x] PG order read cutover + 7-table reassembly — `orderRepository.js`, `READ_PG_ORDER`
- [ ] Return-items PG reassembly verified on live data | Low priority — no test orders in dataset (Stage 4 Step 7)

---

## Known Issues / Gaps

| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| Return items PG case unverified | Low | Open | Code exists; no orders with `returnItems[]` in current dataset |
| Null productId PG case unverified | Low | Open | All OrderItems have valid productIds in live data |
| Staff with `update_order_status` saw delete btn + 403 polls | Medium | Fixed | 2026-09-23 — UI gates + gated master-settings/WhatsApp fetches in `fetchLiveOrders` |
| Assign order API `manage_orders`-only | Medium | Fixed | 2026-09-23 — route now accepts `update_order_status` |

---

## Dependencies & Integrations

- **PG:** Order decomposed into 7 tables; `findOrderDetailedByLegacyId()` reassembles Mongo shape
- **Flag:** `READ_PG_ORDER` (ON in production per migration policy)
- **Payments:** `paymentIpnController.js`, gateway adapters — see `PAYMENTS_FINANCE_AUDIT.md`
- **Related audits:** `CUSTOMER_FRONTEND_AUDIT.md`, `PAYMENTS_FINANCE_AUDIT.md`, `PRODUCTS_AUDIT.md`

---

## Change Log

### Phase 3 Part 3 — POS offline batch sync — 2026-09-24

- `posOfflineSyncService.js`: accepts `orders[]` with `offlineOrderId`, items, customer, payments, `posShiftId`; skips duplicates in Mongo/PG; deducts stock; records shift sales
- `posOfflineSyncController.js`: returns `{ syncedCount, skippedCount, errors }`
- `order.js`: `offlineOrderId` sparse unique index; `orderSource: offline_pos`
- `adminRoutes.js`: `POST /api/admin/pos/orders/batch-sync`
- Tests: `tests/services/phase3Part3.test.js` — Jest **280/280**

### Phase 3 Part 2 — POS shifts + split payments + wallet on manual order — 2026-09-24

- `posShiftService.js` + `posShiftController.js`: open/current/close/list shift register with cash reconciliation
- `orderAdminController.createManualOrder`: accepts `payments[]` split array; validates total; links `posShiftId`; WALLET line deducts customer balance
- `order.js`: `posShiftId`, `splitPayments[]` fields
- Tests: `tests/services/phase3Part2.test.js` — Jest **277/277**

### Phase 3 Part 1 — COD risk scoring, courier webhooks, export PG stats — 2026-09-24

- `riskScoringService.js`: return/cancel rate + pending COD heuristics → `riskScore` (LOW/MEDIUM/HIGH) + `riskReason`
- `orderAdminController.getOrders`: enriches every order with risk fields for admin fraud screening
- `exportController.exportCustomersCSV`: uses `fetchCustomerOrderStatsMap` (respects `READ_PG_ORDER`)
- `courierWebhookController.js` + `webhookRoutes.js`: real-time Steadfast/Pathao/RedX status → dual-write order update + statusHistory
- `courierSyncService.applyCourierWebhookStatusUpdate`: shared webhook/poll status engine
- Tests: `tests/services/phase3Part1.test.js` — Jest **274/274**

### Phase 2 — Customer order stats PG read cutover — 2026-09-24

- `userReadService.js`: `fetchCustomerOrderStatsMap`, `fetchCustomerOrderCount`, `fetchCustomerDeliveredSpend`, `fetchCustomerOrderHistory` via `routedRead('order')` — PG `groupBy`/`orderRepository.findAllDetailed` with Mongo aggregate fallback
- `customerAdminController.js`: list enrichment, detail stats, order history, POS quick-add order count wired to routed reads; segment badges (VIP, Frequent Buyer) use active DB stats
- Tests: `tests/services/phase2ReadCutover.test.js` — Jest **270/270**

### POS access_pos permission alignment — 2026-09-24

- `adminRoutes.js`: `POST /orders/manual` accepts `access_pos` OR `manage_orders`; `POST /customers/quick` accepts `access_pos` OR `manage_customers`
- `permissions.js`: `access_pos` implies `view_customers` for POS customer lookup
- `tests/pos.test.js`: staff with `access_pos` only can create manual orders
- Tests: Jest **266/266** passing

### Safe Mongo order lookup for PG cutover fallbacks — 2026-09-24

- `orderMongoLookup.js`: `isStrictMongoObjectId()` + `findOrderByRef()` — queries by `_id` or business `orderId` (e.g. `__test_ord_*`) without Mongoose CastError
- Wired into `orderCustomerController`, `paymentReconciliationController`, `orderRepository` Mongo fallbacks
- Tests: `tests/utils/orderMongoLookup.test.js`; Jest **255/255** passing

### Staff order RBAC (Dalia fix) — 2026-09-23

- `orders-table.js`: delete row button gated on `canManageOrders()`; bulk delete hidden via `updateOrdersBulkToolbar`; `master-settings` + WhatsApp alert fetches skipped unless permitted
- `orders-actions.js`: shared RBAC helpers (`canChangeOrderStatus`, `canAssignOrderStaff`, etc.); status `<select>` uses helpers; assign dropdown + PATCH guard aligned with `update_order_status`
- `adminRoutes.js`: `PATCH /orders/:orderId/assign` accepts `manage_orders` OR `update_order_status`
- Tests: Jest **231/231** passing

### Group 4 — Return requests + loyalty redemption — 2026-09-20

- `returnRequest` embedded schema; admin list/review endpoints; Return Requests tab in orders view
- Checkout loyalty checkbox sends `applyLoyaltyPoints` / `loyaltyPointsToUse` to `POST /api/orders`
- Tests: Jest **228/228** passing

### Group 3 — Invoice PDF + status timeline — 2026-09-20

- `invoiceService.js` wraps PDFKit with Settings branding; admin + customer download buttons
- `statusHistory[]` on Order model; dual-write to PG `OrderStatusHistory`
- Admin expanded panel vertical timeline (`orderStatusTimeline.js` + `_orders.css`)
- Tests: Jest **228/228** passing

### Bulk order status update — 2026-09-20

- `PUT /api/admin/orders/bulk-status` — up to 50 orders; Processing/Shipped/Delivered/Cancelled
- Frontend `bulkApplyOrderStatus()` uses single API call instead of per-order loop
- Tests: Jest **228/228** passing

### Audit system initialized — codebase scan — 2026-09-20

- Verified 14 order routes in `orderRoutes.js`; inventoried controllers, repos, UI
- Status: ✅ COMPLETE (2 low-severity PG verification gaps noted)
