/********************************************************************
 * Project: EonlineBazar — HRM Module
 * File: designationController.js
 * Location: controllers/admin/designationController.js
 * Author: Abdul Karim Sheikh
 * Description: CRUD for employee designations (job titles). Deleting a
 * designation is blocked while any employee still uses it — the caller is
 * told how many so they can reassign first.
 ********************************************************************/

const mongoose = require('mongoose');
const Designation = require('../../models/designation');
const Employee = require('../../models/employee');
const { logSecurityEvent, getClientIp } = require('../../utils/securityLogger');

function actorName(req) {
    return req.adminAccount?.username || req.admin?.username || 'admin';
}

/** Live employee count per designation name (active + inactive, not terminated). */
async function countEmployeesByDesignation(names) {
    const rows = await Employee.aggregate([
        { $match: { designation: { $in: names }, status: { $ne: 'terminated' } } },
        { $group: { _id: '$designation', count: { $sum: 1 } } }
    ]);
    const map = {};
    rows.forEach((r) => { if (r._id) map[r._id] = r.count; });
    return map;
}

/**
 * GET /api/admin/hrm/designations
 * Full catalog with a live active-employee count on each entry.
 * ?activeOnly=true limits to enabled designations (used by the form dropdown).
 */
exports.getAllDesignations = async (req, res) => {
    try {
        const filter = {};
        if (String(req.query.activeOnly || '').toLowerCase() === 'true') {
            filter.isActive = true;
        }

        const designations = await Designation.find(filter).sort({ name: 1 }).lean();
        const counts = await countEmployeesByDesignation(designations.map((d) => d.name));

        const data = designations.map((d) => ({
            ...d,
            employeeCount: counts[d.name] || 0
        }));

        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('getAllDesignations Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load designations.' });
    }
};

/**
 * POST /api/admin/hrm/designations
 * Body: { name*, department, description }
 */
exports.createDesignation = async (req, res) => {
    try {
        const name = String(req.body?.name || '').trim();
        if (!name) {
            return res.status(400).json({ success: false, message: 'Designation name is required.' });
        }

        const existing = await Designation.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
        if (existing) {
            return res.status(409).json({ success: false, message: 'A designation with this name already exists.' });
        }

        const designation = await Designation.create({
            name,
            department: String(req.body?.department || 'Operations').trim() || 'Operations',
            description: String(req.body?.description || '').trim(),
            isActive: req.body?.isActive === undefined ? true : !!req.body.isActive,
            createdBy: actorName(req)
        });

        await logSecurityEvent({
            action: 'Designation Created',
            actor: actorName(req),
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: designation.name,
            resourceType: 'designation',
            resourceId: String(designation._id)
        });

        res.status(201).json({ success: true, message: 'Designation created.', data: designation });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: 'A designation with this name already exists.' });
        }
        console.error('createDesignation Error:', error);
        res.status(500).json({ success: false, message: 'Failed to create designation.' });
    }
};

/**
 * PATCH /api/admin/hrm/designations/:id
 * Renaming a designation also renames it on every employee that uses it, so
 * the roster never drifts out of sync with the catalog.
 */
exports.updateDesignation = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid designation id.' });
        }

        const designation = await Designation.findById(id);
        if (!designation) {
            return res.status(404).json({ success: false, message: 'Designation not found.' });
        }

        const previousName = designation.name;

        if (req.body?.name !== undefined) {
            const name = String(req.body.name).trim();
            if (!name) {
                return res.status(400).json({ success: false, message: 'Designation name cannot be empty.' });
            }
            if (name.toLowerCase() !== previousName.toLowerCase()) {
                const clash = await Designation.findOne({
                    _id: { $ne: id },
                    name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
                });
                if (clash) {
                    return res.status(409).json({ success: false, message: 'Another designation already uses this name.' });
                }
            }
            designation.name = name;
        }

        if (req.body?.department !== undefined) {
            designation.department = String(req.body.department).trim() || 'Operations';
        }
        if (req.body?.description !== undefined) {
            designation.description = String(req.body.description).trim();
        }
        if (req.body?.isActive !== undefined) {
            designation.isActive = !!req.body.isActive;
        }

        await designation.save();

        // Cascade a rename onto the employees carrying the old title.
        if (designation.name !== previousName) {
            await Employee.updateMany(
                { designation: previousName },
                { $set: { designation: designation.name, role: designation.name } }
            );
        }

        await logSecurityEvent({
            action: 'Designation Updated',
            actor: actorName(req),
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${previousName} → ${designation.name}`,
            resourceType: 'designation',
            resourceId: String(designation._id)
        });

        res.status(200).json({ success: true, message: 'Designation updated.', data: designation });
    } catch (error) {
        console.error('updateDesignation Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update designation.' });
    }
};

/**
 * DELETE /api/admin/hrm/designations/:id
 * Blocked while employees still use the designation — the response carries
 * the count so the UI can prompt a reassignment.
 */
exports.deleteDesignation = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid designation id.' });
        }

        const designation = await Designation.findById(id);
        if (!designation) {
            return res.status(404).json({ success: false, message: 'Designation not found.' });
        }

        const inUse = await Employee.countDocuments({
            designation: designation.name,
            status: { $ne: 'terminated' }
        });

        if (inUse > 0) {
            return res.status(409).json({
                success: false,
                message: `${inUse} employee${inUse === 1 ? '' : 's'} still use this designation — reassign first.`,
                employeeCount: inUse
            });
        }

        await designation.deleteOne();

        await logSecurityEvent({
            action: 'Designation Deleted',
            actor: actorName(req),
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: designation.name,
            resourceType: 'designation',
            resourceId: String(designation._id)
        });

        res.status(200).json({ success: true, message: 'Designation deleted.' });
    } catch (error) {
        console.error('deleteDesignation Error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete designation.' });
    }
};
