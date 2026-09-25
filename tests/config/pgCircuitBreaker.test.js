/********************************************************************
 * pgCircuitBreaker — unit tests
 ********************************************************************/

const {
  shouldBypassPg,
  recordPgTimeout,
  recordPgSuccess,
  recordPgNonTimeoutFailure,
  resetPgCircuitBreaker,
  isPgCircuitOpen
} = require('../../backend/src/config/pgCircuitBreaker');

describe('pgCircuitBreaker', () => {
  beforeEach(() => {
    resetPgCircuitBreaker();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('starts closed', () => {
    expect(shouldBypassPg()).toBe(false);
  });

  test('opens after 10 consecutive timeouts within 60s', () => {
    for (let i = 0; i < 9; i++) {
      recordPgTimeout(Date.now());
      expect(shouldBypassPg()).toBe(false);
    }

    recordPgTimeout(Date.now());
    expect(shouldBypassPg()).toBe(true);
  });

  test('resets consecutive count on PG success', () => {
    recordPgTimeout(Date.now());
    recordPgTimeout(Date.now());
    recordPgSuccess();
    recordPgTimeout(Date.now());
    recordPgTimeout(Date.now());
    expect(shouldBypassPg()).toBe(false);
  });

  test('resets consecutive count on non-timeout failure', () => {
    recordPgTimeout(Date.now());
    recordPgTimeout(Date.now());
    recordPgNonTimeoutFailure();
    recordPgTimeout(Date.now());
    recordPgTimeout(Date.now());
    expect(shouldBypassPg()).toBe(false);
  });

  test('auto-closes after 30 seconds', () => {
    const start = Date.now();
    for (let i = 0; i < 10; i++) {
      recordPgTimeout(start);
    }
    expect(isPgCircuitOpen(start)).toBe(true);

    jest.advanceTimersByTime(30000);
    expect(shouldBypassPg()).toBe(false);
  });
});
