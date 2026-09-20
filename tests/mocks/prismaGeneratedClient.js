/********************************************************************
 * Jest substitute for generated/prisma/client.mts (ESM — not parseable in Jest VM).
 * Exports a PrismaClient class whose instances are a shared in-memory mock.
 * Repository tests (node --test) load the real client.mts and bypass this file.
 ********************************************************************/

'use strict';

const modelCache = new Map();

function createModelMock() {
  return {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'mock-pg-id' }),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    update: jest.fn().mockResolvedValue({ id: 'mock-pg-id' }),
    upsert: jest.fn().mockResolvedValue({ id: 'mock-pg-id', legacyId: 'mock-legacy-id' }),
    delete: jest.fn().mockResolvedValue({ id: 'mock-pg-id' }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    count: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue({ _sum: {}, _count: {}, _avg: {} }),
    groupBy: jest.fn().mockResolvedValue([])
  };
}

function getSharedPrismaMock() {
  if (!global.__jestPrismaMock) {
    const root = {
      $connect: jest.fn().mockResolvedValue(undefined),
      $disconnect: jest.fn().mockResolvedValue(undefined),
      $transaction: jest.fn((fn) => fn(getSharedPrismaMock())),
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn().mockResolvedValue(0)
    };

    global.__jestPrismaMock = new Proxy(root, {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (typeof prop === 'string' && !prop.startsWith('$')) {
          if (!modelCache.has(prop)) {
            modelCache.set(prop, createModelMock());
          }
          return modelCache.get(prop);
        }
        return undefined;
      }
    });
  }
  return global.__jestPrismaMock;
}

class PrismaClient {
  constructor() {
    return getSharedPrismaMock();
  }
}

module.exports = { PrismaClient };
