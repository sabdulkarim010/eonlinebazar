# EOnlineBazar Refactoring Map
# Completed: 2026-08-25
# Phase 1 HRM/RBAC: 2026-09-10
#
# Phase 2 ERP Core (completion pass): 2026-09-10
# Models
backend/src/models/supplier.js [NEW] vendor directory (contact, suppliedProducts, status)
backend/src/models/warehouse.js [NEW] stock locations with a single isDefault flag
backend/src/models/purchaseOrder.js [NEW] PO schema + generatePoNumber/deriveReceivingStatus/computeTotalCost
backend/src/models/product.js [DONE] slug (sparse unique), supplierId, warehouseId, reorderPoint, costHistory[]
backend/src/models/order.js [DONE] status enum (10 values incl. Return Requested) + Order.STATUSES
backend/src/models/securityLog.js [DONE] supplier/warehouse/purchase_order resourceTypes
# Controllers
backend/src/controllers/admin/supplierController.js [NEW] full CRUD; delete blocked by open POs, unlinks products
backend/src/controllers/admin/warehouseController.js [NEW] full CRUD; default-warehouse promotion/protection
backend/src/controllers/admin/purchaseOrderController.js [DONE] createPO/getAllPOs/getPOById/updatePO/receivePO/cancelPO
backend/src/controllers/productController.js [DONE] slug auto-gen + de-dup, ERP field writes, getAdminProductById
backend/src/controllers/orderAdminController.js [DONE] status enum validation on updateOrderStatus (findByIdAndUpdate skips validators)
# Services / routes / bootstrap
backend/src/services/warehouseService.js [NEW] seedDefaultWarehouse + getDefaultWarehouseId
backend/src/routes/adminRoutes.js [DONE] PO write routes + admin product detail (ERP routes live in this barrel, not new files)
backend/src/server.js [DONE] seedDefaultWarehouse in the DB bootstrap chain
backend/src/config/permissions.js [DONE] view-finance gated to manage_settings (owner-only)
# Frontend
client/admin/partials/view-products.html [DONE] supplier + warehouse + reorderPoint fields on add form
client/admin/partials/modals-products.html [DONE] supplier + warehouse + reorderPoint fields on edit modal
client/admin/partials/sidebar.html [DONE] view-finance marked data-superadmin-only
client/js/admin/modules/products-form.js [DONE] loadErpProductDropdowns + ERP fields in both payloads
# Scripts / tests
scripts/migrateOrderStatus.js [NEW] legacy status normalizer (--dry-run); run 2026-09-10, 28 orders all valid
tests/erp.test.js [NEW] 31 tests — supplier/warehouse CRUD, PO receive workflow, slug, enum, audit log
backend/src/controllers/admin/staffAuditController.js [NEW] staff activity audit grouped by admin actor
backend/src/config/permissions.js [DONE] manage_marketing permission + section gating
backend/src/models/securityLog.js [DONE] resourceType + resourceId audit fields
backend/src/utils/securityLogger.js [DONE] logSecurityEvent accepts resourceType/resourceId
backend/src/routes/categoryRoutes.js [DONE] checkPermission('manage_catalog') on admin writes
backend/src/routes/bannerRoutes.js [DONE] checkPermission('manage_catalog') on admin writes
backend/src/routes/adminRoutes.js [DONE] staff-audit, order assign, manage_marketing newsletter, staff roster
backend/src/routes/internalRoutes.js [DONE] GET /api/internal/admin-profile/:adminId
backend/src/controllers/staffController.js [DONE] getAdminProfileForChat, getStaffRoster, staff audit logging
backend/src/controllers/orderAdminController.js [DONE] assignOrderToStaff + order resource logging
backend/src/models/order.js [DONE] assignedStaffId, assignedAt
backend/src/models/admin.js [DONE] manage_marketing backfill on staff with manage_settings
ecommerce-chat/services/agentResolver.service.js [DONE] resolveAgent + syncAgentFromAdmin (internal API SSO)
client/admin/partials/settings-staff-audit.html [NEW] Staff Activity Audit section
client/js/admin/modules/settings-staff-audit.js [NEW] staff audit dashboard UI
client/js/admin/admin-settings.js [DONE] imports settings-staff-audit.js
client/js/admin/modules/orders-actions.js [DONE] assign staff dropdown + PATCH assign API
client/js/admin/modules/orders-table.js [DONE] staff assign select in action row
client/js/admin/modules/core-nav.js [DONE] view-staff-audit nav + pagination
client/js/admin-staff.js [DONE] marketingManager preset + manage_marketing catalog
client/admin/partials/sidebar.html [DONE] Staff Activity nav item
client/admin/partials/view-staff.html [DONE] Marketing permission preset button
client/admin/partials/modals-invoice.html [DONE] Marketing permission preset (edit staff)
client/css/admin/_orders.css [DONE] order-assign-staff-select styles
client/css/admin/_settings-security.css [DONE] staff audit panel styles
backend/src/utils/adminPageBuilder.js [DONE] registers settings-staff-audit partial
#
# Phase 4 UI Restructure & Polish: 2026-09-10
client/admin/partials/sidebar.html [DONE] ERP/CRM/HRM/Settings accordion nav + mobile drawer markup
client/admin/partials/header.html [DONE] breadcrumb container + mobile sidebar toggle
client/admin/partials/view-overview.html [DONE] enterprise ERP/CRM/HRM summary widgets
client/admin/partials/view-suppliers.html [NEW] supplier directory section
client/admin/partials/view-warehouses.html [NEW] warehouse list section
client/admin/partials/view-purchase-orders.html [NEW] purchase order list section
client/admin/partials/view-finance.html [NEW] finance analytics embed CTA
client/admin/partials/view-customers.html [DONE] cursor load-more bar (replaces page numbers)
client/admin/partials/view-products.html [DONE] cursor load-more bar (replaces page numbers)
client/js/admin/modules/core-breadcrumb.js [NEW] Dashboard > Group > Section breadcrumb
client/js/admin/modules/core-nav.js [DONE] accordion groups, mobile drawer, cursor customers
client/js/admin/modules/core-state.js [DONE] ADMIN_PAGE_META for ERP/CRM sections
client/js/admin/modules/erp-suppliers.js [NEW] supplier table loader
client/js/admin/modules/erp-warehouses.js [NEW] warehouse table loader
client/js/admin/modules/erp-purchase-orders.js [NEW] PO table loader
client/js/admin/modules/products-table.js [DONE] cursor pagination via /api/products/search
client/js/admin/admin-core.js [DONE] imports core-breadcrumb.js
client/js/admin/admin-products.js [DONE] imports erp-*.js modules
client/js/admin/admin-dashboard.js [DONE] fetchEnterpriseSummary + widget render
client/css/admin/_layout.css [DONE] breadcrumb, enterprise widgets, nav accordion styles
client/css/admin/_responsive.css [DONE] mobile sidebar drawer + enterprise widget stack
backend/src/controllers/admin/enterpriseSummaryController.js [NEW] GET /api/admin/enterprise-summary
backend/src/controllers/admin/purchaseOrderController.js [NEW] PO list/detail endpoints (workflow completed in the Phase 2 pass above)
backend/src/controllers/admin/customerAdminController.js [DONE] cursor pagination {cursor,limit,nextCursor,hasMore}
backend/src/controllers/productController.js [DONE] cursor pagination on searchProducts
backend/src/controllers/settingsController.js [DONE] GET /api/admin/all-settings unified merge
backend/src/models/Setting.js [DONE] deprecation note → all-settings endpoint
backend/src/models/Settings.js [DONE] deprecation note → all-settings endpoint
backend/src/config/permissions.js [DONE] SECTION_PERMISSIONS for ERP/CRM Phase 4 sections
backend/src/routes/adminRoutes.js [DONE] enterprise-summary, all-settings, suppliers, warehouses, POs
backend/src/utils/adminPageBuilder.js [DONE] registers ERP view partials
scripts/addEnterpriseIndexes.js [NEW] npm run migrate:indexes
package.json [DONE] migrate:indexes script
mobile/.env.example [NEW] EXPO_PUBLIC_API_URL, EXPO_PUBLIC_CHAT_URL, EXPO_PUBLIC_APP_ENV
mobile/src/config/chatConfig.js [DONE] EXPO_PUBLIC_CHAT_URL fallback
mobile/src/api/search.js [DONE] nextCursor in extractSearchPagination
mobile/src/components/ProductGrid.js [DONE] cursor-based load more
ARCHITECTURE.md [DONE] enterprise models, nav groups, mobile env, feature matrix
SYSTEM_ENTERPRISE_AUDIT.md [DONE] Section 2 Phase 1–4 items marked complete
#
# Phase 2 Audit — Sidebar routing fixes: 2026-09-10
client/admin/partials/view-master-settings.html [DONE] #rewards-section scroll anchor for Loyalty Program deep link
client/js/admin/modules/core-nav.js [DONE] data-scroll-target delayed scroll + link label title; data-settings-tab tab activation
#
# Settings section split — 2026-09-10
client/admin/partials/view-shipping-payments.html [NEW] Shipping, SMS, courier, WhatsApp, payment methods
client/admin/partials/view-loyalty-program.html [NEW] VIP segmentation + rewards/refund engine
client/admin/partials/view-store-config.html [NEW] Catalog pagination, flash sale, footer, CMS pages
client/admin/partials/view-master-settings.html [DELETED] split into 3 focused sections above
client/admin/partials/sidebar.html [DONE] Loyalty → view-loyalty-program; Shipping → view-shipping-payments; Store Configuration link added
backend/src/utils/adminPageBuilder.js [DONE] register 3 new partials, remove view-master-settings
backend/src/config/permissions.js [DONE] view-shipping-payments, view-loyalty-program, view-store-config
client/js/admin/modules/core-nav.js [DONE] remove scroll-target logic; link-title headers; tryActivateTab; lastClickedNavItem accordion fix
client/js/admin/modules/core-state.js [DONE] ADMIN_PAGE_META for 3 new sections
client/js/admin/modules/core-breadcrumb.js [DONE] BREADCRUMB_MAP for 3 new sections
SYSTEM_ENTERPRISE_AUDIT.md [DONE] SETTINGS ROUTING AUDIT marked resolved
#
# Phase 3 CRM & Automation: 2026-09-10
# --- Task 1: Abandoned cart tracking ---
backend/src/models/cart.js [DONE] lastActivityAt + abandonedNotifiedAt fields, re-arm pre-save hook, {userId:1,updatedAt:-1} index
backend/src/services/mailer.js [DONE] buildAbandonedCartHtml + sendAbandonedCartEmail
backend/src/jobs/abandonedCartJob.js [NEW] daily 10am cron — email+SMS recovery, stamps abandonedNotifiedAt; ABANDON_THRESHOLD_MS
backend/src/server.js [DONE] startAbandonedCartCron() bootstrap after Redis connect
backend/src/controllers/admin/crmController.js [NEW] getAbandonedCartStats (count/value/notified/recovered/recoveryRate)
backend/src/routes/adminRoutes.js [DONE] GET /crm/abandoned-carts + ticket routes (stats/assign/status)
client/js/admin/modules/crm-abandoned.js [NEW] loadAbandonedCartStats — abandoned cart KPI loader
client/js/admin/admin-customers.js [DONE] imports crm-abandoned.js
client/admin/partials/view-crm-abandoned.html [NEW] Abandoned Carts KPI section
client/admin/partials/sidebar.html [DONE] Abandoned Carts + external /chat-admin link
client/js/admin/modules/core-nav.js [DONE] view-crm-abandoned loader mapping
backend/src/utils/adminPageBuilder.js [DONE] registers view-crm-abandoned partial
# --- Task 2: Referral system ---
backend/src/models/user.js [DONE] referralCode (unique auto 8-char) + referredBy + referralEarnings + pre-save hook
backend/src/controllers/auth/registerController.js [DONE] links referredBy from referralCode on signup
backend/src/models/Setting.js [DONE] referralRewardAmount
backend/src/controllers/masterSettingsController.js [DONE] referralRewardAmount alias/rule/output
backend/src/controllers/referralController.js [NEW] getReferralInfo + processReferralReward + buildReferralLink
backend/src/routes/userRoutes.js [DONE] GET /referral (verifyUser)
backend/src/controllers/orderCheckoutController.js [DONE] processReferralReward on referred user's first order
# --- Task 3: Unified support inbox / ticket lifecycle ---
backend/src/models/ContactMessage.js [DONE] ticketNumber + status/priority/assignedTo/resolvedAt + isRead; ticket-code hook
backend/src/controllers/contactController.js [DONE] assignTicket + updateTicketStatus + getTicketStats; reply bumps to in_progress
scripts/migrationAddTicketNumbers.js [NEW] backfill ticketNumber + legacy status/priority mapping
client/js/admin/modules/messages-inbox.js [DONE] ticket status/priority/assignee UI + status-tab filtering
client/admin/partials/view-messages.html [DONE] ticket tabs + controls bar (status/priority/assignee)
client/css/admin/_customers.css [DONE] ticket priority/number/assignee pills + controls bar styles
# --- Tasks 4 & 5: Segment campaigns + WhatsApp broadcast ---
backend/src/models/emailCampaign.js [DONE] targetSegment + channel + whatsappTemplate
backend/src/services/whatsappService.js [DONE] sendBroadcast(recipients, templateMessage)
backend/src/controllers/newsletterAdminController.js [DONE] segment resolver + channel dispatch (email/sms/whatsapp)
client/js/admin-newsletter.js [DONE] segment + channel + WhatsApp template form fields
client/admin/partials/view-catalog.html [DONE] campaign form: channel/segment selectors + message template
# --- Task 6: Legacy chat admin deprecation ---
client/admin/partials/view-chat.html [DEPRECATED] redirect notice + Open Chat Admin button
client/js/admin/modules/chat-admin.js [DEPRECATED] console.warn on load; route kept registered
client/css/admin/_chat.css [DONE] chat-deprecated-* notice + sidebar external-link styles
# --- Task 7 + Task 2 mobile: Referral screen ---
mobile/src/api/user.js [NEW] userAPI.getReferral (GET /customer/referral)
mobile/src/api/endpoints.js [DONE] referral endpoint
mobile/src/api/index.js [DONE] exports userAPI
mobile/src/screens/ReferralScreen.js [NEW] referral code + copy (expo-clipboard) + Share invite + stats
mobile/App.js [DONE] Referral stack route
mobile/src/i18n/translations.js [DONE] screen.referral + profile.refer_earn (en/bn)
mobile/src/i18n/profileMenu.js [DONE] Refer & Earn menu item
mobile/src/screens/ProfileScreen.js [DONE] referral menu item rendered via profileMenu
mobile/src/screens/RegisterScreen.js [DONE] optional referralCode input
mobile/src/store/useAuthStore.js [DONE] forwards referralCode on register
mobile/package.json [DONE] expo-clipboard dependency
# Phase 2 Audit — ERP + CRM admin UI completion: 2026-09-10
client/admin/partials/view-suppliers.html [DONE] Add Supplier modal + table actions column
client/admin/partials/view-warehouses.html [DONE] Add Warehouse modal + default badge + Set Default action
client/admin/partials/view-purchase-orders.html [DONE] Create PO + Receive PO modals + status badges + actions
client/admin/partials/view-crm-abandoned.html [DONE] filter tabs + abandoned cart list table + recovery actions
client/js/admin/modules/erp-suppliers.js [DONE] full CRUD — openAdd/Edit, save, delete, loadSuppliers
client/js/admin/modules/erp-warehouses.js [DONE] full CRUD + setDefaultWarehouse
client/js/admin/modules/erp-purchase-orders.js [DONE] create/receive/cancel PO workflow + line items
client/js/admin/modules/crm-abandoned-carts.js [NEW] loadAbandonedCarts, renderCartsTable, sendRecoveryNotification
client/js/admin/modules/crm-abandoned.js [DONE] thin re-export → crm-abandoned-carts.js
client/js/admin/admin-customers.js [DONE] imports crm-abandoned-carts.js
client/js/admin/modules/core-nav.js [DONE] view-crm-abandoned → loadAbandonedCarts('all')
backend/src/controllers/admin/crmController.js [DONE] cart list in GET + notifyAbandonedCart POST handler
backend/src/routes/adminRoutes.js [DONE] POST /crm/abandoned-carts/:userId/notify
#
# ERP Upgrade Part 1 — POS Enhancement: 2026-09-11
# --- Task 1: POS Enhancement ---
client/admin/partials/orders-pos.html [DONE] manual POS modal — barcode/SKU search, quick grid, customer phone lookup + quick-add, item/order discounts, split payment, posInvoiceModal receipt
client/admin/partials/sidebar.html [DONE] ERP sidebar — dedicated POS System launch item (`openPOSModal`)
client/admin/partials/modals-orders.html [DONE] placeholder — POS markup moved to orders-pos.html
backend/src/utils/adminPageBuilder.js [DONE] MODAL_PARTIALS includes orders-pos
backend/src/controllers/productController.js [DONE] GET /api/products ?search= & ?sort=sales|popular on list endpoint; buildProductListSearchFilter (name/sku/variants.sku)
client/js/admin/modules/orders-pos.js [DONE] openPOSModal alias; initBarcodeSearch; customer phone lookup + quick-add; item discount/price override; order discount flat/%; split payment + change; invoice discount/payment breakdown
client/css/admin/_orders.css [DONE] POS customer lookup, quick-add, line inputs, split payment, change amount styles
client/css/admin/_layout.css [DONE] sidebar-pos-launch highlight
backend/src/controllers/admin/customerAdminController.js [DONE] GET /customers?search=; POST createQuickCustomer (POS walk-in)
backend/src/controllers/orderAdminController.js [DONE] createManualOrder — lineDiscount/priceOverride, percent discount, paymentType, customerUserId link
backend/src/routes/adminRoutes.js [DONE] POST /api/admin/customers/quick
client/css/admin/_orders.css [DONE] .pos-barcode-dropdown-*, .pos-quick-grid-refresh, .pos-quick-stock-badge, .pos-invoice-*
client/css/admin/_print.css [DONE] body.printing-pos-invoice print-only receipt rules
# --- Task 2: Courier deep integration (Part 2 ERP Upgrade) ---
backend/src/models/order.js [DONE] courierName + courierSyncedAt fields
backend/src/services/courierService.js [DONE] fetchSteadfastOrderStatus, fetchPathaoOrderStatus, fetchRedxParcelStatus (status polling on top of booking)
backend/src/services/courierSyncService.js [DONE] syncOrderWithCourier (book+SMS+WhatsApp+SecurityLog+Shipped), autoSyncCourierStatus (Steadfast/Pathao/RedX poll+map+cashback), STATUS_MAP steadfast/pathao/redx incl. Returned
backend/src/jobs/courierSyncJob.js [DONE] every-3h cron (`0 */3 * * *`) — poll Shipped/Out for Delivery, log "X updated, Y unchanged, Z errors"
backend/src/server.js [DONE] startCourierSyncCron() bootstrap
backend/src/controllers/admin/courierController.js [NEW] bookAndSyncCourier (PATCH), getCourierStatus (GET)
backend/src/controllers/courierController.js [DONE] send-courier + config status; re-exports admin book/sync handlers
client/js/admin/modules/orders-actions.js [DONE] Book & Sync button + ↻ Refresh on shipped rows (bookAndSyncCourier/refreshCourierStatus)
backend/src/routes/adminRoutes.js [DONE] PATCH /orders/:orderId/book-courier, GET /orders/:orderId/courier-status
# --- Task 3: Expense tracking (Part 3 ERP Upgrade) ---
backend/src/models/expense.js [DONE] 8-category enum + amount/date/reference/recordedBy/attachmentUrl, indexes {date:-1},{category:1,date:-1}
backend/src/controllers/admin/expenseController.js [DONE] create/getAll/update/delete/getExpenseSummary (stats+monthlyTrend+vsLastMonth), uploadExpenseReceipt (Cloudinary)
backend/src/models/securityLog.js [DONE] 'expense' in RESOURCE_TYPES enum
backend/src/routes/adminRoutes.js [DONE] GET/POST /expenses, POST /expenses/upload-receipt, PATCH/DELETE /expenses/:id, GET /expenses/summary (manage_settings)
client/admin/partials/view-erp-expenses.html [NEW] stats row, filters, table, category sidebar, monthly trend, add/edit modal + receipt upload
client/js/admin/modules/erp-expenses.js [NEW] loadExpensesSection, openAddExpenseModal, saveExpense, deleteExpense, applyExpenseFilters, all window.* exports
client/css/admin/_erp-expenses.css [NEW] expense tracking UI styles
client/css/admin.css [DONE] one-line import _erp-expenses.css
client/js/admin/admin-products.js [DONE] one-line import erp-expenses.js
backend/src/utils/adminPageBuilder.js [DONE] view-erp-expenses partial
client/admin/partials/sidebar.html [DONE] ERP → Expense Tracking nav item
client/js/admin/modules/core-nav.js [DONE] refreshMap view-erp-expenses → loadExpensesSection
client/js/admin/modules/core-breadcrumb.js [DONE] view-erp-expenses breadcrumb
client/js/admin/modules/core-state.js [DONE] view-erp-expenses section title
# --- Task 4: Advanced P&L Report (Part 4 ERP Upgrade — FINAL) ---
backend/src/controllers/admin/profitLossController.js [DONE] getProfitLossReport — Delivered revenue, return deductions, COGS (totalBuyingPrice), courier from Expense courier_charges, expenses by category, cashback/discounts/returnLoss, net margin, trend + top/worst products
backend/src/controllers/admin/exportController.js [DONE] exportPLtoPDF (PDFKit), exportPLtoCSV — shared computeProfitLoss engine
client/admin/partials/view-finance.html [DONE] date range + groupBy, Generate Report, summary cards, Chart.js donut/bar/trend, product + expense tables, Export PDF/CSV
client/js/admin/modules/erp-profit-loss.js [DONE] loadPLReport, renderSummaryCards, renderCharts (Chart.js), renderTopProducts, exportPDF/exportCSV — all window.*
client/css/admin/_finance.css [DONE] P&L chart canvas + wide trend card styles
backend/src/routes/adminRoutes.js [DONE] GET /finance/profit-loss + /export-pdf + /export-csv (verifyAdmin + requireSuperAdmin)
# ERP Upgrade complete (Parts 1–4): POS · Courier sync · Expense tracking · Advanced P&L
#
# POS full-page view — 2026-09-11
client/admin/partials/view-pos.html [NEW] full-page POS — left: barcode, category chips, product grid; right: customer, cart, discounts, split payment, checkout
client/admin/partials/orders-pos.html [DONE] invoice receipt modal only; manual order form moved to view-pos
client/admin/partials/sidebar.html [DONE] POS System → data-target view-pos (dedicated page nav)
client/js/admin/modules/orders-pos.js [DONE] initPosSection, overlay fallback from Orders, category filters, #pos hash route
client/js/admin/modules/core-nav.js [DONE] refreshMap view-pos → initPosSection
client/js/admin/modules/core-state.js [DONE] ADMIN_PAGE_META view-pos
client/js/admin/modules/core-breadcrumb.js [DONE] view-pos breadcrumb
client/css/admin/_pos.css [NEW] two-column POS page + overlay fallback styles
client/css/admin.css [DONE] import _pos.css
client/css/admin/_layout.css [DONE] removed permanent sidebar-pos-nav highlight; uses standard li.active only
client/admin/partials/sidebar.html [DONE] POS System — no static sidebar-pos-nav class
client/js/admin/modules/core-nav.js [DONE] navigateAdminSection resolves active item from data-target (view-pos hash/deep links)
client/css/admin/_responsive.css [DONE] POS page stack on mobile
backend/src/utils/adminPageBuilder.js [DONE] registers view-pos partial
backend/src/config/permissions.js [DONE] view-pos → manage_orders
#
# Refactoring complete — all listed files are [DONE]
#
# RULE: Every time you modify a file during refactoring,
# update this map. Future Cursor sessions must read this
# file FIRST before touching any HTML/CSS/JS file.
# Also read ARCHITECTURE.md.
#
# STATUS KEY:
# [DONE] = fully refactored, thin barrel, or kept as a finished single file

## Docs (audit / notes)
CHAT_AUDIT.md                        [DONE] live-chat audit §1–16 + P0 CRM enrichment §17 (2026-09-07)
ADMIN_NOTES.md                       [DONE] cleared; dev/env notes moved to ARCHITECTURE.md (2026-09-11)
ARCHITECTURE.md                      [DONE] Local Development Quick Reference + Documentation Index (2026-09-11)
.cursorrules                         [NEW] mandatory Cursor Agent guidelines (2026-09-11)
.env.example                         [DONE] CHAT_SERVICE_PORT/URL + INTERNAL_API_KEY chat section (2026-09-08)
ecommerce-chat/.env.example          [DONE] chat-only vars; JWT/Cloudinary from repo-root (2026-09-08)
admin-dashboard/.env.example         [DONE] gateway :5000 for VITE_API_URL + VITE_SOCKET_URL (2026-09-08)
backend/public/chat-admin            [DONE] rebuilt admin-dashboard dist (2026-09-08)
client/js/chat-widget.js             [DONE] socket re-join, hide FAB when open, remove customer close, SVG avatars (2026-09-08)
client/css/global/_chat-widget.css   [DONE] FAB hide + avatar img/SVG fallback styles (2026-09-08)
ecommerce-chat/public/js/chat-widget.js [DONE] minimize-only close, SVG avatars, socket room filter (2026-09-08)
ecommerce-chat/models/ChatRoom.model.js [DONE] removed duplicate order_id field index (2026-09-08)
ecommerce-chat/services/storeProfile.service.js [DONE] profile fetch → /api/customer/profile (2026-09-08)
backend/src/server.js [DONE] /api/users alias mount for customer profile routes (2026-09-08)
ecommerce-chat/services/ai.service.js [DONE] KB fallback on OpenAI 429/errors (2026-09-08)
ecommerce-chat/socket/chat.socket.js [DONE] emit KB fallback BOT messages when OpenAI down (2026-09-08)
backend/src/controllers/_userController.orig.js [REMOVED] empty 0-byte stub (2026-09-08)
ecommerce-chat/socket/chatAuth.js    [DONE] chat socket ownership helpers for end_chat / resolve_chat
ecommerce-chat/services/storeProfile.service.js [NEW] main store profile/order fetch for CRM enrichment
ecommerce-chat/models/ChatRoom.model.js [DONE] is_registered, customer_profile, product_metadata
backend/src/middlewares/internalServiceAuth.js [NEW] INTERNAL_API_KEY guard for chat microservice
backend/src/controllers/internalChatController.js [NEW] internal customer profile + orders for chat
backend/src/routes/internalRoutes.js [NEW] GET /api/internal/customers/:id, orders, order by id
admin-dashboard/src/components/AgentAvatar.jsx [NEW] agent profile photo or initials avatar
admin-dashboard/src/components/CustomerAvatar.jsx [NEW] customer avatar with colorful initials onError fallback
admin-dashboard/src/components/MessageBubble.jsx [DONE] Messenger-style bubbles, grouped avatars, no in-bubble names (2026-09-09)
admin-dashboard/src/components/ChatWindow.jsx [DONE] header action buttons + message grouping + CustomerAvatar (2026-09-09)
admin-dashboard/src/components/RoomListItem.jsx [DONE] CustomerAvatar sidebar list (2026-09-09)
admin-dashboard/src/components/CustomerContext.jsx [DONE] CustomerAvatar in context panel (2026-09-09)
ecommerce-chat/public/css/chat-widget.css [DONE] Messenger bubbles: no names, pre-wrap, 75% max-width (2026-09-09)
ecommerce-chat/public/js/chat-widget.js [DONE] remove sender names; BOT messenger rows + avatar grouping (2026-09-09)
client/css/global/_chat-widget.css [DONE] Messenger bubble radius + 75% max-width (2026-09-09)
client/js/chat-widget.js [DONE] remove agent name label; avatar onError initials fallback (2026-09-09)
ecommerce-chat/models/Agent.model.js [DONE] password minlength 8 aligned with API (2026-09-09)
ecommerce-chat/routes/admin.routes.js [DONE] sendRouteError for PATCH /me + change-password (2026-09-09)
admin-dashboard/src/pages/ProfilePage.jsx [DONE] camera-badge avatar upload UI (no separate upload button)
admin-dashboard/src/pages/DashboardPage.jsx [DONE] hydrate agent profile on mount for header avatar
admin-dashboard/src/components/CustomerContext.jsx [DONE] live fetch GET /admin/customers/:userId + order history
admin-dashboard/src/services/api.js [DONE] browser enforces /api/chat-admin; rejects :5001 VITE_API_URL; chat_admin_token only
admin-dashboard/vite.config.js [DONE] WS proxy error handling; benign ECONNRESET/ECONNABORTED suppressed (2026-09-08)
admin-dashboard/src/utils/helpers.js [DONE] resolveAssetUrl defaults to store :5000 on Vite dev; pickRoomCustomerAvatar top-level fields (2026-09-08)
ecommerce-chat/utils/chatRoomHelpers.js [DONE] top-level avatar/image on admin room payloads (2026-09-08)
ecommerce-chat/routes/chat.routes.js [DONE] roomPayloadForAdmin on start/link + admin room_updated emits (2026-09-08)
admin-dashboard/src/components/CustomerContext.jsx [DONE] avatar fallback from room snapshot (2026-09-08)
admin-dashboard/src/components/RoomListItem.jsx [DONE] customer img + onError fallback (2026-09-08)
admin-dashboard/src/components/ChatWindow.jsx [DONE] customer header avatar img + onError (2026-09-08)
admin-dashboard/src/services/socket.js [DONE] socket auth from chat_admin_token localStorage only
backend/src/middlewares/chatApiProxy.js [DONE] canonical Authorization/Cookie on stream + non-stream proxy
ecommerce-chat/config/loadEnv.js [NEW] shared JWT_SECRET from repo-root/backend .env; dev fallback
ecommerce-chat/config/jwtSecret.js [NEW] getJwtSecret() for sign + verify
ecommerce-chat/server.js [DONE] use config/loadEnv + jwtSecret
ecommerce-chat/middleware/auth.middleware.js [DONE] getJwtSecret; clear admin_token on invalid signature
ecommerce-chat/routes/admin.routes.js [DONE] sign with getJwtSecret()
ecommerce-chat/socket/chat.socket.js [DONE] verify with getJwtSecret()
client/js/admin/modules/chat-admin.js [DONE] bearerAuthHeader from chat_admin_token; credentials on all fetch
package.json [DONE] npm run dev:chat via node --watch (no global nodemon)
backend/src/routes/viewRoutes.js [DONE] CHAT_ADMIN_DIST → backend/public/chat-admin (2026-09-08)
backend/src/middlewares/chatApiProxy.js [DONE] explicit /api/admin/customers/* + /api/admin/orders/* → :5001 (2026-09-08)
ecommerce-chat/routes/admin.routes.js [DONE] attachCustomerAvatarFields on room list + detail (2026-09-08)
backend/src/server.js [DONE] mountChatWebSocketProxy before store Socket.IO (2026-09-08)
backend/src/controllers/internalChatController.js [DONE] image/profilePic on chat CRM profile snapshot (2026-09-08)
ecommerce-chat/routes/admin.routes.js [DONE] normalized customer profile avatar/image fields (2026-09-08)
ecommerce-chat/controllers/chatAdminController.js [DONE] customer-profile avatar + image (2026-09-08)
admin-dashboard/src/services/api.js [DONE] customer CRM + orders via /api/chat-admin namespace (2026-09-08)
admin-dashboard/src/services/socket.js [DONE] local dev never uses production WS URL (2026-09-08)
admin-dashboard/src/utils/helpers.js [DONE] pickRoomCustomerAvatar includes user/customer nested fields (2026-09-08)
admin-dashboard/src/components/CustomerContext.jsx [DONE] customer avatar fallback chain user?.avatar (2026-09-08)
ecommerce-chat/models/StoreUser.model.js [NEW] read-only User populate for room user_id avatars
ecommerce-chat/utils/chatRoomHelpers.js [DONE] withCustomerUserPopulate + customerId avatar fields (2026-09-08)
backend/src/middlewares/chatApiProxy.js [DONE] proxy chat-admin /socket.io → /chat-socket/socket.io (2026-09-08)
admin-dashboard/src/services/socket.js [DONE] path /chat-socket/socket.io; chat_history handler (2026-09-08)
backend/src/services/socketService.js [DONE] reject chat-agent JWTs; superadmin accountRole (2026-09-08)
backend/src/middlewares/chatApiProxy.js [DONE] isLikelyChatAdminSocket JWT handshake detect (2026-09-08)
ecommerce-chat/services/agentResolver.service.js [DONE] superadmin/super_admin store JWT (2026-09-08)
ecommerce-chat/socket/chat.socket.js [DONE] admin join_room chat_history + avatar room (2026-09-08)
ecommerce-chat/utils/chatRoomHelpers.js [DONE] customer.user nested avatar fields (2026-09-08)
admin-dashboard/src/utils/helpers.js [DONE] pickRoomCustomerAvatar customer.user (2026-09-08)
admin-dashboard/src/components/ChatWindow.jsx [DONE] explicit customer avatar fallback chain (2026-09-08)
admin-dashboard/src/components/RoomListItem.jsx [DONE] explicit customer avatar fallback chain (2026-09-08)
admin-dashboard/src/components/CustomerContext.jsx [DONE] profilePic + user.image avatar fallbacks (2026-09-08)
ecommerce-chat/utils/adminSocketHub.js [NEW] admin_room fan-out across dual socket paths (2026-09-08)
ecommerce-chat/models/ChatRoom.model.js [DONE] user/customerId virtuals for avatar populate (2026-09-08)
ecommerce-chat/utils/chatRoomHelpers.js [DONE] populate user_id + user + customerId avatar fields (2026-09-08)
ecommerce-chat/server.js [DONE] dual Socket.io paths /chat-socket/socket.io + /socket.io (2026-09-08)
ecommerce-chat/socket/chat.socket.js [DONE] admin_room join + wireAdminBroadcast hub (2026-09-08)
backend/src/middlewares/chatApiProxy.js [DONE] chat-admin /socket.io proxy via X-Chat-Admin (2026-09-08)
admin-dashboard/src/store/chatStore.js [DONE] activeInboxTab + applyRealtimeMessage (2026-09-08)
admin-dashboard/src/services/socket.js [DONE] join_admin_room on connect (2026-09-08)
admin-dashboard/src/utils/helpers.js [DONE] pickCustomerAvatar canonical chain (2026-09-08)
admin-dashboard/src/components/RoomListItem.jsx [DONE] pickCustomerAvatar img + initials fallback (2026-09-08)
admin-dashboard/src/components/ChatWindow.jsx [DONE] pickCustomerAvatar header avatar (2026-09-08)
admin-dashboard/src/components/CustomerContext.jsx [DONE] pickCustomerAvatar CRM panel (2026-09-08)
admin-dashboard/src/pages/DashboardPage.jsx [DONE] activeInboxTab from chatStore (2026-09-08)
backend/public/chat-admin [DONE] rebuilt from admin-dashboard dist (2026-09-08)
ecommerce-chat/utils/adminSocketHub.js [DONE] broadcastAdminNewMessage always namespace-wide emit (2026-09-08)
ecommerce-chat/socket/chat.socket.js [DONE] customer message broadcastAdminNewMessage fan-out (2026-09-08)
admin-dashboard/src/services/socket.js [DONE] new_message/chat_message → applyRealtimeMessage logging (2026-09-08)
admin-dashboard/src/utils/helpers.js [DONE] pickCustomerAvatar customer_profile avatarUrl early (2026-09-08)
ecommerce-chat/socket/chat.socket.js [DONE] extractAdminSocketToken proxy-safe; loadEnv (2026-09-08)
ecommerce-chat/services/agentResolver.service.js [DONE] storeApi fallback + JWT-only agent link (2026-09-08)
ecommerce-chat/services/storeProfile.service.js [DONE] getMainStoreApiUrl fallback (2026-09-08)
admin-dashboard/src/utils/helpers.js [DONE] resolveRoomUserId for populated user_id (2026-09-08)
admin-dashboard/src/components/CustomerContext.jsx [DONE] resolveRoomUserId for CRM fetch (2026-09-08)
backend/src/middlewares/chatApiProxy.js [DONE] socket proxy pathname-only + X-Chat-Admin WS detect (2026-09-08 audit)
ecommerce-chat/socket/chat.socket.js [DONE] admin emit aliases chat_message/chat_updated/admin_message (2026-09-08 audit)
ecommerce-chat/routes/chat.routes.js [DONE] new_chat emit on room start (2026-09-08 audit)
admin-dashboard/src/services/socket.js [DONE] window.location.origin + alias listeners + new_chat (2026-09-08 audit)
admin-dashboard/src/store/chatStore.js [DONE] tab count adjust on socket room add (2026-09-08 audit)
admin-dashboard/src/components/Sidebar.jsx [DONE] filter inbox list by activeTab status (2026-09-08 audit)
admin-dashboard/src/components/RoomListItem.jsx [DONE] customerId avatar fallback (2026-09-08 audit)
admin-dashboard/src/components/ChatWindow.jsx [DONE] customerId avatar fallback (2026-09-08 audit)
admin-dashboard/vite.config.js [DONE] dev proxy /socket.io → chat /chat-socket/socket.io (2026-09-08)
backend/src/middlewares/chatApiProxy.js [DONE] WS head unshift fix; 120s socket polling proxy timeout (2026-09-08)
ecommerce-chat/utils/chatRoomHelpers.js [DONE] user/customer nested avatar on room payloads (2026-09-08)
ecommerce-chat/services/storeProfile.service.js [DONE] image/profilePic on buildSnapshotFromUser (2026-09-08)
admin-dashboard/src/pages/ProfilePage.jsx [DONE] merge avatar into authStore after upload (2026-09-08)
ecommerce-chat/routes/admin.routes.js [DONE] GET /api/admin/me/avatar (2026-09-08)
ecommerce-chat/config/loadEnv.js [DONE] MAIN_STORE_API_URL dev default http://127.0.0.1:5000 (2026-09-08)
ecommerce-chat/services/storeAdminSync.service.js [DONE] internal-only avatar sync (no proxy loop) (2026-09-08)
client/js/admin/modules/chat-admin.js [DONE] CRM fetch via /api/chat-admin/admin/customers (2026-09-08)
devops/nginx.conf [DONE] /api/chat-admin + /api/admin/me/avatar → :5001 (2026-09-08)
backend/src/server.js [DONE] skip express.json for multipart + chat proxy; upload socket timeout
devops/nginx.conf [DONE] /chat-admin/admin/ proxy fallback + client_max_body_size on chat-api
admin-dashboard/src/utils/helpers.js [DONE] resolveAssetUrl() for store avatar paths
ecommerce-chat/handlers/agentAvatarUpload.js [NEW] shared multer + Cloudinary handler for agent avatar
ecommerce-chat/models/Agent.model.js [DONE] avatar_public_id for Cloudinary cleanup
ecommerce-chat/services/upload.service.js [DONE] uploadAgentAvatar() for staff profile photos
ecommerce-chat/routes/upload.routes.js [DONE] POST /api/upload/agent-avatar (shared handler)
ecommerce-chat/models/CannedResponse.model.js     [NEW] canned response CRUD + seedDefaults
ecommerce-chat/controllers/chatAdminController.js [NEW] rating, attachments, notes, assign, labels, priority, analytics, customer profile
ecommerce-chat/utils/chatRoomHelpers.js           [NEW] last message preview, queue sync, label sync
ecommerce-chat/models/ChatRoom.model.js           [DONE] priority, source, labels, internal_notes, rating_feedback, queue metrics, unread_by_customer
ecommerce-chat/models/ChatMessage.model.js        [DONE] message_type, sender_avatar, read_by, order_card, is_internal
ecommerce-chat/routes/admin.routes.js             [DONE] analytics, canned CRUD, assign, labels, priority, customer-profile, notes
ecommerce-chat/routes/chat.routes.js              [DONE] POST rate + attachment; source on start
ecommerce-chat/socket/chat.socket.js              [DONE] mark_read, admin_mark_read, messages_read, customer_disconnected, first response tracking
ecommerce-chat/services/agentResolver.service.js [NEW] resolve chat/store-admin JWT → Agent; auto-create + adminId link
ecommerce-chat/models/Agent.model.js [DONE] adminId + storeAdminUsername for main-store admin sync
ecommerce-chat/middleware/auth.middleware.js [DONE] async resolveAgentFromRequest after JWT verify
ecommerce-chat/socket/chat.socket.js [DONE] socket admin auth uses agentResolver
ecommerce-chat/scripts/linkAgentsToAdmins.js [NEW] one-time adminId backfill migration
backend/src/middlewares/rbac.js [DONE] req.adminId on attachAdminAccount
backend/src/routes/adminRoutes.js [DONE] GET|PUT /api/admin/me/avatar for chat-admin compatibility
admin-dashboard/src/services/api.js [DONE] chat_admin_token only — no store adminToken fallback

## HTML Files
client/admin.html                    [DONE] removed — assembled by backend/src/utils/adminPageBuilder.js
client/profile.html                  [DONE] thin shell — assembled with profile/partials by backend/src/utils/profilePageBuilder.js
client/admin-login.html              [DONE] kept as single page
client/partials/shared-header.html   [DONE] injected into pages with a search header (about/contact/CMS simplified headers left as-is)
client/partials/shared-footer.html   [DONE] injected via backend/src/utils/injectSharedPartials.js
client/partials/shared-whatsapp.html [DONE]

## CSS Files
client/css/admin.css                 [DONE] barrel → css/admin/_*.css
client/css/admin/_settings.css       [DONE] barrel → _settings-{branding,security,payments,system,footer}.css
client/css/admin/_products.css       [DONE] barrel → _products-{form,variants,catalog,navbar,coupons,categories}.css
client/css/profile.css               [DONE] barrel → css/profile/_*.css
client/css/style.css                 [DONE] barrel → css/global/_*.css

## JS Files — Admin
client/js/admin/admin-main.js        [DONE] entry barrel
client/js/admin/admin-core.js        [DONE] barrel → modules/core-*.js
client/js/admin/admin-products.js    [DONE] barrel → modules/products-*.js + catalog-*.js
client/js/admin/admin-orders.js      [DONE] barrel → modules/orders-*.js
client/js/admin/admin-customers.js   [DONE] barrel → modules/customers-*.js + messages-inbox.js
client/js/admin/admin-chat.js        [DONE] barrel → modules/chat-admin.js (legacy admin live chat)
client/js/admin/admin-settings.js    [DONE] barrel → modules/settings-*.js
client/js/admin/admin-dashboard.js   [DONE] analytics module
client/js/admin-banner.js            [DONE] kept as single file

## JS Files — Storefront
client/js/chat-widget.js               [DONE] premium FAB live chat widget for storefront
client/js/orderChat.js                 [DONE] chat launcher; prefers same-origin /js/chat-widget.js
client/css/global/_chat-widget.css     [DONE] storefront chat widget styles
client/css/chat-widget.css             [DONE] CSS barrel for chat widget
client/partials/shared-chat-widget.html [DONE] shared script include for storefront pages
client/js/profile.js                 [DONE] barrel → js/profile/{tabs,orders,reviews,wallet,notes,wishlist,addresses,security,account}.js
client/js/profile/orders.js          [DONE] compact expandable order cards
client/js/profile/notes.js           [DONE] Notes & Expenses premium notebook module
client/css/profile/_notes.css        [DONE] Notes module styles
client/css/profile/_orders.css       [DONE] compact expandable My Orders cards
client/js/product-details.js         [DONE] barrel → js/pdp/{fetch-render,variants,reviews,qty-cart,gallery}.js
client/js/checkout.js                [DONE] barrel → js/checkout/{state,render,validation,actions,submit}.js

## Backend Controllers
backend/src/controllers/adminSecurityController.js  [DONE] barrel → controllers/admin/{auth,session,blacklist,loginHistory}Controller.js
backend/src/controllers/adminController.js          [DONE] barrel → controllers/admin/{customerAdmin,adminProfile,adminSettings}Controller.js
backend/src/controllers/authController.js           [DONE] barrel → controllers/auth/{register,login,password,oauth}Controller.js + authHelpers.js
backend/src/controllers/auth/loginController.js     [DONE] login + sessions + DELETE account (Play in-app deletion)
backend/src/controllers/noteController.js           [DONE] private notebook CRUD (note/expense/income/shopping)
backend/src/models/note.js                          [DONE] Note schema (user-scoped, tags, pin, color)
backend/src/controllers/orderCheckoutController.js  [DONE] mock catalog ids (p1…) + COD fallback for mobile Place order
backend/src/controllers/orderCustomerController.js  [DONE] POST cancel + PUT cancel + return + per-item return/items
backend/src/controllers/orderAdminController.js    [DONE] approve-return, reject-return, processRefund, undo-refund, status notifications
backend/src/services/mailer.js                     [DONE] sendReturnStatusEmail, sendOrderShippedEmail
backend/src/jobs/reviewReminderJob.js            [DONE] daily review reminder SMS cron
backend/src/services/walletService.js              [DONE] credit/debit + debitWalletForAdmin
backend/src/services/notificationService.js        [NEW] admin socket notifications (return_request)
backend/src/controllers/admin/walletAdminController.js [NEW] POST manual wallet credit/debit
backend/src/controllers/reviewAdminController.js   [NEW] list/moderate/delete reviews (admin)
backend/src/controllers/reviewController.js      [DONE] syncProductRating, deleteOwnReview, hide filter on GET
backend/src/models/order.js                        [DONE] returnItems, refundMethod, notification flags
backend/src/models/review.js                       [DONE] isHidden, adminNote, moderatedAt
backend/src/services/mailer.js                     [DONE] sendReturnStatusEmail
backend/src/controllers/productSeedController.js    [DONE] GET/POST /api/products/seed-demo
backend/src/services/productSeedService.js          [DONE] upsert DEMO-* products + categories
backend/src/data/demoProducts.js                    [DONE] 8 demo products (title, price, category, image)
scripts/seedDemoProducts.js                          [DONE] CLI — npm run seed:products
tests/product-seed.test.js                           [DONE] seed-demo route upserts catalog

## Folder Structure
backend/src/controllers/admin/
  authController.js
  sessionController.js
  blacklistController.js
  loginHistoryController.js
  customerAdminController.js
  adminProfileController.js
  adminSettingsController.js
backend/src/controllers/auth/
  authHelpers.js
  registerController.js
  loginController.js
  passwordController.js
  oauthController.js
client/js/profile/
  tabs.js
  orders.js
  reviews.js
  wallet.js
  notes.js
  wishlist.js
  addresses.js
  security.js
  account.js
client/js/pdp/
  fetch-render.js
  variants.js
  reviews.js
  qty-cart.js
  gallery.js
client/js/checkout/
  state.js
  render.js
  validation.js
  actions.js
  submit.js
client/admin/partials/
  head.html
  body-open.html
  sidebar.html
  header.html
  view-overview.html
  view-customers.html
  view-orders.html
  view-catalog.html
  view-products.html
  view-security.html
  view-shipping-payments.html
  view-loyalty-program.html
  view-store-config.html
  view-banners.html
  view-messages.html
  view-file-manager.html
  view-staff.html
  view-settings.html
  modals-products.html
  modals-customers.html
  modals-orders.html
  modals-catalog.html
  modals-cms.html
  modals-payments.html
  modals-invoice.html
  scripts.html
client/css/admin/
  _tokens.css
  _layout.css
  _tables.css
  _modals.css
  _products.css
  _products-form.css
  _products-variants.css
  _products-catalog.css
  _products-navbar.css
  _products-coupons.css
  _products-categories.css
  _orders.css
  _customers.css
  _settings.css
  _settings-branding.css
  _settings-security.css
  _settings-payments.css
  _settings-system.css
  _settings-footer.css
  _staff.css
  _banners.css
  _file-manager.css
  _cms.css
  _notifications.css
  _print.css
  _responsive.css
client/js/admin/modules/
  core-state.js
  core-auth.js
  core-helpers.js
  core-toasts.js
  core-realtime.js
  core-nav.js
  core-boot.js
  products-form.js
  products-variants.js
  products-table.js
  products-bulk.js
  products-ai.js
  catalog-helpers.js
  catalog-categories.js
  catalog-brands.js
  catalog-navbar.js
  catalog-coupons.js
  catalog-attributes.js
  orders-table.js
  orders-actions.js
  orders-invoice.js
  orders-editor.js
  orders-pos.js
  customers-table.js
  customers-modals.js
  messages-inbox.js
  chat-admin.js           [DONE] legacy admin 3-column live chat (ecommerce-chat API + socket)
  settings-security.js
  settings-platform.js
  settings-payments.js
  settings-footer.js
  settings-cms.js
  settings-2fa.js
  settings-reviews.js     [DONE] admin review moderation UI
client/admin/partials/
  view-chat.html          [DONE] 3-column live chat workspace + agent login gate
  view-chat-analytics.html [DONE] chat volume, stats, labels analytics
  view-canned-responses.html [DONE] canned / quick reply CRUD UI
  view-reviews.html       [DONE] reviews moderation section
client/css/admin/
  _chat.css               [DONE] live chat workspace styles
  _reviews.css            [DONE] reviews moderation styles
  _layout.css
  _orders.css
  _wishlist.css
  _wallet.css
  _notes.css
  _forms.css
  _modals.css
  _responsive.css
client/css/global/
  _tokens.css
  _header.css
  _subnav.css
  _footer-base.css
  _pwa.css
  _responsive.css
client/profile/partials/
  head.html
  header.html
  body-open.html
  sidebar.html
  tab-overview.html
  tab-orders.html
  tab-wishlist.html
  tab-wallet.html
  tab-notes.html
  tab-addresses.html
  tab-settings.html
  tab-security.html
  modals.html
  scripts.html
client/partials/
  shared-header.html
  shared-footer.html
  shared-whatsapp.html

## Mobile App (Expo / React Native)
mobile/App.js                            [DONE] static navTheme + stack options; DistrictModalHost wraps nav + ToastBanner
mobile/src/services/api.js               [DONE] Axios /api + SecureStore JWT helpers with timeouts; 401 skip during login/hydrate sync
mobile/app.json                          [DONE] scheme eonlinebazar; splash + expo-secure-store; updates disabled (NEVER)
mobile/eas.json                          [DONE] preview: internal APK; production AAB; build channels
mobile/package.json                      [DONE] Expo 54 + expo-secure-store ~15.0.8 + expo-updates ~29.0.20
mobile/metro.config.js                   [DONE] default Expo Metro (Hermes-safe)
mobile/index.js                          [DONE] gesture-handler → splash → startup guards → registerRootComponent
mobile/src/startup.js                    [DONE] OTA guards; dev-silent probe when updates disabled in app.json
mobile/src/splash.js                     [DONE] preventAutoHideAsync before App.js imports
mobile/src/components/ErrorBoundary.js   [DONE] launch/render error fallback; OTA fetch message + hide splash
mobile/src/services/api.js               [DONE] default API https://eonlinebazar.com/api (DigitalOcean live)
mobile/src/data/bdLocations.js            [DONE] 64 districts (BBS ids) + cascading upazilas
mobile/src/components/DistrictUpazilaPicker.js [DONE] searchable district → upazila; modal portaled outside ScrollView/KAV
mobile/src/components/AddressForm.js      [DONE] address fields + DistrictUpazilaPicker
mobile/src/components/auth/AuthTextInput.js [DONE] keyboardType falls back to default; password/email/phone autoCapitalize none
mobile/src/components/auth/OtpInput.js    [DONE] auto-focus 6-digit OTP boxes
mobile/src/components/auth/AuthChrome.js  [DONE] trust badges, orange CTA, error/success banners
mobile/src/components/auth/AuthTextInput.js [DONE] fixed-height wrapper; no focus shadow jitter; Android textAlignVertical
mobile/src/screens/LoginScreen.js        [DONE] Premium redesign; ScrollView keyboard guards; Android KAV off
mobile/src/screens/RegisterScreen.js      [DONE] isRegistering spinner; district modal host; name fields keyboardType default
mobile/src/screens/ForgotPasswordScreen.js [DONE] OTP boxes + password reset with toasts
mobile/src/screens/AddressesScreen.js     [DONE] customer address CRUD + cascading location picker
mobile/src/screens/CartScreen.js         [DONE] Item checkboxes, select all, selected-only totals + checkout gate
mobile/src/screens/CheckoutScreen.js      [DONE] Saved-address radio cards; web-matched shipping form + save-to-profile
mobile/src/store/useOrderStore.js        [DONE] saveAddressToProfile/saveAddressAsDefault on createOrder payload
mobile/src/screens/ChangePasswordScreen.js [DONE] AuthTextInput eye toggle + error toasts
mobile/src/screens/CartScreen.js         [DONE] Clickable images + variant display
mobile/src/screens/OrdersScreen.js       [DONE] silent refetch on refocus; memo OrderCard; one list tree
mobile/src/screens/OrderDetailsScreen.js [DONE] Clickable images
mobile/src/screens/ProfileScreen.js      [DONE] Full mobile + phone badge; avatar upload; premium menu hub
mobile/src/screens/EditProfileScreen.js  [DONE] Scrollable edit form — gender radio modal, FieldBadge pills, custom DOB modal, sticky Update Profile footer
mobile/src/screens/SecuritySettingsScreen.js [DONE] Email & phone OTP verification card (store OTP flow) before active sessions list
mobile/src/components/profile/ProfileAvatar.js [DONE] centerWrap alignSelf center for avatar block
mobile/src/store/useAuthStore.js         [DONE] toPublicUser + updateProfile gender/dateOfBirth/district/upazila/thana/fullAddress
mobile/src/components/profile/ProfileEditSheet.js [NEW] Spring bottom sheet — name save + email/phone OTP verify in-sheet
mobile/src/screens/SecuritySettingsScreen.js [NEW] Active sessions + logout devices
mobile/src/screens/WalletScreen.js       [NEW] Balance, transactions, convert points
mobile/src/screens/LoyaltyPointsScreen.js [NEW] Points balance + activity + wallet link
mobile/src/screens/NotebookScreen.js     [DONE] Premium notebook — summary cards, filters, expense CRUD
mobile/src/screens/LiveSupportScreen.js  [DONE] Root KeyboardAvoidingView; FAQ hides on keyboard; confirm modal
mobile/src/components/support/AriaChatPanel.js [DONE] forwardRef endChat; header action callbacks
mobile/src/components/support/ChatEndConfirmModal.js [NEW] SweetAlert-style close/minimize confirmation
mobile/src/navigation/AppNavigator.js    [DONE] Profile tab avatar/initials with active ring highlight
mobile/src/screens/HomeScreen.js         [DONE] Clean logo-only header; thick embedded-icon search
mobile/src/components/ProductGrid.js     [DONE] Premium search pill — magnifier embedded on right end
mobile/src/api/chat.js                   [NEW] POST /chat/start REST helper
mobile/src/config/chatConfig.js          [NEW] Chat API/socket URLs + Aria quick replies
mobile/src/screens/OrderSuccessScreen.js [NEW] Guest order success
mobile/src/components/profile/ProfileAvatar.js [DONE] Editable avatar + camera badge + resolveMediaUrl
mobile/src/api/profile.js                [NEW] Avatar upload, OTP, sessions, convert points
mobile/src/api/notes.js                  [NEW] Notebook CRUD helpers
mobile/src/utils/maskContact.js          [DONE] formatDisplayPhone + heroContactLine for profile header
mobile/src/theme/profileModuleTokens.js  [NEW] Shared light/dark tokens for profile sub-screens
mobile/src/utils/supportLinks.js         [NEW] WhatsApp URL builder + support FAQ content
mobile/src/components/profile/ActionCard.js [DONE] icon + title + subtitle action cards
mobile/src/components/profile/LogoutConfirmModal.js [DONE] animated Cancel / Yes, Sign Out modal
mobile/src/screens/WishlistScreen.js     [DONE] saved products from useWishlistStore
mobile/src/screens/DeleteAccountScreen.js [DONE] password eye toggle + toast and Alert on failure
mobile/src/screens/LegalScreen.js        [DONE] WebView CMS pages (privacy, terms, contact, return)
mobile/src/navigation/AppNavigator.js    [DONE] static tab options; Profile headerShown false; Shop tabPress only clears real params
mobile/src/screens/HomeScreen.js         [DONE] Header avatar/login + premium search bar
mobile/src/screens/ShopScreen.js         [DONE] memo ShopScreen; ProductGrid stays mounted across tab taps
mobile/src/components/ProductGrid.js     [DONE] Variant guard on add to cart
mobile/src/api/search.js                 [DONE] /products/search, /categories/navbar, /categories/homepage, /store/banners, /store/flash-sale
mobile/src/components/StarRating.js      [NEW] Half-star product rating row for cards + PDP
mobile/src/components/CategoryGrid.js    [NEW] Homepage circular category icons — GET /categories/homepage
mobile/src/components/OrderStatusTimeline.js [NEW] Order tracking steps (web orderStatusTimeline.js parity)
mobile/src/store/useLanguageStore.js     [NEW] EN/BN language preference + AsyncStorage hydrate
mobile/src/i18n/translations.js          [DONE] Full EN/BN string table — tabs, screens, profile, cart, orders, legal
mobile/src/i18n/legalWebView.js          [NEW] Legal WebView embed URL + injected CSS for mobile chrome strip
mobile/src/i18n/profileMenu.js           [NEW] Profile menu sections with i18n titleKey for Legal routes
mobile/src/store/useLanguageStore.js       [DONE] AsyncStorage persist; reactive useTranslation hook
client/partials/info-page-header.html    [NEW] Logo-only header for CMS/info pages (no EN/cart/profile)
client/css/global/_mobile-embed.css      [NEW] Hide web chrome when ?embed=mobile (Expo WebView)
client/js/mobile-embed.js                [NEW] Mobile embed bootstrap + lang sync for info pages
client/cms-page.html                     [DONE] Logo-only header; mobile-embed + i18n scripts
client/about.html                        [DONE] Logo-only header; mobile-embed + i18n scripts
client/contact.html                      [DONE] Logo-only header; mobile-embed + i18n scripts
mobile/src/components/ProductGrid.js     [DONE] Star ratings, stock badges, discount %, premium search borderRadius 16
mobile/src/screens/HomeScreen.js         [DONE] Header avatar/login + CategoryGrid in hero
mobile/src/screens/OrderDetailsScreen.js [DONE] OrderStatusTimeline; review CTA per item; courier track; return modal; discount row
mobile/src/api/orders.js                 [NEW] POST /orders/:id/return helper
mobile/src/utils/courierTracking.js      [NEW] courierProvider + trackingId URL builder
mobile/src/store/useOrderStore.js        [DONE] requestReturn action
mobile/src/api/endpoints.js              [DONE] orderReturn route
mobile/src/components/ReviewsSection.js  [DONE] autoOpenReview prop opens write modal
mobile/src/screens/ProductDetailsScreen.js [DONE] autoOpenReview scroll + ReviewsSection hook
mobile/src/screens/ProfileScreen.js      [DONE] Language switcher (logged-in + guest preferences)
mobile/App.js                            [DONE] hydrate useLanguageStore on boot
AUDIT_REPORT.md                          [NEW] Full mobile audit summary (2026-09-04)
mobile/src/screens/ProductDetailsScreen.js [DONE] gallery, variants, stock, cart/buy now + reviews
mobile/src/data/products.js              [REMOVED] dummy catalog deleted; shop uses GET /products/search
mobile/src/utils/normalizeProduct.js     [DONE] images + variants/colors/sizes/stock kept for PDP
mobile/src/theme/palettes.js             [DONE] legacy nav/tab palette (App.js navigation chrome)
mobile/src/theme/tokens.js               [NEW] unified design system — spacing, radius, fontSize, fontWeight, shadow, lightTheme/darkTheme, useTheme()
mobile/src/components/AppStatusBar.js    [NEW] theme-aware StatusBar for all screens
mobile/src/api/endpoints.js              [DONE] payment methods, initiate, payment-proof, coupons active-check routes
mobile/src/store/useCartStore.js         [DONE] selected flag per line; toggleItemSelection/toggleSelectAll; selected totals
mobile/src/api/cart.js                   [DONE] PUT /cart/toggle-selection for logged-in selection sync
mobile/src/api/wishlist.js               [DONE] GET /customer/wishlist, POST /wishlist/toggle, DELETE /customer/wishlist/:id
mobile/src/api/store.js                  [DONE] GET /store/districts + GET /store/shipping-quote
mobile/src/api/reviews.js                [DONE] GET /reviews/:productId + POST /reviews
mobile/src/api/addresses.js              [DONE] GET/POST/PUT/DELETE /customer/addresses
mobile/src/api/coupons.js                [DONE] GET /coupons/active-check + POST /coupons/apply
mobile/src/api/payments.js               [NEW] GET /payments/methods; POST /payments/initiate; PATCH payment-proof
mobile/src/services/api.js               [DONE] default API https://eonlinebazar.com/api (DigitalOcean live)
mobile/src/components/                   [DONE] ScreenHeader, ProductGrid, ToastBanner, HeartButton, ErrorBoundary, ReviewsSection, DistrictUpazilaPicker, AddressForm, auth/*, profile/*
mobile/src/components/SkeletonBox.js        [NEW] SkeletonBox, ProductCardSkeleton, OrderCardSkeleton, BannerSkeleton, ProductSkeletonGrid
mobile/src/components/EmptyState.js         [NEW] Typed empty/error/network states with CTA
mobile/src/components/ProductGrid.js         [DONE] ProductSkeletonGrid loading; EmptyState for search/error/retry
mobile/src/screens/HomeScreen.js           [DONE] BannerSkeleton; hero network EmptyState; skeletonCount 6
mobile/src/screens/ShopScreen.js             [DONE] skeletonCount 8; error EmptyState via ProductGrid
mobile/src/screens/OrdersScreen.js           [DONE] OrderCardSkeleton loading; orders/error EmptyState; stacked thumbs; 5-step tracker; activeStep read-only fix
mobile/src/screens/WishlistScreen.js       [DONE] wishlist EmptyState
mobile/src/screens/CartScreen.js             [DONE] cart EmptyState
mobile/src/screens/AddressesScreen.js      [DONE] OrderCardSkeleton loading; addresses EmptyState
mobile/src/components/index.js               [DONE] export Skeleton + EmptyState barrels
mobile/src/components/ReviewsSection.js  [DONE] GET /reviews/:productId + verified-purchase write modal
mobile/src/store/                        [DONE] Zustand cart + auth + order + toast + wishlist + theme + products
mobile/src/store/useAuthStore.js         [DONE] walletHistory/rewardSettings, uploadAvatar, OTP, convertPoints, refreshProfile
mobile/App.js                            [DONE] Stack routes: EditProfile, SecuritySettings, Wallet, LoyaltyPoints, Notebook, LiveSupport
mobile/src/store/useOrderStore.js        [DONE] createOrder, fetchOrderHistory, fetchOrderById, PUT cancel
mobile/src/store/useToastStore.js        [DONE] showToast/hideToast banners
mobile/src/store/useWishlistStore.js     [DONE] persist + loadFromServer/syncToServer; toggle hits /wishlist/toggle
mobile/src/store/useThemeStore.js        [DONE] light/dark mode; hydrate() called from App.js useEffect
mobile/src/store/useProductStore.js      [DONE] live catalog from GET /api/products
mobile/src/navigation/AppNavigator.js    [DONE] ProfileTabIcon — destructure `color` prop + safe icon/accent fallbacks on logout
mobile/src/components/ErrorBoundary.js   [DONE] componentDidCatch — optional chaining on error/info before logging
mobile/src/screens/HomeScreen.js         [DONE] Logo-only header (cart/profile icons removed from top bar)
mobile/src/screens/ProfileScreen.js      [DONE] Orders/Wishlist stat boxes only — removed duplicate menu rows from SHOPPING section
mobile/src/screens/LiveSupportScreen.js  [DONE] WhatsApp deep-link via GET /store/branding publicSupportWhatsApp + canOpenURL guard
mobile/src/components/support/AriaChatPanel.js [DONE] Aria header avatar — app icon image with emoji fallback
mobile/src/api/store.js                  [DONE] GET /store/branding + extractSupportWhatsApp helper
mobile/src/utils/supportLinks.js         [DONE] Guest help message "I have a query." + buildProductOrderWhatsAppUrl
mobile/src/hooks/useSupportWhatsApp.js   [NEW] Fetch GET /store/branding publicSupportWhatsApp for screens
mobile/src/screens/ProductDetailsScreen.js [DONE] Order via WhatsApp sticky action — dynamic product title + price
mobile/src/screens/ProfileScreen.js      [DONE] Premium guest hub — shield hero, auth CTAs, WhatsApp support quick row
mobile/src/screens/HomeScreen.js         [DONE] Minimal logo-only header — WhatsApp icon removed from home top bar
client/js/whatsapp.js                    [DONE] Guest query message; product order URLs; floating/auth links only
client/partials/shared-header.html       [DONE] Minimal header — nav WhatsApp icon removed
client/css/global/_header.css            [DONE] Removed .nav-whatsapp-btn (header cleanup)
client/product-details.html              [DONE] Order via WhatsApp button + store-branding/whatsapp scripts
client/css/product-details.css           [DONE] .btn-order-whatsapp full-width green action
client/js/pdp/qty-cart.js                [DONE] setupOrderWhatsAppButton — dynamic product order deep link
client/js/product-details.js             [DONE] wires setupOrderWhatsAppButton on DOMContentLoaded
client/login.html                        [DONE] Guest auth — Need Help? Chat on WhatsApp support card
client/register.html                     [DONE] Guest auth — Need Help? Chat on WhatsApp support card
client/css/auth.css                      [DONE] .auth-whatsapp-support card styles
#
# Phase 2 Audit fixes — mobile env + finance embed: 2026-09-10
mobile/.env.example [NEW] EXPO_PUBLIC_API_URL, EXPO_PUBLIC_CHAT_URL, EXPO_PUBLIC_APP_ENV (renamed from env.example)
mobile/.gitignore [DONE] .env gitignored for local secrets
mobile/src/services/api.js [DONE] BASE_URL from EXPO_PUBLIC_API_URL with production fallback
mobile/src/config/chatConfig.js [DONE] CHAT_URL from EXPO_PUBLIC_CHAT_URL with production fallback
client/admin/partials/view-finance.html [DONE] Open Finance Dashboard CTA + iframe embed
client/js/admin/modules/view-finance.js [NEW] iframe load spinner + auth fallback
client/js/admin/modules/core-nav.js [DONE] view-finance calls initFinanceEmbed
client/admin/partials/scripts.html [DONE] loads view-finance.js module
client/css/admin/_layout.css [DONE] finance iframe wrap, spinner, fallback styles
ARCHITECTURE.md [DONE] mobile .env gitignore note
#
# Phase 5 HRM — Attendance, Payroll, Leave: 2026-09-11
# Models
backend/src/models/attendance.js [NEW] one row per staff per day; normalizeDate/parseShiftMinutes statics, hoursWorked hook
backend/src/models/shift.js [NEW] named working windows + grace period + assignedStaff usernames
backend/src/models/payroll.js [NEW] monthly salary run; unique {staffId,year,month}; computeTotalSalary pro-rating hook
backend/src/models/leave.js [NEW] leave applications + LEAVE_ALLOWANCES + countLeaveDays hook
backend/src/models/admin.js [DONE] baseSalary, department, joiningDate, employeeId (+ toSafeObject)
backend/src/models/securityLog.js [DONE] attendance/shift/payroll/leave resourceTypes
# Controllers / utils
backend/src/controllers/admin/attendanceController.js [NEW] register, mark, clock-in/out, summary, late report, shift CRUD
backend/src/controllers/admin/payrollController.js [NEW] generate from attendance, list+rollup, approve, markPaid, payslip, salary-config
backend/src/controllers/admin/leaveController.js [NEW] apply, list, approve (stamps holiday attendance), reject, balance, calendar
backend/src/utils/paySlipPdf.js [NEW] PDFKit pay slip buffer (invoicePdf.js layout language)
backend/src/controllers/admin/enterpriseSummaryController.js [DONE] HRM attendance/leave/payroll KPIs
backend/src/controllers/staffController.js [DONE] getStaffRoster returns employment record for manage_staff holders
# Routes / config
backend/src/routes/adminRoutes.js [DONE] /api/admin/hrm/* attendance, shifts, payroll, leaves, staff roster
backend/src/config/permissions.js [DONE] view-hrm-attendance/payroll/leaves → manage_staff
backend/src/utils/adminPageBuilder.js [DONE] registers the 3 HRM view partials
# Frontend
client/admin/partials/view-hrm-attendance.html [NEW] KPI row, register/shifts/late tabs, mark + shift modals
client/admin/partials/view-hrm-payroll.html [NEW] payroll ledger, generate + salary config modals, payable summary
client/admin/partials/view-hrm-leaves.html [NEW] pending/all/calendar tabs, balances, apply leave modal
client/js/admin/modules/hrm-attendance.js [NEW] register + shift CRUD + late report; owns the shared window.hrm* helpers
client/js/admin/modules/hrm-payroll.js [NEW] ledger, generate, approve/pay, blob PDF pay slip, salary config
client/js/admin/modules/hrm-leaves.js [NEW] approvals, history, balances, month calendar render
client/js/admin/admin-settings.js [DONE] imports the 3 hrm-*.js modules
client/js/admin/modules/core-nav.js [DONE] view-hrm-* section loaders
client/js/admin/modules/core-state.js [DONE] ADMIN_PAGE_META for the 3 HRM sections
client/js/admin/modules/core-breadcrumb.js [DONE] BREADCRUMB_MAP HRM entries
client/js/admin/admin-dashboard.js [DONE] HRM widget attendance/leave/payroll lines
client/admin/partials/sidebar.html [DONE] HRM accordion — Attendance & Shifts, Payroll & Salary, Leave Management
client/admin/partials/view-overview.html [DONE] HRM widget rows for attendance, leaves, payroll
client/css/admin/_hrm.css [NEW] HRM tabs, filter bar, balance cards, leave calendar grid
client/css/admin.css [DONE] imports _hrm.css
# Tests / docs
tests/hrm.test.js [NEW] 26 tests — attendance, clock-in/out, shifts, payroll workflow + PDF, leave workflow, summary
SYSTEM_ENTERPRISE_AUDIT.md [DONE] HRM attendance + payroll marked complete
ARCHITECTURE.md [DONE] HRM models, nav group, feature matrix
#
# Phase CRM — Customer Loyalty Tier system: 2026-09-11
backend/src/models/user.js [DONE] loyaltyTier, tierUpgradedAt, lifetimeSpend, tierCashbackRate
backend/src/models/Setting.js [DONE] enableTieredLoyalty + silver/gold/platinum thresholds and cashback rates
backend/src/services/loyaltyTierService.js [NEW] calculateTier, upgradeTierIfNeeded, getTierCashbackRate
backend/src/services/walletService.js [DONE] resolveOrderCashbackRate for tier-aware delivery cashback
backend/src/utils/rewardSettings.js [DONE] creditOrderDeliveryRewards uses tier cashback rate
backend/src/jobs/loyaltyTierJob.js [NEW] monthly tier recalculation cron (1st @ 3am)
backend/src/server.js [DONE] bootstrap loyaltyTierJob
backend/src/controllers/orderAdminController.js [DONE] upgradeTierIfNeeded after delivery
backend/src/services/courierSyncService.js [DONE] upgradeTierIfNeeded on courier-delivered orders
backend/src/controllers/masterSettingsController.js [DONE] tier settings read/write in unified payload
backend/src/controllers/admin/enterpriseSummaryController.js [DONE] silverCount, goldCount, platinumCount
backend/src/controllers/admin/customerAdminController.js [DONE] tier filter + tier detail fields
backend/src/controllers/userProfileController.js [DONE] loyaltyTier, lifetimeSpend, tierCashbackRate, tierSettings in profile
backend/src/services/mailer.js [DONE] sendTierUpgradeEmail
client/admin/partials/view-loyalty-program.html [DONE] Customer Loyalty Tiers card + preview table
client/js/admin/modules/settings-loyalty.js [NEW] loadTierSettings, saveTierSettings, tier preview
client/js/admin/admin-settings.js [DONE] imports settings-loyalty.js
client/js/admin/modules/settings-platform.js [DONE] applyTierSettingsToUI hook
client/admin/partials/view-customers.html [DONE] Tier column + tier filter dropdown
client/admin/partials/modals-customers.html [DONE] tier info in customer detail modal
client/js/admin/modules/customers-table.js [DONE] tier badge column render
client/js/admin/modules/customers-modals.js [DONE] tier fields in viewCustomerDetails
client/js/admin/modules/core-nav.js [DONE] customerTierFilter query + change handler
client/js/admin/modules/core-state.js [DONE] customerTierFilter shared state
client/admin/partials/view-overview.html [DONE] CRM widget silver/gold/platinum counts
client/js/admin/admin-dashboard.js [DONE] enterprise summary tier stats render
client/css/admin/_settings-system.css [DONE] tier preview table + badge styles
client/css/admin/_modals.css [DONE] customers-tier-filter + tier badge reuse
mobile/src/screens/ProfileScreen.js [DONE] tier badge + progress to next tier
mobile/src/screens/WalletScreen.js [DONE] tier cashback rate display
tests/loyalty-tier.test.js [NEW] tier calculation unit tests
SYSTEM_ENTERPRISE_AUDIT.md [DONE] CRM loyalty tiers + segmentation marked complete
#
# Final System Audit fixes — 2026-09-11
backend/src/models/employee.js [NEW] non-login operational staff (EMP-001 auto ids)
backend/src/models/attendance.js [DONE] staffType enum admin|employee
backend/src/models/payroll.js [DONE] staffType enum admin|employee
backend/src/models/leave.js [DONE] staffType enum admin|employee
backend/src/utils/hrmStaffResolver.js [NEW] unified Admin + Employee resolver for HRM
backend/src/controllers/admin/employeeController.js [NEW] CRUD + stats for /api/admin/hrm/employees
backend/src/routes/adminRoutes.js [DONE] employee routes under /hrm/employees
backend/src/routes/categoryRoutes.js [DONE] manage_catalog on admin GET list/detail
backend/src/routes/bannerRoutes.js [DONE] manage_catalog on admin GET list
backend/src/controllers/admin/attendanceController.js [DONE] employee attendance via staffType
backend/src/controllers/admin/payrollController.js [DONE] employee payroll via staffType
backend/src/utils/adminPageBuilder.js [DONE] view-hrm-employees partial
backend/src/config/permissions.js [DONE] view-hrm-employees → manage_staff
client/admin/partials/view-hrm-employees.html [NEW] employee roster + modals
client/admin/partials/view-finance.html [DONE] removed duplicate finance iframe embed
client/admin/partials/sidebar.html [DONE] Employees link above Attendance & Shifts
client/js/admin/modules/hrm-employees.js [NEW] employee CRUD UI + attendance shortcut
client/js/admin/modules/hrm-attendance.js [DONE] grouped staff/employee optgroups
client/js/admin/modules/hrm-payroll.js [DONE] grouped staff selector for generate payroll
client/js/admin/admin-settings.js [DONE] imports hrm-employees.js
client/js/admin/modules/core-nav.js [DONE] view-hrm-employees refreshMap
client/js/admin/modules/core-state.js [DONE] ADMIN_PAGE_META for Employees
mobile/.env.example [DONE] LAN IP dev comments
ARCHITECTURE.md [DONE] Employee model + Local Development Setup (Mobile)
SYSTEM_ENTERPRISE_AUDIT.md [DONE] Final audit priority fixes marked complete
tests/hrm.test.js [DONE] +2 employee CRUD + attendance tests
#
# Ultra-dynamic Employee module — 2026-09-11
backend/src/models/designation.js [NEW] job title catalog (name, department, isActive)
backend/src/models/employee.js [DONE] identity, contact, employment, salary/bank, documents[], references[], designation sync
backend/src/models/securityLog.js [DONE] employee + designation resourceTypes
backend/src/services/designationService.js [NEW] seedDefaultDesignations (8 starter titles)
backend/src/controllers/admin/designationController.js [NEW] CRUD + employee-count guard on delete
backend/src/controllers/admin/employeeController.js [DONE] photo/doc upload, getEmployeeProfile, enhanced stats/filters
backend/src/controllers/admin/enterpriseSummaryController.js [DONE] hrm.employeeCount
backend/src/controllers/admin/payrollController.js [DONE] designation column on payroll list for employees
backend/src/middlewares/uploadMiddleware.js [DONE] employeePhotoUpload + employeeDocumentUpload (image/PDF)
backend/src/routes/adminRoutes.js [DONE] /hrm/designations + employee photo/documents/profile routes
backend/src/server.js [DONE] seedDefaultDesignations bootstrap
client/admin/partials/view-hrm-employees.html [DONE] stats, filters, tabbed add/edit, profile, docs, designation manager
client/admin/partials/view-hrm-payroll.html [DONE] designation column in payroll table
client/admin/partials/view-overview.html [DONE] HRM widget employees count row
client/js/admin/modules/hrm-employees.js [DONE] full ultra-dynamic UI — profile tabs, designation CRUD, doc upload
client/js/admin/modules/hrm-attendance.js [DONE] designation label in operational employee dropdown
client/js/admin/modules/hrm-payroll.js [DONE] designation column render
client/js/admin/admin-dashboard.js [DONE] hrm-stat-employees widget
client/css/admin/_hrm.css [DONE] employee modal, profile grid, doc cards, designation manager styles
tests/hrm.test.js [DONE] +4 designation CRUD, profile, photo upload, employeeCount in summary (32 tests in suite)
SYSTEM_ENTERPRISE_AUDIT.md [DONE] ultra-dynamic employee + designation section
ARCHITECTURE.md [DONE] Designation model + employee profile endpoints
README.md [DONE] test counts + HRM employee module notes
#
# Sidebar restructure — staff & security nav: 2026-09-11
client/admin/partials/sidebar.html [DONE] HRM trimmed to Employees/Attendance/Payroll/Leave; Admin Access & Roles + Staff Audit + Security Logs + Admin Sessions moved to Settings & Security accordion (renamed from Settings)
#
# Premium sidebar reorganization — 8 categories: 2026-09-12
client/admin/partials/sidebar.html [DONE] 8 accordion groups — Catalog & Inventory, Sales & POS, CRM & Support, Marketing & Growth, Finance & Accounts, HRM, Settings & Security; all data-target values preserved
client/js/admin/modules/core-breadcrumb.js [DONE] breadcrumb group labels aligned to 8-category sidebar
client/css/admin/_layout.css [DONE] nav-group-divider spacing, uppercase section headers, expanded submenu max-height
ARCHITECTURE.md [DONE] Admin Navigation table updated for 8-category structure
SYSTEM_ENTERPRISE_AUDIT.md [DONE] SIDEBAR REORGANIZATION section
README.md [DONE] admin nav accordion list updated
#
# Settings & Security sub-group labels — 2026-09-12
client/admin/partials/sidebar.html [DONE] Settings & Security — 3 labeled sub-groups (Security & Access, Store & Catalog Setup, System & Utilities); all data-target / data-settings-tab values preserved
client/css/admin/_layout.css [DONE] .nav-subheader styles for non-clickable submenu section labels
SYSTEM_ENTERPRISE_AUDIT.md [DONE] SIDEBAR REORGANIZATION — Settings & Security sub-groups note
README.md [DONE] Settings & Security sub-group note
#
# 1-click system access provisioning — 2026-09-11
backend/src/models/employee.js [DONE] linkedAdminId field
backend/src/models/admin.js [DONE] employeeRef field
backend/src/controllers/admin/employeeController.js [DONE] grantSystemAccess, revokeSystemAccess, getAccessStatus; auto-suspend linked admin on terminate/update
backend/src/routes/adminRoutes.js [DONE] grant-access, revoke-access, access-status routes (manage_staff)
client/admin/partials/view-hrm-employees.html [DONE] Grant Access + Manage Access modals; table action buttons
client/js/admin/modules/hrm-employees.js [DONE] openGrantAccessModal, submitGrantAccess, applyPermissionPreset, openManageAccessModal, revokeAccess
client/css/admin/_hrm.css [DONE] grant-access permission grid + manage access summary styles
tests/hrm.test.js [DONE] grant/revoke/access-status + terminate auto-suspend test
SYSTEM_ENTERPRISE_AUDIT.md [DONE] 1-click access marked complete
#
# Staff access & HRM decoupling — 2026-09-12
backend/src/controllers/admin/employeeController.js [DONE] hasAccess query filter on GET /hrm/employees
backend/src/services/superAdminHrmSync.js [NEW] one-time superadmin ↔ Employee bootstrap sync
backend/src/server.js [DONE] syncSuperAdminEmployee in DB bootstrap chain
client/admin/partials/view-hrm-employees.html [DONE] Access profile tab; Link System Account modal copy; grant buttons removed from table context
client/admin/partials/view-staff.html [DONE] premium Admin Access page — stat cards, assign panel, staff directory, permissions slide-over
client/admin/partials/modals-invoice.html [DONE] staff edit modal moved to view-staff slide-over panel
client/js/admin/modules/hrm-employees.js [DONE] table actions simplified; profile Access tab; toggleEmployeeStatus; SweetAlert2 for link/suspend flows
client/js/admin-staff.js [DONE] removed direct-create UI; assign-access flow; module-grouped permissions panel; premium table/stats
client/js/admin/modules/hrm-attendance.js [DONE] staff dropdown optgroups — Name — Designation label format
client/css/admin/_staff.css [DONE] premium staff page, slide-over panel, role badges, employee access tab styles
client/js/admin/modules/settings-footer.js [DONE] SweetAlert2 confirm for payment badge wipe
client/js/admin/modules/settings-security.js [DONE] SweetAlert2-only session/blacklist confirms
client/js/admin/modules/settings-2fa.js [DONE] SweetAlert2 confirmSwitchAuthMethod
client/js/admin/modules/core-realtime.js [DONE] showCustomConfirm Swal fallback (no native confirm)
client/js/admin/modules/catalog-categories.js [DONE] delete confirm Swal fallback
client/js/admin/modules/customers-modals.js [DONE] avatar remove confirm Swal-only
client/js/admin-banner.js [DONE] banner delete SweetAlert2 confirm
client/js/admin-file-manager.js [DONE] unsaved changes SweetAlert2 confirm
client/js/admin-newsletter.js [DONE] subscriber delete + campaign send SweetAlert2 confirms
SYSTEM_ENTERPRISE_AUDIT.md [DONE] STAFF ACCESS & HRM DECOUPLING — 2026-09-12 section
README.md [DONE] admin access decoupling + SweetAlert2 note
#
# Sidebar Admin Access link restore — 2026-09-12
client/admin/partials/sidebar.html [DONE] Admin Access & Roles anchor link under Security & Access (data-target staff)
client/js/admin/modules/core-nav.js [DONE] staff → view-staff section alias for sidebar navigation
#
# Enterprise sidebar consolidation & unified settings hub — 2026-09-12
client/admin/partials/sidebar.html [DONE] 7-module enterprise nav — Sales & Orders, Catalog & Inventory, Marketing & Content, HRM & Staff, Accounts & Finance, System Settings hub
client/admin/partials/view-settings.html [DONE] unified 5-tab settings hub (branding, general, shipping, security, utilities)
client/js/admin/modules/settings-hub.js [NEW] tab routing, embedded partial mounts, SweetAlert2 toasts
client/js/admin/admin-settings.js [DONE] imports settings-hub.js
client/js/admin/modules/core-nav.js [DONE] unified settings tab activation + view-settings refreshMap
client/js/admin/modules/core-breadcrumb.js [DONE] 7-module breadcrumb groups
client/js/admin/modules/core-state.js [DONE] System Settings page meta
client/js/admin/modules/settings-cms.js [DONE] SweetAlert2 on master settings save; setupAdminSettingsTabs delegates to hub
client/js/admin/modules/settings-platform.js [DONE] VAT/tax, order prefix, maintenance fields in applyMasterSettingsToUI
client/js/admin/modules/products-table.js [DONE] reorder-point indicator in inventory stock column
client/js/admin/modules/orders-table.js [DONE] exportOrdersCsvReport + exportOrdersPdfReport
client/admin/partials/view-orders.html [DONE] Export CSV/PDF toolbar buttons
client/css/admin/_settings-system.css [DONE] settings hub tabs, embed mounts, link cards
client/css/admin/_tables.css [DONE] .stock-reorder badge style
backend/src/models/Setting.js [DONE] vatRate, orderPrefix, maintenanceMode, maintenanceMessage
backend/src/controllers/masterSettingsController.js [DONE] read/write enterprise general config fields
backend/src/controllers/admin/exportController.js [DONE] exportOrdersCSV
backend/src/controllers/storeController.js [DONE] maintenanceMode in GET /api/store/health
backend/src/routes/adminRoutes.js [DONE] GET /api/admin/orders/export-csv
tests/admin.test.js [DONE] +2 tests — orders CSV export + VAT/maintenance master settings
ARCHITECTURE.md [DONE] 7-module admin navigation table
SYSTEM_ENTERPRISE_AUDIT.md [DONE] enterprise sidebar consolidation section
README.md [DONE] 135 tests + settings hub note
#
# Settings hub tab fix, sidebar cleanup & accounts overview — 2026-09-12
client/admin/partials/sidebar.html [DONE] System Settings — single Settings Hub link; Accounts Overview under Accounts & Finance
client/js/admin/modules/core-nav.js [DONE] settings hub default branding tab, embed restore on exit, skip embedded hide
client/js/admin/modules/settings-hub.js [DONE] mountEmbeddedSettingsSection display/hidden hardening, panel activation sync
client/admin/partials/view-accounts.html [NEW] cash flow + liquidity widget + account balance cards
client/js/admin/modules/erp-accounts.js [NEW] accounts overview loader
backend/src/controllers/admin/accountsSummaryController.js [NEW] GET /api/admin/accounts-summary
backend/src/routes/adminRoutes.js [DONE] accounts-summary route
backend/src/utils/adminPageBuilder.js [DONE] registers view-accounts partial
backend/src/config/permissions.js [DONE] view-accounts → view_analytics
client/js/admin/modules/core-breadcrumb.js [DONE] view-accounts breadcrumb
client/js/admin/modules/core-state.js [DONE] view-accounts page meta
client/js/admin/admin-products.js [DONE] imports erp-accounts.js
client/css/admin/_finance.css [DONE] accounts overview widget styles
tests/admin.test.js [DONE] +1 accounts-summary test
ARCHITECTURE.md [DONE] accounts overview + single settings hub sidebar entry
README.md [DONE] 136 tests + accounts overview note
#
# Admin access console fix & dynamic control — 2026-09-12
client/js/admin-staff.js [DONE] closeStaffPermissionsPanel hoisted before window export (fixes ReferenceError + sidebar bootstrap)
client/admin/partials/sidebar.html [DONE] Admin Access & Roles data-target normalized to view-staff
backend/src/controllers/admin/employeeController.js [DONE] reactivateSystemAccess, unlinkSystemAccess; getAccessStatus returns email + linkedAdminId
backend/src/routes/adminRoutes.js [DONE] POST reactivate-access, unlink-access (manage_staff)
client/js/admin/modules/hrm-employees.js [DONE] 3-state Access tab; suspendEmployeeAccess, reactivateEmployeeAccess, revokeEmployeeAccess, refreshEmployeeAccessTab
client/css/admin/_staff.css [DONE] empty-state + action-row styles for Access tab
tests/hrm.test.js [DONE] reactivate-access + unlink-access coverage in grant/revoke flow
SYSTEM_ENTERPRISE_AUDIT.md [DONE] ADMIN ACCESS CONSOLE FIX & DYNAMIC CONTROL — 2026-09-12
README.md [DONE] dynamic employee access control note
#
# Final cleanup — settings consolidation, dead code, finance tests, RBAC — 2026-09-12
backend/src/models/Settings.js [DONE] consolidated singleton — all former Setting.js + Settings.js fields
backend/src/models/Setting.js [DONE] deprecated re-export shim → Settings.js
scripts/mergeSettingsModels.js [NEW] one-time merge master→global settings document (non-destructive)
backend/src/controllers/masterSettingsController.js [DONE] single Settings document read/write
backend/src/controllers/settingsController.js [DONE] unified getAllSettings; delivery writes mirror threshold on same doc
backend/src/services/deliveryChargeService.js [DONE] single-document getDeliverySettings
backend/src/utils/rewardSettings.js [DONE] Settings import
backend/src/utils/announcementSettings.js [DONE] Settings import
backend/src/services/flashSaleService.js [DONE] Settings import
backend/src/services/smsService.js [DONE] Settings import
backend/src/services/loyaltyTierService.js [DONE] Settings import
backend/src/controllers/storeController.js [DONE] Settings import
backend/src/controllers/productController.js [DONE] Settings import
backend/src/controllers/userProfileController.js [DONE] Settings import
backend/src/controllers/referralController.js [DONE] Settings import
backend/src/controllers/newsletterAdminController.js [DONE] Settings import
backend/src/controllers/admin/customerAdminController.js [DONE] Settings import
client/js/admin/modules/crm-abandoned.js [DELETED] orphaned re-export; admin-customers.js imports crm-abandoned-carts.js
client/js/admin/modules/view-finance.js [DELETED] dead iframe embed; erp-profit-loss.js owns view-finance section
client/admin/partials/scripts.html [DONE] removed view-finance.js script tag
client/js/admin/modules/core-nav.js [DONE] view-finance → initProfitLossReport only
client/js/admin/modules/catalog-navbar.js [DONE] Swal input for image URL + HTML embed
client/js/admin/modules/hrm-leaves.js [DONE] Swal textarea for leave rejection reason
client/js/admin/modules/orders-actions.js [DONE] removed window.prompt fallback on return reject
client/js/admin/modules/settings-2fa.js [DONE] removed window.prompt fallback on OTP email edit
backend/src/routes/adminRoutes.js [DONE] checkPermission on analytics/status, courier/status, stock/check-now, import-template, cache/stats, cache/key, ai/product-assist, sync-data, newsletter/subscribers
tests/expense.test.js [NEW] create, list, summary, auth-rejected
tests/profitLoss.test.js [NEW] report shape + empty-range zero case
tests/pos.test.js [NEW] manual order creation + validation
tests/abandonedCart.test.js [NEW] list KPIs + notify endpoint
SYSTEM_ENTERPRISE_AUDIT.md [DONE] FINAL CLEANUP — 2026-09-12 + sidebar DECISION note
README.md [DONE] 146 tests / 15 suites
#
# Jest & Mongoose hygiene: 2026-09-12
backend/src/services/paymentMethodService.js [DONE] silence payment catalog seed log in test env
backend/src/services/walletService.js [DONE] findOneAndUpdate → returnDocument: 'after'
backend/src/controllers/courierController.js [DONE] findOneAndUpdate → returnDocument: 'after'
backend/src/controllers/orderAdminController.js [DONE] findOneAndUpdate / findByIdAndUpdate → returnDocument: 'after'
backend/src/services/sandboxService.js [DONE] findOneAndUpdate → returnDocument: 'after'
backend/src/controllers/bannerController.js [DONE] findOneAndUpdate → returnDocument: 'after'
tests/setup.js [DONE] afterAll closes mongoose + mongoServer; clears timers
package.json [DONE] removed jest --forceExit from npm test
SYSTEM_ENTERPRISE_AUDIT.md [DONE] Jest & Mongoose Hygiene — 2026-09-12
README.md [DONE] test teardown / console hygiene note
#
# Notification center & bulk CSV export — 2026-09-12
backend/src/models/adminNotification.js [NEW] persisted in-app admin notifications
backend/src/services/notificationService.js [DONE] createNotification, notifyAdminsWithPermission; sendAdminNotification retained
backend/src/controllers/admin/notificationController.js [NEW] list, unread count, mark read, mark all read
backend/src/controllers/admin/exportController.js [DONE] exportCustomersCSV, exportProductsCSV, exportEmployeesCSV; exportOrdersCSV filter-aware
backend/src/controllers/orderCheckoutController.js [DONE] notify manage_orders on new order
backend/src/services/stockAlertService.js [DONE] notify manage_inventory on low/out-of-stock
backend/src/controllers/admin/leaveController.js [DONE] notify manage_staff on leave apply
backend/src/services/courierSyncService.js [DONE] notify manage_orders on courier Delivered
backend/src/routes/adminRoutes.js [DONE] /notifications/*, /customers/export, /orders/export, /products/export, /hrm/employees/export
client/js/admin/modules/notifications.js [NEW] bell dropdown, polling, mark read, navigation
client/js/admin/admin-core.js [DONE] imports notifications.js
client/js/admin/modules/core-realtime.js [DONE] socket admin_notification refresh; bell UI moved to notifications.js
client/js/admin/modules/core-nav.js [DONE] exportCustomersCsvReport
client/js/admin/modules/orders-table.js [DONE] exportOrdersCsvReport uses /orders/export + all filters
client/js/admin/modules/products-bulk.js [DONE] exportProductsCsvReport server export
client/js/admin/modules/hrm-employees.js [DONE] exportEmployeesCsvReport
client/admin/partials/view-customers.html [DONE] Export CSV button
client/admin/partials/view-hrm-employees.html [DONE] Export CSV button
client/css/admin/_notifications.css [DONE] unread dot, title, clickable item styles
tests/admin.test.js [DONE] +5 notification + bulk export tests
SYSTEM_ENTERPRISE_AUDIT.md [DONE] NOTIFICATION CENTER & BULK EXPORT — 2026-09-12
README.md [DONE] 151 tests + notification center / bulk export note
#
# Activity feed & role-based dashboard widgets — 2026-09-12
backend/src/controllers/admin/activityFeedController.js [NEW] paginated unified SecurityLog feed
backend/src/routes/adminRoutes.js [DONE] GET /api/admin/activity-feed (manage_security)
backend/src/config/permissions.js [DONE] view-activity-feed → manage_security
backend/src/utils/adminPageBuilder.js [DONE] registers view-activity-feed partial
client/admin/partials/view-activity-feed.html [NEW] timeline UI with filter bar
client/js/admin/modules/activity-feed.js [NEW] loadFeed, renderFeed, pagination
client/js/admin/admin-settings.js [DONE] imports activity-feed.js
client/css/admin/_activity-feed.css [NEW] timeline + filter styles
client/css/admin/_settings.css [DONE] imports _activity-feed.css
client/admin/partials/sidebar.html [DONE] Activity Feed under System Settings
client/admin/partials/view-settings.html [DONE] Activity Feed hub link (Security tab)
client/js/admin/modules/core-nav.js [DONE] view-activity-feed refresh hook
client/js/admin/modules/core-state.js [DONE] view-activity-feed page meta
client/js/admin/modules/core-breadcrumb.js [DONE] Activity Feed breadcrumb
client/admin/partials/view-overview.html [DONE] data-dashboard-zone attributes on widget sections
client/js/admin/admin-dashboard.js [DONE] applyDashboardWidgetPermissions role gating
client/js/admin-staff.js [DONE] exposes window.hasAdminPermission; triggers dashboard gating after RBAC boot
tests/admin.test.js [DONE] +2 activity feed API tests
SYSTEM_ENTERPRISE_AUDIT.md [DONE] ACTIVITY FEED & ROLE DASHBOARDS — 2026-09-12
README.md [DONE] 153 tests + activity feed / role dashboard note
#
# Database backup UI & Tax/VAT configuration — 2026-09-12
backend/src/services/backupService.js [NEW] Mongoose-native full JSON export (no mongodump)
backend/src/controllers/admin/backupController.js [NEW] triggerBackup + getBackupStatus (superadmin only)
backend/src/routes/adminRoutes.js [DONE] GET /api/admin/system/backup-now, /system/backup-status
backend/src/models/Settings.js [DONE] vatEnabled, vatPercentage, vatInclusive, taxRegistrationNumber, lastBackupAt
backend/src/models/order.js [DONE] vatAmount, vatPercentage, vatEnabled, taxRegistrationNumber snapshots
backend/src/services/deliveryChargeService.js [DONE] getVatSettings, computeVatAmount; buildLockedOrderTotals accepts vatAmount
backend/src/controllers/orderCheckoutController.js [DONE] additive VAT at checkout; persists on order
backend/src/controllers/orderControllerHelpers.js [DONE] vatAmount in buildLockedPricingPayload
backend/src/controllers/masterSettingsController.js [DONE] Tax/VAT field read/write + vatRate sync
backend/src/utils/invoicePdf.js [DONE] VAT line + tax reg. number on PDF invoice
backend/src/utils/adminPageBuilder.js [DONE] registers view-system-backup partial
client/admin/partials/view-system-backup.html [NEW] Backup & Restore page (export only)
client/js/admin/modules/system-backup.js [NEW] downloadFullBackup, loadSystemBackupSection
client/css/admin/_system-backup.css [NEW] backup panel styles
client/css/admin/_settings.css [DONE] imports _system-backup.css
client/admin/partials/sidebar.html [DONE] Backup & Restore nav (superadmin-only)
client/admin/partials/view-settings.html [DONE] utilities hub link; general tab VAT moved to Shipping
client/admin/partials/view-shipping-payments.html [DONE] Tax & VAT settings card
client/js/admin/admin-settings.js [DONE] imports system-backup.js
client/js/admin/modules/settings-cms.js [DONE] form-system-tax-vat save binding
client/js/admin/modules/settings-platform.js [DONE] applyMasterSettingsToUI Tax/VAT fields
client/js/admin/modules/settings-hub.js [DONE] removed vatRate from general tab save
client/js/admin/modules/core-nav.js [DONE] view-system-backup refresh hook
client/js/admin/modules/core-state.js [DONE] view-system-backup page meta
client/js/admin/modules/core-breadcrumb.js [DONE] Backup & Restore breadcrumb
tests/admin.test.js [DONE] +3 backup API tests; expanded Tax/VAT settings test
tests/order.test.js [DONE] +1 additive VAT checkout test
SYSTEM_ENTERPRISE_AUDIT.md [DONE] BACKUP & TAX CONFIG — 2026-09-12
README.md [DONE] 157 tests + backup UI / Tax/VAT note
#
# Backup UI view isolation fix — 2026-09-12
client/css/admin/_settings-footer.css [DONE] exclude .admin-section from superadmin display:block rule
client/css/admin/_layout.css [DONE] .admin-section:not(.active) display:none guard
client/admin/partials/view-system-backup.html [DONE] default hidden; removed data-superadmin-only from section
client/js/admin/modules/core-nav.js [DONE] hideIsolatedAdminViews + hidden/aria-hidden on view switch
client/js/admin-staff.js [DONE] skip admin-section in applySuperAdminOnlyVisibility
backend/src/utils/adminPageBuilder.js [DONE] ISOLATED_VIEW_PARTIALS export + comment
SYSTEM_ENTERPRISE_AUDIT.md [DONE] Backup UI View Isolation Fix — 2026-09-12
README.md [DONE] backup view isolation note
#
# Support SLA & security monitoring — 2026-09-12
backend/src/models/ContactMessage.js [DONE] firstResponseAt field + toAdminObject
backend/src/controllers/contactController.js [DONE] set firstResponseAt on first reply
backend/src/controllers/admin/supportSlaController.js [NEW] getSlaReport
backend/src/controllers/admin/securityMonitorController.js [NEW] getRateLimitStats
backend/src/services/rateLimitHitTracker.js [NEW] 24h 429 hit counter (memory + optional Redis)
backend/src/middlewares/rateLimiter.js [DONE] record hits on 429 handler
backend/src/middlewares/adminSecurity.js [DONE] record hits on admin login 429
backend/src/routes/adminRoutes.js [DONE] GET /support/sla-report, /security/rate-limit-stats
client/admin/partials/view-messages.html [DONE] SLA Overview panel
client/admin/partials/view-security.html [DONE] Security Monitor panel
client/js/admin/modules/messages-inbox.js [DONE] fetchSupportSlaReport
client/js/admin/modules/settings-security.js [DONE] fetchSecurityMonitorStats, quickBlacklistIp
client/js/admin/modules/core-nav.js [DONE] view-security loads monitor stats
client/css/admin/_customers.css [DONE] support-sla-panel styles
client/css/admin/_settings-security.css [DONE] security-monitor-panel styles
tests/admin.test.js [DONE] +3 SLA + security monitor tests
SYSTEM_ENTERPRISE_AUDIT.md [DONE] SUPPORT SLA & SECURITY MONITORING — 2026-09-12
README.md [DONE] 160 tests + SLA / security monitor note
#
# Dynamic Expense Category Management — 2026-09-12
backend/src/models/expenseCategory.js [NEW] dynamic category catalog — name, slug, isActive, isSystemDefault, allowCustomInput
backend/src/models/expense.js [DONE] category as dynamic slug string + customCategoryName; legacy CATEGORIES static kept
backend/src/services/expenseCategoryService.js [NEW] seedDefaultExpenseCategories + slugify + lookup helpers
backend/src/controllers/admin/expenseCategoryController.js [NEW] active/admin list, create, toggle active, other-custom-toggle, delete
backend/src/controllers/admin/expenseController.js [DONE] validate category against ExpenseCategory; customCategoryName for Other
backend/src/controllers/admin/profitLossController.js [DONE] dynamic category slug rollups from ExpenseCategory
backend/src/models/securityLog.js [DONE] expense_category resourceType
backend/src/routes/adminRoutes.js [DONE] /expense-categories/* routes (named before :id)
backend/src/server.js [DONE] seedDefaultExpenseCategories bootstrap
tests/setup.js [DONE] seed expense categories afterEach
tests/expenseCategory.test.js [NEW] 6 tests — CRUD, toggle, Other custom input, delete guards
client/admin/partials/view-erp-expenses.html [DONE] custom category name input group
client/admin/partials/view-settings.html [DONE] Finance Settings tab + expense category manager table
client/js/admin/modules/erp-expenses.js [DONE] API-driven category dropdowns + Other custom input UX
client/js/admin/modules/settings-expense-categories.js [NEW] category manager UI for System Settings
client/js/admin/modules/settings-hub.js [DONE] finance tab label + loadExpenseCategorySettings on activate
client/js/admin/admin-settings.js [DONE] import settings-expense-categories.js
client/js/admin/modules/activity-feed.js [DONE] expense_category icon + label
client/css/admin/_settings-finance.css [NEW] finance settings / category manager styles
client/css/admin/_settings.css [DONE] import _settings-finance.css
SYSTEM_ENTERPRISE_AUDIT.md [DONE] Dynamic Expense Category Management — 2026-09-12
README.md [DONE] 166 tests + dynamic expense category feature note
ARCHITECTURE.md [DONE] ExpenseCategory model + Finance Settings tab
#
# PostgreSQL migration — Stage 1 schema design (PLANNING ONLY): 2026-09-13
#
# NOT ACTIVE IN THE RUNNING SYSTEM. Both files below are planning artifacts.
# Nothing imports or reads them; the live database is still MongoDB + Mongoose.
# Zero .js files were modified in this phase — no model, controller, route,
# service or script was touched, and no .env / DATABASE_URL was read or written.
# No prisma command (generate / migrate / db push) was run.
prisma/schema.prisma [NEW] [INACTIVE] PostgreSQL (Neon) target schema — 67 models, 55 enums, generated from all 40 Mongoose models in backend/src/models/ plus config/permissions.js enum sources. String @id @default(uuid()) PKs, legacyId columns for the Stage 3 backfill, @db.Decimal(12,2) on every currency field, explicit per-relation onDelete (Cascade only for parent-owned rows; SetNull/Restrict across aggregate boundaries)
DATABASE_MIGRATION_AUDIT.md [NEW] 5-stage roadmap (design → dual-write → backfill → read cutover → decommission), model-by-model mapping table with risk ratings, full foreign-key + cascade strategy, index replication notes, excluded/deferred field register, npm install commands documented but deliberately NOT run
backend/src/models/*.js [UNCHANGED] read-only source of truth for the mapping — deliberately untouched
backend/src/controllers/**, backend/src/routes/** [UNCHANGED] no dual-write or repository layer yet; that is Stage 2
ARCHITECTURE.md [DONE] Settings section corrected to the consolidated single-singleton reality (was still describing the pre-2026-09-12 dual Setting.js/Settings.js layout); prisma/ noted in the backend structure; DATABASE_MIGRATION_AUDIT.md added to the documentation index
SYSTEM_ENTERPRISE_AUDIT.md [DONE] POSTGRESQL MIGRATION — STAGE 1 SCHEMA DESIGN — 2026-09-13
README.md [DONE] PostgreSQL migration Stage 1 note (planning artifacts, not yet active)
#
# PostgreSQL migration - Stage 2 Step 1: environment setup + baseline migration: 2026-09-13
#
# Prisma is now CONNECTED to Neon and all 67 tables exist, but NO application
# code reads PostgreSQL yet. Zero .js files under backend/src/ were modified -
# no model, controller, route, service or script was touched. The live database
# is still MongoDB + Mongoose and remains authoritative. 166/166 tests pass.
# prisma db push was NOT used; no --accept-data-loss or force flag was used.
prisma.config.js [NEW] [CLI-ONLY] repo-root Prisma 7 CLI config - required because Prisma 7 removed url/directUrl/shadowDatabaseUrl from the schema datasource block. Supplies datasource.url from DATABASE_URL (the DIRECT non-pooled Neon endpoint, which Migrate requires). Not imported by any application code
prisma/schema.prisma [DONE] datasource + generator blocks only — removed url = env("DATABASE_URL") (forbidden in Prisma 7), switched generator from the deprecated prisma-client-js to prisma-client with output = "../generated/prisma", moduleFormat = "esm", generatedFileExtension = "mts", importFileExtension = "mts". (Initial moduleFormat = "cjs" attempt failed — see Stage 2 Step 1b.) npx prisma format applied. NO model, field, relation, enum, index or constraint was changed
prisma/migrations/20260913131445_init_postgres_baseline/migration.sql [NEW] first real migration, created and applied to Neon via npx prisma migrate dev. 2,392 lines: 67 CREATE TABLE, 55 CREATE TYPE, 83 unique indexes, 133 indexes, 70 foreign keys. Zero implicit m2m join tables (Supplier<->Product is the explicit SupplierProduct model)
package.json [DONE] added prisma@7.10.0 (devDependency) + @prisma/client@7.10.0 (dependency), both pinned EXACTLY with no caret because npm latest for prisma served the 8.0.0-rc.14 pre-release. No existing dependency version altered
package-lock.json [DONE] lockfile updated for the two Prisma packages
.gitignore [DONE] added /generated/prisma - the generated client is build output, recreate with npx prisma generate
generated/prisma/** [NEW] [GITIGNORED] generated Prisma Client 7.10.0 - 67 model files exactly matching the 67 schema models, 55 enums. TypeScript-only output (see the open item in DATABASE_MIGRATION_AUDIT.md before writing the repository layer)
DATABASE_MIGRATION_AUDIT.md [DONE] STAGE 2 STEP 1 - Environment Setup & Migration - 2026-09-13: packages, env verification, the P1012 validation error and its real fix, migration name, Neon object counts, 166/166 test result, TypeScript-client open item
ARCHITECTURE.md [DONE] prisma/ section rewritten from "NOT ACTIVE" to "CONNECTED, NOT YET READ BY THE APP"; prisma.config.js + generated/prisma documented; DATABASE_URL vs DATABASE_URL_POOLED env table added to Local Development Quick Reference
SYSTEM_ENTERPRISE_AUDIT.md [DONE] POSTGRESQL MIGRATION - STAGE 2 STEP 1 - 2026-09-13
README.md [DONE] Stage 2 Step 1 note - Prisma connected to Neon, 67 tables live, MongoDB still authoritative
backend/src/models/**, backend/src/controllers/**, backend/src/routes/** [UNCHANGED] deliberately untouched - dual-write repository layer is the next step
#
# PostgreSQL migration — Stage 2 Step 1b: generator correction (loadable Prisma client): 2026-09-13
#
# The initial moduleFormat = "cjs" generator setting did not yield CommonJS output —
# prisma-client always emits TypeScript ESM regardless of moduleFormat. The correct
# solution uses Node's native type stripping (unflagged since 22.18.0) to run .mts
# files directly from CommonJS via require(). Zero application files changed.
prisma/schema.prisma [DONE] generator corrected: moduleFormat = "esm", generatedFileExtension = "mts", importFileExtension = "mts". .mts output is Node-type-stripped ESM; plain CommonJS files can require() it via require(esm) (unflagged since Node 22.12.0/22.18.0)
generated/prisma/** [DONE] [GITIGNORED] regenerated — 75 .mts files (client.mts, browser.mts, models.mts, enums.mts, commonInputTypes.mts, models/×67, internal/×3). Zero .js, .ts, or .d.ts files
DATABASE_MIGRATION_AUDIT.md [DONE] STAGE 2 STEP 1b — generator correction: full investigation record, cjs/cts failure evidence, mts mechanism table, smoke-test output, require(esm) caveat, Node floor analysis
ARCHITECTURE.md [DONE] generated/prisma entry updated to reflect .mts extension and the require() path
SYSTEM_ENTERPRISE_AUDIT.md [DONE] Stage 2 Step 1b generator correction note added
README.md [DONE] Stage 2 Step 1 note updated to include Step 1b (generator correction)
#
# Node 22.18+ engines requirement + Dockerfile base image update: 2026-09-13
#
package.json [DONE] added "engines": { "node": ">=22.18.0" } — documents the effective floor imposed by Node's native type stripping, required to load generated/prisma/*.mts. No dependency versions altered
Dockerfile [DONE] base image updated node:20-alpine → node:22-alpine (root, devops/, ecommerce-chat/devops/) — three Dockerfiles total. Satisfies the >=22.18.0 floor with headroom; node:22-alpine tracks the 22.x LTS line
REFACTOR_MAP.md [DONE] Stage 2 Step 1b correction reflected; this engines/Dockerfile section added
README.md [DONE] DATABASE_MIGRATION_AUDIT.md reference updated to mention Step 1b completion

# PostgreSQL migration — Stage 2 Step 2: Neon adapter + repository layer (simple models): 2026-09-13

package.json [DONE] added @prisma/adapter-neon ^7.10.0, @neondatabase/serverless ^1.1.0; added test:repositories script; jest testPathIgnorePatterns excludes tests/repositories/ (Jest cannot load .mts Prisma client)
package-lock.json [DONE] lockfile updated for Neon adapter packages
backend/src/config/prismaClient.js [NEW] PrismaClient singleton via PrismaNeonHttp(DATABASE_URL_POOLED); global guard; not wired into server.js
backend/src/repositories/categoryRepository.js [NEW] CRUD + slugifyCategory (Bengali Unicode)
backend/src/repositories/designationRepository.js [NEW] CRUD + remove() Restrict guard (designationId / TERMINATED status)
backend/src/repositories/brandRepository.js [NEW] CRUD + slugifyBrand (Bengali Unicode)
backend/src/repositories/warehouseRepository.js [NEW] CRUD + setDefault() sequential demote/promote (no $transaction over HTTP)
backend/src/repositories/supplierRepository.js [NEW] CRUD + remove() open-PO Restrict guard
tests/repositories/jestCompat.js [NEW] minimal Jest-like API on node:test for Neon integration tests
tests/repositories/category.repository.test.js [NEW] slug + CRUD against real Neon (75 tests total across 5 files)
tests/repositories/designation.repository.test.js [NEW]
tests/repositories/brand.repository.test.js [NEW]
tests/repositories/warehouse.repository.test.js [NEW]
tests/repositories/supplier.repository.test.js [NEW]
tests/prismaClientTransformer.js [DELETED] abandoned Jest .mts workaround (removed before commit)
jest.repositories.config.js [DELETED] abandoned custom Jest config (removed before commit)
backend/src/models/**, backend/src/controllers/**, backend/src/routes/** [UNCHANGED] MongoDB path untouched
DATABASE_MIGRATION_AUDIT.md [DONE] Stage 2 Step 2 section added
REFACTOR_MAP.md [DONE] this section
README.md [DONE] test:repositories documented; Jest suite count unchanged at 166
SYSTEM_ENTERPRISE_AUDIT.md [DONE] Stage 2 Step 2 repository layer note added

# PostgreSQL migration — Stage 2 Step 2, Part 2: Admin repository (security-critical): 2026-09-13

backend/src/repositories/adminRepository.js [NEW] CRUD + bcryptjs password hashing (rounds 12, BCRYPT_PATTERN guard) + select:false secrecy for 6 OTP/TOTP fields + findByIdWithSecrets/findByUsernameWithSecrets + remove() superadmin guard
tests/repositories/admin.repository.test.js [NEW] 12 integration tests against real Neon (hashing, double-hash prevention, secret isolation, CRUD)
tests/repositories/jestCompat.js [DONE] added afterEach + toBeUndefined for per-test cleanup
backend/src/models/**, backend/src/controllers/**, backend/src/routes/** [UNCHANGED] MongoDB path untouched
DATABASE_MIGRATION_AUDIT.md [DONE] Stage 2 Step 2 Part 2 section added
REFACTOR_MAP.md [DONE] this section
README.md [DONE] test:repositories count updated to 87
SYSTEM_ENTERPRISE_AUDIT.md [DONE] Stage 2 Step 2 Part 2 note added

# PostgreSQL migration — Stage 2 Step 2, Part 3: User repository: 2026-09-13

backend/src/repositories/userRepository.js [NEW] CRUD + referral code generation (8-char unambiguous alphabet, 6-attempt collision retry) + addresses/wishlist/wallet sub-resource helpers + cascade delete via plain prisma.user.delete()
tests/repositories/user.repository.test.js [NEW] 12 integration tests against real Neon (referral codes, collision retry, addresses, wallet, cascade delete, wishlist)
backend/src/models/**, backend/src/controllers/**, backend/src/routes/** [UNCHANGED] MongoDB path untouched
DATABASE_MIGRATION_AUDIT.md [DONE] Stage 2 Step 2 Part 3 section added
REFACTOR_MAP.md [DONE] this section
README.md [DONE] test:repositories count updated to 99
SYSTEM_ENTERPRISE_AUDIT.md [DONE] Stage 2 Step 2 Part 3 note added

# PostgreSQL migration — Stage 2 Step 2, Part 4: HRM repositories (polymorphic staff): 2026-09-13

backend/src/repositories/hrmStaffResolver.js [NEW] Prisma polymorphic staff resolution (staffId/staffType + adminId/employeeId)
backend/src/repositories/employeeRepository.js [NEW] CRUD + EMP-001 generation + terminate→admin block + documents/references + link/unlink admin
backend/src/repositories/attendanceRepository.js [NEW] markAttendance/clockIn/clockOut + computeHoursWorked + getSummary
backend/src/repositories/payrollRepository.js [NEW] generate/approve/markPaid + computeTotalSalary (workingDays=0 edge case)
backend/src/repositories/leaveRepository.js [NEW] apply/approve/reject + countLeaveDays + getBalance
tests/repositories/employee.repository.test.js [NEW]
tests/repositories/attendance.repository.test.js [NEW]
tests/repositories/payroll.repository.test.js [NEW]
tests/repositories/leave.repository.test.js [NEW]
tests/repositories/jestCompat.js [DONE] added toMatch, toBeGreaterThanOrEqual
backend/src/models/**, backend/src/controllers/**, backend/src/routes/** [UNCHANGED] MongoDB path untouched
DATABASE_MIGRATION_AUDIT.md [DONE] Stage 2 Step 2 Part 4 section added
REFACTOR_MAP.md [DONE] this section
README.md [DONE] test:repositories count updated to 122
SYSTEM_ENTERPRISE_AUDIT.md [DONE] Stage 2 Step 2 Part 4 note added

# PostgreSQL migration — Stage 2 Step 2, Part 5: Product & Order repositories (embedded decomposition): 2026-09-13

backend/src/repositories/productRepository.js [NEW] CRUD + slug (slugifyBrand) + variants (Map→ProductVariantAttribute) + cost history + embedded reviews
backend/src/repositories/orderRepository.js [NEW] create (sequential nested writes) + findById reassembly + return items + payment/IPN updates
backend/src/repositories/employeeRepository.js [MOD] generateEmployeeId numeric max + collision retry; safer under shared Neon DB
tests/repositories/product.repository.test.js [NEW] 8 tests — slug, variants, cascade SetNull/Cascade
tests/repositories/order.repository.test.js [NEW] 5 tests — nested create, extraFields, subTotal/subtotal, reassembly
package.json [MOD] test:repositories adds --test-concurrency=1 for Neon integration stability
backend/src/models/**, backend/src/controllers/**, backend/src/routes/** [UNCHANGED] MongoDB path untouched
DATABASE_MIGRATION_AUDIT.md [DONE] Stage 2 Step 2 Part 5 section added
REFACTOR_MAP.md [DONE] this section
README.md [DONE] test:repositories count updated to 135 (13 files)
SYSTEM_ENTERPRISE_AUDIT.md [DONE] Stage 2 Step 2 Part 5 note added

# PostgreSQL migration — Stage 2 Step 3, Part 1: Category dual-write pilot: 2026-09-14

backend/src/services/dualWriteService.js [NEW] reusable dualWrite() — Mongo first, Postgres best-effort, failure-isolated
tests/services/dualWriteService.test.js [NEW] 3 Jest unit tests for dualWriteService
backend/src/repositories/categoryRepository.js [MOD] create() accepts legacyId; findByLegacyId() added
backend/src/controllers/categoryController.js [MOD] adminCreateCategory, adminUpdateCategory, adminDeleteCategory wired through dualWrite(); lazy getCategoryRepository() for Jest compatibility
backend/src/routes/** [UNCHANGED]
DATABASE_MIGRATION_AUDIT.md [DONE] Stage 2 Step 3 Part 1 section added
REFACTOR_MAP.md [DONE] this section
README.md [DONE] Jest count updated to 169 (17 suites); dual-write pilot noted
SYSTEM_ENTERPRISE_AUDIT.md [DONE] Stage 2 Step 3 Part 1 note added

# PostgreSQL migration — Stage 2 Step 3, Part 2: Dual-write for Designation, Brand, Warehouse, Supplier: 2026-09-14

backend/src/repositories/designationRepository.js [MOD] legacyId on create; findByLegacyId()
backend/src/repositories/brandRepository.js [MOD] legacyId on create; findByLegacyId()
backend/src/repositories/warehouseRepository.js [MOD] legacyId on create; findByLegacyId()
backend/src/repositories/supplierRepository.js [MOD] legacyId on create; findByLegacyId()
backend/src/controllers/admin/designationController.js [MOD] createDesignation, updateDesignation, deleteDesignation via dualWrite()
backend/src/controllers/brandController.js [MOD] createBrand, updateBrand, deleteBrand via dualWrite()
backend/src/controllers/admin/warehouseController.js [MOD] createWarehouse, updateWarehouse, deleteWarehouse via dualWrite(); setDefault mirror on default promotion
backend/src/controllers/admin/supplierController.js [MOD] createSupplier, updateSupplier, deleteSupplier via dualWrite()
backend/src/services/dualWriteService.js [UNCHANGED] reused as-is from Part 1
backend/src/routes/** [UNCHANGED]
DATABASE_MIGRATION_AUDIT.md [DONE] Stage 2 Step 3 Part 2 section added
REFACTOR_MAP.md [DONE] this section
README.md [DONE] dual-write model count note
SYSTEM_ENTERPRISE_AUDIT.md [DONE] Stage 2 Step 3 Part 2 note added

# PostgreSQL migration — Stage 2 Step 3, Part 3: Dual-write for CMS/Settings group: 2026-09-14

backend/src/repositories/pageContentRepository.js [NEW] findAll, findById, findBySlug, findByLegacyId, create, update, remove; markdownToHtml body render; contactMeta flatten
backend/src/repositories/navbarLinkRepository.js [NEW] CRUD + LinkTarget enum mapping (_self/_blank)
backend/src/repositories/footerSettingsRepository.js [NEW] singleton upsert; 5 child tables; paymentBadges tri-state (skip/replace)
backend/src/repositories/bannerRepository.js [NEW] Banner CRUD + BannerSettings upsert (key=global); overlayOpacity Decimal(3,2)
backend/src/repositories/settingsRepository.js [NEW] singleton upsert; activePaymentGateways booleans + settings_payment_gateways child rows
backend/src/controllers/pageContentController.js [MOD] createPage, updatePageContent via dualWrite()
backend/src/controllers/navbarLinkController.js [MOD] createNavbarLink, updateNavbarLink, deleteNavbarLink via dualWrite()
backend/src/controllers/footerSettingsController.js [MOD] updateFooterSettings, addPaymentBadge, deletePaymentBadge via dualWrite()
backend/src/controllers/bannerController.js [MOD] createBanner, updateBanner, deleteBanner, updateSettings via dualWrite()
backend/src/controllers/settingsController.js [MOD] updateSettings, updateCacheSettings, updateRateLimitSettings via dualWrite()
backend/src/controllers/masterSettingsController.js [MOD] saveMasterSettings via dualWrite()
tests/repositories/footerSettings.repository.test.js [NEW] paymentBadges tri-state (skip vs replace [])
backend/src/services/dualWriteService.js [UNCHANGED] reused as-is from Part 1
backend/src/routes/** [UNCHANGED]
backend/src/models/Setting.js [UNCHANGED] deprecated shim — out of scope
DATABASE_MIGRATION_AUDIT.md [DONE] Stage 2 Step 3 Part 3 section added
REFACTOR_MAP.md [DONE] this section
README.md [DONE] dual-write model count + repository test count
SYSTEM_ENTERPRISE_AUDIT.md [DONE] Stage 2 Step 3 Part 3 note added

# PostgreSQL migration — Stage 2 Step 3, Part 4: Dual-write for Security/Audit group: 2026-09-14

backend/src/repositories/securityLogRepository.js [NEW] create, findAll; actor plain String
backend/src/repositories/loginAttemptRepository.js [NEW] create, findAll
backend/src/repositories/blacklistedIpRepository.js [NEW] upsertFromMongo, findByIp, findAll, remove; null expiresAt permanent ban
backend/src/repositories/stockAlertRepository.js [NEW] create + stock_alert_items (LOW_STOCK / OUT_OF_STOCK)
backend/src/utils/securityLogger.js [MOD] logSecurityEvent() — single shared SecurityLog dual-write point
backend/src/utils/loginAttemptLogger.js [NEW] persistLoginAttempt() — shared LoginAttempt dual-write point
backend/src/middlewares/adminSecurity.js [MOD] recordLoginAttempt, auto-ban, blacklist gate, rate-limit → persistLoginAttempt / dualWrite
backend/src/middlewares/geoFencing.js [MOD] geo-block → persistLoginAttempt()
backend/src/controllers/admin/blacklistController.js [MOD] addBlacklist, removeBlacklist via dualWrite()
backend/src/services/stockAlertService.js [MOD] checkAndAlertLowStock StockAlert.create via dualWrite()
tests/repositories/blacklistedIp.repository.test.js [NEW] null expiresAt verification
tests/repositories/stockAlert.repository.test.js [NEW] kind discrimination verification
backend/src/services/dualWriteService.js [UNCHANGED] reused as-is from Part 1
backend/src/routes/** [UNCHANGED]
DATABASE_MIGRATION_AUDIT.md [DONE] Stage 2 Step 3 Part 4 section added
REFACTOR_MAP.md [DONE] this section
README.md [DONE] dual-write model count + repository test count
SYSTEM_ENTERPRISE_AUDIT.md [DONE] Stage 2 Step 3 Part 4 note added

# PostgreSQL migration — Stage 2 Step 3, Part 5: Dual-write for HRM group: 2026-09-14

backend/src/utils/hrmDualWriteHelpers.js [NEW] mappers for Employee/Attendance/Payroll/Leave dual-write; lazy prisma load
backend/src/repositories/hrmStaffResolver.js [MOD] legacyId lookup in findEmployeeRecord/findAdminRecord
backend/src/repositories/employeeRepository.js [MOD] findByLegacyId, findDocumentByLegacyId, legacyId on create/addDocument
backend/src/repositories/attendanceRepository.js [MOD] findByLegacyId, legacyId support, upsertFromMongo() for exact Mongo mirror
backend/src/repositories/payrollRepository.js [MOD] findByLegacyId, legacyId on generate, upsertFromMongo() for exact Mongo totals
backend/src/repositories/leaveRepository.js [MOD] findByLegacyId, legacyId on apply
backend/src/controllers/admin/employeeController.js [MOD] create/update/terminate/photo/doc/grantAccess/unlinkAccess via dualWrite(); lazy helper load
backend/src/controllers/admin/attendanceController.js [MOD] markAttendance/clockIn/clockOut via dualWrite() → upsertFromMongo
backend/src/controllers/admin/payrollController.js [MOD] generatePayroll/approvePayroll/markPaid via dualWrite(); lazy helper load
backend/src/controllers/admin/leaveController.js [MOD] applyLeave/approveLeave/rejectLeave + stampLeaveOnAttendance via dualWrite()
tests/repositories/attendance.repository.test.js [MOD] upsertFromMongo employee legacyId → employeeId FK test
backend/src/services/dualWriteService.js [UNCHANGED] reused as-is from Part 1
backend/src/routes/** [UNCHANGED]
DATABASE_MIGRATION_AUDIT.md [DONE] Stage 2 Step 3 Part 5 section added
REFACTOR_MAP.md [DONE] this section
README.md [DONE] dual-write model count + repository test count (141)
SYSTEM_ENTERPRISE_AUDIT.md [DONE] Stage 2 Step 3 Part 5 note added

# PostgreSQL migration — Stage 2 Step 3, Part 6: Dual-write for Marketing/Support group: 2026-09-14

backend/src/repositories/newsletterRepository.js [NEW] create/update/unsubscribe/upsertFromMongo; findByEmail, findByLegacyId
backend/src/repositories/emailCampaignRepository.js [NEW] create/update/upsertFromMongo; stats flatten; enum mappers
backend/src/repositories/contactMessageRepository.js [NEW] create/update/upsertFromMongo; ticket status/priority enums
backend/src/repositories/reviewRepository.js [NEW] create/update/upsertFromMongo; cross-model FK resolution with [DUAL-WRITE-FK-MISSING] log
backend/src/controllers/newsletterController.js [MOD] subscribe/unsubscribe via dualWrite()
backend/src/controllers/newsletterAdminController.js [MOD] createCampaign + sendCampaign per-batch stats dual-write
backend/src/controllers/contactController.js [MOD] all 7 write actions via dualWrite()
backend/src/controllers/reviewController.js [MOD] addOrUpdateReview + deleteOwnReview via dualWrite()
backend/src/controllers/reviewAdminController.js [MOD] moderateReview + deleteReview via dualWrite()
tests/repositories/review.repository.test.js [NEW] FK fallback when User/Product missing in Postgres
backend/src/services/dualWriteService.js [UNCHANGED] reused as-is from Part 1
backend/src/routes/** [UNCHANGED]
DATABASE_MIGRATION_AUDIT.md [DONE] Stage 2 Step 3 Part 6 section added
REFACTOR_MAP.md [DONE] this section
README.md [DONE] dual-write model count + repository test count (144)
SYSTEM_ENTERPRISE_AUDIT.md [DONE] Stage 2 Step 3 Part 6 note added

# PostgreSQL migration — Stage 2 Step 3, Part 7: Dual-write for User + owned tables: 2026-09-14

backend/src/repositories/userRepository.js [MOD] findByLegacyId, legacyId on create, upsertFromMongo, mirrorAccountDeletion, mirrorWalletFromMongo, address/wishlist helpers
backend/src/repositories/cartRepository.js [NEW] syncFromMongo, clearByUserLegacyId; required CartItem.productId FK
backend/src/controllers/auth/registerController.js [MOD] registerUser via dualWrite()
backend/src/controllers/auth/loginController.js [MOD] deleteAccount via dualWrite() → mirrorAccountDeletion
backend/src/controllers/userProfileController.js [MOD] profile/avatar/password/contact/address/points via dualWrite()
backend/src/controllers/userWishlistController.js [MOD] addToWishlist/removeFromWishlist via dualWrite()
backend/src/services/walletService.js [MOD] credit/debit/reverse via dualWrite() → mirrorWalletFromMongo
backend/src/controllers/cartController.js [MOD] all cart mutations via dualWrite() → syncFromMongo
tests/repositories/user.repository.test.js [MOD] referralCode pass-through test
tests/repositories/cart.repository.test.js [NEW] required product FK failure test
tests/repositories/review.repository.test.js [MOD] userId resolves when User in Postgres
backend/src/services/dualWriteService.js [UNCHANGED] reused as-is from Part 1
backend/src/routes/** [UNCHANGED]
DATABASE_MIGRATION_AUDIT.md [DONE] Stage 2 Step 3 Part 7 section added
REFACTOR_MAP.md [DONE] this section
README.md [DONE] dual-write model count + repository test count (147)
SYSTEM_ENTERPRISE_AUDIT.md [DONE] Stage 2 Step 3 Part 7 note added

# PostgreSQL migration — Stage 2 Step 3, Part 8: Dual-write for Order (final): 2026-09-14

backend/src/repositories/orderRepository.js [MOD] findByLegacyId, legacyId on create, createWithStagedWrites, createFromMongo, FK resolution, update-by-legacyId helpers
backend/src/utils/orderDualWriteHelpers.js [NEW] mirrorOrderCreate (partial-write logging), status/payment/IPN/notification/return/proof mirrors
backend/src/controllers/orderCheckoutController.js [MOD] checkout create via dualWrite()
backend/src/controllers/orderAdminController.js [MOD] manual POS, status, notifications, return/refund flows via dualWrite()
backend/src/controllers/orderCustomerController.js [MOD] cancel/return flows via dualWrite()
backend/src/controllers/paymentIpnController.js [MOD] gateway session + IPN via dualWrite()
backend/src/controllers/orderPaymentProofController.js [MOD] proof submit/review via dualWrite()
backend/src/services/courierSyncService.js [MOD] courier book + status sync via dualWrite()
backend/src/jobs/reviewReminderJob.js [MOD] reviewReminder notification flag via dualWrite()
tests/repositories/order.repository.test.js [MOD] createFromMongo FK tests + partial-failure logging tests
backend/src/services/dualWriteService.js [UNCHANGED] reused as-is from Part 1
backend/src/routes/** [UNCHANGED]
DATABASE_MIGRATION_AUDIT.md [DONE] Stage 2 Step 3 Part 8 section added — Order group complete; Admin deferred to Part 9
REFACTOR_MAP.md [DONE] this section
README.md [DONE] Order dual-write + repository test count (152)
SYSTEM_ENTERPRISE_AUDIT.md [DONE] Stage 2 Step 3 Part 8 note added

# PostgreSQL migration — Stage 2 Step 3, Part 9: Dual-write for Admin (final): 2026-09-14

backend/src/repositories/adminRepository.js [MOD] legacyId, findByLegacyId, updateByLegacyId, removeByLegacyId, mapMongoDocToWriteInput, upsertFromMongo
backend/src/utils/adminDualWriteHelpers.js [NEW] mirrorAdminCreate/Update/Fields/Remove, adminDualWrite with sanitized [DUAL-WRITE-FAILURE] logs; lazy prisma load
backend/src/controllers/staffController.js [MOD] create/update/status/reset-password/delete via dualWrite()
backend/src/controllers/admin/employeeController.js [MOD] grant/revoke/reactivate/unlink/suspend linked admin via dualWrite()
backend/src/controllers/admin/payrollController.js [MOD] updateSalaryConfig via dualWrite()
backend/src/controllers/admin/adminProfileController.js [MOD] updateProfilePic, updateAdminProfile via dualWrite()
backend/src/controllers/admin/adminSettingsController.js [MOD] updateAdminSettings, uploadStoreBranding via dualWrite()
backend/src/controllers/twoFactorController.js [MOD] TOTP/SMS 2FA setup/verify/disable/updateMethod via dualWrite()
backend/src/controllers/admin/authController.js [MOD] bootstrap, password upgrade, lastLoginAt, OTP/TOTP flows, resetTotpEmergency via dualWrite()
backend/src/controllers/internalChatController.js [MOD] updateInternalAdminImage via dualWrite(); duplicate require removed
tests/repositories/admin.repository.test.js [MOD] +5 dual-write tests (salt verify, salary patch, status, secret log isolation, superadmin remove)
backend/src/services/dualWriteService.js [UNCHANGED] reused as-is from Part 1
backend/src/routes/** [UNCHANGED]
DATABASE_MIGRATION_AUDIT.md [DONE] Stage 2 Step 3 Part 9 section — Stage 2 Step 3 COMPLETE (all 9 parts)
REFACTOR_MAP.md [DONE] this section
README.md [DONE] Admin dual-write + repository test count (157)
SYSTEM_ENTERPRISE_AUDIT.md [DONE] Stage 2 Step 3 Part 9 note added

# PostgreSQL migration — Stage 3 Step 1: Backfill framework + first dependency group: 2026-09-14

backend/scripts/backfill/backfillRunner.js [NEW] shared backfillModel() — idempotent legacyId skip, _id cursor pagination, per-doc failure isolation
backend/scripts/backfill/runBackfill.js [NEW] entry point — Designation, Brand, Warehouse, Supplier, Category (two-pass parent wiring)
backend/scripts/backfill/verifyBackfill.js [NEW] Mongo vs Postgres count comparison + Category parentCategoryId audit
backend/src/repositories/** [UNCHANGED] reused create()/update()/findByLegacyId() as-is
backend/src/controllers/** [UNCHANGED]
backend/src/routes/** [UNCHANGED]
backend/src/services/dualWriteService.js [UNCHANGED]
DATABASE_MIGRATION_AUDIT.md [DONE] Stage 3 Step 1 section added
REFACTOR_MAP.md [DONE] this section

# PostgreSQL migration — Stage 3 Step 2: Backfill CMS/settings + security/audit groups: 2026-09-14

backend/scripts/backfill/runBackfill.js [MOD] runStep2Group() — PageContent, NavbarLink, Banner, BannerSettings/FooterSettings/Settings singletons, SecurityLog (batch 500), LoginAttempt (batch 500), BlacklistedIP, StockAlert
backend/scripts/backfill/verifyBackfill.js [MOD] counts for 9 new models + singleton key=global checks + StockAlert child-row comparison
backend/scripts/backfill/backfillRunner.js [UNCHANGED]
backend/src/repositories/** [UNCHANGED] reused create/upsertFromMongo as-is
DATABASE_MIGRATION_AUDIT.md [DONE] Stage 3 Step 2 section added
REFACTOR_MAP.md [DONE] this section
SYSTEM_ENTERPRISE_AUDIT.md [DONE] Stage 3 Step 2 note added
README.md [DONE] Stage 3 Step 2 backfill note

# PostgreSQL migration — Stage 3 Step 3: Backfill User + HRM + Marketing/Support groups: 2026-09-14

backend/scripts/backfill/runBackfill.js [MOD] runStep3Group() — User (+ referredBy pass, Address, WishlistItem, WalletTransaction, Cart/CartItem), Employee (+ documents/references), Attendance/Payroll/Leave (custom Prisma + in-memory Admin/Employee staff maps), Newsletter, EmailCampaign, ContactMessage, Review (FK patch for existing rows)
backend/scripts/backfill/verifyBackfill.js [MOD] counts for User, Address, WishlistItem, WalletTransaction, Cart, CartItem, Employee, EmployeeDocument, EmployeeReference, Attendance, Payroll, Leave, Newsletter, EmailCampaign, ContactMessage, Review + Review userId health check + embedded-array child verification
backend/scripts/backfill/backfillRunner.js [UNCHANGED]
backend/src/repositories/** [UNCHANGED] reused create()/addAddress()/addDocument() etc.; script-only Prisma for wallet/cart/wishlist/HRM where repo helpers re-query FKs per row
DATABASE_MIGRATION_AUDIT.md [DONE] Stage 3 Step 3 section added
REFACTOR_MAP.md [DONE] this section
SYSTEM_ENTERPRISE_AUDIT.md [DONE] Stage 3 Step 3 note added
README.md [DONE] Stage 3 Step 3 backfill note

# PostgreSQL migration — Stage 3 Step 4: Backfill Admin + Product + gap repair: 2026-09-14

backend/scripts/backfill/runBackfill.js [MOD] runStep4Group() — Admin backfill with bcrypt pass-through verification, Product + variants/cost/embedded reviews, HRM re-attempt, CartItem/Review/WishlistItem gap repair, staffUsername fallback in resolveStaffSubjectFromMaps
backend/scripts/backfill/verifyBackfill.js [MOD] Admin/Product counts, product sub-resource verification, gap-repair health check
backend/scripts/backfill/backfillRunner.js [UNCHANGED]
backend/src/repositories/** [UNCHANGED] — admin isHashed() confirmed preserves Mongo bcrypt digests on backfill
DATABASE_MIGRATION_AUDIT.md [DONE] Stage 3 Step 4 section added
REFACTOR_MAP.md [DONE] this section
SYSTEM_ENTERPRISE_AUDIT.md [DONE] Stage 3 Step 4 note added
README.md [DONE] Stage 3 Step 4 backfill note

# Orphaned Attendance (nurjahan) — permanent gap documented: 2026-09-15

DATABASE_MIGRATION_AUDIT.md [MOD] Stage 3 Step 4 — corrected staffUsername/re-run assumption; Attendance 6aa42b47265447ac6ddf014e marked PERMANENTLY EXCLUDED
tests/hrm.test.js [MOD] local calendar date for today-stats assertions + nurjahan orphan comments (in-memory Mongo tests; endpoints read Mongo only)
REFACTOR_MAP.md [DONE] this section

# PostgreSQL migration — Stage 3 Step 5: Backfill Order (FINAL — Stage 3 complete): 2026-09-15

backend/scripts/backfill/runBackfill.js [MOD] runStep5Group()/backfillOrders() — Case A/B/C classifyOrder(), mapOrderInputFromMongo() (4 FK maps: user/product/paymentMethod/admin; methodId+reviewedBy resolved that repo createFromMongo does not), Case C repairOrderChildren()/repairMissingOrderItems() (lineKey-matched), hasMongoPaymentData/hasMongoProofData/mongoIpnCount helpers; both subTotal+subtotal passed through
backend/scripts/backfill/verifyBackfill.js [MOD] Order added to COUNT_MODELS + verifyOrderFinancials() — SUM(grandTotal)/SUM(totalAmount) Mongo vs PG (legacyId-not-null excludes test rows), Mongo-has-payment/PG-missing-OrderPayment check, child-row counts; PASS/FAIL close-out gate
backend/scripts/backfill/backfillRunner.js [UNCHANGED]
backend/src/repositories/** [UNCHANGED] reused createWithStagedWrites/updatePaymentByLegacyId/upsertPaymentProofByLegacyId/updateNotificationsByLegacyId/syncReturnItemsByLegacyId/addPaymentIpnEventByLegacyId/splitOrderItem as-is
Result: 25 orders — Case A=25, B=0, C=0, failed=0; SUM(grandTotal) Mongo 129464 == PG 129464 (diff 0); 0 Mongo-has-payment orders missing PG OrderPayment; npm test 169/169; test:repositories 157/157
STAGE 3 (BACKFILL) COMPLETE — all 8 dependency groups backfilled; permanent gaps: 3 users missing firstName, 1 orphaned Attendance (nurjahan)
DATABASE_MIGRATION_AUDIT.md [DONE] Stage 3 Step 5 section + close-out added
SYSTEM_ENTERPRISE_AUDIT.md [DONE] Stage 3 Step 5 / Stage 3 complete note added
README.md [DONE] Stage 3 complete backfill note

# PostgreSQL migration — Stage 4 Step 1: Read-cutover framework + group 1 (Category/Brand/Supplier/Warehouse/Designation): 2026-09-15

backend/src/config/readCutoverFlags.js [NEW] per-group READ_PG_* env flags; isPgReadEnabled() reads process.env per call; all default OFF
backend/src/services/readRouter.js [NEW] routedRead(group, mongoFn, pgFn) — Postgres with [READ-CUTOVER-FALLBACK] Mongo fallback on error
backend/src/services/readShapeHelpers.js [NEW] toMongoShape transforms (_id ← legacyId, enum/status normalisation, category parent resolution)
backend/src/controllers/categoryController.js [MOD] 7 read endpoints wired via routedRead (writes unchanged)
backend/src/controllers/brandController.js [MOD] getBrands read wired; cache bypass when READ_PG_BRAND=true
backend/src/controllers/admin/supplierController.js [MOD] getAllSuppliers + getSupplierById reads wired
backend/src/controllers/admin/warehouseController.js [MOD] getAllWarehouses + getWarehouseById reads wired
backend/src/controllers/admin/designationController.js [MOD] getAllDesignations read wired
tests/services/readRouter.test.js [NEW] flag off/on + fallback mechanism tests
tests/services/readShapeHelpers.test.js [NEW] group-1 shape parity unit tests
tests/services/readCutoverGroup1.test.js [NEW] mocked flag-ON vs Mongo field-set regression
.env.example [MOD] READ_PG_CATEGORY/BRAND/SUPPLIER/WAREHOUSE/DESIGNATION documented (commented, default false)
Result: npm test 183/183 (169 prior + 14 new); test:repositories 157/157; all flags OFF in production — capability built, not enabled
DATABASE_MIGRATION_AUDIT.md [DONE] STAGE 4, STEP 1 section added
SYSTEM_ENTERPRISE_AUDIT.md [DONE] Stage 4 Step 1 note added
README.md [DONE] test count + Stage 4 Step 1 note

# PostgreSQL migration — Stage 4 Step 1 cleanup: Data parity fix — 2026-09-15

backend/src/repositories/categoryRepository.js [MOD] create() defaults isActive to false when undefined (matches Mongo query semantics)
tests/repositories/category.repository.test.js [MOD] create() test expects isActive false
tests/repositories/designation.repository.test.js [MOD] createTestDesignation() with unique legacyId; afterEach PREFIX cleanup
tests/repositories/warehouse.repository.test.js [MOD] beforeAll snapshot + afterEach/afterAll restore isDefault/updatedAt on all warehouses
tests/repositories/jestCompat.js [MOD] export beforeAll (node:test before hook)
Postgres data (Neon, not in git): deleted 2 designation test rows by exact pgId; synced Category isActive (9 changed), timestamps (14+1+1+8 rows), Warehouse isDefault
Result: npm test 183/183; test:repositories 157/157; re-verification — Supplier PASS; Category/Brand/Warehouse/Designation FAIL on shape/out-of-scope fields only (__v, slug, productCount, brand backfill fields)
DATABASE_MIGRATION_AUDIT.md [DONE] STAGE 4, STEP 1 CLEANUP section added
SYSTEM_ENTERPRISE_AUDIT.md [DONE] Stage 4 Step 1 cleanup note added
README.md [DONE] Stage 4 cleanup note

# Stage 4 Step 3 — Root cause fixed + data sync complete — 2026-09-16

scripts/stage4-step3-sync-missing-security-audit.local.js [NEW] Postgres-only sync — 16 SecurityLog + 48 StockAlert post-cutoff gaps
backend/src/controllers/admin/backupController.js [MOD] resourceType setting; actor/ipAddress for logSecurityEvent
DATABASE_MIGRATION_AUDIT.md [DONE] STAGE 4 STEP 3 root-cause + sync + deployment note section
SYSTEM_ENTERPRISE_AUDIT.md [DONE] Step 3 sync complete note
Result: HTTP verify PASS all 4 Security/Audit models; npm test 204/204; test:repositories 157/157; READ_PG_* flags OFF

# StockAlert dual-write ordering fix — 2026-09-15

backend/src/services/stockAlertService.js [MOD] persist StockAlert (Mongo+Postgres) BEFORE email/SMS/WhatsApp; each notification in isolated try/catch; [STOCK-ALERT-DUAL-WRITE-SUCCESS] log after Postgres create
Result: npm test 204/204; test:repositories 157/157

# PostgreSQL migration — Stage 4 Step 3 cron dual-write fix — 2026-09-15

backend/src/config/postgresBootstrap.js [NEW] ensurePostgresReady — reload root .env + ping Neon before cron dual-writes
backend/src/utils/cronJobRunner.js [NEW] scheduleCronHandler / runCronJob — [CRON-START|DONE|FAIL] logging + Postgres bootstrap
backend/src/config/prismaClient.js [MOD] dotenv loads repo-root .env (not cwd-relative)
backend/src/services/dualWriteService.js [MOD] reload env + assert DATABASE_URL_POOLED before Postgres mirror; source/stack in [DUAL-WRITE-FAILURE]
backend/src/utils/securityLogger.js [MOD] source param (cron:courierSync); clearer Mongo failure logs
backend/src/services/stockAlertService.js [MOD] cronJobRunner wrapper; explicit create payload (no ...plain spread)
backend/src/jobs/courierSyncJob.js [MOD] cronJobRunner wrapper; logSecurityEvent source=cron:courierSync
backend/src/server.js [MOD] ensurePostgresReady before registering crons
backend/src/utils/validateEnv.js [MOD] DATABASE_URL_POOLED required at boot
Result: npm test 204/204; test:repositories 157/157; cronJobRunner path verified (Mongo + Postgres legacyId match)

# PostgreSQL migration — Stage 4 Step 3: Read-cutover Security/Audit group — 2026-09-15

backend/src/config/readCutoverFlags.js [MOD] READ_PG_SECURITYLOG/LOGINATTEMPT/BLACKLISTEDIP/STOCKALERT (default OFF)
backend/src/services/readShapeHelpers.js [MOD] securityLog, loginAttempt, blacklistedIp, stockAlert toMongoShape (+ kind reassembly)
backend/src/services/securityAuditReadService.js [NEW] centralized routed reads for security/audit group
backend/src/repositories/securityLogRepository.js [MOD] count, distinctActors, staff audit groupBy helpers; distinctActors Prisma fix
backend/src/repositories/loginAttemptRepository.js [MOD] count, aggregateTopFailedIps, buildWhere
backend/src/repositories/blacklistedIpRepository.js [MOD] findActiveByIp, countActive
backend/src/repositories/stockAlertRepository.js [MOD] findPaginated, findByLegacyId, countAll
backend/src/middlewares/adminSecurity.js [MOD] hot-path findActiveBan + intrusion count via securityAuditReadService
backend/src/controllers/admin/blacklistController.js [MOD] getBlacklist routed read
backend/src/controllers/admin/loginHistoryController.js [MOD] routed read
backend/src/controllers/admin/securityMonitorController.js [MOD] routed read
backend/src/controllers/admin/activityFeedController.js [MOD] routed read
backend/src/controllers/admin/staffAuditController.js [MOD] routed read
backend/src/controllers/admin/adminProfileController.js [MOD] getSecurityLogs routed read
backend/src/controllers/admin/enterpriseSummaryController.js [MOD] security log count routed read
backend/src/services/emergencyService.js [MOD] blocked IP / login attempt / security log reads routed
tests/services/readCutoverGroup3.test.js [NEW] 6 tests — shape parity, null expiresAt, kind reassembly, flag-ON mocks
.env.example [MOD] Stage 4 Step 3 READ_PG_* flags documented (commented, default false)
Result: npm test 204/204; test:repositories 157/157; verification — LoginAttempt PASS, BlacklistedIP PASS; SecurityLog DATA PARITY FAIL (post-backfill dual-write gaps); StockAlert repo-level DATA PARITY FAIL (no HTTP read endpoint)
DATABASE_MIGRATION_AUDIT.md [DONE] STAGE 4, STEP 3 section added
SYSTEM_ENTERPRISE_AUDIT.md [DONE] Stage 4 Step 3 note added
README.md [DONE] test count 204

# PostgreSQL migration — Stage 4 Step 2 cleanup: Data sync + live threshold bug fix — 2026-09-15

backend/src/utils/announcementSettings.js [MOD] resolveFreeShippingThreshold — null/undefined threshold falls through to freeShippingMinAmount (live Mongo bug fix)
backend/src/services/readShapeHelpers.js [MOD] settingsToMongoShape Number() coercion + freeShippingThreshold fallback
tests/utils/announcementSettings.test.js [NEW] 4 tests for threshold null-handling
tests/repositories/footerSettings.repository.test.js [MOD] beforeAll Mongo copyright snapshot + afterAll Postgres restore
Postgres data (Neon, not in git): PageContent 7-row timestamp sync; FooterSettings full upsertFromMongo resync; Settings timestamp sync (freeShippingThreshold kept 1000)
Result: re-verification — PageContent/FooterSettings/Settings PASS; master-settings ACCEPTED (serverNow only); npm test 198/198; test:repositories 157/157
DATABASE_MIGRATION_AUDIT.md [DONE] STAGE 4, STEP 2 CLEANUP section added
SYSTEM_ENTERPRISE_AUDIT.md [DONE] Step 2 cleanup note
README.md [DONE] test count 198

# PostgreSQL migration — Stage 4 Step 2: Read-cutover CMS/Settings group — 2026-09-15

backend/src/config/readCutoverFlags.js [MOD] READ_PG_PAGECONTENT/NAVBARLINK/FOOTERSETTINGS/BANNER/SETTINGS (default OFF)
backend/src/services/readShapeHelpers.js [MOD] PageContent, NavbarLink, FooterSettings, Banner, Settings toMongoShape helpers
backend/src/services/settingsReadService.js [NEW] fetchSettingsDocument() routed singleton read
backend/src/controllers/pageContentController.js [MOD] admin + public page reads wired; cache bypass when READ_PG_PAGECONTENT=true
backend/src/controllers/navbarLinkController.js [MOD] public + admin navbar reads wired; cache bypass when READ_PG_NAVBARLINK=true
backend/src/controllers/footerSettingsController.js [MOD] admin/public/payment-badges reads wired; exports fetchPublicFooterPayload
backend/src/controllers/bannerController.js [MOD] getActiveBanners + getAllBanners (+ BannerSettings) wired
backend/src/controllers/settingsController.js [MOD] getSettings, getAllSettings use fetchSettingsDocument
backend/src/controllers/masterSettingsController.js [MOD] getMasterSettings, getAnnouncementSettings use fetchSettingsDocument
backend/src/controllers/storeController.js [MOD] footer/page/delivery/announcement/cache/health settings reads wired
backend/src/services/deliveryChargeService.js [MOD] getDeliverySettings + getVatSettings use fetchSettingsDocument
backend/src/services/flashSaleService.js [MOD] loadFlashSaleSettings uses fetchSettingsDocument
backend/src/utils/rewardSettings.js [MOD] loadRewardSettings uses fetchSettingsDocument
backend/src/middlewares/rateLimiter.js [MOD] loadRateLimitSettings uses fetchSettingsDocument
tests/services/readCutoverGroup2.test.js [NEW] CMS/Settings mocked flag-ON shape parity + null-vs-absent checks
tests/services/readShapeHelpers.test.js [MOD] banner/settings/footer shape unit tests
.env.example [MOD] Stage 4 Step 2 READ_PG_* flags documented (commented, default false)
Result: npm test 194/194; test:repositories 157/157; verification — NavbarLink PASS, Banner PASS; PageContent/FooterSettings/Settings DATA PARITY FAIL (timestamp/sync drift — see DATABASE_MIGRATION_AUDIT.md)
DATABASE_MIGRATION_AUDIT.md [DONE] STAGE 4, STEP 2 section added
SYSTEM_ENTERPRISE_AUDIT.md [DONE] Stage 4 Step 2 note added
README.md [DONE] test count 194 + Stage 4 Step 2 note

# PostgreSQL migration — Stage 4 Step 1 close-out: Option C shape + productCount + legacy exceptions — 2026-09-15

backend/src/services/readShapeHelpers.js [MOD] Category Tier 1 omit-null/absent-parent; categoryTreeSelectFields aligned
backend/scripts/backfill/syncCategoryProductCount.js [NEW] one-time Category productCount Mongo→Postgres sync (Fashion 0→9; 5 with Mongo key, 9 without)
tests/services/readShapeHelpers.test.js [MOD] expect omitted customCashback when null
Result: Supplier/Warehouse/Designation exact PASS; Category/Brand ACCEPTED with documented legacy exceptions; npm test 183/183; test:repositories 157/157
DATABASE_MIGRATION_AUDIT.md [DONE] Option C section + Step 1 CLOSED statement + customCashbackPercentage follow-up flag

# PostgreSQL migration — Stage 4 Step 6: Read-cutover User + owned tables — 2026-09-16

backend/src/config/readCutoverFlags.js [MOD] READ_PG_USER, ADDRESS, WISHLIST, WALLET, CART
backend/src/services/readShapeHelpers.js [MOD] user/address/wishlist/wallet/cart ToMongoShape helpers
backend/src/services/userReadService.js [NEW] routed reads for User group + composite profile bundle
backend/src/repositories/userRepository.js [MOD] listWalletTransactions, countReferralsByReferredByLegacyId, mongo cursor, listAddresses sort, findAll take
backend/src/repositories/cartRepository.js [MOD] findCartWithItemsByUserLegacyId
backend/src/controllers/userProfileController.js [MOD] getUserProfile, getAddresses reads wired
backend/src/controllers/userWishlistController.js [MOD] getWishlist read wired
backend/src/controllers/cartController.js [MOD] getCart read wired
backend/src/controllers/orderCustomerController.js [MOD] getDashboardStats wallet/points reads wired
backend/src/controllers/admin/customerAdminController.js [MOD] getAllCustomers, getCustomerById reads wired
backend/src/controllers/referralController.js [MOD] getReferralInfo reads wired
tests/services/readCutoverGroup6.test.js [NEW] User group shape parity (8 tests)
.env.example [MOD] Stage 4 Step 6 READ_PG_* flags documented
Result: CartItem gap 0/7; wishlist + wallet PASS live; referralCode/address createdAt data drift documented — flags stay OFF pending sync
DATABASE_MIGRATION_AUDIT.md [DONE] STAGE 4, STEP 6 section added
README.md [DONE] test count 228

# PostgreSQL migration — Stage 4 Step 6 data sync + re-verification PASS — 2026-09-16
backend/src/services/readShapeHelpers.js [MOD] userToMongoShape toObject/lean modes; wallet referenceOrder default ''; lean sparse-field parity
backend/src/services/userReadService.js [MOD] profile toObject shape; admin list lean; legacyId sort tie-break
backend/src/repositories/userRepository.js [MOD] LIST_SELECT OTP fields; findAll legacyId cursor/sort
scripts/stage4-step6-user-data-sync.local.js [NEW local] User/Address/Wallet backfill + full scalar sync
scripts/verify-read-cutover-group6.local.js [NEW local] live HTTP verify with cosmetic normalizers
Result: live HTTP 8/8 PASS, 0 fallbacks; flags remain OFF; npm test 228/228; test:repositories 157/157
DATABASE_MIGRATION_AUDIT.md [MOD] Phase 2 sync + re-verification PASS section
SYSTEM_ENTERPRISE_AUDIT.md [MOD] Step 6 status COMPLETE

# PostgreSQL migration — Stage 4 Step 7 Part A: Order read-cutover (reassembly + unit tests, live HTTP deferred to Part B) — 2026-09-17
backend/src/config/readCutoverFlags.js [MOD] order: READ_PG_ORDER (default OFF)
backend/src/repositories/orderRepository.js [MOD] findOrderDetailedByLegacyId() full 7-table reassembly; findAllDetailed() list-view optimization; exports
backend/src/controllers/orderCustomerController.js [MOD] getMyOrders, getOrderById, downloadOrderInvoice, trackOrder, getDashboardStats via routedRead()
backend/src/controllers/orderAdminController.js [MOD] getOrders admin list via routedRead()
tests/repositories/order.readcutover.test.js [NEW] 9 unit tests for reassembly shape parity (subTotal+subtotal, extraFields flatten, out_for_delivery, __v)
Result: npm test 228/228, test:repositories 157/157; reassembly function complete; flag OFF; live HTTP verification DEFERRED to Part B
DATABASE_MIGRATION_AUDIT.md [MOD] Stage 4 Step 7 Part A section added
REFACTOR_MAP.md [MOD] this entry

# PostgreSQL migration — Stage 4 Step 7 Part B: Order live verification — 2026-09-17

scripts/verify-order-read-cutover.local.js [NEW] repository-level verification (5 real orders, 100% PASS)
scripts/verify-order-read-cutover-http.local.js [NEW] full HTTP endpoint verification (6 endpoints, field-level parity, 0 fallbacks)
scripts/search-unverified-cases-wide.local.js [NEW] full database search (10 null productId items found, 0 return items)
scripts/verify-null-product-case.local.js [NEW] null productId case verification (1 order, PASS)
backend/src/repositories/orderRepository.js [MOD] user legacy ID resolution, list/detail parity (payment proof, notifications, item overlay, defaults)
backend/src/services/orderListShapeHelpers.js [NEW] Prisma-free mongoLeanToListSummary / omitNullFields / notificationsToMongooseShape
backend/src/controllers/orderCustomerController.js [MOD] getOrderById via routedRead; Mongo list paths use orderListShapeHelpers (Jest-safe)
backend/src/controllers/orderAdminController.js [MOD] admin list Mongo path uses orderListShapeHelpers
Result: 6/6 HTTP endpoints PASS (my-orders, :id×2, invoice, track, dashboard-stats, admin list); 3/4 edge cases verified; return items accepted gap; npm test 228/228; test:repositories 157/157; ready for ops sign-off
DATABASE_MIGRATION_AUDIT.md [MOD] Stage 4 Step 7 Part B HTTP verification section (corrected from repository-only claim)
REFACTOR_MAP.md [MOD] this entry

# PostgreSQL migration — Stage 4 Step 5: Read-cutover Marketing/Support group — 2026-09-16

backend/src/config/readCutoverFlags.js [MOD] READ_PG_NEWSLETTER, EMAILCAMPAIGN, CONTACTMESSAGE, REVIEW
backend/src/services/readShapeHelpers.js [MOD] newsletter/emailCampaign/contactMessage/review ToMongoShape helpers
backend/src/services/marketingSupportReadService.js [NEW] routed reads for Marketing/Support group
backend/src/repositories/newsletterRepository.js [MOD] count, countByIsActive, findPaginated
backend/src/repositories/emailCampaignRepository.js [MOD] findAll includes createdBy
backend/src/repositories/contactMessageRepository.js [MOD] count, countUnreadInbox, aggregateTicketStats
backend/src/repositories/reviewRepository.js [MOD] count, findPaginated, buildReviewWhere
backend/src/controllers/newsletterAdminController.js [MOD] listSubscribers, listCampaigns reads wired
backend/src/controllers/contactController.js [MOD] listContactMessages, getTicketStats reads wired
backend/src/controllers/reviewController.js [MOD] getReviewsByProduct read wired
backend/src/controllers/reviewAdminController.js [MOD] getAllReviews read wired
tests/services/readCutoverGroup5.test.js [NEW] Marketing/Support shape parity (8 tests)
.env.example [MOD] Stage 4 Step 5 READ_PG_* flags documented
Result: live HTTP verify PASS after timestamp sync + review shape normalizers; Review null-userId 0/2; npm test 220/220
DATABASE_MIGRATION_AUDIT.md [DONE] STAGE 4, STEP 5 section added
README.md [DONE] test count 220

# PostgreSQL migration — Stage 4 Step 4 parity fixes + live HTTP PASS — 2026-09-16
backend/src/repositories/employeeRepository.js [MOD] aggregateStats post-groupBy JS sort; findAll includeNested (documents/references/linkedAdmin)
backend/src/services/readShapeHelpers.js [MOD] employeeToMongoShape full lean/toObject parity; PG enum mappers; mongoVersion __v
backend/src/services/hrmReadService.js [MOD] list reads use includeNested
prisma/schema.prisma [MOD] Employee.mongoVersion column
tests/services/readCutoverGroup4.test.js [MOD] +1 enum parity test (8 tests total)
scripts/stage4-step4-hrm-data-sync.local.js [NEW local] Postgres-only HRM timestamp/FK/enum/attendance sync
DATABASE_MIGRATION_AUDIT.md [MOD] Step 4 live HTTP verification PASS section
SYSTEM_ENTERPRISE_AUDIT.md [MOD] Step 4 parity fixes note
README.md [MOD] test count 212

# PostgreSQL migration — Stage 4 Step 4: Read-cutover HRM group (polymorphic staff) — 2026-09-16

backend/src/config/readCutoverFlags.js [MOD] READ_PG_EMPLOYEE, ATTENDANCE, PAYROLL, LEAVE
backend/src/services/readShapeHelpers.js [MOD] employee/attendance/payroll/leave ToMongoShape + buildHrmStaffLegacyMaps
backend/src/services/hrmReadService.js [NEW] routed reads for HRM group; lazy PG staff resolver
backend/src/repositories/employeeRepository.js [MOD] count, aggregateStats, findDetailed
backend/src/repositories/attendanceRepository.js [MOD] count, countTodayStats, aggregateMonthlySummary, staffOr filter
backend/src/repositories/payrollRepository.js [MOD] count, aggregateRollup, staffOr filter
backend/src/repositories/leaveRepository.js [MOD] count, countPending, aggregateBalanceByStaff, findCalendarLeaves
backend/src/controllers/admin/employeeController.js [MOD] getAllEmployees, getEmployeeStats, getEmployeeById, getEmployeeProfile reads wired
backend/src/controllers/admin/attendanceController.js [MOD] getAttendanceList, getAttendanceSummary reads wired
backend/src/controllers/admin/payrollController.js [MOD] getAllPayrolls read wired
backend/src/controllers/admin/leaveController.js [MOD] getAllLeaves, getLeaveBalance, getLeaveCalendar reads wired
tests/services/readCutoverGroup4.test.js [NEW] HRM shape parity + polymorphic staffId tests (7 tests)
.env.example [MOD] Stage 4 Step 4 READ_PG_* flags documented
Result: npm test 211/211; test:repositories 157/157; verification script scripts/verify-read-cutover-group4.local.js (local)
DATABASE_MIGRATION_AUDIT.md [DONE] STAGE 4, STEP 4 section added
SYSTEM_ENTERPRISE_AUDIT.md [DONE] Stage 4 Step 4 note added
README.md [DONE] test count 211 + Stage 4 Step 4 note

# PostgreSQL migration — Stage 2 Step 3, Part 2.4 — PurchaseOrder dual-write — 2026-09-20
backend/src/repositories/purchaseOrderRepository.js [NEW] upsert/get/list/updateStatus/delete + item sync
backend/src/controllers/admin/purchaseOrderController.js [MOD] dual-write on create/update/receive/cancel; PG read when READ_PG_PURCHASE_ORDER=true
backend/src/config/readCutoverFlags.js [MOD] READ_PG_PURCHASE_ORDER flag (default OFF)
backend/scripts/backfill/backfillPurchaseOrders.js [NEW] batch-100 idempotent PO+items backfill
tests/repositories/purchaseOrderRepository.test.js [NEW] 7 integration tests (node --test)

# PostgreSQL migration — Stage 2 Step 3, Part 2.5 — Shift/Note/Notification/Session dual-write — 2026-09-20
backend/src/repositories/shiftRepository.js [NEW] upsert/get/list/delete + ShiftAssignment sync
backend/src/repositories/noteRepository.js [NEW] upsert/get/list/delete + NoteShoppingItem sync
backend/src/repositories/adminNotificationRepository.js [NEW] upsert/list/markRead/delete
backend/src/repositories/userSessionRepository.js [NEW] upsert/getByToken/delete/deleteExpired
backend/src/repositories/adminSessionRepository.js [NEW] upsert/getByToken/delete/deleteExpired
backend/src/controllers/admin/attendanceController.js [MOD] shift dual-write on create/update/delete
backend/src/controllers/noteController.js [MOD] note dual-write on create/update/delete
backend/src/services/notificationService.js [MOD] notification dual-write on create
backend/src/controllers/admin/notificationController.js [MOD] mark read dual-write
backend/src/controllers/auth/loginController.js [MOD] user session dual-write
backend/src/controllers/auth/authHelpers.js [MOD] user session dual-write
backend/src/middlewares/authMiddleware.js [MOD] session heartbeat dual-write
backend/src/controllers/admin/authController.js [MOD] admin session dual-write
backend/src/controllers/admin/sessionController.js [MOD] admin session delete dual-write
backend/src/controllers/admin/customerAdminController.js [MOD] user session purge dual-write
backend/src/config/readCutoverFlags.js [MOD] READ_PG_SHIFT, NOTE, ADMIN_NOTIFICATION, USER_SESSION, ADMIN_SESSION
backend/scripts/backfill/backfillShifts.js [NEW]
backend/scripts/backfill/backfillNotes.js [NEW]
backend/scripts/backfill/backfillAdminNotifications.js [NEW] no-op (fresh start)
backend/scripts/backfill/backfillUserSessions.js [NEW] no-op (ephemeral)
backend/scripts/backfill/backfillAdminSessions.js [NEW] no-op (ephemeral)
tests/repositories/shiftRepository.test.js [NEW] 5 tests
tests/repositories/noteRepository.test.js [NEW] 5 tests
tests/repositories/adminNotificationRepository.test.js [NEW] 4 tests
tests/repositories/userSessionRepository.test.js [NEW] 4 tests
tests/repositories/adminSessionRepository.test.js [NEW] 4 tests

# PostgreSQL migration — Stage 2 Step 3, Part 2.6 — PG TTL sweep job — 2026-09-20
backend/src/repositories/loginAttemptRepository.js [MOD] deleteExpiredLoginAttemptsFromPG() (30-day retention)
backend/src/repositories/blacklistedIpRepository.js [MOD] deleteExpiredBlacklistedIpsFromPG()
backend/src/jobs/pgTtlSweepJob.js [NEW] daily 02:00 TTL sweep (login attempts, bans, sessions)
backend/src/server.js [MOD] register startPgTtlSweepCron()
tests/repositories/pgTtlSweep.test.js [NEW] 4 tests

# PostgreSQL migration — Stage 4 Step 1, Part 3.1 — Analytics aggregate → Prisma — 2026-09-20
backend/src/config/readCutoverFlags.js [MOD] READ_PG_FINANCE_ANALYTICS, READ_PG_PROFIT_LOSS, READ_PG_ACCOUNTS_SUMMARY, READ_PG_CRM, READ_PG_ENTERPRISE_SUMMARY
backend/src/repositories/expenseRepository.js [MOD] getTotalExpensesAllFromPG()
backend/src/repositories/purchaseOrderRepository.js [MOD] sumOpenPurchaseOrderTotalFromPG(), countOpenPurchaseOrdersFromPG()
backend/src/repositories/orderRepository.js [MOD] export fromOrderPaymentStatusEnum
backend/src/controllers/financeAnalyticsController.js [MOD] PG metrics path + aggregateFinanceByDateRange cutover
backend/src/controllers/admin/profitLossController.js [MOD] expense $group → getExpenseSummaryByCategory
backend/src/controllers/admin/accountsSummaryController.js [MOD] expense/PO $sum aggregates → Prisma
backend/src/controllers/admin/crmController.js [MOD] abandoned-cart counts → Prisma cart queries
backend/src/controllers/admin/enterpriseSummaryController.js [MOD] KPI countDocuments → Prisma counts

# PostgreSQL migration — Stage 4 Step 1, Part 3.2 — Master verification script — 2026-09-20
backend/scripts/verifyFullMigration.js [NEW] pre-launch Mongo vs PG count + financial + flag report

# PostgreSQL migration — Stage 4 Step 1, Part 3.2b — Verification fixes — 2026-09-20
backend/scripts/ops/cleanTestDataFromPG.js [NEW] delete orphaned PG categories/orders/carts + cart re-sync
backend/scripts/verifyFullMigration.js [MOD] skip AdminNotification + Settings from mismatch verdict

# PostgreSQL migration — Stage 4 Step 1, Part 3.3 — Flag rollout system — 2026-09-20
backend/scripts/ops/enableFlags.js [NEW] CLI doctl env commands + --status
backend/scripts/ops/monitorCutover.js [NEW] live cutover fallback / dual-write dashboard
backend/docs/ROLLOUT_GUIDE.md [NEW] pre-launch production rollout steps
backend/docs/DECOMMISSION_GUIDE.md [NEW] Phase 4 Mongo decommission runbook

# DevOps — Jest + Prisma ESM compatibility fix — 2026-09-20
tests/mocks/prismaGeneratedClient.js [NEW] CJS PrismaClient mock for Jest (substitutes generated/prisma/client.mts)
tests/setup.js [MOD] configureTestEnv before backend requires; pin READ_PG_* to 'false'
tests/app.js [MOD] re-pin READ_PG_* after dotenv.config()
package.json [MOD] jest.moduleNameMapper for generated/prisma/client.mts
docs/audit/DEVOPS_AUDIT.md [MOD] Jest fix documented in Change Log + File Inventory

# Documentation — Audit System Initialized — 2026-09-20
.cursorrules [MOD] full rewrite: Project Identity, Audit File Map, Auto-Audit Rules (5 steps), Database Rules (PG primary), Code Placement, Testing, New Feature Checklist, Commit Format, Final Checklist
docs/audit/ADMIN_PANEL_AUDIT.md [MOD] codebase scan — File Inventory (46 partials, 53 modules), Feature Checklist
docs/audit/CUSTOMER_FRONTEND_AUDIT.md [MOD] codebase scan — 21 HTML pages, profile/checkout/PDP modules
docs/audit/AUTH_SECURITY_AUDIT.md [MOD] codebase scan — auth controllers, RBAC, 2FA, PG session repos
docs/audit/HRM_AUDIT.md [MOD] codebase scan — full /api/admin/hrm/* stack + repos + tests
docs/audit/ORDERS_AUDIT.md [MOD] codebase scan — 14 order routes, PG reassembly notes
docs/audit/PRODUCTS_AUDIT.md [MOD] codebase scan — catalog + ERP repos and admin UI
docs/audit/PAYMENTS_FINANCE_AUDIT.md [MOD] codebase scan — gateways, P&L, wallet, expenses
docs/audit/CMS_AUDIT.md [MOD] codebase scan — banners, pages, navbar, footer, branding
docs/audit/MARKETING_AUDIT.md [MOD] codebase scan — coupons, newsletter, CRM; UltraMsg suspended
docs/audit/CHAT_AUDIT.md [MOD] codebase scan — 37 ecommerce-chat files + close/session findings
docs/audit/DEVOPS_AUDIT.md [MOD] codebase scan — Docker, Nginx, PM2, CI, migration ops
CHAT_AUDIT.md [MOD] redirect stub → docs/audit/CHAT_AUDIT.md
ARCHITECTURE.md [MOD] Documentation Index — docs/audit/ area audit table
SYSTEM_ENTERPRISE_AUDIT.md [MOD] "## Audit System Initialized — 2026-09-20"
README.md [MOD] docs/audit/ directory index + Last updated date

# Admin-Employee Profile Link — 2026-09-20
backend/src/config/readCutoverFlags.js [MOD] READ_PG_ADMIN flag
backend/src/repositories/adminRepository.js [MOD] getAdminWithEmployeeData, linkEmployeeToAdmin, buildAdminEmployeeProfileShape
backend/src/repositories/employeeRepository.js [MOD] update() supports photo + photoPublicId
backend/src/controllers/admin/adminProfileController.js [MOD] getAdminProfileFull, linkAdminEmployee, photo/name sync helpers
backend/src/controllers/admin/employeeController.js [MOD] uploadEmployeePhoto syncs linked admin image + photoUpdated flag
backend/src/routes/adminRoutes.js [MOD] GET /profile/me/full, PUT /profile/link-employee
client/js/admin/modules/adminSidebar.js [NEW] loadAdminSidebarProfile, updateSidebarDisplay, clearAdminSidebarCache
client/js/admin/admin-core.js [MOD] import adminSidebar module
client/js/admin/modules/core-boot.js [MOD] fetchAdminProfile delegates to loadAdminSidebarProfile
client/js/admin/modules/core-nav.js [MOD] sidebar refresh on photo upload; clear cache on logout
client/js/admin/modules/settings-cms.js [MOD] refresh sidebar after profile save
client/js/admin/modules/settings-platform.js [MOD] applyAdminSettingsToUI uses updateSidebarDisplay
client/js/admin/modules/hrm-employees.js [MOD] clearAdminSidebarCache after employee photo upload
client/admin/partials/view-settings.html [MOD] Link to Employee Record card (super-admin)
tests/repositories/admin.repository.test.js [MOD] getAdminWithEmployeeData + linkEmployeeToAdmin tests
docs/audit/ADMIN_PANEL_AUDIT.md [MOD] feature + change log
docs/audit/HRM_AUDIT.md [MOD] admin link + sync notes
docs/audit/AUTH_SECURITY_AUDIT.md [MOD] link security rules
SYSTEM_ENTERPRISE_AUDIT.md [MOD] Admin-Employee Profile Link section
README.md [MOD] feature note + Last updated

# Attendance System Upgrade — 2026-09-20
backend/src/models/attendance.js [MOD] leave status; modifiedBy, modifiedAt, isManualEntry
backend/src/models/attendanceLock.js [NEW] per-date lock (date, lockedAt, lockedBy, lockedByName)
backend/src/repositories/attendanceRepository.js [MOD] getDailySheet, bulkMarkAttendance, listManualEntries
backend/src/repositories/attendanceLockRepository.js [NEW] lockDate, unlockDate, getLockStatus, isDateLocked
backend/src/controllers/admin/attendanceController.js [MOD] daily-sheet, bulk-mark, manual-entry, lock/unlock; persistAttendanceMark + 423 lock guard
backend/src/routes/adminRoutes.js [MOD] GET /daily-sheet, POST /bulk-mark, POST /manual-entry, GET /manual-entries, lock routes
prisma/schema.prisma [MOD] AttendanceLock model; Attendance audit fields; LEAVE enum
prisma/migrations/20260920143000_attendance_upgrade/migration.sql [NEW]
client/admin/partials/view-hrm-attendance.html [MOD] Daily Sheet + Manual Entry tabs; leave in filters
client/js/admin/modules/hrm-attendance.js [MOD] daily sheet auto-save, lock UI, bulk mark, manual entry
client/css/admin/_hrm.css [MOD] status pills, split buttons, lock bar
tests/repositories/attendance.repository.test.js [MOD] getDailySheet + bulkMarkAttendance tests
tests/repositories/attendanceLock.repository.test.js [NEW] lockDate/isDateLocked/unlockDate tests
docs/audit/HRM_AUDIT.md [MOD] feature checklist + change log
SYSTEM_ENTERPRISE_AUDIT.md [MOD] Attendance System Upgrade section
README.md [MOD] Daily Sheet / lock / manual entry feature note

# Full HRM Audit — 2026-09-20 (audit-only, no code fixes)
docs/audit/HRM_AUDIT.md [MOD] full file inventory with ✅/⚠️/❌; Bug Report BUG 1 + BUG 2; status → PARTIAL (24/26 features)
SYSTEM_ENTERPRISE_AUDIT.md [MOD] "## HRM Full Audit — 2026-09-20" section; HRM audit row → ⚠️

# HRM Bug Fix — Sidebar sync + date restriction — 2026-09-20
backend/src/repositories/adminRepository.js [MOD] buildAdminEmployeeProfileShape prefers employee.fullName; getAdminWithEmployeeData PG employeeRef fallback via Mongo
backend/src/controllers/admin/employeeController.js [MOD] syncLinkedAdminName helper; updateEmployee syncs linked Admin name
backend/src/controllers/admin/attendanceController.js [MOD] assertStaffAttendanceDateAllowed; 403 on past-date mark/clock/bulk for staff
client/js/admin/modules/hrm-employees.js [MOD] sidebar cache clear + profile reload after every employee save
client/js/admin/modules/hrm-attendance.js [MOD] past-date view-only UI, max=today, hrmCanEditPastAttendanceDates
client/admin/partials/view-hrm-attendance.html [MOD] dailySheetPastDateBanner
tests/repositories/admin.repository.test.js [MOD] displayName expects linked employee fullName
docs/audit/HRM_AUDIT.md [MOD] BUG 1 + BUG 2 → FIXED; 26/26 features; status COMPLETE
SYSTEM_ENTERPRISE_AUDIT.md [MOD] "## HRM Bug Fix — 2026-09-20"
README.md [MOD] last updated date

# Production Bug Fix — 2026-09-20
backend/src/controllers/admin/enterpriseSummaryController.js [MOD] countLowStockProductsFromPG — "stockQuantity"/"lowStockThreshold" quoted column names
backend/src/routes/adminRoutes.js [MOD] adminProfileController direct import; /profile/me/full before /profile; daily-sheet before /hrm/attendance list
docs/audit/DEVOPS_AUDIT.md [MOD] production bug fix change log
SYSTEM_ENTERPRISE_AUDIT.md [MOD] "## Production Bug Fix — 2026-09-20"
README.md [MOD] last updated date

# HRM Attendance Edit Controls + Save Feedback — 2026-09-20
backend/src/middlewares/rbac.js [MOD] requireHrOrSuperAdmin, isHrOrSuperAdmin
backend/src/controllers/admin/attendanceController.js [MOD] updateAttendanceDetails, removeAttendanceRecord
backend/src/repositories/attendanceRepository.js [MOD] deleteByStaffAndDate
backend/src/routes/adminRoutes.js [MOD] PUT /attendance/update, DELETE /attendance/remove; manual-entry HR guard
client/js/admin/modules/core-boot.js [MOD] window.adminRole from sessionStorage; manual tab visibility hook
client/js/admin/modules/hrm-attendance.js [MOD] inline edit row, per-row feedback, showHrmToast, manual tab hide
client/js/admin/modules/hrm-employees.js [MOD] Save Employee Saving…/✓ Saved! button feedback
client/admin/partials/view-hrm-attendance.html [MOD] hrmManualEntryTab id
client/css/admin/_hrm.css [MOD] inline edit, row feedback, save error, toast styles
docs/audit/HRM_AUDIT.md [MOD] change log + feature checklist
SYSTEM_ENTERPRISE_AUDIT.md [MOD] "## HRM Attendance Edit Controls + Save Feedback — 2026-09-20"
README.md [MOD] last updated date

# Master Enterprise Audit — 2026-09-20 (audit-only, no code fixes)
docs/audit/MASTER_ENTERPRISE_AUDIT.md [NEW] full-stack deep scan — routes vs frontend, HRM Register bug, enterprise gap A–H, priority queue
SYSTEM_ENTERPRISE_AUDIT.md [MOD] "## Master Enterprise Audit — 2026-09-20"
REFACTOR_MAP.md [MOD] this entry

# Critical Bug Fix Group 1 — 2026-09-20
client/js/admin/modules/hrm-attendance.js [MOD] hrmFetchJson, register tab load, pagination, Set Now, Clock Out Now
client/admin/partials/view-hrm-attendance.html [MOD] pagination controls, Actions column, clock-out button
client/css/admin/_hrm.css [MOD] pagination, time-field, clock-out button styles
backend/src/controllers/admin/attendanceController.js [MOD] parsePagination default limit 50
backend/src/services/whatsappService.js [MOD] UltraMsg try/catch, WHATSAPP-SUSPENDED logging
backend/src/services/gatewayStatusService.js [NEW] cached gateway status (whatsapp/sms/email)
backend/src/controllers/settingsController.js [MOD] getGatewayStatus
backend/src/routes/adminRoutes.js [MOD] GET /settings/gateway-status, GET /system/backup-postgres
client/admin/partials/view-catalog.html [MOD] whatsappGatewayBanner
client/js/admin-newsletter.js [MOD] gateway status fetch, disable WhatsApp Send
client/css/admin/_products-catalog.css [MOD] gateway banner styles
backend/src/services/backupService.js [MOD] exportPostgresBackup (lazy archiver)
backend/src/controllers/admin/backupController.js [MOD] triggerPostgresBackup, streamBackupFile, getBackupStatus
backend/src/models/Settings.js [MOD] lastPostgresBackupAt
client/admin/partials/view-system-backup.html [MOD] PostgreSQL backup button
client/js/admin/modules/system-backup.js [MOD] downloadPostgresBackup
package.json [MOD] archiver dependency
docs/audit/MASTER_ENTERPRISE_AUDIT.md [MOD] 6 bugs → Fixed, 82% ready
docs/audit/HRM_AUDIT.md [MOD] register/pagination/clock UI fixes
docs/audit/MARKETING_AUDIT.md [MOD] WhatsApp gateway hardening
docs/audit/DEVOPS_AUDIT.md [MOD] PG backup + gateway status
SYSTEM_ENTERPRISE_AUDIT.md [MOD] "## Critical Bug Fix Group 1 — 2026-09-20"
README.md [MOD] last updated date

# High Priority Features Group 2 — 2026-09-20
backend/src/services/attendanceSettingsService.js [NEW] office hours, grace, weekend settings
backend/src/models/Settings.js [MOD] attendanceSettings field
backend/src/controllers/settingsController.js [MOD] getAttendanceSettings, updateAttendanceSettings
backend/src/controllers/admin/attendanceController.js [MOD] settings-based late detection + default check-in
backend/src/config/permissions.js [MOD] 15 granular permissions + PERMISSION_IMPLICATIONS + accountHasPermission
backend/src/models/admin.js [MOD] hasPermission uses accountHasPermission
backend/src/middlewares/rbac.js [MOD] checkPermission uses accountHasPermission
backend/src/controllers/staffController.js [MOD] updateStaffPermissions
backend/src/routes/staffRoutes.js [MOD] PUT /:id/permissions
backend/src/models/product.js [MOD] seoTitle, seoDescription, seoKeywords, previousPrice, restockedAt
backend/src/utils/productDualWriteHelpers.js [MOD] SEO + tracking fields
backend/src/repositories/productRepository.js [MOD] SEO fields in create/update PG
backend/src/controllers/productController.js [MOD] SEO save + price/stock tracking
backend/src/controllers/orderAdminController.js [MOD] bulkUpdateOrderStatus
backend/src/routes/adminRoutes.js [MOD] settings/attendance, orders/bulk-status, manual_attendance guard
backend/src/jobs/wishlistNotificationJob.js [NEW] daily wishlist email cron
backend/src/services/mailer.js [MOD] sendWishlistNotificationEmail
backend/src/models/wishlist.js [MOD] notification tracking fields
backend/src/server.js [MOD] wishlist cron bootstrap
prisma/schema.prisma [MOD] Product SEO + tracking columns
prisma/migrations/20260920160000_product_seo_wishlist/migration.sql [NEW]
client/admin/partials/view-hrm-attendance.html [MOD] Attendance Settings card
client/js/admin/modules/hrm-attendance.js [MOD] settings load/save, late detection, Present check-in
client/css/admin/_hrm.css [MOD] attendance settings styles
client/js/admin-staff.js [MOD] granular permission modules + presets
client/admin/partials/view-products.html [MOD] SEO input fields
client/js/admin/modules/products-form.js [MOD] SEO in create/update + preview
client/js/admin/modules/orders-actions.js [MOD] bulk status API
docs/audit/MASTER_ENTERPRISE_AUDIT.md [MOD] 89% ready, Group 2 done
docs/audit/HRM_AUDIT.md [MOD] attendance settings + granular RBAC
docs/audit/PRODUCTS_AUDIT.md [MOD] SEO persistence
docs/audit/ORDERS_AUDIT.md [MOD] bulk status
docs/audit/MARKETING_AUDIT.md [MOD] wishlist job
SYSTEM_ENTERPRISE_AUDIT.md [MOD] "## High Priority Features Group 2 — 2026-09-20"
README.md [MOD] last updated date

## Medium Priority Group 3 — 2026-09-20

backend/src/services/invoiceService.js [NEW] branded PDF invoice generation
backend/src/services/exportService.js [NEW] Excel + PDF export helpers
backend/src/services/healthService.js [NEW] public health probe payload
backend/src/controllers/admin/financeExportController.js [NEW] GET /finance/export
backend/src/middlewares/errorLogger.js [NEW] daily error logs + admin notify on 500
backend/src/utils/orderStatusHistory.js [NEW] statusHistory append + PG mirror
backend/src/utils/invoicePdf.js [MOD] Settings branding parameter
backend/src/models/order.js [MOD] statusHistory[] embedded schema
backend/src/models/payroll.js [MOD] attendanceRecordIds, earnedSalary, attendanceDeductions
backend/src/utils/orderDualWriteHelpers.js [MOD] mirrorOrderStatusHistory
backend/src/repositories/orderRepository.js [MOD] syncStatusHistoryByLegacyId
backend/src/controllers/orderAdminController.js [MOD] status history on updates, downloadAdminOrderInvoice
backend/src/controllers/orderCustomerController.js [MOD] invoiceService wrapper
backend/src/controllers/orderCheckoutController.js [MOD] seed initial statusHistory
backend/src/controllers/admin/payrollController.js [MOD] calculatePayrollFromAttendance, preview endpoint
backend/src/routes/adminRoutes.js [MOD] orders/:id/invoice, finance/export, payroll/calculate
backend/src/routes/orderRoutes.js [MOD] my-orders/:id/invoice
backend/src/server.js [MOD] GET /health, errorLogger middleware
backend/logs/.gitkeep [NEW] error log directory
prisma/schema.prisma [MOD] OrderStatusHistory model
client/js/orderStatusTimeline.js [MOD] renderVerticalStatusHistory
client/js/admin/modules/customers-table.js [MOD] vertical timeline + download invoice btn
client/js/admin/modules/orders-table.js [MOD] pass full order to timeline hydrator
client/js/admin/modules/orders-invoice.js [MOD] downloadAdminOrderInvoice
client/js/admin/modules/erp-profit-loss.js [MOD] Export Excel via /finance/export
client/js/admin/modules/hrm-payroll.js [MOD] calculate from attendance + breakdown modal
client/admin/partials/modals-invoice.html [MOD] Download Invoice PDF button
client/admin/partials/view-finance.html [MOD] Export Excel toolbar button
client/admin/partials/view-hrm-payroll.html [MOD] calculate button + breakdown modal
client/css/admin/_orders.css [MOD] vertical status timeline styles
docs/audit/MASTER_ENTERPRISE_AUDIT.md [MOD] 95% ready, Group 3 done
docs/audit/ORDERS_AUDIT.md [MOD] invoice + status timeline
docs/audit/PAYMENTS_FINANCE_AUDIT.md [MOD] unified finance export
docs/audit/HRM_AUDIT.md [MOD] payroll calculate preview
docs/audit/DEVOPS_AUDIT.md [MOD] /health + error logger
SYSTEM_ENTERPRISE_AUDIT.md [MOD] "## Medium Priority Group 3 — 2026-09-20"
README.md [MOD] Group 3 last updated

# Final Polish Group 4 — 2026-09-20
backend/src/middlewares/rateLimiter.js [MOD] authLimiter, otpLimiter, apiLimiter fixed windows
backend/src/middlewares/securityMiddleware.js [MOD] wire auth/OTP/API limiters
backend/src/middlewares/maintenanceModeMiddleware.js [NEW] storefront 503 gate + IP allowlist cache
backend/src/utils/returnRequestHelpers.js [NEW] returnRequest build/review helpers
backend/src/models/order.js [MOD] returnRequest, pointsRedeemed, loyaltyDiscount
backend/src/models/Settings.js [MOD] maintenanceAllowedIPs
backend/src/controllers/orderAdminController.js [MOD] listReturnRequests, reviewReturnRequest
backend/src/controllers/orderCustomerController.js [MOD] returnRequest on item returns
backend/src/controllers/orderCheckoutController.js [MOD] loyalty points redemption
backend/src/controllers/userProfileController.js [MOD] loyaltySummary + pointsHistory
backend/src/controllers/masterSettingsController.js [MOD] maintenanceAllowedIPs in API shape
backend/src/routes/adminRoutes.js [MOD] return-requests routes
backend/src/routes/orderRoutes.js [MOD] POST /:id/return-request alias
backend/src/server.js [MOD] maintenanceModeMiddleware registration
client/checkout.html [MOD] loyalty points panel
client/js/checkout/state.js [MOD] loyalty checkout globals
client/js/checkout/render.js [MOD] loyalty in totals + profile fetch
client/js/checkout/actions.js [MOD] loyalty controls + discount calc
client/js/checkout/submit.js [MOD] loyalty in checkout session
client/js/checkout.js [MOD] initCheckoutLoyaltyControls
client/js/payment.js [MOD] applyLoyaltyPoints payload
client/profile/partials/tab-overview.html [MOD] loyalty dashboard card
client/js/profile/account.js [MOD] renderLoyaltyDashboardCard
client/admin/partials/view-orders.html [MOD] Return Requests tab + panel
client/admin/partials/view-settings.html [MOD] maintenance allowlist + warning
client/js/admin/admin-orders.js [MOD] import orders-return-requests
client/js/admin/modules/orders-return-requests.js [NEW] admin return queue UI
client/js/admin/modules/orders-table.js [MOD] hide return panel on status tab
client/js/admin/modules/settings-hub.js [MOD] save maintenanceAllowedIPs
client/js/admin/modules/settings-platform.js [MOD] load maintenance allowlist + warning
client/js/admin/modules/customers-table.js [MOD] empty state emoji
client/js/admin/modules/products-table.js [MOD] empty state emoji
client/js/admin/modules/catalog-coupons.js [MOD] empty state emoji
client/js/admin/modules/notifications.js [MOD] empty state emoji
client/css/checkout.css [MOD] loyalty panel styles
client/css/profile/_wallet.css [MOD] loyalty dashboard card styles
client/css/admin/_orders-return-requests.css [NEW] return requests panel styles
client/css/admin.css [MOD] import _orders-return-requests.css
docs/audit/MASTER_ENTERPRISE_AUDIT.md [MOD] 100% enterprise ready
docs/audit/AUTH_SECURITY_AUDIT.md [MOD] rate limiting + maintenance allowlist
docs/audit/ORDERS_AUDIT.md [MOD] return queue + loyalty checkout
docs/audit/CUSTOMER_FRONTEND_AUDIT.md [MOD] loyalty card + checkout redemption
docs/audit/CMS_AUDIT.md [MOD] maintenance middleware
SYSTEM_ENTERPRISE_AUDIT.md [MOD] "## Final Polish Group 4 — 2026-09-20"
README.md [MOD] Enterprise Ready 100% badge

# Production Route Fix — 2026-09-20
backend/src/routes/adminRoutes.js [MOD] /profile/me/full moved to top (before /me/*); attendance routes reordered; DELETE /hrm/attendance/lock uses requireSuperAdmin; view_attendance on daily-sheet
backend/src/controllers/admin/enterpriseSummaryController.js [MOD] Prisma camelCase low-stock query; per-metric safeMetric + partial 200 response
SYSTEM_ENTERPRISE_AUDIT.md [MOD] "## Production Route Fix — 2026-09-20"

# Deep Production Audit — 2026-09-21 (read-only, no code fixes)
docs/audit/PRODUCTION_ISSUES_AUDIT.md [NEW] consolidated production issue register — 8 console errors, staff directory, clock-out, pagination, HRM matrix, enterprise gaps, priority queue
docs/audit/HRM_AUDIT.md [MOD] status ⚠️ PARTIAL; clock-out + settings 500 + grant-access gaps; change log 2026-09-21
SYSTEM_ENTERPRISE_AUDIT.md [MOD] "## Deep Production Audit — 2026-09-21"
REFACTOR_MAP.md [MOD] audit doc entry 2026-09-21

# Critical Fixes 1–5 — 2026-09-21
backend/src/utils/hrmStaffResolver.js [DONE] resolveClockStaff — Admin then Employee for clock-in/out
backend/src/controllers/admin/attendanceController.js [DONE] resolveClockSubject; clockIn/clockOut use subject.staffId + staffType
backend/src/services/settingsReadService.js [DONE] fetchSettingsDocumentSafe; PG missing row → Mongo fallback
backend/src/services/gatewayStatusService.js [DONE] PG-safe settings read; DEFAULT_GATEWAY_STATUS on failure
backend/src/services/attendanceSettingsService.js [DONE] PG-safe read + Mongo attendanceSettings fallback
backend/src/services/whatsappService.js [DONE] loadWhatsAppSettingsFromDb via fetchSettingsDocumentSafe
backend/src/controllers/admin/employeeController.js [DONE] reconcileLinkedAdminAccess before grant-access
backend/src/services/hrmReadService.js [DONE] filterEmployeesWithoutLinkedAccess for hasAccess=false PG reads
client/js/admin/modules/hrm-attendance.js [DONE] clockOutFromRegister sends staffType
client/js/admin/modules/hrm-employees.js [DONE] 25-key grant permission grid; submit loading guard
client/admin/partials/view-hrm-employees.html [DONE] #grantAccessPermissionGrid replaces 8 checkboxes
devops/NGINX_WEBSOCKET_FIX.md [NEW] production Nginx /socket.io/ WebSocket upgrade runbook
backend/src/controllers/admin/employeeController.js [MOD] syncLinkedAdminIdToPostgres; grant-access returns 409; explicit PG linkedAdminId sync
client/js/admin/modules/hrm-employees.js [MOD] API-grouped permission grid; 409 already-granted UX; staff directory refresh on grant
client/js/admin-staff.js [MOD] window.fetchStaffAccounts exposed for grant-access refresh
tests/hrm.test.js [MOD] duplicate grant-access expects HTTP 409
docs/audit/PRODUCTION_ISSUES_AUDIT.md [MOD] items 1–5 marked FIXED; Critical Fix Group A changelog
docs/audit/HRM_AUDIT.md [MOD] grant-access PG sync + dynamic permissions
SYSTEM_ENTERPRISE_AUDIT.md [MOD] Critical Fix Group A section
README.md [MOD] Critical Fix Group A complete
client/js/admin/modules/admin-stock-alerts.js [NEW] client-side inventory alert pagination via AdminPagination.ensure
client/js/admin/modules/messages-inbox.js [MOD] contactPaginationContainer + AdminPagination.ensure (defaultLimit 10)
client/js/admin/modules/settings-security.js [MOD] securityLogPaginationContainer + AdminPagination.ensure (defaultLimit 10)
client/js/admin/modules/core-nav.js [MOD] removed messagePg/securityPg init (owned by domain modules)
client/js/admin-newsletter.js [MOD] newsletterPaginationContainer + AdminPagination.ensure for subscribers
client/js/admin/admin-dashboard.js [MOD] imports admin-stock-alerts renderInventoryAlerts
client/admin/partials/view-catalog.html [MOD] newsletterPaginationContainer replaces manual subscriber apg-wrapper
client/admin/partials/view-messages.html [MOD] contactPaginationContainer replaces manual message apg-wrapper
client/admin/partials/view-security.html [MOD] securityLogPaginationContainer replaces manual security apg-wrapper
client/admin/partials/view-overview.html [MOD] stockAlertPaginationContainer for dashboard inventory alerts
client/js/admin/modules/pagination-util.js [NEW] AdminPagination class + ensure/render/clear standalone containers
client/css/admin/_pagination.css [NEW] Orders-style apg-wrapper styles
client/css/admin.css [MOD] imports _pagination.css
client/admin/partials/head.html [MOD] loads pagination-util.js
client/js/admin-pagination.js [MOD] backward-compat shim
client/admin/partials/view-staff.html [MOD] Assign + Edit Permissions modals; professional directory table
client/js/admin-staff.js [MOD] Staff Directory rebuild; assign modal grant flow; revokeStaffAccess
client/css/admin/_staff.css [MOD] directory table, assign dropdown, permission detail styles
backend/src/controllers/staffController.js [MOD] listStaff HRM enrichment; revokeStaffAccess
backend/src/routes/staffRoutes.js [MOD] DELETE /:id/access
client/js/admin/modules/hrm-employees.js [MOD] employeePaginationContainer
client/js/admin/modules/hrm-attendance.js [MOD] attendancePaginationContainer
client/js/admin/modules/hrm-leaves.js [MOD] leavePaginationContainer
client/js/admin/modules/hrm-payroll.js [MOD] payrollPaginationContainer
client/js/admin/modules/catalog-coupons.js [MOD] couponPaginationContainer
client/js/admin/modules/erp-expenses.js [MOD] expensePaginationContainer
client/js/admin/modules/settings-reviews.js [MOD] reviewPaginationContainer
client/js/admin/modules/products-table.js [MOD] productPaginationContainer
client/js/admin/modules/core-nav.js [MOD] customer page pagination
backend/src/controllers/admin/customerAdminController.js [MOD] page-based pagination when ?page=
docs/audit/PRODUCTION_ISSUES_AUDIT.md [MOD] items 7, 9 marked FIXED
docs/audit/HRM_AUDIT.md [MOD] Fix Group B changelog
docs/audit/AUTH_SECURITY_AUDIT.md [MOD] revoke access endpoint
SYSTEM_ENTERPRISE_AUDIT.md [MOD] Fix Group B section
README.md [MOD] Fix Group B complete
client/css/admin/_modals.css [MOD] viewport-safe admin-modal pattern
client/css/admin/_hrm.css [MOD] HRM modal viewport + Access tab permission groups
client/css/admin/_layout.css [MOD] sidebar label edit pencil styles
client/admin/partials/view-staff.html [MOD] admin-modal classes on assign/edit modals
client/admin/partials/view-hrm-employees.html [MOD] admin-modal on all HRM modals
client/js/admin-staff.js [MOD] assign flow; Name · EMP-ID dropdown; sidebar label boot hook
client/js/admin/modules/hrm-employees.js [MOD] Access tab states; Grant/Edit/Suspend/Revoke
client/js/admin/modules/sidebarLabels.js [NEW] Super Admin sidebar rename UI
client/js/admin/admin-core.js [MOD] import sidebarLabels.js
backend/src/controllers/admin/sidebarLabelController.js [NEW] GET/PUT sidebar labels
backend/src/repositories/sidebarLabelRepository.js [NEW] SidebarLabel PG repo
backend/src/routes/adminRoutes.js [MOD] /sidebar-labels routes (requireSuperAdmin)
prisma/schema.prisma [MOD] SidebarLabel model
prisma/migrations/20260921073000_add_sidebar_labels/migration.sql [NEW]
tests/repositories/sidebarLabel.repository.test.js [NEW]
docs/audit/HRM_AUDIT.md [MOD] modal fix + access tab + sidebar labels
docs/audit/AUTH_SECURITY_AUDIT.md [MOD] sidebar label API
SYSTEM_ENTERPRISE_AUDIT.md [MOD] HRM Modal Fix + Sidebar Labels section
README.md [MOD] HRM modal fix complete
backend/src/controllers/settingsController.js [MOD] fix gateway/attendance service require paths
backend/src/services/healthService.js [MOD] PG probe 3s timeout; degraded not disconnected
backend/src/controllers/userProfileController.js [MOD] SMTP explicit host + family 4
client/js/admin-staff.js [MOD] avatar onerror safe; assign modal null guard + grant fallback
client/js/admin/modules/hrm-employees.js [MOD] Grant button event listeners; local grant modal priority
client/admin/partials/scripts.html [MOD] admin-staff.js as classic script not module
docs/audit/PRODUCTION_ISSUES_AUDIT.md [MOD] Critical Production Bugs section
docs/audit/DEVOPS_AUDIT.md [MOD] IPv6 SMTP + health probe notes
SYSTEM_ENTERPRISE_AUDIT.md [MOD] Critical Production Bugs section
README.md [MOD] critical bugs fix
#
# HRM Access Fix Round 2: 2026-09-21
client/admin/partials/view-hrm-employees.html [MOD] #quickGrantModal replaces #grantAccessModal
client/js/admin/modules/hrm-employees.js [MOD] openQuickGrantModal; access-info; Super Admin tab hide
client/admin/partials/view-settings.html [MOD] Customize Menu Labels card (Security tab)
client/js/admin/modules/settings-menu-labels.js [NEW] Settings menu label editor
client/js/admin/modules/sidebarLabels.js [MOD] apply-only — no inline edit
client/js/admin/admin-settings.js [MOD] import settings-menu-labels.js
client/css/admin/_hrm.css [MOD] compact spacing; super-admin-notice; quickGrantModal viewport
client/css/admin/_layout.css [MOD] compact HRM headers/stats; removed sidebar pencil styles
backend/src/controllers/admin/employeeController.js [MOD] getAccessInfo + buildEmployeeAccessPayload
backend/src/routes/adminRoutes.js [MOD] GET access-info; DELETE sidebar-labels reset
backend/src/controllers/admin/sidebarLabelController.js [MOD] resetSidebarLabels
backend/src/repositories/sidebarLabelRepository.js [MOD] deleteAll()
docs/audit/HRM_AUDIT.md [MOD] HRM Access Fix Round 2 changelog
docs/audit/AUTH_SECURITY_AUDIT.md [MOD] menu labels in Settings
SYSTEM_ENTERPRISE_AUDIT.md [MOD] HRM Access Fix Round 2 section
README.md [MOD] HRM Access Fix Round 2
#
# HRM Access Final Redesign: 2026-09-21
client/admin/partials/view-hrm-employees.html [MOD] removed #quickGrantModal/#manageAccessModal; Access tab permissions-only layout
client/js/admin/modules/hrm-employees.js [MOD] authHeaders(); separated Access tab flows; removeEmployeeAccessTab/restore; no Grant button
client/js/admin-staff.js [MOD] authHeaders(); staffApi Bearer auth; 409 grant-access handling; activeCount stats; refreshStaffList
client/admin/partials/view-staff.html [MOD] System Staff Directory Assign New Access (unchanged shell, wired to separated flow)
client/css/admin/_hrm.css [MOD] access-no-account, preview block, readonly toggles; removed quickGrantModal rules
backend/src/controllers/admin/employeeController.js [MOD] buildEmployeeAccessPayload hasAccount/isSuperAdmin/permissions/lastLogin
backend/src/controllers/staffController.js [MOD] listStaff returns staff/total/activeCount
docs/audit/HRM_AUDIT.md [MOD] HRM Access Final Redesign changelog
docs/audit/AUTH_SECURITY_AUDIT.md [MOD] Bearer auth on admin fetch
SYSTEM_ENTERPRISE_AUDIT.md [MOD] HRM Access Final Redesign section
README.md [MOD] HRM Access Final Redesign
#
# Access Tab Removed + Staff Directory Final: 2026-09-21
client/admin/partials/view-hrm-employees.html [MOD] removed Access tab button + profile-tab-access panel permanently
client/js/admin/modules/hrm-employees.js [MOD] deleted all access-tab/grant/permission/suspend code (~600 lines)
client/admin/partials/view-staff.html [MOD] 3-step Assign System Access modal redesign
client/js/admin-staff.js [MOD] perm-toggle UI; debounced search; all=true fetch; validation; presets; row actions
client/css/admin/_staff.css [MOD] assign modal steps, perm-toggle, field errors, password toggle
docs/audit/HRM_AUDIT.md [MOD] Access Tab Removed changelog
docs/audit/AUTH_SECURITY_AUDIT.md [MOD] Staff Directory consolidated access
SYSTEM_ENTERPRISE_AUDIT.md [MOD] Access Tab Removed + Staff Directory Final section
README.md [MOD] Access Tab Removed + Staff Directory Final
#
# Assign Access Fix: 2026-09-21
client/js/admin-staff.js [MOD] loadAssignEmployees; loadAssignPermissions; resetAssignModal; search/perm fixes
client/admin/partials/view-staff.html [MOD] username placeholder e.g. john-doe; empty value
client/css/admin/_staff.css [MOD] permission row visibility in assign grid
backend/src/services/hrmReadService.js [MOD] assignableOnly filter; $and Mongo query for hasAccess=false
backend/src/controllers/admin/employeeController.js [MOD] all=true returns employees + data arrays
docs/audit/AUTH_SECURITY_AUDIT.md [MOD] Assign Access Fix changelog
SYSTEM_ENTERPRISE_AUDIT.md [MOD] Assign Access Fix section
README.md [MOD] Assign Access Fix
#
# Email + WhatsApp Notification Overhaul: 2026-09-21
backend/src/services/emailService.js [NEW] Resend → Brevo → log; never throw
backend/src/services/notificationConfigService.js [NEW] admin notification config CRUD + test sends
backend/src/services/mailer.js [MOD] all sends via emailService (SMTP removed)
backend/src/utils/sendEmail.js [MOD] delegates to emailService; removed hardcoded API key
backend/src/services/whatsappService.js [MOD] Baileys self-hosted WhatsApp; order alerts preserved
backend/src/services/gatewayStatusService.js [MOD] structured email/whatsapp/sms status; never 500
backend/src/controllers/settingsController.js [MOD] notification-config + whatsapp + test endpoints
backend/src/routes/adminRoutes.js [MOD] notification settings routes
backend/src/models/Settings.js [MOD] notificationSettings Mixed field
backend/src/server.js [MOD] hydrateNotificationConfigAtStartup on boot
client/admin/partials/view-settings.html [MOD] Notifications tab (email + WhatsApp UI)
client/js/admin/modules/settings-notifications.js [NEW] notifications settings module
client/css/admin/_settings-notifications.css [NEW] notifications tab styles
client/css/admin/_settings.css [MOD] import notifications css
client/js/admin/admin-settings.js [MOD] import settings-notifications.js
client/js/admin-newsletter.js [MOD] new gateway-status object shape
tests/setup.js [MOD] mock @whiskeysockets/baileys + resend
docs/NOTIFICATION_SETUP.md [NEW] Resend/Brevo/Baileys setup guide
docs/audit/DEVOPS_AUDIT.md [MOD] notification overhaul changelog
SYSTEM_ENTERPRISE_AUDIT.md [MOD] Email + WhatsApp Notification Overhaul section
README.md [MOD] Resend + Baileys messaging; 228/228 tests
.gitignore [MOD] .wa-auth Baileys session directory
package.json [MOD] resend, @whiskeysockets/baileys, pino dependencies
#
# Staff Access Final Fix: 2026-09-21
client/js/admin-staff.js [MOD] emp search clear button; renderAssignPermissions; resetAssignModal; cleanup orphans handler
client/admin/partials/view-staff.html [MOD] emp-search-wrap structure; permissionsGrid; Fix DB button
client/css/admin/_staff.css [MOD] emp-search, emp-dropdown, perm-items-list, perm-row visibility
backend/src/controllers/staffController.js [MOD] revokeStaffAccess deletes admin + clears Mongo/PG links; cleanupOrphanRecords
backend/src/routes/staffRoutes.js [MOD] POST /cleanup-orphans route
docs/audit/AUTH_SECURITY_AUDIT.md [MOD] Staff Access Final Fix changelog
docs/audit/HRM_AUDIT.md [MOD] Staff Access Final Fix changelog
SYSTEM_ENTERPRISE_AUDIT.md [MOD] Staff Access Final Fix section
README.md [MOD] Staff Access Final Fix last updated
#
# Permission Items + Sidebar Fix: 2026-09-21
client/js/admin-staff.js [MOD] isValidPermissionEntry filter; perm-group-block renderAssignPermissions
client/css/admin/_staff.css [MOD] #permissionsGrid force-visible block at file bottom
backend/src/repositories/sidebarLabelRepository.js [MOD] lazy getPrisma + try/catch guards
backend/src/controllers/admin/sidebarLabelController.js [MOD] listSidebarLabels returns {} not 500
SYSTEM_ENTERPRISE_AUDIT.md [MOD] permission visibility + sidebar label fix notes
docs/audit/AUTH_SECURITY_AUDIT.md [MOD] Staff UI Polish changelog
#
# Staff UI Polish: 2026-09-21
client/admin/partials/view-staff.html [MOD] empSearchInput SVG search; bare permissionsGrid; icon action buttons
client/css/admin/_staff.css [MOD] 40px search padding; permission card grid; staff-action-btn tooltips
client/js/admin-staff.js [MOD] renderAssignPermissions rewrite; getSelectedPermissions; icon row actions
SYSTEM_ENTERPRISE_AUDIT.md [MOD] Staff UI Polish section
README.md [MOD] Staff UI Polish last updated
#
# HRM Final Polish: 2026-09-22
client/css/admin/_hrm.css [MOD] emp-tab-btn fixed sizing; weekend day pills; delete button styles
client/admin/partials/view-hrm-employees.html [MOD] emp-tab-btn classes on form tabs
client/admin/partials/view-hrm-attendance.html [MOD] weekend day checkboxes; dailySheetPaginationContainer
client/js/admin/modules/hrm-employees.js [MOD] permanent delete button + wireEmployeeDeleteButtons
client/js/admin/modules/hrm-attendance.js [MOD] daily sheet pagination; weekendDays; present checkOut
backend/src/controllers/admin/employeeController.js [MOD] permanent deleteEmployee
backend/src/controllers/admin/attendanceController.js [MOD] daily sheet pagination; present office times
backend/src/repositories/attendanceRepository.js [MOD] getDailySheet pagination; local combineDateAndTime
backend/src/services/attendanceSettingsService.js [MOD] weekendDays array support
backend/src/models/Settings.js [MOD] weekendDays default
backend/src/routes/adminRoutes.js [MOD] DELETE employee requires Super Admin
tests/hrm.test.js [MOD] permanent delete expectations
docs/audit/HRM_AUDIT.md [MOD] HRM Final Polish changelog
SYSTEM_ENTERPRISE_AUDIT.md [MOD] HRM Final Polish section
README.md [MOD] HRM Final Polish last updated
#
# HRM Complete — SweetAlert + Polish: 2026-09-22
client/admin/partials/view-hrm-employees.html [MOD] empDangerZone in Edit modal; delete removed from table
client/admin/partials/view-hrm-attendance.html [MOD] daily-sheet-actions inline toolbar
client/css/admin/_hrm.css [MOD] danger-zone; daily-sheet-actions; btn-outline/success/danger-sm
client/js/admin/modules/hrm-employees.js [MOD] modal delete + Swal; removed row delete button
client/js/admin/modules/hrm-attendance.js [MOD] Swal bulk mark + lock/unlock; STANDARD comment
client/js/admin/modules/hrm-payroll.js [MOD] Swal STANDARD comment
client/js/admin/modules/hrm-leaves.js [MOD] Swal STANDARD comment
client/js/admin/modules/core-state.js [MOD] adminIsLiveServer helper
client/js/admin/modules/core-realtime.js [MOD] socket path + live-server guard
client/js/admin/modules/notifications.js [MOD] poll guard for offline/file context
client/js/admin/modules/orders-actions.js [MOD] WhatsApp poll guard
docs/audit/HRM_AUDIT.md [MOD] HRM Complete SweetAlert changelog
SYSTEM_ENTERPRISE_AUDIT.md [MOD] HRM Complete SweetAlert section
README.md [MOD] SweetAlert2 HRM standard note
#
# HRM System 100% Complete: 2026-09-22
client/admin/partials/view-hrm-employees.html [MOD] compact page-header-compact; edit-danger-zone; emp-view/edit modal classes
client/admin/partials/view-hrm-leaves.html [MOD] searchable apply-leave staff picker mount
client/css/admin/_hrm.css [MOD] compact header; edit-danger-zone; tab min-heights; profile tab flex fix
client/js/admin/modules/hrm-employees.js [MOD] access-info guard; sanitize profile tabs; editDangerZone
client/js/admin/modules/hrm-leaves.js [MOD] createSearchableSelect for Apply Leave staff
backend/src/utils/superAdminEmployee.js [NEW] Super Admin employee legacy ID helper
backend/src/controllers/admin/employeeController.js [MOD] delete guard for Super Admin linked employee
backend/src/controllers/admin/attendanceController.js [MOD] exclude Super Admin from daily sheet
backend/src/repositories/attendanceRepository.js [MOD] PG daily sheet Super Admin exclusion
backend/src/services/hrmReadService.js [MOD] exclude Super Admin from all=true employee dropdowns
backend/src/controllers/staffController.js [MOD] exclude Super Admin from HRM staff roster
tests/hrm.test.js [MOD] Super Admin delete blocked test
docs/audit/HRM_AUDIT.md [MOD] HRM System COMPLETE section; status COMPLETE
SYSTEM_ENTERPRISE_AUDIT.md [MOD] HRM System 100% section
README.md [MOD] HRM complete note

# HRM FINAL — Two-stage delete + Swal z-index: 2026-09-22
backend/src/models/employee.js [MOD] isDeleted, deletedAt fields
backend/src/controllers/admin/employeeController.js [MOD] deactivateEmployee, permanentDeleteEmployee, enrichEmployeesWithAdminRole
backend/src/routes/adminRoutes.js [MOD] PATCH deactivate + DELETE permanent routes
backend/src/services/hrmReadService.js [MOD] isDeleted filter on employee lists/stats
client/admin/partials/view-hrm-employees.html [MOD] More tab; removed edit danger zone; Add Employee first in header
client/css/admin/_hrm.css [MOD] More tab styles; SweetAlert2 z-index; terminate-btn disabled
client/js/admin/modules/hrm-employees.js [MOD] swalOnTop; profile More tab wiring; Super Admin terminate disable
tests/hrm.test.js [MOD] deactivate + password permanent delete tests
docs/audit/HRM_AUDIT.md [MOD] HRM FINAL changelog
SYSTEM_ENTERPRISE_AUDIT.md [MOD] HRM FINAL section
README.md [MOD] test count 231; ADMIN_DELETE_PASSWORD note
ARCHITECTURE.md [MOD] ADMIN_DELETE_PASSWORD env var
.env [MOD] ADMIN_DELETE_PASSWORD=

# HRM staff search type-to-filter: 2026-09-22
client/js/bd-districts.js [MOD] createSearchableSelect — hide list until query typed
client/js/admin/modules/hrm-attendance.js [MOD] hrmMountStaffSearchSelect, hrmGetStaffSearchValue
client/js/admin/modules/hrm-leaves.js [MOD] shared staff search mount
client/js/admin/modules/hrm-payroll.js [MOD] searchable staff on generate + salary config modals
client/js/admin-staff.js [MOD] unified "No results found" copy
client/css/admin/_hrm.css [MOD] admin modal searchable-select styling
docs/audit/HRM_AUDIT.md [MOD] staff search changelog

# HRM staff roster exclude admin logins + employee PG personal-field sync: 2026-09-22
backend/src/controllers/staffController.js [MOD] getStaffRoster returns [] for /hrm/staff; /staff/roster role:staff only
backend/src/controllers/admin/employeeController.js [MOD] mirrorEmployeeSaveToPostgres; syncReferences; debug logs
backend/src/utils/hrmDualWriteHelpers.js [MOD] gender, bloodGroup, maritalStatus, references in PG write map
backend/src/repositories/employeeRepository.js [MOD] personal fields in update; syncReferences(); enum mappers
client/js/admin/modules/hrm-employees.js [MOD] [HRM-SAVE] references debug log
docs/audit/HRM_AUDIT.md [MOD] roster + PG sync changelog

# Daily Sheet status dropdown contrast fix: 2026-09-22
client/css/admin/_hrm.css [MOD] .att-split-menu light background + readable option text
docs/audit/HRM_AUDIT.md [MOD] dropdown contrast changelog

# RBAC attendance-only staff boot gating: 2026-09-22
client/js/admin-staff.js [MOD] waitForAdminPermissions(); expose on window
client/js/admin/modules/core-nav.js [MOD] async initDashboard permission gates; catalog fetches moved inside init
client/js/admin/modules/core-auth.js [MOD] SILENT_403_PATHS; silent 403 option in handleAdminApiAuthResponse
client/js/admin/modules/hrm-attendance.js [MOD] hrmLoadStaffOptions gated by manage_staff in loadHrmAttendanceSection
backend/src/routes/adminRoutes.js [MOD] GET /hrm/employees allows view_attendance
backend/src/controllers/admin/employeeController.js [MOD] trim roster fields for attendance-only readers
docs/audit/HRM_AUDIT.md [MOD] permission gating changelog
SYSTEM_ENTERPRISE_AUDIT.md [MOD] RBAC boot gating section
README.md [MOD] last updated

# RBAC sidebar gaps + boot 403s + profile photo: 2026-09-22
backend/src/config/permissions.js [MOD] view-erp-expenses + view-settings → manage_settings
client/js/admin-staff.js [MOD] hideEmptyMenuGroups; data-permission hides parent li; profile reload after RBAC
client/js/admin/modules/core-nav.js [MOD] gate initAddProductFormUI on manage_inventory|manage_catalog
client/js/admin-banner.js [MOD] gate ensureBannerLinkOptions on manage_settings|manage_catalog
client/js/admin/modules/erp-expenses.js [MOD] loadExpensesSection manage_settings guard
client/js/admin/modules/adminSidebar.js [MOD] waitForAdminPermissions; getCurrentAdminProfile fallback
client/js/admin/modules/core-boot.js [MOD] avatar onerror → initials fallback
backend/src/repositories/adminRepository.js [MOD] profile select includes admin.image; image alias on shape
docs/audit/HRM_AUDIT.md [MOD] changelog
SYSTEM_ENTERPRISE_AUDIT.md [MOD] RBAC sidebar section
README.md [MOD] last updated

# Granular RBAC permission keys — 2026-09-23
backend/src/config/permissions.js [MOD] +22 keys; SECTION_PERMISSIONS granular map; PERMISSION_IMPLICATIONS expanded
backend/src/routes/adminRoutes.js [MOD] HRM attendance/payroll/leave route guards use granular keys
.cursorrules [MOD] Permission System Rules section
docs/audit/HRM_AUDIT.md [MOD] granular RBAC changelog
SYSTEM_ENTERPRISE_AUDIT.md [MOD] granular RBAC section
README.md [MOD] last updated; 47 permission keys

# Frontend tab + action permission gating — 2026-09-23
client/admin/partials/sidebar.html [MOD] data-permission on 31 nav items
client/admin/partials/view-hrm-attendance.html [MOD] tab + action data-permission attrs
client/admin/partials/view-hrm-leaves.html [MOD] applyLeaveBtn data-permission
client/admin/partials/view-hrm-payroll.html [MOD] processPayrollBtn data-permission
client/js/admin-staff.js [MOD] permissionImplications; hasPermission resolves implications; group auto-hide
client/js/admin/modules/hrm-attendance.js [MOD] applyAttendanceTabPermissions; applyPermissionGating; permission-based manual entry
client/js/admin/modules/hrm-leaves.js [MOD] leave action gating after permissions load
client/js/admin/modules/hrm-payroll.js [MOD] payroll button gating after permissions load
backend/src/config/permissions.js [MOD] view_attendance implications
backend/src/controllers/staffController.js [MOD] API returns permissionImplications
docs/audit/HRM_AUDIT.md [MOD] frontend gating changelog
SYSTEM_ENTERPRISE_AUDIT.md [MOD] frontend gating section
README.md [MOD] last updated

# Sales sidebar granular permission keys — 2026-09-23
backend/src/config/permissions.js [MOD] +4 Sales keys; SECTION_PERMISSIONS dedicated map; manage_orders implications expanded; manage_support_tickets → manage_tickets
client/admin/partials/sidebar.html [MOD] granular data-permission on Sales items; Live Chat gated
client/js/admin-staff.js [MOD] ROLE_PRESETS updated; Sales & Orders group icon
.cursorrules [MOD] Permission rule #6 — one key per sidebar item
docs/audit/HRM_AUDIT.md [MOD] Sales granular RBAC changelog
SYSTEM_ENTERPRISE_AUDIT.md [MOD] Sales granular RBAC section
README.md [MOD] last updated

# view_orders API + preset_only coarse keys — 2026-09-23
backend/src/routes/orderRoutes.js [MOD] GET / + PUT /:id granular checkPermission
backend/src/routes/adminRoutes.js [MOD] order read/export/refund routes granular guards
backend/src/config/permissions.js [MOD] Sales & Orders group consolidation; preset_only; manage_orders: []; getPermissionCatalog filter
client/js/admin-staff.js [MOD] canFetchLiveOrders; sidebar-sub-external hide pass
client/js/admin/modules/core-nav.js [MOD] fetchLiveOrders gated in initDashboard + refreshMap
client/js/admin/modules/core-boot.js [MOD] sync button fetchLiveOrders gated
client/js/admin/modules/core-realtime.js [MOD] socket refresh gated
.cursorrules [MOD] preset_only rule #7
docs/audit/HRM_AUDIT.md [MOD] changelog
SYSTEM_ENTERPRISE_AUDIT.md [MOD] view_orders section
README.md [MOD] last updated

# HRM + Orders RBAC gap fixes (A–I) — 2026-09-23
client/js/admin/modules/hrm-attendance.js [MOD] applyManualEntryTabVisibility alias; canMark granular
client/js/admin/modules/core-boot.js [MOD] applyAttendanceTabPermissions call; appendCacheBust avatar
backend/src/routes/adminRoutes.js [MOD] HRM + roster + courier granular route guards
client/js/admin/modules/orders-table.js [MOD] roster/courier fetch gated
client/js/admin/modules/orders-actions.js [MOD] status dropdown gated
client/js/admin/modules/hrm-payroll.js [MOD] approve/paid buttons gated
client/js/admin/modules/hrm-employees.js [MOD] section boot + edit pencil gated
client/js/admin/modules/settings-platform.js [MOD] courier status gated
client/js/urlUtils.js [MOD] appendCacheBust skips CDN hosts
docs/audit/HRM_AUDIT.md [MOD] F1–F10 G1–G3 resolved
SYSTEM_ENTERPRISE_AUDIT.md [MOD] gap fixes section
README.md [MOD] last updated

# Master Audit P1 Fixes — 2026-09-23
client/js/admin/modules/orders-table.js [MOD] hideReturnRequestsPanel, restoreOrdersListTab, no recursion
client/js/admin/modules/orders-return-requests.js [MOD] back button uses restoreOrdersListTab
backend/src/routes/adminRoutes.js [MOD] reviews + abandoned carts permission guards; sync-failures route
backend/src/models/FailedSync.js [NEW] dual-write failure tracker
backend/src/services/failedSyncService.js [NEW] record, list, reconcile on startup
backend/src/services/dualWriteService.js [MOD] recordFailedSync on PG failure
backend/src/utils/hrmDualWriteHelpers.js [MOD] mirrorEmployeeSaveToPostgres exported
backend/src/controllers/admin/employeeController.js [MOD] delegate mirror to hrmDualWriteHelpers
backend/src/controllers/admin/syncFailuresController.js [NEW] GET sync-failures
backend/src/server.js [MOD] reconcileFailedSyncs on startup
docs/audit/MASTER_ENTERPRISE_AUDIT.md [MOD] P1 items marked resolved
SYSTEM_ENTERPRISE_AUDIT.md [MOD] P1 fixes section
README.md [MOD] last updated

# Master Audit P2 Fixes — 2026-09-23
backend/src/config/permissions.js [MOD] view_own_attendance, apply_own_leave, view_own_payslip keys
backend/src/routes/adminRoutes.js [MOD] HRM self-service routes
backend/src/middlewares/authMiddleware.js [MOD] superadmin 2FA enforcement in verifyAdmin
backend/src/utils/hrmStaffResolver.js [MOD] resolveSelfServiceStaffSubject
backend/src/controllers/admin/attendanceController.js [MOD] getMyAttendance
backend/src/controllers/admin/leaveController.js [MOD] applyOwnLeave, getMyLeaveBalance
backend/src/controllers/admin/payrollController.js [MOD] getMyPayslips
client/js/admin/modules/chat-admin.js [MOD] teardownLiveChat
client/js/admin/modules/core-nav.js [MOD] chat teardown on navigate/logout
client/js/admin/modules/hrm-attendance.js [MOD] safeEmployeePhoto
client/js/admin/modules/hrm-employees.js [MOD] photo fallback
client/js/admin/modules/hrm-leaves.js [MOD] Apply My Leave flow
client/js/admin/modules/hrm-payroll.js [MOD] my-payslips self-service
client/js/admin-staff.js [MOD] sidebar alts + twoFaWarning
client/admin/partials/view-hrm-leaves.html [MOD] Apply My Leave UI
client/admin/partials/view-hrm-employees.html [MOD] profile photo fallback
client/admin/partials/view-staff.html [MOD] twoFaWarning banner
client/css/admin/_hrm.css [MOD] emp-avatar styles
client/css/admin/_staff.css [MOD] security-warning
devops/nginx.conf [MOD] /socket.io/ WebSocket proxy
docs/audit/*.md [MOD] P2 audit updates
SYSTEM_ENTERPRISE_AUDIT.md [MOD] P2 fixes section
README.md [MOD] last updated

# P3 Granular RBAC Route Guards — 2026-09-23
backend/src/config/permissions.js [MOD] groups, implications, manage_customers preset_only
backend/src/routes/adminRoutes.js [MOD] catalog, marketing, finance, customer, ticket guards
backend/src/routes/productRoutes.js [MOD] edit_products granular guard
backend/src/routes/categoryRoutes.js [MOD] manage_inventory + manage_catalog
backend/src/routes/brandRoutes.js [MOD] manage_inventory + manage_catalog
backend/src/routes/attributeRoutes.js [MOD] manage_inventory + manage_catalog
backend/src/routes/bannerRoutes.js [MOD] manage_marketing + manage_banners
backend/src/routes/navbarLinkRoutes.js [MOD] manage_marketing + manage_navbar
backend/src/routes/couponRoutes.js [MOD] manage_marketing + manage_coupons
client/js/admin-staff.js [MOD] hasAnyAdminPermission helper
client/js/admin/modules/erp-*.js [MOD] section load gates
client/js/admin/modules/catalog-*.js [MOD] section load gates
client/js/admin/modules/messages-inbox.js [MOD] fetchAdminMessages gate
client/js/admin/modules/products-table.js [MOD] fetchLiveProducts gate
client/js/admin/modules/core-nav.js [MOD] fetchCustomers gate
client/js/admin-banner.js [MOD] loadBanners gate
docs/audit/MASTER_ENTERPRISE_AUDIT.md [MOD] P3 resolved
SYSTEM_ENTERPRISE_AUDIT.md [MOD] P3 section
README.md [MOD] last updated

# P4 Performance & Security Polish — 2026-09-23
backend/src/models/*.js [MOD] Mongo performance indexes
prisma/schema.prisma [MOD] PG performance indexes
backend/src/controllers/admin/employeeController.js [MOD] sanitization
backend/src/controllers/admin/leaveController.js [MOD] sanitization
backend/src/middlewares/securityMiddleware.js [MOD] 2FA rate limits
client/js/admin-staff.js [MOD] error handlers
.cursorrules [MOD] production checklist
docs/audit/*.md [MOD] P4 updates
README.md [MOD] permissions + migrate step

# Staff order RBAC (Dalia fix) — 2026-09-23
client/js/admin/modules/orders-table.js [MOD] delete btn gate; gated master-settings/WhatsApp fetches in fetchLiveOrders
client/js/admin/modules/orders-actions.js [MOD] RBAC helpers; status/assign/bulk-delete gates
backend/src/routes/adminRoutes.js [MOD] PATCH /orders/:orderId/assign accepts update_order_status
docs/audit/ORDERS_AUDIT.md [MOD] staff RBAC change log
SYSTEM_ENTERPRISE_AUDIT.md [MOD] staff order RBAC section
README.md [MOD] last updated

# Abandoned cart notify test fix — 2026-09-23
tests/abandonedCart.test.js [MOD] mock sendAbandonedCartEmail for stable notify test
docs/audit/MARKETING_AUDIT.md [MOD] change log
SYSTEM_ENTERPRISE_AUDIT.md [MOD] abandoned cart test section

# CI repository test PostgreSQL env — 2026-09-23
.github/workflows/deploy.yml [MOD] DATABASE_URL secret + resolve step for repository tests
scripts/run-repository-tests.js [NEW] env validation before node --test repository suite
backend/src/config/prismaClient.js [MOD] DATABASE_URL fallback when POOLED unset
backend/src/repositories/warehouseRepository.js [MOD] setDefault/create return fresh rows
tests/repositories/warehouse.repository.test.js [MOD] scoped default assertions; setDefault before remove-default test
package.json [MOD] test:repositories uses run-repository-tests.js
docs/audit/DEVOPS_AUDIT.md [MOD] CI repository env change log

# Neon HTTP repository test resilience — 2026-09-23
backend/src/config/neonRetry.js [NEW] Neon HTTP timeout + transient retry helper
backend/src/config/prismaClient.js [MOD] Neon adapter fetchOptions; repository-test query retry extension
scripts/run-repository-tests.js [MOD] per-file spawn, inter-file delay, file-level retry/backoff
tests/repositories/jestCompat.js [MOD] post-test pause when REPOSITORY_TEST=1
backend/src/utils/superAdminEmployee.js [MOD] Prisma fallback when Mongo not connected
backend/src/repositories/attendanceRepository.js [MOD] getDailySheet super-admin exclude preserves NULL legacyId rows
tests/repositories/attendance.repository.test.js [MOD] scoped department filters; unique referral codes in order/user tests
tests/repositories/order.repository.test.js [MOD] unique referralCode per run
tests/repositories/user.repository.test.js [MOD] unique explicit referralCode in create test
docs/audit/DEVOPS_AUDIT.md [MOD] Neon HTTP resilience change log
docs/audit/HRM_AUDIT.md [MOD] getDailySheet exclude fix
SYSTEM_ENTERPRISE_AUDIT.md [MOD] repository test resilience section
README.md [MOD] last updated

# Neon HTTP runtime resilience — 2026-09-23
backend/src/config/neonRetry.js [MOD] runtime query retries; exponential backoff; 60s fetch timeout default
backend/src/config/prismaClient.js [MOD] withNeonQueryRetries for all runtime queries
backend/src/services/dualWriteService.js [MOD] non-blocking recordFailedSync after PG mirror failure
ARCHITECTURE.md [MOD] Neon env tuning docs
DATABASE_MIGRATION_AUDIT.md [MOD] runtime resilience section
docs/audit/DEVOPS_AUDIT.md [MOD] change log
SYSTEM_ENTERPRISE_AUDIT.md [MOD] Neon runtime resilience section
README.md [MOD] last updated

# Super Admin 2FA staff banner fix — 2026-09-23
client/js/admin-staff.js [MOD] twoFaWarning uses currentAdmin 2FA status; isTwoFactorActive helper; syncCurrentAdminTwoFactorEnabled
client/js/admin/modules/settings-2fa.js [MOD] sync staff banner after 2FA status/method changes
docs/audit/AUTH_SECURITY_AUDIT.md [MOD] banner fix change log
SYSTEM_ENTERPRISE_AUDIT.md [MOD] Super Admin 2FA banner section
README.md [MOD] last updated

# Customer table ID mapping + chat toast guard — 2026-09-24
client/js/admin/modules/customers-table.js [MOD] getCustomerPrimaryKey, normalizeCustomerRecord, data-customer-id delegation
client/js/admin/modules/customers-modals.js [MOD] customerApiPath encodeURIComponent, resolveCustomerActionId
client/js/admin/modules/core-nav.js [MOD] normalize customer batch on fetch
client/js/admin/modules/chat-admin.js [MOD] chatToast suppresses errors off chat sections
docs/audit/ADMIN_PANEL_AUDIT.md [MOD] change log
README.md [MOD] last updated

# Admin customer delete PG/Mongo parity — 2026-09-23
backend/src/controllers/admin/customerAdminController.js [MOD] resolveAdminCustomer unified lookup; dualWrite admin delete + update/status; Cart/Note/session/avatar cleanup; wallet/order safety guards
client/js/admin/modules/customers-modals.js [MOD] res.ok validation; blocker toasts; refreshCustomerListAfterChange on success
client/js/admin/modules/customers-table.js [MOD] parseCustomerApiResponse + refreshCustomerListAfterChange helpers
docs/audit/ADMIN_PANEL_AUDIT.md [MOD] customer delete fix change log
SYSTEM_ENTERPRISE_AUDIT.md [MOD] Admin customer delete parity section
README.md [MOD] last updated

# Chat proxy route guard + admin session PG mirror — 2026-09-24
backend/src/middlewares/chatApiProxy.js [MOD] store admin JWT/referer detection; /api/admin/customers|orders stay on main backend unless chat-admin caller
backend/src/repositories/adminSessionRepository.js [MOD] mirrorAdminSessionBestEffort fire-and-forget; heartbeat throttle via ADMIN_SESSION_PG_HEARTBEAT_MS
backend/src/middlewares/authMiddleware.js [MOD] verifyAdmin heartbeat uses non-blocking PG mirror
backend/src/controllers/admin/authController.js [MOD] login session create uses mirrorAdminSessionBestEffort
docs/audit/CHAT_AUDIT.md [MOD] proxy interception fix change log
docs/audit/AUTH_SECURITY_AUDIT.md [MOD] admin session dual-write timeout fix
SYSTEM_ENTERPRISE_AUDIT.md [MOD] chat proxy + admin session sections
README.md [MOD] last updated

# Customer delete Neon timeout resilience — 2026-09-24
backend/src/controllers/admin/customerAdminController.js [MOD] safePgLookup in resolveAdminCustomer; deleteCustomer 503 on Neon timeout
docs/audit/ADMIN_PANEL_AUDIT.md [MOD] change log
SYSTEM_ENTERPRISE_AUDIT.md [MOD] customer delete timeout section
README.md [MOD] last updated

# Customer table toolbar premium single-row layout — 2026-09-24
client/admin/partials/view-customers.html [MOD] search left, tier+pills+export right in one toolbar row
client/css/admin/_customers.css [MOD] full rewrite of customers-toolbar layout and control styling
client/css/admin/_responsive.css [MOD] horizontal scroll fallback on narrow viewports
docs/audit/ADMIN_PANEL_AUDIT.md [MOD] change log

# Settings Module A-Z Audit — 2026-09-24
docs/audit/SETTINGS_AUDIT.md [NEW] comprehensive settings hub/API/UI/resilience audit report
SYSTEM_ENTERPRISE_AUDIT.md [MOD] Settings Module A-Z Audit section
README.md [MOD] SETTINGS_AUDIT index + last updated

# Settings Fetch Timeout Helper (Phase 1 Step 2) — 2026-09-24
client/js/admin/modules/settings-utils.js [NEW] settingsFetchJson — 15s AbortController + error toasts
client/js/admin/admin-settings.js [MOD] import settings-utils barrel
client/js/admin/modules/settings-platform.js [MOD] use settingsFetchJson
client/js/admin/modules/settings-notifications.js [MOD] use settingsFetchJson
client/js/admin/modules/settings-security.js [MOD] use settingsFetchJson
client/js/admin/modules/settings-payments.js [MOD] use settingsFetchJson
client/js/admin/modules/settings-expense-categories.js [MOD] use settingsFetchJson
client/js/admin/modules/settings-menu-labels.js [MOD] use settingsFetchJson
docs/audit/SETTINGS_AUDIT.md [MOD] fetch timeout marked complete
docs/audit/ADMIN_PANEL_AUDIT.md [MOD] change log
SYSTEM_ENTERPRISE_AUDIT.md [MOD] settings fetch timeout ✅
README.md [MOD] last updated

# Page Content Manager Preview/Edit UX — 2026-09-24
client/js/admin/modules/settings-cms.js [MOD] preview/edit mode toggle, snapshot revert, dirty integration
client/js/admin/modules/core-state.js [MOD] pageContentEditMode + pageContentEditSnapshot state
client/js/admin/modules/settings-hub.js [MOD] exit edit mode when leaving General tab
client/js/admin/modules/settings-dirty-tracker.js [MOD] Ctrl+S saves page content when in edit mode
client/admin/partials/view-store-config.html [MOD] Edit Page btn, Cancel btn, dirty scope on manager
client/css/admin/_cms.css [MOD] preview shell, status badge, edit mode styles
docs/audit/CMS_AUDIT.md [MOD] preview/edit mode complete

# Settings Export/Import & Ctrl+S Quick Save (Phase 3 Step 2) — 2026-09-24
backend/src/utils/settingsExportSanitizer.js [NEW] secret stripping + import allowlists
backend/src/services/settingsExportImportService.js [NEW] build export + validated import apply
backend/src/controllers/admin/settingsExportImportController.js [NEW] GET/POST settings-export|import
backend/src/controllers/adminController.js [MOD] export settingsExportImportController
backend/src/routes/adminRoutes.js [MOD] settings-export + settings-import routes
backend/src/utils/settingsHistoryFilter.js [MOD] settings backup action pattern
client/js/admin/modules/settings-backup-restore.js [NEW] Utilities tab export/import UI
client/js/admin/modules/settings-dirty-tracker.js [MOD] triggerSettingsQuickSave helpers
client/js/admin/modules/settings-hub.js [MOD] Ctrl+S / Cmd+S keyboard shortcut
client/js/admin/admin-settings.js [MOD] import settings-backup-restore
client/admin/partials/view-settings.html [MOD] Settings Backup & Restore utilities card
client/css/admin/_settings-system.css [MOD] backup card + accent-teal styles
tests/services/settingsExportImportService.test.js [NEW] 6 unit tests
docs/audit/SETTINGS_AUDIT.md [MOD] Phase 3 complete ✅
SYSTEM_ENTERPRISE_AUDIT.md [MOD] export/import + quick save ✅
README.md [MOD] test count 248/248 + Phase 3 complete
ARCHITECTURE.md [MOD] settingsExportImportService reference

# Settings Change History UI (Phase 3 Step 1) — 2026-09-24
backend/src/utils/settingsHistoryFilter.js [NEW] shared Mongo/PG filter for settings audit events
backend/src/services/settingsHistoryReadService.js [NEW] routed read for settings SecurityLog rows
backend/src/controllers/admin/settingsHistoryController.js [NEW] GET /api/admin/settings-history
backend/src/repositories/securityLogRepository.js [MOD] findSettingsHistory, countSettingsHistory
backend/src/controllers/adminController.js [MOD] export settingsHistoryController
backend/src/routes/adminRoutes.js [MOD] GET /settings-history route (manage_settings)
client/js/admin/modules/settings-history.js [NEW] Security tab history table + refresh
client/js/admin/admin-settings.js [MOD] import settings-history module
client/js/admin/modules/settings-hub.js [MOD] loadSettingsHistory on security tab
client/admin/partials/view-settings.html [MOD] Settings Change History saas-settings-card
client/css/admin/_settings-security.css [MOD] settings history table styles
tests/services/settingsHistoryReadService.test.js [NEW] 5 unit tests — filter + read routing
docs/audit/SETTINGS_AUDIT.md [MOD] Phase 3 Step 1 complete
SYSTEM_ENTERPRISE_AUDIT.md [MOD] settings history UI ✅
README.md [MOD] test count 242/242 + last updated
ARCHITECTURE.md [MOD] settingsHistoryReadService reference

# Settings Deep-Links & Discard Buttons (Phase 2 Step 3) — 2026-09-24
client/js/admin/modules/settings-hub.js [MOD] #settings-{tab} hash routing, hashchange, replaceState
client/js/admin/modules/settings-dirty-tracker.js [MOD] revertSettingsScopeToBaseline, installSettingsDiscardButtons
client/js/admin/modules/core-nav.js [MOD] hash tab priority on view-settings open
client/admin/partials/view-settings.html [MOD] adminEmployeeLinkCard dirty scope
client/css/admin/_settings-system.css [MOD] settings-discard-btn styles
docs/audit/SETTINGS_AUDIT.md [MOD] Phase 2 Step 3 complete
docs/audit/ADMIN_PANEL_AUDIT.md [MOD] change log
SYSTEM_ENTERPRISE_AUDIT.md [MOD] deep-links + discard ✅
README.md [MOD] last updated

# Settings Unsaved Changes Guard (Phase 2 Step 2) — 2026-09-24
client/js/admin/modules/settings-dirty-tracker.js [NEW] dirty tracking, tab guard, beforeunload, save chips
client/js/admin/admin-settings.js [MOD] import settings-dirty-tracker
client/js/admin/modules/settings-hub.js [MOD] requestSettingsTabSwitch, dirty tracker init
client/js/admin/modules/settings-platform.js [MOD] baseline refresh after apply*ToUI
client/js/admin/modules/settings-cms.js [MOD] markSettingsFormSaved on save success
client/js/admin/modules/settings-notifications.js [MOD] markSettingsFormSaved + baseline refresh
client/js/admin/modules/settings-menu-labels.js [MOD] markSettingsFormSaved on load/save
client/js/admin/modules/core-nav.js [MOD] requestSettingsTabSwitch for settings tabs
client/admin/partials/view-settings.html [MOD] data-settings-dirty-scope, immediate-save toggles
client/css/admin/_settings-system.css [MOD] settings-save-state-chip styles
docs/audit/SETTINGS_AUDIT.md [MOD] Phase 2 Step 2 complete
docs/audit/ADMIN_PANEL_AUDIT.md [MOD] change log
SYSTEM_ENTERPRISE_AUDIT.md [MOD] unsaved changes guard ✅
README.md [MOD] last updated

# Settings Design System Standardization (Phase 2 Step 1) — 2026-09-24
client/admin/partials/view-settings.html [MOD] Utilities tab → saas-settings-card; notifications toggle CSS classes
client/css/admin/_settings-branding.css [MOD] admin-settings-shell max-width 1360px
client/css/admin/_settings-system.css [MOD] utilities grid, GA badge, sandbox saas card styles
client/css/admin/_settings-footer.css [MOD] sandbox-card dedupe (saas shell owns layout)
client/css/admin/_settings-notifications.css [MOD] WA toggle classes + 2-col grid on wide screens
client/js/admin/modules/settings-hub.js [MOD] remove tab-switch SweetAlert toasts
client/js/admin/modules/settings-platform.js [MOD] GA badge CSS classes
client/js/admin/modules/core-nav.js [MOD] drop silent tab param
docs/audit/SETTINGS_AUDIT.md [MOD] Phase 2 Step 1 complete
docs/audit/ADMIN_PANEL_AUDIT.md [MOD] change log
SYSTEM_ENTERPRISE_AUDIT.md [MOD] settings UI standardization ✅
README.md [MOD] last updated

# Platform Settings Read Resilience (Phase 1 Step 3) — 2026-09-24
backend/src/services/platformSettingsReadService.js [NEW] PG-first platform admin read + safe defaults
backend/src/controllers/admin/adminSettingsController.js [MOD] getAdminSettings uses platformSettingsReadService
tests/services/platformSettingsReadService.test.js [NEW] 6 unit tests — PG/Mongo routing + DB failure defaults
docs/audit/SETTINGS_AUDIT.md [MOD] platform settings read marked complete
SYSTEM_ENTERPRISE_AUDIT.md [MOD] platform settings read ✅
README.md [MOD] test count 237/237 + last updated
ARCHITECTURE.md [MOD] platformSettingsReadService reference

# Sidebar Labels PG+Mongo Fix (Phase 1 Step 1) — 2026-09-24
backend/src/models/SidebarLabel.js [NEW] Mongoose model for menu label fallback
backend/src/repositories/sidebarLabelRepository.js [MOD] PG primary + Mongo fallback/mirror; bulkUpsertLabels
backend/src/controllers/admin/sidebarLabelController.js [MOD] batchUpsertSidebarLabels handler
backend/src/routes/adminRoutes.js [MOD] PUT /sidebar-labels batch route (before :key)
client/js/admin/modules/settings-menu-labels.js [MOD] single batch PUT save
tests/repositories/sidebarLabel.repository.test.js [MOD] bulkUpsertLabels test + Mongo cleanup
docs/audit/SETTINGS_AUDIT.md [MOD] mark sidebar label fixes complete
docs/audit/AUTH_SECURITY_AUDIT.md [MOD] batch API + Mongo fallback
SYSTEM_ENTERPRISE_AUDIT.md [MOD] sidebar label status ✅
README.md [MOD] last updated
