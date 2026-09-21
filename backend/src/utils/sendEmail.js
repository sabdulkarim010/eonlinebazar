/********************************************************************
 * Transactional mail — delegates to emailService (Resend → Brevo → log).
 * Admin OTP and customer auth emails use HTTPS APIs only (no SMTP).
 ********************************************************************/

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const {
    sendEmail: coreSendEmail,
    resolveEmailConfig
} = require('../services/emailService');

const DEFAULT_FROM = 'EonlineBazar Security <noreply@eonlinebazar.com>';

function getResendFrom() {
    const config = resolveEmailConfig();
    return String(config.resendFromEmail || DEFAULT_FROM).trim() || DEFAULT_FROM;
}

/**
 * Resend → Brevo → log. Throws on hard failures for auth flows that need it.
 */
async function sendEmail({ to, subject, html, from } = {}) {
    const recipient = String(to || '').trim();

    if (!recipient) {
        const error = new Error('Missing recipient email');
        console.error('Email Error:', error);
        throw error;
    }

    const result = await coreSendEmail({
        to: recipient,
        subject,
        html,
        from: from || getResendFrom()
    });

    if (!result.success) {
        const error = new Error(result.message || 'Email delivery failed');
        console.error('Email Error:', error);
        throw error;
    }

    return { delivered: true, via: result.provider, id: result.id || null };
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

async function sendAdminOtpEmail({ to, otp, username, ip, location, expiresInMinutes = 5 }) {
    const recipient = String(to || '').trim();

    if (!recipient) {
        const error = new Error('Admin OTP recipient email is not set');
        console.error('Email Error:', error);
        return { delivered: false, reason: error.message };
    }

    try {
        return await sendEmail({
            to: recipient,
            from: getResendFrom(),
            subject: `🔐 Your Admin Login Code: ${otp}`,
            html: buildAdminOtpHtml({ otp, username, ip, location, expiresInMinutes })
        });
    } catch (error) {
        return { delivered: false, reason: error.message || 'Email delivery failed' };
    }
}

module.exports = {
    sendEmail,
    sendAdminOtpEmail,
    getResendFrom
};
