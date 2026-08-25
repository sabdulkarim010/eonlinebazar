/**
 * Checkout Actions
 * Barrel: client/js/checkout.js
 *
 * Globals used from other modules:
 *  * - cart
 * - customerToken
 * - getCheckoutItems
 * - renderCheckoutCart
 * - updateCheckoutTotals
 *
 * Globals this module exposes:
 *  * - refreshCheckoutCouponAvailability
 * - initCheckoutWalletControls
 * - updateCheckoutWalletUI
 * - calculateWalletApplication
 * - renderCheckoutWalletSummary
 * - changeItemQuantity
 * - temporarilyRemoveFromCheckout
 */

async function refreshCheckoutCouponAvailability() {
    if (checkoutCouponController?.recheckAvailability) {
        return checkoutCouponController.recheckAvailability();
    }

    const available = await (window.CouponUI?.checkActiveCoupons() || Promise.resolve(false));
    checkoutCouponsAvailable = available;
    const container = document.getElementById('checkout-coupon-container');
    if (container) container.style.display = available ? 'block' : 'none';
    if (!available) setAppliedCoupon(null);
    return available;
}

function initCheckoutWalletControls() {
    const checkbox = document.getElementById('applyWalletCheckbox');
    if (!checkbox) return;

    checkbox.addEventListener('change', () => {
        applyWalletAtCheckout = checkbox.checked && checkoutWalletBalance > 0;
        updateCheckoutTotals(getCheckoutSubtotal());
    });
}

function updateCheckoutWalletUI() {
    const panel = document.getElementById('checkoutWalletPanel');
    const balanceEl = document.getElementById('checkoutWalletBalance');
    const availableLabel = document.getElementById('checkoutWalletAvailableLabel');
    const checkbox = document.getElementById('applyWalletCheckbox');

    if (!panel) return;

    if (!customerToken || checkoutWalletBalance <= 0) {
        panel.style.display = 'none';
        applyWalletAtCheckout = false;
        if (checkbox) checkbox.checked = false;
        return;
    }

    panel.style.display = 'block';
    const formatted = checkoutWalletBalance.toLocaleString('en-US');
    if (balanceEl) balanceEl.innerText = `৳${formatted}`;
    if (availableLabel) availableLabel.innerText = `(Available: ৳${formatted})`;
}

function calculateWalletApplication(grandTotal) {
    if (!applyWalletAtCheckout || checkoutWalletBalance <= 0) {
        return { walletApplied: 0, payableTotal: grandTotal };
    }
    const walletApplied = Math.min(checkoutWalletBalance, grandTotal);
    const payableTotal = Math.round((grandTotal - walletApplied) * 100) / 100;
    return { walletApplied, payableTotal };
}

function renderCheckoutWalletSummary(grandTotal) {
    const deductRow = document.getElementById('checkoutWalletDeductRow');
    const payableRow = document.getElementById('checkoutPayableRow');
    const walletAppliedEl = document.getElementById('checkoutWalletApplied');
    const payableEl = document.getElementById('checkoutPayableTotal');
    const { walletApplied, payableTotal } = calculateWalletApplication(grandTotal);

    if (deductRow) deductRow.style.display = walletApplied > 0 ? 'flex' : 'none';
    if (payableRow) payableRow.style.display = walletApplied > 0 ? 'flex' : 'none';
    if (walletAppliedEl) walletAppliedEl.innerText = `-৳${walletApplied.toLocaleString('en-US')}`;
    if (payableEl) payableEl.innerText = `৳${payableTotal.toLocaleString('en-US')}`;

    return { walletApplied, payableTotal };
}

/* =========================================================================
   ⚡ ৫. কোর কার্ট অ্যাকশন লজিক (Quantity & Remove) - Buy Now আইসোলেটেড
   ========================================================================= */
function changeItemQuantity(productId, amount, variantId = '') {
    const isBuyNow = localStorage.getItem('isBuyNowMode') === 'true';
    const sameLineCk = (i) => String(i.id) === String(productId) &&
        String(i.variantId || '') === String(variantId || '');

    // 🌟 যদি Buy Now মোড হয়, তবে শুধু buy_now_item আপডেট করবে, মেইন কার্টে হাত দেবে না
    if (isBuyNow) {
        let bnCart = JSON.parse(localStorage.getItem('buy_now_item')) || [];
        const item = bnCart.find(sameLineCk);
        if (item) {
            const targetQty = (parseInt(item.quantity) || 1) + amount;
            if (targetQty < 1) { 
                temporarilyRemoveFromCheckout(productId, variantId); 
                return; 
            }
            item.quantity = targetQty;
            localStorage.setItem('buy_now_item', JSON.stringify(bnCart));
            renderCheckoutCart();
        }
        return; 
    }

    // 🌟 সাধারণ কার্টের লজিক (আগের মতো)
    let currentCart = customerToken ? cart : readGuestCartForCheckout();
    const item = currentCart.find(sameLineCk);
    
    if (item) {
        const targetQty = (parseInt(item.quantity) || 1) + amount;
        
        if (targetQty < 1) { 
            temporarilyRemoveFromCheckout(productId, variantId); 
            return; 
        }

        if (customerToken) {
            fetch('/api/cart/update-quantity', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${customerToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ productId, quantity: targetQty, variantId })
            }).then(() => {
                item.quantity = targetQty;
                renderCheckoutCart();
            }).catch(err => console.error("Error updating quantity in checkout:", err));
        } else {
            item.quantity = targetQty;
            saveGuestCartForCheckout(currentCart);
            renderCheckoutCart();
        }
    }
}

function temporarilyRemoveFromCheckout(productId, variantId = '') {
    const isBuyNow = localStorage.getItem('isBuyNowMode') === 'true';
    const sameLineCk = (i) => String(i.id) === String(productId) &&
        String(i.variantId || '') === String(variantId || '');

    // 🌟 যদি Buy Now মোড হয়, তবে শুধু buy_now_item থেকে ডিলিট করবে
    if (isBuyNow) {
        let bnCart = JSON.parse(localStorage.getItem('buy_now_item')) || [];
        bnCart = bnCart.filter(i => !sameLineCk(i));
        localStorage.setItem('buy_now_item', JSON.stringify(bnCart));
        
        if (bnCart.length === 0) {
            localStorage.removeItem('isBuyNowMode'); // আইটেম না থাকলে মোড অফ
        }
        renderCheckoutCart();
        return;
    }

    // 🌟 সাধারণ কার্টের লজিক (আগের মতো)
    let currentCart = customerToken ? cart : readGuestCartForCheckout();
    const item = currentCart.find(sameLineCk);
    
    if (item) {
        if (customerToken) {
            fetch('/api/cart/toggle-selection', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${customerToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ productId, selected: false, variantId })
            }).then(() => {
                item.selected = false;
                renderCheckoutCart();
            }).catch(err => console.error("Error toggling selection in checkout:", err));
        } else {
            item.selected = false;
            saveGuestCartForCheckout(currentCart);
            renderCheckoutCart();
        }
    }
}
Object.assign(window, {
    refreshCheckoutCouponAvailability,
    initCheckoutWalletControls,
    updateCheckoutWalletUI,
    calculateWalletApplication,
    renderCheckoutWalletSummary,
    changeItemQuantity,
    temporarilyRemoveFromCheckout
});
