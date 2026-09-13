/********************************************************************
 * Supplier Repository — Isolated Integration Tests
 * Connects to the REAL Neon PostgreSQL test database.
 * Creates and cleans up its own data — does NOT touch MongoDB.
 *
 * Run: npm run test:repositories
 *
 * Stage 2 Step 2, Part 1 — 2026-09-13
 ********************************************************************/

const { describe, test, expect, afterAll } = require('./jestCompat');

require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const {
  findAll,
  findById,
  create,
  update,
  remove
} = require('../../backend/src/repositories/supplierRepository');

const PREFIX = `__test_sup_${Date.now()}_`;
const createdIds = [];

async function cleanup() {
  if (createdIds.length) {
    await prisma.supplier.deleteMany({ where: { id: { in: [...createdIds] } } });
    createdIds.length = 0;
  }
}

afterAll(async () => {
  await cleanup();
});

// ── CRUD tests ───────────────────────────────────────────────────────────────
describe('Supplier repository — real Neon DB', () => {
  test('create() inserts a supplier with defaults', async () => {
    const name = `${PREFIX}Acme Traders`;
    const record = await create({ name });
    createdIds.push(record.id);

    expect(record.id).toBeTruthy();
    expect(record._id).toBe(record.id);
    expect(record.name).toBe(name);
    expect(record.status).toBe('active');          // Mongoose-shaped return
    expect(record.contactPerson).toBe('');
    expect(record.phone).toBe('');
    expect(record.email).toBe('');
    expect(record.address).toBe('');
    expect(record.notes).toBe('');
  });

  test('create() stores all provided fields', async () => {
    const record = await create({
      name: `${PREFIX}BD Wholesale`,
      contactPerson: 'Rahim Uddin',
      phone: '01700000000',
      email: 'RAHIM@BD.COM',       // should be lowercased
      address: 'Dhaka, Bangladesh',
      notes: 'Reliable vendor',
      status: 'inactive'
    });
    createdIds.push(record.id);

    expect(record.contactPerson).toBe('Rahim Uddin');
    expect(record.phone).toBe('01700000000');
    expect(record.email).toBe('rahim@bd.com');     // lowercased
    expect(record.status).toBe('inactive');
    expect(record.notes).toBe('Reliable vendor');
  });

  test('findAll() returns all suppliers sorted newest-first', async () => {
    const a = await create({ name: `${PREFIX}Sup-A` });
    const b = await create({ name: `${PREFIX}Sup-B` });
    createdIds.push(a.id, b.id);

    const all = await findAll();
    const ids = all.map((r) => r.id);
    // B was created after A — should appear first
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
  });

  test('findAll() with status filter works', async () => {
    const active = await create({ name: `${PREFIX}ActiveSup`, status: 'active' });
    const inactive = await create({ name: `${PREFIX}InactiveSup`, status: 'inactive' });
    createdIds.push(active.id, inactive.id);

    const activeList = await findAll({ status: 'active' });
    const activeIds = activeList.map((r) => r.id);

    expect(activeIds).toContain(active.id);
    expect(activeIds).not.toContain(inactive.id);
  });

  test('findAll() with search filter matches name', async () => {
    const record = await create({ name: `${PREFIX}UniqueNameXYZ` });
    createdIds.push(record.id);

    const results = await findAll({ search: 'UniqueNameXYZ' });
    const ids = results.map((r) => r.id);
    expect(ids).toContain(record.id);
  });

  test('findAll() with search is case-insensitive', async () => {
    const record = await create({ name: `${PREFIX}CaseInsensitive` });
    createdIds.push(record.id);

    const lower = await findAll({ search: 'caseinsensitive' });
    expect(lower.map((r) => r.id)).toContain(record.id);
  });

  test('findById() returns the correct record with purchaseOrders', async () => {
    const name = `${PREFIX}WithOrders`;
    const created = await create({ name });
    createdIds.push(created.id);

    const record = await findById(created.id);
    expect(record).toBeDefined();
    expect(record.id).toBe(created.id);
    expect(record.name).toBe(name);
    // purchaseOrders should be an empty array (no POs in test data)
    expect(Array.isArray(record.purchaseOrders)).toBe(true);
    expect(record.purchaseOrders.length).toBe(0);
  });

  test('findById() returns null for non-existent id', async () => {
    expect(await findById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  test('update() changes supplied fields only', async () => {
    const created = await create({ name: `${PREFIX}ToUpdate`, phone: '01700000000' });
    createdIds.push(created.id);

    const updated = await update(created.id, {
      contactPerson: 'Karim',
      phone: '01800000001',
      status: 'inactive'
    });

    expect(updated.contactPerson).toBe('Karim');
    expect(updated.phone).toBe('01800000001');
    expect(updated.status).toBe('inactive');
    expect(updated.name).toBe(created.name);    // name unchanged
  });

  test('update() throws NOT_FOUND for unknown id', async () => {
    await expect(
      update('00000000-0000-0000-0000-000000000000', { phone: '123' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  test('update() throws when no fields supplied', async () => {
    const created = await create({ name: `${PREFIX}NoFields` });
    createdIds.push(created.id);

    await expect(
      update(created.id, {})
    ).rejects.toMatchObject({ code: 'NO_CHANGES' });
  });

  test('remove() deletes a supplier with no open POs', async () => {
    const created = await create({ name: `${PREFIX}ToDelete` });
    // Do not push — we delete manually
    const result = await remove(created.id);

    expect(result.deleted).toBe(true);
    expect(await findById(created.id)).toBeNull();
  });

  test('remove() throws NOT_FOUND for unknown id', async () => {
    await expect(
      remove('00000000-0000-0000-0000-000000000000')
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  // Note: The HAS_OPEN_PO error path requires a PurchaseOrder row in Neon.
  // During Stage 2 the purchase_orders table is empty (no backfill yet).
  // The OPEN_PO_STATUSES constant and the count query are verified correct by
  // code inspection; the integration path will be covered in Stage 3 tests.
});
