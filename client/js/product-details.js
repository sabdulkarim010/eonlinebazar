/**
 * product-details.js — barrel file
 * Import order: fetch/render first, then variants, reviews, cart, gallery.
 */
import './pdp/fetch-render.js';
import './pdp/variants.js';
import './pdp/reviews.js';
import './pdp/qty-cart.js';
import './pdp/gallery.js';

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');

    if (productId) {
        fetchProductDetails(productId);
    } else {
        showToast("Product ID missing in URL!", "error");
    }

    setupEventListeners();
    setupTabSystem();
    setupCombinationMatrixDelegation();
    setupGalleryDelegation();
    setupCarouselNavButtons();
    setupShareButtons();
    renderActivePaymentBadges();
});
