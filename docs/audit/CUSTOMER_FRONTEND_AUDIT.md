# CUSTOMER FRONTEND AUDIT — EonlineBazar

**Last updated:** 2026-10-01 (Product EN/BN locale via BN toggle)  
**Scope:** Storefront HTML pages, shared JS/CSS, profile module, checkout, PDP, cart  
**Status:** ✅ COMPLETE

---

## File Inventory

| Path | Role |
|------|------|
| `client/index.html` | Homepage |
| `client/product-details.html` | Product detail page shell |
| `client/cart.html` | Shopping cart |
| `client/checkout.html` | Checkout flow |
| `client/login.html` / `register.html` / `forgot-password.html` | Auth pages |
| `client/profile.html` | Customer profile shell (assembled via `profilePageBuilder.js`) |
| `client/order-details.html` / `order-track.html` | Order view + public tracking |
| `client/payment.html` | Payment gateway redirect page |
| `client/search.html` / `contact.html` / `cms-page.html` | Search, contact, CMS pages |
| `client/js/main.js` | Storefront bootstrap |
| `client/js/cart.js` / `cart-merge.js` | Cart logic + guest merge + quote preview totals |
| `client/js/utils/orderQuote.js` | Shared tax line labels + cart quote preview helpers |
| `client/js/voucherWallet.js` | Voucher wallet one-click apply/remove (cart + checkout) |
| `client/js/coupon-ui.js` | Storefront coupon apply + cart/checkout panels |
| `client/js/checkout.js` + `client/js/checkout/` | Checkout state, validation, submit, `quote.js`, `checkoutCrossTabSync.js`, `paymentStatusSync.js` |
| `client/js/orderSuccess.js` | Payment outcome UI (pending vs verified success, retry COD) |
| `client/js/store/checkoutState.js` | Ephemeral UI + `activeQuote` / `quoteMeta` / `paymentFlowStatus` / `checkoutCrossTabBlocked` |
| `client/js/product-details.js` + `client/js/pdp/` | PDP gallery, variants, reviews, add-to-cart |
| `client/js/pdp/galleryZoomLightbox.js` | Desktop hover zoom lens + accessible full-screen PDP lightbox |
| `client/js/pdp/variantStock.js` | Stock badge states, CTA labels, notify-me placeholder |
| `client/js/profile.js` + `client/js/profile/` | Profile tabs: orders, wallet, addresses, notes, security |
| `client/js/utils/storage.js` | Central `EOBStorage` / `EOBStorageKeys` (local + session) |
| `client/js/utils/telemetry.js` | `EOBTelemetry` — global errors, buffered POST reports, checkout UI recovery |
| `client/js/utils/sanitizer.js` | `EOBSanitizer` — `escapeHtml`, `sanitizeRichText`, reflected input sanitization |
| `client/js/utils/imageUtils.js` | `EOBImageUtils` — lazy/LCP attrs, srcset, catalog URL sanitize, fallback onerror |
| `client/js/render.js` | `EOBRender.mountProductCardImage` / cart line image helpers |
| `client/js/utils/productLocale.js` | `ProductLocale` — pick English vs `*_bn` product fields for storefront |
| `client/js/utils/debounce.js` | `EOBDebounce` — shared debounce + abortable catalog request coordinator |
| `client/js/searchCatalogSync.js` | `EOBSearchCatalogSync` — URL ↔ search state serialization |
| `client/js/expressCheckout.js` | `EOBExpressCheckout` — Buy Now isolated checkout session |
| `client/js/orderStatusTimeline.js` | `OrderStatusTimeline` — 5-step order progress + carrier meta |
| `client/js/orderReturnWorkflow.js` | Return eligibility, modal payload builder, progress mapper |
| `client/js/utils/apiCache.js` | `EOBApiCache` — TTL + stale-while-revalidate for public GET JSON |
| `client/js/utils/profileCache.js` | `EOBProfileCache` — per-user profile dashboard metrics SWR + eviction |
| `client/js/profile/invoice.js` | `EOBInvoice` — print receipt HTML + server PDF download |
| `client/css/invoice.css` | Print-friendly invoice layout styles |
| `client/js/utils/catalogClient.js` | Bounded home sections + cart `lookup` hydration |
| `client/js/cartCatalogBootstrap.js` | Cart/checkout catalog hydrate without bulk prefetch |
| `client/js/ui/skeletons.js` | `EOBSkeletons` — product/PDP/cart/banner skeleton HTML + DOM swap helpers |
| `client/css/global/_skeletons.css` | Shimmer skeleton styles (reserved card/PDP/cart dimensions) |
| `client/js/store/commerceState.js` | Cart/catalog auth + checkout persistence (`EOBCommerce`) |
| `client/js/auth.js` / `session-guard.js` | Login state, fetch 401 intercept, silent refresh queue, checkout-safe session drop |
| `client/js/header.js` / `footer.js` / `footerRenderer.js` | Shared chrome |
| `client/js/orderChat.js` / `chat-widget.js` | Live support widget integration |
| `client/js/pwa.js` | PWA manifest + service worker toggle |
| `client/partials/` | Shared header, footer, WhatsApp partials |
| `client/profile/partials/` | Profile tab HTML sections |
| `client/css/global/` | Storefront module CSS (via `style.css` barrel) |
| `backend/src/utils/profilePageBuilder.js` | Assembles profile shell + partials |

**Counts (verified 2026-09-20):** 21 storefront HTML pages, 9 profile JS modules, 5 PDP modules, 5 checkout modules.

---

## Feature Checklist

- [x] Homepage + category/product listing — `index.html`, `products.js`
- [x] Product detail page with variants — `product-details.html`, `pdp/variants.js`
- [x] Shopping cart (guest + logged-in) — `cart.html`, `cart.js`, `cart-merge.js`
- [x] Checkout (COD, gateways, wallet, loyalty points, VAT) — `checkout.html`, `checkout/actions.js`, `checkout/submit.js`
- [x] Itemized VAT/tax breakdown (inclusive/exclusive labels) — `utils/orderQuote.js`, `checkout/quote.js`, `cart.js`
- [x] Voucher wallet + one-click promo apply — `voucherWallet.js`, `cart.html`, `checkout.html`
- [x] Order details return/refund modal + live return progress — `orderReturnWorkflow.js`, `order-details.js`
- [x] Profile dashboard SWR cache (orders/wallet/loyalty) — `profileCache.js`, `profile/account.js`
- [x] PDF invoice download + print receipt — `profile/invoice.js`, order details + profile orders
- [x] Customer registration / login — `login.html`, `auth.js`
- [x] Profile management (tabs) — `profile.html`, `profile/tabs.js`
- [x] Order history + order details — `profile/orders.js`, `order-details.html`
- [x] Public order tracking — `order-track.html`, `order-track.js`
- [x] Wishlist — `profile/wishlist.js`, `wishlist.js`
- [x] Wallet & loyalty points UI — `profile/wallet.js`, dashboard loyalty card (`tab-overview.html`, `account.js`)
- [x] Return request flow — `profile/orders.js` modal + status chip (7-day window)
- [x] Customer addresses (BD districts) — `profile/addresses.js`, `bd-districts.js`
- [x] Customer notebook — `profile/notes.js`
- [x] Session / security settings — `profile/security.js`
- [x] Payment proof upload — `payment.html`, checkout flow
- [x] Invoice download — `invoiceDownload.js`
- [x] PWA support — `pwa.js`, `public/manifest.json`
- [x] SEO pages + sitemap consumer — `page-content-loader.js`
- [x] Live chat widget entry — `orderChat.js`
- [x] Store branding (logo, favicon) — `store-branding.js`
- [x] Fetch 401 intercept + single-flight silent refresh attempt — `session-guard.js` (`window.EOBSession`)
- [x] Non-destructive session expiry on checkout/payment — preserves `cart`, `activeCheckoutSession`, guest shipping keys; inline re-auth modal
- [x] Global error boundary + telemetry — `EOBTelemetry.initGlobalErrorHandlers`, `POST /api/telemetry/errors` (backend 200)
- [x] Stuck checkout/payment/cart UI recovery on uncaught errors — spinner/disabled button reset + commerce FSM unwind
- [x] Central XSS sanitization — `EOBSanitizer`; dynamic `innerHTML` in cart/checkout/PDP/search/CMS wired through escape/sanitizeRichText
- [x] Cart mutations without client `price` in API bodies — `CartDisplayUtils.buildCartAddPayload` / `stripGuestCartForMerge`; local state syncs from server + catalog
- [x] Cart quantity debounce (350ms) + per-line in-flight lock — `getCartQtySync`; optimistic UI + rollback; `CART_MUTATING` via `EOBCommerce`
- [x] Nav cart badge = total unit quantity (sum of line qty) — `computeTotalCartQuantity`, `badgeCount` on `cart:updated`
- [x] Guest→user cart merge + cross-tab sync — `cart-merge.js`, `initCartCrossTabSync`, login snapshot in session storage
- [x] Server-locked checkout totals — `checkout/quote.js`, `EOBCheckoutState.activeQuote`; payment re-verifies quote before gateway/COD
- [x] Duplicate order prevention — `checkout/idempotency.js`, `X-Idempotency-Key`, submit in-flight lock on payment confirm
- [x] Multi-tab checkout guard — `BroadcastChannel('eob_checkout_sync')` + storage; `ORDER_COMPLETED` / `CHECKOUT_SESSION_INVALIDATED`
- [x] Gateway payment state machine — `paymentStatusSync.js` + `orderSuccess.js`; poll `GET /api/payments/verify/:orderId` before success UI
- [x] Skeleton loading states (home, search/catalog, PDP, cart, checkout quote) — `EOBSkeletons` + `_skeletons.css`; fade to live content
- [x] Image pipeline (lazy/eager, decoding, dimensions, srcset, LCP hero/PDP) — `EOBImageUtils` + `ProductThumbnail` integration
- [x] Bounded catalog API + SWR cache — no `limit=500` storefront bootstrap; home sections + cart lookup
- [x] PDP desktop hover zoom + full-screen lightbox — `galleryZoomLightbox.js`, `product-details.css`; sync with carousel index + variant gallery cache
- [x] Real-time variant stock matrix + badges — `variantUtils.getVariantStockQuantity`, `variantStock.js`, matrix pill `in-stock`/`oos`/`unavailable`, low-stock urgency, CTA + notify-me placeholder
- [x] Catalog search debounce + AbortController + URL/popstate + filter chips — `search.js`, `debounce.js`, `searchCatalogSync.js`
- [x] Order progress timeline + express Buy Now — `orderStatusTimeline.js`, `expressCheckout.js`, `orderSuccess.js`, home/search product cards

---

## Known Issues / Gaps

| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| Product slug not on schema | Low | Open | Backend index exists; storefront uses `_id` / name slugs |
| Mobile parity gaps | Low | Open | See root `AUDIT_REPORT.md` for RN-specific items |

---

## Dependencies & Integrations

- **Profile route:** `GET /profile` → `profilePageBuilder.js`
- **API:** `/api/products`, `/api/cart`, `/api/orders`, `/api/users`, `/api/auth`
- **Related audits:** `ORDERS_AUDIT.md`, `PRODUCTS_AUDIT.md`, `CMS_AUDIT.md`, `AUTH_SECURITY_AUDIT.md`, `CHAT_AUDIT.md`

---

## Change Log

### Step 4.2.2 — PDF invoice & print receipt — 2026-09-29

- `EOBInvoice`: enterprise HTML receipt (SKU, variant, tax/discount/shipping, payment stamp); PDF via `GET /api/orders/:id/invoice`; profile order rows + order details actions; tests `invoicePDF.test.js`; **512/512** passing.

### Step 4.2.1 — Profile dashboard SWR cache — 2026-09-29

- `EOBProfileCache`: cache-first dashboard hydrate, parallel revalidate (`/api/customer/profile`, `/api/orders/dashboard-stats`), offline banner + retry, logout purge via `auth:changed`; tests `profileCache.test.js`; **507/507** passing.

### Step 4.1.3 — Order return & refund workflow — 2026-09-29

- `OrderReturnWorkflow`: 7-day delivered eligibility, reason codes, item/qty validation, `POST /return-request` payload (productId, sku, estimated refund).
- Order details modal + per-line Return buttons; return progress track + status badge; tests `orderReturnWorkflow.test.js`; **501/501** passing.

### Step 4.1.2 — Itemized tax + voucher wallet — 2026-09-29

- `EOBOrderQuote`: inclusive/exclusive VAT labels; `applyOrderSummaryLines` for cart + checkout; debounced cart quote preview via `POST /api/orders/quote`.
- `EOBVoucherWallet`: eligible public coupons, one-click apply/remove; wired on `cart.html` + `checkout.html` with `CouponUI` + quote refresh.
- Tests: `tests/taxVoucherWallet.test.js`; **495/495** passing.

### Step 4.1.1 — Order timeline + express Buy Now — 2026-09-29

- Five-step timeline (Placed → Payment Verified → Processing → Shipped → Delivered) with cancelled/returned fallbacks; carrier + ETA meta on order details.
- `EOBExpressCheckout`: isolated `buy_now_item` session, quote reset, redirect `/checkout.html`; cards + PDP; variants redirect to PDP `buyNow=1`.
- Tests: `tests/orderTrackingTimeline.test.js`; **490/490** passing.

### Step 3.2.3 — Search debounce, URL sync, filter chips — 2026-09-29

- ~280ms debounced query + filter inputs; `AbortController` cancels stale `/api/products/search` fetches.
- `EOBSearchCatalogSync`: `q`, `category`, `subCategory`, price, sort, page, limit in URL; `popstate` rehydrates + search without reload.
- Active filter chips (+ query chip), one-click remove, **Clear All Filters**; live header/search input debounce.
- Tests: `tests/searchDebounce.test.js`; **482/482** passing.

### Step 3.2.2 — Variant stock matrix + dynamic badges — 2026-09-29

- `PdpVariantStock`: `stockQuantity`/`stock` resolution, in/low/out/select badge classes, Add to Cart label sync, notify-me modal placeholder.
- `variants.js`: matrix incomplete hints, notify visibility on OOS selection; `getAvailableStock` respects full matrix match.
- `variantUtils.js`: `getVariantStockQuantity`, matrix `getOptionState` uses unified stock fields.
- Tests: `tests/variantStock.test.js`; **476/476** passing.

### Step 3.2.1 — PDP hover zoom + lightbox — 2026-09-29

- `PdpGalleryEnhancements`: `requestAnimationFrame` hover lens (desktop `(min-width: 992px)` + fine pointer), hi-res pane via `EOBImageUtils.buildResponsiveUrl`.
- Full-screen modal: ESC/arrow keys, prev/next, thumbnail strip, counter, focus trap + `role="dialog"` / `aria-modal`.
- Wired from `pdp/gallery.js` (`mount`, `onGalleryUpdated`, `onIndexChange`); styles in `product-details.css`.
- Tests: `tests/pdpGallery.test.js`; **470/470** passing.

### Step 3.1.3 — Payload optimization (bounded fetch + SWR) — 2026-09-29

- Removed storefront `GET /api/products?limit=500` from `cart.js` / `checkout.js`; cart uses `GET /api/products/lookup?ids=`.
- Home: featured (`limit=10`), trending (`sort=sales`), flash deals (`/flash-deals`); `EOBApiCache` 3m TTL.
- Search default `limit=20` (max 20 via client clamp); tests `tests/payloadOptimization.test.js`; **465/465** passing.

### Step 3.1.2 — Image pipeline (LCP + CLS) — 2026-09-29

- `EOBImageUtils`: responsive Cloudinary transforms, `srcset`/`sizes`, lazy vs LCP (`fetchpriority="high"`).
- Wired through `productThumbnail.js`, `render.js`, `main.js`, `search.js`, `cart.js`, `banner-slider.js`, `pdp/gallery.js`; CSS aspect-ratio on product cards.
- Tests: `tests/imagePipeline.test.js`.

### Step 3.1.1 — Skeleton loaders (CLS / perceived performance) — 2026-09-29

- `client/js/ui/skeletons.js`, `client/css/global/_skeletons.css` imported via `style.css`.
- Integrated: `main.js` (product grid + categories), `banner-slider.js`, `search.js`, `pdp/fetch-render.js`, `checkout/render.js`, `checkout/quote.js`, `cart.js`, `mini-cart-drawer.js`.
- Tests: `tests/skeletonLoaders.test.js`; **452/452** passing.

### Step 2.2.3 — Multi-tab checkout + payment status sync — 2026-09-29

- `checkout/checkoutCrossTabSync.js`: `eob_checkout_sync` channel + cart/storage listeners; stale tab UI + payment redirect to order details.
- `checkout/paymentStatusSync.js`: `COD_PENDING` → `GATEWAY_*` → terminal payment states; `pollPaymentVerification`.
- `orderSuccess.js`, `payment.js`: no false “order complete” on automated gateway until verify succeeds.
- Idempotency invalidate broadcasts `CHECKOUT_SESSION_INVALIDATED`.
- Tests: `tests/multiTabCheckout.test.js`, `tests/paymentStatusSync.test.js`; **447/447** passing.

### Step 2.2.2 — Idempotency + submit lock — 2026-09-29

- `ensureCheckoutIdempotencyKey` stored in session + `EOBCheckoutState`; invalidated on checkout cart qty changes.
- `payment.js`: `buildIdempotencyHeaders` on `POST /api/orders` and `/api/payments/initiate`; `beginOrderSubmitLock` blocks double-click.
- Tests: `tests/idempotency.test.js`; **438/438** passing.

### Step 2.2.1 — Server checkout quote — 2026-09-29

- Debounced `POST /api/orders/quote` on address/coupon/wallet/loyalty/cart changes.
- Checkout summary + proceed gate use `activeQuote`; fallback to client totals with warning if quote fails.
- `payment.js` re-quotes on load; payable amount aligned to server decimals.
- Tests: `tests/orderQuote.test.js`; **430/430** passing.

### Step 2.1.3 — Cart badge qty + guest merge sync — 2026-09-29

- Badge counters use sum of line `quantity` (`badgeCount` / `computeTotalCartQuantity`); hidden at zero via `applyCartBadgeCount`.
- `stripGuestCartForMerge` sends only `productId`, `variantId`, `quantity`; merge uses 15s fetch timeout.
- `CartMerge.snapshotGuestCartBeforeAuth`, `mergeGuestCartWithUserCart`; `auth.js` snapshot before login; `index.html` + profile scripts load `cart-merge.js`.
- Cross-tab: `BroadcastChannel('eob_cart_sync')` + `storage` listener refreshes guest/server cart in other tabs.
- Tests: `tests/cartBadge.test.js`, `tests/cartMerge.client.test.js`; **425/425** passing.

### Step 2.1.2 — Cart qty debounce + rollback — 2026-09-29

- `CartDisplayUtils.createCartQtySyncManager` / `getCartQtySync` (350ms debounce, line loading state).
- `cart.js` `updateQty`: optimistic qty, debounced `/api/cart/update-quantity`, server sync + rollback toast.
- `checkout/actions.js` `changeItemQuantity` uses same sync manager.
- `pdp/qty-cart.js` add-to-cart in-flight guard.
- `commerceState.js` `commitCart({ silent })` for optimistic UI without premature `cart:updated`.
- Tests: `tests/cartDebounce.test.js`; **419/419** passing.

### Wishlist GET TypeError fix — 2026-09-29

- `userWishlistController.getWishlist`: use `findMongoUserByRef(ref, '_id')` (no `.select` on Promise); graceful empty list when user/read fails.

### Order details return UI + print receipt — 2026-09-29

- `orderReturnWorkflow.js`: ignore default `returnRequest.status: pending` on new orders; return badge/timeline only when `hasActiveReturnRequest`.
- `profile/invoice.js`: print receipt via hidden iframe (`printHtmlViaHiddenFrame`), no `window.open`.

### Checkout idempotency boolean session fix — 2026-09-29

- `idempotency.js`: `readCheckoutSessionRecord()` ignores JSON-parsed `true` from legacy `markCheckoutSessionActiveFlag`; `writeSessionIdempotency` initializes `{}` when needed.

### Cart TDZ fix (cartDeliverySettings) — 2026-09-29

- Moved `cartDeliverySettings` to module top in `cart.js` (before `bootstrapCartFromServerCart()` invoke) to fix TDZ on `/cart` load.

### Cart scope, commerceState syntax, grid cards — 2026-09-29

- Fixed `commerceState.js` duplicate `CDU` parse error in `persistGuestCartToStorage`.
- `cart.js`: `getActiveCartLines` / `getCartRef` / `legacyCartRef`; removed bare `cart` reads; fixed `renderCartDrawerItems` CDU shadowing (`cartUtils`).
- `pdp/fetch-render.js`: PDP toast uses captured native `window.showToast` (no recursion).
- `pdp/qty-cart.js`: PDP add uses `applyCartSnapshot` / `EOBCommerce.setCart` + drawer refresh.
- Home/search grid: removed catalog **Buy Now**; full-width **Add to Cart** in `home.css`.
- Tests: **514/514** passing.

### Step 2.1.1 — Server-authoritative cart pricing — 2026-09-29

- Client: `buildCartAddPayload`, `stripGuestCartForMerge`, catalog-based guest pricing in `normalizeCartItem`; refactored `cart.js`, `pdp/qty-cart.js`, `cart-merge.js`, `profile/wishlist.js`.
- Backend: `cartController` ignores client `price` on add; merge reprices guest lines via `resolveSellingPriceFromSettings`.
- Tests: `tests/cartApiPayload.test.js`, tampered-price case in `tests/cart.test.js`; **417/417** passing.

### Step 1.2.3 — XSS sanitization — 2026-09-29

- Added `client/js/utils/sanitizer.js` (`escapeHtml`, `sanitizeRichText`, `sanitizeDisplayText`, `setTextContent`).
- Storefront HTML loads `sanitizer.js` after `telemetry.js` (15 shells + profile scripts partial).
- Refactored high-risk render paths: `main.js`, `pdp/fetch-render.js`, `search.js` (reflected `?q=`), `page-content-loader.js`, `page.js`, `cartDisplayUtils.js`, `checkout/render.js`, `payment.js`, `order-details.js`, `wishlist.js`, `chat-widget.js`, `bd-districts.js`, `toast.js`.
- Tests: `tests/sanitizer.test.js`; full suite **414/414**.

### Step 1.2.2 — Telemetry + UI recovery — 2026-09-29

- Added `client/js/utils/telemetry.js` (`logError`, `logWarning`, `initGlobalErrorHandlers`, `recoverFrozenUi`).
- Storefront HTML: load `telemetry.js` immediately after `storage.js`, before `commerceState.js` (15 shells + profile scripts partial).
- Jest: `tests/telemetry.test.js` (4 cases). Full suite **409/409**.

### Step 1.2.1 — Session guard 401 + checkout-safe expiry — 2026-09-29

- Patched `window.fetch`: 401 on customer APIs → shared `refreshPromise` (one refresh in flight) → single retry with `_eobAuthRetried`.
- Candidate refresh URLs: `/api/customer/refresh-token`, `/api/auth/refresh-token` (skipped when all return 404/501/405; no backend route today).
- Unrecoverable 401 during checkout: `EOBCommerce.dropAuthPreservingCommerce()` → `CHECKOUT_INITIATED` retained; no cart/checkout draft wipe; no hard redirect on `/checkout` or `/payment`; `#eobSessionRevalidateModal` + checkout alert copy.
- `commerceState.js`: `setAuthTokens(token, userOverride)`; auth clear during checkout keeps FSM in checkout flow.
- Tests: **405/405** passing.

### Step 1.1.2 — Commerce state machine + event bus — 2026-09-29

- `EOBCommerce` state machine: `GUEST_ANONYMOUS`, `LOGGED_IN`, `CART_MUTATING`, `CHECKOUT_INITIATED`, `ORDER_PROCESSING` with guarded transitions.
- Pub/sub: `cart:updated`, `auth:changed`, `checkout:session_changed`, `state:changed`.
- Subscribers: `cart.js` (drawer/page render), `header.js` (nav badges), `sidebarDrawer.js` (greeting + optional drawer count).
- Payment flow: `beginOrderProcessing` / `abortOrderProcessing` / `completeOrderProcessing`.
- Boot `hydrateFromStorage()` restores cart + checkout draft from `EOBStorage`.
- Tests: **405/405** passing.

### Step 1.1.1 — Storage + state encapsulation — 2026-09-29

- Added `EOBStorage` with try/catch JSON helpers; all `client/js` direct `localStorage`/`sessionStorage` calls routed through it (except internal implementation in `utils/storage.js`).
- Added `EOBCommerce` (cart/catalog proxies on `window.cart` / `window.globalProductCatalog`) and `EOBCheckoutState` for checkout UI globals.
- Storefront HTML shells load `storage.js` + `commerceState.js` before `session-guard.js`; checkout also loads `checkoutState.js`.
- Tests: Jest **405/405** passing.

### Product EN/BN storefront toggle — 2026-10-01

- `ProductLocale` reads `name_bn`, `description_bn`, `detailedDescription_bn`, `highlights_bn` when `i18n` lang is `bn`
- Wired on homepage (`main.js`), search grid (`search.js`), PDP (`pdp/fetch-render.js`) with `languageChanged` re-render
- Tests: Jest **521/521** (suite-wide)

### Group 4 — Loyalty + returns UI — 2026-09-20

- Checkout loyalty panel with points-to-discount preview; session passes redemption to payment
- Profile dashboard loyalty card: tier, next tier, points activity list from `loyaltySummary`
- Tests: Jest **228/228** passing

### Audit system initialized — codebase scan — 2026-09-20

- File Inventory built from `client/*.html` + `client/js/` tree scan
- Status: ✅ COMPLETE
