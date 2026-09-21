/********************************************************************
 * Project: EonlineBazar — Database Migration Stage 4
 * File: userReadService.js
 * Description: Routed reads for User, Address, WishlistItem, WalletTransaction, Cart.
 ********************************************************************/

'use strict';

const mongoose = require('mongoose');
const User = require('../models/user');
const Product = require('../models/product');
const Cart = require('../models/cart');
const { routedRead } = require('./readRouter');
const {
  userToMongoShape,
  mapUsersToMongo,
  mapAddressesToMongo,
  mapWishlistEmbeddedToMongo,
  mapWalletTransactionsToMongo,
  mapCartItemsEmbeddedToMongo
} = require('./readShapeHelpers');

const PRODUCT_MEDIA_SELECT = 'name price images image thumbnail icon productId stockQuantity stock';

function getUserRepository() {
  return require('../repositories/userRepository');
}

function getCartRepository() {
  return require('../repositories/cartRepository');
}

function getPrisma() {
  return require('../config/prismaClient');
}

function stripEmbeddedArrays(userObj) {
  if (!userObj || typeof userObj !== 'object') return userObj;
  const out = { ...userObj };
  delete out.addresses;
  delete out.wishlist;
  delete out.walletHistory;
  return out;
}

async function loadPgUserByLegacyId(mongoUserId, { includeReferredBy = true } = {}) {
  const prisma = getPrisma();
  return prisma.user.findUnique({
    where: { legacyId: String(mongoUserId) },
    include: includeReferredBy
      ? { referredBy: { select: { legacyId: true } } }
      : undefined
  });
}

async function resolvePgUserId(mongoUserId) {
  const repo = getUserRepository();
  return repo.resolvePostgresUserId(mongoUserId);
}

async function fetchUserCoreScalars(mongoUserId) {
  return routedRead(
    'user',
    async () => {
      const user = await User.findById(mongoUserId).select('-password');
      if (!user) return null;
      return stripEmbeddedArrays(user.toObject());
    },
    async () => {
      const row = await loadPgUserByLegacyId(mongoUserId);
      return userToMongoShape(row, { toObject: true });
    }
  );
}

async function fetchUserAddressesEmbedded(mongoUserId) {
  return routedRead(
    'address',
    async () => {
      const user = await User.findById(mongoUserId).select('addresses');
      return user ? (user.addresses || []) : [];
    },
    async () => {
      const pgUserId = await resolvePgUserId(mongoUserId);
      if (!pgUserId) return [];
      const rows = await getUserRepository().listAddresses(pgUserId, { sort: 'mongoEmbedded' });
      return mapAddressesToMongo(rows);
    }
  );
}

async function fetchUserWishlistEmbedded(mongoUserId) {
  return routedRead(
    'wishlist',
    async () => {
      const user = await User.findById(mongoUserId).select('wishlist');
      if (!user) return [];
      return (user.wishlist || []).map((item) => (
        item && typeof item.toObject === 'function' ? item.toObject() : { ...item }
      ));
    },
    async () => {
      const pgUserId = await resolvePgUserId(mongoUserId);
      if (!pgUserId) return [];
      const rows = await getUserRepository().listWishlist(pgUserId);
      return mapWishlistEmbeddedToMongo(rows);
    }
  );
}

async function fetchUserWalletHistoryEmbedded(mongoUserId) {
  return routedRead(
    'wallet',
    async () => {
      const user = await User.findById(mongoUserId).select('walletHistory');
      if (!user) return [];
      return (user.walletHistory || []).map((row) => (
        row && typeof row.toObject === 'function' ? row.toObject() : { ...row }
      ));
    },
    async () => {
      const pgUserId = await resolvePgUserId(mongoUserId);
      if (!pgUserId) return [];
      const rows = await getUserRepository().listWalletTransactions(pgUserId);
      return mapWalletTransactionsToMongo(rows);
    }
  );
}

/** Full profile document matching User.toObject() minus password. */
async function fetchUserProfileDocument(mongoUserId) {
  const core = await fetchUserCoreScalars(mongoUserId);
  if (!core) return null;

  const [addresses, wishlist, walletHistory] = await Promise.all([
    fetchUserAddressesEmbedded(mongoUserId),
    fetchUserWishlistEmbedded(mongoUserId),
    fetchUserWalletHistoryEmbedded(mongoUserId)
  ]);

  return {
    ...core,
    addresses,
    wishlist,
    walletHistory
  };
}

async function fetchUserAddressesList(mongoUserId) {
  return fetchUserAddressesEmbedded(mongoUserId);
}

function enrichWishlistItem(item, product) {
  const plain = item && typeof item.toObject === 'function' ? item.toObject() : { ...item };
  const catalog = product && typeof product.toObject === 'function'
    ? product.toObject()
    : (product || {});

  const image = (
    plain.image
    || (Array.isArray(catalog.images) && catalog.images[0])
    || catalog.image
    || catalog.thumbnail
    || ''
  );
  const emojiIcon = plain.emojiIcon || plain.icon || catalog.icon || '📦';

  return {
    productId: plain.productId,
    name: plain.name || catalog.name || '',
    price: plain.price != null ? Number(plain.price) : Number(catalog.price) || 0,
    image,
    images: catalog.images || [],
    icon: emojiIcon,
    emojiIcon,
    addedAt: plain.addedAt
  };
}

async function enrichWishlistItems(wishlist = []) {
  const items = Array.isArray(wishlist) ? wishlist : [];
  if (items.length === 0) return [];

  const productIds = [...new Set(items.map((item) => String(item.productId)).filter(Boolean))];
  const objectIds = productIds.filter((id) => mongoose.Types.ObjectId.isValid(id));

  const products = await Product.find({
    $or: [
      { _id: { $in: objectIds } },
      { productId: { $in: productIds } }
    ]
  }).select('name price images image icon productId thumbnail');

  const productByKey = new Map();
  products.forEach((product) => {
    productByKey.set(String(product._id), product);
    if (product.productId) productByKey.set(String(product.productId), product);
  });

  return items.map((item) =>
    enrichWishlistItem(item, productByKey.get(String(item.productId)))
  );
}

async function fetchEnrichedWishlist(mongoUserId) {
  const raw = await fetchUserWishlistEmbedded(mongoUserId);
  return enrichWishlistItems(raw);
}

async function fetchWalletBalance(mongoUserId) {
  return routedRead(
    'wallet',
    async () => {
      const user = await User.findById(mongoUserId).select('walletBalance');
      return user ? (Number(user.walletBalance) || 0) : 0;
    },
    async () => {
      const row = await loadPgUserByLegacyId(mongoUserId, { includeReferredBy: false });
      if (!row) return 0;
      return Number(row.walletBalance) || 0;
    }
  );
}

async function fetchLoyaltyPoints(mongoUserId) {
  return routedRead(
    'user',
    async () => {
      const user = await User.findById(mongoUserId).select('loyaltyPoints');
      return user ? (Number(user.loyaltyPoints) || 0) : 0;
    },
    async () => {
      const row = await loadPgUserByLegacyId(mongoUserId, { includeReferredBy: false });
      if (!row) return 0;
      return Number(row.loyaltyPoints) || 0;
    }
  );
}

async function fetchReferralFields(mongoUserId) {
  return routedRead(
    'user',
    async () => {
      const user = await User.findById(mongoUserId).select('referralCode referralEarnings');
      if (!user) return null;
      return {
        referralCode: user.referralCode,
        referralEarnings: Number(user.referralEarnings) || 0
      };
    },
    async () => {
      const row = await loadPgUserByLegacyId(mongoUserId, { includeReferredBy: false });
      if (!row) return null;
      return {
        referralCode: row.referralCode ?? null,
        referralEarnings: Number(row.referralEarnings) || 0
      };
    }
  );
}

async function countReferralsForUser(mongoUserId) {
  return routedRead(
    'user',
    () => User.countDocuments({ referredBy: mongoUserId }),
    () => getUserRepository().countReferralsByReferredByLegacyId(mongoUserId)
  );
}

function buildAdminCustomerFilters(query = {}) {
  const tierFilter = String(query.tier || '').trim().toLowerCase();
  const validTiers = ['none', 'silver', 'gold', 'platinum'];
  const filters = {};

  const search = String(query.search || '').trim();
  if (search) filters.search = search;
  if (tierFilter && validTiers.includes(tierFilter)) filters.loyaltyTier = tierFilter;

  const cursor = String(query.cursor || '').trim();
  if (cursor) filters.cursor = cursor;

  return filters;
}

function buildMongoAdminListFilter(filters = {}) {
  const listFilter = {};
  const search = String(filters.search || '').trim();
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const phoneDigits = search.replace(/\D/g, '');
    const orClauses = [
      { email: { $regex: escaped, $options: 'i' } },
      { firstName: { $regex: escaped, $options: 'i' } },
      { lastName: { $regex: escaped, $options: 'i' } },
      { mobile: { $regex: escaped, $options: 'i' } }
    ];
    if (phoneDigits.length >= 6) {
      orClauses.push({ mobile: { $regex: phoneDigits, $options: 'i' } });
    }
    listFilter.$or = orClauses;
  }
  if (filters.loyaltyTier) listFilter.loyaltyTier = filters.loyaltyTier;
  return listFilter;
}

async function attachAdminCustomerEmbeds(shaped) {
  await Promise.all(shaped.map(async (customer) => {
    const legacyId = customer._id;
    const [addresses, wishlist, walletHistory] = await Promise.all([
      fetchUserAddressesEmbedded(legacyId),
      fetchUserWishlistEmbedded(legacyId),
      fetchUserWalletHistoryEmbedded(legacyId)
    ]);
    customer.addresses = addresses;
    customer.wishlist = wishlist;
    customer.walletHistory = walletHistory;
  }));
  return shaped;
}

async function countAdminCustomers({ query }) {
  const filters = buildAdminCustomerFilters(query);
  return routedRead(
    'user',
    () => User.countDocuments(buildMongoAdminListFilter(filters)),
    () => getUserRepository().countAll({
      search: filters.search,
      loyaltyTier: filters.loyaltyTier
    })
  );
}

async function fetchAdminCustomersOffsetPage({ query, page, limit }) {
  const filters = buildAdminCustomerFilters(query);
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.max(1, Number(limit) || 10);
  const skip = (safePage - 1) * safeLimit;

  return routedRead(
    'user',
    () => User.find(buildMongoAdminListFilter(filters))
      .select('-password')
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    async () => {
      const rows = await getUserRepository().findAll({
        search: filters.search,
        loyaltyTier: filters.loyaltyTier,
        page: safePage,
        limit: safeLimit
      });
      const shaped = mapUsersToMongo(rows, { lean: true });
      return attachAdminCustomerEmbeds(shaped);
    }
  );
}

async function fetchAdminCustomersPage({ query, limit }) {
  const filters = buildAdminCustomerFilters(query);
  const take = limit + 1;

  return routedRead(
    'user',
    async () => {
      const listFilter = buildMongoAdminListFilter(filters);

      const cursor = String(filters.cursor || '').trim();
      if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
        const cursorDoc = await User.findById(cursor).select('createdAt').lean();
        if (cursorDoc) {
          listFilter.$or = [
            { createdAt: { $lt: cursorDoc.createdAt } },
            { createdAt: cursorDoc.createdAt, _id: { $lt: cursor } }
          ];
        }
      }

      return User.find(listFilter)
        .select('-password')
        .sort({ createdAt: -1, _id: -1 })
        .limit(take)
        .lean();
    },
    async () => {
      const rows = await getUserRepository().findAll({
        search: filters.search,
        loyaltyTier: filters.loyaltyTier,
        cursor: filters.cursor,
        take
      });
      const shaped = mapUsersToMongo(rows, { lean: true });
      return attachAdminCustomerEmbeds(shaped);
    }
  );
}

async function fetchCustomerById(mongoUserId) {
  return routedRead(
    'user',
    () => User.findById(mongoUserId).select('-password').lean(),
    async () => {
      const row = await loadPgUserByLegacyId(mongoUserId);
      if (!row) return null;
      const [addresses, wishlist, walletHistory] = await Promise.all([
        fetchUserAddressesEmbedded(mongoUserId),
        fetchUserWishlistEmbedded(mongoUserId),
        fetchUserWalletHistoryEmbedded(mongoUserId)
      ]);
      return userToMongoShape(row, {
        lean: true,
        includeEmbedded: true,
        addresses,
        wishlist,
        walletHistory
      });
    }
  );
}

async function fetchCartMongoEmbeddedItems(mongoUserId) {
  const cart = await Cart.findOne({ userId: mongoUserId })
    .populate('items.productId', PRODUCT_MEDIA_SELECT);
  if (!cart || !cart.items.length) return [];
  return cart.items;
}

async function fetchCartItemsForResponse(mongoUserId, formatCartItemsForResponse) {
  return routedRead(
    'cart',
    async () => {
      const items = await fetchCartMongoEmbeddedItems(mongoUserId);
      return formatCartItemsForResponse(items);
    },
    async () => {
      const cart = await getCartRepository().findCartWithItemsByUserLegacyId(mongoUserId);
      if (!cart || !cart.items.length) return [];
      const embedded = mapCartItemsEmbeddedToMongo(cart.items);
      return formatCartItemsForResponse(embedded);
    }
  );
}

module.exports = {
  fetchUserProfileDocument,
  fetchUserAddressesList,
  fetchEnrichedWishlist,
  fetchWalletBalance,
  fetchLoyaltyPoints,
  fetchReferralFields,
  countReferralsForUser,
  fetchAdminCustomersPage,
  fetchAdminCustomersOffsetPage,
  countAdminCustomers,
  fetchCustomerById,
  fetchCartItemsForResponse,
  enrichWishlistItems
};
