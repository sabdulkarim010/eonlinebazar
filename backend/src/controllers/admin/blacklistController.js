/**
 * EonlineBazar — Admin Blacklist Controller
 * Extracted from: controllers/adminSecurityController.js
 * Routes that use this: routes/adminRoutes.js
 *
 * When adding new endpoints:
 * 1. Add handler here
 * 2. Export from barrel (original controller file)
 * 3. Add route in routes/[file].routes.js
 */

const mongoose = require('mongoose');
const BlacklistedIP = require('../../models/blacklistedIp');
const { fingerprint } = require('../../utils/deviceParser');
const { logSecurityEvent } = require('../../utils/securityLogger');

/* ==================================================================
   IP BLACKLIST MANAGER
   ================================================================== */

// GET /api/admin/blacklist
exports.getBlacklist = async (req, res) => {
    try {
        const now = Date.now();
        const list = await BlacklistedIP.find({}).sort({ blockedAt: -1 }).lean();
        const data = list.map(b => {
            const expired = b.expiresAt ? new Date(b.expiresAt).getTime() <= now : false;
            return {
                id: b._id,
                ip: b.ip,
                reason: b.reason,
                source: b.source,
                blockedBy: b.blockedBy,
                blockedAt: b.blockedAt,
                expiresAt: b.expiresAt,
                permanent: !b.expiresAt,
                active: !expired,
                expiresInMs: b.expiresAt ? Math.max(0, new Date(b.expiresAt).getTime() - now) : null
            };
        });
        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Get Blacklist Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load blacklist.' });
    }
};

// POST /api/admin/blacklist  { ip, reason, hours }
exports.addBlacklist = async (req, res) => {
    try {
        const ip = String(req.body.ip || '').trim();
        const reason = String(req.body.reason || 'Manually blocked by admin').trim();
        const hours = req.body.hours !== undefined && req.body.hours !== null && req.body.hours !== ''
            ? Number(req.body.hours)
            : null;

        const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]+$/;
        if (!ip || !ipPattern.test(ip)) {
            return res.status(400).json({ success: false, message: 'Please provide a valid IPv4 or IPv6 address.' });
        }

        const expiresAt = hours && hours > 0 ? new Date(Date.now() + hours * 60 * 60 * 1000) : null;

        const doc = await BlacklistedIP.findOneAndUpdate(
            { ip },
            {
                $set: {
                    ip,
                    reason,
                    source: 'manual',
                    blockedBy: req.admin.username || 'admin',
                    blockedAt: new Date(),
                    expiresAt
                }
            },
            { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
        );

        await logSecurityEvent({
            action: 'IP Manually Blacklisted',
            actor: req.admin.username || 'admin',
            actorType: 'admin',
            ipAddress: fingerprint(req).ipAddress,
            details: `Blocked ${ip}${expiresAt ? ` for ${hours}h` : ' permanently'} — ${reason}`
        });

        res.status(201).json({ success: true, message: `IP ${ip} has been blacklisted.`, data: doc });
    } catch (error) {
        console.error('Add Blacklist Error:', error);
        res.status(500).json({ success: false, message: 'Failed to blacklist IP.' });
    }
};

// DELETE /api/admin/blacklist/:id  (unblock by _id or ip)
exports.removeBlacklist = async (req, res) => {
    try {
        const { id } = req.params;
        const orMatch = [{ ip: id }];
        if (mongoose.Types.ObjectId.isValid(id)) orMatch.push({ _id: id });

        const target = await BlacklistedIP.findOne({ $or: orMatch });
        if (!target) {
            return res.status(404).json({ success: false, message: 'Blacklist entry not found.' });
        }
        await target.deleteOne();

        await logSecurityEvent({
            action: 'IP Unblocked',
            actor: req.admin.username || 'admin',
            actorType: 'admin',
            ipAddress: fingerprint(req).ipAddress,
            details: `Removed ${target.ip} from blacklist`
        });

        res.status(200).json({ success: true, message: `IP ${target.ip} has been unblocked.` });
    } catch (error) {
        console.error('Remove Blacklist Error:', error);
        res.status(500).json({ success: false, message: 'Failed to unblock IP.' });
    }
};
