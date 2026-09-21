/********************************************************************
 * SidebarLabel Repository — Isolated Integration Tests
 * Run: node --test --test-concurrency=1 tests/repositories/sidebarLabel.repository.test.js
 ********************************************************************/

const { describe, test, expect, afterAll, afterEach } = require('./jestCompat');

require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const {
  findAllMap,
  upsertLabel
} = require('../../backend/src/repositories/sidebarLabelRepository');

const PREFIX = `__test_sidebar_${Date.now()}_`;
const createdKeys = [];

async function cleanup() {
  if (createdKeys.length) {
    await prisma.sidebarLabel.deleteMany({
      where: { menuKey: { in: [...createdKeys] } }
    });
    createdKeys.length = 0;
  }
}

afterEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
});

describe('SidebarLabel repository — real Neon DB', () => {
  test('upsertLabel() creates a new label', async () => {
    const menuKey = `${PREFIX}view-orders`;
    createdKeys.push(menuKey);

    const record = await upsertLabel(menuKey, 'Custom Orders', 'admin-test');
    expect(record.menuKey).toBe(menuKey);
    expect(record.label).toBe('Custom Orders');
    expect(record.adminId).toBe('admin-test');
  });

  test('upsertLabel() updates an existing label', async () => {
    const menuKey = `${PREFIX}view-customers`;
    createdKeys.push(menuKey);

    await upsertLabel(menuKey, 'Clients', 'admin-a');
    const updated = await upsertLabel(menuKey, 'Customer DB', 'admin-b');

    expect(updated.label).toBe('Customer DB');
    expect(updated.adminId).toBe('admin-b');
  });

  test('findAllMap() returns menuKey → label map', async () => {
    const keyA = `${PREFIX}view-products`;
    const keyB = `${PREFIX}view-staff`;
    createdKeys.push(keyA, keyB);

    await upsertLabel(keyA, 'Products Label', 'admin-map');
    await upsertLabel(keyB, 'Staff Label', 'admin-map');

    const map = await findAllMap();
    expect(map[keyA]).toBe('Products Label');
    expect(map[keyB]).toBe('Staff Label');
  });
});
