/**
 * Profile Reviews
 * Barrel: client/js/profile.js
 *
 * Globals used from other modules:
 *  * - profileAuthToken
 * - escapeHtml
 * - showToast
 * - currentUserId
 *
 * Globals this module exposes:
 *  * - closeReviewModal
 * - resetReviewForm
 * - openReviewModal
 */

document.addEventListener('DOMContentLoaded', () => {
    const token = window.profileAuthToken;
    if (!token) return;
    const escapeHtml = window.profileEscapeHtml;
    const safeImg = window.profileSafeImg;
    const bindImgFallback = window.profileBindImgFallback;
    const setAvatarSrc = window.profileSetAvatarSrc;
    const IMAGE_PLACEHOLDER = window.profileImagePlaceholder;
    const AVATAR_PLACEHOLDER = window.profileAvatarPlaceholder;
    const IMG_ONERROR = window.profileImgOnerror;
    const showToast = window.profileShowToast;
    const showInlineFeedback = window.profileShowInlineFeedback;
    const currentUserId = window.profileCurrentUserId;
    let currentUser = window.profileCurrentUser;


    // =================================================================
    // ১০. রিভিউ মডাল ও স্টার সাবমিশন লজিক (Review Modal & Rating)
    // =================================================================
    const reviewModal = document.getElementById('review-modal');
    const closeReviewBtn = document.getElementById('close-review-modal');
    const reviewForm = document.getElementById('review-form');
    const reviewProductIdInput = document.getElementById('review-product-id');
    const reviewOrderIdInput = document.getElementById('review-order-id');
    const reviewProductNameEl = document.getElementById('review-modal-product-name');
    const reviewPhotoInput = document.getElementById('review-photo');
    const reviewPhotoLabel = document.getElementById('review-photo-label');
    const reviewPhotoPreview = document.getElementById('review-photo-preview');
    const submitReviewBtn = document.getElementById('submit-review-btn');

    function closeReviewModal() {
        if (reviewModal) reviewModal.classList.add('hidden');
    }

    if (closeReviewBtn && reviewModal) {
        closeReviewBtn.addEventListener('click', closeReviewModal);
    }

    window.addEventListener('click', (e) => {
        if (e.target === reviewModal) closeReviewModal();
    });

    // রিভিউ মডাল রিসেট করার হেল্পার
    function resetReviewForm() {
        if (reviewForm) reviewForm.reset();
        document.querySelectorAll('input[name="rating"]').forEach(r => { r.checked = false; });
        if (reviewPhotoLabel) reviewPhotoLabel.textContent = 'Click to upload a product photo';
        if (reviewPhotoPreview) {
            reviewPhotoPreview.innerHTML = '';
            reviewPhotoPreview.classList.add('hidden');
        }
        if (submitReviewBtn) {
            submitReviewBtn.innerHTML = '<i class="fa-regular fa-paper-plane"></i> Submit Review';
            submitReviewBtn.disabled = false;
        }
    }

    // ⭐ ডেলিভার্ড প্রোডাক্টের "Write Review" বাটন থেকে মডাল ওপেন করা + আগের রিভিউ প্রি-লোড
    async function openReviewModal(orderId, productId, productName) {
        if (!reviewModal) return;

        resetReviewForm();
        if (reviewProductIdInput) reviewProductIdInput.value = productId || '';
        if (reviewOrderIdInput) reviewOrderIdInput.value = orderId || '';
        if (reviewProductNameEl) reviewProductNameEl.textContent = productName || 'Product';
        reviewModal.classList.remove('hidden');

        // এই নির্দিষ্ট অর্ডার+প্রোডাক্টের জন্য ইউজারের আগের রিভিউ থাকলে সেটি এডিট মোডে লোড হবে
        try {
            const query = `?orderId=${encodeURIComponent(orderId)}${currentUserId ? `&userId=${encodeURIComponent(currentUserId)}` : ''}`;
            const res = await fetch(`/api/reviews/${productId}${query}`);
            const data = await res.json();

            if (data.success && Array.isArray(data.reviews) && data.reviews.length > 0) {
                const myReview = data.reviews.find(r =>
                    String(r.productId) === String(productId)
                ) || data.reviews[0];

                if (myReview) {
                    const ratingRadio = document.getElementById(`star${myReview.rating}`);
                    if (ratingRadio) ratingRadio.checked = true;

                    const commentInput = document.getElementById('review-comment');
                    if (commentInput) commentInput.value = myReview.comment || '';

                    if (submitReviewBtn) submitReviewBtn.innerHTML = '<i class="fa-regular fa-pen-to-square"></i> Update Review';

                    if (myReview.photo && reviewPhotoPreview) {
                        reviewPhotoPreview.innerHTML = `
                            <span class="review-photo-preview-label">Previously uploaded photo:</span>
                            <img src="${escapeHtml(safeImg(myReview.photo))}" alt="Your review photo" onerror="${IMG_ONERROR}">`;
                        reviewPhotoPreview.classList.remove('hidden');
                    }
                }
            }
        } catch (err) {
            console.error('Error loading existing review:', err);
        }
    }

    // "Write Review" বাটনে ক্লিক (ইভেন্ট ডেলিগেশন — ডায়নামিক রো সাপোর্ট করে)
    document.addEventListener('click', (e) => {
        const reviewBtn = e.target.closest('.btn-write-review');
        if (!reviewBtn) return;
        e.preventDefault();
        // রিভিউ বাটন অর্ডার-রো'র ভেতরে থাকায় রো-ক্লিক নেভিগেশন আটকানো হচ্ছে
        e.stopImmediatePropagation();
        openReviewModal(
            reviewBtn.getAttribute('data-order-id'),
            reviewBtn.getAttribute('data-product-id'),
            reviewBtn.getAttribute('data-product-name')
        );
    });

    // ফটো সিলেক্ট করলে প্রিভিউ দেখানো
    if (reviewPhotoInput) {
        reviewPhotoInput.addEventListener('change', () => {
            const file = reviewPhotoInput.files[0];
            if (!file) return;

            if (file.size > 5 * 1024 * 1024) {
                showToast('Image size should be less than 5MB.', 'warning');
                reviewPhotoInput.value = '';
                return;
            }

            if (reviewPhotoLabel) reviewPhotoLabel.textContent = file.name;
            if (reviewPhotoPreview) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    reviewPhotoPreview.innerHTML = `<img src="${ev.target.result}" alt="Selected photo" onerror="${IMG_ONERROR}">`;
                    reviewPhotoPreview.classList.remove('hidden');
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // 🌟 রিভিউ সাবমিট — ভেরিফায়েড রিভিউ কন্ট্রোলারে (/api/reviews) ক্লিনভাবে কানেক্ট করা
    if (reviewForm) {
        reviewForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const productId = reviewProductIdInput ? reviewProductIdInput.value : '';
            const orderId = reviewOrderIdInput ? reviewOrderIdInput.value : '';
            const commentInput = document.getElementById('review-comment');
            const comment = commentInput ? commentInput.value.trim() : '';
            const selectedRatingInput = document.querySelector('input[name="rating"]:checked');

            if (!orderId || !productId) {
                showToast('Missing order or product reference. Please reopen the review form.', 'danger');
                return;
            }
            if (!selectedRatingInput) {
                showToast('Please select a star rating!', 'warning');
                return;
            }
            if (!comment) {
                showToast('Please write a short review before submitting.', 'warning');
                return;
            }

            const rating = selectedRatingInput.value;
            const submitBtn = reviewForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;

            try {
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';
                submitBtn.disabled = true;

                // FormData ব্যবহার — কারণ রিভিউ কন্ট্রোলার ছবি (multipart) সাপোর্ট করে
                const formData = new FormData();
                formData.append('orderId', orderId);
                formData.append('productId', productId);
                formData.append('rating', rating);
                formData.append('comment', comment);
                if (reviewPhotoInput && reviewPhotoInput.files.length > 0) {
                    formData.append('photo', reviewPhotoInput.files[0]);
                }

                const res = await fetch('/api/reviews', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }, // Content-Type নয় — ব্রাউজার boundary সেট করবে
                    body: formData
                });

                const data = await res.json();

                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;

                if (res.ok && data.success) {
                    showToast(data.message || 'Thank you! Your review has been submitted.', 'success');
                    closeReviewModal();
                    resetReviewForm();
                } else {
                    showToast(data.message || 'Submission failed.', 'danger');
                }
            } catch (error) {
                console.error('Submit Review Error:', error);
                showToast('Server error while submitting review.', 'danger');
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        });
    }

Object.assign(window, {
    closeReviewModal,
    resetReviewForm,
    openReviewModal
});

});
