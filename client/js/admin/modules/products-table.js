/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/products-table.js
 * Description: Product listing, filters, sorting, and pagination.
 */
/* Dependencies: token, globalProducts, currentFilteredProducts, currentSort, currentPage, productPg, showToast, getProdTableBody, initAdminPaginationInstances, adminProductImageSrc, ADMIN_IMG_FALLBACK_ONERROR, buildProductTablePriceCells (window) */
/* Exposes: window.changePageSize, window.fetchLiveProducts, window.filterAndRenderProducts, window.goToNextPage, window.goToPage, window.goToPreviousPage, window.handleSort, window.loadCategoryFilter, window.renderProductTable, window.updateFilterCategoryDropdown */

import '../admin-core.js';

/* ==========================================================================
   SECTION 10: MANAGE PRODUCTS ENGINE (প্রোডাক্ট তালিকা ও মাল্টি-ফিল্টারিং)
   ========================================================================== */

/* shared state: currentSort lives on window (admin-core) */

/* shared state: selectedProductIds lives on window (admin-core) */

/**
 * ১০.১: ক্লাউড ডাটাবেজ থেকে সকল প্রোডাক্ট ডাটা লাইভ সিঙ্ক করা
 */
window.fetchLiveProducts = async function() {
    const tbody = getProdTableBody();
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="8" class="loading-cell"><div class="custom-spinner"></div><p>Syncing secure cloud server database...</p></td></tr>`;
    
    try {
        const authToken = localStorage.getItem('adminToken') || token || '';
        const res = await fetch('/api/products?limit=500', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        globalProducts = Array.isArray(data) ? data : (data.products || data.data || []);
        
        const totalBadge = document.getElementById('total-products-badge');
        if (totalBadge) totalBadge.innerText = `Total: ${globalProducts.length}`;
        
        loadCategoryFilter();
        readProductListSessionState();
        filterAndRenderProducts(false); 
    } catch (e) {
        console.error('fetchLiveProducts error:', e);
        tbody.innerHTML = `<tr><td colspan="8" class="table-status-error">Failed to load products.</td></tr>`; 
    }
};

/**
 * Manage Products category filter — loads hierarchical categories from admin API.
 * Uses #filterCategory (existing DOM id). Option values remain category name strings.
 */
async function loadCategoryFilter() {
    const sel = document.getElementById('filterCategory');
    if (!sel) return;

    const currentFilterValue = sel.value || 'All';

    try {
        const res = await fetch('/api/categories/admin/all', {
            headers: {
                'Authorization': 'Bearer ' + (localStorage.getItem('adminToken') || token || '')
            }
        });
        const data = await res.json();

        if (!data.success) return;

        const cats = data.data || [];
        sel.innerHTML = '<option value="All">All Categories</option>';

        cats.filter(c => c.isActive !== false)
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.name;
                opt.textContent = (cat.parentCategory ? '  └ ' : '') + cat.name;
                sel.appendChild(opt);
            });

        const hasCurrent = Array.from(sel.options).some(o => o.value === currentFilterValue);
        sel.value = hasCurrent ? currentFilterValue : 'All';
    } catch (err) {
        console.warn('Category filter error:', err);
    }
}
window.loadCategoryFilter = loadCategoryFilter;

/** @deprecated Use loadCategoryFilter — kept as alias for existing call sites */
function updateFilterCategoryDropdown() {
    return loadCategoryFilter();
}

/**
 * ১০.২: সার্চ কি-ওয়ার্ড, ক্যাটাগরি, স্টক স্ট্যাটাস ও প্রাইস রেঞ্জ অনুযায়ী প্রোডাক্ট ফিল্টারিং
 */
window.filterAndRenderProducts = function(resetPage = true) {
    const search = (document.getElementById('searchProduct') ? document.getElementById('searchProduct').value : '').toLowerCase();
    const cat = document.getElementById('filterCategory') ? document.getElementById('filterCategory').value : 'All';
    const stockStatus = document.getElementById('filterStockStatus') ? document.getElementById('filterStockStatus').value : 'All';
    const priceRange = document.getElementById('filterPriceRange') ? document.getElementById('filterPriceRange').value : 'All';

    currentFilteredProducts = globalProducts.filter(p => {
        const matchSearch = (p.name || '').toLowerCase().includes(search) || (p.productId || p.id || '').toLowerCase().includes(search) || (p.category || '').toLowerCase().includes(search);
        const matchCat = (cat === 'All' || p.category === cat);
        const stockNum = Number(p.stock ?? p.stockQuantity ?? 0);
        const threshold = Number(p.lowStockThreshold) > 0 ? Number(p.lowStockThreshold) : 10;
        
        let matchStock = true;
        if (stockStatus === 'InStock') matchStock = stockNum >= threshold;
        else if (stockStatus === 'LowStock') matchStock = stockNum > 0 && stockNum < threshold;
        else if (stockStatus === 'OutOfStock') matchStock = stockNum <= 0;

        let matchPrice = true;
        if (priceRange === '0-500') matchPrice = p.price <= 500;
        else if (priceRange === '500-2000') matchPrice = p.price > 500 && p.price <= 2000;
        else if (priceRange === '2000+') matchPrice = p.price > 2000;

        return matchSearch && matchCat && matchStock && matchPrice;
    });

    currentFilteredProducts.sort((a, b) => {
        let valA = a[currentSort.key] || '';
        let valB = b[currentSort.key] || '';
        
        if (currentSort.key === 'price' || currentSort.key === 'stock') {
            valA = Number(valA); valB = Number(valB);
        } else {
            valA = valA.toString().toLowerCase(); valB = valB.toString().toLowerCase();
        }

        if (valA < valB) return currentSort.asc ? -1 : 1;
        if (valA > valB) return currentSort.asc ? 1 : -1;
        return 0;
    });

    if (resetPage) {
        currentPage = 1;
        if (productPg) productPg.resetPage();
    } else {
        currentPage = productPg?.currentPage ?? currentPage;
    }
    renderProductTable();
    persistProductListSessionState();
};

/**
 * ১০.৩: কলাম হেডারে ক্লিক করলে ডাইনামিক সর্ট টগল করার ফাংশন
 * @param {string} key - যে অবজেক্ট প্রোপার্টি অনুযায়ী সর্ট হবে (price, stock ইত্যাদি)
 */
window.handleSort = function(key) {
    if (currentSort.key === key) {
        currentSort.asc = !currentSort.asc; 
    } else {
        currentSort.key = key;
        currentSort.asc = true;
    }
    filterAndRenderProducts();
};

/* ==========================================================================
   SECTION 10.1: PRODUCT TABLE RENDERING (টেবিল রেন্ডার ও স্টক অ্যালার্ট)
   ========================================================================== */

window.changePageSize = function() {
    currentPage = 1;
    if (productPg) productPg.resetPage();
    renderProductTable();
};

window.renderProductTable = function() {
    const tbody = getProdTableBody();
    if (!tbody) return;

    initAdminPaginationInstances();
    const limit = productPg?.currentLimit ?? parseInt(document.getElementById('product-pg-limit')?.value || '10', 10);
    currentPage = productPg?.currentPage ?? currentPage;
    const totalItems = currentFilteredProducts.length;
    const totalPages = Math.ceil(totalItems / limit) || 1;
    
    if (currentPage > totalPages) {
        currentPage = totalPages;
        if (productPg) productPg.currentPage = currentPage;
    }
    const startIdx = (currentPage - 1) * limit;
    const paginated = currentFilteredProducts.slice(startIdx, startIdx + limit);

    tbody.innerHTML = paginated.length === 0 ? `<tr><td colspan="9" class="loading-cell">No matching products found.</td></tr>` : '';

    paginated.forEach(prod => {
        // ইমেজ ইউআরএল প্রসেস লজিক (মাল্টিপল অ্যারে থেকে প্রথম ছবি নির্বাচন)
        let imgSrc = '';
        if (prod.images && prod.images.length > 0) imgSrc = prod.images[0];
        else if (prod.image) imgSrc = prod.image;
        else if (prod.imageUrl) imgSrc = prod.imageUrl;
        
        if (imgSrc) imgSrc = adminProductImageSrc(imgSrc);
        let imgHtml = imgSrc
            ? `<img src="${imgSrc}" onerror="${window.ADMIN_IMG_FALLBACK_ONERROR || ''}" class="product-img-sm" alt="">`
            : `<span style="font-size:24px;">${prod.icon||'📦'}</span>`;

        // স্টক লেভেলের উপর ভিত্তি করে ডাইনামিক স্টাইলিশ ব্যাজ তৈরি
        let stockHtml = '';
        let currentStock = Number(prod.stock ?? prod.stockQuantity ?? 0);
        const lowThreshold = Number(prod.lowStockThreshold) > 0 ? Number(prod.lowStockThreshold) : 10;

        if (currentStock <= 0) { 
            stockHtml = `<span class="stock-status stock-out"><i class="fa-solid fa-ban"></i> Out of Stock</span>`;
        } else if (currentStock < lowThreshold) {
            stockHtml = `<span class="stock-status stock-low"><i class="fa-solid fa-triangle-exclamation"></i> Low: ${currentStock}</span>`;
        } else {
            stockHtml = `<span class="stock-status stock-normal"><i class="fa-solid fa-check-circle"></i> In Stock: ${currentStock}</span>`;
        }

        // বাল্ক সিলেকশন চেকবক্স স্টেট চেক করা
        const isChecked = selectedProductIds.has(prod._id) ? 'checked' : '';

        // Sell/buy price — variant matrix shows minimum only; weighted avg stays in DB for analytics
        const { sellPriceHtml, buyPriceHtml } = buildProductTablePriceCells(prod);

        tbody.innerHTML += `
            <tr>
                <td class="col-checkbox no-print">
                    <input type="checkbox" class="row-checkbox" value="${prod._id}" ${isChecked} onchange="toggleSingleSelection(this)">
                </td>
                <td><b>${prod.productId || prod.id || 'N/A'}</b></td>
                <td>${imgHtml}</td>
                <td>${prod.name}</td>
                <td><span class="status-badge status-verified">${prod.category || 'General'}</span></td>
                <td>${sellPriceHtml}</td>
                <td class="buy-price-cell">${buyPriceHtml}</td>
                <td>${stockHtml}</td> 
                <td class="col-actions no-print">
                    <button class="action-btn edit" onclick="editProduct('${prod._id}')" title="Edit Product"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button class="action-btn delete" onclick="deleteProduct('${prod._id}')" title="Delete Product"><i class="fa-solid fa-trash-can"></i></button>
                </td>
            </tr>
        `;
    });

    if (productPg) {
        productPg.currentPage = currentPage;
        productPg.currentLimit = limit;
        productPg.setTotal(totalItems);
    }
    persistProductListSessionState();
    
    const selectAllCheckbox = document.getElementById('selectAllProducts');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = paginated.length > 0 && Array.from(document.querySelectorAll('.row-checkbox')).every(cb => cb.checked);
    }
};

window.goToPage = function(page) {
    currentPage = page;
    if (productPg) productPg.currentPage = page;
    renderProductTable();
};
window.goToNextPage = function() { if (productPg) productPg.goTo(productPg.currentPage + 1); else { currentPage++; renderProductTable(); } };
window.goToPreviousPage = function() { if (productPg) productPg.goTo(productPg.currentPage - 1); else if (currentPage > 1) { currentPage--; renderProductTable(); } };
// সার্চ বা ফিল্টার ইভেন্ট বাইন্ডিং সেটআপ
document.addEventListener('DOMContentLoaded', () => {
    const searchProduct = document.getElementById('searchProduct');
    if (searchProduct) searchProduct.addEventListener('input', window.filterAndRenderProducts);
    
    ['filterCategory', 'filterStockStatus', 'filterPriceRange'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', window.filterAndRenderProducts);
    });
});

/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    updateFilterCategoryDropdown
});

