const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'client', 'js');

const KEY_MAP = {
    cart: 'CART',
    token: 'TOKEN',
    customerToken: 'CUSTOMER_TOKEN',
    userToken: 'USER_TOKEN',
    userName: 'USER_NAME',
    customerData: 'CUSTOMER_DATA',
    userInfo: 'USER_INFO',
    user: 'USER',
    activeCheckoutSession: 'ACTIVE_CHECKOUT_SESSION',
    isBuyNowMode: 'IS_BUY_NOW_MODE',
    buy_now_item: 'BUY_NOW_ITEM',
    appliedCoupon: 'APPLIED_COUPON',
    lastOrderLockedPricing: 'LAST_ORDER_LOCKED_PRICING',
    shippingCourierNote: 'SHIPPING_COURIER_NOTE',
    shippingFullName: 'SHIPPING_FULL_NAME',
    shippingMobile: 'SHIPPING_MOBILE',
    shippingAddress: 'SHIPPING_ADDRESS',
    shippingDistrict: 'SHIPPING_DISTRICT',
    checkout_name: 'CHECKOUT_NAME',
    checkout_phone: 'CHECKOUT_PHONE',
    checkout_email: 'CHECKOUT_EMAIL',
    checkout_address: 'CHECKOUT_ADDRESS',
    checkout_district: 'CHECKOUT_DISTRICT',
    checkout_upazila: 'CHECKOUT_UPAZILA',
    checkout_full_address: 'CHECKOUT_FULL_ADDRESS',
    adminToken: 'ADMIN_TOKEN',
    adminProfilePic: 'ADMIN_PROFILE_PIC',
    financeToken: 'FINANCE_TOKEN',
    eob_theme: 'EOB_THEME',
    eonlinebazar_lang: 'EOB_LANG',
    eobSearchCategoryScope: 'EOB_SEARCH_CATEGORY_SCOPE',
    chatConversationId: 'CHAT_CONVERSATION_ID',
    cw_room_id: 'CHAT_ROOM_ID'
};

function walk(dir, out = []) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p, out);
        else if (ent.name.endsWith('.js')) out.push(p);
    }
    return out;
}

function keyExpr(literalKey) {
    const prop = KEY_MAP[literalKey];
    if (prop) return `window.EOBStorageKeys.${prop}`;
    return JSON.stringify(literalKey);
}

function transform(content, file) {
    if (file.replace(/\\/g, '/').endsWith('utils/storage.js')) return content;
    let c = content;

    c = c.replace(/sessionStorage\.getItem\(\s*([^)]+?)\s*\)/g, 'window.EOBStorage.session.get($1)');
    c = c.replace(/sessionStorage\.setItem\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/g, 'window.EOBStorage.session.set($1, $2)');
    c = c.replace(/sessionStorage\.removeItem\(\s*([^)]+?)\s*\)/g, 'window.EOBStorage.session.remove($1)');

    c = c.replace(/JSON\.parse\(\s*localStorage\.getItem\(\s*'([^']+)'\s*\)\s*\|\|\s*'(\[\]|{})'\s*\)/g, (m, k, def) =>
        `window.EOBStorage.getJSON(${keyExpr(k)}, ${def})`);
    c = c.replace(/JSON\.parse\(\s*localStorage\.getItem\(\s*'([^']+)'\s*\)\s*\|\|\s*'null'\s*\)/g, (m, k) =>
        `window.EOBStorage.getJSON(${keyExpr(k)}, null)`);

    c = c.replace(/localStorage\.setItem\(\s*'([^']+)'\s*,\s*JSON\.stringify\(([^)]+)\)\s*\)/g, (m, k, val) =>
        `window.EOBStorage.setJSON(${keyExpr(k)}, ${val})`);

    c = c.replace(/localStorage\.getItem\(\s*'([^']+)'\s*\)/g, (m, k) => `window.EOBStorage.get(${keyExpr(k)})`);
    c = c.replace(/localStorage\.setItem\(\s*'([^']+)'\s*,\s*([^)]+)\)/g, (m, k, v) => `window.EOBStorage.set(${keyExpr(k)}, ${v})`);
    c = c.replace(/localStorage\.removeItem\(\s*'([^']+)'\s*\)/g, (m, k) => `window.EOBStorage.remove(${keyExpr(k)})`);
    c = c.replace(/localStorage\.clear\(\s*\)/g, 'window.EOBStorage.clear()');

    c = c.replace(/localStorage\.getItem\(\s*"([^"]+)"\s*\)/g, (m, k) => `window.EOBStorage.get(${keyExpr(k)})`);
    c = c.replace(/localStorage\.setItem\(\s*"([^"]+)"\s*,\s*([^)]+)\)/g, (m, k, v) => `window.EOBStorage.set(${keyExpr(k)}, ${v})`);
    c = c.replace(/localStorage\.removeItem\(\s*"([^"]+)"\s*\)/g, (m, k) => `window.EOBStorage.remove(${keyExpr(k)})`);

    // Dynamic / variable keys (must run after literal-key passes)
    c = c.replace(/localStorage\.getItem\(/g, 'window.EOBStorage.get(');
    c = c.replace(/localStorage\.setItem\(\s*([^,]+),\s*JSON\.stringify\(([^)]+)\)\s*\)/g, 'window.EOBStorage.setJSON($1, $2)');
    c = c.replace(/localStorage\.setItem\(/g, 'window.EOBStorage.set(');
    c = c.replace(/localStorage\.removeItem\(/g, 'window.EOBStorage.remove(');

    return c;
}

const files = walk(root);
let changed = 0;
for (const file of files) {
    const before = fs.readFileSync(file, 'utf8');
    const after = transform(before, file);
    if (after !== before) {
        fs.writeFileSync(file, after, 'utf8');
        changed += 1;
    }
}
console.log('files changed:', changed);
