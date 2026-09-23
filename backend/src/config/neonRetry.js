/********************************************************************
 * Transient Neon HTTP error detection + retry helper.
 * Used by prismaClient during repository integration tests (REPOSITORY_TEST=1).
 ********************************************************************/

'use strict';

function isTransientNeonError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  const code = String(err?.code || '').toLowerCase();

  if (err?.code === 'P2002' || err?.code === 'P2003' || err?.code === 'P2025') {
    return false;
  }

  return (
    msg.includes('fetch failed') ||
    msg.includes('performio') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('econnrefused') ||
    msg.includes('network') ||
    msg.includes('socket hang up') ||
    msg.includes('503') ||
    msg.includes('429') ||
    code === 'p1001' ||
    code === 'p1002' ||
    code === 'p1008' ||
    code === 'p1017'
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withNeonRetry(fn, options = {}) {
  const attempts = Number(options.attempts || process.env.NEON_RETRY_ATTEMPTS || 4);
  const baseDelayMs = Number(options.baseDelayMs || process.env.NEON_RETRY_BASE_DELAY_MS || 300);
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
      await sleep(baseDelayMs * (attempt + 1));
    }
  }

  throw lastErr;
}

function buildNeonHttpAdapterOptions() {
  const isRepoTest = process.env.REPOSITORY_TEST === '1';
  const timeoutMs = Number(
    process.env.NEON_FETCH_TIMEOUT_MS || (isRepoTest ? 90000 : 20000)
  );

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

function withRepositoryTestRetries(client) {
  if (process.env.REPOSITORY_TEST !== '1' || typeof client.$extends !== 'function') {
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

module.exports = {
  isTransientNeonError,
  withNeonRetry,
  buildNeonHttpAdapterOptions,
  withRepositoryTestRetries
};
