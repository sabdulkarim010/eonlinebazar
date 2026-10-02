/**
 * Dynamic DB content localization (categories, banners, CMS snippets).
 * Uses *_bn fields when present; otherwise clean English fallback.
 */
(function initContentLocale(global) {
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

    function pickCategoryName(category, lang) {
        if (!category) return '';
        const bn = category.name_bn ?? category.nameBn;
        return pickLocalized(category.name, bn, lang);
    }

    function pickBannerText(banner, field, lang) {
        if (!banner) return '';
        const bnKey = `${field}_bn`;
        const bnAlt = field === 'title' ? banner.titleBn : banner[`${field}Bn`];
        return pickLocalized(banner[field], banner[bnKey] ?? bnAlt, lang);
    }

    function pickCmsTitle(page, lang) {
        if (!page) return '';
        return pickLocalized(page.title, page.title_bn ?? page.titleBn, lang);
    }

    global.ContentLocale = {
        getLang,
        pickLocalized,
        pickCategoryName,
        pickBannerText,
        pickCmsTitle
    };
})(typeof window !== 'undefined' ? window : global);
