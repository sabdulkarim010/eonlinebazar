const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const PAYMENTS_PUBLIC_PREFIX = '/uploads/payments';
const PAYMENTS_DIR = path.join(REPO_ROOT, 'public', 'uploads', 'payments');

function paymentLogoPublicPath(filename) {
    return `${PAYMENTS_PUBLIC_PREFIX}/${filename}`;
}

function resolvePaymentLogoDiskPath(publicUrl) {
    if (!publicUrl || typeof publicUrl !== 'string') return null;
    if (publicUrl.startsWith('http://') || publicUrl.startsWith('https://')) return null;
    if (!publicUrl.startsWith(`${PAYMENTS_PUBLIC_PREFIX}/`)) return null;
    return path.join(REPO_ROOT, 'public', publicUrl.replace(/^\//, ''));
}

function deleteLocalPaymentLogo(publicUrl) {
    const diskPath = resolvePaymentLogoDiskPath(publicUrl);
    if (!diskPath || !fs.existsSync(diskPath)) return;

    try {
        fs.unlinkSync(diskPath);
    } catch (err) {
        console.error('Local payment logo delete error:', err);
    }
}

function buildUniquePaymentLogoFilename(gatewayKey, originalName = '') {
    const ext = path.extname(originalName).toLowerCase() || '.png';
    const safeKey = String(gatewayKey || 'payment').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'payment';
    const unique = crypto.randomBytes(6).toString('hex');
    return `${safeKey}-${Date.now()}-${unique}${ext}`;
}

module.exports = {
    PAYMENTS_PUBLIC_PREFIX,
    PAYMENTS_DIR,
    paymentLogoPublicPath,
    resolvePaymentLogoDiskPath,
    deleteLocalPaymentLogo,
    buildUniquePaymentLogoFilename
};
