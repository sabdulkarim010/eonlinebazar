const { describe, test, expect, beforeAll, afterAll } = require('./jestCompat');
require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const {
  upsertNoteInPG,
  getNoteByMongoId,
  listNotesFromPG,
  deleteNoteInPG
} = require('../../backend/src/repositories/noteRepository');

const PREFIX = `test_note_${Date.now()}_`;
const createdNoteLegacyIds = [];
const createdUserIds = [];

let testUserLegacyId;

function createMockMongoNote(overrides = {}) {
  const uniqueId = Math.random().toString(36).substr(2, 9);
  return {
    _id: `${PREFIX}${uniqueId}`,
    user: testUserLegacyId,
    title: `${PREFIX}My Note`,
    content: 'Test content',
    type: 'shopping',
    category: 'food',
    shoppingItems: [{ name: 'Rice', price: 50, checked: false }],
    tags: ['test'],
    pinned: false,
    color: '#FFFEF0',
    date: new Date('2026-05-01T00:00:00.000Z'),
    ...overrides
  };
}

beforeAll(async () => {
  const userLegacyId = `${PREFIX}user`;
  const user = await prisma.user.create({
    data: {
      legacyId: userLegacyId,
      email: `${PREFIX}@example.com`,
      password: 'hashed',
      firstName: 'Test',
      lastName: 'User'
    }
  });
  createdUserIds.push(user.id);
  testUserLegacyId = userLegacyId;
});

afterAll(async () => {
  if (createdNoteLegacyIds.length) {
    await prisma.note.deleteMany({ where: { legacyId: { in: [...createdNoteLegacyIds] } } });
  }
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: [...createdUserIds] } } });
  }
});

describe('Note repository — real Neon DB', () => {
  test('Test 1: upsertNoteInPG() creates note with shopping items', async () => {
    const mongoDoc = createMockMongoNote();
    createdNoteLegacyIds.push(mongoDoc._id);

    const result = await upsertNoteInPG(mongoDoc);

    expect(result).toBeDefined();
    expect(result._id).toBe(String(mongoDoc._id));
    expect(result.title).toBe(mongoDoc.title);
    expect(result.shoppingItems.length).toBe(1);
    expect(result.shoppingItems[0].name).toBe('Rice');
  });

  test('Test 2: upsert same mongoId updates, no duplicate', async () => {
    const mongoDoc = createMockMongoNote();
    createdNoteLegacyIds.push(mongoDoc._id);

    await upsertNoteInPG(mongoDoc);
    mongoDoc.title = `${PREFIX}Updated Title`;
    mongoDoc.shoppingItems = [{ name: 'Oil', price: 120, checked: true }];
    const second = await upsertNoteInPG(mongoDoc);

    expect(second.title).toBe(`${PREFIX}Updated Title`);
    expect(second.shoppingItems[0].name).toBe('Oil');

    const count = await prisma.note.count({ where: { legacyId: String(mongoDoc._id) } });
    expect(count).toBe(1);
  });

  test('Test 3: listNotesFromPG() returns array', async () => {
    const mongoDoc = createMockMongoNote();
    createdNoteLegacyIds.push(mongoDoc._id);

    await upsertNoteInPG(mongoDoc);
    const rows = await listNotesFromPG({ userId: testUserLegacyId });

    expect(Array.isArray(rows)).toBe(true);
    expect(rows.find((n) => n._id === String(mongoDoc._id))).toBeDefined();
  });

  test('Test 4: getNoteByMongoId() returns correct record', async () => {
    const mongoDoc = createMockMongoNote();
    createdNoteLegacyIds.push(mongoDoc._id);

    await upsertNoteInPG(mongoDoc);
    const found = await getNoteByMongoId(mongoDoc._id);

    expect(found).toBeDefined();
    expect(found._id).toBe(String(mongoDoc._id));
    expect(found.type).toBe('shopping');
  });

  test('Test 5: deleteNoteInPG() removes record', async () => {
    const mongoDoc = createMockMongoNote();
    await upsertNoteInPG(mongoDoc);

    await deleteNoteInPG(mongoDoc._id);
    const after = await prisma.note.findUnique({ where: { legacyId: String(mongoDoc._id) } });
    expect(after).toBeNull();
  });
});
