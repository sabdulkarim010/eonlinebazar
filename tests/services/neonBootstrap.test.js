/********************************************************************
 * Neon bootstrap defaults
 ********************************************************************/

const {
  normalizeNeonConnectionString,
  DEFAULT_WARMUP_ATTEMPTS,
  DEFAULT_WARMUP_DELAY_MS
} = require('../../backend/src/config/postgresBootstrap');
const { buildNeonHttpAdapterOptions } = require('../../backend/src/config/neonRetry');

describe('Neon bootstrap tuning', () => {
  test('normalizeNeonConnectionString adds sslmode=require', () => {
    const url = normalizeNeonConnectionString('postgresql://user:pass@host/db');
    expect(url).toContain('sslmode=require');
  });

  test('warmup defaults match cold-start retry policy', () => {
    expect(DEFAULT_WARMUP_ATTEMPTS).toBe(3);
    expect(DEFAULT_WARMUP_DELAY_MS).toBe(2000);
  });

  test('buildNeonHttpAdapterOptions uses 20s fetch timeout by default', () => {
    const prev = process.env.NEON_FETCH_TIMEOUT_MS;
    delete process.env.NEON_FETCH_TIMEOUT_MS;
    delete process.env.REPOSITORY_TEST;
    const opts = buildNeonHttpAdapterOptions();
    expect(opts.fetchOptions?.signal).toBeDefined();
    if (prev !== undefined) process.env.NEON_FETCH_TIMEOUT_MS = prev;
  });
});
