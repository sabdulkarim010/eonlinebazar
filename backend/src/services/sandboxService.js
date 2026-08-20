/********************************************************************
 * Project: EonlineBazar
 * File: sandboxService.js
 * Location: services/sandboxService.js
 * Description: Global sandbox mode — tags new orders/users as test
 * data when active; supports safe reset of test vs real order data.
 ********************************************************************/

const Settings = require('../models/Settings');

const SETTINGS_KEY = 'global';
const CACHE_TTL_MS = 30000;

let sandboxModeCache = false;
let lastCheck = 0;

async function isSandboxMode() {
    if (Date.now() - lastCheck < CACHE_TTL_MS) return sandboxModeCache;

    try {
        const settings = await Settings.findOne({ key: SETTINGS_KEY }).select('sandboxMode').lean();
        sandboxModeCache = settings?.sandboxMode === true;
        lastCheck = Date.now();
    } catch (err) {
        console.warn('[Sandbox] Could not read sandbox mode:', err.message);
    }

    return sandboxModeCache;
}

async function setSandboxMode(enabled) {
    const boolVal = !!enabled;
    sandboxModeCache = boolVal;
    lastCheck = Date.now();

    await Settings.findOneAndUpdate(
        { key: SETTINGS_KEY },
        { $set: { sandboxMode: boolVal } },
        { upsert: true, new: true }
    );

    return boolVal;
}

async function resetSandboxData() {
    const Order = require('../models/order');
    const User = require('../models/user');
    const Review = require('../models/review');

    const [ordersDeleted, usersDeleted, reviewsDeleted] = await Promise.all([
        Order.deleteMany({ isSandbox: true }),
        User.deleteMany({ isSandbox: true }),
        Review.deleteMany({ isSandbox: true })
    ]);

    return {
        ordersDeleted: ordersDeleted.deletedCount,
        usersDeleted: usersDeleted.deletedCount,
        reviewsDeleted: reviewsDeleted.deletedCount
    };
}

async function resetRealData(confirmationKey) {
    const REQUIRED_KEY = process.env.REAL_DATA_RESET_KEY;
    if (!REQUIRED_KEY || confirmationKey !== REQUIRED_KEY) {
        throw new Error('Invalid confirmation key for real data reset');
    }

    const Order = require('../models/order');

    const ordersDeleted = await Order.deleteMany({ isSandbox: false });

    return { ordersDeleted: ordersDeleted.deletedCount };
}

async function getSandboxStats() {
    const Order = require('../models/order');

    const [sandboxOrderCount, realOrderCount] = await Promise.all([
        Order.countDocuments({ isSandbox: true }),
        Order.countDocuments({ isSandbox: false })
    ]);

    return { sandboxOrderCount, realOrderCount };
}

module.exports = {
    isSandboxMode,
    setSandboxMode,
    resetSandboxData,
    resetRealData,
    getSandboxStats
};
