# DEVOPS AUDIT — EonlineBazar

**Last updated:** 2026-09-20  
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
| `backend/src/server.js` | Main entry — env validation, health route |
| `backend/src/controllers/admin/backupController.js` | Superadmin DB backup export |
| `tests/mocks/prismaGeneratedClient.js` | Jest CJS substitute for `generated/prisma/client.mts` (ESM) |
| `tests/setup.js` | Jest global setup — pins all `READ_PG_*` to `'false'` for in-memory Mongo |
| `tests/app.js` | Test Express app — re-pins `READ_PG_*` after `dotenv.config()` |
| `package.json` | Jest `moduleNameMapper` for Prisma generated client |

---

## Feature Checklist

- [x] Docker + docker-compose (app + mongo + redis) — root `docker-compose.yml`
- [x] Nginx reverse proxy + SSL — `devops/nginx.conf`
- [x] PM2 chat service supervision — `ecosystem.config.js`
- [x] Health check endpoint — `GET /api/store/health`
- [x] Chat proxy paths on store gateway — `/chat-api/*`, `/chat-socket/socket.io`
- [x] GitHub Actions deploy workflow — `devops/.github/workflows/deploy.yml`
- [x] First-time server setup guide — `devops/first-time-server-setup.md`
- [x] Mobile EAS builds (preview APK, production AAB) — `mobile/eas.json`
- [x] Enterprise DB index migration — `npm run migrate:indexes`
- [x] Superadmin Mongoose JSON backup — `backupController.js`, `view-system-backup.html`
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

---

## Dependencies & Integrations

- **Production:** DigitalOcean — `eonlinebazar.com`, Node 20, ports 5000 (store) / 5001 (chat)
- **Secrets:** `JWT_SECRET`, `INTERNAL_API_KEY`, `DATABASE_URL`, Cloudinary — repo-root `.env` only
- **Related audits:** `CHAT_AUDIT.md`, `DATABASE_MIGRATION_AUDIT.md`

---

## Change Log

### Jest + Prisma ESM compatibility fix — 2026-09-20

- **Problem:** Jest could not parse `generated/prisma/client.mts` (ESM `import` syntax); all 26 suites failed to run. Secondary issue: production `READ_PG_*=true` in `.env` leaked into Jest via `dotenv`, breaking in-memory Mongo integration tests.
- **Fix 1:** Added `tests/mocks/prismaGeneratedClient.js` exporting a CJS `PrismaClient` class (shared Proxy mock). Wired via Jest `moduleNameMapper` in `package.json`: `generated/prisma/client.mts` → mock file.
- **Fix 2:** `tests/setup.js` calls `configureTestEnv()` before backend requires; sets all `READ_PG_*` env vars to `'false'` so later `dotenv.config()` calls do not re-enable Postgres reads (dotenv default: no override).
- **Fix 3:** `tests/app.js` re-applies `READ_PG_*='false'` immediately after its own `dotenv.config()`.
- **Result:** `npm test` — **26/26 suites, 228/228 tests pass**. Repository tests unchanged: `npm run test:repositories` (real Neon client via `node --test`).

### Audit system initialized — codebase scan — 2026-09-20

- Inventoried Docker, Nginx, PM2, CI, migration ops scripts
- Status: ✅ COMPLETE
