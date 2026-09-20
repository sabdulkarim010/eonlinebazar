/********************************************************************
 * Storefront maintenance gate — admin routes and allowlisted IPs pass.
 ********************************************************************/

const path = require('path');
const { fetchSettingsDocument } = require('../services/settingsReadService');
const { getClientIp } = require('../utils/deviceParser');

const CACHE_TTL_MS = 60 * 1000;
let cached = { expiresAt: 0, payload: null };

function normalizeIp(ip = '') {
    return String(ip).trim().toLowerCase();
}

function isBypassPath(url = '') {
    const p = String(url).split('?')[0];
    return p.startsWith('/admin')
        || p.startsWith('/api/admin')
        || p.startsWith('/api/internal')
        || p === '/health'
        || p.startsWith('/health')
        || p.startsWith('/sys');
}

async function loadMaintenanceSettings() {
    const now = Date.now();
    if (cached.payload && now < cached.expiresAt) return cached.payload;

    try {
        const doc = await fetchSettingsDocument();
        const allowedIPs = Array.isArray(doc.maintenanceAllowedIPs)
            ? doc.maintenanceAllowedIPs.map(normalizeIp).filter(Boolean)
            : [];

        cached = {
            expiresAt: now + CACHE_TTL_MS,
            payload: {
                enabled: doc.maintenanceMode === true,
                message: String(doc.maintenanceMessage || '').trim()
                    || 'We are currently performing scheduled maintenance. Please check back soon.',
                storeName: String(doc.storeName || 'EonlineBazar').trim() || 'EonlineBazar',
                allowedIPs
            }
        };
    } catch {
        cached = {
            expiresAt: now + CACHE_TTL_MS,
            payload: {
                enabled: false,
                message: '',
                storeName: 'EonlineBazar',
                allowedIPs: []
            }
        };
    }

    return cached.payload;
}

function renderMaintenanceHtml({ storeName, message }) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Maintenance — ${storeName}</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { max-width: 520px; background: #fff; border-radius: 16px; padding: 32px; box-shadow: 0 10px 40px rgba(15,23,42,.08); text-align: center; }
    h1 { font-size: 1.75rem; margin: 0 0 12px; }
    p { color: #475569; line-height: 1.6; }
    .icon { font-size: 2.5rem; margin-bottom: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🔧</div>
    <h1>We're under maintenance</h1>
    <p><strong>${storeName}</strong> is temporarily down for maintenance.</p>
    <p>${message}</p>
    <p>We'll be back soon!</p>
  </div>
</body>
</html>`;
}

async function maintenanceModeMiddleware(req, res, next) {
    try {
        if (isBypassPath(req.originalUrl || req.path)) return next();

        const settings = await loadMaintenanceSettings();
        if (!settings.enabled) return next();

        const clientIp = normalizeIp(getClientIp(req));
        if (settings.allowedIPs.includes(clientIp)) return next();

        const wantsJson = req.path.startsWith('/api/')
            || (req.headers.accept || '').includes('application/json');

        if (wantsJson) {
            return res.status(503).json({
                success: false,
                maintenance: true,
                message: settings.message
            });
        }

        return res.status(503).type('html').send(renderMaintenanceHtml(settings));
    } catch (err) {
        console.warn('[maintenanceModeMiddleware]', err.message);
        return next();
    }
}

function invalidateMaintenanceCache() {
    cached.expiresAt = 0;
    cached.payload = null;
}

module.exports = {
    maintenanceModeMiddleware,
    invalidateMaintenanceCache,
    loadMaintenanceSettings
};
