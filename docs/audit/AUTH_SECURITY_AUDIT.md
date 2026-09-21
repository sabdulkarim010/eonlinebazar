# AUTH & SECURITY AUDIT — EonlineBazar

**Last updated:** 2026-09-21 (Assign Access Fix)  
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
| `backend/src/repositories/sidebarLabelRepository.js` | PG `SidebarLabel` reads/writes |
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
| `backend/src/repositories/adminSessionRepository.js` | PG admin session reads |
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

- [x] Super Admin sidebar menu label customization — `GET/PUT /api/admin/sidebar-labels/:key`, `DELETE /api/admin/sidebar-labels` reset (`requireSuperAdmin`); edit UI in Settings → Security
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
| Some legacy routes weakly protected | Low | Open | See `SYSTEM_ENTERPRISE_AUDIT.md` Section 7 |
| Chat agent SSO partial | Low | Open | Agent auto-provision; not full SSO — see `CHAT_AUDIT.md` |

---

## Dependencies & Integrations

- **Env:** `JWT_SECRET`, OAuth client IDs, session secrets
- **PG flags:** `READ_PG_USER_SESSION`, `READ_PG_ADMIN_SESSION`, `READ_PG_ADMIN` (admin profile merge reads), `READ_PG_SECURITYLOG`, `READ_PG_LOGINATTEMPT`, `READ_PG_BLACKLISTEDIP`
- **Related audits:** `ADMIN_PANEL_AUDIT.md`, `HRM_AUDIT.md`, `CHAT_AUDIT.md`

---

## Change Log

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
