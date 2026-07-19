/********************************************************************
 * Project: EonlineBazar — Fortified Admin Security Suite
 * File: smsSender.js
 * Location: utils/smsSender.js
 * Author: Abdul Karim Sheikh
 * Description: SMS 2FA delivery abstraction (PLACEHOLDER).
 *   Exposes a single sendAdminOtpSms() that the auth flow calls. Today it
 *   routes to a console fallback so login is never blocked; swapping in a
 *   real provider (Twilio, or a local Bangladeshi gateway) is a matter of
 *   filling in ONE function — no changes needed anywhere else.
 *
 *   Selected via .env → SMS_PROVIDER = console | twilio | custom
 ********************************************************************/

const SMS_PROVIDER = String(process.env.SMS_PROVIDER || 'console').toLowerCase();
const SMS_SENDER_ID = process.env.SMS_SENDER_ID || 'EOBAZAR';

/** High-visibility console fallback (dev / provider-not-configured). */
function logSmsToConsole({ to, otp, expiresInMinutes }) {
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

/* ------------------------------------------------------------------
   PROVIDER 1 — Twilio (structure ready; uncomment + add creds later)
------------------------------------------------------------------- */
async function sendViaTwilio({ to, body }) {
    // const twilio = require('twilio');
    // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    // const msg = await client.messages.create({
    //     from: process.env.TWILIO_FROM_NUMBER,
    //     to,
    //     body
    // });
    // return { delivered: true, id: msg.sid };
    throw new Error('Twilio provider not configured. Add SDK + credentials in utils/smsSender.js');
}

/* ------------------------------------------------------------------
   PROVIDER 2 — Custom / local HTTP gateway (fill in the fetch call)
------------------------------------------------------------------- */
async function sendViaCustomGateway({ to, body }) {
    // const res = await fetch(process.env.SMS_API_URL, {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.SMS_API_KEY}` },
    //     body: JSON.stringify({ sender: SMS_SENDER_ID, to, message: body })
    // });
    // const data = await res.json();
    // if (!res.ok) throw new Error(data.message || 'SMS gateway error');
    // return { delivered: true, id: data.id };
    throw new Error('Custom SMS gateway not configured. Implement sendViaCustomGateway() in utils/smsSender.js');
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
        logSmsToConsole({ to, otp, expiresInMinutes });
        return { delivered: false, provider: SMS_PROVIDER, reason: 'No admin phone number on file' };
    }

    try {
        if (SMS_PROVIDER === 'twilio') {
            await sendViaTwilio({ to, body });
            return { delivered: true, provider: 'twilio' };
        }
        if (SMS_PROVIDER === 'custom') {
            await sendViaCustomGateway({ to, body });
            return { delivered: true, provider: 'custom' };
        }
        // Default: console provider (development)
        logSmsToConsole({ to, otp, expiresInMinutes });
        return { delivered: false, provider: 'console', reason: 'SMS_PROVIDER=console (dev fallback)' };
    } catch (err) {
        console.error('Admin OTP SMS send failed:', err.message);
        logSmsToConsole({ to, otp, expiresInMinutes });
        return { delivered: false, provider: SMS_PROVIDER, reason: err.message };
    }
}

module.exports = { sendAdminOtpSms };
