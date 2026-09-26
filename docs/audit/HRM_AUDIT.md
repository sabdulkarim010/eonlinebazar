# HRM AUDIT — EonlineBazar

**Last updated:** 2026-09-26 (Granular HRM audit logging + enterprise dashboard KPI aggregation)  
**Scope:** HR module — employees, designations, attendance, shifts, payroll, leave, admin–employee profile link; `/api/admin/hrm/*`  
**Status:** ✅ COMPLETE — Two-stage delete, SweetAlert2 z-index fix, Super Admin terminate guard, 6-tab profile modal

---

## File Inventory

| Path | Role | Status |
|------|------|--------|
| `backend/src/routes/adminRoutes.js` | All `/hrm/*` + profile link routes (~550–620, 662–664) | ✅ |
| `backend/src/models/employee.js` | Non-login staff record; `linkedAdminId` for system access | ✅ |
| `backend/src/models/admin.js` | Login staff; `employeeRef`, `baseSalary`, HRM employment fields | ✅ |
| `backend/src/models/attendance.js` | One row per staff per day; manual-entry audit fields | ✅ |
| `backend/src/models/attendanceLock.js` | Per-date attendance lock (Super Admin) | ✅ |
| `backend/src/models/shift.js` | Named shifts + default + grace period | ✅ |
| `backend/src/models/leave.js` | Leave applications + approval trail | ✅ |
| `backend/src/models/payroll.js` | Monthly payroll runs; `earnedSalary` + `computeTotalSalary` | ✅ |
| `backend/src/services/payrollService.js` | Weekend-aware calendar math, joining pro-rate, net pay assembly | ✅ |
| `backend/src/services/attendanceSettingsService.js` | `weekendDays` / grace period for payroll + attendance | ✅ |
| `backend/src/models/designation.js` | Job title catalog | ✅ |
| `backend/src/controllers/admin/employeeController.js` | Employee CRUD, photo/docs, grant/revoke access, `syncLinkedAdminName` | ✅ |
| `backend/src/controllers/admin/attendanceController.js` | Attendance, shifts, clock-in/out, daily sheet, lock, update/remove, past-date guard | ✅ |
| `backend/src/middlewares/rbac.js` | `requireHrOrSuperAdmin`, `isHrOrSuperAdmin` for manual entry + remove | ✅ |
| `backend/src/controllers/admin/payrollController.js` | Payroll generate/approve/paid, payslip PDF | ✅ |
| `backend/src/services/hrmAuditService.js` | Structured HRM SecurityLog events (`logHrmAuditEvent`) | ✅ |
| `backend/src/controllers/admin/staffAuditController.js` | Staff activity + `GET /staff-audit/hrm` filtered audit | ✅ |
| `backend/src/services/hrmDashboardMetricsService.js` | Batched HRM KPIs for enterprise summary (cached) | ✅ |
| `backend/src/controllers/admin/leaveController.js` | Leave apply/approve/reject, balance, calendar | ✅ |
| `backend/src/controllers/admin/designationController.js` | Designation CRUD | ✅ |
| `backend/src/controllers/admin/adminProfileController.js` | `GET /profile/me/full`, link-employee, photo/name sync | ✅ |
| `backend/src/repositories/employeeRepository.js` | PG employee dual-write/read | ✅ |
| `backend/src/repositories/attendanceRepository.js` | PG attendance; daily sheet, bulk mark, manual entries, `deleteByStaffAndDate` | ✅ |
| `backend/src/repositories/attendanceLockRepository.js` | PG attendance date locks | ✅ |
| `backend/src/repositories/shiftRepository.js` | PG shifts | ✅ |
| `backend/src/repositories/payrollRepository.js` | PG payroll | ✅ |
| `backend/src/repositories/leaveRepository.js` | PG leave | ✅ |
| `backend/src/repositories/designationRepository.js` | PG designation | ✅ |
| `backend/src/repositories/adminRepository.js` | `getAdminWithEmployeeData`, `buildAdminEmployeeProfileShape` | ✅ |
| `backend/src/services/hrmReadService.js` | Routed read helpers for HRM lists/profiles | ✅ |
| `backend/src/services/superAdminHrmSync.js` | Boot-time superadmin ↔ employee link | ✅ |
| `backend/src/utils/hrmStaffResolver.js` | Resolve admin vs employee attendance subjects | ✅ |
| `backend/src/utils/paySlipPdf.js` | PDFKit pay slip generator | ✅ |
| `prisma/schema.prisma` | Employee, Attendance, AttendanceLock, Shift, Payroll, Leave models | ✅ |
| `prisma/migrations/20260920143000_attendance_upgrade/migration.sql` | Attendance upgrade migration | ✅ |
| `tests/repositories/employee.repository.test.js` | Employee repo tests | ✅ |
| `tests/repositories/attendance.repository.test.js` | Attendance repo tests (daily sheet, bulk mark) | ✅ |
| `tests/repositories/attendanceLock.repository.test.js` | AttendanceLock repo tests | ✅ |
| `tests/repositories/payroll.repository.test.js` | Payroll repo tests | ✅ |
| `tests/repositories/leave.repository.test.js` | Leave repo tests | ✅ |
| `tests/repositories/designation.repository.test.js` | Designation repo tests | ✅ |
| `tests/repositories/shiftRepository.test.js` | Shift repo tests | ✅ |
| `tests/repositories/admin.repository.test.js` | Admin–employee merge + link tests | ✅ |
| `tests/hrm.test.js` | Integration tests for HRM flows | ✅ |
| `client/admin/partials/view-hrm-employees.html` | Employee roster + profile modal + access tab | ✅ |
| `client/admin/partials/view-hrm-attendance.html` | Daily Sheet, Register, Shifts, Late Report, Manual Entry | ✅ |
| `client/admin/partials/view-hrm-payroll.html` | Payroll runs | ✅ |
| `client/admin/partials/view-hrm-leaves.html` | Leave management | ✅ |
| `client/admin/partials/view-settings.html` | Link to Employee Record card (super-admin) | ✅ |
| `client/admin/partials/sidebar.html` | Sidebar profile HTML (`#adminProfilePic`, `.admin-profile .info`) | ✅ |
| `client/js/admin/modules/sidebarLabels.js` | Super Admin sidebar label apply (read-only in sidebar) | ✅ |
| `client/js/admin/modules/settings-menu-labels.js` | Settings → Customize Menu Labels editor (Super Admin) | ✅ |
| `client/js/admin/modules/hrm-employees.js` | Employee UI — 6 profile tabs (Overview…Leave + More); two-stage delete; Swal z-index helper | ✅ |
| `client/js/admin-staff.js` | Staff Directory — stepped Assign modal, perm toggles, presets, row actions; `staffApi()` delegates to `hrmFetchJson` | ✅ |
| `client/css/admin/_staff.css` | Assign modal steps, `.perm-toggle`, validation, password show/hide | ✅ |
| `client/admin/partials/view-staff.html` | System Staff Directory — Assign New Access, Active Admins stat card | ✅ |
| `backend/src/controllers/staffController.js` | `listStaff` returns `{ staff, total, activeCount }` | ✅ |
| `client/css/admin/_modals.css` | Viewport-safe `.admin-modal` pattern (max-height, scrollable body) | ✅ |
| `client/css/admin/_hrm.css` | HRM modal viewport rules; Access tab permission groups | ✅ |
| `client/css/admin/_layout.css` | Compact HRM page header/stats spacing | ✅ |
| `client/admin/partials/view-settings.html` | Customize Menu Labels card (Security tab) | ✅ |
| `backend/src/repositories/sidebarLabelRepository.js` | PG sidebar label CRUD | ✅ |
| `backend/src/controllers/admin/sidebarLabelController.js` | GET/PUT `/api/admin/sidebar-labels` | ✅ |
| `prisma/schema.prisma` | `SidebarLabel` model | ✅ |
| `tests/repositories/sidebarLabel.repository.test.js` | SidebarLabel repo tests | ✅ |
| `client/js/admin/modules/hrm-api.js` | Shared HRM fetch layer — 25s timeout, debounced error toasts, `silent` option, inline table error helpers | ✅ |
| `client/js/admin/modules/hrm-attendance.js` | Daily sheet, tab-aware refresh, stat/dashboard sync, platform TZ date helpers, uses `hrm-api.js` | ✅ |
| `backend/src/utils/attendanceDate.js` | Platform TZ (Asia/Dhaka) attendance calendar dates; normalize/format/iterate | ✅ |
| `client/js/admin/modules/hrm-payroll.js` | Payroll UI | ✅ |
| `client/js/admin/modules/hrm-leaves.js` | Leave UI | ✅ |
| `client/js/admin/modules/adminSidebar.js` | `loadAdminSidebarProfile`, merged profile fetch | ✅ |
| `client/js/admin/admin-core.js` | Imports `adminSidebar.js` (line 14) | ✅ |
| `client/js/admin/modules/core-boot.js` | `fetchAdminProfile` delegates to sidebar loader; sets `window.adminRole` | ✅ |
| `client/js/admin/modules/core-nav.js` | Sidebar refresh after profile pic upload | ✅ |
| `client/css/admin/_hrm.css` | Status pills, split buttons, inline edit row, save feedback, lock bar styles | ✅ |
| `docs/audit/PRODUCTION_ISSUES_AUDIT.md` | Consolidated production issue register (2026-09-21) | ✅ |

---

## Feature Checklist

- [x] Viewport-safe modals (Assign Access, Edit Permissions, employee profile) — `_modals.css`, `_hrm.css`
- [x] Assign System Access full flow (employee search, 25 permissions, presets, Link Account) — `admin-staff.js`, `view-staff.html`
- [x] Employee profile modal — 5 tabs only (Overview, Documents, Attendance, Payroll, Leave) — no Access tab — `view-hrm-employees.html`, `hrm-employees.js`
- [x] Staff Directory Assign System Access — stepped modal (employee search, credentials, perm toggles, presets) — `view-staff.html`, `admin-staff.js`
- [x] Staff row actions — Edit Permissions, Suspend/Activate, Revoke — `admin-staff.js`
- [x] Active Admins stat card — `GET /api/admin/staff` returns `activeCount` — `staffController.js`
- [x] Super Admin sidebar menu label customization — `sidebarLabels.js`, `sidebarLabelController.js`
- [x] Employee profile modal (attendance/payroll/leave tabs) — `getEmployeeProfile`
- [x] Cloudinary photo + document uploads — `uploadEmployeePhoto`, `uploadEmployeeDocument`
- [x] Designation catalog CRUD — `designationController.js`
- [x] Attendance register (one row/staff/day) — `attendanceController.js`
- [x] Daily Sheet tab — date/dept filter, per-row status split button, inline check-in/out edit, bulk mark present/absent — `getDailySheet`, `bulkMarkAttendance`, `updateAttendanceDetails`, `removeAttendanceRecord`
- [x] Attendance date lock (Super Admin lock/unlock, HTTP 423 on locked writes) — `attendanceLockRepository.js`
- [x] Manual Entry tab — HR/Super Admin only (`requireHrOrSuperAdmin`); override locked dates (Super Admin), recent 30 entries — `manualEntry`, `getManualEntries`
- [x] Clock-in / clock-out with optional GPS — `clockIn`, `clockOut` (respects date lock + today-only for staff)
- [x] Shift roster + late detection — shift CRUD in `attendanceController.js`
- [x] Attendance summary + late report — `getAttendanceSummary`, `getLateReport`
- [x] Payroll generation from attendance — `generatePayroll`
- [x] Payroll calculate preview — `GET /hrm/payroll/calculate`; breakdown modal before save
- [x] Payroll workflow draft → approved → paid — `approvePayroll`, `markPaid`
- [x] PDF pay slip — `generatePaySlip`, `paySlipPdf.js`
- [x] Leave apply/approve/reject — `leaveController.js`
- [x] Leave balances + calendar — `getLeaveBalance`, `getLeaveCalendar`
- [x] Leave approval stamps holiday attendance rows — implemented in leave approve
- [x] System access grant/revoke/suspend — `grantSystemAccess`, `revokeSystemAccess`
- [x] Staff roster dropdown — `GET /hrm/staff`
- [x] Employee CSV export — `GET /hrm/employees/export`
- [x] HRM dashboard widget — `enterpriseSummaryController.js`
- [x] Granular HRM audit logging (salary, employee status, payroll release/batch, leave status) — `hrmAuditService.js`, wired in payroll/employee/leave controllers
- [x] Filterable HRM audit API — `GET /api/admin/staff-audit/hrm?staffId=&actionType=&dateFrom=&dateTo=`
- [x] Enterprise HRM KPI aggregation (single bundle + estimated payroll cost) — `hrmDashboardMetricsService.js`
- [x] PG repositories + read cutover flags — `READ_PG_EMPLOYEE`, `READ_PG_ATTENDANCE`, etc.
- [x] Admin–employee link API — `PUT /api/admin/profile/link-employee` (super-admin)
- [x] Employee photo upload → linked admin image sync — `uploadEmployeePhoto` + `syncLinkedAdminPhoto`
- [x] Admin sidebar name sync from linked Employee — `buildAdminEmployeeProfileShape` prefers `employee.fullName`; `syncLinkedAdminName` on update
- [x] Staff past-date attendance restriction — HTTP 403 on mark/clock/bulk for non-today dates; Daily Sheet view-only UI for staff
- [x] HRM save feedback — per-row spinner/saved/failed on Daily Sheet; employee modal Saving/Saved; toasts for bulk/manual/lock
- [x] Attendance Register tab loads on tab click — `hrm-tab-register` → `loadAttendanceList()` with pagination (50/page)
- [x] HRM fetch error handling — shared `hrm-api.js`: 25s timeout, 300ms debounced error toasts, `silent: true` for background syncs
- [x] HRM modules on shared fetch — attendance, employees, payroll, leaves, admin-staff migrated off raw `fetch()`
- [x] Graceful table load errors — generic inline message via `hrmTableErrorRow()`; toast separate from table UI
- [x] Daily Sheet compact single-row toolbar — filters left, actions right (`.hrm-daily-sheet-toolbar`)
- [x] Unified attendance status badges — `renderAttendanceStatusBadge()` shared by Daily Sheet + Register
- [x] Refresh button loading spinners — header `#attendanceRefreshBtn` + `#dailySheetRefreshBtn` via `withButtonLoading()`
- [x] Tab-aware header Refresh — `refreshActiveHrmAttendanceTab()` dispatches by active tab + spinner
- [x] Stat strip + dashboard sync — `refreshTodayAttendanceStats()` on boot; `invalidateHrmAttendanceMetrics()` after writes
- [x] Platform timezone attendance dates — `attendanceDate.js` shared by Mongo, PG, client `hrmTodayInputValue()`
- [x] Daily Sheet "Set Now" clock buttons — inline check-in/out time helpers
- [x] Register "Clock Out Now" — `POST /hrm/attendance/clock-out` with `resolveClockStaff` (Admin + Employee)
- [x] Attendance Settings panel — `GET/PUT /settings/attendance` via PG-safe read + Mongo fallback
- [x] Daily Sheet late detection — office start + grace from settings on Set Now / Present
- [x] Granular attendance permissions — `view_attendance`, `mark_attendance_today`, `manual_attendance`, etc.

**Summary: 33 of 34 features complete; pagination standardization still open.**

---

## Bug Report

### BUG 1 — Sidebar photo/name not linking to Employee

| Check | Finding |
|-------|---------|
| Does `adminSidebar.js` exist and load? | **Yes.** File at `client/js/admin/modules/adminSidebar.js`; imported in `client/js/admin/admin-core.js:14`; `DOMContentLoaded` calls `loadAdminSidebarProfile()` at line 171. |
| Does `GET /api/admin/profile/me/full` return Employee photo? | **Conditionally.** Route wired at `adminRoutes.js:662`. Handler `getAdminProfileFull` (`adminProfileController.js:229–250`) merges via `buildAdminEmployeeProfileShape`. Photo prefers `employee.photo` over `admin.image` (`adminRepository.js:472–480`) **only when a linked Employee row is found**. |
| Is sidebar HTML calling `loadAdminSidebarProfile()`? | **Yes** — via `adminSidebar.js` boot; also delegated from `core-boot.js:118–120`, refreshed after photo upload in `core-nav.js:461–462`, employee photo in `hrm-employees.js:700–701`, and settings save in `settings-cms.js:1378–1379`. |
| What is broken? | **Three root causes:** |

**Root cause A — Sidebar name never uses Employee `fullName`**

```468:484:backend/src/repositories/adminRepository.js
function buildAdminEmployeeProfileShape(admin, employee) {
  const displayName = String(admin?.displayName || admin?.name || admin?.username || 'Admin').trim();
  // ...
  return {
    displayName,
    photo: employeePhoto || adminImage || null,
    employeeName: employee?.fullName || null,
```

`displayName` (shown in sidebar via `adminSidebar.js:16–24`) always comes from the **Admin** record. Employee `fullName` is returned only as `employeeName`, which the sidebar does not render. Updating an employee's name in HRM does not change the sidebar.

**Root cause B — Employee name update does not sync to linked Admin**

```349:408:backend/src/controllers/admin/employeeController.js
exports.updateEmployee = async (req, res) => {
    // ... saves fullName to Employee ...
    // NO call to syncLinkedAdminName / Admin displayName update
    res.status(200).json({ success: true, message: 'Employee updated.', data: employee });
```

Contrast: `uploadEmployeePhoto` **does** call `syncLinkedAdminPhoto` (`employeeController.js:512`). Name changes have no equivalent sync, and `hrm-employees.js` only refreshes sidebar after photo upload (`698–702`), not after name-only saves.

**Root cause C — PG read path may miss orphaned `employeeRef` links**

Mongo resolver checks both edges:

```47:57:backend/src/controllers/admin/adminProfileController.js
async function resolveLinkedEmployee(admin) {
    if (admin.employeeRef) {
        employee = await Employee.findById(admin.employeeRef);
    }
    if (!employee) {
        employee = await Employee.findOne({ linkedAdminId: String(admin._id) });
    }
```

PG resolver checks **only** `Employee.linkedAdminId`:

```506:515:backend/src/repositories/adminRepository.js
  const employee = await prisma.employee.findFirst({
    where: { linkedAdminId: admin.id },
```

With `READ_PG_ADMIN=true` (production default), an Admin with `employeeRef` set but missing reverse FK on Employee returns **no linked employee** — photo and `employeeName` both absent from `/profile/me/full`.

**Severity:** Medium | **Status:** ✅ FIXED (2026-09-20)

**Fix applied:** `buildAdminEmployeeProfileShape` prefers linked employee `fullName`; PG `getAdminWithEmployeeData` falls back to Mongo `employeeRef`; `syncLinkedAdminName` in `employeeController.js`; sidebar refresh after every employee save in `hrm-employees.js`.

---

### BUG 2 — Attendance date restriction missing for staff

| Check | Finding |
|-------|---------|
| Can staff mark attendance for past dates? | **Yes.** All write endpoints accept any valid normalized date; only **lock** status is checked, not “today only” for non–super-admin actors. |
| Date validation in `attendanceController.js`? | **Partial only.** Validates date format (`normalizeDate`) and lock (`getLockStatusMerged` / `assertDateWritable`). **No** comparison to today's date for staff role. |
| Does Daily Sheet UI prevent past dates? | **No.** `#dailySheetDate` is `<input type="date">` with no `min` attribute (`view-hrm-attendance.html:71`). JS defaults to today on first load (`hrm-attendance.js:596`) but user can pick any past date; `change` handler reloads sheet (`hrm-attendance.js:618–620`) and marks are sent with chosen date (`hrm-attendance.js:362–370`). |

**Affected backend paths (no today-only guard):**

| Function | File:Line | Notes |
|----------|-----------|-------|
| `persistAttendanceMark` | `attendanceController.js:270–282` | Used by mark, bulk-mark, manual-entry, daily sheet row saves |
| `clockIn` | `attendanceController.js:393–397` | `body.date` optional; defaults to today via `normalizeDate(undefined)` but accepts explicit past date |
| `clockOut` | `attendanceController.js:469–473` | Same as clock-in |
| `bulkMarkAttendance` | `attendanceController.js:616–625` | Bulk present/absent for any date |

**Affected UI paths:**

| Element | File:Line | Issue |
|---------|-----------|-------|
| `#dailySheetDate` | `view-hrm-attendance.html:71` | No `min={today}` |
| `#hrmAttendanceDateFilter` | `view-hrm-attendance.html:128` | No min (register tab — read/filter OK) |
| `#manualEntryDate` | `view-hrm-attendance.html:220` | No min (intentionally for super-admin backfill, but staff with `manage_staff` can also POST) |
| `#markAttendanceDate` | `view-hrm-attendance.html:351` | No min |

Routes require `manage_staff` permission (`adminRoutes.js:592–598`), not super-admin — so any staff admin granted HRM permission can mark past dates for themselves or others via API or Daily Sheet UI.

**Severity:** Medium | **Status:** ✅ FIXED (2026-09-20)

**Fix applied:** `assertStaffAttendanceDateAllowed` in `attendanceController.js` (403 for non-today on mark/clock/bulk; manual entry exempt); Daily Sheet `max=today`, view-only banner, disabled action buttons for staff on past dates in `hrm-attendance.js`.

---

## Known Issues / Gaps

| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| Clock-out from Register fails for employee attendance rows | **High** | Fixed | `resolveClockStaff` in `attendanceController.js`; register sends `staffType` |
| `GET /settings/attendance` 500 in production | **High** | Fixed | `fetchSettingsDocumentSafe` + Mongo fallback for `attendanceSettings` |
| Grant-access "Access already granted" / PG-Mongo drift | Medium | Fixed | `syncLinkedAdminIdToPostgres`; HTTP 409; staff directory + dropdown refresh |
| Grant-access modal only 8 permission keys | Medium | Fixed | Dynamic API-grouped 25-key grid in grant modal |
| Employee/leave/payroll lists lack Orders-style pagination | Medium | Open | Fixed `limit=100` client fetch |
| Manual Entry tab lacks super-admin-only route guard | Low | Open | `manual-entry` uses same `manage_staff` as daily sheet; past-date writes allowed via manual entry flag |
| `hr` admin role not in schema yet | Low | Open | Past-date bypass checks `role === 'hr'` for future use; only `superadmin` exists today |
| Parallel HRM fetch failures spam error toasts (BUG-HRM-02) | Medium | Fixed | `hrm-api.js` debounces identical toasts within 300ms; all HRM modules use shared layer |
| Raw `fetch()` in HRM modules — no timeout, hung requests (BUG-HRM-02) | Medium | Fixed | 25s AbortController timeout; payroll/leaves/employees/attendance/staff migrated |

---

## Dependencies & Integrations

- **Permission:** HRM routes require `verifyAdmin` + `checkPermission('manage_staff')`; lock routes + link-employee require super-admin
- **Payroll formula:** `baseSalary × min(presentDays/workingDays, 1) + overtime + bonus − deductions`
- **Linked model:** `Employee.linkedAdminId` ↔ `Admin.employeeRef` (Mongo dual-write); PG canonical FK is `Employee.linkedAdminId` only
- **Profile sync:** Employee photo/name → Admin image/displayName on HRM update; Admin photo → Employee photo on profile pic upload; super-admin settings save syncs name employee ← admin
- **Read cutover:** `READ_PG_ADMIN`, `READ_PG_EMPLOYEE`, `READ_PG_ATTENDANCE` etc. — all ON in production per project rules
- **Related audits:** `ADMIN_PANEL_AUDIT.md`, `AUTH_SECURITY_AUDIT.md`, `PAYMENTS_FINANCE_AUDIT.md`

---

## Change Log

### Granular HRM audit logging & dashboard KPI aggregation — 2026-09-26

- Added `hrmAuditService.js` with `HRM_ACTION_TYPES` and `logHrmAuditEvent` (action, actorId, actorName, targetStaffId, previousValue, newValue, ipAddress).
- Extended `SecurityLog` Mongo schema + dual-write details JSON for Postgres read parity.
- `GET /api/admin/staff-audit/hrm` with filters: `staffId`, `actionType`, `dateFrom`/`dateTo`.
- Wired audit on salary config, payroll approve/paid/generate/bulk, employee status/salary/deactivate, leave approve/reject.
- `hrmDashboardMetricsService.js` batches employee count, attendance today, pending leave, and payroll month rollup; Redis cache TTL 30s; `estimatedPayrollCostThisMonth` on enterprise summary.
- Tests: `tests/hrmAudit.test.js`; full suite **328/328**.

### Bulk attendance import & async HRM jobs — 2026-09-26

- **Bulk import:** `POST /hrm/attendance/bulk-import` — CSV/Excel (`importFile`) or JSON `rows[]`; validates staff/date (Asia/Dhaka), upserts by `(staffId, date)`; summary `{ totalProcessed, successCount, errorCount, errors[] }`
- **Async payroll batch:** `POST /hrm/payroll/generate-bulk?async=true` — BullMQ + `BackgroundJob` inline fallback via `importExportQueue`
- **Async exports:** `GET /hrm/employees/export?async=true`, `GET /hrm/payroll/export?async=true` — **202** + `jobId`; poll `GET /hrm/jobs/:jobId`, download `GET /hrm/jobs/:jobId/download`
- Files: `bulkAttendanceService.js`, `hrmAsyncJobService.js`, `attendanceController.js`, `payrollController.js`, `exportController.js`, `importExportQueue.js`, `adminRoutes.js`
- Tests: **323/323** Jest (+ `bulkAttendanceService.test.js`)

### Attendance unique constraint & employee cascade cleanup — 2026-09-26

- **Unique (staffId, date):** Mongo `{ staffId: 1, date: 1 }` unique index; Postgres `@@unique([staffId, date])` + migration dedupe
- **Duplicate handling:** HTTP **409** on duplicate mark/clock paths (`attendanceDuplicate.js`, PG `P2002` retry/update in `attendanceRepository`)
- **Employee terminate/deactivate:** `cascadeEmployeeHrmCleanup` — removes all attendance + **draft** payroll (Mongo + PG); approved/paid payroll kept on soft terminate
- **Permanent delete:** Full cascade (attendance, payroll, leave) via `employeeHrmCascadeService` + `employeeRepository.remove`
- Files: `attendance.js`, `attendanceRepository.js`, `employeeController.js`, `employeeRepository.js`, `payrollRepository.js`, `leaveRepository.js`, `prisma/schema.prisma`
- Tests: **321/321** Jest (+ `employeeHrmCascade.test.js`, deactivate cascade in `hrm.test.js`)

### Employee read parity & CSV export — 2026-09-25

- **PG/Mongo lists:** Default employee reads exclude soft-deleted + `terminated` (Mongo `isDeleted` + `status`; PG `status not TERMINATED` via `mergeOperationalEmployeeWhere`)
- **`includeTerminated=true`:** Query flag on list/export includes terminated rows; `status=terminated` filter shows terminated only
- **Employee CSV:** `joiningDate` + `baseSalary` fields (was wrong `joinDate` / `salary`); uses `fetchEmployeesForExport` (routed read)
- **Payroll CSV:** `GET /hrm/payroll/export` — `baseSalary`, `earnedSalary`, `totalSalary` columns via `fetchPayrollsForExport`
- Files: `employeeRepository.js`, `hrmReadService.js`, `exportController.js`, `adminRoutes.js`
- Tests: **320/320** Jest (+ `employeeReadParity`, `employeeExportCsv`)

### Attendance timezone, late detection & atomic clock — 2026-09-25

- **Platform TZ:** Clock-in/out and manual mark times use `Asia/Dhaka` (via `attendanceDate` + `platformLocalToUtc`); lateness uses wall-clock minutes in platform TZ, not server local time
- **Settings-driven shifts:** `resolveShiftFor` falls back to `getAttendanceSettings()` office start/end and grace; `deriveClockInLateStatus` / `calculateLateMinutes` in `attendanceSettingsService`
- **Duplicate punch:** Mongo `findOneAndUpdate` upsert when `clockIn` is null; unique index `{ staffId, date }`; clock-out uses conditional update when `clockOut` is null
- **Hours worked:** `Attendance.computeHoursWorked` static + pre-save hook; clock-out sets hours before save
- Files: `attendanceController.js`, `attendanceSettingsService.js`, `attendance.js`, `attendanceRepository.js` (`combineDateAndTime`), `tests/services/attendanceClock.test.js`
- Tests: **316/316** Jest (incl. 3 platform TZ unit tests)

### Payroll calculation core fixes — 2026-09-25

- **Dynamic weekends:** `countWorkingDays` uses `getAttendanceSettings().weekendDays` (not hardcoded Friday)
- **Mid-month join:** `getMonthJoiningProration` + `resolvePayrollEmployment` pro-rate `baseSalary` by calendar days active in the payroll month (Admin + linked Employee records)
- **Absent double-deduction removed:** `earnedSalary` from present/working days; `absentDeduction` breakdown is informational; net deductions = late + unpaid leave + manual only
- **Controller:** `generatePayroll` persists `earnedSalary`, `proRatedBaseSalary`, attendance deduction breakdown via `payrollService`
- **PG repo:** `countWorkingDays` uses `DEFAULT_ATTENDANCE_SETTINGS.weekendDays`; Mongo path is source of truth for full formula (PG `generate()` still legacy ratio — mirror via `upsertFromMongo`)
- Files: `payrollService.js`, `payrollController.js`, `payroll.js`, `payrollRepository.js`, `tests/hrm.test.js`
- Tests: `tests/hrm.test.js` **36/36**; `tests/repositories/payroll.repository.test.js` **6/6**

### Leave validation & atomic approval — 2026-09-25

- **Balance enforcement:** `applyLeave` / `applyOwnLeave` reject when approved + pending + requested days exceed `LEAVE_ALLOWANCES` (unpaid uncapped)
- **Overlap guard:** blocks new applications overlapping existing pending/approved ranges
- **Atomic approve/reject:** Mongo `findOneAndUpdate({ status: 'pending' })` + PG `updateMany` — duplicate processing returns HTTP 400
- **Employee-only apply:** `resolveLeaveApplySubject` resolves Admin or Employee via `hrmStaffResolver`
- Files: `leaveController.js`, `leave.js`, `leaveRepository.js`, `tests/hrm.test.js`
- Tests: `tests/hrm.test.js` **36/36**; `tests/repositories/leave.repository.test.js` passing

### HRM security hotfixes — 2026-09-25

- **PII masking:** `GET /hrm/employees/:id` masks `bankAccountNumber`, `bkashNumber`, and `nationalId` (last 4 digits visible) for callers without `manage_staff` / HR / Super Admin (`maskEmployeePii`, `actorCanViewUnmaskedEmployeePii` in `employeeController.js`)
- **Payslip IDOR:** `generatePaySlip` enforces ownership via `assertPayslipAccessAllowed` — own payslip for linked staff; any payslip only for `manage_staff` / HR / Super Admin; route accepts `view_own_payslip`
- **Self-service clock:** `POST /hrm/attendance/clock-in|clock-out` routes accept `mark_attendance_today` and `view_own_attendance` (not only `manage_staff`)
- Files: `employeeController.js`, `payrollController.js`, `adminRoutes.js`
- Tests: `tests/hrm.test.js` **36/36** passing

### Enterprise summary dashboard metrics fix — 2026-09-24

- **`countTodayStats()`:** Platform TZ day range `[start, end)` via `getPlatformDayBounds()` — fixes exact-match date misses in PG
- **`enterpriseSummaryController`:** `safeMetric()` logs stack + error codes; `collectMetric()` PG→Mongo fallback per KPI
- **Frontend:** `fetchEnterpriseSummary()` uses `window.token`, logs HTTP/partial errors; Sync Data calls enterprise summary directly
- Tests: `tests/enterpriseSummary.test.js` + updated HRM enterprise summary case — **250/250** passing

### HRM Phase 3 — Compact single-row toolbar & UI polish — 2026-09-24

- **Daily Sheet toolbar:** Merged filters + actions into `.hrm-daily-sheet-toolbar` single-row flex layout (`view-hrm-attendance.html`, `_hrm.css`)
- **Layout:** LEFT — date + department; RIGHT — Refresh, All Present/Absent, lock controls
- **Past-date banner:** Renders below main toolbar row (`.hrm-daily-sheet-toolbar__banner`) without breaking flex flow
- **Status badges:** `renderAttendanceStatusBadge()` — shared `att-pill` styling on Daily Sheet + Register tabs
- **Refresh UX:** `withButtonLoading()` — spinner + disabled state on header and Daily Sheet refresh buttons
- Tests: Jest **248/248** passing

### HRM Phase 2 — API resilience & error toast deduplication (BUG-HRM-02) — 2026-09-24

- **Shared fetch layer:** New `client/js/admin/modules/hrm-api.js` — `hrmFetchJson`, `hrmApi`, `hrmFetchBlob`, `hrmNotifyError`, `hrmHandleLoadError`, `hrmTableErrorRow`
- **25s timeout:** Handles Neon cold starts without premature failure (was 10s in attendance-only helper)
- **Toast deduplication:** Identical error messages within 300ms show one toast (parallel boot/load failures)
- **`silent: true`:** Background syncs (`loadAttendanceSettings`, `refreshTodayAttendanceStats`, staff assign candidate load) suppress error toasts
- **Module migration:** `hrm-attendance.js`, `hrm-employees.js`, `hrm-payroll.js`, `hrm-leaves.js`, `admin-staff.js` — all API calls via shared layer
- **Inline load errors:** Tables/grids show generic "Failed to load data. Please refresh." — no duplicate raw error in toast + table
- **Boot serialization:** `loadHrmAttendanceSection()` — settings → staff options → stats → daily sheet (sequential await)
- Tests: Jest **248/248** passing

### HRM Phase 1 — Data sync, tab-aware refresh, platform TZ — 2026-09-24

- **Tab-aware Refresh:** `#attendanceRefreshBtn` → `refreshActiveHrmAttendanceTab()` with loading spinner; Daily Sheet toolbar → `refreshDailySheetWithStats()`
- **Stat + dashboard sync:** `refreshTodayAttendanceStats()` on section boot; `invalidateHrmAttendanceMetrics()` after mark/bulk/manual/clock-out/modal mark
- **Platform TZ dates:** New `backend/src/utils/attendanceDate.js`; Mongo `Attendance.normalizeDate`, PG `attendanceRepository`, enterprise summary `startOfToday()`, client `hrmTodayInputValue()` aligned to `Asia/Dhaka`
- **Leave calendar:** `iteratePlatformDateKeys()` fixes calendar key drift on UTC servers
- Tests: Jest **248/248** passing

### getDailySheet super-admin exclude fix — 2026-09-23

- **Bug:** `getDailySheet()` used `legacyId: { notIn: excludeIds }`, which excluded all employees with NULL `legacyId` (SQL three-valued logic)
- **Fix:** AND clause — `(legacyId IS NULL OR legacyId NOT IN …) AND id NOT IN …`
- **Tests:** `superAdminEmployee.js` uses Prisma when Mongo disconnected; attendance repository tests pass in CI runner
- Repository tests: **177/177**

### P2 HRM self-service portal — 2026-09-23

- **Permissions:** `view_own_attendance`, `apply_own_leave`, `view_own_payslip` in `permissions.js`
- **API routes:** `GET /hrm/attendance/my`, `POST /hrm/leaves/apply-own`, `GET /hrm/leaves/my-balance`, `GET /hrm/payroll/my-payslips`
- **Resolver:** `resolveSelfServiceStaffSubject()` links Admin → Employee via `employeeRef` / `linkedAdminId`
- **Frontend:** Apply My Leave button when `apply_own_leave` without `apply_leave_for_staff`; payroll/leaves use self-service endpoints
- **Sidebar:** Self-service alt permissions unlock HRM sections for staff with own-only keys
- **Photos:** `safeEmployeePhoto()` initials fallback for broken Cloudinary URLs in employees + attendance
- Tests: Jest **231/231** passing

### HRM + Orders RBAC gap fixes (A–I) — 2026-09-23

- **A:** `applyManualEntryTabVisibility` crash — aliased to `applyAttendanceTabPermissions`; `core-boot.js` updated
- **B (HRM backend):** Attendance edit/bulk/remove/unlock, payroll generate/approve/paid, employee stats/view/edit routes accept granular keys
- **C (Orders backend):** Staff roster → `update_order_status`; courier status → `manage_couriers`; order list/status confirmed
- **D:** Roster + courier API calls gated in `fetchLiveOrders` and settings platform
- **E:** Order status dropdown gated on `update_order_status`; view-only users see badge
- **F:** `canMark` includes `mark_attendance_any_date` + `manage_staff`
- **G:** Payroll approve/paid buttons gated on `process_payroll` / `manage_payroll`
- **H:** Employee section boot + edit pencil gated on `view_employees` / `edit_employees`
- **I:** `appendCacheBust()` skips Cloudinary/CDN hosts; profile avatar uses helper
- Audit gaps **F1–F10, G1–G3** from permission audit — **resolved**
- Tests: Jest **231/231** passing

### view_orders API access + preset_only coarse keys — 2026-09-23

- **GET /api/orders:** `checkPermission('manage_orders', 'view_orders')` — Nurjahan can load order list
- **Order sub-routes:** return-requests, invoice, export gated with granular read keys; refund uses `process_refunds`; status update uses `update_order_status`
- **Permission groups:** all Sales keys consolidated under **Sales & Orders** (single modal group)
- **preset_only:** `manage_orders`, `manage_inventory`, `manage_catalog`, `manage_marketing`, `manage_support_tickets` hidden from modal toggles
- **manage_orders implications:** emptied — coarse key is preset-only, no sidebar unlock side effects
- **Frontend:** `canFetchLiveOrders()` gates refreshMap, initDashboard, sync button, realtime socket refresh
- **Sidebar:** explicit `.sidebar-sub-external[data-permission]` hide pass for Live Chat
- Files: `orderRoutes.js`, `adminRoutes.js`, `permissions.js`, `admin-staff.js`, `core-nav.js`, `core-boot.js`, `core-realtime.js`, `.cursorrules`
- Tests: Jest **231/231** passing

### POS access_pos route + implication alignment — 2026-09-24

- **Route guards:** `POST /api/admin/orders/manual` and `POST /api/admin/customers/quick` accept `access_pos` (in addition to `manage_orders` / `manage_customers`)
- **PERMISSION_IMPLICATIONS:** `access_pos` → `view_customers` (POS customer lookup)
- **Tests:** `tests/pos.test.js` — staff with `access_pos` only can checkout; Jest **266/266**

### Sales sidebar granular permission keys — 2026-09-23

- **New keys (4):** `access_pos`, `view_abandoned_carts`, `access_live_chat`, `manage_tickets` — `view_customers` / `view_reviews` unchanged (already in catalog)
- **SECTION_PERMISSIONS:** POS, abandoned carts, live chat, support tickets each map to dedicated keys (no shared `manage_orders`)
- **PERMISSION_IMPLICATIONS:** `manage_orders` bundles all Sales keys for Full Admin preset; `manage_support_tickets` → `manage_tickets` for legacy grants
- **Sidebar:** Live Chat `data-target="view-live-chat"` + `data-permission="access_live_chat"`; Sales items use granular keys
- **ROLE_PRESETS:** Order Manager, HR Manager, Inventory Manager, POS Operator updated to explicit granular lists
- **Scenario:** staff with only `view_orders` sees Sales group + Orders & Fulfillment only
- Files: `permissions.js`, `sidebar.html`, `admin-staff.js`, `.cursorrules`
- Tests: Jest **231/231** passing

### Sidebar map, boot gating, profile photo — 2026-09-22

- **SECTION_PERMISSIONS:** `view-erp-expenses` + `view-settings` → `manage_settings`; empty menu groups collapse after `[data-permission]` pass
- **Boot gates:** `initAddProductFormUI()` (suppliers/warehouses), `ensureBannerLinkOptions()` (pages), `loadExpensesSection()` early exit
- **Profile photo:** PG `getAdminWithEmployeeData` now selects `admin.image`; sidebar waits for permissions + refreshes after RBAC boot; `/me` image fallback via `getCurrentAdminProfile()`
- Files: `permissions.js`, `admin-staff.js`, `core-nav.js`, `admin-banner.js`, `erp-expenses.js`, `adminSidebar.js`, `core-boot.js`, `adminRepository.js`
- Tests: Jest **231/231** passing

### Attendance-only staff permission gating — 2026-09-22

- **Dashboard boot:** `initDashboard()` awaits `waitForAdminPermissions()` then gates WhatsApp/orders/logs/analytics/settings/catalog fetches by permission
- **HRM attendance:** `hrmLoadStaffOptions()` skipped in `loadHrmAttendanceSection()` unless `manage_staff` — Daily Sheet still loads with `view_attendance` only
- **Backend roster read:** `GET /hrm/employees` allows `view_attendance`; attendance-only callers receive trimmed fields (`_id`, `fullName`, `employeeId`, `designation`, `department`, `photo`)
- **403 UX:** `SILENT_403_PATHS` in `core-auth.js` suppresses boot-time permission toasts for staff with limited roles
- Files: `admin-staff.js`, `core-nav.js`, `core-auth.js`, `hrm-attendance.js`, `adminRoutes.js`, `employeeController.js`
- Tests: Jest **231/231** passing

### HRM Final Polish — 2026-09-22

- **Employee modal tabs:** Fixed-size tab bar (`emp-tab-btn`); active state color-only change
- **Permanent delete:** `DELETE /api/admin/hrm/employees/:id` (Super Admin) removes employee + attendance/payroll/leave + linked admin
- **Daily Sheet check-in/out:** Present marks use `officeStart` / `officeEnd` from attendance settings; local date/time combine fix
- **Flexible weekends:** `weekendDays` array (0–6) with 7-day pill picker in Shifts settings
- **Daily Sheet pagination:** `?page=&limit=` on daily-sheet API + `dailySheetPaginationContainer`
- Files: `view-hrm-employees.html`, `hrm-employees.js`, `_hrm.css`, `view-hrm-attendance.html`, `hrm-attendance.js`, `employeeController.js`, `attendanceController.js`, `attendanceRepository.js`, `attendanceSettingsService.js`, `adminRoutes.js`, `tests/hrm.test.js`
- Tests: Jest **228/228** passing

### Staff UI Polish — 2026-09-21

- Staff Directory: search padding fix, permission card grid, icon action buttons with tooltips
- Files: `view-staff.html`, `_staff.css`, `admin-staff.js`
- Tests: Jest **228/228** passing

### Staff Access Final Fix — 2026-09-21

- Assign modal search box icon/clear-button UX; full modal reset on open; permission items render in `#permissionsGrid`
- Revoke deletes admin + clears dual-store employee links; `POST /api/admin/staff/cleanup-orphans` fixes stale `linkedAdminId` orphans
- Files: `admin-staff.js`, `view-staff.html`, `_staff.css`, `staffController.js`, `staffRoutes.js`
- Tests: Jest **228/228** passing

### Assign Access Fix — 2026-09-21

- Employee assign dropdown: resilient fetch with `assignable=true`, fallback to all employees + client filter
- Username empty on modal open; permissions force-reload with visible toggle rows
- Files: `admin-staff.js`, `view-staff.html`, `_staff.css`, `hrmReadService.js`, `employeeController.js`
- Tests: Jest **228/228** passing

### Access Tab Removed + Staff Directory Final — 2026-09-21

- **Employee modal:** Access tab button + panel + all access JS removed permanently; exactly 5 profile tabs remain
- **Assign System Access modal:** 3-step layout (Select Employee → Credentials → Permissions); debounced search with `?hasAccess=false&all=true`; avatar + name + EMP-ID + dept dropdown; first-name username auto-fill; password show/hide + match validation; `.perm-toggle` switches; group Select all; quick presets
- **Staff Directory row actions:** Edit Permissions (PUT), Suspend/Activate (PATCH status), Revoke (DELETE access) with confirm dialog
- Files: `view-hrm-employees.html`, `hrm-employees.js`, `view-staff.html`, `admin-staff.js`, `_staff.css`
- Tests: Jest **228/228** passing

### HRM Access Final Redesign — 2026-09-21

- **Separated flows:** Employee modal Access tab = permissions only (no Grant/Revoke); Staff Directory = login creation via Assign New Access modal
- **Access tab Case A (no account):** "No System Account" message + Go to Staff Directory button + read-only permission preview toggles
- **Access tab Case B (has account):** Username, status, Last Login, grouped permission toggles, Save Permissions (`PUT /api/admin/staff/:id/permissions`), Suspend/Activate
- **Access tab Case C (Super Admin):** Access tab removed from DOM via `removeEmployeeAccessTab()`; restored for other employees via `restoreEmployeeAccessTab()`
- **Auth fix:** `authHeaders()` in `hrm-employees.js` and `admin-staff.js` — Bearer token from `localStorage.adminToken` on all `/api/admin/*` fetch calls
- **409 handling:** Assign modal shows info toast, closes modal, refreshes staff list when employee already has access
- **Active Admins count:** `listStaff` returns `{ staff, total, activeCount }`; `fetchStaffAccounts` updates stat card after grant/suspend/revoke
- **Removed:** `#quickGrantModal`, `#manageAccessModal`, quick-grant JS from Employees page
- Files: `view-hrm-employees.html`, `hrm-employees.js`, `admin-staff.js`, `view-staff.html`, `employeeController.js`, `staffController.js`, `_hrm.css`
- Tests: Jest **228/228** passing

### HRM Access Fix Round 2 — 2026-09-21

- **Quick Grant Access modal:** `#quickGrantModal` on Employees page; `openQuickGrantModal(employeeId, name, empCode)`; username from EMP-ID or name; 25-permission grid + presets; POST grant-access; toast + Access tab refresh
- **Super Admin Access tab:** `GET /api/admin/hrm/employees/:id/access-info` returns `isSuperAdmin`; Access tab hidden for linked super-admin employees; 👑 notice if rendered
- **Sidebar labels moved to Settings:** Removed ✏️ pencil from sidebar; **Customize Menu Labels** in Settings → Security (Super Admin); `DELETE /api/admin/sidebar-labels` reset
- **Compact HRM layout:** Reduced header, stats, filter bar, table, and modal section spacing in `_hrm.css` / `_layout.css`
- Files: `view-hrm-employees.html`, `hrm-employees.js`, `employeeController.js`, `adminRoutes.js`, `sidebarLabels.js`, `settings-menu-labels.js`, `view-settings.html`, `sidebarLabelController.js`, `sidebarLabelRepository.js`, `_hrm.css`, `_layout.css`
- Tests: Jest **228/228** passing

### HRM Modal Fix + Access Tab + Sidebar Labels — 2026-09-21

- **Modal viewport overflow fixed:** `.admin-modal-overlay` / `.admin-modal` pattern — `max-height: calc(100vh - 2rem)`, scrollable body, fixed header/footer; applied to staff assign/edit modals and all HRM modals
- **Assign System Access flow:** employee dropdown from `GET /hrm/employees?hasAccess=false`; 25 permissions from `GET /api/admin/permissions`; presets; Link Account with loading/409 handling
- **Employee Access tab:** no-access empty state + Grant button (pre-fills employee); linked state shows username, role, status, grouped permissions, Suspend/Activate/Revoke
- **Sidebar labels (Super Admin):** `SidebarLabel` Prisma model; `GET/PUT /api/admin/sidebar-labels/:key`; inline ✏️ edit on hover
- Files: `_modals.css`, `_hrm.css`, `_layout.css`, `view-staff.html`, `view-hrm-employees.html`, `admin-staff.js`, `hrm-employees.js`, `sidebarLabels.js`, `sidebarLabelRepository.js`, `sidebarLabelController.js`, `adminRoutes.js`
- Tests: Jest **228/228** passing

### Fix Group B — Pagination + Staff Directory — 2026-09-21

- HRM list sections use Orders-style `AdminPagination` (employees, attendance register, leave, payroll)
- System Staff Directory rebuilt in `view-staff.html` + `admin-staff.js` with Assign modal and row actions
- Tests: Jest **228/228** passing

### Critical Fix Group A refinements — 2026-09-21

- **Fix 4:** Explicit PG `linkedAdminId` sync (`[GRANT-ACCESS-PG-SYNC]` log); HTTP 409 duplicate grant; frontend refreshes Staff Directory and assign dropdown on already-granted
- **Fix 5:** Grant modal groups permissions dynamically from `/api/admin/permissions` (Insights, Operations, Administration, Attendance, HRM, Inventory, Orders)
- Files: `employeeController.js`, `hrm-employees.js`, `admin-staff.js`, `hrm.test.js`
- Tests: Jest **228/228** passing

### Critical Fixes 1–5 — 2026-09-21

- Clock-out employee resolution; PG-safe settings reads; grant-access reconcile + 25-key modal; Nginx WebSocket runbook
- Files: `attendanceController.js`, `hrmStaffResolver.js`, `settingsReadService.js`, `gatewayStatusService.js`, `attendanceSettingsService.js`, `whatsappService.js`, `employeeController.js`, `hrmReadService.js`, `hrm-attendance.js`, `hrm-employees.js`, `view-hrm-employees.html`, `devops/NGINX_WEBSOCKET_FIX.md`
- Tests: Jest **228/228** passing

### Deep Production Audit — 2026-09-21

- Read-only production audit; no code fixes
- Documented: clock-out employee resolver bug, settings 500, grant-access drift, pagination gaps, 8 console errors
- Full register: `docs/audit/PRODUCTION_ISSUES_AUDIT.md`
- Status: ✅ COMPLETE → ⚠️ PARTIAL

### Group 3 — Payroll calculate from attendance — 2026-09-20

- `calculatePayrollFromAttendance()` — earned salary, late deductions, net preview
- `GET /api/admin/hrm/payroll/calculate`; payroll modal **Calculate from Attendance** + breakdown confirm
- Payroll model stores `attendanceRecordIds`, `earnedSalary`, `attendanceDeductions`
- Tests: Jest **228/228** passing

### High Priority Features Group 2 — 2026-09-20

- **Attendance Settings:** `attendanceSettingsService.js`, Settings model field, Shifts tab UI, Daily Sheet integration
- **Granular permissions:** 15 new keys in `permissions.js`; manual entry uses `manual_attendance`; lock uses `lock_attendance_dates`
- Files: `attendanceSettingsService.js`, `settingsController.js`, `permissions.js`, `hrm-attendance.js`, `view-hrm-attendance.html`, `_hrm.css`, `attendanceController.js`, `admin-staff.js`
- Tests: Jest **228/228** passing

### Critical Bug Fix Group 1 — 2026-09-20

- **Register tab fix:** `hrmSetupTabs` now calls `loadAttendanceList()` for `hrm-tab-register`; pagination (50/page) with prev/next controls
- **Fetch safety:** `hrmFetchJson()` helper — `res.ok` check, 10s timeout, error toast + non-infinite loading states
- **Clock UI:** Daily Sheet "Set Now" on check-in/out fields; Register "Clock Out Now" button wired to `clock-out` API
- **Backend:** `parsePagination` default limit 50 in `attendanceController.js`
- Files: `hrm-attendance.js`, `view-hrm-attendance.html`, `_hrm.css`, `attendanceController.js`
- Tests: Jest **228/228** passing

### 2026-09-20 — Attendance edit controls + save feedback

- **Manual Entry restricted:** `POST /manual-entry` requires HR or Super Admin (`requireHrOrSuperAdmin`); tab hidden for other roles via `window.adminRole`
- **Daily Sheet inline edit:** ✏️ expands check-in/out/note row; `PUT /attendance/update`, `DELETE /attendance/remove` (HR/Super Admin for remove); lock guard HTTP 423
- **Save feedback:** per-row spinner + ✓ Saved / ✗ Failed on Daily Sheet; employee Save button Saving…/✓ Saved!; `showHrmToast` for bulk/manual/lock
- Files: `rbac.js`, `attendanceController.js`, `attendanceRepository.js`, `adminRoutes.js`, `hrm-attendance.js`, `hrm-employees.js`, `core-boot.js`, `view-hrm-attendance.html`, `_hrm.css`
- Tests: Jest **228/228** passing

### 2026-09-20 — Bug Fix: Sidebar sync + date restriction

- **BUG 1 fixed:** `buildAdminEmployeeProfileShape` prefers linked employee `fullName`; PG `getAdminWithEmployeeData` falls back via Mongo `employeeRef`; `syncLinkedAdminName` on employee update; sidebar refresh after every employee save
- **BUG 2 fixed:** Staff limited to today-only attendance marks (HTTP 403); Super Admin / `hr` role bypass; manual entry exempt; Daily Sheet view-only UI for past dates
- Files: `adminRepository.js`, `employeeController.js`, `attendanceController.js`, `hrm-employees.js`, `hrm-attendance.js`, `view-hrm-attendance.html`, `admin.repository.test.js`
- Tests: Jest **228/228** passing

### 2026-09-20 — Full HRM Audit

- Scanned all HRM backend models, controllers, repositories, frontend partials/JS/CSS, and admin–employee link stack
- **BUG 1 confirmed:** Sidebar name does not reflect Employee `fullName`; PG read misses `employeeRef`-only links; employee name updates do not sync to Admin
- **BUG 2 confirmed:** No staff past-date restriction in `attendanceController.js` or Daily Sheet / clock-in UI
- Updated File Inventory with per-file ✅/⚠️ status; Feature Checklist 24/26 complete
- Status changed from ✅ COMPLETE → ⚠️ PARTIAL until bugs are fixed

## Daily Sheet status dropdown contrast — 2026-09-22

**What was wrong:** `.att-split-menu` (Daily Sheet chevron status picker) used dark slate background `#0f172a` with `color: inherit` on buttons — menu text inherited dark table body color, making Late/Absent/Leave options invisible.

**What was fixed:** Light dropdown panel (`#ffffff` bg, `#1a1a1a` text), explicit item colors, blue hover (`#f0f4ff` / `#1d4ed8`), `z-index: 1000`.

**File changed:** `client/css/admin/_hrm.css`

## HRM staff roster + employee field sync — 2026-09-22

**What was wrong**
- `GET /api/admin/hrm/staff` returned every active Admin login account (except superadmin), so Apply Leave showed duplicates (e.g. Nurjahan as admin + employee).
- Personal fields and references saved to Mongo but appeared blank after refresh when `READ_PG_EMPLOYEE=true` — PostgreSQL mirror omitted `gender`, `bloodGroup`, `maritalStatus`, and `references[]`.

**What was fixed**
- `getStaffRoster`: HRM path (`/hrm/staff`) returns `[]`; order-assignment path (`/staff/roster`) queries `role: 'staff'` only (excludes superadmin).
- `mapMongoEmployeeToPostgresWrite` + `employeeRepository.update()` now sync all personal/identity fields.
- New `syncReferences()` replaces PG `EmployeeReference` rows on each save.
- Debug logs: `[EMP-UPDATE]` on backend, `[HRM-SAVE]` references on frontend.

**Files changed:** `staffController.js`, `employeeController.js`, `hrmDualWriteHelpers.js`, `employeeRepository.js`, `hrm-employees.js`

## Staff search type-to-filter — 2026-09-22

- **`createSearchableSelect`:** Dropdown hidden until user types; empty query shows no list; "No results found" when filter yields nothing
- **HRM modals wired:** Apply Leave, Mark Attendance, Generate Payroll, Salary Config use `hrmMountStaffSearchSelect`
- **Staff Assign modal:** Already type-to-filter; unified empty-state copy

## HRM FINAL — 2026-09-22 ✅

- **Two-stage delete:** Soft deactivate (`PATCH /hrm/employees/:id/deactivate` sets `isDeleted`, `deletedAt`, `status: terminated`) + permanent delete (`DELETE /hrm/employees/:id/permanent` requires `ADMIN_DELETE_PASSWORD` in `.env`)
- **More tab:** 6th profile modal tab — Terminate, Deactivate, Permanent Delete (danger zone removed from Edit modal)
- **SweetAlert2 z-index:** `.swal-on-top` + `swalOnTop()` helper; CSS `z-index: 99999` on `.swal2-container`
- **Super Admin guard:** Terminate button disabled in table + More tab; `adminRole` enriched on employee list API
- **Employee model:** `isDeleted`, `deletedAt` fields; list queries filter `{ isDeleted: { $ne: true } }`
- **Header UX:** Add Employee button first (blue primary); Export/Refresh/Designations grey outline
- **Tests:** Jest **231/231** passing (deactivate + password permanent delete)

## HRM System — COMPLETE ✅ — 2026-09-22

- **Employees:** Compact page header; tabbed add/edit modal with fixed panel height; danger-zone delete (Super Admin only, Swal confirm); Super Admin linked employee never deletable
- **Attendance:** Daily sheet with pagination, office-time Present marks, flexible weekend days, inline action toolbar; Super Admin excluded from daily sheet
- **Leave:** Searchable Apply Leave staff picker; Super Admin excluded from staff roster dropdowns
- **Payroll:** Generate from attendance, approve/paid workflow, PDF pay slip
- **Designations:** Full CRUD manager
- **Access:** Staff Directory assign/revoke; employee `access-info` API; Super Admin employee protected on backend + frontend
- **Tests:** Jest **229/229** passing (includes Super Admin delete guard)

### HRM Complete — SweetAlert + Polish — 2026-09-22

- **Delete moved to modal:** Permanent delete removed from table row; Super Admin **Danger Zone** in Edit Employee modal with SweetAlert2 confirmation + loading/success states
- **SweetAlert2 standard:** HRM JS modules (`hrm-employees.js`, `hrm-attendance.js`, `hrm-payroll.js`, `hrm-leaves.js`) document Swal-only confirms; bulk Mark All Present/Absent and lock/unlock date use Swal
- **Daily Sheet toolbar:** Refresh / Mark All / lock controls in single inline `.daily-sheet-actions` row
- **Console ERR_NAME_NOT_RESOLVED guard:** `adminIsLiveServer()` skips notification/WhatsApp polling and socket init when not on http(s); socket.io uses `path: '/socket.io'`
- Files: `view-hrm-employees.html`, `view-hrm-attendance.html`, `_hrm.css`, `hrm-employees.js`, `hrm-attendance.js`, `hrm-payroll.js`, `hrm-leaves.js`, `core-state.js`, `core-realtime.js`, `notifications.js`, `orders-actions.js`
- Tests: Jest **228/228** passing

### Attendance System Upgrade — 2026-09-20

- Added **Daily Sheet** tab (default): merged employee roster + attendance for a date; auto-save per-row status; Mark All Present/Absent
- Added **AttendanceLock** model (Mongo + Prisma) with lock/unlock/status APIs; locked dates return HTTP 423 on mark/clock/bulk/manual (unless Super Admin override)
- Added **Manual Entry** tab: form + last-30 table; `isManualEntry`, `modifiedBy`, `modifiedAt` on attendance rows
- New APIs: `GET /daily-sheet`, `POST /bulk-mark`, `POST /manual-entry`, `GET /manual-entries`, lock CRUD under `/attendance/lock*`
- Repository tests: `getDailySheet`, `bulkMarkAttendance`, `lockDate`/`isDateLocked`; Jest 228/228 passing

### Admin-Employee Profile Link — 2026-09-20

- Super Admin can link own admin account to an active Employee via `PUT /api/admin/profile/link-employee`
- Employee photo changes propagate to admin sidebar; admin display name/photo sync back to linked employee (photo only on employee upload path)
- `employeeController.uploadEmployeePhoto` returns `photoUpdated: true` and syncs linked admin image

### Frontend tab + action permission gating — 2026-09-23

- **sidebar.html:** `data-permission` on all 31 sidebar nav items
- **view-hrm-attendance.html:** Per-tab + action button `data-permission` (Daily Sheet, Register, Shifts, Late Report, Manual Entry; Mark/Lock/Bulk)
- **hrm-attendance.js:** `applyAttendanceTabPermissions()`, scoped `applyPermissionGating()`; role-based manual entry removed in favour of `manual_attendance` key
- **hrm-leaves.js / hrm-payroll.js:** Apply Leave + approve/reject + Generate Payroll gated after `waitForAdminPermissions()`
- **admin-staff.js:** `hasPermission()` resolves `permissionImplications` from API; empty menu groups auto-hide
- **permissions.js:** `view_attendance` implies `view_daily_sheet`, `view_attendance_register`, `view_late_report`
- **Tests:** Jest **231/231** passing

### Granular RBAC permission expansion — 2026-09-23

- **permissions.js:** Added 22 granular keys (Attendance tabs, HRM payroll/leave, Operations, Inventory, Marketing, Accounts); total catalog **47** keys
- **SECTION_PERMISSIONS:** Every sidebar `data-target` mapped to its own key (32 sidebar entries + legacy section keys)
- **PERMISSION_IMPLICATIONS:** Coarse keys (`manage_staff`, `manage_orders`, `manage_inventory`, `manage_marketing`, `manage_settings`) imply new children for backward compatibility
- **adminRoutes.js:** HRM attendance + leave + payroll routes use specific `checkPermission()` keys first (e.g. `view_daily_sheet`, `view_attendance_register`, `view_shifts`, `view_late_report`, `view_payroll`, `view_leave_requests`, `approve_leave`, `apply_leave_for_staff`)
- **.cursorrules:** Added Permission System Rules section
- **Tests:** Jest **231/231** passing

### Audit system initialized — codebase scan — 2026-09-20

- Inventoried 30+ HRM files across routes, controllers, models, repos, UI
- Initial status: ✅ COMPLETE (superseded by Full HRM Audit above)
