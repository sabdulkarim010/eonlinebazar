# MARKETING AUDIT — EonlineBazar

**Last updated:** 2026-09-23 (abandoned cart notify test — mailer mock)  
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
| `backend/src/jobs/abandonedCartJob.js` | 24h+ cart recovery cron |
| `backend/src/services/whatsappService.js` | WhatsApp gateway + broadcasts (suspended-safe) |
| `backend/src/services/gatewayStatusService.js` | Cached gateway health for admin UI |
| `backend/src/controllers/settingsController.js` | `GET /settings/gateway-status` |
| `client/js/admin-newsletter.js` | Campaign UI + gateway banner/disable Send |
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
- [x] Email campaign broadcast — `newsletterAdminController.js`
- [x] Customer referral codes + wallet rewards — `referralController.js`
- [x] Loyalty tiers (Silver/Gold/Platinum) — Settings loyalty fields, monthly cron
- [x] Abandoned cart recovery (24h email/SMS) — `abandonedCartJob.js`
- [x] Multi-channel segmented campaigns — CRM campaign tools
- [x] Review moderation — `reviewAdminController.js`, `view-reviews.html`
- [x] Support ticket lifecycle + SLA — `ContactMessage.js`, `messages-inbox.js`, `supportSlaController.js`
- [x] PG repositories — coupon, newsletter, emailCampaign, review
- [x] PG CRM read cutover — `READ_PG_CRM`, `READ_PG_COUPON`, `READ_PG_NEWSLETTER`, `READ_PG_EMAILCAMPAIGN`, `READ_PG_REVIEW`
- [ ] WhatsApp marketing broadcasts | UltraMsg account suspended — service stopped

---

## Known Issues / Gaps

| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| UltraMsg WhatsApp subscription suspended | High | Mitigated | Gateway status endpoint + UI banner; Send disabled when suspended; server no longer crashes |
| OpenAI API quota (chat AI overlap) | Medium | Open | AI chatbot credit exhausted; affects support automation |

---

## Dependencies & Integrations

- **Permission:** `manage_marketing` for newsletter/campaign writes
- **Cron:** Abandoned cart daily job; loyalty tier monthly upgrade
- **Related audits:** `CMS_AUDIT.md`, `ORDERS_AUDIT.md`, `CHAT_AUDIT.md`, `CUSTOMER_FRONTEND_AUDIT.md`

---

## Change Log

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
