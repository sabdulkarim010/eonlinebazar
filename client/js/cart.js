/**
 * ==========================================================================
 * File Name: js/cart.js
 * Project: eOnlineBazar
 * Author: Abdul Karim Sheikh
 * Description: Fully Synced Premium Shopping Cart Logic (Fixed IDs & Assets)
 * ==========================================================================
 */

/* ==========================================================================
   SECTION 1: GLOBAL VARIABLES & API SYNC (শুরু এবং ডাটাবেজ সিঙ্ক)
   ========================================================================== */
let cart = JSON.parse(localStorage.getItem('cart')) || [];
let globalProductCatalog = [];

// লাইভ এপিআই থেকে ডাটা লোড করে কার্ট সিঙ্ক করা
fetch('/api/products')
    .then(response => {
        if (!response.ok) throw new Error('Network response was not ok');
        return response.json();
    })
    .then(data => {
        globalProductCatalog = data;
        renderCartDrawerItems(); // ডাটা আসার সাথে সাথে রেন্ডার হবে
    })
    .catch(error => {
        console.error("Error loading products API in cart:", error);
        renderCartDrawerItems(); // ব্যাকআপ রেন্ডার
    });

/* ==========================================================================
   SECTION 2: LIVE COUNTERS (নেভবার ব্যাজ কাউন্টার)
   ========================================================================== */
function updateCartCount() {
    const cartCountBadge = document.getElementById('cartCountBadge') || document.querySelector('.Bag span');
    const drawerCount = document.getElementById('cartDrawerCount');
    let currentCart = JSON.parse(localStorage.getItem('cart')) || [];

    const count = currentCart.length;
    if (cartCountBadge) cartCountBadge.innerText = count;
    if (drawerCount) drawerCount.innerText = count;
}

/* ==========================================================================
   SECTION 3: RENDER CART ITEMS (ফটো, ইমোজি ও বাটন ফিক্সড রেন্ডার)
   ========================================================================== */
function renderCartDrawerItems() {
    const drawerContainer = document.getElementById('cartDrawerItems');
    const pageContainer = document.getElementById('cartItemsContainer') || document.getElementById('checkoutItemsContainer');
    const cartFooter = document.getElementById('cartDrawerFooter');
    const summarySection = document.getElementById('cartSummarySection'); 
    
    const container = drawerContainer || pageContainer;
    if (!container) return;

    let currentCart = JSON.parse(localStorage.getItem('cart')) || [];
    container.innerHTML = '';

    // ১. কার্ট খালি থাকলে Empty Bag দেখাবে
    if (currentCart.length === 0) {
        container.innerHTML = `
            <div class="empty-cart-container" style="text-align:center; padding:60px 20px; color:#777; width:100%;">
                <i class="fa fa-shopping-bag" style="font-size:48px; color:#bbb; margin-bottom:15px; display:block;"></i>
                <span style="font-size:18px; font-weight:600; color:#334155; display:block; margin-bottom:8px;">Your shopping bag is empty!</span>
                <span style="font-size:14px; color:#64748b; margin-bottom:24px; display:block;">Please add some products to your cart.</span>
                <a href="index.html" style="background:#f97316; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600; display:inline-block; transition:0.3s;">Browse Products</a>
            </div>
        `;
        if (cartFooter) cartFooter.style.display = 'none';
        if (summarySection) summarySection.style.display = 'none'; 
        updateCartTotal();
        return;
    }

    if (cartFooter) cartFooter.style.display = 'block';
    if (summarySection) summarySection.style.display = 'block';

    // ২. কার্ট আইটেম রেন্ডারিং লুপ
    currentCart.forEach((item, index) => {
        // 🚀 আইডি ম্যাচিং ফিক্স: মঙ্গোডিবির _id অথবা productId দুটাই চেক করবে স্ট্রিং আকারে
        let realProduct = globalProductCatalog.find(p => String(p._id) === String(item.id) || String(p.productId) === String(item.id) || String(p.id) === String(item.id));
        
        let correctEmoji = (realProduct && realProduct.icon) ? realProduct.icon.trim() : (item.icon || "📦");
        let imageFile = (realProduct && realProduct.image) ? realProduct.image.trim() : ((realProduct && realProduct.products) ? realProduct.products.trim() : (item.products || item.image || ''));

        let mediaHTML = `📦`;

        // 🚀 ফটো ও পাথ ফিক্সড লজিক
        if (imageFile !== '') {
            let lowerPath = imageFile.toLowerCase();
            if (lowerPath.includes('.jpg') || lowerPath.includes('.png') || lowerPath.includes('.jpeg') || lowerPath.includes('.webp')) {
                let imagePath = imageFile;
                if (!imagePath.startsWith('/') && !imagePath.startsWith('http') && !imagePath.startsWith('products/')) {
                    imagePath = '/products/' + imagePath;
                } else if (imagePath.startsWith('products/')) {
                    imagePath = '/' + imagePath;
                }
                
                mediaHTML = `
                    <img src="${imagePath}" alt="${item.name}" style="width:100%; height:100%; object-fit:cover;" onerror="this.onerror=null; this.style.display='none'; this.nextElementSibling.style.display='inline-block';">
                    <span class="product-emoji-icon" style="font-size: 24px; display:none;">${correctEmoji}</span>
                `;
            } else {
                mediaHTML = `<span class="product-emoji-icon" style="font-size: 24px; display:inline-block;">${correctEmoji}</span>`;
            }
        } else {
            mediaHTML = `<span class="product-emoji-icon" style="font-size: 24px; display:inline-block;">${correctEmoji}</span>`;
        }

        const isChecked = item.selected !== false ? 'checked' : '';
        const quantity = item.quantity || 1;
        const itemTotal = item.price * quantity; 
        
        const row = document.createElement('div');
        
        // 🚀 সেফ আইডি হ্যান্ডলিং: স্ট্রিং টাইপ আইডির জন্য কোটেশন ('') ব্যবহার করা হয়েছে বাটনের ভেতর
        if (drawerContainer) {
            row.className = 'cart-item-row'; 
            row.innerHTML = `
                <div style="display:flex; align-items:center; gap:6px;">
                    <span class="cart-item-serial">#${index + 1}</span>
                    <input type="checkbox" class="cart-item-checkbox" data-id="${item.id}" ${isChecked} onchange="toggleItemSelection('${item.id}')">
                </div>
                <div class="cart-item-media" style="width:40px; height:40px; display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0; background:#f9f9f9; border-radius:4px;">${mediaHTML}</div>
                <div class="cart-item-info">
                    <div class="cart-item-name" title="${item.name}">${item.name}</div>
                    <div class="cart-item-price">৳${item.price}</div>
                </div>
                <div class="cart-item-qty-box">
                    <button class="qty-btn" onclick="updateQty('${item.id}', -1)">-</button>
                    <span class="qty-val">${quantity}</span>
                    <button class="qty-btn" onclick="updateQty('${item.id}', 1)">+</button>
                </div>
                <button class="cart-delete-btn" onclick="deleteCartItem('${item.id}')">
                    <i class="fa fa-trash"></i>
                </button>
            `;
        } else {
            row.className = `cart-item-card ${item.selected === false ? 'is-unchecked' : ''}`;
            row.innerHTML = `
                <div class="cart-item-left-group">
                    <input type="checkbox" class="cart-item-checkbox" data-id="${item.id}" ${isChecked} onchange="toggleItemSelection('${item.id}')">
                    <div class="cart-item-media-box" style="width:50px; height:50px; display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0; background:#f9f9f9; border-radius:6px;">
                        ${mediaHTML}
                    </div>
                    <div class="cart-item-info-box">
                        <span class="product-title-text">${item.name}</span>
                        <span class="product-unit-price">৳${item.price}</span>
                    </div>
                </div>
                
                <div class="cart-item-right-group">
                    <div class="cart-quantity-controller">
                        <button class="qty-control-btn" onclick="updateQty('${item.id}', -1)"><i class="fa-solid fa-minus"></i></button>
                        <div class="qty-display-number">${quantity}</div>
                        <button class="qty-control-btn" onclick="updateQty('${item.id}', 1)"><i class="fa-solid fa-plus"></i></button>
                    </div>
                    <div class="cart-item-total-price">৳${itemTotal}</div>
                    <button class="cart-item-trash-btn" onclick="deleteCartItem('${item.id}')" title="Remove Product">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            `;
        }
        container.appendChild(row);
    });

    updateCartTotal();
}

/* ==========================================================================
   SECTION 4: CART INTERACTIONS (চেক ও ক্যালকুলেশন লজিক)
   ========================================================================== */
window.toggleItemSelection = function(productId) {
    let currentCart = JSON.parse(localStorage.getItem('cart')) || [];
    const item = currentCart.find(i => String(i.id) === String(productId));
    
    if (item) {
        const checkbox = document.querySelector(`.cart-item-checkbox[data-id="${productId}"]`);
        item.selected = checkbox ? checkbox.checked : !item.selected;
    }
    
    localStorage.setItem('cart', JSON.stringify(currentCart));
    renderCartDrawerItems();
};

function updateCartTotal() {
    const totalSpan = document.getElementById('cartDrawerTotal');
    const itemsCountSpan = document.getElementById('cartSelectedItemsCount');
    const subtotalEl = document.getElementById('cartSubtotalAmount');
    const grandTotalEl = document.getElementById('cartGrandTotalAmount');
    const checkoutRedirectBtn = document.getElementById('proceedToCheckoutBtn');
    const summarySection = document.getElementById('cartSummarySection'); 

    let currentCart = JSON.parse(localStorage.getItem('cart')) || [];
    let checkedItems = currentCart.filter(item => item.selected !== false);
    let uniqueSelectedCount = checkedItems.length;
    let grandTotal = 0;

    checkedItems.forEach(item => {
        grandTotal += item.price * (item.quantity || 1);
    });

    if (totalSpan) totalSpan.innerText = grandTotal;
    if (itemsCountSpan) itemsCountSpan.innerText = `${uniqueSelectedCount} Items`;
    if (subtotalEl) subtotalEl.innerText = `৳${grandTotal}`;
    if (grandTotalEl) grandTotalEl.innerText = `৳${grandTotal}`;

    if (currentCart.length === 0 || uniqueSelectedCount === 0) {
        if (summarySection) summarySection.style.display = 'none';
        if (checkoutRedirectBtn) {
            checkoutRedirectBtn.disabled = true;
            checkoutRedirectBtn.style.opacity = '0.5';
            checkoutRedirectBtn.onclick = null;
        }
    } else {
        if (summarySection) summarySection.style.display = 'block';
        if (checkoutRedirectBtn) {
            checkoutRedirectBtn.disabled = false;
            checkoutRedirectBtn.style.opacity = '1';
            checkoutRedirectBtn.onclick = function() {
                localStorage.setItem("activeCheckoutSession", "true");
                window.location.href = 'checkout.html';
            };
        }
    }
}


/* ==========================================================================
   SECTION 5: QUANTITY & DELETE CONTROLS (আপডেটেড উইথ স্টক লিমিট)
   ========================================================================== */
window.updateQty = function(productId, change) {
    let currentCart = JSON.parse(localStorage.getItem('cart')) || [];
    const item = currentCart.find(i => String(i.id) === String(productId));

    if (item) {
        // 🚨 স্টক ভ্যালিডেশন (প্লাস বাটনে ক্লিক করলে)
        if (change > 0) {
            const realProduct = globalProductCatalog.find(p => String(p._id) === String(productId) || String(p.productId) === String(productId) || String(p.id) === String(productId));
            
            if (realProduct) {
                let availableStock = Number(realProduct.stock || 0);
                if ((item.quantity + change) > availableStock) {
                    alert(`দুঃখিত! আমাদের স্টকে সর্বোচ্চ ${availableStock} টি প্রোডাক্ট এভেইলেবল আছে।`);
                    return; // স্টক না থাকলে ফাংশন এখানেই থেমে যাবে
                }
            }
        }

        item.quantity = (item.quantity || 1) + change;
        
        if (item.quantity < 1) {
            deleteCartItem(productId);
            return;
        }
    }

    localStorage.setItem('cart', JSON.stringify(currentCart));
    updateCartCount();
    renderCartDrawerItems();
};

window.deleteCartItem = function(productId) {
    let currentCart = JSON.parse(localStorage.getItem('cart')) || [];
    currentCart = currentCart.filter(item => String(item.id) !== String(productId));

    localStorage.setItem('cart', JSON.stringify(currentCart));
    updateCartCount();
    renderCartDrawerItems();

    const btn = window.event ? window.event.target.closest('button') : null;
    if (btn && typeof showCardNotification === 'function') {
        showCardNotification(btn, "Item removed!", "warning");
    }
};


/* ==========================================================================
   SECTION 6: TOAST NOTIFICATIONS & ANIMATIONS (নোটিফিকেশন ও ফ্লাইং ইফেক্ট)
   ========================================================================== */
function showCardNotification(clickedButton, message, type = 'success') {
    if (!clickedButton) return;
    const productCard = clickedButton.closest('.product-card') || clickedButton.closest('.cart-item-card');
    if (!productCard || !(productCard instanceof HTMLElement)) return;

    const oldToast = productCard.querySelector('.card-toast');
    if (oldToast) oldToast.remove();

    const toast = document.createElement('div');
    toast.className = `card-toast ${type}`;
    toast.innerHTML = type === 'success' ? `✅ ${message}` : `⚠️ ${message}`;
    
    productCard.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 50);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

function triggerFlyAnimation(clickedButton, assetData) {
    const cartTarget = document.getElementById('cartCountBadge') || document.querySelector('.Bag');
    if (!cartTarget || !clickedButton) return;

    const productCard = clickedButton.closest('.product-card');
    if (!productCard) return;

    let finalAssetHTML = '';
    let targetVisualElement = null;

    const liveImg = productCard.querySelector('img');
    const liveEmoji = productCard.querySelector('.product-emoji, .emoji-box, .item-emoji, .product-emoji-icon');

    if (liveImg && liveImg.src) {
        finalAssetHTML = `<img src="${liveImg.src}" alt="flying-prod" style="width:100%; height:100%; object-fit:contain; border-radius:8px;">`;
        targetVisualElement = liveImg;
    } else if (liveEmoji) {
        finalAssetHTML = `<div class="emoji-fly" style="font-size:30px;">${liveEmoji.innerText}</div>`;
        targetVisualElement = liveEmoji;
    }

    if (!finalAssetHTML) {
        if (assetData && (assetData.endsWith('.jpg') || assetData.endsWith('.png') || assetData.endsWith('.jpeg') || assetData.endsWith('.webp'))) {
            let imagePath = assetData.startsWith('/') ? assetData : '/products/' + assetData;
            finalAssetHTML = `<img src="${imagePath}" alt="flying-prod">`;
        } else {
            finalAssetHTML = `<div class="emoji-fly" style="font-size:40px;">🛍️</div>`;
        }
        targetVisualElement = clickedButton;
    }

    const visualRect = targetVisualElement.getBoundingClientRect();
    const cartRect = cartTarget.getBoundingClientRect();

    const flyElement = document.createElement('div');
    flyElement.className = 'flying-cart-asset';
    flyElement.style.position = 'absolute';
    flyElement.style.zIndex = '99999';

    flyElement.style.top = `${visualRect.top + window.scrollY + visualRect.height / 2}px`;
    flyElement.style.left = `${visualRect.left + window.scrollX + visualRect.width / 2}px`;

    flyElement.innerHTML = finalAssetHTML;
    document.body.appendChild(flyElement);

    setTimeout(() => {
        flyElement.style.top = `${cartRect.top + window.scrollY + cartRect.height / 2}px`;
        flyElement.style.left = `${cartRect.left + window.scrollX + cartRect.width / 2}px`;
        flyElement.style.transform = 'translate(-50%, -50%) scale(0.1)';
        flyElement.style.opacity = '0.2';
    }, 50);

    setTimeout(() => {
        flyElement.remove();
        cartTarget.style.transform = 'scale(1.3)';
        setTimeout(() => cartTarget.style.transform = 'scale(1)', 200);
    }, 850);
}


/* ==========================================================================
   SECTION 7: ADD TO BAG CORE (আপডেটেড উইথ স্টক লিমিট)
   ========================================================================== */
window.addToBag = function(productId, productName, productPrice, productImage) {
    let currentCart = JSON.parse(localStorage.getItem('cart')) || [];
    const existingItem = currentCart.find(item => String(item.id) === String(productId));
    const clickedButton = window.event ? window.event.target.closest('button') : null;

    // 🚨 স্টক ভ্যালিডেশন শুরু
    const realProduct = globalProductCatalog.find(p => String(p._id) === String(productId) || String(p.productId) === String(productId) || String(p.id) === String(productId));
    
    if (realProduct) {
        let availableStock = Number(realProduct.stock || 0);
        let currentQtyInCart = existingItem ? existingItem.quantity : 0;
        let quantityToAdd = currentQtyInCart + 1;

        if (availableStock <= 0) {
            showCardNotification(clickedButton, "Out of stock!", "error");
            return; // স্টক ০ হলে আর অ্যাড হবে না
        }
        
        if (quantityToAdd > availableStock) {
            showCardNotification(clickedButton, `Stock limit: ${availableStock}`, "warning");
            return; // স্টকের চেয়ে বেশি অ্যাড করতে চাইলে আটকে দেবে
        }
    }
    // 🚨 স্টক ভ্যালিডেশন শেষ

    if (existingItem) {
        existingItem.quantity = (existingItem.quantity || 1) + 1;
        showCardNotification(clickedButton, "Quantity increased!", 'success');
    } else {
        triggerFlyAnimation(clickedButton, productImage);

        currentCart.unshift({
            id: productId,
            name: productName,
            price: Number(productPrice),
            products: productImage || '', 
            icon: productImage && !productImage.includes('.') ? productImage : '📦',
            quantity: 1,
            selected: true 
        });
    }

    localStorage.setItem('cart', JSON.stringify(currentCart));
    cart = currentCart;
    
    setTimeout(() => {
        updateCartCount();
        if (!existingItem) {
            showCardNotification(clickedButton, "Added to bag!", 'success');
        }
        renderCartDrawerItems();
    }, 800);
};

// গ্লোবাল ফাংশন এক্সপোজার
window.updateCartCount = updateCartCount;
window.renderCartDrawerItems = renderCartDrawerItems;


/* ==========================================================================
   SECTION 8: INITIALIZATION ON LOAD (পেজ লোড সিঙ্ক)
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    updateCartCount();
    renderCartDrawerItems();
});





























