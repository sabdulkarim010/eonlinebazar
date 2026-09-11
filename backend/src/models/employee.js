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
const EMPLOYEE_TYPES = ['permanent', 'contractual', 'part-time', 'intern'];
const SALARY_TYPES = ['monthly', 'daily', 'hourly'];
const GENDERS = ['male', 'female', 'other', ''];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-', ''];
const MARITAL_STATUSES = ['single', 'married', 'divorced', 'widowed', ''];

/** Attached documents — NID scans, contracts, certificates on Cloudinary. */
const documentSchema = new mongoose.Schema({
    title: { type: String, default: '', trim: true },
    fileUrl: { type: String, default: '', trim: true },
    fileType: { type: String, default: 'image', trim: true }, // 'image' or 'pdf'
    publicId: { type: String, default: '', trim: true },       // Cloudinary cleanup handle
    uploadedAt: { type: Date, default: Date.now }
}, { _id: true });

/** Character references supplied at hiring. */
const referenceSchema = new mongoose.Schema({
    name: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    relation: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true }
}, { _id: false });

const employeeSchema = new mongoose.Schema({
    employeeId: { type: String, unique: true, trim: true },
    fullName: { type: String, required: true, trim: true },

    // ── Identity ──────────────────────────────────────────
    dateOfBirth: { type: Date, default: null },
    gender: { type: String, enum: GENDERS, default: '' },
    bloodGroup: { type: String, enum: BLOOD_GROUPS, default: '' },
    religion: { type: String, default: '', trim: true },
    maritalStatus: { type: String, enum: MARITAL_STATUSES, default: '' },
    nationalId: { type: String, default: '', trim: true },
    photo: { type: String, default: '', trim: true },
    photoPublicId: { type: String, default: '', trim: true },

    // ── Contact ───────────────────────────────────────────
    phone: { type: String, required: true, trim: true },
    alternatePhone: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    presentAddress: { type: String, default: '', trim: true },
    permanentAddress: { type: String, default: '', trim: true },
    /** Legacy single-address field — kept in sync with presentAddress. */
    address: { type: String, default: '', trim: true },
    emergencyContact: {
        name: { type: String, default: '', trim: true },
        phone: { type: String, default: '', trim: true },
        relation: { type: String, default: '', trim: true }
    },

    // ── Employment ────────────────────────────────────────
    /** Canonical job title, drawn from the Designation catalog by name. */
    designation: { type: String, default: '', trim: true },
    /** Legacy alias kept in sync with designation for back-compat. */
    role: { type: String, default: '', trim: true },
    department: { type: String, default: 'Operations', trim: true },
    employeeType: { type: String, enum: EMPLOYEE_TYPES, default: 'permanent' },
    shift: { type: String, default: '', trim: true },
    joiningDate: { type: Date, default: null },

    // ── Salary & bank ─────────────────────────────────────
    baseSalary: { type: Number, default: 0 },
    salaryType: { type: String, enum: SALARY_TYPES, default: 'monthly' },
    bankName: { type: String, default: '', trim: true },
    bankAccountNumber: { type: String, default: '', trim: true },
    bkashNumber: { type: String, default: '', trim: true },

    // ── Documents & references ────────────────────────────
    documents: { type: [documentSchema], default: [] },
    references: { type: [referenceSchema], default: [] },

    // ── System access link ────────────────────────────────
    /** Admin account _id when this employee has been granted panel login. */
    linkedAdminId: { type: String, default: null },

    // ── Meta ──────────────────────────────────────────────
    status: { type: String, enum: EMPLOYEE_STATUSES, default: 'active' },
    notes: { type: String, default: '', trim: true },
    createdBy: { type: String, default: '', trim: true },
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

employeeSchema.index({ status: 1 });
employeeSchema.index({ department: 1 });
employeeSchema.index({ designation: 1 });
employeeSchema.index({ employeeType: 1 });

/**
 * Keep the canonical designation and the legacy role field in step, and
 * mirror the present address onto the legacy address column, so old readers
 * and new readers never disagree on the same record.
 */
employeeSchema.pre('save', function syncEmployeeAliases() {
    if (this.designation && !this.role) this.role = this.designation;
    else if (this.role && !this.designation) this.designation = this.role;

    if (this.presentAddress && !this.address) this.address = this.presentAddress;
    else if (this.address && !this.presentAddress) this.presentAddress = this.address;
});

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
module.exports.EMPLOYEE_TYPES = EMPLOYEE_TYPES;
module.exports.SALARY_TYPES = SALARY_TYPES;
module.exports.GENDERS = GENDERS;
module.exports.BLOOD_GROUPS = BLOOD_GROUPS;
module.exports.MARITAL_STATUSES = MARITAL_STATUSES;
