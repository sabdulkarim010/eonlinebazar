(function() {
    'use strict';

    function track(eventName, params) {
        try {
            if (typeof window.gtag === 'function') {
                window.gtag('event', eventName, params || {});
            }
        } catch (err) {
            // Silently fail — never break the page for analytics
        }
    }

    function trackPageView(pagePath, pageTitle) {
        track('page_view', {
            page_path: pagePath || window.location.pathname,
            page_title: pageTitle || document.title
        });
    }

    function trackViewItemList(products, listName) {
        track('view_item_list', {
            item_list_name: listName || 'Product List',
            items: (products || []).slice(0, 10).map((p, i) => ({
                item_id: p.productId || p._id,
                item_name: p.name,
                item_category: p.category || 'General',
                price: p.price || 0,
                index: i + 1,
                currency: 'BDT'
            }))
        });
    }

    function trackViewItem(product) {
        track('view_item', {
            currency: 'BDT',
            value: product.price || 0,
            items: [{
                item_id: product.productId || product._id,
                item_name: product.name,
                item_category: product.category || 'General',
                price: product.price || 0,
                quantity: 1
            }]
        });
    }

    function trackAddToCart(product, quantity) {
        track('add_to_cart', {
            currency: 'BDT',
            value: (product.price || 0) * (quantity || 1),
            items: [{
                item_id: product.productId || product._id,
                item_name: product.name,
                item_category: product.category || 'General',
                price: product.price || 0,
                quantity: quantity || 1
            }]
        });
    }

    function trackRemoveFromCart(product, quantity) {
        track('remove_from_cart', {
            currency: 'BDT',
            value: (product.price || 0) * (quantity || 1),
            items: [{
                item_id: product.productId || product._id,
                item_name: product.name,
                price: product.price || 0,
                quantity: quantity || 1
            }]
        });
    }

    function trackBeginCheckout(cartItems, total) {
        track('begin_checkout', {
            currency: 'BDT',
            value: total || 0,
            items: (cartItems || []).map(item => ({
                item_id: item.productId || item._id || item.id,
                item_name: item.name,
                price: item.price || 0,
                quantity: item.quantity || 1
            }))
        });
    }

    function trackPurchase(order) {
        track('purchase', {
            transaction_id: order.orderId,
            currency: 'BDT',
            value: order.grandTotal || 0,
            shipping: order.deliveryCharge || 0,
            coupon: order.couponCode || '',
            items: (order.items || []).map(item => ({
                item_id: item.productId || item.id,
                item_name: item.name,
                price: item.price || 0,
                quantity: item.quantity || 1
            }))
        });
    }

    function trackSearch(searchTerm, resultsCount) {
        track('search', {
            search_term: searchTerm,
            number_of_results: resultsCount || 0
        });
    }

    function trackLogin(method) {
        track('login', { method: method || 'email' });
    }

    function trackSignUp(method) {
        track('sign_up', { method: method || 'email' });
    }

    function trackAddToWishlist(product) {
        track('add_to_wishlist', {
            currency: 'BDT',
            value: product.price || 0,
            items: [{
                item_id: product.productId || product._id,
                item_name: product.name,
                price: product.price || 0
            }]
        });
    }

    function trackShare(product, method) {
        track('share', {
            method: method || 'copy_link',
            content_type: 'product',
            item_id: product.productId || product._id
        });
    }

    function trackCouponApplied(couponCode, discount) {
        track('select_promotion', {
            promotion_name: couponCode,
            promotion_id: couponCode,
            creative_name: 'Coupon',
            discount: discount || 0
        });
    }

    function trackEvent(name, params) {
        track(name, params);
    }

    window.analytics = {
        trackPageView,
        trackViewItemList,
        trackViewItem,
        trackAddToCart,
        trackRemoveFromCart,
        trackBeginCheckout,
        trackPurchase,
        trackSearch,
        trackLogin,
        trackSignUp,
        trackAddToWishlist,
        trackShare,
        trackCouponApplied,
        trackEvent
    };

    document.addEventListener('DOMContentLoaded', () => {
        trackPageView();
    });

})();
