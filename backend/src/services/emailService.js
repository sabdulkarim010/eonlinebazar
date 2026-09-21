/********************************************************************
 * Project: EonlineBazar
 * File: emailService.js
 * Description: Transactional email — Resend (primary) → Brevo (fallback) → log.
 * Never throws from sendEmail(); SMTP is not used (blocked on DigitalOcean IPv6).
 ********************************************************************/

const { Resend } = require('resend');

const VALID_PROVIDERS = ['resend', 'brevo', 'disabled'];

let runtimeConfigOverride = null;

function setRuntimeEmailConfig(config) {
    runtimeConfigOverride = config && typeof config === 'object' ? { ...config } : null;
}

function resolveEmailConfig() {
    const db = runtimeConfigOverride || {};
    const provider = String(
        db.emailProvider
        || process.env.EMAIL_PROVIDER
        || 'resend'
    ).trim().toLowerCase();

    const normalizedProvider = VALID_PROVIDERS.includes(provider) ? provider : 'resend';

    return {
        emailProvider: normalizedProvider,
        resendApiKey: String(
            db.resendApiKey
            || process.env.RESEND_API_KEY
            || ''
        ).trim(),
        resendFromEmail: String(
            db.resendFromEmail
            || process.env.RESEND_FROM_EMAIL
            || process.env.RESEND_FROM
            || 'EonlineBazar <noreply@eonlinebazar.com>'
        ).trim(),
        brevoApiKey: String(
            db.brevoApiKey
            || process.env.BREVO_API_KEY
            || ''
        ).trim(),
        brevoFromEmail: String(
            db.brevoFromEmail
            || process.env.BREVO_FROM_EMAIL
            || 'noreply@eonlinebazar.com'
        ).trim(),
        siteName: String(process.env.SITE_NAME || 'EonlineBazar').trim()
    };
}

function getResendClient(apiKey) {
    if (!apiKey) return null;
    return new Resend(apiKey);
}

function normalizeRecipients(to) {
    if (Array.isArray(to)) {
        return to.map((entry) => String(entry || '').trim()).filter(Boolean);
    }
    const single = String(to || '').trim();
    return single ? [single] : [];
}

/**
 * Resend → Brevo → log (never throw).
 */
async function sendEmail({ to, subject, html, text, from } = {}) {
    const recipients = normalizeRecipients(to);
    const config = resolveEmailConfig();

    if (config.emailProvider === 'disabled') {
        console.warn('[EMAIL-DISABLED] Provider set to disabled.');
        console.warn(`  To: ${recipients.join(', ') || '(none)'}`);
        console.warn(`  Subject: ${subject || ''}`);
        return { success: false, provider: 'none', message: 'Email provider disabled' };
    }

    if (recipients.length === 0) {
        console.warn('[EMAIL-UNDELIVERED] Missing recipient.');
        return { success: false, provider: 'none', message: 'Missing recipient email' };
    }

    const htmlBody = html || (text ? `<p>${text}</p>` : '<p></p>');
    const primary = config.emailProvider === 'brevo' ? 'brevo' : 'resend';
    const chain = primary === 'brevo' ? ['brevo', 'resend'] : ['resend', 'brevo'];

    for (const provider of chain) {
        if (provider === 'resend') {
            const client = getResendClient(config.resendApiKey);
            const fromAddress = from || config.resendFromEmail;
            if (!client || !fromAddress) continue;

            try {
                const result = await client.emails.send({
                    from: fromAddress,
                    to: recipients,
                    subject: String(subject || '').trim() || '(no subject)',
                    html: htmlBody
                });
                if (result.error) throw new Error(result.error.message || 'Resend error');
                console.log(`[EMAIL-RESEND] Sent to ${recipients.join(', ')}: ${subject}`);
                return { success: true, provider: 'resend', id: result.data?.id || null };
            } catch (err) {
                console.error('[EMAIL-RESEND] Failed:', err.message);
            }
        }

        if (provider === 'brevo') {
            if (!config.brevoApiKey) continue;

            try {
                const res = await fetch('https://api.brevo.com/v3/smtp/email', {
                    method: 'POST',
                    headers: {
                        'api-key': config.brevoApiKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sender: {
                            name: config.siteName,
                            email: config.brevoFromEmail
                        },
                        to: recipients.map((email) => ({ email })),
                        subject: String(subject || '').trim() || '(no subject)',
                        htmlContent: htmlBody
                    })
                });

                if (res.ok) {
                    console.log(`[EMAIL-BREVO] Sent to ${recipients.join(', ')}`);
                    return { success: true, provider: 'brevo' };
                }

                const errText = await res.text().catch(() => '');
                throw new Error(errText || `Brevo status: ${res.status}`);
            } catch (err) {
                console.error('[EMAIL-BREVO] Failed:', err.message);
            }
        }
    }

    console.warn('[EMAIL-UNDELIVERED] No provider configured or all providers failed.');
    console.warn(`  To: ${recipients.join(', ')}`);
    console.warn(`  Subject: ${subject || ''}`);
    return { success: false, provider: 'none', message: 'No email provider available' };
}

function getEmailProviderStatus() {
    const config = resolveEmailConfig();

    if (config.emailProvider === 'disabled') {
        return { provider: 'none', configured: false };
    }

    if (config.emailProvider === 'brevo' && config.brevoApiKey) {
        return { provider: 'brevo', configured: true };
    }

    if (config.resendApiKey && config.resendFromEmail) {
        return { provider: 'resend', configured: true };
    }

    if (config.brevoApiKey) {
        return { provider: 'brevo', configured: true };
    }

    return { provider: 'none', configured: false };
}

async function sendOrderConfirmation(order, customer) {
    return sendEmail({
        to: customer?.email,
        subject: `Order Confirmed — #${order?.orderNumber || order?.orderId || 'N/A'}`,
        html: buildOrderConfirmationHTML(order, customer)
    });
}

async function sendStockAlert(items, adminEmail) {
    return sendEmail({
        to: adminEmail,
        subject: `⚠️ Stock Alert — ${Array.isArray(items) ? items.length : 0} item(s) low`,
        html: buildStockAlertHTML(items)
    });
}

async function sendWishlistNotification(customer, product) {
    const slug = product?.slug || product?._id || '';
    return sendEmail({
        to: customer?.email,
        subject: `Price drop on ${product?.name || 'your wishlist item'}!`,
        html: buildWishlistHTML(customer, product, slug)
    });
}

function buildOrderConfirmationHTML(order, customer) {
    const orderNumber = order?.orderNumber || order?.orderId || 'N/A';
    const total = order?.totalAmount ?? order?.grandTotal ?? 0;
    const name = customer?.name || order?.customerName || 'Customer';

    return `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2>Order Confirmed! 🎉</h2>
        <p>Hi ${name},</p>
        <p>Your order <strong>#${orderNumber}</strong> has been confirmed.</p>
        <p>Total: <strong>৳${total}</strong></p>
        <p>We'll notify you when it ships.</p>
        <hr>
        <small>EonlineBazar · eonlinebazar.com</small>
      </div>`;
}

function buildStockAlertHTML(items) {
    const rows = (Array.isArray(items) ? items : []).map((i) =>
        `<tr><td>${i.name || 'Item'}</td><td>${i.stock ?? i.quantity ?? '—'}</td></tr>`
    ).join('');

    return `
      <div style="font-family:sans-serif;max-width:600px">
        <h2>⚠️ Stock Alert</h2>
        <table border="1" cellpadding="8" width="100%">
          <tr><th>Product</th><th>Stock</th></tr>
          ${rows || '<tr><td colspan="2">No items</td></tr>'}
        </table>
      </div>`;
}

function buildWishlistHTML(customer, product, slug) {
    const name = customer?.name || 'there';
    const productName = product?.name || 'your wishlist item';
    const price = product?.price ?? 0;
    const url = slug
        ? `https://eonlinebazar.com/product/${slug}`
        : 'https://eonlinebazar.com';

    return `
      <div style="font-family:sans-serif;max-width:600px">
        <h2>Good news, ${name}! 🎁</h2>
        <p><strong>${productName}</strong> is now ৳${price}</p>
        <a href="${url}"
           style="background:#3b82f6;color:white;padding:10px 20px;
                  text-decoration:none;border-radius:4px">
          View Product
        </a>
      </div>`;
}

module.exports = {
    VALID_PROVIDERS,
    setRuntimeEmailConfig,
    resolveEmailConfig,
    sendEmail,
    getEmailProviderStatus,
    sendOrderConfirmation,
    sendStockAlert,
    sendWishlistNotification,
    buildOrderConfirmationHTML,
    buildStockAlertHTML,
    buildWishlistHTML
};
