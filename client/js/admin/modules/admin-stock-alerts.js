/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/admin-stock-alerts.js
 * Description: Client-side pagination for dashboard inventory alerts.
 */

import '../admin-core.js';

let stockAlertPg = null;
let stockAlertsCache = [];

function ensureStockAlertPagination() {
    if (typeof AdminPagination === 'undefined') return null;
    if (!stockAlertPg) {
        stockAlertPg = AdminPagination.ensure('stockAlertPaginationContainer', {
            defaultLimit: 10,
            onPageChange: (page, limit) => renderStockAlertsPage(page, limit)
        });
        window.stockAlertPg = stockAlertPg;
    }
    return stockAlertPg;
}

function buildStockAlertsList(alerts) {
    return alerts.map((product) => {
        const isOut = product.alertType === 'out';
        const badgeClass = isOut ? 'out' : 'low';
        const badgeText = isOut
            ? '⚠️ Out of Stock'
            : `🔥 Low Stock: ${product.stock} left`;
        const itemClass = isOut ? 'out-of-stock' : 'low-stock';
        const thumb = product.image
            ? `<img src="${product.image}" class="inventory-alert-thumb" alt="" onerror="this.outerHTML='<span class=\\'inventory-alert-thumb\\'>${product.icon || '📦'}</span>'">`
            : `<span class="inventory-alert-thumb">${product.icon || '📦'}</span>`;

        return `
            <div class="inventory-alert-item ${itemClass}">
                <div class="inventory-alert-info">
                    ${thumb}
                    <div class="inventory-alert-meta">
                        <strong>${product.name || 'Unnamed Product'}</strong>
                        <span>${product.productId || 'N/A'} · ${product.category || 'General'}</span>
                    </div>
                </div>
                <div class="inventory-alert-actions">
                    <span class="inventory-alert-badge ${badgeClass}">${badgeText}</span>
                    <button type="button" class="btn-update-stock" onclick="quickUpdateStock('${product._id}')">
                        <i class="fa-solid fa-pen"></i> Update Stock
                    </button>
                </div>
            </div>`;
    }).join('');
}

function renderStockAlertItems(alerts) {
    const container = document.getElementById('inventoryAlertsList');
    if (!container) return;

    if (!alerts.length) {
        container.innerHTML = `
            <div class="inventory-alert-empty">
                <i class="fa-solid fa-circle-check"></i>
                <p>All products are well stocked.</p>
            </div>`;
        return;
    }

    container.innerHTML = buildStockAlertsList(alerts);
}

function renderStockAlertsPage(page, limit) {
    const pg = ensureStockAlertPagination();
    const effectivePage = page ?? pg?.currentPage ?? 1;
    const effectiveLimit = limit ?? pg?.currentLimit ?? 10;
    const start = (effectivePage - 1) * effectiveLimit;
    const slice = stockAlertsCache.slice(start, start + effectiveLimit);

    if (pg) {
        pg.currentPage = effectivePage;
        pg.currentLimit = effectiveLimit;
        pg.setTotal(stockAlertsCache.length);
    }

    renderStockAlertItems(slice);
}

function renderInventoryAlerts(inventoryAlerts) {
    const container = document.getElementById('inventoryAlertsList');
    const countLabel = document.getElementById('inventoryAlertCount');
    if (!container) return;

    const outOfStock = inventoryAlerts?.outOfStock || [];
    const lowStock = inventoryAlerts?.lowStock || [];
    stockAlertsCache = [
        ...outOfStock.map((p) => ({ ...p, alertType: 'out' })),
        ...lowStock.map((p) => ({ ...p, alertType: 'low' }))
    ];

    if (countLabel) {
        countLabel.textContent = stockAlertsCache.length === 0
            ? 'All clear'
            : `${stockAlertsCache.length} alert${stockAlertsCache.length === 1 ? '' : 's'}`;
    }

    ensureStockAlertPagination();

    if (stockAlertsCache.length === 0) {
        renderStockAlertItems([]);
        AdminPagination.render('stockAlertPaginationContainer', {
            total: 0,
            page: 1,
            limit: stockAlertPg?.currentLimit || 10,
            onPageChange: (p, l) => renderStockAlertsPage(p, l)
        });
        return;
    }

    if (stockAlertPg) {
        stockAlertPg.stayOnPage();
    } else {
        renderStockAlertsPage(1, 10);
    }
}

window.renderInventoryAlerts = renderInventoryAlerts;

export {
    ensureStockAlertPagination,
    renderInventoryAlerts,
    renderStockAlertsPage
};
