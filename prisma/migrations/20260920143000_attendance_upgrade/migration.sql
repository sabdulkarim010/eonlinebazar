-- Attendance system upgrade: leave status, manual-entry audit fields, date locks

ALTER TYPE "AttendanceStatus" ADD VALUE IF NOT EXISTS 'leave';

ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "modifiedBy" TEXT NOT NULL DEFAULT '';
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "modifiedAt" TIMESTAMP(3);
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "isManualEntry" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "attendance_isManualEntry_modifiedAt_idx"
  ON "attendance"("isManualEntry", "modifiedAt");

CREATE TABLE IF NOT EXISTS "attendance_locks" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "date" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedBy" TEXT NOT NULL DEFAULT '',
    "lockedByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_locks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_locks_legacyId_key" ON "attendance_locks"("legacyId");
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_locks_date_key" ON "attendance_locks"("date");
