/**
 * PDP Reviews
 * Barrel: client/js/product-details.js
 *
 * Globals used from other modules:
 *  * - renderReviews
 *
 * Globals this module exposes:
 *  * - renderReviews
 * - fetchProductReviews
 */

// 🌟 SECTION 5: REVIEWS MANAGEMENT
// ==========================================================================
function renderReviews(reviews) {
    const container = document.getElementById('reviewsListContainer');
    const tabCount = document.getElementById('tabReviewCount');
    const summaryCount = document.getElementById('productReviewCount');

    if (tabCount) tabCount.innerText = reviews.length;
    const reviewLabel = window.i18n
        ? window.i18n.t('product.customer_reviews', { count: reviews.length })
        : `(${reviews.length} Customer Reviews)`;
    if (summaryCount) summaryCount.innerText = reviewLabel;

    if (!container) return;

    if (reviews.length === 0) {
        const emptyMsg = window.i18n
            ? window.i18n.t('product.no_reviews')
            : 'No reviews yet. Be the first to review this product!';
        container.innerHTML = `
            <p class="no-reviews-msg">
                <i class="fa-solid fa-comment-slash"></i> ${emptyMsg}
            </p>`;
        return;
    }

    container.innerHTML = '';
    reviews.forEach(rev => {
        const revCard = document.createElement('div');
        revCard.classList.add('review-card');

        let starsHTML = '';
        for (let i = 1; i <= 5; i++) {
            starsHTML += i <= rev.rating
                ? `<i class="fa-solid fa-star"></i>`
                : `<i class="fa-regular fa-star"></i>`;
        }

        // 🟢 ডাটাবেস থেকে ইউজারের নাম বের করার লজিক
        const reviewerName = rev.userId?.name || rev.name || "Verified Customer";
        const initial = reviewerName.trim().charAt(0).toUpperCase() || 'U';
        const locale = window.i18n?.getCurrentLang?.() === 'bn' ? 'bn-BD' : 'en-US';
        const reviewDate = rev.createdAt
            ? new Date(rev.createdAt).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
            : '';

        revCard.innerHTML = `
            <div class="review-card-head">
                <div class="reviewer-identity">
                    <span class="reviewer-avatar">${escapeHtml(initial)}</span>
                    <div class="reviewer-meta">
                        <strong class="reviewer-name">${escapeHtml(reviewerName)}</strong>
                        <span class="reviewer-verified"><i class="fa-solid fa-circle-check"></i> ${window.i18n ? window.i18n.t('product.verified_purchase') : 'Verified Purchase'}</span>
                    </div>
                </div>
                <div class="review-card-stars">${starsHTML}</div>
            </div>
            <p class="review-card-comment">${escapeHtml(rev.comment)}</p>
            ${rev.photo ? `<div class="review-card-photo"><img src="${escapeHtml(rev.photo)}" alt="Review Photo"></div>` : ''}
            ${reviewDate ? `<span class="review-card-date"><i class="fa-regular fa-clock"></i> ${reviewDate}</span>` : ''}
        `;
        container.appendChild(revCard);
    });
}


// ==========================================================================
// 🌟 SECTION 9: FETCH PRODUCT REVIEWS (NEW)
// ==========================================================================
async function fetchProductReviews(productId) {
    try {
        const response = await fetch(`/api/reviews/${productId}`);
        const data = await response.json();
        
        if (data.success && data.reviews) {
            window.__lastProductReviews = data.reviews;
            renderReviews(data.reviews);
        } else {
            renderReviews([]);
        }
    } catch (error) {
        console.error("Error fetching reviews from database:", error);
        renderReviews([]); // এরর হলে খালি দেখাবে
    }
}

// NOTE: Review submission has moved to the User Dashboard (My Orders).
// This page is now read-only for reviews - customers can only submit a
// review from their dashboard once the related order status is "Delivered".
Object.assign(window, {
    renderReviews,
    fetchProductReviews
});
