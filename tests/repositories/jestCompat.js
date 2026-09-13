/********************************************************************
 * Minimal Jest-like API on top of Node's built-in test runner.
 *
 * Repository integration tests require the Prisma-generated .mts client,
 * which loads via Node 22.18+ native type-stripping + require(esm).
 * Jest's module loader cannot parse those files, so these tests run with:
 *
 *   npm run test:repositories
 *   → node --test tests/repositories/*.repository.test.js
 *
 * They are excluded from the main `npm test` Jest suite via
 * testPathIgnorePatterns in package.json.
 ********************************************************************/

'use strict';

const nodeTest = require('node:test');
const assert = require('node:assert/strict');

function describe(name, fn) {
  nodeTest.describe(name, fn);
}

function test(name, fn) {
  nodeTest.it(name, async () => {
    await fn();
  });
}

function afterAll(fn) {
  nodeTest.after(fn);
}

function afterEach(fn) {
  nodeTest.afterEach(fn);
}

function buildMatchers(actual) {
  return {
    toBe(expected) {
      assert.equal(actual, expected);
    },
    toBeDefined() {
      assert.notEqual(actual, undefined);
    },
    toBeUndefined() {
      assert.equal(actual, undefined);
    },
    toBeNull() {
      assert.equal(actual, null);
    },
    toBeTruthy() {
      assert.ok(actual);
    },
    toContain(substr) {
      assert.ok(
        String(actual).includes(substr),
        `Expected ${JSON.stringify(actual)} to contain ${JSON.stringify(substr)}`
      );
    },
    toEqual(expected) {
      assert.deepEqual(actual, expected);
    },
    toHaveLength(n) {
      assert.equal(actual.length, n);
    },
    toBeLessThan(n) {
      assert.ok(actual < n, `Expected ${actual} to be less than ${n}`);
    },
    toBeGreaterThan(n) {
      assert.ok(actual > n, `Expected ${actual} to be greater than ${n}`);
    },
    not: {
      toContain(substr) {
        assert.ok(!String(actual).includes(substr));
      },
      toBe(expected) {
        assert.notEqual(actual, expected);
      }
    },
    rejects: {
      async toMatchObject(partial) {
        await assert.rejects(actual, (err) => {
          for (const [key, value] of Object.entries(partial)) {
            if (err[key] !== value) return false;
          }
          return true;
        });
      }
    }
  };
}

function expect(actual) {
  return buildMatchers(actual);
}

module.exports = { describe, test, expect, afterAll, afterEach };
