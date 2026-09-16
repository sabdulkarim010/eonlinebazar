# DATABASE MIGRATION AUDIT — MongoDB → PostgreSQL (Prisma + Neon)

**Created:** 2026-09-13
**Current stage:** 2 of 5 — Step 3 Part 2 (Designation, Brand, Warehouse, Supplier
dual-write) **COMPLETE** (Step 3 Part 1 Category pilot also complete; Step 1, 1b, and
Step 2 repository layer also complete)
**Artifacts produced:** `prisma/schema.prisma`, `prisma.config.js`,
`prisma/migrations/20260913131445_init_postgres_baseline/`, this file
**Application code changed:** none — no model, controller, route or service touched

> **Stage progress:** Stage 1 (schema design) complete 2026-09-13.
> Stage 2 Step 1 (Prisma connected to Neon, baseline migration applied) and
> Step 1b (the non-deprecated `prisma-client` generator made loadable from this
> CommonJS backend) both complete 2026-09-13 — see the dated sections at the end
> of this file. The live database is **still MongoDB** and remains authoritative;
> the Neon database exists but is empty and no application code reads from it.

---

## Scope of Stage 1 (historical — superseded by Stage 2 Step 1 below)

At the time of writing this was a **planning artifact only**. Nothing in the
running system read `prisma/schema.prisma`. No `.js` file under `backend/src/models/`,
`backend/src/controllers/` or `backend/src/routes/` was touched, no `.env` file
or `DATABASE_URL` was read or written, and no Prisma CLI command
(`generate` / `migrate` / `db push`) was run. The live MongoDB + Mongoose system
is unchanged and remains authoritative.

Source of truth for this design: all **40 model files** in
`backend/src/models/` (read in full) plus the **7 chat microservice models** in
`ecommerce-chat/models/`.

The Prisma schema declares **67 models** and **55 enums**. It is more than 40
models because every embedded MongoDB array and sub-document that needs
relational shape becomes its own table — see the mapping table below.

---

## Migration Roadmap

### Stage 1 — Schema design (this phase)

Design the PostgreSQL shape and write it down. No code changes, no database
connection, no data movement. Deliverables are `prisma/schema.prisma` and this
document. Exit criterion: a human review of the cascade strategy and the
HIGH RISK list below.

### Stage 2 — Dual-write layer

**Step 1 — environment setup + baseline migration: ✅ COMPLETE 2026-09-13.**
Prisma is installed and connected to Neon, and all 67 tables exist. Remaining
Stage 2 steps: the driver adapter + client singleton, the repository layer, the
two TTL sweep jobs, and the `tsvector` full-text migration.

Every **new** record is written to both MongoDB and PostgreSQL. **All reads
still come from MongoDB**, so a PostgreSQL write failure can never produce a
customer-visible error — it is logged and reconciled, not surfaced. Introduce a
thin repository layer that controllers call instead of touching Mongoose models
directly; the routes in `backend/src/routes/*.js` stay untouched, as they are
sacred. This is also where the two Mongo behaviours Postgres does not have get
replacements: the 30-day TTL on `LoginAttempt` and the `expiresAt` TTL on
`BlacklistedIp` become scheduled sweep jobs.

### Stage 3 — Backfill

Migrate existing MongoDB documents into PostgreSQL, oldest-first, in dependency
order (Category → Brand → Supplier → Warehouse → Attribute → Admin → Employee →
Product → User → Order → everything else). The `legacyId` column on every table
holds the original MongoDB `_id`, which makes the backfill **idempotent** — a
re-run upserts on `legacyId` instead of duplicating. `legacyId` is also how the
loose string references (`Order.items[].productId`, `Review.productId`,
`WishlistItem.productId`, `Settings.flashSaleProductIds`) get resolved into real
foreign keys. Exit criterion: row counts and financial aggregates
(order totals, wallet balances, expense sums) match between the two databases.

### Stage 4 — Read cutover

Switch reads to PostgreSQL **module by module**, least-connected first, so that
a rollback is always one flag away:

1. `Category`, `Supplier`, `Warehouse` — few inbound relations, low write volume
2. `Brand`, `Attribute`, `Designation`, `Shift`, `ExpenseCategory`
3. CMS and settings — `PageContent`, `NavbarLink`, `FooterSettings`, `Banner`, `Settings`
4. Security and audit — `SecurityLog`, `LoginAttempt`, `BlacklistedIp`, `StockAlert`
5. HRM — `Employee`, `Attendance`, `Payroll`, `Leave`
6. Marketing and support — `Newsletter`, `EmailCampaign`, `ContactMessage`, `Review`
7. `User` and its owned tables (`Address`, `WishlistItem`, `WalletTransaction`, `Cart`)
8. **`Order` and `Product` last** — the most connected, the most financially
   sensitive, and the ones whose embedded arrays changed shape the most

### Stage 5 — MongoDB decommission

Only after Stage 4 is fully verified stable in production **for a defined
period** (recommend a minimum of 30 days with dual-write still running and zero
reconciliation drift). Decommission means: stop dual-writing, archive a final
Mongo dump to cold storage, then remove the Mongoose models. Not before.

---

## Setup commands (RUN — Stage 2 Step 1, 2026-09-13)

Prisma **is now installed**, pinned to exact stable versions:

```bash
npm install prisma@7.10.0 --save-dev --save-exact
npm install @prisma/client@7.10.0 --save-exact
```

> **Why pinned, and why not `@latest`:** on 2026-09-13 the `prisma` package's npm
> `latest` dist-tag pointed at **`8.0.0-rc.14`**, a release candidate, while
> `@prisma/client@latest` was the stable `7.10.0`. A plain
> `npm install prisma --save-dev` therefore installs a pre-release CLI one major
> version ahead of the client. Both packages are pinned exactly, with no `^`, so
> that a fresh `npm install` can never silently pull an RC into a migration that
> will carry real financial data. **Re-pin deliberately when Prisma 8 goes GA;
> never run `npm i prisma@latest` on this repo without checking `dist-tags`.**

The Neon serverless adapter is **not yet installed** — it belongs with the
Stage 2 dual-write repository layer, which is the next step:

```bash
# NOT YET RUN — next step, when the repository layer is built
npm install @prisma/adapter-pg pg          # direct TCP, or
npm install @prisma/adapter-neon @neondatabase/serverless   # HTTP pooling
```

Verification and migration commands actually executed:

```bash
npx prisma validate    # parse + check the schema (no DB connection)
npx prisma format      # canonical formatting
npx prisma migrate dev --name init_postgres_baseline
npx prisma generate    # emit the client
```

### Environment variables (repo-root `.env`)

Both live in the repo-root `.env` alongside `JWT_SECRET`, `INTERNAL_API_KEY` and
the Cloudinary keys, per `ARCHITECTURE.md`. `.env` is gitignored and neither
value is recorded in this repo.

| Variable | Endpoint | Used by |
|---|---|---|
| `DATABASE_URL` | **direct** (non-pooled) Neon endpoint | Prisma CLI — `migrate`, `validate`, `diff`. Migrate requires a direct TCP connection and will misbehave through a pooler. |
| `DATABASE_URL_POOLED` | Neon **`-pooler`** endpoint | reserved for the runtime client via a driver adapter (Stage 2 next step). Never use for migrations. |

### Prisma 7 configuration layout

Prisma 7 **removed `url`, `directUrl` and `shadowDatabaseUrl` from the schema's
`datasource` block.** The connection URL now lives in `prisma.config.js` at the
repo root, which is CLI-only configuration — no application code reads it:

```js
require('dotenv').config();
const { defineConfig, env } = require('prisma/config');

module.exports = defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: { path: 'prisma/migrations' },
    datasource: { url: env('DATABASE_URL') },   // direct endpoint
});
```

The generator also changed. `prisma-client-js` is on Prisma's removal path, so
the schema uses the Rust-free `prisma-client` provider, which makes `output`
mandatory (the client is no longer emitted into `node_modules`). The final
option set — and why each option is there — is derived in **Stage 2 Step 1b**
below:

```prisma
generator client {
  provider               = "prisma-client"
  output                 = "../generated/prisma"
  runtime                = "nodejs"
  moduleFormat           = "esm"
  generatedFileExtension = "mts"
  importFileExtension    = "mts"
}

datasource db {
  provider = "postgresql"
}
```

`generated/prisma/` is **gitignored** — it is build output, recreated by
`npx prisma generate`. Any deploy or CI step that needs the client must run
`prisma generate` after `npm install`.

---

## Schema conventions

| Decision | Choice | Why |
|---|---|---|
| Primary keys | `String @id @default(uuid())` | MongoDB ObjectIds are already string-like, and the project's own ID patterns (`Employee.linkedAdminId`, `Attendance.staffId`, `Admin.employeeRef`) are strings. Avoids an int/string translation layer during Stage 3. |
| Legacy key | `legacyId String? @unique` on every top-level model | Holds the original Mongo `_id`. Makes the Stage 3 backfill idempotent and lets loose string refs be resolved to real FKs. |
| Field names | camelCase, identical to the Mongoose paths | Lets this file be diffed field-by-field against `backend/src/models/*.js`. The one exception is `OrderNotification.outForDelivery`, which maps to the snake_case Mongo key `out_for_delivery`. |
| Table names | snake_case plural via `@@map` | Idiomatic Postgres without 600 per-column `@map` attributes. |
| Money | `@db.Decimal(12, 2)` | Never float. 12 digits covers BDT amounts far beyond any realistic order. |
| Percentages / rates | `@db.Decimal(5, 2)` | Not money, must not share the money scale. Applies to `cashbackPercentage`, `vatPercentage`, `tierCashbackRate`, tier cashbacks, `Category.customCashback`, `flashSaleDiscountPercent`. |
| Hours | `@db.Decimal(6, 2)` | `Attendance.hoursWorked`, `Payroll.overtime` are hours, not currency. |
| Epoch-ms fields | `BigInt` | `Admin.otpExpiry` and `Admin.smsSetupOtpExpiry` are `Number` epoch milliseconds in Mongo, deliberately timezone-independent. Keeping them numeric preserves that. |
| Enum values | `UPPER_SNAKE` identifiers with `@map("<exact stored string>")` | The stored value stays byte-identical to Mongo, so Stage 3 inserts need no translation, while Prisma identifiers stay legal (`"Out for Delivery"`, `"half-day"`, `"_self"`, `"A+"` are all illegal as bare identifiers). |

### Money fields, exhaustively

Every field below is `Decimal @db.Decimal(12, 2)`:

- **User:** `walletBalance`, `referralEarnings`, `lifetimeSpend`
- **WalletTransaction:** `amount`
- **WishlistItem / CartItem:** `price`
- **Admin / Employee:** `baseSalary`
- **Payroll:** `baseSalary`, `bonus`, `overtimeRate`, `overtimeAmount`, `deductions`, `totalSalary`
- **Product / ProductVariant:** `price`, `buyingPrice`
- **ProductCostHistory:** `cost`
- **PurchaseOrder:** `totalCost`; **PurchaseOrderItem:** `unitCost`
- **Order:** `subTotal`, `deliveryCharge`, `grandTotal`, `totalAmount`, `totalBuyingPrice`, `subtotal`, `discountAmount`, `vatAmount`, `walletApplied`, `shippingFee`, `processingFee`, `refundAmount`, `rewardsCashbackAmount`
- **OrderItem:** `price`, `buyingPrice`
- **OrderPayment:** `processingFee`, `feeRate`, `feeBaseAmount`
- **OrderPaymentIpnEvent:** `amount`
- **OrderReturnItem:** `price`
- **Coupon:** `discountValue`, `minOrderAmount`, `maxDiscountAmount`
- **Expense:** `amount`
- **Note:** `amount`; **NoteShoppingItem:** `price`
- **PaymentMethod:** `processingFee`
- **Settings:** `deliveryInsideCity`, `deliveryOutsideCity`, `freeShippingMinAmount`, `freeShippingThreshold`, `vipMinTotalSpent`, `referralRewardAmount`, `silverThreshold`, `goldThreshold`, `platinumThreshold`

`loyaltyPoints`, `takaToPointsRatio` and `pointsToTakaConversionRate` are
deliberately **`Int`** — points are a count, not currency.

---

## Model-by-Model Mapping Table

Risk key: **Low** = flat document, direct copy. **Med** = renames, flattened
sub-objects, or loose string refs to resolve. **High** = embedded arrays becoming
tables, inconsistent types across documents, `Mixed`/untyped fields, or
constraints tightened relative to Mongoose.

### Store models (`backend/src/models/`)

| Mongoose Model | Postgres Table | Key Field Changes | Relation Type | Migration Risk |
|---|---|---|---|---|
| `User` (`user.js`) | `users` | `addresses[]`, `wishlist[]`, `walletHistory[]` extracted to tables. `referredBy` → self-FK `referredById`. `gender`, `accountStatus`, `loyaltyTier`, `profileUpdateType` → enums. Virtual `name` dropped (computed). | Self (referral); 1-to-many to Address, WishlistItem, WalletTransaction, UserSession, Cart, Note, Order, Review, CouponRedemption | **High** — 3 embedded arrays; also carries both a legacy flat address block (`address`/`district`/`upazila`/`thana`/`fullAddress`) and the `addresses[]` array, which must be reconciled |
| — `addresses[]` | `addresses` | Extracted. `_id` → `legacyId` | Many-to-one → User (Cascade) | **High** — embedded array → table |
| — `wishlist[]` (`wishlist.js`) | `wishlist_items` | Extracted. `productId` String kept as `legacyProductId` + nullable `productId` FK | Many-to-one → User (Cascade), Product (SetNull) | **High** — embedded array → table; loose product ref |
| — `walletHistory[]` | `wallet_transactions` | Extracted. `type` stays **String**, not an enum | Many-to-one → User (Cascade) | **High** — `type` is an open set: the model comment lists `CREDIT \| DEBIT \| conversion \| cashback \| refund` with no enum guard, so live rows mix casings |
| `UserSession` (`userSession.js`) | `user_sessions` | Direct | Many-to-one → User (Cascade) | Low |
| `Admin` (`admin.js`) | `admins` | `otpExpiry`/`smsSetupOtpExpiry` → `BigInt` (epoch ms). `permissions` stays `String[]`. `employeeRef` **dropped** — derived from the Employee back-relation | 1-to-1 → Employee; 1-to-many to 11 tables | **Med** — `select: false` secrets carry over as ordinary nullable columns; column-level secrecy must move into the repository layer |
| `AdminSession` (`adminSession.js`) | `admin_sessions` | `adminUsername` preserved; nullable `adminId` FK added | Many-to-one → Admin (Cascade) | **Med** — Mongo keys by username, not id |
| `Employee` (`employee.js`) | `employees` | `documents[]`, `references[]` extracted. `emergencyContact{}` flattened to 3 columns. `designation`/`shift` name strings keep a resolved FK beside them. `gender`/`bloodGroup`/`maritalStatus` enums drop their `''` member and become nullable | 1-to-1 → Admin (SetNull); FK → Designation (Restrict), Shift (SetNull) | **High** — 2 embedded arrays, a flattened sub-object, and 3 enums containing `''` |
| — `documents[]` | `employee_documents` | Extracted | Many-to-one → Employee (Cascade) | **High** |
| — `references[]` | `employee_references` | Extracted (`_id: false` in Mongo, so no `legacyId`) | Many-to-one → Employee (Cascade) | **High** |
| `Designation` (`designation.js`) | `designations` | Direct | 1-to-many → Employee | Low |
| `Shift` (`shift.js`) | `shifts` | `assignedStaff[]` (usernames) extracted | 1-to-many → ShiftAssignment, Employee | **Med** — string array → table |
| — `assignedStaff[]` | `shift_assignments` | Extracted; payload is a username, not an FK | Many-to-one → Shift (Cascade) | **Med** |
| `Attendance` (`attendance.js`) | `attendance` | `gpsLocation{lat,lng}` flattened. `staffId` + `staffType` polymorphic key kept, with nullable `adminId`/`employeeId` FKs added | Polymorphic → Admin or Employee (both SetNull) | **High** — polymorphic staff reference has no Postgres equivalent |
| `Payroll` (`payroll.js`) | `payrolls` | Same polymorphic staff handling. `overtime` is **hours** at `Decimal(6,2)`, not money | Polymorphic → Admin or Employee (SetNull) | **High** — polymorphic; every other column is currency |
| `Leave` (`leave.js`) | `leaves` | Same polymorphic staff handling. `approvedBy` stays a username String | Polymorphic → Admin or Employee (SetNull) | **High** — polymorphic |
| `Product` (`product.js`) | `products` | `variants[]`, `costHistory[]`, `reviews[]` extracted. `category` (a **name string**) → `categoryName` + nullable `categoryId` FK. `highlights`/`tags`/`images` stay `String[]` | FK → Category, Brand, Supplier, Warehouse, Admin (all SetNull); 1-to-many to 11 tables | **High** — 3 embedded arrays; `category` stored by name; `productId` unique-but-not-required in Mongo is **required** here |
| — `variants[]` | `product_variants` | Extracted. `attributes` Map extracted again into its own table | Many-to-one → Product (Cascade) | **High** — nested Map inside an embedded array |
| — `variants[].attributes` | `product_variant_attributes` | `Map<String,String>` → one row per entry | Many-to-one → ProductVariant (Cascade) | **High** — a Map has no relational equivalent |
| — `costHistory[]` | `product_cost_history` | Extracted, append-only | Many-to-one → Product (Cascade), Supplier (SetNull) | **High** |
| — `reviews[]` | `product_embedded_reviews` | Extracted. Legacy in-document reviews, **distinct from the standalone `Review` model** — both exist live | Many-to-one → Product (Cascade); `userId` left as a plain String | **High** — duplicate review storage; needs a Stage 3 decision on merging |
| `Category` (`category.js`) | `categories` | `customCashback` → `Decimal(5,2)` (a percentage). Virtual `hasChildren` dropped | Self-referencing hierarchy (SetNull); 1-to-many → Product | **Med** — self-relation and a manual `updatedAt` (no Mongoose `timestamps`) |
| `Brand` (`brand.js`) | `brands` | Direct | 1-to-many → Product | Low |
| `Attribute` (`attribute.js`) | `attributes` | `values[]` stays `String[]`. Virtual `terms` alias dropped | none | Low |
| `Supplier` (`supplier.js`) | `suppliers` | `suppliedProducts[]` extracted to a join table | 1-to-many → Product, PurchaseOrder (Restrict), ProductCostHistory | **Med** — ObjectId array → join table |
| — `suppliedProducts[]` | `supplier_products` | Join table. A display roster only; the authoritative link is `Product.supplierId` | Many-to-many Supplier ↔ Product (Cascade both) | **Med** |
| `Warehouse` (`warehouse.js`) | `warehouses` | Direct | 1-to-many → Product, PurchaseOrder | Low |
| `PurchaseOrder` (`purchaseOrder.js`) | `purchase_orders` | `items[]` extracted | FK → Supplier (**Restrict**), Warehouse (SetNull), Admin (SetNull) | **High** — embedded array; accounting document that must never cascade-delete |
| — `items[]` | `purchase_order_items` | Extracted. `productId` required in Mongo → nullable + SetNull here | Many-to-one → PurchaseOrder (Cascade), Product (SetNull) | **High** |
| `Order` (`order.js`) | `orders` | 5 embedded structures extracted (`items[]`, `returnItems[]`, `payment{}`, `paymentProof{}`, `notificationsSent{}`). `status` and 5 other fields → enums. `cancelledBy` drops its `''` member | FK → User (**SetNull**); 1-to-many/1-to-1 to 7 tables | **High** — the most decomposed model; also carries **both** `subTotal` and `subtotal` as separately-written fields |
| — `items[]` | `order_items` | Extracted. **`strict: false`** in Mongo, so undeclared keys land in an `extraFields Json?` column | Many-to-one → Order (Cascade), Product (SetNull) | **High** — schemaless sub-document; arbitrary fields in live data |
| — `returnItems[]` | `order_return_items` | Extracted. `photos[]` stays `String[]` | Many-to-one → Order (Cascade), Product (SetNull) | **High** |
| — `payment{}` | `order_payments` | Flattened to a 1-to-1 table; `ipnHistory[]` extracted further | 1-to-1 → Order (Cascade); FK → PaymentMethod (SetNull) | **High** — nested array inside a sub-document |
| — `payment.ipnHistory[]` | `order_payment_ipn_events` | Extracted. `raw` is **`Mixed`** → `Json?` | Many-to-one → OrderPayment (Cascade) | **High** — untyped gateway payload |
| — `paymentProof{}` | `order_payment_proofs` | 1-to-1 table | 1-to-1 → Order (Cascade); FK → Admin (SetNull) | **Med** |
| — `notificationsSent{}` | `order_notifications` | 1-to-1 table of 9 booleans; `out_for_delivery` is the only snake_case Mongo key | 1-to-1 → Order (Cascade) | **Med** |
| `Cart` (`cart.js`) | `carts` | `items[]` extracted | Many-to-one → User (Cascade); 1-to-many → CartItem | **High** — embedded array. Not unique on `userId`: Mongo has no such constraint, so duplicates may exist |
| — `items[]` | `cart_items` | Extracted | Many-to-one → Cart (Cascade), Product (**Cascade** — see below) | **High** |
| `Coupon` (`coupon.js`) | `coupons` | `usedBy[]` extracted to a redemption table | 1-to-many → CouponRedemption | **Med** |
| — `usedBy[]` | `coupon_redemptions` | Extracted. **Not** unique on (coupon, user) — repeats are how `perUserLimit` is counted | Many-to-one → Coupon (Cascade), User (Cascade) | **Med** |
| `Review` (`review.js`) | `reviews` | `productId` and `orderId` are plain Strings in Mongo → kept as `legacyProductId`/`legacyOrderId` plus a nullable `productId` FK. `userId` required in Mongo → nullable here | FK → User (SetNull), Product (SetNull) | **Med** — loose string refs |
| `Expense` (`expense.js`) | `expenses` | `category` is a **dynamic slug string** validated against the catalog at write time, not a Mongoose enum → kept as String + `expenseCategoryId` FK | FK → ExpenseCategory (**Restrict**) | **Med** |
| `ExpenseCategory` (`expenseCategory.js`) | `expense_categories` | Direct | 1-to-many → Expense | Low |
| `SecurityLog` (`securityLog.js`) | `security_logs` | `actorType` and the 20-value `RESOURCE_TYPES` → enums. `actor` stays a String | none — deliberately unlinked | Low |
| `LoginAttempt` (`loginAttempt.js`) | `login_attempts` | Direct | none | **Med** — the 30-day **TTL index has no Postgres equivalent**; needs a scheduled delete job in Stage 2 |
| `BlacklistedIP` (`blacklistedIp.js`) | `blacklisted_ips` | Direct | none | **Med** — same TTL problem, on `expiresAt` (`expireAfterSeconds: 0`); null means a permanent ban |
| `StockAlert` (`stockAlert.js`) | `stock_alerts` | `alertsSent{}` flattened to 3 booleans. Two embedded arrays collapsed into one child table | 1-to-many → StockAlertItem | **High** — two differently-shaped arrays merged |
| — `lowStockProducts[]` + `outOfStockProducts[]` | `stock_alert_items` | Merged, discriminated by `kind`. The out-of-stock shape has no `stock`/`threshold`, so both are nullable | Many-to-one → StockAlert (Cascade), Product (SetNull) | **High** — heterogeneous shapes in one table |
| `ContactMessage` (`ContactMessage.js`) | `contact_messages` | `status`/`priority` → enums. `assignedTo` stays an Admin **username** String (a loose ref by design) | none — deliberately unlinked | Low |
| `Newsletter` (`newsletter.js`) | `newsletters` | `tags[]` stays `String[]` | none | Low |
| `EmailCampaign` (`emailCampaign.js`) | `email_campaigns` | `stats{}` flattened to `statsTotalRecipients`/`statsSent`/`statsFailed` | FK → Admin (SetNull) | **Med** — flattened sub-object |
| `PaymentMethod` (`PaymentMethod.js`) | `payment_methods` | `apiConfig{}` flattened to 5 `api*` columns | 1-to-many → OrderPayment | **High** — `apiStorePassword` and `apiKey` are **AES-256-GCM envelopes** from `utils/cryptoVault.js`; Stage 3 must copy the ciphertext verbatim and must not re-encrypt |
| `Banner` (`banner.js`) | `banners` | `overlayOpacity` → `Decimal(3,2)` (a 0–1 fraction) | none | Low |
| `BannerSettings` (`banner.js`) | `banner_settings` | A de-facto singleton with **no key field** in Mongo; a `key` column is added so the singleton becomes enforceable | none | **Med** — added constraint |
| `PageContent` (`PageContent.js`) | `page_contents` | `contactMeta{}` flattened to 5 `contactMeta*` columns (populated only for the `contact` page) | none — linked to NavbarLink by **slug**, not FK | **Med** |
| `FooterSettings` (`FooterSettings.js`) | `footer_settings` | 4 embedded arrays extracted, one of them nested 2 deep | 1-to-many → 4 child tables | **High** |
| — `columns[]` | `footer_columns` | Extracted | Many-to-one → FooterSettings (Cascade) | **High** |
| — `columns[].links[]` | `footer_links` | Extracted from a **nested** array | Many-to-one → FooterColumn (Cascade) | **High** |
| — `socialLinks[]` | `footer_social_links` | Extracted | Many-to-one → FooterSettings (Cascade) | **High** |
| — `paymentGateways[]` | `footer_payment_gateways` | Extracted (full badge with icon metadata) | Many-to-one → FooterSettings (Cascade) | **High** |
| — `paymentBadges[]` | `footer_payment_badges` | Extracted. Kept **alongside** `paymentGateways` because in Mongo `undefined` means "not migrated yet" while `[]` means "intentionally cleared" — Stage 3 must preserve that distinction | Many-to-one → FooterSettings (Cascade) | **High** — tri-state field; two overlapping representations of the same data |
| `NavbarLink` (`NavbarLink.js`) | `navbar_links` | `target` → enum with `@map("_self")`/`@map("_blank")` | none — CMS page link is by **slug** | Low |
| `Note` (`note.js`) | `notes` | `shoppingItems[]` extracted. `tags[]` stays `String[]`. `amount` is `default: undefined` in Mongo → nullable | Many-to-one → User (Cascade) | **Med** |
| — `shoppingItems[]` | `note_shopping_items` | Extracted | Many-to-one → Note (Cascade) | **Med** |
| `AdminNotification` (`adminNotification.js`) | `admin_notifications` | `recipientId` String preserved; nullable `adminId` FK added | Many-to-one → Admin (Cascade) | Low |
| `Settings` (`Settings.js`) | `settings` + `settings_payment_gateways` | **This is the consolidated model.** `activePaymentGateways{}` flattened to 5 booleans; `paymentGateways{}` (5 nested objects) extracted to a child table; `flashSaleProductIds[]` stays `String[]` | 1-to-many → SettingsPaymentGateway (Cascade) | **High** — see the dedicated section below |
| `Setting` (`Setting.js`) | **none** | Consolidated into `Settings.js` on 2026-09-12; this file is now a 12-line re-export shim. The former `key: 'master'` document has no separate table | — | n/a — nothing to migrate |

### Chat microservice models (`ecommerce-chat/models/`) — deferred

These live in a **separate MongoDB database** (`ecommerce_chat`) behind a separate
Node service on port 5001. They are intentionally **out of scope for Stage 1**:
migrating them means merging two databases and unifying the `Agent` ↔ `Admin`
directory, which is a project in its own right. Listed here so the inventory is
complete.

| Mongoose Model | Postgres Table | Key Field Changes | Relation Type | Migration Risk |
|---|---|---|---|---|
| `ChatRoom` (`ChatRoom.model.js`) | *(deferred)* | 6 nested sub-schemas (`customer_profile` incl. a doubly-nested `defaultAddress`, `product_metadata`, `order_metadata` incl. an `items[]` array, `last_message_preview`, `rating_detail`, `internal_notes[]`); `tags[]` and `labels[]` are redundant twins | Cross-database → store `User`, `Order`, `Agent` | **High** — deepest nesting in the codebase; cross-DB refs |
| `ChatMessage` (`ChatMessage.model.js`) | *(deferred)* | `attachments[]`, `quick_replies[]`, `read_by[]`, `order_card{items[]}` all embedded | Many-to-one → ChatRoom | **High** — 4 embedded arrays |
| `Agent` (`Agent.model.js`) | *(deferred)* | `adminId` / `storeAdminUsername` are cross-database refs to store `Admin`; `active_chats[]` embedded | Cross-database → `Admin` | **High** — duplicate staff directory; must unify with `Admin` |
| `ChatSettings` (`ChatSettings.model.js`) | *(deferred)* | Singleton; `quickReplies[]` embedded | none | **Med** |
| `CannedResponse` (`CannedResponse.model.js`) | *(deferred)* | Mongo **text index** on `title`+`text` | FK → Agent | **Med** — text index needs a Postgres GIN equivalent |
| `AIKnowledgeBase` (`AIKnowledgeBase.model.js`) | *(deferred)* | `keywords[]` embedded | none | Low |
| `StoreConfig` (`AIKnowledgeBase.model.js`, 2nd export) | *(deferred)* | `handover_keywords[]`, `canned_responses[]` embedded | none | **Med** |
| `StoreUser` (`StoreUser.model.js`) | **none** | Read-only view over the shared `users` collection for `populate()`. Becomes a plain join once both systems share one database | — | n/a — not a real collection |

---

## HIGH RISK detail

### 1. Fields with inconsistent types or values across documents

| Where | Problem | Stage 1 decision |
|---|---|---|
| `Settings.defaultCourierProvider` | The Mongoose enum lists **the same three providers twice, in two casings**: `['Steadfast','Pathao','RedX','steadfast','pathao','redx','']`. Live rows are therefore inconsistent. | Left as **`String`**, not an enum. Normalise casing during Stage 3, then promote to an enum in a follow-up migration. |
| `User.walletHistory[].type` | Free `String` with `default: 'credit'`, but the field comment documents `CREDIT \| DEBIT \| conversion \| cashback \| refund` — mixed casing, no enum guard. | Left as **`String`**. Audit the distinct values in Stage 3 before promoting. |
| `Order.subTotal` vs `Order.subtotal` | Two separate fields differing only by capitalisation, **both written by live code**. `subTotal` is `required` with `min: 0`; `subtotal` is an optional "coupon/discount snapshot" for backwards compatibility. | **Both preserved.** Reconciling them is a Stage 3 data task, not a Stage 1 schema decision — collapsing them now would silently lose one value. |
| `Order.shippingLocationType` vs `Order.deliveryLocationType` | Two location fields with different vocabularies: `'Inside City'/'Outside City'` and `'inside'/'outside'`. | Two separate enums, `ShippingLocationType` and `DeliveryLocationType`. Faithful, if redundant. |
| `Settings.activePaymentGateways` vs `Settings.paymentGateways` | Two overlapping representations of the same five gateways — a flat boolean map and a map of `{enabled,name,logoUrl}` objects. | Both preserved: 5 `activeGateway*` booleans plus the `settings_payment_gateways` child table. |
| `FooterSettings.paymentGateways` vs `paymentBadges` | Same duplication, plus `paymentBadges` has **no default** because `undefined` means "not migrated yet" and `[]` means "intentionally cleared". | Both preserved as separate tables. Stage 3 must distinguish absent from empty, which a Postgres `NOT NULL DEFAULT '{}'` would destroy. |
| `Settings.announcementDiscount` | Declared `String` with `default: '2000'` — numeric-looking but stored as text. | Kept as `String`. Casting to a number during migration would be lossy for any non-numeric value already stored. |
| `Employee.gender` / `bloodGroup` / `maritalStatus`; `Order.cancelledBy`; `PaymentMethod.provider`; `Settings.smsGatewayProvider` / `whatsAppAlertProvider` | Every one of these enums includes `''` (empty string) as a legal member — a Mongo idiom for "not set" that Postgres enums cannot express. | The `''` member is **dropped from each enum** and the column is made **nullable**. Stage 3 maps `''` → `NULL`. |
| `Employee.designation` / `Employee.role`, `Employee.presentAddress` / `Employee.address` | Pairs kept in sync by a `pre('save')` hook, which means direct `updateOne` writes can desynchronise them. | Both columns preserved. The sync hook must be reimplemented in the Stage 2 repository layer or as a DB trigger. |

### 2. Untyped / `Mixed` fields

There is exactly **one** `mongoose.Schema.Types.Mixed` in the store models:

- `Order.payment.ipnHistory[].raw` → `OrderPaymentIpnEvent.raw Json?`. It is a raw
  gateway callback payload kept as an audit trail and never queried by shape, so
  `Json` is the correct destination rather than a set of columns.

Two further schemaless surfaces behave like `Mixed` even though they are not
declared as such:

- **`Order.items[]` is `strict: false`.** Order lines can carry any extra key the
  cart happened to send (`image`, `icon`, `slug`, …). Undeclared keys are
  captured in `OrderItem.extraFields Json?` rather than dropped. **Audit that
  column before Stage 5** and promote anything real into a typed column.
- **`Product.variants[].attributes` is a `Map<String,String>`.** A Map has no
  relational equivalent, so it becomes the `product_variant_attributes` table —
  one row per entry, which also makes "every variant where Color = Pink"
  indexable for the first time.

### 3. Constraints tightened relative to Mongoose

These are the only places where the Postgres schema is **stricter** than Mongo.
Each one can fail the Stage 3 backfill if legacy rows violate it, so verify with a
count query before migrating:

| Column | Mongoose | Postgres | Verify before Stage 3 |
|---|---|---|---|
| `Product.productId` | `unique: true`, **not** `required` | `String @unique` (NOT NULL) | `db.products.countDocuments({ productId: { $in: [null, ''] } })` |
| `PurchaseOrder.poNumber` | `unique: true`, **not** `required` | `String @unique` (NOT NULL) | same check on `poNumber` |
| `Employee.employeeId` | `unique: true`, **not** `required` | `String @unique` (NOT NULL) | same check on `employeeId` |
| `Category.slug` | `unique: true`, generated only when `name` is modified | `String @unique` (NOT NULL) | same check on `slug` |
| `BannerSettings.key` | field does not exist | `String @unique @default("global")` | collapse any duplicate `bannersettings` documents first |

### 4. The consolidated `Settings` model

`Setting.js` (the `key: 'master'` singleton) was **merged into `Settings.js`** (the
`key: 'global'` singleton) on 2026-09-12 — see the FINAL CLEANUP section of
`SYSTEM_ENTERPRISE_AUDIT.md`. `Setting.js` is now a 12-line deprecation shim
whose entire body is `module.exports = require('./Settings')`.

**`Settings.js` won.** The Prisma schema therefore has exactly one `settings`
table, modelled on `Settings.js`, containing the merged loyalty/cashback/VIP/
flash-sale/referral fields that used to live on the `master` row.

Two caveats for Stage 3:

- `scripts/mergeSettingsModels.js` must have been run against the target database
  first. Any environment still holding values only on the legacy `key: 'master'`
  row would migrate those values as defaults, silently resetting live
  configuration.
- `ARCHITECTURE.md` still described the pre-consolidation dual-singleton layout.
  That drift is corrected as part of this phase.

---

## Foreign Key & Indexing Strategy

### Cascade philosophy

`onDelete: Cascade` is used **only** for rows that are meaningless without their
parent — an order's line items, a user's addresses, a footer column's links.
Everything that crosses an aggregate boundary is `SetNull` or `Restrict`, because
this is a live e-commerce system where a careless delete must never be able to
destroy financial history.

The concrete rule: **deleting a catalog or directory record must never delete a
transaction.** Deleting a Category must not delete Products. Deleting a Supplier
must not delete Purchase Orders. Deleting a Product must not delete Order Items.
Deleting a PaymentMethod must not delete Orders.

### Every relation

| Relation | FK column | onDelete | Why |
|---|---|---|---|
| `Order` → `User` | `userId` (nullable) | **SetNull** | Guest checkout already produces orders with no user. Revenue history must survive account deletion. |
| `OrderItem` → `Order` | `orderId` | **Cascade** | A line item has no meaning without its order. |
| `OrderItem` → `Product` | `productId` (nullable) | **SetNull** | Order lines are financial history. The `name`/`price`/`buyingPrice` snapshots exist precisely so a deleted product still prints on the invoice. |
| `OrderReturnItem` → `Order` / `Product` | `orderId` / `productId` | **Cascade** / **SetNull** | Same reasoning as `OrderItem`. |
| `OrderPayment` → `Order` | `orderId` (unique) | **Cascade** | 1-to-1 owned sub-document. |
| `OrderPayment` → `PaymentMethod` | `methodId` (nullable) | **SetNull** | The snapshot columns (`code`, `name`, `accountNumber`, fees) exist so renaming, re-pricing or deleting a method leaves the ledger intact. |
| `OrderPaymentIpnEvent` → `OrderPayment` | `orderPaymentId` | **Cascade** | Owned audit trail. |
| `OrderPaymentProof` → `Order` | `orderId` (unique) | **Cascade** | Owned 1-to-1. |
| `OrderPaymentProof` → `Admin` | `reviewedById` (nullable) | **SetNull** | Who approved the proof must not gate deleting a staff account. |
| `OrderNotification` → `Order` | `orderId` (unique) | **Cascade** | Owned 1-to-1 flag set. |
| `Product` → `Category` | `categoryId` (nullable) | **SetNull** | **Explicitly not Cascade.** Deleting a category must leave its products intact and uncategorised, not delete the catalog. `categoryName` also survives as a snapshot. |
| `Product` → `Brand` | `brandId` (nullable) | **SetNull** | Same reasoning; `brandName` snapshot survives. |
| `Product` → `Supplier` | `supplierId` (nullable) | **SetNull** | A product outlives its vendor relationship. |
| `Product` → `Warehouse` | `warehouseId` (nullable) | **SetNull** | Null already means "the default warehouse". |
| `Product` → `Admin` | `createdById` (nullable) | **SetNull** | Authorship must not block staff offboarding. |
| `ProductVariant` → `Product` | `productId` | **Cascade** | Variants are the product. |
| `ProductVariantAttribute` → `ProductVariant` | `variantId` | **Cascade** | Owned Map entry. |
| `ProductCostHistory` → `Product` | `productId` | **Cascade** | Owned trail. |
| `ProductCostHistory` → `Supplier` | `supplierId` (nullable) | **SetNull** | Keeps the cost figure after the vendor row goes. |
| `ProductEmbeddedReview` → `Product` | `productId` | **Cascade** | Legacy in-document reviews are part of the product document. |
| `Category` → `Category` (self) | `parentCategoryId` (nullable) | **SetNull** | Deleting a parent **promotes its children to root** rather than destroying a whole subtree. |
| `PurchaseOrder` → `Supplier` | `supplierId` (**required**) | **Restrict** | A PO is an accounting document. Deleting a vendor must *fail* while POs exist. This matches `supplierController.js`, which already refuses to delete a supplier with open POs. |
| `PurchaseOrder` → `Warehouse` | `warehouseId` (nullable) | **SetNull** | Falls back to the default warehouse. |
| `PurchaseOrder` → `Admin` | `createdById` (nullable) | **SetNull** | `createdByName` snapshot survives. |
| `PurchaseOrderItem` → `PurchaseOrder` | `purchaseOrderId` | **Cascade** | Owned line. |
| `PurchaseOrderItem` → `Product` | `productId` (nullable) | **SetNull** | The `productName` snapshot exists exactly for this case. |
| `SupplierProduct` → `Supplier` / `Product` | both | **Cascade** / **Cascade** | This join table is only a display roster; the authoritative link is `Product.supplierId`, so removing either end just removes a hint. |
| `Cart` → `User` | `userId` | **Cascade** | A cart is user-owned session state. |
| `CartItem` → `Cart` | `cartId` | **Cascade** | Owned line. |
| `CartItem` → `Product` | `productId` | **Cascade** | **The one place Cascade-from-Product is correct**: a deleted product must vanish from open carts. Unlike order lines, cart lines are not history. |
| `Address` / `WishlistItem` / `WalletTransaction` / `UserSession` / `Note` → `User` | `userId` | **Cascade** | Owned personal data; also the right answer for the Play-Store account-deletion flow. |
| `WishlistItem` → `Product` | `productId` (nullable) | **SetNull** | Wishlists routinely outlive the products in them; `legacyProductId` keeps the raw value. |
| `NoteShoppingItem` → `Note` | `noteId` | **Cascade** | Owned line. |
| `User` → `User` (self, referral) | `referredById` (nullable) | **SetNull** | Removing a referrer must not delete the people they referred. |
| `CouponRedemption` → `Coupon` / `User` | both | **Cascade** / **Cascade** | Redemption rows are joint-owned and carry no independent value. |
| `Review` → `User` | `userId` (nullable) | **SetNull** | **Anonymises** rather than destroys product feedback when an account is erased. |
| `Review` → `Product` | `productId` (nullable) | **SetNull** | Non-destructive by default; purging orphaned reviews should be an explicit job, not a side effect. |
| `Employee` → `Admin` | `linkedAdminId` (unique, nullable) | **SetNull** | Revoking or deleting panel access must never delete the HR record. This is the single stored representation of the 1:1 grant-access link. |
| `Employee` → `Designation` | `designationId` (nullable) | **Restrict** | Mirrors the existing controller rule that a designation cannot be deleted while employees still carry its name. |
| `Employee` → `Shift` | `shiftId` (nullable) | **SetNull** | Rosters change; the `shift` name snapshot survives. |
| `EmployeeDocument` / `EmployeeReference` → `Employee` | `employeeId` | **Cascade** | Owned attachments. |
| `Attendance` / `Payroll` / `Leave` → `Admin` **or** `Employee` | `adminId` / `employeeId` (both nullable) | **SetNull** | Polymorphic staff reference — see below. Payroll and attendance records are financial and statutory; they must outlive the staff row. |
| `ShiftAssignment` → `Shift` | `shiftId` | **Cascade** | Owned roster entry. |
| `AdminSession` → `Admin` | `adminId` (nullable) | **Cascade** | A deleted admin must not leave live sessions behind. |
| `AdminNotification` → `Admin` | `adminId` (nullable) | **Cascade** | A personal inbox has no meaning without its owner. |
| `EmailCampaign` → `Admin` | `createdById` (nullable) | **SetNull** | Campaign stats outlive their author. |
| `Expense` → `ExpenseCategory` | `expenseCategoryId` (nullable) | **Restrict** | Matches `expenseCategoryController.js`, which blocks deleting a category that still has expenses. Also protects P&L rollups. |
| `StockAlertItem` → `StockAlert` / `Product` | both | **Cascade** / **SetNull** | Owned run detail; product may be gone. |
| `FooterColumn` / `FooterSocialLink` / `FooterPaymentGateway` / `FooterPaymentBadge` → `FooterSettings` | `footerSettingsId` | **Cascade** | Owned singleton children. |
| `FooterLink` → `FooterColumn` | `footerColumnId` | **Cascade** | Owned nested child. |
| `SettingsPaymentGateway` → `Settings` | `settingsId` | **Cascade** | Owned singleton child. |

### Deliberately un-linked references

These stay loose Strings because Mongo stores them loosely and turning them into
foreign keys would change behaviour:

| Field | Reason |
|---|---|
| `SecurityLog.actor` | An audit trail whose actors were FK-nulled is useless. Audit rows must outlive accounts. |
| `Leave.approvedBy`, `Shift.createdBy`, `Payroll.createdBy`, `Employee.createdBy`, `Designation.createdBy`, `Expense.recordedBy`, `Order.createdByAdmin`, `PaymentMethod.createdByAdmin`/`updatedByAdmin`, `PageContent.updatedByAdmin` | Usernames captured as an immutable stamp at the time of the action. |
| `ContactMessage.assignedTo` | An Admin username; the model comment marks it explicitly as a loose ref. |
| `AdminSession.adminUsername`, `Attendance.staffUsername`, `Payroll.staffUsername`, `Leave.staffUsername`, `ShiftAssignment.staffUsername` | HRM keys staff by username throughout, not by ObjectId. |
| `Order.assignedStaffId` | POS/manual orders also store values that are not Admin ids. |
| `NavbarLink.slug` ↔ `PageContent.slug` | The CMS page is created by slug sync, not by FK. Preserved as-is. |
| `Settings.flashSaleProductIds[]` | A loose id array; resolve to FKs in Stage 3 only if flash sales need integrity. |
| `ProductEmbeddedReview.userId` | Legacy embedded reviews; the standalone `Review` model is the live path. |

### Polymorphic staff references

`Attendance`, `Payroll` and `Leave` all key staff by `staffId` **plus** a
`staffType` discriminator of `'admin' | 'employee'`, because login-capable
`Admin` accounts and non-login `Employee` records both participate in HRM.
PostgreSQL cannot foreign-key a column that points at two tables.

The chosen resolution keeps `staffId` and `staffType` verbatim **and** adds
nullable `adminId` and `employeeId` FKs. Exactly one is populated, selected by
`staffType`. This gives real referential integrity from Stage 3 onward without
breaking the existing discriminator that every HRM controller reads. A unified
`Staff` supertype table would be cleaner long-term but is a much larger Stage 4
change and is deliberately out of scope here.

### Index strategy

Every `.index(...)` call and every `unique: true` field in the Mongoose models is
replicated as `@@index` / `@@unique` / `@unique`. Notable points:

- **Sparse unique → nullable unique.** `Product.slug`, `User.referralCode` and
  `ContactMessage.ticketNumber` are `unique: true, sparse: true` in Mongo. A
  nullable unique column in Postgres is the exact equivalent, since Postgres
  does not consider two NULLs equal.
- **Compound index order is preserved** exactly as declared, because prefix order
  determines which queries an index can serve. Example: `Category` keeps all four
  storefront compounds (`{parentCategory, position, name}`,
  `{isActive, parentCategory, position}`, `{isActive, showInNavbar, parentCategory, position}`,
  `{isActive, showInHomepage, parentCategory, position}`).
- **Descending index directions are dropped.** Mongo declares things like
  `{createdAt: -1}` and `{staffId: 1, date: -1}`; Prisma's `@@index` has no
  direction argument, and PostgreSQL B-trees can be scanned backwards at no cost,
  so a plain ascending index serves the same `ORDER BY … DESC` queries.
- **New indexes added for the new FK columns** (`adminId`, `employeeId`,
  `categoryId`, `productId`, `expenseCategoryId`, …), since Postgres does not
  index foreign keys automatically and Stage 4 joins will need them.
- **Unique constraints replicated:** `User.email`, `User.referralCode`,
  `Admin.username`, `Employee.employeeId`, `Employee.linkedAdminId`,
  `Designation.name`, `Product.productId`, `Product.slug`, `Category.name`,
  `Category.slug`, `Brand.name`, `Attribute.name`, `Coupon.code`,
  `PurchaseOrder.poNumber`, `PaymentMethod.code`, `ExpenseCategory.name`,
  `ExpenseCategory.slug`, `Newsletter.email`, `BlacklistedIp.ip`,
  `PageContent.slug`, `ContactMessage.ticketNumber`, `UserSession.sessionId`,
  `AdminSession.sessionId`, `Settings.key`, `FooterSettings.key`,
  plus the compound `Payroll @@unique([staffId, year, month])` and the derived
  `ProductVariantAttribute @@unique([variantId, name])`,
  `ShiftAssignment @@unique([shiftId, staffUsername])`,
  `SupplierProduct @@unique([supplierId, productId])`,
  `SettingsPaymentGateway @@unique([settingsId, gatewayKey])`.

### Three Mongo index behaviours with no Prisma equivalent

These need explicit work in Stage 2 — they are **not** expressible in
`schema.prisma` and would be silently lost otherwise:

1. **`Product` text index.** `ProductTextIndex` is a weighted MongoDB text index
   over 7 fields (`name` ×10, `tags` ×8, `brandName` ×6, `category` ×5,
   `highlights` ×3, `description` ×2, `detailedDescription` ×1). Prisma's
   `@@fulltext` supports MySQL and MongoDB only, not PostgreSQL. Replacement: a
   generated `tsvector` column with `setweight()` matching those weights plus a
   GIN index, added via a hand-written SQL migration.
2. **`LoginAttempt` TTL** — `{createdAt: 1}, {expireAfterSeconds: 2592000}`
   (30 days). Postgres has no TTL. Replacement: a scheduled delete job.
3. **`BlacklistedIp` TTL** — `{expiresAt: 1}, {expireAfterSeconds: 0}`, where a
   null `expiresAt` means a permanent ban. Replacement: a scheduled sweep that
   deletes `WHERE expiresAt IS NOT NULL AND expiresAt < now()`.

---

## Excluded/Deferred Fields

Re-read of every Mongoose model against the Prisma schema. Every field is
accounted for; the ones **not** carried over as a stored column are listed here
with the reason.

### Intentionally excluded — Mongoose virtuals (computed, never stored)

| Field | Model | Reason |
|---|---|---|
| `name` | `User` | Virtual getter returning `firstName + lastName` with a legacy-`name` fallback. Compute in the application layer. |
| `hasChildren` | `Category` | Virtual count of children via `parentCategory`. Replaced by the `children` back-relation. |
| `terms` | `Attribute` | Virtual get/set alias for `values`. The canonical field is `values`. |
| `user`, `customerId` | `ChatRoom` | Virtual populate aliases, both pointing at `user_id`. (Chat is deferred anyway.) |
| `displayName` | `StoreUser` | Virtual over a read-only view of the `users` collection. |

### Intentionally excluded — redundant, derived, or dead

| Field | Model | Reason |
|---|---|---|
| `employeeRef` | `Admin` | The **same 1:1 edge as `Employee.linkedAdminId`, stored twice**. Postgres models a 1:1 with one FK plus a back-relation; storing both sides invites divergence. The stored FK lives on `Employee`; `Admin.employee` is the back-relation. |
| legacy `name` field | `User` | Not a schema path — read only by the `pre('validate')` migration hook that splits it into `firstName`/`lastName`. Handled by the backfill, not by a column. |
| entire `Setting.js` model | — | Consolidated into `Settings.js` on 2026-09-12; the file is now a re-export shim with no schema of its own. |
| `wishlist.js` as a model | — | Exports only `wishlistItemSchema`, never `mongoose.model()`. It is the shape of `User.wishlist[]` and appears as the `wishlist_items` table. |

### Deferred to a later stage

| Field / behaviour | Model | Reason |
|---|---|---|
| `ProductTextIndex` weighted text search | `Product` | Not expressible in Prisma for PostgreSQL. Needs a `tsvector` + GIN migration in Stage 2. |
| `LoginAttempt` 30-day TTL | `LoginAttempt` | Needs a scheduled delete job. |
| `BlacklistedIp` `expiresAt` TTL | `BlacklistedIp` | Needs a scheduled sweep job. |
| `select: false` secrecy on `otp`, `otpExpiry`, `totpSecret`, `totpPendingSecret`, `smsSetupOtp`, `smsSetupOtpExpiry` | `Admin` | Prisma has no column-level `select: false`. The columns exist and hold the same values; the "never return this by default" guarantee must be reimplemented in the Stage 2 repository layer (explicit `select` clauses), **not** left to callers. |
| `Order.items` undeclared keys | `OrderItem` | Captured in `extraFields Json?` rather than dropped. Audit and promote to typed columns before Stage 5. |
| `Settings.flashSaleProductIds[]` | `Settings` | Left as `String[]`; resolve to real FKs only if flash sales need referential integrity. |
| Casing normalisation of `Settings.defaultCourierProvider` and `User.walletHistory[].type` | — | Data cleanup task for Stage 3, after which both can become enums. |
| All 7 chat microservice models | `ecommerce-chat/models/` | Separate database and separate service. Migrating them means unifying the `Agent` ↔ `Admin` staff directory — its own project. |

### Behaviour that lives in Mongoose hooks and must be reimplemented

Not fields, but not free either. Each of these is application logic that
currently rides on a `pre('save')` hook and will **not** fire on a Prisma write:

| Hook | Model | What it does |
|---|---|---|
| `hashPassword` | `Admin` | bcrypt-hashes on write unless the value is already a digest; also transparently upgrades legacy plaintext. |
| `ensureReferralCode` | `User` | Generates an 8-char code from an unambiguous alphabet, with a collision retry loop. |
| `ensureTicketNumber` | `ContactMessage` | Generates `TKT-YYYY-XXXX`. |
| `computeHoursWorked` | `Attendance` | Derives `hoursWorked` from clock in/out. |
| `applyTotals` | `Payroll` | Derives `overtimeAmount` and `totalSalary`. |
| `applyTotalDays` | `Leave` | Derives inclusive `totalDays`. |
| `computeTotalCost` | `PurchaseOrder` | Keeps `totalCost` in sync with the line items. |
| `syncEmployeeAliases` | `Employee` | Keeps `designation`↔`role` and `presentAddress`↔`address` in step. |
| slug generation | `Category`, `Brand`, `Attribute`, `NavbarLink` | Auto-slug from name/title, including the Bengali Unicode range. |
| `syncStatusFromExpiry` | `Coupon` | Derives `status`/`isActive` from `expiryDate`. |
| `markCartActivity` | `Cart` | Bumps `lastActivityAt` and re-arms `abandonedNotifiedAt`. |
| `renderBodyHtml` | `PageContent` | Renders `bodyMarkdown` → `bodyHtml` for markdown pages only. |
| `sealApiCredentials` | `PaymentMethod` | AES-256-GCM-encrypts gateway secrets and wipes them for manual methods. |

**Recommendation:** implement these in the Stage 2 repository layer rather than as
database triggers, so the logic stays in one place and stays testable while both
databases are live.

---

## Stage 1 verification

Self-check performed by re-reading every model in `backend/src/models/` against
the finished schema:

- **40 model files read in full**, plus 7 chat microservice models.
- **67 Prisma models, 55 Prisma enums.** Every enum value is copied verbatim from
  a Mongoose `enum` array — no invented values. Every enum declared is used.
- **Every field is accounted for**: either present as a column, or listed above
  with a reason.
- Every `required: true` in Mongoose maps to a non-nullable Postgres column, and
  every Mongoose default is carried over, **except** the five deliberate
  loosenings (`Review.userId`, `Review.productId`, `PurchaseOrderItem.productId`,
  `ProductEmbeddedReview.userId`, `Employee.linkedAdminId`) and the five
  deliberate tightenings listed under "Constraints tightened".

**Not done in Stage 1, by design:** no `prisma validate` / `generate` /
`migrate` / `db push`, no `DATABASE_URL`, no `npm install`, no changes to any
`.js` file. Schema validation was the first task of Stage 2 — carried out below.

---

## STAGE 2 STEP 1 — Environment Setup & Migration — 2026-09-13

Prisma is connected to the Neon PostgreSQL database and the 67-model baseline
migration has been created and applied. **No Mongoose model, controller, route or
service file was touched, and no application code queries PostgreSQL yet.** The
live MongoDB system is unchanged and still serves every request.

### Packages installed

| Package | Version | Type | Note |
|---|---|---|---|
| `prisma` | `7.10.0` (exact) | devDependency | CLI — validate / format / migrate / generate |
| `@prisma/client` | `7.10.0` (exact) | dependency | generated query client runtime |

No existing dependency version was altered — the `package.json` diff is exactly
two added lines. Both Prisma packages are pinned **without a `^` range**, because
the `prisma` package's npm `latest` tag was serving the pre-release
`8.0.0-rc.14` while `@prisma/client@latest` was the stable `7.10.0`; an
unpinned install produces a CLI one major ahead of the client. The Neon/pg
driver adapter is deliberately **not** installed yet — it arrives with the
repository layer in the next step.

### Environment verification (read-only)

`DATABASE_URL` and `DATABASE_URL_POOLED` are both present and non-empty in the
repo-root `.env`, and both begin with `postgresql://`. `DATABASE_URL` is the
**direct** endpoint and `DATABASE_URL_POOLED` is the Neon `-pooler` endpoint, so
Migrate correctly runs over a direct TCP connection. The two keys are the last
two entries of a 92-key file; every pre-existing Mongoose/auth variable
(`MONGODB_URI`, `JWT_SECRET`, `INTERNAL_API_KEY`, the Cloudinary and gateway
keys) is untouched and still non-empty. **No connection string value was printed,
logged or committed at any point.** `.env` is confirmed gitignored
(`.gitignore:5`, verified with `git check-ignore`).

One pre-existing observation, unrelated to this task and safe: `MONGO_URI` is
declared but empty. `backend/src/config/db.js` reads
`process.env.MONGODB_URI || process.env.MONGO_URI`, and `MONGODB_URI` is set, so
`MONGO_URI` is a dead fallback key.

### Validation result

`npx prisma validate` **initially failed** with one error — and it was a real
incompatibility, not a schema defect:

```
Error code: P1012
error: The datasource property `url` is no longer supported in schema files.
  -->  prisma\schema.prisma:29
```

**What was wrong:** the Stage 1 schema was written against Prisma 6 conventions.
Prisma 7 removed `url` / `directUrl` / `shadowDatabaseUrl` from the `datasource`
block entirely and moved connection configuration into a root
`prisma.config.{js,ts}` file. It also deprecated the `prisma-client-js` generator
in favour of the Rust-free `prisma-client`, which requires an explicit `output`
because the client is no longer written into `node_modules`.

**How it was fixed** — no model, field, relation, enum, index or constraint was
changed; the fix was confined to the two configuration blocks plus one new file:

1. Removed `url = env("DATABASE_URL")` from `datasource db`, leaving only
   `provider = "postgresql"`.
2. Switched the generator to `provider = "prisma-client"` with
   `output = "../generated/prisma"`. The remaining generator options — the ones
   that make a TypeScript-emitting generator loadable from this CommonJS
   backend — were settled in Step 1b below.
3. Added `prisma.config.js` at the repo root supplying
   `datasource.url = env('DATABASE_URL')`.

After that: **`The schema at prisma\schema.prisma is valid 🚀`** — 67 models and
55 enums, zero errors and zero warnings. `npx prisma format` then applied
canonical formatting with no logic change.

### Migration created

| Item | Value |
|---|---|
| Migration name | `20260913131445_init_postgres_baseline` |
| File | `prisma/migrations/20260913131445_init_postgres_baseline/migration.sql` |
| Size | 2,392 lines of SQL |
| Command | `npx prisma migrate dev --name init_postgres_baseline` |
| Result | created and applied cleanly — *"Your database is now in sync with your schema."* |
| Data-loss prompt | none (the Neon database was empty) |
| Force flags used | **none** — no `db push`, no `--accept-data-loss`, no `--force` |
| Target | Neon database `neondb`, schema `public`, region `ap-southeast-1` |

### Neon database structure

| Object | Count | Matches schema? |
|---|---|---|
| `CREATE TABLE` | **67** | ✅ exactly one per Prisma model |
| `CREATE TYPE` (enums) | **55** | ✅ exactly one per Prisma enum |
| `CREATE UNIQUE INDEX` | 83 | unique + compound-unique constraints |
| `CREATE INDEX` | 133 | replicated Mongoose indexes + new FK indexes |
| `FOREIGN KEY` constraints | 70 | per-relation `onDelete` as designed |

The table count is **67, matching the 67 models one-for-one with no unexplained
extras**. Notably there are **zero implicit many-to-many join tables** (no
`CREATE TABLE "_…"` statements): the one many-to-many relation in the schema,
Supplier ↔ Product, is declared as the **explicit** `SupplierProduct` model
(`supplier_products`), so Prisma had no reason to synthesise a join table. That
was a deliberate Stage 1 choice and it means every table in Neon corresponds to a
named model that can be reasoned about and backfilled directly.

Counting physical tables in Neon, there are **68**: the 67 model tables plus
Prisma's own `_prisma_migrations` bookkeeping table, which records migration
history and is not part of the data model.

Independently verified with
`npx prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --exit-code`
→ **"No difference detected."** (exit code 0), and `npx prisma migrate status` →
*"1 migration found… Database schema is up to date!"*. The live Neon structure
therefore matches the schema exactly, with no drift.

### Client generation

`npx prisma generate` → **`Generated Prisma Client (7.10.0) to .\generated\prisma`**.

Spot-check: `generated/prisma/models/` contains **67 files**, and a sorted
name-by-name comparison against the `model` declarations in `schema.prisma`
returned an **exact match** — every model is present, none extra, none missing.
`generated/prisma/enums.mts` carries all 55 enums. (The generated file extension
is `.mts` rather than `.ts` — see Step 1b for why.)

### Test result — MongoDB confirmed untouched

```
Test Suites: 16 passed, 16 total
Tests:       166 passed, 166 total
```

**166/166 passing**, identical to before this task. Nothing in the Postgres setup
touched the Mongoose runtime, which is the isolation this step was meant to prove.

### Generated client output format

`prisma-client` emits TypeScript, and this backend is plain CommonJS JavaScript
with no TypeScript toolchain — so how the generated client gets loaded needed a
deliberate answer rather than a default. That is resolved in **Step 1b** below,
which is the single authoritative account of the generator configuration.

---

## STAGE 2 STEP 1B — Loading the Generated Client from CommonJS — 2026-09-13

The generator stays on **`prisma-client`**, the current non-deprecated provider,
and the generated client is loaded from this plain-CommonJS backend with
**`require()`, no build step, and no new dependency**. Nothing under
`backend/src/` was touched and `package.json` was not modified.

> **Correction footnote.** An earlier pass at this step reverted the generator to
> `prisma-client-js`. That was the wrong direction — Prisma has marked that
> provider deprecated and slated for removal, so it would only have to be
> migrated away from again later. This section replaces that account entirely and
> describes the configuration actually in the schema today.

### What `prisma-client` can and cannot emit in 7.10.0 — verified, not assumed

`prisma-client` emits **TypeScript only**. There is no option that makes it write
plain `.js`. This was confirmed three independent ways against this exact version:

| Evidence | Finding |
|---|---|
| [Prisma v7 generators reference](https://www.prisma.io/docs/orm/prisma-schema/overview/generators) | The `prisma-client` field reference lists five options. `generatedFileExtension` is *"File extension for generated **TypeScript** files (`ts`, `mts`, `cts`)"*. `moduleFormat` *"determines whether `import.meta.url` or `__dirname` is used"* — nothing more. The generator "outputs plain TypeScript". |
| Shipped CLI bundle `node_modules/prisma/build/cli.js` (7.10.0) | The generated-extension allowlist is literally `["ts","mts","cts"]`. `importFileExtension` separately allows `["","ts","mts","cts","js","mjs","cjs"]`, but it only rewrites **import specifiers**, not the files emitted. |
| Empirical run | Setting `generatedFileExtension = "js"` with `moduleFormat = "cjs"` produced the warning *`Generated file extension "js" is unexpected and may be a mistake. Expected one of: "ts", "mts", "cts"`* and emitted files **named** `.js` whose contents were still TypeScript ESM (`as const`, `export type`, `import * as runtime from "@prisma/client/runtime/client"`). `require()` of one failed with `SyntaxError: Cannot use import statement outside a module`. |

The decisive point: **`moduleFormat = "cjs"` does not change the emitted syntax.**
It was also tested with `generatedFileExtension = "cts"`; the output still used
ESM `import`/`export`, so Node rejected it as CommonJS with the same
`SyntaxError`. There is no combination of generator options that yields
`require()`-able CommonJS.

### The configuration that does work

Instead of transpiling TypeScript into JavaScript, the output is emitted as
**`.mts`** and Node loads it directly. Two Node capabilities combine to make this
work with no toolchain at all:

| Node capability | Unflagged since | What it gives us |
|---|---|---|
| Native TypeScript **type stripping** | **22.18.0** (LTS backport) / **23.6.0** | Node runs `.mts` by erasing type annotations in-place. No type checking, no source maps needed, no compiler. |
| **`require(esm)`** — synchronous `require()` of ESM | **20.19.0** / **22.12.0** / **23.0.0** | A CommonJS `.js` file can `require()` an ES module synchronously, provided the module graph has no top-level `await`. |

Type stripping is the stricter of the two, so the effective floor is
**Node >= 22.18.0**. This machine runs **24.16.0**, where both are unflagged and
emit **no warning at all** (verified: `process.features.require_module === true`,
and a plain `node -e "require(...)"` printed nothing but the expected output).

```prisma
generator client {
  provider               = "prisma-client"
  output                 = "../generated/prisma"
  runtime                = "nodejs"
  moduleFormat           = "esm"
  generatedFileExtension = "mts"
  importFileExtension    = "mts"
}
```

Why each option is present:

| Option | Reason it is set explicitly |
|---|---|
| `provider = "prisma-client"` | The current, non-deprecated generator. Deliberately **not** `prisma-client-js`. |
| `output = "../generated/prisma"` | Mandatory in Prisma 7 — the client is no longer written into `node_modules`. |
| `runtime = "nodejs"` | Already the default; stated so the target runtime is visible in the schema. |
| `moduleFormat = "esm"` | **Load-bearing.** `package.json` is `"type": "commonjs"`, so inference would pick `cjs` and emit `__dirname`, which does not exist inside a `.mts` module. Must stay `esm`. |
| `generatedFileExtension = "mts"` | The whole mechanism. `.mts` is what Node treats as type-strippable ESM. `.ts` would inherit the ambient CommonJS `package.json` type and fail; `.cts` is parsed as CommonJS and rejects the generator's ESM syntax. |
| `importFileExtension = "mts"` | Makes the generated imports (`from "./enums.mts"`) point at files that actually exist on disk, which is what Node's resolver needs. |

`prisma.config.js` was **not changed** — this is purely generator configuration
and nothing about it touches the CLI's datasource wiring.

### Regeneration result

`npx prisma validate` → **`The schema at prisma\schema.prisma is valid 🚀`**

`generated/` was deleted first so the inventory below is a clean generation, not a
mix of leftovers from earlier attempts:

`npx prisma generate` → **`✔ Generated Prisma Client (7.10.0) to .\generated\prisma in 482ms`**, with **no warnings**.

| Item | Result |
|---|---|
| Files emitted | **75 `.mts` files**, zero `.js`, zero `.ts`, zero `.d.ts` |
| Top level | `client.mts`, `browser.mts`, `models.mts`, `enums.mts`, `commonInputTypes.mts` |
| `models/` | 67 files — one per Prisma model |
| `internal/` | `class.mts`, `prismaNamespace.mts`, `prismaNamespaceBrowser.mts` |

### Smoke test — `require()` from plain CommonJS Node

**The entry path is `generated/prisma/client.mts`, not the directory.** This was
verified rather than assumed: the output contains no `index` file and no
`package.json`, so `require('./generated/prisma')` fails with
`MODULE_NOT_FOUND`. Bare-directory imports are a `prisma-client-js` habit that
does not carry over.

```bash
node -e "const m = require('./generated/prisma/client.mts'); ..."
```

```
entry: ./generated/prisma/client.mts
PrismaClient is a constructor: true
Prisma.Decimal: function
enums exported: 55
sample enum UserGender.MALE: MALE
node: v24.16.0 | require_module: true
```

`PrismaClient` loads as a constructor, `Prisma.Decimal` is available, and all
**55 enums** are exported as real runtime values. Constructing
`new PrismaClient({ adapter: {} })` then failed with
`PrismaClientInitializationError: The Driver Adapter ... is not compatible with
the provider postgres` — thrown from `@prisma/client/runtime/client.js`, which
confirms the runtime fully engaged. A real driver adapter is the next step and is
not installed yet, so that error is the expected and correct outcome here.

**Note on what the generated files are.** They are TypeScript ESM, *not* CommonJS
JavaScript — they contain `import`/`export` and `export type`. The claim being
made is narrower and more useful: Node executes them directly, so ordinary
CommonJS `.js` files under `backend/src/` can `require()` them with no
transpilation. The codebase itself stays 100% plain CommonJS JavaScript.

### Why not a transpilation step

Emitting the default `.ts` and compiling it to CommonJS was considered and
rejected for now. It would require adding `esbuild` or `typescript` as a
devDependency plus a `postgenerate` script — new build tooling, in a repo that
deliberately has none. The `.mts` route reaches the same place with zero
dependencies. That option stays available as the fallback if the risks below
ever materialise.

### Test result — MongoDB unchanged

```
npm test
→ Test Suites: 16 passed, 16 total
→ Tests:       166 passed, 166 total
```

**166/166 passing**, identical to before this change. No file under
`backend/src/` was modified, so the Mongoose runtime could not have been
affected — which is exactly the isolation this step is meant to prove.

### .gitignore verification

`.gitignore:13` → `/generated/prisma`

The generated client is gitignored build output and is never committed. Any
deploy or CI step that needs it must run `prisma generate` after `npm install`.

### What this unblocks

The Stage 2 repository layer can be written in plain CommonJS JavaScript under
`backend/src/repositories/`, following the same conventions as every other `.js`
file in the backend:

```js
const { PrismaClient } = require('../../generated/prisma/client.mts');
```

No `import` statements, no build step, no TypeScript in the codebase itself.

### Known risks and when to revisit

Two genuine caveats, recorded so they are not rediscovered later:

1. **Node's type stripping is still documented as experimental** ("subject to
   change") even though it is unflagged and warning-free on 22.18+/23.6+. It can
   be disabled with `--no-experimental-strip-types`, so **no start command,
   `NODE_OPTIONS` value or Dockerfile may ever pass that flag.**
2. **Type stripping only erases — it cannot transform.** Node rejects TypeScript
   syntax that needs rewriting, such as real `enum` or `namespace` declarations.
   Prisma's generated output is erasable today (it emits `const` objects with
   `as const` rather than TS `enum`, which is precisely why this works), but a
   future Prisma codegen change could introduce non-erasable syntax and break
   `require()`.

**Revisit if any of these happen:**

- **The deploy target runs Node < 22.18.0.** Verify the production Node version
  before Stage 4 cutover. `package.json` currently has **no `engines` field**;
  adding `"engines": { "node": ">=22.18.0" }` is a small follow-up (out of scope
  for this task, which must not touch `package.json`).
- **A `prisma generate` starts emitting non-erasable TypeScript** — the smoke
  test above fails. Fall back to the transpilation step described earlier.
- **A future Prisma 7.x release adds direct JavaScript output** to
  `prisma-client` — then drop `generatedFileExtension`/`importFileExtension` and
  use it.
- **This backend adopts TypeScript** — then `generatedFileExtension` can return
  to the default `ts` and the client compiles alongside the rest of the code.

Until one of those happens this configuration is stable, and it carries **no
deprecated Prisma component**.

---

## STAGE 2 STEP 2 — Repository Layer: Simple Models — 2026-09-13

Neon HTTP driver adapter installed, `prismaClient.js` singleton created, and five
repository modules added for the simplest catalog/HRM/ERP models. **Nothing is
wired into `server.js`, controllers, or routes** — MongoDB remains authoritative.

### Packages installed

| Package | Version | Type | Note |
|---|---|---|---|
| `@prisma/adapter-neon` | `^7.10.0` | dependency | PrismaNeonHttp adapter factory |
| `@neondatabase/serverless` | `^1.1.0` | dependency | HTTP query driver (used by adapter) |

No existing dependency version was altered beyond these two additions.

### `backend/src/config/prismaClient.js`

- Imports `PrismaClient` from `generated/prisma/client.mts` (Node 22.18+ native
  type-stripping + `require(esm)` — see Step 1b).
- Constructs `new PrismaNeonHttp(process.env.DATABASE_URL_POOLED)` — the adapter
  factory takes the **connection string**, not a pre-built `neon()` function.
- Singleton with `global.__eonlinebazarPrisma` guard (mirrors `db.js` pattern).
- **Not imported by the running application yet.**

### Repository files (`backend/src/repositories/`)

| File | Functions | Reimplemented hooks / guards |
|---|---|---|
| `categoryRepository.js` | `findAll`, `findById`, `findBySlug`, `create`, `update`, `remove`, `slugifyCategory` | Slug generation (Bengali Unicode U+0980–U+09FF); cascade delete with product guard |
| `designationRepository.js` | `findAll`, `findById`, `create`, `update`, `remove` | `remove()` rejects when non-`TERMINATED` employees still reference `designationId` (Restrict) |
| `brandRepository.js` | `findAll`, `findById`, `findBySlug`, `create`, `update`, `remove`, `slugifyBrand` | Slug generation (Bengali Unicode); `ActiveStatus` enum mapping |
| `warehouseRepository.js` | `findAll`, `findById`, `create`, `update`, `remove`, `setDefault` | Default-warehouse exclusivity (sequential writes — `$transaction` unsupported over HTTP); delete guard on default |
| `supplierRepository.js` | `findAll`, `findById`, `create`, `update`, `remove` | `remove()` rejects when open POs (`DRAFT`/`SENT`/`PARTIAL`) still reference supplier (Restrict) |

### Test results

**Main Jest suite (`npm test`)** — MongoDB in-memory, unchanged:

```
Test Suites: 16 passed, 16 total
Tests:       166 passed, 166 total
```

Repository integration tests are **excluded** from the main Jest run via
`testPathIgnorePatterns: ["/tests/repositories/"]` because Jest's module loader
cannot parse the generated `.mts` Prisma client. They run separately:

```bash
npm run test:repositories
```

**Repository suite (`npm run test:repositories`)** — real Neon PostgreSQL:

```
tests 75 | pass 75 | fail 0
```

Five files under `tests/repositories/`, using Node's built-in test runner +
`tests/repositories/jestCompat.js`. Each file creates and cleans up its own
prefixed test rows.

### Jest / Prisma `.mts` loading note

Plain `node` loads `generated/prisma/client.mts` via native type-stripping (Step
1b). Jest 30 uses its own `ModuleExecutor` and throws `SyntaxError: Cannot use
import statement outside a module` on the same path. The fix is **not** a custom
transform pipeline — repository tests use `node --test` instead.

---

## STAGE 2 STEP 2, PART 2 — Repository Layer: Admin (Security-Critical) — 2026-09-13

`backend/src/repositories/adminRepository.js` added for the Admin model. **Not
wired into controllers, routes, or `server.js`** — MongoDB remains authoritative.

### Password hashing (replicated from `admin.js` pre-save hook)

| Parameter | Value | Source |
|---|---|---|
| Library | **`bcryptjs`** (`require('bcryptjs')`) | Same as `admin.js` line 7; `package.json` dependency `bcryptjs ^3.0.3` |
| Salt rounds | **`12`** (`BCRYPT_ROUNDS = 12`) | Same as `admin.js` line 10 |
| Already-hashed detection | **`/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/`** via `isHashed()` | Copied verbatim from `admin.js` lines 14 + 152–154 |
| Fields hashed | **`password` only** | Same as the Mongoose hook — only runs when `password` is modified |
| `passwordChangedAt` | Set to `new Date()` **only when a new hash is produced** | Matches hook lines 165–166 |

`create()` always runs `preparePasswordField()` before `prisma.admin.create()`.
`update()` hashes `data.password` when present and not already a digest; when
`password` is absent the stored hash is untouched.

`verifyPassword(plainTextPassword, storedHash)` wraps `bcrypt.compare()` for
future login reuse.

### Double-hash prevention

Integration test **`create() with an already-hashed password does NOT
double-hash`** passes: passing a `$2a$`/`$2b$`/`$2y$` digest as the password
input stores it unchanged (same guard class the Mongoose hook prevents).

### `select: false` secrecy reimplementation

Mongoose hides six fields unless explicitly opted in (`.select('+otp')`, etc.).
Prisma has no column-level equivalent — the repository uses explicit `select`:

**Omitted from `findAll()`, `findById()`, and `findByUsername()` by default:**

1. `otp`
2. `otpExpiry`
3. `totpSecret`
4. `totpPendingSecret`
5. `smsSetupOtp`
6. `smsSetupOtpExpiry`

(`password` is also excluded from default queries — same intent as
`toSafeObject()`.)

**Opt-in:** `findByIdWithSecrets(id)` and `findByUsernameWithSecrets(username)`
return all columns including the six secrets and `password`, mirroring auth
controller `.select('+totpSecret +otp …')` patterns.

### Deletion guard

`remove()` replicates `staffController.findStaffById` / `deleteStaff`: Super Admin
accounts throw `NOT_FOUND` (same 404 the controller returns — owner is managed
from Admin Settings, never deletable from staff management).

### Repository API

| Function | Notes |
|---|---|
| `findAll(filters)` | `{ role?, status?, page?, limit? }`; default sort `createdAt desc` (matches `listStaff`) |
| `findById(id)` | Safe select — no secrets |
| `findByIdWithSecrets(id)` | Full row for 2FA/auth flows |
| `findByUsername(username)` | Safe select |
| `findByUsernameWithSecrets(username)` | Full row |
| `create(data)` | Hashes password before write |
| `update(id, data)` | Conditional password re-hash |
| `remove(id)` | Staff-only delete guard |
| `verifyPassword(plain, hash)` | `bcrypt.compare` helper |

### Test results

**Repository suite (`npm run test:repositories`)** — now **87 tests** (75 Part 1 + 12 Admin):

```
tests 87 | pass 87 | fail 0
```

**Main Jest suite (`npm test`)** — unchanged:

```
Tests: 166 passed, 166 total
```

---

## STAGE 2 STEP 2, PART 3 — Repository Layer: User — 2026-09-13

`backend/src/repositories/userRepository.js` added for the User model and its
owned sub-resources. **Not wired into controllers, routes, or `server.js`.**

### Referral code generation (replicated from `user.js ensureReferralCode`)

| Parameter | Value | Source |
|---|---|---|
| Alphabet | **`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`** (excludes 0/O, 1/I) | `user.js` line 287 |
| Length | **`8`** characters | `generateReferralCode(length = 8)` line 289 |
| Retry count | **`6`** attempts (`while (attempts < 6)`) | `ensureReferralCode` lines 301–312 |
| Collision check | `prisma.user.findUnique({ where: { referralCode: candidate } })` | Mirrors `this.constructor.exists({ referralCode: candidate })` |

`create()` calls `resolveUniqueReferralCode()` when no `referralCode` is supplied.
`update()` **ignores** any supplied `referralCode` — assigned once at creation.

Collision-retry integration test passes via injectable `pickCandidate` on
`resolveUniqueReferralCode()`.

### Legacy `name` field migration hook — NOT reimplemented (dead for Postgres)

The Mongoose `pre('validate')` hook (lines 258–267) only runs when
`firstName`/`lastName` are missing **and** a legacy `_doc.name` field exists.
Postgres stores `firstName` + `lastName` as required columns; there is no `name`
column. New records created via this repository always supply both names, so
the hook is irrelevant. The virtual `name` getter is reimplemented in `toShape()`
as `firstName + ' ' + lastName`.

### Cascade delete verification

Confirmed in `schema.prisma` — `User` owned relations use **`onDelete: Cascade`**:

| Child table | Relation |
|---|---|
| `addresses` | Address → User |
| `wishlist_items` | WishlistItem → User |
| `wallet_transactions` | WalletTransaction → User |
| `user_sessions` | UserSession → User |
| `notes` | Note → User |
| `carts` (+ `cart_items`) | Cart → User |

`remove()` is a plain `prisma.user.delete()` — the database handles cascade.
Cross-aggregate relations (`Order`, `Review`, `CouponRedemption`) use **SetNull**
and survive user deletion.

### Wallet credit/debit — sequential writes

`creditWallet()` and `debitWallet()` use **sequential writes** (update
`walletBalance` → create `WalletTransaction` row), following the same Neon HTTP
limitation documented in Part 1 (`warehouseRepository.setDefault()` — no
`$transaction` over HTTP). `debitWallet()` rejects when the resulting balance
would go negative (`INSUFFICIENT_BALANCE`).

### Wishlist — dual product reference

`addToWishlist()` always writes `legacyProductId` (raw string, required).
When the id matches a Postgres Product UUID, `productId` FK is also set;
Product deletion uses **SetNull** on `WishlistItem.productId` per schema.

### Future gap — customer segmentation NOT implemented

`getAllCustomers` computes VIP / Frequent / Inactive labels from Order aggregates
+ Settings thresholds. This repository implements basic `findAll()` filtering
(search, loyaltyTier, accountStatus, cursor/page/limit) only. Segmentation
requires migrated Order data and is deferred to a later stage.

### Repository API

| Function | Notes |
|---|---|
| `findAll(filters)` | search, tier, accountStatus, isDeleted, page/limit, cursor |
| `findById`, `findByEmail`, `findByReferralCode` | Password excluded |
| `create`, `update`, `remove` | Referral code on create; immutable on update |
| `listAddresses`, `addAddress`, `updateAddress`, `removeAddress` | |
| `listWishlist`, `addToWishlist`, `removeFromWishlist` | legacyProductId + optional FK |
| `creditWallet`, `debitWallet` | Sequential balance + transaction row |

### Test results

**Repository suite (`npm run test:repositories`)** — now **99 tests** (87 prior + 12 User):

```
tests 99 | pass 99 | fail 0
```

**Main Jest suite (`npm test`)** — unchanged:

```
Tests: 166 passed, 166 total
```

---

## STAGE 2 STEP 2, PART 4 — Repository Layer: Employee/Attendance/Payroll/Leave (Polymorphic Staff) — 2026-09-13

Four repository modules added for the HRM polymorphic staff cluster. **Not wired
into controllers, routes, or `server.js`.**

### Polymorphic staff resolution (verified against schema.prisma)

Every Attendance / Payroll / Leave write sets **both**:

- Legacy discriminator: `staffId` (string id) + `staffType` (`admin` | `employee`)
- Nullable FK: exactly one of `adminId` or `employeeId` populated per `staffType`

Implemented via `backend/src/repositories/hrmStaffResolver.js` (`resolveStaffSubject`,
`staffFields`). Integration tests create records for **both** staff types and assert
the correct FK is set and the other is `null`.

### Calculation hooks — exact formulas from source (not audit summaries)

**`computeHoursWorked`** (`attendance.js` lines 67–74, replicated in
`attendanceRepository.js`):

```
if (clockIn && clockOut):
  ms = clockOut − clockIn
  hoursWorked = ms > 0 ? round(ms / 3600000, 2 decimals) : 0
else if (clockIn && !clockOut):
  hoursWorked = 0
else:
  hoursWorked unchanged (hand-entered rows)
```

Edge cases tested: missing `clockOut` → 0; `clockOut` before `clockIn` → 0.

**`applyTotals` / `computeTotalSalary`** (`payroll.js` lines 54–69):

```
earnedBase = workingDays > 0
  ? baseSalary × min(presentDays / workingDays, 1)
  : baseSalary                    ← workingDays=0 pays FULL base (no division)

overtimeAmount = round(overtime × overtimeRate, 2)
totalSalary = round(max(0, earnedBase + overtimeAmount + bonus − deductions), 2)
```

Edge case tested: `workingDays=0` → full base salary, no NaN/Infinity.

**`applyTotalDays` / `countLeaveDays`** (`leave.js` lines 47–57):

```
Normalize start/end to local midnight
days = floor((end − start) / 86400000) + 1   ← inclusive both endpoints
return days > 0 ? days : 1
```

Pure calendar-day count — **no** weekend/holiday exclusion. Same-day leave = 1 day.
Tested: 1-day and 3-day inclusive ranges.

### Employee repository highlights

| Feature | Implementation |
|---|---|
| `generateEmployeeId()` | `EMP-001` format; parses highest `EMP-\d+` suffix + 1 (mirrors Mongoose static) |
| `syncEmployeeAliases()` | designation ↔ role; presentAddress ↔ address (pre-save hook) |
| `terminate()` | Sets `TERMINATED`; calls `adminRepository.update({ status: 'blocked' })` on linked admin via `suspendLinkedAdmin()` — **verified in test** |
| `linkAdminAccount` / `unlinkAdminAccount` | Grant/revoke access; unlink blocks admin then clears `linkedAdminId` (sequential writes) |

Note: live controller uses `ACCOUNT_STATUS.BLOCKED` (not a separate “suspended” enum).

### Cascade / SetNull — verified in schema.prisma

| Relation | onDelete | Verified |
|---|---|---|
| `EmployeeDocument` → `Employee` | **Cascade** | ✅ test: docs gone after employee delete |
| `EmployeeReference` → `Employee` | **Cascade** | ✅ test: refs gone after employee delete |
| `Employee.linkedAdminId` → `Admin` | **SetNull** (on Admin delete) | ✅ test: Admin survives employee hard delete |
| `Attendance/Payroll/Leave` → Admin/Employee | **SetNull** | Confirmed in schema (records outlive staff row) |

### Intentionally out of scope

- PDF pay-slip generation (`payrollController.generatePaySlip`)
- `SecurityLog` writes on HRM mutations
- SMS/email notifications
- Leave approval → attendance `holiday` stamping (`stampLeaveOnAttendance`)

### Test results

**Repository suite (`npm run test:repositories`)** — now **122 tests** (99 prior + 23 HRM):

```
tests 122 | pass 122 | fail 0
```

**Main Jest suite (`npm test`)** — unchanged:

```
Tests: 166 passed, 166 total
```

---

## STAGE 2 STEP 2, PART 5 — Repository Layer: Product & Order (Most Complex) — 2026-09-13

Two repository modules added for the highest-risk embedded-document models. **Not wired
into controllers, routes, or `server.js`.**

### Step 1 — Decomposition confirmed against schema.prisma

**Product** decomposes into exactly these tables (names verified in `schema.prisma`):

| Mongo source | Prisma table | Notes |
|---|---|---|
| `product.js` root document | `Product` (`@@map("products")`) | FKs to Category/Brand/Supplier/Warehouse/Admin all **SetNull** |
| `variants[]` | `ProductVariant` | `onDelete: Cascade` from Product |
| `variants[].attributes` Map | `ProductVariantAttribute` | One row per Map key; `onDelete: Cascade` from Variant |
| `costHistory[]` | `ProductCostHistory` | Append-only; `onDelete: Cascade` from Product |
| `reviews[]` (in-document) | `ProductEmbeddedReview` | **Distinct** from standalone `Review` model — not merged |

**Order** decomposes into exactly these tables (names verified in `schema.prisma`):

| Mongo source | Prisma table | Notes |
|---|---|---|
| `order.js` root document | `Order` (`@@map("orders")`) | Both `subTotal` and `subtotal` preserved as separate columns |
| `items[]` (`strict: false`) | `OrderItem` | Undeclared keys → `extraFields Json?` |
| `returnItems[]` | `OrderReturnItem` | |
| `payment` object | `OrderPayment` | 1-to-1 (`orderId @unique`) |
| `payment.ipnHistory[]` | `OrderPaymentIpnEvent` | `raw Json?`; Cascade from OrderPayment |
| `paymentProof` object | `OrderPaymentProof` | 1-to-1 (`orderId @unique`) |
| `notificationsSent` object | `OrderNotification` | 1-to-1; 9 booleans |

No table-name discrepancies found — audit prompt list matches `schema.prisma` exactly.

### Product repository (`productRepository.js`)

| Feature | Implementation |
|---|---|
| Slug generation | Reuses `slugifyBrand` from `brandRepository.js` — matches `productController.js` / `brand.js` algorithm (Bengali U+0980–U+09FF preserved); **not** category slug |
| `resolveUniqueSlug()` | Same suffix strategy as live controller (`-2`, `-3`, …) |
| Text search (`findAll`) | **Placeholder:** `name contains` (case-insensitive) only — weighted MongoDB text index deferred to tsvector/GIN migration |
| Variant attributes | **Map → table:** `addVariant()` creates `ProductVariant` + one `ProductVariantAttribute` row per key |
| `updateVariant()` attributes | **Delete-all-then-recreate** (not diff) — guarantees no stale keys; documented choice |
| Cost history | Append-only via `addCostEntry()` — no update/delete helpers |
| Embedded reviews | Separate from future standalone `reviewRepository` — Stage 3 decision deferred |

### Order repository (`orderRepository.js`)

| Feature | Implementation |
|---|---|
| `create()` write order | Sequential: Order → OrderItems (+ `extraFields`) → OrderPayment → IpnEvents → PaymentProof → OrderNotification |
| `subTotal` / `subtotal` | Both written independently from caller input — never collapsed |
| Item `strict: false` | Known columns mapped to typed fields; all other keys collected into `extraFields` JSON |
| Notification mapping | Mongo `out_for_delivery` → Prisma `outForDelivery` (`@map("out_for_delivery")`); reassembled as `out_for_delivery` in `findById()` |
| `updateStatus()` | Status field only — no cashback/notification/courier side effects |
| Partial-write risk | **Documented gap:** no `$transaction` (Neon HTTP limitation). If a child insert fails after Order row exists, a partial order remains. **Future fix:** interactive-transaction driver, or explicit `rollbackOrder(orderId)` cleanup function that deletes Order + any children created so far |

### Cascade directions — verified in tests

| Scenario | Expected | Test result |
|---|---|---|
| Delete Product | Cascades ProductVariant (+ attributes), ProductCostHistory, ProductEmbeddedReview | ✅ pass |
| Delete Product with OrderItem referencing it | OrderItem survives; `productId` → **null** (SetNull) | ✅ pass |
| Delete Product with CartItem referencing it | CartItem **deleted** (Cascade) | ✅ pass |
| Delete Order | Cascades OrderItem, OrderReturnItem, OrderPayment (+ IpnEvents), OrderPaymentProof, OrderNotification | ✅ used for test cleanup |

### Test results

**Repository suite (`npm run test:repositories`)** — now **135 tests** (122 prior + 13 Product/Order):

```
tests 135 | pass 135 | fail 0
```

New files: `product.repository.test.js` (8 tests), `order.repository.test.js` (5 tests).

**Main Jest suite (`npm test`)** — unchanged:

```
Tests: 166 passed, 166 total
```

**Harness note:** `npm run test:repositories` now runs with `--test-concurrency=1` to avoid
`EMP-xxx` ID races on the shared Neon test database when multiple files create employees
in parallel.

---

## STAGE 2 STEP 3, PART 1 — Dual-Write Pilot: Category — 2026-09-14

The first live controller wired to the repository layer. Category was chosen as the
lowest-risk pilot (fewest inbound relations, lowest write volume — first in the Stage 4
cutover ordering).

### Controller changes

| File | Functions modified | Read endpoints touched? |
|---|---|---|
| `backend/src/controllers/categoryController.js` | `adminCreateCategory`, `adminUpdateCategory`, `adminDeleteCategory` | **No** — all GET/list/tree/navbar/homepage/slug/admin-read endpoints unchanged |

Routes (`backend/src/routes/categoryRoutes.js`) were **not** modified.

### New files

| File | Purpose |
|---|---|
| `backend/src/services/dualWriteService.js` | Reusable `dualWrite(mongoWriteFn, postgresWriteFn, context)` helper |
| `tests/services/dualWriteService.test.js` | Jest unit tests for the wrapper (3 tests) |

### Repository gap closed (Part 1 follow-up)

`categoryRepository.create()` in Step 2 Part 1 did **not** accept `legacyId`. Added
`legacyId` to `create()` and a new `findByLegacyId(legacyId)` lookup for parent
resolution and update/delete mirroring.

### Dual-write flow

1. **Mongo write runs first** — identical to pre-migration behavior. If Mongo throws,
   the error propagates and Postgres is never attempted.
2. **Postgres write runs second** — best-effort mirror via `categoryRepository`.
   Failures are caught, logged with prefix `[DUAL-WRITE-FAILURE]`, and **never**
   change the HTTP response or return value.
3. **Caller sees the Mongo result only** — create/update still return the Mongoose
   document; delete still returns the same JSON message.

### Reconciliation log shape

Postgres failures emit a structured object to `console.error`:

```js
{
  timestamp: '2026-09-14T…',
  model: 'Category',
  operation: 'create' | 'update' | 'delete',
  mongoId: '<Mongo _id string>',
  error: '<message>'
}
```

Designed so a future `ReconciliationLog` table or file sink can consume the same shape.

### Parent-category self-relation

Mongo stores `parentCategory` as a Mongo ObjectId; Postgres uses `parentCategoryId`
(UUID). During dual-write:

1. When creating/updating, if the category has a Mongo parent, look up
   `categoryRepository.findByLegacyId(mongoParentId)`.
2. If found → set Postgres `parentCategoryId` to that row's UUID.
3. If **not** found (parent predates dual-write) → leave `parentCategoryId` **null**
   and log `[DUAL-WRITE-PARENT-MISSING]` with message `parent not yet in Postgres`.
   The dual-write continues — it does not fail the API request.

### Failure-isolation guarantee (plain terms)

From the customer's or admin UI's perspective, nothing changed. Category create, update,
and delete succeed or fail exactly as they did before, based solely on MongoDB. If Neon
is down, misconfigured, or rejects a row, the admin still sees success (when Mongo
succeeded) — the Postgres miss is invisible to the caller and only appears in server logs
for later reconciliation in Stage 3.

### Jest / Prisma loading note

`categoryRepository` is **lazy-required** inside the controller (`getCategoryRepository()`)
so importing the app graph in Jest does not pull in the generated `.mts` Prisma client
(which Jest cannot parse). Postgres writes only load the repository at runtime when a
write actually executes.

### Test results

**dualWriteService unit tests (`tests/services/dualWriteService.test.js`, Jest):**

```
Tests: 3 passed, 3 total
```

Covers: both writes succeed; Mongo ok + Postgres fail (returns Mongo, logs, no throw);
Mongo fail (Postgres never called).

**Main Jest suite (`npm test`):**

```
Test Suites: 17 passed, 17 total
Tests:       169 passed, 169 total
```

(166 original + 3 dualWriteService tests. No category-specific Jest API suite exists;
regression coverage is the full app graph loading with `categoryController` wired.)

**Repository suite (`npm run test:repositories`):**

```
tests 135 | pass 135 | fail 0
```

Unchanged count — category repository tests still pass with the new `legacyId` /
`findByLegacyId` additions (no new repository test file in this part).

---

## STAGE 2 STEP 3, PART 2 — Dual-Write: Designation, Brand, Warehouse, Supplier — 2026-09-14

Extends the Category dual-write pilot (Part 1) to four more catalog/ERP models using
the same `dualWriteService.js` helper unchanged. MongoDB remains authoritative for all
reads; Postgres writes are best-effort and failure-isolated.

### Per-model summary

| Model | Controller file | Functions wired | Reads touched? | legacyId gap fixed? |
|---|---|---|---|---|
| **Designation** | `backend/src/controllers/admin/designationController.js` | `createDesignation`, `updateDesignation`, `deleteDesignation` | **No** | **Yes** — `legacyId` + `findByLegacyId()` added to `designationRepository.js` |
| **Brand** | `backend/src/controllers/brandController.js` | `createBrand`, `updateBrand`, `deleteBrand` | **No** (`getBrands` unchanged) | **Yes** — `legacyId` + `findByLegacyId()` added to `brandRepository.js` |
| **Warehouse** | `backend/src/controllers/admin/warehouseController.js` | `createWarehouse`, `updateWarehouse`, `deleteWarehouse` | **No** | **Yes** — `legacyId` + `findByLegacyId()` added to `warehouseRepository.js` |
| **Supplier** | `backend/src/controllers/admin/supplierController.js` | `createSupplier`, `updateSupplier`, `deleteSupplier` | **No** | **Yes** — `legacyId` + `findByLegacyId()` added to `supplierRepository.js` |

Routes were **not** modified. `dualWriteService.js` was **not** modified.

### Model-specific behaviour

**Designation** — No parent-relation complexity. Postgres mirror is a straight field
map; employee rename cascade remains Mongo-only (Postgres employees are not yet live).

**Brand** — Slug generation stays inside `brandRepository.create()` / `update()` via
the existing `slugifyBrand()` from Stage 2 Step 2 Part 1. The controller does not
regenerate slugs for Postgres.

**Warehouse — setDefault equivalent** — There is no separate “set default” route; default
promotion happens inside `createWarehouse` (`demoteOtherDefaults`) and `updateWarehouse`
(when `isDefault: true`). The Postgres mirror calls `warehouseRepository.setDefault()`
after create/update whenever Mongo promotes a warehouse to default, matching the Mongoose
controller's exclusive-default semantics. Partial field mapping on update avoids sending
`isDefault: false` on unrelated PATCHes (which would incorrectly trigger the
“cannot un-default” guard).

**Supplier — Restrict-on-delete reconciliation risk** — Both Mongo and Postgres enforce
“no delete while open POs exist” (Mongo: `OPEN_PO_STATUSES` count in controller; Postgres:
`supplierRepository.remove()` with Restrict FK). During dual-write, Mongo is checked
first — if Mongo allows delete, Postgres `remove()` runs second. If Postgres still has
open PO rows that Mongo does not (possible only after Stage 3 backfill drift or
cross-database inconsistency), Postgres `remove()` throws, `dualWriteService` logs
`[DUAL-WRITE-FAILURE]`, and the API caller still sees success because Mongo already
deleted. This is a **known reconciliation risk** — not solved in this task; Stage 3
row-count and PO-state audits are the remedy.

### Jest / Prisma loading

All four controllers use lazy `get*Repository()` helpers (same pattern as Category Part 1)
so Jest can import the app graph without loading the generated `.mts` Prisma client.

### Test results

**Existing controller-level regression (no new test files added):**

| Suite | Coverage |
|---|---|
| `tests/hrm.test.js` | Designation create/list/update/delete response shapes |
| `tests/erp.test.js` | Supplier + Warehouse CRUD, default protection, open-PO delete block |

**Main Jest suite (`npm test`):**

```
Test Suites: 17 passed, 17 total
Tests:       169 passed, 169 total
```

**Repository suite (`npm run test:repositories`):**

```
tests 135 | pass 135 | fail 0
```

**dualWriteService.js** — not re-tested (unchanged since Part 1; 3/3 still green via
`tests/services/dualWriteService.test.js`).

---

## STAGE 2 STEP 3, PART 3 — Dual-Write: CMS/Settings Group — 2026-09-14

Extends dual-write to the CMS/Settings cutover group (Stage 4 position 3 of 8): low-write
volume models with singletons and nested child arrays. Same `dualWriteService.js` helper
unchanged. MongoDB remains authoritative for all reads; Postgres writes are best-effort
and failure-isolated.

### Repository files — created vs reused

| Model | Repository file | Existed from Step 2? | Created in Part 3? |
|---|---|---|---|
| **PageContent** | `backend/src/repositories/pageContentRepository.js` | **No** | **Yes** — findAll, findById, findBySlug, findByLegacyId, create, update, remove; `renderBodyHtml` via existing `markdownToHtml.js` (no new npm dependency) |
| **NavbarLink** | `backend/src/repositories/navbarLinkRepository.js` | **No** | **Yes** — LinkTarget enum maps `_self`→SELF, `_blank`→BLANK per Prisma `@map` |
| **FooterSettings** | `backend/src/repositories/footerSettingsRepository.js` | **No** | **Yes** — singleton `key='global'`; 5 child tables (FooterColumn, FooterLink, FooterSocialLink, FooterPaymentGateway, FooterPaymentBadge); delete+recreate on update |
| **Banner** | `backend/src/repositories/bannerRepository.js` | **No** | **Yes** — Banner CRUD + `upsertBannerSettings()` with `key='global'`; overlayOpacity as Decimal(3,2) fraction |
| **Settings** | `backend/src/repositories/settingsRepository.js` | **No** | **Yes** — singleton `key='global'`; scalars + 5 activePaymentGateways booleans + `settings_payment_gateways` child rows |

Routes were **not** modified. `dualWriteService.js` was **not** modified. Deprecated
`Setting.js` shim was **not** touched.

### Per-model controller wiring

| Model | Controller file | Functions wired | Reads touched? |
|---|---|---|---|
| **PageContent** | `backend/src/controllers/pageContentController.js` | `createPage`, `updatePageContent` | **No** (no delete route exists) |
| **NavbarLink** | `backend/src/controllers/navbarLinkController.js` | `createNavbarLink`, `updateNavbarLink`, `deleteNavbarLink` | **No** (`reorderNavbarLinks` unchanged) |
| **FooterSettings** | `backend/src/controllers/footerSettingsController.js` | `updateFooterSettings`, `addPaymentBadge`, `deletePaymentBadge` | **No** |
| **Banner** | `backend/src/controllers/bannerController.js` | `createBanner`, `updateBanner`, `deleteBanner` | **No** (`reorderBanners` unchanged) |
| **BannerSettings** | `backend/src/controllers/bannerController.js` | `updateSettings` (singleton upsert, `key='global'`) | **No** |
| **Settings** | `backend/src/controllers/settingsController.js` | `updateSettings`, `updateCacheSettings`, `updateRateLimitSettings` | **No** |
| **Settings** | `backend/src/controllers/masterSettingsController.js` | `saveMasterSettings` (shared by master + announcement save routes) | **No** |

All controllers use lazy `get*Repository()` helpers so Jest can import the app graph
without loading the generated `.mts` Prisma client.

### FooterSettings — paymentBadges tri-state (audit-critical)

Mongo `paymentBadges` has a three-way distinction the repository must preserve:

| Mongo input | `paymentBadgesMode` | Postgres behaviour |
|---|---|---|
| Field **absent** / `undefined` in request (e.g. copyright-only update) | `'skip'` | **Do not touch** existing `FooterPaymentBadge` rows |
| Explicit **`[]`** in request | `'replace'` | Delete all badge rows → **zero rows** remain |
| Non-empty array (or `paymentGateways` sync) | `'replace'` | Delete+recreate badge rows from the synced list |

Controller sets mode from the request body:

- `paymentBadgesMode: 'replace'` when `body.paymentGateways` or `body.paymentBadges` is an array
- `paymentBadgesMode: 'skip'` otherwise

`addPaymentBadge` / `deletePaymentBadge` always pass `{ replacePaymentGateways: true, paymentBadgesMode: 'replace' }` because they mutate badges explicitly.

Nested arrays (columns+links, socialLinks, paymentGateways) use delete+recreate on update
when the corresponding body field is an array — same pattern as `productRepository.js`
variant attributes.

### PageContent — bodyHtml rendering

The Mongoose pre-save hook `renderBodyHtml` is replicated in the repository via the
existing `backend/src/utils/markdownToHtml.js` utility (already in the codebase; no
`marked`/`showdown` in `package.json`). Contact page flattens five `contactMeta*` columns:
`address`, `phone`, `email`, `hours`, `mapEmbedUrl`.

### BannerSettings singleton key

`schema.prisma` already defines `BannerSettings.key @unique @default("global")`.
`bannerRepository.upsertBannerSettings()` always writes `key='global'` so duplicate
singleton rows cannot accumulate.

### Test results

| Suite | Result |
|---|---|
| `npm test` (Jest) | **169/169** pass |
| `npm run test:repositories` | **137/137** pass (135 prior + 2 new footer tri-state tests) |

New repository test file:

- `tests/repositories/footerSettings.repository.test.js` — explicitly verifies `skip` leaves badges untouched and `replace` with `[]` clears all rows.

---

## STAGE 2 STEP 3, PART 4 — Dual-Write: Security/Audit Group — 2026-09-14

Extends dual-write to the Security/Audit cutover group (Stage 4 position 4 of 8).
Same `dualWriteService.js` helper unchanged. MongoDB remains authoritative for all
reads; Postgres writes are best-effort and failure-isolated — critical here because
these models are written during login/security flows and must never cause auth
behaviour to change on a Postgres hiccup.

### Repository files — created vs reused

| Model | Repository file | Existed from Step 2? | Created in Part 4? |
|---|---|---|---|
| **SecurityLog** | `backend/src/repositories/securityLogRepository.js` | **No** | **Yes** — `create()`, `findAll(filters)`; actor stays plain String (deliberately unlinked) |
| **LoginAttempt** | `backend/src/repositories/loginAttemptRepository.js` | **No** | **Yes** — `create()`, `findAll(filters)` |
| **BlacklistedIP** | `backend/src/repositories/blacklistedIpRepository.js` | **No** | **Yes** — `upsertFromMongo()`, `findByIp()`, `findAll()`, `remove()` |
| **StockAlert** | `backend/src/repositories/stockAlertRepository.js` | **No** | **Yes** — `create()` with `stock_alert_items` child rows |

Routes were **not** modified. `dualWriteService.js` was **not** modified.

### Single shared wiring points (not per call-site)

| Model | Wiring location | Rationale |
|---|---|---|
| **SecurityLog** | `backend/src/utils/securityLogger.js` → `logSecurityEvent()` | **Only** Mongoose write path in the codebase (`SecurityLog.create` appears nowhere else). One dual-write wrap covers all RBAC, order, HRM, footer, blacklist, and admin audit call sites automatically. |
| **LoginAttempt** | `backend/src/utils/loginAttemptLogger.js` → `persistLoginAttempt()` | Centralizes all create paths: `recordLoginAttempt()` in `adminSecurity.js`, blacklist gate, rate-limit handler, and geo-fence block. Auth controller calls `recordLoginAttempt()` — not wired individually. |
| **BlacklistedIP** | `blacklistController.js` (`addBlacklist`, `removeBlacklist`) + auto-ban in `adminSecurity.js` | Three upsert/remove write paths (manual add, manual remove, intrusion-detection auto-ban). |
| **StockAlert** | `backend/src/services/stockAlertService.js` → `checkAndAlertLowStock()` | Single `StockAlert.create()` call site. |

### TTL sweep jobs — explicitly out of scope

| Model | Mongo behaviour | Postgres gap | This task |
|---|---|---|---|
| **LoginAttempt** | 30-day TTL index on `createdAt` | No TTL | **Not implemented** — scheduled delete job deferred to Stage 2 follow-up per audit |
| **BlacklistedIP** | TTL on `expiresAt` (`expireAfterSeconds: 0`); null = permanent | No TTL | **Not implemented** — same deferred follow-up |

Dual-write still mirrors rows to Postgres; expiry cleanup in Postgres is a separate job.

### BlacklistedIP — null expiresAt (permanent ban)

Repository `normalizeExpiresAt()` returns **`null`** (not a placeholder date) when Mongo
`expiresAt` is null, undefined, or empty string. Verified by
`tests/repositories/blacklistedIp.repository.test.js`:
- `upsertFromMongo({ expiresAt: null })` → Postgres row has `expiresAt: null`
- Reload via `findByIp()` confirms null persists

### StockAlert — kind discrimination

Prisma enum `StockAlertItemKind` (schema.prisma):

| Mongo source array | Prisma `kind` | DB `@map` | stock / threshold |
|---|---|---|---|
| `lowStockProducts[]` | `LOW_STOCK` | `low_stock` | populated (Int) |
| `outOfStockProducts[]` | `OUT_OF_STOCK` | `out_of_stock` | **null** (nullable) |

Parent `alertsSent{}` flattens to `alertSentEmail`, `alertSentSms`, `alertSentWhatsapp`
booleans. Child rows inserted sequentially (not nested Prisma create) because Neon HTTP
adapter rejects implicit transactions.

Verified by `tests/repositories/stockAlert.repository.test.js`.

### Test results

| Suite | Result |
|---|---|
| `npm test` (Jest) | **169/169** pass — all suites exercising `logSecurityEvent()` unchanged |
| `npm run test:repositories` | **140/140** pass (137 prior + 2 blacklistedIp + 1 stockAlert) |

New repository test files:

- `tests/repositories/blacklistedIp.repository.test.js` — null `expiresAt` permanent ban
- `tests/repositories/stockAlert.repository.test.js` — `LOW_STOCK` vs `OUT_OF_STOCK` kind discrimination

## STAGE 2 STEP 3, PART 5 — Dual-Write: HRM Group — 2026-09-14

Extends dual-write to the HRM cutover group (Stage 4 position 5 of 8): **Employee,
Attendance, Payroll, Leave**. Same `dualWriteService.js` helper unchanged. MongoDB
remains authoritative for all reads; Postgres side-writes are best-effort and
failure-isolated — critical here because Payroll writes involve real salary
calculations; the Mongo result is always what the API returns, never a recomputed
Postgres value.

### Repository files — reused from Step 2 Part 4 (legacyId additions)

| Model | Repository file | legacyId / findByLegacyId | Dual-write mirror strategy |
|---|---|---|---|
| **Employee** | `employeeRepository.js` | Added `findByLegacyId()`, `findDocumentByLegacyId()`; `legacyId` on `create()` / `addDocument()` | `create()` / `update()` / `terminate()` / `linkAdminAccount()` / `unlinkAdminAccount()` called directly |
| **Attendance** | `attendanceRepository.js` | Added `findByLegacyId()`; `legacyId` on `markAttendance()` / `clockIn()` / `clockOut()` | **`upsertFromMongo(mongoDoc)`** — copies exact saved Mongoose fields (avoids re-running clock logic) |
| **Payroll** | `payrollRepository.js` | Added `findByLegacyId()`; `legacyId` on `generate()` | **`upsertFromMongo(mongoDoc)`** — copies exact Mongo computed totals (never re-runs `generate()`) |
| **Leave** | `leaveRepository.js` | Added `findByLegacyId()`; `legacyId` on `apply()` | `apply()` on create; `findByLegacyId()` + `approve()` / `reject()` on status changes |

`hrmStaffResolver.js` updated: `findEmployeeRecord()` / `findAdminRecord()` now accept
Mongo ObjectId strings via `legacyId` lookup (needed when dual-write passes Mongo `_id`
as `staffId`).

New shared helper: `backend/src/utils/hrmDualWriteHelpers.js` — mappers only; no
polymorphic resolution duplicated at wiring layer.

Routes were **not** modified. `dualWriteService.js` was **not** modified.

### Controller functions wired (write paths only)

| Model | Controller | Wired functions |
|---|---|---|
| **Employee** | `employeeController.js` | `createEmployee`, `updateEmployee`, `deleteEmployee` (terminate), `uploadEmployeePhoto`, `uploadEmployeeDocument`, `deleteEmployeeDocument`, `grantSystemAccess` (linkAdminAccount), `unlinkSystemAccess` (unlinkAdminAccount) |
| **Attendance** | `attendanceController.js` | `markAttendance`, `clockIn`, `clockOut` |
| **Payroll** | `payrollController.js` | `generatePayroll`, `approvePayroll`, `markPaid` |
| **Leave** | `leaveController.js` | `applyLeave`, `approveLeave`, `rejectLeave`; `stampLeaveOnAttendance()` (called from approve) dual-writes each attendance row |

### Polymorphic staffType/staffId resolution — repository-only (not duplicated)

Attendance, Payroll, and Leave repository functions from Stage 2 Step 2 Part 4 already
resolve `staffType` → `adminId` or `employeeId` FK internally. Dual-write wiring passes
the same `staffType`/`staffId` the Mongo write received and calls the repository function
(or `upsertFromMongo`) as a single correct unit — **no resolution logic at controller or
helper layer**.

Verified by existing repository tests plus new dual-write-path test:

- `tests/repositories/attendance.repository.test.js` → `upsertFromMongo resolves employee by legacyId and populates employeeId`

### terminate() → admin-suspend cross-repository behaviour

`deleteEmployee` (status → terminated) Postgres side calls `employeeRepository.terminate()`
as-is — that function already suspends a linked Admin account internally. Dual-write does
**not** duplicate suspend logic at the controller level. Same for `updateEmployee` when
status is set to terminated.

### Uncovered write actions (reported, not wired)

| Location | Action | Reason |
|---|---|---|
| `attendanceController.js` | `createShift`, `updateShift`, `deleteShift` | Shift model — out of scope for this part |
| `payrollController.js` | `generatePaySlip` | PDF generation + flag update (read-heavy) |
| `payrollController.js` | `updateSalaryConfig` | Updates Admin model, not Payroll |
| `employeeController.js` | `revokeSystemAccess`, `reactivateSystemAccess` | Admin status-only changes; no Employee save |

### Test results

| Suite | Result |
|---|---|
| `npm test` (Jest) | **169/169** pass |
| `npm run test:repositories` | **141/141** pass (140 prior + 1 new attendance legacyId upsert test) |

## STAGE 2 STEP 3, PART 6 — Dual-Write: Marketing/Support Group — 2026-09-14

Extends dual-write to the Marketing/Support cutover group (Stage 4 position 6 of 8):
**Newsletter, EmailCampaign, ContactMessage, Review**. Same `dualWriteService.js`
helper unchanged. MongoDB remains authoritative for all reads; Postgres side-writes
are best-effort and failure-isolated.

### Repository files — created in Part 6

| Model | Repository file | legacyId / findByLegacyId | Notes |
|---|---|---|---|
| **Newsletter** | `newsletterRepository.js` | ✅ | `upsertFromMongo()` keyed by unique email |
| **EmailCampaign** | `emailCampaignRepository.js` | ✅ | `stats{}` → `statsTotalRecipients` / `statsSent` / `statsFailed` on create + update |
| **ContactMessage** | `contactMessageRepository.js` | ✅ | `status`/`priority` enums; `assignedTo` stays plain username String |
| **Review** | `reviewRepository.js` | ✅ | Cross-model FK resolution for User + Product with null fallback |

Routes were **not** modified. `dualWriteService.js` was **not** modified.

### Controller functions wired (write paths only)

| Model | Controller | Wired functions |
|---|---|---|
| **Newsletter** | `newsletterController.js` | `subscribe`, `unsubscribe` (token lookup → Mongo save → Postgres upsert by legacyId) |
| **EmailCampaign** | `newsletterAdminController.js` | `createCampaign`, `sendCampaign` (all `campaign.save()` calls + error-path `status: failed`) |
| **ContactMessage** | `contactController.js` | `submitContactMessage`, `markContactMessageRead`, `markContactMessageUnread`, `deleteContactMessage`, `replyContactMessage`, `assignTicket`, `updateTicketStatus` |
| **Review** | `reviewController.js` | `addOrUpdateReview` (create + update paths), `deleteOwnReview` |
| **Review** | `reviewAdminController.js` | `moderateReview` (hide/show + delete), `deleteReview` |

### EmailCampaign stats-update wiring pattern — per-increment (not snapshot-only)

After reading `sendCampaign()` in `newsletterAdminController.js`, the actual write
pattern saves the campaign document **after every batch of 10 recipients** with
incrementally updated `stats.sent` / `stats.failed` counters (plus start and
complete saves). Dual-write mirrors **each** `campaign.save()` via
`saveCampaignDoc()` → `upsertFromMongo()` — matching the real per-batch pattern
rather than wiring only a final snapshot (which would miss intermediate progress
states in Postgres during long sends).

### Review cross-model FK resolution — null fallback + log

Review is the **first** Stage 2 Step 3 model to resolve FKs against other models'
dual-write state. `reviewRepository.resolveUserId()` / `resolveProductId()` look
up Postgres rows by `legacyId` (Product also tries `productId` field). If the
referenced User or Product is not yet in Postgres (User dual-write is **not**
wired in Step 3 yet — repository-only from Step 2 Part 3), the FK is left **null**
and a reconciliation log is emitted — the Mongo write and API response are unaffected.

Example log format when User is missing:

```
[DUAL-WRITE-FK-MISSING] {
  timestamp: '2026-09-14T05:28:19.597Z',
  model: 'Review',
  field: 'userId',
  mongoRefId: '507f1f77bcf86cd799439011',
  message: 'User not yet in Postgres'
}
```

`legacyProductId` and `legacyOrderId` are always populated from Mongo regardless
of FK resolution success.

### Uncovered write actions (reported, not wired)

| Location | Action | Reason |
|---|---|---|
| `newsletterAdminController.js` | `deleteSubscriber` | Admin hard-delete — not in Part 6 scope |
| `newsletterAdminController.js` | `sendCampaignEmail` → `subscriber.save()` | Newsletter delivery counter side-effect during campaign send |
| `newsletterAdminController.js` | `testCampaign` | Test email only — no campaign document write |

### Test results

| Suite | Result |
|---|---|
| `npm test` (Jest) | **169/169** pass |
| `npm run test:repositories` | **144/144** pass (141 prior + 3 new Review FK fallback tests) |

## STAGE 2 STEP 3, PART 7 — Dual-Write: User + Owned Tables — 2026-09-14

Extends dual-write to the User cutover group (Stage 4 position 7 of 8): **User** core
record plus **Address**, **WishlistItem**, **WalletTransaction**, and **Cart/CartItem**.
Same `dualWriteService.js` helper unchanged. MongoDB remains authoritative for all reads.

Once this part is live, **Part 6's Review `userId` gap closes for new writes** — reviews
created after a user registers will resolve `userId` in Postgres. Existing Postgres
Review rows with null `userId` from before this part remain null until Stage 3 backfill
(not fixed in this task).

### Repository files — extended / created

| Model | Repository file | Changes |
|---|---|---|
| **User** | `userRepository.js` (Step 2 Part 3) | Added `findByLegacyId()`, `legacyId` on `create()`, `upsertFromMongo()`, `mirrorAccountDeletion()`, `mirrorWalletFromMongo()` |
| **Address** | via `userRepository.js` | `upsertAddressFromMongo()`, `removeAddressByLegacyId()`, `findAddressByLegacyId()` |
| **WishlistItem** | via `userRepository.js` | `addToWishlist()` / `removeFromWishlist()` — product FK via `legacyId` with null+log fallback |
| **WalletTransaction** | via `userRepository.js` | `mirrorWalletFromMongo()` — syncs balance + latest history row (no double credit/debit) |
| **Cart / CartItem** | `cartRepository.js` **NEW** | `syncFromMongo()` — replaces all items per save; no `userId` uniqueness enforced |

Routes were **not** modified. `dualWriteService.js` was **not** modified.

### Referral code pass-through (not regenerated)

`userRepository.create()` already skips generation when `referralCode` is supplied
(mirrors Mongoose `ensureReferralCode`). Dual-write calls `upsertFromMongo()` after
Mongo `save()`, passing **`saved.referralCode` explicitly** — the repository never runs
`resolveUniqueReferralCode()` on the Postgres path when Mongo already assigned a code.

Verified by `tests/repositories/user.repository.test.js`:
`create() passes through explicit referralCode from Mongo (no regeneration)`.

### CartItem required-FK failure mode vs Wishlist/Review nullable fallback

| Model | `productId` in schema | Missing Product in Postgres |
|---|---|---|
| **WishlistItem** | Nullable (`SetNull`) | Row created with `productId: null`, `legacyProductId` kept, `[DUAL-WRITE-FK-MISSING]` logged |
| **Review** | Nullable (`SetNull`) | Same null+log pattern (Part 6) |
| **CartItem** | **Required** (non-nullable, Cascade FK) | **Whole cart sync throws** — no row inserted for that item; `[DUAL-WRITE-CART-ITEM-FAIL]` logged; dual-write swallows error; Mongo cart unaffected |

`syncFromMongo()` validates all product FKs **before** creating/updating the Cart parent
to avoid orphan cart rows.

### Controller / service functions wired (write paths only)

| Area | Location | Wired functions |
|---|---|---|
| **User create** | `registerController.js` | `registerUser` |
| **User update** | `userProfileController.js` | `updateUserProfile`, `updateUserAvatar`, `changePassword`, `verifyContactUpdateOtp` (+ OTP expiry save) |
| **User delete** | `loginController.js` | `deleteAccount` (soft-delete + `mirrorAccountDeletion`) |
| **Address** | `userProfileController.js` | `addAddress`, `updateAddress`, `deleteAddress` |
| **Wishlist** | `userWishlistController.js` | `addToWishlist`, `removeFromWishlist` |
| **Wallet** | `walletService.js` | `creditWalletForUser`, `deductWalletForOrder`, `reverseWalletCredit`, `debitWalletForAdmin` |
| **Wallet (points)** | `userProfileController.js` | `convertPoints` |
| **Cart** | `cartController.js` | `mergeCart`, `addToCart`, `updateQuantity`, `deleteCartItem`, `toggleSelection`, `clearCart`, `clearOrderedItems` |

### Part 6 Review gap — closing for new writes

Repository test confirms: User created in Postgres with `legacyId` → subsequent
Review `upsertFromMongo()` resolves `userId` correctly. Product still null-logs if
Product not dual-written yet.

### Test results

| Suite | Result |
|---|---|
| `npm test` (Jest) | **169/169** pass |
| `npm run test:repositories` | **147/147** pass (144 prior + 1 referral pass-through + 1 cart FK fail + 1 review userId resolve) |

## STAGE 2 STEP 3, PART 8 — Dual-Write: Order (Final Part, Most Complex) — 2026-09-14

Order was the last *non-Admin* model group; **Admin was deliberately deferred to Part 9**
(credentials / 2FA). Same `dualWriteService.js` helper unchanged. MongoDB remains
authoritative for all reads.

### Partial-write failure logging (no transaction / no retry)

`orderRepository.createWithStagedWrites()` tags each sequential child step. When
`mirrorOrderCreate()` catches a failure, it checks `findByLegacyId(mongoId)` — if the
Order row already exists, it logs **`[DUAL-WRITE-ORDER-PARTIAL]`** with the exact child
table that failed (for Stage 3 targeted repair scripts):

```json
{
  "timestamp": "2026-09-14T05:53:14.978Z",
  "mongoId": "6789abc123def45678901234",
  "legacyId": "6789abc123def45678901234",
  "postgresOrderId": "f6ff6cfd-230d-4228-9d87-d2d6935a7213",
  "failedStage": "OrderPayment",
  "error": "Simulated OrderPayment insert failure"
}
```

`failedStage` values: `Order`, `OrderItem`, `OrderPayment`, `OrderPaymentIpnEvent`,
`OrderPaymentProof`, `OrderNotification`. No automatic retry — logging discipline only.

### userId / productId null-and-log fallback (Order)

| Field | Schema | Missing FK in Postgres |
|---|---|---|
| `Order.userId` | Nullable (`SetNull`) | Order row created with `userId: null`; `[DUAL-WRITE-FK-MISSING]` logged via `userRepository.resolvePostgresUserId()` |
| `OrderItem.productId` | Nullable (`SetNull`) | Line row created with `productId: null`, `legacyProductId` kept; `[DUAL-WRITE-FK-MISSING]` logged |

Guest checkout and unmigrated users/products never block checkout or order confirmation.

### subTotal / subtotal — both preserved

`buildCreateInputFromMongo()` passes both fields exactly as Mongo stores them.
`buildOrderCreateData()` writes both columns independently — wiring does not collapse them.

### Status-change side effects NOT duplicated

Order status dual-write calls **`updateStatusByLegacyId()`** and **`updateOrderFieldsByLegacyId()`**
(status, delivery, cancel, courier, refund metadata on the Order row only). Side effects
already wired in earlier parts are **not** re-wired here:

| Side effect | Already wired in |
|---|---|
| Wallet credit on delivery | Part 7 — `walletService.js` |
| Wallet credit on refund/return approval | Part 7 — `walletService.js` |
| SMS / email notifications | Not Postgres-mirrored (ephemeral sends) |
| Admin notification dispatch | Not Postgres-mirrored |

### Payment IPN — failure isolation

`paymentIpnController.js` wraps `order.save()` in `dualWrite()` with
`mirrorOrderPaymentIpn()`. Postgres errors are swallowed by `dualWriteService.js` — the
webhook/redirect response is **never** delayed or failed by a Neon hiccup.

### Repository + helper files

| File | Role |
|---|---|
| `orderRepository.js` | Extended: `findByLegacyId`, `createFromMongo`, `createWithStagedWrites`, FK resolution, status/payment/notification/return/proof update-by-legacyId helpers |
| `orderDualWriteHelpers.js` **NEW** | `mirrorOrderCreate` (partial logging), `mirrorOrderStatusUpdate`, `mirrorOrderPayment`, `mirrorOrderPaymentIpn`, `mirrorOrderNotifications`, `mirrorOrderReturnItems`, `mirrorOrderPaymentProof`, `mirrorOrderReturnFlow` |

Routes were **not** modified. `dualWriteService.js` was **not** modified.

### Controller / service write paths wired

| Area | Location | Operations |
|---|---|---|
| **Checkout create** | `orderCheckoutController.js` | `newOrder.save()` → `mirrorOrderCreate` |
| **Manual POS create** | `orderAdminController.js` | `newOrder.save()` → `mirrorOrderCreate` |
| **Admin status update** | `orderAdminController.js` | `updateOrderStatus` → status + optional payment mirror |
| **Status SMS flag** | `orderAdminController.js` | `sendOrderStatusNotification` → notification flags |
| **Return approve/reject/refund/undo** | `orderAdminController.js` | status + return items + notifications (+ payment on refund) |
| **Customer cancel/return** | `orderCustomerController.js` | status / return flow mirrors |
| **Payment IPN + session start** | `paymentIpnController.js` | `mirrorOrderPayment` / `mirrorOrderPaymentIpn` |
| **Payment proof** | `orderPaymentProofController.js` | proof + payment on admin approve |
| **Courier book/sync** | `courierSyncService.js` | status + courier fields only |
| **Review reminder flag** | `reviewReminderJob.js` | `notificationsSent.reviewReminder` |

### Test results

| Suite | Result |
|---|---|
| `npm test` (Jest) | **169/169** pass |
| `npm run test:repositories` | **152/152** pass (147 prior + 3 createFromMongo FK + 2 partial-failure logging) |

### Stage 3 (Backfill) — what this rollout implies

Every `[DUAL-WRITE-FK-MISSING]` log since Part 1 (Category parent, Review userId/productId,
Wishlist productId, CartItem whole-row skip, Order userId/productId, etc.) represents a
Postgres row with a null FK or missing child that Stage 3 backfill must close once all
referenced records exist in Neon. Every `[DUAL-WRITE-ORDER-PARTIAL]` log represents an
Order row missing specific child tables (`OrderPayment`, `OrderItem`, …) that Stage 3
repair scripts must target by `postgresOrderId` + `failedStage`.

## STAGE 2 STEP 3, PART 9 — Dual-Write: Admin (Final Part — Stage 2 Step 3 Complete) — 2026-09-14

Admin was saved for last because it holds authentication credentials. Every other model
group is now proven stable with the same pattern. Same `dualWriteService.js` helper
**unchanged**. MongoDB remains the sole read source and the sole source of truth for API
responses; Postgres side-writes are best-effort and failure-isolated.

**Stage 2 Step 3 (Dual-Write) is now COMPLETE across all 9 parts / all model groups.**
Every write operation in the application now mirrors to Postgres on a best-effort basis.

### Part 5 deferred actions — now wired

| Action | Location | Postgres mirror |
|---|---|---|
| `updateSalaryConfig` | `payrollController.js` | `mirrorAdminUpdate()` — `baseSalary` (+ other profile fields on same save) |
| `revokeSystemAccess` | `employeeController.js` | `mirrorAdminUpdate()` — `status: 'blocked'` (same value as `suspendLinkedAdminAccess`; Mongo uses `blocked`, not a separate `suspended` enum) |
| `reactivateSystemAccess` | `employeeController.js` | `mirrorAdminUpdate()` — `status: 'active'` |

### Password hash difference (expected, not a bug)

Mongo and Postgres each hash passwords independently via bcrypt (12 rounds, `bcryptjs`).
Different salts produce **different hash strings** for the same plain-text password.
Both hashes verify correctly via `bcrypt.compare()` / `adminRepository.verifyPassword()`.
Dual-write passes plain-text at wiring time; `adminRepository.create()` / `update()` hash
in Postgres — **do not** attempt byte-identical hashes across databases.

### Sensitive-field secrecy in failure logs

The six secret columns (`otp`, `otpExpiry`, `totpSecret`, `totpPendingSecret`,
`smsSetupOtp`, `smsSetupOtpExpiry`) remain isolated on read via explicit `select` in
`adminRepository.js` (Stage 2 Step 2 Part 2). Admin dual-write failure logging uses
`sanitizeAdminFailureLog()` — `[DUAL-WRITE-FAILURE]` entries log admin id, operation,
timestamp, and generic `error: 'Postgres admin mirror failed'` only; **never** secret
field values, even when the underlying Postgres error message contains them.

`adminDualWriteHelpers.js` lazy-loads `adminRepository` (no top-level Prisma require) so
Jest can load admin controllers without parsing the generated `.mts` client.

### Repository + helper files

| File | Role |
|---|---|
| `adminRepository.js` | Extended: `legacyId`, `findByLegacyId`, `updateByLegacyId`, `removeByLegacyId`, `mapMongoDocToWriteInput`, `upsertFromMongo` |
| `adminDualWriteHelpers.js` **NEW** | `mirrorAdminCreate`, `mirrorAdminUpdate`, `mirrorAdminFields`, `mirrorAdminRemove`, `adminDualWrite` (sanitized failure logs) |

Routes were **not** modified. `dualWriteService.js` was **not** modified.

### Controller / service write paths wired

| Area | Location | Operations |
|---|---|---|
| **Staff CRUD** | `staffController.js` | `createStaff`, `updateStaff`, `updateStaffStatus`, `resetStaffPassword`, `deleteStaff` |
| **HRM access** | `employeeController.js` | `grantSystemAccess`, `revokeSystemAccess`, `reactivateSystemAccess`, `unlinkSystemAccess` (block), `suspendLinkedAdminAccess` |
| **Salary config** | `payrollController.js` | `updateSalaryConfig` |
| **Profile** | `adminProfileController.js` | `updateProfilePic`, `updateAdminProfile` |
| **Settings** | `adminSettingsController.js` | `updateAdminSettings`, `uploadStoreBranding` |
| **2FA** | `twoFactorController.js` | `setupTotp`, `verifyTotpSetup`, `disableTotp`, `sendSmsSetupOtp`, `verifySmsSetupOtp` (+ expired path), `updateMethod` |
| **Auth / login** | `authController.js` | bootstrap superadmin, legacy password upgrade, `lastLoginAt`, OTP set/clear, discard unverified TOTP, dispatch challenge OTP/TOTP clears, verify OTP clears, `resetTotpEmergency` |
| **Internal chat** | `internalChatController.js` | `updateInternalAdminImage` |

All Admin GET/read/list endpoints remain Mongo-only.

### Test results

| Suite | Result |
|---|---|
| `npm test` (Jest) | **169/169** pass |
| `npm run test:repositories` | **157/157** pass (152 prior + 5 Admin dual-write tests) |

New / extended repository tests in `tests/repositories/admin.repository.test.js`:

- Independent bcrypt salts verify same plain password
- `updateSalaryConfig`-style patch leaves password hash untouched
- Revoke/reactivate status `blocked` ↔ `active`
- `[DUAL-WRITE-FAILURE]` log never contains secret field values
- Superadmin `remove()` still blocked via legacyId path

### Consolidated `[DUAL-WRITE-*]` log prefixes (Stage 3 grep checklist)

| Prefix | Where emitted | Meaning for Stage 3 backfill/reconciliation |
|---|---|---|
| `[DUAL-WRITE-FAILURE]` | `dualWriteService.js`; Admin via `adminDualWriteHelpers.js` (sanitized) | Generic Postgres mirror failed after Mongo succeeded — reconcile by model + mongoId |
| `[DUAL-WRITE-FK-MISSING]` | `userRepository.js`, `orderRepository.js`, `reviewRepository.js` | Row written with null FK; backfill referenced User/Product/Order parent then patch FK |
| `[DUAL-WRITE-PARENT-MISSING]` | `categoryController.js` | Category created with null `parentId`; backfill parent Category then patch |
| `[DUAL-WRITE-CART-ITEM-FAIL]` | `cartRepository.js` | Whole CartItem row skipped (required Product FK); backfill Product then re-sync cart |
| `[DUAL-WRITE-ORDER-PARTIAL]` | `orderDualWriteHelpers.js` | Order row exists but a child stage failed — repair by `postgresOrderId` + `failedStage` |

Stage 3 scripts should grep application logs for these five prefixes and resolve each
recorded `mongoId` / `legacyId` / `postgresOrderId` once referenced Postgres rows exist.

## STAGE 3, STEP 1 — Backfill: Designation, Brand, Warehouse, Supplier, Category — 2026-09-14

Standalone scripts under `backend/scripts/backfill/` — **read MongoDB only, write
Postgres only**. No application code, routes, or repositories modified. Reuses
existing Stage 2 Step 2 repository `create()` / `update()` functions as-is.

### Framework files

| File | Role |
|---|---|
| `backfillRunner.js` | Shared `backfillModel()` — `_id`-cursor pagination, `legacyId` skip-if-exists, per-doc failure isolation |
| `runBackfill.js` | Entry point — orchestrates dependency-ordered groups (Step 1 group only in this task) |
| `verifyBackfill.js` | Mongo vs Postgres count comparison + Category parent link audit |

Run manually:

```bash
node backend/scripts/backfill/runBackfill.js
node backend/scripts/backfill/verifyBackfill.js
```

### Step 1 group — backfillModel() results (first run against real Neon)

| Model | totalFound | created | skipped | failed |
|---|---:|---:|---:|---:|
| Designation | 8 | 8 | 0 | 0 |
| Brand | 1 | 1 | 0 | 0 |
| Warehouse | 1 | 1 | 0 | 0 |
| Supplier | 0 | 0 | 0 | 0 |
| Category (pass 1) | 14 | 14 | 0 | 0 |
| Category (pass 2 — parentCategoryId) | 2 | — | 0 updated / 0 skipped | 0 |

Category pass 2 summary: `{ totalFound: 2, updated: 2, skipped: 0, failed: 0 }`.

### Category two-pass parent handling

1. **Pass 1:** `backfillModel()` creates all categories with `parentCategoryId: null`.
2. **Pass 2:** `backfillCategoryParents()` resolves each Mongo `parentCategory` ObjectId
   to the parent's Postgres `id` via `findByLegacyId()` + `categoryRepository.update()`.

### verifyBackfill.js output (first run)

| Model | Mongo | Postgres | diff |
|---|---:|---:|---|
| Designation | 8 | 10 | +2 |
| Brand | 1 | 1 | 0 |
| Warehouse | 1 | 1 | 0 |
| Supplier | 0 | 0 | 0 |
| Category | 14 | 14 | 0 |

**Designation +2:** Postgres holds 2 extra rows from prior Neon repository integration
tests (no matching Mongo `legacyId`) — not a backfill failure.

**Category parent verification:** 2 Mongo categories had `parentCategory` set; all 2
now have non-null `parentCategoryId` in Postgres. Zero orphans.

Re-run safety: `backfillModel()` skips any row whose `legacyId` already exists in
Postgres — safe to run repeatedly.

### TODO — remaining Stage 3 groups (future steps)

Extend `runBackfill.js` → `runAll()` following Stage 3 dependency order: Attribute,
Admin, Employee, Product, User, Order, CMS/Settings, Security, HRM, Marketing, etc.

### Test results (unchanged application code)

| Suite | Result |
|---|---|
| `npm test` (Jest) | **169/169** pass |
| `npm run test:repositories` | **157/157** pass |

## STAGE 3, STEP 2 — Backfill: CMS/Settings + Security/Audit Groups — 2026-09-14

Extended `runBackfill.js` and `verifyBackfill.js` — **read MongoDB only, write Postgres
only**. `backfillRunner.js` unchanged. No repository, controller, route, or
`dualWriteService.js` modifications.

### CMS/Settings group

| Model | Strategy | totalFound | created | skipped | failed |
|---|---|---:|---:|---:|---:|
| PageContent | `backfillModel()` + `pageContentRepository.create()` | 7 | 7 | 0 | 0 |
| NavbarLink | `backfillModel()` + `navbarLinkRepository.create()` | 2 | 2 | 0 | 0 |
| Banner | `backfillModel()` + `bannerRepository.createBanner()` | 4 | 4 | 0 | 0 |
| BannerSettings | **Singleton** — skip if `key='global'` exists; else `upsertBannerSettings()` | 1 | 1 | 0 | 0 |
| FooterSettings | **Singleton** — skip if `key='global'` exists; else `upsertFromMongo()` with tri-state `paymentBadgesMode` | 1 | 0 | 1 | 0 |
| Settings | **Singleton** — skip if `key='global'` exists; else `settingsRepository.upsertFromMongo()` | 1 | 1 | 0 | 0 |

FooterSettings skipped on first run because dual-write had already created the global row
(from Part 3 CMS/settings rollout) — idempotent skip, not a failure.

Singleton backfills check Postgres for an existing `key='global'` row **before** any
write — re-runs cannot create duplicates.

### Security/Audit group

| Model | Strategy | totalFound | created | skipped | failed |
|---|---|---:|---:|---:|---:|
| SecurityLog | `backfillModel()` batchSize **500** + `securityLogRepository.create()` | 899 | 899 | 0 | 0 |
| LoginAttempt | `backfillModel()` batchSize **500** + `loginAttemptRepository.create()` | 139 | 139 | 0 | 0 |
| BlacklistedIP | `backfillModel()` + `blacklistedIpRepository.upsertFromMongo()` (null `expiresAt` preserved) | 0 | 0 | 0 | 0 |
| StockAlert | `backfillModel()` + `stockAlertRepository.create()` (child rows via existing `buildItemRows`) | 1180 | 1180 | 0 | 0 |

SecurityLog collection size at run time: **899 documents** (not hundreds of thousands —
completed in ~2 minutes). StockAlert took ~37 minutes due to per-item product FK
resolution inside `create()` (1180 alerts × ~1.2 items avg).

### Step 1 idempotency on re-run (confirmed)

Step 1 group re-ran first: Designation/Brand/Warehouse/Category all **skipped** (0 created),
confirming Step 1 idempotency still holds after Step 2 additions.

### verifyBackfill.js results (after Step 2)

| Model | Mongo | Postgres | diff |
|---|---:|---:|---|
| PageContent | 7 | 7 | 0 |
| NavbarLink | 2 | 2 | 0 |
| Banner | 4 | 4 | 0 |
| SecurityLog | 899 | 899 | 0 |
| LoginAttempt | 139 | 139 | 0 |
| BlacklistedIP | 0 | 0 | 0 |
| StockAlert | 1180 | 1180 | 0 |

**Singleton verification:** BannerSettings, FooterSettings, Settings — each exactly **1**
Postgres row with `key='global'` ✓

**StockAlert child rows:** Mongo array sum = **1396**, Postgres `stock_alert_items` = **1396** ✓

### Test results (unchanged application code)

| Suite | Result |
|---|---|
| `npm test` (Jest) | **169/169** pass |
| `npm run test:repositories` | **157/157** pass |

## STAGE 3, STEP 3 — Backfill: User + HRM + Marketing/Support Groups — 2026-09-14

Extended `runBackfill.js` and `verifyBackfill.js` — **read MongoDB only, write Postgres
only**. `backfillRunner.js` unchanged. No repository, controller, route, or
`dualWriteService.js` modifications.

### In-memory FK map optimization (proactive)

Before any model backfill that resolves Product, User, Admin, or Employee FKs per row,
the script loads full `legacyId → postgresId` maps once via a single Prisma query per
entity (`buildLegacyIdMap`, `buildProductLookupMaps`, `buildAdminStaffMaps`,
`buildEmployeeStaffMaps`). Row mappers and custom backfill loops resolve FKs from these
maps synchronously — **no per-row `findByLegacyId()` / `resolveStaffSubject()` calls**.

Compared to Step 2's StockAlert experience (~37 minutes for 1180 creates with per-item
product FK resolution inside `stockAlertRepository.create()`), Step 3's User-owned +
Review + HRM groups completed in **under 30 seconds** of active Step 3 work (the full
`runBackfill.js` re-run still spends ~9 minutes re-checking 1182 StockAlert + 901
SecurityLog rows for idempotent skips).

Architectural note: Attendance, Payroll, and Leave `upsertFromMongo()` / `apply()` always
re-resolve staff internally and cannot accept pre-resolved FK IDs. Step 3 uses **script-only
Prisma creates** mirroring those functions' field shapes, with staff columns populated from
the in-memory Admin/Employee maps via `staffFields()`. WishlistItem, WalletTransaction,
and CartItem similarly use direct Prisma writes in the script (not repository helpers that
mutate balances or re-query products per row).

### referralCode pass-through (confirmed)

`userRepository.create()` receives `referralCode` explicitly from each Mongo document
(`mapUser()` uppercases and passes through). Users without a Mongo `referralCode` would
still get auto-generation — none of the 4 successfully backfilled users relied on that
path in this run (all had existing codes from production).

### Step 1 — User group

| Model | Strategy | totalFound | created | updated | skipped | failed |
|---|---|---:|---:|---:|---:|---:|
| User | `backfillModel()` + `userRepository.create()` + explicit `referralCode` | 7 | 4 | — | 0 | 3 |
| User (referredBy pass) | Second pass — wire `referredById` from user map | 0 | — | 0 | 0 | 0 |
| Address | Custom — `userRepository.addAddress()` after user map | 5 | 5 | — | 0 | 0 |
| WishlistItem | Custom — Prisma create + product map (null FK if product missing) | 15 | 15 | — | 0 | 0 |
| WalletTransaction | Custom — Prisma create (historical rows; no balance mutation) | 9 | 9 | — | 0 | 0 |
| Cart | Custom — Prisma create + product map per item | 4 | 3 | — | 0 | 1 |
| CartItem | Custom — skip individual items when product not in Postgres | 7 | 0 | — | 7 | 0 |

**User failures (3):** Mongo users `6a1e6bc…`, `6a265b46…`, `6a2e9cb…` rejected by
`userRepository.create()` — missing required `firstName` (likely incomplete sandbox/test
accounts). Their embedded addresses/wishlist/wallet rows were not backfilled.

**Cart failure (1):** Cart `6a2e9dfe…` — owner user not in Postgres (same failed-user set).

**CartItem skips (7):** All cart line items skipped — **Product backfill not yet run**
(product map loaded **0** rows). Carts were created shell-only where the user existed.

### Step 2 — HRM group

| Model | Strategy | totalFound | created | skipped | failed |
|---|---|---:|---:|---:|---:|
| Employee | `backfillModel()` + `employeeRepository.create()` | 3 | 3 | 0 | 0 |
| EmployeeDocument | Custom — `employeeRepository.addDocument()` | 1 | 1 | 0 | 0 |
| EmployeeReference | Custom — `employeeRepository.addReference()` | 0 | 0 | 0 | 0 |
| Attendance | Custom Prisma create + Admin/Employee staff maps | 2 | 1 | 0 | 1 |
| Payroll | Custom Prisma create + staff maps | 0 | 0 | 0 | 0 |
| Leave | Custom Prisma create + staff maps | 0 | 0 | 0 | 0 |

**Attendance failure (1):** `6aa42b47…` — staff not found (Admin map loaded **0** rows;
Admin backfill is a later Stage 3 step — dual-write had not yet populated Admin in Neon
for this attendance record's `staffId`).

### Step 3 — Marketing/Support group

| Model | Strategy | totalFound | created | updated | skipped | failed |
|---|---|---:|---:|---:|---:|---:|---:|
| Newsletter | `backfillModel()` + `newsletterRepository.create()` | 0 | 0 | 0 | 0 | 0 |
| EmailCampaign | `backfillModel()` + `upsertFromMongo()` | 0 | 0 | 0 | 0 | 0 |
| ContactMessage | `backfillModel()` + `contactMessageRepository.create()` | 6 | 6 | 0 | 0 | 0 |
| Review | Custom — `reviewRepository.create()` + user/product maps; FK patch on existing rows | 2 | 2 | 0 | 0 | 0 |

### Review null-userId health check (verifyBackfill.js)

| Metric | Count |
|---|---:|
| Total Review rows in Postgres | 2 |
| Reviews with non-null `userId` | **2** |
| Reviews with null `userId` | **0** |

Both reviews resolved `userId` via the user map on create. No pre-existing dual-write
Review rows with null `userId` were present in Neon before this run (Product `productId`
FK remains null on both — Product backfill pending).

### verifyBackfill.js — Step 3 highlights

- User: Mongo **7** vs Postgres **4** (−3 failed-user delta, expected)
- Employee, ContactMessage, Review: **exact match**
- Cart: Mongo **4** vs Postgres **3** (failed-user cart)
- Attendance: Mongo **2** vs Postgres **1** (admin staff unresolved)
- User owned children: Address **5/5**, WishlistItem **15/15**, WalletTransaction **9/13**
  (4 txns belong to the 3 failed users)
- CartItem: Postgres **0** vs Mongo **7** (all products missing from Neon — expected until
  Product backfill)

### Test results (unchanged application code)

| Suite | Result |
|---|---|
| `npm test` (Jest) | **169/169** pass |
| `npm run test:repositories` | **157/157** pass |

## STAGE 3, STEP 4 — Backfill: Admin + Product, Gap Repair — 2026-09-14

Extended `runBackfill.js` and `verifyBackfill.js` — **read MongoDB only, write Postgres
only**. `backfillRunner.js` unchanged. No repository, controller, route, or
`dualWriteService.js` modifications.

### Admin password hash preservation (verified — no double-hash)

`adminRepository.create()` calls `preparePasswordField()`, which uses `isHashed()` with
the bcrypt pattern `/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/`. When the Mongo `password`
field (already a bcrypt digest) is passed through, **the hash is stored unchanged** —
`passwordChangedAt` is not overwritten.

Post-backfill verification: **3/3** Mongo admins matched byte-for-byte in Postgres
(`Admin (password hash check): preserved=3, mismatched=0`). This is preferable for
historical backfill (same hash as Mongo) vs live dual-write (independent salts).

### Step 1 — Admin backfill + HRM gap re-attempt

| Model | Strategy | totalFound | created | skipped | failed |
|---|---|---:|---:|---:|---:|
| Admin | `backfillModel()` + `adminRepository.create()` + hashed password pass-through | 3 | 3 | 0 | 0 |
| Attendance (re-attempt ×2 after Admin) | Custom Prisma + in-memory staff maps | 2 | 0 | 1 | 1 |
| Payroll (re-attempt) | Custom Prisma + staff maps | 0 | 0 | 0 | 0 |
| Leave (re-attempt) | Custom Prisma + staff maps | 0 | 0 | 0 | 0 |

**HRM gap closure from Step 3:** Attendance **0 of 1** previously-failed record resolved.
Payroll/Leave: no Step 3 failures to close (0 Mongo documents).

**Investigation (2026-09-15) — orphaned Attendance, PERMANENTLY EXCLUDED:**

| Field | Value |
|---|---|
| Attendance `legacyId` | `6aa42b47265447ac6ddf014e` |
| `staffId` | `6a644b4a1b87a4a67beaf2f5` (no matching Admin or Employee in Mongo) |
| `staffUsername` | `nurjahan` (no Admin with this username — exact, case-insensitive, or fuzzy) |
| `staffType` | `admin` |
| `date` | 2026-09-11 |
| `markedBy` | `abdul-karim` |

MongoDB currently has **3** Admin documents (`abdul-karim`, `kalpona`, `dalia`); all **3**
were backfilled to Postgres (including blocked `dalia`). The Admin backfill uses
unfiltered `Admin.find()` via `backfillModel()` — **no status/role filter** excluded
`nurjahan`. The account simply **does not exist** in Mongo's Admin collection today
(deleted before migration; attendance row is stale/orphaned source data).

**Correction:** Re-running backfill or widening the `staffUsername` resolver **cannot**
fix this — there is no Admin row in Mongo or Postgres to resolve. This is **pre-existing
MongoDB data-integrity debt**, exposed (not caused) by Postgres FK enforcement; evidence
the migration is working correctly, not a migration bug.

**Category:** Same as the 3 users missing `firstName` — **PERMANENTLY EXCLUDED from
Postgres**. Do not invent a placeholder Admin to satisfy the FK. Accept Mongo **2** /
Postgres **1** for Attendance in verification.

### Step 2 — Product backfill (+ sub-resources)

In-memory FK maps loaded once: Category (by name), Brand, Supplier, Warehouse, Admin,
User. `productRepository.create()` for core row; script-level `prisma.product.update()`
sets `legacyId`, `rating`, `numOfReviews` (not accepted by `create()` signature).

| Model | totalFound | created | skipped | failed |
|---|---:|---:|---:|---:|
| Product | 14 | 14 | 0 | 0 |
| ProductVariant | 45 | 45 | 0 | 0 |
| ProductVariantAttribute | 70 (via `addVariant()`) | — | — | — |
| ProductCostHistory | 0 | 0 | 0 | 0 |
| ProductEmbeddedReview | 0 | 0 | 0 | 0 |

14 products with 45 variants completed in ~10 minutes active Step 4 work (variant
attribute expansion via `addVariant()` — acceptable at this scale; not StockAlert-scale).

Cost history / embedded reviews: 0 Mongo source rows across all 14 products.

### Step 3 — Gap repair (CartItem, Review, WishlistItem)

Step 3 CartItems were **entirely skipped** (no Postgres row) — `productId` is required
and Product map was empty. Carts existed as shell-only rows with 0 items.

| Repair | totalFound | created/repaired | skipped | failed | Notes |
|---|---:|---:|---:|---:|---|
| CartItem | 7 | **7 created** | 0 | 0 | 0 → 7 Postgres rows |
| Review productId | 2 null FK | **1 repaired** | 1 | 0 | 1 product still not in PG |
| WishlistItem productId | 15 null FK | **14 repaired** | 1 | 0 | 1 legacyProductId unresolvable |

### verifyBackfill.js — Step 4 highlights

- Product: Mongo **14** = Postgres **14** ✓
- ProductVariant: **45/45** ✓; ProductVariantAttribute: **70/70** ✓
- CartItem: Mongo **7** = Postgres **7** ✓ (gap closed)
- Review productId: **1/2** non-null (1 still null — product not backfilled/resolvable)
- WishlistItem productId: **14/15** non-null
- Attendance: Mongo **2** vs Postgres **1** (1 orphaned — permanently excluded; see above)

### Open gaps (documented, not auto-invented)

| Gap | Count | Reason |
|---|---:|---|
| User missing `firstName` | 3 | `userRepository.create()` validation — **no placeholder names invented** |
| Attendance orphaned staff (`nurjahan`) | 1 | Deleted Admin not in Mongo or Postgres — **permanently excluded** |
| Review/WishlistItem null productId | 1 each | Product reference not in Postgres product map |
| Cart (owner user failed) | 1 | Same 3 failed users from Step 3 |

### Test results (unchanged application code)

| Suite | Result |
|---|---|
| `npm test` (Jest) | **169/169** pass (HRM tests use local calendar date; see `tests/hrm.test.js`) |
| `npm run test:repositories` | **157/157** pass (Neon timeout retries on flaky runs) |

## STAGE 3, STEP 4 — Orphaned Attendance gap confirmed permanent — 2026-09-15

Read-only Mongo investigation confirmed Case (b): Attendance `6aa42b47265447ac6ddf014e`
references Admin `staffId` `6a644b4a…` / username `nurjahan` that exists in **neither**
Mongo's current Admin collection nor Postgres. Admin backfill imported all 3 live Mongo
admins (including blocked `dalia`); no query filter excluded this account. Documented as
**permanently unmigratable** alongside the 3 `firstName`-less users. Corrected
`tests/hrm.test.js` HRM assertions (local calendar date + comments); no backfill or
repository changes.

## STAGE 3, STEP 5 — Backfill: Order (Final Step — Stage 3 Complete) — 2026-09-15

The final and most financially sensitive backfill. Read-only from MongoDB, write-only to
Postgres. No application code, routes, repositories, or `dualWriteService.js` changed.
`backfillRunner.js` reused as-is. New logic added only to `runBackfill.js` (Step 5 group)
and `verifyBackfill.js` (financial aggregates).

### Case A/B/C classification (the key new logic)

Because Order dual-write (Part 8) can leave a **partial** Postgres row, each Mongo order
is classified — not the usual create-or-skip:

| Case | Meaning | Action |
|---|---|---|
| **A** | No Postgres row for this `legacyId` | Full create (Order + all children) via `createWithStagedWrites()` |
| **B** | Postgres row present AND every child Mongo says should exist is present | Skip (idempotent) |
| **C** | Postgres row present but ≥1 expected child row missing | Repair **only** the missing children; never touch the Order parent or existing children |

`classifyOrder(plain, existing)` derives expectations from the **Mongo source document**
(items count, `hasMongoPaymentData`, ipn count, `hasMongoProofData`, returnItems count,
notification row) and compares to the shaped `orderRepo.findByLegacyId()` result. Item
repair matches by `lineKey` to avoid duplicates; ambiguous partials without stable
lineKeys are skipped with a `[ORDER-REPAIR]` log for manual review rather than risking dupes.

### In-memory FK maps (built once, no per-order lookups)

`user`, `product` (legacyId + productId), `paymentMethod`, `admin` legacyId→id maps.
Map sizes at run: user **4**, product **14/14**, paymentMethod **0**, admin **3**.

Critical correctness fix vs. the repo's `createFromMongo()`: `payment.methodId` and
`paymentProof.reviewedBy` are Mongo ObjectIds that must be resolved to Postgres ids (null
fallback) or the FK insert fails. `mapOrderInputFromMongo()` resolves all four
cross-collection FKs from maps, mirrors `buildCreateInputFromMongo()`'s field passthrough
exactly, and **never collapses `subTotal`/`subtotal`** (both passed independently).

### Case A/B/C counts (this run)

| Metric | Value |
|---|---:|
| Orders processed | **25** |
| **Case A** (full create) | **25** |
| **Case B** (complete, skipped) | **0** |
| **Case C** (repaired) | **0** |
| Failed | **0** |

**Why 0 Case B/C:** the 25 orders predate Order dual-write going live; Postgres held **0**
production order rows (`legacyId IS NOT NULL` = 0 before this step). The only pre-existing
Postgres order rows are **3 repository test artifacts** (`legacyId = null`), which never
collide with a Mongo `legacyId` lookup. Case B/C code paths are implemented and unit-safe
but did not fire on current data; they will engage on any future re-run after live
dual-write activity has produced partial rows.

**Case C repair tallies (all zero this run, tracked for future runs):**
`{ orderItems: 0, payment: 0, ipnEvents: 0, paymentProof: 0, returnItems: 0, notifications: 0 }`

### FK null-and-log fallbacks (expected, not errors)

| FK | Null count | Reason |
|---|---:|---|
| `Order.userId` | 0 | All 16 user-bearing orders resolved; 9 guest orders carry no user ref |
| `OrderItem.productId` | 25 | Line items reference SKU-style codes (`PRP-021`, `GRO-014`, `SKIRT-01`, …) for legacy/deleted products not in Postgres — `SetNull`, `legacyProductId` preserved |
| `OrderPayment.methodId` | 15 | PaymentMethod table is empty in Postgres (never backfilled) — `SetNull` |
| `OrderPaymentProof.reviewedById` | 0 | No payment proofs carry a reviewer |

### Financial aggregate verification (the single most important number)

`grandTotal` is the authoritative order total — the only `required` money field on the
Order schema (`totalAmount` is nullable). Postgres sums restrict to `legacyId IS NOT NULL`
so the 3 repo test rows never distort the comparison.

| Aggregate | MongoDB | PostgreSQL | Difference |
|---|---:|---:|---:|
| **SUM(grandTotal)** | **129,464** | **129,464** | **0 ✓ MATCH** |
| SUM(totalAmount) | 129,464 | 129,464 | 0 ✓ |

**Orders where Mongo has payment data but Postgres `OrderPayment` is missing: 0 ✓**
(16 Mongo orders carry real payment data; all 16 have a Postgres `OrderPayment` row.)

`ORDER FINANCIAL VERIFICATION: PASS — safe to close Stage 3.`

### Order child-row counts (Postgres totals include the 3 test rows)

| Table | Postgres | Note |
|---|---:|---|
| OrderItem | 67 | 64 production items + 3 test |
| OrderReturnItem | 0 | Mongo has 0 |
| OrderPayment | 23 | 20 production (orders with a stored `payment` subdoc) + 3 test; the 16 with real data all present |
| OrderPaymentIpnEvent | 3 | test rows only; Mongo has 0 IPN events |
| OrderPaymentProof | 22 | 19 production (orders with a stored `paymentProof` subdoc) + 3 test |
| OrderNotification | 28 | 25 production (always created on full create) + 3 test |

Row-count line `Order: Mongo=25 Postgres=28 diff=+3` reflects the 3 test artifacts.

### Regression checks

| Suite | Result |
|---|---|
| `npm test` (Jest) | **169/169** pass |
| `npm run test:repositories` | **157/157** pass |

### Stage 3 close-out

**Stage 3 (Backfill) is now COMPLETE. All 8 dependency groups have been backfilled. Known
permanent gaps: 3 users missing `firstName`, 1 orphaned Attendance record (`nurjahan`).
All other data has been verified present and consistent between MongoDB and PostgreSQL —
including the Order financial aggregate (`SUM(grandTotal)` matches to the cent).**

Documented, non-blocking deltas (pre-existing data debt, not migration bugs):

| Delta | Count | Category |
|---|---:|---|
| User missing `firstName` | 3 | Permanent — no invented names |
| Attendance orphaned staff (`nurjahan`) | 1 | Permanent — deleted Admin |
| Review / WishlistItem null productId | 1 each | Product ref not resolvable |
| Cart owner (failed user) | 1 | One of the 3 `firstName` users |
| WalletTransaction | 4 short (PG 9 / Mongo 13) | Wallet history tied to the 3 failed-backfill users |
| OrderItem productId null | 25 | Legacy/deleted product SKUs — `SetNull`, `legacyProductId` preserved |

### What Stage 4 (Read Cutover) needs from here

1. **Reads still come from MongoDB only** — no read path was cut over in Stages 2–3.
2. **PaymentMethod must be backfilled before Order reads cut over**, or `OrderPayment.methodId`
   will read as null in Postgres (currently 15 orders). It is the one referenced catalog not
   yet migrated; add it as the first Stage 4 prerequisite.
3. **Case A/B/C + financial verification are re-runnable** — after any further live dual-write
   activity, re-run `runBackfill.js` (idempotent: existing orders → Case B) then
   `verifyBackfill.js`; the financial line must stay `diff 0` and `missing OrderPayment: 0`.
4. **Test-row hygiene:** repository test artifacts (`legacyId = null`) inflate raw Postgres
   counts; every financial comparison filters them out. Read cutover queries must never treat
   `legacyId = null` rows as production orders.
5. **Cutover ordering** unchanged from the audit's dependency graph; Order is last because it
   depends on User, Product, PaymentMethod, and Admin.

## STAGE 4, STEP 1 — Read Cutover: Feature Flags + Category/Brand/Supplier/Warehouse/Designation — 2026-09-15

Stage 4 begins: a per-group feature-flag framework routes **reads only** to PostgreSQL when
explicitly enabled via environment variable. **All flags default OFF** — with no env vars set,
behaviour is byte-for-byte identical to pre-Stage-4 (100% Mongo reads). Writes are unchanged
(dual-write to both databases regardless of flag state). Mongo read paths are preserved intact
as the default and automatic fallback.

### Feature flags (all default OFF)

| Env var | Group | Controls |
|---|---|---|
| `READ_PG_CATEGORY` | `category` | Category public + admin read endpoints |
| `READ_PG_BRAND` | `brand` | `GET` brand list (public) |
| `READ_PG_SUPPLIER` | `supplier` | Admin supplier list + detail reads |
| `READ_PG_WAREHOUSE` | `warehouse` | Admin warehouse list + detail reads |
| `READ_PG_DESIGNATION` | `designation` | Admin HRM designation list reads |

Documented in `.env.example` (commented out / false). Flip to `true` and restart the server to
enable Postgres reads for that group — no code deploy required beyond env change + restart.

### New infrastructure

| File | Role |
|---|---|
| `backend/src/config/readCutoverFlags.js` | `isPgReadEnabled(group)` — reads `process.env` per call |
| `backend/src/services/readRouter.js` | `routedRead(group, mongoFn, pgFn)` — Postgres with Mongo fallback on error |
| `backend/src/services/readShapeHelpers.js` | `toMongoShape` transforms — `_id` = `legacyId`, enum/status normalisation |

**Fallback safety net:** when a flag is ON but Postgres throws, `routedRead()` logs
`[READ-CUTOVER-FALLBACK] {group} Postgres read failed, falling back to Mongo:` and returns the
Mongo result — callers never see a broken read. Unit-tested in `tests/services/readRouter.test.js`.

### Read endpoints wired (reads only — no writes touched)

**Category** (`categoryController.js`):

| Endpoint | Handler |
|---|---|
| `GET /api/categories` | `getCategories` |
| `GET /api/categories/tree` | `getCategoryTree` |
| `GET /api/categories/navbar` | `getNavbarCategories` |
| `GET /api/categories/homepage` | `getHomepageCategories` |
| `GET /api/categories/:slug` | `getCategoryBySlug` (category tree only — products still Mongo) |
| `GET /api/categories/admin/:id` | `getCategoryById` |
| `GET /api/categories/admin/all` | `adminGetCategories` |

**Brand** (`brandController.js`): `GET` brands list (`getBrands`). Cache bypassed when
`READ_PG_BRAND=true` so stale Mongo cache cannot mask the cutover.

**Supplier** (`supplierController.js`): `GET /api/admin/suppliers`, `GET /api/admin/suppliers/:id`.

**Warehouse** (`warehouseController.js`): `GET /api/admin/warehouses`, `GET /api/admin/warehouses/:id`.

**Designation** (`designationController.js`): `GET /api/admin/hrm/designations`.

### Shape transforms (why / what)

| Model | Transform needed? | Notes |
|---|---|---|
| **Category** | Yes — `categoryToMongoShape()` | `_id` ← `legacyId`; `parentCategory` ← resolved parent `legacyId` (populated `{ _id, name }` on admin reads); `customCashback` Decimal → number; strips Postgres-only keys |
| **Brand** | Yes — `brandToMongoShape()` | `_id` ← `legacyId`; `ACTIVE`/`INACTIVE` enum → `'active'`/`'inactive'` |
| **Supplier** | Yes — `supplierToMongoShape()` | `_id` ← `legacyId`; status enum normalised; **`suppliedProducts` still enriched from Mongo** (roster array not backfilled to `supplier_products` junction); **`purchaseOrders` still from Mongo** (PO group not yet cut over) |
| **Warehouse** | Yes — `warehouseToMongoShape()` | `_id` ← `legacyId`; status enum normalised; **`productCount` still computed from Mongo** `Product.aggregate` (Product not yet cut over) |
| **Designation** | Minimal — `designationToMongoShape()` | `_id` ← `legacyId`; `employeeCount` already computed by `designationRepository.findAll()` — direct match |

Repository `toShape()` helpers use `_id: record.id` (Postgres UUID) for repository-layer tests;
read-cutover transforms remap `_id` to `legacyId` so API callers see the original Mongo ObjectId.

### Default (flags OFF) behaviour

Confirmed: **`npm test` → 183/183 pass** with no read-cutover env vars set (169 pre-existing +
14 new Stage 4 tests). Outcomes identical to pre-Stage-4 for all integration tests.

### Flag-ON and fallback tests

| Test file | Coverage |
|---|---|
| `tests/services/readRouter.test.js` | Flag off/on; `[READ-CUTOVER-FALLBACK]` on Postgres throw |
| `tests/services/readShapeHelpers.test.js` | Per-model shape parity (_id, parentCategory, status, employeeCount) |
| `tests/services/readCutoverGroup1.test.js` | Mocked repository flag-ON vs Mongo baseline field-set match |

### Regression checks

| Suite | Result |
|---|---|
| `npm test` (Jest) | **183/183** pass |
| `npm run test:repositories` | **157/157** pass |

**Flags remain OFF in all deployed environments until a deliberate post-review enable.**

## STAGE 4, STEP 1 CLEANUP — Data Parity Fix — 2026-09-15

Post-verification cleanup (Postgres writes only; **no MongoDB writes**; read-cutover flags
remain OFF). Corrects backfill drift and repository-test artifacts identified in the Stage 4
Step 1 verification report.

### Postgres data changes executed

| Step | Action | Count / detail |
|---|---|---|
| **1 — Delete test artifacts** | Deleted designation rows by exact `pgId` only | **2** — `8bd50cd5-98a8-4344-a73f-e397ed7ce7ba` (`__test_des_1789327067829_ToDelete`), `9f6548f1-96b9-4f86-ba11-7b9b9a9d58e1` (`__test_des_1789327099945_ToDelete`); both had `legacyId: null` |
| **2 — Category `isActive`** | Mongo authoritative: `true` only when `doc.isActive === true` | **9 changed** `true → false`: Baby & Kids, Beauty & Personal Care, Electronics, Footwear, Grocery, Health & Beauty, Home & Kitchen, Kids Fashion, Stationery & Office. **5 unchanged**: Fashion & Apparel, Mobile, Samsung, Walton Mobile (explicit `true` in Mongo); Automotive (already `false`) |
| **3 — Timestamps** | `createdAt` / `updatedAt` copied from Mongo | **14** categories, **1** brand (Walton — timestamps only; slug/status/description left AS-IS), **1** warehouse (Main Warehouse), **8** designations |
| **4 — Warehouse `isDefault`** | Restored Main Warehouse (`legacyId` `6aa2c030b4f03cafedef7b4d`) | `isDefault: true` (matched Mongo; drift from prior `setDefault()` repository test) |
| **5 — Intentionally untouched** | Category `productCount`, Category `slug`; Brand backfill slug/status/description | Deferred to Product group cutover / separate slug concern |

### Re-verification (same method as Stage 4 Step 1 verification report)

Flags toggled in process env only (`.env` not modified). Zero `[READ-CUTOVER-FALLBACK]` entries.

| Model | Verdict | Notes |
|---|---|---|
| **Supplier** | **PASS** | All endpoints match |
| **Category** | **FAIL** | Core parity fixed (`isActive` counts align; homepage **PASS**). Remaining diffs: `__v` extra in PG shape; sparse Mongo fields (`slug`, `iconUrl`, `imageUrl`, …); `productCount` (intentionally not synced) |
| **Brand** | **FAIL** | `createdAt` synced. Remaining: PG-only backfill fields (`slug`, `status`, `description`) and missing Mongo `updatedAt`; `__v` shape gap |
| **Warehouse** | **FAIL** | `isDefault` + timestamps synced. Remaining: `__v` only (read-shape gap) |
| **Designation** | **FAIL** | Timestamps synced; 8 legitimate rows. Remaining: `__v` on all 8 rows (read-shape gap) |

**Conclusion:** Targeted **data** drift (isActive, timestamps, isDefault, test rows) is resolved.
Full endpoint PASS for all five models is blocked by **read-shape** gaps (`__v` omission in
`readShapeHelpers`) and **out-of-scope** fields (category slug/productCount, brand backfill
fields) — not by Postgres read failures.

### Process fixes (prevent recurrence)

1. **`categoryRepository.create()`** — when `isActive` is `undefined`, default to **`false`**
   (matches Mongo `{ isActive: true }` query semantics). Test updated in
   `category.repository.test.js`.
2. **`designation.repository.test.js`** — `createTestDesignation()` always sets a unique
   non-null `legacyId`; `afterEach` deletes rows matching the test `PREFIX` even on failure.
3. **`warehouse.repository.test.js`** — `beforeAll` captures full pre-test warehouse
   `isDefault`/`updatedAt` snapshot; `afterEach` restores snapshot (prevents Main Warehouse
   drift from `setDefault()` tests). `jestCompat.js` exports `beforeAll`.

### Regression checks after cleanup

| Suite | Result |
|---|---|
| `npm test` (Jest) | **183/183** pass |
| `npm run test:repositories` | **157/157** pass |

## STAGE 4, STEP 1 — `__v` read-shape fix — 2026-09-15

Final read-shape gap from cleanup re-verification: Postgres transforms omitted Mongoose's `__v`
key present on every `.lean()` document.

### Change

`readShapeHelpers.js` — all group-1 transforms now emit `__v: 0` (`MONGOOSE_DOC_VERSION`).
Verified against live Mongo (2026-09-15): Category×14, Brand×1, Warehouse×1, Designation×8
all have `__v === 0`; Supplier collection empty (no production rows to sample).

Applied to: `categoryToMongoShape`, `brandToMongoShape`, `supplierToMongoShape`,
`purchaseOrderToMongoShape`, `warehouseToMongoShape`, `designationToMongoShape`.

### Re-verification after `__v` fix

Same field-by-field endpoint comparison (flags in process env only; zero fallbacks).

| Model | Verdict | Notes |
|---|---|---|
| **Supplier** | **PASS** | All endpoints match |
| **Warehouse** | **PASS** | List + detail — full shape parity |
| **Designation** | **PASS** | All 8 rows match |
| **Category** | **FAIL** | `__v` resolved. Remaining: PG emits backfill/default fields absent on sparse Mongo docs (`slug`, `iconUrl`, `imageUrl`, `bannerImageUrl`, `customCashback`, `parentCategory`); `productCount` drift (deferred — Product group not cut over). Homepage endpoint **PASS**. |
| **Brand** | **FAIL** | `__v` resolved. Remaining: PG backfill fields (`slug`, `status`, `description`) absent on sparse Mongo Walton doc; Mongo has no `updatedAt`. |

**Stage 4 Step 1 status:** Framework + cleanup + `__v` shape fix **COMPLETE**. Supplier,
Warehouse, and Designation achieve **full endpoint shape parity** today. Category and Brand
require a follow-up sparse-field shape pass (omit PG-only keys when Mongo doc lacks them, and
`productCount` once Product reads cut over) before flag enable — not blockers for Step 1
infrastructure delivery.

### Regression checks

| Suite | Result |
|---|---|
| `npm test` (Jest) | **183/183** pass |
| `npm run test:repositories` | **157/157** pass |

**Flags remain OFF. Step 1 infrastructure closed; Category/Brand sparse-field parity tracked for pre-enable follow-up.**

## STAGE 4, STEP 1 — Option C: Tier 1 shape fixes + productCount sync + legacy exceptions — 2026-09-15

### Tier 1 read-time fixes (`readShapeHelpers.js`)

Category transform now omits keys when Postgres value is unset, matching Mongo `.lean()` sparsity
on legacy rows with no stored value:

| Field | Rule |
|---|---|
| `imageUrl`, `iconUrl`, `bannerImageUrl` | Omit when PG value is `null` |
| `customCashback` | Omit when PG value is `null` |
| `parentCategory` | Omit entirely when no parent; include populated `{ _id, name }` or legacy id string when parent exists |

`categoryTreeSelectFields()` applies the same omission rules for tree/navbar endpoints.

### One-time `productCount` sync

Script: `backend/scripts/backfill/syncCategoryProductCount.js` (read Mongo → write Postgres only).

| Category | Mongo `productCount` key | Action |
|---|---|---|
| Fashion & Apparel | present (`9`) | **Updated** PG `0 → 9` |
| Automotive, Mobile, Samsung, Walton Mobile | present (`0` each) | Already matched PG |
| 9 sparse categories (Baby & Kids, Beauty & Personal Care, Electronics, Footwear, Grocery, Health & Beauty, Home & Kitchen, Kids Fashion, Stationery & Office) | **absent** | PG kept at `0` (never maintained in Mongo) |

Note: `GET /api/categories/admin/all` still overlays live `productCount` from Mongo
`Product.aggregate` on **both** read paths — the sync fixes stored PG values for repository/cutover
consistency; admin list counts remain live-computed until Product read cutover.

### Permanent legacy shape exceptions (Option C — no `legacyLeanKeys` column)

These exceptions apply **ONLY** to records created before dual-write existed. Every record
created or updated through dual-write from this point forward will have fully consistent shape
on both databases, since Mongo's own `save()` now populates these same fields at write time.
This exception list will naturally shrink to zero relevance as legacy pre-dual-write records
are edited/updated through the live application (triggering a fresh, complete dual-write) or as
this data ages out of practical relevance.

**Category — 11 sparse legacy rows** (created before slug/color/boolean defaults were
consistently set in Mongo; ultra-sparse 6-key docs plus Fashion/Automotive partial docs):

| Field | Reason |
|---|---|
| `slug` | Backfill-generated in Postgres; absent on 11/14 Mongo docs |
| `isActive`, `isFeatured`, `showInNavbar`, `showInHomepage` | PG schema defaults vs Mongo-absent ambiguity (e.g. PG `isActive: false` vs key absent) |
| `color`, `description`, `metaTitle`, `metaDescription` | Same default-value vs Mongo-absent ambiguity |

**Category — additional Tier 1 side-effect exception (Mobile, Samsung, Walton Mobile):**

Separate from the 11 sparse-row list above — these three categories are affected for a
different reason (explicit Mongo `null` keys vs Tier 1 key omission), not backfill-default
ambiguity:

> **Additional Tier 1 side-effect exception:** Mobile, Samsung, and Walton Mobile store explicit
> null values for `bannerImageUrl` / `iconUrl` / `customCashback` in their Mongo documents (key
> present, value null), while the Tier 1 read-time fix omits these keys whenever the Postgres
> value is null, without distinguishing "Mongo also has this as null" from "Mongo never had this
> field." This means these 3 categories' Postgres-sourced reads will have these 3 keys **ABSENT**
> where Mongo would show them as explicitly null. This is a byte-shape difference only (both
> effectively mean "no image / no custom cashback" to any consuming code that checks truthiness
> or existence) — it does not affect application behavior for any current frontend/mobile code,
> since checking `if (category.bannerImageUrl)` behaves identically whether the key is absent or
> explicitly null. Accepted as a permanent exception under the same reasoning as the other
> documented gaps: low-impact, affects a small fixed set of legacy-era records, and does not
> represent a data-integrity problem.

**Brand — 1 legacy row (Walton):**

| Field | Reason |
|---|---|
| `slug`, `status`, `description`, `updatedAt` | Mongo Walton document predates full brand schema (name + `createdAt` only) |

### Follow-up flagged (NOT fixed in this task)

**`customCashbackPercentage` vs `customCashback` field-name mismatch:** Kids Fashion and Beauty &
Personal Care have `customCashbackPercentage` in Mongo but Stage 3 backfill mapped
`customCashback` only (`mapCategoryPass1`). Requires a separate fix in `categoryRepository.js`
and/or the backfill mapper — not part of this shape-parity task.

### Final verification (2026-09-15)

Flags toggled in process env only. Zero `[READ-CUTOVER-FALLBACK]` entries.

| Model | Verdict | Notes |
|---|---|---|
| **Supplier** | **PASS** | Full exact field match |
| **Warehouse** | **PASS** | List + detail |
| **Designation** | **PASS** | All 8 rows |
| **Category** | **ACCEPTED** | Remaining diffs limited to (1) 11-sparse-row exception fields (`slug`, boolean defaults, `color`, `description`, meta fields) and (2) separate Tier 1 null-vs-absent side-effect exception on Mobile/Samsung/Walton Mobile. **No unexpected new field types.** Homepage endpoint **PASS**. |
| **Brand** | **ACCEPTED** | Remaining diffs exactly: `slug`, `status`, `description`, `updatedAt` on Walton |

### Regression checks

| Suite | Result |
|---|---|
| `npm test` (Jest) | **183/183** pass |
| `npm run test:repositories` | **157/157** pass |

---

### Stage 4 Step 1 — CLOSED (2026-09-15)

**Stage 4 Step 1 is COMPLETE.** Supplier, Warehouse, and Designation have exact read-shape
parity and are safe to enable in any environment. Category and Brand have exact parity for all
records created via dual-write; 11 legacy Category records and 1 legacy Brand record (Walton)
have documented, permanent, accepted shape exceptions on specific non-critical fields (see
exception list above) that do not affect data correctness or application functionality — only
exact byte-for-byte shape matching on historical sparse records.

**Flags remain OFF in all deployed environments until deliberate post-review enable per model.**

---

## STAGE 4, STEP 2 — Read Cutover: CMS/Settings Group — 2026-09-15

Stage 4 Step 2 extends the Step 1 read-cutover framework to the CMS/Settings dual-write group
(PageContent, NavbarLink, FooterSettings, Banner + BannerSettings, Settings). All new flags
default **OFF**. Writes unchanged (dual-write). Postgres read failure still falls back to Mongo
via `routedRead()`.

### New feature flags (all default OFF)

| Env var | Group key | Wired read surfaces |
|---|---|---|
| `READ_PG_PAGECONTENT` | `pagecontent` | Admin page list/detail; public page content (`pageContentController`, `storeController`) |
| `READ_PG_NAVBARLINK` | `navbarlink` | Public + admin navbar links (cache bypass when flag ON) |
| `READ_PG_FOOTERSETTINGS` | `footersettings` | Admin + public footer settings; payment-badges list |
| `READ_PG_BANNER` | `banner` | Public active banners + admin all banners (includes BannerSettings singleton) |
| `READ_PG_SETTINGS` | `settings` | Delivery/master/all-settings admin reads; store delivery/announcement/flash-sale/cache/health; rate-limiter settings load |

Documented in `.env.example` (commented). **BannerSettings shares `READ_PG_BANNER`** (no separate flag).

### Implementation summary

| File | Change |
|---|---|
| `readCutoverFlags.js` | Five new group keys |
| `readShapeHelpers.js` | CMS/Settings `toMongoShape` transforms (nested FooterSettings/Settings reassembly, banner Decimal→Number, PageContent stored `bodyHtml` only) |
| `settingsReadService.js` | `fetchSettingsDocument()` routed singleton read |
| Controllers | `pageContentController`, `navbarLinkController`, `footerSettingsController`, `bannerController`, `settingsController`, `masterSettingsController`, `storeController` — **read endpoints only** |
| Services | `deliveryChargeService`, `flashSaleService`, `rewardSettings`, `rateLimiter` — read paths use `fetchSettingsDocument()` when flag ON |

### Shape-parity design notes (proactive, from Step 1 lessons)

- **PageContent:** Public/admin reads return Postgres `bodyHtml` as stored at write time — no markdown re-render on read.
- **FooterSettings `paymentBadges`:** Zero `FooterPaymentBadge` child rows → `[]` on read (tri-state distinction is write-time only; matches consuming code).
- **Banner `overlayOpacity`:** Explicit `Number()` conversion in `bannerToMongoShape` (Prisma Decimal → JS number).
- **Settings:** Postgres scalars + `SettingsPaymentGateway` child rows reassembled into `activePaymentGateways` booleans + `paymentGateways` map (mirrors `settingsRepository.mapScalars` / `upsertFromMongo`).

### Verification (flags in process env only — 2026-09-15)

Script: `scripts/verify-read-cutover-group2.local.js` (local, not committed). Zero `[READ-CUTOVER-FALLBACK]` entries.

| Model | Verdict | Notes |
|---|---|---|
| **NavbarLink** | **PASS** | Public + admin — exact match (2/2 endpoints) |
| **Banner** | **PASS** | Public active banners + admin list + BannerSettings — exact match (2/2 endpoints) |
| **PageContent** | **DATA PARITY FAIL** | Shape logic correct; **`updatedAt` timestamps differ** on all pages (Postgres values reflect Stage 2 dual-write/backfill times vs original Mongo timestamps). Requires one-time Postgres timestamp sync from Mongo before enable — same class of issue as Step 1 Category timestamps. Admin list, slug detail, and `/api/store/pages/:slug` affected. |
| **FooterSettings** | **DATA PARITY FAIL** | Shape/reassembly logic verified in unit tests; **Postgres `global` row out of sync with Mongo** — PG has empty `columns`/`paymentBadges` and test copyright string (`Updated copyright for tri-state skip test`) while Mongo has live footer data. Likely repository-test residue + incomplete backfill sync. Payment-badges endpoint PASS only because both sides return `[]` when PG row is empty. **Requires one-time Postgres resync from Mongo `FooterSettings.getOrCreate()` before enable.** |
| **Settings** | **DATA PARITY FAIL** | Shape logic correct; **`freeShippingMinAmount` / `freeShippingThreshold`** Mongo `1000` vs Postgres `0` (derived announcement text differs accordingly). **`vipMinTotalSpent`** type mismatch on master-settings unified payload (Mongo number vs PG path string on one field — investigate during data sync). Cache-settings endpoint PASS. **Requires one-time Postgres scalar sync from Mongo Settings singleton before enable.** |

### Regression checks

| Suite | Result |
|---|---|
| `npm test` (Jest) | **194/194** pass (+11 new Step 2 tests) |
| `npm run test:repositories` | **157/157** pass |

### Step 2 status

**Framework COMPLETE; flags OFF.** NavbarLink and Banner are safe to enable once reviewed. PageContent,
FooterSettings, and Settings require **Postgres data parity sync** (same playbook as Step 1 cleanup)
before production enable — remaining diffs are **data drift**, not unexplained transform bugs.

**Do not enable flags in `.env` or production until data sync is done for the failing models.**

---

## STAGE 4, STEP 2 CLEANUP — Data Sync + Live Bug Fix — 2026-09-15

Post-verification cleanup (Postgres writes only; **no MongoDB writes**; read-cutover flags
remain OFF). Corrects data drift identified in Step 2 investigation plus a **live production
bug** in `resolveFreeShippingThreshold()` (read-only logic — no Mongo writes).

### Postgres data changes executed

| Step | Action | Count / detail |
|---|---|---|
| **A — PageContent timestamps** | `createdAt` / `updatedAt` copied from Mongo by `legacyId` | **7/7 rows** synced (about, contact, privacy-policy, terms, careers, return-policy, islam) |
| **B — FooterSettings full resync** | `upsertFromMongo()` from Mongo `FooterSettings.getOrCreate()` with `replaceColumns`, `replaceSocialLinks`, `replacePaymentGateways`, `paymentBadgesMode: 'replace'`; root timestamps synced | **1** singleton: copyright restored; **2** columns, **9** links, **4** social, **5** gateways, **5** badges |
| **C1–C2 — Settings timestamps** | `createdAt` / `updatedAt` copied from Mongo | **1** singleton row |
| **C3 — freeShippingThreshold** | **No change** — Postgres kept at **1000** (correct business value; Mongo stores `null`) | Confirmed before/after: 1000 → 1000 |

### Live bug fix — `resolveFreeShippingThreshold()` (MongoDB-only app path)

| Item | Detail |
|---|---|
| **Bug** | `Number(null) → 0` was treated as a valid configured threshold, so stores with `freeShippingThreshold: null` and `freeShippingMinAmount: 1000` showed **free shipping on every order** (threshold 0) instead of ৳1,000 minimum |
| **Affected file** | `backend/src/utils/announcementSettings.js` — `resolveFreeShippingThreshold()` (read-only; used by `deliveryChargeService.toPublicSettings`, announcement payloads, checkout/shipping UI) |
| **Fix** | Only use `freeShippingThreshold` when it is explicitly set (not `null`/`undefined`/`''`); otherwise fall through to `freeShippingMinAmount` |
| **Confirmation** | With flags OFF: `toPublicSettings(Settings.getOrCreate())` now returns `freeShippingThreshold: 1000`. With flags ON: Postgres read path also returns **1000**. Both paths agree. |
| **Tests** | `tests/utils/announcementSettings.test.js` — 4 cases (null→min amount, explicit 0, explicit configured value) |

### Read-shape fix (Settings integers)

`settingsToMongoShape()` — applied `Number()` to tier thresholds, `vipMinTotalSpent`, etc.; `freeShippingThreshold` falls back to `freeShippingMinAmount` when PG column null.

### Process fix — FooterSettings test pollution guard

`tests/repositories/footerSettings.repository.test.js` — `beforeAll` snapshots Mongo `copyrightText`; `afterAll` restores Postgres copyright via `upsertFromMongo(..., { paymentBadgesMode: 'skip' })` (same pattern as warehouse `isDefault` restoration).

### Re-verification (flags in process env only — 2026-09-15)

Script: `scripts/verify-read-cutover-group2.local.js`. Zero `[READ-CUTOVER-FALLBACK]` entries.

| Model | Verdict | Notes |
|---|---|---|
| **PageContent** | **PASS** | 4/4 endpoints (admin list, slug detail, store + pages public) |
| **NavbarLink** | **PASS** | 2/2 (untouched) |
| **FooterSettings** | **PASS** | 3/3 |
| **Banner** | **PASS** | 2/2 (untouched) |
| **Settings** | **ACCEPTED** | 4/5 endpoints exact match; **`GET /api/admin/master-settings`** differs only on volatile `serverNow` timestamp between sequential flag-OFF/ON requests (not data parity) |

### Regression checks

| Suite | Result |
|---|---|
| `npm test` (Jest) | **198/198** pass (+4 announcementSettings tests) |
| `npm run test:repositories` | **157/157** pass |

### Step 2 cleanup — CLOSED (2026-09-15)

All three previously failing CMS/Settings models are **data-sync complete**. NavbarLink and Banner
were already PASS. Settings delivery/announcement parity confirmed after live bug fix. Flags remain
**OFF** until deliberate per-environment enable.

---

## STAGE 4, STEP 3 — Read Cutover: Security/Audit Group — 2026-09-15

Stage 4 Step 3 extends read-cutover to the Security/Audit dual-write group from Stage 2 Step 3
Part 4: **SecurityLog**, **LoginAttempt**, **BlacklistedIP**, **StockAlert**. All new flags default
**OFF**. Writes unchanged (dual-write). Postgres read failure falls back to Mongo via `routedRead()`.

### New feature flags (all default OFF)

| Env var | Group key | Wired read surfaces |
|---|---|---|
| `READ_PG_SECURITYLOG` | `securitylog` | Admin security logs (`GET /api/admin/logs`); activity feed; staff audit list + detail; enterprise summary security count; emergency recent logs |
| `READ_PG_LOGINATTEMPT` | `loginattempt` | Login history; rate-limit stats top offenders; intrusion-detection failure counter (hot path); emergency status counts |
| `READ_PG_BLACKLISTEDIP` | `blacklistedip` | **Hot path:** `checkBlacklist` middleware (`findActiveBanByIp`); admin blacklist list; rate-limit stats active bans; emergency blocked-IP reads |
| `READ_PG_STOCKALERT` | `stockalert` | Repository read path only — **no HTTP list endpoint exists today** (write-only via `stockAlertService.checkAndAlertLowStock()`); `findPaginated` + kind reassembly wired for future dashboard |

Documented in `.env.example` (commented).

### Implementation summary

| File | Change |
|---|---|
| `readCutoverFlags.js` | Four new group keys |
| `readShapeHelpers.js` | `securityLogToMongoShape`, `loginAttemptToMongoShape`, `blacklistedIpToMongoShape`, `stockAlertToMongoShape` (LOW_STOCK / OUT_OF_STOCK child reassembly; `expiresAt: null` preserved) |
| `securityAuditReadService.js` | **NEW** — centralized routed reads for all four models |
| Repositories | Extended read helpers: pagination/count/aggregate (`securityLogRepository`, `loginAttemptRepository`, `blacklistedIpRepository.findActiveByIp`, `stockAlertRepository.findPaginated`) |
| Controllers / middleware | `adminSecurity.js` (hot-path ban + intrusion count), `blacklistController`, `loginHistoryController`, `securityMonitorController`, `activityFeedController`, `staffAuditController`, `adminProfileController`, `enterpriseSummaryController`, `emergencyService` — **reads only** |

### BlacklistedIP hot-path performance

`findActiveByIp()` → `prisma.blacklistedIp.findUnique({ where: { ip } })`. Schema declares **`ip String @unique`** plus `@@index([expiresAt])`. Single indexed lookup — no full-table scan. Expiry filter applied in application code after fetch (same semantics as Mongo `$or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]`).

### SecurityLog pagination

Postgres path uses `securityLogRepository.findAll({ limit, offset, …filters })` with `orderBy: { createdAt: 'desc' }`, `take`, `skip` — mirrors Mongoose `.sort({ createdAt: -1 }).skip().limit()`. Staff audit uses `groupBy` + per-actor resource breakdown (not full-table load). Activity feed / admin logs paginate identically to Mongo.

### StockAlert kind reassembly

`stockAlertToMongoShape()` splits `stock_alert_items` by `kind`: `LOW_STOCK` → `lowStockProducts[]` (stock/threshold populated); `OUT_OF_STOCK` → `outOfStockProducts[]` (no stock/threshold keys). `alertsSent{}` rebuilt from three parent booleans. Verified in `tests/services/readCutoverGroup3.test.js` + existing `stockAlert.repository.test.js`.

### Bug fixed during Step 3

`securityLogRepository.distinctActors()` — invalid Prisma `actor: { not: null }` combined with `notIn` caused Postgres throws on activity-feed reads; fixed to `notIn` only (zero fallbacks after fix).

### Verification (flags in process env only — 2026-09-15)

Script: `scripts/verify-read-cutover-group3.local.js` (local, not committed).

| Model | HTTP verdict | Notes |
|---|---|---|
| **LoginAttempt** | **PASS** | 2/2 — login history + rate-limit stats exact match |
| **BlacklistedIP** | **PASS** | 1/1 — admin blacklist list exact match |
| **SecurityLog** | **DATA PARITY FAIL** | 2/4 HTTP endpoints exact (**staff-audit** list + detail **PASS**); **`GET /api/admin/logs`** and **`GET /api/admin/activity-feed`** differ on first-page rows — recent Mongo SecurityLog rows (e.g. courier auto-sync, login events from 2026-09-15) **missing in Postgres** because dual-write side-writes failed (`Cannot use import statement outside a module` on Prisma client load during write path). Backfilled historical rows present; pagination logic matches. **Requires data sync investigation** (same playbook as Steps 1–2) before enable — not a read-shape bug. |
| **StockAlert** | **DATA PARITY FAIL (repo-level)** | No HTTP read surface. Sample of 5 most recent Mongo alert runs **not found in Postgres** by `legacyId` — same dual-write failure class as SecurityLog for cron-created rows. Kind reassembly logic **PASS** in unit/repository tests. |

**Zero `[READ-CUTOVER-FALLBACK]` entries** after `distinctActors` fix.

### Step 5 — data drift (investigation only; cleanup NOT executed)

Per Steps 1–2 playbook: Postgres-only sync/backfill of missing SecurityLog + StockAlert rows from Mongo (post-backfill dual-write gaps) should be investigated and confirmed before flag enable. LoginAttempt and BlacklistedIP are **ready for review** at HTTP level today.

### Regression checks

| Suite | Result |
|---|---|
| `npm test` (Jest) | **204/204** pass (+6 Step 3 tests) |
| `npm run test:repositories` | **157/157** pass |

**All `READ_PG_*` flags remain OFF until deliberate per-environment enable.**

---

## STAGE 4, STEP 3 — Root Cause Fixed + Data Sync Complete — 2026-09-16

### Root cause (confirmed on production PM2 host)

Post-backfill dual-write gaps for **SecurityLog** and **StockAlert** were **not** caused by incorrect dual-write wiring in application code. Live server logs on the production PM2 host (`eonlinebazar-store`) showed Postgres mirror failures because **`@prisma/adapter-neon` was missing** from the deployed environment's `node_modules` (and related Neon driver setup was incomplete). Manual `npm install` of the adapter packages, **Node 22 upgrade**, and **`npx prisma generate`** on the server restored dual-write.

Secondary local-dev issue: **StockAlert** persisted its audit log **after** email/SMS/WhatsApp notifications; UltraMsg WhatsApp failures/slow I/O could delay or block reaching the dual-write step. Fixed in code by persisting Mongo+Postgres **before** third-party notifications (each channel isolated in `try/catch`).

Cron-host dual-write **confirmed working** after server fix (2026-09-16T03:00 UTC tick): StockAlert `6aaa06413d60c6474a38b51c` and SecurityLog courier sync `6aaa06333d60c6474a38b51b` both have matching Postgres `legacyId` rows.

### Phase B — Postgres-only data sync (2026-09-16)

Re-scanned post-cutoff rows (`createdAt > 2026-09-14T22:21:47.000Z`) before sync — gap had grown while Phase A was in progress:

| Model | Missing rows synced |
|---|---:|
| **SecurityLog** | **16** |
| **StockAlert** | **48** (includes child `stock_alert_items` via `stockAlertRepository.create()`) |
| **Total** | **64** |

Script: `scripts/stage4-step3-sync-missing-security-audit.local.js` (local, not committed). Idempotent via `legacyId` skip-if-present.

**Post-sync verification:** post-cutoff gap **0/0**; overall collection parity **SecurityLog 931/931**, **StockAlert 1271/1271**.

### Phase C — backupController.js SecurityLog bugs fixed

| Bug | Fix |
|---|---|
| Invalid `resourceType: 'system'` (not in Mongo enum or Postgres `SecurityResourceType`) | Changed to **`setting`** (backup is a system-settings operation; `resourceId: 'backup'`) |
| Wrong params `adminId`, `adminUsername`, `ip` | **`actor`**, **`actorType: 'admin'`**, **`ipAddress`** per `logSecurityEvent()` |

### Final verification (flags OFF — 2026-09-16)

| Model | Verdict |
|---|---|
| **LoginAttempt** | **PASS** |
| **BlacklistedIP** | **PASS** |
| **SecurityLog** | **PASS** (4/4 HTTP endpoints); repo script shows `updatedAt` micro-drift + `_id` buffer shape only |
| **StockAlert** | **PASS** (HTTP N/A); repo script shows `_id` buffer shape only — rows present |

| Suite | Result |
|---|---|
| `npm test` | **204/204** |
| `npm run test:repositories` | **157/157** |

**All `READ_PG_*` flags remain OFF** until deliberate per-environment enable.

### IMPORTANT DEPLOYMENT NOTE

`generated/prisma/` is **gitignored** and must be regenerated via **`npx prisma generate`** on **every** environment after `npm install`, including production. Without it, dual-write Postgres paths fail at runtime.

Additionally, **`@prisma/adapter-neon`** and **`@neondatabase/serverless`** must be present in root **`package.json` `dependencies`** (not ad-hoc server installs) so future deploys include them automatically.

**Git-tracked status (2026-09-16):** both packages are listed in root `package.json` dependencies (`@neondatabase/serverless` ^1.1.0, `@prisma/adapter-neon` ^7.10.0). Ensure production deploy runs `npm ci` from this committed `package.json` + lockfile — do not rely on manual server-only installs.

---

## STAGE 4, STEP 4 — Read Cutover: HRM Group — 2026-09-16

Stage 4 Step 4 extends read-cutover to the HRM dual-write group from Stage 2 Step 3 Part 5:
**Employee**, **Attendance**, **Payroll**, **Leave**. This is the **first read-cutover group with polymorphic
staff** (`staffType` + `staffId` + `adminId`/`employeeId` FK). All new flags default **OFF**. Postgres read
failure falls back to Mongo via `routedRead()`.

### New feature flags (all default OFF)

| Env var | Group key | Wired read surfaces |
|---|---|---|
| `READ_PG_EMPLOYEE` | `employee` | Employee list/stats/detail/profile composite |
| `READ_PG_ATTENDANCE` | `attendance` | Attendance list (+ optional todayStats), monthly summary |
| `READ_PG_PAYROLL` | `payroll` | Payroll list (+ designation decoration for employee rows) |
| `READ_PG_LEAVE` | `leave` | Leave list, balance aggregate, calendar feed |

Documented in `.env.example` (commented).

### Implementation summary

| File | Change |
|---|---|
| `readCutoverFlags.js` | Four new group keys |
| `readShapeHelpers.js` | `employeeToMongoShape`, `attendanceToMongoShape`, `payrollToMongoShape`, `leaveToMongoShape`; `buildHrmStaffLegacyMaps` / `legacyStaffIdFromRow` for polymorphic `staffId` → Mongo ObjectId |
| `hrmReadService.js` | **NEW** — centralized routed reads; PG staff resolution lazy-loaded (no Prisma import on Mongo-default path) |
| `employeeRepository.js` | `count`, `aggregateStats`, `findDetailed` (documents + references + linkedAdmin legacy) |
| `attendanceRepository.js` | `count`, `countTodayStats`, `aggregateMonthlySummary` |
| `payrollRepository.js` | `count`, `aggregateRollup`; `staffOr` filter support |
| `leaveRepository.js` | `count`, `countPending`, `aggregateBalanceByStaff`, `findCalendarLeaves` |
| Controllers (reads only) | `employeeController`, `attendanceController`, `payrollController`, `leaveController` |

### Polymorphic staff resolution (reads)

Postgres rows may store `staffId` as either Mongo legacy ObjectId (backfill) or PG UUID (dual-write via
`staffFields`). Read transforms resolve the API-facing `staffId` from `adminId`/`employeeId` FK →
`legacyId` batch lookup (`loadStaffLegacyMaps`), matching Mongo's string ObjectId shape.

**Mongo parity preserved for known controller quirks:**

- **Attendance list + Payroll list:** `resolveHrmSubject` / `employee:…` selector — both staff types.
- **Attendance summary + Leave list/balance:** `findStaff` (admin-only filter) — replicated exactly on Mongo path; PG path uses admin FK lookup only (same as live Mongo behaviour).

### Employee profile composite read

`GET …/employees/:id/profile` reassembles via `fetchEmployeeProfileBundle()`:

- Employee row (with documents/references + `linkedAdminId` legacy)
- Month attendance summary counts
- Last 6 payroll runs
- Year leave balance + recent leaves

Each sub-query respects its own group flag (`attendance`, `payroll`, `leave`) inside the bundle.

### Proactive shape parity (pre-verification)

| Check | Result |
|---|---|
| `__v: 0` on all HRM transforms | ✅ |
| `linkedAdminId` → Mongo admin legacy id (not PG UUID) | ✅ |
| Employee documents `_id` ← `legacyId` | ✅ |
| References omit subdoc `_id` (matches Mongoose schema) | ✅ |
| Polymorphic `staffId` via FK legacy maps | ✅ unit-tested |
| Employee full `.lean()` / `.toObject()` field parity (enums, nested docs) | ✅ |
| `mongoVersion` column mirrors Mongoose `__v` | ✅ |

### Step 4 parity fixes + live HTTP verification — 2026-09-16

**Phase 1 — code fixes**

| Fix | File |
|---|---|
| `aggregateStats()` designation sort via post-`groupBy` JS (invalid Prisma `_count._all` orderBy removed) | `employeeRepository.js` |
| `employeeToMongoShape()` full Mongo lean/toObject parity; PG enum → Mongo string maps (`gender`, `bloodGroup`, `maritalStatus`); nested `documents`/`references` on list via `includeNested` | `readShapeHelpers.js`, `hrmReadService.js`, `employeeRepository.js` |
| `Employee.mongoVersion` column for `__v` parity | `prisma/schema.prisma` |

**Phase 2 — Postgres-only data sync**

Script: `scripts/stage4-step4-hrm-data-sync.local.js` (local, not committed). Mongo read-only.

| Sync target | Action |
|---|---|
| Employee `createdAt` / `updatedAt` | Copied from Mongo (3 rows) |
| Employee `linkedAdminId` | Resolved Mongo admin legacy → PG admin UUID (3 rows) |
| Employee `mongoVersion` | Copied from Mongo `__v` |
| Employee enum fields | `gender`, `bloodGroup`, `maritalStatus`, `shift` from Mongo |
| EmployeeDocument `uploadedAt` | Copied from Mongo (1 doc) |
| Attendance gaps | 1 orphan admin row (`nurjahan`, legacy staffId only — admin deleted in Mongo) inserted with legacy `staffId` preserved |

**Phase 3 — live HTTP verification**

Script: `scripts/verify-read-cutover-group4.local.js` (local, not committed). Flags set in **process env only** during PG half of each compare (`.env` unchanged).

| Model | Verdict | Endpoints |
|---|---|---|
| **Employee** | **PASS** | list, stats, detail, profile composite (4/4) |
| **Attendance** | **PASS** | list, summary, admin staff filter, employee staff filter (4/4) |
| **Payroll** | **PASS** | list (1/1; admin/employee filter tests **SKIP** — no polymorphic rows in DB) |
| **Leave** | **PASS** | list, balance, calendar (3/3; admin/employee filter tests **SKIP** — no polymorphic rows in DB) |

**`[READ-CUTOVER-FALLBACK]` entries: 0** — **Overall: PASS**

Polymorphic samples present: admin + employee **Attendance** rows. Payroll/Leave polymorphic filter endpoints remain untested until production data exists.

### Regression checks

| Suite | Result |
|---|---|
| `npm test` (Jest) | **212/212** pass (+8 Step 4 tests in `readCutoverGroup4.test.js`) |
| `npm run test:repositories` | **157/157** pass |

**All `READ_PG_*` flags remain OFF** until deliberate per-environment enable.

---

## STAGE 4, STEP 5 — Read Cutover: Marketing/Support Group — 2026-09-16

Stage 4 Step 5 extends read-cutover to the Marketing/Support dual-write group from Stage 2 Step 3 Part 6:
**Newsletter**, **EmailCampaign**, **ContactMessage**, **Review**. All new flags default **OFF**. Postgres read
failure falls back to Mongo via `routedRead()`.

### New feature flags (all default OFF)

| Env var | Group key | Wired read surfaces |
|---|---|---|
| `READ_PG_NEWSLETTER` | `newsletter` | Admin subscriber list + stats/pagination |
| `READ_PG_EMAILCAMPAIGN` | `emailcampaign` | Admin campaign list (includes flattened `stats{}` + populated `createdBy`) |
| `READ_PG_CONTACTMESSAGE` | `contactmessage` | Admin inbox list + ticket stats aggregates |
| `READ_PG_REVIEW` | `review` | Public `GET /api/reviews/:productId` (populated author); admin moderation list |

Documented in `.env.example` (commented). **No separate EmailCampaign detail GET exists** — list only.

### Implementation summary

| File | Change |
|---|---|
| `readCutoverFlags.js` | Four new group keys |
| `readShapeHelpers.js` | `newsletterToMongoShape`, `emailCampaignToMongoShape`, `contactMessageToAdminShape`, `reviewToMongoShape` (+ populate/`id` virtual parity) |
| `marketingSupportReadService.js` | **NEW** — centralized routed reads |
| `newsletterRepository.js` | `count`, `countByIsActive`, `findPaginated`, `buildNewsletterWhere` |
| `emailCampaignRepository.js` | `findAll` includes `createdBy` legacy admin |
| `contactMessageRepository.js` | `count`, `countUnreadInbox` (list badge semantics), `aggregateTicketStats` |
| `reviewRepository.js` | `count`, `findPaginated`, `buildReviewWhere` |
| Controllers (reads only) | `newsletterAdminController`, `contactController`, `reviewController`, `reviewAdminController` |

### Proactive shape parity (pre-verification)

| Check | Result |
|---|---|
| Newsletter lowercase `source` enum | ✅ |
| EmailCampaign nested `stats{}` + lowercase status/segment/channel | ✅ |
| ContactMessage admin shape uses `id` (not `_id`) like `toAdminObject()` | ✅ |
| Review public populate: `userId._id`, `userId.id`, `userId.name` (mongoose JSON parity) | ✅ |
| Review admin lean: omit unset `photo`/`isSandbox`/`isHidden`/`adminNote`/`moderatedAt` | ✅ |
| Review `userId` FK null → populated `userId: null` (graceful, no crash) | ✅ unit-tested |
| List inbox `unreadCount` uses badge OR semantics (distinct from ticket-stats `isRead:false`) | ✅ |

### Review null-userId handling — real Postgres evidence (2026-09-16)

Live query during HTTP verification (`scripts/verify-read-cutover-group5.local.js`):

| Metric | Count |
|---|---:|
| Total Review rows in Postgres | **2** |
| Reviews with non-null `userId` FK | **2** |
| Reviews with null `userId` FK | **0** |

Sample row: legacyId `6a9dc0eb68b35e6b83b62d53` → PG `userId` FK resolved; Mongo loose ref
`6a8b5b609d67181414c2066e` → PG User `firstName`/`lastName` populate to author name on public reads.
**No null-userId display bug observed** — Stage 3 backfill health check remains true.

### Live HTTP verification

Script: `scripts/verify-read-cutover-group5.local.js` (local, not committed). Flags set in **process env only**.

| Model | Verdict | Endpoints |
|---|---|---|
| **Newsletter** | **SKIP** | subscriber list — 0 rows in Mongo |
| **EmailCampaign** | **SKIP** | campaign list — 0 rows in Mongo |
| **ContactMessage** | **PASS** | inbox list + ticket stats (4/4 exercised endpoints) |
| **Review** | **PASS** | public by-product + admin list (2/2) |

**`[READ-CUTOVER-FALLBACK]` entries: 0**.

### Phase 2 data sync — COMPLETE (2026-09-16)

Script: `scripts/stage4-step5-marketing-data-sync.local.js` (local, not committed). Mongo read-only; Postgres update-only.

| Sync target | Result |
|---|---|
| ContactMessage (6 rows) | **6/6** `createdAt`/`updatedAt` copied from Mongo |
| Review (2 rows) | **2/2** `createdAt`/`updatedAt` copied from Mongo |

### Phase 3 re-verification — PASS (2026-09-16)

Re-ran `scripts/verify-read-cutover-group5.local.js` after timestamp sync + canonical review shape normalizers
(`shapePublicReviewDoc` / `shapeAdminReviewDoc` — fixes Mongo virtual `name` populate gap on public reads).

| Model | Verdict |
|---|---|
| Newsletter | SKIP (0 rows) |
| EmailCampaign | SKIP (0 rows) |
| ContactMessage | **PASS** |
| Review | **PASS** |

**Overall: PASS** — 0 fallbacks.

### Regression checks

| Suite | Result |
|---|---|
| `npm test` (Jest) | **220/220** pass (+8 Step 5 tests in `readCutoverGroup5.test.js`) |
| `npm run test:repositories` | **157/157** pass (unchanged) |

**All `READ_PG_*` flags remain OFF** until deliberate per-environment enable.

## STAGE 4, STEP 6 — Read Cutover: User + Owned Tables — 2026-09-16

Stage 4 Step 6 extends read-cutover to the User dual-write group from Stage 2 Step 3 Part 7:
**User**, **Address**, **WishlistItem**, **WalletTransaction**, **Cart/CartItem**. All new flags default **OFF**.
Postgres read failure falls back to Mongo via `routedRead()`. **No write endpoints were changed.**

### New feature flags (all default OFF)

| Env var | Group key | Wired read surfaces |
|---|---|---|
| `READ_PG_USER` | `user` | Customer profile scalars; admin customer list/detail; referral code + referral count; loyalty points |
| `READ_PG_ADDRESS` | `address` | Customer profile embedded addresses; `GET /api/customer/addresses` |
| `READ_PG_WISHLIST` | `wishlist` | Customer profile embedded wishlist; enriched `GET /api/customer/wishlist` |
| `READ_PG_WALLET` | `wallet` | Customer profile `walletHistory[]`; dashboard `balance`; wallet balance field |
| `READ_PG_CART` | `cart` | `GET /api/cart/` (formatted line items) |

Documented in `.env.example` (commented).

### Implementation summary

| File | Change |
|---|---|
| `readCutoverFlags.js` | Five new group keys (`user`, `address`, `wishlist`, `wallet`, `cart`) |
| `readShapeHelpers.js` | `userToMongoShape`, address/wishlist/wallet/cart embedded shapes |
| `userReadService.js` | **NEW** — composite profile bundle + per-group routed reads |
| `userRepository.js` | `listWalletTransactions`, `countReferralsByReferredByLegacyId`, mongo-OID cursor, `listAddresses({ sort: 'mongoEmbedded' })`, `findAll({ take })` |
| `cartRepository.js` | `findCartWithItemsByUserLegacyId` |
| Controllers (reads only) | `userProfileController`, `userWishlistController`, `cartController`, `orderCustomerController`, `customerAdminController`, `referralController` |
| `tests/services/readCutoverGroup6.test.js` | **NEW** — 8 mocked shape/routing tests |

### Proactive shape parity

| Check | Result |
|---|---|
| `_id` = Mongo `legacyId` on User/Address/WishlistItem/WalletTransaction | ✅ |
| `referralCode` read pass-through (never regenerated on PG read path) | ✅ code path |
| Wishlist null/missing Product FK → `legacyProductId` preserved; enrichment matches Mongo (snapshot + catalog fallback) | ✅ PASS live |
| Wallet balance on dashboard matches PG `User.walletBalance` when flag on | ✅ PASS live |
| Address list order matches Mongo embedded array (`createdAt asc`, not default-first) | ✅ code path |
| CartItem line `_id` | ⚠️ CartItem has **no `legacyId` in Postgres** — PG read omits line `_id` (Mongo subdoc `_id` is cosmetic; item content/count matches) |
| Admin list/detail includes embedded `addresses`/`wishlist`/`walletHistory` like Mongo `.select('-password')` | ✅ code path |

### CartItem gap quantification (Part 7 required-FK check)

Script: `scripts/check-cartitem-gap.local.js` (local, not committed).

| Metric | Value | Evidence |
|---|---:|---|
| Mongo carts with items | **3** | live query 2026-09-16 |
| Mongo cart line items (total) | **7** | live query |
| Postgres cart line items (total) | **7** | live query |
| Missing Postgres lines vs Mongo | **0** | `totalMissingItems: 0`, `gapUsers: 0` |

Stage 3 backfill gap (7 Mongo lines / 0 PG) is **closed** — Product FK coverage now sufficient for all current cart lines.

### Live HTTP verification

Script: `scripts/verify-read-cutover-group6.local.js` (local, not committed). Flags set in **process env only**.

| Model / endpoint | Verdict | Notes |
|---|---|---|
| **User** — customer profile | **FAIL** | `createdAt` drift (PG dual-write sync time ≠ Mongo); `referralCode` drift on sample user (see below); cosmetic `__v` |
| **Address** — list + profile embed | **FAIL** | Line content/order **matches** after mongo-embedded sort fix; **`createdAt` timestamps drift** (PG re-sync dates) |
| **Wishlist** — enriched list | **PASS** | Including deleted-product snapshot behavior |
| **Wallet** — dashboard balance | **PASS** | Balance matches; history not separately exposed on a dedicated GET |
| **Cart** — `GET /api/cart/` | **ACCEPTED** | Item count/product/qty/price **match**; line `_id` omitted on PG (no legacyId column) |
| **User** — referral info | **FAIL** | **`referralCode` data drift** — Mongo `RKDTRET8` vs Postgres `9NP2ZQZW` on verified sample user (read path is pass-through; PG row stale/wrong) |
| **User** — admin list/detail | **FAIL** | List row-count mismatch during test-window (PG 4 vs Mongo 5); per-row `createdAt`/`referralCode` drift |

**`[READ-CUTOVER-FALLBACK]` entries: 0**.

### referralCode pass-through confirmation

- **Read code:** `userToMongoShape` / `fetchReferralFields` return `pgRow.referralCode` verbatim — **no regeneration** on read (Part 7 contract preserved).
- **Live sample (profile user):** Mongo **`RKDTRET8`** ≠ Postgres **`9NP2ZQZW`** — **data drift**, not read-layer regeneration. Requires Postgres sync from Mongo before enabling `READ_PG_USER` for customer-facing surfaces.

### Data drift — proposed sync plan (await confirmation before execute)

1. **User `referralCode` + `createdAt`** — Postgres-only update from Mongo for all users where `legacyId` matches and values differ (mirror Step 5 timestamp sync pattern).
2. **Address `createdAt`** — Copy Mongo subdoc `createdAt` → Postgres `Address.createdAt` by `legacyId`.
3. **Re-run** `verify-read-cutover-group6.local.js` — target **PASS** on profile, addresses, referral, admin detail.

**Do not enable any Step 6 flags in production until sync completes and re-verification passes.**

### Regression checks

| Suite | Result |
|---|---|
| `npm test` (Jest) | **228/228** pass (+8 Step 6 tests in `readCutoverGroup6.test.js`) |
| `npm run test:repositories` | **157/157** pass (unchanged) |

**All `READ_PG_*` flags remain OFF** until deliberate per-environment enable.

