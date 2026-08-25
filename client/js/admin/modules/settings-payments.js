/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/settings-payments.js
 * Description: Dynamic payment methods catalog CRUD.
 */
import '../admin-core.js';
const COURIER_PROVIDER_LABELS = window.COURIER_PROVIDER_LABELS;

/* ==========================================================================
   PAYMENT METHODS CATALOG (dynamic CRUD → /api/admin/payment-methods)
   ========================================================================== */

/* shared state: adminPaymentMethodsCache lives on window (admin-core) */

/* shared state: pmRemoveLogoFlag lives on window (admin-core) */

/* shared state: pmDragSourceId lives on window (admin-core) */

function formatProcessingFeeBadge(method) {
    const fee = Number(method?.processingFee) || 0;
    if (fee <= 0) return 'No fee';
    return method?.feeType === 'flat' ? `৳${fee} fee` : `${fee}% fee`;
}

function paymentMethodFallbackIcon(method) {
    const code = String(method?.code || method?.name || '').toLowerCase();
    if (code.includes('bkash')) return 'fa-mobile-screen-button';
    if (code.includes('nagad')) return 'fa-bolt';
    if (code.includes('bank')) return 'fa-building-columns';
    if (code.includes('cod') || code.includes('cash')) return 'fa-truck-ramp-box';
    if (code.includes('visa') || code.includes('master') || code.includes('card')) return 'fa-credit-card';
    return method?.type === 'automated' ? 'fa-shield-halved' : 'fa-wallet';
}

function updatePaymentMethodsPreview() {
    const previewEl = document.getElementById('paymentGatewaySettingsPreviewText');
    const previewRow = document.getElementById('paymentGatewayPreviewRow');
    if (!previewEl) return;

    const active = adminPaymentMethodsCache.filter((m) => m.isActive);
    const badgeSettings = {
        enabledPaymentMethods: active.map((m) => ({
            id: m.code,
            name: m.name,
            logoUrl: m.logoUrl || ''
        })),
        paymentGateways: Object.fromEntries(active.map((m) => [m.code, {
            enabled: true,
            name: m.name,
            logoUrl: m.logoUrl || ''
        }]))
    };

    previewEl.textContent = active.length
        ? `${active.length} active on checkout · ${adminPaymentMethodsCache.length} total in catalog.`
        : 'No payment methods are enabled — customers cannot complete checkout.';

    if (previewRow && window.PaymentBrandLogos) {
        const ids = active.map((m) => m.code);
        previewRow.innerHTML = window.PaymentBrandLogos.renderPaymentLogoRow(ids, 'admin', badgeSettings);
        previewRow.style.display = ids.length ? 'flex' : 'none';
        previewRow.setAttribute('aria-hidden', ids.length ? 'false' : 'true');
    }
}

function renderPaymentMethodsGrid(methods = adminPaymentMethodsCache) {
    const grid = document.getElementById('paymentMethodsGrid');
    const addFooter = document.getElementById('paymentMethodsAddFooter');
    if (!grid) return;

    adminPaymentMethodsCache = Array.isArray(methods) ? methods.slice() : [];

    if (!adminPaymentMethodsCache.length) {
        if (addFooter) addFooter.hidden = true;
        grid.innerHTML = `
            <div class="pm-empty-state md:col-span-2 lg:col-span-3">
                <i class="fa-solid fa-credit-card"></i>
                <h5>No payment methods yet</h5>
                <p>Add bKash, Nagad, bank transfer, COD, or an automated gateway like SSLCommerz.</p>
                <button type="button" class="pm-add-btn" onclick="openPaymentMethodModal()">
                    <i class="fa-solid fa-plus"></i> Add New Payment Method
                </button>
            </div>`;
        updatePaymentMethodsPreview();
        return;
    }

    if (addFooter) addFooter.hidden = false;

    grid.innerHTML = adminPaymentMethodsCache.map((method) => {
        const id = escapeHtml(method.id || method._id);
        const name = escapeHtml(method.name || 'Untitled');
        const typeLabel = method.type === 'automated' ? 'Automated' : 'Manual';
        const feeLabel = escapeHtml(formatProcessingFeeBadge(method));
        const logo = method.logoUrl
            ? `<img src="${escapeHtml(method.logoUrl)}" alt="${name}" class="pm-card-logo" loading="lazy">`
            : `<span class="pm-card-logo-fallback"><i class="fa-solid ${paymentMethodFallbackIcon(method)}"></i></span>`;
        const providerChip = method.type === 'automated' && method.provider
            ? `<span class="pm-chip pm-chip--provider">${escapeHtml(method.provider)}</span>`
            : '';
        const readyChip = method.type === 'automated' && method.checkoutReady === false
            ? `<span class="pm-chip pm-chip--warn">Credentials incomplete</span>`
            : '';

        return `
            <article class="pm-method-card ${method.isActive ? 'is-active' : 'is-inactive'}" data-id="${id}" draggable="true" role="listitem">
                <div class="pm-card-top">
                    <div class="pm-card-drag" title="Drag to reorder" aria-hidden="true">
                        <i class="fa-solid fa-grip-vertical"></i>
                    </div>
                    <label class="pm-switch-label pm-card-toggle" title="${method.isActive ? 'Disable' : 'Enable'}">
                        <input type="checkbox" class="pm-switch-input pm-toggle-input" data-id="${id}" ${method.isActive ? 'checked' : ''}>
                        <span class="pm-switch-ui" aria-hidden="true"></span>
                    </label>
                </div>
                <div class="pm-card-body">
                    <div class="pm-card-logo-wrap">${logo}</div>
                    <div class="pm-card-meta">
                        <h5 class="pm-card-name">${name}</h5>
                        <div class="pm-card-chips">
                            <span class="pm-chip pm-chip--${method.type === 'automated' ? 'auto' : 'manual'}">${typeLabel}</span>
                            <span class="pm-chip pm-chip--fee">${feeLabel}</span>
                            ${providerChip}
                            ${readyChip}
                        </div>
                    </div>
                </div>
                <div class="pm-card-footer">
                    <label class="pm-sort-label">
                        <span>Order</span>
                        <input type="number" class="pm-sort-input" data-id="${id}" min="0" max="9999" value="${Number(method.sortOrder) || 0}">
                    </label>
                    <div class="pm-card-actions">
                        <button type="button" class="pm-icon-btn" data-action="edit" data-id="${id}" title="Edit">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button type="button" class="pm-icon-btn pm-icon-btn--danger" data-action="delete" data-id="${id}" title="Delete">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            </article>`;
    }).join('');

    bindPaymentMethodCardEvents();
    updatePaymentMethodsPreview();
}

window.fetchPaymentMethodsCatalog = async function fetchPaymentMethodsCatalog() {
    const grid = document.getElementById('paymentMethodsGrid');
    if (!grid) return;

    try {
        const res = await fetch('/api/admin/payment-methods', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) {
            throw new Error(data.message || 'Failed to load payment methods.');
        }
        renderPaymentMethodsGrid(data.data || []);
    } catch (err) {
        console.error('Payment methods load error:', err);
        const addFooter = document.getElementById('paymentMethodsAddFooter');
        if (addFooter) addFooter.hidden = true;
        grid.innerHTML = `
            <div class="pm-empty-state md:col-span-2 lg:col-span-3">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <h5>Could not load payment methods</h5>
                <p>${escapeHtml(err.message || 'Please try again.')}</p>
                <button type="button" class="pm-add-btn" onclick="fetchPaymentMethodsCatalog()">
                    <i class="fa-solid fa-rotate-right"></i> Retry
                </button>
            </div>`;
    }
}

function togglePaymentMethodTypeFields() {
    const type = document.getElementById('pmType')?.value || 'manual';
    const manual = document.getElementById('pmManualFields');
    const automated = document.getElementById('pmAutomatedFields');
    if (manual) manual.style.display = type === 'manual' ? '' : 'none';
    if (automated) automated.style.display = type === 'automated' ? '' : 'none';
}

function setPaymentMethodLogoPreview(url) {
    const img = document.getElementById('pmLogoPreview');
    const placeholder = document.getElementById('pmLogoPlaceholder');
    const removeBtn = document.getElementById('pmRemoveLogoBtn');
    if (!img) return;

    if (url) {
        img.src = url;
        img.classList.remove('hidden');
        placeholder?.classList.add('hidden');
        if (removeBtn) removeBtn.style.display = '';
    } else {
        img.removeAttribute('src');
        img.classList.add('hidden');
        placeholder?.classList.remove('hidden');
        if (removeBtn) removeBtn.style.display = 'none';
    }
}

function resetPaymentMethodForm() {
    const form = document.getElementById('paymentMethodForm');
    if (form) form.reset();
    document.getElementById('pmFormId').value = '';
    document.getElementById('pmType').value = 'manual';
    document.getElementById('pmFeeType').value = 'percentage';
    document.getElementById('pmProcessingFee').value = '0';
    document.getElementById('pmSortOrder').value = String(
        adminPaymentMethodsCache.reduce((max, m) => Math.max(max, Number(m.sortOrder) || 0), 0) + 1
    );
    document.getElementById('pmIsActive').checked = true;
    document.getElementById('pmIsSandbox').checked = true;
    document.getElementById('pmProvider').value = 'sslcommerz';
    document.getElementById('pmWebhookUrl').value = '';
    document.getElementById('pmStorePasswordHint').textContent = '';
    document.getElementById('pmApiKeyHint').textContent = '';
    const logoInput = document.getElementById('logoInput');
    if (logoInput) logoInput.value = '';
    pmRemoveLogoFlag = false;
    setPaymentMethodLogoPreview('');
    togglePaymentMethodTypeFields();
}

window.openPaymentMethodModal = function openPaymentMethodModal(method = null) {
    const modal = document.getElementById('paymentMethodModal');
    if (!modal) return;

    resetPaymentMethodForm();

    const title = document.getElementById('paymentMethodModalTitle');
    const subtitle = document.getElementById('paymentMethodModalSubtitle');

    if (method) {
        if (title) title.textContent = 'Edit Payment Method';
        if (subtitle) subtitle.textContent = `Updating ${method.name} · code ${method.code}`;
        document.getElementById('pmFormId').value = method.id || method._id || '';
        document.getElementById('pmName').value = method.name || '';
        document.getElementById('pmType').value = method.type || 'manual';
        document.getElementById('pmDescription').value = method.description || '';
        document.getElementById('pmSortOrder').value = String(Number(method.sortOrder) || 0);
        document.getElementById('pmProcessingFee').value = String(Number(method.processingFee) || 0);
        document.getElementById('pmFeeType').value = method.feeType || 'percentage';
        document.getElementById('pmAccountNumber').value = method.accountNumber || '';
        document.getElementById('pmInstructions').value = method.instructions || '';
        document.getElementById('pmIsActive').checked = method.isActive !== false;
        document.getElementById('pmProvider').value = method.provider || 'sslcommerz';
        document.getElementById('pmStoreId').value = method.apiConfig?.storeId || '';
        document.getElementById('pmIsSandbox').checked = method.apiConfig?.isSandbox !== false;
        document.getElementById('pmWebhookUrl').value =
            method.resolvedWebhookUrl || method.apiConfig?.webhookUrl || '';
        document.getElementById('pmStorePasswordHint').textContent = method.apiConfig?.hasStorePassword
            ? `Configured: ${method.apiConfig.storePasswordMasked || '••••'}`
            : 'Not set yet';
        document.getElementById('pmApiKeyHint').textContent = method.apiConfig?.hasApiKey
            ? `Configured: ${method.apiConfig.apiKeyMasked || '••••'}`
            : 'Not set yet';
        setPaymentMethodLogoPreview(method.logoUrl || '');
        togglePaymentMethodTypeFields();
    } else {
        if (title) title.textContent = 'Add Payment Method';
        if (subtitle) subtitle.textContent = 'Configure a manual wallet or an automated gateway.';
    }

    modal.classList.remove('pm-modal-closing');
    modal.querySelector('.pm-modal-box')?.classList.remove('pm-modal-box-closing');
    modal.style.display = 'flex';
};

window.closePaymentMethodModal = function closePaymentMethodModal() {
    const modal = document.getElementById('paymentMethodModal');
    if (!modal || modal.style.display === 'none') return;

    const box = modal.querySelector('.pm-modal-box');
    modal.classList.add('pm-modal-closing');
    box?.classList.add('pm-modal-box-closing');

    window.setTimeout(() => {
        modal.style.display = 'none';
        modal.classList.remove('pm-modal-closing');
        box?.classList.remove('pm-modal-box-closing');
        resetPaymentMethodForm();
    }, 220);
};

async function savePaymentMethodForm(event) {
    event.preventDefault();

    const id = document.getElementById('pmFormId')?.value?.trim() || '';
    const type = document.getElementById('pmType')?.value || 'manual';
    const formData = new FormData();

    formData.append('name', document.getElementById('pmName')?.value?.trim() || '');
    formData.append('type', type);
    formData.append('description', document.getElementById('pmDescription')?.value?.trim() || '');
    formData.append('sortOrder', document.getElementById('pmSortOrder')?.value || '0');
    formData.append('processingFee', document.getElementById('pmProcessingFee')?.value || '0');
    formData.append('feeType', document.getElementById('pmFeeType')?.value || 'percentage');
    formData.append('isActive', document.getElementById('pmIsActive')?.checked ? 'true' : 'false');

    if (type === 'manual') {
        formData.append('accountNumber', document.getElementById('pmAccountNumber')?.value?.trim() || '');
        formData.append('instructions', document.getElementById('pmInstructions')?.value?.trim() || '');
    } else {
        formData.append('provider', document.getElementById('pmProvider')?.value || 'custom');
        formData.append('storeId', document.getElementById('pmStoreId')?.value?.trim() || '');
        formData.append('isSandbox', document.getElementById('pmIsSandbox')?.checked ? 'true' : 'false');
        const storePassword = document.getElementById('pmStorePassword')?.value || '';
        const apiKey = document.getElementById('pmApiKey')?.value || '';
        if (storePassword) formData.append('storePassword', storePassword);
        if (apiKey) formData.append('apiKey', apiKey);
    }

    const logoFile = document.getElementById('logoInput')?.files?.[0];
    if (logoFile) formData.append('logo', logoFile);
    if (pmRemoveLogoFlag && !logoFile) formData.append('removeLogo', 'true');

    const submitBtn = document.getElementById('pmFormSubmitBtn');
    const restore = setButtonLoading(submitBtn, 'Saving...');

    try {
        const res = await fetch(id ? `/api/admin/payment-methods/${id}` : '/api/admin/payment-methods', {
            method: id ? 'PUT' : 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData
        });
        const result = await res.json();
        if (!result.success) {
            throw new Error(result.message || 'Failed to save payment method.');
        }
        showToast(result.message || 'Payment method saved.', 'success');
        closePaymentMethodModal();
        await fetchPaymentMethodsCatalog();
    } catch (err) {
        console.error('Save payment method error:', err);
        showToast(`Error: ${err.message}`, 'error');
    } finally {
        restore();
    }
}

async function togglePaymentMethodActive(id, isActive) {
    try {
        const res = await fetch(`/api/admin/payment-methods/${id}/toggle`, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ isActive })
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message || 'Toggle failed.');
        showToast(result.message || 'Updated.', result.warning ? 'warning' : 'success');
        if (result.warning) showToast(result.warning, 'warning');
        await fetchPaymentMethodsCatalog();
    } catch (err) {
        console.error('Toggle payment method error:', err);
        showToast(`Error: ${err.message}`, 'error');
        await fetchPaymentMethodsCatalog();
    }
}

function deletePaymentMethod(id) {
    const method = adminPaymentMethodsCache.find((m) => (m.id || m._id) === id);
    showCustomConfirm(
        'Delete payment method?',
        method
            ? `"${method.name}" will be removed from checkout. Existing orders keep their payment records.`
            : 'This method will be removed from checkout. Existing orders keep their payment records.',
        async () => {
            try {
                const res = await fetch(`/api/admin/payment-methods/${id}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` }
                });
                const result = await res.json();
                if (!result.success) throw new Error(result.message || 'Delete failed.');
                showToast(result.message || 'Deleted.', 'success');
                await fetchPaymentMethodsCatalog();
            } catch (err) {
                console.error('Delete payment method error:', err);
                showToast(`Error: ${err.message}`, 'error');
            }
        },
        'danger'
    );
}

async function persistPaymentMethodOrder(order) {
    try {
        const res = await fetch('/api/admin/payment-methods/reorder', {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ order })
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message || 'Reorder failed.');
        renderPaymentMethodsGrid(result.data || []);
        showToast('Display order updated.', 'success');
    } catch (err) {
        console.error('Reorder payment methods error:', err);
        showToast(`Error: ${err.message}`, 'error');
        await fetchPaymentMethodsCatalog();
    }
}

function collectPaymentMethodOrderFromDom() {
    return Array.from(document.querySelectorAll('#paymentMethodsGrid .pm-method-card')).map((card, index) => {
        const id = card.dataset.id;
        const input = card.querySelector('.pm-sort-input');
        const sortOrder = input && input.value !== ''
            ? Number(input.value)
            : index;
        return { id, sortOrder: Number.isFinite(sortOrder) ? sortOrder : index };
    });
}

function bindPaymentMethodCardEvents() {
    const grid = document.getElementById('paymentMethodsGrid');
    if (!grid) return;

    grid.querySelectorAll('.pm-toggle-input').forEach((input) => {
        input.addEventListener('change', () => {
            togglePaymentMethodActive(input.dataset.id, input.checked);
        });
    });

    grid.querySelectorAll('[data-action="edit"]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const method = adminPaymentMethodsCache.find((m) => (m.id || m._id) === btn.dataset.id);
            if (method) openPaymentMethodModal(method);
        });
    });

    grid.querySelectorAll('[data-action="delete"]').forEach((btn) => {
        btn.addEventListener('click', () => deletePaymentMethod(btn.dataset.id));
    });

    let sortTimer = null;
    grid.querySelectorAll('.pm-sort-input').forEach((input) => {
        input.addEventListener('change', () => {
            clearTimeout(sortTimer);
            sortTimer = setTimeout(() => {
                persistPaymentMethodOrder(collectPaymentMethodOrderFromDom());
            }, 250);
        });
    });

    grid.querySelectorAll('.pm-method-card').forEach((card) => {
        card.addEventListener('dragstart', (e) => {
            pmDragSourceId = card.dataset.id;
            card.classList.add('is-dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', pmDragSourceId);
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('is-dragging');
            grid.querySelectorAll('.pm-method-card').forEach((c) => c.classList.remove('is-drag-over'));
            pmDragSourceId = null;
        });
        card.addEventListener('dragover', (e) => {
            e.preventDefault();
            card.classList.add('is-drag-over');
        });
        card.addEventListener('dragleave', () => card.classList.remove('is-drag-over'));
        card.addEventListener('drop', (e) => {
            e.preventDefault();
            card.classList.remove('is-drag-over');
            const sourceId = e.dataTransfer.getData('text/plain') || pmDragSourceId;
            const targetId = card.dataset.id;
            if (!sourceId || sourceId === targetId) return;

            const cards = Array.from(grid.querySelectorAll('.pm-method-card'));
            const sourceCard = cards.find((c) => c.dataset.id === sourceId);
            if (!sourceCard) return;

            const sourceIndex = cards.indexOf(sourceCard);
            const targetIndex = cards.indexOf(card);
            if (sourceIndex < targetIndex) {
                card.after(sourceCard);
            } else {
                card.before(sourceCard);
            }

            Array.from(grid.querySelectorAll('.pm-method-card')).forEach((c, index) => {
                const sortInput = c.querySelector('.pm-sort-input');
                if (sortInput) sortInput.value = String(index + 1);
            });

            persistPaymentMethodOrder(collectPaymentMethodOrderFromDom());
        });
    });
}

function setupPaymentMethodsManager() {
    document.getElementById('addPaymentMethodBtn')?.addEventListener('click', () => openPaymentMethodModal());
    document.getElementById('pmType')?.addEventListener('change', togglePaymentMethodTypeFields);
    document.getElementById('pmModalCloseBtn')?.addEventListener('click', closePaymentMethodModal);

    document.getElementById('logoInput')?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        pmRemoveLogoFlag = false;
        const reader = new FileReader();
        reader.onload = (ev) => {
            if (typeof ev.target?.result === 'string') {
                setPaymentMethodLogoPreview(ev.target.result);
            }
        };
        reader.onerror = () => {
            showToast('Could not preview the selected logo.', 'error');
        };
        reader.readAsDataURL(file);
    });

    document.getElementById('pmRemoveLogoBtn')?.addEventListener('click', () => {
        const logoInput = document.getElementById('logoInput');
        if (logoInput) logoInput.value = '';
        pmRemoveLogoFlag = true;
        setPaymentMethodLogoPreview('');
    });

    document.getElementById('pmCopyWebhookBtn')?.addEventListener('click', async () => {
        const value = document.getElementById('pmWebhookUrl')?.value?.trim();
        if (!value) {
            showToast('Webhook URL will appear after the method is saved.', 'warning');
            return;
        }
        try {
            await navigator.clipboard.writeText(value);
            showToast('Webhook URL copied.', 'success');
        } catch (_) {
            showToast('Could not copy webhook URL.', 'error');
        }
    });

    document.getElementById('paymentMethodForm')?.addEventListener('submit', savePaymentMethodForm);
}

/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    formatProcessingFeeBadge,
    paymentMethodFallbackIcon,
    updatePaymentMethodsPreview,
    renderPaymentMethodsGrid,
    togglePaymentMethodTypeFields,
    setPaymentMethodLogoPreview,
    resetPaymentMethodForm,
    savePaymentMethodForm,
    togglePaymentMethodActive,
    deletePaymentMethod,
    persistPaymentMethodOrder,
    collectPaymentMethodOrderFromDom,
    bindPaymentMethodCardEvents,
    setupPaymentMethodsManager
});
