/********************************************************************
 * Project: EonlineBazar — HRM Module
 * File: employee.js
 * Location: models/employee.js
 * Author: Abdul Karim Sheikh
 * Description: Non-login operational staff (delivery, labour, cleaners).
 * These records participate in attendance, payroll, and leave alongside
 * login-capable Admin accounts via the shared staffType discriminator.
 ********************************************************************/

const mongoose = require('mongoose');

const EMPLOYEE_STATUSES = ['active', 'inactive', 'terminated'];

const employeeSchema = new mongoose.Schema({
    employeeId: { type: String, unique: true, trim: true },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    nationalId: { type: String, default: '', trim: true },
    photo: { type: String, default: '', trim: true },
    role: { type: String, required: true, trim: true },
    department: { type: String, default: 'Operations', trim: true },
    baseSalary: { type: Number, default: 0 },
    joiningDate: { type: Date, default: null },
    address: { type: String, default: '', trim: true },
    emergencyContact: {
        name: { type: String, default: '', trim: true },
        phone: { type: String, default: '', trim: true },
        relation: { type: String, default: '', trim: true }
    },
    status: { type: String, enum: EMPLOYEE_STATUSES, default: 'active' },
    notes: { type: String, default: '', trim: true },
    createdBy: { type: String, default: '', trim: true },
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

employeeSchema.index({ status: 1 });
employeeSchema.index({ department: 1 });

/**
 * Sequential human-readable id (EMP-001, EMP-002, …).
 * Parses the highest existing suffix so gaps do not rewind the counter.
 */
employeeSchema.statics.generateEmployeeId = async function generateEmployeeId() {
    const latest = await this.findOne({ employeeId: /^EMP-\d+$/i })
        .sort({ employeeId: -1 })
        .select('employeeId')
        .lean();

    let next = 1;
    if (latest?.employeeId) {
        const match = /^EMP-(\d+)$/i.exec(String(latest.employeeId).trim());
        if (match) next = parseInt(match[1], 10) + 1;
    }

    return `EMP-${String(next).padStart(3, '0')}`;
};

module.exports = mongoose.models.Employee || mongoose.model('Employee', employeeSchema);
module.exports.EMPLOYEE_STATUSES = EMPLOYEE_STATUSES;
