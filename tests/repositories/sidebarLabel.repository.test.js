/********************************************************************
 * SidebarLabel Repository — Isolated Integration Tests
 * Run: node --test --test-concurrency=1 tests/repositories/sidebarLabel.repository.test.js
 ********************************************************************/

const { describe, test, expect, afterAll, afterEach } = require('./jestCompat');

require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const SidebarLabel = require('../../backend/src/models/SidebarLabel');
const {
  findAllMap,
  upsertLabel,
  bulkUpsertLabels
} = require('../../backend/src/repositories/sidebarLabelRepository');

const PREFIX = `__test_sidebar_${Date.now()}_`;
const createdKeys = [];

async function cleanup() {
  if (createdKeys.length) {
    await prisma.sidebarLabel.deleteMany({
      where: { menuKey: { in: [...createdKeys] } }
    }).catch(() => {});
    await SidebarLabel.deleteMany({
      menuKey: { $in: [...createdKeys] }
    }).catch(() => {});
    createdKeys.length = 0;
  }
}

afterEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
});

describe('SidebarLabel repository — real Neon DB + Mongo', () => {
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

  test('bulkUpsertLabels() saves multiple labels in one call', async () => {
    const keyA = `${PREFIX}view-finance`;
    const keyB = `${PREFIX}view-settings`;
    createdKeys.push(keyA, keyB);

    const result = await bulkUpsertLabels({
      [keyA]: 'Finance Hub',
      [keyB]: 'Config Panel'
    }, 'admin-batch');

    expect(result.saved).toBe(2);
    expect(result.labels[keyA]).toBe('Finance Hub');
    expect(result.labels[keyB]).toBe('Config Panel');

    const map = await findAllMap();
    expect(map[keyA]).toBe('Finance Hub');
    expect(map[keyB]).toBe('Config Panel');
  });

});
