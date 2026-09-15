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
    countSecurityLogs
} = require('../../services/securityAuditReadService');

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
