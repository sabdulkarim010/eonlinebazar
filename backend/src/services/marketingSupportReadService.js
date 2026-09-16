/********************************************************************
 * Project: EonlineBazar — Database Migration Stage 4
 * File: marketingSupportReadService.js
 * Description: Routed reads for Newsletter, EmailCampaign, ContactMessage, Review.
 ********************************************************************/

'use strict';

const Newsletter = require('../models/newsletter');
const EmailCampaign = require('../models/emailCampaign');
const ContactMessage = require('../models/ContactMessage');
const Review = require('../models/review');
const { routedRead } = require('./readRouter');
const {
  mapNewslettersToMongo,
  mapEmailCampaignsToMongo,
  mapContactMessagesToAdminShape,
  fromTicketStatus,
  fromTicketPriority
} = require('./readShapeHelpers');

const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'];

function getNewsletterRepository() {
  return require('../repositories/newsletterRepository');
}

function getEmailCampaignRepository() {
  return require('../repositories/emailCampaignRepository');
}

function getContactMessageRepository() {
  return require('../repositories/contactMessageRepository');
}

function getReviewRepository() {
  return require('../repositories/reviewRepository');
}

function getPrisma() {
  return require('../config/prismaClient');
}

function buildSubscriberFilters({ isActive, tag, search }) {
  const filters = {};
  if (isActive === 'true') filters.isActive = true;
  else if (isActive === 'false') filters.isActive = false;
  if (tag) filters.tag = String(tag).trim().toLowerCase().slice(0, 50);
  if (search) filters.search = String(search).trim().slice(0, 80);
  return filters;
}

function buildMongoSubscriberQuery({ isActive, tag, search }) {
  const query = {};
  if (isActive === 'true') query.isActive = true;
  else if (isActive === 'false') query.isActive = false;
  if (tag) query.tags = String(tag).trim().toLowerCase().slice(0, 50);
  if (search) {
    const term = String(search).trim().slice(0, 80);
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [{ email: regex }, { name: regex }];
  }
  return query;
}

async function loadReviewUserMap(reviewRows, { includeEmail = false } = {}) {
  const userIds = [...new Set((reviewRows || []).map((r) => r.userId).filter(Boolean))];
  if (!userIds.length) return new Map();

  const prisma = getPrisma();
  const select = {
    id: true,
    legacyId: true,
    firstName: true,
    lastName: true
  };
  if (includeEmail) select.email = true;

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select
  });

  return new Map(users.map((u) => [u.id, u]));
}

function authorNameFromUserRef(userRef) {
  if (!userRef || typeof userRef !== 'object') return '';
  const fromParts = [userRef.firstName, userRef.lastName].filter(Boolean).join(' ').trim();
  if (fromParts) return fromParts;
  if (userRef.name) return String(userRef.name);
  return '';
}

/** Canonical public review shape — both Mongo and Postgres paths use this. */
function shapePublicReviewDoc(review, userRef) {
  const _id = review._id != null ? String(review._id) : review.legacyId;
  const legacy = userRef && userRef._id != null
    ? String(userRef._id)
    : (userRef && userRef.legacyId ? String(userRef.legacyId) : null);
  const name = authorNameFromUserRef(userRef);

  const out = {
    _id,
    productId: String(review.productId || review.legacyProductId || ''),
    orderId: String(review.orderId || review.legacyOrderId || ''),
    rating: Number(review.rating) || 0,
    comment: review.comment,
    photo: review.photo ?? '',
    isSandbox: review.isSandbox === true,
    isHidden: review.isHidden === true,
    adminNote: review.adminNote ?? '',
    moderatedAt: review.moderatedAt ?? null,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    __v: review.__v ?? 0
  };

  if (legacy) {
    out.userId = { _id: legacy, id: legacy, name };
  } else {
    out.userId = null;
  }
  return out;
}

/** Canonical admin moderation list shape — stored-field parity (matches .lean() omit rules). */
function shapeAdminReviewDoc(review, userRef) {
  const _id = review._id != null ? String(review._id) : review.legacyId;
  const out = {
    _id,
    productId: String(review.productId || review.legacyProductId || ''),
    orderId: String(review.orderId || review.legacyOrderId || ''),
    rating: Number(review.rating) || 0,
    comment: review.comment,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    __v: review.__v ?? 0
  };

  const photo = review.photo ?? '';
  if (photo) out.photo = photo;
  if (review.isSandbox === true) out.isSandbox = true;
  if (review.isHidden === true) out.isHidden = true;
  if (review.adminNote) out.adminNote = review.adminNote;
  if (review.moderatedAt != null) out.moderatedAt = review.moderatedAt;

  if (userRef && typeof userRef === 'object') {
    const userLegacy = userRef._id != null
      ? String(userRef._id)
      : (userRef.legacyId ? String(userRef.legacyId) : null);
    if (userLegacy) {
      out.userId = { _id: userLegacy };
      if (userRef.email) out.userId.email = userRef.email;
    }
  }

  return out;
}

function mapTicketStatsPayload(byStatus, byPriority, total, unassigned, unread) {
  const statusCounts = TICKET_STATUSES.reduce((acc, s) => { acc[s] = 0; return acc; }, {});
  (byStatus || []).forEach((row) => {
    const rawKey = row._id != null ? row._id : row.status;
    const key = TICKET_STATUSES.includes(rawKey) ? rawKey : fromTicketStatus(rawKey);
    const bucket = TICKET_STATUSES.includes(key) ? key : 'open';
    statusCounts[bucket] += Number(row.count ?? row._count?._all) || 0;
  });

  const priorityCounts = TICKET_PRIORITIES.reduce((acc, p) => { acc[p] = 0; return acc; }, {});
  (byPriority || []).forEach((row) => {
    const rawKey = row._id != null ? row._id : row.priority;
    const key = TICKET_PRIORITIES.includes(rawKey) ? rawKey : fromTicketPriority(rawKey);
    const bucket = TICKET_PRIORITIES.includes(key) ? key : 'normal';
    priorityCounts[bucket] += Number(row.count ?? row._count?._all) || 0;
  });

  return {
    total,
    unassigned,
    unread,
    byStatus: statusCounts,
    byPriority: priorityCounts
  };
}

async function fetchNewsletterSubscribersPage({ isActive, tag, search, page = 1, limit = 20 }) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (safePage - 1) * safeLimit;
  const filters = buildSubscriberFilters({ isActive, tag, search });

  return routedRead(
    'newsletter',
    async () => {
      const query = buildMongoSubscriberQuery({ isActive, tag, search });
      const [subscribers, total, totalActive, totalInactive] = await Promise.all([
        Newsletter.find(query).sort({ subscribedAt: -1 }).skip(skip).limit(safeLimit).lean(),
        Newsletter.countDocuments(query),
        Newsletter.countDocuments({ isActive: true }),
        Newsletter.countDocuments({ isActive: false })
      ]);
      return {
        data: subscribers,
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          pages: Math.ceil(total / safeLimit) || 1
        },
        stats: {
          totalActive,
          totalInactive,
          total: totalActive + totalInactive
        }
      };
    },
    async () => {
      const repo = getNewsletterRepository();
      const [rows, total, totalActive, totalInactive] = await Promise.all([
        repo.findPaginated(filters, { skip, take: safeLimit }),
        repo.count(filters),
        repo.countByIsActive(true),
        repo.countByIsActive(false)
      ]);
      return {
        data: mapNewslettersToMongo(rows),
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          pages: Math.ceil(total / safeLimit) || 1
        },
        stats: {
          totalActive,
          totalInactive,
          total: totalActive + totalInactive
        }
      };
    }
  );
}

async function fetchEmailCampaignsList() {
  return routedRead(
    'emailcampaign',
    () => EmailCampaign.find()
      .sort({ createdAt: -1 })
      .populate('createdBy', 'username displayName')
      .lean(),
    async () => {
      const rows = await getEmailCampaignRepository().findAll();
      return mapEmailCampaignsToMongo(rows);
    }
  );
}

async function fetchContactMessagesInbox() {
  return routedRead(
    'contactmessage',
    async () => {
      const messages = await ContactMessage.find().sort({ createdAt: -1 }).limit(500);
      const unreadCount = await ContactMessage.countDocuments({
        $or: [
          { status: 'unread' },
          { status: { $exists: false }, isRead: false }
        ]
      });
      return {
        data: messages.map((m) => m.toAdminObject()),
        unreadCount
      };
    },
    async () => {
      const repo = getContactMessageRepository();
      const [rows, unreadCount] = await Promise.all([
        repo.findAll({ limit: 500 }),
        repo.countUnreadInbox()
      ]);
      return {
        data: mapContactMessagesToAdminShape(rows),
        unreadCount
      };
    }
  );
}

async function fetchTicketStats() {
  return routedRead(
    'contactmessage',
    async () => {
      const [byStatus, byPriority, total, unassigned, unread] = await Promise.all([
        ContactMessage.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
        ContactMessage.aggregate([{ $group: { _id: '$priority', count: { $sum: 1 } } }]),
        ContactMessage.countDocuments({}),
        ContactMessage.countDocuments({ $or: [{ assignedTo: '' }, { assignedTo: { $exists: false } }] }),
        ContactMessage.countDocuments({ isRead: false })
      ]);
      return mapTicketStatsPayload(byStatus, byPriority, total, unassigned, unread);
    },
    async () => {
      const stats = await getContactMessageRepository().aggregateTicketStats();
      return mapTicketStatsPayload(
        stats.byStatus,
        stats.byPriority,
        stats.total,
        stats.unassigned,
        stats.unread
      );
    }
  );
}

async function fetchReviewsByProduct(productId, { orderId, userId } = {}) {
  const filter = {
    productId: String(productId),
    isHidden: false
  };
  if (orderId) filter.orderId = String(orderId);
  if (userId) filter.userId = String(userId);

  return routedRead(
    'review',
    async () => {
      const docs = await Review.find({
        productId: filter.productId,
        isHidden: { $ne: true },
        ...(filter.orderId ? { orderId: filter.orderId } : {}),
        ...(filter.userId ? { userId: filter.userId } : {})
      }).populate('userId', 'firstName lastName name');
      return docs.map((doc) => shapePublicReviewDoc(doc.toObject({ virtuals: true }), doc.userId));
    },
    async () => {
      const rows = await getReviewRepository().findAll({
        productId: filter.productId,
        orderId: filter.orderId,
        userId: filter.userId,
        isHidden: false
      });
      const userMap = await loadReviewUserMap(rows);
      return rows.map((row) => {
        const userRef = row.userId ? userMap.get(row.userId) : null;
        return shapePublicReviewDoc(
          { ...row, _id: row.legacyId || row._id, productId: row.legacyProductId, orderId: row.legacyOrderId },
          userRef
        );
      });
    }
  );
}

async function fetchAdminReviewsPage({ page = 1, limit = 20, status, productId, rating, search }) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (safePage - 1) * safeLimit;

  const mongoFilter = {};
  if (status === 'hidden') mongoFilter.isHidden = true;
  if (status === 'visible') mongoFilter.isHidden = { $ne: true };
  if (productId) mongoFilter.productId = String(productId);
  if (rating) mongoFilter.rating = Number(rating);
  if (search) mongoFilter.comment = { $regex: String(search), $options: 'i' };

  const pgFilter = {};
  if (status === 'hidden') pgFilter.isHidden = true;
  if (status === 'visible') pgFilter.isHidden = false;
  if (productId) pgFilter.productId = String(productId);
  if (rating) pgFilter.rating = Number(rating);
  if (search) pgFilter.search = String(search);

  return routedRead(
    'review',
    async () => {
      const [rows, total] = await Promise.all([
        Review.find(mongoFilter)
          .populate('userId', 'email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(safeLimit)
          .lean(),
        Review.countDocuments(mongoFilter)
      ]);
      const reviews = rows.map((row) => shapeAdminReviewDoc(row, row.userId));
      return { reviews, total, page: safePage, pages: Math.ceil(total / safeLimit) };
    },
    async () => {
      const repo = getReviewRepository();
      const [rows, total] = await Promise.all([
        repo.findPaginated(pgFilter, { skip, take: safeLimit }),
        repo.count(pgFilter)
      ]);
      const userMap = await loadReviewUserMap(rows, { includeEmail: true });
      const reviews = rows.map((row) => {
        const userRef = row.userId ? userMap.get(row.userId) : null;
        return shapeAdminReviewDoc(
          { ...row, _id: row.legacyId || row._id, productId: row.legacyProductId, orderId: row.legacyOrderId },
          userRef
        );
      });
      return {
        reviews,
        total,
        page: safePage,
        pages: Math.ceil(total / safeLimit)
      };
    }
  );
}

module.exports = {
  fetchNewsletterSubscribersPage,
  fetchEmailCampaignsList,
  fetchContactMessagesInbox,
  fetchTicketStats,
  fetchReviewsByProduct,
  fetchAdminReviewsPage,
  buildSubscriberFilters,
  mapTicketStatsPayload
};
