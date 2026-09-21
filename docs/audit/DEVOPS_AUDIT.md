# DEVOPS AUDIT — EonlineBazar

**Last updated:** 2026-09-21 (Email + WhatsApp notification overhaul — Resend + Baileys)  
**Scope:** Docker, Nginx, PM2, CI/CD, deployment, env configuration, health checks, backup, Jest CI  
**Status:** ✅ COMPLETE

---

## File Inventory

| Path | Role |
|------|------|
| `Dockerfile` | Main store app container (Node 20 Alpine) |
| `docker-compose.yml` | App + MongoDB + Redis stack |
| `devops/Dockerfile` | Alternate/aligned Dockerfile |
| `devops/docker-compose.yml` | DevOps compose variant |
| `devops/nginx.conf` | Production Nginx — SSL, store :5000, chat :5001, `/chat-admin` static |
| `devops/server-setup.sh` | Server bootstrap script |
| `devops/first-time-server-setup.md` | DigitalOcean VPS setup guide |
| `devops/.github/workflows/deploy.yml` | CI deploy workflow |
| `ecommerce-chat/ecosystem.config.js` | PM2 config for chat service |
| `ecommerce-chat/devops/` | Chat-specific Docker/nginx/deploy |
| `backend/scripts/verifyFullMigration.js` | Pre-launch Mongo vs PG verification |
| `backend/scripts/ops/enableFlags.js` | READ_PG flag rollout CLI |
| `backend/scripts/ops/monitorCutover.js` | Cutover fallback monitor |
| `backend/docs/ROLLOUT_GUIDE.md` | Production flag rollout steps |
| `backend/docs/DECOMMISSION_GUIDE.md` | Mongo decommission runbook |
| `scripts/addEnterpriseIndexes.js` | DB index migration (`npm run migrate:indexes`) |
| `mobile/eas.json` | Expo EAS build profiles (APK/AAB) |
| `backend/src/server.js` | Main entry — env validation, `GET /health`, error logger |
| `backend/src/services/healthService.js` | Mongo/PG/Redis/uptime health probe |
| `backend/src/middlewares/errorLogger.js` | File error logs + admin notify on 500 |
| `backend/src/controllers/admin/backupController.js` | Superadmin DB backup export |
| `tests/mocks/prismaGeneratedClient.js` | Jest CJS substitute for `generated/prisma/client.mts` (ESM) |
| `tests/setup.js` | Jest global setup — pins all `READ_PG_*` to `'false'` for in-memory Mongo |
| `tests/app.js` | Test Express app — re-pins `READ_PG_*` after `dotenv.config()` |
| `package.json` | Jest `moduleNameMapper` for Prisma generated client |
| `backend/src/services/emailService.js` | Resend → Brevo → log email delivery |
| `backend/src/services/whatsappService.js` | Baileys self-hosted WhatsApp (QR connect) |
| `backend/src/services/notificationConfigService.js` | Admin notification settings + test sends |
| `backend/src/services/gatewayStatusService.js` | Structured gateway health (email/whatsapp/sms) |
| `docs/NOTIFICATION_SETUP.md` | Resend, Brevo, Baileys setup guide |
| `client/js/admin/modules/settings-notifications.js` | Admin Notifications tab UI |
| `.wa-auth/` | Baileys session state (gitignored) |

---

## Feature Checklist

- [x] Docker + docker-compose (app + mongo + redis) — root `docker-compose.yml`
- [x] Nginx reverse proxy + SSL — `devops/nginx.conf`
- [x] PM2 chat service supervision — `ecosystem.config.js`
- [x] Health check endpoint — `GET /health` (public) + `GET /api/store/health`
- [x] Error logging middleware — `backend/logs/error-YYYY-MM-DD.log` (7-day retention)
- [x] Chat proxy paths on store gateway — `/chat-api/*`, `/chat-socket/socket.io`
- [x] GitHub Actions deploy workflow — `devops/.github/workflows/deploy.yml`
- [x] First-time server setup guide — `devops/first-time-server-setup.md`
- [x] Mobile EAS builds (preview APK, production AAB) — `mobile/eas.json`
- [x] Enterprise DB index migration — `npm run migrate:indexes`
- [x] Superadmin Mongoose JSON backup — `backupController.js`, `view-system-backup.html`
- [x] PostgreSQL manual ZIP backup — `exportPostgresBackup()` in `backupService.js`, `GET /api/admin/system/backup-postgres`
- [x] Env validation on server boot — `server.js`
- [x] PG migration verification script — `verifyFullMigration.js`
- [x] READ_PG flag rollout tooling — `enableFlags.js`, `monitorCutover.js`
- [x] `.env` gitignored (secrets in repo-root `.env` only) — documented in `ARCHITECTURE.md`
- [ ] Automated chat-admin rebuild in CI | Manual rebuild + copy dist after env changes
- [x] Jest + Prisma ESM compatibility — `moduleNameMapper` + `prismaGeneratedClient.js` mock
- [x] Jest READ_PG flag isolation — setup + app pin flags to `'false'` (228/228 pass)

---

## Known Issues / Gaps

| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| Chat-admin rebuild manual | Low | Open | `cd admin-dashboard && npm run build` → copy to `backend/public/chat-admin/` |
| Prisma client Jest parse | — | Fixed | `generated/prisma/client.mts` mapped to CJS mock; repo tests still use `node --test` with real client |
| Enterprise summary PG low-stock SQL | Medium | Fixed | `stock_quantity` → quoted `"stockQuantity"` / `"lowStockThreshold"` (Neon baseline uses camelCase columns) |
| Admin profile + HRM attendance 404 | Medium | Fixed | Route order in `adminRoutes.js`; direct `adminProfileController` import; daily-sheet before bare `/hrm/attendance` |

---

## Dependencies & Integrations

- **Production:** DigitalOcean — `eonlinebazar.com`, Node 20, ports 5000 (store) / 5001 (chat)
- **Secrets:** `JWT_SECRET`, `INTERNAL_API_KEY`, `DATABASE_URL`, Cloudinary — repo-root `.env` only
- **Related audits:** `CHAT_AUDIT.md`, `DATABASE_MIGRATION_AUDIT.md`

---

## Change Log

### Group 3 — Health check + error logging — 2026-09-20

- Public `GET /health` — Mongo, PostgreSQL, Redis, uptime, version; always HTTP 200 with status field
- `errorLogger.js` — route/method/status logged to daily files; AdminNotification on 500 errors
- Tests: Jest **228/228** passing

### PostgreSQL backup + gateway status — 2026-09-20

- Added `exportPostgresBackup()` — critical PG tables exported to `pg-backup-YYYY-MM-DD.zip` via lazy-loaded `archiver`
- New route `GET /api/admin/system/backup-postgres` (superadmin); `lastPostgresBackupAt` on Settings
- Backup UI: separate MongoDB + PostgreSQL download buttons in `view-system-backup.html`
- New `GET /api/admin/settings/gateway-status` for admin UI gateway health
- Tests: Jest **228/228** passing

## Change Log

### Email + WhatsApp Notification Overhaul — 2026-09-21

- Replaced SMTP/UltraMsg with **Resend API** (primary) + **Brevo** (fallback) and **Baileys** WhatsApp (QR scan)
- New admin routes: `/settings/notification-config`, `/settings/test-email`, `/settings/whatsapp-*`
- `GET /settings/gateway-status` returns structured `{ email, whatsapp, sms }` — never 500
- Env: `RESEND_*`, `BREVO_*`, `WA_ENABLED`, `ADMIN_WHATSAPP_NUMBER`
- Tests: Jest **228/228** passing

### Critical Production Bugs — 2026-09-21

- **SMTP IPv6:** `userProfileController.js` nodemailer transport uses explicit `smtp.gmail.com:587` with `family: 4` (DigitalOcean blocks outbound IPv6); main store mail already uses `family: 4` in `mailer.js`
- **Health probe:** `healthService.probePostgres()` — 3s `SELECT 1` timeout; returns `degraded` (not `disconnected`) on Neon cold start
- Tests: Jest **228/228** passing

### Production bug fix — 2026-09-20

- **BUG 1:** `enterpriseSummaryController.countLowStockProductsFromPG()` raw SQL used non-existent `stock_quantity` / `low_stock_threshold` — fixed to Prisma/Neon column names `"stockQuantity"` / `"lowStockThreshold"`.
- **BUG 2:** `GET /api/admin/profile/me/full` — route re-registered via direct `adminProfileController.getAdminProfileFull`, placed before bare `/profile`.
- **BUG 3:** `GET /api/admin/hrm/attendance/daily-sheet` — attendance named routes moved before bare `GET /hrm/attendance` list route; all mark/bulk/manual/lock routes verified present.
- **Tests:** Jest **228/228** passing; server boot shows no Prisma column errors (port bind only if already running).

### Jest + Prisma ESM compatibility fix — 2026-09-20

- **Problem:** Jest could not parse `generated/prisma/client.mts` (ESM `import` syntax); all 26 suites failed to run. Secondary issue: production `READ_PG_*=true` in `.env` leaked into Jest via `dotenv`, breaking in-memory Mongo integration tests.
- **Fix 1:** Added `tests/mocks/prismaGeneratedClient.js` exporting a CJS `PrismaClient` class (shared Proxy mock). Wired via Jest `moduleNameMapper` in `package.json`: `generated/prisma/client.mts` → mock file.
- **Fix 2:** `tests/setup.js` calls `configureTestEnv()` before backend requires; sets all `READ_PG_*` env vars to `'false'` so later `dotenv.config()` calls do not re-enable Postgres reads (dotenv default: no override).
- **Fix 3:** `tests/app.js` re-applies `READ_PG_*='false'` immediately after its own `dotenv.config()`.
- **Result:** `npm test` — **26/26 suites, 228/228 tests pass**. Repository tests unchanged: `npm run test:repositories` (real Neon client via `node --test`).

### Audit system initialized — codebase scan — 2026-09-20

- Inventoried Docker, Nginx, PM2, CI, migration ops scripts
- Status: ✅ COMPLETE
