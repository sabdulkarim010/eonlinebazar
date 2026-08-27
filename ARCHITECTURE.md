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
│   │   ├── admin-products.js  ← BARREL → products-* + catalog-*
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
│   ├── admin/             ← Admin-specific controllers
│   ├── auth/              ← Auth-specific controllers
│   ├── adminController.js           ← BARREL
│   ├── adminSecurityController.js   ← BARREL
│   └── authController.js            ← BARREL
├── routes/                ← NEVER split routes — keep as barrel files
└── utils/
    ├── adminPageBuilder.js    ← assembles admin/partials (including modals-*)
    ├── profilePageBuilder.js  ← assembles profile.html shell + profile/partials
    └── injectSharedPartials.js

## Page assembly
- GET /admin → adminPageBuilder.js (partials; admin.html is not used)
- GET /profile → profilePageBuilder.js (thin shell client/profile.html + partials)

## Rules for new developers:
1. NEVER add code to barrel files (admin.css, admin-core.js, admin-products.js, admin-settings.js, profile.js, etc.)
2. ALWAYS add to the relevant module file
3. ALWAYS update REFACTOR_MAP.md when creating new files
4. CSS @media queries go in _responsive.css of that module group
5. window.functionName = fn for any function used in HTML onclick=""
6. Run tests after every change: npm test
