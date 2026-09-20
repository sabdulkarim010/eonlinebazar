# CUSTOMER FRONTEND AUDIT — EonlineBazar

**Last updated:** 2026-09-20  
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
| `client/js/cart.js` / `cart-merge.js` | Cart logic + guest merge |
| `client/js/checkout.js` + `client/js/checkout/` | Checkout state, validation, submit |
| `client/js/product-details.js` + `client/js/pdp/` | PDP gallery, variants, reviews, add-to-cart |
| `client/js/profile.js` + `client/js/profile/` | Profile tabs: orders, wallet, addresses, notes, security |
| `client/js/auth.js` / `session-guard.js` | Login state + route guard |
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
- [x] Checkout (COD, gateways, wallet, VAT) — `checkout.html`, `checkout/submit.js`
- [x] Customer registration / login — `login.html`, `auth.js`
- [x] Profile management (tabs) — `profile.html`, `profile/tabs.js`
- [x] Order history + order details — `profile/orders.js`, `order-details.html`
- [x] Public order tracking — `order-track.html`, `order-track.js`
- [x] Wishlist — `profile/wishlist.js`, `wishlist.js`
- [x] Wallet & loyalty points UI — `profile/wallet.js`
- [x] Customer addresses (BD districts) — `profile/addresses.js`, `bd-districts.js`
- [x] Customer notebook — `profile/notes.js`
- [x] Session / security settings — `profile/security.js`
- [x] Payment proof upload — `payment.html`, checkout flow
- [x] Invoice download — `invoiceDownload.js`
- [x] PWA support — `pwa.js`, `public/manifest.json`
- [x] SEO pages + sitemap consumer — `page-content-loader.js`
- [x] Live chat widget entry — `orderChat.js`
- [x] Store branding (logo, favicon) — `store-branding.js`

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

### Audit system initialized — codebase scan — 2026-09-20

- File Inventory built from `client/*.html` + `client/js/` tree scan
- Status: ✅ COMPLETE
