/***************************************************************************
 * Project: EonlineBazar
 * File: js/checkout.js
 * Author: Abdul Karim Sheikh
 * Description: Live Validation, Empty Cart UI & MongoDB Dynamic Order Sync 
 * (Fully Fixed with Hybrid DB Cart & Isolated Buy Now Logic)
 ***************************************************************************/

/* =========================================================================
   ১. গ্লোবাল ভেরিয়েবল ও ইনিশিয়ালাইজেশন
   ========================================================================= */
let globalProductCatalog = [];
let cart = []; // 🌟 ডাটাবেজ কার্ট স্টোর করার জন্য গ্লোবাল ভেরিয়েবল

// 🌟 টোকেন চেক (কাস্টমার লগইন আছে কি না জানার জন্য)
const customerToken = localStorage.getItem('token') || localStorage.getItem('customerToken');

let validationState = {
    name: false,
    mobile: false,
    address: false
};

document.addEventListener('DOMContentLoaded', () => {
    // লাইভ এপিআই থেকে প্রোডাক্ট ক্যাটালগ লোড করা
    fetch('/api/products')
        .then(res => res.json())
        .then(data => {
            globalProductCatalog = data;
            fetchCartData(); // ক্যাটালগ লোড হওয়ার পর কার্ট লোড করবে
        })
        .catch(err => { 
            console.error("Catalog load error:", err); 
            fetchCartData(); 
        });

    initLiveValidationEngine();
    
    const proceedBtn = document.getElementById('proceedToPaymentBtn');
    if (proceedBtn) proceedBtn.addEventListener('click', handleProceedToPayment);
});

/* =========================================================================
   ২. কোর লজিক: চেকআউট আইটেম ফিল্টার (Buy Now vs Cart)
   ========================================================================= */
function getCheckoutItems() {
    const isBuyNow = localStorage.getItem('isBuyNowMode') === 'true';
    
    if (isBuyNow) {
        // Buy Now মোড হলে কার্টের কোনো আইটেম দেখাবে না, শুধু Buy Now আইটেম দেখাবে
        return JSON.parse(localStorage.getItem('buy_now_item')) || [];
    } else {
        // সাধারণ কার্ট থেকে আসলে শুধুমাত্র সিলেক্টেড আইটেম দেখাবে
        let currentCart = customerToken ? cart : (JSON.parse(localStorage.getItem('cart')) || []);
        return currentCart.filter(item => item.selected !== false);
    }
}

/* =========================================================================
   ৩. ডাটাবেজ বা লোকাল স্টোরেজ থেকে কার্ট ডাটা নিয়ে আসা
   ========================================================================= */
function fetchCartData() {
    if (customerToken) {
        // লগইন থাকলে ডাটাবেজ থেকে কার্ট আনবে
        fetch('/api/cart', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${customerToken}` }
        })
        .then(res => res.json())
        .then(dbCartItems => {
            cart = dbCartItems.map(item => ({
                id: item.productId,
                name: item.name,
                price: Number(item.price),
                products: item.image || '',
                icon: item.icon || '📦',
                quantity: item.quantity,
                selected: item.selected !== false
            }));
            renderCheckoutCart();
        })
        .catch(err => {
            console.error("Error fetching live DB cart for checkout:", err);
            renderCheckoutCart();
        });
    } else {
        // গেস্ট ইউজারের জন্য রেন্ডার কল (getCheckoutItems লোকাল থেকে ডাটা নেবে)
        renderCheckoutCart();
    }
}

/* =========================================================================
   🛍️ ৪. কার্ট রেন্ডারিং ইঞ্জিন ও Empty Cart UI
   ========================================================================= */
function renderCheckoutCart() {
    const container = document.getElementById('checkoutItemsContainer');
    const template = document.getElementById('cartItemTemplate');
    const subtotalText = document.getElementById('checkoutSubtotal');
    const grandTotalText = document.getElementById('checkoutGrandTotal');
    const totalItemsCountText = document.getElementById('totalItemsCount'); 
    const proceedBtn = document.getElementById('proceedToPaymentBtn');
    
    const shippingSection = document.getElementById('shippingFormSection'); 
    const orderSummarySection = document.getElementById('orderSummarySection');
    
    // 🌟 সেন্ট্রাল ফাংশন থেকে আইটেম লোড করা হচ্ছে (Buy Now বা Cart অনুযায়ী)
    let checkedItems = getCheckoutItems();
    
    if (!container) return;
    container.innerHTML = '';
    
    if (totalItemsCountText) {
        totalItemsCountText.innerText = `${checkedItems.length} Items`;
    }
    
    // যদি চেকআউটে কোনো প্রোডাক্ট না থাকে
    if (checkedItems.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:50px 20px; background:#fff; border-radius:12px;">
                <div style="font-size:48px; margin-bottom:15px;">🛒</div>
                <h3 style="color:#334155; font-size:20px; margin-bottom:8px;">Your Cart is Empty</h3>
                <p style="color:#64748b; font-size:14px; margin-bottom:24px;">Please add some products from the shop to proceed.</p>
                <a href="/" style="background:var(--primary-color, #f97316); color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600; display:inline-block; transition:0.3s;">Browse Products</a>
            </div>
        `;
        
        if (subtotalText) subtotalText.innerText = `৳0`;
        if (grandTotalText) grandTotalText.innerText = `৳0`;
        if (proceedBtn) proceedBtn.style.display = 'none'; 
        if (shippingSection) shippingSection.style.display = 'none';
        if (orderSummarySection) orderSummarySection.style.display = 'none';
        
        return;
    } else {
        if (proceedBtn) proceedBtn.style.display = 'block'; 
        if (shippingSection) shippingSection.style.display = 'block';
        if (orderSummarySection) orderSummarySection.style.display = 'block';
    }

    let calculatedTotal = 0;
    if (!template) return;

    checkedItems.forEach(item => {
        let cleanPrice = parseFloat(item.price) || 0;
        let cleanQty = parseInt(item.quantity) || 1;
        calculatedTotal += (cleanPrice * cleanQty);

        const clone = template.content.cloneNode(true);
        const mediaFrame = clone.querySelector('.cart-media-frame-box');
        
        let realProduct = globalProductCatalog.find(p => String(p._id) === String(item.id) || String(p.productId) === String(item.id) || String(p.id) === String(item.id));
        
        let displayEmoji = (realProduct && realProduct.icon) ? realProduct.icon.trim() : (item.icon || "📦");
        let imageFile = (realProduct && realProduct.image) ? realProduct.image.trim() : ((realProduct && realProduct.products) ? realProduct.products.trim() : (item.products || item.image || ''));

        if (imageFile !== '') {
            let lowerPath = imageFile.toLowerCase();
            if (lowerPath.includes('.jpg') || lowerPath.includes('.png') || lowerPath.includes('.jpeg') || lowerPath.includes('.webp')) {
                let imagePath = imageFile;
                if (!imagePath.startsWith('/') && !imagePath.startsWith('http') && !imagePath.startsWith('products/')) {
                    imagePath = '/products/' + imagePath;
                } else if (imagePath.startsWith('products/')) {
                    imagePath = '/' + imagePath;
                }
                
                mediaFrame.innerHTML = `
                    <img src="${imagePath}" alt="${item.name}" 
                         style="width:100%; height:100%; object-fit:cover; border-radius:4px;"
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <span style="font-size:24px; display:none; justify-content:center; align-items:center; width:100%; height:100%;">${displayEmoji}</span>
                `;
            } else {
                mediaFrame.innerHTML = `<span style="font-size:24px; display:flex; justify-content:center; align-items:center; width:100%; height:100%; background:#f9f9f9; border-radius:4px;">${displayEmoji}</span>`;
            }
        } else {
            mediaFrame.innerHTML = `<span style="font-size:24px; display:flex; justify-content:center; align-items:center; width:100%; height:100%; background:#f9f9f9; border-radius:4px;">${displayEmoji}</span>`;
        }
        
        clone.querySelector('.cart-item-name-text').innerText = item.name;
        clone.querySelector('.cart-item-base-price-text').innerText = `৳${cleanPrice}`;
        clone.querySelector('.cart-item-total').innerText = `৳${(cleanPrice * cleanQty)}`;
        clone.querySelector('.qty-text').innerText = cleanQty;

        clone.querySelector('.btn-minus').onclick = () => changeItemQuantity(item.id, -1);
        clone.querySelector('.btn-plus').onclick = () => changeItemQuantity(item.id, 1);
        clone.querySelector('.checkout-row-delete-btn-main').onclick = () => temporarilyRemoveFromCheckout(item.id);

        container.appendChild(clone);
    });

    if (subtotalText) subtotalText.innerText = `৳${calculatedTotal}`;
    if (grandTotalText) grandTotalText.innerText = `৳${calculatedTotal}`;
}

/* =========================================================================
   ⚡ ৫. কোর কার্ট অ্যাকশন লজিক (Quantity & Remove) - Buy Now আইসোলেটেড
   ========================================================================= */
function changeItemQuantity(productId, amount) {
    const isBuyNow = localStorage.getItem('isBuyNowMode') === 'true';

    // 🌟 যদি Buy Now মোড হয়, তবে শুধু buy_now_item আপডেট করবে, মেইন কার্টে হাত দেবে না
    if (isBuyNow) {
        let bnCart = JSON.parse(localStorage.getItem('buy_now_item')) || [];
        const item = bnCart.find(i => String(i.id) === String(productId));
        if (item) {
            const targetQty = (parseInt(item.quantity) || 1) + amount;
            if (targetQty < 1) { 
                temporarilyRemoveFromCheckout(productId); 
                return; 
            }
            item.quantity = targetQty;
            localStorage.setItem('buy_now_item', JSON.stringify(bnCart));
            renderCheckoutCart();
        }
        return; 
    }

    // 🌟 সাধারণ কার্টের লজিক (আগের মতো)
    let currentCart = customerToken ? cart : (JSON.parse(localStorage.getItem('cart')) || []);
    const item = currentCart.find(i => String(i.id) === String(productId));
    
    if (item) {
        const targetQty = (parseInt(item.quantity) || 1) + amount;
        
        if (targetQty < 1) { 
            temporarilyRemoveFromCheckout(productId); 
            return; 
        }

        if (customerToken) {
            fetch('/api/cart/update-quantity', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${customerToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ productId, quantity: targetQty })
            }).then(() => {
                item.quantity = targetQty;
                renderCheckoutCart();
            }).catch(err => console.error("Error updating quantity in checkout:", err));
        } else {
            item.quantity = targetQty;
            localStorage.setItem('cart', JSON.stringify(currentCart));
            renderCheckoutCart();
        }
    }
}

function temporarilyRemoveFromCheckout(productId) {
    const isBuyNow = localStorage.getItem('isBuyNowMode') === 'true';

    // 🌟 যদি Buy Now মোড হয়, তবে শুধু buy_now_item থেকে ডিলিট করবে
    if (isBuyNow) {
        let bnCart = JSON.parse(localStorage.getItem('buy_now_item')) || [];
        bnCart = bnCart.filter(i => String(i.id) !== String(productId));
        localStorage.setItem('buy_now_item', JSON.stringify(bnCart));
        
        if (bnCart.length === 0) {
            localStorage.removeItem('isBuyNowMode'); // আইটেম না থাকলে মোড অফ
        }
        renderCheckoutCart();
        return;
    }

    // 🌟 সাধারণ কার্টের লজিক (আগের মতো)
    let currentCart = customerToken ? cart : (JSON.parse(localStorage.getItem('cart')) || []);
    const item = currentCart.find(i => String(i.id) === String(productId));
    
    if (item) {
        if (customerToken) {
            fetch('/api/cart/toggle-selection', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${customerToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ productId, selected: false })
            }).then(() => {
                item.selected = false;
                renderCheckoutCart();
            }).catch(err => console.error("Error toggling selection in checkout:", err));
        } else {
            item.selected = false;
            localStorage.setItem('cart', JSON.stringify(currentCart));
            renderCheckoutCart();
        }
    }
}

/* =========================================================================
   💳 ৬. পেমেন্ট সাবমিশন লজিক
   ========================================================================= */
function handleProceedToPayment() {
    // পেমেন্টের আগে হাইব্রিড কার্ট চেক (সেন্ট্রাল ফাংশন দিয়ে)
    const checkedItems = getCheckoutItems();

    if (checkedItems.length === 0) {
        openCheckoutAlertModal("Your cart is empty! Please add products.");
        return;
    }

    let errorMessages = [];
    
    if (!validationState.name) {
        errorMessages.push("⚠️ Please enter your Full Name correctly (at least 2 words).");
    }
    if (!validationState.mobile) {
        errorMessages.push("⚠️ Please enter a valid 11-digit Mobile Number.");
    }
    if (!validationState.address) {
        errorMessages.push("⚠️ Please enter your complete Delivery Address (at least 3 words).");
    }

    if (errorMessages.length > 0) {
        const finalMessage = errorMessages.join("\n\n"); 
        openCheckoutAlertModal(finalMessage);
        return;
    }

    const nameVal = document.getElementById('shippingFullName').value.trim();
    const mobileVal = document.getElementById('shippingMobile').value.trim();
    const addressVal = document.getElementById('shippingAddress').value.trim();
    const noteVal = document.getElementById('shippingCourierNote')?.value.trim() || "";

    let totalAmount = checkedItems.reduce((sum, item) => sum + (parseFloat(item.price) * parseInt(item.quantity)), 0);

    const checkoutOrderSession = {
        orderId: `EOB${Math.floor(100000 + Math.random() * 900000)}`, 
        customerName: nameVal,
        customerPhone: mobileVal,
        customerAddress: addressVal,
        totalAmount: totalAmount,
        status: "Pending",
        items: checkedItems,
        note: noteVal
    };

    localStorage.setItem('activeCheckoutSession', JSON.stringify(checkoutOrderSession));
    
    window.location.href = '/payment';
}

function openCheckoutAlertModal(msg) {
    const modal = document.getElementById('checkoutAlertModal');
    if (modal) {
        modal.querySelector('.custom-alert-modal-message').innerText = msg;
        modal.style.display = 'flex';
    } else { alert(msg); }
}

function closeCheckoutAlertModal() {
    const modal = document.getElementById('checkoutAlertModal');
    if(modal) modal.style.display = 'none';
}

/* =========================================================================
   🛡️ ৭. লাইভ ভ্যালিডেশন ইঞ্জিন (প্রোফাইল অটো-ফিল ইন্টিগ্রেশনসহ)
   ========================================================================= */
function updateFieldUI(input, errorEl, isValid, currentCount, max) {
    if (!input || !errorEl) return;
    let wrapper = input.parentElement; 

    let iconCounterWrapper = wrapper.querySelector('.icon-counter-wrapper');
    if (!iconCounterWrapper) {
        iconCounterWrapper = document.createElement('div');
        iconCounterWrapper.className = 'icon-counter-wrapper';
        wrapper.appendChild(iconCounterWrapper);
    }

    let counterText = max ? `${currentCount}/${max}` : `${currentCount}`;
    
    if (input.value.trim() === "") {
        input.style.borderColor = "#cbd5e1";
        input.style.backgroundColor = "#ffffff";
        errorEl.innerText = "";
        iconCounterWrapper.innerHTML = "";
    } else if (isValid) {
        input.style.borderColor = "#10b981";
        input.style.backgroundColor = "#f0fdf4";
        errorEl.innerText = "";
        iconCounterWrapper.innerHTML = `<span style="font-size:12px; color:#64748b;">${counterText}</span> <i class="fa-solid fa-check-circle" style="color:#10b981;"></i>`;
    } else {
        input.style.borderColor = "#ef4444";
        input.style.backgroundColor = "#fef2f2";
        errorEl.innerText = ""; 
        iconCounterWrapper.innerHTML = `<span style="font-size:12px; color:#ef4444;">${counterText}</span>`;
    }
}

function detectSpamPattern(text) {
    return /([a-z\u0980-\u09ff])\1{2,}/i.test(text);
}

function initLiveValidationEngine() {
    const fields = [
        { id: 'shippingFullName', errorId: 'name-error', max: 50 },
        { id: 'shippingMobile', errorId: 'mobile-error', max: 11 },
        { id: 'shippingAddress', errorId: 'address-error', max: 120 },
        { id: 'shippingCourierNote', errorId: 'note-error', max: 0 }
    ];

    fields.forEach(field => {
        const input = document.getElementById(field.id);
        const errorEl = document.getElementById(field.errorId);
        if (!input) return;

        if (field.max > 0) input.setAttribute('maxlength', field.max);

        let savedValue = localStorage.getItem(field.id);
        
        if (!savedValue) {
            if (field.id === 'shippingFullName') savedValue = localStorage.getItem('checkout_name');
            if (field.id === 'shippingMobile') savedValue = localStorage.getItem('checkout_phone');
            if (field.id === 'shippingAddress') savedValue = localStorage.getItem('checkout_address');
        }

        if (savedValue) {
            input.value = savedValue;
            setTimeout(() => input.dispatchEvent(new Event('input')), 50);
        }

        input.addEventListener('input', () => {
            localStorage.setItem(field.id, input.value);
            let val = input.value.trim();
            let len = val.length;
            let wordsCount = val.split(/\s+/).filter(word => word.length > 0).length;
            let isOk = false;

            if (field.id === 'shippingFullName') {
                isOk = len >= 3 && wordsCount >= 2 && !detectSpamPattern(val);
                validationState.name = isOk;
            }
            else if (field.id === 'shippingMobile') {
                input.value = input.value.replace(/\D/g, ''); 
                isOk = /^01[3-9]\d{8}$/.test(input.value); 
                validationState.mobile = isOk;
            }
            else if (field.id === 'shippingAddress') {
                isOk = len >= 10 && wordsCount >= 3 && !detectSpamPattern(val);
                validationState.address = isOk;
            }
            else if (field.id === 'shippingCourierNote') {
                isOk = true; 
            }

            updateFieldUI(input, errorEl, isOk, len, field.max > 0 ? field.max : null);
        });
    });
}





