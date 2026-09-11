/********************************************************************
 * Project: EonlineBazar — HRM Module
 * File: employeeController.js
 * Location: controllers/admin/employeeController.js
 * Author: Abdul Karim Sheikh
 * Description: CRUD for non-login operational staff (delivery, labour, etc.).
 ********************************************************************/

const mongoose = require('mongoose');
const Admin = require('../../models/admin');
const Employee = require('../../models/employee');
const { ROLES, ACCOUNT_STATUS, sanitizePermissions } = require('../../config/permissions');
const Attendance = require('../../models/attendance');
const Payroll = require('../../models/payroll');
const Leave = require('../../models/leave');
const cloudinary = require('../../config/cloudinary');
const { logSecurityEvent, getClientIp } = require('../../utils/securityLogger');

const { EMPLOYEE_STATUSES, EMPLOYEE_TYPES, SALARY_TYPES, GENDERS, BLOOD_GROUPS, MARITAL_STATUSES } = Employee;
const { LEAVE_ALLOWANCES } = Leave;

function parsePagination(query) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 25, 1), 100);
    return { page, limit, skip: (page - 1) * limit };
}

function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function actorName(req) {
    return req.adminAccount?.username || req.admin?.username || 'admin';
}

function pickEmergencyContact(input) {
    if (!input || typeof input !== 'object') return undefined;
    return {
        name: String(input.name || '').trim(),
        phone: String(input.phone || '').trim(),
        relation: String(input.relation || '').trim()
    };
}

/** Clean, bounded reference list (max 5 — the UI collects two). */
function pickReferences(input) {
    if (!Array.isArray(input)) return [];
    return input
        .map((r) => ({
            name: String(r?.name || '').trim(),
            phone: String(r?.phone || '').trim(),
            relation: String(r?.relation || '').trim(),
            address: String(r?.address || '').trim()
        }))
        .filter((r) => r.name || r.phone)
        .slice(0, 5);
}

function parseEnum(value, allowed, fallback) {
    const v = String(value || '').trim().toLowerCase();
    return allowed.includes(v) ? v : fallback;
}

function pickEmployeeFields(body, { partial = false } = {}) {
    const fields = {};
    const source = body || {};

    const assign = (key, transform = (v) => v) => {
        if (!partial || source[key] !== undefined) {
            fields[key] = transform(source[key]);
        }
    };

    // Identity
    assign('fullName', (v) => String(v || '').trim());
    assign('religion', (v) => String(v || '').trim());
    assign('nationalId', (v) => String(v || '').trim());
    if (!partial || source.gender !== undefined) fields.gender = parseEnum(source.gender, GENDERS, '');
    if (!partial || source.bloodGroup !== undefined) {
        const bg = String(source.bloodGroup || '').trim().toUpperCase();
        fields.bloodGroup = BLOOD_GROUPS.includes(bg) ? bg : '';
    }
    if (!partial || source.maritalStatus !== undefined) fields.maritalStatus = parseEnum(source.maritalStatus, MARITAL_STATUSES, '');
    if (!partial || source.dateOfBirth !== undefined) {
        const raw = source.dateOfBirth;
        const d = raw ? new Date(raw) : null;
        fields.dateOfBirth = d && !Number.isNaN(d.getTime()) ? d : null;
    }

    // Contact
    assign('phone', (v) => String(v || '').trim());
    assign('alternatePhone', (v) => String(v || '').trim());
    assign('email', (v) => String(v || '').trim().toLowerCase());
    assign('presentAddress', (v) => String(v || '').trim());
    assign('permanentAddress', (v) => String(v || '').trim());
    assign('address', (v) => String(v || '').trim());

    // Employment
    assign('designation', (v) => String(v || '').trim());
    assign('role', (v) => String(v || '').trim());
    assign('department', (v) => String(v || 'Operations').trim() || 'Operations');
    assign('shift', (v) => String(v || '').trim());
    if (!partial || source.employeeType !== undefined) fields.employeeType = parseEnum(source.employeeType, EMPLOYEE_TYPES, 'permanent');

    // Salary & bank
    assign('baseSalary', (v) => Math.max(0, Number(v) || 0));
    if (!partial || source.salaryType !== undefined) fields.salaryType = parseEnum(source.salaryType, SALARY_TYPES, 'monthly');
    assign('bankName', (v) => String(v || '').trim());
    assign('bankAccountNumber', (v) => String(v || '').trim());
    assign('bkashNumber', (v) => String(v || '').trim());

    // Meta
    assign('notes', (v) => String(v || '').trim());

    if (!partial || source.joiningDate !== undefined) {
        const raw = source.joiningDate;
        fields.joiningDate = raw ? new Date(raw) : null;
        if (fields.joiningDate && Number.isNaN(fields.joiningDate.getTime())) {
            fields.joiningDate = null;
        }
    }

    if (!partial || source.status !== undefined) {
        const status = String(source.status || '').trim().toLowerCase();
        if (EMPLOYEE_STATUSES.includes(status)) fields.status = status;
    }

    if (!partial || source.emergencyContact !== undefined) {
        fields.emergencyContact = pickEmergencyContact(source.emergencyContact);
    }

    if (!partial || source.references !== undefined) {
        fields.references = pickReferences(source.references);
    }

    // Designation is canonical — keep the legacy role alias aligned even when
    // only one of the two was supplied.
    if (fields.designation && fields.role === undefined) fields.role = fields.designation;
    if (fields.role && (fields.designation === undefined || fields.designation === '')) fields.designation = fields.role;

    return fields;
}

/** Upload an in-memory file buffer to Cloudinary; returns {url, publicId}. */
async function uploadBufferToCloudinary(file, folder) {
    const b64 = Buffer.from(file.buffer).toString('base64');
    const dataURI = `data:${file.mimetype};base64,${b64}`;
    const isPdf = String(file.mimetype || '').toLowerCase() === 'application/pdf';
    const result = await cloudinary.uploader.upload(dataURI, {
        folder,
        resource_type: isPdf ? 'raw' : 'image'
    });
    return { url: result.secure_url, publicId: result.public_id, isPdf };
}

const { findEmployeeRecord } = require('../../utils/hrmStaffResolver');

const MIN_ACCESS_PASSWORD_LENGTH = 8;

async function suspendLinkedAdminAccess(employee) {
    if (!employee?.linkedAdminId) return;
    await Admin.findByIdAndUpdate(employee.linkedAdminId, { status: ACCOUNT_STATUS.BLOCKED });
}

/**
 * GET /api/admin/hrm/employees
 * Paginated roster. Filters: ?status=, ?department=, ?search= (name/phone/id).
 * ?all=true returns every active employee for dropdowns.
 */
exports.getAllEmployees = async (req, res) => {
    try {
        const filter = {};

        const status = String(req.query.status || '').trim().toLowerCase();
        if (EMPLOYEE_STATUSES.includes(status)) {
            filter.status = status;
        }

        const department = String(req.query.department || '').trim();
        if (department) filter.department = department;

        const designation = String(req.query.designation || '').trim();
        if (designation) filter.designation = designation;

        const employeeType = String(req.query.employeeType || '').trim().toLowerCase();
        if (EMPLOYEE_TYPES.includes(employeeType)) filter.employeeType = employeeType;

        const search = String(req.query.search || '').trim();
        if (search) {
            const re = new RegExp(escapeRegex(search), 'i');
            filter.$or = [{ fullName: re }, { phone: re }, { employeeId: re }, { role: re }, { designation: re }];
        }

        if (String(req.query.all || '').toLowerCase() === 'true') {
            const activeFilter = { ...filter, status: 'active' };
            const employees = await Employee.find(activeFilter).sort({ fullName: 1 }).lean();
            return res.status(200).json({
                success: true,
                data: employees,
                pagination: { page: 1, limit: employees.length, total: employees.length, totalPages: 1 }
            });
        }

        const { page, limit, skip } = parsePagination(req.query);

        const [employees, total] = await Promise.all([
            Employee.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            Employee.countDocuments(filter)
        ]);

        res.status(200).json({
            success: true,
            data: employees,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1
            }
        });
    } catch (error) {
        console.error('getAllEmployees Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load employees.' });
    }
};

/**
 * GET /api/admin/hrm/employees/stats
 * Active count plus breakdown by department.
 */
exports.getEmployeeStats = async (req, res) => {
    try {
        const [totals, byDepartment, byDesignation] = await Promise.all([
            Employee.aggregate([
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 }
                    }
                }
            ]),
            Employee.aggregate([
                { $match: { status: 'active' } },
                {
                    $group: {
                        _id: '$department',
                        count: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } }
            ]),
            Employee.aggregate([
                { $match: { status: 'active' } },
                {
                    $group: {
                        _id: '$designation',
                        count: { $sum: 1 }
                    }
                },
                { $sort: { count: -1, _id: 1 } }
            ])
        ]);

        const statusCounts = { active: 0, inactive: 0, terminated: 0 };
        totals.forEach((row) => {
            if (row._id && statusCounts[row._id] !== undefined) {
                statusCounts[row._id] = row.count;
            }
        });

        res.status(200).json({
            success: true,
            data: {
                totalActive: statusCounts.active,
                totalInactive: statusCounts.inactive,
                totalTerminated: statusCounts.terminated,
                total: statusCounts.active + statusCounts.inactive + statusCounts.terminated,
                byDepartment: byDepartment.map((row) => ({
                    department: row._id || 'Unassigned',
                    count: row.count
                })),
                byDesignation: byDesignation.map((row) => ({
                    designation: row._id || 'Unassigned',
                    count: row.count
                }))
            }
        });
    } catch (error) {
        console.error('getEmployeeStats Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load employee stats.' });
    }
};

/**
 * GET /api/admin/hrm/employees/:id
 * Accepts Mongo _id or employeeId (EMP-001).
 */
exports.getEmployeeById = async (req, res) => {
    try {
        const employee = await findEmployeeRecord(req.params.id);
        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }

        res.status(200).json({ success: true, data: employee });
    } catch (error) {
        console.error('getEmployeeById Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load employee.' });
    }
};

/**
 * POST /api/admin/hrm/employees
 * Auto-generates employeeId when omitted.
 */
exports.createEmployee = async (req, res) => {
    try {
        const fields = pickEmployeeFields(req.body || {}, { partial: false });

        if (!fields.fullName) {
            return res.status(400).json({ success: false, message: 'Full name is required.' });
        }
        if (!fields.phone) {
            return res.status(400).json({ success: false, message: 'Phone is required.' });
        }
        if (!fields.designation && !fields.role) {
            return res.status(400).json({ success: false, message: 'Designation is required.' });
        }

        fields.employeeId = String(req.body?.employeeId || '').trim()
            || await Employee.generateEmployeeId();
        fields.createdBy = actorName(req);

        const employee = await Employee.create(fields);

        await logSecurityEvent({
            action: 'Employee Created',
            actor: actorName(req),
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${employee.employeeId} — ${employee.fullName}`,
            resourceType: 'employee',
            resourceId: String(employee._id)
        });

        res.status(201).json({ success: true, message: 'Employee created.', data: employee });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: 'Employee ID already exists.' });
        }
        console.error('createEmployee Error:', error);
        res.status(500).json({ success: false, message: 'Failed to create employee.' });
    }
};

/**
 * PATCH /api/admin/hrm/employees/:id
 */
exports.updateEmployee = async (req, res) => {
    try {
        const employee = await findEmployeeRecord(req.params.id);
        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }

        const fields = pickEmployeeFields(req.body || {}, { partial: true });
        if (!Object.keys(fields).length) {
            return res.status(400).json({ success: false, message: 'No changes supplied.' });
        }

        if (fields.fullName !== undefined && !fields.fullName) {
            return res.status(400).json({ success: false, message: 'Full name cannot be empty.' });
        }
        if (fields.phone !== undefined && !fields.phone) {
            return res.status(400).json({ success: false, message: 'Phone cannot be empty.' });
        }
        if (fields.designation !== undefined && !fields.designation && !fields.role) {
            return res.status(400).json({ success: false, message: 'Designation cannot be empty.' });
        }

        Object.assign(employee, fields);
        await employee.save();

        if (employee.status === 'terminated') {
            await suspendLinkedAdminAccess(employee);
        }

        await logSecurityEvent({
            action: 'Employee Updated',
            actor: actorName(req),
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${employee.employeeId} — ${employee.fullName}`,
            resourceType: 'employee',
            resourceId: String(employee._id)
        });

        res.status(200).json({ success: true, message: 'Employee updated.', data: employee });
    } catch (error) {
        console.error('updateEmployee Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update employee.' });
    }
};

/**
 * DELETE /api/admin/hrm/employees/:id
 * Soft delete — status set to terminated.
 */
exports.deleteEmployee = async (req, res) => {
    try {
        const employee = await findEmployeeRecord(req.params.id);
        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }

        employee.status = 'terminated';
        await employee.save();
        await suspendLinkedAdminAccess(employee);

        await logSecurityEvent({
            action: 'Employee Terminated',
            actor: actorName(req),
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${employee.employeeId} — ${employee.fullName}`,
            resourceType: 'employee',
            resourceId: String(employee._id)
        });

        res.status(200).json({ success: true, message: 'Employee terminated.', data: employee });
    } catch (error) {
        console.error('deleteEmployee Error:', error);
        res.status(500).json({ success: false, message: 'Failed to terminate employee.' });
    }
};

/**
 * POST /api/admin/hrm/employees/:id/photo  (multipart, field: photo)
 * Uploads the profile photo to Cloudinary and swaps in the new URL,
 * cleaning up the previous image if it was Cloudinary-hosted.
 */
exports.uploadEmployeePhoto = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No photo file supplied.' });
        }

        const employee = await findEmployeeRecord(req.params.id);
        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }

        const { url, publicId } = await uploadBufferToCloudinary(req.file, 'employees/photos');

        // Remove the old image so orphaned uploads do not pile up in Cloudinary.
        if (employee.photoPublicId) {
            await cloudinary.uploader.destroy(employee.photoPublicId).catch(() => {});
        }

        employee.photo = url;
        employee.photoPublicId = publicId;
        await employee.save();

        await logSecurityEvent({
            action: 'Employee Photo Updated',
            actor: actorName(req),
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${employee.employeeId} — ${employee.fullName}`,
            resourceType: 'employee',
            resourceId: String(employee._id)
        });

        res.status(200).json({ success: true, message: 'Photo updated.', data: { photo: url } });
    } catch (error) {
        console.error('uploadEmployeePhoto Error:', error);
        res.status(500).json({ success: false, message: 'Failed to upload photo.' });
    }
};

/**
 * POST /api/admin/hrm/employees/:id/documents  (multipart, field: document)
 * Body: { title }. Pushes a document entry (Cloudinary URL + type) and
 * returns the updated documents list.
 */
exports.uploadEmployeeDocument = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No document file supplied.' });
        }

        const employee = await findEmployeeRecord(req.params.id);
        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }

        const title = String(req.body?.title || '').trim() || 'Untitled Document';
        const { url, publicId, isPdf } = await uploadBufferToCloudinary(req.file, 'employees/documents');

        employee.documents.push({
            title,
            fileUrl: url,
            fileType: isPdf ? 'pdf' : 'image',
            publicId,
            uploadedAt: new Date()
        });
        await employee.save();

        await logSecurityEvent({
            action: 'Employee Document Uploaded',
            actor: actorName(req),
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${employee.employeeId} — ${title}`,
            resourceType: 'employee',
            resourceId: String(employee._id)
        });

        res.status(201).json({ success: true, message: 'Document uploaded.', data: employee.documents });
    } catch (error) {
        console.error('uploadEmployeeDocument Error:', error);
        res.status(500).json({ success: false, message: 'Failed to upload document.' });
    }
};

/**
 * DELETE /api/admin/hrm/employees/:id/documents/:docId
 * Removes a document by its subdocument _id (also deletes it from Cloudinary).
 */
exports.deleteEmployeeDocument = async (req, res) => {
    try {
        const employee = await findEmployeeRecord(req.params.id);
        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }

        const doc = employee.documents.id(req.params.docId);
        if (!doc) {
            return res.status(404).json({ success: false, message: 'Document not found.' });
        }

        if (doc.publicId) {
            const resourceType = doc.fileType === 'pdf' ? 'raw' : 'image';
            await cloudinary.uploader.destroy(doc.publicId, { resource_type: resourceType }).catch(() => {});
        }

        doc.deleteOne();
        await employee.save();

        await logSecurityEvent({
            action: 'Employee Document Deleted',
            actor: actorName(req),
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${employee.employeeId} — ${doc.title}`,
            resourceType: 'employee',
            resourceId: String(employee._id)
        });

        res.status(200).json({ success: true, message: 'Document removed.', data: employee.documents });
    } catch (error) {
        console.error('deleteEmployeeDocument Error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete document.' });
    }
};

/**
 * GET /api/admin/hrm/employees/:id/profile
 * Full employee record plus a live HRM snapshot: this month's attendance
 * counts, the last six months of payroll, and this year's leave balance.
 */
exports.getEmployeeProfile = async (req, res) => {
    try {
        const employee = await findEmployeeRecord(req.params.id);
        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }

        const staffId = String(employee._id);
        const now = new Date();
        const year = now.getFullYear();
        const monthStart = new Date(year, now.getMonth(), 1, 0, 0, 0, 0);
        const monthEnd = new Date(year, now.getMonth() + 1, 0, 23, 59, 59, 999);
        const yearStart = new Date(year, 0, 1, 0, 0, 0, 0);
        const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

        const [attendanceRows, payrollRows, leaveRows] = await Promise.all([
            Attendance.find({ staffId, date: { $gte: monthStart, $lte: monthEnd } }).lean(),
            Payroll.find({ staffId }).sort({ year: -1, month: -1 }).limit(6).lean(),
            Leave.find({ staffId, startDate: { $gte: yearStart, $lte: yearEnd } }).lean()
        ]);

        // This month's attendance summary.
        const attendanceSummary = { present: 0, absent: 0, late: 0, halfDay: 0, holiday: 0, totalDays: attendanceRows.length };
        attendanceRows.forEach((row) => {
            if (row.status === 'present') attendanceSummary.present += 1;
            else if (row.status === 'absent') attendanceSummary.absent += 1;
            else if (row.status === 'half-day') attendanceSummary.halfDay += 1;
            else if (row.status === 'holiday') attendanceSummary.holiday += 1;
            if (row.isLate) attendanceSummary.late += 1;
        });

        // This year's leave balance per type (approved days against allowance).
        const leaveBalance = Object.keys(LEAVE_ALLOWANCES).map((type) => {
            const allowed = LEAVE_ALLOWANCES[type] || 0;
            const used = leaveRows
                .filter((l) => l.leaveType === type && l.status === 'approved')
                .reduce((sum, l) => sum + (Number(l.totalDays) || 0), 0);
            const pending = leaveRows
                .filter((l) => l.leaveType === type && l.status === 'pending')
                .reduce((sum, l) => sum + (Number(l.totalDays) || 0), 0);
            return { leaveType: type, allowed, used, pending, remaining: Math.max(0, allowed - used) };
        });

        const recentLeaves = [...leaveRows]
            .sort((a, b) => new Date(b.startDate) - new Date(a.startDate))
            .slice(0, 5);

        res.status(200).json({
            success: true,
            data: {
                employee,
                attendanceSummary,
                payrollHistory: payrollRows,
                leaveBalance,
                recentLeaves,
                documents: employee.documents || []
            }
        });
    } catch (error) {
        console.error('getEmployeeProfile Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load employee profile.' });
    }
};

/**
 * POST /api/admin/hrm/employees/:id/grant-access
 * Provisions a staff Admin account linked to this employee record.
 */
exports.grantSystemAccess = async (req, res) => {
    try {
        const { username, password, permissions } = req.body || {};
        const employee = await findEmployeeRecord(req.params.id);
        if (!employee) {
            return res.status(404).json({ error: 'Employee not found' });
        }
        if (employee.linkedAdminId) {
            return res.status(400).json({ error: 'Access already granted' });
        }

        const normalizedUsername = String(username || '').trim().toLowerCase();
        if (!normalizedUsername) {
            return res.status(400).json({ error: 'Username is required' });
        }
        if (String(password || '').length < MIN_ACCESS_PASSWORD_LENGTH) {
            return res.status(400).json({ error: `Password must be at least ${MIN_ACCESS_PASSWORD_LENGTH} characters` });
        }

        const existing = await Admin.findOne({ username: new RegExp(`^${normalizedUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
        if (existing) {
            return res.status(400).json({ error: 'Username already taken' });
        }

        const sanitized = sanitizePermissions(permissions);
        if (!sanitized.length) {
            return res.status(400).json({ error: 'Select at least one permission' });
        }

        const newAdmin = await Admin.create({
            username: normalizedUsername,
            password: String(password),
            name: employee.fullName,
            displayName: employee.fullName,
            email: employee.email || '',
            phone: employee.phone || '',
            role: ROLES.STAFF,
            permissions: sanitized,
            status: ACCOUNT_STATUS.ACTIVE,
            employeeRef: String(employee._id),
            createdBy: actorName(req),
            twoFactorEnabled: false
        });

        employee.linkedAdminId = String(newAdmin._id);
        await employee.save();

        await logSecurityEvent({
            action: 'Employee System Access Granted',
            actor: actorName(req),
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${employee.employeeId} → ${newAdmin.username}`,
            resourceType: 'employee',
            resourceId: String(employee._id)
        });

        res.json({ success: true, username: newAdmin.username });
    } catch (error) {
        console.error('grantSystemAccess Error:', error);
        res.status(500).json({ error: 'Failed to grant system access.' });
    }
};

/**
 * POST /api/admin/hrm/employees/:id/revoke-access
 * Suspends the linked admin login (employee link is preserved).
 */
exports.revokeSystemAccess = async (req, res) => {
    try {
        const employee = await findEmployeeRecord(req.params.id);
        if (!employee || !employee.linkedAdminId) {
            return res.status(400).json({ error: 'No access to revoke' });
        }

        await Admin.findByIdAndUpdate(employee.linkedAdminId, { status: ACCOUNT_STATUS.BLOCKED });

        await logSecurityEvent({
            action: 'Employee System Access Revoked',
            actor: actorName(req),
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${employee.employeeId} — admin ${employee.linkedAdminId} suspended`,
            resourceType: 'employee',
            resourceId: String(employee._id)
        });

        res.json({ success: true });
    } catch (error) {
        console.error('revokeSystemAccess Error:', error);
        res.status(500).json({ error: 'Failed to revoke system access.' });
    }
};

/**
 * GET /api/admin/hrm/employees/:id/access-status
 * Returns whether the employee has a linked admin account and its summary.
 */
exports.getAccessStatus = async (req, res) => {
    try {
        const employee = await findEmployeeRecord(req.params.id);
        if (!employee || !employee.linkedAdminId) {
            return res.json({ hasAccess: false });
        }

        const admin = await Admin.findById(employee.linkedAdminId)
            .select('username status permissions lastLoginAt');
        if (!admin) {
            return res.json({ hasAccess: false });
        }

        res.json({
            hasAccess: true,
            admin: {
                username: admin.username,
                status: admin.status,
                permissions: Array.isArray(admin.permissions) ? admin.permissions : [],
                lastLoginAt: admin.lastLoginAt || null
            }
        });
    } catch (error) {
        console.error('getAccessStatus Error:', error);
        res.status(500).json({ error: 'Failed to load access status.' });
    }
};
