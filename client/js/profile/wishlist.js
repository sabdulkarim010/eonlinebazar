/**
 * Profile Wishlist
 * Barrel: client/js/profile.js
 *
 * Globals used from other modules:
 *  * - profileAuthToken
 * - escapeHtml
 * - safeImg
 * - showToast
 *
 * Globals this module exposes:
 *  * - fetchWishlist
 * - renderWishlist
 * - addWishlistItemToCart
 * - removeWishlistItem
 * - addCartItemToWishlist
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
    // ১৪. উইশলিস্ট (My Wishlist)
    // =================================================================
    let lastWishlistItems = [];

    async function fetchWishlist() {
        const container = document.getElementById('wishlist-items-list');
        if (!container) return;
        try {
            const res = await fetch('/api/customer/wishlist', {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (res.ok && data.success) {
                renderWishlist(data.wishlist || []);
            } else {
                container.innerHTML = `<p class="text-center empty-cart-text">Could not load wishlist.</p>`;
            }
        } catch (error) {
            console.error('Fetch Wishlist Error:', error);
            container.innerHTML = `<p class="text-center empty-cart-text">Server error loading wishlist.</p>`;
        }
    }

    function renderWishlist(items) {
        const container = document.getElementById('wishlist-items-list');
        if (!container) return;

        lastWishlistItems = items || [];
        window.__profileWishlistProductIds = (items || []).map((item) => item.productId);

        if (!items || items.length === 0) {
            window.__profileWishlistProductIds = [];
            container.innerHTML = `
                <div class="wishlist-empty">
                    <i class="fa-regular fa-heart"></i>
                    <p>Your wishlist is empty.</p>
                    <a href="/" class="shop-now-link">Browse products</a>
                </div>`;
            return;
        }

        container.innerHTML = '';
        items.forEach(item => {
            const PT = window.ProductThumbnail;
            const catalog = window.globalProductCatalog || [];
            const realProduct = (window.CartDisplayUtils && window.CartDisplayUtils.findCatalogProduct)
                ? window.CartDisplayUtils.findCatalogProduct(item, catalog)
                : catalog.find((p) =>
                    String(p._id) === String(item.productId) ||
                    String(p.productId) === String(item.productId) ||
                    String(p.id) === String(item.productId)
                );
            const meta = PT
                ? PT.getDisplayMeta(PT.mergeMediaSources(item, realProduct || {}))
                : { image: item.image || '', emoji: item.icon || '' };
            const media = PT
                ? PT.buildForCartItem(item, realProduct, { variant: 'compact', alt: item.name, escapeHtml })
                : (global.getProductImageHtml
                    ? global.getProductImageHtml(item, 'md')
                    : '<div class="no-photo-badge"><span>NO PHOTO</span></div>');

            const SA = window.StockAlert;
            const stockProduct = SA && typeof SA.findCatalogProduct === 'function'
                ? SA.findCatalogProduct(catalog, item.productId)
                : realProduct;
            const stock = SA ? SA.getItemStock({ productId: item.productId }, stockProduct) : null;
            const stockBadge = SA ? SA.buildStockAlertHtml(stock) : '';
            const outOfStock = SA ? SA.isOutOfStock(stock) : false;

            const card = document.createElement('div');
            card.className = 'wishlist-card profile-panel-inner-card';
            card.dataset.productId = String(item.productId || '');
            card.innerHTML = `
                <div class="wishlist-media">${media}</div>
                <div class="wishlist-info">
                    <h4 class="wishlist-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name || 'Product')}</h4>
                    <span class="wishlist-price">৳${Number(item.price || 0).toLocaleString()}</span>
                    ${stockBadge}
                </div>
                <div class="wishlist-actions">
                    <button type="button" class="wishlist-cart-btn${outOfStock ? ' is-out-of-stock' : ''}" data-id="${escapeHtml(item.productId)}" data-name="${escapeHtml(item.name || '')}" data-price="${Number(item.price || 0)}" data-image="${escapeHtml(safeImg(meta.image, ''))}" data-icon="${escapeHtml(meta.emoji)}" title="${outOfStock ? 'Out of stock' : 'Add to cart'}"${outOfStock ? ' disabled' : ''}>
                        <i class="fa-solid fa-cart-plus"></i>
                    </button>
                    <button type="button" class="wishlist-remove-btn" data-id="${escapeHtml(item.productId)}" title="Remove from wishlist">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            `;
            container.appendChild(card);
        });

        renderProfileCartSection();
    }

    window.renderProfileCartSection = renderProfileCartSection;

    document.addEventListener('productCatalogReady', () => {
        if (lastWishlistItems.length > 0) {
            renderWishlist(lastWishlistItems);
        }
    });

    async function addWishlistItemToCart(cartBtn) {
        const productId = cartBtn.getAttribute('data-id');
        const name = cartBtn.getAttribute('data-name') || '';
        const price = cartBtn.getAttribute('data-price') || '0';
        const image = cartBtn.getAttribute('data-image') || '';
        const icon = cartBtn.getAttribute('data-icon') || '';
        const productIcon = icon || '';

        if (!productId) {
            showToast('Product reference missing.', 'danger');
            return;
        }

        if (cartBtn.classList.contains('is-out-of-stock') || cartBtn.disabled) {
            if (typeof window.showOutOfStockToast === 'function') {
                window.showOutOfStockToast();
            } else {
                showToast('This item is out of stock.', 'warning');
            }
            return;
        }

        const originalHtml = cartBtn.innerHTML;
        cartBtn.disabled = true;
        cartBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

        try {
            const res = await fetch('/api/cart/add', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    productId,
                    quantity: 1,
                    name,
                    price: Number(price),
                    image,
                    icon: productIcon
                })
            });

            const data = await res.json();

            if (!res.ok) {
                showToast(data.message || 'Could not add to cart.', 'danger');
                return;
            }

            if (typeof window.syncCartFromServerItems === 'function') {
                const items = (window.CartDisplayUtils && window.CartDisplayUtils.parseCartApiResponse)
                    ? window.CartDisplayUtils.parseCartApiResponse(data)
                    : (Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []));
                if (items.length > 0) {
                    window.syncCartFromServerItems(items);
                }
            } else if (typeof window.fetchLiveDBCart === 'function') {
                await window.fetchLiveDBCart();
            } else if (typeof window.renderCartDrawerItems === 'function') {
                window.renderCartDrawerItems();
            }

            if (typeof window.showCartAddedToast === 'function') {
                window.showCartAddedToast();
            } else {
                showToast('🛒 Added to Cart successfully!', 'success');
            }
        } catch (error) {
            console.error('Wishlist add-to-cart error:', error);
            showToast('Server error while adding to cart.', 'danger');
        } finally {
            cartBtn.disabled = false;
            cartBtn.innerHTML = originalHtml;
        }
    }

    async function removeWishlistItem(removeBtn) {
        const productId = removeBtn.getAttribute('data-id');
        const card = removeBtn.closest('.wishlist-card');

        if (!productId) {
            showToast('Product reference missing.', 'danger');
            return;
        }

        const originalHtml = removeBtn.innerHTML;
        removeBtn.disabled = true;
        removeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

        try {
            const res = await fetch('/api/wishlist/toggle', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ productId })
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                showToast(data.message || 'Failed to remove.', 'danger');
                removeBtn.disabled = false;
                removeBtn.innerHTML = originalHtml;
                return;
            }

            if (card) {
                card.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
                card.style.opacity = '0';
                card.style.transform = 'scale(0.96)';
                setTimeout(() => {
                    card.remove();
                    const container = document.getElementById('wishlist-items-list');
                    if (container && !container.querySelector('.wishlist-card')) {
                        renderWishlist([]);
                    }
                }, 250);
            } else {
                await fetchWishlist();
            }

            if (typeof window.showWishlistRemovedToast === 'function') {
                window.showWishlistRemovedToast();
            } else {
                showToast('Item removed from Wishlist', 'info');
            }
        } catch (error) {
            console.error('Remove Wishlist Error:', error);
            showToast('Server error.', 'danger');
            removeBtn.disabled = false;
            removeBtn.innerHTML = originalHtml;
        }
    }

    async function addCartItemToWishlist(productId, heartBtn) {
        if (heartBtn?.classList.contains('is-saved')) {
            showToast('Already in your wishlist', 'info');
            return;
        }

        try {
            const res = await fetch('/api/wishlist/toggle', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ productId })
            });
            const data = await res.json();

            if (!res.ok || !data.success) {
                showToast(data.message || 'Could not add to wishlist.', 'danger');
                return;
            }

            if (data.added) {
                if (heartBtn) {
                    heartBtn.classList.add('is-saved');
                    const icon = heartBtn.querySelector('i');
                    if (icon) icon.className = 'fa-solid fa-heart';
                }
                if (typeof window.showWishlistAddedToast === 'function') {
                    window.showWishlistAddedToast();
                } else {
                    showToast('Saved to Wishlist', 'success');
                }
            } else {
                showToast('Already in your wishlist', 'info');
            }

            if (typeof fetchWishlist === 'function') fetchWishlist();
        } catch (error) {
            console.error('Add to Wishlist Error:', error);
            showToast('Server error while saving to wishlist.', 'danger');
        }
    }

    document.getElementById('cart-items-preview-list')?.addEventListener('click', async (e) => {
        const heartBtn = e.target.closest('.cart-wishlist-heart-btn');
        if (!heartBtn) return;
        e.preventDefault();
        const productId = heartBtn.dataset.productId;
        heartBtn.disabled = true;
        await addCartItemToWishlist(productId, heartBtn);
        heartBtn.disabled = false;
    });

    // উইশলিস্টের রিমুভ ও অ্যাড-টু-কার্ট (ইভেন্ট ডেলিগেশন)
    document.addEventListener('click', async (e) => {
        const removeBtn = e.target.closest('.wishlist-remove-btn');
        const cartBtn = e.target.closest('.wishlist-cart-btn');

        if (removeBtn) {
            e.preventDefault();
            e.stopPropagation();
            await removeWishlistItem(removeBtn);
            return;
        }

        if (cartBtn) {
            e.preventDefault();
            e.stopPropagation();
            await addWishlistItemToCart(cartBtn);
        }
    });

Object.assign(window, {
    fetchWishlist,
    renderWishlist,
    addWishlistItemToCart,
    removeWishlistItem,
    addCartItemToWishlist
});

});
