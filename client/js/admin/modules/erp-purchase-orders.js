/**
 * Project: EOnlineBazar — ERP Purchase Orders
 * File: js/admin/modules/erp-purchase-orders.js
 */
import '../admin-core.js';

let poLineItems = [];
let poProductCatalog = [];

const PO_STATUS_STYLES = {
    draft: 'background:#f1f5f9;color:#475569;',
    sent: 'background:#dbeafe;color:#1d4ed8;',
    partial: 'background:#fef9c3;color:#a16207;',
    received: 'background:#dcfce7;color:#15803d;',
    cancelled: 'background:#fee2e2;color:#b91c1c;'
};

function escapeCell(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function formatMoney(n) {
    return typeof formatAdminPrice === 'function' ? formatAdminPrice(n) : `৳ ${Number(n || 0).toLocaleString()}`;
}

function poStatusBadge(status) {
    const key = String(status || 'draft').toLowerCase();
    const style = PO_STATUS_STYLES[key] || PO_STATUS_STYLES.draft;
    return `<span class="status-badge" style="${style}">${escapeCell(key)}</span>`;
}

function closeCreatePOModal() {
    const modal = document.getElementById('createPOModal');
    if (modal) modal.style.display = 'none';
}

function closeReceivePOModal() {
    const modal = document.getElementById('receivePOModal');
    if (modal) modal.style.display = 'none';
}

function resetPOForm() {
    poLineItems = [];
    document.getElementById('poSupplierSelect').value = '';
    document.getElementById('poExpectedDate').value = '';
    document.getElementById('poNotes').value = '';
    document.getElementById('poLineProduct').value = '';
    document.getElementById('poLineQty').value = '1';
    document.getElementById('poLineUnitCost').value = '0';
    renderPOLineItemsTable();
    calculatePOTotal();
}

async function loadPOSupplierDropdown() {
    const select = document.getElementById('poSupplierSelect');
    if (!select) return;

    select.innerHTML = '<option value="">Loading suppliers…</option>';
    try {
        const res = await fetch('/api/admin/suppliers?all=true&status=active', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        const rows = data.data || [];
        select.innerHTML = '<option value="">— Select supplier —</option>';
        rows.forEach((s) => {
            const opt = document.createElement('option');
            opt.value = s._id;
            opt.textContent = s.name;
            select.appendChild(opt);
        });
    } catch (err) {
        console.error('loadPOSupplierDropdown:', err);
        select.innerHTML = '<option value="">Failed to load suppliers</option>';
    }
}

async function loadPOProductCatalog() {
    const select = document.getElementById('poLineProduct');
    if (!select) return;

    select.innerHTML = '<option value="">Loading products…</option>';
    try {
        const res = await fetch('/api/products?limit=500', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        poProductCatalog = Array.isArray(data)
            ? data
            : (Array.isArray(data?.products) ? data.products : (Array.isArray(data?.data) ? data.data : []));

        select.innerHTML = '<option value="">— Select product —</option>';
        poProductCatalog.forEach((p) => {
            const opt = document.createElement('option');
            opt.value = p._id || p.id;
            opt.textContent = p.name || 'Unnamed product';
            opt.dataset.price = String(p.price || 0);
            select.appendChild(opt);
        });
    } catch (err) {
        console.error('loadPOProductCatalog:', err);
        poProductCatalog = [];
        select.innerHTML = '<option value="">Failed to load products</option>';
    }
}

async function openCreatePOModal() {
    resetPOForm();
    const modal = document.getElementById('createPOModal');
    if (modal) modal.style.display = 'flex';
    await Promise.all([loadPOSupplierDropdown(), loadPOProductCatalog()]);
}

function addPOLineItem() {
    const productSelect = document.getElementById('poLineProduct');
    const productId = productSelect?.value || '';
    const qty = Math.max(1, Number(document.getElementById('poLineQty')?.value) || 1);
    const unitCost = Math.max(0, Number(document.getElementById('poLineUnitCost')?.value) || 0);

    if (!productId) {
        showToast('Select a product for the line item.', 'warning');
        return;
    }

    const product = poProductCatalog.find((p) => String(p._id || p.id) === String(productId));
    if (!product) {
        showToast('Product not found.', 'error');
        return;
    }

    poLineItems.push({
        productId,
        productName: product.name || 'Product',
        qty,
        unitCost
    });

    document.getElementById('poLineQty').value = '1';
    document.getElementById('poLineUnitCost').value = '0';
    productSelect.value = '';

    renderPOLineItemsTable();
    calculatePOTotal();
}

function removePOLineItem(index) {
    poLineItems.splice(index, 1);
    renderPOLineItemsTable();
    calculatePOTotal();
}

function renderPOLineItemsTable() {
    const tbody = document.getElementById('poLineItemsBody');
    if (!tbody) return;

    if (!poLineItems.length) {
        tbody.innerHTML = '<tr class="manual-order-empty-row"><td colspan="5">No line items yet.</td></tr>';
        return;
    }

    tbody.innerHTML = poLineItems.map((line, index) => `
        <tr>
            <td>${escapeCell(line.productName)}</td>
            <td>${line.qty}</td>
            <td>${formatMoney(line.unitCost)}</td>
            <td>${formatMoney(line.qty * line.unitCost)}</td>
            <td>
                <button type="button" class="catalog-action-btn delete" onclick="removePOLineItem(${index})" title="Remove">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function calculatePOTotal() {
    const total = poLineItems.reduce((sum, line) => sum + (line.qty * line.unitCost), 0);
    const el = document.getElementById('poTotalPreview');
    if (el) el.innerHTML = `PO Total: <strong>${formatMoney(total)}</strong>`;
    return total;
}

async function savePO() {
    const supplierId = document.getElementById('poSupplierSelect')?.value?.trim();
    const expectedDate = document.getElementById('poExpectedDate')?.value || null;
    const notes = document.getElementById('poNotes')?.value?.trim() || '';

    if (!supplierId) {
        showToast('Select a supplier.', 'warning');
        return;
    }
    if (!poLineItems.length) {
        showToast('Add at least one line item.', 'warning');
        return;
    }

    const saveBtn = document.getElementById('poSaveBtn');
    if (saveBtn) saveBtn.disabled = true;

    try {
        const res = await fetch('/api/admin/purchase-orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                supplierId,
                expectedDate,
                notes,
                status: 'sent',
                items: poLineItems.map((line) => ({
                    productId: line.productId,
                    qty: line.qty,
                    unitCost: line.unitCost
                }))
            })
        });
        const result = await res.json();

        if (result.success) {
            showAdminSuccess('PO Created', result.message || 'Purchase order created.');
            closeCreatePOModal();
            await loadPOs();
        } else {
            showToast(result.message || 'Failed to create PO.', 'error');
        }
    } catch (err) {
        console.error('savePO:', err);
        showToast('Server error while creating PO.', 'error');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

async function loadPOs() {
    const tbody = document.getElementById('purchaseOrdersTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" class="loading-container"><div class="spinner"></div><p>Loading purchase orders…</p></td></tr>';

    try {
        const res = await fetch('/api/admin/purchase-orders?limit=50', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        const rows = data.data || [];

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="table-status-empty">No purchase orders yet.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map((po) => {
            const supplierName = po.supplierId?.name || '—';
            const warehouseName = po.warehouseId?.name || '—';
            const expected = po.expectedDate
                ? new Date(po.expectedDate).toLocaleDateString('en-GB')
                : '—';
            const status = String(po.status || 'draft').toLowerCase();
            const canReceive = status === 'sent' || status === 'partial';
            const canCancel = status === 'draft' || status === 'sent';

            return `
            <tr>
                <td><strong>${escapeCell(po.poNumber || po._id)}</strong></td>
                <td>${escapeCell(supplierName)}</td>
                <td>${escapeCell(warehouseName)}</td>
                <td>${poStatusBadge(status)}</td>
                <td>${formatMoney(po.totalCost)}</td>
                <td>${expected}</td>
                <td>
                    <div class="catalog-actions" style="flex-wrap:wrap;gap:4px;">
                        ${canReceive ? `<button type="button" class="btn-secondary" style="font-size:11px;padding:4px 8px;" onclick="openReceivePOModal('${po._id}')">
                            <i class="fa-solid fa-dolly"></i> Receive
                        </button>` : ''}
                        ${canCancel ? `<button type="button" class="catalog-action-btn delete" onclick="cancelPO('${po._id}')" title="Cancel PO">
                            <i class="fa-solid fa-ban"></i>
                        </button>` : ''}
                    </div>
                </td>
            </tr>`;
        }).join('');
    } catch (err) {
        console.error('loadPOs:', err);
        tbody.innerHTML = '<tr><td colspan="7" class="table-status-error">Failed to load purchase orders.</td></tr>';
    }
}

async function openReceivePOModal(id) {
    try {
        const res = await fetch(`/api/admin/purchase-orders/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const result = await res.json();
        if (!result.success || !result.data) {
            showToast(result.message || 'PO not found.', 'error');
            return;
        }

        const po = result.data;
        document.getElementById('receivePOId').value = po._id;

        const title = document.getElementById('receivePOModalTitle');
        if (title) title.innerHTML = `<i class="fa-solid fa-dolly"></i> Receive — ${escapeCell(po.poNumber || po._id)}`;

        const tbody = document.getElementById('receivePOLinesBody');
        const items = Array.isArray(po.items) ? po.items : [];

        tbody.innerHTML = items.map((item) => {
            const ordered = Number(item.qty) || 0;
            const received = Number(item.receivedQty) || 0;
            const outstanding = Math.max(0, ordered - received);
            return `
                <tr>
                    <td>${escapeCell(item.productName || 'Product')}</td>
                    <td>${ordered}</td>
                    <td>${received}</td>
                    <td>
                        <input type="number" class="pf-input po-receive-qty"
                               data-item-id="${item._id}"
                               min="0" max="${outstanding}" value="${outstanding}"
                               style="width:80px;" ${outstanding === 0 ? 'disabled' : ''}>
                    </td>
                </tr>`;
        }).join('');

        const modal = document.getElementById('receivePOModal');
        if (modal) modal.style.display = 'flex';
    } catch (err) {
        console.error('openReceivePOModal:', err);
        showToast('Failed to load PO details.', 'error');
    }
}

async function receivePO(id) {
    const inputs = document.querySelectorAll('#receivePOLinesBody .po-receive-qty');
    const items = [];

    inputs.forEach((input) => {
        const itemId = input.dataset.itemId;
        const receivedQty = Number(input.value) || 0;
        if (itemId && receivedQty > 0) {
            items.push({ itemId, receivedQty });
        }
    });

    if (!items.length) {
        showToast('Enter at least one quantity to receive.', 'warning');
        return;
    }

    try {
        const res = await fetch(`/api/admin/purchase-orders/${id}/receive`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ items })
        });
        const result = await res.json();

        if (result.success) {
            showAdminSuccess('Goods Received', result.message || 'Stock updated.');
            if (Array.isArray(result.warnings) && result.warnings.length) {
                result.warnings.forEach((w) => showToast(w, 'warning'));
            }
            closeReceivePOModal();
            await loadPOs();
        } else {
            showToast(result.message || 'Failed to receive items.', 'error');
        }
    } catch (err) {
        console.error('receivePO:', err);
        showToast('Server error while receiving PO.', 'error');
    }
}

function cancelPO(id) {
    showCustomConfirm('Cancel Purchase Order', 'Cancel this PO? This cannot be undone if no goods were received.', async () => {
        try {
            const res = await fetch(`/api/admin/purchase-orders/${id}/cancel`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ reason: 'Cancelled from admin panel' })
            });
            const result = await res.json();
            if (result.success) {
                showAdminSuccess('PO Cancelled', result.message || 'Purchase order cancelled.');
                await loadPOs();
            } else {
                showToast(result.message || 'Failed to cancel PO.', 'error');
            }
        } catch (err) {
            console.error('cancelPO:', err);
            showToast('Failed to cancel PO.', 'error');
        }
    }, 'danger');
}

function setupPurchaseOrdersSection() {
    const refreshBtn = document.getElementById('purchaseOrdersRefreshBtn');
    if (refreshBtn && !refreshBtn.dataset.bound) {
        refreshBtn.dataset.bound = '1';
        refreshBtn.addEventListener('click', loadPOs);
    }

    const productSelect = document.getElementById('poLineProduct');
    if (productSelect && !productSelect.dataset.bound) {
        productSelect.dataset.bound = '1';
        productSelect.addEventListener('change', () => {
            const opt = productSelect.selectedOptions[0];
            if (opt?.dataset?.price) {
                document.getElementById('poLineUnitCost').value = opt.dataset.price;
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', setupPurchaseOrdersSection);

window.loadPOs = loadPOs;
window.loadPurchaseOrdersSection = loadPOs;
window.openCreatePOModal = openCreatePOModal;
window.closeCreatePOModal = closeCreatePOModal;
window.savePO = savePO;
window.addPOLineItem = addPOLineItem;
window.removePOLineItem = removePOLineItem;
window.calculatePOTotal = calculatePOTotal;
window.openReceivePOModal = openReceivePOModal;
window.closeReceivePOModal = closeReceivePOModal;
window.receivePO = receivePO;
window.cancelPO = cancelPO;
