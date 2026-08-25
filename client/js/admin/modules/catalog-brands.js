/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/catalog-brands.js
 * Description: Brand management table and CRUD.
 */
import '../admin-core.js';
/* ==========================================================================
   SECTION 9B: BRAND MANAGEMENT ENGINE (ব্র্যান্ড ম্যানেজমেন্ট মডিউল)
   ========================================================================== */

/* shared state: globalBrands lives on window (admin-core) */

async function fetchBrands() {
    try {
        const response = await fetch('/api/brands');
        const data = await response.json();
        if (data.success) {
            globalBrands = data.data || [];
            renderBrandTable();
            renderBrandDropdown();
        }
    } catch (error) {
        console.error("🔴 Brand load error:", error);
    }
}

function renderBrandTable() {
    const tbody = document.getElementById('brandTableBody');
    if (!tbody) return;

    if (globalBrands.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="cell-empty">No brands yet. Add one using the form above.</td></tr>';
        return;
    }

    tbody.innerHTML = globalBrands.map(brand => {
        const safeName = escHtml(brand.name);
        return `<tr>
            <td class="cell-name">${safeName}</td>
            <td class="cell-date">${formatCatalogDate(brand.createdAt)}</td>
            <td>${catalogActionsHtml(
                `editBrand('${brand._id}', ${JSON.stringify(brand.name)})`,
                `deleteBrand('${brand._id}')`
            )}</td>
        </tr>`;
    }).join('');
}

window.addBrand = async function() {
    const input = document.getElementById('newBrandName');
    const name = input.value.trim();
    if (!name) return showToast("Please enter a brand name!", "warning");

    try {
        const res = await fetch('/api/brands', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ name })
        });
        const result = await res.json();
        if (result.success) {
            showAdminSuccess('Brand Added', result.message || 'Brand added successfully!');
            input.value = '';
            await fetchBrands();
        } else {
            showToast(result.message, "error");
        }
    } catch (error) {
        showToast("Server error while adding brand!", "error");
    }
};

window.editBrand = function(id, currentName) {
    openCatalogQuickEdit({
        title: 'Edit Brand',
        label: 'Brand Name',
        value: currentName,
        placeholder: 'e.g., Samsung',
        onSave: async (newName) => {
            if (newName === currentName) {
                closeCatalogQuickEdit();
                return;
            }
            try {
                const res = await fetch(`/api/brands/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ name: newName })
                });
                const result = await res.json();
                if (result.success) {
                    showAdminSuccess('Brand Updated', 'Brand renamed successfully.');
                    closeCatalogQuickEdit();
                    await fetchBrands();
                } else {
                    showToast(result.message || 'Failed to update brand', 'error');
                }
            } catch (error) {
                showToast('Server error while updating brand!', 'error');
            }
        }
    });
};

window.deleteBrand = function(id) {
    showCustomConfirm('Delete Brand', 'Are you sure you want to delete this brand?', async () => {
        try {
            const res = await fetch(`/api/brands/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await res.json();
            if (result.success) {
                globalBrands = globalBrands.filter(b => String(b._id) !== String(id));
                renderBrandTable();
                showAdminSuccess('Brand Deleted', result.message || 'Brand removed.');
            } else {
                showToast(result.message, 'error');
            }
        } catch (error) {
            showToast('Failed to delete brand', 'error');
        }
    }, 'danger');
};

/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    fetchBrands,
    renderBrandTable
});
