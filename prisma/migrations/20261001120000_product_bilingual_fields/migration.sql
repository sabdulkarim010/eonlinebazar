-- Product bilingual storefront fields (English primary + optional Bangla)
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "name_bn" TEXT NOT NULL DEFAULT '';
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "description_bn" TEXT NOT NULL DEFAULT '';
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "detailed_description_bn" TEXT NOT NULL DEFAULT '';
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "highlights_bn" TEXT[] DEFAULT ARRAY[]::TEXT[];
