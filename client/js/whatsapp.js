/* ==================================================
   WHATSAPP — dynamic public chat link + tooltip
================================================== */
(function () {
    function normalizeWhatsAppNumber(phone) {
        const digits = String(phone || '').replace(/\D/g, '');
        if (!digits) return '';
        if (digits.startsWith('880')) return digits;
        if (digits.startsWith('0') && digits.length === 11) return `88${digits}`;
        if (digits.length === 10 && digits.startsWith('1')) return `880${digits}`;
        return digits;
    }

    function buildCustomerChatUrl(phone, storeName) {
        const normalized = normalizeWhatsAppNumber(phone);
        if (!normalized) return '';
        const text = encodeURIComponent(`Hello ${storeName || 'EonlineBazar'}, I need some help!`);
        return `https://wa.me/${normalized}?text=${text}`;
    }

    function applyPublicWhatsAppLinks() {
        const settings = window.__STORE_SETTINGS__ || {};
        const storeName = settings.storeName || 'EonlineBazar';
        const chatUrl = buildCustomerChatUrl(settings.publicSupportWhatsApp, storeName);

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

    document.addEventListener('DOMContentLoaded', function () {
        applyPublicWhatsAppLinks();

        const tooltip = document.getElementById('waTooltip');

        setTimeout(() => {
            if (tooltip) tooltip.classList.add('show');
        }, 3000);

        setTimeout(() => {
            if (tooltip) tooltip.classList.remove('show');
        }, 10000);
    });

    window.applyPublicWhatsAppLinks = applyPublicWhatsAppLinks;
})();
