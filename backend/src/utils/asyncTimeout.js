'use strict';

/**
 * Reject when `promise` does not settle within `ms`.
 * Used to fail fast on slow PG reads so API handlers can fall back to Mongo/defaults.
 */
async function withAsyncTimeout(promise, ms, label = 'Operation') {
  const timeoutMs = Number(ms);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${timeoutMs}ms`);
      err.code = 'ASYNC_TIMEOUT';
      reject(err);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { withAsyncTimeout };
