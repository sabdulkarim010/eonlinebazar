/********************************************************************
 * Transactional mail — Resend HTTP API only (admin OTP + customer auth).
 * DigitalOcean blocks outbound SMTP (587/465). Never use nodemailer here.
 ********************************************************************/

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const RESEND_API_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'EonlineBazar Security <noreply@eonlinebazar.com>';

const apiKey = process.env.RESEND_API_KEY || 're_TyspsFeZ_8RZHv4RpqQ3TMXcSSdGtn';
const fromEmail = process.env.RESEND_FROM || 'EonlineBazar Security <noreply@eonlinebazar.com>';

function getResendFrom() {
    return String(fromEmail || DEFAULT_FROM).trim() || DEFAULT_FROM;
}

/**
 * POST https://api.resend.com/emails — HTTPS :443 only, no SMTP fallback.
 */
async function sendEmail({ to, subject, html, from } = {}) {
    const recipient = String(to || '').trim();

    if (!recipient) {
        const error = new Error('Missing recipient email');
        console.error('Resend API Error:', error);
        throw error;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    try {
        const res = await fetch(RESEND_API_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: from || fromEmail,
                to: [recipient],
                subject,
                html
            }),
            signal: controller.signal
        });

        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
            const detail = payload.message || payload.error || res.statusText || 'Resend API error';
            const error = new Error(detail);
            error.status = res.status;
            error.payload = payload;
            throw error;
        }

        console.log(`[Mail] Sent via Resend HTTP API to ${recipient}`);
        return { delivered: true, via: 'resend', id: payload.id || null };
    } catch (error) {
        if (error && error.name === 'AbortError') {
            const timeoutError = new Error('Resend API timed out');
            console.error('Resend API Error:', timeoutError);
            throw timeoutError;
        }
        console.error('Resend API Error:', error);
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

function buildAdminOtpHtml({ otp, username, ip, location, expiresInMinutes }) {
    return `
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
}

/**
 * Login 2FA OTP. Resend only — never opens SMTP 587/465.
 * Returns { delivered } and never throws (login controller maps failure to 503).
 */
async function sendAdminOtpEmail({ to, otp, username, ip, location, expiresInMinutes = 5 }) {
    const recipient = String(to || '').trim();

    if (!recipient) {
        const error = new Error('Admin OTP recipient email is not set');
        console.error('Resend API Error:', error);
        return { delivered: false, reason: error.message };
    }

    try {
        return await sendEmail({
            to: recipient,
            from: fromEmail,
            subject: `🔐 Your Admin Login Code: ${otp}`,
            html: buildAdminOtpHtml({ otp, username, ip, location, expiresInMinutes })
        });
    } catch (error) {
        return { delivered: false, reason: error.message || 'Resend API error' };
    }
}

module.exports = {
    sendEmail,
    sendAdminOtpEmail,
    getResendFrom
};
