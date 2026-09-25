/********************************************************************
 * Transient Neon HTTP error detection + retry helper.
 * Used by prismaClient for repository tests and main server runtime.
 ********************************************************************/

'use strict';

function isNeonTimeoutError(err) {
  if (!err) return false;
  const name = String(err.name || '').toLowerCase();
  const msg = String(err.message || err || '').toLowerCase();
  return (
    name === 'timeouterror'
    || name === 'aborterror'
    || msg.includes('timeout')
    || msg.includes('timed out')
    || msg.includes('aborted due to timeout')
  );
}

function isNeonDbError(err) {
  if (!err) return false;
  const name = String(err.name || '');
  const code = String(err.code || '').toLowerCase();
  return (
    name === 'NeonDbError'
    || code === 'p1001'
    || code === 'p1002'
    || code === 'p1008'
    || code === 'p1017'
  );
}

function isTransientNeonError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  const code = String(err?.code || '').toLowerCase();

  if (err?.code === 'P2002' || err?.code === 'P2003' || err?.code === 'P2025') {
    return false;
  }

  return (
    isNeonTimeoutError(err)
    || isNeonDbError(err)
    || msg.includes('fetch failed')
    || msg.includes('performio')
    || msg.includes('econnreset')
    || msg.includes('etimedout')
    || msg.includes('econnrefused')
    || msg.includes('network')
    || msg.includes('socket hang up')
    || msg.includes('503')
    || msg.includes('429')
  );
}

function getPgFallbackReason(err) {
  if (isNeonTimeoutError(err)) return 'timed out';
  if (isNeonDbError(err)) return 'neon error';
  const msg = String(err?.message || err || '').trim();
  return msg || 'failed';
}

function logPgFallback(model, err, extra) {
  const suffix = extra ? ` (${extra})` : '';
  console.warn(`[PG-FALLBACK] ${model} ${getPgFallbackReason(err)} -> served via Mongo${suffix}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNeonQueryRetryEnabled() {
  if (process.env.REPOSITORY_TEST === '1') return true;
  return String(process.env.NEON_QUERY_RETRY || '1') !== '0';
}

function resolveRetryAttempts(options = {}) {
  if (options.attempts != null) return Number(options.attempts);
  if (process.env.REPOSITORY_TEST === '1') {
    return Number(process.env.NEON_RETRY_ATTEMPTS || 4);
  }
  // Runtime fail-fast: single attempt unless overridden.
  return Number(process.env.NEON_RETRY_ATTEMPTS || 1);
}

function resolveRetryBaseDelayMs(options = {}) {
  if (options.baseDelayMs != null) return Number(options.baseDelayMs);
  if (process.env.REPOSITORY_TEST === '1') {
    return Number(process.env.NEON_RETRY_BASE_DELAY_MS || 300);
  }
  return Number(process.env.NEON_RETRY_BASE_DELAY_MS || 0);
}

async function withNeonRetry(fn, options = {}) {
  const attempts = resolveRetryAttempts(options);
  const baseDelayMs = resolveRetryBaseDelayMs(options);
  let lastErr;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isLastAttempt = attempt >= attempts - 1;
      if (isLastAttempt || !isTransientNeonError(err)) {
        throw err;
      }
      const delayMs = baseDelayMs * (2 ** attempt);
      if (delayMs > 0) await sleep(delayMs);
    }
  }

  throw lastErr;
}

function buildNeonHttpAdapterOptions() {
  const isRepoTest = process.env.REPOSITORY_TEST === '1';
  const defaultTimeout = isRepoTest ? 90000 : 10000;
  const timeoutMs = Number(process.env.NEON_FETCH_TIMEOUT_MS || defaultTimeout);

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return {};
  }

  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return {
      fetchOptions: {
        signal: AbortSignal.timeout(timeoutMs)
      }
    };
  }

  return {};
}

function withNeonQueryRetries(client) {
  if (!isNeonQueryRetryEnabled() || typeof client.$extends !== 'function') {
    return client;
  }

  return client.$extends({
    query: {
      async $queryRaw({ args, query }) {
        return withNeonRetry(() => query(args));
      },
      async $executeRaw({ args, query }) {
        return withNeonRetry(() => query(args));
      },
      $allModels: {
        async $allOperations({ args, query }) {
          return withNeonRetry(() => query(args));
        }
      }
    }
  });
}

/** @deprecated alias — use withNeonQueryRetries */
function withRepositoryTestRetries(client) {
  return withNeonQueryRetries(client);
}

module.exports = {
  isNeonTimeoutError,
  isNeonDbError,
  isTransientNeonError,
  getPgFallbackReason,
  logPgFallback,
  isNeonQueryRetryEnabled,
  withNeonRetry,
  buildNeonHttpAdapterOptions,
  withNeonQueryRetries,
  withRepositoryTestRetries
};
