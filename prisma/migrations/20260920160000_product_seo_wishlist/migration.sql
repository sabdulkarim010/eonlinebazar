-- Product SEO fields + wishlist notification tracking columns
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "seoTitle" TEXT NOT NULL DEFAULT '';
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "seoDescription" TEXT NOT NULL DEFAULT '';
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "seoKeywords" TEXT NOT NULL DEFAULT '';
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "previousPrice" DECIMAL(12,2);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "restockedAt" TIMESTAMP(3);
