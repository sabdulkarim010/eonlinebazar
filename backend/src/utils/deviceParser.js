/********************************************************************
 * Project: EonlineBazar — Fortified Admin Security Suite
 * File: deviceParser.js
 * Location: utils/deviceParser.js
 * Author: Abdul Karim Sheikh
 * Description: Centralized request fingerprinting helpers used across
 * the admin security suite. Extracts the real client IP, resolves a
 * physical location from that IP (offline via geoip-lite), and parses
 * the User-Agent (OS / Browser / Device Type) using ua-parser-js.
 ********************************************************************/

const geoip = require('geoip-lite');
const requestIp = require('request-ip');

// ua-parser-js v2 exposes a named `UAParser`; v1 exports the function directly.
const uaLib = require('ua-parser-js');
const UAParser = uaLib.UAParser || uaLib;

/* -------------------------------------------------------------------
   ক্লায়েন্টের আসল IP বের করা (প্রক্সি/CDN হেডার-অ্যাওয়্যার)
------------------------------------------------------------------- */
function getClientIp(req) {
    const detected = req.clientIp || requestIp.getClientIp(req);
    if (detected) return detected;
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) return String(fwd).split(',')[0].trim();
    return (req.socket && req.socket.remoteAddress) || req.ip || 'Unknown';
}

/* -------------------------------------------------------------------
   IP থেকে "City, Country" শনাক্ত করা (অফলাইন geoip-lite লুকআপ)
------------------------------------------------------------------- */
function getLocationFromIp(rawIp = '') {
    try {
        const ip = String(rawIp).replace('::ffff:', '').trim();
        if (!ip || ip === 'Unknown') return 'Unknown Location';

        if (
            ip === '127.0.0.1' || ip === '::1' ||
            ip.startsWith('10.') || ip.startsWith('192.168.') ||
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)
        ) {
            return 'Local Network';
        }

        const geo = geoip.lookup(ip);
        if (!geo) return 'Unknown Location';

        let countryName = geo.country || '';
        try {
            const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
            countryName = regionNames.of(geo.country) || geo.country;
        } catch (_) { /* Intl unavailable → keep country code */ }

        const parts = [geo.city, geo.region, countryName].filter(Boolean);
        // avoid "Dhaka, Dhaka, Bangladesh" duplication
        const unique = parts.filter((v, i) => parts.indexOf(v) === i);
        return unique.length ? unique.join(', ') : 'Unknown Location';
    } catch (err) {
        return 'Unknown Location';
    }
}

/* -------------------------------------------------------------------
   User-Agent → { os, browser, deviceType, device }
------------------------------------------------------------------- */
function parseDevice(uaString = '') {
    try {
        const parsed = UAParser(uaString || '');
        const osName = parsed.os && parsed.os.name ? parsed.os.name : 'Unknown OS';
        const osVer = parsed.os && parsed.os.version ? ` ${parsed.os.version}` : '';
        const browserName = parsed.browser && parsed.browser.name ? parsed.browser.name : 'Unknown Browser';

        // ua-parser-js only sets device.type for mobile/tablet/etc; desktop => undefined
        let deviceType = parsed.device && parsed.device.type ? parsed.device.type : 'desktop';
        deviceType = deviceType.charAt(0).toUpperCase() + deviceType.slice(1);

        const os = `${osName}${osVer}`.trim();
        return {
            os,
            browser: browserName,
            deviceType,
            device: `${osName} · ${browserName}`
        };
    } catch (err) {
        return { os: 'Unknown OS', browser: 'Unknown Browser', deviceType: 'Desktop', device: 'Unknown Device' };
    }
}

/* -------------------------------------------------------------------
   এক কলে সম্পূর্ণ রিকোয়েস্ট ফিঙ্গারপ্রিন্ট
------------------------------------------------------------------- */
function fingerprint(req) {
    const ipAddress = getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';
    const { os, browser, deviceType, device } = parseDevice(userAgent);
    return {
        ipAddress,
        location: getLocationFromIp(ipAddress),
        os,
        browser,
        deviceType,
        device,
        userAgent
    };
}

module.exports = { getClientIp, getLocationFromIp, parseDevice, fingerprint };
