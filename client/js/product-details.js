/**
 * product-details.js — barrel file
 * Import order: fetch/render first, then variants, reviews, cart, gallery.
 */
import './pdp/fetch-render.js';
import './expressCheckout.js';
import './pdp/variantStock.js';
import './pdp/variants.js';
import './pdp/reviews.js';
import './pdp/qty-cart.js';
import './pdp/gallery.js';
import './pdp/galleryZoomLightbox.js';

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');

    if (productId) {
        Promise.resolve(fetchProductDetails(productId)).finally(() => {
            if (urlParams.get('buyNow') !== '1') return;
            requestAnimationFrame(() => {
                const btn = document.getElementById('buyNowBtn');
                if (btn && !btn.disabled) btn.click();
            });
        });
    } else {
        if (typeof window.showToast === 'function') {
            window.showToast('Product ID missing in URL!', 'error');
        }
    }

    setupEventListeners();
    setupTabSystem();
    setupCombinationMatrixDelegation();
    setupGalleryDelegation();
    setupCarouselNavButtons();
    setupShareButtons();
    setupOrderWhatsAppButton();
    renderActivePaymentBadges();
});
