'use strict';

/**
 * Sync Leave + Attendance Mongoose indexes (idempotent — safe on every boot).
 */
async function ensureHrmMongoIndexes() {
  const mongoose = require('mongoose');
  if (mongoose.connection.readyState !== 1) return { skipped: true };

  const Leave = require('../models/leave');
  const Attendance = require('../models/attendance');

  await Promise.all([
    Leave.syncIndexes(),
    Attendance.syncIndexes()
  ]);

  return { skipped: false };
}

module.exports = { ensureHrmMongoIndexes };
