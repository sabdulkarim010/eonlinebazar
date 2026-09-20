# MongoDB Decommission Guide — Phase 4

## ⏰ Do this 30 days after launch

Only proceed when PostgreSQL has been the primary read path in production for at least **30 consecutive days** with no rollbacks.

---

## Step 1: Confirm stability

- **Zero** `[READ-CUTOVER-FALLBACK]` log lines for **7 consecutive days**
- `cd backend && node scripts/verifyFullMigration.js` shows **`MIGRATION READY: YES ✅`**
- All **45** `READ_PG_*` flags remain **`true`** in DigitalOcean App Platform
- No open incidents related to database reads or dual-write failures

Use the cutover monitor during the stability window:

```bash
cd backend
node scripts/ops/monitorCutover.js --logfile=./app.log
```

---

## Step 2: Remove dual-write (in Cursor)

1. Remove all `dualWriteService.js` calls from controllers and services
2. Make **Prisma** the primary (and only) write target
3. Keep Mongoose models temporarily until Step 4 archive is verified
4. Run repository tests: `npm run test:repositories`
5. Run application tests: `npm test`

---

## Step 3: Archive MongoDB

Run from your local machine or a trusted DigitalOcean Droplet with `mongodump` installed:

```bash
mongodump --uri="$MONGODB_URI" --out=./mongo-archive-$(date +%Y%m%d)
tar -czf mongo-archive-final.tar.gz ./mongo-archive-*
```

Upload `mongo-archive-final.tar.gz` to **DigitalOcean Spaces** (or another cold-storage bucket). Retain the archive for compliance / disaster recovery per your retention policy.

Verify the archive can be listed and extracted before deleting the live cluster.

---

## Step 4: Final cleanup (in Cursor)

Remove MongoDB from the codebase:

- Remove `mongoose` from `package.json`
- Delete `backend/src/models/` folder
- Delete `backend/src/config/db.js`
- Delete `backend/src/services/dualWriteService.js`
- Delete `backend/src/services/readRouter.js`
- Delete `backend/src/config/readCutoverFlags.js`
- Delete `backend/scripts/backfill/` folder
- Delete rollout ops scripts if no longer needed (`scripts/ops/enableFlags.js`, `monitorCutover.js`, `cleanTestDataFromPG.js`)
- Update `backend/src/server.js` — remove `connectDB()` and Mongo bootstrap
- Remove **`MONGODB_URI`** / **`MONGO_URI`** from DigitalOcean App Platform environment variables
- Update `ARCHITECTURE.md`, `README.md`, and `SYSTEM_ENTERPRISE_AUDIT.md`

---

## Step 5: Final test

```bash
cd backend && npm install && npm test
```

Deploy to staging first, smoke-test storefront + admin, then promote to production.

---

## Rollback (if needed before Step 4)

If issues appear after Step 2 but before Mongo removal:

1. Set affected `READ_PG_*` flags to `false` via DigitalOcean env vars
2. Redeploy — reads return to Mongo via existing code paths
3. Investigate Postgres errors using `monitorCutover.js` and application logs

Once Mongo is deleted (Step 4), rollback requires restoring from the Step 3 archive — treat that as a last resort.
