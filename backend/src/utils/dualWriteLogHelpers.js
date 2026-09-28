'use strict';

/**
 * Suppress noisy dual-write console errors when Postgres parents are missing
 * (common in Jest / partial migration DBs). Production still logs all failures.
 */
function isMissingParentPrismaError(err) {
  if (!err) return false;
  if (err.code === 'P2003') return true;
  if (err.missingParent === true) return true;
  const msg = String(err.message || err).toLowerCase();
  return msg.includes('foreign key')
    || msg.includes('not found in pg')
    || msg.includes('not found in postgres');
}

function shouldLogDualWriteFailure(err) {
  if (process.env.NODE_ENV === 'test' && isMissingParentPrismaError(err)) {
    return false;
  }
  if (String(process.env.DUAL_WRITE_QUIET || '') === '1' && isMissingParentPrismaError(err)) {
    return false;
  }
  return true;
}

function logDualWriteFailure(tag, payload, err) {
  if (!shouldLogDualWriteFailure(err)) return;
  if (typeof payload === 'object' && payload !== null) {
    console.error(tag, payload);
  } else {
    console.error(tag, payload, err?.message || err);
  }
}

module.exports = {
  isMissingParentPrismaError,
  shouldLogDualWriteFailure,
  logDualWriteFailure
};
