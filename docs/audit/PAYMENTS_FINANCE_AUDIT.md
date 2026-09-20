# PAYMENTS & FINANCE AUDIT — EonlineBazar

**Last updated:** 2026-09-20  
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
| `backend/src/controllers/financeController.js` | Finance dashboard login |
| `backend/src/controllers/admin/profitLossController.js` | P&L report API |
| `backend/src/controllers/admin/accountsSummaryController.js` | Accounts overview API |
| `backend/src/controllers/admin/expenseController.js` | Expense ledger CRUD |
| `backend/src/controllers/admin/expenseCategoryController.js` | Expense category catalog |
| `backend/src/controllers/admin/walletAdminController.js` | Admin wallet operations |
| `backend/src/services/paymentGatewayService.js` | Gateway adapter orchestration |
| `backend/src/services/walletService.js` | Wallet + loyalty point conversions |
| `backend/src/repositories/paymentMethodRepository.js` | PG payment methods |
| `backend/src/repositories/expenseRepository.js` | PG expenses |
| `backend/src/repositories/expenseCategoryRepository.js` | PG expense categories |
| `client/payment.html` / `client/js/payment.js` | Customer payment redirect page |
| `client/finance-analytics.html` / `finance-login.html` | Separate finance dashboard apps |
| `client/payment-reconciliation.html` | Reconciliation standalone app |
| `client/js/admin/modules/erp-expenses.js` | Expense ledger UI |
| `client/js/admin/modules/erp-profit-loss.js` | P&L SPA module |
| `client/js/admin/modules/erp-accounts.js` | Accounts overview UI |
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
- [x] Finance analytics dashboard — `financeAnalyticsController.js`
- [x] Accounts overview (cash flow, liquidity) — `accountsSummaryController.js`
- [x] VAT/tax at checkout + invoice snapshot — Settings VAT fields
- [x] PG read cutover for finance aggregates — `READ_PG_FINANCE_ANALYTICS`, `READ_PG_PROFIT_LOSS`, `READ_PG_ACCOUNTS_SUMMARY`
- [ ] Finance tools embedded in admin SPA | External HTML apps remain separate

---

## Known Issues / Gaps

| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| Finance analytics external to SPA | Low | Open | `/finance-analytics` separate login app |
| Payment reconciliation external | Low | Open | `/admin/payment-reconciliation` standalone |

---

## Dependencies & Integrations

- **PG flags:** `READ_PG_PAYMENT_METHOD`, `READ_PG_EXPENSE`, `READ_PG_EXPENSE_CATEGORY`, `READ_PG_WALLET`, finance analytics flags
- **P&L inputs:** Orders (revenue), expenses, courier charges, returns
- **Related audits:** `ORDERS_AUDIT.md`, `ADMIN_PANEL_AUDIT.md`, `HRM_AUDIT.md`

---

## Change Log

### Audit system initialized — codebase scan — 2026-09-20

- Inventoried payment controllers, finance modules, admin UI, PG repos
- Status: ✅ COMPLETE
