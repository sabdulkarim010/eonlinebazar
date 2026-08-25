/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/products-bulk.js
 * Description: Product bulk selection, CSV export, Excel/CSV import, and print.
 */
/* Dependencies: token, selectedProductIds, bulkImportSelectedFile, globalProducts, currentFilteredProducts, showToast, showCustomConfirm, fetchLiveProducts, filterAndRenderProducts (window) */
/* Exposes: window.closeBulkImportModal, window.deleteProduct, window.handleBulkDelete, window.openBulkImportModal, window.resetBulkImportModal, window.setBulkImportFile, window.toggleSelectAll, window.toggleSingleSelection, window.updateBulkActionPanel */

import '../admin-core.js';

/* ==========================================================================
   SECTION 10.2: BULK OPERATIONS & DATA EXPORT (CSV এক্সপোর্ট মডিউল)
   ========================================================================== */

/**
 * ১০.৬: টেবিলের সকল চেকবক্স একসাথে অন/অফ করা
 */
window.toggleSelectAll = function(source) {
    const checkboxes = document.querySelectorAll('.row-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = source.checked;
        if (source.checked) selectedProductIds.add(cb.value);
        else selectedProductIds.delete(cb.value);
    });
    updateBulkActionPanel();
};

/**
 * ১০.৭: সিঙ্গেল আইটেম চেকবক্স সিলেক্ট করা
 */
window.toggleSingleSelection = function(checkbox) {
    if (checkbox.checked) selectedProductIds.add(checkbox.value);
    else selectedProductIds.delete(checkbox.value);
    updateBulkActionPanel();
    
    const allChecked = Array.from(document.querySelectorAll('.row-checkbox')).every(cb => cb.checked);
    document.getElementById('selectAllProducts').checked = allChecked;
};

function updateBulkActionPanel() {
    const panel = document.getElementById('bulk-actions-panel');
    const countSpan = document.getElementById('selected-count');
    const count = selectedProductIds.size;
    if (panel) panel.classList.toggle('is-visible', count > 0);
    if (countSpan) countSpan.innerText = `${count} selected`;
}

/**
 * ১০.৮: একাধিক সিলেক্টেড প্রোডাক্ট একসাথে এক ক্লিকে ডিলিট করার কোর ফাংশন
 */
window.handleBulkDelete = function() {
    if (selectedProductIds.size === 0) return showToast("No products selected!", "warning");
    
    showCustomConfirm("Bulk Delete", `Are you sure you want to delete ${selectedProductIds.size} products? This cannot be undone.`, async () => {
        const ids = Array.from(selectedProductIds);
        try {
            const results = await Promise.all(ids.map(id =>
                fetch(`/api/products/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } })
                    .then(r => r.json().then(body => ({ ok: r.ok, body })))
            ));
            const allOk = results.every(r => r.ok && r.body.success);
            if (!allOk) {
                showToast("Some products could not be deleted.", "error");
                fetchLiveProducts();
                return;
            }
            ids.forEach(id => {
                const sid = String(id);
                globalProducts = globalProducts.filter(p => String(p._id) !== sid);
                selectedProductIds.delete(id);
            });
            updateBulkActionPanel();
            const totalBadge = document.getElementById('total-products-badge');
            if (totalBadge) totalBadge.innerText = `Total: ${globalProducts.length}`;
            loadCategoryFilter();
            if (productPg) productPg.stayOnPage();
            else filterAndRenderProducts(false);
            document.getElementById('selectAllProducts').checked = false;
            showAdminSuccess('Products Deleted', `${ids.length} product(s) removed successfully.`);
        } catch (e) {
            showToast("Error in bulk deletion process!", "error");
        }
    }, "danger");
};

/**
 * ১০.৯: একক প্রোডাক্ট ডিলিট করার লজিক
 */
window.deleteProduct = (id) => {
    showCustomConfirm("Delete Product", "Permanently delete this product?", async () => {
        try {
            const res = await fetch(`/api/products/${id}`, { 
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await res.json();
            if (res.ok && result.success) {
                removeProductFromState(id);
                showAdminSuccess('Product Deleted', result.message || 'Product removed from catalog.');
            } else {
                showToast(result.message || "Failed to delete.", "error");
            }
        } catch (e) { showToast("Server error", "error"); }
    }, "danger");
};

/**
 * ১০.১০: এক্সপোর্ট বাটন — শুধুমাত্র চেকবক্সে সিলেক্ট করা সারিগুলো CSV তে এক্সপোর্ট
 */
document.getElementById('btn-export-csv')?.addEventListener('click', () => {
    if (selectedProductIds.size === 0) {
        return showToast("Please select products using the checkboxes before exporting.", "warning");
    }

    const toExport = currentFilteredProducts.filter(p => selectedProductIds.has(p._id));
    if (toExport.length === 0) {
        return showToast("Selected products are not visible in the current filter view.", "warning");
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "ID,Name,Category,Sell Price,Buy Price,Stock\n";

    toExport.forEach(p => {
        const row = [
            p.productId || p.id || '',
            p.name || '',
            p.category || '',
            p.price ?? '',
            p.buyingPrice ?? 0,
            p.stock ?? 0
        ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');
        csvContent += row + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Products_Selected_${toExport.length}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`${toExport.length} selected product(s) exported to CSV!`, "success");
});

/* ==========================================================================
   SECTION 10B: BULK PRODUCT IMPORT (CSV / EXCEL)
   ========================================================================== */

/* shared state: bulkImportSelectedFile lives on window (admin-core) */

function resetBulkImportModal() {
    bulkImportSelectedFile = null;
    const fileInput = document.getElementById('bulkImportFileInput');
    const selectedLabel = document.getElementById('bulkImportSelectedFile');
    const submitBtn = document.getElementById('btn-bulk-import-submit');
    const loading = document.getElementById('bulkImportLoading');
    const results = document.getElementById('bulkImportResults');
    const uploadStep = document.getElementById('bulkImportUploadStep');
    const invalidDetails = document.getElementById('bulkImportInvalidDetails');
    const invalidBody = document.getElementById('bulkImportInvalidBody');

    if (fileInput) fileInput.value = '';
    if (selectedLabel) {
        selectedLabel.hidden = true;
        selectedLabel.textContent = '';
    }
    if (submitBtn) submitBtn.disabled = true;
    if (loading) loading.hidden = true;
    if (results) results.hidden = true;
    if (uploadStep) uploadStep.hidden = false;
    if (invalidDetails) invalidDetails.hidden = true;
    if (invalidBody) invalidBody.innerHTML = '';
}

window.openBulkImportModal = function() {
    resetBulkImportModal();
    const modal = document.getElementById('bulkImportModal');
    if (modal) modal.style.display = 'flex';
};

window.closeBulkImportModal = function() {
    const modal = document.getElementById('bulkImportModal');
    if (modal) modal.style.display = 'none';
    resetBulkImportModal();
};

function setBulkImportFile(file) {
    if (!file) return;

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const allowed = ['csv', 'xlsx', 'xls'];
    if (!allowed.includes(ext)) {
        showToast('শুধুমাত্র .csv, .xlsx, বা .xls ফাইল গ্রহণযোগ্য।', 'warning');
        return;
    }

    bulkImportSelectedFile = file;
    const selectedLabel = document.getElementById('bulkImportSelectedFile');
    const submitBtn = document.getElementById('btn-bulk-import-submit');
    const results = document.getElementById('bulkImportResults');

    if (selectedLabel) {
        selectedLabel.hidden = false;
        selectedLabel.textContent = `নির্বাচিত ফাইল: ${file.name}`;
    }
    if (submitBtn) submitBtn.disabled = false;
    if (results) results.hidden = true;
}

document.getElementById('btn-bulk-import')?.addEventListener('click', () => {
    openBulkImportModal();
});

document.getElementById('btn-download-import-template')?.addEventListener('click', async () => {
    try {
        const res = await fetch('/api/admin/products/import-template', {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || 'Template download failed');
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'product-import-template.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast('টেমপ্লেট ডাউনলোড হয়েছে!', 'success');
    } catch (err) {
        showToast(err.message || 'টেমপ্লেট ডাউনলোড ব্যর্থ হয়েছে।', 'error');
    }
});

const bulkImportDropZone = document.getElementById('bulkImportDropZone');
const bulkImportFileInput = document.getElementById('bulkImportFileInput');

bulkImportDropZone?.addEventListener('click', () => bulkImportFileInput?.click());

bulkImportDropZone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    bulkImportDropZone.classList.add('is-dragover');
});

bulkImportDropZone?.addEventListener('dragleave', () => {
    bulkImportDropZone.classList.remove('is-dragover');
});

bulkImportDropZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    bulkImportDropZone.classList.remove('is-dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) setBulkImportFile(file);
});

bulkImportFileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) setBulkImportFile(file);
});

document.getElementById('btn-bulk-import-submit')?.addEventListener('click', async () => {
    if (!bulkImportSelectedFile) {
        return showToast('অনুগ্রহ করে একটি ফাইল নির্বাচন করুন।', 'warning');
    }

    const submitBtn = document.getElementById('btn-bulk-import-submit');
    const loading = document.getElementById('bulkImportLoading');
    const results = document.getElementById('bulkImportResults');

    if (submitBtn) submitBtn.disabled = true;
    if (loading) loading.hidden = false;

    try {
        const formData = new FormData();
        formData.append('importFile', bulkImportSelectedFile);

        const res = await fetch('/api/admin/products/bulk-import', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
            throw new Error(data.message || 'Bulk import failed');
        }

        const summary = data.summary || {};
        const insertedEl = document.querySelector('#bulkImportSummaryInserted span');
        const skippedEl = document.querySelector('#bulkImportSummarySkipped span');
        const warningsEl = document.querySelector('#bulkImportSummaryWarnings span');
        const invalidDetails = document.getElementById('bulkImportInvalidDetails');
        const invalidBody = document.getElementById('bulkImportInvalidBody');

        if (insertedEl) insertedEl.textContent = `${summary.inserted ?? 0} টি পণ্য যোগ হয়েছে`;
        if (skippedEl) skippedEl.textContent = `${summary.skipped ?? 0} টি সারি এড়িয়ে গেছে (errors)`;
        if (warningsEl) warningsEl.textContent = `${summary.warnings ?? 0} টি সতর্কতা`;

        if (invalidBody) {
            invalidBody.innerHTML = '';
            (data.invalid || []).forEach(item => {
                const name =
                    item.data?.name ||
                    item.data?.Name ||
                    item.data?.productname ||
                    '—';
                const errors = Array.isArray(item.errors) ? item.errors.join('; ') : 'Unknown error';
                invalidBody.innerHTML += `
                    <tr>
                        <td>${item.row ?? '—'}</td>
                        <td>${escapeHtml(String(name))}</td>
                        <td>${escapeHtml(errors)}</td>
                    </tr>`;
            });
        }

        if (invalidDetails) {
            invalidDetails.hidden = !(data.invalid && data.invalid.length);
        }

        if (results) results.hidden = false;

        if ((summary.inserted ?? 0) > 0 && typeof fetchLiveProducts === 'function') {
            fetchLiveProducts();
        }

        showToast('বাল্ক ইমপোর্ট সম্পন্ন হয়েছে!', 'success');
    } catch (err) {
        showToast(err.message || 'আপলোড ব্যর্থ হয়েছে।', 'error');
    } finally {
        if (loading) loading.hidden = true;
        if (submitBtn) submitBtn.disabled = !bulkImportSelectedFile;
    }
});

document.getElementById('btn-bulk-import-retry')?.addEventListener('click', () => {
    resetBulkImportModal();
});

document.getElementById('btn-print-table')?.addEventListener('click', () => {
    const dateEl = document.getElementById('printReportDate');
    if (dateEl) {
        dateEl.textContent = 'Generated: ' + new Date().toLocaleString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }

    document.body.classList.add('printing-products');
    const cleanup = () => {
        document.body.classList.remove('printing-products');
        window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
});

/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    resetBulkImportModal,
    setBulkImportFile,
    updateBulkActionPanel
});

