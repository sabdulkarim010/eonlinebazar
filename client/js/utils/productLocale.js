/**
 * Product field localization for EN/BN storefront toggle.
 */
(function initProductLocale(global) {
    'use strict';

    function getLang() {
        if (global.i18n && typeof global.i18n.getCurrentLang === 'function') {
            return global.i18n.getCurrentLang();
        }
        return 'en';
    }

    function pickLocalized(primary, bnValue, lang) {
        const useBn = (lang || getLang()) === 'bn';
        const bn = bnValue != null ? String(bnValue).trim() : '';
        const en = primary != null ? String(primary).trim() : '';
        if (useBn && bn) return bn;
        return en || bn;
    }

    function pickProductName(product, lang) {
        if (!product) return '';
        return pickLocalized(product.name, product.name_bn, lang);
    }

    function pickProductDescription(product, lang) {
        if (!product) return '';
        return pickLocalized(product.description, product.description_bn, lang);
    }

    function pickProductDetailedDescription(product, lang) {
        if (!product) return '';
        return pickLocalized(
            product.detailedDescription || product.description,
            product.detailedDescription_bn || product.description_bn,
            lang
        );
    }

    function pickProductHighlights(product, lang) {
        if (!product) return [];
        const useBn = (lang || getLang()) === 'bn';
        const bn = Array.isArray(product.highlights_bn) ? product.highlights_bn.filter(Boolean) : [];
        const en = Array.isArray(product.highlights) ? product.highlights.filter(Boolean) : [];
        if (useBn && bn.length) return bn;
        return en.length ? en : bn;
    }

    global.ProductLocale = {
        getLang,
        pickProductName,
        pickProductDescription,
        pickProductDetailedDescription,
        pickProductHighlights
    };
})(typeof window !== 'undefined' ? window : global);
