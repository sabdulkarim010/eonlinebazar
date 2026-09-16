/********************************************************************
 * Stage 4 Step 5 — Marketing/Support read parity (mocked Postgres)
 ********************************************************************/

jest.mock('../../backend/src/repositories/newsletterRepository', () => ({
  findPaginated: jest.fn(),
  count: jest.fn(),
  countByIsActive: jest.fn()
}));

jest.mock('../../backend/src/repositories/emailCampaignRepository', () => ({
  findAll: jest.fn()
}));

jest.mock('../../backend/src/repositories/contactMessageRepository', () => ({
  findAll: jest.fn(),
  countUnreadInbox: jest.fn(),
  aggregateTicketStats: jest.fn()
}));

jest.mock('../../backend/src/repositories/reviewRepository', () => ({
  findAll: jest.fn(),
  findPaginated: jest.fn(),
  count: jest.fn()
}));

jest.mock('../../backend/src/config/prismaClient', () => ({
  user: { findMany: jest.fn().mockResolvedValue([]) },
  admin: { findMany: jest.fn().mockResolvedValue([]) }
}));

const newsletterRepo = require('../../backend/src/repositories/newsletterRepository');
const emailCampaignRepo = require('../../backend/src/repositories/emailCampaignRepository');
const contactMessageRepo = require('../../backend/src/repositories/contactMessageRepository');
const reviewRepo = require('../../backend/src/repositories/reviewRepository');
const prisma = require('../../backend/src/config/prismaClient');
const {
  newsletterToMongoShape,
  emailCampaignToMongoShape,
  contactMessageToAdminShape,
  reviewToMongoShape
} = require('../../backend/src/services/readShapeHelpers');
const {
  fetchNewsletterSubscribersPage,
  fetchEmailCampaignsList,
  fetchReviewsByProduct
} = require('../../backend/src/services/marketingSupportReadService');

const LEGACY = '507f1f77bcf86cd799439011';
const USER_LEGACY = '507f1f77bcf86cd799439012';

describe('read cutover group 5 — Marketing/Support shape parity (mocked)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  test('newsletterToMongoShape lowercases source enum', () => {
    const shape = newsletterToMongoShape({
      id: 'pg-1',
      legacyId: LEGACY,
      email: 'a@example.com',
      name: 'Ali',
      isActive: true,
      source: 'CHECKOUT',
      subscribedAt: new Date('2024-01-01'),
      unsubscribedAt: null,
      unsubscribeToken: null,
      tags: ['vip'],
      emailsSent: 2,
      lastEmailAt: null
    });
    expect(shape._id).toBe(LEGACY);
    expect(shape.source).toBe('checkout');
    expect(shape.tags).toEqual(['vip']);
  });

  test('emailCampaignToMongoShape nests stats and populates createdBy legacy id', () => {
    const shape = emailCampaignToMongoShape({
      id: 'pg-c',
      legacyId: LEGACY,
      title: 'Sale',
      subject: 'Hi',
      htmlContent: '<p>Hi</p>',
      status: 'SENT',
      targetTags: [],
      targetSegment: 'ALL',
      channel: 'EMAIL',
      whatsappTemplate: '',
      scheduledAt: null,
      sentAt: new Date('2024-02-01'),
      statsTotalRecipients: 10,
      statsSent: 9,
      statsFailed: 1,
      createdAt: new Date('2024-01-01'),
      createdBy: {
        legacyId: USER_LEGACY,
        username: 'admin',
        displayName: 'Admin'
      }
    });
    expect(shape.stats).toEqual({ totalRecipients: 10, sent: 9, failed: 1 });
    expect(shape.status).toBe('sent');
    expect(shape.createdBy._id).toBe(USER_LEGACY);
  });

  test('contactMessageToAdminShape uses id field like toAdminObject()', () => {
    const shape = contactMessageToAdminShape({
      id: 'pg-t',
      legacyId: LEGACY,
      ticketNumber: 'TKT-2026-ABCD',
      name: 'Karim',
      email: 'k@example.com',
      phone: '',
      subject: 'Help',
      message: 'Need support',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      assignedTo: 'admin',
      firstResponseAt: null,
      resolvedAt: null,
      replyMessage: '',
      repliedAt: null,
      isRead: false,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02')
    });
    expect(shape.id).toBe(LEGACY);
    expect(shape.status).toBe('in_progress');
    expect(shape.priority).toBe('high');
  });

  test('reviewToMongoShape populates userId with legacy id and name', () => {
    const shape = reviewToMongoShape(
      {
        id: 'pg-r',
        legacyId: LEGACY,
        legacyProductId: 'PROD-1',
        legacyOrderId: 'ORD-1',
        rating: 5,
        comment: 'Great',
        photo: '',
        isSandbox: false,
        isHidden: false,
        adminNote: '',
        moderatedAt: null,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02')
      },
      {
        populateUser: {
          legacyId: USER_LEGACY,
          firstName: 'Karim',
          lastName: '',
          email: 'k@example.com'
        },
        includeUserEmail: true
      }
    );
    expect(shape.productId).toBe('PROD-1');
    expect(shape.userId._id).toBe(USER_LEGACY);
    expect(shape.userId.name).toBe('Karim');
    expect(shape.userId.email).toBe('k@example.com');
    expect(shape.__v).toBe(0);
  });

  test('reviewToMongoShape null userId FK → populated userId null', () => {
    const shape = reviewToMongoShape(
      {
        id: 'pg-r2',
        legacyId: '507f1f77bcf86cd799439099',
        legacyProductId: 'PROD-2',
        legacyOrderId: 'ORD-2',
        rating: 4,
        comment: 'OK',
        photo: '',
        isSandbox: false,
        isHidden: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      { populateUser: null }
    );
    expect(shape.userId).toBeNull();
  });

  test('fetchNewsletterSubscribersPage uses Postgres path when READ_PG_NEWSLETTER=true', async () => {
    process.env.READ_PG_NEWSLETTER = 'true';
    newsletterRepo.findPaginated.mockResolvedValue([{
      id: 'pg-1',
      legacyId: LEGACY,
      email: 'a@example.com',
      isActive: true,
      source: 'FOOTER_FORM',
      subscribedAt: new Date(),
      tags: []
    }]);
    newsletterRepo.count.mockResolvedValue(1);
    newsletterRepo.countByIsActive.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    const result = await fetchNewsletterSubscribersPage({ page: 1, limit: 20 });
    expect(newsletterRepo.findPaginated).toHaveBeenCalled();
    expect(result.data[0]._id).toBe(LEGACY);
    expect(result.stats.totalActive).toBe(1);
  });

  test('fetchEmailCampaignsList uses Postgres path when READ_PG_EMAILCAMPAIGN=true', async () => {
    process.env.READ_PG_EMAILCAMPAIGN = 'true';
    emailCampaignRepo.findAll.mockResolvedValue([{
      id: 'pg-c',
      legacyId: LEGACY,
      title: 'T',
      subject: 'S',
      htmlContent: '<p>x</p>',
      status: 'DRAFT',
      targetTags: [],
      targetSegment: 'ALL',
      channel: 'EMAIL',
      whatsappTemplate: '',
      statsTotalRecipients: 0,
      statsSent: 0,
      statsFailed: 0,
      createdAt: new Date(),
      createdBy: { legacyId: USER_LEGACY, username: 'admin', displayName: 'Admin' }
    }]);

    const rows = await fetchEmailCampaignsList();
    expect(emailCampaignRepo.findAll).toHaveBeenCalled();
    expect(rows[0].stats.totalRecipients).toBe(0);
  });

  test('fetchReviewsByProduct resolves user populate from Postgres user map', async () => {
    process.env.READ_PG_REVIEW = 'true';
    reviewRepo.findAll.mockResolvedValue([{
      id: 'pg-r',
      legacyId: LEGACY,
      userId: 'pg-user',
      legacyProductId: 'PROD-1',
      legacyOrderId: 'ORD-1',
      rating: 5,
      comment: 'Nice',
      photo: '',
      isSandbox: false,
      isHidden: false,
      createdAt: new Date(),
      updatedAt: new Date()
    }]);
    prisma.user.findMany.mockResolvedValue([{
      id: 'pg-user',
      legacyId: USER_LEGACY,
      firstName: 'Karim',
      lastName: ''
    }]);

    const reviews = await fetchReviewsByProduct('PROD-1');
    expect(reviewRepo.findAll).toHaveBeenCalled();
    expect(reviews[0].userId.name).toBe('Karim');
    expect(reviews[0].userId._id).toBe(USER_LEGACY);
  });
});
