/********************************************************************
 * Project: EonlineBazar — HRM Module
 * File: attendanceLock.js
 * Description: Locks an attendance date so bulk/manual edits are blocked
 * until a Super Admin unlocks the day.
 ********************************************************************/

const mongoose = require('mongoose');

const attendanceLockSchema = new mongoose.Schema({
    /** Canonical key — YYYY-MM-DD in local calendar terms. */
    date: { type: String, required: true, unique: true, trim: true },
    lockedAt: { type: Date, default: Date.now },
    lockedBy: { type: String, default: '', trim: true },
    lockedByName: { type: String, default: '', trim: true }
}, { timestamps: true });

module.exports = mongoose.models.AttendanceLock
    || mongoose.model('AttendanceLock', attendanceLockSchema);
