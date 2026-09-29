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
    if (html.includes('utils/sanitizer.js')) return false;
    if (!html.includes('utils/telemetry.js')) return false;

    const rel = path.relative(clientRoot, filePath).replace(/\\/g, '/');
    const useRoot = html.includes('"/js/') || html.includes("'/js/") || rel === 'index.html';
    const base = useRoot ? '/js/' : 'js/';

    const tag = `<script src="${base}utils/sanitizer.js"></script>`;
    const telemetryRe = /(\s*<script src="[^"]*utils\/telemetry\.js"><\/script>)/;
    if (!telemetryRe.test(html)) return false;

    html = html.replace(telemetryRe, `$1\n    ${tag}`);
    fs.writeFileSync(filePath, html, 'utf8');
    return true;
}

let count = 0;
for (const file of walk(clientRoot)) {
    if (patchFile(file)) count += 1;
}
console.log('HTML files patched with sanitizer.js:', count);
