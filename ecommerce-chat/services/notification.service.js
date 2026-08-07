const nodemailer = require('nodemailer');
const { AIKnowledgeBase } = require('../models/AIKnowledgeBase.model');

function getTransporter() {
  const user = process.env.SMTP_EMAIL;
  const pass = process.env.SMTP_PASSWORD;

  if (!user || !pass) {
    throw new Error('SMTP_EMAIL and SMTP_PASSWORD must be configured');
  }

  return nodemailer.createTransport({
    service: process.env.SMTP_SERVICE || 'gmail',
    host: process.env.SMTP_HOST || undefined,
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
    auth: { user, pass },
  });
}

function bangladeshTimestamp(date = new Date()) {
  return date.toLocaleString('bn-BD', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Email alert when a chat is handed over to a live agent.
 */
async function sendHandoverAlert({ room_id, guest_name, last_message, order_id }) {
  const to = process.env.NOTIFY_EMAIL || process.env.SMTP_EMAIL;
  if (!to) {
    console.warn('[notification] NOTIFY_EMAIL not set — skipping handover alert');
    return { skipped: true };
  }

  const dashboardUrl =
    process.env.ADMIN_DASHBOARD_URL ||
    process.env.CLIENT_URL ||
    'http://localhost:5173';

  const subject = `🔔 নতুন লাইভ চ্যাট রিকোয়েস্ট - #${room_id}`;
  const orderBlock = order_id
    ? `<p style="margin:8px 0;"><strong>Order ID:</strong> ${escapeHtml(String(order_id))}</p>`
    : '';

  const html = `
<!DOCTYPE html>
<html lang="bn">
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Segoe UI,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#6C63FF;color:#ffffff;padding:22px 28px;font-size:20px;font-weight:700;">
            🔔 নতুন লাইভ চ্যাট রিকোয়েস্ট
          </td>
        </tr>
        <tr>
          <td style="padding:28px;color:#222;">
            <p style="margin:0 0 12px;font-size:16px;">
              <strong>কাস্টমার:</strong> ${escapeHtml(guest_name || 'Guest')}
            </p>
            <p style="margin:0 0 12px;font-size:15px;line-height:1.5;">
              <strong>শেষ মেসেজ:</strong><br/>
              <span style="color:#444;">${escapeHtml(last_message || '—')}</span>
            </p>
            <p style="margin:8px 0;"><strong>Room ID:</strong> ${escapeHtml(String(room_id))}</p>
            ${orderBlock}
            <div style="text-align:center;margin:28px 0 12px;">
              <a href="${escapeHtml(dashboardUrl)}"
                 style="display:inline-block;background:#6C63FF;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:16px;font-weight:700;">
                ড্যাশবোর্ডে যান →
              </a>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px;background:#fafafa;color:#777;font-size:12px;border-top:1px solid #eee;">
            সময় (বাংলাদেশ): ${escapeHtml(bangladeshTimestamp())}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const transporter = getTransporter();
  const info = await transporter.sendMail({
    from: `"Chat Alert" <${process.env.SMTP_EMAIL}>`,
    to,
    subject,
    html,
  });

  return { success: true, messageId: info.messageId };
}

/**
 * End-of-day summary email.
 * @param {object} stats - { total_today, resolved_today, avg_rating, rated_count? }
 */
async function sendDailyReport(stats = {}) {
  const to = process.env.NOTIFY_EMAIL || process.env.SMTP_EMAIL;
  if (!to) {
    console.warn('[notification] NOTIFY_EMAIL not set — skipping daily report');
    return { skipped: true };
  }

  const topCategories = await AIKnowledgeBase.find({ is_active: true })
    .sort({ usage_count: -1 })
    .limit(3)
    .select('category question usage_count')
    .lean();

  const topRows =
    topCategories.length > 0
      ? topCategories
          .map(
            (c, i) =>
              `<tr>
                <td style="padding:8px;border-bottom:1px solid #eee;">${i + 1}</td>
                <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(c.category)}</td>
                <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(c.question)}</td>
                <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${c.usage_count || 0}</td>
              </tr>`
          )
          .join('')
      : `<tr><td colspan="4" style="padding:12px;color:#888;">কোনো ডেটা নেই</td></tr>`;

  const html = `
<!DOCTYPE html>
<html lang="bn">
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Segoe UI,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
    <tr><td align="center">
      <table width="560" style="background:#fff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#6C63FF;color:#fff;padding:20px 28px;font-size:18px;font-weight:700;">
            📊 দৈনিক চ্যাট রিপোর্ট
          </td>
        </tr>
        <tr>
          <td style="padding:28px;color:#222;">
            <ul style="padding-left:18px;line-height:1.8;font-size:15px;">
              <li><strong>আজকের মোট চ্যাট:</strong> ${Number(stats.total_today) || 0}</li>
              <li><strong>সমাধান হয়েছে:</strong> ${Number(stats.resolved_today) || 0}</li>
              <li><strong>গড় রেটিং:</strong> ${stats.avg_rating != null ? stats.avg_rating : 'N/A'}</li>
            </ul>
            <h3 style="margin:24px 0 12px;font-size:16px;">Top 3 AI ক্যাটাগরি</h3>
            <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-collapse:collapse;">
              <thead>
                <tr style="background:#f0efff;">
                  <th style="padding:8px;text-align:left;">#</th>
                  <th style="padding:8px;text-align:left;">Category</th>
                  <th style="padding:8px;text-align:left;">Question</th>
                  <th style="padding:8px;text-align:right;">Usage</th>
                </tr>
              </thead>
              <tbody>${topRows}</tbody>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 28px;background:#fafafa;color:#777;font-size:12px;">
            ${escapeHtml(bangladeshTimestamp())}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const transporter = getTransporter();
  const info = await transporter.sendMail({
    from: `"Chat Report" <${process.env.SMTP_EMAIL}>`,
    to,
    subject: `📊 দৈনিক চ্যাট রিপোর্ট — ${bangladeshTimestamp().split(',')[0] || ''}`,
    html,
  });

  return { success: true, messageId: info.messageId, topCategories };
}

module.exports = {
  sendHandoverAlert,
  sendDailyReport,
};
