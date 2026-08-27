/********************************************************************
 * Project: EonlineBazar
 * File: profilePageBuilder.js
 * Location: backend/src/utils/profilePageBuilder.js
 * Description: Assembles the customer profile page from the thin shell
 * at client/profile.html plus HTML partials in client/profile/partials/.
 * Production caches the assembled markup; development rebuilds on every
 * request. Branding is applied by the view route after this returns.
 ********************************************************************/

const fs = require('fs');
const path = require('path');

const CLIENT_DIR = path.join(__dirname, '../../../client');
const SHELL_PATH = path.join(CLIENT_DIR, 'profile.html');
const PARTIALS_DIR = path.join(CLIENT_DIR, 'profile/partials');

const REQUIRED_PARTIALS = [
    'head',
    'header',
    'body-open',
    'sidebar',
    'tab-overview',
    'tab-orders',
    'tab-wishlist',
    'tab-wallet',
    'tab-notes',
    'tab-addresses',
    'tab-settings',
    'tab-security',
    'modals',
    'scripts'
];

const PARTIAL_MARKER = /<!--\s*PARTIAL:([a-z0-9-]+)\s*-->/gi;

function readPartial(name) {
    const filePath = path.join(PARTIALS_DIR, `${name}.html`);
    if (!fs.existsSync(filePath)) {
        throw new Error(`Profile partial not found: ${filePath}`);
    }
    return fs.readFileSync(filePath, 'utf8').replace(/\s+$/, '');
}

function buildProfilePage() {
    if (!fs.existsSync(SHELL_PATH)) {
        throw new Error(`Profile shell not found: ${SHELL_PATH}`);
    }

    let html = fs.readFileSync(SHELL_PATH, 'utf8');
    const injected = new Set();

    html = html.replace(PARTIAL_MARKER, (_, rawName) => {
        const name = String(rawName || '').trim();
        injected.add(name);
        return readPartial(name);
    });

    const missing = REQUIRED_PARTIALS.filter((name) => !injected.has(name));
    if (missing.length) {
        throw new Error(`Profile shell is missing PARTIAL markers: ${missing.join(', ')}`);
    }

    if (!html.includes('EonlineBazar Profile — assembled')) {
        html = html.replace(
            '<!DOCTYPE html>',
            '<!DOCTYPE html>\n<!-- EonlineBazar Profile — assembled -->'
        );
    }

    return html;
}

let cache = null;

module.exports = function getProfilePage() {
    if (process.env.NODE_ENV === 'production' && cache) {
        return cache;
    }
    cache = buildProfilePage();
    return cache;
};
