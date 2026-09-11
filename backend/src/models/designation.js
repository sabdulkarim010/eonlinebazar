/********************************************************************
 * Project: EonlineBazar — HRM Module
 * File: designation.js
 * Location: models/designation.js
 * Author: Abdul Karim Sheikh
 * Description: Named job designations (roles) for operational employees.
 * Employees reference a designation by its name, so a small catalog keeps
 * the roster consistent ("Delivery Man" vs "delivery man" vs "Delivery").
 ********************************************************************/

const mongoose = require('mongoose');

const designationSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true },
    department: { type: String, default: 'Operations', trim: true },
    description: { type: String, default: '', trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: String, default: '', trim: true },
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

designationSchema.index({ isActive: 1 });
designationSchema.index({ department: 1 });

module.exports = mongoose.models.Designation || mongoose.model('Designation', designationSchema);
