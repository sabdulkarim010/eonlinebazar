/********************************************************************
 * Stage 4 Step 2 — CMS/Settings read parity (mocked Postgres repositories)
 ********************************************************************/

jest.mock('../../backend/src/repositories/pageContentRepository', () => ({
  findAll: jest.fn(),
  findBySlug: jest.fn()
}));

jest.mock('../../backend/src/repositories/navbarLinkRepository', () => ({
  findAll: jest.fn()
}));

jest.mock('../../backend/src/repositories/footerSettingsRepository', () => ({
  findByKey: jest.fn()
}));

jest.mock('../../backend/src/repositories/bannerRepository', () => ({
  findAllBanners: jest.fn(),
  findBannerSettings: jest.fn()
}));

jest.mock('../../backend/src/repositories/settingsRepository', () => ({
  findByKey: jest.fn()
}));

const pageContentRepo = require('../../backend/src/repositories/pageContentRepository');
const navbarLinkRepo = require('../../backend/src/repositories/navbarLinkRepository');
const footerRepo = require('../../backend/src/repositories/footerSettingsRepository');
const bannerRepo = require('../../backend/src/repositories/bannerRepository');
const settingsRepo = require('../../backend/src/repositories/settingsRepository');
const { routedRead } = require('../../backend/src/services/readRouter');
const {
  pageContentToAdminShape,
  pageContentToPublicShape,
  mapNavbarLinksToPublicShape,
  footerSettingsToAdminShape,
  getPaymentBadgesFromPg,
  bannerToMongoShape,
  settingsToMongoShape
} = require('../../backend/src/services/readShapeHelpers');

const LEGACY = '507f1f77bcf86cd799439011';

describe('read cutover group 2 — CMS/Settings shape parity (mocked)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  test('pageContent Postgres admin shape matches Mongo toAdminObject field set', async () => {
    process.env.READ_PG_PAGECONTENT = 'true';

    const mongoShape = {
      id: LEGACY,
      slug: 'about',
      title: 'About Us',
      subtitle: '',
      bodyMarkdown: '# About',
      bodyHtml: '<h1>About</h1>',
      contentFormat: 'markdown',
      isPublished: true,
      isActive: true,
      sortOrder: 1,
      updatedAt: new Date('2024-06-01')
    };

    pageContentRepo.findAll.mockResolvedValue([{
      id: 'pg-1',
      legacyId: LEGACY,
      slug: 'about',
      title: 'About Us',
      subtitle: '',
      bodyMarkdown: '# About',
      bodyHtml: '<h1>About</h1>',
      contentFormat: 'MARKDOWN',
      isPublished: true,
      sortOrder: 1,
      updatedAt: mongoShape.updatedAt
    }]);

    const mongoFn = jest.fn().mockResolvedValue([mongoShape]);
    const pgFn = async () => pageContentRepo.findAll().then((rows) => rows.map(pageContentToAdminShape));

    delete process.env.READ_PG_PAGECONTENT;
    const mongoResult = await routedRead('pagecontent', mongoFn, pgFn);

    process.env.READ_PG_PAGECONTENT = 'true';
    const pgResult = await routedRead('pagecontent', mongoFn, pgFn);

    expect(pgResult[0].id).toBe(mongoResult[0].id);
    expect(pgResult[0].bodyHtml).toBe(mongoResult[0].bodyHtml);
    expect(pgResult[0]).not.toHaveProperty('contactMeta');
  });

  test('pageContent public read uses stored bodyHtml without re-render', () => {
    const shape = pageContentToPublicShape({
      slug: 'terms',
      title: 'Terms',
      bodyMarkdown: '# Should not render',
      bodyHtml: '<p>Stored HTML</p>',
      contentFormat: 'MARKDOWN',
      isPublished: true,
      updatedAt: new Date()
    });
    expect(shape.bodyHtml).toBe('<p>Stored HTML</p>');
    expect(shape.content).toBe('<p>Stored HTML</p>');
  });

  test('navbarLink public shape preserves _id from legacyId', async () => {
    process.env.READ_PG_NAVBARLINK = 'true';

    navbarLinkRepo.findAll.mockResolvedValue([{
      id: 'pg-n',
      legacyId: LEGACY,
      title: 'Deals',
      url: '/deals',
      slug: 'deals',
      target: 'SELF',
      isPublished: true,
      hasCustomPage: false,
      sortOrder: 1
    }]);

    const mongoFn = jest.fn().mockResolvedValue([{
      id: LEGACY,
      _id: LEGACY,
      title: 'Deals',
      url: '/deals',
      slug: 'deals',
      target: '_self',
      hasCustomPage: false,
      sortOrder: 1
    }]);

    const pgFn = async () => mapNavbarLinksToPublicShape(await navbarLinkRepo.findAll({ isPublished: true }));

    process.env.READ_PG_NAVBARLINK = 'true';
    const pgResult = await routedRead('navbarlink', mongoFn, pgFn);
    expect(pgResult[0]._id).toBe(LEGACY);
    expect(pgResult[0].id).toBe(LEGACY);
  });

  test('footerSettings zero paymentBadges child rows render as [] on read', () => {
    const badges = getPaymentBadgesFromPg({
      paymentBadgesEnabled: true,
      paymentGateways: [],
      paymentBadges: []
    });
    expect(badges).toEqual([]);
  });

  test('footerSettings admin shape nests column link ids from legacyId', () => {
    const admin = footerSettingsToAdminShape({
      copyrightText: '© Test',
      paymentBadgesEnabled: true,
      columns: [{
        id: 'col-pg',
        legacyId: '507f1f77bcf86cd799439099',
        columnTitle: 'Company',
        isActive: true,
        sortOrder: 0,
        links: [{
          id: 'link-pg',
          legacyId: LEGACY,
          label: 'About',
          url: '/about',
          isExternal: false,
          isActive: true
        }]
      }],
      socialLinks: [],
      paymentGateways: [{ id: 'gw-pg', legacyId: '507f1f77bcf86cd799439088', name: 'bKash', iconUrl: '', iconName: 'bkash', isActive: true, sortOrder: 0 }],
      paymentBadges: []
    });
    expect(admin.columns[0].id).toBe('507f1f77bcf86cd799439099');
    expect(admin.columns[0].links[0].id).toBe(LEGACY);
    expect(admin.paymentBadges).toEqual([{ name: 'bKash' }]);
  });

  test('banner overlayOpacity reads back as JavaScript number', () => {
    const shape = bannerToMongoShape({
      id: 'pg-b',
      legacyId: LEGACY,
      title: 'Sale',
      overlayOpacity: '0.45',
      position: 0,
      isActive: true,
      createdAt: new Date()
    });
    expect(typeof shape.overlayOpacity).toBe('number');
    expect(shape.overlayOpacity).toBe(0.45);
  });

  test('settings Postgres shape reassembles activePaymentGateways + paymentGateways map', () => {
    const shape = settingsToMongoShape({
      key: 'global',
      shopHomeCity: 'Dhaka',
      deliveryInsideCity: 60,
      deliveryOutsideCity: 120,
      freeShippingMinAmount: 1000,
      activeGatewayBKash: true,
      activeGatewayNagad: false,
      activeGatewayVisa: true,
      activeGatewayMasterCard: true,
      activeGatewayCod: true,
      paymentGateways: [
        { gatewayKey: 'bKash', enabled: true, name: 'bKash', logoUrl: '/bkash.png' },
        { gatewayKey: 'Nagad', enabled: false, name: 'Nagad', logoUrl: '' }
      ],
      rateLimitEnabled: true,
      serviceWorkerEnabled: true
    });

    expect(shape.activePaymentGateways.Nagad).toBe(false);
    expect(shape.paymentGateways.bKash).toEqual({
      enabled: true,
      name: 'bKash',
      logoUrl: '/bkash.png'
    });
    expect(shape.paymentGateways.Visa.enabled).toBe(true);
  });

  test('null-vs-absent: pageContent contactMeta omitted when slug is not contact', () => {
    const admin = pageContentToAdminShape({
      id: 'pg-1',
      legacyId: LEGACY,
      slug: 'privacy',
      title: 'Privacy',
      isPublished: true,
      contentFormat: 'MARKDOWN'
    });
    expect(admin).not.toHaveProperty('contactMeta');
  });
});
