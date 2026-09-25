# MARKETING AUDIT — EonlineBazar

**Last updated:** 2026-09-25 (Phase 4.4 loyalty ledger, coupon rules, banner CTR)  
**Scope:** Newsletter, coupons, email campaigns, loyalty tiers, referrals, abandoned carts, reviews, WhatsApp broadcasts  
**Status:** ⚠️ PARTIAL

---

## File Inventory

| Path | Role |
|------|------|
| `backend/src/routes/couponRoutes.js` | Coupon CRUD + apply |
| `backend/src/routes/newsletterRoutes.js` | Newsletter subscribe + admin |
| `backend/src/routes/reviewRoutes.js` | Review CRUD + moderation |
| `backend/src/controllers/couponController.js` | Coupon logic |
| `backend/src/controllers/newsletterController.js` | Public subscribe |
| `backend/src/controllers/newsletterAdminController.js` | Subscribers + campaigns |
| `backend/src/controllers/reviewController.js` | Customer reviews |
| `backend/src/controllers/reviewAdminController.js` | Review moderation |
| `backend/src/controllers/referralController.js` | Referral rewards |
| `backend/src/controllers/admin/crmController.js` | Abandoned carts + CRM KPIs |
| `backend/src/controllers/admin/supportSlaController.js` | Support ticket SLA |
| `backend/src/jobs/abandonedCartJob.js` | Hourly multi-stage cart recovery cron |
| `backend/src/services/abandonedCartService.js` | Stage 1/2/3 recovery sequence + coupon generation |
| `backend/src/services/rfmSegmentationService.js` | RFM customer segmentation for CRM |
| `backend/src/services/whatsappService.js` | WhatsApp gateway + broadcasts (suspended-safe) |
| `backend/src/services/gatewayStatusService.js` | Cached gateway health for admin UI |
| `backend/src/controllers/settingsController.js` | `GET /settings/gateway-status` |
| `client/js/admin-newsletter.js` | Campaign UI + sandboxed HTML preview + gateway banner |
| `backend/src/utils/sanitizeHtml.js` | `sanitizeCampaignHtml` for email-safe HTML |
| `backend/src/services/orderMarketingRedemptionService.js` | Atomic loyalty debit/restore + cancel redemption restore |
| `backend/src/queues/emailCampaignQueue.js` | BullMQ campaign dispatch queue + inline fallback |
| `backend/src/workers/emailCampaignWorker.js` | Async campaign batch worker |
| `backend/src/services/emailCampaignDispatchService.js` | Campaign recipient resolution + batch send |
| `backend/src/jobs/scheduledCampaignJob.js` | Auto-dispatch due scheduled campaigns (3-min cron) |
| `backend/src/services/newsletterTokenService.js` | JWT confirm/unsubscribe tokens + RFC 2369 List-Unsubscribe headers |
| `backend/src/utils/newsletterSubscriberHelpers.js` | Double opt-in eligibility + confirmed subscriber Mongo query |
| `backend/src/models/loyaltyLedger.js` | Immutable loyalty point transaction ledger |
| `backend/src/services/loyaltyLedgerService.js` | Atomic point credit/debit + ledger append |
| `backend/src/repositories/loyaltyLedgerRepository.js` | PG loyalty ledger dual-write |
| `backend/src/jobs/loyaltyPointExpiryJob.js` | Daily cron — expire earned points past policy window |
| `client/admin/partials/view-catalog.html` | `#whatsappGatewayBanner` warning |
| `backend/src/models/coupon.js` / `newsletter.js` / `review.js` | Marketing models |
| `backend/src/repositories/couponRepository.js` | PG coupons |
| `backend/src/repositories/newsletterRepository.js` | PG newsletter |
| `backend/src/repositories/emailCampaignRepository.js` | PG email campaigns |
| `backend/src/repositories/reviewRepository.js` | PG reviews |
| `client/js/admin/modules/catalog-coupons.js` | Coupon admin UI |
| `client/js/admin/modules/crm-abandoned-carts.js` | Abandoned cart CRM |
| `client/js/admin/modules/settings-loyalty.js` | Loyalty tier settings |
| `client/js/admin/modules/settings-reviews.js` | Review moderation |
| `client/js/admin-newsletter.js` | Newsletter admin |
| `client/js/admin/modules/messages-inbox.js` | Support ticket inbox |
| `client/js/coupon-ui.js` | Storefront coupon apply |
| `client/admin/partials/view-crm-abandoned.html` | Abandoned cart view |
| `client/admin/partials/view-reviews.html` | Reviews moderation |
| `client/admin/partials/view-messages.html` | Contact/support inbox |

---

## Feature Checklist

- [x] Coupon CRUD + checkout apply — `couponController.js`, `catalog-coupons.js`
- [x] Newsletter subscribers list — `newsletterAdminController.js`
- [x] Double opt-in subscription flow — `newsletterController.js`, `newsletterTokenService.js`
- [x] RFC 2369 unsubscribe headers + JWT one-click unsubscribe — `mailer.js`, `newsletterRoutes.js`
- [x] Email campaign broadcast — `newsletterAdminController.js` (confirmed subscribers only)
- [x] Campaign visual template JSON (`templateData`) — `emailCampaign.js`, `updateCampaign`
- [x] Granular RBAC — `manage_newsletter`, `manage_campaigns` on admin routes
- [x] Immutable loyalty ledger + user history API — `loyaltyLedgerService.js`, `GET /api/user/loyalty/history`
- [x] Loyalty point expiry cron — `loyaltyPointExpiryJob.js` (`LOYALTY_EXPIRY_CRON`)
- [x] Advanced coupon rules — payment method, category spend, tiered, buy-x-get-y
- [x] Banner impression/click tracking + admin CTR — `bannerController.js`
- [x] Customer referral codes + wallet rewards — `referralController.js`
- [x] Loyalty tiers (Silver/Gold/Platinum) — Settings loyalty fields, monthly cron
- [x] Abandoned cart recovery (multi-stage 1h/24h/48h) — `abandonedCartJob.js`, `abandonedCartService.js`
- [x] RFM customer segmentation — `rfmSegmentationService.js`, CRM `/crm/rfm-segments` endpoints
- [x] Multi-channel segmented campaigns — CRM campaign tools
- [x] Review moderation — `reviewAdminController.js`, `view-reviews.html`
- [x] Support ticket lifecycle + SLA — `ContactMessage.js`, `messages-inbox.js`, `supportSlaController.js`
- [x] PG repositories — coupon, newsletter, emailCampaign, review
- [x] PG CRM read cutover — `READ_PG_CRM` via `routedRead('crm')` with Mongo fallback; KPI `count`/`value` use aggregated queries (not unbounded `findMany`)
- [x] Abandoned cart notify — hybrid PG/Mongo lookup + PG `abandonedNotifiedAt` mirror
- [x] PG marketing reads — `READ_PG_COUPON`, `READ_PG_NEWSLETTER`, `READ_PG_EMAILCAMPAIGN`, `READ_PG_REVIEW`
- [ ] WhatsApp marketing broadcasts | UltraMsg account suspended — service stopped

---

## Known Issues / Gaps

| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| Campaign HTML stored XSS | High | Fixed | 2026-09-25 — `sanitizeCampaignHtml` on save/send; sandbox iframe admin preview |
| Loyalty point double-spend race | High | Fixed | 2026-09-25 — atomic `$gte` floor guard at checkout + convertPoints |
| No point/coupon restore on cancel | High | Fixed | 2026-09-25 — `restoreOrderMarketingRedemptions` on customer/admin cancel |
| Per-user coupon limit race | Medium | Fixed | 2026-09-25 — `redeemCoupon` atomic per-user `$expr` + `$push usedBy` |
| Sync bulk email blocks HTTP | High | Fixed | 2026-09-25 — BullMQ `emailCampaignQueue` + worker; inline fallback |
| Scheduled campaigns never dispatch | High | Fixed | 2026-09-25 — `scheduledCampaignJob.js` cron every 3 min |
| PG coupon redemption records unwired | Medium | Fixed | 2026-09-25 — `upsertCouponRedemptionInPG` on redeem |
| Newsletter delete PG drift | Medium | Fixed | 2026-09-25 — `deleteSubscriber` dual-write to PG |
| Abandoned cart list HTTP 500 under load | High | Fixed | 2026-09-24 — unbounded KPI query replaced with `count` + aggregate; `routedRead('crm')` failover |
| No double opt-in / CAN-SPAM compliance | High | Fixed | 2026-09-25 — pending subscribe + confirm link; JWT unsubscribe + List-Unsubscribe headers |
| Campaign editor state not persisted | Medium | Fixed | 2026-09-25 — `templateData` JSON on EmailCampaign create/update |
| Coarse newsletter RBAC only | Medium | Fixed | 2026-09-25 — `manage_newsletter` / `manage_campaigns`; `manage_marketing` implies both |
| No loyalty transaction audit trail (L4) | High | Fixed | 2026-09-25 — immutable `LoyaltyLedger` + atomic mutations |
| No loyalty point expiry | Medium | Fixed | 2026-09-25 — daily `loyaltyPointExpiryJob.js` |
| Coupon rules limited to flat/percent | Medium | Fixed | 2026-09-25 — payment method, category, tiered, buy-x-get-y |
| No banner CTR analytics | Medium | Fixed | 2026-09-25 — impression/click endpoints + admin CTR |
| UltraMsg WhatsApp subscription suspended | High | Mitigated | Gateway status endpoint + UI banner; Send disabled when suspended; server no longer crashes |
| OpenAI API quota (chat AI overlap) | Medium | Open | AI chatbot credit exhausted; affects support automation |

---

## Dependencies & Integrations

- **Permissions:** `manage_newsletter` (subscribers), `manage_campaigns` (campaigns); `manage_marketing` preset implies both
- **Env:** `NEWSLETTER_TOKEN_SECRET` (falls back to `JWT_SECRET`) for confirm/unsubscribe JWTs
- **Env:** `LOYALTY_POINT_EXPIRY_DAYS` (default 365), `LOYALTY_EXPIRY_CRON` (default `0 2 * * *`)
- **Cron:** Abandoned cart daily job; loyalty tier monthly upgrade
- **Related audits:** `CMS_AUDIT.md`, `ORDERS_AUDIT.md`, `CHAT_AUDIT.md`, `CUSTOMER_FRONTEND_AUDIT.md`

---

## Change Log

### Phase 4.4 — Loyalty ledger, coupon rules, banner CTR — 2026-09-25

- Immutable `LoyaltyLedger` model — types: earned, redeemed, expired, adjusted, cancelled_restored
- `loyaltyLedgerService.js` wraps all point mutations with atomic `$inc` + ledger append + PG dual-write
- Checkout redeem, delivery earn, cancel restore, convert-points wired through ledger service
- `GET /api/user/loyalty/history` — paginated statement for authenticated users
- `loyaltyPointExpiryJob.js` — daily cron expires earned batches past `LOYALTY_POINT_EXPIRY_DAYS`
- Coupon schema: `allowedPaymentMethods`, `applicableCategories`, `minCategorySpend`, `ruleMetadata`
- Discount types extended: `tiered`, `buy_x_get_y`; checkout + apply validate rules dynamically
- Banner: `impressionCount`, `clickCount`; `POST /api/banners/:id/impression|click`; admin CTR in list API
- Tests: Jest **313/313** passing (`tests/services/phase4Part4.test.js`)

### Phase 4.3 — Campaign & newsletter enterprise features — 2026-09-25

- Double opt-in: new subscribers `isConfirmed: false`; confirmation email via `sendNewsletterConfirmEmail`; `GET /api/newsletter/confirm?token=...`
- Legacy subscribers without `isConfirmed` field remain eligible when `isActive`
- Campaign dispatch uses `buildConfirmedSubscriberQuery()` — only confirmed subscribers receive bulk email
- Per-recipient JWT unsubscribe tokens via `generateUnsubscribeToken`; RFC 2369 `List-Unsubscribe` + `List-Unsubscribe-Post` headers in `mailer.js`
- `POST /api/newsletter/unsubscribe` for one-click unsubscribe; GET handler accepts JWT or legacy hex token; empty token returns 400 without throw
- `templateData` (Mixed/JSON) on `EmailCampaign`; `createCampaign` + new `updateCampaign` (`PUT/PATCH /api/admin/newsletter/campaigns/:id`)
- Granular RBAC: `manage_newsletter`, `manage_campaigns` in `permissions.js`; admin routes use OR guards with `manage_marketing`
- Tests: Jest **307/307** passing

### Phase 4.2 — Async workers & caching layer — 2026-09-25

- `emailCampaignQueue.js` + `emailCampaignWorker.js`: BullMQ async campaign dispatch with exponential backoff retries; inline fallback when Redis unavailable
- `emailCampaignDispatchService.js`: extracted batch send logic from controller
- `scheduledCampaignJob.js`: cron dispatches `status=scheduled` campaigns when `scheduledAt <= now`
- `sendCampaign` returns immediately after queueing (status `sending`)
- `cacheService.js`: `BANNERS_ACTIVE` key; banner public endpoint cached 300s with invalidation on CRUD/reorder/settings
- `navbarLinkController.js`: Redis cache always used for public reads (PG mode no longer bypasses cache)
- `couponController.js`: `upsertCouponRedemptionInPG` wired on successful redeem
- `newsletterAdminController.js`: `deleteSubscriber` mirrors PG delete
- `bannerController.js`: `reorderBanners` syncs positions to PostgreSQL
- Tests: Jest suite pass

### Phase 4.1 — Critical security & core bug fixes — 2026-09-25

- Campaign HTML sanitized via `sanitizeCampaignHtml` on create (`newsletterAdminController`) and send (`mailer.js`); admin preview uses sandboxed iframe
- Atomic loyalty debit at checkout (`deductLoyaltyPointsAtomic`) before order save; `convertPoints` uses single atomic `findOneAndUpdate`
- Order cancellation restores `pointsRedeemed` and releases coupon slot + one `usedBy` entry (`orderMarketingRedemptionService`)
- `redeemCoupon(couponId, userId)` enforces global + per-user limits atomically; removed post-save `recordCouponUserUse`
- Tests: Jest **307/307** passing

### Phase 3 Part 3 — Multi-stage abandoned cart recovery + RFM segmentation — 2026-09-24

- `abandonedCartService.js`: Stage 1 (1h) SMS/WhatsApp restore link; Stage 2 (24h) email + single-use 5% coupon; Stage 3 (48h) final expiry reminder; `recoveryStage` 0→3 with dedup timestamps
- `cart.js`: `recoveryStage`, `recoveryCouponCode`, `recoveryStage1At/2At/3At`; reset on cart item change
- `abandonedCartJob.js`: hourly cron delegates to `processMultiStageAbandonedCarts()`
- `rfmSegmentationService.js`: CHAMPION/LOYAL/AT_RISK/LOST/NEW/STANDARD from delivered order history
- `crmController.js`: `GET /api/admin/crm/rfm-segments`, `POST /api/admin/crm/rfm-segments/recalculate`
- `user.js`: persisted `rfmSegment` + metric fields for CRM views
- Tests: `tests/services/phase3Part3.test.js` — Jest **280/280**

### Phase 3 Part 1 — One-click abandoned cart restore links — 2026-09-24

- `cartRestoreService.js`: signed JWT restore tokens (72h default), stock-checked cart recovery
- `GET /api/cart/restore/:token`: public restore endpoint → checkout redirect payload
- `crmController.notifyAbandonedCart` + `abandonedCartJob.js`: recovery emails/SMS link to `/checkout.html?restoreToken=...`
- Tests: `tests/services/phase3Part1.test.js` — Jest **274/274**

### Phase 2 — Support inbox unread + review product PG enrichment — 2026-09-24

- `contactMessageRepository.js`: `countUnreadInbox()` counts `isRead: false` on PG (was hardcoded `0`); circuit-breaker fallback via `routedRead('contactmessage')`
- `marketingSupportReadService.js`: Mongo unread count aligned to `isRead: false`
- `reviewAdminController.js`: product name/image enrichment via `fetchProductsForAdminReviews` + `routedRead('product')`
- Tests: `tests/services/phase2ReadCutover.test.js` — Jest **270/270**

### Abandoned cart PG read cutover + 500 fix — 2026-09-24

- `crmController.js`: KPI uses `count` + `$aggregate` / `$queryRaw` SUM; list paginated (max 100); `routedRead('crm')` with Mongo fallback; notify uses hybrid PG/Mongo lookup
- `abandonedCartJob.js`: `.populate('userId')` (was invalid `user` path)
- `tests/abandonedCart.test.js`: READ_PG_CRM failover, pagination, aggregation tests — Jest **266/266**

### Abandoned cart notify test flake — 2026-09-23

- `tests/abandonedCart.test.js`: mock `sendAbandonedCartEmail` so notify test does not depend on Resend/env (`422` when email provider unconfigured)
- Tests: Jest **231/231** passing

### Wishlist notification job — 2026-09-20

- `wishlistNotificationJob.js` — daily 10:00 AM cron; price drop (>10%) + back-in-stock emails
- `sendWishlistNotificationEmail()` in `mailer.js`; admin notification on send
- Wishlist item tracking: `priceDropNotifiedAt`, `backInStockNotifiedAt`
- Tests: Jest **228/228** passing

### WhatsApp gateway hardening — 2026-09-20

- `whatsappService.js`: UltraMsg wrapped in try/catch; `[WHATSAPP-SUSPENDED]` logging; safe `sendBroadcast` return shape
- New `GET /api/admin/settings/gateway-status` (5-min cache) via `gatewayStatusService.js`
- Campaign UI: warning banner + disabled Send when WhatsApp not `active` (`admin-newsletter.js`, `view-catalog.html`)
- Tests: Jest **228/228** passing

### Audit system initialized — codebase scan — 2026-09-20

- Inventoried marketing routes, CRM controllers, jobs, admin UI
- Status: ⚠️ PARTIAL due to suspended WhatsApp gateway
