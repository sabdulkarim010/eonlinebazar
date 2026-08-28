/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/orders-editor.js
 * Description: Unified Master Order Editor — shipping details + interactive order items.
 */
/* Dependencies: token, globalOrders, currentInvoiceOrderId, showToast, filterAndRenderOrders, viewInvoice (window) */
/* Exposes: window.buildAdminCompositeAddress, window.changeMasterOrderItemQty, window.closeEditOrderShippingModal, window.handleSelectMasterOrderProduct, window.openEditOrderShippingModal, window.removeMasterOrderItem, window.saveOrderShippingEdits, window.setupMasterOrderEditor, window.switchMasterOrderEditorTab */

import '../admin-core.js';

function buildAdminCompositeAddress({ street = '', upazila = '', district = '' } = {}) {
    return [street, upazila, district].filter(Boolean).join(', ');
}

function getMasterOrderDraftMeta() {
    return window.masterOrderDraftMeta || {
        deliveryCharge: 0,
        discountAmount: 0,
        processingFee: 0,
        walletApplied: 0
    };
}

function formatMasterOrderMoney(value) {
    if (typeof formatAdminPrice === 'function') return formatAdminPrice(value);
    return `৳${Number(value || 0).toLocaleString('en-US')}`;
}

function getMasterOrderItemThumb(item) {
    const raw = item?.image || item?.imageUrl || item?.products
        || (Array.isArray(item?.images) ? item.images[0] : '')
        || '';
    const resolved = typeof adminProductImageSrc === 'function'
        ? adminProductImageSrc(raw)
        : String(raw || '').trim();
    return resolved || '/images/placeholder-product.svg';
}

function getMasterOrderLineKey(item = {}) {
    const pid = String(item.productId || item.id || item._id || '').trim();
    const vid = String(item.variantId || item.variantSku || '').trim().toLowerCase();
    return `${pid}::${vid}`;
}

function collectItemIdentityIds(item = {}) {
    return [item.productId, item.id, item._id]
        .map((value) => String(value || '').trim())
        .filter(Boolean);
}

function findDraftItemIndex(line = {}) {
    const incomingIds = new Set(collectItemIdentityIds(line));
    const incomingVariant = String(line.variantId || line.variantSku || '').trim().toLowerCase();
    const items = Array.isArray(window.masterOrderDraftItems) ? window.masterOrderDraftItems : [];

    return items.findIndex((item) => {
        const itemVariant = String(item.variantId || item.variantSku || '').trim().toLowerCase();
        if (itemVariant !== incomingVariant) return false;
        return collectItemIdentityIds(item).some((id) => incomingIds.has(id));
    });
}

function ensureMasterOrderDraftItems() {
    if (!Array.isArray(window.masterOrderDraftItems)) window.masterOrderDraftItems = [];
    return window.masterOrderDraftItems;
}

function notifyMasterOrder(icon, title, text) {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon,
            title,
            text,
            confirmButtonColor: icon === 'success' ? '#3b82f6' : '#ef4444'
        });
        return;
    }
    showToast(text || title, icon === 'success' ? 'success' : (icon === 'warning' ? 'warning' : 'error'));
}

function cloneOrderItems(order) {
    return (Array.isArray(order?.items) ? order.items : []).map((item) => ({
        ...item,
        productId: item.productId || item.id || item._id || '',
        id: item.id || item.productId || item._id || '',
        name: item.name || 'Product',
        price: Number(item.price) || 0,
        quantity: Math.max(1, Number(item.quantity) || 1),
        image: item.image || item.imageUrl || item.products || '',
        variantId: item.variantId || '',
        variantSku: item.variantSku || '',
        variantLabel: item.variantLabel || '',
        variantAttribute: item.variantAttribute || '',
        variantValue: item.variantValue || ''
    }));
}

function computeMasterOrderTotals() {
    const items = window.masterOrderDraftItems || [];
    const meta = getMasterOrderDraftMeta();
    const subtotal = items.reduce(
        (sum, item) => sum + ((Number(item.price) || 0) * (Number(item.quantity) || 0)),
        0
    );
    const discount = Math.min(Math.max(0, Number(meta.discountAmount) || 0), subtotal);
    const delivery = Math.max(0, Number(meta.deliveryCharge) || 0);
    const fee = Math.max(0, Number(meta.processingFee) || 0);
    const wallet = Math.max(0, Number(meta.walletApplied) || 0);
    const grandTotal = Math.max(0, subtotal - discount + delivery + fee - wallet);
    return { subtotal, discount, delivery, fee, wallet, grandTotal };
}

function renderMasterOrderSummary() {
    const { subtotal, discount, delivery, fee, wallet, grandTotal } = computeMasterOrderTotals();
    const footer = document.getElementById('masterOrderSummaryFooter');
    const subEl = document.getElementById('masterOrderSubtotal');
    const totalEl = document.getElementById('masterOrderGrandTotal');
    if (subEl) subEl.textContent = formatMasterOrderMoney(subtotal);
    if (totalEl) totalEl.textContent = formatMasterOrderMoney(grandTotal);
    if (!footer) return;

    const extras = [];
    if (discount > 0) extras.push(`Discount: <strong>-${formatMasterOrderMoney(discount)}</strong>`);
    if (delivery > 0) extras.push(`Delivery: <strong>${formatMasterOrderMoney(delivery)}</strong>`);
    else extras.push('Delivery: <strong>Free</strong>');
    if (fee > 0) extras.push(`Fee: <strong>${formatMasterOrderMoney(fee)}</strong>`);
    if (wallet > 0) extras.push(`Wallet: <strong>-${formatMasterOrderMoney(wallet)}</strong>`);

    footer.innerHTML = `
        <span>Subtotal: <strong id="masterOrderSubtotal">${formatMasterOrderMoney(subtotal)}</strong></span>
        ${extras.map((html) => `<span>${html}</span>`).join('')}
        <span>Final Total: <strong id="masterOrderGrandTotal">${formatMasterOrderMoney(grandTotal)}</strong></span>
    `;
}

function renderMasterOrderItems() {
    const tbody = document.getElementById('masterOrderItemsBody');
    if (!tbody) return;

    const items = window.masterOrderDraftItems || [];
    if (!items.length) {
        tbody.innerHTML = '<tr class="master-order-empty-row"><td colspan="5">No items on this order. Search above to add products.</td></tr>';
        renderMasterOrderSummary();
        return;
    }

    tbody.innerHTML = items.map((item, index) => {
        const qty = Math.max(1, Number(item.quantity) || 1);
        const price = Number(item.price) || 0;
        const lineTotal = price * qty;
        const variant = item.variantLabel ? `<small>${escHtml(item.variantLabel)}</small>` : '';
        const thumb = escHtml(getMasterOrderItemThumb(item));
        const name = escHtml(item.name || 'Product');
        return `<tr>
            <td>
                <div class="master-order-item-cell">
                    <img class="master-order-item-thumb" src="${thumb}" alt="" onerror="${ADMIN_IMG_FALLBACK_ONERROR || ''}">
                    <div>
                        <strong>${name}</strong>
                        ${variant}
                    </div>
                </div>
            </td>
            <td>${formatMasterOrderMoney(price)}</td>
            <td>
                <div class="master-order-qty-stepper">
                    <button type="button" onclick="changeMasterOrderItemQty(${index}, -1)" aria-label="Decrease quantity">−</button>
                    <span>${qty}</span>
                    <button type="button" onclick="changeMasterOrderItemQty(${index}, 1)" aria-label="Increase quantity">+</button>
                </div>
            </td>
            <td>${formatMasterOrderMoney(lineTotal)}</td>
            <td>
                <button type="button" class="master-order-remove-btn" onclick="removeMasterOrderItem(${index})" title="Remove item" aria-label="Remove item">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        </tr>`;
    }).join('');

    renderMasterOrderSummary();
}

function hideMasterOrderSearchResults() {
    const results = document.getElementById('masterOrderProductResults');
    if (results) {
        results.hidden = true;
        results.innerHTML = '';
    }
    window.masterOrderSearchMatches = [];
}

function getCatalogProductId(product) {
    if (typeof getManualOrderProductId === 'function') return getManualOrderProductId(product);
    return String(product?._id || product?.productId || product?.id || '');
}

function getCatalogAvailableStock(product, variantIndex = -1) {
    const variants = Array.isArray(product?.variants) ? product.variants : [];
    if (variantIndex >= 0 && variants[variantIndex]) {
        return Math.max(0, Number(variants[variantIndex].stock) || 0);
    }
    return Math.max(0, Number(product?.stockQuantity ?? product?.stock) || 0);
}

function resolveDefaultVariantIndex(product) {
    const variants = Array.isArray(product?.variants) ? product.variants : [];
    if (!variants.length) return -1;
    const inStockIndex = variants.findIndex((variant) => (Number(variant.stock) || 0) > 0);
    if (inStockIndex > -1) return inStockIndex;
    const flagged = variants.findIndex((variant) => variant.isDefault === true || variant.default === true);
    return flagged > -1 ? flagged : 0;
}

function buildMasterOrderLineFromCatalog(product, variantIndex = -1, quantity = 1) {
    if (typeof buildManualLinePayload === 'function') {
        const payload = buildManualLinePayload(product, variantIndex, quantity);
        payload.image = getMasterOrderItemThumb(product);
        payload.name = product.name || product.title || payload.name;
        payload._id = product._id || payload.id;
        payload.variantIndex = variantIndex;
        return payload;
    }

    const variants = Array.isArray(product.variants) ? product.variants : [];
    const variant = variantIndex >= 0 ? variants[variantIndex] : null;
    const attrs = variant && typeof getVariantAttributesFromDoc === 'function'
        ? getVariantAttributesFromDoc(variant)
        : {};
    return {
        productId: getCatalogProductId(product),
        id: getCatalogProductId(product),
        name: product.name || product.title,
        quantity,
        price: Number(variant?.price ?? product.price) || 0,
        image: getMasterOrderItemThumb(product),
        _id: product._id || product.id,
        variantIndex,
        variantSku: variant?.sku || '',
        variantId: variant?.sku || (typeof combinationKey === 'function' ? combinationKey(attrs) : ''),
        variantLabel: variant && typeof formatCombinationLabel === 'function'
            ? formatCombinationLabel(attrs)
            : '',
        variantAttribute: Object.entries(attrs).map(([k, v]) => `${k}:${v}`).join(','),
        variantValue: Object.values(attrs).join(', ')
    };
}

function closeMasterOrderSearch() {
    hideMasterOrderSearchResults();
    const search = document.getElementById('masterOrderProductSearch');
    if (search) search.value = '';
}

function addMasterOrderCatalogLine(product, variantIndex = -1) {
    if (!product) return false;

    const resolvedVariantIndex = Number.isInteger(variantIndex) && variantIndex >= 0
        ? variantIndex
        : resolveDefaultVariantIndex(product);
    const line = buildMasterOrderLineFromCatalog(product, resolvedVariantIndex, 1);
    const items = ensureMasterOrderDraftItems();
    const existingIdx = findDraftItemIndex(line);
    const available = getCatalogAvailableStock(product, resolvedVariantIndex);
    const originalQty = existingIdx > -1
        ? (window.masterOrderOriginalQtyMap?.[getMasterOrderLineKey(items[existingIdx])]
            || window.masterOrderOriginalQtyMap?.[getMasterOrderLineKey(line)]
            || 0)
        : 0;

    if (existingIdx > -1) {
        const nextQty = (Number(items[existingIdx].quantity) || 0) + 1;
        if (nextQty > available + originalQty) {
            notifyMasterOrder('warning', 'Insufficient stock', `Available stock: ${available + originalQty}.`);
            return false;
        }
        items[existingIdx].quantity = nextQty;
    } else {
        if (available < 1) {
            notifyMasterOrder('warning', 'Out of stock', `"${product.name || product.title || 'This product'}" is currently out of stock.`);
            return false;
        }
        items.push(line);
    }

    closeMasterOrderSearch();
    renderMasterOrderItems();
    return true;
}

function handleSelectMasterOrderProduct(product, variantIndex) {
    if (!product) return;
    addMasterOrderCatalogLine(product, variantIndex);
}

function renderMasterOrderSearchResults(query = '') {
    const results = document.getElementById('masterOrderProductResults');
    if (!results) return;

    const term = String(query || '').trim().toLowerCase();
    if (term.length < 1) {
        hideMasterOrderSearchResults();
        return;
    }

    const catalog = Array.isArray(manualOrderCatalog) ? manualOrderCatalog : [];
    const matches = catalog.filter((product) => {
        const name = String(product.name || product.title || '').toLowerCase();
        const category = String(product.category || '').toLowerCase();
        const pid = getCatalogProductId(product).toLowerCase();
        return name.includes(term) || category.includes(term) || pid.includes(term);
    }).slice(0, 12);

    window.masterOrderSearchMatches = matches;

    if (!matches.length) {
        results.hidden = false;
        results.innerHTML = '<p class="master-order-search-empty">No matching products.</p>';
        return;
    }

    results.hidden = false;
    results.innerHTML = matches.map((product, index) => {
        const name = escHtml(product.name || product.title || 'Unnamed product');
        const defaultVariantIndex = resolveDefaultVariantIndex(product);
        const variants = Array.isArray(product.variants) ? product.variants : [];
        const defaultVariant = defaultVariantIndex > -1 ? variants[defaultVariantIndex] : null;
        const price = formatMasterOrderMoney(defaultVariant?.price ?? product.price);
        const thumb = escHtml(getMasterOrderItemThumb(product));
        const variantHint = defaultVariant
            ? `<small>${escHtml(
                (typeof formatCombinationLabel === 'function'
                    ? formatCombinationLabel(typeof getVariantAttributesFromDoc === 'function'
                        ? getVariantAttributesFromDoc(defaultVariant)
                        : {})
                    : '') || defaultVariant.name || 'Default variant'
            )}</small>`
            : '<small>Default</small>';
        return `<button type="button" class="master-order-search-item" data-catalog-index="${index}">
            <img src="${thumb}" alt="" onerror="${ADMIN_IMG_FALLBACK_ONERROR || ''}">
            <span>
                <strong>${name}</strong>
                ${variantHint}
            </span>
            <b>${price}</b>
        </button>`;
    }).join('');
}

window.switchMasterOrderEditorTab = function switchMasterOrderEditorTab(tabName) {
    const target = tabName === 'items' ? 'items' : 'shipping';
    document.querySelectorAll('.master-order-tab').forEach((btn) => {
        const isActive = btn.dataset.tab === target;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    const shippingPanel = document.getElementById('masterOrderPanelShipping');
    const itemsPanel = document.getElementById('masterOrderPanelItems');
    if (shippingPanel) shippingPanel.hidden = target !== 'shipping';
    if (itemsPanel) itemsPanel.hidden = target !== 'items';
    if (target !== 'items') hideMasterOrderSearchResults();
};

window.changeMasterOrderItemQty = function changeMasterOrderItemQty(index, delta) {
    const items = window.masterOrderDraftItems || [];
    const item = items[index];
    if (!item) return;

    const nextQty = Math.max(1, (Number(item.quantity) || 1) + Number(delta || 0));
    if (Number(delta) > 0) {
        const catalog = Array.isArray(manualOrderCatalog) ? manualOrderCatalog : [];
        const ids = new Set(collectItemIdentityIds(item));
        const product = catalog.find((p) => collectItemIdentityIds(p).some((id) => ids.has(id)));
        if (product) {
            const variants = Array.isArray(product.variants) ? product.variants : [];
            let variantIndex = Number.isInteger(item.variantIndex) ? item.variantIndex : -1;
            if (variantIndex < 0 && variants.length && (item.variantId || item.variantSku)) {
                variantIndex = variants.findIndex((variant) => {
                    const sku = String(variant.sku || '').trim().toLowerCase();
                    return sku && (sku === String(item.variantSku || '').trim().toLowerCase()
                        || sku === String(item.variantId || '').trim().toLowerCase());
                });
            }
            const available = getCatalogAvailableStock(product, variantIndex);
            const original = window.masterOrderOriginalQtyMap?.[getMasterOrderLineKey(item)] || 0;
            if (nextQty > available + original) {
                return notifyMasterOrder('warning', 'Insufficient stock', `Available stock for this line: ${available + original}.`);
            }
        }
    }

    item.quantity = nextQty;
    renderMasterOrderItems();
};

window.removeMasterOrderItem = function removeMasterOrderItem(index) {
    const items = window.masterOrderDraftItems || [];
    if (!items[index]) return;
    if (items.length <= 1) {
        return notifyMasterOrder('warning', 'Keep at least one item', 'An order must contain at least one product line.');
    }
    items.splice(index, 1);
    renderMasterOrderItems();
};

window.openEditOrderShippingModal = async function openEditOrderShippingModal(orderId) {
    const resolvedOrderId = orderId || currentInvoiceOrderId;
    const order = globalOrders.find(o => String(o._id) === String(resolvedOrderId));
    if (!order) return showToast('Order not found.', 'error');

    currentInvoiceOrderId = order._id;
    document.getElementById('editShippingOrderId').value = order._id;

    const displayId = order.orderId || String(order._id).slice(-6).toUpperCase();
    const titleEl = document.getElementById('orderShippingEditTitle');
    if (titleEl) {
        titleEl.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Edit Order Details (#${escHtml(displayId)})`;
    }
    const labelEl = document.getElementById('editShippingOrderLabel');
    if (labelEl) labelEl.textContent = `Order #${displayId}`;

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

    window.masterOrderDraftItems = cloneOrderItems(order);
    window.masterOrderOriginalQtyMap = {};
    window.masterOrderDraftItems.forEach((item) => {
        window.masterOrderOriginalQtyMap[getMasterOrderLineKey(item)] = Number(item.quantity) || 0;
    });
    window.masterOrderDraftMeta = {
        deliveryCharge: Number(order.deliveryCharge ?? order.shippingFee) || 0,
        discountAmount: Number(order.discountAmount) || 0,
        processingFee: Number(order.processingFee ?? order.payment?.processingFee) || 0,
        walletApplied: Number(order.walletApplied) || 0
    };

    switchMasterOrderEditorTab('shipping');
    renderMasterOrderItems();
    document.getElementById('orderShippingEditModal').style.display = 'flex';

    if (!Array.isArray(manualOrderCatalog) || manualOrderCatalog.length === 0) {
        if (typeof loadManualOrderCatalog === 'function') {
            await loadManualOrderCatalog();
        }
    }
};

window.closeEditOrderShippingModal = function closeEditOrderShippingModal() {
    const modal = document.getElementById('orderShippingEditModal');
    if (modal) modal.style.display = 'none';
    hideMasterOrderSearchResults();
    window.masterOrderDraftItems = [];
};

window.saveOrderShippingEdits = async function saveOrderShippingEdits() {
    const orderId = document.getElementById('editShippingOrderId').value;
    const customerName = document.getElementById('editShippingName').value.trim();
    const customerPhone = document.getElementById('editShippingPhone').value.replace(/\D/g, '');
    const shippingDistrict = document.getElementById('editShippingDistrict')?.value?.trim() || '';
    const shippingUpazila = document.getElementById('editShippingUpazila')?.value?.trim() || '';
    const shippingStreetAddress = document.getElementById('editShippingStreet').value.trim();
    const note = document.getElementById('editShippingNote').value.trim();
    const items = window.masterOrderDraftItems || [];

    if (!customerName) return notifyMasterOrder('warning', 'Missing name', 'Full name is required.');
    if (customerName.length < 2) return notifyMasterOrder('warning', 'Invalid name', 'Full name must be at least 2 characters.');
    if (!/^01[3-9]\d{8}$/.test(customerPhone)) {
        return notifyMasterOrder('warning', 'Invalid mobile', 'Mobile must be a valid 11-digit Bangladeshi number.');
    }
    if (!shippingDistrict) return notifyMasterOrder('warning', 'Select district', 'Please select a district.');
    if (!shippingUpazila) return notifyMasterOrder('warning', 'Select upazila', 'Please select an upazila / thana.');
    if (!shippingStreetAddress) return notifyMasterOrder('warning', 'Address required', 'Delivery address is required.');
    if (!items.length) return notifyMasterOrder('warning', 'No items', 'An order must contain at least one product line.');

    const btn = document.getElementById('saveOrderShippingBtn');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    }

    try {
        const res = await fetch(`/api/admin/orders/${orderId}/master-update`, {
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
                note,
                items: items.map((item) => ({
                    productId: item.productId || item.id,
                    id: item.id || item.productId,
                    quantity: Math.max(1, Number(item.quantity) || 1),
                    variantId: item.variantId || '',
                    variantSku: item.variantSku || '',
                    variantLabel: item.variantLabel || '',
                    variantAttribute: item.variantAttribute || '',
                    variantValue: item.variantValue || ''
                }))
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
            closeEditOrderShippingModal();
            notifyMasterOrder('success', 'Order updated', result.message || 'All changes saved successfully.');
            if (currentInvoiceOrderId === orderId && typeof viewInvoice === 'function') {
                viewInvoice(orderId);
            }
        } else {
            notifyMasterOrder('error', 'Update failed', result.message || 'Failed to update order details.');
        }
    } catch (error) {
        notifyMasterOrder('error', 'Server error', 'Could not save order details. Please try again.');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
};

function setupMasterOrderEditor() {
    document.querySelectorAll('.master-order-tab').forEach((btn) => {
        btn.addEventListener('click', () => switchMasterOrderEditorTab(btn.dataset.tab));
    });

    const search = document.getElementById('masterOrderProductSearch');
    if (search) {
        search.addEventListener('input', () => renderMasterOrderSearchResults(search.value));
        search.addEventListener('focus', () => {
            if (search.value.trim()) renderMasterOrderSearchResults(search.value);
        });
    }

    const results = document.getElementById('masterOrderProductResults');
    if (results && !results.dataset.bound) {
        results.dataset.bound = '1';
        results.addEventListener('mousedown', (event) => {
            const btn = event.target.closest('.master-order-search-item');
            if (!btn || !results.contains(btn)) return;
            event.preventDefault();
            event.stopPropagation();
            const matches = Array.isArray(window.masterOrderSearchMatches) ? window.masterOrderSearchMatches : [];
            const product = matches[Number(btn.dataset.catalogIndex)];
            handleSelectMasterOrderProduct(product);
        });
    }

    document.addEventListener('click', (event) => {
        const wrap = document.querySelector('.master-order-add-wrap');
        if (!wrap) return;
        const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
        const insideWrap = wrap.contains(event.target)
            || path.some((node) => node === wrap || (node && node.id === 'masterOrderProductResults'));
        if (!insideWrap) hideMasterOrderSearchResults();
    });
}

Object.assign(window, {
    buildAdminCompositeAddress,
    handleSelectMasterOrderProduct,
    setupMasterOrderEditor
});
