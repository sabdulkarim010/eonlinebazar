/********************************************************************
 * Project: EonlineBazar — Fortified Admin Security Suite
 * File: geoFencing.js
 * Location: middlewares/geoFencing.js
 * Author: Abdul Karim Sheikh
 * Description: Geolocation-Based Access Control (Geo-Fencing).
 *   Resolves the login IP → ISO country code (offline via geoip-lite)
 *   and rejects the request BEFORE any credential check when the origin
 *   country is not in the ALLOWED_COUNTRIES allow-list.
 *
 *   Config (.env):
 *     ALLOWED_COUNTRIES=BD,SA     (comma separated alpha-2; empty ⇒ disabled)
 *     GEO_ALLOW_PRIVATE=true      (permit localhost / LAN IPs for dev)
 ********************************************************************/

const geoip = require('geoip-lite');
const { getClientIp, getLocationFromIp } = require('../utils/deviceParser');
const LoginAttempt = require('../models/loginAttempt');
const { logSecurityEvent } = require('../utils/securityLogger');

/* Parse the .env allow-list once into an uppercase Set for O(1) lookups. */
function getAllowedCountries() {
    return String(process.env.ALLOWED_COUNTRIES || '')
        .split(',')
        .map(c => c.trim().toUpperCase())
        .filter(Boolean);
}

const ALLOW_PRIVATE = String(process.env.GEO_ALLOW_PRIVATE || 'true').toLowerCase() === 'true';

/* Detect localhost / RFC-1918 private ranges so dev machines aren't blocked. */
function isPrivateIp(ip = '') {
    const clean = String(ip).replace('::ffff:', '').trim();
    if (!clean || clean === 'Unknown') return true; // can't geo-locate → treat as local
    return (
        clean === '127.0.0.1' || clean === '::1' ||
        clean.startsWith('10.') || clean.startsWith('192.168.') ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(clean)
    );
}

/**
 * Resolve an IP → alpha-2 country code (e.g. 'BD'). Returns null if unknown.
 */
function resolveCountry(rawIp = '') {
    try {
        const ip = String(rawIp).replace('::ffff:', '').trim();
        if (!ip || ip === 'Unknown') return null;
        const geo = geoip.lookup(ip);
        return geo && geo.country ? String(geo.country).toUpperCase() : null;
    } catch (_) {
        return null;
    }
}

/* ==================================================================
   GEO-FENCE GATE — runs ahead of the login controller
   ================================================================== */
const geoFence = async (req, res, next) => {
    try {
        const allowed = getAllowedCountries();

        // No allow-list configured ⇒ feature disabled, let everyone through.
        if (allowed.length === 0) return next();

        const ip = getClientIp(req);

        // Local / private network bypass (developer convenience, opt-out via env).
        if (isPrivateIp(ip)) {
            if (ALLOW_PRIVATE) return next();
        }

        const country = resolveCountry(ip);

        // If country is resolvable AND is in the allow-list → proceed.
        if (country && allowed.includes(country)) {
            return next();
        }

        // ---- BLOCKED: region not permitted ----
        const location = getLocationFromIp(ip);
        const username = (req.body && req.body.username) || 'unknown';
        const shownCountry = country || 'Unknown Region';

        LoginAttempt.create({
            ipAddress: ip,
            username,
            location,
            status: 'blocked',
            userAgent: req.headers['user-agent'] || '',
            details: `Geo-fence block — origin ${shownCountry} not in [${allowed.join(', ')}]`
        }).catch(() => {});

        logSecurityEvent({
            action: 'Admin Login Geo-Blocked',
            actor: username,
            actorType: 'system',
            ipAddress: ip,
            details: `Region "${shownCountry}" (${location}) blocked — allowed: ${allowed.join(', ')}`
        }).catch(() => {});

        return res.status(403).json({
            success: false,
            blocked: true,
            reason: 'REGION_BLOCKED',
            message: `⛔ Region Blocked. Admin access is not permitted from your location (${shownCountry}). If this is a mistake, contact the system administrator.`,
            country: shownCountry
        });
    } catch (err) {
        console.error('geoFence error:', err.message);
        // Fail-open on unexpected errors so a geoip glitch never locks out admins.
        return next();
    }
};

module.exports = { geoFence, resolveCountry, getAllowedCountries, isPrivateIp };
