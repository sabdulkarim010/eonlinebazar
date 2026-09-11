/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/orders-pos.js
 * Description: Manual POS / walk-in / phone order entry.
 */
/* Dependencies: token, manualOrderCatalog, manualOrderLines, showToast, showAdminSuccess, fetchLiveOrders (window) */
/* Exposes: window.addManualOrderLine, window.buildManualLinePayload, window.closeManualOrderModal, window.formatManualMoney, window.getManualOrderProductId, window.getSelectedManualProduct, window.loadManualOrderCatalog, window.openManualOrderModal, window.populateManualProductSelect, window.populateManualVariantSelect, window.removeManualOrderLine, window.renderManualOrderLines, window.resetManualOrderForm, window.setupManualOrderEngine, window.submitManualOrder, window.updateManualOrderTotals, window.updateManualVariantStockHint */

import '../admin-core.js';

const LIVE_ORDERS_TABLE_COLS = window.LIVE_ORDERS_TABLE_COLS;
const ORDER_COURIER_SEND_CLASSES = window.ORDER_COURIER_SEND_CLASSES;
const ORDER_COURIER_SENT_CLASSES = window.ORDER_COURIER_SENT_CLASSES;
const COURIER_TRACKING_BASE_URLS = window.COURIER_TRACKING_BASE_URLS;
const COURIER_PROVIDER_LABELS = window.COURIER_PROVIDER_LABELS;
const COURIER_BLOCKED_STATUSES = window.COURIER_BLOCKED_STATUSES;

/* ==========================================================================
   MANUAL POS / PHONE ORDER ENGINE
   ========================================================================== */

/* shared state: manualOrderCatalog lives on window (admin-core) */

/* shared state: manualOrderLines lives on window (admin-core) */

function getManualOrderProductId(product) {
    return String(product?._id || product?.productId || product?.id || '');
}

function formatManualMoney(value) {
    return `৳${Number(value || 0).toLocaleString('en-US')}`;
}

function resetManualOrderForm() {
    manualOrderLines = [];
    const form = document.getElementById('manualOrderForm');
    if (form) form.reset();
    document.getElementById('manualItemQuantity').value = '1';
    document.getElementById('manualDiscountAmount').value = '0';
    document.getElementById('manualShippingFee').value = '0';
    document.getElementById('manualProductSearch').value = '';
    populateManualProductSelect('');
    renderManualOrderLines();
    updateManualOrderTotals();
    updateManualVariantStockHint();
}

window.openManualOrderModal = async function openManualOrderModal() {
    const modal = document.getElementById('manualOrderModal');
    if (!modal) return;

    resetManualOrderForm();
    modal.style.display = 'flex';

    if (manualOrderCatalog.length === 0) {
        await loadManualOrderCatalog();
    } else {
        populateManualProductSelect('');
    }

    loadPosQuickGrid();

    const barcodeInput = document.getElementById('manualBarcodeInput');
    if (barcodeInput) barcodeInput.focus();
};

window.closeManualOrderModal = function closeManualOrderModal() {
    const modal = document.getElementById('manualOrderModal');
    if (modal) modal.style.display = 'none';
};

async function loadManualOrderCatalog() {
    const productSelect = document.getElementById('manualProductSelect');
    if (productSelect) {
        productSelect.innerHTML = '<option value="">Loading products…</option>';
    }

    try {
        const res = await fetch('/api/products?limit=500', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        manualOrderCatalog = Array.isArray(data)
            ? data
            : (Array.isArray(data?.products) ? data.products
                : (Array.isArray(data?.data) ? data.data : []));
        populateManualProductSelect(document.getElementById('manualProductSearch')?.value || '');
    } catch (err) {
        console.error('Manual order catalog load failed:', err);
        manualOrderCatalog = [];
        if (productSelect) {
            productSelect.innerHTML = '<option value="">Failed to load products</option>';
        }
        showToast('Could not load product catalog for manual orders.', 'error');
    }
}

function populateManualProductSelect(searchTerm = '') {
    const productSelect = document.getElementById('manualProductSelect');
    if (!productSelect) return;

    const query = String(searchTerm || '').trim().toLowerCase();
    const filtered = manualOrderCatalog.filter((product) => {
        if (!query) return true;
        const name = String(product.name || '').toLowerCase();
        const category = String(product.category || '').toLowerCase();
        const pid = getManualOrderProductId(product).toLowerCase();
        return name.includes(query) || category.includes(query) || pid.includes(query);
    });

    productSelect.innerHTML = '<option value="">— Select product —</option>';
    filtered.forEach((product) => {
        const option = document.createElement('option');
        option.value = getManualOrderProductId(product);
        option.textContent = product.name || 'Unnamed product';
        productSelect.appendChild(option);
    });

    populateManualVariantSelect();
}

function getSelectedManualProduct() {
    const productId = document.getElementById('manualProductSelect')?.value || '';
    if (!productId) return null;
    return manualOrderCatalog.find((p) => getManualOrderProductId(p) === productId) || null;
}

function populateManualVariantSelect() {
    const variantSelect = document.getElementById('manualVariantSelect');
    const product = getSelectedManualProduct();
    if (!variantSelect) return;

    variantSelect.innerHTML = '';
    variantSelect.disabled = true;

    if (!product) {
        variantSelect.innerHTML = '<option value="">— Default (no variant) —</option>';
        updateManualVariantStockHint();
        return;
    }

    const variants = Array.isArray(product.variants) ? product.variants : [];
    if (variants.length === 0) {
        variantSelect.innerHTML = '<option value="">— Default (no variant) —</option>';
        variantSelect.disabled = true;
        updateManualVariantStockHint();
        return;
    }

    variantSelect.disabled = false;
    variantSelect.innerHTML = '<option value="">— Select variant —</option>';
    variants.forEach((variant, index) => {
        const attrs = getVariantAttributesFromDoc(variant);
        const label = resolveCombinationLabel({ name: variant.name, attributes: attrs, sku: variant.sku }) || `Row ${index + 1}`;
        const stock = Number(variant.stock) || 0;
        const price = Number(variant.price ?? product.price) || 0;
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = `${label} · ${formatManualMoney(price)} · Stock: ${stock}`;
        option.dataset.variantIndex = String(index);
        variantSelect.appendChild(option);
    });

    updateManualVariantStockHint();
}

function updateManualVariantStockHint() {
    const hint = document.getElementById('manualVariantStockHint');
    if (!hint) return;

    const product = getSelectedManualProduct();
    if (!product) {
        hint.textContent = 'Select a product to see price and stock.';
        return;
    }

    const variants = Array.isArray(product.variants) ? product.variants : [];
    const variantSelect = document.getElementById('manualVariantSelect');
    const variantIndex = variantSelect && !variantSelect.disabled
        ? Number(variantSelect.value)
        : -1;

    if (variants.length > 0 && (Number.isNaN(variantIndex) || variantIndex < 0)) {
        hint.textContent = 'This product has variants — pick Size/Color before adding.';
        return;
    }

    let price = Number(product.price) || 0;
    let stock = Number(product.stockQuantity ?? product.stock) || 0;
    let label = 'Default';

    if (variantIndex >= 0 && variants[variantIndex]) {
        const variant = variants[variantIndex];
        const attrs = getVariantAttributesFromDoc(variant);
        label = formatCombinationLabel(attrs) || label;
        price = Number(variant.price ?? product.price) || 0;
        stock = Number(variant.stock) || 0;
    }

    hint.textContent = `${product.name} · ${label} · Price: ${formatManualMoney(price)} · Available stock: ${stock}`;
}

function buildManualLinePayload(product, variantIndex, quantity) {
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const payload = {
        productId: getManualOrderProductId(product),
        id: getManualOrderProductId(product),
        name: product.name,
        quantity
    };

    if (variantIndex >= 0 && variants[variantIndex]) {
        const variant = variants[variantIndex];
        const attrs = getVariantAttributesFromDoc(variant);
        payload.variantSku = variant.sku || '';
        payload.variantId = variant.sku || combinationKey(attrs);
        payload.variantAttribute = Object.entries(attrs).map(([k, v]) => `${k}:${v}`).join(',');
        payload.variantValue = Object.values(attrs).join(', ');
        payload.variantLabel = formatCombinationLabel(attrs);
        payload.price = Number(variant.price ?? product.price) || 0;
    } else {
        payload.price = Number(product.price) || 0;
    }

    return payload;
}

function renderManualOrderLines() {
    const tbody = document.getElementById('manualOrderLinesBody');
    if (!tbody) return;

    if (!manualOrderLines.length) {
        tbody.innerHTML = '<tr class="manual-order-empty-row"><td colspan="6">No items added yet.</td></tr>';
        return;
    }

    tbody.innerHTML = manualOrderLines.map((line, index) => {
        const lineTotal = (Number(line.price) || 0) * (Number(line.quantity) || 0);
        return `<tr>
            <td>${escHtml(line.name || 'Product')}</td>
            <td>${escHtml(line.variantLabel || 'Default')}</td>
            <td>${formatManualMoney(line.price)}</td>
            <td>${line.quantity}</td>
            <td>${formatManualMoney(lineTotal)}</td>
            <td><button type="button" class="manual-order-remove-btn" onclick="removeManualOrderLine(${index})" title="Remove line"><i class="fa-solid fa-trash-can"></i></button></td>
        </tr>`;
    }).join('');
}

window.removeManualOrderLine = function removeManualOrderLine(index) {
    manualOrderLines.splice(index, 1);
    renderManualOrderLines();
    updateManualOrderTotals();
};

function updateManualOrderTotals() {
    const preview = document.getElementById('manualOrderTotalsPreview');
    if (!preview) return;

    const subtotal = manualOrderLines.reduce(
        (sum, line) => sum + ((Number(line.price) || 0) * (Number(line.quantity) || 0)),
        0
    );
    const discount = Math.max(0, Number(document.getElementById('manualDiscountAmount')?.value) || 0);
    const shipping = Math.max(0, Number(document.getElementById('manualShippingFee')?.value) || 0);
    const grandTotal = Math.max(0, subtotal - discount + shipping);

    preview.innerHTML = `Subtotal: ${formatManualMoney(subtotal)} · Discount: ${formatManualMoney(discount)} · Shipping: ${formatManualMoney(shipping)} · <strong>Grand Total: ${formatManualMoney(grandTotal)}</strong>`;
}

/**
 * Shared cart-add core used by the manual picker, the barcode scanner, and the
 * quick-add grid. Runs the stock guard, merges into an existing line's variant,
 * and re-renders. Returns a result object instead of toasting so each caller can
 * decide how to surface the outcome.
 * @returns {{ ok: boolean, message?: string, level?: string }}
 */
function addProductToCart(product, variantIndex, quantity) {
    if (!product) return { ok: false, message: 'Product not found.', level: 'warning' };

    const qty = Math.max(1, Number(quantity) || 1);
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const idx = variants.length > 0 ? Number(variantIndex) : -1;

    if (variants.length > 0 && (Number.isNaN(idx) || idx < 0)) {
        return { ok: false, message: 'This product has variants — pick Size/Color before adding.', level: 'warning' };
    }

    let availableStock = Number(product.stockQuantity ?? product.stock) || 0;
    if (idx >= 0 && variants[idx]) {
        availableStock = Number(variants[idx].stock) || 0;
    }

    const existingQty = manualOrderLines
        .filter((line) => line.productId === getManualOrderProductId(product)
            && String(line.variantIndex) === String(idx))
        .reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);

    if (existingQty + qty > availableStock) {
        return { ok: false, message: `Insufficient stock. Available: ${availableStock}, already in cart: ${existingQty}.`, level: 'error' };
    }

    const linePayload = buildManualLinePayload(product, idx, qty);
    linePayload.variantIndex = idx;
    manualOrderLines.push(linePayload);

    renderManualOrderLines();
    updateManualOrderTotals();
    return { ok: true, message: `${product.name} × ${qty} added.`, level: 'success' };
}

function addManualOrderLine() {
    const product = getSelectedManualProduct();
    const quantity = Math.max(1, Number(document.getElementById('manualItemQuantity')?.value) || 1);

    if (!product) {
        return showToast('Select a product first.', 'warning');
    }

    const variants = Array.isArray(product.variants) ? product.variants : [];
    const variantSelect = document.getElementById('manualVariantSelect');
    const variantIndex = variants.length > 0 ? Number(variantSelect?.value) : -1;

    const result = addProductToCart(product, variantIndex, quantity);
    if (!result.ok) {
        return showToast(result.message, result.level || 'warning');
    }

    document.getElementById('manualItemQuantity').value = '1';
}

/* ==========================================================================
   POS · BARCODE / SKU SCAN-TO-CART
   ========================================================================== */

/**
 * Resolve a scanned code to a product + variant in the loaded catalog.
 * Matches product _id, product-level sku, any variant sku, then exact name.
 * @param {string} code
 * @returns {{ product: object, variantIndex: number } | null}
 */
function findProductByCode(code) {
    const needle = String(code || '').trim().toLowerCase();
    if (!needle) return null;

    for (const product of manualOrderCatalog) {
        const pid = getManualOrderProductId(product).toLowerCase();
        const psku = String(product.sku || '').toLowerCase();
        if (pid === needle || (psku && psku === needle)) {
            return { product, variantIndex: -1 };
        }

        const variants = Array.isArray(product.variants) ? product.variants : [];
        const vIdx = variants.findIndex((v) => String(v.sku || '').toLowerCase() === needle && needle);
        if (vIdx !== -1) {
            return { product, variantIndex: vIdx };
        }
    }

    // Fall back to an exact name match (last resort for typed lookups).
    const byName = manualOrderCatalog.find((p) => String(p.name || '').trim().toLowerCase() === needle);
    return byName ? { product: byName, variantIndex: -1 } : null;
}

function showBarcodeFeedback(message, level = 'info') {
    const el = document.getElementById('manualBarcodeFeedback');
    if (!el) return;
    el.textContent = message;
    el.dataset.level = level;
    el.hidden = false;
}

async function handleBarcodeScan() {
    const input = document.getElementById('manualBarcodeInput');
    const qtyInput = document.getElementById('manualBarcodeQty');
    if (!input) return;

    const code = input.value.trim();
    if (!code) return;

    const quantity = Math.max(1, Number(qtyInput?.value) || 1);

    // Make sure the catalog is loaded before resolving the code.
    if (!manualOrderCatalog.length) {
        await loadManualOrderCatalog();
    }

    let match = findProductByCode(code);

    // If nothing local matched, try the products API as a fallback lookup.
    if (!match) {
        try {
            const res = await fetch(`/api/products?limit=5&q=${encodeURIComponent(code)}&search=${encodeURIComponent(code)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            const rows = Array.isArray(data) ? data
                : (Array.isArray(data?.products) ? data.products
                    : (Array.isArray(data?.data) ? data.data : []));
            if (rows.length) {
                // Cache newly found products so variant/stock data is available.
                rows.forEach((p) => {
                    if (!manualOrderCatalog.some((c) => getManualOrderProductId(c) === getManualOrderProductId(p))) {
                        manualOrderCatalog.push(p);
                    }
                });
                match = findProductByCode(code) || { product: rows[0], variantIndex: -1 };
            }
        } catch (err) {
            console.error('Barcode API lookup failed:', err);
        }
    }

    if (!match) {
        showBarcodeFeedback(`No product found for "${code}".`, 'error');
        showToast(`No product found for "${code}".`, 'error');
        input.select();
        return;
    }

    const { product } = match;
    let { variantIndex } = match;
    const variants = Array.isArray(product.variants) ? product.variants : [];

    // If the product has variants but the code didn't identify one, guide the
    // operator to the manual picker rather than guessing.
    if (variants.length > 0 && variantIndex < 0) {
        const productId = getManualOrderProductId(product);
        const productSelect = document.getElementById('manualProductSelect');
        if (productSelect) {
            populateManualProductSelect('');
            productSelect.value = productId;
            populateManualVariantSelect();
        }
        showBarcodeFeedback(`${product.name} has variants — pick Size/Color, then Add.`, 'warning');
        showToast(`${product.name} has variants — select one below.`, 'warning');
        input.value = '';
        input.focus();
        return;
    }

    const result = addProductToCart(product, variantIndex, quantity);
    if (result.ok) {
        showBarcodeFeedback(result.message, 'success');
    } else {
        showBarcodeFeedback(result.message, result.level || 'warning');
        showToast(result.message, result.level || 'warning');
    }

    input.value = '';
    if (qtyInput) qtyInput.value = '1';
    input.focus();
}

/* ==========================================================================
   POS · QUICK-ADD POPULAR PRODUCT GRID
   ========================================================================== */

let posQuickGridProducts = [];

async function loadPosQuickGrid() {
    const grid = document.getElementById('manualQuickGrid');
    if (!grid) return;

    grid.innerHTML = '<p class="pos-quick-grid-empty">Loading popular products…</p>';

    try {
        const res = await fetch('/api/products?limit=20&sort=popular', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        posQuickGridProducts = Array.isArray(data) ? data
            : (Array.isArray(data?.products) ? data.products
                : (Array.isArray(data?.data) ? data.data : []));
        renderPosQuickGrid(posQuickGridProducts);
    } catch (err) {
        console.error('POS quick grid load failed:', err);
        grid.innerHTML = '<p class="pos-quick-grid-empty">Could not load popular products.</p>';
    }
}

function resolvePosProductImage(product) {
    const img = product.image
        || (Array.isArray(product.images) ? product.images[0] : '')
        || product.thumbnail
        || '';
    return img || '';
}

function renderPosQuickGrid(products) {
    const grid = document.getElementById('manualQuickGrid');
    if (!grid) return;

    if (!Array.isArray(products) || !products.length) {
        grid.innerHTML = '<p class="pos-quick-grid-empty">No popular products to show.</p>';
        return;
    }

    grid.innerHTML = products.map((product) => {
        const pid = getManualOrderProductId(product);
        const name = escHtml(product.name || 'Product');
        const price = formatManualMoney(product.price);
        const stock = Number(product.stockQuantity ?? product.stock ?? product.totalStock) || 0;
        const image = resolvePosProductImage(product);
        const imgHtml = image
            ? `<img src="${escHtml(image)}" alt="${name}" class="pos-quick-card-img" loading="lazy" onerror="this.style.display='none'">`
            : '<span class="pos-quick-card-noimg"><i class="fa-solid fa-box"></i></span>';
        const outOfStock = stock <= 0;
        return `
            <div class="pos-quick-card ${outOfStock ? 'pos-quick-card--out' : ''}" data-product-id="${escHtml(pid)}">
                ${imgHtml}
                <span class="pos-quick-card-name" title="${name}">${name}</span>
                <span class="pos-quick-card-meta">${price} · Stock ${stock}</span>
                <button type="button" class="pos-quick-card-add" onclick="posQuickAdd('${escHtml(pid)}')" ${outOfStock ? 'disabled' : ''}>
                    <i class="fa-solid fa-cart-plus"></i> ${outOfStock ? 'Out of stock' : 'Add'}
                </button>
            </div>`;
    }).join('');
}

/**
 * Add a quick-grid product to the cart. Products with variants are routed to
 * the manual picker so the operator can choose Size/Color.
 * @param {string} productId
 */
window.posQuickAdd = function posQuickAdd(productId) {
    let product = manualOrderCatalog.find((p) => getManualOrderProductId(p) === productId)
        || posQuickGridProducts.find((p) => getManualOrderProductId(p) === productId);

    if (!product) return showToast('Product not found.', 'warning');

    // Cache the quick-grid product into the catalog for variant/stock lookups.
    if (!manualOrderCatalog.some((p) => getManualOrderProductId(p) === productId)) {
        manualOrderCatalog.push(product);
    }

    const variants = Array.isArray(product.variants) ? product.variants : [];
    if (variants.length > 0) {
        const productSelect = document.getElementById('manualProductSelect');
        if (productSelect) {
            populateManualProductSelect('');
            productSelect.value = productId;
            populateManualVariantSelect();
        }
        return showToast(`${product.name} has variants — pick Size/Color, then Add Line.`, 'info');
    }

    const result = addProductToCart(product, -1, 1);
    showToast(result.message, result.level || (result.ok ? 'success' : 'warning'));
};

async function submitManualOrder(event) {
    event.preventDefault();

    if (!manualOrderLines.length) {
        return showToast('Add at least one product line.', 'warning');
    }

    const payload = {
        customerName: document.getElementById('manualCustomerName')?.value?.trim(),
        customerPhone: document.getElementById('manualCustomerPhone')?.value?.trim(),
        customerAddress: document.getElementById('manualCustomerAddress')?.value?.trim(),
        deliveryArea: document.getElementById('manualDeliveryArea')?.value || 'inside',
        paymentStatus: document.getElementById('manualPaymentStatus')?.value || 'COD',
        manualDiscount: document.getElementById('manualDiscountAmount')?.value || 0,
        shippingFee: document.getElementById('manualShippingFee')?.value || 0,
        note: document.getElementById('manualOrderNote')?.value?.trim() || '',
        items: manualOrderLines.map((line) => ({
            productId: line.productId,
            id: line.productId,
            quantity: line.quantity,
            variantSku: line.variantSku || '',
            variantId: line.variantId || '',
            variantAttribute: line.variantAttribute || '',
            variantValue: line.variantValue || '',
            variantLabel: line.variantLabel || ''
        }))
    };

    const submitBtn = document.getElementById('manualOrderSubmitBtn');
    const restore = setButtonLoading(submitBtn, 'Creating…');

    try {
        const res = await fetch('/api/admin/orders/manual', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.success) {
            showToast(`Manual order ${result.data?.orderId || ''} created successfully!`, 'success');

            // Snapshot everything the receipt needs before the form is reset.
            const invoiceSnapshot = buildPosInvoiceSnapshot(payload, result.data);

            closeManualOrderModal();
            fetchLiveOrders();
            fetchPendingWhatsAppAlerts();
            if (typeof fetchDashboardAnalytics === 'function') fetchDashboardAnalytics();

            openPosInvoiceModal(invoiceSnapshot);
        } else {
            showToast(result.message || 'Failed to create manual order.', 'error');
        }
    } catch (err) {
        console.error('Manual order submit error:', err);
        showToast('Could not reach the server. Please try again.', 'error');
    } finally {
        restore();
    }
}

/* ==========================================================================
   POS · INVOICE / RECEIPT (print + PDF download)
   ========================================================================== */

let posInvoiceContext = null; // { orderId, mongoId }

function getPosStoreName() {
    return window.STORE_NAME
        || window.adminStoreConfig?.storeName
        || document.querySelector('.admin-brand-name')?.textContent?.trim()
        || 'EonlineBazar';
}

function getPosStoreLogo() {
    return window.STORE_LOGO
        || window.adminStoreConfig?.logoUrl
        || document.querySelector('.admin-brand-logo img, img.admin-logo')?.getAttribute('src')
        || '';
}

/** Build a plain snapshot of the just-created order for the receipt. */
function buildPosInvoiceSnapshot(payload, resultData) {
    const items = manualOrderLines.map((line) => ({
        name: line.name || 'Product',
        variantLabel: line.variantLabel || '',
        price: Number(line.price) || 0,
        quantity: Number(line.quantity) || 0,
        lineTotal: (Number(line.price) || 0) * (Number(line.quantity) || 0)
    }));

    const subtotal = items.reduce((sum, it) => sum + it.lineTotal, 0);
    const discount = Math.max(0, Number(payload.manualDiscount) || 0);
    const shipping = Math.max(0, Number(payload.shippingFee) || 0);
    const grandTotal = Math.max(0, subtotal - discount + shipping);

    return {
        orderId: resultData?.orderId || '',
        mongoId: resultData?._id || resultData?.id || resultData?.orderMongoId || '',
        date: new Date(),
        customerName: payload.customerName || 'Walk-in Customer',
        customerPhone: payload.customerPhone || '',
        paymentStatus: payload.paymentStatus || 'COD',
        items,
        subtotal,
        discount,
        shipping,
        grandTotal
    };
}

function renderPosInvoice(data) {
    const printable = document.getElementById('posInvoicePrintable');
    if (!printable) return;

    const storeName = escHtml(getPosStoreName());
    const logo = getPosStoreLogo();
    const logoHtml = logo
        ? `<img src="${escHtml(logo)}" alt="${storeName}" class="pos-invoice-logo">`
        : `<span class="pos-invoice-logo-text">${storeName}</span>`;

    const dateStr = data.date.toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const rows = data.items.map((it) => `
        <tr>
            <td>${escHtml(it.name)}${it.variantLabel ? `<br><small>${escHtml(it.variantLabel)}</small>` : ''}</td>
            <td class="pos-inv-num">${formatManualMoney(it.price)}</td>
            <td class="pos-inv-num">${it.quantity}</td>
            <td class="pos-inv-num">${formatManualMoney(it.lineTotal)}</td>
        </tr>`).join('');

    printable.innerHTML = `
        <div class="pos-invoice-head">
            ${logoHtml}
            <div class="pos-invoice-meta">
                <p class="pos-invoice-title">INVOICE</p>
                <p><strong>Order:</strong> ${escHtml(data.orderId || '—')}</p>
                <p><strong>Date:</strong> ${escHtml(dateStr)}</p>
            </div>
        </div>
        <div class="pos-invoice-customer">
            <p><strong>Billed to:</strong> ${escHtml(data.customerName)}</p>
            ${data.customerPhone ? `<p><strong>Phone:</strong> ${escHtml(data.customerPhone)}</p>` : ''}
            <p><strong>Payment:</strong> ${escHtml(data.paymentStatus)}</p>
        </div>
        <table class="pos-invoice-table">
            <thead>
                <tr>
                    <th>Item</th>
                    <th class="pos-inv-num">Price</th>
                    <th class="pos-inv-num">Qty</th>
                    <th class="pos-inv-num">Total</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
        <div class="pos-invoice-totals">
            <div><span>Subtotal</span><span>${formatManualMoney(data.subtotal)}</span></div>
            <div><span>Discount</span><span>- ${formatManualMoney(data.discount)}</span></div>
            <div><span>Shipping</span><span>${formatManualMoney(data.shipping)}</span></div>
            <div class="pos-invoice-grand"><span>Grand Total</span><span>${formatManualMoney(data.grandTotal)}</span></div>
        </div>
        <p class="pos-invoice-footer">Thank you for shopping with ${storeName}!</p>`;
}

function openPosInvoiceModal(data) {
    if (!data) return;
    posInvoiceContext = { orderId: data.orderId, mongoId: data.mongoId };
    renderPosInvoice(data);

    const downloadBtn = document.getElementById('posInvoiceDownloadBtn');
    if (downloadBtn) downloadBtn.disabled = !data.mongoId;

    const modal = document.getElementById('posInvoiceModal');
    if (modal) modal.style.display = 'flex';
}

window.closePosInvoiceModal = function closePosInvoiceModal() {
    const modal = document.getElementById('posInvoiceModal');
    if (modal) modal.style.display = 'none';
    document.body.classList.remove('printing-pos-invoice');
};

window.printPosInvoice = function printPosInvoice() {
    document.body.classList.add('printing-pos-invoice');
    const cleanup = () => document.body.classList.remove('printing-pos-invoice');
    window.addEventListener('afterprint', cleanup, { once: true });
    // Fallback in case afterprint never fires.
    setTimeout(cleanup, 2000);
    window.print();
};

async function downloadPosInvoicePdf() {
    if (!posInvoiceContext?.mongoId) {
        return showToast('Invoice PDF is not available for this order.', 'warning');
    }

    const btn = document.getElementById('posInvoiceDownloadBtn');
    const original = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Preparing…'; }

    try {
        const res = await fetch(`/api/orders/${posInvoiceContext.mongoId}/invoice`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            let message = `Could not download invoice (${res.status}).`;
            try { const j = await res.json(); message = j.message || message; } catch { /* binary */ }
            throw new Error(message);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Invoice-${posInvoiceContext.orderId || posInvoiceContext.mongoId}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error('POS invoice download error:', err);
        showToast(err.message || 'Invoice download failed. Use Print instead.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = original; }
    }
}

function setupManualOrderEngine() {
    const openBtn = document.getElementById('openManualOrderModalBtn');
    if (openBtn) {
        openBtn.addEventListener('click', () => openManualOrderModal());
    }

    const barcodeInput = document.getElementById('manualBarcodeInput');
    if (barcodeInput) {
        barcodeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleBarcodeScan();
            }
        });
    }

    const barcodeAddBtn = document.getElementById('manualBarcodeAddBtn');
    if (barcodeAddBtn) barcodeAddBtn.addEventListener('click', handleBarcodeScan);

    const invoiceDownloadBtn = document.getElementById('posInvoiceDownloadBtn');
    if (invoiceDownloadBtn) invoiceDownloadBtn.addEventListener('click', downloadPosInvoicePdf);

    const searchInput = document.getElementById('manualProductSearch');
    if (searchInput) {
        searchInput.addEventListener('input', () => populateManualProductSelect(searchInput.value));
    }

    const productSelect = document.getElementById('manualProductSelect');
    if (productSelect) {
        productSelect.addEventListener('change', populateManualVariantSelect);
    }

    const variantSelect = document.getElementById('manualVariantSelect');
    if (variantSelect) {
        variantSelect.addEventListener('change', updateManualVariantStockHint);
    }

    const addBtn = document.getElementById('manualAddLineBtn');
    if (addBtn) addBtn.addEventListener('click', addManualOrderLine);

    ['manualDiscountAmount', 'manualShippingFee'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateManualOrderTotals);
    });

    const form = document.getElementById('manualOrderForm');
    if (form) form.addEventListener('submit', submitManualOrder);
}

/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    addManualOrderLine,
    addProductToCart,
    buildManualLinePayload,
    findProductByCode,
    formatManualMoney,
    getManualOrderProductId,
    getSelectedManualProduct,
    handleBarcodeScan,
    loadManualOrderCatalog,
    loadPosQuickGrid,
    populateManualProductSelect,
    populateManualVariantSelect,
    renderManualOrderLines,
    renderPosQuickGrid,
    resetManualOrderForm,
    setupManualOrderEngine,
    submitManualOrder,
    updateManualOrderTotals,
    updateManualVariantStockHint
});

