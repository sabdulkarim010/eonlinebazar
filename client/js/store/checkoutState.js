/**
 * Checkout flow UI state (non-persistent) — replaces scattered window.* checkout globals.
 */
(function initEOBCheckoutState(global) {
    'use strict';

    const state = {
        deliverySettings: {
            shopHomeCity: 'Dhaka',
            deliveryInsideCity: 60,
            deliveryOutsideCity: 120,
            freeShippingMinAmount: 1000,
            freeShippingThreshold: 1000
        },
        selectedShippingDistrict: '',
        selectedShippingUpazila: '',
        checkoutProfileCache: null,
        savedCheckoutAddresses: [],
        selectedSavedAddressId: null,
        isApplyingSavedAddress: false,
        validationState: {
            name: false,
            mobile: false,
            address: false,
            district: false,
            upazila: false
        },
        checkoutCouponsAvailable: false,
        checkoutCouponController: null,
        checkoutWalletBalance: 0,
        checkoutLoyaltyPoints: 0,
        checkoutRewardSettings: null,
        checkoutBeginTracked: false,
        applyWalletAtCheckout: false,
        applyLoyaltyAtCheckout: false,
        checkoutLocationPair: null,
        activeQuote: null,
        quoteMeta: {
            source: 'none',
            fallback: true,
            valid: false,
            error: null,
            itemErrors: []
        },
        idempotencyKey: null,
        idempotencyFingerprint: null,
        isSubmittingOrder: false,
        paymentFlowStatus: null,
        paymentFlowMeta: null,
        checkoutCrossTabBlocked: false
    };

    function exposeLegacyAliases() {
        Object.keys(state).forEach((key) => {
            try {
                Object.defineProperty(global, key, {
                    configurable: true,
                    enumerable: true,
                    get() {
                        return state[key];
                    },
                    set(value) {
                        state[key] = value;
                    }
                });
            } catch (_) {
                global[key] = state[key];
            }
        });
    }

    global.EOBCheckoutState = {
        get: (key) => state[key],
        set: (key, value) => {
            state[key] = value;
            return value;
        },
        snapshot: () => ({ ...state })
    };

    exposeLegacyAliases();

    global.checkoutCDU = () => global.CartDisplayUtils || {};

    try {
        Object.defineProperty(global, 'customerToken', {
            configurable: true,
            enumerable: true,
            get() {
                return global.EOBCommerce && typeof global.EOBCommerce.getAuthToken === 'function'
                    ? global.EOBCommerce.getAuthToken()
                    : '';
            },
            set() {
                /* Auth tokens are written via EOBCommerce.setAuthTokens */
            }
        });
    } catch (_) {
        /* legacy fallback */
    }
})(typeof window !== 'undefined' ? window : globalThis);
