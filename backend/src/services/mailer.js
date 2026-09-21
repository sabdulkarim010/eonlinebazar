/********************************************************************
 * Project: EonlineBazar
 * File: mailer.js
 * Description: Branded store mail templates — delivery via emailService
 * (Resend → Brevo → log). Admin OTP remains in utils/sendEmail.js.
 ********************************************************************/

const { sendEmail: coreSendEmail, resolveEmailConfig } = require('./emailService');
const { sendAdminOtpEmail } = require('../utils/sendEmail');

const DEFAULT_FROM = process.env.RESEND_FROM_EMAIL
    || process.env.RESEND_FROM
    || 'EonlineBazar <noreply@eonlinebazar.com>';

/** Legacy stubs — SMTP removed; tests may still import these symbols. */
function buildTransportForPort() {
    return null;
}

function getTransportForPort() {
    return null;
}

async function deliverViaApi({ to, subject, html, from }) {
    const result = await coreSendEmail({ to, subject, html, from: from || DEFAULT_FROM });
    return {
        delivered: result.success === true,
        provider: result.provider,
        reason: result.message
    };
}

function isEmailConfigured() {
    const status = require('./emailService').getEmailProviderStatus();
    return status.configured === true;
}

async function sendBrandedMail({ to, subject, html, from, logLabel }) {
    const recipientEmail = String(to || '').trim();
    if (!recipientEmail) {
        return { delivered: false, reason: 'Missing recipient email' };
    }
    if (!isEmailConfigured()) {
        return { delivered: false, reason: 'Email transport not configured' };
    }

    try {
        const result = await deliverViaApi({
            to: recipientEmail,
            subject,
            html,
            from: from || DEFAULT_FROM
        });
        if (result.delivered && logLabel) {
            console.log(`SUCCESS: ${logLabel} sent to ${recipientEmail}`);
        }
        return result;
    } catch (err) {
        console.error(`EMAIL ERROR (${logLabel || 'mail'}):`, err.message || err);
        return { delivered: false, reason: err.message };
    }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatMoneyBdt(value) {
    return `৳${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function buildOrderItemsRows(items = []) {
    if (!Array.isArray(items) || items.length === 0) {
        return `<tr><td colspan="3" style="padding:12px;color:#64748b;">No items recorded</td></tr>`;
    }

    return items.map((item) => {
        const qty = Math.max(1, Number(item.quantity) || 1);
        const lineTotal = Number(item.price || 0) * qty;
        const variant = item.variantLabel || item.variantValue || '';
        const name = escapeHtml(item.name || 'Product');
        const variantText = variant ? `<br><small style="color:#64748b;">${escapeHtml(variant)}</small>` : '';

        return `
            <tr>
                <td style="padding:12px;border-bottom:1px solid #e2e8f0;">${name}${variantText}</td>
                <td style="padding:12px;border-bottom:1px solid #e2e8f0;text-align:center;">${qty}</td>
                <td style="padding:12px;border-bottom:1px solid #e2e8f0;text-align:right;">${formatMoneyBdt(lineTotal)}</td>
            </tr>
        `;
    }).join('');
}

function buildOrderConfirmationHtml(order = {}) {
    const orderId = escapeHtml(order.orderId || 'N/A');
    const customerName = escapeHtml(order.customerName || 'Customer');
    const customerAddress = escapeHtml(order.customerAddress || '—');
    const shippingDistrict = escapeHtml(order.shippingDistrict || '');
    const paymentMethod = escapeHtml(order.paymentMethod || 'COD');
    const subTotal = formatMoneyBdt(order.subTotal ?? order.subtotal);
    const deliveryCharge = formatMoneyBdt(order.deliveryCharge ?? order.shippingFee);
    const discountAmount = Number(order.discountAmount || 0);
    const grandTotal = formatMoneyBdt(order.grandTotal ?? order.totalAmount);
    const discountRow = discountAmount > 0
        ? `<tr><td style="padding:8px 0;color:#64748b;">Discount</td><td style="padding:8px 0;text-align:right;color:#16a34a;">- ${formatMoneyBdt(discountAmount)}</td></tr>`
        : '';

    return `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <div style="background:#0f172a;padding:24px;text-align:center;">
                <h2 style="color:#f8fafc;margin:0;">EonlineBazar</h2>
                <p style="color:#94a3b8;margin:8px 0 0;font-size:14px;">Order Confirmation</p>
            </div>
            <div style="padding:28px;">
                <p style="color:#111827;font-size:16px;">Dear <b>${customerName}</b>,</p>
                <p style="color:#374151;">Thank you for shopping with us. Your order has been placed successfully.</p>

                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:20px 0;">
                    <p style="margin:0 0 8px;color:#64748b;font-size:13px;">Order ID</p>
                    <p style="margin:0;font-size:22px;font-weight:700;color:#0f172a;">#${orderId}</p>
                </div>

                <h3 style="color:#0f172a;margin:24px 0 12px;font-size:16px;">Ordered Items</h3>
                <table style="width:100%;border-collapse:collapse;font-size:14px;">
                    <thead>
                        <tr style="background:#f1f5f9;">
                            <th style="padding:12px;text-align:left;">Item</th>
                            <th style="padding:12px;text-align:center;">Qty</th>
                            <th style="padding:12px;text-align:right;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${buildOrderItemsRows(order.items)}
                    </tbody>
                </table>

                <div style="margin-top:20px;padding-top:12px;border-top:1px solid #e2e8f0;">
                    <table style="width:100%;font-size:14px;">
                        <tr><td style="padding:8px 0;color:#64748b;">Subtotal</td><td style="padding:8px 0;text-align:right;">${subTotal}</td></tr>
                        ${discountRow}
                        <tr><td style="padding:8px 0;color:#64748b;">Delivery Charge</td><td style="padding:8px 0;text-align:right;">${deliveryCharge}</td></tr>
                        <tr><td style="padding:12px 0;font-weight:700;color:#0f172a;">Grand Total</td><td style="padding:12px 0;text-align:right;font-weight:700;color:#0f172a;font-size:18px;">${grandTotal}</td></tr>
                    </table>
                </div>

                <h3 style="color:#0f172a;margin:24px 0 8px;font-size:16px;">Delivery Address</h3>
                <p style="color:#374151;line-height:1.6;margin:0;">${customerAddress}${shippingDistrict ? `<br>${shippingDistrict}` : ''}</p>

                <p style="color:#64748b;font-size:13px;margin-top:24px;">Payment method: <b>${paymentMethod}</b></p>
                <p style="color:#64748b;font-size:12px;margin-top:20px;">If you have questions about your order, contact EonlineBazar support.</p>
            </div>
        </div>
    `;
}

/**
 * Send a customer order confirmation email via Gmail/SMTP.
 * Never throws — logs success/failure and returns { delivered }.
 */
async function sendOrderConfirmationEmail({ to, order }) {
    const recipientEmail = String(to || '').trim();
    const orderId = order?.orderId || 'N/A';

    if (!recipientEmail) {
        console.error('EMAIL ERROR: No customer email available for order confirmation.');
        return { delivered: false, reason: 'Missing recipient email' };
    }

    return sendBrandedMail({
        to: recipientEmail,
        from: `"EonlineBazar Orders" <${resolveEmailConfig().resendFromEmail || DEFAULT_FROM}>`,
        subject: `Order Confirmed: #${orderId} - EonlineBazar`,
        html: buildOrderConfirmationHtml(order),
        logLabel: 'Order confirmation email'
    });
}

/** Fire-and-forget order email — never blocks or crashes order creation. */
function notifyOrderConfirmationEmail({ to, order }) {
    setImmediate(() => {
        sendOrderConfirmationEmail({ to, order }).catch((err) => {
            console.error('EMAIL ERROR:', err.message || err);
        });
    });
}

function formatEmailDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Dhaka'
    });
}

function formatMultilineHtml(value) {
    return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

function buildInquiryReplyHtml({
    storeName = 'EonlineBazar',
    customerName = 'Customer',
    subject = '',
    inquiryDate,
    originalMessage = '',
    replyMessage = ''
}) {
    const brand = escapeHtml(storeName);
    const safeSubject = escapeHtml(subject || 'Your inquiry');
    const safeName = escapeHtml(customerName || 'Customer');
    const formattedDate = escapeHtml(formatEmailDate(inquiryDate));

    return `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#ffffff;">
            <div style="background:#0f172a;padding:24px;text-align:center;">
                <h2 style="color:#f8fafc;margin:0;font-size:24px;">${brand}</h2>
                <p style="color:#94a3b8;margin:8px 0 0;font-size:14px;">Customer Support Response</p>
            </div>
            <div style="padding:28px;">
                <p style="color:#111827;font-size:16px;margin:0 0 12px;">Dear <b>${safeName}</b>,</p>
                <p style="color:#374151;line-height:1.6;margin:0 0 20px;">Thank you for contacting ${brand}. Our team has reviewed your inquiry and provided a response below.</p>

                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px;margin:0 0 20px;">
                    <p style="margin:0 0 10px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">Your Original Inquiry</p>
                    <p style="margin:0 0 6px;color:#0f172a;font-size:15px;"><b>Subject:</b> ${safeSubject}</p>
                    <p style="margin:0 0 12px;color:#64748b;font-size:13px;"><b>Date:</b> ${formattedDate}</p>
                    <div style="color:#374151;font-size:14px;line-height:1.7;border-left:3px solid #cbd5e1;padding-left:12px;">
                        ${formatMultilineHtml(originalMessage)}
                    </div>
                </div>

                <div style="background:#ecfdf5;border:1px solid #bbf7d0;border-radius:10px;padding:18px;margin:0 0 20px;">
                    <p style="margin:0 0 10px;color:#047857;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">Our Response</p>
                    <div style="color:#14532d;font-size:14px;line-height:1.7;">
                        ${formatMultilineHtml(replyMessage)}
                    </div>
                </div>

                <p style="color:#64748b;font-size:13px;line-height:1.6;margin:0;">If you have any follow-up questions, simply reply to this email and our support team will assist you.</p>
            </div>
            <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 28px;text-align:center;">
                <p style="margin:0;color:#64748b;font-size:12px;">&copy; ${new Date().getFullYear()} ${brand}. All rights reserved.</p>
                <p style="margin:6px 0 0;color:#94a3b8;font-size:11px;">This is an automated response from our customer support team.</p>
            </div>
        </div>
    `;
}

/**
 * Send a branded HTML reply email for a customer inquiry.
 * Returns { delivered } and never throws.
 */
async function sendInquiryReplyEmail({
    to,
    customerName,
    subject,
    inquiryDate,
    originalMessage,
    replyMessage,
    storeName = 'EonlineBazar'
}) {
    const safeSubject = String(subject || 'Your inquiry').trim() || 'Your inquiry';
    return sendBrandedMail({
        to,
        from: `"${storeName} Support" <${DEFAULT_FROM}>`,
        subject: `Re: ${safeSubject} — ${storeName}`,
        html: buildInquiryReplyHtml({
            storeName,
            customerName,
            subject: safeSubject,
            inquiryDate,
            originalMessage,
            replyMessage
        }),
        logLabel: 'Inquiry reply email'
    });
}

/**
 * Send a low-stock / out-of-stock alert email to the admin.
 * Never throws — returns { delivered }.
 */
async function sendStockAlertEmail({ to, subject, html }) {
    return sendBrandedMail({
        to,
        from: `"EonlineBazar Inventory" <${DEFAULT_FROM}>`,
        subject: String(subject || 'Stock Alert'),
        html,
        logLabel: 'Stock alert email'
    });
}

function buildNewsletterWelcomeHtml({ name, unsubscribeUrl, storeUrl }) {
    const safeName = escapeHtml(name || 'গ্রাহক');
    const safeUnsub = escapeHtml(unsubscribeUrl);
    const safeStore = escapeHtml(storeUrl || '/');

    return `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#ffffff;">
            <div style="background:#0f172a;padding:28px;text-align:center;">
                <h2 style="color:#f8fafc;margin:0;font-size:26px;">EOnlineBazar</h2>
                <p style="color:#94a3b8;margin:10px 0 0;font-size:14px;">নিউজলেটারে স্বাগতম! 🎉</p>
            </div>
            <div style="padding:32px;">
                <p style="color:#111827;font-size:16px;margin:0 0 16px;">প্রিয় <b>${safeName}</b>,</p>
                <p style="color:#374151;line-height:1.7;margin:0 0 16px;">
                    EOnlineBazar-এ সাবস্ক্রাইব করার জন্য ধন্যবাদ! এখন থেকে আপনি আমাদের নতুন পণ্য, এক্সক্লুসিভ অফার ও বিশেষ ডিল সম্পর্কে সবার আগে জানতে পারবেন।
                </p>
                <p style="color:#374151;line-height:1.7;margin:0 0 24px;">
                    সেরা কেনাকাটার অভিজ্ঞতার জন্য আমাদের সাথেই থাকুন।
                </p>
                <div style="text-align:center;margin:28px 0;">
                    <a href="${safeStore.replace(/&amp;/g, '&')}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">আমাদের স্টোর দেখুন</a>
                </div>
                <p style="color:#64748b;font-size:12px;line-height:1.6;margin:24px 0 0;text-align:center;">
                    আর ইমেইল পেতে চান না? <a href="${safeUnsub.replace(/&amp;/g, '&')}" style="color:#64748b;">আনসাবস্ক্রাইব করুন</a>
                </p>
            </div>
            <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 28px;text-align:center;">
                <p style="margin:0;color:#64748b;font-size:12px;">&copy; ${new Date().getFullYear()} EOnlineBazar. All rights reserved.</p>
            </div>
        </div>
    `;
}

function buildNewsletterCampaignHtml({ htmlContent, unsubscribeUrl }) {
    const safeUnsub = escapeHtml(unsubscribeUrl);

    return `
        <div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;background:#ffffff;">
            <div style="background:#0f172a;padding:20px;text-align:center;">
                <h2 style="color:#f8fafc;margin:0;font-size:22px;">EOnlineBazar</h2>
            </div>
            <div style="padding:24px;">
                ${htmlContent}
            </div>
            <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 24px;text-align:center;">
                <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">
                    আর ইমেইল পেতে চান না? <a href="${safeUnsub.replace(/&amp;/g, '&')}" style="color:#64748b;">আনসাবস্ক্রাইব করুন</a>
                </p>
                <p style="margin:8px 0 0;color:#94a3b8;font-size:11px;">&copy; ${new Date().getFullYear()} EOnlineBazar</p>
            </div>
        </div>
    `;
}

/**
 * Send newsletter welcome email after subscription.
 * Never throws — returns { delivered }.
 */
async function sendNewsletterWelcomeEmail({ to, name, unsubscribeUrl, storeUrl }) {
    return sendBrandedMail({
        to,
        from: `"EOnlineBazar Newsletter" <${DEFAULT_FROM}>`,
        subject: 'EOnlineBazar-এ স্বাগতম! 🎉',
        html: buildNewsletterWelcomeHtml({ name, unsubscribeUrl, storeUrl }),
        logLabel: 'Newsletter welcome email'
    });
}

/**
 * Send a newsletter campaign email to one recipient.
 * Never throws — returns { delivered }.
 */
async function sendNewsletterCampaignEmail({ to, subject, htmlContent, unsubscribeUrl }) {
    return sendBrandedMail({
        to,
        from: `"EOnlineBazar Newsletter" <${DEFAULT_FROM}>`,
        subject: String(subject || 'EOnlineBazar Newsletter'),
        html: buildNewsletterCampaignHtml({ htmlContent, unsubscribeUrl }),
        logLabel: 'Newsletter campaign email'
    });
}

function buildAbandonedCartHtml({ customerName, items = [], cartUrl, storeName = 'EonlineBazar' }) {
    const safeName = escapeHtml(customerName || 'Customer');
    const brand = escapeHtml(storeName);
    const safeUrl = escapeHtml(cartUrl || '/cart.html');

    const rows = (Array.isArray(items) ? items : []).slice(0, 8).map((item) => {
        const name = escapeHtml(item.name || 'Product');
        const qty = Math.max(1, Number(item.quantity) || 1);
        const price = formatMoneyBdt(Number(item.price || 0) * qty);
        return `
            <tr>
                <td style="padding:12px;border-bottom:1px solid #e2e8f0;">${name}</td>
                <td style="padding:12px;border-bottom:1px solid #e2e8f0;text-align:center;">${qty}</td>
                <td style="padding:12px;border-bottom:1px solid #e2e8f0;text-align:right;">${price}</td>
            </tr>`;
    }).join('');

    return `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#ffffff;">
            <div style="background:#0f172a;padding:24px;text-align:center;">
                <h2 style="color:#f8fafc;margin:0;font-size:24px;">${brand}</h2>
                <p style="color:#94a3b8;margin:8px 0 0;font-size:14px;">You left something behind 🛒</p>
            </div>
            <div style="padding:28px;">
                <p style="color:#111827;font-size:16px;margin:0 0 12px;">Dear <b>${safeName}</b>,</p>
                <p style="color:#374151;line-height:1.6;margin:0 0 20px;">Your cart is still waiting for you! Complete your purchase before these items sell out.</p>
                <table style="width:100%;border-collapse:collapse;font-size:14px;">
                    <thead>
                        <tr style="background:#f1f5f9;">
                            <th style="padding:12px;text-align:left;">Item</th>
                            <th style="padding:12px;text-align:center;">Qty</th>
                            <th style="padding:12px;text-align:right;">Total</th>
                        </tr>
                    </thead>
                    <tbody>${rows || '<tr><td colspan="3" style="padding:12px;color:#64748b;">Your saved items</td></tr>'}</tbody>
                </table>
                <div style="text-align:center;margin:28px 0 8px;">
                    <a href="${safeUrl.replace(/&amp;/g, '&')}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;">Complete Your Order</a>
                </div>
            </div>
            <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 28px;text-align:center;">
                <p style="margin:0;color:#64748b;font-size:12px;">&copy; ${new Date().getFullYear()} ${brand}. All rights reserved.</p>
            </div>
        </div>
    `;
}

/**
 * Send an abandoned-cart recovery email. Never throws — returns { delivered }.
 */
async function sendAbandonedCartEmail({ to, customerName, items, cartUrl, storeName = 'EonlineBazar' }) {
    return sendBrandedMail({
        to,
        from: `"${storeName}" <${DEFAULT_FROM}>`,
        subject: `${customerName ? `${customerName}, y` : 'Y'}ou left items in your cart — ${storeName}`,
        html: buildAbandonedCartHtml({ customerName, items, cartUrl, storeName }),
        logLabel: 'Abandoned cart email'
    });
}

async function sendReturnStatusEmail({ to, name, orderNumber, status, reason }) {
    const safeName = escapeHtml(String(name || 'Customer'));
    const safeOrder = escapeHtml(String(orderNumber || 'N/A'));
    const isRejected = String(status || '').toLowerCase() === 'rejected';
    const headline = isRejected ? 'Return Request Update' : 'Return Approved';
    const bodyText = isRejected
        ? `Your return request for order #${safeOrder} was not approved.${reason ? ` Reason: ${escapeHtml(String(reason))}` : ''}`
        : `Your return for order #${safeOrder} has been approved and your refund is being processed.`;

    return sendBrandedMail({
        to,
        from: `"EonlineBazar Support" <${DEFAULT_FROM}>`,
        subject: `${headline} — Order #${orderNumber || 'N/A'}`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
                <h2 style="color:#0f172a;">${headline}</h2>
                <p>Hi ${safeName},</p>
                <p>${bodyText}</p>
                <p style="color:#64748b;font-size:13px;">Questions? Reply to this email or contact EonlineBazar support.</p>
            </div>
        `,
        logLabel: 'Return status email'
    });
}

/**
 * Shipped order email with optional courier tracking details.
 */
async function sendOrderShippedEmail({
    to,
    name,
    orderNumber,
    trackingId,
    courierName,
    estimatedDelivery
}) {
    const safeName = escapeHtml(String(name || 'Customer'));
    const safeOrder = escapeHtml(String(orderNumber || 'N/A'));
    const safeTracking = escapeHtml(String(trackingId || '').trim());
    const safeCourier = escapeHtml(String(courierName || 'Courier').trim());
    const safeEta = escapeHtml(String(estimatedDelivery || '3-5 business days'));

    const trackingBlock = safeTracking
        ? `<p style="margin:12px 0;padding:12px;background:#eff6ff;border-radius:8px;border:1px solid #bfdbfe;">
                <strong>Tracking ID:</strong> ${safeTracking}<br>
                <strong>Courier:</strong> ${safeCourier}
           </p>`
        : `<p style="margin:12px 0;">Your parcel is on its way. We will share tracking details when available.</p>`;

    return sendBrandedMail({
        to,
        from: `"EonlineBazar" <${DEFAULT_FROM}>`,
        subject: `Order Shipped! — #${orderNumber || 'N/A'}`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
                <h2 style="color:#0f172a;">Your order has shipped 🚚</h2>
                <p>Hi ${safeName},</p>
                <p>Great news — order <strong>#${safeOrder}</strong> is on its way.</p>
                ${trackingBlock}
                <p style="color:#64748b;font-size:13px;">Estimated delivery: ${safeEta}</p>
            </div>
        `,
        logLabel: 'Order shipped email'
    });
}

async function sendTierUpgradeEmail({ to, customerName, tierLabel, message }) {
    if (!to) return { delivered: false, reason: 'missing_recipient' };

    const safeName = escapeHtml(customerName || 'Valued Customer');
    const safeTier = escapeHtml(tierLabel || 'Member');
    const safeMessage = escapeHtml(message || `You've been upgraded to ${tierLabel || 'a new tier'}!`);

    return sendBrandedMail({
        to,
        subject: `Congratulations! You're now a ${tierLabel || 'loyalty member'}`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
                <h2 style="color:#7c3aed;margin:0 0 12px;">🏅 Loyalty Tier Upgrade</h2>
                <p>Hi ${safeName},</p>
                <p>${safeMessage}</p>
                <p style="margin:20px 0;padding:14px 16px;background:#f5f3ff;border-radius:10px;">
                    <strong>Your new tier:</strong> ${safeTier}
                </p>
                <p style="color:#64748b;font-size:13px;">Thank you for shopping with EonlineBazar.</p>
            </div>`,
        logLabel: 'Tier upgrade email'
    });
}

async function sendWishlistNotificationEmail({ to, type, productName, price, previousPrice, productId }) {
    const name = String(productName || 'your wishlist item').trim();
    const formattedPrice = Number(price || 0).toLocaleString('en-BD');
    const isPriceDrop = type === 'price_drop';

    const subject = isPriceDrop
        ? `Good news! ${name} price dropped to ৳${formattedPrice}`
        : `${name} is back in stock!`;

    const bodyLine = isPriceDrop
        ? `Good news! <strong>${name}</strong> price dropped to <strong>৳${formattedPrice}</strong>${previousPrice ? ` (was ৳${Number(previousPrice).toLocaleString('en-BD')})` : ''}.`
        : `<strong>${name}</strong> is back in stock! Order now before it sells out again.`;

    return sendBrandedMail({
        to,
        from: `"EonlineBazar" <${DEFAULT_FROM}>`,
        subject: `${subject} - EonlineBazar`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
                <h2 style="color:#f97316;margin:0 0 12px;">Wishlist Update</h2>
                <p style="color:#334155;line-height:1.6;">${bodyLine}</p>
                <p style="margin-top:20px;">
                    <a href="https://eonlinebazar.com/product-details?id=${encodeURIComponent(productId || '')}"
                       style="background:#f97316;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block;">
                        View Product
                    </a>
                </p>
            </div>`,
        logLabel: 'Wishlist notification email'
    });
}

module.exports = {
    sendAdminOtpEmail,
    sendOrderConfirmationEmail,
    notifyOrderConfirmationEmail,
    sendReturnStatusEmail,
    sendOrderShippedEmail,
    sendInquiryReplyEmail,
    sendStockAlertEmail,
    sendNewsletterWelcomeEmail,
    sendNewsletterCampaignEmail,
    sendAbandonedCartEmail,
    sendTierUpgradeEmail,
    sendWishlistNotificationEmail,
    buildOrderConfirmationHtml,
    buildInquiryReplyHtml,
    buildNewsletterWelcomeHtml,
    buildNewsletterCampaignHtml,
    getTransportForPort,
    buildTransportForPort,
    // Backward-compat alias for older imports expecting createSmtpTransport().
    createSmtpTransport: () => getTransportForPort()
};
