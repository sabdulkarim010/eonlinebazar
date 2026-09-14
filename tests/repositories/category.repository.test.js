/********************************************************************
 * Category Repository — Isolated Integration Tests
 * Connects to the REAL Neon PostgreSQL test database.
 * Creates and cleans up its own data — does NOT touch MongoDB.
 *
 * Run: npm run test:repositories
 * (Uses Node's built-in test runner — not Jest — because the Prisma .mts
 *  client requires Node 22.18+ native type-stripping.)
 *
 * Stage 2 Step 2, Part 1 — 2026-09-13
 ********************************************************************/

const { describe, test, expect, afterAll } = require('./jestCompat');

// Load .env so DATABASE_URL_POOLED is available before prismaClient is required.
require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const {
  slugifyCategory,
  findAll,
  findById,
  findBySlug,
  create,
  update,
  remove
} = require('../../backend/src/repositories/categoryRepository');

// ── Unique test prefix to avoid collision with other runs ────────────────────
const PREFIX = `__test_cat_${Date.now()}_`;
const createdIds = [];

async function cleanup() {
  if (createdIds.length) {
    await prisma.category.deleteMany({ where: { id: { in: [...createdIds] } } });
    createdIds.length = 0;
  }
}

afterAll(async () => {
  await cleanup();
});

// ── 1. Slug generation ───────────────────────────────────────────────────────
describe('slugifyCategory', () => {
  test('Latin alphabet name → lowercase hyphenated slug', () => {
    expect(slugifyCategory('Electronics & Gadgets')).toBe('electronics-gadgets');
    // '&' is stripped, spaces become hyphens, consecutive hyphens collapse to one
    expect(slugifyCategory('Mobile Phones')).toBe('mobile-phones');
    expect(slugifyCategory('Men\'s Fashion')).toBe('mens-fashion');
  });

  test('Bengali-script name → preserves Unicode range U+0980–U+09FF', () => {
    // Bengali characters must be retained in the slug (not stripped)
    const banglaName = 'ইলেকট্রনিক্স';
    const slug = slugifyCategory(banglaName);
    // All characters are in the Bengali range — none should be stripped
    expect(slug).toBe(banglaName.toLowerCase());
    expect(slug.length).toBeGreaterThan(0);
  });

  test('Mixed Latin + Bengali name → both parts preserved', () => {
    const mixed = 'Mobile মোবাইল';
    const slug = slugifyCategory(mixed);
    expect(slug).toContain('mobile');
    expect(slug).toContain('মোবাইল');
  });

  test('Special characters outside allowed set are stripped', () => {
    const slug = slugifyCategory('Test@Category!');
    expect(slug).not.toContain('@');
    expect(slug).not.toContain('!');
    expect(slug).toContain('test');
    expect(slug).toContain('category');
  });

  test('Consecutive spaces collapse to a single hyphen', () => {
    expect(slugifyCategory('a   b')).toBe('a-b');
  });
});

// ── 2. CRUD against Neon ─────────────────────────────────────────────────────
describe('Category repository — real Neon DB', () => {
  test('create() inserts a record and generates the correct slug', async () => {
    const name = `${PREFIX}Electronics`;
    const record = await create({ name });
    createdIds.push(record.id);

    expect(record).toBeDefined();
    expect(record.id).toBeTruthy();
    expect(record._id).toBe(record.id);          // _id alias present
    expect(record.name).toBe(name);
    expect(record.slug).toBe(slugifyCategory(name));
    expect(record.isActive).toBe(false);
    expect(record.showInNavbar).toBe(true);
    expect(record.position).toBe(0);
  });

  test('create() with Bengali name stores and retrieves correctly', async () => {
    const name = `${PREFIX}ইলেকট্রনিক্স`;
    const record = await create({ name });
    createdIds.push(record.id);

    expect(record.name).toBe(name);
    expect(record.slug).toBe(slugifyCategory(name));
    expect(record.slug.length).toBeGreaterThan(0);
  });

  test('findAll() returns created records', async () => {
    const name = `${PREFIX}Clothing`;
    const created = await create({ name, isActive: true });
    createdIds.push(created.id);

    const all = await findAll({ isActive: true });
    const found = all.find((c) => c.id === created.id);
    expect(found).toBeDefined();
    expect(found.name).toBe(name);
  });

  test('findById() returns the correct record', async () => {
    const name = `${PREFIX}Sports`;
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

  test('findBySlug() returns the correct record', async () => {
    const name = `${PREFIX}Home Decor`;
    const created = await create({ name });
    createdIds.push(created.id);

    const record = await findBySlug(created.slug);
    expect(record).toBeDefined();
    expect(record.id).toBe(created.id);
    expect(record.slug).toBe(created.slug);
  });

  test('update() changes name and regenerates slug', async () => {
    const created = await create({ name: `${PREFIX}OldName` });
    createdIds.push(created.id);

    const newName = `${PREFIX}New Name`;
    const updated = await update(created.id, { name: newName });

    expect(updated.name).toBe(newName);
    expect(updated.slug).toBe(slugifyCategory(newName));
    // Slug must differ from the original
    expect(updated.slug).not.toBe(created.slug);
  });

  test('update() with no name change keeps existing slug', async () => {
    const name = `${PREFIX}KeepSlug`;
    const created = await create({ name });
    createdIds.push(created.id);

    const updated = await update(created.id, { isActive: false, position: 5 });

    expect(updated.slug).toBe(created.slug);  // slug unchanged
    expect(updated.isActive).toBe(false);
    expect(updated.position).toBe(5);
  });

  test('update() throws NOT_FOUND for unknown id', async () => {
    await expect(
      update('00000000-0000-0000-0000-000000000000', { isActive: false })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  test('remove() deletes an existing record', async () => {
    const created = await create({ name: `${PREFIX}ToDelete` });
    // Do NOT push to createdIds — we are deleting it manually here
    const result = await remove(created.id);

    expect(result.deletedCount).toBe(1);
    const check = await findById(created.id);
    expect(check).toBeNull();
  });

  test('remove() throws NOT_FOUND for unknown id', async () => {
    await expect(
      remove('00000000-0000-0000-0000-000000000000')
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  test('create() with parentCategoryId links parent', async () => {
    const parent = await create({ name: `${PREFIX}Parent` });
    createdIds.push(parent.id);

    const child = await create({
      name: `${PREFIX}Child`,
      parentCategoryId: parent.id
    });
    createdIds.push(child.id);

    expect(child.parentCategory).toBe(parent.id);
    expect(child.parentCategoryId).toBe(parent.id);
  });
});
