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
        key: 'manage_marketing',
        label: 'Manage Marketing',
        description: 'Newsletter subscribers, email campaigns, and promotional outreach.',
        icon: 'fa-envelope-circle-check',
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
    },
    // ── Granular Attendance ─────────────────────────────────────────────
    {
        key: 'view_attendance',
        label: 'View attendance',
        description: 'Open HRM attendance tabs and read attendance records.',
        icon: 'fa-calendar-check',
        group: 'Attendance'
    },
    {
        key: 'mark_attendance_today',
        label: "Mark today's attendance only",
        description: 'Mark or edit attendance for the current date only.',
        icon: 'fa-clock',
        group: 'Attendance'
    },
    {
        key: 'mark_attendance_any_date',
        label: 'Mark any date (HR privilege)',
        description: 'Edit attendance for past or future dates on the Daily Sheet.',
        icon: 'fa-calendar-days',
        group: 'Attendance'
    },
    {
        key: 'lock_attendance_dates',
        label: 'Lock/unlock dates',
        description: 'Lock or unlock attendance dates to prevent further edits.',
        icon: 'fa-lock',
        group: 'Attendance'
    },
    {
        key: 'manual_attendance',
        label: 'Manual entry',
        description: 'Use the Manual Entry tab to backfill or override attendance.',
        icon: 'fa-pen-to-square',
        group: 'Attendance'
    },
    // ── Granular HRM ────────────────────────────────────────────────────
    {
        key: 'view_employees',
        label: 'View employees',
        description: 'Browse the employee roster and profiles.',
        icon: 'fa-users',
        group: 'HRM'
    },
    {
        key: 'edit_employees',
        label: 'Edit employees',
        description: 'Create, update, and deactivate employee records.',
        icon: 'fa-user-pen',
        group: 'HRM'
    },
    {
        key: 'manage_payroll',
        label: 'Manage payroll',
        description: 'Generate, approve, and mark payroll as paid.',
        icon: 'fa-money-check-dollar',
        group: 'HRM'
    },
    {
        key: 'manage_leave',
        label: 'Manage leave',
        description: 'Review and approve leave applications.',
        icon: 'fa-umbrella-beach',
        group: 'HRM'
    },
    // ── Granular Inventory ─────────────────────────────────────────────
    {
        key: 'view_products',
        label: 'View products',
        description: 'Browse the product catalog and stock levels.',
        icon: 'fa-box',
        group: 'Inventory'
    },
    {
        key: 'edit_products',
        label: 'Edit products',
        description: 'Create and update product listings.',
        icon: 'fa-pen',
        group: 'Inventory'
    },
    {
        key: 'manage_stock',
        label: 'Manage stock',
        description: 'Adjust stock quantities and warehouse assignments.',
        icon: 'fa-warehouse',
        group: 'Inventory'
    },
    // ── Granular Orders ───────────────────────────────────────────────
    {
        key: 'view_orders',
        label: 'View orders',
        description: 'Open the live orders list and order details.',
        icon: 'fa-receipt',
        group: 'Orders'
    },
    {
        key: 'update_order_status',
        label: 'Update order status',
        description: 'Change order status including bulk status updates.',
        icon: 'fa-truck-fast',
        group: 'Orders'
    },
    {
        key: 'process_refunds',
        label: 'Process refunds',
        description: 'Approve returns and issue refunds.',
        icon: 'fa-rotate-left',
        group: 'Orders'
    }
]);

const PERMISSION_KEYS = Object.freeze(PERMISSIONS.map(p => p.key));
const PERMISSION_SET = new Set(PERMISSION_KEYS);

/** Legacy coarse permissions imply their granular children for backward compatibility. */
const PERMISSION_IMPLICATIONS = Object.freeze({
    manage_staff: [
        'view_attendance', 'mark_attendance_today', 'mark_attendance_any_date',
        'lock_attendance_dates', 'manual_attendance',
        'view_employees', 'edit_employees', 'manage_payroll', 'manage_leave'
    ],
    manage_orders: ['view_orders', 'update_order_status', 'process_refunds'],
    manage_inventory: ['view_products', 'edit_products', 'manage_stock'],
    manage_customers: ['view_orders'],
    view_analytics: ['view_orders']
});

/**
 * Maps admin panel sections (the `data-target` on each sidebar item) to the
 * permission required to open them. The UI hides anything a staff member
 * cannot use; the API still enforces the same rule on every request.
 */
const SECTION_PERMISSIONS = Object.freeze({
    'view-overview': 'view_analytics',
    'view-customers': 'manage_customers',
    'view-orders': 'manage_orders',
    'view-pos': 'manage_orders',
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
    'view-shipping-payments': 'manage_settings',
    'view-loyalty-program': 'manage_settings',
    'view-store-config': 'manage_settings',
    'view-messages': 'manage_settings',
    'view-settings': 'manage_settings',
    'view-erp-expenses': 'manage_settings',
    'view-staff': 'manage_staff',
    'view-staff-audit': 'manage_security',
    'view-activity-feed': 'manage_security',
    'view-hrm-employees': 'view_employees',
    'view-hrm-attendance': 'view_attendance',
    'view-hrm-payroll': 'manage_payroll',
    'view-hrm-leaves': 'manage_leave',
    'view-newsletter-subscribers': 'manage_marketing',
    'view-newsletter-campaigns': 'manage_marketing',
    'view-crm-abandoned': 'manage_marketing',
    'view-reviews': 'manage_orders',
    'view-suppliers': 'manage_inventory',
    'view-warehouses': 'manage_inventory',
    'view-purchase-orders': 'manage_inventory',
    // Financial reports stay owner-only; the sidebar item also carries
    // data-superadmin-only so staff never see the entry.
    'view-accounts': 'view_analytics',
    'view-finance': 'manage_settings',
    'view-banners': 'manage_catalog',
    'settings-2fa': null
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

/** True when account holds permission directly or via a parent coarse grant. */
function accountHasPermission(account, permission) {
    if (!account) return false;
    if (typeof account.isSuperAdmin === 'function' && account.isSuperAdmin()) return true;
    if (!permission) return true;

    const granted = Array.isArray(account.permissions) ? account.permissions : [];
    if (granted.includes(permission)) return true;

    for (const [parent, children] of Object.entries(PERMISSION_IMPLICATIONS)) {
        if (granted.includes(parent) && children.includes(permission)) return true;
    }

    return false;
}

module.exports = {
    ROLES,
    ROLE_VALUES,
    ACCOUNT_STATUS,
    STATUS_VALUES,
    PERMISSIONS,
    PERMISSION_KEYS,
    PERMISSION_IMPLICATIONS,
    SECTION_PERMISSIONS,
    isValidPermission,
    sanitizePermissions,
    getPermissionCatalog,
    accountHasPermission
};
