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
        description: 'Preset shortcut — grants all Sales & Orders keys via Order Manager / Full Admin.',
        icon: 'fa-cart-shopping',
        group: 'Sales & Orders',
        preset_only: true
    },
    {
        key: 'manage_inventory',
        label: 'Manage Inventory',
        description: 'Preset shortcut — grants all Catalog & Inventory keys via Inventory Manager / Full Admin.',
        icon: 'fa-boxes-stacked',
        group: 'Catalog',
        preset_only: true
    },
    {
        key: 'manage_catalog',
        label: 'Manage Catalog',
        description: 'Preset shortcut — grants catalog category/brand/attribute keys.',
        icon: 'fa-layer-group',
        group: 'Catalog',
        preset_only: true
    },
    {
        key: 'manage_coupons',
        label: 'Manage Coupons',
        description: 'Create discount codes and control redemption limits.',
        icon: 'fa-ticket',
        group: 'Marketing'
    },
    {
        key: 'manage_customers',
        label: 'Manage Customers',
        description: 'Preset shortcut — grants customer and support ticket keys.',
        icon: 'fa-users',
        group: 'Sales & Orders',
        preset_only: true
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
        description: 'Preset shortcut — grants all Marketing keys via Full Admin.',
        icon: 'fa-envelope-circle-check',
        group: 'Marketing',
        preset_only: true
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
    {
        key: 'view_daily_sheet',
        label: 'View Daily Sheet',
        description: 'View the daily attendance sheet.',
        icon: 'fa-calendar-day',
        group: 'Attendance'
    },
    {
        key: 'view_attendance_register',
        label: 'View Attendance Register',
        description: 'View full attendance register history.',
        icon: 'fa-table-list',
        group: 'Attendance'
    },
    {
        key: 'view_shifts',
        label: 'View Shifts',
        description: 'View shift rosters and schedules.',
        icon: 'fa-clock',
        group: 'Attendance'
    },
    {
        key: 'view_late_report',
        label: 'View Late Report',
        description: 'View late arrival reports.',
        icon: 'fa-triangle-exclamation',
        group: 'Attendance'
    },
    {
        key: 'view_own_attendance',
        label: 'View Own Attendance',
        description: 'View personal attendance history and records.',
        icon: 'fa-calendar-check',
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
    {
        key: 'view_payroll',
        label: 'View Payroll',
        description: 'View payroll and salary records.',
        icon: 'fa-money-bill-wave',
        group: 'HRM'
    },
    {
        key: 'process_payroll',
        label: 'Process Payroll',
        description: 'Run and process payroll cycles.',
        icon: 'fa-money-check',
        group: 'HRM'
    },
    {
        key: 'view_leave_requests',
        label: 'View Leave Requests',
        description: 'View staff leave applications.',
        icon: 'fa-plane-departure',
        group: 'HRM'
    },
    {
        key: 'approve_leave',
        label: 'Approve/Reject Leave',
        description: 'Approve or reject leave applications.',
        icon: 'fa-check-circle',
        group: 'HRM'
    },
    {
        key: 'apply_leave_for_staff',
        label: 'Apply Leave for Staff',
        description: 'Submit leave on behalf of a staff member.',
        icon: 'fa-file-signature',
        group: 'HRM'
    },
    {
        key: 'apply_own_leave',
        label: 'Apply Own Leave',
        description: 'Submit leave applications for yourself.',
        icon: 'fa-plane',
        group: 'HRM'
    },
    {
        key: 'view_own_payslip',
        label: 'View Own Payslip',
        description: 'View personal salary slips.',
        icon: 'fa-file-invoice-dollar',
        group: 'HRM'
    },
    // ── Granular Inventory ─────────────────────────────────────────────
    {
        key: 'view_products',
        label: 'View products',
        description: 'Browse the product catalog and stock levels.',
        icon: 'fa-box',
        group: 'Catalog'
    },
    {
        key: 'edit_products',
        label: 'Edit products',
        description: 'Create and update product listings.',
        icon: 'fa-pen',
        group: 'Catalog'
    },
    {
        key: 'manage_stock',
        label: 'Manage stock',
        description: 'Adjust stock quantities and warehouse assignments.',
        icon: 'fa-warehouse',
        group: 'Catalog'
    },
    {
        key: 'manage_suppliers',
        label: 'Manage Suppliers',
        description: 'View and manage supplier records.',
        icon: 'fa-building',
        group: 'Catalog'
    },
    {
        key: 'manage_warehouses',
        label: 'Manage Warehouses',
        description: 'View and manage warehouse locations.',
        icon: 'fa-warehouse',
        group: 'Catalog'
    },
    {
        key: 'manage_purchase_orders',
        label: 'Manage Purchase Orders',
        description: 'Create and manage purchase orders.',
        icon: 'fa-file-invoice',
        group: 'Catalog'
    },
    // ── Granular Orders ───────────────────────────────────────────────
    {
        key: 'view_orders',
        label: 'View orders',
        description: 'Open the live orders list and order details.',
        icon: 'fa-receipt',
        group: 'Sales & Orders'
    },
    {
        key: 'update_order_status',
        label: 'Update order status',
        description: 'Change order status including bulk status updates.',
        icon: 'fa-truck-fast',
        group: 'Sales & Orders'
    },
    {
        key: 'process_refunds',
        label: 'Process refunds',
        description: 'Approve returns and issue refunds.',
        icon: 'fa-rotate-left',
        group: 'Sales & Orders'
    },
    {
        key: 'manage_couriers',
        label: 'Manage Couriers',
        description: 'View and manage courier assignments.',
        icon: 'fa-truck',
        group: 'Sales & Orders'
    },
    {
        key: 'access_pos',
        label: 'POS System',
        description: 'Access the point-of-sale terminal',
        icon: 'fa-cash-register',
        group: 'Sales & Orders'
    },
    {
        key: 'view_abandoned_carts',
        label: 'Abandoned Carts',
        description: 'View and recover abandoned carts',
        icon: 'fa-cart-arrow-down',
        group: 'Sales & Orders'
    },
    {
        key: 'access_live_chat',
        label: 'Live Chat',
        description: 'Access live customer chat',
        icon: 'fa-comments',
        group: 'Sales & Orders'
    },
    {
        key: 'manage_tickets',
        label: 'Support Tickets',
        description: 'View and respond to support tickets',
        icon: 'fa-headset',
        group: 'Sales & Orders'
    },
    // ── Granular Operations (Sales & Support) ─────────────────────────
    {
        key: 'view_customers',
        label: 'View Customers',
        description: 'View customer list and profiles.',
        icon: 'fa-users',
        group: 'Sales & Orders'
    },
    {
        key: 'manage_support_tickets',
        label: 'Manage Support Tickets',
        description: 'Legacy preset shortcut — use manage_tickets instead.',
        icon: 'fa-headset',
        group: 'Sales & Orders',
        preset_only: true
    },
    {
        key: 'view_reviews',
        label: 'View Reviews',
        description: 'View product reviews and feedback.',
        icon: 'fa-star',
        group: 'Sales & Orders'
    },
    // ── Granular Marketing ────────────────────────────────────────────
    {
        key: 'manage_banners',
        label: 'Manage Banners',
        description: 'Edit hero banners and promotions.',
        icon: 'fa-image',
        group: 'Marketing'
    },
    {
        key: 'manage_navbar',
        label: 'Manage Navbar Links',
        description: 'Edit navigation menu links.',
        icon: 'fa-bars',
        group: 'Marketing'
    },
    {
        key: 'manage_loyalty',
        label: 'Manage Loyalty Program',
        description: 'Configure loyalty points and rewards.',
        icon: 'fa-gift',
        group: 'Marketing'
    },
    // ── Granular Accounts ─────────────────────────────────────────────
    {
        key: 'view_accounts',
        label: 'View Accounts Overview',
        description: 'View financial accounts summary.',
        icon: 'fa-chart-pie',
        group: 'Accounts'
    },
    {
        key: 'view_financial_reports',
        label: 'View Financial Reports',
        description: 'Access financial and revenue reports.',
        icon: 'fa-file-chart-line',
        group: 'Accounts'
    },
    {
        key: 'manage_expenses',
        label: 'Manage Expenses',
        description: 'View and record business expenses.',
        icon: 'fa-receipt',
        group: 'Accounts'
    }
]);

const PERMISSION_KEYS = Object.freeze(PERMISSIONS.map(p => p.key));
const PERMISSION_SET = new Set(PERMISSION_KEYS);

/** Legacy coarse permissions imply their granular children for backward compatibility. */
const PERMISSION_IMPLICATIONS = Object.freeze({
    manage_staff: [
        'view_employees', 'edit_employees',
        'view_attendance', 'view_daily_sheet', 'view_attendance_register', 'view_shifts',
        'view_late_report', 'mark_attendance_today', 'mark_attendance_any_date',
        'lock_attendance_dates', 'manual_attendance',
        'view_payroll', 'process_payroll', 'view_leave_requests', 'approve_leave',
        'apply_leave_for_staff', 'manage_payroll', 'manage_leave'
    ],
    manage_orders: [],
    manage_support_tickets: ['manage_tickets'],
    manage_inventory: [
        'view_products', 'edit_products', 'manage_stock', 'manage_catalog',
        'manage_suppliers', 'manage_warehouses', 'manage_purchase_orders'
    ],
    manage_marketing: [
        'manage_banners', 'manage_navbar', 'manage_loyalty', 'manage_coupons'
    ],
    manage_settings: [
        'view_accounts', 'view_financial_reports', 'manage_expenses'
    ],
    manage_customers: [
        'view_customers', 'manage_tickets', 'view_reviews'
    ],
    view_analytics: ['view_orders'],
    view_attendance: ['view_daily_sheet', 'view_attendance_register', 'view_late_report']
});

/**
 * Maps admin panel sections (the `data-target` on each sidebar item) to the
 * permission required to open them. The UI hides anything a staff member
 * cannot use; the API still enforces the same rule on every request.
 */
const SECTION_PERMISSIONS = Object.freeze({
    'view-overview': 'view_analytics',
    'view-pos': 'access_pos',
    'view-orders': 'view_orders',
    'view-customers': 'view_customers',
    'view-messages': 'manage_tickets',
    'view-reviews': 'view_reviews',
    'view-crm-abandoned': 'view_abandoned_carts',
    'view-live-chat': 'access_live_chat',
    'view-manage-products': 'view_products',
    'view-add-product': 'edit_products',
    'manage-category': 'manage_catalog',
    'manage-brands': 'manage_catalog',
    'manage-attributes': 'manage_catalog',
    'view-suppliers': 'manage_suppliers',
    'view-warehouses': 'manage_warehouses',
    'view-purchase-orders': 'manage_purchase_orders',
    'view-newsletter-campaigns': 'manage_marketing',
    'view-newsletter-subscribers': 'manage_marketing',
    'manage-coupons': 'manage_coupons',
    'view-banners': 'manage_banners',
    'manage-navbar-links': 'manage_navbar',
    'view-loyalty-program': 'manage_loyalty',
    'view-hrm-employees': 'view_employees',
    'view-staff': 'manage_staff',
    'view-hrm-attendance': 'view_attendance',
    'view-hrm-payroll': 'view_payroll',
    'view-hrm-leaves': 'view_leave_requests',
    'view-accounts': 'view_accounts',
    'view-finance': 'view_financial_reports',
    'view-erp-expenses': 'manage_expenses',
    'view-settings': 'manage_settings',
    'view-activity-feed': 'manage_security',
    'view-system-backup': null,
    'view-security': 'manage_security',
    'view-sessions': null, // every admin may review their own devices
    'view-audit': 'manage_security',
    'view-shipping-payments': 'manage_settings',
    'view-store-config': 'manage_settings',
    'view-staff-audit': 'manage_security',
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
    return PERMISSIONS.filter(p => !p.preset_only).map(p => ({ ...p }));
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
