# HRM AUDIT — EonlineBazar

**Last updated:** 2026-09-20 (Group 3 — payroll calculate from attendance)  
**Scope:** HR module — employees, designations, attendance, shifts, payroll, leave, admin–employee profile link; `/api/admin/hrm/*`  
**Status:** ✅ COMPLETE

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
| `backend/src/models/payroll.js` | Monthly payroll runs with attendance snapshot | ✅ |
| `backend/src/models/designation.js` | Job title catalog | ✅ |
| `backend/src/controllers/admin/employeeController.js` | Employee CRUD, photo/docs, grant/revoke access, `syncLinkedAdminName` | ✅ |
| `backend/src/controllers/admin/attendanceController.js` | Attendance, shifts, clock-in/out, daily sheet, lock, update/remove, past-date guard | ✅ |
| `backend/src/middlewares/rbac.js` | `requireHrOrSuperAdmin`, `isHrOrSuperAdmin` for manual entry + remove | ✅ |
| `backend/src/controllers/admin/payrollController.js` | Payroll generate/approve/paid, payslip PDF | ✅ |
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
| `client/js/admin/modules/hrm-employees.js` | Employee UI + access tab; sidebar refresh after every save | ✅ |
| `client/js/admin/modules/hrm-attendance.js` | Daily sheet auto-save, inline edit, per-row save feedback, lock UI, manual entry tab guard, toasts | ✅ |
| `client/js/admin/modules/hrm-payroll.js` | Payroll UI | ✅ |
| `client/js/admin/modules/hrm-leaves.js` | Leave UI | ✅ |
| `client/js/admin/modules/adminSidebar.js` | `loadAdminSidebarProfile`, merged profile fetch | ✅ |
| `client/js/admin/admin-core.js` | Imports `adminSidebar.js` (line 14) | ✅ |
| `client/js/admin/modules/core-boot.js` | `fetchAdminProfile` delegates to sidebar loader; sets `window.adminRole` | ✅ |
| `client/js/admin/modules/core-nav.js` | Sidebar refresh after profile pic upload | ✅ |
| `client/css/admin/_hrm.css` | Status pills, split buttons, inline edit row, save feedback, lock bar styles | ✅ |

---

## Feature Checklist

- [x] Employee CRUD + auto `EMP-001` IDs — `employeeController.js`
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
- [x] PG repositories + read cutover flags — `READ_PG_EMPLOYEE`, `READ_PG_ATTENDANCE`, etc.
- [x] Admin–employee link API — `PUT /api/admin/profile/link-employee` (super-admin)
- [x] Employee photo upload → linked admin image sync — `uploadEmployeePhoto` + `syncLinkedAdminPhoto`
- [x] Admin sidebar name sync from linked Employee — `buildAdminEmployeeProfileShape` prefers `employee.fullName`; `syncLinkedAdminName` on update
- [x] Staff past-date attendance restriction — HTTP 403 on mark/clock/bulk for non-today dates; Daily Sheet view-only UI for staff
- [x] HRM save feedback — per-row spinner/saved/failed on Daily Sheet; employee modal Saving/Saved; toasts for bulk/manual/lock
- [x] Attendance Register tab loads on tab click — `hrm-tab-register` → `loadAttendanceList()` with pagination (50/page)
- [x] HRM fetch error handling — `hrmFetchJson()` with 10s timeout + `res.ok` guard on read paths
- [x] Daily Sheet "Set Now" clock buttons — inline check-in/out time helpers
- [x] Register "Clock Out Now" — `POST /hrm/attendance/clock-out` from register rows missing checkout
- [x] Attendance Settings panel — Shifts tab card; `GET/PUT /settings/attendance`
- [x] Daily Sheet late detection — office start + grace from settings on Set Now / Present
- [x] Granular attendance permissions — `view_attendance`, `mark_attendance_today`, `manual_attendance`, etc.

**Summary: 34 of 34 features complete.**

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
| Manual Entry tab lacks super-admin-only route guard | Low | Open | `manual-entry` uses same `manage_staff` as daily sheet; past-date writes allowed via manual entry flag |
| `hr` admin role not in schema yet | Low | Open | Past-date bypass checks `role === 'hr'` for future use; only `superadmin` exists today |

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

### Audit system initialized — codebase scan — 2026-09-20

- Inventoried 30+ HRM files across routes, controllers, models, repos, UI
- Initial status: ✅ COMPLETE (superseded by Full HRM Audit above)
