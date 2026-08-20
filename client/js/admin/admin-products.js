/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/admin-products.js
 * Description: Product list, CRUD, stock management, variants, and catalog (categories, brands, coupons, attributes).
 */

import './admin-core.js';

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

/* shared state: aiGeneratedData lives on window (admin-core) */

window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('open');
};

window.openAIAssist = function() {
    const productName = document.getElementById('prodName')?.value || '';
    const nameInput = document.getElementById('ai-product-name');
    if (nameInput && productName) nameInput.value = productName;

    document.getElementById('ai-loading').style.display = 'none';
    document.getElementById('ai-result').style.display = 'none';
    document.getElementById('ai-error').style.display = 'none';
    document.getElementById('ai-apply-btn').style.display = 'none';
    document.getElementById('ai-generate-btn').style.display = 'inline-flex';
    document.getElementById('ai-generate-btn').textContent = '✨ Generate';
    aiGeneratedData = null;

    document.getElementById('ai-assist-modal').classList.add('open');
};

window.generateAIContent = async function() {
    const productName = document.getElementById('ai-product-name')?.value?.trim();
    const context = document.getElementById('ai-additional-context')?.value?.trim();

    if (!productName) {
        document.getElementById('ai-error').style.display = 'block';
        document.getElementById('ai-error').textContent = 'Please enter a product name';
        return;
    }

    document.getElementById('ai-loading').style.display = 'block';
    document.getElementById('ai-result').style.display = 'none';
    document.getElementById('ai-error').style.display = 'none';
    document.getElementById('ai-generate-btn').disabled = true;

    try {
        const res = await fetch('/api/admin/ai/product-assist', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({
                productName,
                additionalContext: context
            })
        });

        const data = await res.json();

        if (data.success && data.data) {
            aiGeneratedData = data.data;

            const preview = document.getElementById('ai-preview-text');
            if (preview) {
                preview.innerHTML =
                    '<b>Short Desc:</b> ' + (data.data.shortDescription || '—') + '<br><br>' +
                    '<b>Highlights:</b> ' + (data.data.highlights || []).join(', ') + '<br><br>' +
                    '<b>Category:</b> ' + (data.data.suggestedCategory || '—') + '<br>' +
                    '<b>Price Range:</b> ৳' + (data.data.suggestedPriceRange?.min || 0) +
                    ' – ৳' + (data.data.suggestedPriceRange?.max || 0);
            }

            document.getElementById('ai-result').style.display = 'block';
            document.getElementById('ai-apply-btn').style.display = 'inline-flex';
            document.getElementById('ai-generate-btn').textContent = '🔄 Regenerate';
        } else {
            throw new Error(data.message || 'AI failed');
        }
    } catch (err) {
        document.getElementById('ai-error').style.display = 'block';
        document.getElementById('ai-error').textContent =
            'AI assist failed: ' + err.message +
            '. Make sure ANTHROPIC_API_KEY is set in .env';
    } finally {
        document.getElementById('ai-loading').style.display = 'none';
        document.getElementById('ai-generate-btn').disabled = false;
    }
};

window.applyAIContent = function() {
    if (!aiGeneratedData) return;

    const d = aiGeneratedData;

    const shortDesc = document.getElementById('prodDesc');
    if (shortDesc && d.shortDescription) shortDesc.value = d.shortDescription;

    const detailedDesc = document.getElementById('prodDetailedDesc');
    if (detailedDesc && d.detailedDescription) detailedDesc.value = d.detailedDescription;

    if (d.highlights && d.highlights.length) {
        productHighlights = d.highlights;
        renderHighlightTags();
        const hidden = document.getElementById('prodHighlights');
        if (hidden) hidden.value = productHighlights.join(',');
    }

    if (d.suggestedCategory) {
        const categorySelect = document.getElementById('prodCategory');
        if (categorySelect) {
            const match = Array.from(categorySelect.options).find(
                opt => opt.textContent.trim().toLowerCase() === d.suggestedCategory.trim().toLowerCase()
                    || opt.value.trim().toLowerCase() === d.suggestedCategory.trim().toLowerCase()
            );
            if (match) categorySelect.value = match.value;
        }
    }

    const priceInput = document.getElementById('prodPrice');
    if (priceInput && !priceInput.value && d.suggestedPriceRange?.min) {
        priceInput.value = d.suggestedPriceRange.min;
    }

    updateSeoPreview();
    updatePricePreview();

    showToast('✨ AI content applied to form!', 'success');
    closeModal('ai-assist-modal');
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

/* ==========================================================================
   PRODUCT VARIANT MATRIX (Simple vs Combination SKU builder)
   ========================================================================== */

const variantMatrixState = {
    add: { mode: 'simple', attributeTypes: [], combinations: [] },
    edit: { mode: 'simple', attributeTypes: [], combinations: [] }
};

/* shared state: globalAttributes lives on window (admin-core) */

function getVariantModePrefix(mode) {
    return mode === 'edit' ? 'edit' : 'add';
}

function parseCommaValues(raw) {
    return String(raw || '')
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
}

function findGlobalAttributeByName(name) {
    const key = String(name || '').trim().toLowerCase();
    if (!key) return null;
    return (globalAttributes || []).find(
        a => String(a.name || '').trim().toLowerCase() === key
    ) || null;
}

function autoFillAttributeValuesFromGlobal(nameInput) {
    if (!nameInput) return;
    const attr = findGlobalAttributeByName(nameInput.value);
    if (!attr || !Array.isArray(attr.values) || !attr.values.length) return;

    const row = nameInput.closest('[data-attr-type-row]');
    if (!row) return;
    const valuesInput = row.querySelector('.attr-type-values');
    if (!valuesInput) return;

    valuesInput.value = attr.values.join(', ');
}

function setMatrixDerivedFieldLock(el, locked, title) {
    if (!el) return;
    el.readOnly = locked;
    if (locked) {
        el.classList.add('stock-auto-locked');
        el.title = title || '';
    } else {
        el.classList.remove('stock-auto-locked');
        el.title = '';
    }
}

function unlockSimpleProductDerivedFields(mode) {
    const priceInput = document.getElementById(mode === 'edit' ? 'editProdPrice' : 'prodPrice');
    const buyingInput = document.getElementById(mode === 'edit' ? 'editProdBuyingPrice' : 'prodBuyingPrice');
    const stockInput = document.getElementById(mode === 'edit' ? 'editProdStock' : 'prodStock');
    [priceInput, buyingInput, stockInput].forEach(el => setMatrixDerivedFieldLock(el, false));
}

function cartesianCombinations(attributeTypes) {
    const cleaned = (attributeTypes || [])
        .map(t => ({
            name: String(t.name || '').trim(),
            values: [...new Set((t.values || []).map(v => String(v).trim()).filter(Boolean))]
        }))
        .filter(t => t.name && t.values.length > 0);

    if (cleaned.length === 0) return [];

    return cleaned.reduce((acc, type) => {
        if (acc.length === 0) {
            return type.values.map(value => ({ [type.name]: value }));
        }
        const next = [];
        acc.forEach(combo => {
            type.values.forEach(value => next.push({ ...combo, [type.name]: value }));
        });
        return next;
    }, []);
}

function combinationKey(attributes) {
    return Object.entries(attributes || {})
        .map(([k, v]) => `${String(k).trim().toLowerCase()}=${String(v).trim().toLowerCase()}`)
        .sort()
        .join('|');
}

/** Normalize a string segment for SKU codes (uppercase, alphanumeric + hyphens). */
function normalizeSkuToken(raw, maxLen = 16) {
    const token = String(raw || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (!token) return '';
    return token.length > maxLen ? token.slice(0, maxLen) : token;
}

/** Derive initials from product name — e.g. "Premium T-Shirt" → "PTS". */
function getProductNameInitials(name) {
    return String(name || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(word => word.replace(/[^a-zA-Z0-9]/g, '').charAt(0))
        .join('')
        .toUpperCase();
}

/** Product-level SKU prefix from Product ID field, falling back to name initials. */
function getProductSkuPrefix(mode) {
    const idEl = document.getElementById(mode === 'edit' ? 'editProdId' : 'prodId');
    const nameEl = document.getElementById(mode === 'edit' ? 'editProdName' : 'prodName');
    const productId = (idEl?.value || '').trim();
    if (productId) return normalizeSkuToken(productId, 16);
    const initials = getProductNameInitials(nameEl?.value || '');
    return initials || 'PRD';
}

function getVariantAttributeSortOrder(attrName) {
    const key = String(attrName || '').trim().toLowerCase();
    if (key === 'color' || key === 'colour') return 0;
    if (key === 'size') return 1;
    return 10;
}

/** Map attribute value to a compact SKU segment (Color before Size in final SKU). */
function attributeValueToSkuCode(attrName, value) {
    const key = String(attrName || '').trim().toLowerCase();
    const normalized = normalizeSkuToken(value, key === 'size' ? 8 : 12);
    if (!normalized) return 'VAR';

    if (key === 'color' || key === 'colour') {
        const compact = normalized.replace(/-/g, '');
        if (compact.length > 8) return compact.slice(0, 3);
    }
    return normalized;
}

/**
 * Build variant SKU: [Product ID or Initials]-[Color]-[Size]-[other attrs…]
 * Example: PTS-PINK-M or PROD55-PNK-L
 */
function generateVariantSku(mode, attributes) {
    const prefix = getProductSkuPrefix(mode);
    const segments = Object.entries(attributes || {})
        .filter(([k, v]) => String(k).trim() && String(v).trim())
        .sort(([a], [b]) => {
            const orderDiff = getVariantAttributeSortOrder(a) - getVariantAttributeSortOrder(b);
            return orderDiff !== 0 ? orderDiff : String(a).localeCompare(String(b));
        })
        .map(([k, v]) => attributeValueToSkuCode(k, v));

    return [prefix, ...segments].filter(Boolean).join('-');
}

function resolveProductImagePath(img) {
    const PT = window.ProductThumbnail;
    if (PT && typeof PT.resolveProductImagePath === 'function') {
        return PT.resolveProductImagePath(img);
    }
    const src = String(img || '').trim();
    if (!src) return '';
    if (src.startsWith('http') || src.startsWith('data:') || src.startsWith('/')) return src;
    return `/products/${src}`;
}

function adminProductImageSrc(img) {
    const resolved = resolveProductImagePath(img);
    if (!resolved) return '';
    if (resolved.startsWith('http') || resolved.startsWith('data:')) return resolved;
    if (typeof window !== 'undefined' && window.location?.origin) {
        try {
            return new URL(resolved, window.location.origin).href;
        } catch (_) {
            return resolved;
        }
    }
    return resolved;
}

const ADMIN_IMG_FALLBACK_ONERROR = "if(!this.dataset.fallback){this.dataset.fallback='1';this.src='/images/placeholder-product.svg';}else{this.style.display='none';}";

/** Primary product image from preview box or saved product record (edit mode). */
function getPrimaryProductImageUrl(mode) {
    const previewBox = document.getElementById(mode === 'edit' ? 'editImgPreviewBox' : 'imgPreviewBox');
    const previewImg = previewBox?.querySelector('img');
    if (previewImg?.src) return previewImg.src.trim();

    if (mode === 'edit') {
        const mongoId = document.getElementById('editProdMongoId')?.value;
        const product = (globalProducts || []).find(p => String(p._id) === String(mongoId));
        if (product) {
            if (Array.isArray(product.images) && product.images.length) {
                return resolveProductImagePath(product.images[0]);
            }
            if (product.image) return resolveProductImagePath(product.image);
            if (product.imageUrl) return resolveProductImagePath(product.imageUrl);
        }
    }
    return '';
}

/** Strip transient data-URL previews before persisting variant rows. */
function sanitizeVariantImageForSave(image) {
    const src = String(image || '').trim();
    if (!src || src.startsWith('data:')) return '';
    return src;
}

function formatCombinationLabel(attributes) {
    const entries = Object.entries(attributes || {})
        .map(([k, v]) => [String(k || '').trim(), String(v || '').trim()])
        .filter(([k, v]) => k && v);
    if (!entries.length) return '';
    return entries.map(([k, v]) => `${k}: ${v}`).join(' | ');
}

function resolveCombinationLabel(row) {
    const explicit = String(row?.name || row?.title || '').trim();
    if (explicit) return explicit;
    const fromAttrs = formatCombinationLabel(row?.attributes || {});
    if (fromAttrs) return fromAttrs;
    const sku = String(row?.sku || '').trim();
    return sku ? `SKU: ${sku}` : '';
}

function parseLabelToAttributes(label) {
    const out = {};
    String(label || '')
        .split('|')
        .map(s => s.trim())
        .filter(Boolean)
        .forEach(part => {
            const idx = part.indexOf(':');
            if (idx === -1) return;
            const k = part.slice(0, idx).trim();
            const v = part.slice(idx + 1).trim();
            if (k && v) out[k] = v;
        });
    return out;
}

function getVariantAttributesFromDoc(v) {
    if (window.VariantUtils && typeof window.VariantUtils.getVariantAttributes === 'function') {
        const attrs = window.VariantUtils.getVariantAttributes(v);
        if (Object.keys(attrs).length) return attrs;
    }
    if (!v || typeof v !== 'object') return {};
    if (v.attributes instanceof Map) {
        const out = {};
        v.attributes.forEach((val, key) => {
            const k = String(key || '').trim();
            const value = String(val || '').trim();
            if (k && value) out[k] = value;
        });
        if (Object.keys(out).length) return out;
    }
    if (v.attributes && typeof v.attributes === 'object') {
        const out = {};
        Object.entries(v.attributes).forEach(([k, val]) => {
            const key = String(k || '').trim();
            const value = String(val || '').trim();
            if (key && value) out[key] = value;
        });
        if (Object.keys(out).length) return out;
    }
    const attribute = String(v.attribute || '').trim();
    const value = String(v.value || '').trim();
    if (attribute && value) return { [attribute]: value };
    return parseLabelToAttributes(v.name || v.title || '');
}

function productUsesVariantMatrix(product) {
    if (!product || !Array.isArray(product.variants) || product.variants.length === 0) return false;
    if (product.hasVariants === true) return true;
    return product.variants.some(v => {
        const attrs = getVariantAttributesFromDoc(v);
        return Object.keys(attrs).length > 0 || String(v.sku || '').trim();
    });
}

function variantsToMatrixState(variants) {
    const attrMap = {};
    const combinations = [];

    (variants || []).forEach(v => {
        const attributes = getVariantAttributesFromDoc(v);
        Object.entries(attributes).forEach(([name, value]) => {
            if (!attrMap[name]) attrMap[name] = new Set();
            attrMap[name].add(value);
        });
        combinations.push({
            name: resolveCombinationLabel({ name: v.name, attributes, sku: v.sku }),
            attributes,
            sku: v.sku || '',
            price: v.price ?? '',
            buyingPrice: v.buyingPrice ?? '',
            stock: v.stock ?? '',
            image: v.image || ''
        });
    });

    const attributeTypes = Object.entries(attrMap).map(([name, set]) => ({
        name,
        values: [...set]
    }));

    return { attributeTypes, combinations };
}

function attributeTypeRowHtml(mode, data) {
    const d = data || {};
    const valuesStr = Array.isArray(d.values) ? d.values.join(', ') : (d.valuesStr || '');
    return `<div class="attribute-type-row" data-attr-type-row>
        <input list="attrNameList" class="v-input attr-type-name" placeholder="Size" value="${escHtml(d.name || '')}">
        <input class="v-input attr-type-values" placeholder="S, M, L" value="${escHtml(valuesStr)}">
        <button type="button" class="v-remove" title="Remove attribute" onclick="removeAttributeTypeRow(this, '${mode}')">
            <i class="fa-solid fa-xmark"></i>
        </button>
    </div>`;
}

function matrixRowHtml(mode, row, index) {
    const attrs = row.attributes || {};
    const label = resolveCombinationLabel(row);
    const key = combinationKey(attrs) || String(row.sku || '').trim().toLowerCase() || `idx-${index}`;
    const attrsJson = escHtml(JSON.stringify(attrs));
    const priceVal = row.price === '' || row.price === undefined || row.price === null ? '' : row.price;
    const buyVal = row.buyingPrice === '' || row.buyingPrice === undefined || row.buyingPrice === null ? '' : row.buyingPrice;
    const stockVal = row.stock === '' || row.stock === undefined || row.stock === null ? '' : row.stock;
    return `<tr data-matrix-row data-combo-key="${escHtml(key)}" data-combo-attrs="${attrsJson}" data-combo-name="${escHtml(label)}">
        <td class="matrix-combo-cell"><span class="matrix-combo-label" title="${escHtml(label)}">${escHtml(label)}</span></td>
        <td class="matrix-input-cell"><input class="v-input matrix-sku" placeholder="Auto-generated SKU" value="${escHtml(row.sku || '')}" title="Auto-filled on regenerate — editable"></td>
        <td class="matrix-input-cell"><input type="number" min="0" step="any" class="v-input matrix-price" placeholder="0" value="${priceVal}" oninput="syncMatrixTotalStock('${mode}')"></td>
        <td class="matrix-input-cell"><input type="number" min="0" step="any" class="v-input matrix-buying-price" placeholder="0" value="${buyVal}" oninput="syncMatrixTotalStock('${mode}')"></td>
        <td class="matrix-input-cell"><input type="number" min="0" class="v-input matrix-stock" placeholder="0" value="${stockVal}" oninput="syncMatrixTotalStock('${mode}')"></td>
        <td class="matrix-input-cell matrix-image-cell"><input class="v-input matrix-image" placeholder="Defaults to main product image" value="${escHtml(row.image || '')}" title="Auto-filled from main product image on regenerate — editable per variant"></td>
    </tr>`;
}

window.setProductVariantMode = function(mode, productType, options) {
    const opts = options || {};
    const prefix = getVariantModePrefix(mode);
    const isVariant = productType === 'variant';
    variantMatrixState[mode].mode = isVariant ? 'variant' : 'simple';

    const panel = document.getElementById(`${prefix}VariantMatrixPanel`);
    const hint = document.getElementById(`${prefix}SimpleStockHint`);

    if (panel) panel.style.display = isVariant ? 'block' : 'none';
    if (hint) hint.style.display = isVariant ? 'none' : 'block';

    if (isVariant) {
        syncMatrixTotalStock(mode);
    } else {
        unlockSimpleProductDerivedFields(mode);
    }

    if (isVariant && !opts.skipMatrixRegenerate && variantMatrixState[mode].combinations.length === 0) {
        generateVariantMatrix(mode);
    }
};

window.addAttributeTypeRow = function(mode, data) {
    ensureVariationDatalists();
    const list = document.getElementById(`${getVariantModePrefix(mode)}AttributeTypesList`);
    if (!list) return;
    list.insertAdjacentHTML('beforeend', attributeTypeRowHtml(mode, data));
    const row = list.lastElementChild;
    const nameInput = row?.querySelector('.attr-type-name');
    if (nameInput && data?.name) {
        autoFillAttributeValuesFromGlobal(nameInput);
    }
};

window.removeAttributeTypeRow = function(btn, mode) {
    const row = btn.closest('[data-attr-type-row]');
    if (row) row.remove();
};

function collectAttributeTypes(mode) {
    const list = document.getElementById(`${getVariantModePrefix(mode)}AttributeTypesList`);
    if (!list) return [];
    const out = [];
    list.querySelectorAll('[data-attr-type-row]').forEach(row => {
        const name = (row.querySelector('.attr-type-name')?.value || '').trim();
        const values = parseCommaValues(row.querySelector('.attr-type-values')?.value || '');
        if (name && values.length) out.push({ name, values });
    });
    return out;
}

window.generateVariantMatrix = function(mode) {
    const attributeTypes = collectAttributeTypes(mode);
    variantMatrixState[mode].attributeTypes = attributeTypes;

    const existing = {};
    (variantMatrixState[mode].combinations || []).forEach(row => {
        existing[combinationKey(row.attributes)] = row;
    });

    const combos = cartesianCombinations(attributeTypes);
    const basePrice = document.getElementById(mode === 'edit' ? 'editProdPrice' : 'prodPrice')?.value || '';
    const baseBuyingPrice = document.getElementById(mode === 'edit' ? 'editProdBuyingPrice' : 'prodBuyingPrice')?.value || '';
    const defaultImage = getPrimaryProductImageUrl(mode);

    variantMatrixState[mode].combinations = combos.map(attributes => {
        const key = combinationKey(attributes);
        const prev = existing[key] || {};
        const comboRow = {
            attributes,
            sku: prev.sku || generateVariantSku(mode, attributes),
            price: prev.price !== undefined && prev.price !== '' ? prev.price : basePrice,
            buyingPrice: prev.buyingPrice !== undefined && prev.buyingPrice !== '' ? prev.buyingPrice : baseBuyingPrice,
            stock: prev.stock ?? '',
            image: prev.image || defaultImage || ''
        };
        comboRow.name = resolveCombinationLabel(comboRow);
        return comboRow;
    });

    renderVariantMatrix(mode);
};

function renderVariantMatrix(mode) {
    const prefix = getVariantModePrefix(mode);
    const body = document.getElementById(`${prefix}VariantMatrixBody`);
    const wrap = document.getElementById(`${prefix}VariantMatrixWrap`);
    const empty = document.getElementById(`${prefix}VariantMatrixEmpty`);
    const rows = variantMatrixState[mode].combinations || [];

    if (body) body.innerHTML = rows.map((r, i) => matrixRowHtml(mode, r, i)).join('');
    if (wrap) wrap.style.display = rows.length ? 'block' : 'none';
    if (empty) empty.style.display = rows.length ? 'none' : 'block';
    syncMatrixTotalStock(mode);
}

function parseMatrixRowAttributes(rowEl, fallbackAttributes) {
    const raw = rowEl.getAttribute('data-combo-attrs');
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && Object.keys(parsed).length) return parsed;
        } catch (e) { /* use fallback */ }
    }
    return fallbackAttributes || {};
}

function collectMatrixCombinations(mode) {
    const prefix = getVariantModePrefix(mode);
    const body = document.getElementById(`${prefix}VariantMatrixBody`);
    if (!body) return variantMatrixState[mode].combinations || [];

    const out = [];
    body.querySelectorAll('[data-matrix-row]').forEach(row => {
        const key = row.getAttribute('data-combo-key') || '';
        const base = (variantMatrixState[mode].combinations || []).find((r, i) => {
            const rowKey = combinationKey(r.attributes) || String(r.sku || '').trim().toLowerCase() || `idx-${i}`;
            return rowKey === key;
        });
        const attributes = parseMatrixRowAttributes(row, base?.attributes);
        const sku = (row.querySelector('.matrix-sku')?.value || '').trim();
        const price = Number(row.querySelector('.matrix-price')?.value) || 0;
        const buyingPrice = Number(row.querySelector('.matrix-buying-price')?.value) || 0;
        const stock = Number(row.querySelector('.matrix-stock')?.value) || 0;
        const image = sanitizeVariantImageForSave(row.querySelector('.matrix-image')?.value || '');
        const comboRow = { attributes, sku, price, buyingPrice, stock, image };
        comboRow.name = resolveCombinationLabel(comboRow);
        if (Object.keys(attributes).length || sku) {
            out.push(comboRow);
        }
    });
    return out;
}

function sumMatrixStockFromDom(mode) {
    const prefix = getVariantModePrefix(mode);
    const body = document.getElementById(`${prefix}VariantMatrixBody`);
    if (!body) return 0;
    return [...body.querySelectorAll('.matrix-stock')].reduce(
        (sum, el) => sum + (Number(el.value) || 0),
        0
    );
}

function computeMatrixMinSellPrice(combinations) {
    if (!Array.isArray(combinations) || combinations.length === 0) return 0;
    const prices = combinations
        .map(r => Number(r.price))
        .filter(p => Number.isFinite(p) && p > 0);
    return prices.length ? Math.min(...prices) : 0;
}

function computeMatrixMinBuyingPrice(combinations) {
    if (!Array.isArray(combinations) || combinations.length === 0) return 0;
    const prices = combinations
        .map(r => Number(r.buyingPrice))
        .filter(p => Number.isFinite(p) && p > 0);
    return prices.length ? Math.min(...prices) : 0;
}

window.syncMatrixTotalStock = function(mode) {
    const priceInput = document.getElementById(mode === 'edit' ? 'editProdPrice' : 'prodPrice');
    const buyingInput = document.getElementById(mode === 'edit' ? 'editProdBuyingPrice' : 'prodBuyingPrice');
    const stockInput = document.getElementById(mode === 'edit' ? 'editProdStock' : 'prodStock');
    const totalEl = document.getElementById(`${getVariantModePrefix(mode)}MatrixTotalStock`);
    if (variantMatrixState[mode].mode !== 'variant') return;

    const combinations = collectMatrixCombinations(mode);
    variantMatrixState[mode].combinations = combinations;

    const total = sumMatrixStockFromDom(mode);
    if (totalEl) totalEl.textContent = String(total);

    if (stockInput) {
        stockInput.value = String(total);
        setMatrixDerivedFieldLock(
            stockInput,
            true,
            'Auto-calculated from variant matrix (sum of combination stock)'
        );
    }

    const minSell = computeMatrixMinSellPrice(combinations);
    if (priceInput) {
        priceInput.value = minSell > 0 ? String(minSell) : '';
        setMatrixDerivedFieldLock(
            priceInput,
            true,
            'Auto-calculated minimum sell price across variant rows'
        );
    }

    const minBuy = computeMatrixMinBuyingPrice(combinations);
    if (buyingInput) {
        buyingInput.value = minBuy > 0 ? String(minBuy) : '';
        setMatrixDerivedFieldLock(
            buyingInput,
            true,
            'Auto-calculated minimum buy price across variant rows'
        );
    }

    if (typeof updateEditProfitPreview === 'function' && mode === 'edit') {
        updateEditProfitPreview();
    }
};

function collectProductVariantPayload(mode) {
    const isVariant = variantMatrixState[mode].mode === 'variant';
    if (!isVariant) {
        const stockInput = document.getElementById(mode === 'edit' ? 'editProdStock' : 'prodStock');
        const stockQuantity = Number(stockInput?.value) || 0;
        return { hasVariants: false, variants: [], stockQuantity, stock: stockQuantity };
    }

    const variants = collectMatrixCombinations(mode);
    const total = variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
    return { hasVariants: variants.length > 0, variants, stockQuantity: total, stock: total };
}

function loadProductVariantUI(mode, product) {
    ensureVariationDatalists();
    const prefix = getVariantModePrefix(mode);
    const hasVariants = productUsesVariantMatrix(product);
    const productType = hasVariants ? 'variant' : 'simple';

    const radio = document.querySelector(`input[name="${prefix}ProductType"][value="${productType}"]`);
    if (radio) radio.checked = true;

    if (hasVariants) {
        const { attributeTypes, combinations } = variantsToMatrixState(product.variants);
        variantMatrixState[mode] = { mode: 'variant', attributeTypes, combinations };

        const list = document.getElementById(`${prefix}AttributeTypesList`);
        if (list) {
            if (attributeTypes.length) {
                list.innerHTML = attributeTypes.map(t => attributeTypeRowHtml(mode, {
                    name: t.name,
                    values: t.values
                })).join('');
            } else {
                list.innerHTML = attributeTypeRowHtml(mode, { name: '', values: [] });
            }
        }
        renderVariantMatrix(mode);
    } else {
        variantMatrixState[mode] = { mode: 'simple', attributeTypes: [], combinations: [] };
        const list = document.getElementById(`${prefix}AttributeTypesList`);
        if (list) list.innerHTML = '';
        renderVariantMatrix(mode);
    }

    setProductVariantMode(mode, productType, { skipMatrixRegenerate: hasVariants });

    if (!hasVariants) {
        const stockInput = document.getElementById(mode === 'edit' ? 'editProdStock' : 'prodStock');
        const qty = product?.stockQuantity ?? product?.stock ?? '';
        if (stockInput && qty !== '') stockInput.value = qty;
    } else {
        syncMatrixTotalStock(mode);
    }
}

function resetProductVariantUI(mode) {
    const prefix = getVariantModePrefix(mode);
    variantMatrixState[mode] = { mode: 'simple', attributeTypes: [], combinations: [] };
    const list = document.getElementById(`${prefix}AttributeTypesList`);
    if (list) list.innerHTML = '';
    const radio = document.querySelector(`input[name="${prefix}ProductType"][value="simple"]`);
    if (radio) radio.checked = true;
    setProductVariantMode(mode, 'simple');
    renderVariantMatrix(mode);
}

/** Legacy alias used after form reset */
function renderVariations(mode, list) {
    if (list && list.length) {
        loadProductVariantUI(mode, { hasVariants: true, variants: list });
    } else {
        resetProductVariantUI(mode);
    }
}

/** Shared datalists for attribute names (Manage Attributes integration) */
function ensureVariationDatalists() {
    let nameList = document.getElementById('attrNameList');
    if (!nameList) {
        nameList = document.createElement('datalist');
        nameList.id = 'attrNameList';
        document.body.appendChild(nameList);
    }
    nameList.innerHTML = (globalAttributes || [])
        .map(a => `<option value="${escHtml(a.name)}"></option>`).join('');
}

window.collectVariations = function(mode) {
    return collectProductVariantPayload(mode).variants;
};

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('addProductForm')) resetProductVariantUI('add');
});

document.addEventListener('change', (e) => {
    if (e.target?.classList?.contains('attr-type-name')) {
        autoFillAttributeValuesFromGlobal(e.target);
    }
});

document.addEventListener('input', (e) => {
    if (!e.target?.classList?.contains('attr-type-name')) return;
    const attr = findGlobalAttributeByName(e.target.value);
    if (attr) autoFillAttributeValuesFromGlobal(e.target);
});

/* ==========================================================================
   SECTION 9.4: MANAGE CATEGORIES (tree UI + admin CRUD)
   NOTE: admin.js is loaded as type="module" — every handler used by HTML
   onclick/oninput MUST be assigned to window (same pattern as brands).
   ========================================================================== */

/* shared state: allCategories lives on window (admin-core) */

/* shared state: editingCategoryId lives on window (admin-core) */

/* shared state: categorySortable lives on window (admin-core) */

function getAdminAuthToken() {
    return localStorage.getItem('adminToken') || token || '';
}

/** Alias used by category row onclick handlers */
function getAuthToken() {
    return getAdminAuthToken();
}
window.getAuthToken = getAuthToken;

async function loadCategories() {
    const authToken = getAdminAuthToken();

    try {
        const res = await fetch('/api/categories/admin/all', {
            headers: { 'Authorization': 'Bearer ' + authToken }
        });

        if (!res.ok) {
            console.error('Categories API error:', res.status, res.statusText);
            const text = await res.text();
            console.error('Response:', text);
            let data = {};
            try { data = JSON.parse(text); } catch (_) { /* non-JSON */ }
            if (handleAdminApiAuthResponse(res, data) !== 'ok') return;
            showToast('Failed to load categories: ' + res.status, 'error');
            return;
        }

        const data = await res.json();
        console.log('Categories loaded:', data);

        if (handleAdminApiAuthResponse(res, data) !== 'ok') return;

        if (data.success) {
            allCategories = data.data || [];
            globalCategories = allCategories;
            renderCategoryTree(allCategories);
            updateCategoryStats(allCategories);
            populateParentDropdown(allCategories);
            renderCategoryDropdown();
        } else {
            showToast(data.message || 'Failed to load categories', 'error');
        }
    } catch (err) {
        console.error('loadCategories error:', err);
        showToast('Network error loading categories', 'error');
    }
}
window.loadCategories = loadCategories;

function updateCategoryStats(cats) {
    const el = id => document.getElementById(id);
    if (el('catTotalCount')) el('catTotalCount').textContent = cats.length;
    if (el('catActiveCount')) el('catActiveCount').textContent = cats.filter(c => c.isActive !== false).length;
    if (el('catFeaturedCount')) el('catFeaturedCount').textContent = cats.filter(c => c.isFeatured === true).length;
    // Strict true — do not count undefined/default as "In Navbar"
    if (el('catNavbarCount')) el('catNavbarCount').textContent = cats.filter(c => c.showInNavbar === true).length;
}

function populateParentDropdown(cats) {
    const sel = document.getElementById('catParent');
    if (!sel) return;
    const parents = (cats || []).filter(c => !c.parentCategory);
    sel.innerHTML = '<option value="">None (Top-level)</option>' +
        parents.map(c => `<option value="${c._id}">${escHtml(c.name)}</option>`).join('');
    if (editingCategoryId) {
        // Don't allow setting itself as parent
        const opt = sel.querySelector(`option[value="${editingCategoryId}"]`);
        if (opt) opt.remove();
    }
}

function sortCatsByPosition(a, b) {
    const pa = Number(a.position) || 0;
    const pb = Number(b.position) || 0;
    if (pa !== pb) return pa - pb;
    return String(a.name || '').localeCompare(String(b.name || ''));
}

function buildCategoryRowHtml(cat) {
    const isSub = !!cat.parentCategory;
    const parentName = cat.parentCategory?.name || '';
    const imgSrc = cat.imageUrl || cat.image || '';
    const color = escHtml(cat.color || '#f97316');
    const safeName = escHtml(cat.name || '');
    const safeId = escHtml(String(cat._id));
    const safeSlug = cat.slug ? escHtml(cat.slug) : '';
    const nameAttr = safeName.replace(/'/g, '&#39;');
    const isActive = cat.isActive !== false;

    const imgHtml = imgSrc
        ? `<img class="cat-row-thumb" src="${escHtml(imgSrc)}" alt="${safeName}"
               style="border-color:${color}"
               onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex'">`
        : '';

    return `
  <div class="category-row${isSub ? ' is-sub' : ''}" data-id="${safeId}">
    <span class="drag-handle" title="Drag to reorder">⠿</span>
    ${imgHtml}
    <div class="cat-color-avatar" style="
      background:${color};
      display:${imgSrc ? 'none' : 'flex'};">
      ${isSub ? '↳' : '🏷️'}
    </div>
    <div class="cat-row-info">
      <div class="cat-row-title">
        ${isSub
          ? `<span class="cat-row-parent-hint">↳ ${escHtml(parentName)}</span>`
          : ''}
        <span class="cat-row-name">${safeName}</span>
        ${cat.isFeatured ? '<span class="cat-mini-badge cb-featured">★ FEATURED</span>' : ''}
        ${cat.showInNavbar === true ? '<span class="cat-mini-badge cb-navbar">NAV</span>' : ''}
        ${cat.showInHomepage ? '<span class="cat-mini-badge cb-homepage">HOME</span>' : ''}
        ${!isActive ? '<span class="cat-mini-badge cb-inactive">Inactive</span>' : ''}
      </div>
      <div class="cat-row-meta">
        ${cat.productCount || 0} products${safeSlug ? ` · /${safeSlug}` : ''}
      </div>
    </div>
    <label class="toggle-switch" title="${isActive ? 'Active' : 'Inactive'}"
           onclick="event.stopPropagation()">
      <input type="checkbox" ${isActive ? 'checked' : ''}
             onchange="toggleCategoryActive('${safeId}', this.checked)">
      <span class="toggle-slider"></span>
    </label>
    <div class="cat-row-actions" onclick="event.stopPropagation()">
      <button type="button" class="action-icon edit"
              onclick="openEditCategory('${safeId}')" title="Edit">✏️</button>
      <button type="button" class="action-icon delete"
              onclick="deleteCategory('${safeId}','${nameAttr}')" title="Delete">🗑️</button>
    </div>
  </div>`;
}

function initCategorySortable(container) {
    if (categorySortable) {
        try { categorySortable.destroy(); } catch (_) { /* ignore */ }
        categorySortable = null;
    }
    if (!container || typeof Sortable === 'undefined') return;

    categorySortable = Sortable.create(container, {
        handle: '.drag-handle',
        animation: 150,
        ghostClass: 'sortable-ghost',
        draggable: '.category-row',
        onEnd: async function() {
            const items = container.querySelectorAll('.category-row[data-id]');
            const order = Array.from(items).map((el, index) => ({
                id: el.dataset.id,
                position: index
            }));

            try {
                const res = await fetch('/api/categories/admin/reorder', {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + getAdminAuthToken()
                    },
                    body: JSON.stringify({ order })
                });
                const data = await res.json();
                if (handleAdminApiAuthResponse(res, data) !== 'ok') {
                    loadCategories();
                    return;
                }
                if (data.success) {
                    showToast('Category order saved!', 'success');
                    // Keep local positions in sync without full reload flicker
                    order.forEach(item => {
                        const cat = allCategories.find(c => String(c._id) === String(item.id));
                        if (cat) cat.position = item.position;
                    });
                } else {
                    showToast(data.message || 'Failed to save order', 'error');
                    loadCategories();
                }
            } catch (err) {
                console.error('Category reorder error:', err);
                showToast('Network error saving order', 'error');
                loadCategories();
            }
        }
    });
}

function renderCategoryTree(cats) {
    const container = document.getElementById('categoryTree');
    if (!container) return;

    if (categorySortable) {
        try { categorySortable.destroy(); } catch (_) { /* ignore */ }
        categorySortable = null;
    }

    const parents = cats.filter(c => !c.parentCategory).sort(sortCatsByPosition);
    const children = cats.filter(c => c.parentCategory).sort(sortCatsByPosition);

    if (!parents.length && !children.length) {
        container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🗂️</div>
        <h3>No categories yet</h3>
        <p>Click "+ Add Category" to create your first category.</p>
      </div>`;
        return;
    }

    // Flat ordered list: each parent followed by its subs (visual hierarchy via CSS)
    let ordered = [];
    if (parents.length) {
        parents.forEach(parent => {
            ordered.push(parent);
            children
                .filter(c =>
                    String(c.parentCategory) === String(parent._id) ||
                    String(c.parentCategory?._id) === String(parent._id)
                )
                .forEach(sub => ordered.push(sub));
        });
        // Orphan subs whose parent is not in the filtered set
        const shownIds = new Set(ordered.map(c => String(c._id)));
        children.forEach(sub => {
            if (!shownIds.has(String(sub._id))) ordered.push(sub);
        });
    } else {
        ordered = children;
    }

    container.innerHTML = ordered.map(buildCategoryRowHtml).join('');
    initCategorySortable(container);
}

window.toggleCatChildren = function(id) {
    const el = document.getElementById(id);
    if (el) {
        el.style.display = (el.style.display === 'none' ? '' : 'none');
    }
};

window.filterCategories = function() {
    const search = (document.getElementById('catSearch')?.value || '').toLowerCase();
    const typeFilter = document.getElementById('catFilterParent')?.value || 'all';
    const statusFilter = document.getElementById('catFilterStatus')?.value || 'all';

    const filtered = allCategories.filter(c => {
        const matchSearch = !search || (c.name || '').toLowerCase().includes(search);
        const matchType = typeFilter === 'all' ? true :
                          typeFilter === 'parent' ? !c.parentCategory :
                          !!c.parentCategory;
        const matchStatus = statusFilter === 'all' ? true :
                            statusFilter === 'active' ? c.isActive !== false :
                            c.isActive === false;
        return matchSearch && matchType && matchStatus;
    });

    renderCategoryTree(filtered);
};

function fillCategoryModal(cat) {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val ?? '';
    };
    const check = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.checked = !!val;
    };

    set('catName', cat.name);
    set('catDescription', cat.description);
    set('catCashback', cat.customCashback ?? cat.customCashbackPercentage ?? '');
    set('catPosition', cat.position || 0);
    set('catColor', cat.color || '#f97316');
    set('catColorHex', cat.color || '#f97316');
    set('catMetaTitle', cat.metaTitle);
    set('catMetaDesc', cat.metaDescription);

    check('catIsActive', cat.isActive !== false);
    check('catIsFeatured', cat.isFeatured);
    // Strict boolean — matches stats / NAV badge (do not treat undefined as true)
    check('catShowNavbar', cat.showInNavbar === true);
    check('catShowHomepage', cat.showInHomepage);

    const parentId = cat.parentCategory?._id || cat.parentCategory || '';
    set('catParent', parentId);

    if (cat.imageUrl) {
        const preview = document.getElementById('catImgPreview');
        if (preview) {
            preview.innerHTML =
                `<img src="${escHtml(cat.imageUrl)}" class="banner-preview-img" alt="${escHtml(cat.name)}">`;
        }
        const zone = document.getElementById('catImgZone');
        if (zone) zone.classList.add('has-image');
    }
}

window.closeCategoryModal = function() {
    closeModal('categoryModal');
};

// Aliases — same shared modal for Add and Edit
window.closeAddCategoryModal = window.closeCategoryModal;
window.closeEditCategoryModal = window.closeCategoryModal;
window.openAddCategoryModal = function() { return window.openCategoryModal(); };

window.openCategoryModal = async function(catId = null) {
    editingCategoryId = catId || null;
    const modal = document.getElementById('categoryModal');
    if (!modal) {
        console.error('categoryModal not found in DOM');
        return;
    }

    // Reset all form fields
    const fieldIds = ['catName', 'catDescription', 'catCashback',
                      'catPosition', 'catMetaTitle', 'catMetaDesc'];
    fieldIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    const colorEl = document.getElementById('catColor');
    const colorHexEl = document.getElementById('catColorHex');
    if (colorEl) colorEl.value = '#f97316';
    if (colorHexEl) colorHexEl.value = '#f97316';

    const activeEl = document.getElementById('catIsActive');
    if (activeEl) activeEl.checked = true;

    ['catIsFeatured', 'catShowHomepage'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = false;
    });
    const navEl = document.getElementById('catShowNavbar');
    if (navEl) navEl.checked = true;

    const parentEl = document.getElementById('catParent');
    if (parentEl) parentEl.value = '';

    const imgPreview = document.getElementById('catImgPreview');
    if (imgPreview) {
        imgPreview.innerHTML =
            '<span style="font-size:1.5rem">🖼️</span><p style="font-size:0.78rem;color:#64748b;margin:4px 0">Click to upload</p>';
    }

    const imgZone = document.getElementById('catImgZone');
    if (imgZone) imgZone.classList.remove('has-image');

    const imgFile = document.getElementById('catImageFile');
    if (imgFile) imgFile.value = '';

    populateParentDropdown(allCategories);

    const title = document.getElementById('catModalTitle');
    const icon = document.getElementById('catModalIcon');
    const saveBtn = document.getElementById('saveCatBtn');

    if (catId) {
        if (icon) icon.textContent = '✏️';
        if (title) title.textContent = 'Edit Category';
        if (saveBtn) saveBtn.textContent = '💾 Update Category';
        modal.classList.add('open');
        try {
            const authToken = getAdminAuthToken();
            const res = await fetch('/api/categories/admin/' + catId, {
                headers: { 'Authorization': 'Bearer ' + authToken }
            });
            const data = await res.json();
            if (handleAdminApiAuthResponse(res, data) !== 'ok') return;
            if (data.success && data.data) {
                fillCategoryModal(data.data);
            } else {
                const fallback = allCategories.find(c => String(c._id) === String(catId));
                if (fallback) fillCategoryModal(fallback);
                else showToast(data.message || 'Category not found', 'error');
            }
        } catch (err) {
            console.error('editCategory load error:', err);
            const fallback = allCategories.find(c => String(c._id) === String(catId));
            if (fallback) fillCategoryModal(fallback);
            else showToast('Error: ' + err.message, 'error');
        }
        return;
    }

    if (icon) icon.textContent = '➕';
    if (title) title.textContent = 'Add New Category';
    if (saveBtn) saveBtn.textContent = '💾 Save Category';
    modal.classList.add('open');
};

window.editCategory = function(id) { window.openCategoryModal(id); };
window.openEditCategory = function(id) { window.openCategoryModal(id); };

// Close category modal with Escape
document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    const modal = document.getElementById('categoryModal');
    if (modal && modal.classList.contains('open')) {
        closeCategoryModal();
    }
});

window.toggleCategoryActive = async function(categoryId, isActive) {
    try {
        const res = await fetch('/api/categories/admin/' + categoryId, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + getAdminAuthToken()
            },
            body: JSON.stringify({ isActive })
        });
        const data = await res.json();
        if (handleAdminApiAuthResponse(res, data) !== 'ok') {
            loadCategories();
            return;
        }
        if (data.success) {
            showToast('Category ' + (isActive ? 'activated' : 'deactivated'), 'success');
            await loadCategories();
        } else {
            showToast(data.message || 'Update failed', 'error');
            await loadCategories();
        }
    } catch (err) {
        console.error('toggleCategoryActive error:', err);
        showToast('Network error', 'error');
        await loadCategories();
    }
};

window.previewCatImg = function(input) {
    const file = input?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        const preview = document.getElementById('catImgPreview');
        if (preview) {
            preview.innerHTML = `<img src="${e.target.result}" class="banner-preview-img">`;
        }
        const zone = document.getElementById('catImgZone');
        if (zone) zone.classList.add('has-image');
    };
    reader.readAsDataURL(file);
};

window.saveCategory = async function() {
    const name = document.getElementById('catName')?.value?.trim();
    if (!name) {
        showToast('Category name is required', 'error');
        return;
    }

    const authToken = getAdminAuthToken();
    const btn = document.getElementById('saveCatBtn');
    const idleLabel = editingCategoryId ? '💾 Update Category' : '💾 Save Category';
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Saving...'; }

    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', document.getElementById('catDescription')?.value || '');
    formData.append('parentCategory', document.getElementById('catParent')?.value || '');
    formData.append('color', document.getElementById('catColor')?.value || '#f97316');
    formData.append('isActive', String(document.getElementById('catIsActive')?.checked !== false));
    formData.append('isFeatured', String(!!document.getElementById('catIsFeatured')?.checked));
    formData.append('showInNavbar', String(!!document.getElementById('catShowNavbar')?.checked));
    formData.append('showInHomepage', String(!!document.getElementById('catShowHomepage')?.checked));
    formData.append('position', document.getElementById('catPosition')?.value || '0');
    formData.append('customCashback', document.getElementById('catCashback')?.value || '');
    formData.append('metaTitle', document.getElementById('catMetaTitle')?.value || '');
    formData.append('metaDescription', document.getElementById('catMetaDesc')?.value || '');

    const imgFile = document.getElementById('catImageFile')?.files?.[0];
    if (imgFile) formData.append('categoryImage', imgFile);

    try {
        const url = editingCategoryId
            ? '/api/categories/admin/' + editingCategoryId
            : '/api/categories/admin';
        const method = editingCategoryId ? 'PATCH' : 'POST';

        console.log('Saving category:', method, url);

        const res = await fetch(url, {
            method,
            headers: { 'Authorization': 'Bearer ' + authToken },
            body: formData
        });

        const data = await res.json();
        console.log('Save category response:', data);

        if (handleAdminApiAuthResponse(res, data) !== 'ok') return;

        if (data.success) {
            showToast(editingCategoryId ? '✅ Category updated!' : '✅ Category created!', 'success');
            closeCategoryModal();
            await loadCategories();
            if (typeof fetchCategories === 'function') await fetchCategories();
        } else {
            showToast(data.message || 'Save failed', 'error');
        }
    } catch (err) {
        console.error('saveCategory error:', err);
        showToast('Error: ' + err.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = idleLabel; }
    }
};

// Custom confirm dialog — replaces browser confirm()
function showDeleteConfirm(message, onConfirm) {
    const modal = document.getElementById('confirmDeleteModal');
    const msgEl = document.getElementById('confirmDeleteMsg');
    const btn = document.getElementById('confirmDeleteBtn');

    if (!modal || !msgEl || !btn) {
        // Fallback to browser confirm if modal not found
        if (confirm(message)) onConfirm();
        return;
    }

    msgEl.textContent = message;

    // Remove old listener and add new one
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', () => {
        closeModal('confirmDeleteModal');
        onConfirm();
    });

    modal.classList.add('open');
}

window.deleteCategory = async function(categoryId, categoryName) {
    if (typeof Swal === 'undefined') {
        // Fallback if SweetAlert2 failed to load
        showDeleteConfirm(
            'Delete category "' + categoryName + '"?\n\nSub-categories will also be deleted. Products must be reassigned first.',
            () => performCategoryDelete(categoryId)
        );
        return;
    }

    const result = await Swal.fire({
        title: 'Delete "' + categoryName + '"?',
        html: `<p style="color:#64748b;font-size:14px;">
      This will also delete all sub-categories.<br>
      Products must be reassigned first.
    </p>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: '🗑️ Yes, Delete',
        cancelButtonText: 'Cancel',
        reverseButtons: true
    });

    if (!result.isConfirmed) return;
    await performCategoryDelete(categoryId);
};

async function performCategoryDelete(categoryId) {
    try {
        const res = await fetch('/api/categories/admin/' + categoryId, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + getAdminAuthToken() }
        });
        const data = await res.json();

        if (handleAdminApiAuthResponse(res, data) !== 'ok') return;

        if (data.success) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    title: 'Deleted!',
                    text: data.message || 'Category deleted',
                    icon: 'success',
                    timer: 2000,
                    showConfirmButton: false
                });
            } else {
                showToast('✅ Category deleted', 'success');
            }
            await loadCategories();
            if (typeof fetchCategories === 'function') await fetchCategories();
        } else if (typeof Swal !== 'undefined') {
            Swal.fire('Cannot Delete', data.message || 'Cannot delete', 'error');
        } else {
            showToast(data.message || 'Cannot delete', 'error');
        }
    } catch (err) {
        console.error('deleteCategory error:', err);
        if (typeof Swal !== 'undefined') {
            Swal.fire('Error', 'Network error while deleting', 'error');
        } else {
            showToast('Error: ' + err.message, 'error');
        }
    }
}

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

/* ==========================================================================
   SECTION 9B1: NAVBAR MENU LINKS (top-bar promo links → /api/navbar-links)
   Optional Quill CMS page creator → PageContent at /page/:slug
   ========================================================================== */

/* shared state: globalNavbarLinks lives on window (admin-core) */

/* shared state: navbarLinkQuill lives on window (admin-core) */

function slugifyNavbarLinkText(text) {
    return String(text || '')
        .toLowerCase()
        .trim()
        .replace(/^\/+/, '')
        .replace(/^pages?\//, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

function getNavbarLinkSlugPreview() {
    const slugInput = document.getElementById('navbarLinkSlug')?.value?.trim() || '';
    const title = document.getElementById('navbarLinkTitle')?.value?.trim() || '';
    return slugifyNavbarLinkText(slugInput || title) || 'your-slug';
}

function updateNavbarLinkRoutePreview() {
    const route = `/page/${getNavbarLinkSlugPreview()}`;
    const preview = document.getElementById('navbarLinkRoutePreview');
    if (preview) preview.textContent = route;
    const openLink = document.getElementById('navbarLinkRouteOpen');
    if (openLink) openLink.href = route;
    const customOn = !!document.getElementById('navbarLinkCustomPage')?.checked;
    const urlInput = document.getElementById('navbarLinkUrl');
    if (customOn && urlInput) {
        urlInput.value = route;
    }
}

function registerNavbarLinkQuillFormats() {
    if (typeof Quill === 'undefined' || window.__navbarQuillFormatsRegistered) return;
    const Font = Quill.import('formats/font');
    Font.whitelist = ['serif', 'monospace', 'arial', 'georgia', 'tahoma', 'verdana', 'poppins', 'hind-siliguri'];
    Quill.register(Font, true);

    const SizeStyle = Quill.import('attributors/style/size');
    SizeStyle.whitelist = ['12px', '14px', '16px', '18px', '24px', '32px', '48px'];
    Quill.register(SizeStyle, true);

    const AlignStyle = Quill.import('attributors/style/align');
    Quill.register(AlignStyle, true);
    window.__navbarQuillFormatsRegistered = true;
}

function ensureNavbarLinkQuill() {
    if (navbarLinkQuill) return navbarLinkQuill;
    if (typeof Quill === 'undefined') {
        console.warn('Quill.js not loaded — custom page editor unavailable.');
        return null;
    }

    registerNavbarLinkQuillFormats();
    const editorEl = document.getElementById('navbarLinkQuillEditor');
    const toolbarEl = document.getElementById('navbarLinkQuillToolbar');
    if (!editorEl || !toolbarEl) return null;

    navbarLinkQuill = new Quill(editorEl, {
        theme: 'snow',
        modules: {
            toolbar: {
                container: toolbarEl,
                handlers: {
                    image() {
                        pickNavbarLinkImage(this.quill);
                    }
                }
            }
        },
        placeholder: 'Write promotional page content…'
    });

    document.getElementById('navbarLinkHtmlEmbedBtn')?.addEventListener('click', () => {
        insertNavbarLinkHtmlEmbed(navbarLinkQuill);
    });

    navbarLinkQuill.on('text-change', () => {
        const hidden = document.getElementById('navbarLinkPageHtml');
        if (hidden) hidden.value = navbarLinkQuill.root.innerHTML;
    });

    return navbarLinkQuill;
}

function pickNavbarLinkImage(quill) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
        const file = input.files && input.files[0];
        if (!file) return;
        if (file.size > 1.5 * 1024 * 1024) {
            showToast('Image must be under 1.5 MB (or paste an image URL).', 'warning');
            const url = window.prompt('Or paste an image URL:');
            if (url) insertNavbarLinkImageUrl(quill, url.trim());
            return;
        }
        const reader = new FileReader();
        reader.onload = () => insertNavbarLinkImageUrl(quill, String(reader.result || ''));
        reader.readAsDataURL(file);
    };
    input.click();
}

function insertNavbarLinkImageUrl(quill, url) {
    if (!quill || !url) return;
    const range = quill.getSelection(true) || { index: quill.getLength(), length: 0 };
    quill.insertEmbed(range.index, 'image', url, 'user');
    quill.setSelection(range.index + 1, 0, 'silent');
}

async function insertNavbarLinkHtmlEmbed(quill) {
    if (!quill) return;
    let html = '';
    if (typeof Swal !== 'undefined') {
        const result = await Swal.fire({
            title: 'Embed HTML',
            input: 'textarea',
            inputLabel: 'Paste HTML (iframe, styled blocks, etc.)',
            inputPlaceholder: '<iframe src="https://www.youtube.com/embed/…"></iframe>',
            inputAttributes: { 'aria-label': 'HTML to embed' },
            showCancelButton: true,
            confirmButtonText: 'Insert',
            width: 640
        });
        if (!result.isConfirmed) return;
        html = String(result.value || '').trim();
    } else {
        html = String(window.prompt('Paste HTML to embed:') || '').trim();
    }
    if (!html) return;
    const range = quill.getSelection(true) || { index: quill.getLength(), length: 0 };
    quill.clipboard.dangerouslyPasteHTML(range.index, html, 'user');
}

/** Decode entity-escaped HTML (&lt;p&gt; → <p>) so Quill/DB store raw markup. */
function decodeHtmlEntities(value) {
    let html = String(value ?? '');
    if (!html) return '';
    for (let i = 0; i < 3; i += 1) {
        if (!/&(?:lt|gt|amp|quot|#39|#x27);/i.test(html)) break;
        const ta = document.createElement('textarea');
        ta.innerHTML = html;
        const next = ta.value;
        if (next === html) break;
        html = next;
    }
    return html;
}

function setNavbarLinkQuillHtml(html) {
    const quill = ensureNavbarLinkQuill();
    const safe = decodeHtmlEntities(String(html || '').trim()) || '<p><br></p>';
    if (quill) {
        quill.setContents([]);
        quill.clipboard.dangerouslyPasteHTML(0, safe, 'silent');
        // Prefer root HTML after paste (raw tags, not entities)
        const hidden = document.getElementById('navbarLinkPageHtml');
        if (hidden) {
            const out = quill.root.innerHTML;
            hidden.value = (!quill.getText().replace(/\n/g, '').trim()
                && !quill.root.querySelector('img,iframe')) ? '' : out;
        }
        return;
    }
    const hidden = document.getElementById('navbarLinkPageHtml');
    if (hidden) hidden.value = safe === '<p><br></p>' ? '' : safe;
}

function getNavbarLinkQuillHtml() {
    if (navbarLinkQuill) {
        const text = navbarLinkQuill.getText().replace(/\n/g, '').trim();
        if (!text && !navbarLinkQuill.root.querySelector('img,iframe')) return '';
        return decodeHtmlEntities(navbarLinkQuill.root.innerHTML);
    }
    return decodeHtmlEntities(document.getElementById('navbarLinkPageHtml')?.value || '');
}

function syncNavbarLinkCustomPageUi() {
    const customOn = !!document.getElementById('navbarLinkCustomPage')?.checked;
    const panel = document.getElementById('navbarLinkCmsPanel');
    const urlInput = document.getElementById('navbarLinkUrl');
    const urlHint = document.getElementById('navbarLinkUrlHint');
    if (panel) panel.hidden = !customOn;
    if (urlInput) {
        urlInput.required = !customOn;
        urlInput.readOnly = customOn;
        urlInput.classList.toggle('is-readonly', customOn);
    }
    if (urlHint) {
        urlHint.textContent = customOn
            ? 'Auto-set from slug — content is saved to a CMS page at this route.'
            : 'External or site-relative path. Auto-set when creating a custom CMS page.';
    }
    if (customOn) {
        // Defer so the panel is visible before Quill measures toolbar/editor size.
        requestAnimationFrame(() => {
            ensureNavbarLinkQuill();
            updateNavbarLinkRoutePreview();
        });
    }
}

async function fetchNavbarLinks() {
    try {
        const response = await fetch('/api/navbar-links/admin', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            globalNavbarLinks = data.data || [];
            renderNavbarLinkTable();
        } else {
            showToast(data.message || 'Failed to load navbar links', 'error');
        }
    } catch (error) {
        console.error('Navbar links load error:', error);
        showToast('Server error while loading navbar links!', 'error');
    }
}
window.fetchNavbarLinks = fetchNavbarLinks;

function renderNavbarLinkTable() {
    const list = document.getElementById('navbarLinkTableBody');
    if (!list) return;

    if (!globalNavbarLinks.length) {
        list.innerHTML = `
            <div class="navbar-links-empty" role="status">
                <i class="fa-regular fa-compass"></i>
                <h5>No navbar links yet</h5>
                <p>Add promo links like “Today's Deals” or create a custom CMS page above.</p>
            </div>`;
        return;
    }

    list.innerHTML = globalNavbarLinks.map((link, index) => {
        const id = link.id || link._id;
        const safeId = escHtml(id);
        const title = escHtml(link.title || '');
        const url = escHtml(link.url || '');
        const slug = escHtml(link.slug || '');
        const target = link.target === '_blank' ? '_blank' : '_self';
        const published = link.isPublished === true;
        const cms = link.hasCustomPage === true;
        const isFirst = index === 0;
        const isLast = index === globalNavbarLinks.length - 1;
        const orderLabel = Number.isFinite(Number(link.sortOrder)) ? Number(link.sortOrder) : index;

        return `
        <article class="navbar-link-card ${published ? 'is-published' : 'is-draft'}${cms ? ' has-cms' : ''}" data-id="${safeId}" role="listitem">
            <div class="navbar-link-card-order">
                <button type="button" class="navbar-link-order-btn" title="Move up" ${isFirst ? 'disabled' : ''}
                    onclick="moveNavbarLink('${safeId}', -1)" aria-label="Move up">
                    <i class="fa-solid fa-chevron-up"></i>
                </button>
                <span class="navbar-link-order-num">${orderLabel}</span>
                <button type="button" class="navbar-link-order-btn" title="Move down" ${isLast ? 'disabled' : ''}
                    onclick="moveNavbarLink('${safeId}', 1)" aria-label="Move down">
                    <i class="fa-solid fa-chevron-down"></i>
                </button>
            </div>
            <div class="navbar-link-card-body">
                <div class="navbar-link-card-title-row">
                    <h5>${title}</h5>
                    ${cms ? '<span class="navbar-link-cms-badge" title="Custom CMS page">CMS</span>' : ''}
                    <span class="navbar-link-badge ${published ? 'is-published' : 'is-draft'}">
                        ${published ? 'Published' : 'Draft'}
                    </span>
                </div>
                <div class="navbar-link-card-meta">
                    <a class="navbar-link-url" href="${url}" target="_blank" rel="noopener noreferrer" title="Open link">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> ${url}
                    </a>
                    ${slug ? `<span class="navbar-link-slug">slug: ${slug}</span>` : ''}
                    <span class="navbar-link-target">${target === '_blank' ? 'New tab' : 'Same tab'}</span>
                </div>
            </div>
            <div class="navbar-link-card-actions">
                <label class="navbar-link-toggle" title="${published ? 'Unpublish' : 'Publish'}">
                    <input type="checkbox" ${published ? 'checked' : ''}
                        onchange="toggleNavbarLinkPublished('${safeId}', this.checked)">
                    <span>Live</span>
                </label>
                <button type="button" class="catalog-action-btn edit" onclick="editNavbarLink('${safeId}')" title="Edit" aria-label="Edit">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button type="button" class="catalog-action-btn delete" onclick="deleteNavbarLink('${safeId}')" title="Delete" aria-label="Delete">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        </article>`;
    }).join('');
}

window.resetNavbarLinkForm = function resetNavbarLinkForm() {
    const form = document.getElementById('navbarLinkForm');
    if (form) form.reset();
    const editId = document.getElementById('navbarLinkEditId');
    if (editId) editId.value = '';
    const published = document.getElementById('navbarLinkPublished');
    if (published) published.checked = true;
    const target = document.getElementById('navbarLinkTarget');
    if (target) target.value = '_self';
    const custom = document.getElementById('navbarLinkCustomPage');
    if (custom) custom.checked = false;
    const submitLabel = document.getElementById('navbarLinkSubmitLabel');
    if (submitLabel) submitLabel.textContent = 'Add Link';
    const submitBtn = document.getElementById('navbarLinkSubmitBtn');
    if (submitBtn) {
        const icon = submitBtn.querySelector('i');
        if (icon) icon.className = 'fa-solid fa-plus';
    }
    const heading = document.getElementById('navbarLinkFormHeading');
    if (heading) heading.textContent = 'Add Navbar Link';
    const cancelBtn = document.getElementById('navbarLinkCancelBtn');
    if (cancelBtn) cancelBtn.style.display = 'none';
    setNavbarLinkQuillHtml('');
    syncNavbarLinkCustomPageUi();
    updateNavbarLinkRoutePreview();
};

window.editNavbarLink = function editNavbarLink(id) {
    const link = globalNavbarLinks.find((l) => String(l.id || l._id) === String(id));
    if (!link) return;

    document.getElementById('navbarLinkEditId').value = link.id || link._id || '';
    document.getElementById('navbarLinkTitle').value = link.title || '';
    document.getElementById('navbarLinkUrl').value = link.url || '';
    document.getElementById('navbarLinkSlug').value = link.slug || '';
    document.getElementById('navbarLinkTarget').value = link.target === '_blank' ? '_blank' : '_self';
    document.getElementById('navbarLinkPublished').checked = link.isPublished !== false;
    const custom = document.getElementById('navbarLinkCustomPage');
    if (custom) custom.checked = link.hasCustomPage === true;

    const submitLabel = document.getElementById('navbarLinkSubmitLabel');
    if (submitLabel) submitLabel.textContent = 'Update Link';
    const submitBtn = document.getElementById('navbarLinkSubmitBtn');
    if (submitBtn) {
        const icon = submitBtn.querySelector('i');
        if (icon) icon.className = 'fa-solid fa-floppy-disk';
    }
    const heading = document.getElementById('navbarLinkFormHeading');
    if (heading) heading.textContent = 'Edit Navbar Link';
    const cancelBtn = document.getElementById('navbarLinkCancelBtn');
    if (cancelBtn) cancelBtn.style.display = '';

    syncNavbarLinkCustomPageUi();
    if (link.hasCustomPage) {
        // Wait for Quill after panel is shown
        requestAnimationFrame(() => setNavbarLinkQuillHtml(link.pageHtml || ''));
    } else {
        setNavbarLinkQuillHtml('');
    }
    updateNavbarLinkRoutePreview();

    document.getElementById('navbarLinkTitle')?.focus();
    document.getElementById('manage-navbar-links')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

async function saveNavbarLinkForm(event) {
    if (event) event.preventDefault();

    const id = document.getElementById('navbarLinkEditId')?.value?.trim() || '';
    const title = document.getElementById('navbarLinkTitle')?.value?.trim() || '';
    const slug = document.getElementById('navbarLinkSlug')?.value?.trim() || '';
    const target = document.getElementById('navbarLinkTarget')?.value || '_self';
    const isPublished = !!document.getElementById('navbarLinkPublished')?.checked;
    const hasCustomPage = !!document.getElementById('navbarLinkCustomPage')?.checked;
    let url = document.getElementById('navbarLinkUrl')?.value?.trim() || '';

    if (!title) return showToast('Please enter a title!', 'warning');

    const payload = { title, target, isPublished, hasCustomPage };
    if (slug) payload.slug = slug;

    if (hasCustomPage) {
        const resolvedSlug = slugifyNavbarLinkText(slug || title);
        if (!resolvedSlug) return showToast('A valid slug is required for a custom page.', 'warning');
        payload.slug = resolvedSlug;
        payload.pageHtml = getNavbarLinkQuillHtml();
        payload.url = `/page/${resolvedSlug}`;
    } else {
        if (!url) return showToast('Please enter a URL!', 'warning');
        payload.url = url;
        payload.pageHtml = '';
    }

    const submitBtn = document.getElementById('navbarLinkSubmitBtn');
    const restore = typeof setButtonLoading === 'function'
        ? setButtonLoading(submitBtn, 'Saving...')
        : () => {};

    try {
        const res = await fetch(id ? `/api/navbar-links/admin/${id}` : '/api/navbar-links/admin', {
            method: id ? 'PUT' : 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (!result.success) {
            throw new Error(result.message || 'Failed to save navbar link.');
        }
        showAdminSuccess(id ? 'Link Updated' : 'Link Added', result.message || 'Navbar link saved.');
        resetNavbarLinkForm();
        await fetchNavbarLinks();
    } catch (error) {
        console.error('Save navbar link error:', error);
        showToast(error.message || 'Server error while saving navbar link!', 'error');
    } finally {
        restore();
    }
}

window.deleteNavbarLink = function deleteNavbarLink(id) {
    const link = globalNavbarLinks.find((l) => String(l.id || l._id) === String(id));
    showCustomConfirm(
        'Delete Navbar Link',
        link
            ? `Remove “${link.title}” from the top navigation bar?`
            : 'Remove this link from the top navigation bar?',
        async () => {
            try {
                const res = await fetch(`/api/navbar-links/admin/${id}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` }
                });
                const result = await res.json();
                if (result.success) {
                    globalNavbarLinks = globalNavbarLinks.filter(
                        (l) => String(l.id || l._id) !== String(id)
                    );
                    renderNavbarLinkTable();
                    showAdminSuccess('Link Deleted', result.message || 'Navbar link removed.');
                } else {
                    showToast(result.message || 'Failed to delete', 'error');
                }
            } catch (error) {
                showToast('Failed to delete navbar link', 'error');
            }
        },
        'danger'
    );
};

window.toggleNavbarLinkPublished = async function toggleNavbarLinkPublished(id, isPublished) {
    try {
        const res = await fetch(`/api/navbar-links/admin/${id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ isPublished: !!isPublished })
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message || 'Toggle failed.');
        await fetchNavbarLinks();
        showToast(isPublished ? 'Link published.' : 'Link unpublished.', 'success');
    } catch (error) {
        console.error('Toggle navbar link error:', error);
        showToast(error.message || 'Failed to update status', 'error');
        await fetchNavbarLinks();
    }
};

window.moveNavbarLink = async function moveNavbarLink(id, direction) {
    const index = globalNavbarLinks.findIndex((l) => String(l.id || l._id) === String(id));
    if (index < 0) return;
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= globalNavbarLinks.length) return;

    const next = globalNavbarLinks.slice();
    const tmp = next[index];
    next[index] = next[swapIndex];
    next[swapIndex] = tmp;

    const order = next.map((link, i) => ({
        id: link.id || link._id,
        sortOrder: i
    }));

    try {
        const res = await fetch('/api/navbar-links/admin/reorder', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ order })
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message || 'Reorder failed.');
        globalNavbarLinks = result.data || [];
        renderNavbarLinkTable();
    } catch (error) {
        console.error('Reorder navbar links error:', error);
        showToast(error.message || 'Failed to reorder', 'error');
        await fetchNavbarLinks();
    }
};

function setupNavbarLinkForm() {
    const form = document.getElementById('navbarLinkForm');
    if (!form || form.dataset.bound === '1') return;
    form.dataset.bound = '1';
    form.addEventListener('submit', saveNavbarLinkForm);

    document.getElementById('navbarLinkCustomPage')?.addEventListener('change', () => {
        syncNavbarLinkCustomPageUi();
        if (document.getElementById('navbarLinkCustomPage')?.checked && !getNavbarLinkQuillHtml()) {
            setNavbarLinkQuillHtml('<p></p>');
        }
    });
    document.getElementById('navbarLinkTitle')?.addEventListener('input', updateNavbarLinkRoutePreview);
    document.getElementById('navbarLinkSlug')?.addEventListener('input', updateNavbarLinkRoutePreview);
    syncNavbarLinkCustomPageUi();
}

/* ==========================================================================
   SECTION 9B2: COUPON & DISCOUNT MANAGEMENT ENGINE
   ========================================================================== */

/* shared state: globalCoupons lives on window (admin-core) */

/* shared state: couponStatusFilter lives on window (admin-core) */

/** Normalize coupon list payloads from GET /api/coupons and sync-data. */
function normalizeCouponListPayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.coupons)) return payload.coupons;
    return [];
}

/** Fresh admin token + JSON headers for coupon API calls */
function getCouponAuthHeaders() {
    const adminToken = localStorage.getItem('adminToken');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken || ''}`
    };
}

function setupCouponForm() {
    const form = document.getElementById('couponForm');
    if (!form || form.dataset.bound === '1') return;
    form.dataset.bound = '1';
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        saveCoupon();
    });
    setupCouponTimeValidation();
    setupCouponStatusTabs();
}

function setupCouponStatusTabs() {
    const tabs = document.querySelectorAll('#couponStatusTabs .coupon-status-tab');
    if (!tabs.length || document.getElementById('couponStatusTabs')?.dataset.bound === '1') return;
    document.getElementById('couponStatusTabs').dataset.bound = '1';

    tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            couponStatusFilter = tab.getAttribute('data-coupon-filter') || 'all';
            tabs.forEach((t) => {
                const isActive = t === tab;
                t.classList.toggle('active', isActive);
                t.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });
            renderCouponTable();
        });
    });
}

const COUPON_TIME_DEFAULT = '11:59';
const COUPON_AMPM_DEFAULT = 'PM';

function getCouponAmPmValue() {
    const select = document.getElementById('couponExpiryAmPm');
    const value = (select?.value || COUPON_AMPM_DEFAULT).toUpperCase();
    return value === 'AM' ? 'AM' : 'PM';
}

/** Convert 12-hour hh:mm + AM/PM to 24-hour HH:MM for server timestamp building. */
function convert12hTimeTo24h(time12, ampm) {
    const cleaned = normalizeCouponTimeDigits(time12).trim();
    const match = cleaned.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;

    let hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);
    const period = String(ampm || COUPON_AMPM_DEFAULT).toUpperCase();

    if (!Number.isFinite(hour) || hour < 1 || hour > 12) return null;
    if (!Number.isFinite(minute) || minute > 59) return null;

    if (period === 'AM') {
        if (hour === 12) hour = 0;
    } else if (hour !== 12) {
        hour += 12;
    }

    return formatCouponTimeParts(hour, minute);
}

function setCouponTimeHint(message, { valid = false } = {}) {
    const hint = document.getElementById('couponExpiryTimeHint');
    const input = document.getElementById('couponExpiryTime');
    if (!hint) return;
    hint.textContent = message || '';
    hint.classList.toggle('is-valid', Boolean(valid && message));
    if (input) {
        input.classList.toggle('is-invalid', Boolean(message && !valid));
    }
}

function normalizeCouponTimeDigits(raw) {
    return String(raw || '').replace(/[^\d:]/g, '');
}

function formatCouponTimeParts(hour, minute) {
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function validateCouponExpiryTime(raw, { showErrors = true, inlineOnly = false } = {}) {
    const cleaned = normalizeCouponTimeDigits(raw).trim();
    const match = cleaned.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) {
        const msg = 'Use 12-hour format hh:mm with AM/PM (minutes 00–59).';
        if (showErrors && !inlineOnly) showToast(msg, 'warning');
        if (showErrors) setCouponTimeHint(msg);
        return { ok: false, value: null };
    }

    const hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);

    if (!Number.isFinite(hour) || hour < 1 || hour > 12) {
        const msg = 'Hour must be between 01 and 12.';
        if (showErrors && !inlineOnly) showToast(msg, 'warning');
        if (showErrors) setCouponTimeHint(msg);
        return { ok: false, value: null };
    }
    if (!Number.isFinite(minute) || minute > 59) {
        const msg = 'Minutes cannot exceed 59.';
        if (showErrors && !inlineOnly) showToast(msg, 'warning');
        if (showErrors) setCouponTimeHint(msg);
        return { ok: false, value: null };
    }

    if (showErrors) setCouponTimeHint('');
    return { ok: true, value: formatCouponTimeParts(hour, minute) };
}

function handleCouponExpiryTimeInput(event) {
    const input = event.target;
    let val = normalizeCouponTimeDigits(input.value);
    let blockedMessage = '';

    const digitsOnly = val.replace(':', '');
    if (!val.includes(':') && digitsOnly.length >= 3) {
        val = `${digitsOnly.slice(0, 2)}:${digitsOnly.slice(2)}`;
    }

    const colonIdx = val.indexOf(':');
    if (colonIdx !== -1) {
        let hourPart = val.slice(0, colonIdx);
        let minutePart = val.slice(colonIdx + 1);

        if (hourPart.length > 2) hourPart = hourPart.slice(0, 2);
        if (minutePart.length > 2) minutePart = minutePart.slice(0, 2);

        if (hourPart.length === 2) {
            const hourNum = parseInt(hourPart, 10);
            if (Number.isFinite(hourNum) && (hourNum < 1 || hourNum > 12)) {
                blockedMessage = 'Hour must be between 01 and 12.';
                hourPart = hourNum > 12 ? '12' : '01';
            }
        }

        if (minutePart.length >= 2) {
            const minuteNum = parseInt(minutePart.slice(0, 2), 10);
            if (Number.isFinite(minuteNum) && minuteNum > 59) {
                blockedMessage = 'Minutes cannot exceed 59.';
                minutePart = '59';
            }
        }

        val = minutePart.length ? `${hourPart}:${minutePart}` : `${hourPart}:`;
    } else if (val.length >= 2) {
        const hourNum = parseInt(val.slice(0, 2), 10);
        if (Number.isFinite(hourNum) && (hourNum < 1 || hourNum > 12)) {
            blockedMessage = 'Hour must be between 01 and 12.';
            val = hourNum > 12 ? '12' : '01';
        }
    }

    input.value = val;

    if (blockedMessage) {
        setCouponTimeHint(blockedMessage);
        input.classList.add('is-invalid');
        return;
    }

    if (/^\d{2}:\d{2}$/.test(val)) {
        validateCouponExpiryTime(val, { showErrors: true, inlineOnly: true });
    } else {
        setCouponTimeHint('');
        input.classList.remove('is-invalid');
    }
}

function finalizeCouponExpiryTimeInput(input) {
    if (!input) return COUPON_TIME_DEFAULT;
    const result = validateCouponExpiryTime(input.value, { showErrors: true, inlineOnly: true });
    if (result.ok) {
        input.value = result.value;
        input.dataset.lastValid = result.value;
        input.classList.remove('is-invalid');
        setCouponTimeHint('');
        return result.value;
    }
    const fallback = input.dataset.lastValid || COUPON_TIME_DEFAULT;
    input.value = fallback;
    input.classList.remove('is-invalid');
    setCouponTimeHint('');
    return fallback;
}

function setupCouponTimeValidation() {
    const input = document.getElementById('couponExpiryTime');
    if (!input || input.dataset.timeBound === '1') return;
    input.dataset.timeBound = '1';
    input.dataset.lastValid = input.value || COUPON_TIME_DEFAULT;

    input.addEventListener('input', handleCouponExpiryTimeInput);
    input.addEventListener('change', () => finalizeCouponExpiryTimeInput(input));
    input.addEventListener('blur', () => finalizeCouponExpiryTimeInput(input));
}

async function runAdminDataSync() {
    const response = await fetch('/api/admin/sync-data', {
        method: 'POST',
        headers: getCouponAuthHeaders()
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to synchronize coupon data.');
    }
    if (Array.isArray(data.data?.coupons)) {
        globalCoupons = data.data.coupons;
    } else {
        globalCoupons = normalizeCouponListPayload(data.data);
    }
    renderCouponTable();
    return data;
}

async function fetchCoupons() {
    try {
        const response = await fetch('/api/coupons', {
            headers: getCouponAuthHeaders()
        });
        const data = await response.json();
        if (data.success) {
            globalCoupons = normalizeCouponListPayload(data.data);
            renderCouponTable();
        } else {
            showToast(data.message || 'Failed to load coupons', 'error');
        }
    } catch (error) {
        console.error('Coupon load error:', error);
        showToast('Failed to load coupons', 'error');
    }
}

function formatCouponDateTime(dateVal) {
    if (!dateVal) return '—';
    const d = new Date(dateVal);
    if (Number.isNaN(d.getTime())) return '—';

    const tz = adminPlatformTimezone || 'Asia/Dhaka';
    const parts = new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: tz
    }).formatToParts(d);

    const map = {};
    for (const part of parts) {
        if (part.type !== 'literal') map[part.type] = part.value;
    }

    const day = map.day || '';
    const month = map.month || '';
    const year = map.year || '';
    const hour = map.hour || '';
    const minute = map.minute || '';
    const period = (map.dayPeriod || '').toUpperCase();

    return `${day} ${month} ${year}, ${hour}:${minute} ${period}`;
}

function isCouponExpired(dateVal) {
    if (!dateVal) return false;
    return Date.now() > new Date(dateVal).getTime();
}

function resolveCouponDisplayStatus(coupon) {
    if (coupon.displayStatus === 'ACTIVE' || coupon.displayStatus === 'EXPIRED' || coupon.displayStatus === 'EXHAUSTED') {
        return coupon.displayStatus;
    }

    const used = Number(coupon.usedCount) || 0;
    const limit = Number(coupon.usageLimit) || 0;
    if (limit > 0 && used >= limit) {
        return 'EXHAUSTED';
    }

    const status = String(coupon.status || '').toUpperCase();
    if (status === 'EXPIRED' || status === 'DISABLED' || isCouponExpired(coupon.expiryDate)) {
        return 'EXPIRED';
    }

    return 'ACTIVE';
}

function filterCouponsByStatus(coupons, filter = couponStatusFilter) {
    const list = Array.isArray(coupons) ? coupons : [];
    if (filter === 'active') {
        return list.filter((coupon) => resolveCouponDisplayStatus(coupon) === 'ACTIVE');
    }
    if (filter === 'expired') {
        return list.filter((coupon) => resolveCouponDisplayStatus(coupon) === 'EXPIRED');
    }
    return list;
}

function renderCouponStatusBadge(status) {
    if (status === 'ACTIVE') {
        return '<span class="coupon-status-pill coupon-status-pill--active">🟢 Active</span>';
    }
    if (status === 'EXHAUSTED') {
        return '<span class="coupon-status-pill coupon-status-pill--exhausted">⚪ Exhausted / Usage Limit Met</span>';
    }
    return '<span class="coupon-status-pill coupon-status-pill--expired">🔴 Expired</span>';
}

function getPlatformTimeZoneOffsetMs(timeZone, date) {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    const parts = dtf.formatToParts(date);
    const map = {};
    for (const part of parts) {
        if (part.type !== 'literal') map[part.type] = part.value;
    }
    const asUtc = Date.UTC(
        Number(map.year),
        Number(map.month) - 1,
        Number(map.day),
        Number(map.hour),
        Number(map.minute),
        Number(map.second)
    );
    return asUtc - date.getTime();
}

/** Interpret date/time inputs in the admin platform timezone (same zone as the header clock). */
function platformLocalToUtc(dateStr, timeStr, timeZone) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const timeParts = String(timeStr || '00:00').split(':').map(Number);
    const hour = timeParts[0] ?? 0;
    const minute = timeParts[1] ?? 0;
    const second = timeParts[2] ?? 0;

    let utcMs = Date.UTC(year, month - 1, day, hour, minute, second);
    let offsetMs = getPlatformTimeZoneOffsetMs(timeZone, new Date(utcMs));
    utcMs -= offsetMs;

    const offsetMs2 = getPlatformTimeZoneOffsetMs(timeZone, new Date(utcMs));
    if (offsetMs2 !== offsetMs) {
        utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMs2;
    }

    return new Date(utcMs);
}

function buildCouponExpiryIso() {
    const dateVal = document.getElementById('couponExpiry')?.value?.trim();
    const timeInput = document.getElementById('couponExpiryTime');
    const timeVal = finalizeCouponExpiryTimeInput(timeInput);
    const timeCheck = validateCouponExpiryTime(timeVal, { showErrors: false });
    if (!dateVal || !timeCheck.ok) return null;

    const ampm = getCouponAmPmValue();
    const time24 = convert12hTimeTo24h(timeCheck.value, ampm);
    if (!time24) return null;

    const tz = adminPlatformTimezone || 'Asia/Dhaka';
    const combined = platformLocalToUtc(dateVal, time24, tz);
    if (Number.isNaN(combined.getTime())) return null;
    return combined.toISOString();
}

function renderCouponTable() {
    const tbody = document.getElementById('couponTableBody');
    if (!tbody) return;

    const visibleCoupons = filterCouponsByStatus(globalCoupons);

    if (!visibleCoupons.length) {
        const emptyMsg = globalCoupons.length
            ? 'No coupons match this filter.'
            : 'No coupons yet. Create one using the form above.';
        tbody.innerHTML = `<tr><td colspan="8" class="cell-empty">${emptyMsg}</td></tr>`;
        return;
    }

    const cur = typeof adminCurrencySymbol !== 'undefined' ? adminCurrencySymbol : '৳';

    tbody.innerHTML = visibleCoupons.map(coupon => {
        const used = Number(coupon.usedCount) || 0;
        const limit = Number(coupon.usageLimit) || 0;
        const displayStatus = resolveCouponDisplayStatus(coupon);
        const discountLabel = coupon.discountType === 'percentage'
            ? `${coupon.discountValue}%`
            : `${cur}${coupon.discountValue}`;
        const statusHtml = renderCouponStatusBadge(displayStatus);

        return `<tr>
            <td class="cell-name"><code class="coupon-code-chip">${escHtml(coupon.code)}</code></td>
            <td>${escHtml(discountLabel)}${coupon.discountType === 'percentage' && coupon.maxDiscountAmount ? ` <small class="coupon-cap">(max ${cur}${coupon.maxDiscountAmount})</small>` : ''}</td>
            <td>${cur}${Number(coupon.minOrderAmount) || 0}</td>
            <td><strong>${used}</strong> / ${limit} Used</td>
            <td class="cell-date">${formatCouponDateTime(coupon.createdAt)}</td>
            <td class="cell-date">${formatCouponDateTime(coupon.expiryDate)}</td>
            <td>${statusHtml}</td>
            <td>
                <div class="catalog-actions">
                    <button type="button" class="catalog-action-btn edit" title="Edit" onclick="editCoupon('${coupon._id}')"><i class="fa-solid fa-pen"></i></button>
                    <button type="button" class="catalog-action-btn delete" title="Delete" onclick="deleteCoupon('${coupon._id}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

window.resetCouponForm = function() {
    const form = document.getElementById('couponForm');
    if (form) form.reset();
    const editId = document.getElementById('couponEditId');
    if (editId) editId.value = '';
    const expiryTime = document.getElementById('couponExpiryTime');
    if (expiryTime) {
        expiryTime.value = COUPON_TIME_DEFAULT;
        expiryTime.dataset.lastValid = COUPON_TIME_DEFAULT;
    }
    const ampmSelect = document.getElementById('couponExpiryAmPm');
    if (ampmSelect) ampmSelect.value = COUPON_AMPM_DEFAULT;
    setCouponTimeHint('');
    const btnText = document.getElementById('couponSaveBtnText');
    if (btnText) btnText.textContent = 'Create Coupon';
    const cancelBtn = document.getElementById('couponCancelBtn');
    if (cancelBtn) cancelBtn.style.display = 'none';
    const perUser = document.getElementById('couponPerUserLimit');
    if (perUser && !perUser.value) perUser.value = '1';
};

function toDateInputValue(dateVal) {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    if (Number.isNaN(d.getTime())) return '';
    const tz = adminPlatformTimezone || 'Asia/Dhaka';
    return d.toLocaleDateString('en-CA', { timeZone: tz });
}

function to12HourTimeParts(dateVal) {
    if (!dateVal) {
        return { time: COUPON_TIME_DEFAULT, ampm: COUPON_AMPM_DEFAULT };
    }
    const d = new Date(dateVal);
    if (Number.isNaN(d.getTime())) {
        return { time: COUPON_TIME_DEFAULT, ampm: COUPON_AMPM_DEFAULT };
    }
    const tz = adminPlatformTimezone || 'Asia/Dhaka';
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    }).formatToParts(d);
    const map = {};
    for (const part of parts) {
        if (part.type !== 'literal') map[part.type] = part.value;
    }
    return {
        time: `${map.hour}:${map.minute}`,
        ampm: (map.dayPeriod || COUPON_AMPM_DEFAULT).toUpperCase()
    };
}

function toTimeInputValue(dateVal) {
    return to12HourTimeParts(dateVal).time;
}

window.editCoupon = function(id) {
    const coupon = globalCoupons.find(c => String(c._id) === String(id));
    if (!coupon) return showToast('Coupon not found', 'error');

    document.getElementById('couponEditId').value = coupon._id;
    document.getElementById('couponCode').value = coupon.code || '';
    document.getElementById('couponDiscountType').value = coupon.discountType || 'percentage';
    document.getElementById('couponDiscountValue').value = coupon.discountValue ?? '';
    document.getElementById('couponMinOrder').value = coupon.minOrderAmount ?? 0;
    document.getElementById('couponMaxDiscount').value = coupon.maxDiscountAmount ?? '';
    document.getElementById('couponExpiry').value = toDateInputValue(coupon.expiryDate);
    const timeParts = to12HourTimeParts(coupon.expiryDate);
    const expiryTimeEl = document.getElementById('couponExpiryTime');
    if (expiryTimeEl) {
        expiryTimeEl.value = timeParts.time;
        expiryTimeEl.dataset.lastValid = expiryTimeEl.value || COUPON_TIME_DEFAULT;
    }
    const ampmEl = document.getElementById('couponExpiryAmPm');
    if (ampmEl) ampmEl.value = timeParts.ampm === 'AM' ? 'AM' : 'PM';
    document.getElementById('couponUsageLimit').value = coupon.usageLimit ?? '';
    document.getElementById('couponPerUserLimit').value = coupon.perUserLimit ?? 1;
    document.getElementById('couponSaveBtnText').textContent = 'Update Coupon';
    document.getElementById('couponCancelBtn').style.display = 'inline-flex';

    document.getElementById('manage-coupons')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

async function saveCoupon() {
    const editId = document.getElementById('couponEditId')?.value?.trim();
    const timeInput = document.getElementById('couponExpiryTime');
    const timeCheck = validateCouponExpiryTime(finalizeCouponExpiryTimeInput(timeInput));
    if (!timeCheck.ok) {
        showToast('Error: Please enter a valid expiry time (hh:mm with AM/PM, minutes 00–59).', 'warning');
        return;
    }
    const ampm = getCouponAmPmValue();
    if (!convert12hTimeTo24h(timeCheck.value, ampm)) {
        showToast('Error: Could not parse expiry time. Check hh:mm and AM/PM.', 'warning');
        return;
    }
    const expiryIso = buildCouponExpiryIso();
    const payload = {
        code: document.getElementById('couponCode')?.value?.trim(),
        discountType: document.getElementById('couponDiscountType')?.value,
        discountValue: Number(document.getElementById('couponDiscountValue')?.value),
        minOrderAmount: Number(document.getElementById('couponMinOrder')?.value) || 0,
        maxDiscountAmount: document.getElementById('couponMaxDiscount')?.value === ''
            ? null
            : Number(document.getElementById('couponMaxDiscount')?.value),
        expiryDate: expiryIso,
        usageLimit: Number(document.getElementById('couponUsageLimit')?.value),
        perUserLimit: Number(document.getElementById('couponPerUserLimit')?.value) || 1
    };

    if (!localStorage.getItem('adminToken')) {
        showToast('Error: Admin session expired. Please log in again.', 'error');
        window.location.replace('/admin-login');
        return;
    }

    if (!payload.code) {
        showToast('Error: Please enter a coupon code!', 'warning');
        return;
    }
    if (!expiryIso) {
        showToast('Error: Please select a valid expiry date and time!', 'warning');
        return;
    }
    if (!Number.isFinite(payload.discountValue) || payload.discountValue <= 0) {
        showToast('Error: Please enter a valid discount value!', 'warning');
        return;
    }
    if (!Number.isFinite(payload.usageLimit) || payload.usageLimit < 1) {
        showToast('Error: Global usage limit must be at least 1!', 'warning');
        return;
    }
    if (!Number.isFinite(payload.perUserLimit) || payload.perUserLimit < 1) {
        showToast('Error: Per-user limit must be at least 1!', 'warning');
        return;
    }

    const saveBtn = document.getElementById('couponSaveBtn');
    const restore = setButtonLoading(saveBtn, editId ? 'Updating...' : 'Creating...');

    try {
        const res = await fetch(editId ? `/api/coupons/${editId}` : '/api/coupons', {
            method: editId ? 'PUT' : 'POST',
            headers: getCouponAuthHeaders(),
            body: JSON.stringify(payload)
        });

        let result;
        try {
            result = await res.json();
        } catch (_) {
            throw new Error('Unexpected server response. Please try again.');
        }

            if (result.success) {
                const successMsg = editId
                    ? (result.message || 'Coupon updated successfully!')
                    : 'Coupon created successfully!';
                showToast(`Success: ${successMsg}`, 'success');
                window.resetCouponForm();
                await fetchCoupons();
            } else if (res.status === 429) {
                showToast('Too many requests — please wait and try again.', 'warning');
            } else {
                const errMsg = result.message || 'Failed to save coupon';
                showToast('Error: ' + errMsg, 'error');
                if (res.status === 401 && result.redirect) {
                    localStorage.removeItem('adminToken');
                    window.location.replace(result.redirect);
                }
            }
    } catch (error) {
        const errMsg = error.message || 'Server error while saving coupon!';
        showToast('Error: ' + errMsg, 'error');
        console.error('Coupon save error:', error);
    } finally {
        restore();
    }
}
window.saveCoupon = saveCoupon;

window.deleteCoupon = function(id) {
    showCustomConfirm('Delete Coupon', 'Are you sure you want to permanently delete this coupon?', async () => {
        try {
            const res = await fetch(`/api/coupons/${id}`, {
                method: 'DELETE',
                headers: getCouponAuthHeaders()
            });
            const result = await res.json();
            if (result.success) {
                globalCoupons = globalCoupons.filter(c => String(c._id) !== String(id));
                renderCouponTable();
                showAdminSuccess('Coupon Deleted', result.message || 'Coupon deleted successfully!');
            } else {
                showToast(result.message || 'Failed to delete coupon', 'error');
            }
        } catch (error) {
            showToast('Failed to delete coupon', 'error');
        }
    }, 'danger');
};

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

/*-------------------------------------------------------------------------------------------*/

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
        const res = await fetch('/api/products?limit=500', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        globalProducts = Array.isArray(data) ? data : (data.products || data.data || []);
        
        const totalBadge = document.getElementById('total-products-badge');
        if (totalBadge) totalBadge.innerText = `Total: ${globalProducts.length}`;
        
        loadCategoryFilter();
        readProductListSessionState();
        filterAndRenderProducts(false); 
    } catch (e) {
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
            ? `<img src="${imgSrc}" onerror="${ADMIN_IMG_FALLBACK_ONERROR}" class="product-img-sm" alt="">`
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
                return `<div class="edit-img-thumb"><img src="${imgSrc}" alt="Product image" onerror="${ADMIN_IMG_FALLBACK_ONERROR}"></div>`;
            }).join('');
        } else if (product.image) {
            const imgSrc = adminProductImageSrc(product.image);
            previewBox.innerHTML = `<div class="edit-img-thumb"><img src="${imgSrc}" alt="Product image" onerror="${ADMIN_IMG_FALLBACK_ONERROR}"></div>`;
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
    adminProductImageSrc,
    attributeTypeRowHtml,
    attributeValueToSkuCode,
    autoFillAttributeValuesFromGlobal,
    buildCategoryRowHtml,
    buildCouponExpiryIso,
    cartesianCombinations,
    catalogActionsHtml,
    collectAttributeTypes,
    collectMatrixCombinations,
    collectProductVariantPayload,
    combinationKey,
    computeMatrixMinBuyingPrice,
    computeMatrixMinSellPrice,
    convert12hTimeTo24h,
    decodeHtmlEntities,
    ensureNavbarLinkQuill,
    ensureVariationDatalists,
    escHtml,
    fetchAttributes,
    fetchBrands,
    fetchCategories,
    fetchCoupons,
    fetchNavbarLinks,
    fillCategoryModal,
    filterCouponsByStatus,
    finalizeCouponExpiryTimeInput,
    findGlobalAttributeByName,
    formatCatalogDate,
    formatCombinationLabel,
    formatCouponDateTime,
    formatCouponTimeParts,
    generateVariantSku,
    getAdminAuthToken,
    getAuthToken,
    getCouponAmPmValue,
    getCouponAuthHeaders,
    getNavbarLinkQuillHtml,
    getNavbarLinkSlugPreview,
    getPlatformTimeZoneOffsetMs,
    getPrimaryProductImageUrl,
    getProductNameInitials,
    getProductSkuPrefix,
    getVariantAttributeSortOrder,
    getVariantAttributesFromDoc,
    getVariantModePrefix,
    handleCouponExpiryTimeInput,
    initAddProductFormUI,
    initCategorySortable,
    insertNavbarLinkHtmlEmbed,
    insertNavbarLinkImageUrl,
    isCouponExpired,
    loadCategories,
    loadCategoryDropdownForProduct,
    loadCategoryFilter,
    loadProductVariantUI,
    matrixRowHtml,
    normalizeCouponListPayload,
    normalizeCouponTimeDigits,
    normalizeSkuToken,
    parseCommaValues,
    parseLabelToAttributes,
    parseMatrixRowAttributes,
    performCategoryDelete,
    pickNavbarLinkImage,
    platformLocalToUtc,
    populateParentDropdown,
    productUsesVariantMatrix,
    registerNavbarLinkQuillFormats,
    renderAddPreviews,
    renderAttributeTable,
    renderBrandDropdown,
    renderBrandTable,
    renderCategoryDropdown,
    renderCategoryTree,
    renderCouponStatusBadge,
    renderCouponTable,
    renderEditPreviews,
    renderHighlightTags,
    renderNavbarLinkTable,
    renderVariantMatrix,
    renderVariations,
    resetAddProductFormExtras,
    resetAddProductHighlights,
    resetBulkImportModal,
    resetProductVariantUI,
    resolveCombinationLabel,
    resolveCouponDisplayStatus,
    resolveProductImagePath,
    runAdminDataSync,
    sanitizeVariantImageForSave,
    saveCoupon,
    saveNavbarLinkForm,
    setBulkImportFile,
    setCouponTimeHint,
    setMatrixDerivedFieldLock,
    setNavbarLinkQuillHtml,
    setupCouponForm,
    setupCouponStatusTabs,
    setupCouponTimeValidation,
    setupNavbarLinkForm,
    showDeleteConfirm,
    slugifyNavbarLinkText,
    sortCatsByPosition,
    sumMatrixStockFromDom,
    syncNavbarLinkCustomPageUi,
    to12HourTimeParts,
    toDateInputValue,
    toTimeInputValue,
    unlockSimpleProductDerivedFields,
    updateBulkActionPanel,
    updateCategoryStats,
    updateEditProfitPreview,
    updateFilterCategoryDropdown,
    updateNavbarLinkRoutePreview,
    validateCouponExpiryTime,
    variantsToMatrixState
});

