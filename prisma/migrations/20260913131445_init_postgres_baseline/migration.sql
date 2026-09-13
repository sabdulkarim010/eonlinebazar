-- CreateEnum
CREATE TYPE "UserGender" AS ENUM ('Male', 'Female', 'Other');

-- CreateEnum
CREATE TYPE "UserAccountStatus" AS ENUM ('active', 'suspended', 'blocked');

-- CreateEnum
CREATE TYPE "ProfileUpdateType" AS ENUM ('email', 'mobile');

-- CreateEnum
CREATE TYPE "LoyaltyTier" AS ENUM ('none', 'silver', 'gold', 'platinum');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('superadmin', 'staff');

-- CreateEnum
CREATE TYPE "AdminAccountStatus" AS ENUM ('active', 'blocked');

-- CreateEnum
CREATE TYPE "TwoFactorMethod" AS ENUM ('email', 'totp', 'sms');

-- CreateEnum
CREATE TYPE "AdminSessionStatus" AS ENUM ('active', 'revoked');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('active', 'inactive', 'terminated');

-- CreateEnum
CREATE TYPE "EmployeeType" AS ENUM ('permanent', 'contractual', 'part-time', 'intern');

-- CreateEnum
CREATE TYPE "SalaryType" AS ENUM ('monthly', 'daily', 'hourly');

-- CreateEnum
CREATE TYPE "EmployeeGender" AS ENUM ('male', 'female', 'other');

-- CreateEnum
CREATE TYPE "BloodGroup" AS ENUM ('A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-');

-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('single', 'married', 'divorced', 'widowed');

-- CreateEnum
CREATE TYPE "StaffType" AS ENUM ('admin', 'employee');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('present', 'absent', 'late', 'half-day', 'holiday');

-- CreateEnum
CREATE TYPE "AttendanceShiftType" AS ENUM ('morning', 'evening', 'night', 'custom');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('draft', 'approved', 'paid');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('casual', 'sick', 'annual', 'unpaid');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "ActiveStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('draft', 'sent', 'partial', 'received', 'cancelled');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('Pending', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled', 'Return Requested', 'Returned', 'Refund Pending', 'Refunded');

-- CreateEnum
CREATE TYPE "ShippingLocationType" AS ENUM ('Inside City', 'Outside City');

-- CreateEnum
CREATE TYPE "DeliveryLocationType" AS ENUM ('inside', 'outside');

-- CreateEnum
CREATE TYPE "CancelledBy" AS ENUM ('Customer', 'Admin');

-- CreateEnum
CREATE TYPE "RefundMethod" AS ENUM ('wallet', 'bkash', 'nagad', 'original_payment', 'cash');

-- CreateEnum
CREATE TYPE "ReturnItemStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('online', 'manual');

-- CreateEnum
CREATE TYPE "PaymentMethodType" AS ENUM ('manual', 'automated');

-- CreateEnum
CREATE TYPE "FeeType" AS ENUM ('flat', 'percentage');

-- CreateEnum
CREATE TYPE "OrderPaymentStatus" AS ENUM ('unpaid', 'pending', 'paid', 'failed', 'cancelled', 'refunded');

-- CreateEnum
CREATE TYPE "PaymentProofStatus" AS ENUM ('none', 'submitted', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "GatewayProvider" AS ENUM ('sslcommerz', 'aamarpay', 'shurjopay', 'stripe', 'custom');

-- CreateEnum
CREATE TYPE "CouponDiscountType" AS ENUM ('percentage', 'flat');

-- CreateEnum
CREATE TYPE "CouponStatus" AS ENUM ('ACTIVE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "NoteType" AS ENUM ('note', 'general', 'expense', 'income', 'shopping');

-- CreateEnum
CREATE TYPE "NoteCategory" AS ENUM ('food', 'transport', 'shopping', 'bill', 'health', 'education', 'other');

-- CreateEnum
CREATE TYPE "SecurityActorType" AS ENUM ('admin', 'customer', 'system');

-- CreateEnum
CREATE TYPE "SecurityResourceType" AS ENUM ('product', 'order', 'customer', 'staff', 'setting', 'coupon', 'banner', 'category', 'review', 'supplier', 'warehouse', 'purchase_order', 'expense', 'expense_category', 'attendance', 'shift', 'payroll', 'leave', 'employee', 'designation');

-- CreateEnum
CREATE TYPE "LoginAttemptStatus" AS ENUM ('success', 'failed', 'otp_sent', 'otp_failed', 'blocked');

-- CreateEnum
CREATE TYPE "BlacklistSource" AS ENUM ('auto', 'manual');

-- CreateEnum
CREATE TYPE "StockAlertItemKind" AS ENUM ('low_stock', 'out_of_stock');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('open', 'in_progress', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "NewsletterSource" AS ENUM ('footer_form', 'checkout', 'popup', 'manual');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'scheduled', 'sending', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "CampaignSegment" AS ENUM ('all', 'vip', 'frequent', 'inactive', 'new');

-- CreateEnum
CREATE TYPE "CampaignChannel" AS ENUM ('email', 'sms', 'whatsapp');

-- CreateEnum
CREATE TYPE "ContentFormat" AS ENUM ('markdown', 'html');

-- CreateEnum
CREATE TYPE "LinkTarget" AS ENUM ('_self', '_blank');

-- CreateEnum
CREATE TYPE "BannerTransition" AS ENUM ('slide', 'fade');

-- CreateEnum
CREATE TYPE "AdminNotificationType" AS ENUM ('order', 'stock', 'leave', 'payroll', 'security', 'system');

-- CreateEnum
CREATE TYPE "SmsGatewayProvider" AS ENUM ('Greenweb BD', 'BulkSMS BD', 'AlphaSMS', 'Generic API');

-- CreateEnum
CREATE TYPE "WhatsAppAlertProvider" AS ENUM ('CallMeBot', 'UltraMsg', 'Green API', 'Generic');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "gender" "UserGender",
    "dateOfBirth" TIMESTAMP(3),
    "mobile" TEXT,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "googleId" TEXT,
    "avatarUrl" TEXT,
    "lastLogin" TIMESTAMP(3),
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "accountStatus" "UserAccountStatus" NOT NULL DEFAULT 'active',
    "verificationToken" TEXT,
    "verificationTokenExpiry" TIMESTAMP(3),
    "avatar" TEXT NOT NULL DEFAULT '',
    "avatarPublicId" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "district" TEXT NOT NULL DEFAULT '',
    "upazila" TEXT NOT NULL DEFAULT '',
    "thana" TEXT NOT NULL DEFAULT '',
    "fullAddress" TEXT NOT NULL DEFAULT '',
    "walletBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
    "referralCode" TEXT,
    "referredById" TEXT,
    "referralEarnings" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "loyaltyTier" "LoyaltyTier" NOT NULL DEFAULT 'none',
    "tierUpgradedAt" TIMESTAMP(3),
    "lifetimeSpend" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tierCashbackRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "resetPasswordOtp" TEXT,
    "resetPasswordExpires" TIMESTAMP(3),
    "profileUpdateOtp" TEXT,
    "profileUpdateOtpExpires" TIMESTAMP(3),
    "profileUpdateType" "ProfileUpdateType",
    "pendingEmail" TEXT,
    "pendingMobile" TEXT,
    "isSandbox" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletionReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Home',
    "district" TEXT NOT NULL DEFAULT '',
    "upazilaOrThana" TEXT NOT NULL DEFAULT '',
    "fullAddress" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'credit',
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "referenceOrder" TEXT NOT NULL DEFAULT '',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlist_items" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "userId" TEXT NOT NULL,
    "legacyProductId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "image" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT '📦',
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL DEFAULT '',
    "device" TEXT NOT NULL DEFAULT 'Unknown Device',
    "browser" TEXT NOT NULL DEFAULT 'Unknown Browser',
    "ipAddress" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT 'Unknown Location',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "role" "AdminRole" NOT NULL DEFAULT 'superadmin',
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "AdminAccountStatus" NOT NULL DEFAULT 'active',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "lastLoginAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "twoFactorMethod" "TwoFactorMethod" NOT NULL DEFAULT 'email',
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT true,
    "otp" TEXT,
    "otpExpiry" BIGINT,
    "totpSecret" TEXT,
    "totpPendingSecret" TEXT,
    "totpVerified" BOOLEAN NOT NULL DEFAULT false,
    "smsSetupOtp" TEXT,
    "smsSetupOtpExpiry" BIGINT,
    "image" TEXT NOT NULL DEFAULT '',
    "displayName" TEXT NOT NULL DEFAULT 'Super Admin',
    "storeName" TEXT NOT NULL DEFAULT 'EonlineBazar',
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "currencySymbol" TEXT NOT NULL DEFAULT '৳',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Dhaka',
    "logoUrl" TEXT NOT NULL DEFAULT '',
    "faviconUrl" TEXT NOT NULL DEFAULT '',
    "baseSalary" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "department" TEXT NOT NULL DEFAULT '',
    "joiningDate" TIMESTAMP(3),
    "employeeId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_sessions" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "sessionId" TEXT NOT NULL,
    "adminUsername" TEXT NOT NULL,
    "adminId" TEXT,
    "ipAddress" TEXT NOT NULL DEFAULT 'Unknown',
    "location" TEXT NOT NULL DEFAULT 'Unknown Location',
    "os" TEXT NOT NULL DEFAULT 'Unknown OS',
    "browser" TEXT NOT NULL DEFAULT 'Unknown Browser',
    "deviceType" TEXT NOT NULL DEFAULT 'Desktop',
    "device" TEXT NOT NULL DEFAULT 'Unknown Device',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "status" "AdminSessionStatus" NOT NULL DEFAULT 'active',
    "lastActive" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "employeeId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "gender" "EmployeeGender",
    "bloodGroup" "BloodGroup",
    "religion" TEXT NOT NULL DEFAULT '',
    "maritalStatus" "MaritalStatus",
    "nationalId" TEXT NOT NULL DEFAULT '',
    "photo" TEXT NOT NULL DEFAULT '',
    "photoPublicId" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL,
    "alternatePhone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "presentAddress" TEXT NOT NULL DEFAULT '',
    "permanentAddress" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "emergencyContactName" TEXT NOT NULL DEFAULT '',
    "emergencyContactPhone" TEXT NOT NULL DEFAULT '',
    "emergencyContactRelation" TEXT NOT NULL DEFAULT '',
    "designation" TEXT NOT NULL DEFAULT '',
    "designationId" TEXT,
    "role" TEXT NOT NULL DEFAULT '',
    "department" TEXT NOT NULL DEFAULT 'Operations',
    "employeeType" "EmployeeType" NOT NULL DEFAULT 'permanent',
    "shift" TEXT NOT NULL DEFAULT '',
    "shiftId" TEXT,
    "joiningDate" TIMESTAMP(3),
    "baseSalary" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "salaryType" "SalaryType" NOT NULL DEFAULT 'monthly',
    "bankName" TEXT NOT NULL DEFAULT '',
    "bankAccountNumber" TEXT NOT NULL DEFAULT '',
    "bkashNumber" TEXT NOT NULL DEFAULT '',
    "linkedAdminId" TEXT,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'active',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_documents" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "employeeId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "fileUrl" TEXT NOT NULL DEFAULT '',
    "fileType" TEXT NOT NULL DEFAULT 'image',
    "publicId" TEXT NOT NULL DEFAULT '',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_references" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "relation" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "employee_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "designations" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "name" TEXT NOT NULL,
    "department" TEXT NOT NULL DEFAULT 'Operations',
    "description" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "designations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL DEFAULT '09:00',
    "endTime" TEXT NOT NULL DEFAULT '18:00',
    "gracePeriodMinutes" INTEGER NOT NULL DEFAULT 15,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_assignments" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "staffUsername" TEXT NOT NULL,

    CONSTRAINT "shift_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "staffId" TEXT NOT NULL,
    "staffType" "StaffType" NOT NULL DEFAULT 'admin',
    "adminId" TEXT,
    "employeeId" TEXT,
    "staffUsername" TEXT NOT NULL DEFAULT '',
    "date" TIMESTAMP(3) NOT NULL,
    "clockIn" TIMESTAMP(3),
    "clockOut" TIMESTAMP(3),
    "hoursWorked" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'absent',
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "shift" "AttendanceShiftType" NOT NULL DEFAULT 'morning',
    "shiftStart" TEXT NOT NULL DEFAULT '09:00',
    "shiftEnd" TEXT NOT NULL DEFAULT '18:00',
    "gpsLat" DECIMAL(10,7),
    "gpsLng" DECIMAL(10,7),
    "notes" TEXT NOT NULL DEFAULT '',
    "markedBy" TEXT NOT NULL DEFAULT 'self',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payrolls" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "staffId" TEXT NOT NULL,
    "staffType" "StaffType" NOT NULL DEFAULT 'admin',
    "adminId" TEXT,
    "employeeId" TEXT,
    "staffUsername" TEXT NOT NULL DEFAULT '',
    "staffName" TEXT NOT NULL DEFAULT '',
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "baseSalary" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bonus" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "overtime" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "overtimeRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "overtimeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalSalary" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "workingDays" INTEGER NOT NULL DEFAULT 0,
    "presentDays" INTEGER NOT NULL DEFAULT 0,
    "absentDays" INTEGER NOT NULL DEFAULT 0,
    "lateDays" INTEGER NOT NULL DEFAULT 0,
    "status" "PayrollStatus" NOT NULL DEFAULT 'draft',
    "paidAt" TIMESTAMP(3),
    "paymentMethod" TEXT NOT NULL DEFAULT '',
    "paySlipGenerated" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payrolls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaves" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "staffId" TEXT NOT NULL,
    "staffType" "StaffType" NOT NULL DEFAULT 'admin',
    "adminId" TEXT,
    "employeeId" TEXT,
    "staffUsername" TEXT NOT NULL DEFAULT '',
    "staffName" TEXT NOT NULL DEFAULT '',
    "leaveType" "LeaveType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "totalDays" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT NOT NULL DEFAULT '',
    "status" "LeaveStatus" NOT NULL DEFAULT 'pending',
    "approvedBy" TEXT NOT NULL DEFAULT '',
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT NOT NULL DEFAULT '',
    "attachmentUrl" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leaves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "productId" TEXT NOT NULL,
    "name" TEXT,
    "slug" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "buyingPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "categoryName" TEXT NOT NULL DEFAULT 'General',
    "categoryId" TEXT,
    "brandId" TEXT,
    "brandName" TEXT NOT NULL DEFAULT '',
    "hasVariants" BOOLEAN NOT NULL DEFAULT false,
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 10,
    "supplierId" TEXT,
    "warehouseId" TEXT,
    "reorderPoint" INTEGER NOT NULL DEFAULT 5,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL DEFAULT '',
    "detailedDescription" TEXT NOT NULL DEFAULT '',
    "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "weight" INTEGER,
    "status" "ActiveStatus" NOT NULL DEFAULT 'active',
    "createdById" TEXT,
    "icon" TEXT NOT NULL DEFAULT '📦',
    "image" TEXT NOT NULL DEFAULT '',
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "numOfReviews" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "sku" TEXT NOT NULL DEFAULT '',
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "buyingPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "image" TEXT NOT NULL DEFAULT '',
    "attribute" TEXT NOT NULL DEFAULT '',
    "value" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variant_attributes" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "product_variant_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_cost_history" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierId" TEXT,
    "cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_cost_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_embedded_reviews" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "productId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_embedded_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT,
    "iconUrl" TEXT,
    "bannerImageUrl" TEXT,
    "color" TEXT NOT NULL DEFAULT '#f97316',
    "parentCategoryId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "showInNavbar" BOOLEAN NOT NULL DEFAULT true,
    "showInHomepage" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "customCashback" DECIMAL(5,2),
    "metaTitle" TEXT NOT NULL DEFAULT '',
    "metaDescription" TEXT NOT NULL DEFAULT '',
    "productCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "status" "ActiveStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attributes" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL DEFAULT '',
    "values" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ActiveStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "status" "ActiveStatus" NOT NULL DEFAULT 'active',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_products" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "supplier_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "managerName" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "ActiveStatus" NOT NULL DEFAULT 'active',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "poNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'draft',
    "totalCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "expectedDate" TIMESTAMP(3),
    "receivedDate" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "purchaseOrderId" TEXT NOT NULL,
    "productId" TEXT,
    "legacyProductId" TEXT,
    "productName" TEXT NOT NULL DEFAULT '',
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unitCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "receivedQty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "orderId" TEXT,
    "userId" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "customerAddress" TEXT,
    "subTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deliveryCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shippingLocationType" "ShippingLocationType" NOT NULL DEFAULT 'Inside City',
    "shippingDistrict" TEXT NOT NULL DEFAULT '',
    "totalAmount" DECIMAL(12,2),
    "totalBuyingPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vatPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vatEnabled" BOOLEAN NOT NULL DEFAULT false,
    "taxRegistrationNumber" TEXT NOT NULL DEFAULT '',
    "walletApplied" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "couponCode" TEXT NOT NULL DEFAULT '',
    "deliveryLocationType" "DeliveryLocationType" NOT NULL DEFAULT 'inside',
    "shippingFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paymentMethod" TEXT NOT NULL DEFAULT 'COD',
    "processingFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "OrderStatus" NOT NULL DEFAULT 'Pending',
    "isDelivered" BOOLEAN NOT NULL DEFAULT false,
    "deliveredAt" TIMESTAMP(3),
    "cancelReason" TEXT NOT NULL DEFAULT '',
    "cancelledBy" "CancelledBy",
    "returnReason" TEXT NOT NULL DEFAULT '',
    "returnRequestedAt" TIMESTAMP(3),
    "refundMethod" "RefundMethod" NOT NULL DEFAULT 'wallet',
    "refundBkashNumber" TEXT NOT NULL DEFAULT '',
    "refundNagadNumber" TEXT NOT NULL DEFAULT '',
    "returnRejectedReason" TEXT NOT NULL DEFAULT '',
    "returnRejectedAt" TIMESTAMP(3),
    "returnApprovedAt" TIMESTAMP(3),
    "adminReturnNote" TEXT NOT NULL DEFAULT '',
    "actionReason" TEXT NOT NULL DEFAULT '',
    "refundedAt" TIMESTAMP(3),
    "refundAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "statusBeforeRefund" TEXT NOT NULL DEFAULT '',
    "rewardsCredited" BOOLEAN NOT NULL DEFAULT false,
    "rewardsPointsEarned" INTEGER NOT NULL DEFAULT 0,
    "rewardsCashbackAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "courierProvider" TEXT NOT NULL DEFAULT '',
    "courierName" TEXT NOT NULL DEFAULT '',
    "courierTrackingId" TEXT NOT NULL DEFAULT '',
    "courierConsignmentId" TEXT NOT NULL DEFAULT '',
    "courierStatus" TEXT NOT NULL DEFAULT 'unbooked',
    "courierBookedAt" TIMESTAMP(3),
    "courierSyncedAt" TIMESTAMP(3),
    "note" TEXT NOT NULL DEFAULT '',
    "estimatedDelivery" TEXT NOT NULL DEFAULT '',
    "orderSource" "OrderSource" NOT NULL DEFAULT 'online',
    "createdByAdmin" TEXT NOT NULL DEFAULT '',
    "assignedStaffId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "isSandbox" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "legacyProductId" TEXT,
    "lineKey" TEXT,
    "name" TEXT,
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "buyingPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "image" TEXT,
    "variantId" TEXT NOT NULL DEFAULT '',
    "variantLabel" TEXT NOT NULL DEFAULT '',
    "variantAttribute" TEXT NOT NULL DEFAULT '',
    "variantValue" TEXT NOT NULL DEFAULT '',
    "variantSku" TEXT NOT NULL DEFAULT '',
    "extraFields" JSONB,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_return_items" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "legacyProductId" TEXT,
    "productName" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL DEFAULT '',
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ReturnItemStatus" NOT NULL DEFAULT 'pending',

    CONSTRAINT "order_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_payments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "methodId" TEXT,
    "code" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "type" "PaymentMethodType" NOT NULL DEFAULT 'manual',
    "provider" TEXT NOT NULL DEFAULT '',
    "accountNumber" TEXT NOT NULL DEFAULT '',
    "gatewayStoreId" TEXT NOT NULL DEFAULT '',
    "isSandbox" BOOLEAN NOT NULL DEFAULT false,
    "processingFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "feeType" "FeeType" NOT NULL DEFAULT 'percentage',
    "feeRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "feeBaseAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "OrderPaymentStatus" NOT NULL DEFAULT 'unpaid',
    "transactionId" TEXT NOT NULL DEFAULT '',
    "gatewayReference" TEXT NOT NULL DEFAULT '',
    "paidAt" TIMESTAMP(3),
    "settledFromWallet" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "order_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_payment_ipn_events" (
    "id" TEXT NOT NULL,
    "orderPaymentId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT '',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "transactionId" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "message" TEXT NOT NULL DEFAULT '',
    "raw" JSONB,

    CONSTRAINT "order_payment_ipn_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_payment_proofs" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "reviewedById" TEXT,
    "trxId" TEXT,
    "screenshotUrl" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "status" "PaymentProofStatus" NOT NULL DEFAULT 'none',
    "adminNote" TEXT,

    CONSTRAINT "order_payment_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_notifications" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "returnReceived" BOOLEAN NOT NULL DEFAULT false,
    "returnApproved" BOOLEAN NOT NULL DEFAULT false,
    "returnRejected" BOOLEAN NOT NULL DEFAULT false,
    "refundProcessed" BOOLEAN NOT NULL DEFAULT false,
    "reviewReminder" BOOLEAN NOT NULL DEFAULT false,
    "processing" BOOLEAN NOT NULL DEFAULT false,
    "shipped" BOOLEAN NOT NULL DEFAULT false,
    "out_for_delivery" BOOLEAN NOT NULL DEFAULT false,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "order_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carts" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "userId" TEXT NOT NULL,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "abandonedNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "image" TEXT NOT NULL DEFAULT '',
    "emojiIcon" TEXT,
    "variantImage" TEXT,
    "icon" TEXT NOT NULL DEFAULT '📦',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "variantId" TEXT NOT NULL DEFAULT '',
    "variantLabel" TEXT NOT NULL DEFAULT '',
    "variantAttribute" TEXT NOT NULL DEFAULT '',
    "variantValue" TEXT NOT NULL DEFAULT '',
    "variantSku" TEXT NOT NULL DEFAULT '',
    "selectedColor" TEXT NOT NULL DEFAULT '',
    "selectedSize" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "code" TEXT NOT NULL,
    "discountType" "CouponDiscountType" NOT NULL,
    "discountValue" DECIMAL(12,2) NOT NULL,
    "minOrderAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "maxDiscountAmount" DECIMAL(12,2),
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "status" "CouponStatus" NOT NULL DEFAULT 'ACTIVE',
    "usageLimit" INTEGER NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "perUserLimit" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_redemptions" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "userId" TEXT,
    "productId" TEXT,
    "legacyProductId" TEXT NOT NULL,
    "legacyOrderId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "photo" TEXT NOT NULL DEFAULT '',
    "isSandbox" BOOLEAN NOT NULL DEFAULT false,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "adminNote" TEXT NOT NULL DEFAULT '',
    "moderatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "category" TEXT NOT NULL,
    "expenseCategoryId" TEXT,
    "customCategoryName" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT NOT NULL DEFAULT '',
    "recordedBy" TEXT NOT NULL DEFAULT '',
    "attachmentUrl" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystemDefault" BOOLEAN NOT NULL DEFAULT false,
    "allowCustomInput" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_logs" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL DEFAULT 'system',
    "actorType" "SecurityActorType" NOT NULL DEFAULT 'system',
    "ipAddress" TEXT NOT NULL DEFAULT 'Unknown',
    "details" TEXT NOT NULL DEFAULT '',
    "resourceType" "SecurityResourceType",
    "resourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "security_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "username" TEXT NOT NULL DEFAULT 'unknown',
    "ipAddress" TEXT NOT NULL DEFAULT 'Unknown',
    "location" TEXT NOT NULL DEFAULT 'Unknown Location',
    "os" TEXT NOT NULL DEFAULT 'Unknown OS',
    "browser" TEXT NOT NULL DEFAULT 'Unknown Browser',
    "deviceType" TEXT NOT NULL DEFAULT 'Desktop',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "status" "LoginAttemptStatus" NOT NULL DEFAULT 'failed',
    "details" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blacklisted_ips" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "ip" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'Suspicious activity',
    "source" "BlacklistSource" NOT NULL DEFAULT 'auto',
    "blockedBy" TEXT NOT NULL DEFAULT 'system',
    "blockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blacklisted_ips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_alerts" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "lowStockCount" INTEGER NOT NULL DEFAULT 0,
    "outOfStockCount" INTEGER NOT NULL DEFAULT 0,
    "alertSentEmail" BOOLEAN NOT NULL DEFAULT false,
    "alertSentSms" BOOLEAN NOT NULL DEFAULT false,
    "alertSentWhatsapp" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_alert_items" (
    "id" TEXT NOT NULL,
    "stockAlertId" TEXT NOT NULL,
    "kind" "StockAlertItemKind" NOT NULL,
    "productId" TEXT,
    "legacyProductId" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "stock" INTEGER,
    "threshold" INTEGER,

    CONSTRAINT "stock_alert_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_messages" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL,
    "ticketNumber" TEXT,
    "status" "TicketStatus" NOT NULL DEFAULT 'open',
    "priority" "TicketPriority" NOT NULL DEFAULT 'normal',
    "assignedTo" TEXT NOT NULL DEFAULT '',
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "replyMessage" TEXT NOT NULL DEFAULT '',
    "repliedAt" TIMESTAMP(3),
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletters" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "source" "NewsletterSource" NOT NULL DEFAULT 'footer_form',
    "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unsubscribedAt" TIMESTAMP(3),
    "unsubscribeToken" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "emailsSent" INTEGER NOT NULL DEFAULT 0,
    "lastEmailAt" TIMESTAMP(3),

    CONSTRAINT "newsletters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_campaigns" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "htmlContent" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "targetTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetSegment" "CampaignSegment" NOT NULL DEFAULT 'all',
    "channel" "CampaignChannel" NOT NULL DEFAULT 'email',
    "whatsappTemplate" TEXT NOT NULL DEFAULT '',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "statsTotalRecipients" INTEGER NOT NULL DEFAULT 0,
    "statsSent" INTEGER NOT NULL DEFAULT 0,
    "statsFailed" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "logoUrl" TEXT NOT NULL DEFAULT '',
    "type" "PaymentMethodType" NOT NULL DEFAULT 'manual',
    "provider" "GatewayProvider",
    "instructions" TEXT NOT NULL DEFAULT '',
    "accountNumber" TEXT NOT NULL DEFAULT '',
    "processingFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "feeType" "FeeType" NOT NULL DEFAULT 'percentage',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "apiStoreId" TEXT NOT NULL DEFAULT '',
    "apiStorePassword" TEXT NOT NULL DEFAULT '',
    "apiKey" TEXT NOT NULL DEFAULT '',
    "apiIsSandbox" BOOLEAN NOT NULL DEFAULT true,
    "apiWebhookUrl" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT NOT NULL DEFAULT '',
    "createdByAdmin" TEXT NOT NULL DEFAULT '',
    "updatedByAdmin" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banners" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "subtitle" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT,
    "mobileImageUrl" TEXT,
    "backgroundColor" TEXT,
    "linkUrl" TEXT,
    "linkText" TEXT NOT NULL DEFAULT 'Shop Now',
    "textColor" TEXT NOT NULL DEFAULT '#ffffff',
    "overlayOpacity" DECIMAL(3,2) NOT NULL DEFAULT 0.3,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banner_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'global',
    "autoPlay" BOOLEAN NOT NULL DEFAULT true,
    "autoPlayInterval" INTEGER NOT NULL DEFAULT 4000,
    "showDots" BOOLEAN NOT NULL DEFAULT true,
    "showArrows" BOOLEAN NOT NULL DEFAULT true,
    "height" TEXT NOT NULL DEFAULT '300px',
    "mobileHeight" TEXT NOT NULL DEFAULT '200px',
    "transitionEffect" "BannerTransition" NOT NULL DEFAULT 'slide',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "banner_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_contents" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL DEFAULT '',
    "bodyMarkdown" TEXT NOT NULL DEFAULT '',
    "bodyHtml" TEXT NOT NULL DEFAULT '',
    "contentFormat" "ContentFormat" NOT NULL DEFAULT 'markdown',
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "contactMetaAddress" TEXT NOT NULL DEFAULT '',
    "contactMetaPhone" TEXT NOT NULL DEFAULT '',
    "contactMetaEmail" TEXT NOT NULL DEFAULT '',
    "contactMetaHours" TEXT NOT NULL DEFAULT '',
    "contactMetaMapEmbedUrl" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedByAdmin" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "footer_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'global',
    "copyrightText" TEXT NOT NULL DEFAULT '© 2026 EonlineBazar. All rights reserved. Designed by Abdul Karim Sheikh',
    "paymentBadgesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "footer_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "footer_columns" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "footerSettingsId" TEXT NOT NULL,
    "columnTitle" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "footer_columns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "footer_links" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "footerColumnId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "isExternal" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "footer_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "footer_social_links" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "footerSettingsId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "iconName" TEXT NOT NULL DEFAULT '',
    "iconUrl" TEXT NOT NULL DEFAULT '',
    "linkUrl" TEXT NOT NULL DEFAULT '#',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "footer_social_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "footer_payment_gateways" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "footerSettingsId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "iconUrl" TEXT NOT NULL DEFAULT '',
    "iconName" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "footer_payment_gateways_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "footer_payment_badges" (
    "id" TEXT NOT NULL,
    "footerSettingsId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "footer_payment_badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "navbar_links" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "slug" TEXT NOT NULL DEFAULT '',
    "target" "LinkTarget" NOT NULL DEFAULT '_self',
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "hasCustomPage" BOOLEAN NOT NULL DEFAULT false,
    "pageHtml" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "navbar_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "type" "NoteType" NOT NULL DEFAULT 'note',
    "amount" DECIMAL(12,2),
    "category" "NoteCategory" NOT NULL DEFAULT 'other',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT NOT NULL DEFAULT '#FFFEF0',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_shopping_items" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "checked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "note_shopping_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_notifications" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "recipientId" TEXT NOT NULL,
    "adminId" TEXT,
    "type" "AdminNotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT NOT NULL DEFAULT '',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'global',
    "shopHomeCity" TEXT NOT NULL DEFAULT 'Dhaka',
    "deliveryInsideCity" DECIMAL(12,2) NOT NULL DEFAULT 60,
    "deliveryOutsideCity" DECIMAL(12,2) NOT NULL DEFAULT 120,
    "freeShippingMinAmount" DECIMAL(12,2) NOT NULL DEFAULT 1000,
    "freeShippingThreshold" DECIMAL(12,2),
    "cashbackPercentage" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "takaToPointsRatio" INTEGER NOT NULL DEFAULT 100,
    "pointsToTakaConversionRate" INTEGER NOT NULL DEFAULT 10,
    "refundUndoWindowHours" INTEGER NOT NULL DEFAULT 72,
    "announcementText" TEXT NOT NULL DEFAULT '',
    "announcementDiscount" TEXT NOT NULL DEFAULT '2000',
    "isAnnouncementActive" BOOLEAN NOT NULL DEFAULT true,
    "enableSmsNotifications" BOOLEAN NOT NULL DEFAULT false,
    "smsGatewayProvider" "SmsGatewayProvider",
    "smsApiKey" TEXT NOT NULL DEFAULT '',
    "smsSenderId" TEXT NOT NULL DEFAULT '',
    "defaultCourierProvider" TEXT NOT NULL DEFAULT '',
    "courierApiKey" TEXT NOT NULL DEFAULT '',
    "courierSecretKey" TEXT NOT NULL DEFAULT '',
    "publicSupportWhatsApp" TEXT NOT NULL DEFAULT '',
    "privateAdminAlertWhatsApp" TEXT NOT NULL DEFAULT '',
    "enableWhatsAppOrderAlerts" BOOLEAN NOT NULL DEFAULT false,
    "whatsAppAlertProvider" "WhatsAppAlertProvider",
    "whatsAppAlertApiKey" TEXT NOT NULL DEFAULT '',
    "whatsAppAlertInstanceId" TEXT NOT NULL DEFAULT '',
    "whatsAppAlertWebhookUrl" TEXT NOT NULL DEFAULT '',
    "activeGatewayBKash" BOOLEAN NOT NULL DEFAULT true,
    "activeGatewayNagad" BOOLEAN NOT NULL DEFAULT true,
    "activeGatewayVisa" BOOLEAN NOT NULL DEFAULT true,
    "activeGatewayMasterCard" BOOLEAN NOT NULL DEFAULT true,
    "activeGatewayCod" BOOLEAN NOT NULL DEFAULT true,
    "rateLimitEnabled" BOOLEAN NOT NULL DEFAULT true,
    "rateLimitWindowMs" INTEGER NOT NULL DEFAULT 900000,
    "rateLimitMaxRequests" INTEGER NOT NULL DEFAULT 1000,
    "bypassAdminAndLocalhost" BOOLEAN NOT NULL DEFAULT true,
    "sandboxMode" BOOLEAN NOT NULL DEFAULT false,
    "serviceWorkerEnabled" BOOLEAN NOT NULL DEFAULT true,
    "flashSaleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "flashSaleTitle" TEXT NOT NULL DEFAULT 'Flash Sale',
    "flashSaleEndDate" TIMESTAMP(3),
    "flashSaleDiscountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "flashSaleProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "vipMinTotalSpent" DECIMAL(12,2) NOT NULL DEFAULT 10000,
    "vipMinOrderCount" INTEGER NOT NULL DEFAULT 5,
    "frequentBuyerMinOrders" INTEGER NOT NULL DEFAULT 3,
    "referralRewardAmount" DECIMAL(12,2) NOT NULL DEFAULT 100,
    "enableTieredLoyalty" BOOLEAN NOT NULL DEFAULT false,
    "silverThreshold" DECIMAL(12,2) NOT NULL DEFAULT 5000,
    "goldThreshold" DECIMAL(12,2) NOT NULL DEFAULT 15000,
    "platinumThreshold" DECIMAL(12,2) NOT NULL DEFAULT 50000,
    "silverCashback" DECIMAL(5,2) NOT NULL DEFAULT 1.5,
    "goldCashback" DECIMAL(5,2) NOT NULL DEFAULT 2.5,
    "platinumCashback" DECIMAL(5,2) NOT NULL DEFAULT 4.0,
    "defaultProductsPerPage" INTEGER NOT NULL DEFAULT 24,
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vatEnabled" BOOLEAN NOT NULL DEFAULT false,
    "vatPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vatInclusive" BOOLEAN NOT NULL DEFAULT true,
    "taxRegistrationNumber" TEXT NOT NULL DEFAULT '',
    "lastBackupAt" TIMESTAMP(3),
    "orderPrefix" TEXT NOT NULL DEFAULT 'ORD',
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceMessage" TEXT NOT NULL DEFAULT 'We are currently performing scheduled maintenance. Please check back soon.',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_payment_gateways" (
    "id" TEXT NOT NULL,
    "settingsId" TEXT NOT NULL,
    "gatewayKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT NOT NULL DEFAULT '',
    "logoUrl" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "settings_payment_gateways_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_legacyId_key" ON "users"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_referralCode_key" ON "users"("referralCode");

-- CreateIndex
CREATE INDEX "users_mobile_idx" ON "users"("mobile");

-- CreateIndex
CREATE INDEX "users_googleId_idx" ON "users"("googleId");

-- CreateIndex
CREATE INDEX "users_loyaltyTier_idx" ON "users"("loyaltyTier");

-- CreateIndex
CREATE INDEX "users_isDeleted_idx" ON "users"("isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "addresses_legacyId_key" ON "addresses"("legacyId");

-- CreateIndex
CREATE INDEX "addresses_userId_idx" ON "addresses"("userId");

-- CreateIndex
CREATE INDEX "addresses_userId_isDefault_idx" ON "addresses"("userId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_legacyId_key" ON "wallet_transactions"("legacyId");

-- CreateIndex
CREATE INDEX "wallet_transactions_userId_date_idx" ON "wallet_transactions"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "wishlist_items_legacyId_key" ON "wishlist_items"("legacyId");

-- CreateIndex
CREATE INDEX "wishlist_items_userId_idx" ON "wishlist_items"("userId");

-- CreateIndex
CREATE INDEX "wishlist_items_productId_idx" ON "wishlist_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_legacyId_key" ON "user_sessions"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_sessionId_key" ON "user_sessions"("sessionId");

-- CreateIndex
CREATE INDEX "user_sessions_userId_idx" ON "user_sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "admins_legacyId_key" ON "admins"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "admins_username_key" ON "admins"("username");

-- CreateIndex
CREATE INDEX "admins_role_idx" ON "admins"("role");

-- CreateIndex
CREATE INDEX "admins_status_idx" ON "admins"("status");

-- CreateIndex
CREATE UNIQUE INDEX "admin_sessions_legacyId_key" ON "admin_sessions"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "admin_sessions_sessionId_key" ON "admin_sessions"("sessionId");

-- CreateIndex
CREATE INDEX "admin_sessions_adminUsername_idx" ON "admin_sessions"("adminUsername");

-- CreateIndex
CREATE INDEX "admin_sessions_status_idx" ON "admin_sessions"("status");

-- CreateIndex
CREATE INDEX "admin_sessions_adminId_idx" ON "admin_sessions"("adminId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_legacyId_key" ON "employees"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employeeId_key" ON "employees"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_linkedAdminId_key" ON "employees"("linkedAdminId");

-- CreateIndex
CREATE INDEX "employees_status_idx" ON "employees"("status");

-- CreateIndex
CREATE INDEX "employees_department_idx" ON "employees"("department");

-- CreateIndex
CREATE INDEX "employees_designation_idx" ON "employees"("designation");

-- CreateIndex
CREATE INDEX "employees_employeeType_idx" ON "employees"("employeeType");

-- CreateIndex
CREATE UNIQUE INDEX "employee_documents_legacyId_key" ON "employee_documents"("legacyId");

-- CreateIndex
CREATE INDEX "employee_documents_employeeId_idx" ON "employee_documents"("employeeId");

-- CreateIndex
CREATE INDEX "employee_references_employeeId_idx" ON "employee_references"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "designations_legacyId_key" ON "designations"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "designations_name_key" ON "designations"("name");

-- CreateIndex
CREATE INDEX "designations_isActive_idx" ON "designations"("isActive");

-- CreateIndex
CREATE INDEX "designations_department_idx" ON "designations"("department");

-- CreateIndex
CREATE UNIQUE INDEX "shifts_legacyId_key" ON "shifts"("legacyId");

-- CreateIndex
CREATE INDEX "shifts_isDefault_idx" ON "shifts"("isDefault");

-- CreateIndex
CREATE INDEX "shift_assignments_staffUsername_idx" ON "shift_assignments"("staffUsername");

-- CreateIndex
CREATE UNIQUE INDEX "shift_assignments_shiftId_staffUsername_key" ON "shift_assignments"("shiftId", "staffUsername");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_legacyId_key" ON "attendance"("legacyId");

-- CreateIndex
CREATE INDEX "attendance_staffId_date_idx" ON "attendance"("staffId", "date");

-- CreateIndex
CREATE INDEX "attendance_date_status_idx" ON "attendance"("date", "status");

-- CreateIndex
CREATE INDEX "attendance_adminId_idx" ON "attendance"("adminId");

-- CreateIndex
CREATE INDEX "attendance_employeeId_idx" ON "attendance"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "payrolls_legacyId_key" ON "payrolls"("legacyId");

-- CreateIndex
CREATE INDEX "payrolls_year_month_status_idx" ON "payrolls"("year", "month", "status");

-- CreateIndex
CREATE INDEX "payrolls_adminId_idx" ON "payrolls"("adminId");

-- CreateIndex
CREATE INDEX "payrolls_employeeId_idx" ON "payrolls"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "payrolls_staffId_year_month_key" ON "payrolls"("staffId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "leaves_legacyId_key" ON "leaves"("legacyId");

-- CreateIndex
CREATE INDEX "leaves_staffId_startDate_idx" ON "leaves"("staffId", "startDate");

-- CreateIndex
CREATE INDEX "leaves_status_startDate_idx" ON "leaves"("status", "startDate");

-- CreateIndex
CREATE INDEX "leaves_startDate_endDate_idx" ON "leaves"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "leaves_adminId_idx" ON "leaves"("adminId");

-- CreateIndex
CREATE INDEX "leaves_employeeId_idx" ON "leaves"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "products_legacyId_key" ON "products"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "products_productId_key" ON "products"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");

-- CreateIndex
CREATE INDEX "products_categoryName_idx" ON "products"("categoryName");

-- CreateIndex
CREATE INDEX "products_price_idx" ON "products"("price");

-- CreateIndex
CREATE INDEX "products_rating_idx" ON "products"("rating");

-- CreateIndex
CREATE INDEX "products_numOfReviews_idx" ON "products"("numOfReviews");

-- CreateIndex
CREATE INDEX "products_brandId_idx" ON "products"("brandId");

-- CreateIndex
CREATE INDEX "products_stockQuantity_idx" ON "products"("stockQuantity");

-- CreateIndex
CREATE INDEX "products_price_rating_idx" ON "products"("price", "rating");

-- CreateIndex
CREATE INDEX "products_brandId_price_idx" ON "products"("brandId", "price");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_legacyId_key" ON "product_variants"("legacyId");

-- CreateIndex
CREATE INDEX "product_variants_productId_idx" ON "product_variants"("productId");

-- CreateIndex
CREATE INDEX "product_variants_sku_idx" ON "product_variants"("sku");

-- CreateIndex
CREATE INDEX "product_variant_attributes_name_value_idx" ON "product_variant_attributes"("name", "value");

-- CreateIndex
CREATE UNIQUE INDEX "product_variant_attributes_variantId_name_key" ON "product_variant_attributes"("variantId", "name");

-- CreateIndex
CREATE INDEX "product_cost_history_productId_date_idx" ON "product_cost_history"("productId", "date");

-- CreateIndex
CREATE INDEX "product_cost_history_supplierId_idx" ON "product_cost_history"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "product_embedded_reviews_legacyId_key" ON "product_embedded_reviews"("legacyId");

-- CreateIndex
CREATE INDEX "product_embedded_reviews_productId_idx" ON "product_embedded_reviews"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_legacyId_key" ON "categories"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parentCategoryId_position_name_idx" ON "categories"("parentCategoryId", "position", "name");

-- CreateIndex
CREATE INDEX "categories_isActive_parentCategoryId_position_idx" ON "categories"("isActive", "parentCategoryId", "position");

-- CreateIndex
CREATE INDEX "categories_isActive_showInNavbar_parentCategoryId_position_idx" ON "categories"("isActive", "showInNavbar", "parentCategoryId", "position");

-- CreateIndex
CREATE INDEX "categories_isActive_showInHomepage_parentCategoryId_positio_idx" ON "categories"("isActive", "showInHomepage", "parentCategoryId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "brands_legacyId_key" ON "brands"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "brands_name_key" ON "brands"("name");

-- CreateIndex
CREATE INDEX "brands_slug_idx" ON "brands"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "attributes_legacyId_key" ON "attributes"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "attributes_name_key" ON "attributes"("name");

-- CreateIndex
CREATE INDEX "attributes_slug_idx" ON "attributes"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_legacyId_key" ON "suppliers"("legacyId");

-- CreateIndex
CREATE INDEX "suppliers_status_createdAt_idx" ON "suppliers"("status", "createdAt");

-- CreateIndex
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");

-- CreateIndex
CREATE INDEX "supplier_products_productId_idx" ON "supplier_products"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_products_supplierId_productId_key" ON "supplier_products"("supplierId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_legacyId_key" ON "warehouses"("legacyId");

-- CreateIndex
CREATE INDEX "warehouses_status_createdAt_idx" ON "warehouses"("status", "createdAt");

-- CreateIndex
CREATE INDEX "warehouses_isDefault_idx" ON "warehouses"("isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_legacyId_key" ON "purchase_orders"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_poNumber_key" ON "purchase_orders"("poNumber");

-- CreateIndex
CREATE INDEX "purchase_orders_supplierId_createdAt_idx" ON "purchase_orders"("supplierId", "createdAt");

-- CreateIndex
CREATE INDEX "purchase_orders_status_createdAt_idx" ON "purchase_orders"("status", "createdAt");

-- CreateIndex
CREATE INDEX "purchase_orders_createdAt_idx" ON "purchase_orders"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_items_legacyId_key" ON "purchase_order_items"("legacyId");

-- CreateIndex
CREATE INDEX "purchase_order_items_purchaseOrderId_idx" ON "purchase_order_items"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "purchase_order_items_productId_idx" ON "purchase_order_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_legacyId_key" ON "orders"("legacyId");

-- CreateIndex
CREATE INDEX "orders_orderId_idx" ON "orders"("orderId");

-- CreateIndex
CREATE INDEX "orders_userId_idx" ON "orders"("userId");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_createdAt_idx" ON "orders"("createdAt");

-- CreateIndex
CREATE INDEX "orders_isSandbox_idx" ON "orders"("isSandbox");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_legacyId_key" ON "order_items"("legacyId");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE INDEX "order_items_productId_idx" ON "order_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "order_return_items_legacyId_key" ON "order_return_items"("legacyId");

-- CreateIndex
CREATE INDEX "order_return_items_orderId_idx" ON "order_return_items"("orderId");

-- CreateIndex
CREATE INDEX "order_return_items_productId_idx" ON "order_return_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "order_payments_orderId_key" ON "order_payments"("orderId");

-- CreateIndex
CREATE INDEX "order_payments_transactionId_idx" ON "order_payments"("transactionId");

-- CreateIndex
CREATE INDEX "order_payments_methodId_idx" ON "order_payments"("methodId");

-- CreateIndex
CREATE INDEX "order_payment_ipn_events_orderPaymentId_receivedAt_idx" ON "order_payment_ipn_events"("orderPaymentId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "order_payment_proofs_orderId_key" ON "order_payment_proofs"("orderId");

-- CreateIndex
CREATE INDEX "order_payment_proofs_status_submittedAt_idx" ON "order_payment_proofs"("status", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "order_notifications_orderId_key" ON "order_notifications"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "carts_legacyId_key" ON "carts"("legacyId");

-- CreateIndex
CREATE INDEX "carts_userId_updatedAt_idx" ON "carts"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "cart_items_cartId_idx" ON "cart_items"("cartId");

-- CreateIndex
CREATE INDEX "cart_items_productId_idx" ON "cart_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_legacyId_key" ON "coupons"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_status_expiryDate_idx" ON "coupons"("status", "expiryDate");

-- CreateIndex
CREATE INDEX "coupon_redemptions_couponId_userId_idx" ON "coupon_redemptions"("couponId", "userId");

-- CreateIndex
CREATE INDEX "coupon_redemptions_userId_idx" ON "coupon_redemptions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_legacyId_key" ON "reviews"("legacyId");

-- CreateIndex
CREATE INDEX "reviews_legacyProductId_idx" ON "reviews"("legacyProductId");

-- CreateIndex
CREATE INDEX "reviews_productId_idx" ON "reviews"("productId");

-- CreateIndex
CREATE INDEX "reviews_userId_idx" ON "reviews"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_legacyId_key" ON "expenses"("legacyId");

-- CreateIndex
CREATE INDEX "expenses_date_idx" ON "expenses"("date");

-- CreateIndex
CREATE INDEX "expenses_category_date_idx" ON "expenses"("category", "date");

-- CreateIndex
CREATE INDEX "expenses_expenseCategoryId_idx" ON "expenses"("expenseCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_legacyId_key" ON "expense_categories"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_name_key" ON "expense_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_slug_key" ON "expense_categories"("slug");

-- CreateIndex
CREATE INDEX "expense_categories_isActive_slug_idx" ON "expense_categories"("isActive", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "security_logs_legacyId_key" ON "security_logs"("legacyId");

-- CreateIndex
CREATE INDEX "security_logs_createdAt_idx" ON "security_logs"("createdAt");

-- CreateIndex
CREATE INDEX "security_logs_actor_actorType_createdAt_idx" ON "security_logs"("actor", "actorType", "createdAt");

-- CreateIndex
CREATE INDEX "security_logs_resourceType_resourceId_createdAt_idx" ON "security_logs"("resourceType", "resourceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "login_attempts_legacyId_key" ON "login_attempts"("legacyId");

-- CreateIndex
CREATE INDEX "login_attempts_ipAddress_idx" ON "login_attempts"("ipAddress");

-- CreateIndex
CREATE INDEX "login_attempts_status_idx" ON "login_attempts"("status");

-- CreateIndex
CREATE INDEX "login_attempts_ipAddress_status_createdAt_idx" ON "login_attempts"("ipAddress", "status", "createdAt");

-- CreateIndex
CREATE INDEX "login_attempts_createdAt_idx" ON "login_attempts"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "blacklisted_ips_legacyId_key" ON "blacklisted_ips"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "blacklisted_ips_ip_key" ON "blacklisted_ips"("ip");

-- CreateIndex
CREATE INDEX "blacklisted_ips_expiresAt_idx" ON "blacklisted_ips"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "stock_alerts_legacyId_key" ON "stock_alerts"("legacyId");

-- CreateIndex
CREATE INDEX "stock_alerts_checkedAt_idx" ON "stock_alerts"("checkedAt");

-- CreateIndex
CREATE INDEX "stock_alert_items_stockAlertId_kind_idx" ON "stock_alert_items"("stockAlertId", "kind");

-- CreateIndex
CREATE INDEX "stock_alert_items_productId_idx" ON "stock_alert_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "contact_messages_legacyId_key" ON "contact_messages"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "contact_messages_ticketNumber_key" ON "contact_messages"("ticketNumber");

-- CreateIndex
CREATE INDEX "contact_messages_status_idx" ON "contact_messages"("status");

-- CreateIndex
CREATE INDEX "contact_messages_priority_idx" ON "contact_messages"("priority");

-- CreateIndex
CREATE INDEX "contact_messages_isRead_idx" ON "contact_messages"("isRead");

-- CreateIndex
CREATE INDEX "contact_messages_createdAt_idx" ON "contact_messages"("createdAt");

-- CreateIndex
CREATE INDEX "contact_messages_status_createdAt_idx" ON "contact_messages"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "newsletters_legacyId_key" ON "newsletters"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "newsletters_email_key" ON "newsletters"("email");

-- CreateIndex
CREATE INDEX "newsletters_isActive_idx" ON "newsletters"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "email_campaigns_legacyId_key" ON "email_campaigns"("legacyId");

-- CreateIndex
CREATE INDEX "email_campaigns_status_scheduledAt_idx" ON "email_campaigns"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "email_campaigns_createdById_idx" ON "email_campaigns"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_legacyId_key" ON "payment_methods"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_code_key" ON "payment_methods"("code");

-- CreateIndex
CREATE INDEX "payment_methods_isActive_sortOrder_name_idx" ON "payment_methods"("isActive", "sortOrder", "name");

-- CreateIndex
CREATE UNIQUE INDEX "banners_legacyId_key" ON "banners"("legacyId");

-- CreateIndex
CREATE INDEX "banners_isActive_position_idx" ON "banners"("isActive", "position");

-- CreateIndex
CREATE UNIQUE INDEX "banner_settings_key_key" ON "banner_settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "page_contents_legacyId_key" ON "page_contents"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "page_contents_slug_key" ON "page_contents"("slug");

-- CreateIndex
CREATE INDEX "page_contents_isPublished_sortOrder_title_idx" ON "page_contents"("isPublished", "sortOrder", "title");

-- CreateIndex
CREATE UNIQUE INDEX "footer_settings_key_key" ON "footer_settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "footer_columns_legacyId_key" ON "footer_columns"("legacyId");

-- CreateIndex
CREATE INDEX "footer_columns_footerSettingsId_sortOrder_idx" ON "footer_columns"("footerSettingsId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "footer_links_legacyId_key" ON "footer_links"("legacyId");

-- CreateIndex
CREATE INDEX "footer_links_footerColumnId_idx" ON "footer_links"("footerColumnId");

-- CreateIndex
CREATE UNIQUE INDEX "footer_social_links_legacyId_key" ON "footer_social_links"("legacyId");

-- CreateIndex
CREATE INDEX "footer_social_links_footerSettingsId_sortOrder_idx" ON "footer_social_links"("footerSettingsId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "footer_payment_gateways_legacyId_key" ON "footer_payment_gateways"("legacyId");

-- CreateIndex
CREATE INDEX "footer_payment_gateways_footerSettingsId_sortOrder_idx" ON "footer_payment_gateways"("footerSettingsId", "sortOrder");

-- CreateIndex
CREATE INDEX "footer_payment_badges_footerSettingsId_idx" ON "footer_payment_badges"("footerSettingsId");

-- CreateIndex
CREATE UNIQUE INDEX "navbar_links_legacyId_key" ON "navbar_links"("legacyId");

-- CreateIndex
CREATE INDEX "navbar_links_slug_idx" ON "navbar_links"("slug");

-- CreateIndex
CREATE INDEX "navbar_links_isPublished_sortOrder_title_idx" ON "navbar_links"("isPublished", "sortOrder", "title");

-- CreateIndex
CREATE UNIQUE INDEX "notes_legacyId_key" ON "notes"("legacyId");

-- CreateIndex
CREATE INDEX "notes_userId_idx" ON "notes"("userId");

-- CreateIndex
CREATE INDEX "notes_type_idx" ON "notes"("type");

-- CreateIndex
CREATE INDEX "notes_userId_createdAt_idx" ON "notes"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "notes_userId_type_createdAt_idx" ON "notes"("userId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "notes_userId_date_idx" ON "notes"("userId", "date");

-- CreateIndex
CREATE INDEX "note_shopping_items_noteId_idx" ON "note_shopping_items"("noteId");

-- CreateIndex
CREATE UNIQUE INDEX "admin_notifications_legacyId_key" ON "admin_notifications"("legacyId");

-- CreateIndex
CREATE INDEX "admin_notifications_recipientId_idx" ON "admin_notifications"("recipientId");

-- CreateIndex
CREATE INDEX "admin_notifications_createdAt_idx" ON "admin_notifications"("createdAt");

-- CreateIndex
CREATE INDEX "admin_notifications_recipientId_isRead_createdAt_idx" ON "admin_notifications"("recipientId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "admin_notifications_adminId_idx" ON "admin_notifications"("adminId");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "settings_payment_gateways_settingsId_gatewayKey_key" ON "settings_payment_gateways"("settingsId", "gatewayKey");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_linkedAdminId_fkey" FOREIGN KEY ("linkedAdminId") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "designations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_references" ADD CONSTRAINT "employee_references_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variant_attributes" ADD CONSTRAINT "product_variant_attributes_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_cost_history" ADD CONSTRAINT "product_cost_history_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_cost_history" ADD CONSTRAINT "product_cost_history_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_embedded_reviews" ADD CONSTRAINT "product_embedded_reviews_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentCategoryId_fkey" FOREIGN KEY ("parentCategoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_return_items" ADD CONSTRAINT "order_return_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_return_items" ADD CONSTRAINT "order_return_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_payment_ipn_events" ADD CONSTRAINT "order_payment_ipn_events_orderPaymentId_fkey" FOREIGN KEY ("orderPaymentId") REFERENCES "order_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_payment_proofs" ADD CONSTRAINT "order_payment_proofs_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_payment_proofs" ADD CONSTRAINT "order_payment_proofs_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_notifications" ADD CONSTRAINT "order_notifications_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_alert_items" ADD CONSTRAINT "stock_alert_items_stockAlertId_fkey" FOREIGN KEY ("stockAlertId") REFERENCES "stock_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_alert_items" ADD CONSTRAINT "stock_alert_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "footer_columns" ADD CONSTRAINT "footer_columns_footerSettingsId_fkey" FOREIGN KEY ("footerSettingsId") REFERENCES "footer_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "footer_links" ADD CONSTRAINT "footer_links_footerColumnId_fkey" FOREIGN KEY ("footerColumnId") REFERENCES "footer_columns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "footer_social_links" ADD CONSTRAINT "footer_social_links_footerSettingsId_fkey" FOREIGN KEY ("footerSettingsId") REFERENCES "footer_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "footer_payment_gateways" ADD CONSTRAINT "footer_payment_gateways_footerSettingsId_fkey" FOREIGN KEY ("footerSettingsId") REFERENCES "footer_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "footer_payment_badges" ADD CONSTRAINT "footer_payment_badges_footerSettingsId_fkey" FOREIGN KEY ("footerSettingsId") REFERENCES "footer_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_shopping_items" ADD CONSTRAINT "note_shopping_items_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_notifications" ADD CONSTRAINT "admin_notifications_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_payment_gateways" ADD CONSTRAINT "settings_payment_gateways_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
