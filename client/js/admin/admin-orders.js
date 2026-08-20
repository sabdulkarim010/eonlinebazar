/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/admin-orders.js
 * Description: Order list, status updates, invoices, shipping, courier booking, and manual POS.
 */

import './admin-core.js';

/* ==========================================================================
   SECTION 7: LIVE ORDER MANAGEMENT (লাইভ অর্ডার ও ইনভয়েস ইঞ্জিন)
   ========================================================================== */

/**
 * ৭.১: ডাটাবেজ থেকে লাইভ সমস্ত অর্ডার ফেচ করা
 * এটি সিকিউর হেডার (Token) ব্যবহার করে ব্যাকএন্ড থেকে রিয়েল-টাইম অর্ডার নিয়ে আসে
 */
async function fetchLiveOrders() {
    if (!tableBody) return;
    
    // ডাটা লোড হওয়ার সময় ইউজার ফ্রেন্ডলি মেসেজ দেখানো
    tableBody.innerHTML = `<tr><td colspan="${LIVE_ORDERS_TABLE_COLS}" class="loading-cell">Syncing live orders...</td></tr>`; 
    
    try {
        const [response, settingsRes] = await Promise.all([
            fetch('/api/orders', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            }),
            fetch('/api/admin/master-settings', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            })
        ]);

        if (response.status === 429) {
            if (trackAdminPollError('liveOrders', response)) return;
            tableBody.innerHTML = `<tr><td colspan="${LIVE_ORDERS_TABLE_COLS}" class="table-status-error">Too many requests — please wait and try again.</td></tr>`;
            return;
        }
        if (response.status === 401) {
            handleAdminApiAuthResponse(response, {});
            return;
        }
        
        const data = await response.json();
        resetAdminPollErrors('liveOrders');

        try {
            const settingsData = await settingsRes.json();
            if (settingsData.success && settingsData.data) {
                cacheAdminRewardSettings(settingsData.data);
                cacheAdminCourierSettings(settingsData.data);
            }
        } catch (settingsErr) {
            console.warn('Could not load refund undo window from master settings:', settingsErr);
        }

        await refreshAdminCourierStatus();
        
        // ব্যাকএন্ড ডাটা ফরম্যাট যাচাই ও রিভার্স (সর্বশেষ অর্ডার আগে দেখানোর জন্য) করা
        if (data && data.success && Array.isArray(data.data)) {
            globalOrders = data.data; 
        } else if (Array.isArray(data)) {
            globalOrders = data.reverse(); 
        } else {
            globalOrders = [];
        }
        
        // ড্যাশবোর্ডের টোটাল অর্ডার ব্যাজ কাউন্টার আপডেট
        const totalOrderBadge = document.getElementById('total-orders-badge');
        if (totalOrderBadge) totalOrderBadge.innerText = `Total: ${globalOrders.length}`;
        
        // টেবিল রেন্ডার করার মূল ফাংশন কল
        filterAndRenderOrders();
        fetchPendingWhatsAppAlerts();
        maybeOpenOrderFromDeepLink();
    } catch (error) {
        console.error("অর্ডারের ডাটা প্রসেস করতে এরর হয়েছে:", error);
        tableBody.innerHTML = `<tr><td colspan="${LIVE_ORDERS_TABLE_COLS}" class="table-status-error">Failed to load live orders.</td></tr>`;
    }
}

/** Open invoice modal when arriving via /admin/order-details/:orderId */
function maybeOpenOrderFromDeepLink() {
    const match = window.location.pathname.match(/^\/admin\/order-details\/([^/]+)$/);
    if (!match) return;

    const orderId = decodeURIComponent(match[1]);
    try {
        window.history.replaceState({}, document.title, '/admin/dashboard');
    } catch (_) { /* ignore */ }

    const navItem = document.querySelector('[data-target="view-orders"]');
    if (navItem && typeof navItem.click === 'function') {
        navItem.click();
    }

    setTimeout(() => {
        if (typeof window.viewInvoice === 'function') {
            window.viewInvoice(orderId);
        }
    }, 150);
}

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

/* ==========================================================================
   WHATSAPP PENDING ALERT BADGE (wa.me fallback queue)
   ========================================================================== */

/* shared state: whatsappAlertPollTimer lives on window (admin-core) */

function renderWhatsAppAlertDropdown(alerts = []) {
    const dropdown = document.getElementById('whatsappAlertDropdown');
    const wrap = document.getElementById('whatsappAlertBadgeWrap');
    const countEl = document.getElementById('whatsappAlertBadgeCount');
    if (!dropdown || !wrap || !countEl) return;

    const count = alerts.length;
    countEl.textContent = String(count);
    wrap.style.display = count > 0 ? 'block' : 'none';

    if (count === 0) {
        dropdown.style.display = 'none';
        dropdown.innerHTML = '';
        return;
    }

    dropdown.innerHTML = alerts.map((alert) => `
        <div class="whatsapp-alert-item" data-alert-id="${escHtml(alert.id)}">
            <div class="whatsapp-alert-item-head">
                <strong>#${escHtml(alert.orderId || 'Order')}</strong>
                <button type="button" class="whatsapp-alert-dismiss" data-dismiss-id="${escHtml(alert.id)}" title="Dismiss">×</button>
            </div>
            <p class="whatsapp-alert-reason">${escHtml(alert.reason || 'Tap to send via WhatsApp')}</p>
            <a href="${escHtml(alert.waMeUrl || '#')}" target="_blank" rel="noopener noreferrer" class="whatsapp-alert-send-link">
                <i class="fa-brands fa-whatsapp"></i> Open WhatsApp
            </a>
        </div>
    `).join('');

    dropdown.querySelectorAll('[data-dismiss-id]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const alertId = btn.getAttribute('data-dismiss-id');
            try {
                await fetch(`/api/admin/whatsapp-alerts/${encodeURIComponent(alertId)}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            } catch (err) {
                console.warn('Dismiss WhatsApp alert failed:', err);
            }
            fetchPendingWhatsAppAlerts();
        });
    });
}

async function fetchPendingWhatsAppAlerts() {
    try {
        const res = await fetch('/api/admin/whatsapp-alerts/pending', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 429) {
            if (trackAdminPollError('whatsappAlerts', res)) {
                if (whatsappAlertPollTimer) {
                    clearInterval(whatsappAlertPollTimer);
                    whatsappAlertPollTimer = null;
                }
            }
            return;
        }
        if (res.status === 401) {
            handleAdminApiAuthResponse(res, {});
            return;
        }

        if (!res.ok) {
            trackAdminPollError('whatsappAlerts', res);
            return;
        }

        const data = await res.json();
        resetAdminPollErrors('whatsappAlerts');
        if (data.success) {
            renderWhatsAppAlertDropdown(Array.isArray(data.data) ? data.data : []);
        }
    } catch (err) {
        adminPollErrorCounts.whatsappAlerts = (adminPollErrorCounts.whatsappAlerts || 0) + 1;
        console.warn('[Admin] Fetch error (whatsapp alerts):', err.message);
        if (adminPollErrorCounts.whatsappAlerts >= MAX_ADMIN_POLL_ERRORS && whatsappAlertPollTimer) {
            console.warn('[Admin] Too many errors on whatsappAlerts, pausing auto-refresh');
            clearInterval(whatsappAlertPollTimer);
            whatsappAlertPollTimer = null;
        }
    }
}

function setupWhatsAppAlertBadge() {
    const btn = document.getElementById('whatsappAlertBadgeBtn');
    const dropdown = document.getElementById('whatsappAlertDropdown');

    if (btn && dropdown) {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        });

        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
    }

    fetchPendingWhatsAppAlerts();
    if (whatsappAlertPollTimer) clearInterval(whatsappAlertPollTimer);
    whatsappAlertPollTimer = setInterval(fetchPendingWhatsAppAlerts, 30000);
}

/**
 * ৭.২: অর্ডার ফিল্টারিং এবং রিয়েল-টাইম সার্চিং লজিক
 */
function applyOrderFilters(resetPage = false) {
    const searchInput = getOrderSearchInputEl();
    const search = (searchInput ? searchInput.value : '').toLowerCase().trim();

    currentFilteredOrders = globalOrders.filter((order) => {
        const orderIdStr = (order.orderId || order._id || '').toLowerCase();
        const nameStr = (order.customerName || '').toLowerCase();
        const phoneStr = (order.customerPhone || '').toLowerCase();

        const matchSearch = !search || orderIdStr.includes(search) || nameStr.includes(search) || phoneStr.includes(search);
        const matchStatus = orderMatchesStatusTab(order, currentOrderStatusFilter);
        const matchDate = orderMatchesDateFilter(order, currentOrderDateFilter);
        const matchSandbox = orderMatchesSandboxFilter(order, currentOrderSandboxFilter);

        return matchSearch && matchStatus && matchDate && matchSandbox;
    });

    initAdminPaginationInstances();
    if (resetPage) {
        currentOrderPage = 1;
        if (orderPg) orderPg.resetPage();
    }
    updateOrderTabCounts();
    renderOrderTable();
}

window.filterAndRenderOrders = function(resetPage = false) {
    applyOrderFilters(resetPage);
};

window.debounceSearch = function() {
    clearTimeout(orderSearchDebounceTimer);
    orderSearchDebounceTimer = setTimeout(() => applyOrderFilters(true), 300);
};

window.filterByDate = function(value) {
    currentOrderDateFilter = value || '';
    applyOrderFilters(true);
};

window.setOrderStatusTab = function(status) {
    currentOrderStatusFilter = status;
    document.querySelectorAll('#view-orders .order-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.status === status);
    });
    applyOrderFilters(false);
};

function orderMatchesSandboxFilter(order, filter) {
    if (!filter || filter === 'all') return true;
    const isTest = order.isSandbox === true;
    if (filter === 'test') return isTest;
    if (filter === 'live') return !isTest;
    return true;
}

window.setOrderSandboxFilter = function(filter) {
    currentOrderSandboxFilter = filter || 'all';
    document.querySelectorAll('#view-orders .sandbox-filter-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.sandboxFilter === currentOrderSandboxFilter);
    });
    applyOrderFilters(true);
};

/**
 * ৭.২ক: অর্ডার cancel/return reason ও status badge হেল্পার
 */
function getOrderReasonDetails(order) {
    if (!order) return null;

    const statusLower = String(order.status || 'pending').toLowerCase();
    const cancelReason = String(order.cancelReason || order.actionReason || '').trim();
    const returnReason = String(order.returnReason || order.actionReason || '').trim();

    if (statusLower === 'cancelled' || statusLower === 'canceled') {
        if (!cancelReason) return null;
        const by = order.cancelledBy === 'Admin' ? 'Admin' : 'Customer';
        return {
            actionType: 'Cancellation',
            initiatedBy: by,
            reason: cancelReason
        };
    }

    if (statusLower === 'return requested' && returnReason) {
        return {
            actionType: 'Return Request',
            initiatedBy: 'Customer',
            reason: returnReason
        };
    }

    if (statusLower === 'returned' && returnReason) {
        return {
            actionType: 'Return (Refunded)',
            initiatedBy: 'Customer',
            reason: returnReason
        };
    }

    return null;
}

/* ============================================================
   🚚 COURIER BOOKING (Steadfast / Pathao / RedX)
   ============================================================ */

const COURIER_TRACKING_BASE_URLS = {
    steadfast: 'https://steadfast.com.bd/t/',
    pathao: 'https://merchant.pathao.com/tracking?consignment_id=',
    redx: 'https://redx.com.bd/track-global-parcel/?trackingId=',
    Steadfast: 'https://steadfast.com.bd/t/',
    Pathao: 'https://merchant.pathao.com/tracking?consignment_id=',
    RedX: 'https://redx.com.bd/track-global-parcel/?trackingId='
};

function normalizeAdminCourierSlug(value) {
    const raw = String(value || '').trim();
    const aliases = { Steadfast: 'steadfast', Pathao: 'pathao', RedX: 'redx', redX: 'redx' };
    return aliases[raw] || raw.toLowerCase();
}

const COURIER_PROVIDER_LABELS = {
    steadfast: 'Steadfast',
    pathao: 'Pathao',
    redx: 'RedX'
};

// Mirrors the server-side guard — these orders can never be handed to a courier.
const COURIER_BLOCKED_STATUSES = ['cancelled', 'canceled', 'returned', 'refunded', 'return requested'];

// Filled from the Master Settings payload that fetchLiveOrders() already loads,
// so the button can name the store's configured provider.

/* shared state: adminCourierConfig lives on window (admin-core) */

function cacheAdminCourierSettings(settings) {
    if (!settings) return;
    const provider = normalizeAdminCourierSlug(settings.defaultCourierProvider || 'steadfast');
    const hasSteadfastKeys = Boolean(
        String(settings.courierApiKey || '').trim() && String(settings.courierSecretKey || '').trim()
    );
    adminCourierConfig = {
        ...adminCourierConfig,
        provider,
        // Steadfast keys from Master Settings; Pathao/RedX readiness comes from /courier/status.
        isConfigured: provider === 'steadfast' ? hasSteadfastKeys : adminCourierConfig.isConfigured,
        mockMode: provider === 'steadfast' ? !hasSteadfastKeys : adminCourierConfig.mockMode
    };
}

async function refreshAdminCourierStatus() {
    try {
        const response = await fetch('/api/admin/courier/status', {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` }
        });
        const result = await response.json();
        if (!result.success || !result.data) return;

        adminCourierConfig = {
            provider: normalizeAdminCourierSlug(result.data.provider || adminCourierConfig.provider),
            isConfigured: Boolean(result.data.isConfigured),
            mockMode: Boolean(result.data.mockMode),
            supportsBooking: Boolean(result.data.supportsBooking)
        };
    } catch (err) {
        console.warn('Could not refresh courier status:', err);
    }
}

function getCourierTrackingUrl(provider, trackingId) {
    const slug = normalizeAdminCourierSlug(provider);
    const base = COURIER_TRACKING_BASE_URLS[slug] || COURIER_TRACKING_BASE_URLS[provider];
    const code = String(trackingId || '').trim();
    if (!base || !code) return '';
    return `${base}${encodeURIComponent(code)}`;
}

function buildAdminPaymentProofPendingBadge(order) {
    if (String(order?.paymentProof?.status || '').toLowerCase() !== 'submitted') return '';
    return `<span class="order-payment-proof-pending-badge" title="Payment proof awaiting review"><i class="fa-solid fa-receipt"></i> Proof Pending</span>`;
}

/**
 * Renders either the tracking badge (already booked) or the one-click booking
 * button (not booked yet) for an order row.
 */
function buildCourierActionHtml(order) {
    const trackingId = String(order.courierTrackingId || '').trim();
    const provider = normalizeAdminCourierSlug(order.courierProvider || adminCourierConfig.provider || 'steadfast');
    const safeProvider = escapeToastText(COURIER_PROVIDER_LABELS[provider] || provider);

    if (trackingId) {
        const safeTracking = escapeToastText(trackingId);
        const trackingUrl = getCourierTrackingUrl(provider, trackingId);
        const badgeLabel = `<span class="order-courier-sent-text">Sent ${safeTracking}</span>`;

        return trackingUrl
            ? `<a href="${trackingUrl}" target="_blank" rel="noopener noreferrer" class="${ORDER_COURIER_SENT_CLASSES} courier-tracking-badge" title="Track ${safeTracking} on ${safeProvider}">${badgeLabel}</a>`
            : `<span class="${ORDER_COURIER_SENT_CLASSES} courier-tracking-badge" title="${safeTracking} · ${safeProvider}">${badgeLabel}</span>`;
    }

    if (COURIER_BLOCKED_STATUSES.includes(String(order.status || '').trim().toLowerCase())) {
        return '<span class="order-courier-empty" aria-hidden="true">—</span>';
    }

    return `<button type="button" class="${ORDER_COURIER_SEND_CLASSES}" onclick="sendOrderToCourier('${order._id}')" title="Book this parcel with ${safeProvider}">
                <span class="send-courier-icon shrink-0" aria-hidden="true">🚚</span>
                <span class="send-courier-label">Send to Courier</span>
            </button>`;
}

/**
 * ৭.৪খ: এক ক্লিকে কুরিয়ার পার্সেল বুকিং
 * Steadfast API-তে পার্সেল তৈরি করে ট্র্যাকিং আইডি সংরক্ষণ করে।
 * @param {string} orderId - অর্ডারের ডাটাবেজ আইডি
 */
window.sendOrderToCourier = function(orderId) {
    const order = globalOrders.find(o => String(o._id) === String(orderId));
    const provider = normalizeAdminCourierSlug(order?.courierProvider || adminCourierConfig.provider || 'steadfast');
    const providerLabel = COURIER_PROVIDER_LABELS[provider] || provider;
    const displayId = order?.orderId || String(orderId).slice(-6).toUpperCase();
    const isMockMode = adminCourierConfig.mockMode;

    const confirmTitle = isMockMode ? `Send to ${providerLabel} (Mock Mode)` : `Send to ${providerLabel}`;
    const confirmBody = isMockMode
        ? `No courier API credentials are configured. Order #${displayId} will receive a mock tracking ID (e.g. SF-PENDING-XXXXX), be marked as Shipped, and saved to the database.`
        : `Book order #${displayId} as a ${providerLabel} parcel? This creates a real consignment and marks the order as Shipped.`;

    showCustomConfirm(
        confirmTitle,
        confirmBody,
        async () => {
            const bookBtn = document.querySelector(`tr[data-order-id="${orderId}"] .send-courier-btn`);
            const restore = setButtonLoading(bookBtn, isMockMode ? 'Booking (Mock)...' : 'Booking...');

            try {
                const response = await fetch(`/api/admin/orders/${orderId}/send-courier`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ courier: provider })
                });

                const result = await response.json();

                if (result.success) {
                    const toastMsg = result.mockMode
                        ? (result.message || 'Mock parcel booked! Order marked as Shipped.')
                        : (result.message || 'Parcel booked successfully!');
                    showToast(toastMsg, 'success');
                    const idx = globalOrders.findIndex(o => String(o._id) === String(orderId));
                    const updated = result.data?.order || result.order;
                    if (idx !== -1 && updated) {
                        globalOrders[idx] = { ...globalOrders[idx], ...updated };
                    } else if (idx !== -1) {
                        globalOrders[idx] = {
                            ...globalOrders[idx],
                            status: 'Shipped',
                            courierTrackingId: result.trackingId || result.data?.trackingId || globalOrders[idx].courierTrackingId,
                            courierProvider: provider
                        };
                    } else {
                        fetchLiveOrders();
                        return;
                    }
                    applyOrderFilters(false);
                    return;
                }

                showToast(result.message || 'Courier booking failed.', 'error');
                // A 409 means the order was already booked elsewhere — resync so
                // the row shows the tracking badge instead of the button.
                if (response.status === 409) fetchLiveOrders();
            } catch (error) {
                console.error('Courier booking error:', error);
                showToast('Server connection error! Parcel was not booked.', 'error');
            } finally {
                restore();
            }
        }
    );
};

function buildAdminOrderStatusCell(order) {
    const orderId = order._id;
    const statusLower = String(order.status || 'pending').toLowerCase();
    const isCancelled = statusLower === 'cancelled' || statusLower === 'canceled';
    const isReturnRequested = statusLower === 'return requested';
    const isReturned = statusLower === 'returned';
    const isRefunded = statusLower === 'refunded';

    let badgeHtml = '';

    if (isCancelled) {
        const by = order.cancelledBy === 'Admin' ? 'Admin' : 'Customer';
        const badgeClass = by === 'Admin' ? 'status-cancelled-admin' : 'status-cancelled-customer';
        badgeHtml = `<span class="status-badge ${badgeClass}"><i class="fa-solid fa-ban"></i> Cancelled (${by})</span>`;
    } else if (isReturnRequested) {
        badgeHtml = `<span class="status-badge status-return-requested"><i class="fa-solid fa-rotate-left"></i> Return Requested</span>`;
    } else if (isReturned) {
        badgeHtml = `<span class="status-badge status-returned"><i class="fa-solid fa-check-double"></i> Returned</span>`;
    } else if (isRefunded) {
        badgeHtml = `<span class="status-badge status-returned"><i class="fa-solid fa-money-bill-wave"></i> Refunded</span>`;
    } else {
        const selectClass = getStatusSelectClass(order.status);
        badgeHtml = `
            <select onchange="changeOrderStatus('${orderId}', this.value)" class="status-select ${selectClass}">
                <option value="Pending" ${order.status === 'Pending' ? 'selected' : ''}>⏳ Pending</option>
                <option value="Processing" ${order.status === 'Processing' ? 'selected' : ''}>⚙️ Processing</option>
                <option value="Shipped" ${order.status === 'Shipped' ? 'selected' : ''}>🚚 Shipped</option>
                <option value="Delivered" ${order.status === 'Delivered' ? 'selected' : ''}>✅ Delivered</option>
                <option value="Cancelled" ${order.status === 'Cancelled' ? 'selected' : ''}>❌ Cancelled</option>
            </select>`;
    }

    const reasonDetails = getOrderReasonDetails(order);
    const reasonBtn = reasonDetails
        ? `<button type="button" class="view-reason-btn" onclick="showOrderReasonDetails('${orderId}')" title="View ${reasonDetails.actionType.toLowerCase()} reason">
                <i class="fa-solid fa-circle-info"></i><span>View Reason</span>
           </button>`
        : '';

    const undoRefundBtn = canUndoRefund(order)
        ? `<button type="button" class="undo-refund-btn" onclick="undoOrderRefund('${orderId}')" title="Reverse refund and restore return request">
                <i class="fa-solid fa-rotate-left"></i><span class="undo-refund-label">Undo Refund</span>
           </button>`
        : '';

    const approveReturnBtn = isReturnRequested
        ? `<button type="button" class="order-action-pill approve-return-btn" onclick="approveOrderReturn('${orderId}')" title="Approve Return &amp; Refund Wallet">
                <i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i><span class="approve-return-label">Approve</span>
           </button>`
        : '';

    return `<div class="order-status-cell">${badgeHtml}${approveReturnBtn}${undoRefundBtn}${reasonBtn}</div>`;
}

window.showOrderReasonDetails = function(orderId) {
    const order = globalOrders.find(o => String(o._id) === String(orderId));
    const details = getOrderReasonDetails(order);

    if (!order || !details) {
        showToast('No reason details found for this order.', 'warning');
        return;
    }

    const displayId = order.orderId || String(order._id).slice(-6).toUpperCase();
    const modal = document.getElementById('orderReasonModal');
    const orderIdEl = document.getElementById('orderReasonOrderId');
    const actionTypeEl = document.getElementById('orderReasonActionType');
    const initiatedByEl = document.getElementById('orderReasonInitiatedBy');
    const reasonTextEl = document.getElementById('orderReasonText');
    const subtitleEl = document.getElementById('orderReasonModalSubtitle');

    if (orderIdEl) orderIdEl.textContent = `#${displayId}`;
    if (actionTypeEl) actionTypeEl.textContent = details.actionType;
    if (initiatedByEl) initiatedByEl.textContent = details.initiatedBy;
    if (reasonTextEl) reasonTextEl.textContent = details.reason;
    if (subtitleEl) {
        subtitleEl.textContent = details.actionType === 'Cancellation'
            ? `This order was cancelled by the ${details.initiatedBy.toLowerCase()}.`
            : 'This is the reason the customer submitted for their return request.';
    }
    if (modal) modal.style.display = 'flex';
};

window.closeOrderReasonModal = function() {
    const modal = document.getElementById('orderReasonModal');
    if (modal) modal.style.display = 'none';
};

/**
 * ৭.৩: ডাইনামিক অর্ডার টেবিল রেন্ডারিং এবং পেজিনেশন প্রসেসর
 * ফিল্টারকৃত ডাটাকে লিমিট অনুযায়ী টেবিলে সুন্দর করে সাজিয়ে ফুটিয়ে তোলে
 */
window.renderOrderTable = function() {
    if (!tableBody) return;

    initAdminPaginationInstances();
    const limit = orderPg?.currentLimit ?? ordersPerPage;
    const page = orderPg?.currentPage ?? currentOrderPage;
    currentOrderPage = page;
    ordersPerPage = limit;

    const totalItems = currentFilteredOrders.length;
    const totalPages = Math.ceil(totalItems / limit) || 1;

    if (page > totalPages) {
        currentOrderPage = totalPages;
        if (orderPg) orderPg.currentPage = totalPages;
    }

    const effectivePage = orderPg?.currentPage ?? currentOrderPage;
    const startIdx = (effectivePage - 1) * limit;
    const paginatedOrders = currentFilteredOrders.slice(startIdx, startIdx + limit);

    if (orderPg) {
        orderPg.currentPage = effectivePage;
        orderPg.currentLimit = limit;
        orderPg.setTotal(totalItems);
    }

    if (paginatedOrders.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="${LIVE_ORDERS_TABLE_COLS}">
                    <div class="empty-orders">
                        <div class="empty-orders-icon" aria-hidden="true">📭</div>
                        <h3>No orders found</h3>
                        <p>Try changing the filter or search query</p>
                    </div>
                </td>
            </tr>`;
        updateOrdersBulkToolbar();
        return;
    }

    tableBody.innerHTML = '';

    paginatedOrders.forEach((order) => {
        const orderId = order._id;
        const displayId = order.orderId || orderId.slice(-6).toUpperCase();
        const isExpanded = expandedOrderIds.has(String(orderId));

        let dateHtml = `<span class="order-date-main">N/A</span>`;
        if (order.createdAt) {
            const dateObj = new Date(order.createdAt);
            const dateStr = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            dateHtml = `<span class="order-date-main">${dateStr}</span><span class="order-date-time">${timeStr}</span>`;
        }

        const statusLower = (order.status || 'pending').toLowerCase();
        const isReturnRequested = statusLower === 'return requested';

        const statusCellHtml = buildAdminOrderStatusCell(order);
        const courierActionHtml = buildCourierActionHtml(order);

        const displayIdSafe = escapeHtml(displayId);
        const customerName = order.customerName || '—';
        const customerPhone = order.customerPhone || '—';
        const orderIdCellHtml = `
            <button type="button" class="order-id-link" onclick="event.stopPropagation(); viewInvoice('${orderId}')" title="View invoice">
                #${displayIdSafe}
            </button>${order.isSandbox ? '<span class="sandbox-badge">TEST</span>' : ''}${buildAdminPaymentProofPendingBadge(order)}`;
        const customerNameHtml = `<span class="order-customer-name">${escapeHtml(customerName)}</span>`;
        const customerPhoneHtml = `<span class="order-customer-phone-sub">${escapeHtml(customerPhone)}</span>`;
        const customerAddress = order.customerAddress || '—';
        const addressCellHtml = `<span class="order-address-text" title="${escapeHtml(customerAddress)}">${escapeHtml(customerAddress)}</span>`;
        const productsCellHtml = buildOrderProductsSummary(order.items);

        const tr = document.createElement('tr');
        tr.className = `order-row-main${isReturnRequested ? ' order-row-return-requested' : ''}${isExpanded ? ' is-expanded' : ''}`;
        tr.dataset.orderId = orderId;
        tr.addEventListener('click', (event) => toggleOrderRowExpand(event, orderId));
        tr.innerHTML = `
            <td class="col-checkbox" onclick="event.stopPropagation()">
                <input type="checkbox" class="order-row-select" value="${orderId}" onchange="updateOrdersBulkToolbar()" aria-label="Select order #${displayIdSafe}">
            </td>
            <td class="col-order-id">${orderIdCellHtml}</td>
            <td class="col-datetime">${dateHtml}</td>
            <td class="col-customer">
                ${customerNameHtml}
                ${customerPhoneHtml}
            </td>
            <td class="col-address">${addressCellHtml}</td>
            <td class="col-products">${productsCellHtml}</td>
            <td class="col-total"><span class="order-total-amount">${formatAdminPrice(getOrderGrandTotal(order))}</span></td>
            <td class="col-status">${statusCellHtml}</td>
            <td class="order-courier-cell">${courierActionHtml}</td>
            <td class="order-actions-cell">
                <div class="order-actions-toolbar">
                    <button type="button" class="action-icon edit" onclick="event.stopPropagation(); openEditOrderShippingModal('${orderId}')" title="Edit Shipping Details" aria-label="Edit">✏️</button>
                    <button type="button" class="action-icon view" onclick="event.stopPropagation(); viewInvoice('${orderId}')" title="View Invoice" aria-label="View">👁️</button>
                    <button type="button" class="action-icon delete" onclick="event.stopPropagation(); deleteOrder('${orderId}')" title="Delete Order" aria-label="Delete">🗑️</button>
                </div>
            </td>
        `;
        tableBody.appendChild(tr);

        const expandTr = document.createElement('tr');
        expandTr.className = 'order-row-expanded';
        expandTr.dataset.expandFor = orderId;
        expandTr.style.display = isExpanded ? 'table-row' : 'none';
        expandTr.innerHTML = `
            <td colspan="${LIVE_ORDERS_TABLE_COLS}">
                ${buildOrderExpandedPanel(order)}
            </td>`;
        tableBody.appendChild(expandTr);

        if (isExpanded) {
            requestAnimationFrame(() => hydrateOrderExpandedTimeline(orderId, order.status));
        }
    });

    const selectAll = document.getElementById('orders-select-all');
    if (selectAll) selectAll.checked = false;
    updateOrdersBulkToolbar();
};

window.toggleOrderRowExpand = function(event, orderId) {
    if (event.target.closest('button, a, input, select, textarea, label')) return;

    const id = String(orderId);
    const expandRow = document.querySelector(`tr.order-row-expanded[data-expand-for="${id}"]`);
    const mainRow = document.querySelector(`tr.order-row-main[data-order-id="${id}"]`);
    if (!expandRow || !mainRow) return;

    const willExpand = expandRow.style.display === 'none';
    if (willExpand) {
        expandedOrderIds.add(id);
        expandRow.style.display = 'table-row';
        mainRow.classList.add('is-expanded');
        const order = globalOrders.find((o) => String(o._id) === id);
        if (order) hydrateOrderExpandedTimeline(id, order.status);
    } else {
        expandedOrderIds.delete(id);
        expandRow.style.display = 'none';
        mainRow.classList.remove('is-expanded');
    }
};

window.toggleSelectAllOrders = function(checkbox) {
    document.querySelectorAll('#view-orders .order-row-select').forEach((el) => {
        el.checked = checkbox.checked;
    });
    updateOrdersBulkToolbar();
};

window.updateOrdersBulkToolbar = function() {
    const selected = document.querySelectorAll('#view-orders .order-row-select:checked').length;
    const toolbar = document.getElementById('orders-bulk-toolbar');
    const countEl = document.getElementById('orders-selected-count');
    if (toolbar) toolbar.style.display = selected > 0 ? 'flex' : 'none';
    if (countEl) countEl.textContent = `${selected} order${selected !== 1 ? 's' : ''} selected`;
};

window.bulkDeleteOrders = function() {
    const selected = [...document.querySelectorAll('#view-orders .order-row-select:checked')]
        .map((el) => el.value);
    if (!selected.length) return;

    showCustomConfirm(
        'Delete Selected Orders',
        `Delete ${selected.length} order(s)? This cannot be undone.`,
        async () => {
            try {
                const response = await fetch('/api/admin/orders/bulk-delete', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ orderIds: selected })
                });
                const result = await response.json();
                if (result.success) {
                    selected.forEach((id) => {
                        globalOrders = globalOrders.filter((o) => String(o._id) !== String(id));
                        expandedOrderIds.delete(String(id));
                    });
                    const totalOrderBadge = document.getElementById('total-orders-badge');
                    if (totalOrderBadge) totalOrderBadge.innerText = `Total: ${globalOrders.length}`;
                    showAdminSuccess('Orders Deleted', `${result.deleted ?? selected.length} order(s) removed.`);
                    applyOrderFilters(false);
                } else {
                    showToast(result.message || 'Bulk delete failed.', 'error');
                }
            } catch (err) {
                showToast('Server error during bulk delete.', 'error');
            }
        },
        'danger'
    );
};

window.bulkApplyOrderStatus = async function() {
    const selected = [...document.querySelectorAll('#view-orders .order-row-select:checked')]
        .map((el) => el.value);
    if (!selected.length) return;

    const newStatus = document.getElementById('bulk-order-status')?.value;
    if (!newStatus) return;

    let successCount = 0;
    for (const orderId of selected) {
        try {
            const response = await fetch(`/api/orders/${orderId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ status: newStatus })
            });
            const result = await response.json();
            if (result.success) successCount += 1;
        } catch (_) { /* continue */ }
    }

    if (successCount > 0) {
        showToast(`Updated ${successCount} order(s) to ${newStatus}.`, 'success');
        selected.forEach((orderId) => {
            const idx = globalOrders.findIndex((o) => String(o._id) === String(orderId));
            if (idx !== -1) globalOrders[idx] = { ...globalOrders[idx], status: newStatus };
        });
        applyOrderFilters(false);
    } else {
        showToast('Could not update selected orders.', 'error');
    }
};

/**
 * ৭.৪: লাইভ অর্ডার স্ট্যাটাস পরিবর্তন ইঞ্জিন
 * @param {string} orderId - অর্ডারের ডাটাবেজ আইডি
 * @param {string} newStatus - নতুন সিলেক্টেড স্ট্যাটাস
 */
window.changeOrderStatus = async function(orderId, newStatus) {
    try {
        const response = await fetch(`/api/orders/${orderId}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status: newStatus })
        });
        const result = await response.json();
        if (result.success) {
            const idx = globalOrders.findIndex(o => String(o._id) === String(orderId));
            if (idx !== -1) {
                globalOrders[idx] = {
                    ...globalOrders[idx],
                    status: newStatus,
                    ...(result.data?.order || result.order || {})
                };
            }
            showToast(`Order status changed to ${newStatus}!`, 'success');
            applyOrderFilters(false);
        } else showToast("Error updating status!", 'error');
    } catch (error) {
        showToast("Server connection error!", 'error');
    }
};

/**
 * ৭.৪ক: Return Requested অর্ডার অনুমোদন ও ওয়ালেট রিফান্ড
 */
window.approveOrderReturn = function(orderId) {
    showCustomConfirm(
        'Approve Return',
        'Approve this return and refund the order total to the customer wallet?',
        async () => {
            const approveBtn = document.querySelector(`tr[data-order-id="${orderId}"] .approve-return-btn`);
            const originalHtml = approveBtn ? approveBtn.innerHTML : '';

            if (approveBtn) {
                approveBtn.disabled = true;
                approveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            }

            try {
                const response = await fetch(`/api/admin/orders/${orderId}/approve-return`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    const idx = globalOrders.findIndex(o => String(o._id) === String(orderId));
                    if (idx !== -1) {
                        const updated = result.data?.order || {};
                        globalOrders[idx] = {
                            ...globalOrders[idx],
                            status: updated.status || 'Returned',
                            refundedAt: updated.refundedAt || new Date().toISOString(),
                            refundAmount: updated.refundAmount ?? result.data?.refundAmount ?? getOrderGrandTotal(globalOrders[idx]),
                            statusBeforeRefund: updated.statusBeforeRefund || 'Return Requested'
                        };
                    }
                    showAdminSuccess(
                        'Return Approved',
                        result.message || `Refund processed. Order marked as Returned.`
                    );
                    filterAndRenderOrders();
                } else {
                    showToast(result.message || 'Failed to approve return.', 'error');
                    if (approveBtn) {
                        approveBtn.disabled = false;
                        approveBtn.innerHTML = originalHtml;
                    }
                }
            } catch (error) {
                console.error('Approve return error:', error);
                showToast('Server connection error!', 'error');
                if (approveBtn) {
                    approveBtn.disabled = false;
                    approveBtn.innerHTML = originalHtml;
                }
            }
        },
        'warning'
    );
};

/**
 * ৭.৪খ: Returned/Refunded অর্ডারের রিফান্ড নিরাপদে উল্টানো (Safe Undo Refund)
 */
window.undoOrderRefund = function(orderId) {
    const order = globalOrders.find(o => String(o._id) === String(orderId));
    const refundAmount = order ? getOrderGrandTotal(order) : 0;

    showCustomConfirm(
        'Undo Refund',
        refundAmount > 0
            ? `Reverse the ৳${refundAmount.toLocaleString()} wallet refund? The amount will be deducted from the customer's wallet and the order will return to Return Requested.`
            : 'Reverse this refund? The amount will be deducted from the customer wallet and the order will return to Return Requested.',
        async () => {
            const undoBtn = document.querySelector(`tr[data-order-id="${orderId}"] .undo-refund-btn`);
            const originalHtml = undoBtn ? undoBtn.innerHTML : '';

            if (undoBtn) {
                undoBtn.disabled = true;
                undoBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            }

            try {
                const response = await fetch(`/api/admin/orders/${orderId}/undo-refund`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    const idx = globalOrders.findIndex(o => String(o._id) === String(orderId));
                    if (idx !== -1) {
                        const updated = result.data?.order || {};
                        globalOrders[idx] = {
                            ...globalOrders[idx],
                            status: updated.status || 'Return Requested',
                            refundedAt: null,
                            refundAmount: 0,
                            statusBeforeRefund: ''
                        };
                    }

                    if (typeof Swal !== 'undefined') {
                        Swal.fire({
                            icon: 'success',
                            title: 'Refund Undone',
                            text: result.message || 'Refund reversed successfully.',
                            confirmButtonColor: '#3b82f6'
                        });
                    } else {
                        showAdminSuccess('Refund Undone', result.message || 'Refund reversed successfully.');
                    }
                    filterAndRenderOrders();
                } else {
                    const errMsg = result.message || 'Failed to undo refund.';
                    if (typeof Swal !== 'undefined') {
                        Swal.fire({
                            icon: 'error',
                            title: errMsg.includes('already spent') ? 'Cannot Undo Refund' : 'Undo Failed',
                            text: errMsg,
                            confirmButtonColor: '#ef4444'
                        });
                    } else {
                        showToast(errMsg, 'error');
                    }
                    if (undoBtn) {
                        undoBtn.disabled = false;
                        undoBtn.innerHTML = originalHtml;
                    }
                }
            } catch (error) {
                console.error('Undo refund error:', error);
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'error',
                        title: 'Server Error',
                        text: 'Could not connect to the server. Please try again.',
                        confirmButtonColor: '#ef4444'
                    });
                } else {
                    showToast('Server connection error!', 'error');
                }
                if (undoBtn) {
                    undoBtn.disabled = false;
                    undoBtn.innerHTML = originalHtml;
                }
            }
        },
        'danger'
    );
};

/**
 * ۷.৫: সিঙ্গেল অর্ডার ডিলিট করার লজিক (নিরাপত্তা প্রম্পট সহ)
 * @param {string} orderId - ডিলিট করার জন্য অর্ডার আইডি
 */
window.deleteOrder = function(orderId) {
    showCustomConfirm("Delete Order", "Are you sure you want to permanently delete this order?", async () => {
        try {
            const response = await fetch(`/api/orders/${orderId}`, { 
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await response.json();
            if (response.ok && result.success) {
                removeOrderFromState(orderId);
                showAdminSuccess('Order Deleted', result.message || 'Order removed from live queue.');
            } else {
                showToast(result.message || "Failed to delete order.", "error");
            }
        } catch (err) { showToast("Server error!", "error"); }
    }, "danger");
};

/* ==========================================================================
   SECTION 7.1: INVOICE ENGINE (অর্ডার ইনভয়েস মডাল কন্ট্রোলার)
   ========================================================================== */

/**
 * ৭.৬: নির্দিষ্ট অর্ডারের কাস্টম ডিজিটাল ইনভয়েস মডাল ওপেন করা
 * @param {string} orderId - ইনভয়েস দেখার জন্য অর্ডার আইডি
 */
window.viewInvoice = function(orderId) {
    const order = globalOrders.find(o => o._id === orderId); 
    const modal = document.getElementById('invoiceModal');
    if (!order || !modal) return showToast("Invoice data not found!", "error");

    currentInvoiceOrderId = orderId;

    const subTotal = Number(order.subTotal ?? order.subtotal) || 0;
    const discountAmount = Number(order.discountAmount) || 0;
    const deliveryCharge = Number(order.deliveryCharge ?? order.shippingFee) || 0;
    const processingFee = Number(order.processingFee ?? order.payment?.processingFee) || 0;
    const grandTotal = Number(order.grandTotal ?? order.totalAmount)
        || Math.max(0, subTotal - discountAmount + deliveryCharge + processingFee);
    const shippingLocationType = order.shippingLocationType
        || (order.deliveryLocationType === 'outside' ? 'Outside City' : 'Inside City');
    const shippingDistrict = order.shippingDistrict || 'N/A';

    // মডালে কাস্টমার ডাটা পুশ করা
    document.getElementById('invOrderId').innerText = order.orderId || '#' + orderId.slice(-6).toUpperCase();
    document.getElementById('invCustomerName').innerText = order.customerName || 'N/A';
    document.getElementById('invCustomerPhone').innerText = order.customerPhone || 'N/A';
    document.getElementById('invCustomerAddress').innerText = order.customerAddress || 'N/A';
    
    document.getElementById('invPaymentMethod').innerText = order.paymentMethod ? order.paymentMethod : "COD";
    document.getElementById('invShippingLocation').innerText = `${shippingDistrict} (${shippingLocationType})`;
    document.getElementById('invNote').innerText = order.note && order.note.trim() !== "" ? order.note : "No note provided";

    // 🚚 কুরিয়ার বুকিং ডিটেইলস — শুধু বুক করা অর্ডারের জন্য দেখানো হয়
    const courierRow = document.getElementById('invCourierRow');
    const courierInfoEl = document.getElementById('invCourierInfo');
    const invTrackingId = String(order.courierTrackingId || '').trim();
    if (courierRow && courierInfoEl) {
        if (invTrackingId) {
            const invProvider = normalizeAdminCourierSlug(order.courierProvider || adminCourierConfig.provider || 'steadfast');
            const invProviderLabel = COURIER_PROVIDER_LABELS[invProvider] || invProvider;
            const consignment = order.courierConsignmentId ? ` · Consignment: ${order.courierConsignmentId}` : '';
            courierInfoEl.innerText = `${invProviderLabel} — ${invTrackingId}${consignment}`;
            courierRow.style.display = '';
        } else {
            courierRow.style.display = 'none';
        }
    }

    document.getElementById('invSubTotal').innerText = formatAdminPrice(subTotal);

    const discountRow = document.getElementById('invDiscountRow');
    if (discountAmount > 0 && discountRow) {
        discountRow.style.display = 'flex';
        document.getElementById('invDiscountAmount').innerText = `-${formatAdminPrice(discountAmount)}`;
        document.getElementById('invCouponCode').innerText = order.couponCode || '';
    } else if (discountRow) {
        discountRow.style.display = 'none';
    }

    const deliveryEl = document.getElementById('invDeliveryCharge');
    if (deliveryEl) {
        deliveryEl.innerText = deliveryCharge === 0 ? 'Free Shipping' : formatAdminPrice(deliveryCharge);
    }

    document.getElementById('invTotalAmount').innerText = formatAdminPrice(grandTotal);

    // আইটেম লিস্ট জেনারেট করা
    const itemsContainer = document.getElementById('invItemsList');
    let itemsHTML = '';
    if (order.items) {
        order.items.forEach(item => {
            itemsHTML += `<div style="display:flex; justify-content:space-between; padding: 10px 0; border-bottom: 1px dashed #e2e8f0;">
                <span><i class="fa-solid fa-cube text-muted"></i> ${item.name} (x${item.quantity})</span>
                <b class="text-main">${formatAdminPrice((item.price || 0) * (item.quantity || 1))}</b>
            </div>`;
        });
    }
    itemsContainer.innerHTML = itemsHTML;

    renderInvoicePaymentProofSection(order);

    modal.style.display = 'flex'; // মডাল প্রদর্শন
};

function renderInvoicePaymentProofSection(order) {
    const section = document.getElementById('invPaymentProofSection');
    if (!section) return;

    const isManual = String(order.payment?.type || '').toLowerCase() === 'manual';
    const proof = order.paymentProof || {};
    const proofStatus = String(proof.status || 'none').toLowerCase();

    if (!isManual) {
        section.style.display = 'none';
        return;
    }

    section.style.display = '';

    const statusEl = document.getElementById('invPaymentProofStatus');
    const trxEl = document.getElementById('invPaymentProofTrxId');
    const submittedEl = document.getElementById('invPaymentProofSubmittedAt');
    const screenshotWrap = document.getElementById('invPaymentProofScreenshotWrap');
    const screenshotLink = document.getElementById('invPaymentProofScreenshotLink');
    const screenshotImg = document.getElementById('invPaymentProofScreenshot');
    const adminNoteEl = document.getElementById('invPaymentProofAdminNote');
    const reviewActions = document.getElementById('invPaymentProofReviewActions');
    const rejectNoteInput = document.getElementById('invPaymentProofRejectNote');

    const statusLabels = {
        none: 'Not submitted',
        submitted: 'Awaiting review',
        approved: 'Approved',
        rejected: 'Rejected'
    };

    if (statusEl) {
        statusEl.textContent = statusLabels[proofStatus] || proofStatus;
        statusEl.className = `payment-proof-status-pill ${proofStatus}`;
    }
    if (trxEl) trxEl.textContent = proof.trxId || '—';
    if (submittedEl) {
        submittedEl.textContent = proof.submittedAt
            ? new Date(proof.submittedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
            : '—';
    }

    const screenshotUrl = String(proof.screenshotUrl || '').trim();
    if (screenshotWrap && screenshotLink && screenshotImg) {
        if (screenshotUrl) {
            screenshotLink.href = screenshotUrl;
            screenshotImg.src = screenshotUrl;
            screenshotWrap.style.display = '';
        } else {
            screenshotWrap.style.display = 'none';
            screenshotLink.href = '#';
            screenshotImg.removeAttribute('src');
        }
    }

    if (adminNoteEl) {
        const note = String(proof.adminNote || '').trim();
        if (note && proofStatus === 'rejected') {
            adminNoteEl.textContent = `Admin note: ${note}`;
            adminNoteEl.style.display = '';
        } else {
            adminNoteEl.textContent = '';
            adminNoteEl.style.display = 'none';
        }
    }

    if (reviewActions) {
        reviewActions.style.display = proofStatus === 'submitted' ? '' : 'none';
    }
    if (rejectNoteInput) rejectNoteInput.value = '';
}

window.reviewInvoicePaymentProof = async function(action) {
    const orderId = currentInvoiceOrderId;
    if (!orderId) return showToast('No order selected.', 'warning');

    const normalizedAction = String(action || '').trim().toLowerCase();
    if (!['approve', 'reject'].includes(normalizedAction)) return;

    const rejectNoteInput = document.getElementById('invPaymentProofRejectNote');
    const adminNote = rejectNoteInput ? rejectNoteInput.value.trim() : '';

    const approveBtn = document.getElementById('invApprovePaymentProofBtn');
    const rejectBtn = document.getElementById('invRejectPaymentProofBtn');
    const restore = normalizedAction === 'approve'
        ? setButtonLoading(approveBtn, 'Approving...')
        : setButtonLoading(rejectBtn, 'Rejecting...');

    try {
        const response = await fetch(`/api/admin/orders/${orderId}/review-payment-proof`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ action: normalizedAction, adminNote })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showToast(result.message || 'Payment proof updated.', 'success');
            const updated = result.data || {};
            const idx = globalOrders.findIndex(o => String(o._id) === String(orderId));
            if (idx > -1) {
                globalOrders[idx] = { ...globalOrders[idx], ...updated };
                filterAndRenderOrders();
            }
            viewInvoice(orderId);
        } else {
            showToast(result.message || 'Failed to review payment proof.', 'error');
        }
    } catch (err) {
        console.error('Review payment proof error:', err);
        showToast('Server error while reviewing payment proof.', 'error');
    } finally {
        restore();
    }
};

/**
 * ৭.৭: ইনভয়েস মডাল বন্ধ করার ফাংশন
 */
window.closeInvoiceModal = function() {
    const modal = document.getElementById('invoiceModal');
    if (modal) modal.style.display = 'none';
    currentInvoiceOrderId = null;
};

function buildAdminCompositeAddress({ street = '', upazila = '', district = '' } = {}) {
    return [street, upazila, district].filter(Boolean).join(', ');
}

window.openEditOrderShippingModal = function(orderId) {
    const resolvedOrderId = orderId || currentInvoiceOrderId;
    const order = globalOrders.find(o => String(o._id) === String(resolvedOrderId));
    if (!order) return showToast('Order not found.', 'error');

    currentInvoiceOrderId = order._id;
    document.getElementById('editShippingOrderId').value = order._id;

    const labelEl = document.getElementById('editShippingOrderLabel');
    if (labelEl) {
        labelEl.textContent = `Order #${order.orderId || order._id.slice(-6).toUpperCase()}`;
    }

    document.getElementById('editShippingName').value = order.customerName || '';
    document.getElementById('editShippingPhone').value = order.customerPhone || '';
    document.getElementById('editShippingNote').value = order.note || '';

    const districtSelect = document.getElementById('editShippingDistrict');
    const upazilaSelect = document.getElementById('editShippingUpazila');
    const parsed = parseCompositeAddressParts(
        order.customerAddress || '',
        order.shippingDistrict || '',
        ''
    );

    populateDistrictSelect(districtSelect, order.shippingDistrict || parsed.district || '');
    bindAdminDistrictUpazilaHandlers(districtSelect, upazilaSelect);

    const districtValue = order.shippingDistrict || parsed.district || districtSelect.value || '';
    if (districtValue) districtSelect.value = districtValue;
    populateAdminUpazilaSelect(districtSelect, upazilaSelect, districtValue, parsed.upazila || '');
    document.getElementById('editShippingStreet').value = parsed.street || '';

    document.getElementById('orderShippingEditModal').style.display = 'flex';
};

window.closeEditOrderShippingModal = function() {
    const modal = document.getElementById('orderShippingEditModal');
    if (modal) modal.style.display = 'none';
};

window.saveOrderShippingEdits = async function() {
    const orderId = document.getElementById('editShippingOrderId').value;
    const customerName = document.getElementById('editShippingName').value.trim();
    const customerPhone = document.getElementById('editShippingPhone').value.replace(/\D/g, '');
    const shippingDistrict = document.getElementById('editShippingDistrict')?.value?.trim() || '';
    const shippingUpazila = document.getElementById('editShippingUpazila')?.value?.trim() || '';
    const shippingStreetAddress = document.getElementById('editShippingStreet').value.trim();
    const note = document.getElementById('editShippingNote').value.trim();

    if (!customerName) return showToast('Full name is required.', 'warning');
    if (customerName.length < 2) return showToast('Full name must be at least 2 characters.', 'warning');
    if (!/^01[3-9]\d{8}$/.test(customerPhone)) {
        return showToast('Mobile must be a valid 11-digit Bangladeshi number.', 'warning');
    }
    if (!shippingDistrict) return showToast('Please select a district.', 'warning');
    if (!shippingUpazila) return showToast('Please select an upazila / thana.', 'warning');
    if (!shippingStreetAddress) return showToast('Delivery address is required.', 'warning');

    const btn = document.getElementById('saveOrderShippingBtn');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    }

    try {
        const res = await fetch(`/api/admin/orders/${orderId}/address`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                customerName,
                customerPhone,
                shippingDistrict,
                shippingUpazila,
                shippingStreetAddress,
                customerAddress: buildAdminCompositeAddress({
                    street: shippingStreetAddress,
                    upazila: shippingUpazila,
                    district: shippingDistrict
                }),
                note
            })
        });
        const result = await res.json();

        if (res.ok && result.success) {
            const updated = result.data || {};
            const idx = globalOrders.findIndex(o => String(o._id) === String(orderId));
            if (idx > -1) {
                globalOrders[idx] = { ...globalOrders[idx], ...updated };
                filterAndRenderOrders();
            }
            showToast(result.message || 'Shipping details updated.', 'success');
            closeEditOrderShippingModal();
            if (currentInvoiceOrderId === orderId) {
                viewInvoice(orderId);
            }
        } else {
            showToast(result.message || 'Failed to update shipping details.', 'error');
        }
    } catch (error) {
        showToast('Server error while saving shipping details.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
};

window.printInvoice = function() {
    document.body.classList.add('printing-invoice');
    const cleanup = () => {
        document.body.classList.remove('printing-invoice');
        window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
};

/* ==========================================================================
   SECTION 7.2: ORDER PAGINATION CONTROLS (অর্ডার পেজিনেশন নেভিগেশন)
   ========================================================================== */

/**
 * ৭.৮: প্রতি পেজে কতটি অর্ডার দেখাবে তা পরিবর্তন করার ফাংশন
 */
window.changeOrderPageSize = function() {
    const select = document.getElementById('order-pg-limit') || document.getElementById('orderItemsPerPage');
    if (orderPg && select) {
        orderPg.changeLimit(select.value);
    } else if (select) {
        ordersPerPage = parseInt(select.value, 10);
        currentOrderPage = 1;
        renderOrderTable();
    }
};

function getOrderPageNumbers(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

    const pages = [];
    if (current <= 4) {
        pages.push(1, 2, 3, 4, 5, '...', total);
    } else if (current >= total - 3) {
        pages.push(1, '...', total - 4, total - 3, total - 2, total - 1, total);
    } else {
        pages.push(1, '...', current - 1, current, current + 1, '...', total);
    }
    return pages;
}

function renderOrderPaginationControls(totalPages) {
    const paginationContainer = document.getElementById('dynamic-order-pages');
    if (!paginationContainer) return;

    let html = '';
    html += `<button type="button" class="pg-btn" ${currentOrderPage === 1 ? 'disabled' : ''} onclick="goToPreviousOrderPage()">← Prev</button>`;

    const pages = getOrderPageNumbers(currentOrderPage, totalPages);
    pages.forEach((p) => {
        if (p === '...') {
            html += '<span class="pg-dots">...</span>';
        } else {
            html += `<button type="button" class="pg-btn ${p === currentOrderPage ? 'active' : ''}" onclick="goToOrderPage(${p})">${p}</button>`;
        }
    });

    html += `<button type="button" class="pg-btn" ${currentOrderPage === totalPages || totalPages === 0 ? 'disabled' : ''} onclick="goToNextOrderPage()">Next →</button>`;

    paginationContainer.innerHTML = html;

    const jumpInput = document.getElementById('order-jump-page');
    if (jumpInput) {
        jumpInput.max = totalPages || 1;
        jumpInput.placeholder = String(currentOrderPage);
    }
}

window.jumpToOrderPage = function() {
    const val = parseInt(document.getElementById('order-pg-jump')?.value || document.getElementById('order-jump-page')?.value, 10);
    if (orderPg) orderPg.goTo(val);
    else if (val >= 1) goToOrderPage(val);
};

window.goToPreviousOrderPage = function() {
    if (orderPg) orderPg.goTo(orderPg.currentPage - 1);
    else if (currentOrderPage > 1) {
        currentOrderPage--;
        renderOrderTable();
    }
};

window.goToNextOrderPage = function() {
    if (orderPg) orderPg.goTo(orderPg.currentPage + 1);
    else {
        const totalItems = currentFilteredOrders.length;
        const totalPages = Math.ceil(totalItems / ordersPerPage) || 1;
        if (currentOrderPage < totalPages) {
            currentOrderPage++;
            renderOrderTable();
        }
    }
};

window.goToOrderPage = function(pageNumber) {
    if (orderPg) orderPg.goTo(pageNumber);
    else {
        currentOrderPage = pageNumber;
        renderOrderTable();
    }
};

// সার্চ ইভেন্ট লিসেনার (fallback if inline handler missing)
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = getOrderSearchInputEl();
    if (searchInput && !searchInput.dataset.boundSearch) {
        searchInput.dataset.boundSearch = '1';
        searchInput.addEventListener('input', () => debounceSearch());
    }
});



/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    addManualOrderLine,
    applyOrderFilters,
    buildAdminCompositeAddress,
    buildAdminOrderStatusCell,
    buildAdminPaymentProofPendingBadge,
    buildCourierActionHtml,
    buildManualLinePayload,
    cacheAdminCourierSettings,
    fetchLiveOrders,
    fetchPendingWhatsAppAlerts,
    formatManualMoney,
    getCourierTrackingUrl,
    getManualOrderProductId,
    getOrderPageNumbers,
    getOrderReasonDetails,
    getSelectedManualProduct,
    loadManualOrderCatalog,
    maybeOpenOrderFromDeepLink,
    normalizeAdminCourierSlug,
    orderMatchesSandboxFilter,
    populateManualProductSelect,
    populateManualVariantSelect,
    refreshAdminCourierStatus,
    renderInvoicePaymentProofSection,
    renderManualOrderLines,
    renderOrderPaginationControls,
    renderWhatsAppAlertDropdown,
    resetManualOrderForm,
    setupManualOrderEngine,
    setupWhatsAppAlertBadge,
    submitManualOrder,
    updateManualOrderTotals,
    updateManualVariantStockHint
});

