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
