/**
 * Shared Nodemailer transport for chat microservice (DigitalOcean-safe IPv4 + timeouts).
 * Aligns with main backend Gmail pattern: smtp.gmail.com:587 STARTTLS.
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

module.exports = {
  resolveSmtpCredentials,
  createChatMailTransporter,
};
