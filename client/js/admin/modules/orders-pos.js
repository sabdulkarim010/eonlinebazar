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

function addManualOrderLine() {
    const product = getSelectedManualProduct();
    const quantity = Math.max(1, Number(document.getElementById('manualItemQuantity')?.value) || 1);

    if (!product) {
        return showToast('Select a product first.', 'warning');
    }

    const variants = Array.isArray(product.variants) ? product.variants : [];
    const variantSelect = document.getElementById('manualVariantSelect');
    const variantIndex = variants.length > 0 ? Number(variantSelect?.value) : -1;

    if (variants.length > 0 && (Number.isNaN(variantIndex) || variantIndex < 0)) {
        return showToast('Select a Size/Color variant for this product.', 'warning');
    }

    let availableStock = Number(product.stockQuantity ?? product.stock) || 0;
    if (variantIndex >= 0 && variants[variantIndex]) {
        availableStock = Number(variants[variantIndex].stock) || 0;
    }

    const existingQty = manualOrderLines
        .filter((line) => line.productId === getManualOrderProductId(product)
            && String(line.variantIndex) === String(variantIndex))
        .reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);

    if (existingQty + quantity > availableStock) {
        return showToast(`Insufficient stock. Available: ${availableStock}, already in cart: ${existingQty}.`, 'error');
    }

    const linePayload = buildManualLinePayload(product, variantIndex, quantity);
    linePayload.variantIndex = variantIndex;
    manualOrderLines.push(linePayload);

    document.getElementById('manualItemQuantity').value = '1';
    renderManualOrderLines();
    updateManualOrderTotals();
}

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
            closeManualOrderModal();
            fetchLiveOrders();
            fetchPendingWhatsAppAlerts();
            if (typeof fetchDashboardAnalytics === 'function') fetchDashboardAnalytics();
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

function setupManualOrderEngine() {
    const openBtn = document.getElementById('openManualOrderModalBtn');
    if (openBtn) {
        openBtn.addEventListener('click', () => openManualOrderModal());
    }

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
    buildManualLinePayload,
    formatManualMoney,
    getManualOrderProductId,
    getSelectedManualProduct,
    loadManualOrderCatalog,
    populateManualProductSelect,
    populateManualVariantSelect,
    renderManualOrderLines,
    resetManualOrderForm,
    setupManualOrderEngine,
    submitManualOrder,
    updateManualOrderTotals,
    updateManualVariantStockHint
});

