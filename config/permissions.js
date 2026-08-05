/********************************************************************
 * Project: EonlineBazar — Role Based Access Control
 * File: permissions.js
 * Location: config/permissions.js
 * Author: Abdul Karim Sheikh
 * Description: Single source of truth for the RBAC engine. The backend
 * middleware, the staff management API, and the admin panel UI all read
 * their permission list from here — add a permission once and it shows up
 * everywhere (checkboxes, sidebar gating, route guards).
 ********************************************************************/

const ROLES = Object.freeze({
    SUPER_ADMIN: 'superadmin',
    STAFF: 'staff'
});

const ROLE_VALUES = Object.freeze([ROLES.SUPER_ADMIN, ROLES.STAFF]);

const ACCOUNT_STATUS = Object.freeze({
    ACTIVE: 'active',
    BLOCKED: 'blocked'
});

const STATUS_VALUES = Object.freeze([ACCOUNT_STATUS.ACTIVE, ACCOUNT_STATUS.BLOCKED]);

/**
 * Every grantable permission. `group` and `icon` are consumed by the staff
 * creation form so new permissions render without touching the frontend.
 */
const PERMISSIONS = Object.freeze([
    {
        key: 'view_analytics',
        label: 'View Analytics',
        description: 'Dashboard overview, sales metrics, and revenue charts.',
        icon: 'fa-chart-pie',
        group: 'Insights'
    },
    {
        key: 'manage_orders',
        label: 'Manage Orders',
        description: 'View live orders, update status, approve returns, and refund.',
        icon: 'fa-cart-shopping',
        group: 'Operations'
    },
    {
        key: 'manage_inventory',
        label: 'Manage Inventory',
        description: 'Create, edit, and delete products and stock levels.',
        icon: 'fa-boxes-stacked',
        group: 'Operations'
    },
    {
        key: 'manage_catalog',
        label: 'Manage Catalog',
        description: 'Categories, brands, navbar links, and product attributes.',
        icon: 'fa-layer-group',
        group: 'Operations'
    },
    {
        key: 'manage_coupons',
        label: 'Manage Coupons',
        description: 'Create discount codes and control redemption limits.',
        icon: 'fa-ticket',
        group: 'Operations'
    },
    {
        key: 'manage_customers',
        label: 'Manage Customers',
        description: 'View customer profiles, order history, and account status.',
        icon: 'fa-users',
        group: 'Operations'
    },
    {
        key: 'manage_settings',
        label: 'Manage Settings',
        description: 'Store branding, delivery charges, and master reward settings.',
        icon: 'fa-gear',
        group: 'Administration'
    },
    {
        key: 'manage_security',
        label: 'Security & Audit',
        description: 'Security logs, login history, and the IP blacklist firewall.',
        icon: 'fa-shield-halved',
        group: 'Administration'
    },
    {
        key: 'manage_staff',
        label: 'Manage Staff',
        description: 'Create staff accounts and assign their permissions.',
        icon: 'fa-user-shield',
        group: 'Administration'
    }
]);

const PERMISSION_KEYS = Object.freeze(PERMISSIONS.map(p => p.key));
const PERMISSION_SET = new Set(PERMISSION_KEYS);

/**
 * Maps admin panel sections (the `data-target` on each sidebar item) to the
 * permission required to open them. The UI hides anything a staff member
 * cannot use; the API still enforces the same rule on every request.
 */
const SECTION_PERMISSIONS = Object.freeze({
    'view-overview': 'view_analytics',
    'view-customers': 'manage_customers',
    'view-orders': 'manage_orders',
    'view-add-product': 'manage_inventory',
    'view-manage-products': 'manage_inventory',
    'manage-category': 'manage_catalog',
    'manage-brands': 'manage_catalog',
    'manage-navbar-links': 'manage_catalog',
    'manage-attributes': 'manage_catalog',
    'manage-coupons': 'manage_coupons',
    'view-security': 'manage_security',
    'view-sessions': null, // every admin may review their own devices
    'view-audit': 'manage_security',
    'view-master-settings': 'manage_settings',
    'view-messages': 'manage_settings',
    'view-settings': null, // own profile / 2FA — platform fields are guarded server-side
    'view-staff': 'manage_staff'
});

function isValidPermission(key) {
    return PERMISSION_SET.has(String(key || '').trim());
}

/**
 * Normalize whatever the client sent into a clean, de-duplicated list of
 * known permission keys. Unknown keys are dropped rather than rejected so a
 * stale browser tab can never grant something that no longer exists.
 */
function sanitizePermissions(input) {
    const raw = Array.isArray(input)
        ? input
        : typeof input === 'string'
            ? input.split(',')
            : [];

    const cleaned = raw
        .map(item => String(item || '').trim().toLowerCase())
        .filter(isValidPermission);

    return [...new Set(cleaned)];
}

/** Permission metadata for the UI, grouped in catalog order. */
function getPermissionCatalog() {
    return PERMISSIONS.map(p => ({ ...p }));
}

module.exports = {
    ROLES,
    ROLE_VALUES,
    ACCOUNT_STATUS,
    STATUS_VALUES,
    PERMISSIONS,
    PERMISSION_KEYS,
    SECTION_PERMISSIONS,
    isValidPermission,
    sanitizePermissions,
    getPermissionCatalog
};
