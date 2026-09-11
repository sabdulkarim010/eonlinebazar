/********************************************************************
 * Project: EonlineBazar — HRM Module
 * File: attendance.js
 * Location: models/attendance.js
 * Author: Abdul Karim Sheikh
 * Description: One document per staff member per day. `date` is always
 * normalized to local midnight so a day can be looked up by an exact
 * value and a clock-in never creates a second row for the same shift.
 ********************************************************************/

const mongoose = require('mongoose');

const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'half-day', 'holiday'];
const SHIFT_TYPES = ['morning', 'evening', 'night', 'custom'];

const attendanceSchema = new mongoose.Schema({
    /** String form of the Admin _id — staff identity is username-driven across HRM. */
    staffId: { type: String, ref: 'Admin', required: true },
    staffUsername: { type: String, default: '', trim: true },
    date: { type: Date, required: true },
    clockIn: { type: Date, default: null },
    clockOut: { type: Date, default: null },
    /** Derived from clockIn/clockOut by the pre-save hook — never written by hand. */
    hoursWorked: { type: Number, default: 0 },
    status: { type: String, enum: ATTENDANCE_STATUSES, default: 'absent' },
    isLate: { type: Boolean, default: false },
    lateMinutes: { type: Number, default: 0 },
    shift: { type: String, enum: SHIFT_TYPES, default: 'morning' },
    /** "HH:MM" 24-hour wall-clock strings, matching the Shift model. */
    shiftStart: { type: String, default: '09:00', trim: true },
    shiftEnd: { type: String, default: '18:00', trim: true },
    /** Populated only when a mobile clock-in sends coordinates. */
    gpsLocation: {
        lat: { type: Number, default: null },
        lng: { type: Number, default: null }
    },
    notes: { type: String, default: '', trim: true },
    /** 'self' for a staff clock-in, otherwise the admin username who marked it. */
    markedBy: { type: String, default: 'self', trim: true }
}, { timestamps: true });

attendanceSchema.index({ staffId: 1, date: -1 });
attendanceSchema.index({ date: -1, status: 1 });

/** Midnight of the given day — the canonical key for one attendance row. */
attendanceSchema.statics.normalizeDate = function normalizeDate(input) {
    const d = input ? new Date(input) : new Date();
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
};

/** Minutes since midnight for a "HH:MM" string, or null when unparseable. */
attendanceSchema.statics.parseShiftMinutes = function parseShiftMinutes(value) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
};

// Clock times are the source of truth when both exist. An open shift (clocked
// in, not yet out) has no hours to report. A row with no clock times at all was
// marked by hand, so whatever hours the admin entered stand.
attendanceSchema.pre('save', function computeHoursWorked() {
    if (this.clockIn && this.clockOut) {
        const ms = new Date(this.clockOut).getTime() - new Date(this.clockIn).getTime();
        this.hoursWorked = ms > 0 ? Math.round((ms / 3600000) * 100) / 100 : 0;
    } else if (this.clockIn && !this.clockOut) {
        this.hoursWorked = 0;
    }
});

module.exports = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);
module.exports.ATTENDANCE_STATUSES = ATTENDANCE_STATUSES;
module.exports.SHIFT_TYPES = SHIFT_TYPES;
