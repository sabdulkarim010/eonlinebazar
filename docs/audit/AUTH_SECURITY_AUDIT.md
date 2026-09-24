# AUTH & SECURITY AUDIT — EonlineBazar

**Last updated:** 2026-09-24 (Sidebar labels PG+Mongo fallback + batch API)  
**Scope:** Customer/admin authentication, JWT sessions, RBAC, 2FA, security logs, rate limits, emergency panel  
**Status:** ✅ COMPLETE

---

## File Inventory

| Path | Role |
|------|------|
| `backend/src/routes/authRoutes.js` | Customer + Google OAuth routes |
| `backend/src/routes/adminRoutes.js` | Admin auth, 2FA, sessions, security (partial) |
| `backend/src/routes/emergencyRoutes.js` | Emergency control panel `/sys/:token` |
| `backend/src/controllers/authController.js` | Auth barrel |
| `backend/src/controllers/auth/loginController.js` | Customer/admin login |
| `backend/src/controllers/auth/registerController.js` | Customer registration |
| `backend/src/controllers/auth/passwordController.js` | Forgot/reset password |
| `backend/src/controllers/auth/oauthController.js` | Google OAuth |
| `backend/src/controllers/twoFactorController.js` | Admin 2FA (TOTP/SMS/email) |
| `backend/src/controllers/adminSecurityController.js` | Security settings barrel |
| `backend/src/controllers/admin/sessionController.js` | Admin session management |
| `backend/src/controllers/admin/blacklistController.js` | IP blacklist |
| `backend/src/controllers/admin/loginHistoryController.js` | Login attempt history |
| `backend/src/controllers/admin/staffAuditController.js` | Staff activity audit |
| `backend/src/controllers/admin/securityMonitorController.js` | Security monitoring |
| `backend/src/controllers/staffController.js` | Super Admin staff CRUD + `revokeStaffAccess` |
| `backend/src/routes/staffRoutes.js` | `/api/admin/staff` — includes `DELETE /:id/access` |
| `backend/src/middlewares/auth.js` | `verifyUser`, `verifyAdmin`, `optionalVerifyUser` |
| `backend/src/middlewares/rbac.js` | `checkPermission()` RBAC gate |
| `backend/src/middlewares/rateLimiter.js` | `authLimiter`, `otpLimiter`, `apiLimiter` fixed windows |
| `backend/src/middlewares/securityMiddleware.js` | Wires limiters to auth/OTP routes + global `/api/*` |
| `backend/src/middlewares/maintenanceModeMiddleware.js` | Storefront 503 gate with IP allowlist bypass |
| `backend/src/controllers/admin/sidebarLabelController.js` | Super Admin sidebar menu rename API |
| `backend/src/models/SidebarLabel.js` | Mongoose sidebar label fallback store |
| `backend/src/repositories/sidebarLabelRepository.js` | PG-primary reads/writes + Mongo fallback/mirror |
| `client/js/admin/modules/sidebarLabels.js` | Sidebar label apply on load (Super Admin only) |
| `client/js/admin/modules/settings-menu-labels.js` | Settings page menu label editor |
| `client/js/admin/modules/hrm-employees.js` | `authHeaders()` — Bearer token on all HRM admin API calls |
| `client/js/admin-staff.js` | `authHeaders()` + `staffApi()` — Bearer token on Staff Directory API calls |
| `client/admin/partials/view-settings.html` | Customize Menu Labels section |
| `prisma/schema.prisma` | `SidebarLabel` model (`menuKey`, `label`, `adminId`) |
| `backend/src/config/passport.js` | Google OAuth strategy |
| `backend/src/models/admin.js` | Admin account + permissions + 2FA fields |
| `backend/src/models/userSession.js` / `adminSession.js` | Session tracking |
| `backend/src/models/securityLog.js` / `loginAttempt.js` | Audit + login attempts |
| `backend/src/models/blacklistedIp.js` | IP blacklist |
| `backend/src/utils/securityLogger.js` | `logSecurityEvent()` helper |
| `backend/src/repositories/userSessionRepository.js` | PG session reads |
| `backend/src/repositories/adminSessionRepository.js` | PG admin session reads + best-effort dual-write mirror |
| `backend/src/repositories/securityLogRepository.js` | PG security log reads |
| `backend/src/repositories/loginAttemptRepository.js` | PG login attempt reads |
| `backend/src/repositories/blacklistedIpRepository.js` | PG IP blacklist reads |
| `client/admin/partials/view-security.html` | Security logs UI |
| `client/js/admin/modules/settings-2fa.js` | 2FA setup UI |
| `client/js/admin/modules/settings-security.js` | Security settings |
| `client/js/admin/modules/settings-staff-audit.js` | Staff audit timeline |
| `client/js/session-guard.js` | Storefront session guard |

---

## Feature Checklist

- [x] Super Admin sidebar menu label customization — `GET/PUT /api/admin/sidebar-labels` (batch), `PUT /api/admin/sidebar-labels/:key` (single), `DELETE /api/admin/sidebar-labels` reset (`requireSuperAdmin`); edit UI in Settings → Security; PG primary + Mongo fallback
- [x] HRM employee access-info — `GET /api/admin/hrm/employees/:id/access-info` detects linked Super Admin accounts
- [x] Admin frontend Bearer auth — `verifyAdmin` reads `Authorization: Bearer`; `hrm-employees.js` + `admin-staff.js` send token from `localStorage.adminToken`
- [x] 25 granular RBAC permissions — `permissions.js` + dynamic grant/edit modals
- [x] Admin JWT login — `loginController.js` (admin branch)
- [x] Google OAuth — `oauthController.js`, passport config
- [x] Forgot/reset password (OTP) — `passwordController.js`
- [x] Admin 2FA (TOTP + SMS + email) — `twoFactorController.js`
- [x] RBAC with 9 permissions — `permissions.js`, `rbac.js`
- [x] Customer session tracking — `userSession.js`, logout-other-devices
- [x] Admin session management — `sessionController.js`, `view-sessions.html`
- [x] Admin session PG mirror (best-effort) — `mirrorAdminSessionBestEffort()`; throttled heartbeats; never blocks `verifyAdmin`
- [x] Security event logging — `securityLog.js`, `securityLogger.js`
- [x] Login attempt tracking — `loginAttempt.js`
- [x] IP blacklist + geo-fence — `blacklistController.js`
- [x] Staff activity audit — `staffAuditController.js`
- [x] Rate limiting middleware — `rateLimiter.js` + `securityMiddleware.js`
- [x] Auth endpoint throttling — login/register 10/15min; OTP 5/10min; API 100/min
- [x] Maintenance mode IP allowlist — `maintenanceAllowedIPs` on Settings + middleware bypass
- [x] Emergency control panel — `emergencyRoutes.js`
- [x] Finance dashboard scoped JWT — `financeRoutes.js`
- [x] Account deletion (Play Store compliance) — `loginController.js`
- [x] PG read cutover for sessions/security — `READ_PG_*` flags in `readCutoverFlags.js`
- [x] Admin ↔ Employee 1:1 link — `Admin.employeeRef` (Mongo) / `Employee.linkedAdminId` (canonical PG FK); link endpoint super-admin only, 409 if employee already linked

---

## Known Issues / Gaps

| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| Admin session PG dual-write blocked requests on Neon timeout | High | Fixed | 2026-09-24 — fire-and-forget mirror + 60s heartbeat throttle |
| Some legacy routes weakly protected | Low | Open | See `SYSTEM_ENTERPRISE_AUDIT.md` Section 7 |
| Chat agent SSO partial | Low | Open | Agent auto-provision; not full SSO — see `CHAT_AUDIT.md` |

---

## Dependencies & Integrations

- **Env:** `JWT_SECRET`, OAuth client IDs, session secrets
- **PG flags:** `READ_PG_USER_SESSION`, `READ_PG_ADMIN_SESSION`, `READ_PG_ADMIN` (admin profile merge reads), `READ_PG_SECURITYLOG`, `READ_PG_LOGINATTEMPT`, `READ_PG_BLACKLISTEDIP`
- **Related audits:** `ADMIN_PANEL_AUDIT.md`, `HRM_AUDIT.md`, `CHAT_AUDIT.md`

---

## Change Log

### Admin session PG mirror non-blocking — 2026-09-24

- **`mirrorAdminSessionBestEffort()`** in `adminSessionRepository.js` — fire-and-forget PG upsert; errors logged, never thrown
- **`verifyAdmin`** heartbeat and login session create no longer `await` PG mirror (prevents Neon TimeoutError blocking requests)
- Heartbeats throttled via `ADMIN_SESSION_PG_HEARTBEAT_MS` (default 60s) per sessionId
- Tests: Jest **231/231** passing

### Super Admin 2FA staff banner fix — 2026-09-23

- **Bug:** `#twoFaWarning` on Admin Access & Roles counted staff accounts with `twoFactorEnabled === false`, not the logged-in Super Admin — banner stayed visible after Super Admin enabled 2FA when any staff lacked 2FA
- **Fix:** Banner now checks `currentAdmin.twoFactorEnabled !== false` via `/api/admin/me` (`toSafeObject()`); staff security metric still counts staff without 2FA separately
- **Sync:** `settings-2fa.js` calls `syncCurrentAdminTwoFactorEnabled()` after TOTP/SMS activation and status load
- Mongo `Admin.twoFactorEnabled` + Prisma `Admin.twoFactorEnabled @default(true)` unchanged; login/me use Mongo via `attachAdminAccount`
- Tests: Jest **231/231** passing

### P4 rate limiting + input sanitization — 2026-09-23

- **Rate limiting:** `express-rate-limit` ^8.6 via `rateLimiter.js` + `securityMiddleware.js`; 2FA setup/verify routes now auth-limited
- **Input validation:** No joi/zod/express-validator in stack; `mongo-sanitize` + HRM string trim/slice on employee update and leave apply
- **Admin error handlers:** Global `error` + `unhandledrejection` listeners in `admin-staff.js`
- Tests: Jest **231/231** passing

### Sidebar Labels Resilience + Batch API — 2026-09-24

- **Model:** `backend/src/models/SidebarLabel.js` — Mongo fallback for Super Admin menu renames
- **Repository:** PG-primary read/write with Mongo fallback; best-effort mirror when peer DB connected
- **API:** `PUT /api/admin/sidebar-labels` batch `{ labels: { menuKey: "Label" } }`; single-key `PUT /:key` unchanged
- **Frontend:** `settings-menu-labels.js` — one batch PUT on Save Changes
- Tests: `sidebarLabel.repository.test.js` **4/4** pass

### Superadmin 2FA enforcement — 2026-09-23

- **`verifyAdmin`:** Blocks superadmin accounts with `twoFactorEnabled === false` on all routes except `/2fa/*` (skipped in `NODE_ENV=test`)
- **Staff UI:** `#twoFaWarning` banner on Admin Access & Roles when Super Admin has 2FA disabled (see 2026-09-23 fix above)
- Staff accounts remain optional for 2FA
- Tests: Jest **231/231** passing

### Staff UI Polish — 2026-09-21

- Assign modal search: `#empSearchInput` 40px left padding; SVG icon; no text overlap
- Permission grid: card layout with visible toggle rows and group "All" checkboxes; `#permissionsGrid` force-visible CSS block at end of `_staff.css`
- Permission filter: `isValidPermissionEntry()` strips non-permission objects (e.g. `sectionPermissions` metadata)
- Sidebar labels: `sidebarLabelRepository` guards missing `prisma.sidebarLabel`; controller returns empty map on failure
- Staff table actions: compact icon buttons with hover tooltips
- Tests: Jest **228/228** passing

### Staff Access Final Fix — 2026-09-21

- **Search UI:** Employee search uses `emp-search-wrap` with left icon padding so typed text does not overlap; clear (×) button toggles on input
- **Modal reset:** `resetAssignModal()` clears search, credentials, errors, permission toggles, and presets on every open
- **Permissions grid:** `renderAssignPermissions()` normalizes any API response shape; `#permissionsGrid` renders all 25 permission toggles with group Select all
- **Revoke cleanup:** `DELETE /api/admin/staff/:id/access` deletes admin account and clears `Employee.linkedAdminId` in Mongo + PostgreSQL
- **Orphan repair:** `POST /api/admin/staff/cleanup-orphans` (Super Admin) + **Fix DB** button in Staff Directory
- Files: `admin-staff.js`, `view-staff.html`, `_staff.css`, `staffController.js`, `staffRoutes.js`
- Tests: Jest **228/228** passing

### Assign Access Fix — 2026-09-21

- **Employee search:** `loadAssignEmployees()` uses Bearer fetch + `assignable=true`; fallback to `all=true` with client-side `linkedAdminId` filter; debounced search by name/EMP-ID
- **Backend:** `fetchAllActiveEmployees` uses `$and` Mongo filter; `assignableOnly` PG path skips reverse admin lookup over-filtering; response includes `employees` + `data`
- **Permissions:** Force reload on modal open; `data-key` on toggles; `readSelectedPermissions` reads checkboxes or `.perm-toggle.on`
- **Username:** Empty on modal open; placeholder `e.g. john-doe`; auto-fill only on employee select
- Tests: Jest **228/228** passing

### Access Tab Removed + Staff Directory Final — 2026-09-21

- All admin access management consolidated in System Staff Directory (`view-staff.html` + `admin-staff.js`)
- Employee profile modal no longer exposes access/permissions UI
- Assign modal: Bearer auth on grant-access; field-level validation; 409 graceful handling
- Tests: Jest **228/228** passing

### HRM Access Final Redesign — 2026-09-21

- **Frontend auth fix:** `authHeaders()` helper added to `hrm-employees.js` and `admin-staff.js`; all `/api/admin/*` fetch calls send `Authorization: Bearer ${localStorage.adminToken}` (matches `verifyAdmin` in `authMiddleware.js` — header-based, not cookie)
- **Photo upload:** FormData POST sends Bearer header without Content-Type (browser sets multipart boundary)
- **Staff Directory:** `staffApi()` wraps fetch with shared auth headers; grant-access 409 handled gracefully
- Tests: Jest **228/228** passing

### HRM Access Fix Round 2 — 2026-09-21

- **Menu label editing** moved from sidebar ✏️ pencils to Settings → Security → Customize Menu Labels
- **API:** `DELETE /api/admin/sidebar-labels` clears all custom labels (reset to defaults)
- **HRM access-info:** `GET /api/admin/hrm/employees/:id/access-info` — `isSuperAdmin` flag for profile Access tab
- **Quick grant modal:** Employees page self-contained `#quickGrantModal` with permission presets
- Tests: Jest **228/228** passing

### HRM Modal Fix + Sidebar Labels — 2026-09-21

- **Sidebar label API:** `GET /api/admin/sidebar-labels` returns `{ menuKey: label }` map; `PUT /api/admin/sidebar-labels/:key` upserts custom label (Super Admin only)
- **Prisma:** `SidebarLabel` model + migration `20260921073000_add_sidebar_labels`
- **Frontend:** `sidebarLabels.js` — fetch labels on load, apply to sidebar, ✏️ inline edit on hover (hidden for non–Super Admin)
- **Staff access modals:** viewport-safe shell; Assign/Edit permission grids load all 25 keys from `/api/admin/permissions`
- Tests: Jest **228/228** passing

### Fix Group B — Staff Directory revoke — 2026-09-21

- `DELETE /api/admin/staff/:id/access` — Super Admin only; suspends account, revokes sessions, clears `Employee.linkedAdminId`
- Staff Directory UI: Assign modal, Edit Permissions modal, Suspend/Revoke per row
- Tests: Jest **228/228** passing

### Group 4 — Auth rate limiting — 2026-09-20

- `authLimiter`, `otpLimiter`, `apiLimiter` exported from `rateLimiter.js`
- Applied to customer/admin login, register, forgot-password, verify-otp; global `/api/*` uses `apiLimiter`
- Tests: Jest **228/228** passing

### Admin-Employee Profile Link — 2026-09-20

- `GET /api/admin/profile/me/full` — any authenticated admin; merged sidebar profile
- `PUT /api/admin/profile/link-employee` — `requireSuperAdmin`; validates employee exists, active, not linked to another admin (409)
- Link writes bidirectionally: `Admin.employeeRef` + `Employee.linkedAdminId` with dual-write to PG

### Audit system initialized — codebase scan — 2026-09-20

- Inventoried auth controllers, middleware, models, repositories, admin UI modules
- Status: ✅ COMPLETE
