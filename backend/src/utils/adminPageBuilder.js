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
    'view-catalog',
    'view-products',
    'view-security',
    'view-master-settings',
    'view-banners',
    'view-messages',
    'view-file-manager',
    'view-staff',
    'view-settings'
];

const MODAL_PARTIALS = [
    'modals-products',
    'modals-customers',
    'modals-orders',
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
