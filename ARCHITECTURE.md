# EonlineBazar — Architecture Guide

# READ THIS before making changes



## Frontend Structure

client/

├── css/

│   ├── admin.css          ← BARREL — edit files in admin/

│   ├── admin/             ← Admin panel module CSS

│   │   ├── _settings.css  ← BARREL → _settings-*.css

│   │   └── _products.css  ← BARREL → _products-*.css

│   ├── profile.css        ← BARREL — edit files in profile/

│   ├── profile/           ← Profile page module CSS

│   ├── style.css          ← BARREL — edit files in global/

│   └── global/            ← Shared global styles

├── js/

│   ├── admin/

│   │   ├── admin-main.js      ← entry (imports barrels)

│   │   ├── admin-core.js      ← BARREL → modules/core-*.js

│   │   ├── admin-products.js  ← BARREL → products-* + catalog-* + erp-*

│   │   ├── admin-orders.js    ← BARREL → modules/orders-*.js

│   │   ├── admin-customers.js ← BARREL → customers-* + messages-inbox.js

│   │   ├── admin-settings.js  ← BARREL → modules/settings-*.js

│   │   ├── admin-dashboard.js ← analytics widgets

│   │   └── modules/           ← Actual logic files

│   ├── profile.js         ← BARREL → js/profile/*.js

│   ├── profile/           ← Profile page modules (tabs, orders, wallet, notes, …)

│   ├── product-details.js ← BARREL → js/pdp/*.js

│   ├── pdp/               ← Product detail page modules

│   ├── checkout.js        ← BARREL → js/checkout/*.js

│   └── checkout/          ← Checkout modules

├── admin/

│   └── partials/          ← Admin HTML sections + modal groups

├── profile/

│   └── partials/          ← Profile HTML sections

└── partials/              ← Shared storefront header/footer/WhatsApp



## Backend Structure

backend/src/

├── controllers/

│   ├── admin/             ← Admin-specific controllers (ERP, CRM, HRM)

│   ├── auth/              ← Auth-specific controllers

│   ├── adminController.js           ← BARREL

│   ├── adminSecurityController.js   ← BARREL

│   └── authController.js            ← BARREL

├── routes/                ← NEVER split routes — keep as barrel files

├── data/demoProducts.js   ← DEMO-* catalog for seed:products / POST /api/products/seed-demo

└── utils/

    ├── adminPageBuilder.js    ← assembles admin/partials (including modals-*)

    ├── profilePageBuilder.js  ← assembles profile.html shell + profile/partials

    └── injectSharedPartials.js



## Admin Navigation (Phase 4)

The admin sidebar is grouped into **Dashboard**, **ERP**, **CRM**, **HRM**, and **Settings** accordion sections (`client/admin/partials/sidebar.html`). Breadcrumbs are rendered by `client/js/admin/modules/core-breadcrumb.js`.



| Group | Key sections |

|-------|----------------|

| ERP | Inventory, Orders, Purchase Orders, Suppliers, Warehouses, Finance |

| CRM | Customers, Newsletter, Abandoned Carts, Tickets, Live Chat, Reviews, Loyalty |

| HRM | Staff, Staff Audit, Attendance & Shifts, Payroll & Salary, Leave Management, Security Logs, Sessions |

| Settings | Branding, Catalog, Coupons, Banners, Shipping, 2FA, System Tools |



## Enterprise Models (Phase 2+)

| Model | File | Purpose |

|-------|------|---------|

| Supplier | `backend/src/models/supplier.js` | Vendor directory |

| PurchaseOrder | `backend/src/models/purchaseOrder.js` | PO receiving workflow |

| Warehouse | `backend/src/models/warehouse.js` | Multi-location inventory |

| Employee | `backend/src/models/employee.js` | Non-login operational staff — full profile, documents, references |
| Designation | `backend/src/models/designation.js` | Job title catalog (Manager, Delivery Man, …) seeded on bootstrap |
| Attendance | `backend/src/models/attendance.js` | One row per staff per day (clock in/out, late, shift) |

| Shift | `backend/src/models/shift.js` | Named working windows + late grace period |

| Payroll | `backend/src/models/payroll.js` | Monthly salary run, draft → approved → paid |

| Leave | `backend/src/models/leave.js` | Leave applications, approvals, balances |



## HRM Module (Phase 5)

`/api/admin/hrm/*` — all routes require `verifyAdmin` + `checkPermission('manage_staff')`.



| Area | Endpoints | Notes |

|------|-----------|-------|

| Attendance | `GET /attendance`, `POST /attendance/mark`, `POST /attendance/clock-in`, `POST /attendance/clock-out`, `GET /attendance/summary`, `GET /attendance/late-report` | `date` is normalized to local midnight, so one staff member has at most one row per day |

| Shifts | `GET /shifts`, `POST /shifts`, `PATCH /shifts/:id`, `DELETE /shifts/:id` | Exactly one `isDefault` shift; it cannot be deleted |

| Payroll | `GET /payroll`, `POST /payroll/generate`, `PATCH /payroll/:id/approve`, `PATCH /payroll/:id/paid`, `GET /payroll/:id/payslip`, `POST /payroll/salary-config` | Generation reads attendance; only drafts can be regenerated |

| Leave | `GET /leaves`, `POST /leaves/apply`, `PATCH /leaves/:id/approve`, `PATCH /leaves/:id/reject`, `GET /leaves/balance`, `GET /leaves/calendar` | Approving a leave writes `holiday` attendance rows across the span |

| Staff roster | `GET /hrm/staff` | Dropdown roster; includes the employment record for `manage_staff` holders |
| Designations | `GET/POST/PATCH/DELETE /hrm/designations` | Job title catalog; delete blocked while employees use the name |
| Employees | `GET/POST/PATCH/DELETE /hrm/employees` | Non-login operational staff CRUD; auto `EMP-001` ids |
| Employee profile | `GET /hrm/employees/:id/profile` | Full record + attendance summary + payroll history + leave balance |
| Employee media | `POST /hrm/employees/:id/photo`, `POST/DELETE …/documents/:docId` | Cloudinary photo + document attachments |



**Payroll formula:** `baseSalary × min(presentDays / workingDays, 1) + (overtime × overtimeRate) + bonus − deductions`. Base salary lives on the `Admin` document (`baseSalary`), so there is no separate salary-config collection.



## Settings Models (dual singleton — unified read API)

| Model | Key | Owns |

|-------|-----|------|

| `Settings.js` | `global` | Delivery charges, SMS/courier gateways, rate limits, payment gateway config |

| `Setting.js` | `master` | Cashback, loyalty points, VIP thresholds, flash sale, referral rewards |



**Unified read:** `GET /api/admin/all-settings` returns `{ global, master }` merged. Writes still use `/api/admin/settings` and `/api/admin/master-settings` until a future data migration.



## Mobile App (Expo)

mobile/

├── App.js                     ← root stack; hydrates Zustand in useEffect; ErrorBoundary around NavigationContainer

├── index.js                   ← entry (gesture-handler → splash preventAutoHide → registerRootComponent)

├── .env.example               ← EXPO_PUBLIC_API_URL, EXPO_PUBLIC_CHAT_URL, EXPO_PUBLIC_APP_ENV

├── package.json               ← "main": "index.js" (classic App.js + React Navigation v7, not expo-router)

├── metro.config.js            ← Expo default Metro (Hermes-safe; no extra transformers)

├── src/

│   ├── splash.js              ← SplashScreen.preventAutoHideAsync() before screens/stores load

│   ├── api/                   ← Axios client and backend endpoints

│   ├── components/            ← Reusable UI (headers, cards, auth, profile Action Hub, DistrictUpazilaPicker, AddressForm, ErrorBoundary)

│   ├── navigation/            ← Stack and Tab navigators

│   ├── data/                  ← Bangladesh locations (district IDs + upazilas); Home/Shop use the API

│   ├── theme/                 ← Light/dark palettes

│   ├── screens/               ← Application pages (incl. ProductDetails, Wishlist, OrderDetails, DeleteAccount, Legal)

│   ├── services/              ← Axios instance (EXPO_PUBLIC_API_URL or https://eonlinebazar.com/api)

│   ├── config/chatConfig.js   ← Chat API/socket URLs (EXPO_PUBLIC_CHAT_URL)

│   ├── utils/                 ← Shared helpers (product mapping, media URLs)

│   └── store/                 ← Zustand (cart, auth, orders, products, wishlist, toast, theme)

├── app.json                   ← scheme eonlinebazar, android.package com.eonlinebazar.app, newArchEnabled false, expo-splash-screen plugin (not expo-router)

├── eas.json                   ← preview = internal APK; production AAB



### Local Development Setup (Mobile)

Copy `mobile/.env.example` to `mobile/.env`.
Use your machine's LAN IP address (not localhost) when testing
on a physical device. Run ipconfig (Windows) or ifconfig (Mac/Linux)
to find your IP. Expo DevTools also shows the correct URL.

### Mobile environment setup

Copy `mobile/.env.example` to `mobile/.env` for local development (`mobile/.env` is gitignored). For production builds, set the same vars in EAS secrets:



```

EXPO_PUBLIC_API_URL=http://localhost:3000/api

EXPO_PUBLIC_CHAT_URL=http://localhost:5001

EXPO_PUBLIC_APP_ENV=development

```



Restart Expo after changing env vars (`npx expo start -c`).



## Page assembly

- GET /admin → adminPageBuilder.js (partials; admin.html is not used)

- GET /profile → profilePageBuilder.js (thin shell client/profile.html + partials)



## Enterprise Feature Status (Phase 4 complete)

| Area | Status |

|------|--------|

| ERP — inventory, orders, POs, suppliers, warehouses | ✅ |

| CRM — customers, campaigns, abandoned carts, tickets, chat, reviews, loyalty | ✅ |

| HRM — staff, RBAC, audit, security logs, sessions | ✅ |

| HRM — attendance, shifts, payroll, leave (Phase 5) | ✅ |

| Admin grouped nav + breadcrumbs + mobile drawer | ✅ |

| Cursor pagination (customers, products, mobile shop) | ✅ |

| Unified settings read API | ✅ |

| Enterprise dashboard widgets | ✅ |

| DB index migration script | ✅ `npm run migrate:indexes` |



## Local Development Quick Reference

### Dev servers

| Service | Command | URL |
|---------|---------|-----|
| Store gateway | `npm run dev:store` | `http://localhost:5000` |
| Chat microservice | `npm run dev:chat` | port **5001** |
| Admin dashboard (Vite) | `cd admin-dashboard && npm run dev` | `:5173` (or `:3000` depending on Vite config) |
| Built chat-admin SPA | served by store gateway | `http://localhost:5000/chat-admin` |

### Important reminders

- Shared secrets (`JWT_SECRET`, `INTERNAL_API_KEY`, Cloudinary) belong in **repo-root `.env`** only.
- Rebuild chat-admin after env changes: `cd admin-dashboard && npm run build`, then copy `dist/` → `backend/public/chat-admin/`.

### Chat environment variables

| Variable | Where |
|----------|-------|
| `CHAT_SERVICE_URL` / `CHAT_SERVICE_PORT` | repo-root `.env` |
| `INTERNAL_API_KEY` | repo-root `.env` (same value chat service reads via loadEnv) |
| `MAIN_STORE_API_URL`, `SOCKET_CORS_ORIGIN` | `ecommerce-chat/.env` |
| `VITE_API_URL`, `VITE_SOCKET_URL` | `admin-dashboard/.env` (use `:5000` for gateway) |

See also: `docs/SETUP.md`, `ecommerce-chat/docs/SETUP.md`, `devops/first-time-server-setup.md`.

## Documentation Index

| Document | Purpose |
|----------|---------|
| `ARCHITECTURE.md` | **Read first** — folder layout, barrels, nav groups, env setup, dev rules |
| `REFACTOR_MAP.md` | **Read first** — file-by-file refactor status and change log |
| `SYSTEM_ENTERPRISE_AUDIT.md` | Full-stack enterprise audit (ERP/CRM/HRM, chat, mobile, settings) |
| `CHAT_AUDIT.md` | Live chat close/session teardown audit |
| `AUDIT_REPORT.md` | Mobile app feature parity audit |
| `PROFILE_AUDIT.md` | Profile module split diagnostics |
| `README.md` | Quick start, env vars, deployment |
| `docs/SETUP.md` | Chat microservice setup (Bengali) |
| `devops/first-time-server-setup.md` | Production VPS first-time setup |

When adding audit findings or operational notes, **update the relevant existing doc above** — do not create new standalone audit files unless the scope is genuinely new.

## Rules for new developers

1. NEVER add code to barrel files (admin.css, admin-core.js, admin-products.js, admin-settings.js, profile.js, etc.) — **exception:** one-line `import` additions to barrels are allowed when wiring a new module.
2. ALWAYS add to the relevant module file.
3. ALWAYS update REFACTOR_MAP.md when creating new files.
4. CSS @media queries go in `_responsive.css` of that module group.
5. `window.functionName = fn` for any function used in HTML `onclick=""`.
6. Run tests after every change: `npm test` (all tests must pass).

