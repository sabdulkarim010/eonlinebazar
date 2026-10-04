/**
 * Lightweight Postgres keep-alive to reduce Neon compute autosuspend cold starts.
 */
'use strict';

const prisma = require('./prismaClient');

const KEEPALIVE_INTERVAL_MS = 210_000;

let intervalHandle = null;

async function pingNeon() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.warn('[neonKeepAlive]', err?.message || err);
  }
}

function startNeonKeepAlive() {
  if (process.env.NODE_ENV === 'test') return;
  if (String(process.env.NEON_KEEPALIVE || '1') === '0') return;
  if (intervalHandle) return;

  void pingNeon();
  intervalHandle = setInterval(() => {
    void pingNeon();
  }, KEEPALIVE_INTERVAL_MS);

  if (typeof intervalHandle.unref === 'function') {
    intervalHandle.unref();
  }
}

module.exports = {
  startNeonKeepAlive,
  pingNeon,
  KEEPALIVE_INTERVAL_MS
};
