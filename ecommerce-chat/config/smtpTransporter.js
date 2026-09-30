/**
 * Chat microservice mail — Resend HTTP (primary when RESEND_API_KEY set) → Nodemailer SMTP fallback.
 * loadEnv loads repo-root .env where RESEND_* and SMTP_* live.
 */
const nodemailer = require('nodemailer');

function resolveSmtpCredentials() {
  const user = String(
    process.env.SMTP_USER ||
      process.env.SMTP_EMAIL ||
      process.env.EMAIL_USER ||
      ''
  ).trim();
  const pass = String(
    process.env.SMTP_PASS ||
      process.env.SMTP_PASSWORD ||
      process.env.EMAIL_PASS ||
      ''
  ).trim();
  return { user, pass };
}

function resolveResendApiKey() {
  return String(process.env.RESEND_API_KEY || '').trim();
}

function resolveSenderAddress() {
  const fromEnv = String(
    process.env.RESEND_FROM_EMAIL ||
      process.env.RESEND_FROM ||
      ''
  ).trim();
  if (fromEnv) return fromEnv;

  const { user } = resolveSmtpCredentials();
  if (user) {
    return `"EonlineBazar Chat Admin" <${user}>`;
  }
  return 'EonlineBazar Chat Admin <noreply@eonlinebazar.com>';
}

function createChatMailTransporter() {
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  const { user, pass } = resolveSmtpCredentials();

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: false,
    family: 4,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
    auth: user && pass ? { user, pass } : undefined,
  });
}

function isChatEmailConfigured() {
  if (process.env.NODE_ENV === 'test') return false;
  if (resolveResendApiKey()) return true;
  const { user, pass } = resolveSmtpCredentials();
  return Boolean(user && pass);
}

/**
 * Send transactional mail. Never throws.
 * @returns {Promise<{ delivered: boolean, provider?: string }>}
 */
async function sendChatTransactionalEmail({
  to,
  subject,
  html,
  text,
}) {
  const recipient = String(to || '').trim();
  if (!recipient || process.env.NODE_ENV === 'test') {
    return { delivered: false, provider: 'none' };
  }

  const resendKey = resolveResendApiKey();
  if (resendKey) {
    try {
      const { Resend } = require('resend');
      const client = new Resend(resendKey);
      const payload = {
        from: resolveSenderAddress(),
        to: [recipient],
        subject: String(subject || '').trim() || '(no subject)',
        html: html || (text ? `<p>${text}</p>` : '<p></p>'),
      };
      if (text) payload.text = text;

      const result = await client.emails.send(payload);
      if (result.error) {
        throw new Error(result.error.message || 'Resend API error');
      }
      return { delivered: true, provider: 'resend' };
    } catch (err) {
      if (process.env.NODE_ENV !== 'test') {
        console.error('[CHAT-EMAIL-ERROR]', err.message || err);
      }
      return { delivered: false, provider: 'resend' };
    }
  }

  const { user, pass } = resolveSmtpCredentials();
  if (!user || !pass) {
    return { delivered: false, provider: 'none' };
  }

  try {
    const transporter = createChatMailTransporter();
    await transporter.sendMail({
      from: resolveSenderAddress(),
      to: recipient,
      subject,
      text,
      html,
    });
    return { delivered: true, provider: 'smtp' };
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('[CHAT-SMTP-ERROR]', err.message || err);
    }
    return { delivered: false, provider: 'smtp' };
  }
}

module.exports = {
  resolveSmtpCredentials,
  resolveResendApiKey,
  resolveSenderAddress,
  createChatMailTransporter,
  isChatEmailConfigured,
  sendChatTransactionalEmail,
};
