/********************************************************************
 * Daily wishlist notifications — price drops and back-in-stock emails.
 ********************************************************************/

const cron = require('node-cron');
const Product = require('../models/product');
const User = require('../models/user');
const { sendWishlistNotificationEmail } = require('../services/mailer');
const { notifyAdminsWithPermission } = require('../services/notificationService');

const DEFAULT_CRON = '0 10 * * *';
const PRICE_DROP_THRESHOLD = 0.1;
const LOOKBACK_MS = 24 * 60 * 60 * 1000;

async function sendWishlistNotifications() {
    try {
        const since = new Date(Date.now() - LOOKBACK_MS);
        let emailsSent = 0;

        const priceDropProducts = await Product.find({
            previousPrice: { $ne: null, $gt: 0 },
            updatedAt: { $gte: since }
        }).select('_id productId name price previousPrice stock image icon').lean();

        for (const product of priceDropProducts) {
            const prev = Number(product.previousPrice);
            const current = Number(product.price);
            if (!Number.isFinite(prev) || !Number.isFinite(current) || prev <= 0) continue;
            if (current >= prev * (1 - PRICE_DROP_THRESHOLD)) continue;

            const productKey = String(product._id);
            // eslint-disable-next-line no-await-in-loop
            const users = await User.find({
                'wishlist.productId': productKey,
                email: { $exists: true, $ne: '' }
            }).select('email name wishlist').lean();

            for (const user of users) {
                const item = (user.wishlist || []).find((w) => String(w.productId) === productKey);
                if (!item) continue;
                if (item.priceDropNotifiedAt && new Date(item.priceDropNotifiedAt) >= since) continue;

                // eslint-disable-next-line no-await-in-loop
                const result = await sendWishlistNotificationEmail({
                    to: user.email,
                    type: 'price_drop',
                    productName: product.name || item.name || 'a wishlist item',
                    price: current,
                    previousPrice: prev,
                    productId: product.productId || productKey
                });

                if (result.delivered) {
                    emailsSent += 1;
                    // eslint-disable-next-line no-await-in-loop
                    await User.updateOne(
                        { _id: user._id, 'wishlist.productId': productKey },
                        { $set: { 'wishlist.$.priceDropNotifiedAt': new Date(), 'wishlist.$.price': current } }
                    );
                }
            }
        }

        const restockedProducts = await Product.find({
            restockedAt: { $gte: since },
            stock: { $gt: 0 }
        }).select('_id productId name price stock image icon').lean();

        for (const product of restockedProducts) {
            const productKey = String(product._id);
            // eslint-disable-next-line no-await-in-loop
            const users = await User.find({
                'wishlist.productId': productKey,
                email: { $exists: true, $ne: '' }
            }).select('email name wishlist').lean();

            for (const user of users) {
                const item = (user.wishlist || []).find((w) => String(w.productId) === productKey);
                if (!item) continue;
                if (item.backInStockNotifiedAt && new Date(item.backInStockNotifiedAt) >= since) continue;

                // eslint-disable-next-line no-await-in-loop
                const result = await sendWishlistNotificationEmail({
                    to: user.email,
                    type: 'back_in_stock',
                    productName: product.name || item.name || 'a wishlist item',
                    price: Number(product.price) || 0,
                    productId: product.productId || productKey
                });

                if (result.delivered) {
                    emailsSent += 1;
                    // eslint-disable-next-line no-await-in-loop
                    await User.updateOne(
                        { _id: user._id, 'wishlist.productId': productKey },
                        { $set: { 'wishlist.$.backInStockNotifiedAt': new Date() } }
                    );
                }
            }
        }

        if (emailsSent > 0) {
            await notifyAdminsWithPermission(
                'manage_marketing',
                'system',
                'Wishlist notifications sent',
                `Wishlist notifications sent: ${emailsSent} email(s)`,
                '/admin#view-newsletter-campaigns'
            );
        }

        console.log(`[WishlistNotify] Sent ${emailsSent} email(s)`);
        return { sent: emailsSent };
    } catch (err) {
        console.error('[WishlistNotify] Job failed:', err.message);
        return { sent: 0, error: err.message };
    }
}

let cronTask = null;

function startWishlistNotificationCron() {
    if (process.env.WISHLIST_NOTIFY_ENABLED === 'false') {
        console.log('[WishlistNotify] Cron disabled (WISHLIST_NOTIFY_ENABLED=false)');
        return;
    }

    const schedule = String(process.env.WISHLIST_NOTIFY_CRON || DEFAULT_CRON).trim() || DEFAULT_CRON;
    const expression = cron.validate(schedule) ? schedule : DEFAULT_CRON;

    if (cronTask) cronTask.stop();

    cronTask = cron.schedule(expression, () => {
        sendWishlistNotifications().catch((err) => {
            console.error('[WishlistNotify] Cron error:', err.message);
        });
    });

    console.log(`[WishlistNotify] Cron scheduled: "${expression}"`);
}

module.exports = {
    sendWishlistNotifications,
    startWishlistNotificationCron
};
