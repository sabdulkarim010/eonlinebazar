/**
 * PDP Variant Engine
 * Barrel: client/js/product-details.js
 *
 * Globals used from other modules:
 *  * - currentProductData
 * - galleryImagesCache
 * - setMainProductImage
 * - goToGalleryIndex
 * - getProductImages
 * - VU
 *
 * Globals this module exposes:
 *  * - selectedVariantsByAttr
 * - selectedCombinationAttrs
 * - matchedCombinationVariant
 * - matrixVariantsCache
 * - escapeHtml
 * - getVariantKey
 * - getVariantAttrs
 * - productUsesCombinationMatrix
 * - getVariantPrice
 * - normalizeAttrName
 * - isColorAttribute
 * - isSizeAttribute
 * - getColorImageMap
 * - resolveColorImageUrl
 * - resolvePartialCombinationVariant
 * - resolveImageForCurrentSelection
 * - getSelectedVariantImageUrl
 * - getImageIndexToColorMap
 * - getSelectedVariantByType
 * - getCombinedVariantKey
 * - getCombinedVariantLabel
 * - groupVariantsByAttribute
 * - renderVariants
 * - renderCombinationMatrix
 * - setupCombinationMatrixDelegation
 * - resolveMatchedCombination
 * - pruneInvalidCombinationSelections
 * - refreshCombinationMatrixUI
 * - showSelectedVariantMeta
 * - syncCombinationDisplay
 * - syncMainImageFromCombinationColor
 * - readColorImageFromBadge
 * - selectCombinationAttribute
 * - applyDefaultCombinationSelection
 * - renderLegacyFlatVariants
 * - initializeDefaultVariantSelections
 * - updateVariantBadgeUI
 * - syncMainImageFromColor
 * - syncPriceFromSelection
 * - wrapUsesMatrixMode
 * - matrixSelectionComplete
 * - syncStockFromSelection
 * - selectVariantOption
 * - cssEscape
 * - updateStockStatus
 * - setAddToCartEnabled
 * - clampQuantityToStock
 * - getAvailableStock
 * - getEffectivePrice
 */

window.selectedVariantsByAttr = {};
window.selectedCombinationAttrs = {};
window.matchedCombinationVariant = null;
window.matrixVariantsCache = [];
window.VU = window.VU || (() => window.VariantUtils || {});
const VU = () => window.VU();

function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** একটি ভ্যারিয়েন্টের ইউনিক কী তৈরি করা (sku অগ্রাধিকার পায়) */
function getVariantKey(v) {
    if (VU().getVariantLineId) return VU().getVariantLineId(v);
    const sku = (v.sku || '').trim();
    if (sku) return sku;
    return `${(v.attribute || '').trim()}::${(v.value || '').trim()}`;
}

function getVariantAttrs(v) {
    return VU().getVariantAttributes ? VU().getVariantAttributes(v) : {};
}

function productUsesCombinationMatrix(product) {
    return VU().usesCombinationMatrix ? VU().usesCombinationMatrix(product) : false;
}

/** ভ্যারিয়েন্টের কার্যকর দাম — নিজস্ব দাম না থাকলে বেস প্রাইস */
function getVariantPrice(v) {
    const p = Number(v && v.price);
    return (Number.isFinite(p) && p > 0) ? p : Number(currentProductData.price) || 0;
}

function normalizeAttrName(name) {
    return String(name || '').trim().toLowerCase();
}

function isColorAttribute(name) {
    const n = normalizeAttrName(name);
    return n === 'color' || n === 'colour';
}

function isSizeAttribute(name) {
    return normalizeAttrName(name) === 'size';
}

function getColorImageMap(product) {
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const images = getProductImages(product);
    const map = {};
    let colorIndex = 0;

    variants.forEach((cv) => {
        const attrs = getVariantAttrs(cv);
        const colorAttrKey = Object.keys(attrs).find((k) => isColorAttribute(k));
        let colorValue = '';

        if (colorAttrKey) {
            colorValue = String(attrs[colorAttrKey] || '').trim();
        } else if (isColorAttribute(cv.attribute) && (cv.value || '').trim()) {
            colorValue = String(cv.value).trim();
        }

        if (!colorValue) return;

        const key = colorValue.toLowerCase();
        if (map[key]) return;

        const variantImage = normalizeAssetUrl(cv.image || '');
        const primaryImage = normalizeAssetUrl(product.image || '');
        const galleryImage = images[Math.min(colorIndex, Math.max(images.length - 1, 0))] || '';
        // When every variant shares the primary image, fall back to gallery position per color
        const resolvedUrl = (variantImage && variantImage !== primaryImage)
            ? variantImage
            : (galleryImage || variantImage);
        const displayUrl = resolveDisplayImageUrl(resolvedUrl) || resolvedUrl;
        const galleryIndex = resolveGalleryIndexForUrl(images, displayUrl, colorIndex);
        map[key] = {
            index: galleryIndex,
            variant: cv,
            colorValue,
            url: displayUrl
        };
        colorIndex += 1;
    });

    return map;
}

/** Resolve featured image URL for a color value (variant image → gallery map) */
function resolveColorImageUrl(product, colorValue, variants) {
    if (!product || !colorValue) return '';

    const key = String(colorValue).trim().toLowerCase();
    const pool = variants || product.variants || [];

    const matching = pool.filter((v) => {
        const attrs = getVariantAttrs(v);
        const colorKey = Object.keys(attrs).find((k) => isColorAttribute(k));
        if (colorKey) {
            return String(attrs[colorKey]).trim().toLowerCase() === key;
        }
        return isColorAttribute(v.attribute) &&
            String(v.value || '').trim().toLowerCase() === key;
    });

    const withImage = matching.find((v) => {
        const img = normalizeAssetUrl(v.image || '');
        const primary = normalizeAssetUrl(product.image || '');
        return img && img !== primary;
    });
    if (withImage) return resolveDisplayImageUrl(withImage.image) || normalizeAssetUrl(withImage.image);

    const mapEntry = getColorImageMap(product)[key];
    if (mapEntry?.url) return mapEntry.url;

    if (mapEntry && Array.isArray(product.images) && product.images[mapEntry.index]) {
        return resolveDisplayImageUrl(product.images[mapEntry.index]) || normalizeAssetUrl(product.images[mapEntry.index]);
    }
    return '';
}

/** Keep gallery thumbnail active state in sync with the main image */

function resolvePartialCombinationVariant() {
    if (matchedCombinationVariant) return matchedCombinationVariant;
    if (!matrixVariantsCache.length || !Object.keys(selectedCombinationAttrs).length) return null;

    const matching = VU().findMatchingVariants
        ? VU().findMatchingVariants(matrixVariantsCache, selectedCombinationAttrs)
        : matrixVariantsCache.filter((v) => {
            const attrs = getVariantAttrs(v);
            return Object.entries(selectedCombinationAttrs).every(([k, val]) => attrs[k] === val);
        });

    if (!matching.length) return null;
    return matching.find((v) => (Number(v.stock) || 0) > 0) || matching[0];
}

/** Resolve the best image + gallery index for the current variant selection */
function resolveImageForCurrentSelection() {
    if (!currentProductData) return null;

    const images = getProductImages(currentProductData);
    const colorMap = getColorImageMap(currentProductData);

    const colorFromCombo = Object.entries(selectedCombinationAttrs)
        .find(([k]) => isColorAttribute(k));
    if (colorFromCombo) {
        const colorValue = colorFromCombo[1];
        const mapEntry = colorMap[String(colorValue).trim().toLowerCase()];
        const url = mapEntry?.url || resolveColorImageUrl(currentProductData, colorValue, matrixVariantsCache);
        if (url) {
            return {
                url,
                index: mapEntry?.index ?? resolveGalleryIndexForUrl(images, url, 0)
            };
        }
    }

    const colorFromLegacy = getSelectedVariantByType('color');
    if (colorFromLegacy) {
        const mapEntry = colorMap[String(colorFromLegacy.value || '').trim().toLowerCase()];
        const url = mapEntry?.url
            || resolveDisplayImageUrl(colorFromLegacy.image)
            || normalizeAssetUrl(colorFromLegacy.image || '')
            || resolveColorImageUrl(currentProductData, colorFromLegacy.value, currentProductData.variants);
        if (url) {
            return {
                url,
                index: mapEntry?.index ?? resolveGalleryIndexForUrl(images, url, 0)
            };
        }
    }

    if (matchedCombinationVariant) {
        const variantImage = resolveDisplayImageUrl(matchedCombinationVariant.image)
            || normalizeAssetUrl(matchedCombinationVariant.image || '');
        if (variantImage) {
            return {
                url: variantImage,
                index: resolveGalleryIndexForUrl(images, variantImage, 0)
            };
        }
    }

    return null;
}

/** Image URL for the currently selected color/variant (carousel-aware) */
function getSelectedVariantImageUrl() {
    if (galleryImagesCache.length && Number.isInteger(activeGalleryIndex)) {
        const slideUrl = galleryImagesCache[activeGalleryIndex];
        if (slideUrl) return slideUrl;
    }

    const resolved = resolveImageForCurrentSelection();
    if (resolved?.url) return resolved.url;

    const mainImg = getMainProductImageEl();
    if (mainImg?.getAttribute('src')) {
        return mainImg.getAttribute('src');
    }

    return '';
}

function getImageIndexToColorMap(product) {
    const byColor = getColorImageMap(product);
    const map = {};
    Object.values(byColor).forEach(entry => {
        map[entry.index] = entry;
    });
    return map;
}

function getSelectedVariantByType(type) {
    return Object.entries(selectedVariantsByAttr).find(([attr]) => {
        if (type === 'color') return isColorAttribute(attr);
        if (type === 'size') return isSizeAttribute(attr);
        return false;
    })?.[1] || null;
}

function getCombinedVariantKey() {
    return Object.values(selectedVariantsByAttr)
        .map(v => getVariantKey(v))
        .sort()
        .join('|');
}

function getCombinedVariantLabel() {
    return Object.values(selectedVariantsByAttr)
        .filter(v => v.attribute && v.value)
        .map(v => `${v.attribute}: ${v.value}`)
        .join(', ');
}

/** attribute অনুযায়ী ভ্যারিয়েন্ট গ্রুপ করা (রেন্ডার অর্ডার ধরে রেখে) */
function groupVariantsByAttribute(variants) {
    const groups = [];
    const map = {};
    variants.forEach(v => {
        const key = (v.attribute || 'Option').trim() || 'Option';
        if (!map[key]) {
            map[key] = { attribute: key, items: [] };
            groups.push(map[key]);
        }
        map[key].items.push(v);
    });
    return groups;
}

/**
 * ভ্যারিয়েন্ট সিলেক্টর রেন্ডার করা। প্রোডাক্টে variants না থাকলে সেকশনটি লুকানো থাকে
 * (সাধারণ প্রোডাক্টের সাথে সম্পূর্ণ backward-compatible)।
 */
function renderVariants(product) {
    const wrap = document.getElementById('variantSelectorWrap');
    if (!wrap) return;

    selectedVariantsByAttr = {};
    selectedCombinationAttrs = {};
    matchedCombinationVariant = null;

    const variants = Array.isArray(product.variants)
        ? product.variants.filter(v => Object.keys(getVariantAttrs(v)).length > 0 || v.attribute || v.value)
        : [];

    if (variants.length === 0) {
        wrap.classList.add('hidden');
        wrap.innerHTML = '';
        wrap.dataset.matrixMode = '';
        matrixVariantsCache = [];
        showSelectedVariantMeta(false);
        return;
    }

    if (productUsesCombinationMatrix(product)) {
        renderCombinationMatrix(product, variants, wrap);
        return;
    }

    renderLegacyFlatVariants(product, variants, wrap);
}

/** Amazon/Shopify-style matrix: pick one value per attribute, resolve one combination row */
function renderCombinationMatrix(product, variants, wrap) {
    matrixVariantsCache = variants;
    wrap.classList.remove('hidden');
    wrap.dataset.matrixMode = '1';

    const groups = VU().extractAttributeGroups ? VU().extractAttributeGroups(variants) : [];
    const colorImageMap = getColorImageMap(product);

    let html = '';
    groups.forEach(group => {
        html += `<div class="variant-group" data-combo-attr-group="${escapeHtml(group.name)}">
            <span class="variant-group-label">${escapeHtml(group.name)}:
                <span class="variant-selected-value" data-combo-selected="${escapeHtml(group.name)}">Select</span>
            </span>
            <div class="variant-options">`;
        group.values.forEach(value => {
            const isColorGroup = isColorAttribute(group.name);
            const mapEntry = isColorGroup ? colorImageMap[String(value).trim().toLowerCase()] : null;
            const colorImageUrl = isColorGroup
                ? (mapEntry?.url || resolveColorImageUrl(product, value, variants))
                : '';
            const colorClass = isColorGroup ? ' variant-badge--color' : '';
            const dataImageAttrs = isColorGroup
                ? buildColorImageDataAttrs(colorImageUrl, mapEntry)
                : '';
            html += `<div class="variant-badge${colorClass}"
                        data-combo-attr="${escapeHtml(group.name)}"
                        data-combo-value="${escapeHtml(value)}"${dataImageAttrs}
                        role="button" tabindex="0"
                        aria-disabled="false">
                        <span class="variant-badge-value">${escapeHtml(value)}</span>
                    </div>`;
        });
        html += `</div></div>`;
    });
    html += `<div class="variant-hint" id="variantHint"></div>`;
    wrap.innerHTML = html;

    showSelectedVariantMeta(Boolean(product.hasVariants || variants.length));
    refreshCombinationMatrixUI();
}

/** Event delegation — one listener for all matrix pill clicks */
function setupCombinationMatrixDelegation() {
    const wrap = document.getElementById('variantSelectorWrap');
    if (!wrap || wrap.dataset.matrixBound === '1') return;
    wrap.dataset.matrixBound = '1';

    wrap.addEventListener('click', (e) => {
        const badge = e.target.closest('.variant-badge[data-combo-attr]');
        if (!badge || badge.classList.contains('is-disabled')) return;
        if (!currentProductData || !matrixVariantsCache.length) return;

        const attrName = badge.getAttribute('data-combo-attr');
        const value = badge.getAttribute('data-combo-value');
        selectCombinationAttribute(attrName, value, badge);
    });

    wrap.addEventListener('keydown', (e) => {
        const badge = e.target.closest('.variant-badge[data-combo-attr]');
        if (!badge || badge.classList.contains('is-disabled')) return;
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        const attrName = badge.getAttribute('data-combo-attr');
        const value = badge.getAttribute('data-combo-value');
        selectCombinationAttribute(attrName, value, badge);
    });
}

function resolveMatchedCombination() {
    if (!matrixVariantsCache.length) {
        matchedCombinationVariant = null;
        return;
    }
    const groups = VU().extractAttributeGroups ? VU().extractAttributeGroups(matrixVariantsCache) : [];
    const allSelected = groups.every(g => selectedCombinationAttrs[g.name]);
    matchedCombinationVariant = allSelected && VU().findVariantBySelection
        ? VU().findVariantBySelection(matrixVariantsCache, selectedCombinationAttrs)
        : null;
}

/** Drop selections in other groups that no longer match the changed attribute */
function pruneInvalidCombinationSelections(changedAttr) {
    const groups = VU().extractAttributeGroups ? VU().extractAttributeGroups(matrixVariantsCache) : [];
    groups.forEach(group => {
        if (group.name === changedAttr) return;
        const value = selectedCombinationAttrs[group.name];
        if (!value) return;
        const state = VU().getOptionState
            ? VU().getOptionState(matrixVariantsCache, selectedCombinationAttrs, group.name, value)
            : 'in-stock';
        if (state === 'unavailable') delete selectedCombinationAttrs[group.name];
    });
}

/**
 * Re-evaluate every pill: highlight in-stock options, dim OOS, disable unavailable.
 * Example: Size M selected → only Colors that exist as M/* combinations stay active.
 */
function refreshCombinationMatrixUI() {
    const wrap = document.getElementById('variantSelectorWrap');
    if (!wrap || wrap.dataset.matrixMode !== '1') return;

    wrap.querySelectorAll('.variant-badge[data-combo-attr]').forEach(badge => {
        const attrName = badge.getAttribute('data-combo-attr');
        const value = badge.getAttribute('data-combo-value');
        const state = VU().getOptionState
            ? VU().getOptionState(matrixVariantsCache, selectedCombinationAttrs, attrName, value)
            : 'in-stock';
        const isActive = selectedCombinationAttrs[attrName] === value;

        badge.classList.remove('is-active', 'is-disabled', 'is-oos', 'is-unavailable');
        if (isActive) badge.classList.add('is-active');

        if (state === 'unavailable') {
            badge.classList.add('is-disabled', 'is-unavailable');
            badge.setAttribute('aria-disabled', 'true');
            badge.tabIndex = -1;
        } else if (state === 'oos') {
            badge.classList.add('is-disabled', 'is-oos');
            badge.setAttribute('aria-disabled', 'true');
            badge.tabIndex = -1;
        } else {
            badge.setAttribute('aria-disabled', 'false');
            badge.tabIndex = 0;
        }

        let oosTag = badge.querySelector('.variant-oos-tag');
        if (state === 'oos') {
            if (!oosTag) {
                oosTag = document.createElement('span');
                oosTag.className = 'variant-oos-tag';
                oosTag.textContent = window.i18n ? window.i18n.t('product.out_of_stock') : 'Out of Stock';
                badge.appendChild(oosTag);
            }
        } else if (oosTag) {
            oosTag.remove();
        }
    });

    const groups = VU().extractAttributeGroups ? VU().extractAttributeGroups(matrixVariantsCache) : [];
    groups.forEach(group => {
        const label = wrap.querySelector(`[data-combo-selected="${cssEscape(group.name)}"]`);
        if (label) label.innerText = selectedCombinationAttrs[group.name] || 'Select';
    });
}

function showSelectedVariantMeta(show) {
    const meta = document.getElementById('selectedVariantMeta');
    if (meta) meta.classList.toggle('hidden', !show);
}

function syncCombinationDisplay() {
    const skuEl = document.getElementById('selectedVariantSku');
    const comboEl = document.getElementById('selectedVariantCombo');
    const groups = VU().extractAttributeGroups ? VU().extractAttributeGroups(matrixVariantsCache) : [];
    const allSelected = groups.every(g => selectedCombinationAttrs[g.name]);

    if (matchedCombinationVariant && allSelected) {
        const attrs = getVariantAttrs(matchedCombinationVariant);
        const sku = (matchedCombinationVariant.sku || '').trim();
        if (skuEl) skuEl.textContent = sku || '—';
        if (comboEl) {
            const label = VU().resolveVariantLabel
                ? VU().resolveVariantLabel(matchedCombinationVariant)
                : Object.entries(attrs).map(([k, v]) => `${k}: ${v}`).join(' | ');
            comboEl.textContent = label;
        }

        if (matchedCombinationVariant.image) {
            const resolved = resolveImageForCurrentSelection();
            if (resolved?.url) {
                setMainProductImage(resolved.url, resolved.index);
            } else {
                setMainProductImage(matchedCombinationVariant.image);
            }
        } else {
            const resolved = resolveImageForCurrentSelection();
            if (resolved?.url) {
                setMainProductImage(resolved.url, resolved.index);
            } else {
                const colorEntry = Object.entries(attrs).find(([k]) => isColorAttribute(k));
                if (colorEntry) {
                    const url = resolveColorImageUrl(currentProductData, colorEntry[1], matrixVariantsCache);
                    const mapEntry = getColorImageMap(currentProductData)[String(colorEntry[1]).trim().toLowerCase()];
                    if (url) setMainProductImage(url, mapEntry?.index);
                }
            }
        }

        syncPriceFromSelection();
        syncStockFromSelection();
    } else {
        if (skuEl) skuEl.textContent = '—';
        if (comboEl) comboEl.textContent = allSelected ? '' : 'Select all options to see SKU and price';
        if (!allSelected) {
            setAddToCartEnabled(false);
        }
    }

    const hint = document.getElementById('variantHint');
    if (hint) {
        if (!allSelected) {
            hint.innerText = '';
        } else if (!matchedCombinationVariant) {
            hint.innerText = 'This combination is not available.';
        } else if ((Number(matchedCombinationVariant.stock) || 0) <= 0) {
            hint.innerText = 'Selected combination is out of stock.';
        } else {
            hint.innerText = '';
        }
    }
}

function syncMainImageFromCombinationColor(colorValue) {
    const mapEntry = getColorImageMap(currentProductData)[String(colorValue).trim().toLowerCase()];
    const url = mapEntry?.url || resolveColorImageUrl(currentProductData, colorValue, matrixVariantsCache);
    if (url) setMainProductImage(url, mapEntry?.index);
}

function readColorImageFromBadge(badge, colorValue) {
    if (!badge) {
        const mapEntry = getColorImageMap(currentProductData)[String(colorValue).trim().toLowerCase()];
        return {
            url: mapEntry?.url || resolveColorImageUrl(currentProductData, colorValue, matrixVariantsCache),
            index: mapEntry?.index
        };
    }

    const url = badge.getAttribute('data-image-url')
        || badge.getAttribute('data-image')
        || resolveColorImageUrl(currentProductData, colorValue, matrixVariantsCache);
    const normalizedUrl = resolveDisplayImageUrl(url) || url;
    let index;
    if (badge.hasAttribute('data-image-index')) {
        index = parseInt(badge.getAttribute('data-image-index'), 10);
    } else if (badge.hasAttribute('data-index')) {
        index = parseInt(badge.getAttribute('data-index'), 10);
    } else if (badge.hasAttribute('data-color-index')) {
        index = parseInt(badge.getAttribute('data-color-index'), 10);
    } else {
        index = getColorImageMap(currentProductData)[String(colorValue).trim().toLowerCase()]?.index;
    }

    return { url: normalizedUrl, index };
}

function selectCombinationAttribute(attrName, value, sourceBadge) {
    selectedCombinationAttrs[attrName] = value;

    if (isColorAttribute(attrName)) {
        const { url: imageUrl, index: colorIndex } = readColorImageFromBadge(sourceBadge, value);
        if (imageUrl) setMainProductImage(imageUrl, colorIndex);
    }

    pruneInvalidCombinationSelections(attrName);
    resolveMatchedCombination();
    refreshCombinationMatrixUI();
    syncCombinationDisplay();
    syncPriceFromSelection();
    syncStockFromSelection();
}

function applyDefaultCombinationSelection(product, variants) {
    matrixVariantsCache = variants;
    const pick = variants.find(v => (Number(v.stock) || 0) > 0) || variants[0];
    if (!pick) return;

    selectedCombinationAttrs = { ...getVariantAttrs(pick) };
    resolveMatchedCombination();
    refreshCombinationMatrixUI();
    syncCombinationDisplay();
    showSelectedVariantMeta(true);
}

function renderLegacyFlatVariants(product, variants, wrap) {
    wrap.classList.remove('hidden');
    const groups = groupVariantsByAttribute(variants);
    const colorImageMap = getColorImageMap(product);

    let html = '';
    groups.forEach(group => {
        html += `<div class="variant-group" data-attr="${escapeHtml(group.attribute)}">
            <span class="variant-group-label">${escapeHtml(group.attribute)}:
                <span class="variant-selected-value" data-attr-value="${escapeHtml(group.attribute)}">Select</span>
            </span>
            <div class="variant-options">`;
        group.items.forEach(v => {
            const key = getVariantKey(v);
            const stock = Number(v.stock) || 0;
            const disabled = stock <= 0;
            const price = getVariantPrice(v);
            const showPrice = !isColorAttribute(group.attribute)
                && Number(v.price) > 0
                && Number(v.price) !== Number(product.price);
            const isColorGroup = isColorAttribute(group.attribute);
            const mapEntry = isColorGroup ? colorImageMap[String(v.value || '').trim().toLowerCase()] : null;
            const colorImageUrl = isColorGroup
                ? (mapEntry?.url || resolveColorImageUrl(product, v.value, variants))
                : '';
            const colorClass = isColorGroup ? ' variant-badge--color' : '';
            const dataImageAttrs = isColorGroup
                ? buildColorImageDataAttrs(colorImageUrl, mapEntry)
                : '';
            html += `<div class="variant-badge${disabled ? ' is-disabled' : ''}${colorClass}"
                        data-variant-key="${escapeHtml(key)}"
                        data-variant-attr="${escapeHtml(v.attribute || '')}"${dataImageAttrs}
                        role="button" tabindex="${disabled ? -1 : 0}"
                        aria-disabled="${disabled}">
                        <span class="variant-badge-value">${escapeHtml(v.value || v.attribute)}</span>
                        ${showPrice ? `<span class="variant-badge-price">৳${price.toLocaleString()}</span>` : ''}
                        ${disabled ? `<span class="variant-oos-tag">${window.i18n ? window.i18n.t('product.out_of_stock') : 'Out of Stock'}</span>` : ''}
                    </div>`;
        });
        html += `</div></div>`;
    });
    html += `<div class="variant-hint" id="variantHint"></div>`;
    wrap.innerHTML = html;

    wrap.querySelectorAll('.variant-badge').forEach(badge => {
        if (badge.classList.contains('is-disabled')) return;
        const key = badge.getAttribute('data-variant-key');
        const variant = variants.find(v => getVariantKey(v) === key);
        badge.addEventListener('click', () => selectVariantOption(variant));
        badge.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectVariantOption(variant); }
        });
    });
}

function initializeDefaultVariantSelections(product) {
    const variants = Array.isArray(product.variants)
        ? product.variants.filter(v => Object.keys(getVariantAttrs(v)).length > 0 || v.attribute || v.value)
        : [];
    if (variants.length === 0) return;

    if (productUsesCombinationMatrix(product)) {
        applyDefaultCombinationSelection(product, variants);

        const anyInStock = variants.some(v => (Number(v.stock) || 0) > 0);
        if (!anyInStock) {
            updateStockStatus(0);
            setAddToCartEnabled(false);
            const hint = document.getElementById('variantHint');
            if (hint) hint.innerText = 'All combinations are currently out of stock.';
        }
        return;
    }

    showSelectedVariantMeta(false);
    const wrap = document.getElementById('variantSelectorWrap');
    if (wrap) wrap.dataset.matrixMode = '';
    matrixVariantsCache = [];

    const groups = groupVariantsByAttribute(variants);
    groups.forEach(group => {
        const pick = group.items.find(v => (Number(v.stock) || 0) > 0) || group.items[0];
        if (pick) selectVariantOption(pick, { skipHint: true });
    });

    const anyInStock = variants.some(v => (Number(v.stock) || 0) > 0);
    if (!anyInStock) {
        updateStockStatus(0);
        setAddToCartEnabled(false);
        const hint = document.getElementById('variantHint');
        if (hint) hint.innerText = 'All variants are currently out of stock.';
    }
}

function updateVariantBadgeUI(attr, variant) {
    const key = getVariantKey(variant);
    const wrap = document.getElementById('variantSelectorWrap');
    if (!wrap) return;

    wrap.querySelectorAll('.variant-badge').forEach(b => {
        const badgeAttr = (b.getAttribute('data-variant-attr') || '').trim();
        if (badgeAttr !== attr) return;
        b.classList.toggle('is-active', b.getAttribute('data-variant-key') === key);
    });

    const label = wrap.querySelector(`.variant-selected-value[data-attr-value="${cssEscape(attr)}"]`);
    if (label) label.innerText = variant.value || '';
}

function syncMainImageFromColor(colorVariant) {
    if (!currentProductData || !colorVariant) return;

    const colorKey = String(colorVariant.value || '').trim().toLowerCase();
    const variantImage = resolveDisplayImageUrl(colorVariant.image) || normalizeAssetUrl(colorVariant.image || '');
    const entry = getColorImageMap(currentProductData)[colorKey];
    const url = variantImage || entry?.url || '';
    if (!url) return;

    setMainProductImage(url, entry?.index);
}

function syncPriceFromSelection() {
    const partialCombo = resolvePartialCombinationVariant();
    if (matchedCombinationVariant) {
        const price = getVariantPrice(matchedCombinationVariant);
        const priceEl = document.getElementById('productPrice');
        const stickyPrice = document.getElementById('stickyBarPrice');
        if (priceEl) priceEl.innerText = `৳ ${price.toLocaleString()}`;
        if (stickyPrice) stickyPrice.innerText = `৳ ${price.toLocaleString()}`;
        return;
    }

    if (partialCombo && wrapUsesMatrixMode()) {
        const price = getVariantPrice(partialCombo);
        const priceEl = document.getElementById('productPrice');
        const stickyPrice = document.getElementById('stickyBarPrice');
        if (priceEl) priceEl.innerText = `৳ ${price.toLocaleString()}`;
        if (stickyPrice) stickyPrice.innerText = `৳ ${price.toLocaleString()}`;
        return;
    }

    const sizeVariant = getSelectedVariantByType('size');
    const colorVariant = getSelectedVariantByType('color');
    const priceSource = sizeVariant || colorVariant || Object.values(selectedVariantsByAttr)[0];
    const price = priceSource ? getVariantPrice(priceSource) : Number(currentProductData?.price) || 0;

    const priceEl = document.getElementById('productPrice');
    const stickyPrice = document.getElementById('stickyBarPrice');
    if (priceEl) priceEl.innerText = `৳ ${price.toLocaleString()}`;
    if (stickyPrice) stickyPrice.innerText = `৳ ${price.toLocaleString()}`;
}

function wrapUsesMatrixMode() {
    const wrap = document.getElementById('variantSelectorWrap');
    return wrap && wrap.dataset.matrixMode === '1';
}

function matrixSelectionComplete() {
    if (!wrapUsesMatrixMode()) return true;
    const groups = VU().extractAttributeGroups ? VU().extractAttributeGroups(matrixVariantsCache) : [];
    return groups.every((g) => selectedCombinationAttrs[g.name]);
}

function syncStockFromSelection() {
    const partialCombo = resolvePartialCombinationVariant();
    if (matchedCombinationVariant && matrixSelectionComplete()) {
        const stock = Number(matchedCombinationVariant.stock) || 0;
        updateStockStatus(stock);
        clampQuantityToStock(stock);
        setAddToCartEnabled(stock > 0);
        return;
    }

    if (wrapUsesMatrixMode() && !matrixSelectionComplete()) {
        if (partialCombo) {
            updateStockStatus(Number(partialCombo.stock) || 0);
        }
        setAddToCartEnabled(false);
        return;
    }

    if (partialCombo && wrapUsesMatrixMode()) {
        const stock = Number(partialCombo.stock) || 0;
        updateStockStatus(stock);
        clampQuantityToStock(stock);
        setAddToCartEnabled(stock > 0);
        return;
    }

    const sizeVariant = getSelectedVariantByType('size');
    const colorVariant = getSelectedVariantByType('color');
    const stockSource = sizeVariant || colorVariant || Object.values(selectedVariantsByAttr)[0];
    const stock = stockSource
        ? Number(stockSource.stock) || 0
        : Number(currentProductData?.stock) || 0;

    updateStockStatus(stock);
    clampQuantityToStock(stock);
    setAddToCartEnabled(stock > 0);
}

/** Select one option within an attribute group — Color syncs image; Size syncs price */
function selectVariantOption(variant, options = {}) {
    if (!variant) return;

    const attr = (variant.attribute || 'Option').trim() || 'Option';
    selectedVariantsByAttr[attr] = variant;
    updateVariantBadgeUI(attr, variant);

    if (isColorAttribute(attr)) {
        const badge = document.querySelector(
            `.variant-badge[data-variant-key="${cssEscape(getVariantKey(variant))}"]`
        );
        const { url: imageUrl, index: colorIndex } = readColorImageFromBadge(badge, variant.value);
        if (imageUrl) {
            setMainProductImage(imageUrl, colorIndex);
        } else {
            syncMainImageFromColor(variant);
        }
    }

    syncPriceFromSelection();
    syncStockFromSelection();

    if (!options.skipHint) {
        const hint = document.getElementById('variantHint');
        if (hint) hint.innerText = '';
    }
}

/** CSS attribute-selector safe escaping */
function cssEscape(str) {
    const value = String(str);
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
        return CSS.escape(value);
    }
    return value.replace(/["\\]/g, '\\$&');
}

/** স্টক স্ট্যাটাস ব্যাজ আপডেট */
function updateStockStatus(stock) {
    const stockStatus = document.getElementById('stockStatus');
    if (!stockStatus) return;
    if (stock > 0) {
        const inStockLabel = window.i18n ? window.i18n.t('product.in_stock') : 'In Stock';
        stockStatus.innerText = stock <= 5
            ? `${inStockLabel}${window.i18n ? '' : ` (${stock} left)`}`
            : inStockLabel;
        stockStatus.style.color = "var(--success-green)";
    } else {
        stockStatus.innerText = window.i18n ? window.i18n.t('product.out_of_stock') : 'Out of Stock';
        stockStatus.style.color = "var(--accent-red)";
    }
}

/** Add to Cart / Buy Now বাটন enable/disable */
function setAddToCartEnabled(enabled) {
    ['addToCartBtn', 'buyNowBtn', 'stickyAddToCartBtn', 'stickyBuyNowBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.disabled = !enabled;
        btn.style.opacity = enabled ? '' : '0.55';
        btn.style.cursor = enabled ? '' : 'not-allowed';
    });
}

/** কোয়ান্টিটি ইনপুট স্টকের মধ্যে সীমাবদ্ধ রাখা */
function clampQuantityToStock(stock) {
    const qtyInput = document.getElementById('productQtyInput');
    if (!qtyInput) return;
    let val = parseInt(qtyInput.value) || 1;
    if (stock > 0 && val > stock) val = stock;
    if (val < 1) val = 1;
    qtyInput.value = val;
}

/** বর্তমানে কার্যকর স্টক (Size ভ্যারিয়েন্ট অগ্রাধিকার, নইলে প্রোডাক্টের) */
function getAvailableStock() {
    if (matchedCombinationVariant) return Number(matchedCombinationVariant.stock) || 0;

    const sizeVariant = getSelectedVariantByType('size');
    if (sizeVariant) return Number(sizeVariant.stock) || 0;
    const any = Object.values(selectedVariantsByAttr)[0];
    if (any) return Number(any.stock) || 0;
    return Number(currentProductData && currentProductData.stock) || 0;
}

function getEffectivePrice() {
    if (matchedCombinationVariant) return getVariantPrice(matchedCombinationVariant);

    const sizeVariant = getSelectedVariantByType('size');
    if (sizeVariant) return getVariantPrice(sizeVariant);
    const any = Object.values(selectedVariantsByAttr)[0];
    if (any) return getVariantPrice(any);
    return Number(currentProductData?.price) || 0;
}
Object.assign(window, {
    escapeHtml,
    getVariantKey,
    getVariantAttrs,
    productUsesCombinationMatrix,
    getVariantPrice,
    normalizeAttrName,
    isColorAttribute,
    isSizeAttribute,
    getColorImageMap,
    resolveColorImageUrl,
    resolvePartialCombinationVariant,
    resolveImageForCurrentSelection,
    getSelectedVariantImageUrl,
    getImageIndexToColorMap,
    getSelectedVariantByType,
    getCombinedVariantKey,
    getCombinedVariantLabel,
    groupVariantsByAttribute,
    renderVariants,
    renderCombinationMatrix,
    setupCombinationMatrixDelegation,
    resolveMatchedCombination,
    pruneInvalidCombinationSelections,
    refreshCombinationMatrixUI,
    showSelectedVariantMeta,
    syncCombinationDisplay,
    syncMainImageFromCombinationColor,
    readColorImageFromBadge,
    selectCombinationAttribute,
    applyDefaultCombinationSelection,
    renderLegacyFlatVariants,
    initializeDefaultVariantSelections,
    updateVariantBadgeUI,
    syncMainImageFromColor,
    syncPriceFromSelection,
    wrapUsesMatrixMode,
    matrixSelectionComplete,
    syncStockFromSelection,
    selectVariantOption,
    cssEscape,
    updateStockStatus,
    setAddToCartEnabled,
    clampQuantityToStock,
    getAvailableStock,
    getEffectivePrice
});
