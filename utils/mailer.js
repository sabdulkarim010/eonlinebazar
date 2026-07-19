/********************************************************************
 * Project: EonlineBazar — Fortified Admin Security Suite
 * File: mailer.js
 * Location: utils/mailer.js
 * Author: Abdul Karim Sheikh
 * Description: Shared Nodemailer transport + a branded admin 2FA OTP
 * email template. Credentials are read from SMTP_* env vars (with
 * EMAIL_USER / EMAIL_PASS as a backward-compatible fallback).
 * If SMTP is missing or sendMail fails, the 6-digit OTP is logged
 * in a high-visibility terminal banner so login is never blocked.
 ********************************************************************/

const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;
const SMTP_USER = process.env.SMTP_USER || process.env.EMAIL_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || process.env.EMAIL_PASS || '';

/**
 * Build a Nodemailer transport from .env SMTP settings.
 * Port 465 → implicit TLS (secure: true)
 * Port 587 → STARTTLS (secure: false)
 */
function createSmtpTransport() {
    if (!SMTP_USER || !SMTP_PASS) return null;

    const secure = SMTP_PORT === 465;

    return nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure,
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS
        },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 20000
    });
}

let transporter = createSmtpTransport();

/** High-visibility OTP dump for the VS Code / server terminal */
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

/**
 * Send the admin 2FA OTP email.
 * On missing config or any send failure → log OTP to the terminal and
 * return { delivered: false } so verification can still proceed.
 */
async function sendAdminOtpEmail({ to, otp, username, ip, location, expiresInMinutes = 5 }) {
    const recipient = to || SMTP_USER;

    // Rebuild transport in case env was loaded late / process restarted
    if (!transporter) {
        transporter = createSmtpTransport();
    }

    if (!transporter || !recipient) {
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

    try {
        await transporter.sendMail({
            from: `"EonlineBazar Security" <${SMTP_USER}>`,
            to: recipient,
            subject: `🔐 Your Admin Login Code: ${otp}`,
            html
        });
        return { delivered: true };
    } catch (err) {
        console.error('Admin OTP email send failed:', err.message);
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

module.exports = { transporter, sendAdminOtpEmail, createSmtpTransport };
