/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/products-form.js
 * Description: Add/Edit product form, image upload, SEO/price previews, and save/update.
 */
/* Dependencies: token, selectedFilesAdd, selectedFilesEdit, productHighlights, showToast, collectProductVariantPayload, loadProductVariantUI, resetProductVariantUI, fetchLiveProducts, upsertProductInState, showAdminSuccess, adminProductImageSrc, ADMIN_IMG_FALLBACK_ONERROR (window) */
/* Exposes: window.addHighlightTag, window.closeEditModal, window.editProduct, window.handleImageDragLeave, window.handleImageDragOver, window.handleImageDrop, window.handleImageSelect, window.initAddProductFormUI, window.previewImage, window.removeAddImage, window.removeEditImage, window.removeHighlightTag, window.renderAddPreviews, window.renderEditPreviews, window.renderHighlightTags, window.resetAddProductFormExtras, window.resetAddProductHighlights, window.saveProductDraft, window.setupCharCounters, window.updateEditProfitPreview, window.updatePricePreview, window.updateProductDetails, window.updateSeoPreview, window.uploadProduct */

import '../admin-core.js';

/* ==========================================================================
   SECTION 8: ADD NEW PRODUCT ENGINE (নতুন প্রোডাক্ট আপলোড মডিউল)
   ========================================================================== */

// ৮.১: প্রোডাক্ট আপলোডের সময় ফাইল ট্র্যাকিং এর জন্য গ্লোবাল ডাটা ট্রান্সফার অবজেক্ট

/* shared state: selectedFilesAdd lives on window (admin-core) */

/**
 * ৮.২: ছবি সিলেক্ট করার পর ডাইনামিক লাইভ প্রিভিউ জেনারেটর (ক্রস বাটন সহ)
 * @param {Event} event - ফাইল ইনপুট চেঞ্জ ইভেন্ট
 */
window.previewImage = function(event) {
    const files = event.target.files;
    if (files && files.length > 0) {
        Array.from(files).forEach(file => selectedFilesAdd.items.add(file));
    }
    event.target.files = selectedFilesAdd.files;
    renderAddPreviews();
};

window.handleImageSelect = function(input) {
    if (!input?.files?.length) return;
    Array.from(input.files).forEach(file => selectedFilesAdd.items.add(file));
    input.files = selectedFilesAdd.files;
    renderAddPreviews();
};

window.handleImageDragOver = function(event) {
    event.preventDefault();
    document.getElementById('imageDropZone')?.classList.add('dragover');
};

window.handleImageDragLeave = function(event) {
    event.preventDefault();
    document.getElementById('imageDropZone')?.classList.remove('dragover');
};

window.handleImageDrop = function(event) {
    event.preventDefault();
    document.getElementById('imageDropZone')?.classList.remove('dragover');
    const files = Array.from(event.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    files.forEach(file => selectedFilesAdd.items.add(file));
    const fileInput = document.getElementById('prodImageFile');
    if (fileInput) fileInput.files = selectedFilesAdd.files;
    renderAddPreviews();
};

/**
 * ৮.৩: সিলেক্টেড ছবিগুলোর প্রিভিউ ডমে (DOM) রেন্ডার করা
 */
function renderAddPreviews() {
    const grid = document.getElementById('imagePreviewGrid');
    const previewBox = document.getElementById('imgPreviewBox');
    const target = grid || previewBox;
    if (!target) return;

    target.innerHTML = '';

    if (selectedFilesAdd.files.length === 0) {
        if (previewBox && !grid) {
            previewBox.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i><p>Upload Images</p>`;
        }
        return;
    }

    Array.from(selectedFilesAdd.files).forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = e => {
            if (grid) {
                const item = document.createElement('div');
                item.className = 'image-preview-item';
                item.innerHTML = `
                    <img src="${e.target.result}" alt="Preview">
                    <button type="button" class="image-preview-remove" onclick="removeAddImage(${index})" aria-label="Remove image">✕</button>`;
                grid.appendChild(item);
            } else if (previewBox) {
                previewBox.innerHTML += `
                <div style="position:relative; display:inline-block; margin:5px;">
                    <img src="${e.target.result}" style="height:80px; border-radius:5px; object-fit: cover;">
                    <button type="button" onclick="removeAddImage(${index})" style="position:absolute; top:-5px; right:-5px; background:#ef4444; color:white; border:none; border-radius:50%; width:22px; height:22px; cursor:pointer; font-size:14px; font-weight:bold; line-height:1;">&times;</button>
                </div>`;
            }
        };
        reader.readAsDataURL(file);
    });
}

window.updatePricePreview = function() {
    const sell = parseFloat(document.getElementById('prodPrice')?.value) || 0;
    const cost = parseFloat(document.getElementById('prodBuyingPrice')?.value) || 0;
    const card = document.getElementById('pricePreviewCard');
    const summary = document.getElementById('profitSummaryContent');

    if (sell > 0 || cost > 0) {
        const profit = sell - cost;
        const margin = sell > 0 ? ((profit / sell) * 100).toFixed(1) : 0;
        const profitClass = profit >= 0 ? 'price-preview-profit' : 'price-preview-loss';
        const marginClass = margin >= 20 ? 'price-preview-profit' :
            margin >= 0 ? 'price-preview-value' : 'price-preview-loss';

        if (card) {
            card.style.display = 'block';
            const ppSell = document.getElementById('ppSell');
            const ppCost = document.getElementById('ppCost');
            const ppProfit = document.getElementById('ppProfit');
            const ppMargin = document.getElementById('ppMargin');
            if (ppSell) ppSell.textContent = '৳' + sell.toLocaleString();
            if (ppCost) ppCost.textContent = '৳' + cost.toLocaleString();
            if (ppProfit) {
                ppProfit.textContent = (profit >= 0 ? '+' : '') + '৳' + profit.toLocaleString();
                ppProfit.className = profitClass;
            }
            if (ppMargin) {
                ppMargin.textContent = margin + '%';
                ppMargin.className = marginClass;
            }
        }

        if (summary) {
            summary.innerHTML = `
                <div class="profit-summary-row">
                    <span class="profit-summary-label">Selling Price</span>
                    <span class="profit-summary-value">৳${sell.toLocaleString()}</span>
                </div>
                <div class="profit-summary-row">
                    <span class="profit-summary-label">Cost Price</span>
                    <span class="profit-summary-value">৳${cost.toLocaleString()}</span>
                </div>
                <div class="profit-summary-row">
                    <span class="profit-summary-label">Profit per unit</span>
                    <span class="profit-summary-value ${profit >= 0 ? 'is-profit' : 'is-loss'}">${profit >= 0 ? '+' : ''}৳${profit.toLocaleString()}</span>
                </div>
                <div class="profit-summary-row">
                    <span class="profit-summary-label">Margin</span>
                    <span class="profit-summary-value ${Number(margin) >= 20 ? 'is-profit' : Number(margin) < 0 ? 'is-loss' : ''}">${margin}%</span>
                </div>`;
        }
    } else {
        if (card) card.style.display = 'none';
        if (summary) {
            summary.innerHTML = '<div class="profit-summary-empty">Enter sell &amp; cost price to see analysis</div>';
        }
    }
};

window.updateSeoPreview = function() {
    const name = document.getElementById('prodName')?.value || 'Product Name';
    const desc = document.getElementById('prodDesc')?.value || 'Product description will appear here...';
    const titleEl = document.getElementById('seoTitle');
    const descEl = document.getElementById('seoDesc');
    if (titleEl) titleEl.textContent = (name || 'Product Name') + ' | EOnlineBazar';
    if (descEl) descEl.textContent = desc.substring(0, 160);
};

/* shared state: addProductCharCountersReady lives on window (admin-core) */

window.setupCharCounters = function() {
    if (addProductCharCountersReady) return;
    const nameInput = document.getElementById('prodName');
    const shortDescInput = document.getElementById('prodDesc');

    if (nameInput) {
        nameInput.addEventListener('input', () => {
            const count = nameInput.value.length;
            const counter = document.getElementById('prodNameCounter');
            if (counter) {
                counter.textContent = count + ' / 100';
                counter.className = 'char-counter' +
                    (count > 80 ? ' warning' : '') +
                    (count > 100 ? ' error' : '');
            }
            updateSeoPreview();
        });
    }

    if (shortDescInput) {
        shortDescInput.addEventListener('input', () => {
            const count = shortDescInput.value.length;
            const counter = document.getElementById('shortDescCounter');
            if (counter) {
                counter.textContent = count + ' / 160';
                counter.className = 'char-counter' +
                    (count > 130 ? ' warning' : '') +
                    (count > 160 ? ' error' : '');
            }
            updateSeoPreview();
        });
    }

    addProductCharCountersReady = true;
};

/* shared state: productHighlights lives on window (admin-core) */

window.addHighlightTag = function(event) {
    if (event.key === 'Enter' || event.key === ',') {
        event.preventDefault();
        const input = document.getElementById('highlightsInput');
        const value = input?.value.trim().replace(/,$/, '');
        if (value && !productHighlights.includes(value)) {
            productHighlights.push(value);
            renderHighlightTags();
            if (input) input.value = '';
            const hidden = document.getElementById('prodHighlights');
            if (hidden) hidden.value = productHighlights.join(',');
        }
    }
};

window.removeHighlightTag = function(tag) {
    productHighlights = productHighlights.filter(h => h !== tag);
    renderHighlightTags();
    const hidden = document.getElementById('prodHighlights');
    if (hidden) hidden.value = productHighlights.join(',');
};

function renderHighlightTags() {
    const container = document.getElementById('highlightsTags');
    const input = document.getElementById('highlightsInput');
    if (!container || !input) return;

    container.innerHTML = '';
    productHighlights.forEach(tag => {
        const el = document.createElement('span');
        el.className = 'tag-item';
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'tag-remove';
        removeBtn.textContent = '✕';
        removeBtn.setAttribute('aria-label', 'Remove ' + tag);
        removeBtn.onclick = () => removeHighlightTag(tag);
        el.appendChild(document.createTextNode(tag + ' '));
        el.appendChild(removeBtn);
        container.appendChild(el);
    });
    container.appendChild(input);
}

function resetAddProductHighlights() {
    productHighlights = [];
    renderHighlightTags();
    const hidden = document.getElementById('prodHighlights');
    if (hidden) hidden.value = '';
}

function resetAddProductFormExtras() {
    resetAddProductHighlights();
    const nameCounter = document.getElementById('prodNameCounter');
    const descCounter = document.getElementById('shortDescCounter');
    if (nameCounter) {
        nameCounter.textContent = '0 / 100';
        nameCounter.className = 'char-counter';
    }
    if (descCounter) {
        descCounter.textContent = '0 / 160';
        descCounter.className = 'char-counter';
    }
    updatePricePreview();
    updateSeoPreview();
}

window.saveProductDraft = function() {
    showToast('Draft save is coming soon. Use Save & Launch to publish now.', 'info');
};

function initAddProductFormUI() {
    setupCharCounters();
    updateSeoPreview();
    updatePricePreview();
}

/**
 * ৮.৪: প্রিভিউ থেকে নির্দিষ্ট কোনো ছবি বাদ দেওয়ার (ক্রস বাটন) ফাংশন
 * @param {number} index - ফাইল লিস্টের ইনডেক্স নম্বর
 */
window.removeAddImage = function(index) {
    const dt = new DataTransfer();
    const files = selectedFilesAdd.files;
    for (let i = 0; i < files.length; i++) {
        if (i !== index) dt.items.add(files[i]);
    }
    selectedFilesAdd = dt;
    document.getElementById('prodImageFile').files = selectedFilesAdd.files;
    renderAddPreviews();
};

/**
 * ৮.৫: ব্যাকএন্ড ক্লাউড সার্ভারে নতুন প্রোডাক্ট ডাটা এবং ইমেজ আপলোড করা
 * এতে Detailed Description, Highlights এবং Dynamic Category ফিল্ড অন্তর্ভুক্ত রয়েছে
 */
window.uploadProduct = async function() {
    const id = document.getElementById('prodId').value.trim();
    const name = document.getElementById('prodName').value.trim();
    const price = document.getElementById('prodPrice').value.trim();
    const buyingPrice = document.getElementById('prodBuyingPrice') ? document.getElementById('prodBuyingPrice').value.trim() : '';
    const stockField = document.getElementById('prodStock');
    const variantPayload = collectProductVariantPayload('add');
    const stock = String(variantPayload.stock ?? stockField?.value ?? '').trim();
    const category = document.getElementById('prodCategory').value;
    const brand = document.getElementById('prodBrand') ? document.getElementById('prodBrand').value : '';
    const emoji = document.getElementById('prodEmoji').value.trim();
    const desc = document.getElementById('prodDesc').value.trim();
    
    // নতুন মাল্টি-ফাংশনাল ফিল্ড ডাটা সংগ্রহ
    const detailedDesc = document.getElementById('prodDetailedDesc') ? document.getElementById('prodDetailedDesc').value.trim() : '';
    const highlightsInput = document.getElementById('prodHighlights') ? document.getElementById('prodHighlights').value.trim() : '';
    
    const files = document.getElementById('prodImageFile').files; 

    // ডাটা ভ্যালিডেশন চেক (নতুন: ক্যাটাগরি সিলেক্ট করা হয়েছে কি না চেক করা)
    if (!name || !id || !price || !stock || !category) return showToast("Required fields missing or Category not selected!", "warning");
    if (!emoji && files.length === 0) return showToast("Provide an Emoji or Image!", "warning");

    // বাটন লোডিং স্টেট অ্যানিমেশন চালু
    const btn = document.activeElement; 
    let originalText = '';
    if (btn && btn.tagName === 'BUTTON') { 
        originalText = btn.innerHTML;
        btn.disabled = true; 
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...'; 
    }

    // হাইলাইটস ইনপুটকে কমা দিয়ে ভাগ করে অ্যারে স্ট্রাকচারে রূপান্তর
    const highlightsArray = highlightsInput 
        ? highlightsInput.split(',').map(item => item.trim()).filter(item => item !== '') 
        : [];

    // মাল্টিপার্ট ফর্ম ডাটা (FormData) অবজেক্ট তৈরি
    const formData = new FormData();
    formData.append('id', id); 
    formData.append('name', name); 
    formData.append('price', price);
    formData.append('buyingPrice', buyingPrice || 0);
    formData.append('stock', stock);
    formData.append('stockQuantity', variantPayload.stockQuantity);
    formData.append('hasVariants', variantPayload.hasVariants ? 'true' : 'false');
    formData.append('variants', JSON.stringify(variantPayload.variants));
    formData.append('category', category);
    formData.append('brand', brand || '');
    formData.append('icon', emoji);
    formData.append('description', desc);
    formData.append('detailedDescription', detailedDesc); 
    formData.append('highlights', JSON.stringify(highlightsArray));
    const lowStockField = document.getElementById('prodLowStockThreshold');
    formData.append('lowStockThreshold', lowStockField ? (lowStockField.value || 10) : 10);
    
    // একাধিক ছবি থাকলে সবগুলোকে ব্যাকএন্ড রাউটের 'productImages' কী-তে অ্যাপেন্ড করা
    if (files.length > 0) {
        for (let i = 0; i < files.length; i++) {
            formData.append('productImages', files[i]);
        }
    }

    try {
        const res = await fetch('/api/products', { 
            method: 'POST', 
            headers: { 'Authorization': `Bearer ${token}` }, // token গ্লোবাল ভেরিয়েবল হিসেবে থাকা লাগবে
            body: formData 
        });
        const result = await res.json();

        if (result.success) {
            showAdminSuccess('Product Launched', result.message || 'Product uploaded successfully!');
            document.getElementById('addProductForm').reset();

            // ভ্যারিয়েশন সারি ও ব্র্যান্ড সিলেকশন রিসেট করা
            resetProductVariantUI('add');
            resetAddProductFormExtras();
            if (document.getElementById('prodBrand')) document.getElementById('prodBrand').value = '';
            
            // ডাটা ট্রান্সফার রিসেট ও প্রিভিউ ক্লিয়ার
            selectedFilesAdd = new DataTransfer();
            document.getElementById('prodImageFile').files = selectedFilesAdd.files;
            renderAddPreviews();
            
            // প্রোডাক্ট লিস্ট লাইভ আপডেট করা (যদি ফাংশনটি এভেইলেবল থাকে)
            if (typeof fetchLiveProducts === "function") fetchLiveProducts();
        } else {
            showToast("Upload failed: " + (result.message || "Unknown error"), "error");
        }
    } catch (e) { 
        showToast("Server error during product upload!", "error"); 
    } finally { 
        // বাটনের লোডিং স্টেট রিমুভ ও আগের টেক্সট ফিরিয়ে আনা
        if (btn && btn.tagName === 'BUTTON') { btn.disabled = false; btn.innerHTML = originalText; } 
    }
};
/* ==========================================================================
   SECTION 11: ADVANCED PRODUCT EDIT & LIVE PREVIEW ENGINE (এডিট মডিউল)
   ========================================================================== */

/* shared state: selectedFilesEdit lives on window (admin-core) */

/**
 * ১১.১: এডিট মডাল ওপেন করা এবং ফর্মে ডাইনামিক ডাটা ইনজেক্ট করা
 * @param {string} id - প্রোডাক্টের অবজেক্ট আইডি
 */
window.editProduct = async function(id) {
    saveProductPaginationState();

    selectedFilesEdit = new DataTransfer(); 

    const previewBox = document.getElementById('editImgPreviewBox');
    if (previewBox) previewBox.innerHTML = ''; 
    
    const fileInput = document.getElementById('prodImageFile'); 
    if (fileInput) {
        fileInput.value = ''; 
        fileInput.files = selectedFilesEdit.files; 
    }

    const product = globalProducts.find(p => p._id === id);
    if (!product) return showToast("Product not found!", "error");

    const modal = document.getElementById('editProductModal'); 
    if (!modal) return showToast("Edit Product Modal ID not found in HTML!", "warning");

    // ফর্মে ওল্ড ডাটা বসানো
    if (document.getElementById('editProdMongoId')) document.getElementById('editProdMongoId').value = product._id;
    if (document.getElementById('editProdId')) document.getElementById('editProdId').value = product.productId || product.id || '';
    if (document.getElementById('editProdName')) document.getElementById('editProdName').value = product.name || '';
    if (document.getElementById('editProdPrice')) document.getElementById('editProdPrice').value = product.price || '';
    if (document.getElementById('editProdBuyingPrice')) document.getElementById('editProdBuyingPrice').value = (product.buyingPrice !== undefined && product.buyingPrice !== null) ? product.buyingPrice : '';
    if (typeof updateEditProfitPreview === 'function') updateEditProfitPreview();
    
    // Hierarchical category dropdown (name values) then restore product category
    if (document.getElementById('editProdCategory')) {
        await loadCategoryDropdownForProduct('editProdCategory');
        document.getElementById('editProdCategory').value = product.category || '';
    }

    // 🌟 ব্র্যান্ড ড্রপডাউন রেন্ডার করে বর্তমান ব্র্যান্ড প্রি-সিলেক্ট করা
    if (document.getElementById('editProdBrand')) {
        renderBrandDropdown();
        const brandId = (product.brand && product.brand._id) ? product.brand._id : (product.brand || '');
        document.getElementById('editProdBrand').value = brandId || '';
    }

    // 🌟 বিদ্যমান ভ্যারিয়েশনগুলো এডিট মোডালে রেন্ডার করা
    loadProductVariantUI('edit', product);

    const lowStockEl = document.getElementById('editProdLowStockThreshold');
    if (lowStockEl) {
        lowStockEl.value = product.lowStockThreshold ?? 10;
    }
    
    if (document.getElementById('editProdEmoji')) document.getElementById('editProdEmoji').value = product.icon || '📦';
    if (document.getElementById('editProdDesc')) document.getElementById('editProdDesc').value = product.description || '';
    
    // অ্যাডভান্সড ডেসক্রিপশন এবং হাইলাইটস ডাটা ইনজেকশন
    if (document.getElementById('editDetailedDescription')) document.getElementById('editDetailedDescription').value = product.detailedDescription || '';
    if (document.getElementById('editHighlights')) document.getElementById('editHighlights').value = product.highlights && Array.isArray(product.highlights) ? product.highlights.join(', ') : '';

    // এক্সিসটিং ইমেজের ডাইনামিক থাম্বনেইল থাম্ব শো করানো
    if (previewBox) {
        if (product.images && product.images.length > 0) {
            previewBox.innerHTML = product.images.map(img => {
                const imgSrc = adminProductImageSrc(img);
                return `<div class="edit-img-thumb"><img src="${imgSrc}" alt="Product image" onerror="${window.ADMIN_IMG_FALLBACK_ONERROR || ''}"></div>`;
            }).join('');
        } else if (product.image) {
            const imgSrc = adminProductImageSrc(product.image);
            previewBox.innerHTML = `<div class="edit-img-thumb"><img src="${imgSrc}" alt="Product image" onerror="${window.ADMIN_IMG_FALLBACK_ONERROR || ''}"></div>`;
        } else {
            previewBox.innerHTML = `<span class="edit-img-placeholder">${product.icon || '📦'}</span>`;
        }
    }

    modal.style.display = 'flex';
};

/**
 * ১১.২: এডিট মোডাল বন্ধ ও রিসেট করা
 */
window.closeEditModal = function() {
    const modal = document.getElementById('editProductModal');
    if (modal) {
        modal.style.display = 'none';
        savedProductPageBeforeAction = null;
        selectedFilesEdit = new DataTransfer();
        const editFileInput = document.querySelector('#editProductModal input[type="file"]'); 
        if (editFileInput) {
            editFileInput.value = '';
            editFileInput.files = selectedFilesEdit.files;
        }
    }
};

// ইভেন্ট ডেলিগেশন দিয়ে এডিট মোডালের ফাইল আপলোড লাইভ লিসেনিং করা
/**
 * 🌟 এডিট মোডালে প্রতি ইউনিট প্রফিট (Selling - Buying) লাইভ প্রিভিউ আপডেট করা
 */
function updateEditProfitPreview() {
    const priceEl = document.getElementById('editProdPrice');
    const buyEl = document.getElementById('editProdBuyingPrice');
    const previewEl = document.getElementById('editProdProfitPreview');
    if (!previewEl) return;

    const selling = Number(priceEl ? priceEl.value : 0) || 0;
    const buying = Number(buyEl ? buyEl.value : 0) || 0;
    const profit = selling - buying;

    previewEl.value = `${formatAdminPrice(profit)}` + (buying > 0 && selling > 0 ? `  (${Math.round((profit / selling) * 100)}% margin)` : '');
    previewEl.style.color = profit >= 0 ? '#047857' : '#dc2626';
}
window.updateEditProfitPreview = updateEditProfitPreview;

// প্রাইস/বায়িং প্রাইস টাইপ করার সাথে সাথে প্রফিট প্রিভিউ লাইভ আপডেট
document.addEventListener('input', function(e) {
    if (e.target && (e.target.id === 'editProdPrice' || e.target.id === 'editProdBuyingPrice')) {
        updateEditProfitPreview();
    }
});

document.addEventListener('change', function(e) {
    if (e.target && e.target.closest('#editProductModal') && e.target.type === 'file') {
        const files = e.target.files;
        if (files && files.length > 0) {
            Array.from(files).forEach(file => selectedFilesEdit.items.add(file));
        }
        e.target.files = selectedFilesEdit.files;
        renderEditPreviews();
    }
});

function renderEditPreviews() {
    const previewBox = document.getElementById('editImgPreviewBox');
    if (!previewBox) return;
    
    const hasFiles = selectedFilesEdit.files.length > 0;
    if (hasFiles) {
        previewBox.innerHTML = '';
        Array.from(selectedFilesEdit.files).forEach((file, index) => {
            const reader = new FileReader();
            reader.onload = function(event) {
                previewBox.innerHTML += `
                <div class="edit-img-thumb">
                    <img src="${event.target.result}" alt="New upload preview">
                    <button type="button" class="edit-img-remove" onclick="removeEditImage(${index})" aria-label="Remove image">&times;</button>
                </div>`;
            };
            reader.readAsDataURL(file);
        });
    }
}

window.removeEditImage = function(index) {
    const dt = new DataTransfer();
    const files = selectedFilesEdit.files;
    for (let i = 0; i < files.length; i++) {
        if (i !== index) dt.items.add(files[i]);
    }
    selectedFilesEdit = dt;
    const editFileInput = document.querySelector('#editProductModal input[type="file"]');
    if (editFileInput) editFileInput.files = selectedFilesEdit.files;
    renderEditPreviews();
};

/**
 * ১১.৩: মডিফাইড ডাটা পুশ করে ক্লাউড ডাটাবেজে প্রোডাক্ট আপডেট সেভ করা
 */
window.updateProductDetails = async function() {
    saveProductPaginationState();

    const mongoId = document.getElementById('editProdMongoId').value;
    const productId = document.getElementById('editProdId').value.trim();
    const name = document.getElementById('editProdName').value.trim();
    const price = document.getElementById('editProdPrice').value.trim();
    const buyingPrice = document.getElementById('editProdBuyingPrice') ? document.getElementById('editProdBuyingPrice').value.trim() : '';
    const stockField = document.getElementById('editProdStock');
    const lowStockThresholdField = document.getElementById('editProdLowStockThreshold');
    const variantPayload = collectProductVariantPayload('edit');
    const stock = String(variantPayload.stock ?? stockField?.value ?? '').trim();
    const category = document.getElementById('editProdCategory').value.trim();
    const brand = document.getElementById('editProdBrand') ? document.getElementById('editProdBrand').value : '';
    const emoji = document.getElementById('editProdEmoji').value.trim();
    const desc = document.getElementById('editProdDesc').value.trim();
    
    const detailedDesc = document.getElementById('editDetailedDescription') ? document.getElementById('editDetailedDescription').value.trim() : '';
    const highlightsInput = document.getElementById('editHighlights') ? document.getElementById('editHighlights').value.trim() : '';
    
    const editFileInput = document.querySelector('#editProductModal input[type="file"]');
    const files = editFileInput ? editFileInput.files : null;

    if (!name || !price || !stock) return showToast("Required fields missing!", "warning");

    const btn = document.getElementById('saveEditBtn');
    let originalText = '';
    if (btn) { originalText = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...'; }

    const highlightsArray = highlightsInput 
        ? highlightsInput.split(',').map(item => item.trim()).filter(item => item !== '') 
        : [];

    const formData = new FormData();
    formData.append('id', productId);
    formData.append('name', name);
    formData.append('price', price);
    formData.append('buyingPrice', buyingPrice || 0);
    formData.append('stock', stock);
    formData.append('stockQuantity', variantPayload.stockQuantity);
    formData.append('lowStockThreshold', lowStockThresholdField ? (lowStockThresholdField.value || 10) : 10);
    formData.append('hasVariants', variantPayload.hasVariants ? 'true' : 'false');
    formData.append('category', category);
    formData.append('brand', brand || '');
    formData.append('variants', JSON.stringify(variantPayload.variants));
    formData.append('icon', emoji);
    formData.append('description', desc);
    formData.append('detailedDescription', detailedDesc);
    formData.append('highlights', JSON.stringify(highlightsArray)); 
    
    if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
            formData.append('productImages', files[i]);
        }
    }

    try {
        const res = await fetch(`/api/products/${mongoId}`, { 
            method: 'PUT', 
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData 
        });
        
        const result = await res.json();
        if (res.ok && result.success) {
            const updated = result.data || result.product;
            if (updated && updated._id) {
                upsertProductInState(updated);
            } else {
                fetchLiveProducts();
            }
            window.closeEditModal();
            showAdminSuccess('Product Updated', result.message || 'Changes saved successfully.');
        } else {
            showToast(result.message || "Update failed!", "error");
        }
    } catch (e) { 
        showToast("Server error during update!", "error"); 
    } finally { 
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; } 
    }
};

/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    initAddProductFormUI,
    renderAddPreviews,
    renderEditPreviews,
    renderHighlightTags,
    resetAddProductFormExtras,
    resetAddProductHighlights
});

