# ORDERS & CHECKOUT AUDIT — EonlineBazar

**Last updated:** 2026-09-20 (Group 4 — return requests queue + loyalty checkout redemption)  
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
| `backend/src/controllers/orderPaymentProofController.js` | Payment proof upload |
| `backend/src/controllers/admin/courierController.js` | Courier book/sync |
| `backend/src/models/order.js` | Order schema (10 statuses, `returnRequest`, `pointsRedeemed`, `loyaltyDiscount`) |
| `backend/src/utils/returnRequestHelpers.js` | Build/review return request payloads |
| `backend/src/repositories/orderRepository.js` | PG order dual-write + 7-table reassembly |
| `backend/src/services/courierService.js` | Steadfast/Pathao/RedX adapters |
| `backend/src/services/courierSyncService.js` | Book & Sync + status polling |
| `backend/src/jobs/courierSyncJob.js` | 3-hour cron status poll |
| `backend/src/services/readRouter.js` | PG read cutover with Mongo fallback |
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
- [x] Order assignment to staff — `assignedStaffId` on order
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

---

## Dependencies & Integrations

- **PG:** Order decomposed into 7 tables; `findOrderDetailedByLegacyId()` reassembles Mongo shape
- **Flag:** `READ_PG_ORDER` (ON in production per migration policy)
- **Payments:** `paymentIpnController.js`, gateway adapters — see `PAYMENTS_FINANCE_AUDIT.md`
- **Related audits:** `CUSTOMER_FRONTEND_AUDIT.md`, `PAYMENTS_FINANCE_AUDIT.md`, `PRODUCTS_AUDIT.md`

---

## Change Log

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
