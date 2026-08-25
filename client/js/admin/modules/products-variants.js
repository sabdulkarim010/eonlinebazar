/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/products-variants.js
 * Description: Variant matrix, SKU builder, and combination helpers for add/edit product forms.
 */
/* Dependencies: token, globalAttributes, showToast (window/admin-core) */
/* Exposes: window.addAttributeTypeRow, window.ADMIN_IMG_FALLBACK_ONERROR, window.adminProductImageSrc, window.attributeTypeRowHtml, window.attributeValueToSkuCode, window.autoFillAttributeValuesFromGlobal, window.cartesianCombinations, window.collectAttributeTypes, window.collectMatrixCombinations, window.collectProductVariantPayload, window.collectVariations, window.combinationKey, window.computeMatrixMinBuyingPrice, window.computeMatrixMinSellPrice, window.ensureVariationDatalists, window.findGlobalAttributeByName, window.formatCombinationLabel, window.generateVariantMatrix, window.generateVariantSku, window.getPrimaryProductImageUrl, window.getProductNameInitials, window.getProductSkuPrefix, window.getVariantAttributeSortOrder, window.getVariantAttributesFromDoc, window.getVariantModePrefix, window.loadProductVariantUI, window.matrixRowHtml, window.normalizeSkuToken, window.parseCommaValues, window.parseLabelToAttributes, window.parseMatrixRowAttributes, window.productUsesVariantMatrix, window.removeAttributeTypeRow, window.renderVariantMatrix, window.renderVariations, window.resetProductVariantUI, window.resolveCombinationLabel, window.resolveProductImagePath, window.sanitizeVariantImageForSave, window.setMatrixDerivedFieldLock, window.setProductVariantMode, window.sumMatrixStockFromDom, window.syncMatrixTotalStock, window.unlockSimpleProductDerivedFields, window.variantsToMatrixState */

import '../admin-core.js';

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
window.ADMIN_IMG_FALLBACK_ONERROR = ADMIN_IMG_FALLBACK_ONERROR;

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

/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    ADMIN_IMG_FALLBACK_ONERROR,
    adminProductImageSrc,
    attributeTypeRowHtml,
    attributeValueToSkuCode,
    autoFillAttributeValuesFromGlobal,
    cartesianCombinations,
    collectAttributeTypes,
    collectMatrixCombinations,
    collectProductVariantPayload,
    combinationKey,
    computeMatrixMinBuyingPrice,
    computeMatrixMinSellPrice,
    ensureVariationDatalists,
    findGlobalAttributeByName,
    formatCombinationLabel,
    generateVariantSku,
    getPrimaryProductImageUrl,
    getProductNameInitials,
    getProductSkuPrefix,
    getVariantAttributeSortOrder,
    getVariantAttributesFromDoc,
    getVariantModePrefix,
    loadProductVariantUI,
    matrixRowHtml,
    normalizeSkuToken,
    parseCommaValues,
    parseLabelToAttributes,
    parseMatrixRowAttributes,
    productUsesVariantMatrix,
    renderVariantMatrix,
    renderVariations,
    resetProductVariantUI,
    resolveCombinationLabel,
    resolveProductImagePath,
    sanitizeVariantImageForSave,
    setMatrixDerivedFieldLock,
    sumMatrixStockFromDom,
    unlockSimpleProductDerivedFields,
    variantsToMatrixState
});

