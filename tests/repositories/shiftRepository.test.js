const { describe, test, expect, afterAll } = require('./jestCompat');
require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const {
  upsertShiftInPG,
  getShiftByMongoId,
  listShiftsFromPG,
  deleteShiftInPG
} = require('../../backend/src/repositories/shiftRepository');

const PREFIX = `test_shift_${Date.now()}_`;
const createdLegacyIds = [];

function createMockMongoShift(overrides = {}) {
  const uniqueId = Math.random().toString(36).substr(2, 9);
  return {
    _id: `${PREFIX}${uniqueId}`,
    name: `${PREFIX}Morning Shift`,
    startTime: '09:00',
    endTime: '18:00',
    gracePeriodMinutes: 15,
    assignedStaff: ['staff_a', 'staff_b'],
    isDefault: false,
    createdBy: 'test-admin',
    ...overrides
  };
}

afterAll(async () => {
  if (createdLegacyIds.length) {
    await prisma.shift.deleteMany({ where: { legacyId: { in: [...createdLegacyIds] } } });
  }
});

describe('Shift repository — real Neon DB', () => {
  test('Test 1: upsertShiftInPG() creates shift with assignments', async () => {
    const mongoDoc = createMockMongoShift();
    createdLegacyIds.push(mongoDoc._id);

    const result = await upsertShiftInPG(mongoDoc);

    expect(result).toBeDefined();
    expect(result._id).toBe(String(mongoDoc._id));
    expect(result.name).toBe(mongoDoc.name);
    expect(Array.isArray(result.assignedStaff)).toBe(true);
    expect(result.assignedStaff.length).toBe(2);
  });

  test('Test 2: upsert same mongoId updates, no duplicate', async () => {
    const mongoDoc = createMockMongoShift({ assignedStaff: ['staff_x'] });
    createdLegacyIds.push(mongoDoc._id);

    await upsertShiftInPG(mongoDoc);
    mongoDoc.name = `${PREFIX}Updated Shift`;
    mongoDoc.assignedStaff = ['staff_y', 'staff_z'];
    const second = await upsertShiftInPG(mongoDoc);

    expect(second.name).toBe(`${PREFIX}Updated Shift`);
    expect(second.assignedStaff.length).toBe(2);

    const count = await prisma.shift.count({ where: { legacyId: String(mongoDoc._id) } });
    expect(count).toBe(1);
  });

  test('Test 3: listShiftsFromPG() returns array', async () => {
    const mongoDoc = createMockMongoShift();
    createdLegacyIds.push(mongoDoc._id);

    await upsertShiftInPG(mongoDoc);
    const rows = await listShiftsFromPG();

    expect(Array.isArray(rows)).toBe(true);
    expect(rows.find((s) => s._id === String(mongoDoc._id))).toBeDefined();
  });

  test('Test 4: getShiftByMongoId() returns correct record', async () => {
    const mongoDoc = createMockMongoShift();
    createdLegacyIds.push(mongoDoc._id);

    await upsertShiftInPG(mongoDoc);
    const found = await getShiftByMongoId(mongoDoc._id);

    expect(found).toBeDefined();
    expect(found._id).toBe(String(mongoDoc._id));
    expect(found.startTime).toBe('09:00');
  });

  test('Test 5: deleteShiftInPG() removes record', async () => {
    const mongoDoc = createMockMongoShift();
    await upsertShiftInPG(mongoDoc);

    await deleteShiftInPG(mongoDoc._id);
    const after = await prisma.shift.findUnique({ where: { legacyId: String(mongoDoc._id) } });
    expect(after).toBeNull();
  });
});
