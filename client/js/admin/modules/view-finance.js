/**
 * Project: EOnlineBazar — Financial Reports iframe embed
 * File: js/admin/modules/view-finance.js
 */

const FINANCE_IFRAME_LOAD_TIMEOUT_MS = 15000;
const FINANCE_LOGIN_PATHS = ['/finance-login', '/admin/login'];

function getFinanceEmbedEls() {
    const section = document.getElementById('view-finance');
    if (!section) return null;
    return {
        spinner: section.querySelector('#financeEmbedSpinner'),
        iframe: section.querySelector('#financeAnalyticsIframe'),
        fallback: section.querySelector('#financeEmbedFallback'),
    };
}

function showFinanceSpinner(show) {
    const els = getFinanceEmbedEls();
    if (!els?.spinner) return;
    els.spinner.hidden = !show;
}

function showFinanceFallback(show) {
    const els = getFinanceEmbedEls();
    if (!els?.fallback) return;
    els.fallback.hidden = !show;
}

function isFinanceLoginPath(pathname) {
    const path = String(pathname || '');
    return FINANCE_LOGIN_PATHS.some((segment) => path.includes(segment));
}

function detectFinanceAuthFailure(iframe) {
    try {
        const pathname = iframe.contentWindow?.location?.pathname || '';
        if (isFinanceLoginPath(pathname)) return true;

        const doc = iframe.contentDocument;
        const text = doc?.body?.innerText || '';
        if (/sign in to finance|finance dashboard login/i.test(text)) return true;
    } catch {
        return false;
    }
    return false;
}

function initFinanceEmbed() {
    const els = getFinanceEmbedEls();
    if (!els?.iframe) return;

    const iframe = els.iframe;
    let loaded = false;
    let loadTimer;

    const finishLoading = () => {
        loaded = true;
        clearTimeout(loadTimer);
        showFinanceSpinner(false);

        if (detectFinanceAuthFailure(iframe)) {
            showFinanceFallback(true);
            iframe.hidden = true;
        }
    };

    const failEmbed = () => {
        clearTimeout(loadTimer);
        showFinanceSpinner(false);
        showFinanceFallback(true);
        iframe.hidden = true;
    };

    showFinanceSpinner(true);
    showFinanceFallback(false);
    iframe.hidden = false;

    iframe.addEventListener('load', finishLoading, { once: true });
    iframe.addEventListener('error', failEmbed, { once: true });

    loadTimer = setTimeout(() => {
        if (!loaded) failEmbed();
    }, FINANCE_IFRAME_LOAD_TIMEOUT_MS);
}

window.initFinanceEmbed = initFinanceEmbed;
