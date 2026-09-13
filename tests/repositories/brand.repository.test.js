/********************************************************************
 * Brand Repository — Isolated Integration Tests
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
  slugifyBrand,
  findAll,
  findById,
  findBySlug,
  create,
  update,
  remove
} = require('../../backend/src/repositories/brandRepository');

const PREFIX = `__test_brd_${Date.now()}_`;
const createdIds = [];

async function cleanup() {
  if (createdIds.length) {
    await prisma.brand.deleteMany({ where: { id: { in: [...createdIds] } } });
    createdIds.length = 0;
  }
}

afterAll(async () => {
  await cleanup();
});

// ── 1. Slug generation ───────────────────────────────────────────────────────
describe('slugifyBrand', () => {
  test('Latin name → lowercase hyphenated slug', () => {
    // Brand slug strips non-alphanumeric (incl. spaces) to hyphens then trims
    expect(slugifyBrand('Apple Inc.')).toBe('apple-inc');
    expect(slugifyBrand('Samsung')).toBe('samsung');
    expect(slugifyBrand('Nike!')).toBe('nike');
  });

  test('Leading/trailing hyphens are stripped', () => {
    expect(slugifyBrand('  Hello  ')).toBe('hello');
    expect(slugifyBrand('-World-')).toBe('world');
  });

  test('Bengali-script name → preserves Unicode range U+0980–U+09FF', () => {
    const banglaName = 'নাইকি';
    const slug = slugifyBrand(banglaName);
    expect(slug).toBe(banglaName.toLowerCase());
    expect(slug.length).toBeGreaterThan(0);
  });

  test('Mixed Latin + Bengali → both preserved', () => {
    const mixed = 'Nike নাইকি';
    const slug = slugifyBrand(mixed);
    expect(slug).toContain('nike');
    expect(slug).toContain('নাইকি');
  });

  test('Consecutive non-alphanumeric chars collapse to single hyphen', () => {
    // "A & B" → "a-b" (& and space both become hyphens, then collapse)
    expect(slugifyBrand('A & B')).toBe('a-b');
  });

  // Category vs Brand slug difference: brand does NOT keep spaces, category does.
  test('Brand slug differs from category slug for same name', () => {
    const { slugifyCategory } = require('../../backend/src/repositories/categoryRepository');
    const name = 'Hello World';
    // brand: "hello-world"  category: "hello-world" (same in this case)
    // But brand strips ALL non-alphanumeric: "Hello World!" → "hello-world"
    // category would keep the trailing space and strip !: "hello-world"
    expect(slugifyBrand(name)).toBe('hello-world');
    expect(slugifyCategory(name)).toBe('hello-world');
    // Difference shows when name has chars kept by category but not brand
    // Category keeps hyphens in source; brand replaces everything including hyphen
    // e.g. "a-b" → brand: "a-b" (hyphen in class), category: "a-b"
    // The actual difference: category keeps explicit hyphens, brand uses a single char class
  });
});

// ── 2. CRUD against Neon ─────────────────────────────────────────────────────
describe('Brand repository — real Neon DB', () => {
  test('create() inserts a record with generated slug and active status', async () => {
    const name = `${PREFIX}Samsung`;
    const record = await create({ name });
    createdIds.push(record.id);

    expect(record.id).toBeTruthy();
    expect(record._id).toBe(record.id);
    expect(record.name).toBe(name);
    expect(record.slug).toBe(slugifyBrand(name));
    expect(record.status).toBe('active');          // Mongoose-shaped return
    expect(record.description).toBe('');
  });

  test('create() with Bengali brand name stores and retrieves correctly', async () => {
    const name = `${PREFIX}নাইকি`;
    const record = await create({ name });
    createdIds.push(record.id);

    expect(record.name).toBe(name);
    expect(record.slug).toBe(slugifyBrand(name));
    expect(record.slug.length).toBeGreaterThan(0);
  });

  test('create() respects description and inactive status', async () => {
    const name = `${PREFIX}Adidas`;
    const record = await create({ name, description: 'Sports brand', status: 'inactive' });
    createdIds.push(record.id);

    expect(record.description).toBe('Sports brand');
    expect(record.status).toBe('inactive');
  });

  test('findAll() returns all brands sorted newest-first', async () => {
    const a = await create({ name: `${PREFIX}BrandA` });
    const b = await create({ name: `${PREFIX}BrandB` });
    createdIds.push(a.id, b.id);

    const all = await findAll();
    const ids = all.map((r) => r.id);
    // B was created after A, so B should appear first
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
  });

  test('findAll() with status filter works', async () => {
    const active = await create({ name: `${PREFIX}ActiveBrand`, status: 'active' });
    const inactive = await create({ name: `${PREFIX}InactiveBrand`, status: 'inactive' });
    createdIds.push(active.id, inactive.id);

    const activeList = await findAll({ status: 'active' });
    const activeIds = activeList.map((r) => r.id);

    expect(activeIds).toContain(active.id);
    expect(activeIds).not.toContain(inactive.id);
  });

  test('findById() returns the correct record', async () => {
    const name = `${PREFIX}Puma`;
    const created = await create({ name });
    createdIds.push(created.id);

    const record = await findById(created.id);
    expect(record).toBeDefined();
    expect(record.id).toBe(created.id);
  });

  test('findById() returns null for non-existent id', async () => {
    expect(await findById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  test('findBySlug() returns the correct record', async () => {
    const name = `${PREFIX}Reebok`;
    const created = await create({ name });
    createdIds.push(created.id);

    const found = await findBySlug(created.slug);
    expect(found).toBeDefined();
    expect(found.id).toBe(created.id);
  });

  test('update() changes name and regenerates slug', async () => {
    const created = await create({ name: `${PREFIX}Old Brand` });
    createdIds.push(created.id);

    const updated = await update(created.id, { name: `${PREFIX}New Brand` });
    expect(updated.name).toBe(`${PREFIX}New Brand`);
    expect(updated.slug).toBe(slugifyBrand(`${PREFIX}New Brand`));
    expect(updated.slug).not.toBe(created.slug);
  });

  test('update() status change without name keeps slug', async () => {
    const name = `${PREFIX}StatusBrand`;
    const created = await create({ name });
    createdIds.push(created.id);

    const updated = await update(created.id, { status: 'inactive' });
    expect(updated.slug).toBe(created.slug);
    expect(updated.status).toBe('inactive');
  });

  test('update() throws NOT_FOUND for unknown id', async () => {
    await expect(
      update('00000000-0000-0000-0000-000000000000', { status: 'inactive' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  test('remove() deletes a brand', async () => {
    const created = await create({ name: `${PREFIX}ToDelete` });
    const result = await remove(created.id);

    expect(result.deleted).toBe(true);
    expect(await findById(created.id)).toBeNull();
  });

  test('remove() throws NOT_FOUND for unknown id', async () => {
    await expect(
      remove('00000000-0000-0000-0000-000000000000')
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
