# AUTH & SECURITY AUDIT — EonlineBazar

**Last updated:** 2026-09-20 (Admin-Employee profile link)  
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
| `backend/src/middlewares/auth.js` | `verifyUser`, `verifyAdmin`, `optionalVerifyUser` |
| `backend/src/middlewares/rbac.js` | `checkPermission()` RBAC gate |
| `backend/src/config/permissions.js` | 9 granular permission constants |
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

- [x] Customer JWT login/register — `loginController.js`, `registerController.js`
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
- [x] Rate limiting middleware — `rateLimitMiddleware.js`
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

### Admin-Employee Profile Link — 2026-09-20

- `GET /api/admin/profile/me/full` — any authenticated admin; merged sidebar profile
- `PUT /api/admin/profile/link-employee` — `requireSuperAdmin`; validates employee exists, active, not linked to another admin (409)
- Link writes bidirectionally: `Admin.employeeRef` + `Employee.linkedAdminId` with dual-write to PG

### Audit system initialized — codebase scan — 2026-09-20

- Inventoried auth controllers, middleware, models, repositories, admin UI modules
- Status: ✅ COMPLETE
