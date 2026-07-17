/********************************************************************
 * Project: EonlineBazar — Fortified Admin Security Suite
 * File: mailer.js
 * Location: utils/mailer.js
 * Author: Abdul Karim Sheikh
 * Description: Shared Nodemailer transport + a branded admin 2FA OTP
 * email template. If SMTP credentials are missing (dev environment)
 * the send gracefully degrades and the OTP is logged cleanly to the
 * server console so verification can still be completed.
 ********************************************************************/

const nodemailer = require('nodemailer');

let transporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });
}

/**
 * অ্যাডমিন 2FA OTP ইমেইল পাঠানো।
 * ইমেইল কনফিগার না থাকলে বা পাঠাতে ব্যর্থ হলে OTP কনসোলে পরিষ্কারভাবে লগ হয়
 * (delivered:false রিটার্ন করে) — যাতে ভেরিফিকেশন ব্লক না হয়।
 */
async function sendAdminOtpEmail({ to, otp, username, ip, location, expiresInMinutes = 5 }) {
    const recipient = to || process.env.EMAIL_USER;

    const consoleBanner = () => {
        console.log('\n==================== 🔐 ADMIN 2FA OTP ====================');
        console.log(`  Username : ${username || 'admin'}`);
        console.log(`  OTP CODE : ${otp}`);
        console.log(`  Expires  : ${expiresInMinutes} minutes`);
        console.log(`  Origin   : ${ip || 'Unknown'} (${location || 'Unknown Location'})`);
        console.log('==========================================================\n');
    };

    if (!transporter || !recipient) {
        consoleBanner();
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
            from: `"EonlineBazar Security" <${process.env.EMAIL_USER}>`,
            to: recipient,
            subject: `🔐 Your Admin Login Code: ${otp}`,
            html
        });
        return { delivered: true };
    } catch (err) {
        console.error('Admin OTP email send failed:', err.message);
        consoleBanner();
        return { delivered: false, reason: err.message };
    }
}

module.exports = { transporter, sendAdminOtpEmail };
