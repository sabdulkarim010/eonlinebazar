# PAYMENTS & FINANCE AUDIT — EonlineBazar

**Last updated:** 2026-09-27 (Phase 4 finance security + POS/wallet liquidity)  
**Scope:** Payment gateways, reconciliation, wallet, expenses, P&L, finance analytics, accounts summary, VAT  
**Status:** ✅ COMPLETE

---

## File Inventory

| Path | Role |
|------|------|
| `backend/src/routes/paymentRoutes.js` | Gateway init + IPN callbacks |
| `backend/src/routes/financeRoutes.js` | Finance dashboard auth + analytics |
| `backend/src/controllers/paymentIpnController.js` | SSLCommerz, Aamarpay, ShurjoPay IPN |
| `backend/src/controllers/paymentReconciliationController.js` | Manual payment reconciliation |
| `backend/src/controllers/paymentMethodController.js` | Payment method CRUD |
| `backend/src/controllers/financeAnalyticsController.js` | Finance KPI metrics |
| `backend/src/services/exportService.js` | Shared Excel (xlsx) + PDF export helpers |
| `backend/src/controllers/admin/financeExportController.js` | Unified finance export endpoint |
| `backend/src/controllers/financeController.js` | Finance dashboard login |
| `backend/src/controllers/admin/profitLossController.js` | P&L report API |
| `backend/src/controllers/admin/accountsSummaryController.js` | Accounts overview API (delegates to ledger) |
| `backend/src/controllers/admin/chartOfAccountsController.js` | Chart of accounts API |
| `backend/src/services/chartOfAccountsService.js` | Default COA catalog + live balance mapping |
| `backend/src/services/balanceSheetService.js` | Balance sheet assets/liabilities/equity engine |
| `backend/src/services/taxVatService.js` | Order-wise VAT ledger + CSV export |
| `backend/src/controllers/admin/financeReportController.js` | Balance sheet + tax/VAT API |
| `backend/src/controllers/admin/expenseController.js` | Expense ledger CRUD |
| `backend/src/controllers/admin/expenseCategoryController.js` | Expense category catalog |
| `backend/src/controllers/admin/walletAdminController.js` | Admin wallet credit + transaction history |
| `backend/src/controllers/walletCustomerController.js` | Customer wallet balance + transactions |
| `backend/src/models/posShift.js` | POS cash register shift schema |
| `backend/src/services/posShiftService.js` | Shift open/close/reconcile + sale tracking |
| `backend/src/controllers/admin/posShiftController.js` | POS shift admin API |
| `backend/src/services/paymentGatewayService.js` | Gateway adapter orchestration |
| `backend/src/services/walletService.js` | Wallet balance, credit/debit, transaction logs |
| `backend/src/repositories/paymentMethodRepository.js` | PG payment methods |
| `backend/src/repositories/expenseRepository.js` | PG expenses |
| `backend/src/services/accountingLedgerService.js` | Unified revenue/COGS/expense calculations + PG expense read routing |
| `backend/src/repositories/expenseCategoryRepository.js` | PG expense categories |
| `client/payment.html` / `client/js/payment.js` | Customer payment redirect page |
| `client/finance-analytics.html` / `finance-login.html` | Separate finance dashboard apps |
| `client/payment-reconciliation.html` | Reconciliation standalone app |
| `client/js/admin/modules/erp-expenses.js` | Expense ledger UI |
| `client/js/admin/modules/erp-profit-loss.js` | P&L SPA module |
| `client/js/admin/modules/erp-accounts.js` | Accounts overview UI |
| `client/js/admin/modules/erp-chart-of-accounts.js` | Chart of accounts UI |
| `client/admin/partials/view-chart-of-accounts.html` | Chart of accounts view |
| `client/admin/partials/view-tax-vat.html` | Tax & VAT compliance view |
| `client/js/admin/modules/erp-tax-vat.js` | Tax/VAT UI + CSV export |
| `client/js/admin/modules/settings-expense-categories.js` | Expense category manager |
| `client/js/admin/modules/settings-payments.js` | Payment gateway settings |
| `client/admin/partials/view-erp-expenses.html` | Expense view |
| `client/admin/partials/view-finance.html` | P&L embed |
| `client/admin/partials/view-accounts.html` | Accounts overview |
| `client/admin/partials/view-shipping-payments.html` | VAT + shipping settings |

---

## Feature Checklist

- [x] SSLCommerz / Aamarpay / ShurjoPay gateways — `paymentGatewayService.js`
- [x] Manual bKash/Nagad/COD — settings + checkout flow
- [x] Payment IPN handling — `paymentIpnController.js`
- [x] Payment proof upload (manual) — order payment proof flow
- [x] Payment reconciliation app — `payment-reconciliation.html`
- [x] Payment method seed + admin CRUD — `paymentMethodController.js`
- [x] Customer wallet + loyalty points — `walletService.js`
- [x] Wallet admin operations — `walletAdminController.js`
- [x] Expense ledger CRUD — `expenseController.js`
- [x] Dynamic expense categories + "Other" custom — `expenseCategoryController.js`
- [x] Advanced P&L report — `profitLossController.js`, Chart.js charts, PDF/CSV export
- [x] Unified finance export — `GET /api/admin/finance/export?type=excel|pdf&from=&to=` (Revenue/Expenses/Summary sheets)
- [x] Finance analytics dashboard — `financeAnalyticsController.js`
- [x] Accounts overview (cash flow, liquidity) — `accountsSummaryController.js` + `accountingLedgerService.js`
- [x] Chart of accounts (default GL + live balances) — `GET /api/admin/finance/chart-of-accounts`
- [x] Balance sheet report — `GET /api/admin/finance/balance-sheet` (Financial Reports tab)
- [x] Tax/VAT compliance ledger — `GET /api/admin/finance/tax-vat-ledger` + CSV export
- [x] VAT/tax at checkout + invoice snapshot — Settings VAT fields
- [x] PG read cutover for finance aggregates — `READ_PG_FINANCE_ANALYTICS`, `READ_PG_PROFIT_LOSS`, `READ_PG_ACCOUNTS_SUMMARY`
- [x] Expense ledger PG reads (`READ_PG_EXPENSE`) — list/summary/P&L/accounts via `accountingLedgerService.js` with Mongo fallback
- [ ] Finance tools embedded in admin SPA | External HTML apps remain separate

---

## Known Issues / Gaps

| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| Finance analytics external to SPA | Low | Open | `/finance-analytics` separate login app |
| Payment reconciliation external | Low | Open | `/admin/payment-reconciliation` standalone |
| Accounts summary / P&L HTTP 500 on PG timeouts | High | Fixed | PG→Mongo→zero-safe fallbacks; batched PG order scan — 2026-09-27 |

---

## Dependencies & Integrations

- **PG flags:** `READ_PG_PAYMENT_METHOD`, `READ_PG_EXPENSE`, `READ_PG_EXPENSE_CATEGORY`, `READ_PG_WALLET`, finance analytics flags
- **P&L inputs:** Orders (revenue), expenses, courier charges, returns
- **Related audits:** `ORDERS_AUDIT.md`, `ADMIN_PANEL_AUDIT.md`, `HRM_AUDIT.md`

---

## Change Log

### Phase 4 — Payment audit logging, POS/wallet liquidity, RBAC — 2026-09-27

- `logSecurityEvent` on gateway `mark-paid` + payment proof approval (immutable SecurityLog dual-write)
- Accounts summary + balance sheet: `posDrawerCash`, `customerWalletLiability` / `customerStoreCredit`
- Finance/expense routes: granular `view_accounts`, `view_financial_reports`, `manage_expenses`, `manage_orders`
- Tests: `tests/financePhase4.test.js` — Jest **350/350**

### Phase 3 Part 2 — Balance sheet + Tax/VAT ledger — 2026-09-27

- `GET /api/admin/finance/balance-sheet` — cash, bank, AR, inventory, AP, retained earnings; A=L+E check
- `GET /api/admin/finance/tax-vat-ledger` — KPI summary + order ledger; `export=csv`
- Admin: Balance Sheet tab in `view-finance.html`; `view-tax-vat.html` + sidebar entry
- Tests: Jest **346/346**

### Phase 3 Part 1 — Chart of accounts + finance sidebar — 2026-09-27

- `GET /api/admin/finance/chart-of-accounts` — default e-commerce GL (1010–5020) with balances from accounts summary + P&amp;L COGS
- `chartOfAccountsService.js`, `chartOfAccountsController.js`; RBAC `manage_settings` | `view_accounts`
- Admin SPA: `view-chart-of-accounts.html`, `erp-chart-of-accounts.js`; sidebar order (Overview → Reports → COA → Expenses → Reconciliation)
- `accountingLedgerService.js`: shared `loadAccountsSummaryContext` / `buildAccountsSummaryPayload` for COA + accounts API
- Tests: Jest **344/344**

### Phase 2 Part 2 — Accounts overview date-range filtering — 2026-09-27

- `GET /api/admin/accounts-summary?dateFrom=&dateTo=` scopes orders, expenses, and open PO payables
- `accountingLedgerService.js`: `parseAccountsSummaryDateRange`, range-aware `computeAccountsSummaryFromOrders`
- Admin UI: filter bar in `view-accounts.html` + `erp-accounts.js` presets (Today, All Time, This/Last Month, custom)
- Tests: Jest **343/343**

### Phase 2 Part 1 — Unified accounting ledger + expense PG alignment — 2026-09-27

- Added `accountingLedgerService.js` — shared `getOrderTotal`, `resolveOrderRevenue`, `resolveOrderBuyingCost`, `computeAccountsSummaryFromOrders`, expense aggregates
- `expenseController.js` list + summary use ledger service; `READ_PG_EXPENSE` + Mongo fallback
- `profitLossController.js` + `accountsSummaryController.js` delegate to ledger service
- `expenseRepository.js` strict PG read helpers (paginated list, category breakdown, monthly totals)
- Tests: Jest **342/342**

### Finance API resilience — accounts summary + P&L — 2026-09-27

- `accountsSummaryController.js`: batched PG order reads (`legacyId` filter, 250-row pages); PG failure → Mongo → zero-safe payload; outer handler returns HTTP 200 with zero metrics instead of 500
- `profitLossController.js`: defensive order/expense loads (PG→Mongo); `buildEmptyProfitLossReport`; `getProfitLossReport` always HTTP 200 + `{ success: true, data }` on infrastructure errors
- Tests: Jest **342/342** passing

### Phase 3 Part 2 — Wallet API + POS shift register — 2026-09-24

- `walletService.js`: `getWalletBalance`, `getWalletTransactions`, `creditWallet`, `debitWallet` (dual-write to PG wallet transactions)
- Admin routes: `POST /customers/:id/wallet/credit`, `GET /customers/:id/wallet/transactions`
- Customer routes: `GET /api/user/wallet/balance`, `GET /api/user/wallet/transactions`
- POS shift lifecycle: open → track cash/digital sales → close with `cashDiscrepancy`
- Tests: `tests/services/phase3Part2.test.js` — Jest **277/277**

### Group 3 — Unified finance export — 2026-09-20

- `exportService.js` — `exportToExcel()` (3 sheets) + `exportToPDF()`
- `GET /api/admin/finance/export` with date range; finance view **Export Excel** button
- Tests: Jest **228/228** passing

### Audit system initialized — codebase scan — 2026-09-20

- Inventoried payment controllers, finance modules, admin UI, PG repos
- Status: ✅ COMPLETE
