/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/core-breadcrumb.js
 * Description: 8-category admin sidebar breadcrumb trail for the admin SPA.
 */

/** Maps section ids to { group, label } for breadcrumb rendering. */
const BREADCRUMB_MAP = {
    'view-overview': { group: null, label: 'Dashboard' },
    'view-manage-products': { group: 'Catalog & Inventory', label: 'Inventory Management' },
    'view-add-product': { group: 'Catalog & Inventory', label: 'Add Product' },
    'view-purchase-orders': { group: 'Catalog & Inventory', label: 'Purchase Orders' },
    'view-suppliers': { group: 'Catalog & Inventory', label: 'Suppliers' },
    'view-warehouses': { group: 'Catalog & Inventory', label: 'Warehouses' },
    'view-orders': { group: 'Sales & POS', label: 'Orders & Fulfillment' },
    'view-pos': { group: 'Sales & POS', label: 'POS System' },
    'view-customers': { group: 'CRM & Support', label: 'Customer Database' },
    'view-messages': { group: 'CRM & Support', label: 'Support Tickets' },
    'view-reviews': { group: 'CRM & Support', label: 'Reviews & Feedback' },
    'view-loyalty-program': { group: 'CRM & Support', label: 'Loyalty Program' },
    'view-newsletter-subscribers': { group: 'Marketing & Growth', label: 'Newsletter Subscribers' },
    'view-newsletter-campaigns': { group: 'Marketing & Growth', label: 'Marketing Campaigns' },
    'view-crm-abandoned': { group: 'Marketing & Growth', label: 'Abandoned Carts' },
    'view-finance': { group: 'Finance & Accounts', label: 'Financial Reports' },
    'view-erp-expenses': { group: 'Finance & Accounts', label: 'Expense Tracking' },
    'view-hrm-employees': { group: 'HRM', label: 'Employees' },
    'view-hrm-attendance': { group: 'HRM', label: 'Attendance & Shifts' },
    'view-hrm-payroll': { group: 'HRM', label: 'Payroll & Salary' },
    'view-hrm-leaves': { group: 'HRM', label: 'Leave Management' },
    'view-staff': { group: 'Settings & Security', label: 'Staff Management' },
    'view-staff-audit': { group: 'Settings & Security', label: 'Staff Audit' },
    'view-security': { group: 'Settings & Security', label: 'Security Logs' },
    'view-audit': { group: 'Settings & Security', label: 'Security & Audit' },
    'view-sessions': { group: 'Settings & Security', label: 'Admin Sessions' },
    'view-settings': { group: 'Settings & Security', label: 'Store Branding' },
    'manage-category': { group: 'Settings & Security', label: 'Catalog — Categories' },
    'manage-brands': { group: 'Settings & Security', label: 'Catalog — Brands' },
    'manage-attributes': { group: 'Settings & Security', label: 'Catalog — Attributes' },
    'manage-navbar-links': { group: 'Settings & Security', label: 'Catalog — Navbar Links' },
    'manage-coupons': { group: 'Settings & Security', label: 'Coupons' },
    'view-banners': { group: 'Settings & Security', label: 'Hero Banners' },
    'view-shipping-payments': { group: 'Settings & Security', label: 'Shipping & Payments' },
    'view-store-config': { group: 'Settings & Security', label: 'Store Configuration' },
    'view-file-manager': { group: 'Settings & Security', label: 'System Tools' }
};

function resolveBreadcrumbMeta(sectionId, clickedItem) {
    const fromItem = clickedItem?.getAttribute?.('data-breadcrumb');
    const mapped = BREADCRUMB_MAP[sectionId];
    if (fromItem) {
        return {
            group: mapped?.group || null,
            label: fromItem
        };
    }
    return mapped || { group: null, label: sectionId };
}

function renderAdminBreadcrumb(sectionId, clickedItem) {
    const container = document.getElementById('admin-breadcrumb');
    if (!container) return;

    const meta = resolveBreadcrumbMeta(sectionId, clickedItem);
    const parts = [];

    parts.push(`<a href="#" class="admin-breadcrumb-link" data-breadcrumb-nav="view-overview">Dashboard</a>`);

    if (meta.group) {
        parts.push(`<span class="admin-breadcrumb-sep" aria-hidden="true">&gt;</span>`);
        parts.push(`<span class="admin-breadcrumb-group">${meta.group}</span>`);
    }

    if (meta.label && meta.label !== 'Dashboard') {
        parts.push(`<span class="admin-breadcrumb-sep" aria-hidden="true">&gt;</span>`);
        parts.push(`<span class="admin-breadcrumb-current">${meta.label}</span>`);
    }

    container.innerHTML = parts.join('');
    container.setAttribute('data-active-section', sectionId || 'view-overview');
}

function setupBreadcrumbNavigation() {
    const container = document.getElementById('admin-breadcrumb');
    if (!container || container.dataset.bound) return;
    container.dataset.bound = '1';

    container.addEventListener('click', (e) => {
        const link = e.target.closest('[data-breadcrumb-nav]');
        if (!link) return;
        e.preventDefault();
        const targetId = link.getAttribute('data-breadcrumb-nav');
        const navItem = document.querySelector(`.sidebar-menu li[data-target="${targetId}"]`);
        if (typeof navigateAdminSection === 'function') {
            navigateAdminSection(targetId, navItem);
        }
    });
}

document.addEventListener('DOMContentLoaded', setupBreadcrumbNavigation);

Object.assign(window, {
    renderAdminBreadcrumb,
    setupBreadcrumbNavigation,
    BREADCRUMB_MAP
});
