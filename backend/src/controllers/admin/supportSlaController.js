/********************************************************************
 * Project: EonlineBazar — Support Ticket SLA Reporting
 * File: supportSlaController.js
 * Description: SLA metrics for contact-form support tickets.
 ********************************************************************/

const ContactMessage = require('../../models/ContactMessage');
const { CLOSED_STATUSES } = require('../../models/ContactMessage');

const OPEN_STATUSES = ['open', 'in_progress'];
const MS_PER_HOUR = 60 * 60 * 1000;

function roundHours(ms) {
    if (ms == null || !Number.isFinite(ms)) return null;
    return Math.round((ms / MS_PER_HOUR) * 100) / 100;
}

function parseDateRange(query) {
    const now = new Date();
    let to = query.to ? new Date(query.to) : now;
    if (Number.isNaN(to.getTime())) to = now;

    let from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * MS_PER_HOUR * 24);
    if (Number.isNaN(from.getTime())) {
        from = new Date(to.getTime() - 30 * MS_PER_HOUR * 24);
    }

    if (from > to) {
        const swap = from;
        from = to;
        to = swap;
    }

    to.setHours(23, 59, 59, 999);
    from.setHours(0, 0, 0, 0);

    return { from, to };
}

function agentKey(assignedTo) {
    const name = String(assignedTo || '').trim();
    return name || '(Unassigned)';
}

function ensureAgentBucket(map, assignedTo) {
    const key = agentKey(assignedTo);
    if (!map[key]) {
        map[key] = {
            assignedTo: key,
            ticketCount: 0,
            firstResponseSamples: [],
            resolutionSamples: [],
            breach24h: 0,
            breach48h: 0,
            breach72h: 0
        };
    }
    return map[key];
}

function finalizeAgentRow(row) {
    const avgFirst = row.firstResponseSamples.length
        ? roundHours(row.firstResponseSamples.reduce((a, b) => a + b, 0) / row.firstResponseSamples.length)
        : null;
    const avgResolution = row.resolutionSamples.length
        ? roundHours(row.resolutionSamples.reduce((a, b) => a + b, 0) / row.resolutionSamples.length)
        : null;

    return {
        assignedTo: row.assignedTo,
        ticketCount: row.ticketCount,
        avgFirstResponseHours: avgFirst,
        avgResolutionHours: avgResolution,
        breach24h: row.breach24h,
        breach48h: row.breach48h,
        breach72h: row.breach72h
    };
}

/**
 * GET /api/admin/support/sla-report?from=&to=
 */
exports.getSlaReport = async (req, res) => {
    try {
        const { from, to } = parseDateRange(req.query);
        const now = Date.now();

        const tickets = await ContactMessage.find({
            createdAt: { $gte: from, $lte: to }
        }).lean();

        let firstResponseTotalMs = 0;
        let firstResponseCount = 0;
        let resolutionTotalMs = 0;
        let resolutionCount = 0;
        let breach24h = 0;
        let breach48h = 0;
        let breach72h = 0;

        const agentMap = {};

        tickets.forEach((ticket) => {
            const createdAt = new Date(ticket.createdAt).getTime();
            const agent = ensureAgentBucket(agentMap, ticket.assignedTo);
            agent.ticketCount += 1;

            const firstAt = ticket.firstResponseAt || ticket.repliedAt;
            if (firstAt) {
                const ms = new Date(firstAt).getTime() - createdAt;
                if (ms >= 0) {
                    firstResponseTotalMs += ms;
                    firstResponseCount += 1;
                    agent.firstResponseSamples.push(ms);
                }
            }

            if (ticket.resolvedAt) {
                const ms = new Date(ticket.resolvedAt).getTime() - createdAt;
                if (ms >= 0) {
                    resolutionTotalMs += ms;
                    resolutionCount += 1;
                    agent.resolutionSamples.push(ms);
                }
            }

            const status = ticket.status || 'open';
            if (OPEN_STATUSES.includes(status)) {
                const ageHours = (now - createdAt) / MS_PER_HOUR;
                if (ageHours >= 24) {
                    breach24h += 1;
                    agent.breach24h += 1;
                }
                if (ageHours >= 48) {
                    breach48h += 1;
                    agent.breach48h += 1;
                }
                if (ageHours >= 72) {
                    breach72h += 1;
                    agent.breach72h += 1;
                }
            }
        });

        const byAgent = Object.values(agentMap)
            .map(finalizeAgentRow)
            .sort((a, b) => b.ticketCount - a.ticketCount);

        res.status(200).json({
            success: true,
            data: {
                range: { from, to },
                summary: {
                    ticketCount: tickets.length,
                    avgFirstResponseHours: firstResponseCount
                        ? roundHours(firstResponseTotalMs / firstResponseCount)
                        : null,
                    avgResolutionHours: resolutionCount
                        ? roundHours(resolutionTotalMs / resolutionCount)
                        : null,
                    breach24h,
                    breach48h,
                    breach72h,
                    closedStatuses: CLOSED_STATUSES
                },
                byAgent
            }
        });
    } catch (error) {
        console.error('Get SLA Report Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load SLA report.' });
    }
};
