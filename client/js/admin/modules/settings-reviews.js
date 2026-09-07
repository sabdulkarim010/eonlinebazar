/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/settings-reviews.js
 * Description: Admin review listing, hide/show moderation, and delete.
 */
/* Dependencies: token, showToast (window) */
/* Exposes: window.loadAdminReviews, window.moderateReview, window.deleteReviewAdmin */

import '../admin-core.js';

function getReviewProductImage(product) {
    if (!product) return '';
    if (Array.isArray(product.images) && product.images[0]) return product.images[0];
    return product.image || '';
}

function renderReviewsStats(reviews = [], total = 0) {
    const row = document.getElementById('reviewsStatsRow');
    if (!row) return;

    const hidden = reviews.filter((r) => r.isHidden).length;
    const visible = reviews.length - hidden;

    row.innerHTML = `
        <div class="reviews-stat-card">
            <span class="reviews-stat-label">Total (page)</span>
            <strong class="reviews-stat-value">${total.toLocaleString()}</strong>
        </div>
        <div class="reviews-stat-card">
            <span class="reviews-stat-label">Visible</span>
            <strong class="reviews-stat-value reviews-stat-value--green">${visible}</strong>
        </div>
        <div class="reviews-stat-card">
            <span class="reviews-stat-label">Hidden</span>
            <strong class="reviews-stat-value reviews-stat-value--red">${hidden}</strong>
        </div>`;
}

function renderReviewsTable(reviews) {
    const container = document.getElementById('reviewsTableContainer');
    if (!container) return;

    if (!reviews.length) {
        container.innerHTML = '<p class="reviews-empty">No reviews found</p>';
        return;
    }

    container.innerHTML = `
        <table class="reviews-table">
            <thead>
                <tr>
                    <th>PRODUCT</th>
                    <th>CUSTOMER</th>
                    <th class="reviews-th-center">RATING</th>
                    <th>REVIEW</th>
                    <th class="reviews-th-center">STATUS</th>
                    <th class="reviews-th-center">ACTIONS</th>
                </tr>
            </thead>
            <tbody>
                ${reviews.map((review) => {
                    const reviewId = review._id;
                    const productName = escapeHtml(review.product?.name || 'Unknown Product');
                    const productImg = getReviewProductImage(review.product);
                    const customer = review.userId || review.user || {};
                    const customerName = escapeHtml(customer.name || 'Anonymous');
                    const customerEmail = escapeHtml(customer.email || '');
                    const rating = Number(review.rating) || 0;
                    const comment = escapeHtml(review.comment || '—');
                    const dateLabel = review.createdAt
                        ? new Date(review.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—';
                    const isHidden = Boolean(review.isHidden);
                    const toggleAction = isHidden ? 'show' : 'hide';

                    return `
                    <tr id="reviewRow_${reviewId}">
                        <td>
                            <div class="reviews-product-cell">
                                ${productImg
                                    ? `<img src="${escapeHtml(productImg)}" alt="" class="reviews-product-thumb">`
                                    : '<div class="reviews-product-thumb reviews-product-thumb--empty"></div>'}
                                <span class="reviews-product-name">${productName}</span>
                            </div>
                        </td>
                        <td>
                            <div class="reviews-customer-name">${customerName}</div>
                            <div class="reviews-customer-email">${customerEmail}</div>
                        </td>
                        <td class="reviews-td-center">
                            <div class="reviews-stars">${'★'.repeat(rating)}${'☆'.repeat(Math.max(0, 5 - rating))}</div>
                            <div class="reviews-rating-num">${rating}/5</div>
                        </td>
                        <td class="reviews-comment-cell">
                            <p class="reviews-comment">${comment}</p>
                            <div class="reviews-date">${dateLabel}</div>
                        </td>
                        <td class="reviews-td-center">
                            <span class="reviews-status-badge ${isHidden ? 'reviews-status-badge--hidden' : 'reviews-status-badge--visible'}">
                                ${isHidden ? '🚫 Hidden' : '✅ Visible'}
                            </span>
                        </td>
                        <td class="reviews-td-center">
                            <div class="reviews-actions">
                                <button type="button" class="reviews-action-btn"
                                    onclick="moderateReview('${reviewId}', '${toggleAction}')"
                                    title="${isHidden ? 'Show' : 'Hide'} review">
                                    ${isHidden ? '👁 Show' : '🚫 Hide'}
                                </button>
                                <button type="button" class="reviews-action-btn reviews-action-btn--delete"
                                    onclick="deleteReviewAdmin('${reviewId}')"
                                    title="Delete review">🗑</button>
                            </div>
                        </td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>`;
}

window.loadAdminReviews = async function loadAdminReviews() {
    const search = document.getElementById('reviewSearchInput')?.value || '';
    const status = document.getElementById('reviewStatusFilter')?.value || '';
    const rating = document.getElementById('reviewRatingFilter')?.value || '';

    const container = document.getElementById('reviewsTableContainer');
    if (container) {
        container.innerHTML = '<p class="reviews-empty">Loading reviews…</p>';
    }

    try {
        const params = new URLSearchParams({ search, status, rating, limit: '20' });
        const res = await fetch(`/api/admin/reviews?${params}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
            if (container) container.innerHTML = `<p class="reviews-empty">${escapeHtml(data.message || 'Failed to load reviews')}</p>`;
            return;
        }

        const reviews = Array.isArray(data.reviews) ? data.reviews : [];
        renderReviewsStats(reviews, Number(data.total) || reviews.length);
        renderReviewsTable(reviews);
    } catch (err) {
        console.error('Failed to load reviews:', err);
        if (container) container.innerHTML = '<p class="reviews-empty">Network error loading reviews.</p>';
    }
};

window.moderateReview = async function moderateReview(reviewId, action) {
    try {
        const res = await fetch(`/api/admin/reviews/${reviewId}/moderate`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ action })
        });
        const data = await res.json();
        if (data.success) {
            loadAdminReviews();
            showToast(`Review ${action === 'hide' ? 'hidden' : 'visible'}`, 'success');
        } else {
            showToast(data.message || 'Failed to update review', 'error');
        }
    } catch (err) {
        console.error('moderateReview error:', err);
        showToast('Failed to update review', 'error');
    }
};

window.deleteReviewAdmin = async function deleteReviewAdmin(reviewId) {
    const runDelete = async () => {
        try {
            const res = await fetch(`/api/admin/reviews/${reviewId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                document.getElementById(`reviewRow_${reviewId}`)?.remove();
                showToast('Review deleted', 'success');
                loadAdminReviews();
            } else {
                showToast(data.message || 'Delete failed', 'error');
            }
        } catch (err) {
            console.error('deleteReviewAdmin error:', err);
            showToast('Failed to delete review', 'error');
        }
    };

    if (typeof Swal !== 'undefined') {
        const confirmed = await Swal.fire({
            title: 'Delete Review?',
            text: 'This cannot be undone.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Delete'
        });
        if (confirmed.isConfirmed) await runDelete();
        return;
    }

    showCustomConfirm('Delete Review?', 'This cannot be undone.', runDelete, 'danger');
};

document.getElementById('reviewSearchInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadAdminReviews();
});
