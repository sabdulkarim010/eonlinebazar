/********************************************************************
 * Project: EonlineBazar
 * File: injectSharedPartials.js
 * Location: backend/src/utils/injectSharedPartials.js
 * Description: Replaces duplicated storefront header, footer, and
 * WhatsApp markup with the canonical client/partials/ copies.
 * Simplified headers (about/contact/CMS — no search box) are left as-is.
 ********************************************************************/

const fs = require('fs');
const path = require('path');

const PARTIALS_DIR = path.join(__dirname, '../../../client/partials');

function readShared(name) {
    return fs.readFileSync(path.join(PARTIALS_DIR, name), 'utf8').replace(/\s+$/, '');
}

function injectSharedPartials(html) {
    if (!html || typeof html !== 'string') return html;

    const header = readShared('shared-header.html');
    const footer = readShared('shared-footer.html');
    const whatsapp = readShared('shared-whatsapp.html');

    html = html.replace(/<header class="amazon-header">[\s\S]*?<\/header>/g, (block) => {
        if (block.includes('search-box-container') || block.includes('id="searchInput"')) {
            return header;
        }
        return block;
    });

    html = html.replace(
        /<div class="whatsapp-floating-container">[\s\S]*?<a href="#" id="waFloatBtn"[\s\S]*?<\/a>\s*<\/div>/g,
        whatsapp
    );

    html = html.replace(/<div id="global-site-footer"><\/div>/g, footer);

    return html;
}

module.exports = { injectSharedPartials };
