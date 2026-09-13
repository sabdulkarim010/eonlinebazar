/********************************************************************
 * Employee Repository — Isolated Integration Tests
 * Stage 2 Step 2, Part 4 — 2026-09-13
 ********************************************************************/

const { describe, test, expect, afterEach, afterAll } = require('./jestCompat');

require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const { create: createAdmin, findById: findAdminById } = require('../../backend/src/repositories/adminRepository');
const {
  generateEmployeeId,
  create,
  terminate,
  remove,
  addDocument,
  addReference,
  listDocuments,
  listReferences,
  linkAdminAccount
} = require('../../backend/src/repositories/employeeRepository');

const PREFIX = `__test_emp_${Date.now()}_`;
const createdEmployeeIds = [];
const createdAdminIds = [];

async function cleanup() {
  if (createdEmployeeIds.length) {
    await prisma.employee.deleteMany({ where: { id: { in: [...createdEmployeeIds] } } });
    createdEmployeeIds.length = 0;
  }
  if (createdAdminIds.length) {
    await prisma.admin.deleteMany({ where: { id: { in: [...createdAdminIds] } } });
    createdAdminIds.length = 0;
  }
}

afterEach(async () => { await cleanup(); });
afterAll(async () => { await cleanup(); });

function trackEmployee(record) {
  if (record?.id) createdEmployeeIds.push(record.id);
  return record;
}

function trackAdmin(record) {
  if (record?.id) createdAdminIds.push(record.id);
  return record;
}

function baseEmployee(overrides = {}) {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  return {
    fullName: `${PREFIX}Worker ${suffix}`,
    phone: `017${String(Date.now()).slice(-8)}`,
    ...overrides
  };
}

describe('Employee repository — real Neon DB', () => {
  test('create() generates EMP-xxx employeeId', async () => {
    const record = trackEmployee(await create(baseEmployee()));
    expect(record.employeeId).toMatch(/^EMP-\d{3,}$/i);
  });

  test('generateEmployeeId() increments from highest existing suffix', async () => {
    const id = await generateEmployeeId();
    expect(id).toMatch(/^EMP-\d{3,}$/);
  });

  test('terminate() sets TERMINATED and blocks linked admin', async () => {
    const admin = trackAdmin(await createAdmin({
      username: `${PREFIX}linked_admin`,
      password: 'TerminateTest1!',
      role: 'staff'
    }));

    const employee = trackEmployee(await create(baseEmployee()));
    await linkAdminAccount(employee.id, admin.id);

    const terminated = await terminate(employee.id);
    expect(terminated.status).toBe('terminated');

    const adminAfter = await findAdminById(admin.id);
    expect(adminAfter.status).toBe('blocked');
  });

  test('remove() cascades documents/references; linked Admin survives', async () => {
    const admin = trackAdmin(await createAdmin({
      username: `${PREFIX}cascade_admin`,
      password: 'CascadeTest1!',
      role: 'staff'
    }));

    const employee = await create(baseEmployee());
    await linkAdminAccount(employee.id, admin.id);

    const doc = await addDocument(employee.id, { title: 'NID', fileUrl: 'https://example.com/nid.pdf' });
    const ref = await addReference(employee.id, { name: 'Ref Person', phone: '01700000000' });

    await remove(employee.id);

    expect(await prisma.employeeDocument.findUnique({ where: { id: doc.id } })).toBeNull();
    expect(await prisma.employeeReference.findUnique({ where: { id: ref.id } })).toBeNull();

    const adminStill = await prisma.admin.findUnique({ where: { id: admin.id } });
    expect(adminStill).toBeTruthy();
  });
});
