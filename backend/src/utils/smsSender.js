/********************************************************************
 * Project: EonlineBazar — Fortified Admin Security Suite
 * File: smsSender.js
 * Location: utils/smsSender.js
 * Author: Abdul Karim Sheikh
 * Description: Admin/security SMS delivery — delegates transport to
 *   services/smsService.js. Customer order notifications use smsService
 *   directly and respect the Master Settings toggle.
 ********************************************************************/

const { sendSms } = require('../services/smsService');

const SMS_SENDER_ID = process.env.SMS_SENDER_ID || 'EOBAZAR';

/** High-visibility console fallback label for admin OTP flows. */
function logAdminOtpFallback({ to, otp, expiresInMinutes }) {
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║          📱  ADMIN 2FA OTP — SMS FALLBACK (READ THIS)        ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║  To:      ${String(to || 'N/A').padEnd(51)}║`);
    console.log(`║  OTP:     ${String(otp || '').padEnd(51)}║`);
    console.log(`║  Expires: ${`${expiresInMinutes} minutes`.padEnd(51)}║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('\n');
}

/**
 * Send the admin 2FA OTP over SMS.
 * Never throws to the caller — on any failure it logs the OTP to the
 * server console and returns { delivered: false } so verification still works.
 *
 * @returns {Promise<{delivered: boolean, provider: string, reason?: string}>}
 */
async function sendAdminOtpSms({ to, otp, username, expiresInMinutes = 5 }) {
    const body = `[${SMS_SENDER_ID}] Your EonlineBazar admin login code is ${otp}. It expires in ${expiresInMinutes} minutes. Never share this code.`;

    if (!to) {
        logAdminOtpFallback({ to, otp, expiresInMinutes });
        return { delivered: false, provider: process.env.SMS_PROVIDER || 'console', reason: 'No admin phone number on file' };
    }

    const result = await sendSms({ to, body, context: 'ADMIN 2FA OTP' });

    if (!result.delivered) {
        logAdminOtpFallback({ to, otp, expiresInMinutes });
    }

    return result;
}

module.exports = { sendAdminOtpSms };
