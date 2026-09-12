/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/activity-feed.js
 * Description: Unified activity feed timeline — paginated SecurityLog viewer.
 */
import '../admin-core.js';

const RESOURCE_TYPE_ICONS = {
    product: 'fa-box',
    order: 'fa-cart-shopping',
    customer: 'fa-user',
    staff: 'fa-user-shield',
    setting: 'fa-gear',
    coupon: 'fa-ticket',
    banner: 'fa-image',
    category: 'fa-tags',
    review: 'fa-star',
    supplier: 'fa-truck-field',
    warehouse: 'fa-warehouse',
    purchase_order: 'fa-file-invoice',
    expense: 'fa-receipt',
    attendance: 'fa-user-clock',
    shift: 'fa-clock',
    payroll: 'fa-money-check-dollar',
    leave: 'fa-plane-departure',
    employee: 'fa-id-badge',
    designation: 'fa-briefcase'
};

const RESOURCE_TYPE_LABELS = {
    product: 'Product',
    order: 'Order',
    customer: 'Customer',
    staff: 'Staff',
    setting: 'Setting',
    coupon: 'Coupon',
    banner: 'Banner',
    category: 'Category',
    review: 'Review',
    supplier: 'Supplier',
    warehouse: 'Warehouse',
    purchase_order: 'Purchase Order',
    expense: 'Expense',
    attendance: 'Attendance',
    shift: 'Shift',
    payroll: 'Payroll',
    leave: 'Leave',
    employee: 'Employee',
    designation: 'Designation'
};

let activityFeedPage = 1;
let activityFeedLimit = 25;
let activityFeedFiltersLoaded = false;

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function formatResourceType(resourceType) {
    if (!resourceType) return 'Activity';
    return RESOURCE_TYPE_LABELS[resourceType] || String(resourceType).replace(/_/g, ' ');
}

function actorInitials(actor) {
    const name = String(actor || 'S').trim();
    if (!name || name === 'system') return 'SY';
    const parts = name.split(/[\s._-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
}

function formatRelativeTime(timestamp) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '—';

    const diffMs = date.getTime() - Date.now();
    const diffSec = Math.round(diffMs / 1000);
    const absSec = Math.abs(diffSec);

    const units = [
        ['year', 60 * 60 * 24 * 365],
        ['month', 60 * 60 * 24 * 30],
        ['day', 60 * 60 * 24],
        ['hour', 60 * 60],
        ['minute', 60],
        ['second', 1]
    ];

    for (const [unit, secondsInUnit] of units) {
        if (absSec >= secondsInUnit || unit === 'second') {
            const value = Math.round(diffSec / secondsInUnit);
            if (typeof Intl !== 'undefined' && Intl.RelativeTimeFormat) {
                return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(value, unit);
            }
            return value === 0 ? 'just now' : `${Math.abs(value)} ${unit}${Math.abs(value) === 1 ? '' : 's'} ago`;
        }
    }

    return date.toLocaleString();
}

function dateGroupLabel(timestamp) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return 'Earlier';

    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    if (date >= startOfToday) return 'Today';
    if (date >= startOfYesterday) return 'Yesterday';
    return 'Earlier';
}

function buildFeedDescription(entry) {
    const actor = entry.actor && entry.actor !== 'system' ? entry.actor : 'System';
    const action = String(entry.action || 'performed an action').toLowerCase();
    const label = entry.resourceLabel || '';
    const typeLabel = formatResourceType(entry.resourceType).toLowerCase();

    if (entry.resourceType && label) {
        return `<strong>${escapeHtml(actor)}</strong> ${escapeHtml(action)} ${escapeHtml(typeLabel)} <strong>${escapeHtml(label)}</strong>`;
    }

    if (entry.details) {
        return `<strong>${escapeHtml(actor)}</strong> ${escapeHtml(action)} — ${escapeHtml(entry.details)}`;
    }

    return `<strong>${escapeHtml(actor)}</strong> ${escapeHtml(entry.action || 'performed an action')}`;
}

function readActivityFeedFilters() {
    return {
        resourceType: document.getElementById('activityFeedResourceType')?.value || '',
        actor: document.getElementById('activityFeedActor')?.value || '',
        dateFrom: document.getElementById('activityFeedDateFrom')?.value || '',
        dateTo: document.getElementById('activityFeedDateTo')?.value || ''
    };
}

function populateFilterOptions(filters = {}) {
    const typeSelect = document.getElementById('activityFeedResourceType');
    const actorSelect = document.getElementById('activityFeedActor');
    if (!typeSelect || !actorSelect) return;

    const currentType = typeSelect.value;
    const currentActor = actorSelect.value;

    if (!activityFeedFiltersLoaded) {
        typeSelect.innerHTML = '<option value="">All types</option>' +
            (filters.resourceTypes || []).map((type) =>
                `<option value="${escapeHtml(type)}">${escapeHtml(formatResourceType(type))}</option>`
            ).join('');

        actorSelect.innerHTML = '<option value="">All actors</option>' +
            (filters.actors || []).map((actor) =>
                `<option value="${escapeHtml(actor)}">${escapeHtml(actor)}</option>`
            ).join('');

        activityFeedFiltersLoaded = true;
    }

    if (currentType) typeSelect.value = currentType;
    if (currentActor) actorSelect.value = currentActor;
}

function renderFeed(entries) {
    const container = document.getElementById('activityFeedTimeline');
    if (!container) return;

    if (!entries.length) {
        container.innerHTML = `
            <div class="activity-feed-empty">
                <i class="fa-solid fa-clock-rotate-left"></i>
                <p>No activity recorded for the selected filters.</p>
            </div>`;
        return;
    }

    const groups = new Map();
    entries.forEach((entry) => {
        const label = dateGroupLabel(entry.timestamp);
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(entry);
    });

    const order = ['Today', 'Yesterday', 'Earlier'];
    container.innerHTML = order
        .filter((label) => groups.has(label))
        .map((label) => {
            const items = groups.get(label).map((entry) => {
                const icon = RESOURCE_TYPE_ICONS[entry.resourceType] || 'fa-circle-info';
                const badge = entry.resourceType
                    ? `<span class="activity-feed-resource-badge"><i class="fa-solid ${icon}"></i> ${escapeHtml(formatResourceType(entry.resourceType))}</span>`
                    : '';

                return `
                    <article class="activity-feed-entry">
                        <div class="activity-feed-avatar" aria-hidden="true">${escapeHtml(actorInitials(entry.actor))}</div>
                        <div class="activity-feed-body">
                            <p class="activity-feed-description">${buildFeedDescription(entry)}</p>
                            <div class="activity-feed-meta">${badge}</div>
                        </div>
                        <time class="activity-feed-time" datetime="${escapeHtml(entry.timestamp)}" title="${escapeHtml(new Date(entry.timestamp).toLocaleString())}">
                            ${escapeHtml(formatRelativeTime(entry.timestamp))}
                        </time>
                    </article>`;
            }).join('');

            return `
                <section class="activity-feed-date-group">
                    <h3 class="activity-feed-date-label">${escapeHtml(label)}</h3>
                    ${items}
                </section>`;
        }).join('');
}

function renderActivityFeedPagination(pagination) {
    const wrap = document.getElementById('activityFeedPagination');
    const info = document.getElementById('activityFeedPageInfo');
    const btns = document.getElementById('activityFeedPageBtns');
    if (!wrap || !pagination) return;

    const { page, totalPages, total, limit } = pagination;
    wrap.hidden = total <= limit;

    if (info) {
        info.textContent = total
            ? `Page ${page} of ${totalPages} · ${total} event${total === 1 ? '' : 's'}`
            : 'No events';
    }

    if (!btns) return;

    const prevDisabled = page <= 1 ? 'disabled' : '';
    const nextDisabled = page >= totalPages ? 'disabled' : '';

    btns.innerHTML = `
        <button type="button" class="btn-secondary btn-sm" ${prevDisabled} onclick="loadActivityFeed(${page - 1})">Prev</button>
        <button type="button" class="btn-secondary btn-sm" ${nextDisabled} onclick="loadActivityFeed(${page + 1})">Next</button>`;
}

async function loadActivityFeed(page = activityFeedPage) {
    const container = document.getElementById('activityFeedTimeline');
    if (!container) return;

    activityFeedPage = Math.max(1, page);
    activityFeedLimit = parseInt(document.getElementById('activityFeedLimit')?.value, 10) || activityFeedLimit;

    container.innerHTML = `
        <div class="activity-feed-loading">
            <div class="spinner"></div>
            <p>Loading activity feed...</p>
        </div>`;

    const filters = readActivityFeedFilters();
    const params = new URLSearchParams({
        page: String(activityFeedPage),
        limit: String(activityFeedLimit)
    });

    if (filters.resourceType) params.set('resourceType', filters.resourceType);
    if (filters.actor) params.set('actor', filters.actor);
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);

    try {
        const response = await fetch(`/api/admin/activity-feed?${params}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to load activity feed.');
        }

        populateFilterOptions(data.filters || {});
        renderFeed(data.data || []);
        renderActivityFeedPagination(data.pagination);
    } catch (error) {
        console.error('Activity feed load error:', error);
        container.innerHTML = `
            <div class="activity-feed-empty">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <p>${escapeHtml(error.message || 'Failed to load activity feed.')}</p>
            </div>`;
    }
}

function clearActivityFeedFilters() {
    const ids = ['activityFeedResourceType', 'activityFeedActor', 'activityFeedDateFrom', 'activityFeedDateTo'];
    ids.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    loadActivityFeed(1);
}

Object.assign(window, {
    loadActivityFeed,
    renderFeed,
    clearActivityFeedFilters
});
