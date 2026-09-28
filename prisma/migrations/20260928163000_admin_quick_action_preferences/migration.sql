-- Admin dashboard quick action pins (Mongo quickActionPreferences dual-write)
ALTER TABLE "admins"
ADD COLUMN IF NOT EXISTS "quickActionPreferences" TEXT[] NOT NULL DEFAULT ARRAY['create-order', 'add-product', 'process-payout', 'toggle-maintenance']::TEXT[];
