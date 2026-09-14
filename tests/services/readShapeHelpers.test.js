/********************************************************************
 * readShapeHelpers — Unit Tests (Jest)
 * Stage 4 Step 1 — Postgres row → Mongo .lean() shape parity
 ********************************************************************/

const {
  categoryToMongoShape,
  mapCategoriesToMongo,
  brandToMongoShape,
  supplierToMongoShape,
  warehouseToMongoShape,
  designationToMongoShape,
  matchCategoryBySlugParam
} = require('../../backend/src/services/readShapeHelpers');

const LEGACY = '507f1f77bcf86cd799439011';
const PARENT_LEGACY = '507f1f77bcf86cd799439012';

describe('readShapeHelpers — group 1 models', () => {
  test('categoryToMongoShape uses legacyId as _id and resolves parentCategory', () => {
    const rows = [
      {
        id: 'pg-parent',
        legacyId: PARENT_LEGACY,
        name: 'Parent',
        slug: 'parent',
        parentCategoryId: null,
        isActive: true,
        position: 0,
        customCashback: '5.50',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02')
      },
      {
        id: 'pg-child',
        legacyId: LEGACY,
        name: 'Child',
        slug: 'child',
        parentCategoryId: 'pg-parent',
        isActive: true,
        position: 1,
        customCashback: null,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02')
      }
    ];

    const mapped = mapCategoriesToMongo(rows);
    expect(mapped[1]._id).toBe(LEGACY);
    expect(mapped[1].parentCategory).toBe(PARENT_LEGACY);
    expect(mapped[1].customCashback).toBe(null);
    expect(mapped[0].customCashback).toBe(5.5);
    expect(mapped[1]).not.toHaveProperty('id');
    expect(mapped[1]).not.toHaveProperty('legacyId');
    expect(mapped[1]).not.toHaveProperty('parentCategoryId');
  });

  test('category populated parent shape matches Mongoose populate', () => {
    const rows = [
      { id: 'pg-p', legacyId: PARENT_LEGACY, name: 'Parent Cat', slug: 'parent-cat', parentCategoryId: null },
      { id: 'pg-c', legacyId: LEGACY, name: 'Child Cat', slug: 'child-cat', parentCategoryId: 'pg-p' }
    ];
    const populated = mapCategoriesToMongo(rows, { populateParent: true });
    expect(populated[1].parentCategory).toEqual({ _id: PARENT_LEGACY, name: 'Parent Cat' });
  });

  test('matchCategoryBySlugParam resolves ObjectId and slugified name', () => {
    const cats = [
      { _id: LEGACY, name: 'Electronics & Gadgets', slug: 'electronics-gadgets', isActive: true },
      { _id: PARENT_LEGACY, name: 'Fashion', slug: '', isActive: true }
    ];
    expect(matchCategoryBySlugParam(cats, LEGACY)?._id).toBe(LEGACY);
    expect(matchCategoryBySlugParam(cats, 'fashion')?._id).toBe(PARENT_LEGACY);
  });

  test('brandToMongoShape normalises status and _id', () => {
    const shape = brandToMongoShape({
      id: 'pg-uuid',
      legacyId: LEGACY,
      name: 'Samsung',
      slug: 'samsung',
      description: 'Phones',
      status: 'INACTIVE',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    expect(shape._id).toBe(LEGACY);
    expect(shape.status).toBe('inactive');
  });

  test('supplierToMongoShape preserves roster fields', () => {
    const shape = supplierToMongoShape({
      id: 'pg-uuid',
      legacyId: LEGACY,
      name: 'Acme',
      contactPerson: 'Rahim',
      phone: '017',
      email: 'a@test.com',
      address: 'Dhaka',
      notes: '',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    expect(shape._id).toBe(LEGACY);
    expect(shape.status).toBe('active');
    expect(shape.suppliedProducts).toEqual([]);
  });

  test('warehouseToMongoShape maps isDefault and status', () => {
    const shape = warehouseToMongoShape({
      id: 'pg-uuid',
      legacyId: LEGACY,
      name: 'Main WH',
      location: 'Dhaka',
      isDefault: true,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    expect(shape._id).toBe(LEGACY);
    expect(shape.isDefault).toBe(true);
    expect(shape.status).toBe('active');
  });

  test('designationToMongoShape includes employeeCount when present', () => {
    const shape = designationToMongoShape({
      id: 'pg-uuid',
      legacyId: LEGACY,
      name: 'Delivery Man',
      department: 'Operations',
      description: '',
      isActive: true,
      createdBy: 'admin',
      employeeCount: 3,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    expect(shape._id).toBe(LEGACY);
    expect(shape.employeeCount).toBe(3);
  });
});
