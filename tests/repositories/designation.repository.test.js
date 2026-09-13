/********************************************************************
 * Designation Repository — Isolated Integration Tests
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
} = require('../../backend/src/repositories/designationRepository');

const PREFIX = `__test_des_${Date.now()}_`;
const createdIds = [];

async function cleanup() {
  if (createdIds.length) {
    await prisma.designation.deleteMany({ where: { id: { in: [...createdIds] } } });
    createdIds.length = 0;
  }
}

afterAll(async () => {
  await cleanup();
});

// ── CRUD tests ───────────────────────────────────────────────────────────────
describe('Designation repository — real Neon DB', () => {
  test('create() inserts a designation with defaults', async () => {
    const name = `${PREFIX}Manager`;
    const record = await create({ name });
    createdIds.push(record.id);

    expect(record).toBeDefined();
    expect(record.id).toBeTruthy();
    expect(record._id).toBe(record.id);
    expect(record.name).toBe(name);
    expect(record.department).toBe('Operations');
    expect(record.isActive).toBe(true);
    expect(record.description).toBe('');
  });

  test('create() respects provided department and description', async () => {
    const name = `${PREFIX}HR Manager`;
    const record = await create({
      name,
      department: 'Human Resources',
      description: 'Manages HR',
      createdBy: 'system'
    });
    createdIds.push(record.id);

    expect(record.department).toBe('Human Resources');
    expect(record.description).toBe('Manages HR');
    expect(record.createdBy).toBe('system');
  });

  test('findAll() returns all designations sorted by name', async () => {
    const nameA = `${PREFIX}Zebra Role`;
    const nameB = `${PREFIX}Alpha Role`;
    const a = await create({ name: nameA });
    const b = await create({ name: nameB });
    createdIds.push(a.id, b.id);

    const all = await findAll();
    const names = all.map((d) => d.name);
    const idxA = names.indexOf(nameA);
    const idxB = names.indexOf(nameB);

    expect(idxA).toBeGreaterThan(-1);
    expect(idxB).toBeGreaterThan(-1);
    // Alpha comes before Zebra alphabetically
    expect(idxB).toBeLessThan(idxA);
  });

  test('findAll() with activeOnly filters correctly', async () => {
    const active = await create({ name: `${PREFIX}ActiveRole`, isActive: true });
    const inactive = await create({ name: `${PREFIX}InactiveRole`, isActive: false });
    createdIds.push(active.id, inactive.id);

    const all = await findAll({ activeOnly: true });
    const ids = all.map((d) => d.id);

    expect(ids).toContain(active.id);
    expect(ids).not.toContain(inactive.id);
  });

  test('findAll() attaches employeeCount (0 when no employees)', async () => {
    const record = await create({ name: `${PREFIX}NoStaff` });
    createdIds.push(record.id);

    const all = await findAll();
    const found = all.find((d) => d.id === record.id);
    expect(found).toBeDefined();
    // No employees exist for this designation in the test DB
    expect(found.employeeCount).toBe(0);
  });

  test('findById() returns the correct record', async () => {
    const name = `${PREFIX}Supervisor`;
    const created = await create({ name });
    createdIds.push(created.id);

    const record = await findById(created.id);
    expect(record).toBeDefined();
    expect(record.id).toBe(created.id);
    expect(record.name).toBe(name);
  });

  test('findById() returns null for non-existent id', async () => {
    const result = await findById('00000000-0000-0000-0000-000000000000');
    expect(result).toBeNull();
  });

  test('update() changes allowed fields', async () => {
    const created = await create({ name: `${PREFIX}OldDesig` });
    createdIds.push(created.id);

    const updated = await update(created.id, {
      name: `${PREFIX}NewDesig`,
      department: 'IT',
      description: 'Updated desc',
      isActive: false
    });

    expect(updated.name).toBe(`${PREFIX}NewDesig`);
    expect(updated.department).toBe('IT');
    expect(updated.description).toBe('Updated desc');
    expect(updated.isActive).toBe(false);
  });

  test('update() throws NOT_FOUND for unknown id', async () => {
    await expect(
      update('00000000-0000-0000-0000-000000000000', { isActive: false })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  test('remove() deletes a designation with no employees', async () => {
    const created = await create({ name: `${PREFIX}ToDelete` });
    // Do not push to createdIds — we delete manually
    const result = await remove(created.id);

    expect(result.deleted).toBe(true);
    const check = await findById(created.id);
    expect(check).toBeNull();
  });

  test('remove() throws NOT_FOUND for unknown id', async () => {
    await expect(
      remove('00000000-0000-0000-0000-000000000000')
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  // Note: The IN_USE error path requires an Employee row with designationId FK.
  // During Stage 2 the employee table is empty in Neon (no backfill yet), so we
  // only document the expected behaviour here and verify the check logic works
  // by confirming a designation with zero employees deletes successfully (above).
});
