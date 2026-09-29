const fs = require('fs');
const path = require('path');

const clientRoot = path.join(__dirname, '..', 'client');

function walk(dir, out = []) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p, out);
        else if (ent.name.endsWith('.html')) out.push(p);
    }
    return out;
}

function patchFile(filePath) {
    let html = fs.readFileSync(filePath, 'utf8');
    if (html.includes('utils/storage.js')) return false;
    if (!html.includes('session-guard.js')) return false;

    const rel = path.relative(clientRoot, filePath).replace(/\\/g, '/');
    const useRoot = html.includes('"/js/') || html.includes("'/js/") || rel === 'index.html';
    const base = useRoot ? '/js/' : 'js/';

    const inserts = [
        `<script src="${base}utils/storage.js"></script>`,
        `<script src="${base}utils/telemetry.js"></script>`,
        `<script src="${base}utils/sanitizer.js"></script>`,
        `<script src="${base}store/commerceState.js"></script>`
    ];
    if (rel === 'checkout.html') {
        inserts.push(`<script src="${base}store/checkoutState.js"></script>`);
    }

    const sessionRe = /\s*<script src="[^"]*session-guard\.js"><\/script>/;
    const match = html.match(sessionRe);
    if (!match) return false;

    html = html.replace(sessionRe, `\n    ${inserts.join('\n    ')}\n${match[0]}`);
    fs.writeFileSync(filePath, html, 'utf8');
    return true;
}

let count = 0;
for (const file of walk(clientRoot)) {
    if (patchFile(file)) count += 1;
}
console.log('HTML files patched:', count);
