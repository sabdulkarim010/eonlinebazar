const fs = require('fs');
const path = require('path');

const BRANDING_PUBLIC_PREFIX = '/uploads/branding';
const LEGACY_BRANDING_PREFIX = '/images/branding';
const BRANDING_DIR = path.join(__dirname, '..', 'client', 'uploads', 'branding');

function normalizeBrandingPublicUrl(url) {
    if (!url || typeof url !== 'string') return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return url.replace(new RegExp(`^${LEGACY_BRANDING_PREFIX}/`), `${BRANDING_PUBLIC_PREFIX}/`);
}

function brandingPublicPath(filename) {
    return `${BRANDING_PUBLIC_PREFIX}/${filename}`;
}

function resolveBrandingDiskPath(publicUrl) {
    const normalized = normalizeBrandingPublicUrl(publicUrl);
    if (!normalized.startsWith(`${BRANDING_PUBLIC_PREFIX}/`)) return null;
    return path.join(__dirname, '..', 'client', normalized.replace(/^\//, ''));
}

function deleteLocalBrandingAsset(publicUrl) {
    const diskPath = resolveBrandingDiskPath(publicUrl);
    if (!diskPath) return;

    if (fs.existsSync(diskPath)) {
        try {
            fs.unlinkSync(diskPath);
        } catch (err) {
            console.error('Local branding file delete error:', err);
        }
    }

    const legacyPath = publicUrl.startsWith(`${LEGACY_BRANDING_PREFIX}/`)
        ? path.join(__dirname, '..', 'client', publicUrl.replace(/^\//, ''))
        : null;

    if (legacyPath && legacyPath !== diskPath && fs.existsSync(legacyPath)) {
        try {
            fs.unlinkSync(legacyPath);
        } catch (err) {
            console.error('Legacy branding file delete error:', err);
        }
    }
}

module.exports = {
    BRANDING_PUBLIC_PREFIX,
    LEGACY_BRANDING_PREFIX,
    BRANDING_DIR,
    normalizeBrandingPublicUrl,
    brandingPublicPath,
    resolveBrandingDiskPath,
    deleteLocalBrandingAsset
};
