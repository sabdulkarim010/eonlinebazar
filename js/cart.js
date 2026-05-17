/**
 * Project: eOnlineBazar
 * Author: Abdul Karim Sheikh
 * File: js/cart.js
 * Description: Fully English Version. Complete Shopping Cart Logic with 
 * Serial Numbers, Product Images, Quantity Controls, and Item Selection Checkmarks.
 */

// ১. পেজ লোড বা স্টোরেজ থেকে কার্ট ডাটা রিড করা
let cart = JSON.parse(localStorage.getItem('cart')) || [];

// --- ২. টগল সাইড কার্ট ড্রয়ার (ওপেন/ক্লোজ) ---
window.toggleCartDrawer = function() {
    const drawer = document.getElementById('cartDrawer');
    const overlay = document.getElementById('cartOverlay');
    if (!drawer || !overlay) return;

    drawer.classList.toggle('open');
    overlay.classList.toggle('show');

    // ড্রয়ার ওপেন হলে আইটেম রেন্ডার হবে
    if (drawer.classList.contains('open')) {
        renderCartDrawerItems();
    }
};

// --- ৩. নেভবার ব্যাজ কাউন্ট লাইভ আপডেট ---
function updateCartCount() {
    const cartCountBadge = document.getElementById('cartCountBadge') || document.querySelector('.Bag span');
    const drawerCount = document.getElementById('cartDrawerCount');
    let currentCart = JSON.parse(localStorage.getItem('cart')) || [];

    const count = currentCart.length;
    if (cartCountBadge) cartCountBadge.innerText = count;
    if (drawerCount) drawerCount.innerText = count;
}

// ==========================================================================
// --- ৪. রেন্ডার কার্ট আইটেমস (ড্রয়ার এবং cart.html মেইন পেজ উভয়ের জন্য সম্পূর্ণ ফিক্সড সেকশন) ---
// ==========================================================================
function renderCartDrawerItems() {
    const drawerContainer = document.getElementById('cartDrawerItems');
    const pageContainer = document.getElementById('cartItemsContainer') || document.getElementById('checkoutItemsContainer');
    const cartFooter = document.getElementById('cartDrawerFooter');
    
    const container = drawerContainer || pageContainer;
    if (!container) return;

    let currentCart = JSON.parse(localStorage.getItem('cart')) || [];
    container.innerHTML = '';

    // 🎯 কন্ডিশন ১: কার্ট সম্পূর্ণ খালি থাকলে (Empty State)
    if (currentCart.length === 0) {
        container.innerHTML = `
            <div class="empty-cart-container" style="text-align:center; padding:60px 20px; color:#777; width:100%;">
                <i class="fa fa-shopping-bag" style="font-size:48px; color:#bbb; margin-bottom:15px; display:block;"></i>
                <span style="font-size:16px; font-weight:600; color:#333; display:block; margin-bottom:5px;">Your shopping bag is empty!</span>
                <span style="font-size:13px; color:#888;">Please add some products to your cart.</span>
            </div>
        `;
        
        if (cartFooter) cartFooter.style.display = 'none';
        updateCartTotal();
        return;
    }

    // 🎯 কন্ডিশন ২: ড্রয়ার ফুটার থাকলে তা ডিসপ্লে করা
    if (cartFooter) {
        cartFooter.style.display = 'block';
    }

    // 🎯 ৩. কার্টের আইটেমগুলো লুপের সাহায্যে স্ক্রিনে রেন্ডার করা
    currentCart.forEach((item, index) => {
        
        // 🌟 ইমোজি বনাম ইমেজ নিখুঁত হ্যান্ডেল লজিক (আপনার product.json এবং ফোল্ডার পাথ ফিক্স)
        let mediaHTML = `📦`;
        let imageFile = item.products || item.image || item.icon;

        // ডেটা যদি কোনো বৈধ ছবির ফাইল ফরম্যাট নির্দেশ করে (.jpg, .png, etc.)
        if (imageFile && typeof imageFile === 'string' && (imageFile.endsWith('.jpg') || imageFile.endsWith('.png') || imageFile.endsWith('.jpeg') || imageFile.endsWith('.webp'))) {
            
            // রুট পাথ ফিক্সিং: যদি ডেটাতে আগে থেকেই products/ বা images/ যুক্ত না থাকে
            let imagePath = "";
            if (imageFile.startsWith('products/') || imageFile.startsWith('images/')) {
                imagePath = imageFile;
            } else {
                imagePath = 'products/' + imageFile; // আপনার প্রজেক্টের রুট ফোল্ডার 'products/' অনুযায়ী
            }
            
            // ইমেজ ট্যাগ জেনারেট (ভুল পাথ রিডাইরেকশন বা ফেভিকন লিংক সম্পূর্ণ বাদ)
            mediaHTML = `<img src="${imagePath}" alt="${item.name}">`;
            
        } else {
            // যদি ছবি না হয়ে ডিরেক্ট ইমোজি বা আইকন টেক্সট হয়, তবে অরিজিনাল ইমোজি ফুটিয়ে তুলবে
            let emojiIcon = item.icon || (item.products && !item.products.includes('.') ? item.products : "📦");
            mediaHTML = `<span class="product-emoji-icon" style="font-size: 26px;">${emojiIcon}</span>`;
        }

        const isChecked = item.selected !== false ? 'checked' : '';
        const quantity = item.quantity || 1;
        const itemTotal = item.price * quantity; 
        
        const row = document.createElement('div');
        
        // ক) ড্রয়ার বা সাইড মিনি কার্ট লেআউট
        if (drawerContainer) {
            row.className = 'cart-item-row'; 
            row.innerHTML = `
                <div style="display:flex; align-items:center; gap:6px;">
                    <span class="cart-item-serial">#${index + 1}</span>
                    <input type="checkbox" class="cart-item-checkbox" data-id="${item.id}" ${isChecked} onchange="toggleItemSelection(${item.id})">
                </div>
                <div class="cart-item-media">${mediaHTML}</div>
                <div class="cart-item-info">
                    <div class="cart-item-name" title="${item.name}">${item.name}</div>
                    <div class="cart-item-price">৳${item.price}</div>
                </div>
                <div class="cart-item-qty-box">
                    <button class="qty-btn" onclick="updateQty(${item.id}, -1)">-</button>
                    <span class="qty-val">${quantity}</span>
                    <button class="qty-btn" onclick="updateQty(${item.id}, 1)">+</button>
                </div>
                <button class="cart-delete-btn" onclick="deleteCartItem(${item.id})">
                    <i class="fa fa-trash"></i>
                </button>
            `;
        } else {
            // খ) cart.html ফ্রেশ পেজের রেসপনসিভ ও প্রফেশনাল লেআউট
            row.className = `cart-item-card ${item.selected === false ? 'is-unchecked' : ''}`;
            row.innerHTML = `
                <div class="cart-item-left-group">
                    <input type="checkbox" class="cart-item-checkbox" data-id="${item.id}" ${isChecked} onchange="toggleItemSelection(${item.id})">
                    <div class="cart-item-media-box">
                        ${mediaHTML}
                    </div>
                    <div class="cart-item-info-box">
                        <span class="product-title-text">${item.name}</span>
                        <span class="product-unit-price">৳${item.price}</span>
                    </div>
                </div>
                
                <div class="cart-item-right-group">
                    <div class="cart-quantity-controller">
                        <button class="qty-control-btn" onclick="updateQty(${item.id}, -1)"><i class="fa-solid fa-minus"></i></button>
                        <div class="qty-display-number">${quantity}</div>
                        <button class="qty-control-btn" onclick="updateQty(${item.id}, 1)"><i class="fa-solid fa-plus"></i></button>
                    </div>
                    <div class="cart-item-total-price">৳${itemTotal}</div>
                    <button class="cart-item-trash-btn" onclick="deleteCartItem(${item.id})" title="Remove Product">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            `;
        }
        container.appendChild(row);
    });

    // সাবটোটাল ও গ্র্যান্ড টোটাল হিসাব আপডেট করা
    updateCartTotal();
}

// --- ৫. চেকবক্সের স্টেট লোকাল স্টোরেজে সেভ করা ---
window.toggleItemSelection = function(productId) {
    let currentCart = JSON.parse(localStorage.getItem('cart')) || [];
    const item = currentCart.find(i => i.id === productId);
    
    if (item) {
        const checkbox = document.querySelector(`.cart-item-checkbox[data-id="${productId}"]`);
        if (checkbox) {
            item.selected = checkbox.checked;
        } else {
            item.selected = !item.selected;
        }
    }
    
    localStorage.setItem('cart', JSON.stringify(currentCart));
    renderCartDrawerItems();
};

// --- ৬. সিলেক্ট করা আইটেমের লাইভ টোটাল হিসাব এবং চেকআউট বাটন লক লজিক ---
function updateCartTotal() {
    const totalSpan = document.getElementById('cartDrawerTotal');
    const itemsCountSpan = document.getElementById('cartSelectedItemsCount');
    const subtotalEl = document.getElementById('cartSubtotalAmount');
    const grandTotalEl = document.getElementById('cartGrandTotalAmount');
    const checkoutRedirectBtn = document.getElementById('proceedToCheckoutBtn');
    
    let currentCart = JSON.parse(localStorage.getItem('cart')) || [];
    let grandTotal = 0;
    let selectedCount = 0;

    currentCart.forEach(item => {
        if (item.selected !== false) {
            selectedCount += (item.quantity || 1);
            grandTotal += item.price * (item.quantity || 1);
        }
    });

    // ড্রয়ারের টোটাল আপডেট
    if (totalSpan) totalSpan.innerText = grandTotal;
    
    // cart.html ফুল পেজের সাবটোটাল, আইটেম কাউন্ট ও গ্র্যান্ড টোটাল আপডেট
    if (itemsCountSpan) itemsCountSpan.innerText = `${selectedCount} Items`;
    if (subtotalEl) subtotalEl.innerText = `৳${grandTotal}`;
    if (grandTotalEl) grandTotalEl.innerText = `৳${grandTotal}`;

    // ⚡ প্রফেশনাল বাটন অ্যাক্টিভেশন লজিক (গেঁয়ো অ্যালার্ট ছাড়া অটো-লক সিস্টেম)
    if (checkoutRedirectBtn) {
        if (selectedCount > 0) {
            checkoutRedirectBtn.disabled = false;
            checkoutRedirectBtn.onclick = function() {
                localStorage.setItem("activeCheckoutSession", "true");
                window.location.href = 'checkout.html';
            };
        } else {
            checkoutRedirectBtn.disabled = true;
            checkoutRedirectBtn.onclick = null;
        }
    }
}

// --- 🎯 ৭. লাইভ কোয়ান্টিটি প্লাস/মাইনাস কন্ট্রোল ---
window.updateQty = function(productId, change) {
    let currentCart = JSON.parse(localStorage.getItem('cart')) || [];
    const item = currentCart.find(i => i.id === productId);

    if (item) {
        item.quantity = (item.quantity || 1) + change;
        
        // কোয়ান্টিটি ১ এর নিচে নামলে আইটেম রিমুভ হবে
        if (item.quantity < 1) {
            deleteCartItem(productId);
            return;
        }
    }

    localStorage.setItem('cart', JSON.stringify(currentCart));
    updateCartCount();
    renderCartDrawerItems();
};

// --- 🎯 ৮. আইটেম ডিলিট করার প্রফেশনাল লজিক ---
window.deleteCartItem = function(productId) {
    let currentCart = JSON.parse(localStorage.getItem('cart')) || [];
    currentCart = currentCart.filter(item => item.id !== productId);

    localStorage.setItem('cart', JSON.stringify(currentCart));
    updateCartCount();
    renderCartDrawerItems();

    const btn = window.event ? window.event.target.closest('button') : null;
    if (btn && typeof showCardNotification === 'function') {
        showCardNotification(btn, "Item removed!", "warning");
    }
};

// --- ৯. কার্ডের ভেতরের টোস্ট নোটিফিকেশন ---
function showCardNotification(clickedButton, message, type = 'success') {
    if (!clickedButton) return;
    const productCard = clickedButton.closest('.product-card');
    if (!productCard) return;

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

// --- ১০. ইমেজ বা ইমোজি পজিশন থেকে চমৎকার ফ্লাইং অ্যানিমেশন ---
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
        finalAssetHTML = `<div class="emoji-fly" style="font-size:40px;">${liveEmoji.innerText}</div>`;
        targetVisualElement = liveEmoji;
    }

    if (!finalAssetHTML) {
        if (assetData && (assetData.endsWith('.jpg') || assetData.endsWith('.png') || assetData.endsWith('.jpeg') || assetData.endsWith('.webp'))) {
            let imagePath = assetData.startsWith('products/') || assetData.startsWith('images/') ? assetData : 'images/products/' + assetData;
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

// --- ১১. কোর অ্যাড টু ব্যাগ / কার্ট ফাংশন ---
window.addToBag = function(productId, productName, productPrice, productImage) {
    let currentCart = JSON.parse(localStorage.getItem('cart')) || [];
    const existingItem = currentCart.find(item => item.id === productId);
    const clickedButton = window.event ? window.event.target.closest('button') : null;

    if (existingItem) {
        existingItem.quantity = (existingItem.quantity || 1) + 1;
        showCardNotification(clickedButton, "Quantity increased!", 'success');
    } else {
        triggerFlyAnimation(clickedButton, productImage);

        currentCart.push({
            id: productId,
            name: productName,
            price: Number(productPrice),
            products: productImage || '📦', 
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

// গ্লোবাল রাউটিং এক্সপোজ
window.updateCartCount = updateCartCount;
window.renderCartDrawerItems = renderCartDrawerItems;

// পেজ লোড বা রেন্ডার সিঙ্ক
document.addEventListener('DOMContentLoaded', () => {
    updateCartCount();
    renderCartDrawerItems();
});