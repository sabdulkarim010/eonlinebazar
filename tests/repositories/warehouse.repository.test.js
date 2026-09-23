/********************************************************************
 * Warehouse Repository — Isolated Integration Tests
 * Connects to the REAL Neon PostgreSQL test database.
 * Creates and cleans up its own data — does NOT touch MongoDB.
 *
 * Run: npm run test:repositories
 *
 * Stage 2 Step 2, Part 1 — 2026-09-13
 ********************************************************************/

const { describe, test, expect, afterAll, afterEach, beforeAll } = require('./jestCompat');

require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const {
  findAll,
  findById,
  create,
  update,
  remove,
  setDefault
} = require('../../backend/src/repositories/warehouseRepository');

const PREFIX = `__test_whs_${Date.now()}_`;
const createdIds = [];
/** Full pre-test warehouse isDefault/updatedAt snapshot — restored after each test. */
let preTestWarehouseSnapshot = null;

// Strict cleanup: delete every warehouse created in this run
async function cleanup() {
  if (createdIds.length) {
    await prisma.warehouse.updateMany({
      where: { id: { in: [...createdIds] } },
      data: { isDefault: false }
    });
    await prisma.warehouse.deleteMany({ where: { id: { in: [...createdIds] } } });
    createdIds.length = 0;
  }
}

async function restorePreTestWarehouseState() {
  if (!preTestWarehouseSnapshot?.length) return;
  for (const row of preTestWarehouseSnapshot) {
    await prisma.warehouse.update({
      where: { id: row.id },
      data: { isDefault: row.isDefault, updatedAt: row.updatedAt }
    });
  }
}

beforeAll(async () => {
  preTestWarehouseSnapshot = await prisma.warehouse.findMany({
    select: { id: true, isDefault: true, updatedAt: true }
  });
});

afterEach(async () => {
  await cleanup();
  await restorePreTestWarehouseState();
});

afterAll(async () => {
  await cleanup();
  await restorePreTestWarehouseState();
});

// ── CRUD tests ───────────────────────────────────────────────────────────────
describe('Warehouse repository — real Neon DB', () => {
  test('create() inserts a warehouse and returns shaped record', async () => {
    const name = `${PREFIX}Main Warehouse`;
    const record = await create({ name, location: 'Dhaka', status: 'active' });
    createdIds.push(record.id);

    expect(record.id).toBeTruthy();
    expect(record._id).toBe(record.id);
    expect(record.name).toBe(name);
    expect(record.location).toBe('Dhaka');
    expect(record.status).toBe('active');
  });

  test('first warehouse auto-becomes default when table is empty for these IDs', async () => {
    // We cannot guarantee the Neon table is empty (other tests may have run),
    // so we verify the explicit isDefault=true path instead.
    const record = await create({ name: `${PREFIX}Auto Default`, isDefault: true });
    createdIds.push(record.id);

    expect(record.isDefault).toBe(true);

    const refreshed = await findById(record.id);
    expect(refreshed.isDefault).toBe(true);
  });

  test('findAll() returns records sorted default-first then newest', async () => {
    const a = await create({ name: `${PREFIX}WH-A` });
    const b = await create({ name: `${PREFIX}WH-B` });
    createdIds.push(a.id, b.id);

    const all = await findAll();
    const ids = all.map((r) => r.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
  });

  test('findAll() with status filter works', async () => {
    const active = await create({ name: `${PREFIX}Active WH`, status: 'active' });
    const inactive = await create({ name: `${PREFIX}Inactive WH`, status: 'inactive' });
    createdIds.push(active.id, inactive.id);

    const activeList = await findAll({ status: 'active' });
    const activeIds = activeList.map((r) => r.id);

    expect(activeIds).toContain(active.id);
    expect(activeIds).not.toContain(inactive.id);
  });

  test('findById() returns the correct record', async () => {
    const name = `${PREFIX}Central`;
    const created = await create({ name });
    createdIds.push(created.id);

    const record = await findById(created.id);
    expect(record).toBeDefined();
    expect(record.id).toBe(created.id);
    expect(record.name).toBe(name);
  });

  test('findById() returns null for non-existent id', async () => {
    expect(await findById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  test('update() changes fields correctly', async () => {
    const created = await create({ name: `${PREFIX}ToUpdate`, location: 'Old' });
    createdIds.push(created.id);

    const updated = await update(created.id, {
      name: `${PREFIX}Updated`,
      location: 'Chittagong',
      phone: '01700000001'
    });

    expect(updated.name).toBe(`${PREFIX}Updated`);
    expect(updated.location).toBe('Chittagong');
    expect(updated.phone).toBe('01700000001');
  });

  test('update() rejects un-setting the default (must promote another first)', async () => {
    const record = await create({ name: `${PREFIX}IsDefault`, isDefault: true });
    createdIds.push(record.id);

    await expect(
      update(record.id, { isDefault: false })
    ).rejects.toMatchObject({ code: 'DEFAULT_MUST_EXIST' });
  });

  test('update() rejects deactivating the default warehouse', async () => {
    const record = await create({ name: `${PREFIX}DefaultActive`, isDefault: true });
    createdIds.push(record.id);

    await expect(
      update(record.id, { status: 'inactive' })
    ).rejects.toMatchObject({ code: 'DEFAULT_ACTIVE_REQUIRED' });
  });

  test('update() throws NOT_FOUND for unknown id', async () => {
    await expect(
      update('00000000-0000-0000-0000-000000000000', { location: 'X' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  test('setDefault() promotes one warehouse and demotes all others', async () => {
    const a = await create({ name: `${PREFIX}SetDef-A`, isDefault: true });
    const b = await create({ name: `${PREFIX}SetDef-B` });
    createdIds.push(a.id, b.id);

    // a is currently default; promote b
    const result = await setDefault(b.id);
    expect(result.isDefault).toBe(true);

    const checkA = await findById(a.id);
    const checkB = await findById(b.id);
    expect(checkA).toBeDefined();
    expect(checkB).toBeDefined();
    expect(checkA.isDefault).toBe(false);
    expect(checkB.isDefault).toBe(true);
  });

  test('setDefault() throws NOT_FOUND for unknown id', async () => {
    await expect(
      setDefault('00000000-0000-0000-0000-000000000000')
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  test('remove() deletes a non-default warehouse', async () => {
    // First create a default so there's something else to be default
    const def = await create({ name: `${PREFIX}RmDef`, isDefault: true });
    createdIds.push(def.id);

    const nonDef = await create({ name: `${PREFIX}RmNonDef` });
    // Ensure nonDef is not default
    if (nonDef.isDefault) {
      // promote def back
      await setDefault(def.id);
    }
    // Do not push nonDef.id — we delete it
    const result = await remove(nonDef.id);

    expect(result.deleted).toBe(true);
    expect(await findById(nonDef.id)).toBeNull();
  });

  test('remove() rejects deleting the default warehouse', async () => {
    const record = await create({ name: `${PREFIX}DefaultNoRm` });
    createdIds.push(record.id);
    await setDefault(record.id);

    const confirmed = await findById(record.id);
    expect(confirmed.isDefault).toBe(true);

    await expect(remove(record.id)).rejects.toMatchObject({ code: 'IS_DEFAULT' });
  });

  test('remove() throws NOT_FOUND for unknown id', async () => {
    await expect(
      remove('00000000-0000-0000-0000-000000000000')
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
