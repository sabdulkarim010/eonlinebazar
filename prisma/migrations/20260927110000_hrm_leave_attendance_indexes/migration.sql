-- HRM Leave & Attendance lookup indexes (idempotent — safe to re-run)

CREATE INDEX IF NOT EXISTS "leaves_staffId_status_startDate_endDate_idx"
  ON "leaves"("staffId", "status", "startDate", "endDate");

CREATE INDEX IF NOT EXISTS "leaves_staffId_leaveType_status_startDate_idx"
  ON "leaves"("staffId", "leaveType", "status", "startDate");

CREATE INDEX IF NOT EXISTS "leaves_status_createdAt_idx"
  ON "leaves"("status", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "leaves_createdAt_idx"
  ON "leaves"("createdAt" DESC);

CREATE INDEX IF NOT EXISTS "attendance_staffId_date_idx"
  ON "attendance"("staffId", "date");

CREATE INDEX IF NOT EXISTS "attendance_staffId_status_date_idx"
  ON "attendance"("staffId", "status", "date");

CREATE INDEX IF NOT EXISTS "attendance_createdAt_idx"
  ON "attendance"("createdAt" DESC);
