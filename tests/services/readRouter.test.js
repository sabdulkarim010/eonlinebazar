/********************************************************************
 * readRouter + readCutoverFlags — Unit Tests (Jest)
 * Stage 4 Step 1 — 2026-09-15
 ********************************************************************/

const { routedRead } = require('../../backend/src/services/readRouter');
const { isPgReadEnabled, GROUP_ENV } = require('../../backend/src/config/readCutoverFlags');

describe('readCutoverFlags', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('all group flags default to false when env vars unset', () => {
    Object.values(GROUP_ENV).forEach((key) => {
      delete process.env[key];
    });
    expect(isPgReadEnabled('category')).toBe(false);
    expect(isPgReadEnabled('brand')).toBe(false);
    expect(isPgReadEnabled('supplier')).toBe(false);
    expect(isPgReadEnabled('warehouse')).toBe(false);
    expect(isPgReadEnabled('designation')).toBe(false);
    expect(isPgReadEnabled('unknown')).toBe(false);
  });

  test('isPgReadEnabled returns true only when env var is exactly "true"', () => {
    process.env.READ_PG_CATEGORY = 'true';
    expect(isPgReadEnabled('category')).toBe(true);
    process.env.READ_PG_CATEGORY = '1';
    expect(isPgReadEnabled('category')).toBe(false);
  });
});

describe('routedRead', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('flag OFF → uses Mongo read function', async () => {
    delete process.env.READ_PG_BRAND;
    const mongoFn = jest.fn().mockResolvedValue([{ _id: 'abc', name: 'Acme' }]);
    const pgFn = jest.fn();

    const result = await routedRead('brand', mongoFn, pgFn);

    expect(result).toEqual([{ _id: 'abc', name: 'Acme' }]);
    expect(mongoFn).toHaveBeenCalledTimes(1);
    expect(pgFn).not.toHaveBeenCalled();
  });

  test('flag ON → uses Postgres read function', async () => {
    process.env.READ_PG_BRAND = 'true';
    const mongoFn = jest.fn();
    const pgFn = jest.fn().mockResolvedValue([{ _id: '507f1f77bcf86cd799439011', name: 'Acme' }]);

    const result = await routedRead('brand', mongoFn, pgFn);

    expect(result).toHaveLength(1);
    expect(pgFn).toHaveBeenCalledTimes(1);
    expect(mongoFn).not.toHaveBeenCalled();
  });

  test('flag ON + Postgres throws → falls back to Mongo and logs [READ-CUTOVER-FALLBACK]', async () => {
    process.env.READ_PG_CATEGORY = 'true';
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const mongoResult = [{ _id: 'mongo-id', name: 'Fashion' }];
    const mongoFn = jest.fn().mockResolvedValue(mongoResult);
    const pgFn = jest.fn().mockRejectedValue(new Error('Neon timeout'));

    const result = await routedRead('category', mongoFn, pgFn);

    expect(result).toBe(mongoResult);
    expect(mongoFn).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('[READ-CUTOVER-FALLBACK]');
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('category');

    consoleErrorSpy.mockRestore();
  });
});
