/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/core-breadcrumb.js
 * Description: 7-module enterprise sidebar breadcrumb trail for the admin SPA.
 */

/** Maps section ids to { group, label } for breadcrumb rendering. */
const BREADCRUMB_MAP = {
    'view-overview': { group: null, label: 'Dashboard' },
    'view-pos': { group: 'Sales & Orders', label: 'POS System' },
    'view-orders': { group: 'Sales & Orders', label: 'Orders & Fulfillment' },
    'view-customers': { group: 'Sales & Orders', label: 'Customer Database' },
    'view-messages': { group: 'Sales & Orders', label: 'Support Tickets' },
    'view-reviews': { group: 'Sales & Orders', label: 'Reviews & Feedback' },
    'view-crm-abandoned': { group: 'Sales & Orders', label: 'Abandoned Carts' },
    'view-manage-products': { group: 'Catalog & Inventory', label: 'Inventory Management' },
    'view-add-product': { group: 'Catalog & Inventory', label: 'Add Product' },
    'manage-category': { group: 'Catalog & Inventory', label: 'Categories' },
    'manage-brands': { group: 'Catalog & Inventory', label: 'Brands' },
    'manage-attributes': { group: 'Catalog & Inventory', label: 'Attributes' },
    'view-suppliers': { group: 'Catalog & Inventory', label: 'Suppliers' },
    'view-warehouses': { group: 'Catalog & Inventory', label: 'Warehouses' },
    'view-purchase-orders': { group: 'Catalog & Inventory', label: 'Purchase Orders' },
    'view-newsletter-campaigns': { group: 'Marketing & Content', label: 'Marketing Campaigns' },
    'view-newsletter-subscribers': { group: 'Marketing & Content', label: 'Newsletter Subscribers' },
    'manage-coupons': { group: 'Marketing & Content', label: 'Coupons' },
    'view-banners': { group: 'Marketing & Content', label: 'Hero Banners' },
    'manage-navbar-links': { group: 'Marketing & Content', label: 'Navbar Menu Links' },
    'view-loyalty-program': { group: 'Marketing & Content', label: 'Loyalty Program' },
    'view-hrm-employees': { group: 'HRM & Staff', label: 'Employees' },
    'view-staff': { group: 'HRM & Staff', label: 'System Staff Directory' },
    'view-hrm-attendance': { group: 'HRM & Staff', label: 'Attendance & Shifts' },
    'view-hrm-payroll': { group: 'HRM & Staff', label: 'Payroll & Salary' },
    'view-hrm-leaves': { group: 'HRM & Staff', label: 'Leave Management' },
    'view-finance': { group: 'Accounts & Finance', label: 'Financial Reports' },
    'view-erp-expenses': { group: 'Accounts & Finance', label: 'Expense Tracking' },
    'view-settings': { group: 'System Settings', label: 'Settings Hub' },
    'view-shipping-payments': { group: 'System Settings', label: 'Shipping & Payments' },
    'view-store-config': { group: 'System Settings', label: 'Store Configuration' },
    'view-staff-audit': { group: 'System Settings', label: 'Staff Audit' },
    'view-security': { group: 'System Settings', label: 'Security Logs' },
    'view-audit': { group: 'System Settings', label: 'Security & Audit' },
    'view-sessions': { group: 'System Settings', label: 'Admin Sessions' },
    'view-file-manager': { group: 'System Settings', label: 'File Manager' }
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
