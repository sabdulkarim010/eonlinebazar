/********************************************************************
 * Lightweight in-memory circuit breaker for PG read paths.
 * Opens after 3 consecutive timeouts within 60s; auto-resets after 30s.
 ********************************************************************/

'use strict';

const FAILURE_THRESHOLD = Number(process.env.PG_CB_FAILURE_THRESHOLD || 10);
const FAILURE_WINDOW_MS = Number(process.env.PG_CB_FAILURE_WINDOW_MS || 60000);
const OPEN_DURATION_MS = Number(process.env.PG_CB_OPEN_DURATION_MS || 30000);

let consecutiveTimeoutAt = [];
let circuitOpenUntil = 0;

function resetPgCircuitBreaker() {
  consecutiveTimeoutAt = [];
  circuitOpenUntil = 0;
}

function isPgCircuitOpen(now = Date.now()) {
  if (circuitOpenUntil > 0 && now >= circuitOpenUntil) {
    resetPgCircuitBreaker();
    return false;
  }
  return circuitOpenUntil > now;
}

function shouldBypassPg() {
  return isPgCircuitOpen();
}

function recordPgSuccess() {
  consecutiveTimeoutAt = [];
}

function recordPgNonTimeoutFailure() {
  consecutiveTimeoutAt = [];
}

function recordPgTimeout(now = Date.now()) {
  consecutiveTimeoutAt.push(now);
  consecutiveTimeoutAt = consecutiveTimeoutAt.filter(
    (ts) => now - ts <= FAILURE_WINDOW_MS
  );

  if (
    consecutiveTimeoutAt.length >= FAILURE_THRESHOLD
    && now - consecutiveTimeoutAt[0] <= FAILURE_WINDOW_MS
  ) {
    circuitOpenUntil = now + OPEN_DURATION_MS;
  }
}

module.exports = {
  shouldBypassPg,
  isPgCircuitOpen,
  recordPgSuccess,
  recordPgTimeout,
  recordPgNonTimeoutFailure,
  resetPgCircuitBreaker
};
