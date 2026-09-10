/********************************************************************
 * Project: EonlineBazar — CRM Automation
 * File: abandonedCartJob.js
 * Location: backend/src/jobs/abandonedCartJob.js
 * Description: Daily abandoned-cart recovery. Finds carts idle for 24h+
 * that still hold items and have never been notified, then dispatches a
 * recovery email + SMS and stamps abandonedNotifiedAt so we never repeat.
 * Mirrors the cron pattern in jobs/reviewReminderJob.js.
 ********************************************************************/

const cron = require('node-cron');
const Cart = require('../models/cart');
const { sendAbandonedCartEmail } = require('../services/mailer');
const { sendSms, isCustomerSmsEnabled } = require('../services/smsService');

// Every day at 10:00 AM (server time) — same cadence as the review reminder.
const DEFAULT_CRON = '0 10 * * *';
const ABANDON_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const MAX_CARTS_PER_RUN = 200;

function getStorePublicUrl() {
    return String(process.env.STORE_PUBLIC_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '');
}

function buildCartUrl() {
    const base = getStorePublicUrl();
    return base ? `${base}/cart.html` : '/cart.html';
}

function resolveCustomerPhone(user) {
    return String(user?.phone || user?.mobile || '').trim();
}

function buildRecoverySms(customerName, cartUrl) {
    const name = customerName || 'there';
    return `[EonlineBazar] Hi ${name}! You still have items waiting in your cart. Complete your order before they sell out: ${cartUrl}`;
}

async function processAbandonedCarts() {
    try {
        const cutoff = new Date(Date.now() - ABANDON_THRESHOLD_MS);
        const smsEnabled = await isCustomerSmsEnabled();
        const cartUrl = buildCartUrl();

        const carts = await Cart.find({
            lastActivityAt: { $lt: cutoff },
            abandonedNotifiedAt: null,
            'items.0': { $exists: true }
        })
            .populate('user', 'firstName lastName name email phone mobile isDeleted')
            .populate('userId', 'firstName lastName name email phone mobile isDeleted')
            .limit(MAX_CARTS_PER_RUN)
            .lean(false);

        let notified = 0;
        let emailsSent = 0;
        let smsSent = 0;

        for (const cart of carts) {
            const user = cart.userId && typeof cart.userId === 'object' ? cart.userId : cart.user;
            if (!user || user.isDeleted) continue;
            if (!Array.isArray(cart.items) || cart.items.length === 0) continue;

            const customerName = String(user.name || user.firstName || '').trim();
            const email = String(user.email || '').trim();
            const phone = resolveCustomerPhone(user);

            let anyDelivered = false;

            if (email) {
                try {
                    const emailResult = await sendAbandonedCartEmail({
                        to: email,
                        customerName,
                        items: cart.items,
                        cartUrl
                    });
                    if (emailResult.delivered) {
                        emailsSent += 1;
                        anyDelivered = true;
                    }
                } catch (err) {
                    console.warn('[AbandonedCart] Email failed for cart:', String(cart._id), err.message);
                }
            }

            if (phone && smsEnabled) {
                try {
                    const smsResult = await sendSms({
                        to: phone,
                        body: buildRecoverySms(customerName, cartUrl),
                        context: 'ABANDONED CART'
                    });
                    if (smsResult.delivered) {
                        smsSent += 1;
                        anyDelivered = true;
                    }
                } catch (err) {
                    console.warn('[AbandonedCart] SMS failed for cart:', String(cart._id), err.message);
                }
            }

            // Stamp the flag even when both channels are unavailable so the same
            // stale cart is not reprocessed every day; a fresh cart edit re-arms it.
            await Cart.updateOne(
                { _id: cart._id },
                { $set: { abandonedNotifiedAt: new Date() } }
            );
            notified += 1;

            void anyDelivered;
        }

        console.log(`[AbandonedCart] Processed ${notified} cart(s) — ${emailsSent} email(s), ${smsSent} SMS (${carts.length} candidate(s))`);
        return { notified, emailsSent, smsSent, candidates: carts.length };
    } catch (err) {
        console.error('[AbandonedCart] Job failed:', err.message);
        return { notified: 0, error: err.message };
    }
}

let cronTask = null;

function startAbandonedCartCron() {
    if (process.env.ABANDONED_CART_ENABLED === 'false') {
        console.log('[AbandonedCart] Cron disabled (ABANDONED_CART_ENABLED=false)');
        return;
    }

    const schedule = String(process.env.ABANDONED_CART_CRON || DEFAULT_CRON).trim() || DEFAULT_CRON;
    const expression = cron.validate(schedule) ? schedule : DEFAULT_CRON;

    if (!cron.validate(schedule)) {
        console.warn(`[AbandonedCart] Invalid cron "${schedule}" — using default ${DEFAULT_CRON}`);
    }

    if (cronTask) {
        cronTask.stop();
    }

    cronTask = cron.schedule(expression, () => {
        processAbandonedCarts().catch((err) => {
            console.error('[AbandonedCart] Cron error:', err.message);
        });
    });

    console.log(`[AbandonedCart] Cron scheduled: "${expression}"`);
}

module.exports = {
    processAbandonedCarts,
    startAbandonedCartCron,
    ABANDON_THRESHOLD_MS
};
