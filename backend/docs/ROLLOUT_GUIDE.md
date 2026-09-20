# PostgreSQL Read Cutover — Production Rollout Guide

Step-by-step instructions for enabling PostgreSQL read paths on DigitalOcean App Platform after dual-write backfill is complete.

---

## Pre-Launch Rollout (Before website goes live)

Since this is a new website with no real users yet, enable **all** read-cutover flags at once on first deployment. Run the migration verifier first.

### Step 1: Verify migration is ready

```bash
cd backend && node scripts/verifyFullMigration.js
```

**Required result:**

```
MIGRATION READY: YES ✅
Mismatches found: 0
Financial check: PASS
```

If verification fails, run cleanup/backfill ops first (see `scripts/ops/cleanTestDataFromPG.js` and `scripts/backfill/`).

### Step 2: Set ALL flags ON in DigitalOcean App Platform

Go to: **DigitalOcean Dashboard → Apps → Your App → Settings → Environment Variables**

Add every variable below with value **`true`**:

| # | Environment variable |
|---|----------------------|
| 1 | `READ_PG_CATEGORY` |
| 2 | `READ_PG_BRAND` |
| 3 | `READ_PG_SUPPLIER` |
| 4 | `READ_PG_WAREHOUSE` |
| 5 | `READ_PG_DESIGNATION` |
| 6 | `READ_PG_PAGECONTENT` |
| 7 | `READ_PG_NAVBARLINK` |
| 8 | `READ_PG_FOOTERSETTINGS` |
| 9 | `READ_PG_BANNER` |
| 10 | `READ_PG_SETTINGS` |
| 11 | `READ_PG_SECURITYLOG` |
| 12 | `READ_PG_LOGINATTEMPT` |
| 13 | `READ_PG_BLACKLISTEDIP` |
| 14 | `READ_PG_STOCKALERT` |
| 15 | `READ_PG_EMPLOYEE` |
| 16 | `READ_PG_ATTENDANCE` |
| 17 | `READ_PG_PAYROLL` |
| 18 | `READ_PG_LEAVE` |
| 19 | `READ_PG_NEWSLETTER` |
| 20 | `READ_PG_EMAILCAMPAIGN` |
| 21 | `READ_PG_CONTACTMESSAGE` |
| 22 | `READ_PG_REVIEW` |
| 23 | `READ_PG_ATTRIBUTE` |
| 24 | `READ_PG_COUPON` |
| 25 | `READ_PG_PAYMENT_METHOD` |
| 26 | `READ_PG_EXPENSE_CATEGORY` |
| 27 | `READ_PG_EXPENSE` |
| 28 | `READ_PG_PURCHASE_ORDER` |
| 29 | `READ_PG_SHIFT` |
| 30 | `READ_PG_NOTE` |
| 31 | `READ_PG_ADMIN_NOTIFICATION` |
| 32 | `READ_PG_USER_SESSION` |
| 33 | `READ_PG_ADMIN_SESSION` |
| 34 | `READ_PG_PRODUCT` |
| 35 | `READ_PG_USER` |
| 36 | `READ_PG_ADDRESS` |
| 37 | `READ_PG_WISHLIST` |
| 38 | `READ_PG_WALLET` |
| 39 | `READ_PG_CART` |
| 40 | `READ_PG_ORDER` |
| 41 | `READ_PG_FINANCE_ANALYTICS` |
| 42 | `READ_PG_PROFIT_LOSS` |
| 43 | `READ_PG_ACCOUNTS_SUMMARY` |
| 44 | `READ_PG_CRM` |
| 45 | `READ_PG_ENTERPRISE_SUMMARY` |

**CLI helper (prints doctl commands — does not edit `.env`):**

```bash
cd backend
node scripts/ops/enableFlags.js --enable=CATEGORY,BRAND,PRODUCT,ORDER
node scripts/ops/enableFlags.js --status
```

Example DigitalOcean CLI for a single flag:

```bash
doctl apps update <APP_ID> \
  --set-env READ_PG_CATEGORY=true
```

Set `DO_APP_ID` in your local `.env` to replace `<APP_ID>` when using `enableFlags.js`.

### Step 3: Deploy

Push to the `main` branch → DigitalOcean auto-deploys the App Platform service.

Confirm the deploy completes and the API health check passes.

### Step 4: Monitor for 30 minutes after deploy

Tail application logs and watch for cutover fallbacks:

```bash
cd backend
node scripts/ops/monitorCutover.js --logfile=./app.log
```

Or pipe live PM2 output:

```bash
pm2 logs api --lines 0 --raw | node scripts/ops/monitorCutover.js
```

**Watch for:**

- `[READ-CUTOVER-FALLBACK]` — flag ON but Postgres read failed; fell back to Mongo
- `[DUAL-WRITE-*-FAIL]` — Postgres write failed during dual-write
- `[PG-TTL-*-FAIL]` — daily TTL sweep failure

If fallback rate exceeds **3 per minute** for any model, the monitor prints an alert. Roll back that group:

```bash
node scripts/ops/enableFlags.js --disable=CATEGORY
```

Then apply the printed `doctl` command and redeploy.

### Step 5: Run verification again on production data

After 30 minutes of stable monitoring:

```bash
cd backend && node scripts/verifyFullMigration.js
```

Confirm `MIGRATION READY: YES ✅` against production Mongo + Neon connections.

---

## Post-Launch (After 30 days stable)

When reads have been stable on PostgreSQL for at least 30 days:

→ **Phase 4:** Remove dual-write and decommission MongoDB  
→ See **[DECOMMISSION_GUIDE.md](./DECOMMISSION_GUIDE.md)**

---

## Quick reference

| Script | Purpose |
|--------|---------|
| `scripts/verifyFullMigration.js` | Pre/post deploy count + financial verification |
| `scripts/ops/enableFlags.js` | Print doctl env commands; show flag status |
| `scripts/ops/monitorCutover.js` | Live fallback / dual-write dashboard |
| `scripts/ops/cleanTestDataFromPG.js` | Remove orphaned PG test rows (pre-launch only) |

Flag definitions live in `backend/src/config/readCutoverFlags.js`. Read routing uses `backend/src/services/readRouter.js`.
