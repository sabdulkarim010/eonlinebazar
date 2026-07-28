const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FOOTER_ICONS_PUBLIC_PREFIX = '/uploads/footer';
const FOOTER_ICONS_DIR = path.join(__dirname, '..', 'public', 'uploads', 'footer');

function footerIconPublicPath(filename) {
    return `${FOOTER_ICONS_PUBLIC_PREFIX}/${filename}`;
}

function resolveFooterIconDiskPath(publicUrl) {
    if (!publicUrl || typeof publicUrl !== 'string') return null;
    if (publicUrl.startsWith('http://') || publicUrl.startsWith('https://')) return null;
    if (!publicUrl.startsWith(`${FOOTER_ICONS_PUBLIC_PREFIX}/`)) return null;
    return path.join(__dirname, '..', 'public', publicUrl.replace(/^\//, ''));
}

function deleteLocalFooterIcon(publicUrl) {
    const diskPath = resolveFooterIconDiskPath(publicUrl);
    if (!diskPath || !fs.existsSync(diskPath)) return;

    try {
        fs.unlinkSync(diskPath);
    } catch (err) {
        console.error('Local footer icon delete error:', err);
    }
}

function buildUniqueFooterIconFilename(key, originalName = '') {
    const ext = path.extname(originalName).toLowerCase() || '.png';
    const safeKey = String(key || 'icon').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'icon';
    const unique = crypto.randomBytes(6).toString('hex');
    return `${safeKey}-${Date.now()}-${unique}${ext}`;
}

module.exports = {
    FOOTER_ICONS_PUBLIC_PREFIX,
    FOOTER_ICONS_DIR,
    footerIconPublicPath,
    resolveFooterIconDiskPath,
    deleteLocalFooterIcon,
    buildUniqueFooterIconFilename
};
