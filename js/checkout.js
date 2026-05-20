/*************************************
 * Project: EonlineBazar
 * File: js/checkout.js
 * Author: Abdul Karim Sheikh
 *************************************/

let globalProductCatalog = [];

document.addEventListener('DOMContentLoaded', () => {
    fetch('product.json')
        .then(res => res.json())
        .then(data => {
            globalProductCatalog = data;
            if (document.getElementById('checkoutItemsContainer')) renderCheckoutCart();
        })
        .catch(err => { console.error("Catalog load error:", err); renderCheckoutCart(); });

    initLiveValidationEngine();
    
    const proceedBtn = document.getElementById('proceedToPaymentBtn');
    if (proceedBtn) proceedBtn.addEventListener('click', handleProceedToPayment);
});

/* =========================================================================
   🛍️ ১. কার্ট রেন্ডারিং ইঞ্জিন (সঠিকভাবে যোগ করা হয়েছে)
   ========================================================================= */
function renderCheckoutCart() {
    const container = document.getElementById('checkoutItemsContainer');
    const template = document.getElementById('cartItemTemplate');
    const subtotalText = document.getElementById('checkoutSubtotal');
    const grandTotalText = document.getElementById('checkoutGrandTotal');
    
    let currentCart = JSON.parse(localStorage.getItem('cart')) || [];
    if (!container || !template) return;
    container.innerHTML = '';

    let checkedItems = currentCart.filter(item => item.selected !== false);
    if (checkedItems.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:40px;">Your cart is empty!</div>`;
        if (subtotalText) subtotalText.innerText = `৳0`;
        if (grandTotalText) grandTotalText.innerText = `৳0`;
        return;
    }

    let calculatedTotal = 0;
    checkedItems.forEach(item => {
        let cleanPrice = parseFloat(item.price) || 0;
        let cleanQty = parseInt(item.quantity) || 1;
        calculatedTotal += (cleanPrice * cleanQty);

        const clone = template.content.cloneNode(true);
        const mediaFrame = clone.querySelector('.cart-media-frame-box');
        
        let realProduct = globalProductCatalog.find(p => String(p.id) === String(item.id));
        let displayEmoji = (realProduct && realProduct.icon) ? realProduct.icon : "📦";
        
        mediaFrame.innerHTML = `<span style="font-size:24px;">${displayEmoji}</span>`;
        clone.querySelector('.cart-item-name-text').innerText = item.name;
        clone.querySelector('.cart-item-base-price-text').innerText = `৳${cleanPrice}`;
        clone.querySelector('.cart-item-total').innerText = `৳${(cleanPrice * cleanQty)}`;
        clone.querySelector('.qty-text').innerText = cleanQty;

        // কোয়ান্টিটি প্লাস ও মাইনাস বাটন অ্যাকশন
        clone.querySelector('.btn-minus').onclick = () => changeItemQuantity(item.id, -1);
        clone.querySelector('.btn-plus').onclick = () => changeItemQuantity(item.id, 1);
        
        // 🛠️ নতুন সংযোজন: ডিলিট/ট্র্যাশ বাটন সচল করার অ্যাকশন
        clone.querySelector('.checkout-row-delete-btn-main').onclick = () => temporarilyRemoveFromCheckout(item.id);

        container.appendChild(clone);
    });

    if (subtotalText) subtotalText.innerText = `৳${calculatedTotal}`;
    if (grandTotalText) grandTotalText.innerText = `৳${calculatedTotal}`;
}

/* =========================================================================
   🛡️ ২. ভ্যালিডেশন ইঞ্জিন (সেন্টার আইকন ও লাইভ কাউন্টার)
   ========================================================================= */
function updateFieldUI(input, errorEl, isValid, currentCount, max) {
    if (!input || !errorEl) return;

    let wrapper = input.parentElement;
    wrapper.style.position = 'relative';

    let iconCounterWrapper = wrapper.querySelector('.icon-counter-wrapper');
    if (!iconCounterWrapper) {
        iconCounterWrapper = document.createElement('div');
        iconCounterWrapper.className = 'icon-counter-wrapper';
        iconCounterWrapper.style.cssText = 'position:absolute; right:10px; top:0; height:100%; display:flex; align-items:center; gap:8px; pointer-events:none;';
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
        iconCounterWrapper.innerHTML = `<span style="font-size:12px; color:#64748b;">${counterText}</span><i class="fa-solid fa-check-circle" style="color:#10b981;"></i>`;
    } else {
        input.style.borderColor = "#ef4444";
        input.style.backgroundColor = "#fef2f2";
        errorEl.innerText = "Invalid format or spam detected.";
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

        input.addEventListener('input', () => {
            let val = input.value.trim();
            let isOk = false;
            let len = val.length;

            if (field.id === 'shippingFullName') isOk = len >= 3 && val.split(/\s+/).length >= 2 && !detectSpamPattern(val);
            else if (field.id === 'shippingMobile') {
                input.value = input.value.replace(/\D/g, '');
                isOk = /^01[3-9]\d{8}$/.test(input.value);
            }
            else if (field.id === 'shippingAddress') isOk = len >= 10 && !detectSpamPattern(val);
            else if (field.id === 'shippingCourierNote') isOk = true; 

            updateFieldUI(input, errorEl, isOk, len, field.max > 0 ? field.max : null);
        });
    });
}

function changeItemQuantity(id, amount) { /* আগের লজিক */ }
function handleProceedToPayment() { /* আগের লজিক */ }


/* =========================================================================
   ⚡৩. কোর কার্ট অ্যাকশন লজিক
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
   💳 ৪. পেমেন্ট সাবমিশন
   ========================================================================= */
function handleProceedToPayment() {
    let currentCart = JSON.parse(localStorage.getItem('cart')) || [];
    const checkedItems = currentCart.filter(item => item.selected !== false);

    if (checkedItems.length === 0) {
        openCheckoutAlertModal("Your cart is empty!");
        return;
    }

    const nameVal = document.getElementById('shippingFullName')?.value.trim() || "";
    const mobileVal = document.getElementById('shippingMobile')?.value.trim() || "";
    const addressVal = document.getElementById('shippingAddress')?.value.trim() || "";
    const noteVal = document.getElementById('shippingCourierNote')?.value.trim() || "";

    // চেক করার সময় নোটও ভ্যালিড কি না দেখে নিতে পারেন
    if (!nameVal || !mobileVal || !addressVal) {
        openCheckoutAlertModal("Please fill all required fields correctly.");
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


