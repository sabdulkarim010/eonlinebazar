/**
 * Central localStorage / sessionStorage access with error handling.
 */
(function initEOBStorage(global) {
    'use strict';

    function canUseStorage(storage) {
        if (!storage) return false;
        try {
            const probe = '__eob_storage_probe__';
            storage.setItem(probe, '1');
            storage.removeItem(probe);
            return true;
        } catch (_) {
            return false;
        }
    }

    const localOk = canUseStorage(global.localStorage);
    const sessionOk = canUseStorage(global.sessionStorage);

    function createArea(storage, enabled) {
        return {
            get(key, defaultValue) {
                if (!enabled || key == null) return defaultValue;
                try {
                    const raw = storage.getItem(String(key));
                    if (raw === null || raw === undefined) return defaultValue;
                    return raw;
                } catch (_) {
                    return defaultValue;
                }
            },
            set(key, value) {
                if (!enabled || key == null) return false;
                try {
                    if (value === null || value === undefined) {
                        storage.removeItem(String(key));
                        return true;
                    }
                    storage.setItem(String(key), String(value));
                    return true;
                } catch (_) {
                    return false;
                }
            },
            remove(key) {
                if (!enabled || key == null) return false;
                try {
                    storage.removeItem(String(key));
                    return true;
                } catch (_) {
                    return false;
                }
            },
            clear() {
                if (!enabled) return false;
                try {
                    storage.clear();
                    return true;
                } catch (_) {
                    return false;
                }
            },
            getJSON(key, defaultValue) {
                const fallback = defaultValue === undefined ? null : defaultValue;
                const raw = this.get(key, null);
                if (raw === null || raw === '') return fallback;
                try {
                    return JSON.parse(raw);
                } catch (_) {
                    this.remove(key);
                    return fallback;
                }
            },
            setJSON(key, value) {
                if (value === null || value === undefined) {
                    return this.remove(key);
                }
                try {
                    return this.set(key, JSON.stringify(value));
                } catch (_) {
                    return false;
                }
            }
        };
    }

    const local = createArea(global.localStorage, localOk);
    const session = createArea(global.sessionStorage, sessionOk);

    const StorageManager = {
        get: (key, defaultValue) => local.get(key, defaultValue),
        set: (key, value) => local.set(key, value),
        remove: (key) => local.remove(key),
        clear: () => local.clear(),
        getJSON: (key, defaultValue) => local.getJSON(key, defaultValue),
        setJSON: (key, value) => local.setJSON(key, value),
        local,
        session,
        isAvailable: localOk,
        isSessionAvailable: sessionOk
    };

    const StorageKeys = Object.freeze({
        CART: 'cart',
        TOKEN: 'token',
        CUSTOMER_TOKEN: 'customerToken',
        USER_TOKEN: 'userToken',
        USER_NAME: 'userName',
        CUSTOMER_DATA: 'customerData',
        USER_INFO: 'userInfo',
        USER: 'user',
        ACTIVE_CHECKOUT_SESSION: 'activeCheckoutSession',
        IS_BUY_NOW_MODE: 'isBuyNowMode',
        BUY_NOW_ITEM: 'buy_now_item',
        APPLIED_COUPON: 'appliedCoupon',
        LAST_ORDER_LOCKED_PRICING: 'lastOrderLockedPricing',
        SHIPPING_COURIER_NOTE: 'shippingCourierNote',
        SHIPPING_FULL_NAME: 'shippingFullName',
        SHIPPING_MOBILE: 'shippingMobile',
        SHIPPING_ADDRESS: 'shippingAddress',
        SHIPPING_DISTRICT: 'shippingDistrict',
        CHECKOUT_NAME: 'checkout_name',
        CHECKOUT_PHONE: 'checkout_phone',
        CHECKOUT_EMAIL: 'checkout_email',
        CHECKOUT_ADDRESS: 'checkout_address',
        CHECKOUT_DISTRICT: 'checkout_district',
        CHECKOUT_UPAZILA: 'checkout_upazila',
        CHECKOUT_FULL_ADDRESS: 'checkout_full_address',
        ADMIN_TOKEN: 'adminToken',
        ADMIN_PROFILE_PIC: 'adminProfilePic',
        FINANCE_TOKEN: 'financeToken',
        EOB_THEME: 'eob_theme',
        EOB_LANG: 'eonlinebazar_lang',
        EOB_SEARCH_CATEGORY_SCOPE: 'eobSearchCategoryScope',
        BRANDING_SYNC: 'eob_store_branding_sync',
        CHAT_CONVERSATION_ID: 'chatConversationId',
        CHAT_ROOM_ID: 'cw_room_id'
    });

    global.EOBStorage = StorageManager;
    global.EOBStorageKeys = StorageKeys;
})(typeof window !== 'undefined' ? window : globalThis);
