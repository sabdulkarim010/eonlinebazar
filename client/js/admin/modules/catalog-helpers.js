/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/catalog-helpers.js
 * Description: Shared catalog HTML helpers, category dropdowns, and brand dropdown.
 */
import '../admin-core.js';
function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function catalogActionsHtml(editHandler, deleteHandler) {
    return `<div class="catalog-actions">
        <button type="button" class="catalog-action-btn edit" onclick="${editHandler}" title="Edit" aria-label="Edit">
            <i class="fa-solid fa-pen-to-square"></i>
        </button>
        <button type="button" class="catalog-action-btn delete" onclick="${deleteHandler}" title="Delete" aria-label="Delete">
            <i class="fa-solid fa-trash-can"></i>
        </button>
    </div>`;
}

function formatCatalogDate(dateVal) {
    if (!dateVal) return '—';
    return new Date(dateVal).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ৯.১: গ্লোবাল ক্যাটাগরি লিস্ট সংরক্ষণের জন্য অ্যারে

/* shared state: globalCategories lives on window (admin-core) */

/**
 * ৯.২: Hierarchical categories API → product form dropdown (parent + indented children).
 * Values stay as category name strings for Product.category backward compatibility.
 */
async function loadCategoryDropdownForProduct(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;

    try {
        const res = await fetch('/api/categories/admin/all', {
            headers: {
                'Authorization': 'Bearer ' + (localStorage.getItem('adminToken') || token || '')
            }
        });
        const data = await res.json();

        if (!data.success) return;

        const cats = data.data || [];
        globalCategories = cats;
        const parents = cats.filter(c => !c.parentCategory);
        const children = cats.filter(c => c.parentCategory);

        sel.innerHTML = '<option value="">Select a Category</option>';

        parents.forEach(parent => {
            const opt = document.createElement('option');
            opt.value = parent.name; // Keep using name for backward compatibility
            opt.textContent = parent.name;
            sel.appendChild(opt);

            children
                .filter(c => String(c.parentCategory?._id || c.parentCategory) === String(parent._id))
                .forEach(child => {
                    const childOpt = document.createElement('option');
                    childOpt.value = child.name;
                    childOpt.textContent = '  └ ' + child.name;
                    sel.appendChild(childOpt);
                });
        });
    } catch (err) {
        console.warn('Category dropdown error:', err);
    }
}
window.loadCategoryDropdownForProduct = loadCategoryDropdownForProduct;

/**
 * ৯.২খ: Legacy wrapper — refresh both product category selects from admin categories API
 */
async function fetchCategories() {
    await Promise.all([
        loadCategoryDropdownForProduct('prodCategory'),
        loadCategoryDropdownForProduct('editProdCategory')
    ]);
}

/**
 * ৯.৩: Populate Add Product + Edit Product category dropdowns (hierarchical)
 */
async function renderCategoryDropdown() {
    await Promise.all([
        loadCategoryDropdownForProduct('prodCategory'),
        loadCategoryDropdownForProduct('editProdCategory')
    ]);
}

/**
 * ৯.৩খ: Add ও Edit Product ফর্মের ব্র্যান্ড ড্রপডাউন ডাইনামিকালি পপুলেট করা।
 * ভ্যালু হিসেবে ব্র্যান্ডের _id সংরক্ষণ করা হয় (ব্যাকএন্ড ObjectId রেফারেন্স),
 * টেক্সট হিসেবে ব্র্যান্ডের নাম দেখানো হয়।
 */
function renderBrandDropdown() {
    const optionsHtml = '<option value="">No Brand</option>' +
        (globalBrands || []).map(b => `<option value="${b._id}">${escHtml(b.name)}</option>`).join('');

    ['prodBrand', 'editProdBrand'].forEach(sel => {
        const el = document.getElementById(sel);
        if (!el) return;
        const current = el.value;
        el.innerHTML = optionsHtml;
        el.value = current; // পূর্বের সিলেকশন থাকলে ধরে রাখা
    });
}

/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    escHtml,
    catalogActionsHtml,
    formatCatalogDate,
    loadCategoryDropdownForProduct,
    fetchCategories,
    renderCategoryDropdown,
    renderBrandDropdown
});
