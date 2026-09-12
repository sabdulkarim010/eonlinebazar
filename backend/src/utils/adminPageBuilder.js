/********************************************************************
 * Project: EonlineBazar
 * File: adminPageBuilder.js
 * Location: backend/src/utils/adminPageBuilder.js
 * Description: Assembles the admin SPA from HTML partials. Production
 * caches the assembled markup; development rebuilds on every request.
 * Branding is applied by the view route after this returns.
 ********************************************************************/

const fs = require('fs');
const path = require('path');

const PARTIALS_DIR = path.join(__dirname, '../../../client/admin/partials');

const VIEW_PARTIALS = [
    'view-overview',
    'view-customers',
    'view-orders',
    'view-pos',
    'view-catalog',
    'view-products',
    'view-security',
    'view-shipping-payments',
    'view-loyalty-program',
    'view-store-config',
    'view-banners',
    'view-messages',
    'view-crm-abandoned',
    'view-chat',
    'view-chat-analytics',
    'view-canned-responses',
    'view-file-manager',
    'view-staff',
    'settings-staff-audit',
    'view-hrm-employees',
    'view-hrm-attendance',
    'view-hrm-payroll',
    'view-hrm-leaves',
    'view-settings',
    'view-reviews',
    'view-suppliers',
    'view-warehouses',
    'view-purchase-orders',
    'view-accounts',
    'view-finance',
    'view-erp-expenses'
];

const MODAL_PARTIALS = [
    'modals-products',
    'modals-customers',
    'modals-orders',
    'orders-pos',
    'modals-catalog',
    'modals-cms',
    'modals-payments',
    'modals-invoice'
];

function readPartial(name) {
    return fs.readFileSync(path.join(PARTIALS_DIR, `${name}.html`), 'utf8').replace(/\s+$/, '');
}

function buildAdminPage() {
    const head = readPartial('head');
    const bodyOpen = readPartial('body-open');
    const sidebar = readPartial('sidebar');
    const header = readPartial('header');
    const views = VIEW_PARTIALS.map((name) => readPartial(name)).join('\n');
    const modals = MODAL_PARTIALS.map((name) => readPartial(name)).join('\n');
    const scripts = readPartial('scripts');

    return `<!DOCTYPE html>
<html lang="en">
${head}

<body>

${bodyOpen}
${sidebar}


<main class="main-content">
            
            ${header}

${views}

        </main>
    </div>


${modals}

${scripts}

</body>
</html>
`;
}

let cache = null;

module.exports = function getAdminPage() {
    if (process.env.NODE_ENV === 'production' && cache) {
        return cache;
    }
    cache = buildAdminPage();
    return cache;
};
