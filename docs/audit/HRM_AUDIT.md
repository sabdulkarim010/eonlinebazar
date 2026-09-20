# HRM AUDIT — EonlineBazar

**Last updated:** 2026-09-20  
**Scope:** HR module — employees, designations, attendance, shifts, payroll, leave; `/api/admin/hrm/*`  
**Status:** ✅ COMPLETE

---

## File Inventory

| Path | Role |
|------|------|
| `backend/src/routes/adminRoutes.js` | All `/hrm/*` routes (lines ~550–615) |
| `backend/src/controllers/admin/employeeController.js` | Employee CRUD, profile, access grant/revoke |
| `backend/src/controllers/admin/designationController.js` | Job title catalog |
| `backend/src/controllers/admin/attendanceController.js` | Attendance, shifts, clock-in/out |
| `backend/src/controllers/admin/payrollController.js` | Payroll generate/approve/paid, payslip PDF |
| `backend/src/controllers/admin/leaveController.js` | Leave apply/approve/reject, balance, calendar |
| `backend/src/models/employee.js` | Non-login staff record |
| `backend/src/models/designation.js` | Designation catalog |
| `backend/src/models/attendance.js` | One row per staff per day |
| `backend/src/models/shift.js` | Named shifts + default |
| `backend/src/models/payroll.js` | Monthly payroll runs |
| `backend/src/models/leave.js` | Leave applications |
| `backend/src/repositories/employeeRepository.js` | PG employee dual-write/read |
| `backend/src/repositories/designationRepository.js` | PG designation |
| `backend/src/repositories/attendanceRepository.js` | PG attendance |
| `backend/src/repositories/shiftRepository.js` | PG shifts |
| `backend/src/repositories/payrollRepository.js` | PG payroll |
| `backend/src/repositories/leaveRepository.js` | PG leave |
| `tests/repositories/employee.repository.test.js` | Employee repo tests |
| `tests/repositories/attendance.repository.test.js` | Attendance repo tests |
| `tests/repositories/payroll.repository.test.js` | Payroll repo tests |
| `tests/repositories/leave.repository.test.js` | Leave repo tests |
| `tests/repositories/designation.repository.test.js` | Designation repo tests |
| `tests/repositories/shiftRepository.test.js` | Shift repo tests |
| `client/admin/partials/view-hrm-employees.html` | Employee roster + profile modal |
| `client/admin/partials/view-hrm-attendance.html` | Attendance + shifts tabs |
| `client/admin/partials/view-hrm-payroll.html` | Payroll runs |
| `client/admin/partials/view-hrm-leaves.html` | Leave management |
| `client/js/admin/modules/hrm-employees.js` | Employee UI + access tab |
| `client/js/admin/modules/hrm-attendance.js` | Attendance UI |
| `client/js/admin/modules/hrm-payroll.js` | Payroll UI |
| `client/js/admin/modules/hrm-leaves.js` | Leave UI |
| `backend/src/utils/paySlipPdf.js` | PDFKit pay slip generator |

---

## Feature Checklist

- [x] Employee CRUD + auto `EMP-001` IDs — `employeeController.js`
- [x] Employee profile modal (attendance/payroll/leave tabs) — `getEmployeeProfile`
- [x] Cloudinary photo + document uploads — `uploadEmployeePhoto`, `uploadEmployeeDocument`
- [x] Designation catalog CRUD — `designationController.js`
- [x] Attendance register (one row/staff/day) — `attendanceController.js`
- [x] Clock-in / clock-out with optional GPS — `clockIn`, `clockOut`
- [x] Shift roster + late detection — shift CRUD in `attendanceController.js`
- [x] Attendance summary + late report — `getAttendanceSummary`, `getLateReport`
- [x] Payroll generation from attendance — `generatePayroll`
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

---

## Known Issues / Gaps

| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| — | — | — | Phase 5 HRM complete as of 2026-09-11; no open gaps |

---

## Dependencies & Integrations

- **Permission:** All routes require `verifyAdmin` + `checkPermission('manage_staff')`
- **Payroll formula:** `baseSalary × min(presentDays/workingDays, 1) + overtime + bonus − deductions`
- **Linked model:** `Admin.baseSalary`, `employee.linkedAdminId` for system access
- **Related audits:** `ADMIN_PANEL_AUDIT.md`, `AUTH_SECURITY_AUDIT.md`, `PAYMENTS_FINANCE_AUDIT.md`

---

## Change Log

### Audit system initialized — codebase scan — 2026-09-20

- Inventoried 30+ HRM files across routes, controllers, models, repos, UI
- Status: ✅ COMPLETE
