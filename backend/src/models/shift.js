/********************************************************************
 * Project: EonlineBazar — HRM Module
 * File: shift.js
 * Location: models/shift.js
 * Author: Abdul Karim Sheikh
 * Description: Named working windows staff are rostered onto. The grace
 * period decides how long after `startTime` an arrival still counts as
 * on time, so late marking is a store policy rather than a hard rule.
 ********************************************************************/

const mongoose = require('mongoose');

const shiftSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    /** "HH:MM" 24-hour wall-clock strings. */
    startTime: { type: String, default: '09:00', trim: true },
    endTime: { type: String, default: '18:00', trim: true },
    gracePeriodMinutes: { type: Number, default: 15, min: 0 },
    /** Staff usernames — HRM keys staff by username, not ObjectId. */
    assignedStaff: [{ type: String, trim: true }],
    /** Exactly one shift holds this flag — enforced by the controller. */
    isDefault: { type: Boolean, default: false },
    createdBy: { type: String, default: '', trim: true }
}, { timestamps: true });

shiftSchema.index({ isDefault: -1 });
shiftSchema.index({ assignedStaff: 1 });

module.exports = mongoose.models.Shift || mongoose.model('Shift', shiftSchema);
