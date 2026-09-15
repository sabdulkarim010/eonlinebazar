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
  matchCategoryBySlugParam,
  bannerToMongoShape,
  settingsToMongoShape,
  footerSettingsToAdminShape
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
    expect(mapped[1]).not.toHaveProperty('customCashback');
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

  test('bannerToMongoShape converts Decimal overlayOpacity to number', () => {
    const shape = bannerToMongoShape({
      id: 'pg-uuid',
      legacyId: LEGACY,
      title: 'Hero',
      overlayOpacity: 0.3,
      isActive: true,
      createdAt: new Date()
    });
    expect(shape.overlayOpacity).toBe(0.3);
    expect(typeof shape.overlayOpacity).toBe('number');
  });

  test('settingsToMongoShape builds nested paymentGateways from child rows', () => {
    const shape = settingsToMongoShape({
      key: 'global',
      shopHomeCity: 'Dhaka',
      deliveryInsideCity: 60,
      deliveryOutsideCity: 120,
      freeShippingMinAmount: 1000,
      activeGatewayBKash: true,
      activeGatewayNagad: true,
      activeGatewayVisa: true,
      activeGatewayMasterCard: true,
      activeGatewayCod: true,
      paymentGateways: [{ gatewayKey: 'COD', enabled: true, name: 'Cash on Delivery', logoUrl: '' }]
    });
    expect(shape.paymentGateways.COD.name).toBe('Cash on Delivery');
    expect(shape.activePaymentGateways.COD).toBe(true);
  });

  test('footerSettingsToAdminShape uses legacyId for nested link ids', () => {
    const admin = footerSettingsToAdminShape({
      copyrightText: '© Test',
      paymentBadgesEnabled: true,
      columns: [{
        legacyId: PARENT_LEGACY,
        columnTitle: 'Links',
        isActive: true,
        sortOrder: 0,
        links: [{ legacyId: LEGACY, label: 'Home', url: '/', isExternal: false, isActive: true }]
      }],
      socialLinks: [],
      paymentGateways: [],
      paymentBadges: []
    });
    expect(admin.columns[0].id).toBe(PARENT_LEGACY);
    expect(admin.columns[0].links[0].id).toBe(LEGACY);
  });
});
