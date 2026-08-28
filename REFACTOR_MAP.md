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
backend/src/controllers/orderCheckoutController.js  [DONE] mock catalog ids (p1…) + COD fallback for mobile Place order
backend/src/controllers/orderCustomerController.js  [DONE] POST cancel + PUT /api/orders/:id/cancel (Pending only)
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

## Mobile App (Expo / React Native)
mobile/App.js                            [DONE] root stack; hydrate in useEffect; ErrorBoundary; splash hide on nav ready
mobile/app.json                          [DONE] scheme eonlinebazar, package com.eonlinebazar.app, splash plugin, New Arch off
mobile/eas.json                          [DONE] preview: internal APK; production AAB
mobile/package.json                      [DONE] main index.js; Expo 54 + React Navigation v7 + expo-font ~14.0.12
mobile/metro.config.js                   [DONE] default Expo Metro (Hermes-safe)
mobile/index.js                          [DONE] gesture-handler → splash → registerRootComponent
mobile/src/splash.js                     [DONE] preventAutoHideAsync before App.js imports
mobile/src/components/ErrorBoundary.js   [DONE] launch/render error fallback + hide splash
mobile/src/services/api.js               [DONE] default API https://eonlinebazar.com/api (DigitalOcean live)
mobile/src/screens/CheckoutScreen.js     [DONE] shipping + phone + COD; createOrder → Orders + toast
mobile/src/screens/CartScreen.js         [DONE] cart list + Proceed to Checkout + clear toast
mobile/src/screens/OrdersScreen.js       [DONE] my-orders + RefreshControl live refetch
mobile/src/screens/OrderDetailsScreen.js [DONE] items, qty, price, address, status badge; Cancel if Pending
mobile/src/screens/LoginScreen.js        [DONE] email/mobile + password → useAuthStore.login
mobile/src/screens/RegisterScreen.js     [DONE] name/email/mobile/password → useAuthStore.register
mobile/src/screens/ProfileScreen.js      [DONE] edit profile, Wishlist link, Dark mode switch
mobile/src/screens/WishlistScreen.js     [DONE] saved products from useWishlistStore
mobile/src/navigation/AppNavigator.js    [DONE] bottom tabs — Home, Shop, Cart, Orders, Profile (themed)
mobile/src/screens/HomeScreen.js         [DONE] GET /api/products + RefreshControl live refetch
mobile/src/screens/ShopScreen.js         [DONE] GET /api/products + RefreshControl live refetch
mobile/src/components/ProductGrid.js     [DONE] API catalog, search, chips, heart, RefreshControl, loading/error
mobile/src/screens/ProductDetailsScreen.js [DONE] GET /api/products/:id; Add to Cart + wishlist heart
mobile/src/data/products.js              [DONE] leftover dummy catalog (Home/Shop no longer use it)
mobile/src/utils/normalizeProduct.js     [DONE] API product → card shape + media URL
mobile/src/theme/palettes.js             [DONE] light/dark color tokens
mobile/src/api/                          [DONE] Axios client + endpoints
mobile/src/services/api.js               [DONE] default API https://eonlinebazar.com/api (DigitalOcean live)
mobile/src/components/                   [DONE] ScreenHeader, ProductGrid, ToastBanner, HeartButton, ErrorBoundary
mobile/src/store/                        [DONE] Zustand cart + auth + order + toast + wishlist + theme + products
mobile/src/store/useCartStore.js         [DONE] add/remove/update qty, getTotalPrice, clearCart
mobile/src/store/useAuthStore.js         [DONE] auth + updateProfile; hydrate() called from App.js useEffect
mobile/src/store/useOrderStore.js        [DONE] createOrder, fetchOrderHistory, fetchOrderById, PUT cancel
mobile/src/store/useToastStore.js        [DONE] showToast/hideToast banners
mobile/src/store/useWishlistStore.js     [DONE] persisted favorites; hydrate() called from App.js useEffect
mobile/src/store/useThemeStore.js        [DONE] light/dark mode; hydrate() called from App.js useEffect
mobile/src/store/useProductStore.js      [DONE] live catalog from GET /api/products
