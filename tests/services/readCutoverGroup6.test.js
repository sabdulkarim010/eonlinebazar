/********************************************************************
 * Stage 4 Step 6 — User + owned tables read parity (mocked Postgres)
 ********************************************************************/

jest.mock('../../backend/src/repositories/userRepository', () => ({
  resolvePostgresUserId: jest.fn(),
  listAddresses: jest.fn(),
  listWishlist: jest.fn(),
  listWalletTransactions: jest.fn(),
  findAll: jest.fn(),
  findByLegacyId: jest.fn(),
  countReferralsByReferredByLegacyId: jest.fn()
}));

jest.mock('../../backend/src/repositories/cartRepository', () => ({
  findCartWithItemsByUserLegacyId: jest.fn()
}));

jest.mock('../../backend/src/config/prismaClient', () => ({
  user: { findUnique: jest.fn() }
}));

const userRepo = require('../../backend/src/repositories/userRepository');
const cartRepo = require('../../backend/src/repositories/cartRepository');
const prisma = require('../../backend/src/config/prismaClient');
const {
  userToMongoShape,
  addressToMongoShape,
  wishlistItemEmbeddedToMongoShape,
  walletTransactionToMongoShape,
  cartItemEmbeddedToMongoShape
} = require('../../backend/src/services/readShapeHelpers');
const {
  fetchUserProfileDocument,
  fetchReferralFields,
  fetchCartItemsForResponse
} = require('../../backend/src/services/userReadService');

const LEGACY = '507f1f77bcf86cd799439011';
const USER_PG = 'pg-user-1';

describe('read cutover group 6 — User + owned tables (mocked)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  test('userToMongoShape uses legacyId as _id and pass-through referralCode', () => {
    const shape = userToMongoShape({
      id: USER_PG,
      legacyId: LEGACY,
      firstName: 'Ali',
      lastName: 'Karim',
      email: 'ali@example.com',
      referralCode: 'ABCD2345',
      walletBalance: 150.5,
      loyaltyPoints: 20,
      loyaltyTier: 'SILVER',
      accountStatus: 'ACTIVE',
      isVerified: true,
      avatar: '',
      avatarPublicId: '',
      phone: '',
      address: '',
      district: '',
      upazila: '',
      thana: '',
      fullAddress: '',
      referralEarnings: 50,
      tierUpgradedAt: null,
      lifetimeSpend: 1000,
      tierCashbackRate: 2,
      isSandbox: false,
      isDeleted: false,
      deletedAt: null,
      deletionReason: '',
      createdAt: new Date('2024-01-01')
    });
    expect(shape._id).toBe(LEGACY);
    expect(shape.referralCode).toBe('ABCD2345');
    expect(shape.loyaltyTier).toBe('silver');
    expect(shape.walletBalance).toBe(150.5);
  });

  test('addressToMongoShape maps upazilaOrThana and legacy _id', () => {
    const shape = addressToMongoShape({
      id: 'pg-addr',
      legacyId: '507f1f77bcf86cd799439099',
      label: 'Office',
      district: 'Dhaka',
      upazilaOrThana: 'Gulshan',
      fullAddress: 'Road 1',
      phone: '01700000000',
      isDefault: true,
      createdAt: new Date('2024-02-01')
    });
    expect(shape._id).toBe('507f1f77bcf86cd799439099');
    expect(shape.upazilaOrThana).toBe('Gulshan');
  });

  test('wishlistItemEmbeddedToMongoShape keeps legacyProductId when product FK null', () => {
    const shape = wishlistItemEmbeddedToMongoShape({
      legacyId: '507f1f77bcf86cd799439088',
      legacyProductId: '507f1f77bcf86cd799439077',
      productId: null,
      name: 'Deleted item',
      price: 99,
      image: '',
      icon: '📦',
      addedAt: new Date('2024-03-01')
    });
    expect(shape.productId).toBe('507f1f77bcf86cd799439077');
    expect(shape.name).toBe('Deleted item');
  });

  test('walletTransactionToMongoShape uses date field', () => {
    const when = new Date('2024-04-01');
    const shape = walletTransactionToMongoShape({
      legacyId: '507f1f77bcf86cd799439066',
      type: 'credit',
      amount: 25,
      note: 'Cashback',
      referenceOrder: 'ORD-1',
      date: when
    });
    expect(shape.date).toEqual(when);
    expect(shape.amount).toBe(25);
  });

  test('cartItemEmbeddedToMongoShape resolves product legacy id', () => {
    const shape = cartItemEmbeddedToMongoShape({
      id: 'pg-cart-line',
      name: 'Shirt',
      price: 500,
      quantity: 2,
      product: { legacyId: '507f1f77bcf86cd799439055' }
    });
    expect(shape.productId).toBe('507f1f77bcf86cd799439055');
    expect(shape.quantity).toBe(2);
  });

  test('fetchUserProfileDocument uses Postgres path when user flag is on', async () => {
    process.env.READ_PG_USER = 'true';
    process.env.READ_PG_ADDRESS = 'true';
    process.env.READ_PG_WISHLIST = 'true';
    process.env.READ_PG_WALLET = 'true';

    prisma.user.findUnique.mockResolvedValue({
      id: USER_PG,
      legacyId: LEGACY,
      firstName: 'Ali',
      lastName: 'Karim',
      email: 'ali@example.com',
      referralCode: 'PASS1234',
      walletBalance: 0,
      loyaltyPoints: 0,
      loyaltyTier: 'NONE',
      accountStatus: 'ACTIVE',
      isVerified: true,
      avatar: '',
      avatarPublicId: '',
      phone: '',
      address: '',
      district: '',
      upazila: '',
      thana: '',
      fullAddress: '',
      referralEarnings: 0,
      tierUpgradedAt: null,
      lifetimeSpend: 0,
      tierCashbackRate: 0,
      isSandbox: false,
      isDeleted: false,
      deletedAt: null,
      deletionReason: '',
      createdAt: new Date('2024-01-01'),
      referredBy: null
    });
    userRepo.resolvePostgresUserId.mockResolvedValue(USER_PG);
    userRepo.listAddresses.mockResolvedValue([]);
    userRepo.listWishlist.mockResolvedValue([]);
    userRepo.listWalletTransactions.mockResolvedValue([]);

    const doc = await fetchUserProfileDocument(LEGACY);
    expect(doc._id).toBe(LEGACY);
    expect(doc.referralCode).toBe('PASS1234');
    expect(doc.addresses).toEqual([]);
    expect(prisma.user.findUnique).toHaveBeenCalled();
  });

  test('fetchReferralFields uses Postgres path when READ_PG_USER=true', async () => {
    process.env.READ_PG_USER = 'true';
    prisma.user.findUnique.mockResolvedValue({
      id: USER_PG,
      legacyId: LEGACY,
      referralCode: 'KEEPME12',
      referralEarnings: 75
    });

    const fields = await fetchReferralFields(LEGACY);
    expect(fields.referralCode).toBe('KEEPME12');
    expect(fields.referralEarnings).toBe(75);
  });

  test('fetchCartItemsForResponse uses Postgres path when READ_PG_CART=true', async () => {
    process.env.READ_PG_CART = 'true';
    cartRepo.findCartWithItemsByUserLegacyId.mockResolvedValue({
      items: [{
        id: 'line-1',
        name: 'Hat',
        price: 100,
        quantity: 1,
        product: { legacyId: '507f1f77bcf86cd799439055' }
      }]
    });

    const formatFn = jest.fn(async (items) => items.map((i) => ({ ...i, formatted: true })));
    const result = await fetchCartItemsForResponse(LEGACY, formatFn);
    expect(result).toHaveLength(1);
    expect(result[0].formatted).toBe(true);
    expect(formatFn).toHaveBeenCalledWith([
      expect.objectContaining({ productId: '507f1f77bcf86cd799439055' })
    ]);
  });
});
