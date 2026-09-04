# Mobile App Audit Report
**Date:** 2026-09-04  
**Scope:** Full `mobile/` directory audit vs. eonlinebazar.com web platform  
**Standard:** Super Ultra Design + full-stack API parity

---

## 1. Features Verified 100% Functional

### Home & Product Display
| Feature | Status | Implementation |
|---------|--------|----------------|
| Search bar (pill, right magnifier, no outer button) | ✅ | `ProductGrid.js` — `searchVariant="premium"`, `borderRadius: 16`, embedded `Ionicons search-outline` |
| Dynamic banners from API + swipe dots | ✅ | `HomeScreen.js` — `GET /store/banners`, auto-scroll, dot indicators |
| Categories grid (circular icons + product count badges) | ✅ | `CategoryGrid.js` — `GET /categories/homepage` |
| Product cards: images, ratings, discount %, stock, cart, wishlist | ✅ | `ProductGrid.js` — `StarRating`, discount badge, stock badges, `HeartButton`, Add to Cart |
| Flash sale row with live countdown | ✅ | `HomeScreen.js` — `GET /store/flash-sale` |
| Home header account avatar / sign-in | ✅ | `HomeScreen.js` — circular avatar or login shortcut |

### Cart & Checkout
| Feature | Status | Implementation |
|---------|--------|----------------|
| Per-item checkbox + Select All | ✅ | `CartScreen.js` + `useCartStore.js` |
| Totals from selected items only | ✅ | `selectedItems` filter + checkout gate |
| Saved address radio cards (DEFAULT badge) | ✅ | `CheckoutScreen.js` — `SavedAddressCard` |
| District / Upazila cascading + live delivery fee | ✅ | `DistrictUpazilaPicker` + `GET /store/shipping-quote` |
| Coupon section hidden when no active coupons | ✅ | `couponsAPI.activeCheck()` → `couponsAvailable` |
| Dynamic payment gateways (enabled only) | ✅ | `GET /payments/methods` — logos, instructions, processing fees, TRX field |
| Selected-items-only checkout payload | ✅ | `CheckoutScreen` passes filtered `checkoutItems` to `createOrder` |

### Profile & Settings
| Feature | Status | Implementation |
|---------|--------|----------------|
| Profile tab circular avatar when logged in | ✅ | `AppNavigator.js` — `ProfileTabIcon` |
| Edit profile, addresses, orders, wishlist | ✅ | Profile hub + stack screens |
| Order tracking timeline | ✅ | `OrderStatusTimeline.js` on `OrderDetailsScreen` |
| Language switcher (EN / বাংলা) | ✅ | `useLanguageStore.js` + Profile preferences |
| Dark / Light mode | ✅ | `useThemeStore.js` |
| Logout + account deletion | ✅ | `LogoutConfirmModal`, `DeleteAccountScreen` |
| Wallet, loyalty points, notebook, security | ✅ | Dedicated stack screens |

### Live Chat & UX
| Feature | Status | Implementation |
|---------|--------|----------------|
| Aria live chat with KeyboardAvoidingView | ✅ | `LiveSupportScreen.js` + `AriaChatPanel.js` |
| SweetAlert-style close/minimize modal | ✅ | `ChatEndConfirmModal.js` |
| FAQ hides when keyboard open | ✅ | `keyboardVisible` state |
| In-app toast alerts | ✅ | `ToastBanner` + `useToastStore` |
| Cart tab badge count | ✅ | `AppNavigator.js` |
| Error boundary + splash safety | ✅ | `ErrorBoundary.js`, `splash.js` |

---

## 2. Missing Components Added / Fixed (This Audit)

| Item | Action |
|------|--------|
| `StarRating.js` | **Added** — star display on product cards |
| `CategoryGrid.js` | **Added** — homepage circular category icons from API |
| `OrderStatusTimeline.js` | **Added** — web-parity order status steps |
| `useLanguageStore.js` + `i18n/translations.js` | **Added** — EN/BN language preference (persisted) |
| `ProductGrid.js` | **Updated** — ratings, stock badges, discount logic, search `borderRadius: 16`, disabled OOS cart |
| `HomeScreen.js` | **Updated** — header avatar/login + category grid in hero |
| `OrderDetailsScreen.js` | **Updated** — order tracking timeline section |
| `ProfileScreen.js` | **Updated** — language switcher (logged-in + guest) |
| `App.js` | **Updated** — language store hydration on boot |
| `search.js` | **Updated** — `getHomepageCategories()` API helper |

---

## 3. UI Polish & Performance Improvements

- **Search UX:** Premium pill uses `borderRadius: 16` with zero-offset embedded magnifier (no separate search button on Home).
- **Product cards:** Visual stock states (Out of Stock / Limited), star ratings with review counts, unified discount % calculation (flash sale + regular sale).
- **Home hero:** Category grid loads asynchronously; section hidden when API returns empty (no layout jump).
- **Order details:** Horizontal scroll timeline mirrors web `orderStatusTimeline.js` step logic including cancelled state banner.
- **Profile:** Segmented EN/বাং language control matches theme toggle pattern; preference persisted via AsyncStorage.
- **Performance:** Existing memoization on `HomeScreen`, `ProductGrid`, `ProductCard`, `CategoryGrid` preserved; category/banner loads parallelized in `loadHero`.

---

## 4. Known Gaps / Future Work

| Feature | Notes |
|---------|-------|
| **Native push notifications** | No backend push-token endpoint exists yet. In-app toasts + cart badge cover alerts today. Adding `expo-notifications` requires EAS native build + server webhook for order status. |
| **Full i18n coverage** | Language store + core strings added; full screen-by-screen translation (matching web `public/js/i18n.js`) can be expanded incrementally. |
| **Payment admin path** | Mobile uses `GET /api/payments/methods` (correct live route). Web admin configures via settings modules; no `/api/settings/payment` public route. |

---

## 5. Files Modified in This Audit

**New:**  
`mobile/src/components/StarRating.js`  
`mobile/src/components/CategoryGrid.js`  
`mobile/src/components/OrderStatusTimeline.js`  
`mobile/src/store/useLanguageStore.js`  
`mobile/src/i18n/translations.js`  
`AUDIT_REPORT.md`

**Modified:**  
`mobile/src/components/ProductGrid.js`  
`mobile/src/screens/HomeScreen.js`  
`mobile/src/screens/OrderDetailsScreen.js`  
`mobile/src/screens/ProfileScreen.js`  
`mobile/src/api/search.js`  
`mobile/App.js`  
`REFACTOR_MAP.md`

---

*Audit completed against live API base `https://eonlinebazar.com/api` per `mobile/src/services/api.js`.*
