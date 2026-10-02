/**
 * Central EN/BN refresh bus — runs after i18n.applyTranslations().
 */
(function initLocaleCoordinator(global) {
    'use strict';

    const subscribers = new Set();

    function register(fn) {
        if (typeof fn !== 'function') return () => {};
        subscribers.add(fn);
        return () => subscribers.delete(fn);
    }

    function refreshAll(lang) {
        const resolved = lang
            || (global.i18n && typeof global.i18n.getCurrentLang === 'function'
                ? global.i18n.getCurrentLang()
                : 'en');

        if (global.i18n && typeof global.i18n.applyTranslations === 'function') {
            global.i18n.applyTranslations();
        }

        subscribers.forEach((fn) => {
            try {
                fn(resolved);
            } catch (err) {
                console.error('[EOBLocaleCoordinator]', err);
            }
        });

        document.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: resolved } }));
    }

    global.EOBLocaleCoordinator = { register, refreshAll };
})(typeof window !== 'undefined' ? window : global);
