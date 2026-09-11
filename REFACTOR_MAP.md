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
# ERP Advanced — POS dashboard, courier deep integration, advanced P&L: 2026-09-11
# --- Task 1: Advanced POS dashboard ---
client/js/admin/modules/orders-pos.js [DONE] barcode/SKU scan-to-cart (findProductByCode, handleBarcodeScan), quick popular-product grid (loadPosQuickGrid/renderPosQuickGrid/posQuickAdd), shared addProductToCart, POS invoice/receipt modal (renderPosInvoice/printPosInvoice/downloadPosInvoicePdf)
client/admin/partials/modals-orders.html [DONE] barcode row + qty, quick-add grid, posInvoiceModal receipt modal
client/css/admin/_orders.css [DONE] .pos-barcode-*, .pos-quick-*, .pos-invoice-* styles + .courier-cell-booked/.refresh-courier-btn
client/css/admin/_print.css [DONE] body.printing-pos-invoice print-only receipt rules
# --- Task 2: Courier deep integration ---
backend/src/models/order.js [DONE] courierName + courierSyncedAt fields
backend/src/services/courierSyncService.js [NEW] syncOrderWithCourier (book+SMS+WhatsApp+Shipped), autoSyncCourierStatus (poll+map+cashback), STATUS_MAP steadfast/pathao/redx
backend/src/jobs/courierSyncJob.js [NEW] every-2h cron — poll in-flight parcels, reconcile status, SecurityLog summary
backend/src/server.js [DONE] startCourierSyncCron() bootstrap
backend/src/controllers/courierController.js [DONE] bookAndSyncCourier (PATCH), getCourierStatus (GET)
client/js/admin/modules/orders-actions.js [DONE] Book & Sync button + Refresh Status button (bookAndSyncCourier/refreshCourierStatus)
backend/src/routes/adminRoutes.js [DONE] PATCH /orders/:id/book-courier, GET /orders/:id/courier-status
# --- Task 3: Expense tracking ---
backend/src/models/expense.js [NEW] category enum + amount/date/reference/recordedBy/attachmentUrl, indexes {date:-1},{category:1,date:-1}
backend/src/controllers/admin/expenseController.js [NEW] create/getAll/update/delete/getExpenseSummary (SecurityLog resourceType:'expense')
backend/src/models/securityLog.js [DONE] added 'expense' to RESOURCE_TYPES enum
backend/src/routes/adminRoutes.js [DONE] GET/POST /expenses, PATCH/DELETE /expenses/:id, GET /expenses/summary (checkPermission manage_settings)
# --- Task 4: Advanced Profit & Loss ---
backend/src/controllers/admin/profitLossController.js [NEW] computeProfitLoss + getProfitLossReport (revenue/costs/profit/top+worst products/series)
backend/src/controllers/admin/exportController.js [NEW] exportPLtoPDF (PDFKit), exportPLtoCSV
client/admin/partials/view-finance.html [DONE] P&L section — date range, summary cards, SVG donut + bar, product/expense tables, export buttons
client/js/admin/modules/erp-profit-loss.js [NEW] loadPLReport, inline-SVG renderCharts, exportPDF/exportCSV, initProfitLossReport
client/js/admin/admin-products.js [DONE] imports erp-profit-loss.js
client/css/admin/_finance.css [NEW] P&L controls/cards/charts/tables styles
client/css/admin.css [DONE] @import _finance.css
client/js/admin/modules/core-nav.js [DONE] view-finance handler also calls initProfitLossReport
backend/src/routes/adminRoutes.js [DONE] GET /finance/profit-loss + /export-pdf + /export-csv (verifyAdmin + requireSuperAdmin)
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
mobile/src/screens/EditProfileScreen.js  [DONE] Scrollable edit form — centered avatar, personal/shipping sections, FieldBadge pills, custom DOB modal, sticky Update Profile footer
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
