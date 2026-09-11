/********************************************************************
 * Project: EonlineBazar — HRM Module
 * File: employeeController.js
 * Location: controllers/admin/employeeController.js
 * Author: Abdul Karim Sheikh
 * Description: CRUD for non-login operational staff (delivery, labour, etc.).
 ********************************************************************/

const mongoose = require('mongoose');
const Employee = require('../../models/employee');
const { logSecurityEvent, getClientIp } = require('../../utils/securityLogger');

const { EMPLOYEE_STATUSES } = Employee;

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

function pickEmployeeFields(body, { partial = false } = {}) {
    const fields = {};
    const source = body || {};

    const assign = (key, transform = (v) => v) => {
        if (!partial || source[key] !== undefined) {
            fields[key] = transform(source[key]);
        }
    };

    assign('fullName', (v) => String(v || '').trim());
    assign('phone', (v) => String(v || '').trim());
    assign('nationalId', (v) => String(v || '').trim());
    assign('photo', (v) => String(v || '').trim());
    assign('role', (v) => String(v || '').trim());
    assign('department', (v) => String(v || 'Operations').trim() || 'Operations');
    assign('baseSalary', (v) => Math.max(0, Number(v) || 0));
    assign('address', (v) => String(v || '').trim());
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

    return fields;
}

const { findEmployeeRecord } = require('../../utils/hrmStaffResolver');

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

        const search = String(req.query.search || '').trim();
        if (search) {
            const re = new RegExp(escapeRegex(search), 'i');
            filter.$or = [{ fullName: re }, { phone: re }, { employeeId: re }, { role: re }];
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
        const [totals, byDepartment] = await Promise.all([
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
        if (!fields.role) {
            return res.status(400).json({ success: false, message: 'Role is required.' });
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
        if (fields.role !== undefined && !fields.role) {
            return res.status(400).json({ success: false, message: 'Role cannot be empty.' });
        }

        Object.assign(employee, fields);
        await employee.save();

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
