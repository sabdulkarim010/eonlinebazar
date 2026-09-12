/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/notifications.js
 * Description: In-app notification center — bell dropdown, API polling, mark read.
 */

const NOTIFICATION_TYPE_ICONS = {
    order: '🛒',
    stock: '⚠️',
    leave: '🏖️',
    payroll: '💰',
    security: '🔒',
    system: '🔔'
};

const NOTIF_POLL_MS = 30000;

let adminNotifications = [];
let adminNotifPollTimer = null;

function notificationIcon(type) {
    return NOTIFICATION_TYPE_ICONS[String(type || '').toLowerCase()] || '🔔';
}

function updateAdminNotifBellBadge(count = adminNotifUnread) {
    const countEl = document.getElementById('adminNotifBellCount');
    if (!countEl) return;
    if (count <= 0) {
        countEl.hidden = true;
        countEl.textContent = '0';
    } else {
        countEl.hidden = false;
        countEl.textContent = String(count);
    }
}

function renderAdminNotifDropdown() {
    const listEl = document.getElementById('adminNotifDropdownList');
    if (!listEl) return;

    if (!adminNotifications.length) {
        listEl.innerHTML = '<p class="admin-notif-empty">No notifications yet</p>';
        return;
    }

    listEl.innerHTML = adminNotifications.slice(0, 10).map((item) => {
        const unreadClass = item.isRead ? '' : ' is-unread';
        const unreadDot = item.isRead ? '' : '<span class="admin-notif-unread-dot" aria-hidden="true"></span>';
        return `
            <button type="button" class="admin-notif-item${unreadClass}" data-notif-id="${item._id}" onclick="handleAdminNotificationClick('${item._id}')">
                <span class="admin-notif-item-icon">${notificationIcon(item.type)}</span>
                <div class="admin-notif-item-body">
                    <p class="admin-notif-item-title">${escapeToastText(item.title || 'Notification')}</p>
                    <p class="admin-notif-item-msg">${escapeToastText(item.message || '')}</p>
                    <span class="admin-notif-item-time">${escapeToastText(formatTimeAgo(item.createdAt))}</span>
                </div>
                ${unreadDot}
            </button>
        `;
    }).join('');
}

async function fetchAdminUnreadCount() {
    if (!token) return 0;
    try {
        const res = await fetch('/api/admin/notifications/unread-count', {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
            handleAdminApiAuthResponse(res, await res.json().catch(() => ({})));
            return adminNotifUnread;
        }
        const data = await res.json();
        adminNotifUnread = Number(data.unreadCount) || 0;
        updateAdminNotifBellBadge(adminNotifUnread);
        return adminNotifUnread;
    } catch (err) {
        console.warn('[Notifications] unread count poll failed:', err.message);
        return adminNotifUnread;
    }
}

async function fetchAdminNotifications() {
    if (!token) return;
    try {
        const res = await fetch('/api/admin/notifications?limit=20', {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
            handleAdminApiAuthResponse(res, await res.json().catch(() => ({})));
            return;
        }
        const data = await res.json();
        adminNotifications = Array.isArray(data.data) ? data.data : [];
        adminNotifUnread = Number(data.unreadCount) || 0;
        updateAdminNotifBellBadge(adminNotifUnread);
        renderAdminNotifDropdown();
    } catch (err) {
        console.warn('[Notifications] list fetch failed:', err.message);
    }
}

async function markAdminNotificationRead(id) {
    if (!id || !token) return false;
    try {
        const res = await fetch(`/api/admin/notifications/${encodeURIComponent(id)}/read`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return false;
        adminNotifications = adminNotifications.map((item) => (
            String(item._id) === String(id) ? { ...item, isRead: true } : item
        ));
        await fetchAdminUnreadCount();
        renderAdminNotifDropdown();
        return true;
    } catch (err) {
        console.warn('[Notifications] mark read failed:', err.message);
        return false;
    }
}

async function markAllAdminNotificationsRead() {
    if (!token) return;
    try {
        const res = await fetch('/api/admin/notifications/mark-all-read', {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return;
        adminNotifications = adminNotifications.map((item) => ({ ...item, isRead: true }));
        adminNotifUnread = 0;
        updateAdminNotifBellBadge(0);
        renderAdminNotifDropdown();
    } catch (err) {
        console.warn('[Notifications] mark all read failed:', err.message);
    }
}

async function handleAdminNotificationClick(id) {
    const item = adminNotifications.find((n) => String(n._id) === String(id));
    if (!item) return;

    await markAdminNotificationRead(id);

    const dropdown = document.getElementById('adminNotifDropdown');
    if (dropdown) dropdown.hidden = true;

    const link = String(item.link || '').trim();
    if (!link) return;

    if (typeof window.navigateAdminSection === 'function') {
        window.navigateAdminSection(link);
        return;
    }

    const navItem = document.querySelector(`.sidebar-menu li[data-target="${link}"]`);
    if (navItem) navItem.click();
}

function setupAdminNotifBell() {
    const btn = document.getElementById('adminNotifBellBtn');
    const dropdown = document.getElementById('adminNotifDropdown');
    const markAllBtn = document.getElementById('adminNotifMarkAllRead');

    if (btn && dropdown) {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const willOpen = dropdown.hidden;
            dropdown.hidden = !willOpen;
            if (willOpen) {
                await fetchAdminNotifications();
            }
        });

        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
                dropdown.hidden = true;
            }
        });
    }

    if (markAllBtn) {
        markAllBtn.addEventListener('click', () => {
            markAllAdminNotificationsRead();
        });
    }

    renderAdminNotifDropdown();
}

function startAdminNotificationPolling() {
    if (adminNotifPollTimer) return;
    fetchAdminUnreadCount();
    adminNotifPollTimer = window.setInterval(() => {
        fetchAdminUnreadCount();
    }, NOTIF_POLL_MS);
}

function initAdminNotificationCenter() {
    setupAdminNotifBell();
    startAdminNotificationPolling();
    fetchAdminNotifications();
}

function refreshAdminNotifications() {
    fetchAdminUnreadCount();
    const dropdown = document.getElementById('adminNotifDropdown');
    if (dropdown && !dropdown.hidden) {
        fetchAdminNotifications();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (token) initAdminNotificationCenter();
});

Object.assign(window, {
    initAdminNotificationCenter,
    refreshAdminNotifications,
    fetchAdminNotifications,
    fetchAdminUnreadCount,
    markAdminNotificationRead,
    markAllAdminNotificationsRead,
    handleAdminNotificationClick,
    setupAdminNotifBell,
    updateAdminNotifBellBadge,
    renderAdminNotifDropdown
});
