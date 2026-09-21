# PRODUCTION ISSUES AUDIT — EonlineBazar

**Last updated:** 2026-09-21 (Critical production bugs — syntax, gateway, grant access, SMTP, health)  
**Scope:** Deep read-only production audit — console errors, HRM, staff directory, pagination, enterprise gaps  
**Status:** ⚠️ PARTIAL — Critical bugs 1–5 fixed; items 6, 8, 10 remain open

---

## File Inventory

| Path | Role |
|------|------|
| `docs/audit/PRODUCTION_ISSUES_AUDIT.md` | This file — consolidated production issue register |
| `backend/src/controllers/settingsController.js` | Gateway + attendance settings handlers (500 source) |
| `backend/src/services/gatewayStatusService.js` | Gateway status (Mongo `Settings.getOrCreate`) |
| `backend/src/services/attendanceSettingsService.js` | Attendance settings (Mongo `Settings.getOrCreate`) |
| `backend/src/controllers/admin/attendanceController.js` | `clockOut` / `findStaff` → Admin-only resolver |
| `backend/src/utils/hrmStaffResolver.js` | `findAdmin` vs `findEmployeeRecord` split |
| `client/js/admin/modules/hrm-attendance.js` | Register clock-out UI + settings fetch |
| `client/js/admin/modules/hrm-employees.js` | Grant-access modal — dynamic 25-key permission grid from API |
| `client/js/admin-staff.js` | System Staff Directory + assign-access panel; `fetchStaffAccounts` exposed for grant refresh |
| `devops/NGINX_WEBSOCKET_FIX.md` | Production Nginx `/socket.io/` WebSocket upgrade runbook |
| `backend/src/config/permissions.js` | 25 permission keys (canonical catalog) |

---

## 🔴 Confirmed Console Errors (8 items)

| Error | File | Cause | Fix needed |
|-------|------|-------|------------|
| **A** `GET /api/admin/settings/gateway-status` → **500** | `backend/src/services/gatewayStatusService.js` (`getGatewayStatus`), `backend/src/controllers/settingsController.js:253-261`, `backend/src/models/Settings.js:371-377` | Handler calls `Settings.getOrCreate()` which is **Mongo-only**. In production (PG read-primary), if Mongo is unreachable, slow, or the Settings doc fails validation, the catch block returns 500. UltraMsg ping is wrapped in try/catch and cannot cause 500 by itself. | Route reads through a PG-aware settings service (or `settingsRepository`) with Mongo fallback; add health logging on `Settings.getOrCreate` failure; verify Mongo connectivity on prod droplet. |
| **B** `GET /api/admin/settings/attendance` → **500** | `backend/src/services/attendanceSettingsService.js:74-77`, `backend/src/controllers/settingsController.js:264-272` | Same root cause as A: `getAttendanceSettings()` → `Settings.getOrCreate()` (Mongo only). Loaded by `hrm-attendance.js:1300` on Shifts tab. Permission gate is `manage_staff` **or** `view_attendance` — not a 403 cause. | Same as A: PG-backed settings read + dual-write already exists for writes; reads must use repository layer. |
| **C** `GET /api/admin/hrm/attendance/clock-out` → **404** | `backend/src/routes/adminRoutes.js:625` (route is **POST only**), `client/js/admin/modules/hrm-attendance.js:1168` (correctly uses POST) | No GET route registered. Express returns `Cannot GET …/clock-out`. DevTools may show GET from prefetch, extension, or manual URL entry. **Functional bug (POST path):** register rows for **employees** send `staffId` = Employee Mongo `_id`, but `clockOut` calls `findStaff()` → `findAdmin()` only (`attendanceController.js:549-554`, `hrmStaffResolver.js:27-36`). Employee IDs are not Admin accounts → **404 "Staff member not found"** on POST. | Register `GET` only if needed for diagnostics; **fix POST:** use `resolveHrmSubject({ staffId, staffType: 'employee' })` or pass `staffType` from register row; include `staffType` in `mapAttendanceToMongo` API response. |
| **D** `GET /api/admin/hrm/employ_3213/grant-access` → **400** | `backend/src/routes/adminRoutes.js:593` (correct path: `POST /hrm/employees/:id/grant-access`), `backend/src/controllers/admin/employeeController.js:732-741` | **Malformed URL:** no route matches `/hrm/employ_*` — likely truncated `employees/` in console or bad cached asset. **400 "Access already granted"** comes from `grantSystemAccess` when `employee.linkedAdminId` is already set (line 739-740). **Silent-then-fail UX:** `submitGrantAccess` has no submit loading/disabled state; double-submit or PG/Mongo drift (employee listed in `hasAccess=false` from PG but Mongo already has `linkedAdminId`) shows error on retry. Grant modal uses correct `_id` from `openGrantAccessModal(employee._id, …)`. | Fix dual-write drift on `linkedAdminId`; add submit spinner + disable button; reconcile PG `Employee.linkedAdminId` with Mongo before `hasAccess=false` filter; ignore malformed GET paths. |
| **E** `GET /api/admin/whatsapp-alerts/pending` → **ERR_ADDRESS_UNREACHABLE** | `client/js/admin/modules/orders-actions.js:73-75`, `backend/src/routes/adminRoutes.js:283` | Client uses correct same-origin relative URL. `ERR_ADDRESS_UNREACHABLE` is a **network/DNS/TCP** failure (server down, droplet restart, IPv6/DNS glitch, offline client) — not a wrong path in code. Route requires `manage_orders`; that would return **403**, not address unreachable. Poll interval in `setupWhatsAppAlertBadge`. | Verify PM2/Node :5000 uptime behind nginx; check DigitalOcean firewall; add user-visible "API unreachable" toast instead of silent console warn; confirm admin not blocked by corporate DNS. |
| **F** `GET /api/admin/notifications/unread-count` → **ERR_ADDRESS_UNREACHABLE** | `client/js/admin/modules/notifications.js:66-68`, `backend/src/routes/adminRoutes.js:177` | Same network-level failure as E. Poll every 30s (`NOTIF_POLL_MS`). Service worker explicitly bypasses `/api/admin/` (`public/service-worker.js:52-59`). | Same infra checks as E; surface poll failure in bell UI; verify `notificationController.getUnreadCount` not crashing process (would affect all `/api`). |
| **G** Socket.io connection timeout / xhr poll error | `client/js/admin/modules/core-realtime.js:188-190`, `client/admin/partials/scripts.html:45`, `backend/src/services/socketService.js:43-54`, `devops/nginx.conf:113-121` | Admin socket connects to `io('/admin')` on default path `/socket.io/`. **Nginx** proxies chat WebSocket at `/chat-socket/socket.io/` with Upgrade headers but **store** `location /` block has **no** `Upgrade` / `Connection` headers and no dedicated `/socket.io/` location. Long-polling can still fail on timeout if JWT expired, server restarting, or proxy buffering. Auth middleware rejects chat-agent JWTs (`socketService.js:63-64`). | Add nginx `location /socket.io/` with WebSocket upgrade headers → `:5000`; optionally set `path` explicitly in `initAdminSocket`; verify `JWT_SECRET` and token refresh on admin login. |
| **H** Cloudinary image URLs → **404** | `backend/src/controllers/productController.js:590`, `employeeController.js:163-167`, `client/js/productThumbnail.js:95-135` | Multiple causes in codebase: (1) DB stores full `secure_url` but asset was **deleted** from Cloudinary; (2) wrong **cloud name** in env vs URL; (3) legacy `/products/filename.jpg` paths not on Cloudinary; (4) `publicId` stored without folder prefix (`eonlinebazar/…`, `employees/…`); (5) PG migration copied URLs incorrectly; (6) http→https upgrade does not fix missing asset. | Audit DB image fields vs Cloudinary dashboard; backfill broken URLs; use `photoPublicId` for regeneration; add `onerror` fallback (partially exists in dashboard stock alerts). |

---

## 🔴 System Staff Directory Bugs

| Bug | Cause | Fix needed |
|-----|-------|------------|
| Link flow API | **Correct API:** `POST /api/admin/hrm/employees/:mongoId/grant-access` with `{ username, password, permissions }` (`hrm-employees.js:1544`, `employeeController.js:732`). System Staff Directory delegates via `admin-staff.js:692` → `openGrantAccessModal`. | — |
| "Access already granted" after silent attempt | `employee.linkedAdminId` already set in Mongo; PG `hasAccess=false` list can still show employee (`hrmReadService.js:199-200` Mongo filter vs PG `linkedAdminId: null` — drift). No loading state on submit (`submitGrantAccess`). | Reconcile linkedAdminId both DBs; disable submit while in-flight; refresh assign candidates after success. |
| Wrong employeeId format | Code sends Mongo `_id` (24-char hex), not `employeeId` (`EMP-xxx`). `employ_3213` in console is a **malformed path**, not the payload id. | N/A if using current JS; verify no CDN stale bundle. |
| Backend route exists | ✅ `POST …/grant-access` registered `adminRoutes.js:593`. `GET` is not registered → 404, not grant handler. | Document POST-only in admin runbook. |
| Grant modal permissions incomplete | `view-hrm-employees.html:604-612` — **8 checkboxes** (coarse keys only). Missing all granular keys: `view_attendance`, `mark_attendance_today`, `view_employees`, `view_orders`, etc. (`permissions.js` has **25** keys). | Reuse `renderPermissionCheckboxes` from `admin-staff.js:248` or load catalog from `GET /api/admin/permissions`. |
| Staff directory edit permissions | ✅ `view-staff.html` slide-over uses full 25-key module grid via `renderPermissionCheckboxes` + `STAFF_PERMISSION_MODULES`. Edit/suspend/reset/delete buttons per row (`admin-staff.js:447-458). | — |
| Role display | ✅ Derived badge (`deriveStaffRoleBadge`) — not stored role field. | Optional: show effective permission count. |
| Last login | ✅ Column wired to `staff.lastLoginAt` (`admin-staff.js:445`). | Verify `lastLoginAt` updated on admin login. |
| Suspend/activate | ✅ `toggleStaffStatus` → `PATCH /api/admin/staff/:id/status`. | — |
| Remove access | ⚠️ Delete account in staff directory; HRM has separate revoke/unlink on employee profile. No single "remove access" on staff row without delete. | Add revoke/unlink action linked to employee record. |
| Activity log per staff | ⚠️ Staff Activity Audit exists (`settings-staff-audit.html`) but **not per-row** from System Staff Directory. | Link staff row → filtered audit view. |
| Standalone staff create removed | ✅ By design — assign from HRM only (`view-staff.html:8`). `staffController.createStaff` still exists for API but not exposed in this UI. | — |

---

## 🟡 Clock Out Now Bug

| Cause | Fix needed |
|-------|------------|
| Register passes `staffId` from attendance row (`hrm-attendance.js:1046-1048, 1161-1171`). PG read path sets `staffId` via `legacyStaffIdFromRow` — for **employee** attendance this is Employee Mongo `_id` (`readShapeHelpers.js:893-908`, `1036-1037`). | Include `staffType: 'employee' \| 'admin'` in register API rows and POST body. |
| `clockOut` resolves staff via `findStaff()` → `findAdmin()` only (`attendanceController.js:221-223, 549-551`). Employee `_id` is not an Admin `_id`. | Replace with `resolveHrmSubject({ staffId, staffType })` (same as `persistAttendanceMark`). |
| Route registered correctly as **POST** `/hrm/attendance/clock-out` (`adminRoutes.js:625`). | No route change needed. |
| Secondary: `findStaff` ignores `staffUsername` when it holds `employeeId` string (e.g. `EMP-001`). | Pass `staffType` or use `resolveHrmSubject`. |

---

## 🟡 Pagination Inconsistency

**Reference (Orders):** `view-orders.html` — `AdminPagination` via `order-pg-btns`, `order-pg-info`, `order-pg-limit`, page jump (`orders-table.js`, `core-nav.js:204-212`).

| Section | Has pagination? | Matches Orders style? | Component / notes |
|---------|-----------------|----------------------|-----------------|
| **Orders & Fulfillment** | YES | YES (reference) | `AdminPagination` + `dynamic-order-pages` pg-btn strip |
| **Attendance Register** | YES | NO | Custom prev/next + "Page X of Y" (`hrm-attendance.js:1054-1087`) — no limit selector, no page jump |
| **Employee list** | NO | NO | Fixed `limit=100` fetch only (`hrm-employees.js:181`) |
| **Customer list** | YES | NO | Cursor **Load More** button (`customersLoadMoreBtn`, `core-nav.js:225-357`) |
| **Product list** | YES | NO | Cursor **Load More** (`products-table.js`, `productsLoadMoreBtn`) |
| **Coupon list** | NO | NO | Loads all coupons, client-side filter tabs (`catalog-coupons.js:246-404`) |
| **Expense list** | NO | NO | `limit=100` or `limit=200` single fetch (`erp-expenses.js:119, 320`) |
| **Leave management** | NO | NO | `limit=100` (`hrm-leaves.js:43, 155`) |
| **Payroll list** | NO | NO | `limit=100` (`hrm-payroll.js:68`) |
| **Newsletter subscribers** | YES | YES | `AdminPagination` `subscriber-pg-*` (`admin-newsletter.js:41-53`) |
| **Contact messages** | YES | YES | `AdminPagination` `message-pg-*` (`messages-inbox.js`, `core-nav.js:192-199`) |
| **Reviews list** | NO | NO | Single fetch `limit=20` (`settings-reviews.js:132`) |
| **Security logs** | YES | YES | `AdminPagination` `security-pg-*` (`settings-security.js`) |
| **Stock alerts (dashboard)** | NO | NO | Widget list only, no paging (`admin-dashboard.js:407-448`) |

---

## 🔴 HRM Feature Status

| Feature | Backend | Frontend | Works? | Issues |
|---------|---------|----------|--------|--------|
| Employee CRUD | ✅ `employeeController.js` | ✅ `hrm-employees.js` | ⚠️ | No list pagination; PG/Mongo drift on linked fields |
| Employee photo upload | ✅ Cloudinary `employees/` folder | ✅ | ⚠️ | Cloudinary 404 if asset deleted or URL drift |
| Employee documents | ✅ upload/delete | ✅ profile modal | ✅ | — |
| Employee search/filter | ✅ query params | ✅ | ⚠️ | Max 100 rows client-side |
| Attendance daily sheet | ✅ `getDailySheet` | ✅ | ✅ | Settings 500 breaks late detection config load |
| Attendance register | ✅ paginated API | ✅ | ⚠️ | Custom pagination; clock-out broken for employees |
| Attendance manual entry | ✅ `requireHrOrSuperAdmin` | ✅ tab gating | ✅ | — |
| Attendance lock/unlock | ✅ HTTP 423 | ✅ | ✅ | — |
| Clock in/out | ✅ POST routes | ✅ Daily Sheet + Register | ❌ | Employee clock-out 404; settings 500 |
| Shift management | ✅ CRUD | ✅ Shifts tab | ⚠️ | Attendance settings panel fails if settings 500 |
| Shift assignment | ✅ `assignedStaff` usernames | ✅ | ✅ | Uses Admin username not employeeId |
| Leave request (employee) | ✅ `leaveController.apply` | ⚠️ admin-only UI | ❌ | No employee self-service portal |
| Leave approval (HR) | ✅ approve/reject | ✅ `hrm-leaves.js` | ✅ | No pagination |
| Leave balance tracking | ✅ `getLeaveBalance` | ✅ profile tab | ✅ | — |
| Payroll calculation | ✅ `calculatePayrollFromAttendance` | ✅ modal | ✅ | — |
| Payroll from attendance | ✅ generate + snapshot | ✅ | ✅ | — |
| Payroll slip PDF | ✅ `paySlipPdf.js` | ✅ download | ✅ | — |
| Staff directory | ✅ `staffController.listStaff` | ✅ `view-staff.html` | ✅ | Grant modal permissions incomplete |
| Staff permission management | ✅ PUT permissions | ✅ 25-key panel | ⚠️ | Grant-access modal only 8 keys |
| Staff suspend/activate | ✅ PATCH status | ✅ per row | ✅ | — |
| System access log | ✅ `staffAuditController` | ✅ settings hub | ⚠️ | Not linked from staff directory rows |

---

## ❌ Enterprise Feature Gaps

### HRM

- [ ] Employee self-service portal
- [ ] Leave request from employee login
- [ ] Attendance report export (Excel/PDF) — finance export exists, not HRM attendance register
- [ ] Payroll slip PDF per employee — ✅ exists (`GET /hrm/payroll/:id/payslip`); bulk email missing
- [ ] Employee performance notes
- [ ] Contract/document upload per employee — ✅ documents exist; contract workflow missing
- [ ] Emergency contact info — ⚠️ partial (references in employee model)
- [ ] Probation tracking
- [ ] Notice period management
- [ ] Offboarding workflow

### System / Security

- [ ] Admin activity log viewer — ⚠️ partial (`view-staff-audit`)
- [ ] Failed login attempt log — ⚠️ partial (security settings)
- [ ] IP-based access restrictions — ⚠️ partial (blacklist)
- [ ] Session management (active sessions viewer)
- [ ] Two-factor authentication for all admins — ⚠️ optional per staff, not enforced globally

---

## 🎯 Fix Priority Queue

1. ✅ **Clock-out employee resolution** — FIXED (`resolveClockStaff`, register `staffType`, POST clock-out)
2. ✅ **Settings read path (gateway + attendance) 500** — FIXED (`fetchSettingsDocumentSafe`; PG + Mongo fallback)
3. ✅ **Nginx WebSocket for store Socket.io** — FIXED (runbook `devops/NGINX_WEBSOCKET_FIX.md`; apply on production droplet)
4. ✅ **Grant-access dual-write drift** — FIXED (`syncLinkedAdminIdToPostgres`, 409 response, staff directory refresh, assign dropdown sync)
5. ✅ **Grant-access permission modal** — FIXED (dynamic grouped grid from `GET /api/admin/permissions`; 25 keys + presets)
6. ✅ **Pagination standardization** — FIXED (`pagination-util.js`; AdminPagination on 13 sections; Orders-style "Showing X–Y of Z")
7. **Cloudinary URL audit** — Identify and backfill 404 image URLs in products/employees/banners.
8. **Infrastructure monitoring** — ERR_ADDRESS_UNREACHABLE on polls indicates server/network; add health dashboard + user-visible offline state.
9. ✅ **Staff directory revoke link** — FIXED (professional Staff Directory rebuild; Assign modal; Edit/Suspend/Revoke row actions; `DELETE /api/admin/staff/:id/access`)
10. **Enterprise HRM gaps** — Self-service portal, attendance export, offboarding (longer term).

---

## Change Log

### Critical Production Bugs — 2026-09-21

| Bug | Root cause | Fix |
|-----|------------|-----|
| **1 — SyntaxError: Unexpected end of input** | Inline `onclick` handlers + avatar `onerror` embedding unescaped initials broke JS parsing in admin panel | Replaced Access tab inline handlers with `addEventListener`; fixed avatar `onerror` to read `alt` attribute; load `admin-staff.js` as classic script (not module) |
| **2 — gateway-status 500 MODULE_NOT_FOUND** | `settingsController.js` used `require('../../services/...')` → wrong path (`backend/services/` vs `backend/src/services/`) | Corrected to `require('../services/gatewayStatusService')` and `../services/attendanceSettingsService` |
| **3 — Grant System Access button no-op** | `openEmployeeGrantAccess` called Staff Directory modal (`#staffAssignAccessModal`) not present on Employees page | Prefer local `#grantAccessModal` in `view-hrm-employees.html`; event-delegated Grant button; refresh Access tab after success |
| **4 — SMTP ENETUNREACH IPv6** | `userProfileController` used `service: 'gmail'` (resolves IPv6 first on DO droplets) | Explicit `host: smtp.gmail.com`, `port: 587`, `family: 4`; `mailer.js` already had `family: 4` |
| **5 — PostgreSQL health "disconnected"** | Neon cold start / no query timeout; `$queryRaw` failure reported as disconnected | `probePostgres()` uses 3s timeout + returns `degraded` instead of `disconnected` |

- Files: `admin-staff.js`, `hrm-employees.js`, `scripts.html`, `settingsController.js`, `userProfileController.js`, `healthService.js`
- Tests: Jest **228/228** passing

### Fix Group B — Pagination + Staff Directory — 2026-09-21

- **Pagination:** `client/js/admin/modules/pagination-util.js` + `_pagination.css`; AdminPagination on 13 sections (employees, attendance, leave, payroll, customers, products, coupons, expenses, reviews, newsletter, contact, security logs, stock alerts)
- **Staff Directory:** Rebuilt `view-staff.html` + `admin-staff.js` — Assign modal, Edit Permissions modal, Suspend/Revoke row actions; `DELETE /api/admin/staff/:id/access`
- Tests: Jest **228/228** passing

### Critical Fix Group A refinements — 2026-09-21

- **Fix 4:** `syncLinkedAdminIdToPostgres` via `prisma.employee.update({ legacyId })`; 409 on duplicate grant; frontend already-granted UX + staff directory refresh + assign dropdown removal; Link Account loading state
- **Fix 5:** Grant modal renders permission groups dynamically from API `group` field (all 25 keys)
- Tests: Jest **228/228** passing

### Critical Fixes 1–5 — 2026-09-21

- **Fix 1:** `resolveClockStaff` + `resolveClockSubject` in attendance controller; register passes `staffType`; `hrm-attendance.js` clock-out payload
- **Fix 2:** `settingsReadService.fetchSettingsDocumentSafe`; gateway + attendance settings + WhatsApp reads use PG with Mongo fallback; safe defaults (no 500)
- **Fix 3:** `devops/NGINX_WEBSOCKET_FIX.md` — server-side `/socket.io/` WebSocket upgrade instructions (repo nginx unchanged)
- **Fix 4:** `reconcileLinkedAdminAccess` in `employeeController`; PG assign list filters Mongo-linked employees; grant submit loading guard
- **Fix 5:** Grant modal uses full 25-key permission grid (`#grantAccessPermissionGrid`) loaded from `/api/admin/permissions`
- Tests: Jest **228/228** passing

### Deep Production Audit — 2026-09-21

- Read-only scan of 8 confirmed console errors, System Staff Directory, clock-out flow, 13-section pagination audit, full HRM matrix, enterprise gap checklist
- **52 actionable issues** documented; no code fixes applied
- Cross-references: `HRM_AUDIT.md`, `SYSTEM_ENTERPRISE_AUDIT.md`, `REFACTOR_MAP.md`
