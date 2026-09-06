/* ==================================================
   WHATSAPP — dynamic public chat link + tooltip
================================================== */
(function () {
    const DEFAULT_SUPPORT_PHONE = '8801712345678';
    const GUEST_HELP_MESSAGE = 'Hello EOnlineBazar Support, I have a query.';

    function normalizeWhatsAppNumber(phone) {
        const digits = String(phone || '').replace(/\D/g, '');
        if (!digits) return '';
        if (digits.startsWith('880')) return digits;
        if (digits.startsWith('0') && digits.length === 11) return `88${digits}`;
        if (digits.length === 10 && digits.startsWith('1')) return `880${digits}`;
        return digits;
    }

    function getSupportPhone() {
        const settings = window.__STORE_SETTINGS__ || {};
        const normalized = normalizeWhatsAppNumber(settings.publicSupportWhatsApp);
        return normalized || DEFAULT_SUPPORT_PHONE;
    }

    function buildWhatsAppUrl(phone, message) {
        const normalized = normalizeWhatsAppNumber(phone) || DEFAULT_SUPPORT_PHONE;
        const text = encodeURIComponent(message || GUEST_HELP_MESSAGE);
        return `https://wa.me/${normalized}?text=${text}`;
    }

    function buildGuestHelpUrl(phone) {
        return buildWhatsAppUrl(phone || getSupportPhone(), GUEST_HELP_MESSAGE);
    }

    function buildProductOrderUrl(phone, title, price) {
        const safeTitle = String(title || 'Product').trim();
        const priceLabel = String(price || '').trim();
        const message = `Hi, I want to order: ${safeTitle} (Price: ${priceLabel})`;
        return buildWhatsAppUrl(phone || getSupportPhone(), message);
    }

    function buildCustomerChatUrl(phone, storeName) {
        void storeName;
        return buildGuestHelpUrl(phone);
    }

    function applyPublicWhatsAppLinks() {
        const chatUrl = buildGuestHelpUrl(getSupportPhone());
        if (!chatUrl) return;

        document.querySelectorAll('#waFloatBtn, [data-whatsapp-chat]').forEach((el) => {
            el.href = chatUrl;
            el.setAttribute('target', '_blank');
            el.setAttribute('rel', 'noopener noreferrer');
        });

        const shareBtn = document.getElementById('shareWhatsApp');
        if (shareBtn && shareBtn.dataset.shareUrl) {
            shareBtn.href = `https://wa.me/?text=${encodeURIComponent(shareBtn.dataset.shareUrl)}`;
        }
    }

    async function ensureStoreSettings() {
        if (window.__STORE_SETTINGS__?.publicSupportWhatsApp) {
            return window.__STORE_SETTINGS__;
        }
        try {
            const res = await fetch('/api/store/branding');
            const payload = await res.json();
            const raw = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
            if (raw && typeof raw === 'object') {
                window.__STORE_SETTINGS__ = {
                    ...(window.__STORE_SETTINGS__ || {}),
                    ...raw,
                };
            }
        } catch (err) {
            console.warn('WhatsApp branding fetch failed:', err?.message || err);
        }
        return window.__STORE_SETTINGS__ || {};
    }

    async function initWhatsAppSupport() {
        await ensureStoreSettings();
        applyPublicWhatsAppLinks();
    }

    document.addEventListener('DOMContentLoaded', function () {
        initWhatsAppSupport();

        const tooltip = document.getElementById('waTooltip');

        setTimeout(() => {
            if (tooltip) tooltip.classList.add('show');
        }, 3000);

        setTimeout(() => {
            if (tooltip) tooltip.classList.remove('show');
        }, 10000);
    });

    window.addEventListener('store-branding-updated', () => {
        applyPublicWhatsAppLinks();
    });

    window.applyPublicWhatsAppLinks = applyPublicWhatsAppLinks;
    window.WhatsAppSupport = {
        normalizeWhatsAppNumber,
        getSupportPhone,
        buildWhatsAppUrl,
        buildGuestHelpUrl,
        buildProductOrderUrl,
        buildCustomerChatUrl,
        applyPublicWhatsAppLinks,
        ensureStoreSettings,
    };
})();
