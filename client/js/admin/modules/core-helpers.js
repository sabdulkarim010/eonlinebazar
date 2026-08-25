/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/core-helpers.js
 * Description: Shared formatters and product table price helpers.
 */
/* ==========================================================================
   CORE MODULE 2: GLOBAL VARIABLES & STATE MANAGEMENT (গ্লোবাল স্টেট ও ভেরিয়েবল)
   ========================================================================== */

// ২.১: ডম (DOM) এলিমেন্ট রেফারেন্স সমূহ

/* shared state: tableBody lives on window (admin-core) */

/* shared state: prodTableBody lives on window (admin-core) */

// ২.২: গ্লোবাল ডাটা স্টোরেজ (State)

/* shared state: allOrders lives on window (admin-core) */

/* shared state: allProducts lives on window (admin-core) */

/* shared state: globalProducts lives on window (admin-core) */

/* shared state: currentFilteredProducts lives on window (admin-core) */

/* shared state: allCustomers lives on window (admin-core) */

/* shared state: globalOrders lives on window (admin-core) */

/* shared state: currentInvoiceOrderId lives on window (admin-core) */

/* shared state: currentFilteredOrders lives on window (admin-core) */

// ২.৩: চার্ট এবং পেজিনেশন কন্ট্রোল ভেরিয়েবল

/* shared state: growthChartInstance lives on window (admin-core) */

/* shared state: salesTrendChartInstance lives on window (admin-core) */

/* shared state: topProductsChartInstance lives on window (admin-core) */

/* shared state: dashboardAnalytics lives on window (admin-core) */

/* shared state: salesTrendPeriod lives on window (admin-core) */

/* shared state: topProductsChartType lives on window (admin-core) */

/* shared state: currentPage lives on window (admin-core) */

/* shared state: PRODUCT_PAGINATION_STORAGE_KEY lives on window (admin-core) */

/* shared state: savedProductPageBeforeAction lives on window (admin-core) */

/* shared state: itemsPerPage lives on window (admin-core) */

/* shared state: currentOrderPage lives on window (admin-core) */

/* shared state: ordersPerPage lives on window (admin-core) */

/* shared state: currentOrderStatusFilter lives on window (admin-core) */

/* shared state: currentOrderSandboxFilter lives on window (admin-core) */

/* shared state: currentOrderDateFilter lives on window (admin-core) */

/* shared state: orderSearchDebounceTimer lives on window (admin-core) */

/* shared state: expandedOrderIds lives on window (admin-core) */

/* shared state: isStockAscending lives on window (admin-core) */

/* shared state: adminPlatformTimezone lives on window (admin-core) */

/* shared state: adminCurrencySymbol lives on window (admin-core) */

/* shared state: adminRewardSettings lives on window (admin-core) */

/** Format a monetary amount using the admin-configured currency symbol */
function formatAdminPrice(amount) {
    const sym = adminCurrencySymbol || '৳';
    const num = Number(amount);
    if (Number.isNaN(num)) return `${sym} 0`;
    return `${sym} ${num.toLocaleString()}`;
}

function getOrderGrandTotal(order) {
    return Number(order?.grandTotal ?? order?.totalAmount) || 0;
}

function cacheAdminRewardSettings(settings) {
    if (!settings) return;
    adminRewardSettings = {
        refundUndoWindowHours: Number(settings.refundUndoWindowHours ?? adminRewardSettings.refundUndoWindowHours ?? 72)
    };
}

function isWithinRefundUndoWindowClient(refundedAt, windowHours) {
    const hours = Number(windowHours);
    if (!refundedAt || hours <= 0) return false;

    const refunded = new Date(refundedAt);
    if (Number.isNaN(refunded.getTime())) return false;

    const elapsedMs = Date.now() - refunded.getTime();
    return elapsedMs >= 0 && elapsedMs <= hours * 60 * 60 * 1000;
}

function canUndoRefund(order) {
    if (!order) return false;

    const statusLower = String(order.status || '').toLowerCase();
    if (statusLower !== 'returned' && statusLower !== 'refunded') return false;

    const windowHours = adminRewardSettings.refundUndoWindowHours ?? 72;
    const refundedAt = order.refundedAt || order.updatedAt;
    return isWithinRefundUndoWindowClient(refundedAt, windowHours);
}

/** Format a signed profit/loss delta (e.g. +৳ 120) */
function formatAdminProfit(amount) {
    const sym = adminCurrencySymbol || '৳';
    const num = Number(amount) || 0;
    const sign = num >= 0 ? '+' : '-';
    return `${sign}${sym}${Math.abs(num).toLocaleString()}`;
}

/** Collect positive numeric values from variant rows (sell or buy price). */
function collectPositiveVariantPrices(product, field) {
    const variants = Array.isArray(product?.variants) ? product.variants : [];
    return variants
        .map(v => Number(v[field]))
        .filter(p => Number.isFinite(p) && p > 0);
}

/** Minimum positive variant price for a field, with product-level fallback. */
function getVariantMinPrice(product, field, fallback = 0) {
    const prices = collectPositiveVariantPrices(product, field);
    if (prices.length) return Math.min(...prices);
    const fb = Number(fallback) || 0;
    return fb > 0 ? fb : 0;
}

function isVariantMatrixProduct(product) {
    if (!product) return false;
    if (product.hasVariants === true && Array.isArray(product.variants) && product.variants.length > 0) {
        return true;
    }
    return productUsesVariantMatrix(product);
}

/** Table cell HTML for sell/buy columns (simple product vs variant matrix). */
function buildProductTablePriceCells(product) {
    const isVariant = isVariantMatrixProduct(product);

    if (isVariant) {
        const minSell = getVariantMinPrice(product, 'price', product.price);
        const minBuy = getVariantMinPrice(product, 'buyingPrice', 0);
        const sellPriceHtml = `<b>${formatAdminPrice(minSell)}</b>`;

        let buyPriceHtml;
        if (minBuy > 0) {
            const unitProfit = minSell - minBuy;
            const profitClass = unitProfit >= 0 ? 'profit-positive' : 'profit-negative';
            buyPriceHtml = `${formatAdminPrice(minBuy)} <span class="unit-profit ${profitClass}">${formatAdminProfit(unitProfit)}</span>`;
        } else {
            buyPriceHtml = `<span class="buy-price-empty" title="Set buying prices on variant matrix rows">—</span>`;
        }

        return { sellPriceHtml, buyPriceHtml };
    }

    const buyingPrice = Number(product.buyingPrice) || 0;
    const sellingPrice = Number(product.price) || 0;
    const sellPriceHtml = `<b>${formatAdminPrice(sellingPrice)}</b>`;

    let buyPriceHtml;
    if (buyingPrice > 0) {
        const unitProfit = sellingPrice - buyingPrice;
        const profitClass = unitProfit >= 0 ? 'profit-positive' : 'profit-negative';
        buyPriceHtml = `${formatAdminPrice(buyingPrice)} <span class="unit-profit ${profitClass}">${formatAdminProfit(unitProfit)}</span>`;
    } else {
        buyPriceHtml = `<span class="buy-price-empty" title="Set a buying price for accurate profit">—</span>`;
    }

    return { sellPriceHtml, buyPriceHtml };
}

/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    formatAdminPrice,
    getOrderGrandTotal,
    cacheAdminRewardSettings,
    isWithinRefundUndoWindowClient,
    canUndoRefund,
    formatAdminProfit,
    collectPositiveVariantPrices,
    getVariantMinPrice,
    isVariantMatrixProduct,
    buildProductTablePriceCells
});
