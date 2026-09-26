-- Enforce one attendance row per staff member per calendar day (matches Mongo unique index).
DELETE FROM "attendance" AS a
USING "attendance" AS b
WHERE a."staffId" = b."staffId"
  AND a."date" = b."date"
  AND a."id" > b."id";

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_staffId_date_key" ON "attendance"("staffId", "date");
