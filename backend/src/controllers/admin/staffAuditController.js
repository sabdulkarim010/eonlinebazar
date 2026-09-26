/********************************************************************
 * Project: EonlineBazar — Staff Activity Audit
 * File: staffAuditController.js
 * Location: controllers/admin/staffAuditController.js
 * Description: Paginated SecurityLog views grouped by admin actor with
 * resourceType breakdown for the staff activity dashboard.
 ********************************************************************/

const {
    fetchStaffAuditGroups,
    fetchSecurityLogsPage,
    countSecurityLogs,
    fetchHrmAuditLogsPage
} = require('../../services/securityAuditReadService');
const { shapeHrmAuditLogRow, HRM_ACTION_TYPES } = require('../../services/hrmAuditService');

function parsePagination(query) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 25, 1), 100);
    return { page, limit, skip: (page - 1) * limit };
}

/**
 * GET /api/admin/staff-audit
 * Paginated admin activity grouped by actor with resourceType breakdown.
 */
exports.getStaffActivity = async (req, res) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);

        const { data, total } = await fetchStaffAuditGroups({ skip, limit });

        res.status(200).json({
            success: true,
            data,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1
            }
        });
    } catch (error) {
        console.error('getStaffActivity Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load staff activity.' });
    }
};

/**
 * GET /api/admin/staff-audit/:username
 * Full paginated log for a specific staff/admin username.
 */
exports.getStaffActivityDetail = async (req, res) => {
    try {
        const username = String(req.params.username || '').trim();
        if (!username) {
            return res.status(400).json({ success: false, message: 'Username is required.' });
        }

        const { page, limit, skip } = parsePagination(req.query);

        const filter = { actorType: 'admin', actor: username };

        const [logs, total] = await Promise.all([
            fetchSecurityLogsPage({ skip, limit, filter }),
            countSecurityLogs(filter)
        ]);

        res.status(200).json({
            success: true,
            username,
            data: logs.map((log) => ({
                _id: log._id,
                action: log.action,
                actor: log.actor,
                actorType: log.actorType,
                ipAddress: log.ipAddress,
                details: log.details,
                resourceType: log.resourceType || null,
                resourceId: log.resourceId || null,
                timestamp: log.createdAt
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1
            }
        });
    } catch (error) {
        console.error('getStaffActivityDetail Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load staff activity detail.' });
    }
};

function parseDateRangeQuery(query) {
    const dateFrom = query.dateFrom || query.from || null;
    const dateTo = query.dateTo || query.to || null;
    return {
        dateFrom: dateFrom ? new Date(dateFrom) : null,
        dateTo: dateTo ? new Date(dateTo) : null
    };
}

/**
 * GET /api/admin/staff-audit/hrm
 * Filterable HRM audit trail (staffId, actionType, dateRange).
 */
exports.getHrmAuditEvents = async (req, res) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const staffId = String(req.query.staffId || req.query.targetStaffId || '').trim() || undefined;
        const actionType = String(req.query.actionType || req.query.action || '').trim() || undefined;
        const { dateFrom, dateTo } = parseDateRangeQuery(req.query);

        if (dateFrom && Number.isNaN(dateFrom.getTime())) {
            return res.status(400).json({ success: false, message: 'Invalid dateFrom.' });
        }
        if (dateTo && Number.isNaN(dateTo.getTime())) {
            return res.status(400).json({ success: false, message: 'Invalid dateTo.' });
        }

        const { logs, total } = await fetchHrmAuditLogsPage({
            skip,
            limit,
            staffId,
            actionType,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined
        });

        res.status(200).json({
            success: true,
            filters: { staffId: staffId || null, actionType: actionType || null, dateFrom, dateTo },
            actionTypes: HRM_ACTION_TYPES,
            data: logs.map(shapeHrmAuditLogRow),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1
            }
        });
    } catch (error) {
        console.error('getHrmAuditEvents Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load HRM audit events.' });
    }
};
