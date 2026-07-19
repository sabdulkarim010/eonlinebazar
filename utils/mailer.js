/********************************************************************
 * Project: EonlineBazar — Fortified Admin Security Suite
 * File: mailer.js
 * Location: utils/mailer.js
 * Author: Abdul Karim Sheikh
 * Description: Production-ready Nodemailer transport for admin 2FA OTP
 * delivery, hardened for restrictive cloud networks (Render, Railway,
 * Fly.io, etc.) where outbound SMTP on port 465 is frequently blocked.
 *
 *   • Dynamic port failover: 465 (implicit TLS) → 587 (STARTTLS).
 *   • Pooled connections + bounded timeouts so a slow cloud network
 *     never freezes the login request or the frontend UI.
 *   • Bulletproof try/catch: if every SMTP route is blocked, the
 *     6-digit OTP is printed to the server console (Render logs) inside
 *     a high-visibility banner so login is never hard-blocked.
 *
 * Credentials are read from SMTP_* env vars, with EMAIL_USER / EMAIL_PASS
 * kept as a backward-compatible fallback.
 ********************************************************************/

const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_USER = process.env.SMTP_USER || process.env.EMAIL_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || process.env.EMAIL_PASS || '';

// The admin-configured port is tried first; 587/465 are always kept as
// automatic fallbacks so a blocked handshake transparently self-heals.
const CONFIGURED_PORT = Number(process.env.SMTP_PORT) || 465;

// Timeouts are deliberately short. On a blocked cloud network we would
// rather fail fast, fall back to the next port, and (worst case) return
// { delivered: false } quickly than let the login request hang for 30s+.
const CONNECTION_TIMEOUT_MS = Number(process.env.SMTP_CONNECTION_TIMEOUT_MS) || 8000;
const GREETING_TIMEOUT_MS = Number(process.env.SMTP_GREETING_TIMEOUT_MS) || 8000;
const SOCKET_TIMEOUT_MS = Number(process.env.SMTP_SOCKET_TIMEOUT_MS) || 12000;

// Absolute ceiling for the whole send (all port attempts combined). Past
// this the request resolves as "not delivered" so the frontend never freezes.
const OVERALL_SEND_DEADLINE_MS = Number(process.env.SMTP_SEND_DEADLINE_MS) || 20000;

/** Cache one pooled transport per port so we don't rebuild sockets each send. */
const transportCache = new Map();

/**
 * Build a pooled Nodemailer transport for a specific port.
 *   Port 465 → implicit TLS (secure: true, strict cert validation)
 *   Port 587 → STARTTLS   (secure: false, relaxed cert validation so
 *                          cloud relays with imperfect chains still work)
 */
function buildTransportForPort(port) {
    const secure = port === 465; // implicit TLS is only correct on 465

    return nodemailer.createTransport({
        host: SMTP_HOST,
        port,
        secure,
        auth: { user: SMTP_USER, pass: SMTP_PASS },

        // Pooling keeps a warm connection open so slow cloud networks don't
        // pay the full TLS/handshake cost on every OTP and don't get their
        // handshake killed mid-flight.
        pool: true,
        maxConnections: 3,
        maxMessages: 50,

        connectionTimeout: CONNECTION_TIMEOUT_MS,
        greetingTimeout: GREETING_TIMEOUT_MS,
        socketTimeout: SOCKET_TIMEOUT_MS,

        tls: {
            // Strict on the secure 465 path; relaxed on the 587 STARTTLS
            // fallback so a blocked/upgraded network path still delivers.
            rejectUnauthorized: secure,
            minVersion: 'TLSv1.2',
            servername: SMTP_HOST
        }
    });
}

/** Get (or lazily create + cache) the pooled transport for a port. */
function getTransportForPort(port) {
    if (!SMTP_USER || !SMTP_PASS) return null;
    if (!transportCache.has(port)) {
        transportCache.set(port, buildTransportForPort(port));
    }
    return transportCache.get(port);
}

/**
 * Ordered list of ports to attempt: the admin-configured port first, then
 * 587 (STARTTLS — the cloud-friendly path), then 465, de-duplicated.
 */
function candidatePorts() {
    const ordered = [CONFIGURED_PORT, 587, 465];
    return [...new Set(ordered)];
}

/**
 * Auth failures (bad user/pass) will never be fixed by switching ports, so
 * we stop immediately. Everything else (timeouts, refused/blocked handshakes,
 * DNS, TLS negotiation) is treated as retryable on the next port.
 */
function isAuthError(err) {
    return err && (err.code === 'EAUTH' || err.responseCode === 535);
}

/** High-visibility OTP dump for the server / Render logs. */
function logOtpToConsole({ otp, username, ip, location, expiresInMinutes, reason }) {
    const cell = (label, value) => {
        const text = `${label}: ${String(value || '')}`.slice(0, 60);
        return `║  ${text.padEnd(60)}║`;
    };
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║          🔐  ADMIN 2FA OTP — FALLBACK (READ THIS)            ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(cell('Username', username || 'admin'));
    console.log(cell('OTP CODE', otp));
    console.log(cell('Expires', `${expiresInMinutes} minutes`));
    console.log(cell('Origin', `${ip || 'Unknown'} (${location || 'Unknown'})`));
    if (reason) console.log(cell('Reason', reason));
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('\n');
}

/** Reject if a promise doesn't settle before `ms` — our anti-freeze guard. */
function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const e = new Error(`${label} exceeded ${ms}ms deadline`);
            e.code = 'ETIMEDOUT';
            reject(e);
        }, ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Attempt delivery across each candidate port until one succeeds.
 * Returns the port used on success, or throws the last error.
 */
async function sendWithFailover(mailOptions) {
    const ports = candidatePorts();
    let lastError;

    for (const port of ports) {
        const transport = getTransportForPort(port);
        if (!transport) throw new Error('Email transport not configured');

        try {
            await transport.sendMail(mailOptions);
            return port;
        } catch (err) {
            lastError = err;
            console.error(`Admin OTP email failed on port ${port}: ${err.message}`);

            // Bad credentials won't be fixed by another port — bail out now.
            if (isAuthError(err)) break;
            // Otherwise fall through and try the next candidate port.
        }
    }

    throw lastError || new Error('All SMTP delivery routes failed');
}

/**
 * Send the admin 2FA OTP email.
 * On missing config or any send failure → log OTP to the console and
 * return { delivered: false } so verification can still proceed and the
 * frontend can offer a smooth resend without freezing.
 */
async function sendAdminOtpEmail({ to, otp, username, ip, location, expiresInMinutes = 5 }) {
    const recipient = to || SMTP_USER;

    if (!SMTP_USER || !SMTP_PASS || !recipient) {
        logOtpToConsole({
            otp,
            username,
            ip,
            location,
            expiresInMinutes,
            reason: 'SMTP not configured (set SMTP_USER / SMTP_PASS)'
        });
        return { delivered: false, reason: 'Email transport not configured' };
    }

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
            <div style="background: #0f172a; padding: 22px; text-align: center;">
                <h2 style="color: #f8fafc; margin: 0;">EonlineBazar · Admin Security</h2>
                <p style="color: #94a3b8; margin: 6px 0 0; font-size: 13px;">Two-Factor Authentication</p>
            </div>
            <div style="padding: 28px;">
                <p style="color:#111827;">A login to the <b>Super Admin Panel</b> was requested for <b>${username || 'admin'}</b>.</p>
                <p style="color:#374151;">Enter this one-time verification code to complete sign-in:</p>
                <div style="text-align:center; margin: 26px 0;">
                    <span style="display:inline-block; font-size: 34px; letter-spacing: 10px; font-weight: 800; color:#0f172a; background:#f1f5f9; padding: 14px 26px; border-radius: 10px; border:1px dashed #cbd5e1;">${otp}</span>
                </div>
                <p style="color:#dc2626; font-size: 13px; text-align:center;"><i>This code expires in ${expiresInMinutes} minutes. Never share it with anyone.</i></p>
                <hr style="border:0; border-top:1px solid #eee; margin: 20px 0;">
                <p style="color:#6b7280; font-size:12px;">Request origin: <b>${ip || 'Unknown'}</b> — ${location || 'Unknown Location'}</p>
                <p style="color:#6b7280; font-size:12px;">If you did not attempt this login, change your admin password immediately and review the Security &amp; Audit dashboard.</p>
            </div>
        </div>
    `;

    const mailOptions = {
        from: `"EonlineBazar Security" <${SMTP_USER}>`,
        to: recipient,
        subject: `🔐 Your Admin Login Code: ${otp}`,
        html
    };

    try {
        // The overall deadline guarantees this resolves quickly even if the
        // cloud provider silently blackholes every outbound SMTP port.
        const portUsed = await withTimeout(
            sendWithFailover(mailOptions),
            OVERALL_SEND_DEADLINE_MS,
            'SMTP delivery'
        );
        return { delivered: true, port: portUsed };
    } catch (err) {
        // Production network fully blocks outbound SMTP → don't fail the
        // request. Surface the OTP in the logs so an admin can still sign in.
        console.error('Admin OTP email send failed (all routes):', err.message);
        logOtpToConsole({
            otp,
            username,
            ip,
            location,
            expiresInMinutes,
            reason: err.message || 'SMTP connection/send failure'
        });
        return { delivered: false, reason: err.message };
    }
}

module.exports = {
    sendAdminOtpEmail,
    getTransportForPort,
    buildTransportForPort,
    // Backward-compat alias for older imports expecting createSmtpTransport().
    createSmtpTransport: () => getTransportForPort(CONFIGURED_PORT)
};
