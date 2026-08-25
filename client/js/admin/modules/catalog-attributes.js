/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/catalog-attributes.js
 * Description: Product attribute names and values.
 */
import '../admin-core.js';
/* ==========================================================================
   SECTION 9C: ATTRIBUTE MANAGEMENT ENGINE (অ্যাট্রিবিউট মডিউল)
   ========================================================================== */

window.checkAttributeNameDuplicate = function() {
    const nameInput = document.getElementById('newAttributeName');
    const warnEl = document.getElementById('attributeNameDuplicateWarn');
    if (!nameInput || !warnEl) return false;

    const existing = findGlobalAttributeByName(nameInput.value);
    if (existing) {
        warnEl.textContent = `Attribute '${existing.name}' already exists. Click the Edit button on the table below to add more values.`;
        warnEl.hidden = false;
        return true;
    }

    warnEl.hidden = true;
    warnEl.textContent = '';
    return false;
};

async function fetchAttributes() {
    try {
        const response = await fetch('/api/attributes');
        const data = await response.json();
        if (data.success) {
            globalAttributes = data.data || [];
            renderAttributeTable();
            ensureVariationDatalists();
        }
    } catch (error) {
        console.error("🔴 Attribute load error:", error);
    }
}

function renderAttributeTable() {
    const tbody = document.getElementById('attributeTableBody');
    if (!tbody) return;

    if (globalAttributes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="cell-empty">No attributes yet. Add one using the form above.</td></tr>';
        return;
    }

    tbody.innerHTML = globalAttributes.map(attr => {
        const valueChips = (attr.values || []).map(v => `<span class="attr-value-chip">${escHtml(v)}</span>`).join(' ')
            || '<span class="cell-date">—</span>';
        return `<tr>
            <td class="cell-name">${escHtml(attr.name)}</td>
            <td>${valueChips}</td>
            <td class="cell-date">${formatCatalogDate(attr.createdAt)}</td>
            <td>${catalogActionsHtml(
                `editAttribute('${attr._id}')`,
                `deleteAttribute('${attr._id}')`
            )}</td>
        </tr>`;
    }).join('');
}

window.addAttribute = async function() {
    const nameInput = document.getElementById('newAttributeName');
    const valuesInput = document.getElementById('newAttributeValues');
    const name = nameInput.value.trim();
    const values = valuesInput.value.trim();
    if (!name) return showToast("Please enter an attribute name!", "warning");

    const existing = findGlobalAttributeByName(name);
    if (existing) {
        checkAttributeNameDuplicate();
        showToast(
            `Attribute '${existing.name}' already exists. Use Edit on the table below to add more values.`,
            'warning'
        );
        return;
    }

    try {
        const res = await fetch('/api/attributes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ name, values })
        });
        const result = await res.json();
        if (result.success) {
            showAdminSuccess('Attribute Added', result.message || 'Attribute saved successfully.');
            nameInput.value = '';
            valuesInput.value = '';
            checkAttributeNameDuplicate();
            await fetchAttributes();
        } else {
            if ((result.message || '').toLowerCase().includes('already exists')) {
                checkAttributeNameDuplicate();
            }
            showToast(result.message || 'Failed to save attribute. Please try again.', 'error');
        }
    } catch (error) {
        showToast('Failed to save attribute. Please try again.', 'error');
    }
};

window.editAttribute = function(id) {
    const attr = globalAttributes.find(a => a._id === id);
    if (!attr) return showToast('Attribute not found!', 'error');

    const existingValues = (attr.values || []).join(', ');
    openCatalogQuickEdit({
        title: `Edit Attribute — ${attr.name}`,
        label: 'Values (comma separated)',
        value: existingValues,
        placeholder: 'Append values, e.g. Black, Red',
        hint: existingValues
            ? `Current values: ${existingValues}. Edit the full list or append new values at the end.`
            : 'Enter comma-separated values for this attribute.',
        focusMode: 'end',
        onSave: async (newValues) => {
            const mergedValues = parseCommaValues(newValues);
            if (!mergedValues.length) {
                return showToast('Please enter at least one value.', 'warning');
            }
            try {
                const res = await fetch(`/api/attributes/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ values: mergedValues })
                });
                const result = await res.json();
                if (result.success) {
                    showAdminSuccess('Attribute Updated', result.message || 'Attribute updated successfully.');
                    closeCatalogQuickEdit();
                    await fetchAttributes();
                } else {
                    showToast(result.message || 'Failed to update attribute. Please try again.', 'error');
                }
            } catch (error) {
                showToast('Failed to update attribute. Please try again.', 'error');
            }
        }
    });
};

window.deleteAttribute = function(id) {
    showCustomConfirm('Delete Attribute', 'Are you sure you want to delete this attribute?', async () => {
        try {
            const res = await fetch(`/api/attributes/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await res.json();
            if (result.success) {
                globalAttributes = globalAttributes.filter(a => String(a._id) !== String(id));
                renderAttributeTable();
                showAdminSuccess('Attribute Deleted', result.message || 'Attribute removed.');
            } else {
                showToast(result.message || 'Failed to delete attribute. Please try again.', 'error');
            }
        } catch (error) {
            showToast('Failed to delete attribute. Please try again.', 'error');
        }
    }, 'danger');
};

/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    fetchAttributes,
    renderAttributeTable
});
