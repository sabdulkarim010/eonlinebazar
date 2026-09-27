-- Settings optimistic revision counter (Phase 2 System Settings)
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "revisionId" INTEGER NOT NULL DEFAULT 0;
