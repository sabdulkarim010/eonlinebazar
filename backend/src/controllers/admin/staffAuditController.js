/********************************************************************
 * Project: EonlineBazar — Staff Activity Audit
 * File: staffAuditController.js
 * Location: controllers/admin/staffAuditController.js
 * Description: Paginated SecurityLog views grouped by admin actor with
 * resourceType breakdown for the staff activity dashboard.
 ********************************************************************/

const SecurityLog = require('../../models/securityLog');

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

        const [groups, totalGroups] = await Promise.all([
            SecurityLog.aggregate([
                { $match: { actorType: 'admin' } },
                {
                    $group: {
                        _id: '$actor',
                        totalActions: { $sum: 1 },
                        lastActivityAt: { $max: '$createdAt' },
                        resourceBreakdown: {
                            $push: {
                                $cond: [
                                    { $ifNull: ['$resourceType', false] },
                                    '$resourceType',
                                    'other'
                                ]
                            }
                        }
                    }
                },
                { $sort: { lastActivityAt: -1 } },
                { $skip: skip },
                { $limit: limit }
            ]),
            SecurityLog.aggregate([
                { $match: { actorType: 'admin' } },
                { $group: { _id: '$actor' } },
                { $count: 'total' }
            ])
        ]);

        const total = totalGroups[0]?.total || 0;

        const data = groups.map((group) => {
            const breakdown = {};
            (group.resourceBreakdown || []).forEach((type) => {
                const key = type || 'other';
                breakdown[key] = (breakdown[key] || 0) + 1;
            });
            return {
                username: group._id || 'unknown',
                totalActions: group.totalActions,
                lastActivityAt: group.lastActivityAt,
                resourceBreakdown: breakdown
            };
        });

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
            SecurityLog.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            SecurityLog.countDocuments(filter)
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
