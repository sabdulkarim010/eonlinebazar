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
        if (typeof requestOrderQuoteRefresh === 'function') requestOrderQuoteRefresh();
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

function initCheckoutLoyaltyControls() {
    const checkbox = document.getElementById('applyLoyaltyCheckbox');
    if (!checkbox) return;

    checkbox.addEventListener('change', () => {
        applyLoyaltyAtCheckout = checkbox.checked && checkoutLoyaltyPoints > 0;
        updateCheckoutTotals(getCheckoutSubtotal());
        if (typeof requestOrderQuoteRefresh === 'function') requestOrderQuoteRefresh();
    });
}

function updateCheckoutLoyaltyUI() {
    const panel = document.getElementById('checkoutLoyaltyPanel');
    const balanceEl = document.getElementById('checkoutLoyaltyPointsBalance');
    const labelEl = document.getElementById('checkoutLoyaltyApplyLabel');
    const checkbox = document.getElementById('applyLoyaltyCheckbox');

    if (!panel) return;

    if (!customerToken || checkoutLoyaltyPoints <= 0) {
        panel.style.display = 'none';
        applyLoyaltyAtCheckout = false;
        if (checkbox) checkbox.checked = false;
        return;
    }

    panel.style.display = 'block';
    const rate = Number(checkoutRewardSettings?.pointsToTakaConversionRate) || 10;
    const cashValue = Math.round((checkoutLoyaltyPoints / 100) * rate);
    if (balanceEl) balanceEl.textContent = String(checkoutLoyaltyPoints);
    if (labelEl) {
        labelEl.textContent = `Use ${checkoutLoyaltyPoints} loyalty points (৳${cashValue.toLocaleString('en-US')} discount)`;
    }
}

function calculateLoyaltyApplication(merchandisePayable) {
    if (!applyLoyaltyAtCheckout || checkoutLoyaltyPoints <= 0) {
        return { pointsUsed: 0, loyaltyDiscount: 0, merchandiseAfterLoyalty: merchandisePayable };
    }

    const rate = Number(checkoutRewardSettings?.pointsToTakaConversionRate) || 10;
    const maxDiscount = (checkoutLoyaltyPoints / 100) * rate;
    const loyaltyDiscount = Math.min(maxDiscount, Math.max(0, merchandisePayable));
    const pointsUsed = rate > 0
        ? Math.min(checkoutLoyaltyPoints, Math.ceil((loyaltyDiscount / rate) * 100))
        : 0;
    const merchandiseAfterLoyalty = Math.round((merchandisePayable - loyaltyDiscount) * 100) / 100;

    return { pointsUsed, loyaltyDiscount, merchandiseAfterLoyalty };
}

function renderCheckoutLoyaltySummary(merchandisePayable) {
    const deductRow = document.getElementById('checkoutLoyaltyDeductRow');
    const appliedEl = document.getElementById('checkoutLoyaltyApplied');
    const { pointsUsed, loyaltyDiscount, merchandiseAfterLoyalty } = calculateLoyaltyApplication(merchandisePayable);

    if (deductRow) deductRow.style.display = loyaltyDiscount > 0 ? 'flex' : 'none';
    if (appliedEl) appliedEl.textContent = `-৳${loyaltyDiscount.toLocaleString('en-US')}`;

    return { pointsUsed, loyaltyDiscount, merchandiseAfterLoyalty };
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
    const isBuyNow = window.EOBStorage.get(window.EOBStorageKeys.IS_BUY_NOW_MODE) === 'true';
    const sameLineCk = (i) => String(i.id) === String(productId) &&
        String(i.variantId || '') === String(variantId || '');

    // 🌟 যদি Buy Now মোড হয়, তবে শুধু buy_now_item আপডেট করবে, মেইন কার্টে হাত দেবে না
    if (isBuyNow) {
        let bnCart = window.EOBStorage.getJSON(window.EOBStorageKeys.BUY_NOW_ITEM, []);
        const item = bnCart.find(sameLineCk);
        if (item) {
            const targetQty = (parseInt(item.quantity) || 1) + amount;
            if (targetQty < 1) { 
                temporarilyRemoveFromCheckout(productId, variantId); 
                return; 
            }
            item.quantity = targetQty;
            window.EOBStorage.setJSON(window.EOBStorageKeys.BUY_NOW_ITEM, bnCart);
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

        const CDU = window.CartDisplayUtils || {};
        const lineKey = CDU.cartLineKey
            ? CDU.cartLineKey(productId, variantId)
            : `${productId}::${variantId || ''}`;
        const qtySync = CDU.getCartQtySync ? CDU.getCartQtySync() : null;
        const beforeQty = parseInt(item.quantity, 10) || 1;

        const applyOptimistic = (qty) => {
            item.quantity = qty;
            if (typeof invalidateCheckoutIdempotencyKey === 'function') {
                invalidateCheckoutIdempotencyKey('cart_qty_changed');
            }
            renderCheckoutCart();
            if (typeof updateCheckoutTotals === 'function') {
                updateCheckoutTotals(getCheckoutSubtotal());
            }
        };

        const syncFn = async (qty) => {
            if (customerToken) {
                const res = await fetch('/api/cart/update-quantity', {
                    method: 'PUT',
                    headers: {
                        Authorization: `Bearer ${customerToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ productId, quantity: qty, variantId })
                });
                let data = null;
                try {
                    data = await res.json();
                } catch (_) {
                    data = null;
                }
                if (!res.ok) {
                    return {
                        ok: false,
                        status: res.status,
                        message: (data && data.message) || 'Could not update quantity'
                    };
                }
                return { ok: true, data };
            }
            item.quantity = qty;
            saveGuestCartForCheckout(currentCart);
            return { ok: true };
        };

        const onSuccess = (qty, result) => {
            if (customerToken && result && result.data && typeof window.syncCartFromServerItems === 'function') {
                const parse = CDU.parseCartApiResponse || ((payload) => (Array.isArray(payload?.data) ? payload.data : []));
                const items = parse(result.data);
                if (items.length > 0) {
                    window.syncCartFromServerItems(items);
                }
            }
            applyOptimistic(qty);
            if (window.EOBCommerce && typeof window.EOBCommerce.commitCart === 'function') {
                window.EOBCommerce.commitCart();
            }
        };

        const onRollback = (baseline) => {
            applyOptimistic(baseline);
            if (window.EOBCommerce && typeof window.EOBCommerce.commitCart === 'function') {
                window.EOBCommerce.commitCart();
            }
        };

        if (qtySync && typeof qtySync.enqueue === 'function') {
            qtySync.enqueue({
                lineKey,
                beforeQty,
                targetQty,
                applyOptimistic,
                syncFn,
                onSuccess,
                onRollback
            });
            return;
        }

        applyOptimistic(targetQty);
        syncFn(targetQty).then((result) => {
            if (result.ok) onSuccess(targetQty, result);
            else onRollback(beforeQty);
        });
    }
}

function temporarilyRemoveFromCheckout(productId, variantId = '') {
    const isBuyNow = window.EOBStorage.get(window.EOBStorageKeys.IS_BUY_NOW_MODE) === 'true';
    const sameLineCk = (i) => String(i.id) === String(productId) &&
        String(i.variantId || '') === String(variantId || '');

    // 🌟 যদি Buy Now মোড হয়, তবে শুধু buy_now_item থেকে ডিলিট করবে
    if (isBuyNow) {
        let bnCart = window.EOBStorage.getJSON(window.EOBStorageKeys.BUY_NOW_ITEM, []);
        bnCart = bnCart.filter(i => !sameLineCk(i));
        window.EOBStorage.setJSON(window.EOBStorageKeys.BUY_NOW_ITEM, bnCart);
        
        if (bnCart.length === 0) {
            window.EOBStorage.remove(window.EOBStorageKeys.IS_BUY_NOW_MODE); // আইটেম না থাকলে মোড অফ
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
    initCheckoutLoyaltyControls,
    updateCheckoutWalletUI,
    updateCheckoutLoyaltyUI,
    calculateWalletApplication,
    calculateLoyaltyApplication,
    renderCheckoutLoyaltySummary,
    renderCheckoutWalletSummary,
    changeItemQuantity,
    temporarilyRemoveFromCheckout
});
