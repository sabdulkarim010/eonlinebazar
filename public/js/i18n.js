const translations = {
  bn: {
    // Navigation
    'nav.home': 'হোম',
    'nav.search': 'পণ্য খুঁজুন',
    'nav.cart': 'কার্ট',
    'nav.login': 'লগইন',
    'nav.register': 'নিবন্ধন',
    'nav.profile': 'প্রোফাইল',
    'nav.logout': 'লগআউট',
    'nav.wishlist': 'পছন্দের তালিকা',

    // Homepage
    'home.hero.title': 'সেরা মানের পণ্য',
    'home.hero.subtitle': 'দ্রুত ডেলিভারি, সহজ রিটার্ন',
    'home.shop_now': 'এখনই কিনুন',
    'home.flash_sale': 'ফ্ল্যাশ সেল',
    'home.load_error_title': 'পণ্য লোড করা যায়নি',
    'home.rate_limited_title': 'অনেক বেশি অনুরোধ',
    'home.ends_in': 'শেষ হবে',
    'home.featured': 'ফিচার্ড পণ্য',
    'home.new_arrivals': 'নতুন পণ্য',

    // Product
    'product.add_to_cart': 'কার্টে যোগ করুন',
    'product.buy_now': 'এখনই কিনুন',
    'product.add_to_wishlist': 'পছন্দে যোগ করুন',
    'product.in_stock': 'স্টকে আছে',
    'product.out_of_stock': 'স্টক নেই',
    'product.low_stock': 'মাত্র {count}টি বাকি — শীঘ্রই অর্ডার করুন!',
    'product.select_options': 'অপশন নির্বাচন করুন',
    'product.highlights_title': 'পণ্যের হাইলাইট',
    'product.customer_reviews': '({count} গ্রাহক রিভিউ)',
    'product.expected_delivery': 'আনুমানিক ডেলিভারি',
    'product.warranty_title': 'ওয়ারেন্টি',
    'product.authentic': '১০০% অরিজিনাল পণ্য',
    'product.share': 'শেয়ার:',
    'product.order_whatsapp': 'WhatsApp-এ অর্ডার',
    'product.no_reviews': 'এখনও কোনো রিভিউ নেই। প্রথম রিভিউ দিন!',
    'product.verified_purchase': 'যাচাইকৃত ক্রয়',
    'product.sku': 'SKU',
    'product.reviews': 'রিভিউ',
    'product.rating': 'রেটিং',
    'product.description': 'বিবরণ',
    'product.specifications': 'বৈশিষ্ট্য',

    // Cart
    'cart.title': 'আপনার কার্ট',
    'cart.empty': 'কার্ট খালি',
    'cart.total': 'মোট',
    'cart.checkout': 'চেকআউট করুন',
    'cart.remove': 'সরান',
    'cart.quantity': 'পরিমাণ',
    'cart.free_shipping': 'বিনামূল্যে ডেলিভারি',
    'cart.free_shipping_remaining': 'আর {amount}৳ কেনাকাটায় বিনামূল্যে ডেলিভারি',
    'cart.subtotal': 'সাবটোটাল',
    'cart.empty_hint': 'কার্টে কিছু পণ্য যোগ করুন।',
    'cart.continue_shopping': 'কেনাকাটা চালিয়ে যান',

    // Checkout
    'checkout.title': 'চেকআউট',
    'checkout.shipping': 'ডেলিভারি তথ্য',
    'checkout.payment': 'পেমেন্ট পদ্ধতি',
    'checkout.place_order': 'অর্ডার করুন',
    'checkout.name': 'নাম',
    'checkout.phone': 'ফোন',
    'checkout.address': 'ঠিকানা',
    'checkout.district': 'জেলা',
    'checkout.coupon': 'কুপন কোড',
    'checkout.apply': 'প্রয়োগ করুন',
    'checkout.review_cart': 'কার্ট পর্যালোচনা',
    'checkout.secure': 'নিরাপদ চেকআউট',
    'checkout.secure_short': 'নিরাপদ',
    'checkout.step': 'ধাপ {step} / {total}',
    'checkout.back_cart': 'কার্টে ফিরুন',
    'checkout.back': 'ফিরে যান',
    'checkout.continue_shopping': 'কেনাকাটা চালিয়ে যান',
    'checkout.selected_items': 'নির্বাচিত আইটেম:',
    'checkout.subtotal': 'সাবটোটাল:',
    'checkout.discount': 'ছাড়',
    'checkout.delivery_charge': 'ডেলিভারি চার্জ:',
    'checkout.estimated_delivery': 'আনুমানিক ডেলিভারি:',
    'checkout.grand_total': 'সর্বমোট:',
    'checkout.promo_code': 'প্রোমো কোড',
    'checkout.enter_code': 'কোড লিখুন',
    'checkout.remove': 'সরান',
    'checkout.proceed_payment': 'পেমেন্টে এগিয়ে যান',
    'checkout.shipping_info': 'শিপিং তথ্য',
    'checkout.full_name': 'পূর্ণ নাম',
    'checkout.mobile': 'মোবাইল নম্বর',
    'checkout.email_optional': 'ইমেইল (ঐচ্ছিক)',
    'checkout.upazila': 'উপজেলা / থানা',
    'checkout.full_address': 'সম্পূর্ণ ডেলিভারি ঠিকানা',
    'checkout.courier_note': 'কুরিয়ারের জন্য নোট (ঐচ্ছিক)',
    'checkout.select_district': 'জেলা নির্বাচন করুন',
    'checkout.select_upazila': 'উপজেলা / থানা নির্বাচন করুন',
    'checkout.guest_signin': 'অ্যাকাউন্ট আছে? দ্রুত চেকআউটের জন্য সাইন ইন করুন।',
    'checkout.sign_in': 'সাইন ইন',
    'checkout.saved_addresses': 'ডেলিভারি ঠিকানা নির্বাচন করুন',
    'checkout.alert_title': 'মনোযোগ প্রয়োজন!',
    'checkout.alert_shipping': 'অনুগ্রহ করে সব প্রয়োজনীয় শিপিং তথ্য সঠিকভাবে পূরণ করুন।',
    'checkout.alert_ok': 'ঠিক আছে',
    'checkout.back_shipping': 'শিপিং-এ ফিরুন',
    'checkout.wallet_balance': 'ওয়ালেট ব্যালেন্স',
    'checkout.loyalty_points': 'লয়ালটি পয়েন্ট',

    // Orders
    'order.status.pending': 'অপেক্ষমান',
    'order.status.processing': 'প্রক্রিয়াধীন',
    'order.status.shipped': 'পাঠানো হয়েছে',
    'order.status.delivered': 'ডেলিভারি হয়েছে',
    'order.status.cancelled': 'বাতিল',
    'order.status.returned': 'ফেরত',
    'order.track': 'অর্ডার ট্র্যাক করুন',
    'order.invoice': 'ইনভয়েস ডাউনলোড',
    'order.cancel': 'অর্ডার বাতিল করুন',

    // Auth
    'auth.login': 'লগইন',
    'auth.register': 'নিবন্ধন করুন',
    'auth.email': 'ইমেইল',
    'auth.password': 'পাসওয়ার্ড',
    'auth.login_input': 'ইমেল ঠিকানা অথবা মোবাইল নম্বর',
    'auth.remember_me': 'আমাকে মনে রাখুন',
    'auth.password_min': 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে',
    'auth.login_input_invalid': 'সঠিক ইমেল ঠিকানা অথবা মোবাইল নম্বর দিন।',
    'auth.forgot_password': 'পাসওয়ার্ড ভুলে গেছেন?',
    'auth.google_login': 'Google দিয়ে লগইন',
    'auth.no_account': 'অ্যাকাউন্ট নেই?',
    'auth.have_account': 'অ্যাকাউন্ট আছে?',
    'auth.or': 'অথবা',
    'auth.show_password': 'পাসওয়ার্ড দেখুন',
    'auth.hide_password': 'পাসওয়ার্ড লুকান',
    'auth.authenticating': 'প্রমাণীকরণ হচ্ছে...',
    'auth.fill_fields': 'সব ঘর সঠিকভাবে পূরণ করুন।',
    'auth.login_success': 'লগইন সফল! পুনঃনির্দেশ করা হচ্ছে...',
    'auth.session_expired': 'এই ডিভাইসে সেশন শেষ হয়েছে। আবার লগইন করুন।',
    'auth.google_failed': 'Google সাইন-ইন ব্যর্থ। আবার চেষ্টা করুন বা ইমেল/পাসওয়ার্ড ব্যবহার করুন।',
    'auth.email_verified': 'ইমেল যাচাই সফল! এখন সাইন ইন করতে পারেন।',
    'auth.server_error': 'সার্ভার ত্রুটি! আবার চেষ্টা করুন।',
    'auth.invalid_credentials': 'ভুল তথ্য বা ইমেল যাচাই হয়নি।',

    // Search
    'search.placeholder': 'পণ্য খুঁজুন...',
    'search.results': '{count}টি পণ্য পাওয়া গেছে',
    'search.no_results': 'কোনো পণ্য পাওয়া যায়নি',
    'search.filter': 'ফিল্টার',
    'search.sort': 'সাজান',
    'search.clear_filters': 'ফিল্টার পরিষ্কার করুন',
    'search.sort_newest': 'নতুন প্রথম',
    'search.sort_oldest': 'পুরোনো প্রথম',
    'search.sort_price_asc': 'দাম: কম থেকে বেশি',
    'search.sort_price_desc': 'দাম: বেশি থেকে কম',
    'search.sort_rating': 'সেরা রেটিং',
    'search.sort_popular': 'সবচেয়ে জনপ্রিয়',
    'search.in_stock_only': 'শুধু স্টকে আছে',

    // Home sections
    'home.trending': 'এখন ট্রেন্ডিং',
    'home.flash_deals': 'ফ্ল্যাশ ডিল',
    'home.shop_by_category': 'ক্যাটাগরি অনুযায়ী কিনুন',
    'home.limited_offer': 'সীমিত সময়ের অফার',
    'home.flash_subtitle': 'নির্বাচিত পণ্যে বিশেষ ছাড় — সময় শেষ হওয়ার আগে কিনুন!',
    'home.hours': 'ঘণ্টা',
    'home.min': 'মিনিট',
    'home.sec': 'সেকেন্ড',
    'home.see_all': 'সব দেখুন',
    'nav.all_categories': 'সব ক্যাটাগরি',
    'drawer.shop_department': 'বিভাগ অনুযায়ী কিনুন',
    'drawer.back_categories': 'সব ক্যাটাগরিতে ফিরুন',
    'whatsapp.help': 'সাহায্য দরকার? আমাদের সাথে চ্যাট করুন!',

    // Toast
    'toast.cart_added': 'কার্টে যোগ হয়েছে!',
    'toast.cart_removed': 'কার্ট থেকে সরানো হয়েছে',
    'toast.wishlist_added': 'পছন্দের তালিকায় যোগ হয়েছে!',
    'toast.wishlist_removed': 'পছন্দের তালিকা থেকে সরানো হয়েছে',
    'toast.stock_exceeded': 'অনুরোধকৃত পরিমাণ স্টকের বেশি',
    'toast.out_of_stock': 'এই পণ্যটি বর্তমানে স্টকে নেই',

    // Profile / order details
    'profile.order_details': 'অর্ডার বিবরণ',
    'profile.placed_on': 'অর্ডারের তারিখ:',
    'profile.order_support': 'অর্ডার সাপোর্ট',
    'profile.need_help': 'এই অর্ডারে সাহায্য দরকার?',
    'profile.order_support_text': 'ডেলিভারি, পেমেন্ট বা রিটার্ন নিয়ে আমাদের সাথে চ্যাট করুন।',

    // Common
    'common.loading': 'লোড হচ্ছে...',
    'common.error': 'কিছু একটা ভুল হয়েছে',
    'common.try_again': 'আবার চেষ্টা করুন',
    'common.save': 'সংরক্ষণ করুন',
    'common.cancel': 'বাতিল',
    'common.confirm': 'নিশ্চিত করুন',
    'common.close': 'বন্ধ করুন',
    'common.see_more': 'আরো দেখুন',
    'common.back': 'ফিরে যান',
    'common.currency': '৳',
    'common.taka': 'টাকা',
    'common.optional': 'ঐচ্ছিক',
    'common.required': 'আবশ্যক',
    'common.dismiss': 'বন্ধ করুন',
    'common.ok': 'ঠিক আছে',

    // Footer
    'footer.tagline': 'বাংলাদেশের বিশ্বস্ত অনলাইন শপিং গন্তব্য',
    'footer.follow_us': 'আমাদের অনুসরণ করুন',
    'footer.about_us': 'আমাদের সম্পর্কে',
    'footer.contact_us': 'যোগাযোগ',
    'footer.return_policy': 'রিটার্ন নীতি',
    'footer.track_order': 'অর্ডার ট্র্যাক',
    'footer.loading': 'ফুটার লোড হচ্ছে...',

    // Footer newsletter
    'footer.newsletter_title': 'নিউজলেটার সাবস্ক্রাইব করুন',
    'footer.newsletter_desc': 'নতুন পণ্য ও অফার সবার আগে জানুন',
    'footer.newsletter_placeholder': 'আপনার ইমেইল দিন',
    'footer.newsletter_btn': 'সাবস্ক্রাইব',
  },
  en: {
    // Navigation
    'nav.home': 'Home',
    'nav.search': 'Search Products',
    'nav.cart': 'Cart',
    'nav.login': 'Login',
    'nav.register': 'Register',
    'nav.profile': 'Profile',
    'nav.logout': 'Logout',
    'nav.wishlist': 'Wishlist',

    // Homepage
    'home.hero.title': 'Best Quality Products',
    'home.hero.subtitle': 'Fast delivery, easy returns',
    'home.shop_now': 'Shop Now',
    'home.flash_sale': 'Flash Sale',
    'home.load_error_title': 'Could not load products',
    'home.rate_limited_title': 'Too many requests',
    'home.ends_in': 'Ends in',
    'home.featured': 'Featured Products',
    'home.new_arrivals': 'New Arrivals',

    // Product
    'product.add_to_cart': 'Add to Cart',
    'product.buy_now': 'Buy Now',
    'product.add_to_wishlist': 'Add to Wishlist',
    'product.in_stock': 'In Stock',
    'product.out_of_stock': 'Out of Stock',
    'product.low_stock': 'Only {count} left in stock — order soon!',
    'product.select_options': 'Select options',
    'product.highlights_title': 'Product Highlights',
    'product.customer_reviews': '({count} Customer Reviews)',
    'product.expected_delivery': 'Expected Delivery',
    'product.warranty_title': 'Warranty',
    'product.authentic': '100% Authentic Product',
    'product.share': 'Share:',
    'product.order_whatsapp': 'Order via WhatsApp',
    'product.no_reviews': 'No reviews yet. Be the first to review this product!',
    'product.verified_purchase': 'Verified Purchase',
    'product.sku': 'SKU',
    'product.reviews': 'Reviews',
    'product.rating': 'Rating',
    'product.description': 'Description',
    'product.specifications': 'Specifications',

    // Cart
    'cart.title': 'Your Cart',
    'cart.empty': 'Cart is empty',
    'cart.total': 'Total',
    'cart.checkout': 'Checkout',
    'cart.remove': 'Remove',
    'cart.quantity': 'Quantity',
    'cart.free_shipping': 'Free Delivery',
    'cart.free_shipping_remaining': '{amount}৳ more for free delivery',
    'cart.subtotal': 'Subtotal',
    'cart.empty_hint': 'Please add some products to your cart.',
    'cart.continue_shopping': 'Continue Shopping',

    // Checkout
    'checkout.title': 'Checkout',
    'checkout.shipping': 'Delivery Information',
    'checkout.payment': 'Payment Method',
    'checkout.place_order': 'Place Order',
    'checkout.name': 'Name',
    'checkout.phone': 'Phone',
    'checkout.address': 'Address',
    'checkout.district': 'District',
    'checkout.coupon': 'Coupon Code',
    'checkout.apply': 'Apply',
    'checkout.review_cart': 'Review Your Cart',
    'checkout.secure': 'SECURE CHECKOUT',
    'checkout.secure_short': 'SECURE',
    'checkout.step': 'Step {step} of {total}',
    'checkout.back_cart': 'Back to Cart',
    'checkout.back': 'Back',
    'checkout.continue_shopping': 'Continue Shopping',
    'checkout.selected_items': 'Selected Items:',
    'checkout.subtotal': 'Subtotal:',
    'checkout.discount': 'Discount',
    'checkout.delivery_charge': 'Delivery Charge:',
    'checkout.estimated_delivery': 'Estimated Delivery:',
    'checkout.grand_total': 'Grand Total:',
    'checkout.promo_code': 'Promo Code',
    'checkout.enter_code': 'Enter code',
    'checkout.remove': 'Remove',
    'checkout.proceed_payment': 'Proceed to Payment',
    'checkout.shipping_info': 'Shipping Information',
    'checkout.full_name': 'Full Name',
    'checkout.mobile': 'Mobile Number',
    'checkout.email_optional': 'Email Address (Optional)',
    'checkout.upazila': 'Upazila / Thana',
    'checkout.full_address': 'Full Delivery Address',
    'checkout.courier_note': 'Note for Courier (Optional)',
    'checkout.select_district': 'Select your district',
    'checkout.select_upazila': 'Select upazila / thana',
    'checkout.guest_signin': 'Have an account? Sign in for a faster checkout.',
    'checkout.sign_in': 'Sign In',
    'checkout.saved_addresses': 'Select a Delivery Address',
    'checkout.alert_title': 'Attention Required!',
    'checkout.alert_shipping': 'Please fill in all required shipping fields correctly before proceeding.',
    'checkout.alert_ok': 'OK, Got It',
    'checkout.back_shipping': 'Back to Shipping',
    'checkout.wallet_balance': 'Your Wallet Balance',
    'checkout.loyalty_points': 'Loyalty Points',

    // Orders
    'order.status.pending': 'Pending',
    'order.status.processing': 'Processing',
    'order.status.shipped': 'Shipped',
    'order.status.delivered': 'Delivered',
    'order.status.cancelled': 'Cancelled',
    'order.status.returned': 'Returned',
    'order.track': 'Track Order',
    'order.invoice': 'Download Invoice',
    'order.cancel': 'Cancel Order',

    // Auth
    'auth.login': 'Login',
    'auth.register': 'Register',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.login_input': 'Email Address or Mobile Number',
    'auth.remember_me': 'Remember me',
    'auth.password_min': 'Password must be at least 6 characters.',
    'auth.login_input_invalid': 'Please enter a valid email address or mobile number.',
    'auth.forgot_password': 'Forgot Password?',
    'auth.google_login': 'Login with Google',
    'auth.no_account': "Don't have an account?",
    'auth.have_account': 'Already have an account?',
    'auth.or': 'Or',
    'auth.show_password': 'Show password',
    'auth.hide_password': 'Hide password',
    'auth.authenticating': 'Authenticating...',
    'auth.fill_fields': 'Please fill all fields correctly.',
    'auth.login_success': 'Login Successful! Redirecting...',
    'auth.session_expired': 'Your session ended on this device. Please sign in again.',
    'auth.google_failed': 'Google sign-in failed. Please try again or use email/password.',
    'auth.email_verified': 'Email verified successfully! You can now sign in.',
    'auth.server_error': 'Server error! Please try again.',
    'auth.invalid_credentials': 'Invalid credentials or email not verified.',

    // Search
    'search.placeholder': 'Search products...',
    'search.results': '{count} products found',
    'search.no_results': 'No products found',
    'search.filter': 'Filter',
    'search.sort': 'Sort',
    'search.clear_filters': 'Clear Filters',
    'search.sort_newest': 'Newest First',
    'search.sort_oldest': 'Oldest First',
    'search.sort_price_asc': 'Price: Low to High',
    'search.sort_price_desc': 'Price: High to Low',
    'search.sort_rating': 'Best Rating',
    'search.sort_popular': 'Most Popular',
    'search.in_stock_only': 'In Stock Only',

    // Home sections
    'home.trending': 'Trending Now',
    'home.flash_deals': 'Flash Deals',
    'home.shop_by_category': 'Shop by Category',
    'home.limited_offer': 'Limited Time Offer',
    'home.flash_subtitle': 'Grab exclusive discounts before the timer hits zero.',
    'home.hours': 'Hours',
    'home.min': 'Min',
    'home.sec': 'Sec',
    'home.see_all': 'See All',
    'nav.all_categories': 'All Categories',
    'drawer.shop_department': 'Shop by Department',
    'drawer.back_categories': 'Back to All Categories',
    'whatsapp.help': 'Need help? Chat with us!',

    // Toast
    'toast.cart_added': 'Added to Cart successfully!',
    'toast.cart_removed': 'Item removed from Cart',
    'toast.wishlist_added': 'Saved to Wishlist!',
    'toast.wishlist_removed': 'Item removed from Wishlist',
    'toast.stock_exceeded': 'Requested quantity exceeds available stock',
    'toast.out_of_stock': 'This item is currently out of stock',

    // Profile / order details
    'profile.order_details': 'Order Details',
    'profile.placed_on': 'Placed on:',
    'profile.order_support': 'Order Support',
    'profile.need_help': 'Need help with this order?',
    'profile.order_support_text': 'Chat with our team about delivery, payment, or returns for this order.',

    // Common
    'common.loading': 'Loading...',
    'common.error': 'Something went wrong',
    'common.try_again': 'Try Again',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.confirm': 'Confirm',
    'common.close': 'Close',
    'common.see_more': 'See More',
    'common.back': 'Go Back',
    'common.currency': '৳',
    'common.taka': 'Taka',
    'common.optional': 'Optional',
    'common.required': 'Required',
    'common.dismiss': 'Dismiss',
    'common.ok': 'OK',

    // Footer
    'footer.tagline': "Bangladesh's trusted online shopping destination",
    'footer.follow_us': 'Follow Us',
    'footer.about_us': 'About Us',
    'footer.contact_us': 'Contact Us',
    'footer.return_policy': 'Return Policy',
    'footer.track_order': 'Track Order',
    'footer.loading': 'Loading Footer...',

    // Footer newsletter
    'footer.newsletter_title': 'Subscribe to Newsletter',
    'footer.newsletter_desc': 'Be the first to know about new products and offers',
    'footer.newsletter_placeholder': 'Enter your email',
    'footer.newsletter_btn': 'Subscribe',
  }
};

let currentLang = localStorage.getItem('eonlinebazar_lang') || 'en';

function t(key, vars = {}) {
  const text = translations[currentLang]?.[key]
    || translations.en?.[key]
    || translations.bn?.[key]
    || key;
  return text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

function updateLangLabel() {
  document.querySelectorAll('#lang-label').forEach((el) => {
    el.textContent = currentLang === 'bn' ? 'EN' : 'BN';
  });
}

function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('eonlinebazar_lang', lang);
  document.documentElement.lang = lang === 'bn' ? 'bn' : 'en';
  updateLangLabel();
  if (window.EOBLocaleCoordinator && typeof window.EOBLocaleCoordinator.refreshAll === 'function') {
    window.EOBLocaleCoordinator.refreshAll(lang);
  } else {
    applyTranslations();
    document.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
  }
}

function getCurrentLang() { return currentLang; }

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    let vars = {};
    const varsRaw = el.getAttribute('data-i18n-vars');
    if (varsRaw) {
      try {
        vars = JSON.parse(varsRaw);
      } catch (_) { /* ignore */ }
    }
    el.textContent = t(key, vars);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });

  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
  });

  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
  });

  document.querySelectorAll('option[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
}

function formatCurrency(amount) {
  if (currentLang === 'bn') {
    return '৳' + Number(amount).toLocaleString('bn-BD');
  }
  return '৳' + Number(amount).toLocaleString('en-US');
}

function formatDate(date) {
  return new Date(date).toLocaleDateString(
    currentLang === 'bn' ? 'bn-BD' : 'en-US',
    { year: 'numeric', month: 'long', day: 'numeric' }
  );
}

window.i18n = { t, setLanguage, getCurrentLang, applyTranslations, formatCurrency, formatDate };

document.addEventListener('languageChanged', (e) => {
  document.querySelectorAll('#lang-label').forEach((el) => {
    el.textContent = e.detail.lang === 'bn' ? 'EN' : 'BN';
  });
});

function bootstrapI18n() {
  document.documentElement.lang = currentLang === 'bn' ? 'bn' : 'en';
  applyTranslations();
  updateLangLabel();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapI18n);
} else {
  bootstrapI18n();
}
