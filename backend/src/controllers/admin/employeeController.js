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
const { dualWrite } = require('../../services/dualWriteService');
const { adminDualWrite, mirrorAdminCreate, mirrorAdminUpdate, mirrorAdminFields, mirrorAdminRemove } = require('../../utils/adminDualWriteHelpers');

function getEmployeeRepository() {
    return require('../../repositories/employeeRepository');
}

function mapMongoEmployeeToPostgresWrite(doc) {
    return require('../../utils/hrmDualWriteHelpers').mapMongoEmployeeToPostgresWrite(doc);
}

async function resolvePostgresAdminId(mongoAdminId) {
    return require('../../utils/hrmDualWriteHelpers').resolvePostgresAdminId(mongoAdminId);
}

/**
 * Best-effort PG sync for linkedAdminId after Mongo grant/reconcile.
 * PG failure must never block the Mongo write path.
 */
async function syncLinkedAdminIdToPostgres(employeeLegacyId, mongoAdminId) {
    const employeeId = String(employeeLegacyId || '').trim();
    if (!employeeId || !mongoAdminId) return;

    try {
        const prisma = require('../../config/prismaClient');
        const pgAdminId = await resolvePostgresAdminId(mongoAdminId);
        if (!pgAdminId) return;

        await prisma.employee.update({
            where: { legacyId: employeeId },
            data: { linkedAdminId: pgAdminId }
        });
        console.log(`[GRANT-ACCESS-PG-SYNC] ${employeeId}`);
    } catch (err) {
        console.warn(`[GRANT-ACCESS-PG-SYNC] ${employeeId} failed:`, err.message);
    }
}

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
const {
    fetchEmployeesPage,
    fetchAllActiveEmployees,
    fetchEmployeeStats,
    fetchEmployeeByIdentifier,
    fetchEmployeeProfileBundle
} = require('../../services/hrmReadService');
const { isSuperAdminLinkedEmployee } = require('../../utils/superAdminEmployee');

async function enrichEmployeesWithAdminRole(employees) {
    if (!Array.isArray(employees) || !employees.length) return employees || [];

    const adminIds = [...new Set(
        employees
            .filter((row) => row.linkedAdminId)
            .map((row) => String(row.linkedAdminId))
    )];

    if (!adminIds.length) return employees;

    const admins = await Admin.find({ _id: { $in: adminIds } }).select('role').lean();
    const roleById = Object.fromEntries(admins.map((row) => [String(row._id), row.role]));

    return employees.map((row) => ({
        ...row,
        adminRole: row.linkedAdminId ? (roleById[String(row.linkedAdminId)] || null) : null
    }));
}

const MIN_ACCESS_PASSWORD_LENGTH = 8;

/**
 * Resolve linked admin from Mongo employeeRef / linkedAdminId and sync PG when missing.
 * Returns linked admin Mongo _id when access exists, else null.
 */
async function reconcileLinkedAdminAccess(employee) {
    if (!employee) return null;

    let linkedId = employee.linkedAdminId ? String(employee.linkedAdminId).trim() : '';

    if (!linkedId) {
        const linkedAdmin = await Admin.findOne({ employeeRef: String(employee._id) })
            .select('_id')
            .lean();
        if (linkedAdmin) {
            linkedId = String(linkedAdmin._id);
        }
    }

    if (linkedId && !employee.linkedAdminId) {
        employee.linkedAdminId = linkedId;
        await dualWrite(
            () => employee.save(),
            async (saved) => {
                await syncLinkedAdminIdToPostgres(String(saved._id), linkedId);
            },
            {
                model: 'Employee',
                operation: 'reconcileLinkedAdmin',
                mongoId: (saved) => String(saved._id)
            }
        );
    } else if (linkedId) {
        await syncLinkedAdminIdToPostgres(String(employee._id), linkedId);
    }

    return linkedId || null;
}

async function syncLinkedAdminName(employee, newName) {
    if (!employee?.linkedAdminId || !newName) return;

    const trimmed = String(newName).trim();
    if (!trimmed) return;

    await adminDualWrite(
        () => Admin.findByIdAndUpdate(
            employee.linkedAdminId,
            { name: trimmed, displayName: trimmed },
            { returnDocument: 'after' }
        ),
        (updated) => mirrorAdminUpdate(updated, { operation: 'syncLinkedAdminName' }),
        {
            operation: 'syncLinkedAdminName',
            mongoId: String(employee.linkedAdminId)
        }
    );
}

async function suspendLinkedAdminAccess(employee) {
    if (!employee?.linkedAdminId) return;
    await adminDualWrite(
        () => Admin.findByIdAndUpdate(
            employee.linkedAdminId,
            { status: ACCOUNT_STATUS.BLOCKED },
            { returnDocument: 'after' }
        ),
        (updated) => {
            if (updated) return mirrorAdminUpdate(updated, { operation: 'suspendLinkedAdmin' });
            return mirrorAdminFields(String(employee.linkedAdminId), { status: ACCOUNT_STATUS.BLOCKED }, 'suspendLinkedAdmin');
        },
        {
            operation: 'suspendLinkedAdmin',
            mongoId: String(employee.linkedAdminId)
        }
    );
}

/**
 * GET /api/admin/hrm/employees
 * Paginated roster. Filters: ?status=, ?department=, ?search= (name/phone/id).
 * ?all=true returns every active employee for dropdowns.
 */
exports.getAllEmployees = async (req, res) => {
    try {
        if (String(req.query.all || '').toLowerCase() === 'true') {
            const employees = await enrichEmployeesWithAdminRole(await fetchAllActiveEmployees(req.query));
            const list = Array.isArray(employees) ? employees : [];
            return res.status(200).json({
                success: true,
                data: list,
                employees: list,
                pagination: { page: 1, limit: list.length, total: list.length, totalPages: 1 }
            });
        }

        const { page, limit, skip } = parsePagination(req.query);

        const { employees, total } = await fetchEmployeesPage({ query: req.query, skip, limit });
        const enriched = await enrichEmployeesWithAdminRole(employees);

        res.status(200).json({
            success: true,
            data: enriched,
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
        const { totals, byDepartment, byDesignation } = await fetchEmployeeStats();

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
        const employee = await fetchEmployeeByIdentifier(req.params.id);
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

        const employee = await dualWrite(
            () => Employee.create(fields),
            async (saved) => {
                await getEmployeeRepository().create(mapMongoEmployeeToPostgresWrite(saved));
            },
            {
                model: 'Employee',
                operation: 'create',
                mongoId: (saved) => String(saved._id)
            }
        );

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
        await dualWrite(
            () => employee.save(),
            async (saved) => {
                const repo = getEmployeeRepository();
                const pgRow = await repo.findByLegacyId(String(saved._id));
                if (!pgRow) {
                    await repo.create(mapMongoEmployeeToPostgresWrite(saved));
                    return;
                }
                if (saved.status === 'terminated') {
                    await repo.terminate(pgRow.id);
                    return;
                }
                await repo.update(pgRow.id, mapMongoEmployeeToPostgresWrite(saved));
            },
            {
                model: 'Employee',
                operation: 'update',
                mongoId: (saved) => String(saved._id)
            }
        );

        if (employee.status === 'terminated') {
            await suspendLinkedAdminAccess(employee);
        }

        if (fields.fullName !== undefined) {
            await syncLinkedAdminName(employee, employee.fullName);
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

async function performPermanentEmployeeDelete(id, req) {
    if (await isSuperAdminLinkedEmployee(id)) {
        const err = new Error('Cannot delete the Super Admin employee.');
        err.status = 403;
        throw err;
    }

    const employee = await Employee.findById(id);
    if (!employee) {
        const err = new Error('Employee not found');
        err.status = 404;
        throw err;
    }

    const empCode = employee.employeeId || 'EMP';
    const legacyId = String(employee._id);

    if (employee.linkedAdminId) {
        const adminId = String(employee.linkedAdminId);
        await adminDualWrite(
            () => Admin.findByIdAndDelete(adminId),
            () => mirrorAdminRemove(adminId),
            { operation: 'deleteEmployeeRevokeAdmin', mongoId: adminId }
        );
    }

    await Attendance.deleteMany({ staffId: legacyId, staffType: 'employee' });
    await Payroll.deleteMany({ staffId: legacyId, staffType: 'employee' });
    await Leave.deleteMany({ staffId: legacyId, staffType: 'employee' });

    try {
        const prisma = require('../../config/prismaClient');
        await prisma.employee.deleteMany({ where: { legacyId } });
    } catch (pgErr) {
        console.warn('[DELETE-EMP-PG]', pgErr.message);
    }

    await Employee.findByIdAndDelete(id);

    await logSecurityEvent({
        action: 'Employee Permanently Deleted',
        actor: actorName(req),
        actorType: 'admin',
        ipAddress: getClientIp(req),
        details: `${empCode} — ${employee.fullName}`,
        resourceType: 'employee',
        resourceId: legacyId
    });

    return { employee, message: `${employee.fullName} permanently deleted` };
}

/**
 * PATCH /api/admin/hrm/employees/:id/deactivate
 * Soft delete — hides employee from lists while preserving records.
 */
exports.deactivateEmployee = async (req, res) => {
    try {
        const { id } = req.params;

        if (await isSuperAdminLinkedEmployee(id)) {
            return res.status(403).json({
                success: false,
                message: 'Cannot deactivate Super Admin.'
            });
        }

        const employee = await findEmployeeRecord(id);
        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
        }

        employee.status = 'terminated';
        employee.isDeleted = true;
        employee.deletedAt = new Date();

        await dualWrite(
            () => employee.save(),
            async (saved) => {
                const repo = getEmployeeRepository();
                const pgRow = await repo.findByLegacyId(String(saved._id));
                if (pgRow) await repo.terminate(pgRow.id);
            },
            {
                model: 'Employee',
                operation: 'deactivate',
                mongoId: (saved) => String(saved._id)
            }
        );

        await suspendLinkedAdminAccess(employee);

        await logSecurityEvent({
            action: 'Employee Deactivated',
            actor: actorName(req),
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${employee.employeeId} — ${employee.fullName}`,
            resourceType: 'employee',
            resourceId: String(employee._id)
        });

        res.json({ success: true, message: 'Employee deactivated' });
    } catch (error) {
        console.error('[DEACTIVATE-EMP]', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to deactivate employee.' });
    }
};

/**
 * DELETE /api/admin/hrm/employees/:id/permanent
 * Permanent delete — Super Admin only, requires ADMIN_DELETE_PASSWORD.
 */
exports.permanentDeleteEmployee = async (req, res) => {
    try {
        const { id } = req.params;
        const { adminPassword } = req.body || {};

        const correctPw = process.env.ADMIN_DELETE_PASSWORD;
        if (!correctPw || adminPassword !== correctPw) {
            return res.status(401).json({
                success: false,
                message: 'Incorrect admin password.'
            });
        }

        const { message } = await performPermanentEmployeeDelete(id, req);
        res.json({ success: true, message });
    } catch (error) {
        if (error.status === 403) {
            return res.status(403).json({ success: false, message: error.message });
        }
        if (error.status === 404) {
            return res.status(404).json({ success: false, message: error.message });
        }
        console.error('[PERMANENT-DELETE-EMP]', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to delete employee.' });
    }
};

/**
 * DELETE /api/admin/hrm/employees/:id
 * Permanent delete — Super Admin only. Removes employee and related HRM records.
 */
exports.deleteEmployee = async (req, res) => {
    try {
        const { id } = req.params;
        const { message } = await performPermanentEmployeeDelete(id, req);
        res.status(200).json({ success: true, message });
    } catch (error) {
        if (error.status === 403) {
            return res.status(403).json({ success: false, message: error.message });
        }
        if (error.status === 404) {
            return res.status(404).json({ success: false, message: error.message });
        }
        console.error('[DELETE-EMP]', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to delete employee.' });
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
        await dualWrite(
            () => employee.save(),
            async (saved) => {
                const repo = getEmployeeRepository();
                const pgRow = await repo.findByLegacyId(String(saved._id));
                if (!pgRow) return;
                await repo.update(pgRow.id, {
                    photo: saved.photo,
                    photoPublicId: saved.photoPublicId
                });
            },
            {
                model: 'Employee',
                operation: 'update',
                mongoId: (saved) => String(saved._id)
            }
        );

        await logSecurityEvent({
            action: 'Employee Photo Updated',
            actor: actorName(req),
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${employee.employeeId} — ${employee.fullName}`,
            resourceType: 'employee',
            resourceId: String(employee._id)
        });

        await require('./adminProfileController').syncLinkedAdminPhoto(employee, url);

        res.status(200).json({
            success: true,
            message: 'Photo updated.',
            photoUpdated: true,
            data: { photo: url }
        });
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
        await dualWrite(
            () => employee.save(),
            async (saved) => {
                const repo = getEmployeeRepository();
                const pgEmployee = await repo.findByLegacyId(String(saved._id));
                if (!pgEmployee) return;
                const doc = saved.documents[saved.documents.length - 1];
                if (!doc) return;
                await repo.addDocument(pgEmployee.id, {
                    title: doc.title,
                    fileUrl: doc.fileUrl,
                    fileType: doc.fileType,
                    publicId: doc.publicId,
                    legacyId: String(doc._id)
                });
            },
            {
                model: 'Employee',
                operation: 'update',
                mongoId: (saved) => String(saved._id)
            }
        );

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

        const removedDocId = String(doc._id);
        doc.deleteOne();
        await dualWrite(
            () => employee.save(),
            async () => {
                const repo = getEmployeeRepository();
                const pgDoc = await repo.findDocumentByLegacyId(removedDocId);
                if (pgDoc) await repo.removeDocument(pgDoc.id);
            },
            {
                model: 'Employee',
                operation: 'update',
                mongoId: () => String(employee._id)
            }
        );

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
        const employee = await fetchEmployeeByIdentifier(req.params.id);
        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }

        const staffId = String(employee._id);
        const { attendanceRows, payrollRows, leaveRows } = await fetchEmployeeProfileBundle(staffId);

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

        const existingLink = await reconcileLinkedAdminAccess(employee);
        if (existingLink) {
            return res.status(409).json({ error: 'Access already granted' });
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

        const plainPassword = String(password);
        const newAdmin = await adminDualWrite(
            () => Admin.create({
                username: normalizedUsername,
                password: plainPassword,
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
            }),
            (saved) => mirrorAdminCreate(saved, { plainPassword, operation: 'grantSystemAccess' }),
            {
                operation: 'grantSystemAccess',
                mongoId: (saved) => String(saved._id)
            }
        );

        employee.linkedAdminId = String(newAdmin._id);
        await dualWrite(
            () => employee.save(),
            async (saved) => {
                await syncLinkedAdminIdToPostgres(String(saved._id), String(newAdmin._id));
            },
            {
                model: 'Employee',
                operation: 'update',
                mongoId: (saved) => String(saved._id)
            }
        );
        await syncLinkedAdminIdToPostgres(String(employee._id), String(newAdmin._id));

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

        await adminDualWrite(
            () => Admin.findByIdAndUpdate(
                employee.linkedAdminId,
                { status: ACCOUNT_STATUS.BLOCKED },
                { returnDocument: 'after' }
            ),
            (updated) => mirrorAdminUpdate(updated, { operation: 'revokeSystemAccess' }),
            {
                operation: 'revokeSystemAccess',
                mongoId: String(employee.linkedAdminId)
            }
        );

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
 * POST /api/admin/hrm/employees/:id/reactivate-access
 * Restores a suspended linked admin login to active.
 */
exports.reactivateSystemAccess = async (req, res) => {
    try {
        const employee = await findEmployeeRecord(req.params.id);
        if (!employee || !employee.linkedAdminId) {
            return res.status(400).json({ error: 'No linked account to reactivate' });
        }

        const admin = await Admin.findById(employee.linkedAdminId);
        if (!admin) {
            return res.status(400).json({ error: 'Linked admin account not found' });
        }

        admin.status = ACCOUNT_STATUS.ACTIVE;
        await adminDualWrite(
            () => admin.save(),
            (saved) => mirrorAdminUpdate(saved, { operation: 'reactivateSystemAccess' }),
            {
                operation: 'reactivateSystemAccess',
                mongoId: (saved) => String(saved._id)
            }
        );

        await logSecurityEvent({
            action: 'Employee System Access Reactivated',
            actor: actorName(req),
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${employee.employeeId} — admin ${employee.linkedAdminId} reactivated`,
            resourceType: 'employee',
            resourceId: String(employee._id)
        });

        res.json({ success: true });
    } catch (error) {
        console.error('reactivateSystemAccess Error:', error);
        res.status(500).json({ error: 'Failed to reactivate system access.' });
    }
};

/**
 * POST /api/admin/hrm/employees/:id/unlink-access
 * Permanently unbinds the employee from their admin account (account kept for audit).
 */
exports.unlinkSystemAccess = async (req, res) => {
    try {
        const employee = await findEmployeeRecord(req.params.id);
        if (!employee || !employee.linkedAdminId) {
            return res.status(400).json({ error: 'No access to revoke' });
        }

        const adminId = employee.linkedAdminId;
        await adminDualWrite(
            () => Admin.findByIdAndUpdate(
                adminId,
                { status: ACCOUNT_STATUS.BLOCKED },
                { returnDocument: 'after' }
            ),
            (updated) => mirrorAdminUpdate(updated, { operation: 'unlinkSystemAccessBlock' }),
            {
                operation: 'unlinkSystemAccessBlock',
                mongoId: String(adminId)
            }
        );

        employee.linkedAdminId = null;
        await dualWrite(
            () => employee.save(),
            async (saved) => {
                const repo = getEmployeeRepository();
                const pgEmployee = await repo.findByLegacyId(String(saved._id));
                if (pgEmployee && pgEmployee.linkedAdminId) {
                    await repo.unlinkAdminAccount(pgEmployee.id);
                }
            },
            {
                model: 'Employee',
                operation: 'update',
                mongoId: (saved) => String(saved._id)
            }
        );

        await logSecurityEvent({
            action: 'access_revoked',
            actor: actorName(req),
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${employee.employeeId} — admin ${adminId} unlinked`,
            resourceType: 'employee',
            resourceId: String(employee._id)
        });

        res.json({ success: true });
    } catch (error) {
        console.error('unlinkSystemAccess Error:', error);
        res.status(500).json({ error: 'Failed to unlink system access.' });
    }
};

/**
 * GET /api/admin/hrm/employees/:id/access-status
 * Returns whether the employee has a linked admin account and its summary.
 */
exports.getAccessStatus = async (req, res) => {
    try {
        const payload = await buildEmployeeAccessPayload(req.params.id);
        if (!payload.hasAccess) {
            return res.json({ hasAccess: false, linkedAdminId: payload.linkedAdminId || null });
        }
        if (payload.isSuperAdmin) {
            return res.json({
                hasAccess: true,
                isSuperAdmin: true,
                linkedAdminId: payload.linkedAdminId,
                admin: {
                    username: payload.username,
                    email: payload.email || '',
                    status: payload.status,
                    permissions: [],
                    lastLoginAt: payload.lastLogin || null
                }
            });
        }
        res.json({
            hasAccess: true,
            linkedAdminId: payload.linkedAdminId,
            admin: {
                username: payload.username,
                email: payload.email || '',
                status: payload.status,
                permissions: payload.permissions || [],
                lastLoginAt: payload.lastLogin || null
            }
        });
    } catch (error) {
        console.error('getAccessStatus Error:', error);
        res.status(500).json({ error: 'Failed to load access status.' });
    }
};

/**
 * GET /api/admin/hrm/employees/:id/access-info
 * Rich access summary for the employee profile Access tab.
 */
exports.getAccessInfo = async (req, res) => {
    try {
        const payload = await buildEmployeeAccessPayload(req.params.id);
        res.json(payload);
    } catch (error) {
        console.error('getAccessInfo Error:', error);
        res.status(500).json({ error: 'Failed to load access info.' });
    }
};

async function buildEmployeeAccessPayload(employeeId) {
    const employee = await findEmployeeRecord(employeeId);
    if (!employee || !employee.linkedAdminId) {
        return {
            hasAccount: false,
            hasAccess: false,
            isSuperAdmin: false,
            linkedAdminId: null,
            permissions: []
        };
    }

    const admin = await Admin.findById(employee.linkedAdminId)
        .select('username email role status permissions lastLoginAt');
    if (!admin) {
        return {
            hasAccount: false,
            hasAccess: false,
            isSuperAdmin: false,
            linkedAdminId: employee.linkedAdminId,
            permissions: []
        };
    }

    const role = admin.role || ROLES.SUPER_ADMIN;
    const isSuperAdmin = role === ROLES.SUPER_ADMIN;
    const permissions = Array.isArray(admin.permissions) ? admin.permissions : [];
    const lastLogin = admin.lastLoginAt || null;

    if (isSuperAdmin) {
        return {
            hasAccount: true,
            hasAccess: true,
            isSuperAdmin: true,
            linkedAdminId: employee.linkedAdminId,
            username: admin.username,
            role,
            status: admin.status,
            permissions: [],
            lastLogin
        };
    }

    return {
        hasAccount: true,
        hasAccess: true,
        isSuperAdmin: false,
        linkedAdminId: employee.linkedAdminId,
        username: admin.username,
        role,
        email: admin.email || '',
        status: admin.status,
        permissions,
        lastLogin,
        admin: {
            username: admin.username,
            email: admin.email || '',
            status: admin.status,
            permissions,
            lastLoginAt: lastLogin
        }
    };
}
