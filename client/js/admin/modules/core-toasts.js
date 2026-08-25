/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/core-toasts.js
 * Description: Admin toast notifications.
 */
/* ==========================================================================
   CORE MODULE 3: UI UTILITIES - TOASTR & SWEETALERT2
   ========================================================================== */

function initAdminNotifications() {
    if (!document.getElementById('toastContainer')) {
        const container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'admin-toast-stack';
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('aria-atomic', 'true');
        document.body.appendChild(container);
    }
}

/* shared state: ADMIN_TOAST_ICONS lives on window (admin-core) */

function escapeToastText(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Modern floating toast notifications for the admin dashboard.
 */
window.showToast = function(message, type = 'success', durationMs = 4000) {
    initAdminNotifications();
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toastType = Object.prototype.hasOwnProperty.call(ADMIN_TOAST_ICONS, type) ? type : 'info';
    const toast = document.createElement('div');
    toast.className = `admin-toast ${toastType}`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
        <i class="fa-solid ${ADMIN_TOAST_ICONS[toastType]} admin-toast-icon" aria-hidden="true"></i>
        <span class="admin-toast-message">${escapeToastText(message)}</span>
        <button type="button" class="admin-toast-close" aria-label="Dismiss notification">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add('is-visible'));
    });

    let dismissed = false;
    const dismiss = () => {
        if (dismissed) return;
        dismissed = true;
        toast.classList.remove('is-visible');
        toast.classList.add('is-leaving');
        window.setTimeout(() => toast.remove(), 350);
    };

    toast.querySelector('.admin-toast-close')?.addEventListener('click', dismiss);
    window.setTimeout(dismiss, Math.max(Number(durationMs) || 0, 1000));
};

/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    initAdminNotifications,
    escapeToastText
});
