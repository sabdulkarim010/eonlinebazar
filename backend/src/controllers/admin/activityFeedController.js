/********************************************************************
 * Project: EonlineBazar — Unified Activity Feed
 * File: activityFeedController.js
 * Location: controllers/admin/activityFeedController.js
 * Description: Paginated SecurityLog feed with filters and normalized
 * entries for the admin Activity Feed timeline UI.
 ********************************************************************/

const SecurityLog = require('../../models/securityLog');
const { RESOURCE_TYPES } = require('../../models/securityLog');

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

function parsePagination(query) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 25, 1), 100);
    return { page, limit, skip: (page - 1) * limit };
}

function buildDateFilter(query) {
    const range = {};
    const { dateFrom, dateTo } = query;

    if (dateFrom) {
        const from = new Date(dateFrom);
        if (!Number.isNaN(from.getTime())) range.$gte = from;
    }

    if (dateTo) {
        const to = new Date(dateTo);
        if (!Number.isNaN(to.getTime())) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(String(dateTo).trim())) {
                to.setHours(23, 59, 59, 999);
            }
            range.$lte = to;
        }
    }

    return Object.keys(range).length ? { createdAt: range } : {};
}

function formatResourceType(resourceType) {
    if (!resourceType) return 'Activity';
    return RESOURCE_TYPE_LABELS[resourceType] || String(resourceType).replace(/_/g, ' ');
}

function deriveResourceLabel(log) {
    const details = String(log.details || '').trim();
    if (details) return details;

    if (log.resourceId) {
        return `${formatResourceType(log.resourceType)} #${log.resourceId}`;
    }

    return formatResourceType(log.resourceType);
}

function normalizeFeedEntry(log) {
    return {
        id: String(log._id),
        actor: log.actor || 'system',
        actorType: log.actorType || 'system',
        action: log.action || 'Activity',
        resourceType: log.resourceType || null,
        resourceLabel: deriveResourceLabel(log),
        timestamp: log.createdAt,
        details: log.details || ''
    };
}

/**
 * GET /api/admin/activity-feed
 * Paginated unified activity feed from SecurityLog.
 * Query: page, limit, resourceType, actor, dateFrom, dateTo
 */
exports.getActivityFeed = async (req, res) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const filter = { ...buildDateFilter(req.query) };

        const resourceType = String(req.query.resourceType || '').trim();
        if (resourceType && RESOURCE_TYPES.includes(resourceType)) {
            filter.resourceType = resourceType;
        }

        const actor = String(req.query.actor || '').trim();
        if (actor) {
            filter.actor = actor;
        }

        const [logs, total, actors] = await Promise.all([
            SecurityLog.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            SecurityLog.countDocuments(filter),
            SecurityLog.distinct('actor', { actor: { $nin: [null, '', 'system'] } })
        ]);

        res.status(200).json({
            success: true,
            data: logs.map(normalizeFeedEntry),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1
            },
            filters: {
                resourceTypes: RESOURCE_TYPES,
                actors: actors
                    .filter(Boolean)
                    .sort((a, b) => String(a).localeCompare(String(b)))
            }
        });
    } catch (error) {
        console.error('getActivityFeed Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load activity feed.' });
    }
};
