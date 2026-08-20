/**
 * Shared courier tracking badge renderer for customer-facing pages.
 * Reads courierProvider + courierTrackingId from the order object.
 * Does not affect order status timeline — display only.
 */
(function (global) {
    'use strict';

    const TRACKING_BASE_URLS = {
        steadfast: 'https://steadfast.com.bd/t/',
        pathao: 'https://merchant.pathao.com/tracking?consignment_id=',
        redx: 'https://redx.com.bd/track-global-parcel/?trackingId=',
        Steadfast: 'https://steadfast.com.bd/t/',
        Pathao: 'https://merchant.pathao.com/tracking?consignment_id=',
        RedX: 'https://redx.com.bd/track-global-parcel/?trackingId='
    };

    const PROVIDER_LABELS = {
        steadfast: 'Steadfast',
        pathao: 'Pathao',
        redx: 'RedX',
        Steadfast: 'Steadfast',
        Pathao: 'Pathao',
        RedX: 'RedX'
    };

    function normalizeProviderSlug(value) {
        const raw = String(value || '').trim();
        const aliases = { Steadfast: 'steadfast', Pathao: 'pathao', RedX: 'redx', redX: 'redx' };
        return aliases[raw] || raw.toLowerCase();
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function getTrackingUrl(provider, trackingId) {
        const slug = normalizeProviderSlug(provider);
        const base = TRACKING_BASE_URLS[slug] || TRACKING_BASE_URLS[provider];
        const code = String(trackingId || '').trim();
        if (!base || !code || /-PENDING-/i.test(code)) return '';
        return `${base}${encodeURIComponent(code)}`;
    }

    function isMockTrackingId(trackingId) {
        return /-PENDING-/i.test(String(trackingId || ''));
    }

    /**
     * Build badge HTML string for an order.
     * @param {object} order
     * @returns {string} HTML or empty string when no tracking data
     */
    function buildBadgeHtml(order) {
        const trackingId = String(order?.courierTrackingId || order?.tracking_code || '').trim();
        if (!trackingId) return '';

        const provider = normalizeProviderSlug(order?.courierProvider || order?.courier_provider || 'steadfast');
        const providerLabel = PROVIDER_LABELS[provider] || provider || 'Courier';
        const trackingUrl = getTrackingUrl(provider, trackingId);
        const isMock = isMockTrackingId(trackingId);
        const mockNote = isMock ? ' <span class="courier-badge-mock">(Pending)</span>' : '';

        const label = `🚚 Courier: ${escapeHtml(providerLabel)} | Tracking ID: ${escapeHtml(trackingId)}${mockNote}`;

        if (trackingUrl) {
            return `<a href="${escapeHtml(trackingUrl)}" target="_blank" rel="noopener noreferrer" class="courier-customer-badge courier-customer-badge--link" title="Track on ${escapeHtml(providerLabel)}">${label}</a>`;
        }

        return `<div class="courier-customer-badge" role="status">${label}</div>`;
    }

    /**
     * Render badge into a container element; hides container when no data.
     * @param {HTMLElement|null} containerEl
     * @param {object} order
     */
    function render(containerEl, order) {
        if (!containerEl) return;

        const html = buildBadgeHtml(order);
        if (!html) {
            containerEl.innerHTML = '';
            containerEl.classList.add('hidden');
            return;
        }

        containerEl.innerHTML = html;
        containerEl.classList.remove('hidden');
    }

    global.CourierBadge = {
        buildBadgeHtml,
        render,
        getTrackingUrl,
        isMockTrackingId
    };
}(typeof window !== 'undefined' ? window : global));








