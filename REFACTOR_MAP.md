# EOnlineBazar Refactoring Map
# Completed: 2026-08-25
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
CHAT_AUDIT.md                        [DONE] live-chat close/end session + alert audit
ecommerce-chat/socket/chatAuth.js    [DONE] chat socket ownership helpers for end_chat / resolve_chat

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
client/js/admin/admin-settings.js    [DONE] barrel → modules/settings-*.js
client/js/admin/admin-dashboard.js   [DONE] analytics module
client/js/admin-banner.js            [DONE] kept as single file

## JS Files — Storefront
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
backend/src/controllers/noteController.js           [DONE] private notebook CRUD (note/expense/income/shopping)
backend/src/models/note.js                          [DONE] Note schema (user-scoped, tags, pin, color)
backend/src/routes/noteRoutes.js                    [DONE] GET/POST/PUT/DELETE /api/notes

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
  view-master-settings.html
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
  settings-security.js
  settings-platform.js
  settings-payments.js
  settings-footer.js
  settings-cms.js
  settings-2fa.js
client/css/profile/
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
