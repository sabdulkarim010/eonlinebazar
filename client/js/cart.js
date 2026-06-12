/**
 * ==========================================================================
 * File Name: js/cart.js
 * Project: eOnlineBazar
 * Description: Fully Synced Premium Shopping Cart Logic (Hybrid Guest & DB Cart)
 * ==========================================================================
 */

/* ==========================================================================
   SECTION 1: GLOBAL VARIABLES & API SYNC (শুরু এবং ডাটাবেজ সিঙ্ক)
   ========================================================================== */
let cart = JSON.parse(localStorage.getItem('cart')) || [];
let globalProductCatalog = [];

// 🌟 টোকেন চেক (কাস্টমার লগইন আছে কি না জানার জন্য)
const customerToken = localStorage.getItem('token') || localStorage.getItem('customerToken');

// লাইভ এপিআই থেকে ক্যাটালগ ডাটা লোড করা এবং কার্ট মার্জ/সিঙ্ক করা
fetch('/api/products')
    .then(response => {
        if (!response.ok) throw new Error('Network response was not ok');
        return response.json();
    })
    .then(data => {
        globalProductCatalog = data;
        
        // 🌟 হাইব্রিড মার্জ লজিক: ইউজার লগইন থাকলে লোকাল স্টোরেজের কার্ট ডাটাবেজে পাঠিয়ে মার্জ হবে
        if (customerToken) {
            const localCart = JSON.parse(localStorage.getItem('cart')) || [];
            if (localCart.length > 0) {
                // ব্যাকএন্ডে মার্জ রিকোয়েস্ট পাঠানো হচ্ছে
                fetch('/api/cart/merge', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${customerToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ cartItems: localCart })
                })
                .then(res => res.json())
                .then(mergeData => {
                    // মার্জ সফল হলে লোকাল স্টোরেজ ক্লিয়ার করে ডাটাবেজ থেকে ফ্রেশ কার্ট আনা হবে
                    localStorage.removeItem('cart');
                    fetchLiveDBCart();
                })
                .catch(err => {
                    console.error("Error merging cart:", err);
                    fetchLiveDBCart();
                });
            } else {
                fetchLiveDBCart();
            }
        } else {
            renderCartDrawerItems(); // গেস্ট ইউজারের জন্য লোকাল স্টোরেজ রেন্ডার
        }
    })
    .catch(error => {
        console.error("Error loading products API in cart:", error);
        renderCartDrawerItems(); // ব্যাকআপ রেন্ডার
    });

// 🌟 ডাটাবেজ থেকে লাইভ কার্ট আইটেম নিয়ে আসার ফাংশন
function fetchLiveDBCart() {
    if (!customerToken) return;
    fetch('/api/cart', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${customerToken}` }
    })
    .then(res => res.json())
    .then(dbCartItems => {
        // ব্যাকএন্ড থেকে আসা ফরম্যাটকে ফ্রন্টএন্ড ফরম্যাটে সাজানো
        cart = dbCartItems.map(item => ({
            id: item.productId,
            name: item.name,
            price: Number(item.price),
            products: item.image || '',
            icon: item.icon || '📦',
            quantity: item.quantity,
            selected: item.selected !== false
        }));
        updateCartCount();
        renderCartDrawerItems();
    })
    .catch(err => console.error("Error fetching live DB cart:", err));
}

/* ==========================================================================
   SECTION 2: LIVE COUNTERS (নেভবার ব্যাজ কাউন্টার)
   ========================================================================== */
function updateCartCount() {
    // 🌟 ফিক্স: এখানে nav-cart-count আইডিটিও চেক করবে
    const cartCountBadge = document.getElementById('cartCountBadge') || 
                           document.getElementById('nav-cart-count') || 
                           document.querySelector('.Bag span');
    const drawerCount = document.getElementById('cartDrawerCount');
    
    let count = customerToken ? cart.length : (JSON.parse(localStorage.getItem('cart')) || []).length;

    if (cartCountBadge) cartCountBadge.innerText = count;
    if (drawerCount) drawerCount.innerText = count;
}


/* ==========================================================================
   SECTION 3: RENDER CART ITEMS (ফটো, ইমোজি ও বাটন ফিক্সড রেন্ডার + প্রোফাইল অর্ডার প্যানেল)
   ========================================================================== */
function renderCartDrawerItems() {
    const drawerContainer = document.getElementById('cartDrawerItems');
    
    // প্রোফাইল পেজ বা চেকআউটের কন্টেইনার
    const pageContainer = document.getElementById('cartItemsContainer') || 
                          document.getElementById('checkoutItemsContainer') || 
                          document.getElementById('cart-items-preview-list');
                          
    const cartFooter = document.getElementById('cartDrawerFooter');
    const summarySection = document.getElementById('cartSummarySection'); 
    
    const container = drawerContainer || pageContainer;
    if (!container) return;


    // লগইন থাকলে লাইভ কার্ট অ্যারে, না থাকলে লোকাল স্টোরেজ
    let currentCart = customerToken ? cart : (JSON.parse(localStorage.getItem('cart')) || []);
    container.innerHTML = '';

    // ১. কার্ট খালি থাকলে Empty Bag দেখাবে
    if (currentCart.length === 0) {
        container.innerHTML = `
            <div class="empty-cart-container" style="text-align:center; padding:60px 20px; color:#777; width:100%;">
                <i class="fa fa-shopping-bag" style="font-size:48px; color:#bbb; margin-bottom:15px; display:block;"></i>
                <span style="font-size:18px; font-weight:600; color:#334155; display:block; margin-bottom:8px;">Your shopping bag is empty!</span>
                <span style="font-size:14px; color:#64748b; margin-bottom:24px; display:block;">Please add some products to your cart.</span>
                <a href="/" style="background:#f97316; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600; display:inline-block; transition:0.3s;">Browse Products</a>
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
        let realProduct = globalProductCatalog.find(p => String(p._id) === String(item.id) || String(p.productId) === String(item.id) || String(p.id) === String(item.id));
        
        let correctEmoji = (realProduct && realProduct.icon) ? realProduct.icon.trim() : (item.icon || "📦");
        let imageFile = (realProduct && realProduct.image) ? realProduct.image.trim() : ((realProduct && realProduct.products) ? realProduct.products.trim() : (item.products || item.image || ''));

        let mediaHTML = `📦`;

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
                    <input type="checkbox" class="cart-item-checkbox" data-id="${item.id}" ${isChecked} onchange="toggleItemSelection('${item.id}')" style="cursor:pointer; transform: scale(1.2);">
                    <div class="cart-item-media-box" style="width:50px; height:50px; display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0; background:#f9f9f9; border-radius:6px; margin-left: 10px;">
                        ${mediaHTML}
                    </div>
                    <div class="cart-item-info-box" style="margin-left: 10px;">
                        <span class="product-title-text" style="display:block; font-weight:600; color:#1e293b;">${item.name}</span>
                        <span class="product-unit-price" style="display:block; color:#f97316; font-size:14px;">৳${item.price}</span>
                    </div>
                </div>
                
                <div class="cart-item-right-group">
                    <div class="cart-quantity-controller">
                        <button class="qty-control-btn" onclick="updateQty('${item.id}', -1)"><i class="fa-solid fa-minus"></i></button>
                        <div class="qty-display-number">${quantity}</div>
                        <button class="qty-control-btn" onclick="updateQty('${item.id}', 1)"><i class="fa-solid fa-plus"></i></button>
                    </div>
                    <div class="cart-item-total-price" style="font-weight:bold; min-width:60px; text-align:right;">৳${itemTotal}</div>
                    <button class="cart-item-trash-btn" onclick="deleteCartItem('${item.id}')" title="Remove Product">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            `;
        }
        container.appendChild(row);
    });

    // ৩. প্রোফাইল পেজের জন্য ডাইনামিক চেকআউট প্যানেল যুক্ত করা
    if (pageContainer && container.id === 'cart-items-preview-list') {
        const dynamicSummary = document.createElement('div');
        dynamicSummary.className = 'profile-dynamic-checkout-panel';
        dynamicSummary.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:20px; border-radius:10px; margin-top:20px; border:1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                <div>
                    <span style="color:#64748b; font-size:14px; display:block; margin-bottom:5px;">Selected Items: <strong id="profileCartItemsCount">0</strong></span>
                    <h3 style="margin:0; color:#0f172a; font-size:22px;">Total: <span id="profileCartTotalAmount">৳0</span></h3>
                </div>
                <button id="profileCheckoutBtn" style="background:#f97316; color:#fff; border:none; padding:12px 24px; border-radius:8px; font-weight:bold; cursor:pointer; font-size:15px; transition:all 0.3s ease; display:flex; align-items:center; gap:8px; box-shadow: 0 4px 10px rgba(249, 115, 22, 0.3);">
                    Proceed to Order <i class="fa-solid fa-arrow-right"></i>
                </button>
            </div>
        `;
        container.appendChild(dynamicSummary);
    }

    // সবশেষে টোটাল ক্যালকুলেট আপডেট করা
    updateCartTotal();
}

/* ==========================================================================
   SECTION 4: CART INTERACTIONS (চেক ও ক্যালকুলেশন লজিক)
   ========================================================================== */
window.toggleItemSelection = function(productId) {
    if (customerToken) {
        // লগইন থাকলে ডাটাবেজে আপডেট পাঠানো হবে
        const item = cart.find(i => String(i.id) === String(productId));
        if (item) {
            const checkbox = document.querySelector(`.cart-item-checkbox[data-id="${productId}"]`);
            item.selected = checkbox ? checkbox.checked : !item.selected;
            
            fetch('/api/cart/toggle-selection', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${customerToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ productId, selected: item.selected })
            }).then(() => renderCartDrawerItems());
        }
    } else {
        // গেস্ট ইউজারের জন্য লোকাল স্টোরেজ
        let currentCart = JSON.parse(localStorage.getItem('cart')) || [];
        const item = currentCart.find(i => String(i.id) === String(productId));
        if (item) {
            const checkbox = document.querySelector(`.cart-item-checkbox[data-id="${productId}"]`);
            item.selected = checkbox ? checkbox.checked : !item.selected;
        }
        localStorage.setItem('cart', JSON.stringify(currentCart));
        renderCartDrawerItems();
    }
};

function updateCartTotal() {
    // Drawer & Checkout Page Elements
    const totalSpan = document.getElementById('cartDrawerTotal');
    const itemsCountSpan = document.getElementById('cartSelectedItemsCount');
    const subtotalEl = document.getElementById('cartSubtotalAmount');
    const grandTotalEl = document.getElementById('cartGrandTotalAmount');
    const checkoutRedirectBtn = document.getElementById('proceedToCheckoutBtn');
    const summarySection = document.getElementById('cartSummarySection'); 

    // Profile Page Dynamic Elements (যেগুলো আমরা SECTION 3 তে বানালাম)
    const profileTotalEl = document.getElementById('profileCartTotalAmount');
    const profileCountEl = document.getElementById('profileCartItemsCount');
    const profileBtn = document.getElementById('profileCheckoutBtn');

    let currentCart = customerToken ? cart : (JSON.parse(localStorage.getItem('cart')) || []);
    let checkedItems = currentCart.filter(item => item.selected !== false);
    let uniqueSelectedCount = checkedItems.length;
    let grandTotal = 0;

    checkedItems.forEach(item => {
        grandTotal += item.price * (item.quantity || 1);
    });

    // Drawer Updates
    if (totalSpan) totalSpan.innerText = grandTotal;
    if (itemsCountSpan) itemsCountSpan.innerText = `${uniqueSelectedCount} Items`;
    if (subtotalEl) subtotalEl.innerText = `৳${grandTotal}`;
    if (grandTotalEl) grandTotalEl.innerText = `৳${grandTotal}`;

    // Profile Summary Updates
    if (profileTotalEl) profileTotalEl.innerText = `৳${grandTotal}`;
    if (profileCountEl) profileCountEl.innerText = uniqueSelectedCount;

    // Checkout Button Logic (Drawer)
    if (currentCart.length === 0 || uniqueSelectedCount === 0) {
        if (summarySection) summarySection.style.display = 'none';
        if (checkoutRedirectBtn) {
            checkoutRedirectBtn.disabled = true;
            checkoutRedirectBtn.style.opacity = '0.5';
            checkoutRedirectBtn.onclick = null;
        }
        // Profile Button Disable
        if (profileBtn) {
            profileBtn.disabled = true;
            profileBtn.style.opacity = '0.5';
            profileBtn.style.cursor = 'not-allowed';
            profileBtn.onclick = null;
        }
    } else {
        if (summarySection) summarySection.style.display = 'block';
        
        // Drawer Button Enable
        if (checkoutRedirectBtn) {
            checkoutRedirectBtn.disabled = false;
            checkoutRedirectBtn.style.opacity = '1';
            checkoutRedirectBtn.onclick = function() {
                localStorage.setItem("activeCheckoutSession", "true");
                window.location.href = '/checkout';
            };
        }

        // Profile Button Enable
        if (profileBtn) {
            profileBtn.disabled = false;
            profileBtn.style.opacity = '1';
            profileBtn.style.cursor = 'pointer';
            profileBtn.onclick = function() {
                localStorage.setItem("activeCheckoutSession", "true");
                window.location.href = '/checkout';
            };
        }
    }
}




/* ==========================================================================
   SECTION 5: QUANTITY & DELETE CONTROLS (আপডেটেড উইথ ব্যাকএন্ড সিঙ্ক)
   ========================================================================== */
window.updateQty = function(productId, change) {
    let currentCart = customerToken ? cart : (JSON.parse(localStorage.getItem('cart')) || []);
    const item = currentCart.find(i => String(i.id) === String(productId));

    if (item) {
        // স্টক ভ্যালিডেশন
        if (change > 0) {
            const realProduct = globalProductCatalog.find(p => String(p._id) === String(productId) || String(p.productId) === String(productId) || String(p.id) === String(productId));
            if (realProduct) {
                let availableStock = Number(realProduct.stock || 0);
                if ((item.quantity + change) > availableStock) {
                    alert(`দুঃখিত! আমাদের স্টকে সর্বোচ্চ ${availableStock} টি প্রোডাক্ট এভেইলেবল আছে।`);
                    return;
                }
            }
        }

        const targetQty = item.quantity + change;
        if (targetQty < 1) {
            deleteCartItem(productId);
            return;
        }

        if (customerToken) {
            // 🌟 লগইন থাকলে ডাটাবেজে পরিমাণ আপডেট করা হচ্ছে
            fetch('/api/cart/update-quantity', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${customerToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ productId, quantity: targetQty })
            })
            .then(res => res.json())
            .then(() => {
                item.quantity = targetQty;
                updateCartCount();
                renderCartDrawerItems();
            })
            .catch(err => console.error("Error updating qty in DB:", err));
        } else {
            // গেস্ট ইউজারের জন্য লোকাল স্টোরেজ আপডেট
            item.quantity = targetQty;
            localStorage.setItem('cart', JSON.stringify(currentCart));
            updateCartCount();
            renderCartDrawerItems();
        }
    }
};

window.deleteCartItem = function(productId) {
    if (customerToken) {
        // 🌟 লগইন থাকলে ডাটাবেজ থেকে আইটেম রিমুভ করা হবে
        fetch(`/api/cart/remove/${productId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${customerToken}` }
        })
        .then(() => {
            cart = cart.filter(item => String(item.id) !== String(productId));
            updateCartCount();
            renderCartDrawerItems();
        })
        .catch(err => console.error("Error deleting from DB cart:", err));
    } else {
        // গেস্ট ইউজারের লোকাল স্টোরেজ হ্যান্ডলিং
        let currentCart = JSON.parse(localStorage.getItem('cart')) || [];
        currentCart = currentCart.filter(item => String(item.id) !== String(productId));
        localStorage.setItem('cart', JSON.stringify(currentCart));
        updateCartCount();
        renderCartDrawerItems();
    }

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
   SECTION 7: ADD TO BAG CORE (আপডেটেড উইথ ডাটাবেজ পুশ লজিক)
   ========================================================================== */
window.addToBag = function(productId, productName, productPrice, productImage) {
    let currentCart = customerToken ? cart : (JSON.parse(localStorage.getItem('cart')) || []);
    const existingItem = currentCart.find(item => String(item.id) === String(productId));
    const clickedButton = window.event ? window.event.target.closest('button') : null;

    // স্টক ভ্যালিডেশন
    const realProduct = globalProductCatalog.find(p => String(p._id) === String(productId) || String(p.productId) === String(productId) || String(p.id) === String(productId));
    
    if (realProduct) {
        let availableStock = Number(realProduct.stock || 0);
        let currentQtyInCart = existingItem ? existingItem.quantity : 0;
        let quantityToAdd = currentQtyInCart + 1;

        if (availableStock <= 0) {
            showCardNotification(clickedButton, "Out of stock!", "error");
            return;
        }
        
        if (quantityToAdd > availableStock) {
            showCardNotification(clickedButton, `Stock limit: ${availableStock}`, "warning");
            return;
        }
    }

    // আইকন লজিক তৈরি করা
    const productIcon = productImage && !productImage.includes('.') ? productImage : '📦';

    if (customerToken) {
        // 🌟 লগইন থাকলে সরাসরি ব্যাকএন্ড API এর মাধ্যমে সম্পূর্ণ ডাটা ডাটাবেজে অ্যাড হবে
        fetch('/api/cart/add', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${customerToken}`,
                'Content-Type': 'application/json'
            },
            // ফিক্স: শুধুমাত্র আইডি ও কোয়ান্টিটি নয়, বরং সম্পূর্ণ ডাটা পাঠানো হচ্ছে
            body: JSON.stringify({ 
                productId: productId, 
                quantity: 1,
                name: productName,
                price: Number(productPrice),
                image: productImage || '',
                icon: productIcon
            })
        })
        .then(res => res.json())
        .then(updatedData => {
            if (existingItem) {
                existingItem.quantity += 1;
                showCardNotification(clickedButton, "Quantity increased!", 'success');
            } else {
                triggerFlyAnimation(clickedButton, productImage);
                cart.unshift({
                    id: productId,
                    name: productName,
                    price: Number(productPrice),
                    products: productImage || '', 
                    icon: productIcon,
                    quantity: 1,
                    selected: true 
                });
            }
            updateCartCount();
            renderCartDrawerItems();
        })
        .catch(err => console.error("Error adding to DB cart:", err));

    } else {
        // গেস্ট ইউজারের জন্য লোকাল স্টোরেজ লজিক
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
                icon: productIcon,
                quantity: 1,
                selected: true 
            });
        }

        localStorage.setItem('cart', JSON.stringify(currentCart));
        setTimeout(() => {
            updateCartCount();
            if (!existingItem) {
                showCardNotification(clickedButton, "Added to bag!", 'success');
            }
            renderCartDrawerItems();
        }, 800);
    }
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






