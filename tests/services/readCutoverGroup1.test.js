/********************************************************************
 * Stage 4 Step 1 — Flag-ON read parity (mocked Postgres repositories)
 ********************************************************************/

jest.mock('../../backend/src/repositories/categoryRepository', () => ({
  findAll: jest.fn(),
  findByLegacyId: jest.fn(),
  slugifyCategory: (name) => String(name || '').toLowerCase().replace(/\s+/g, '-')
}));

jest.mock('../../backend/src/repositories/brandRepository', () => ({
  findAll: jest.fn()
}));

const categoryRepo = require('../../backend/src/repositories/categoryRepository');
const brandRepo = require('../../backend/src/repositories/brandRepository');
const { routedRead } = require('../../backend/src/services/readRouter');
const { mapCategoriesToMongo, mapBrandsToMongo } = require('../../backend/src/services/readShapeHelpers');

describe('read cutover group 1 — Postgres path shape parity (mocked)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  test('category Postgres read returns same _id and parentCategory as Mongo lean doc', async () => {
    process.env.READ_PG_CATEGORY = 'true';

    const mongoParent = {
      _id: '507f1f77bcf86cd799439012',
      name: 'Parent',
      slug: 'parent',
      parentCategory: null,
      isActive: true,
      position: 0,
      customCashback: null,
      productCount: 0
    };
    const mongoChild = {
      ...mongoParent,
      _id: '507f1f77bcf86cd799439011',
      name: 'Child',
      slug: 'child',
      parentCategory: mongoParent._id,
      position: 1
    };

    categoryRepo.findAll.mockResolvedValue([
      {
        id: 'pg-p',
        legacyId: mongoParent._id,
        name: mongoParent.name,
        slug: mongoParent.slug,
        parentCategoryId: null,
        isActive: true,
        position: 0,
        customCashback: null,
        productCount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'pg-c',
        legacyId: mongoChild._id,
        name: mongoChild.name,
        slug: mongoChild.slug,
        parentCategoryId: 'pg-p',
        isActive: true,
        position: 1,
        customCashback: null,
        productCount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);

    const mongoFn = jest.fn().mockResolvedValue([mongoParent, mongoChild]);
    const pgFn = async () => mapCategoriesToMongo(await categoryRepo.findAll({ isActive: true }));

    delete process.env.READ_PG_CATEGORY;
    const mongoResult = await routedRead('category', mongoFn, pgFn);

    process.env.READ_PG_CATEGORY = 'true';
    const pgResult = await routedRead('category', mongoFn, pgFn);

    expect(pgResult[1]._id).toBe(mongoResult[1]._id);
    expect(pgResult[1].parentCategory).toBe(mongoResult[1].parentCategory);
    expect(pgResult[1].name).toBe(mongoResult[1].name);
    expect(pgResult[1].slug).toBe(mongoResult[1].slug);
  });

  test('brand Postgres read matches Mongo field set', async () => {
    process.env.READ_PG_BRAND = 'true';

    const mongoBrand = {
      _id: '507f1f77bcf86cd799439011',
      name: 'Samsung',
      slug: 'samsung',
      description: 'Electronics',
      status: 'active',
      createdAt: new Date('2024-06-01'),
      updatedAt: new Date('2024-06-02'),
      __v: 0
    };

    brandRepo.findAll.mockResolvedValue([{
      id: 'pg-1',
      legacyId: mongoBrand._id,
      name: mongoBrand.name,
      slug: mongoBrand.slug,
      description: mongoBrand.description,
      status: 'ACTIVE',
      createdAt: mongoBrand.createdAt,
      updatedAt: mongoBrand.updatedAt
    }]);

    const mongoFn = jest.fn().mockResolvedValue([mongoBrand]);
    const pgFn = async () => mapBrandsToMongo(await brandRepo.findAll());

    const pgResult = await routedRead('brand', mongoFn, pgFn);

    expect(Object.keys(pgResult[0]).sort()).toEqual(Object.keys(mongoBrand).sort());
    expect(pgResult[0]._id).toBe(mongoBrand._id);
    expect(pgResult[0].status).toBe('active');
  });
});
