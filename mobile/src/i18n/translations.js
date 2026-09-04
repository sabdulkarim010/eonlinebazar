export const translations = {
  en: {
    'nav.login': 'Sign in',
    'nav.profile': 'Account',
    'home.shop_by_category': 'Shop by Category',
    'home.see_all': 'See all',
    'home.flash_sale': 'Flash Sale',
    'product.add_to_cart': 'Add to Cart',
    'product.in_stock': 'In Stock',
    'product.out_of_stock': 'Out of Stock',
    'product.low_stock': 'Limited Stock',
    'cart.select_all': 'Select all',
    'cart.proceed_checkout': 'Proceed to Checkout',
    'profile.language': 'Language',
    'profile.language_en': 'English',
    'profile.language_bn': 'বাংলা',
    'order.tracking': 'Order Tracking',
    'common.loading': 'Loading…',
  },
  bn: {
    'nav.login': 'সাইন ইন',
    'nav.profile': 'অ্যাকাউন্ট',
    'home.shop_by_category': 'ক্যাটাগরি অনুযায়ী কিনুন',
    'home.see_all': 'সব দেখুন',
    'home.flash_sale': 'ফ্ল্যাশ সেল',
    'product.add_to_cart': 'কার্টে যোগ করুন',
    'product.in_stock': 'স্টকে আছে',
    'product.out_of_stock': 'স্টক নেই',
    'product.low_stock': 'সীমিত স্টক',
    'cart.select_all': 'সব নির্বাচন',
    'cart.proceed_checkout': 'চেকআউট করুন',
    'profile.language': 'ভাষা',
    'profile.language_en': 'English',
    'profile.language_bn': 'বাংলা',
    'order.tracking': 'অর্ডার ট্র্যাকিং',
    'common.loading': 'লোড হচ্ছে…',
  },
};

export function translate(lang, key, vars = {}) {
  const table = translations[lang] || translations.en;
  let text = table[key] || translations.en[key] || key;
  Object.entries(vars).forEach(([name, value]) => {
    text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value));
  });
  return text;
}
