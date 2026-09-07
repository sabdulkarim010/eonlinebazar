/********************************************************************
 * Daily review reminder SMS for orders delivered ~3 days ago.
 ********************************************************************/

const cron = require('node-cron');
const Order = require('../models/order');
const { sendSms, isCustomerSmsEnabled } = require('../services/smsService');

const DEFAULT_CRON = '0 10 * * *';

function resolveOrderNumber(order) {
    return order.orderId || order.orderNumber || String(order._id || '').slice(-8).toUpperCase();
}

function resolveCustomerPhone(user, order) {
    return String(user?.phone || user?.mobile || order?.customerPhone || '').trim();
}

async function sendReviewReminders() {
    try {
        if (!(await isCustomerSmsEnabled())) {
            console.log('[ReviewReminder] Skipped — SMS notifications disabled in Master Settings');
            return { sent: 0, skipped: true };
        }

        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);

        const orders = await Order.find({
            status: { $regex: /^delivered$/i },
            updatedAt: { $gte: fourDaysAgo, $lte: threeDaysAgo },
            'notificationsSent.reviewReminder': { $ne: true }
        })
            .populate('user', 'name phone mobile email')
            .limit(50)
            .lean();

        let sentCount = 0;

        for (const order of orders) {
            const phone = resolveCustomerPhone(order.user, order);
            if (!phone) continue;

            const customerName = order.user?.name || order.customerName || 'there';
            const orderNumber = resolveOrderNumber(order);

            try {
                const result = await sendSms({
                    to: phone,
                    body: `[EonlineBazar] Hi ${customerName}! How was your order #${orderNumber}? Share your experience and earn 20 loyalty points! Visit: eonlinebazar.com/profile`,
                    context: 'REVIEW REMINDER'
                });

                if (result.delivered) {
                    await Order.findByIdAndUpdate(order._id, {
                        $set: { 'notificationsSent.reviewReminder': true }
                    });
                    sentCount += 1;
                }
            } catch (err) {
                console.warn('[ReviewReminder] Failed for order:', order._id, err.message);
            }
        }

        console.log(`[ReviewReminder] Sent ${sentCount} reminder(s) (${orders.length} candidate order(s))`);
        return { sent: sentCount, candidates: orders.length };
    } catch (err) {
        console.error('[ReviewReminder] Job failed:', err.message);
        return { sent: 0, error: err.message };
    }
}

let cronTask = null;

function startReviewReminderCron() {
    if (process.env.REVIEW_REMINDER_ENABLED === 'false') {
        console.log('[ReviewReminder] Cron disabled (REVIEW_REMINDER_ENABLED=false)');
        return;
    }

    const schedule = String(process.env.REVIEW_REMINDER_CRON || DEFAULT_CRON).trim() || DEFAULT_CRON;
    const expression = cron.validate(schedule) ? schedule : DEFAULT_CRON;

    if (!cron.validate(schedule)) {
        console.warn(`[ReviewReminder] Invalid cron "${schedule}" — using default ${DEFAULT_CRON}`);
    }

    if (cronTask) {
        cronTask.stop();
    }

    cronTask = cron.schedule(expression, () => {
        sendReviewReminders().catch((err) => {
            console.error('[ReviewReminder] Cron error:', err.message);
        });
    });

    console.log(`[ReviewReminder] Cron scheduled: "${expression}"`);
}

module.exports = {
    sendReviewReminders,
    startReviewReminderCron
};
