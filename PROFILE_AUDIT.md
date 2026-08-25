# Profile Module Audit & Diagnostics

**Scope:** `/profile` after the JS split (`client/js/profile/*`) and HTML partials (`client/profile/partials/*`).  
**Mode:** Read-only. No code was changed.  
**Page assembly:** `GET /profile` → `backend/src/utils/profilePageBuilder.js` injects partials into the thin shell `client/profile.html`.  
**JS entry:** `client/profile/partials/scripts.html` loads classic scripts, then `<script type="module" src="js/profile.js">`.

---

## Executive summary

The HTML partials **do contain** the IDs the runtime errors name (`#password-form`, `#orders-pagination`, `#dashboard-orders-tbody`, `#orders-list-tbody`). The failures are **JS module scope**, not missing markup.

The original `profile.js` was one `DOMContentLoaded` closure. After the split, each file got its **own** `DOMContentLoaded` listener. Shared `const` bindings (`passwordForm`, `ordersPaginationEl`, `ordersListTbody`, …) stayed in `tabs.js` (and were later **copied unused** into `account.js`). Consumer modules still use those names as free identifiers → `ReferenceError` in ES modules.

That abort **prevents** `orders.js` from reaching `Object.assign(window, { fetchUserOrders, buildOrderRowHtml })`. `account.js` then cannot render recent orders, so the overview table stays on **“Loading recent activity...”**.

Separately, `tabs.js` wraps `window.showToast` and then **overwrites** `window.showToast` with that wrapper → infinite recursion.

---

## Boot order (current)

`client/js/profile.js` imports, in order:

1. `tabs.js`
2. `orders.js`
3. `reviews.js`
4. `wallet.js`
5. `wishlist.js`
6. `addresses.js`
7. `security.js`
8. `account.js`

Modules are `type="module"` (deferred). All eight register `DOMContentLoaded` handlers, then the event fires **in registration order**.

`scripts.html` load order is sound: `toast.js` (defines `window.showToast`) runs **before** `js/profile.js`.

---

## Causal chain (why all five symptoms appear together)

```
tabs.js listener
  → defines local showToast() that calls window.showToast
  → Object.assign(window, { showToast })   // clobbers toast.js
  → any later showToast()  → RangeError (infinite recursion)

orders.js listener
  → hits `if (ordersPaginationEl)` with no local binding
  → ReferenceError: ordersPaginationEl is not defined
  → Object.assign(window, { fetchUserOrders, buildOrderRowHtml }) NEVER runs

security.js listener
  → hits `if (passwordForm)` with no local binding
  → ReferenceError: passwordForm is not defined
  → Object.assign(window, { fetchSessions, … }) NEVER runs

account.js listener
  → fetchDashboardStats() maps rows with buildOrderRowHtml  → ReferenceError
  → fetchUserOrders()                                      → ReferenceError
  → #dashboard-orders-tbody left at "Loading recent activity..."
  → any showToast() from this file                         → RangeError
```

---

## AUDIT — `client/js/profile/tabs.js`

### ISSUE T1 — Infinite `showToast` recursion

| Field | Detail |
|---|---|
| **Symptom** | `RangeError: Maximum call stack size exceeded` in `tabs.js` / `showToast` |
| **Lines** | Wrapper **214–218**; overwrite **458–466** (`Object.assign(window, { …, showToast, … })`); `window.profileShowToast = showToast` at **454** |
| **Root cause** | `client/js/toast.js` line 109 sets `window.showToast` to the real toast engine. The local wrapper then does `window.showToast(message, type)`. `Object.assign` replaces `window.showToast` with **that same wrapper**. Next call: wrapper → wrapper → stack overflow. |
| **Broken scope** | Local `function showToast` and global `window.showToast` become the same function. |
| **Fix strategy** | Do **not** assign the wrapper to `window.showToast`. Keep the engine as `window.showToast`. Either: (a) call `window.showToast` only via a different name (`window.profileShowToast`) that delegates to a **saved** reference (`const nativeToast = window.showToast` captured **before** any assign), or (b) delete the wrapper and use `window.showToast` from `toast.js` directly. Remove `showToast` from `Object.assign(window, …)`. |

### ISSUE T2 — Leftover shared `const`s that belong to other modules

| Field | Detail |
|---|---|
| **Lines** | **146–181** (and related security OTP `const`s) |
| **Root cause** | After the split, `tabs.js` still declares `passwordForm`, `passwordFeedback`, `ordersListTbody`, `ordersPaginationEl`, `ORDERS_PER_PAGE`, `ordersCurrentPage`, OTP nodes, `logoutBtn`, etc. Other files were split **without** those declarations. |
| **DOM** | Elements exist in partials (see HTML section). |
| **Fix strategy** | Delete unused leftover `const`s from `tabs.js`. Move each binding into the module that uses it (`orders.js`, `security.js`, `account.js`). |

### ISSUE T3 — Tab refresh uses bare cross-module names

| Field | Detail |
|---|---|
| **Lines** | `refreshTabData` **346–358** |
| **Root cause** | Uses `typeof fetchUserOrders === 'function'` (safe-ish) but `fetchWishlist()` at **354** has **no** `typeof` guard. During `tabs.js`’s own listener, `wishlist.js` has not run yet. Default tab is overview so this is usually skipped; opening Cart immediately after a failed wishlist export would throw. |
| **Fix strategy** | Call `window.fetchWishlist`, `window.fetchUserOrders`, `window.fetchDashboardStats`, etc., with `typeof window.fn === 'function'` guards. |

### ISSUE T4 — Duplicate helpers vs `account.js`

| Field | Detail |
|---|---|
| **Root cause** | `updateSecurityContactDisplays` lives in `tabs.js` (**208–213**) and is assigned to `window`. `account.js` also re-queries security DOM nodes it does not use. Confusing dual ownership. |
| **Fix strategy** | Keep contact-display helper in `security.js` only; `account.js` should call `window.updateSecurityContactDisplays`. |

---

## AUDIT — `client/js/profile/orders.js`

### ISSUE O1 — `ordersPaginationEl is not defined` (reported)

| Field | Detail |
|---|---|
| **Symptom** | `ReferenceError: ordersPaginationEl is not defined` |
| **First throw** | **512–522** (`if (ordersPaginationEl) { … addEventListener }`) runs at listener setup, **before** `Object.assign` at **575–600**. |
| **Also used** | **416–432**, **469–471** |
| **Root cause** | Variable was declared in the old monolith / still in `tabs.js` **176** and unused in `account.js` **67**. **Not declared in `orders.js`.** ES modules do not share sibling `const`s. |
| **HTML** | **Present:** `client/profile/partials/tab-orders.html` line 38 — `id="orders-pagination"` (not `#ordersPagination`). Builder injects this partial. |
| **Fix strategy** | In `orders.js` (inside its `DOMContentLoaded`): `const ordersPaginationEl = document.getElementById('orders-pagination');` |

### ISSUE O2 — Same missing locals: `ordersListTbody`, `ORDERS_PER_PAGE`, `ordersCurrentPage`

| Field | Detail |
|---|---|
| **Lines** | `fetchUserOrders` **462–510**; pagination math **418–428** |
| **Root cause** | Still declared only in `tabs.js` **175–178** (and copied into `account.js` **66–69**). Once O1 is fixed, the next call to `fetchUserOrders` would throw on `ordersListTbody` / `ORDERS_PER_PAGE`. |
| **HTML** | **Present:** `#orders-list-tbody` in `tab-orders.html` line 29. |
| **Fix strategy** | Declare in `orders.js`: `ordersListTbody`, `ORDERS_PER_PAGE = 10`, `let ordersCurrentPage = 1`. |

### ISSUE O3 — `Object.assign` never reached

| Field | Detail |
|---|---|
| **Lines** | **575–600** inside the same `DOMContentLoaded` as O1 |
| **Root cause** | O1 throws first → `window.fetchUserOrders` and `window.buildOrderRowHtml` are never published. |
| **Fix strategy** | Fix O1/O2 so the listener completes. Prefer `window.fetchUserOrders = fetchUserOrders` next to the function definition (before any code that can throw). Callers should use `window.fetchUserOrders`. |

---

## AUDIT — `client/js/profile/security.js`

### ISSUE S1 — `passwordForm is not defined` (reported)

| Field | Detail |
|---|---|
| **Symptom** | `ReferenceError: passwordForm is not defined` |
| **First throw** | **69** `if (passwordForm)` |
| **Root cause** | Declared in `tabs.js` **157** and leftover in `account.js` **48**. **Not declared in `security.js`.** |
| **HTML** | **Present:** `tab-security.html` line 27 — `id="password-form"`. |
| **Fix strategy** | At top of `security.js` listener: `const passwordForm = document.getElementById('password-form');` plus the other security/OTP nodes listed in S2. |

### ISSUE S2 — Additional undeclared identifiers (same class of bug)

Used in `security.js` but declared only in `tabs.js` / leftover `account.js`:

| Identifier | HTML id (exists in partials) |
|---|---|
| `passwordFeedback` | `#password-feedback` (`tab-security.html`) |
| `contactFeedback` | `#contact-feedback` |
| `contactOtpModal` | `#contact-otp-modal` (`modals.html`) |
| `contactOtpForm` | `#contact-otp-form` |
| `contactOtpSubtext` | `#contact-otp-subtext` |
| `contactOtpFeedback` | `#contact-otp-feedback` |
| `contactOtpTimer` | `#contactOtpTimer` |
| `contactOtpResendBtn` | `#contact-otp-resend-btn` |
| `requestEmailOtpBtn` | `#request-email-otp-btn` |
| `requestPhoneOtpBtn` | `#request-phone-otp-btn` |
| `pendingContactUpdate` | (state, not DOM) |
| `contactOtpTimerInterval` / `contactOtpResendInterval` | (state) |
| `logoutBtn` (line **454**, sidebar logout) | `#logout-btn` (`sidebar.html`) — **not** the inner `logout-all-btn` at line 550 |

Line 454 will throw next if S1 is fixed without moving `logoutBtn`.

### ISSUE S3 — `Object.assign` for `fetchSessions` skipped

| Field | Detail |
|---|---|
| **Lines** | **767–792** |
| **Root cause** | S1 aborts the listener. `tabs.js` `refreshTabData` will not refresh sessions on Security tab. |
| **Fix strategy** | Same as S1; then `window.fetchSessions` is published. |

---

## AUDIT — `client/js/profile/account.js`

### ISSUE A1 — `fetchUserOrders is not defined` / `buildOrderRowHtml is not defined` (reported)

| Field | Detail |
|---|---|
| **Lines** | `buildOrderRowHtml` **303**; `fetchUserOrders()` **466** |
| **Root cause** | Functions live in `orders.js` and are only exported at the **end** of that listener (`Object.assign`). O1 aborts first. `account.js` uses **bare** identifiers, not `window.fetchUserOrders`. Even after a successful export, ES module lookup of undeclared names is fragile; callers should use `window.*`. |
| **Fix strategy** | After orders export is reliable: `if (typeof window.buildOrderRowHtml === 'function')` when mapping rows; `if (typeof window.fetchUserOrders === 'function') window.fetchUserOrders();`. Do not rely on free identifiers. |

### ISSUE A2 — Infinite spinner on “Loading recent activity...”

| Field | Detail |
|---|---|
| **DOM** | `tab-overview.html` **59–64** — `#dashboard-orders-tbody` initial markup is the spinner row. |
| **Root cause** | `fetchDashboardStats` (**260–320**) only replaces that HTML after `recentOrders.map(order => buildOrderRowHtml(order))`. A1 throws inside that map (or before) → `catch` logs “Error fetching dashboard stats” and **does not** write an error/empty row. Spinner remains forever. Stats numbers above the table may still update if they ran before the map. |
| **Fix strategy** | Use `window.buildOrderRowHtml`. In `catch` / missing helper, set tbody to an empty or error row so the spinner cannot stick. |

### ISSUE A3 — Leftover unused DOM `const`s (split residue)

| Field | Detail |
|---|---|
| **Lines** | **48–80** (password/OTP/orders pagination/theme/drawer) |
| **Root cause** | When leftover profile.js boot was moved to `account.js`, the giant shared `const` block came along. Harmless if unused, but it **hides** the fact that `orders.js` / `security.js` never received those bindings. |
| **Fix strategy** | Keep in `account.js` only nodes it uses (`sidebar-*`, `profile-form` fields, `avatar-input`). |

### ISSUE A4 — Bare calls into other modules

| Call | Defined in | Risk |
|---|---|---|
| `updateSecurityContactDisplays` (**230**) | `tabs.js` (exported if T1 listener finished) | Usually OK if tabs completed |
| `updateWalletDisplay` / `renderCashbackHistory` / `applyRewardSettingsUI` / `applyAnnouncementUI` (**241–244**) | `wallet.js` | OK if wallet listener finished |
| `fetchWishlist()` (**467**) | `wishlist.js` | Same bare-identifier issue as A1 |

**Fix strategy:** `window.updateWalletDisplay(…)`, `window.fetchWishlist()`, etc.

---

## AUDIT — `client/js/profile/wallet.js`

No reported crash. Listener is self-contained (`convert-points-btn`, local `fetchWalletData`). `Object.assign` at **219–225** publishes wallet helpers **if** this listener runs (it is imported before `security.js` / `account.js`, after `orders.js`). **If `orders.js` throws, later listeners still run** (separate `DOMContentLoaded` callbacks). Wallet export should succeed.

`showToast` here is `window.profileShowToast` (the recursive wrapper from T1). Convert-points toasts will stack-overflow until T1 is fixed.

---

## AUDIT — `client/js/profile/wishlist.js`

Same as wallet: local `getElementById`s, `Object.assign` **348–354**. `fetchWishlist` should be on `window` after this listener. `account.js` still must call `window.fetchWishlist`. Uses `profileShowToast` → T1.

---

## AUDIT — `client/js/profile/addresses.js`

Self-contained (`address-grid`, modal ids in `modals.html`). `Object.assign` **339–347**. Uses `profileShowToast` → T1.

---

## AUDIT — `client/js/profile/reviews.js`

Self-contained review modal ids (all in `modals.html`). Lowest split risk. Uses `profileShowToast` → T1.

---

## AUDIT — HTML partials & `profilePageBuilder.js`

### ISSUE H1 — Missing IDs? **No** (for the reported errors)

| Runtime name | Expected DOM id | Partial | Present? |
|---|---|---|---|
| `ordersPaginationEl` | `orders-pagination` | `tab-orders.html` | Yes |
| `ordersListTbody` | `orders-list-tbody` | `tab-orders.html` | Yes |
| `passwordForm` | `password-form` | `tab-security.html` | Yes |
| Recent activity spinner | `dashboard-orders-tbody` | `tab-overview.html` | Yes |
| `profile-form` | `profile-form` | `tab-settings.html` | Yes |

There is **no** `#ordersPagination` camelCase id. Do not rename the HTML id; bind `getElementById('orders-pagination')` in `orders.js`.

### ISSUE H2 — Builder / shell

`profilePageBuilder.js` requires `tab-overview`, `tab-orders`, `tab-security`, `modals`, `scripts`. Shell `client/profile.html` has matching `<!-- PARTIAL:… -->` markers. Script tag `js/profile.js` is in `scripts.html` **after** `toast.js`. **No 404 path issue** for the profile barrel.

### ISSUE H3 — Toast container mismatch (minor)

`scripts.html` has `#toast-container`. `toast.js` uses/creates `#global-toast-stack`. Not the recursion cause. Optional cleanup later: one container id.

---

## Circular dependencies

There is **no ES `import` cycle**. All profile files are side-effect modules imported from `profile.js`. The “cycle” is **runtime**:

- `tabs.js` wrapper ↔ `window.showToast` (T1)
- `account.js` / `tabs.js` ↔ `orders.js` functions that never export because `orders.js` throws (O1 → A1)

---

## Proposed fix order (do not apply in this audit)

1. **T1** — Stop overwriting `window.showToast`; capture `toast.js` implementation once.
2. **O1 + O2** — Declare `ordersPaginationEl`, `ordersListTbody`, `ORDERS_PER_PAGE`, `ordersCurrentPage` in `orders.js`.
3. **S1 + S2** — Declare password/OTP/`logoutBtn` locals in `security.js`.
4. **A1 + A2** — `account.js` calls `window.buildOrderRowHtml` / `window.fetchUserOrders` with guards; error-state HTML for `#dashboard-orders-tbody`.
5. **T2 / A3** — Strip leftover shared `const`s from `tabs.js` and `account.js`.
6. **T3 / A4** — Cross-module calls only via `window.*` + `typeof` checks.

After that, `/profile` overview should replace the spinner, toasts should show once, and Security/Orders listeners should finish exporting.

---

## Files reviewed (no edits)

- `client/js/profile.js`
- `client/js/profile/tabs.js`
- `client/js/profile/orders.js`
- `client/js/profile/security.js`
- `client/js/profile/account.js`
- `client/js/profile/wallet.js`
- `client/js/profile/wishlist.js`
- `client/js/profile/addresses.js`
- `client/js/profile/reviews.js`
- `client/js/toast.js`
- `client/profile/partials/*`
- `client/profile.html`
- `client/profile/partials/scripts.html`
- `backend/src/utils/profilePageBuilder.js`
