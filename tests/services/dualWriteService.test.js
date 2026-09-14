/********************************************************************
 * dualWriteService — Unit Tests (Jest)
 * Stage 2 Step 3, Part 1 — 2026-09-14
 ********************************************************************/

const { dualWrite: dualWriteFn } = require('../../backend/src/services/dualWriteService');

describe('dualWriteService', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test('Mongo succeeds, Postgres succeeds → returns Mongo result, no error logged', async () => {
    const mongoResult = { _id: '507f1f77bcf86cd799439011', name: 'Electronics' };
    const mongoWriteFn = jest.fn().mockResolvedValue(mongoResult);
    const postgresWriteFn = jest.fn().mockResolvedValue(undefined);

    const result = await dualWriteFn(
      mongoWriteFn,
      postgresWriteFn,
      { model: 'Category', operation: 'create' }
    );

    expect(result).toBe(mongoResult);
    expect(mongoWriteFn).toHaveBeenCalledTimes(1);
    expect(postgresWriteFn).toHaveBeenCalledTimes(1);
    expect(postgresWriteFn).toHaveBeenCalledWith(mongoResult);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  test('Mongo succeeds, Postgres throws → returns Mongo result unchanged, logs [DUAL-WRITE-FAILURE], does not throw', async () => {
    const mongoResult = { _id: '507f1f77bcf86cd799439011', name: 'Electronics' };
    const mongoWriteFn = jest.fn().mockResolvedValue(mongoResult);
    const postgresWriteFn = jest.fn().mockRejectedValue(new Error('Neon connection failed'));

    const result = await dualWriteFn(
      mongoWriteFn,
      postgresWriteFn,
      {
        model: 'Category',
        operation: 'update',
        mongoId: (doc) => String(doc._id)
      }
    );

    expect(result).toBe(mongoResult);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

    const [prefix, entry] = consoleErrorSpy.mock.calls[0];
    expect(prefix).toBe('[DUAL-WRITE-FAILURE]');
    expect(entry).toMatchObject({
      model: 'Category',
      operation: 'update',
      mongoId: '507f1f77bcf86cd799439011',
      error: 'Neon connection failed'
    });
    expect(entry.timestamp).toEqual(expect.any(String));
  });

  test('Mongo throws → Postgres write is never attempted and Mongo error propagates', async () => {
    const mongoError = new Error('Duplicate key');
    const mongoWriteFn = jest.fn().mockRejectedValue(mongoError);
    const postgresWriteFn = jest.fn().mockResolvedValue(undefined);

    await expect(
      dualWriteFn(
        mongoWriteFn,
        postgresWriteFn,
        { model: 'Category', operation: 'create' }
      )
    ).rejects.toThrow('Duplicate key');

    expect(mongoWriteFn).toHaveBeenCalledTimes(1);
    expect(postgresWriteFn).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
