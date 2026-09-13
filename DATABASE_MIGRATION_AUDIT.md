# DATABASE MIGRATION AUDIT — MongoDB → PostgreSQL (Prisma + Neon)

**Created:** 2026-09-13
**Current stage:** 2 of 5 — Step 1 (environment setup + baseline migration) **COMPLETE**
**Artifacts produced:** `prisma/schema.prisma`, `prisma.config.js`,
`prisma/migrations/20260913131445_init_postgres_baseline/`, this file
**Application code changed:** none — no model, controller, route or service touched

> **Stage progress:** Stage 1 (schema design) complete 2026-09-13.
> Stage 2 Step 1 (Prisma connected to Neon, baseline migration applied) complete
> 2026-09-13 — see the dated section at the end of this file. The live database
> is **still MongoDB** and remains authoritative; the Neon database exists but is
> empty and no application code reads from it.

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
mandatory (the client is no longer emitted into `node_modules`):

```prisma
generator client {
  provider     = "prisma-client"
  output       = "../generated/prisma"
  moduleFormat = "cjs"
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
   `output = "../generated/prisma"` and `moduleFormat = "cjs"` (this repo is
   CommonJS).
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
`generated/prisma/enums.ts` carries all 55 enums.

### Test result — MongoDB confirmed untouched

```
Test Suites: 16 passed, 16 total
Tests:       166 passed, 166 total
```

**166/166 passing**, identical to before this task. Nothing in the Postgres setup
touched the Mongoose runtime, which is the isolation this step was meant to prove.

### Open item for the next step (not a defect)

The Prisma 7 `prisma-client` generator emits **TypeScript only** — all 75 files
in `generated/prisma/` are `.ts`, and no `.js` build is produced. This backend is
plain CommonJS JavaScript with no TypeScript toolchain, so the generated client
**cannot be `require()`d as-is**. This does not affect anything today (no
application code may query Postgres yet), but it must be resolved before the
Stage 2 repository layer is written. The three options:

1. **Add a small TypeScript build step** — compile `generated/prisma` to JS with
   `tsc` as part of `prisma generate`. Cleanest long-term; adds a build stage.
2. **Write the repository layer in TypeScript** and compile it. Best type safety;
   the largest change to the repo's conventions.
3. **Fall back to the `prisma-client-js` generator**, which still emits
   CJS + `.d.ts`. Zero friction now, but it is deprecated and slated for removal,
   so it trades a rewrite later for convenience today.

Decide this at the start of the next step; it changes how every repository file
imports the client.




