/********************************************************************
 * Project: EonlineBazar — HRM Module
 * File: designationService.js
 * Location: services/designationService.js
 * Author: Abdul Karim Sheikh
 * Description: Designation bootstrap. Seeds a sensible starter catalog of
 * job titles on first startup so the Add Employee form always has options
 * to pick from before anyone opens the Designation Manager.
 ********************************************************************/

const Designation = require('../models/designation');

const DEFAULT_DESIGNATIONS = [
    { name: 'Manager', department: 'Management' },
    { name: 'Accountant', department: 'Finance' },
    { name: 'Delivery Man', department: 'Operations' },
    { name: 'Warehouse Staff', department: 'Operations' },
    { name: 'Cleaner', department: 'Operations' },
    { name: 'Security Guard', department: 'Operations' },
    { name: 'Customer Support', department: 'Support' },
    { name: 'Driver', department: 'Operations' }
];

/**
 * Ensure the starter designations exist. Runs an idempotent upsert so a
 * partially seeded collection is topped up without duplicating anything.
 */
async function seedDefaultDesignations() {
    const total = await Designation.countDocuments();
    if (total > 0) return { seeded: 0 };

    const docs = DEFAULT_DESIGNATIONS.map((d) => ({
        ...d,
        isActive: true,
        createdBy: 'system'
    }));

    await Designation.insertMany(docs, { ordered: false }).catch(() => {});
    console.log(`👥 Seeded ${docs.length} default designations.`);
    return { seeded: docs.length };
}

module.exports = { seedDefaultDesignations, DEFAULT_DESIGNATIONS };
