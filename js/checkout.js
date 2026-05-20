/**
 * Project: eOnlineBazar
 * Author: Abdul Karim Sheikh
 * File: js/checkout.js
 * Description: Advanced Checkout Logic - Temporary selection removal (No Cart Deletion),
 * Professional Name/Contact Rules, Courier Note reader, and Payment Page integration.
 * Updates: Integrated Custom Professional Modal Alert (No Browser Popups).
 */

let globalProductCatalog = [];

document.addEventListener('DOMContentLoaded', () => {
    // ১. ক্যাটালগ ডাটা লোড করা
    fetch('product.json')
        .then(res => res.json())
        .then(data => {
            globalProductCatalog = data;
            if (document.getElementById('checkoutItemsContainer')) {
                renderCheckoutCart();
            }
        })
        .catch(err => {
            console.error("Catalog load error:", err);
            renderCheckoutCart();
        });

    initLiveValidationEngine();
    
    const proceedBtn = document.getElementById('proceedToPaymentBtn');
    if (proceedBtn) proceedBtn.addEventListener('click', handleProceedToPayment);

    const alertModal = document.getElementById('checkoutAlertModal');
    if (alertModal) {
        alertModal.addEventListener('click', function(event) {
            if (event.target === this) closeCheckoutAlertModal();
        });
    }
});

/* =========================================================================
   🛍️ ১. কার্ট রেন্ডারিং ইঞ্জিন (ফিক্সড ইমোজি ও ইমেজ লজিক)
   ========================================================================= */
function renderCheckoutCart() {
    const container = document.getElementById('checkoutItemsContainer');
    const template = document.getElementById('cartItemTemplate');
    const subtotalText = document.getElementById('checkoutSubtotal');
    const grandTotalText = document.getElementById('checkoutGrandTotal');
    const itemsCountText = document.getElementById('totalItemsCount');
    
    let currentCart = JSON.parse(localStorage.getItem('cart')) || [];
    if (!container || !template) return;
    container.innerHTML = '';

    let checkedItems = currentCart.filter(item => item.selected !== false);

    if (checkedItems.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:40px;">No items selected for checkout!</div>`;
        return;
    }

    let calculatedTotal = 0;
    let calculatedQty = 0;

    checkedItems.forEach(item => {
        let cleanPrice = parseFloat(item.price) || 0;
        let cleanQty = parseInt(item.quantity) || 1;
        calculatedTotal += (cleanPrice * cleanQty);
        calculatedQty += cleanQty;

        const clone = template.content.cloneNode(true);
        const mediaFrame = clone.querySelector('.cart-media-frame-box');
        
        // সিঙ্ক লজিক
        let realProduct = globalProductCatalog.find(p => String(p.id) === String(item.id));
        let displayEmoji = (realProduct && realProduct.icon) ? realProduct.icon : (item.icon || "📦");
        let imageFile = item.products || item.image || item.icon;

        let mediaHTML = "";
        if (imageFile && typeof imageFile === 'string' && /\.(jpg|jpeg|png|webp|gif)$/i.test(imageFile)) {
            let imagePath = imageFile.startsWith('http') ? imageFile : (imageFile.startsWith('products/') ? imageFile : 'products/' + imageFile);
            mediaHTML = `
                <img src="${imagePath}" alt="${item.name}" style="width:100%; height:100%; object-fit:cover; border-radius:4px;" 
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <span style="font-size:24px; display:none; align-items:center; justify-content:center; width:100%; height:100%;">${displayEmoji}</span>
            `;
        } else {
            mediaHTML = `<span style="font-size:24px; display:flex; align-items:center; justify-content:center; width:100%; height:100%;">${displayEmoji}</span>`;
        }

        mediaFrame.innerHTML = mediaHTML;
        clone.querySelector('.cart-item-name-text').innerText = item.name;
        clone.querySelector('.cart-item-base-price-text').innerText = `৳${cleanPrice}`;
        clone.querySelector('.cart-item-total').innerText = `৳${(cleanPrice * cleanQty)}`;
        clone.querySelector('.qty-text').innerText = cleanQty;

        clone.querySelector('.btn-minus').onclick = (e) => { e.preventDefault(); changeItemQuantity(item.id, -1); };
        clone.querySelector('.btn-plus').onclick = (e) => { e.preventDefault(); changeItemQuantity(item.id, 1); };
        clone.querySelector('.checkout-row-delete-btn-main').onclick = (e) => { e.preventDefault(); temporarilyRemoveFromCheckout(item.id); };

        container.appendChild(clone);
    });

    if (subtotalText) subtotalText.innerText = `৳${calculatedTotal}`;
    if (grandTotalText) grandTotalText.innerText = `৳${calculatedTotal}`;
    if (itemsCountText) itemsCountText.innerText = `${calculatedQty} Item(s)`;
}

/* =========================================================================
   ⚡ ২. কোর কার্ট অ্যাকশন লজিক
   ========================================================================= */
function changeItemQuantity(productId, amount) {
    let currentCart = JSON.parse(localStorage.getItem('cart')) || [];
    const item = currentCart.find(i => i.id === productId);
    if (item) {
        item.quantity = (parseInt(item.quantity) || 1) + amount;
        if (item.quantity < 1) { temporarilyRemoveFromCheckout(productId); return; }
    }
    localStorage.setItem('cart', JSON.stringify(currentCart));
    renderCheckoutCart();
}

function temporarilyRemoveFromCheckout(productId) {
    let currentCart = JSON.parse(localStorage.getItem('cart')) || [];
    const item = currentCart.find(i => i.id === productId);
    if (item) item.selected = false;
    localStorage.setItem('cart', JSON.stringify(currentCart));
    renderCheckoutCart();
}

/* =========================================================================
   🛡️ ৩. ভ্যালিডেশন ইঞ্জিন
   ========================================================================= */
function updateFieldUI(input, errorEl, isValid, message) {
    if (!input || !errorEl) return;
    if (input.value.trim() === "") {
        input.style.borderColor = "#cbd5e1";
        errorEl.innerText = "";
    } else if (isValid) {
        input.style.borderColor = "#10b981";
        errorEl.innerText = "";
    } else {
        input.style.borderColor = "#ef4444";
        errorEl.innerText = message;
    }
}

function detectSpamPattern(text) {
    return /([a-z\u0980-\u09ff])\1\1/.test(text.trim().toLowerCase());
}

function initLiveValidationEngine() {
    const nameInput = document.getElementById('shippingFullName');
    const mobileInput = document.getElementById('shippingMobile');
    const addressInput = document.getElementById('shippingAddress');

    if (nameInput) nameInput.addEventListener('input', () => {
        const val = nameInput.value.trim();
        const isOk = val.length >= 3 && val.split(/\s+/).length >= 2 && !detectSpamPattern(val);
        updateFieldUI(nameInput, document.getElementById('name-error'), isOk, "Invalid name format.");
    });

    if (mobileInput) mobileInput.addEventListener('input', () => {
        mobileInput.value = mobileInput.value.replace(/\D/g, '');
        const val = mobileInput.value.trim();
        const isOk = /^01[3-9]\d{8}$/.test(val);
        updateFieldUI(mobileInput, document.getElementById('mobile-error'), isOk, "Enter valid BD mobile number.");
    });

    if (addressInput) addressInput.addEventListener('input', () => {
        const val = addressInput.value.trim();
        const isOk = val.split(/\s+/).length >= 3 && !detectSpamPattern(val);
        updateFieldUI(addressInput, document.getElementById('address-error'), isOk, "Please provide a valid address.");
    });
}

/* =========================================================================
   💳 ৪. পেমেন্ট সাবমিশন
   ========================================================================= */
function handleProceedToPayment() {
    let currentCart = JSON.parse(localStorage.getItem('cart')) || [];
    const checkedItems = currentCart.filter(item => item.selected !== false);

    if (checkedItems.length === 0) {
        openCheckoutAlertModal("Your cart is empty!");
        return;
    }

    // ভ্যালিডেশন চেক
    const nameVal = document.getElementById('shippingFullName')?.value.trim() || "";
    const mobileVal = document.getElementById('shippingMobile')?.value.trim() || "";
    const addressVal = document.getElementById('shippingAddress')?.value.trim() || "";

    if (!nameVal || !mobileVal || !addressVal) {
        openCheckoutAlertModal("Please fill all required fields.");
        return;
    }

    const checkoutOrderSession = {
        customerName: nameVal,
        customerMobile: mobileVal,
        customerAddress: addressVal,
        items: checkedItems,
        paymentStatus: "Pending"
    };

    localStorage.setItem('activeCheckoutSession', JSON.stringify(checkoutOrderSession));
    window.location.href = 'payment.html';
}

function openCheckoutAlertModal(msg) {
    const modal = document.getElementById('checkoutAlertModal');
    if (modal) {
        modal.querySelector('.custom-alert-modal-message').innerText = msg;
        modal.style.display = 'flex';
    } else { alert(msg); }
}

function closeCheckoutAlertModal() {
    document.getElementById('checkoutAlertModal').style.display = 'none';
}
