/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/core-breadcrumb.js
 * Description: ERP/CRM/HRM breadcrumb trail for the admin SPA.
 */

/** Maps section ids to { group, label } for breadcrumb rendering. */
const BREADCRUMB_MAP = {
    'view-overview': { group: null, label: 'Dashboard' },
    'view-manage-products': { group: 'ERP', label: 'Inventory Management' },
    'view-add-product': { group: 'ERP', label: 'Add Product' },
    'view-orders': { group: 'ERP', label: 'Orders & Fulfillment' },
    'view-pos': { group: 'ERP', label: 'POS System' },
    'view-purchase-orders': { group: 'ERP', label: 'Purchase Orders' },
    'view-suppliers': { group: 'ERP', label: 'Suppliers' },
    'view-warehouses': { group: 'ERP', label: 'Warehouses' },
    'view-finance': { group: 'ERP', label: 'Financial Reports' },
    'view-erp-expenses': { group: 'ERP', label: 'Expense Tracking' },
    'view-customers': { group: 'CRM', label: 'Customer Database' },
    'view-newsletter-subscribers': { group: 'CRM', label: 'Newsletter Subscribers' },
    'view-newsletter-campaigns': { group: 'CRM', label: 'Marketing Campaigns' },
    'view-crm-abandoned': { group: 'CRM', label: 'Abandoned Carts' },
    'view-messages': { group: 'CRM', label: 'Support Tickets' },
    'view-reviews': { group: 'CRM', label: 'Reviews & Feedback' },
    'view-staff': { group: 'HRM', label: 'Staff Management' },
    'view-staff-audit': { group: 'HRM', label: 'Staff Audit' },
    'view-hrm-attendance': { group: 'HRM', label: 'Attendance & Shifts' },
    'view-hrm-payroll': { group: 'HRM', label: 'Payroll & Salary' },
    'view-hrm-leaves': { group: 'HRM', label: 'Leave Management' },
    'view-security': { group: 'HRM', label: 'Security Logs' },
    'view-audit': { group: 'HRM', label: 'Security & Audit' },
    'view-sessions': { group: 'HRM', label: 'Admin Sessions' },
    'view-settings': { group: 'Settings', label: 'Store Branding' },
    'manage-category': { group: 'Settings', label: 'Catalog — Categories' },
    'manage-brands': { group: 'Settings', label: 'Catalog — Brands' },
    'manage-attributes': { group: 'Settings', label: 'Catalog — Attributes' },
    'manage-navbar-links': { group: 'Settings', label: 'Catalog — Navbar Links' },
    'manage-coupons': { group: 'Settings', label: 'Coupons' },
    'view-banners': { group: 'Settings', label: 'Hero Banners' },
    'view-shipping-payments': { group: 'Settings', label: 'Shipping & Payments' },
    'view-loyalty-program': { group: 'CRM', label: 'Loyalty Program' },
    'view-store-config': { group: 'Settings', label: 'Store Configuration' },
    'view-file-manager': { group: 'Settings', label: 'System Tools' }
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
