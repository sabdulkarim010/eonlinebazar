/********************************************************************
 * User Repository — Isolated Integration Tests
 * Connects to the REAL Neon PostgreSQL test database.
 * Creates and cleans up its own data — does NOT touch MongoDB.
 *
 * Run: npm run test:repositories
 *
 * Stage 2 Step 2, Part 3 — 2026-09-13
 ********************************************************************/

// Pin repository-test mode before prismaClient loads (Neon 90s fetch + query retries).
process.env.REPOSITORY_TEST = process.env.REPOSITORY_TEST || '1';

const { describe, test, expect, beforeAll, afterEach, afterAll, jest } = require('./jestCompat');

jest.setTimeout(30000);

require('dotenv').config();

const { withNeonRetry } = require('../../backend/src/config/neonRetry');
const { warmNeonConnection } = require('../../backend/src/config/postgresBootstrap');
const prisma = require('../../backend/src/config/prismaClient');
const {
  REFERRAL_CODE_ALPHABET,
  REFERRAL_CODE_LENGTH,
  REFERRAL_MAX_ATTEMPTS,
  generateReferralCode,
  resolveUniqueReferralCode,
  findAll,
  findById,
  findByReferralCode,
  create,
  update,
  remove,
  listAddresses,
  addAddress,
  updateAddress,
  removeAddress,
  listWishlist,
  addToWishlist,
  removeFromWishlist,
  creditWallet,
  debitWallet
} = require('../../backend/src/repositories/userRepository');

const PREFIX = `__test_user_${Date.now()}_`;
const createdIds = [];

beforeAll(async () => {
  await withNeonRetry(
    () => warmNeonConnection({ attempts: 4, baseDelayMs: 300 }),
    { attempts: 4, baseDelayMs: 300 }
  );
});

async function cleanup() {
  if (!createdIds.length) return;

  await withNeonRetry(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [...createdIds] } } });
  });
  createdIds.length = 0;
}

afterEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
});

function track(record) {
  if (record?.id) createdIds.push(record.id);
  return record;
}

function baseUser(overrides = {}) {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    firstName: 'Test',
    lastName: 'User',
    email: `${PREFIX}${suffix}@example.com`,
    ...overrides
  };
}

function isValidReferralCode(code) {
  if (code.length !== REFERRAL_CODE_LENGTH) return false;
  for (const ch of code) {
    if (!REFERRAL_CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}

// ── 1. Referral codes ────────────────────────────────────────────────────────
describe('User repository — referral codes', () => {
  test('create() generates referralCode of correct length and alphabet', async () => {
    const record = track(await create(baseUser()));

    expect(record.referralCode).toBeDefined();
    expect(record.referralCode.length).toBe(REFERRAL_CODE_LENGTH);
    expect(isValidReferralCode(record.referralCode)).toBe(true);
  });

  test('create() passes through explicit referralCode from Mongo (no regeneration)', async () => {
    const mongoCode = `U${String(Date.now()).slice(-7)}`;
    expect(isValidReferralCode(mongoCode)).toBe(true);

    const record = track(await create(baseUser({ referralCode: mongoCode })));

    expect(record.referralCode).toBe(mongoCode);
  });

  test('two users receive different referral codes', async () => {
    const a = track(await create(baseUser()));
    const b = track(await create(baseUser()));

    expect(a.referralCode).not.toBe(b.referralCode);
  });

  test('findByReferralCode() locates user by generated code', async () => {
    const created = track(await create(baseUser()));
    const found = await findByReferralCode(created.referralCode);

    expect(found).toBeDefined();
    expect(found.id).toBe(created.id);
    expect(found.email).toBe(created.email);
  });

  test('resolveUniqueReferralCode() retries on collision and picks next candidate', async () => {
    const takenCode = 'ABCDEFGH';
    expect(isValidReferralCode(takenCode)).toBe(true);

    const pre = await prisma.user.create({
      data: {
        firstName: 'Pre',
        lastName: 'Insert',
        email: `${PREFIX}collision_${Date.now()}@example.com`,
        referralCode: takenCode
      }
    });
    createdIds.push(pre.id);

    let calls = 0;
    const picker = () => {
      calls += 1;
      return calls === 1 ? takenCode : 'JKLMNPQR';
    };

    const code = await resolveUniqueReferralCode(picker);
    expect(calls).toBe(2);
    expect(code).toBe('JKLMNPQR');
    expect(code).not.toBe(takenCode);
  });

  test('update() ignores referralCode changes', async () => {
    const created = track(await create(baseUser()));
    const originalCode = created.referralCode;

    const updated = await update(created.id, { referralCode: 'ZZZZZZZZ', firstName: 'Changed' });

    expect(updated.firstName).toBe('Changed');
    expect(updated.referralCode).toBe(originalCode);

    const reloaded = await findById(created.id);
    expect(reloaded.referralCode).toBe(originalCode);
  });
});

// ── 2. Addresses ─────────────────────────────────────────────────────────────
describe('User repository — addresses', () => {
  test('addAddress/updateAddress/removeAddress and listAddresses reflect changes', async () => {
    const user = track(await create(baseUser()));

    const addr = await addAddress(user.id, {
      label: 'Office',
      fullAddress: '123 Test Road',
      district: 'Dhaka',
      isDefault: true
    });

    let list = await listAddresses(user.id);
    expect(list).toHaveLength(1);
    expect(list[0].fullAddress).toBe('123 Test Road');
    expect(list[0].isDefault).toBe(true);

    const updated = await updateAddress(addr.id, {
      fullAddress: '456 Updated Road',
      label: 'Work'
    });
    expect(updated.fullAddress).toBe('456 Updated Road');
    expect(updated.label).toBe('Work');

    list = await listAddresses(user.id);
    expect(list[0].fullAddress).toBe('456 Updated Road');

    await removeAddress(addr.id);
    list = await listAddresses(user.id);
    expect(list).toHaveLength(0);
  });
});

// ── 3. Wallet ──────────────────────────────────────────────────────────────────
describe('User repository — wallet', () => {
  test('creditWallet increases balance and creates WalletTransaction row', async () => {
    const user = track(await create(baseUser()));

    const result = await creditWallet(user.id, 150, 'cashback', 'Test credit');

    expect(result.walletBalance).toBe(150);
    expect(result.transaction.amount).toBe(150);
    expect(result.transaction.type).toBe('cashback');
    expect(result.transaction.note).toBe('Test credit');

    const reloaded = await findById(user.id);
    expect(reloaded.walletBalance).toBe(150);

    const txns = await prisma.walletTransaction.findMany({ where: { userId: user.id } });
    expect(txns).toHaveLength(1);
  });

  test('debitWallet decreases balance and rejects negative balance', async () => {
    const user = track(await create(baseUser()));
    await creditWallet(user.id, 100, 'credit', 'Seed balance');

    const result = await debitWallet(user.id, 40, 'debit', 'Test debit');
    expect(result.walletBalance).toBe(60);

    await expect(
      debitWallet(user.id, 200, 'debit', 'Overdraft attempt')
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });

    const reloaded = await findById(user.id);
    expect(reloaded.walletBalance).toBe(60);
  });
});

// ── 4. Cascade delete + wishlist ─────────────────────────────────────────────
describe('User repository — cascade delete and wishlist', () => {
  test('addToWishlist/removeFromWishlist work with legacyProductId', async () => {
    const user = track(await create(baseUser()));
    const productKey = `mongo_product_${Date.now()}`;

    const item = await addToWishlist(user.id, productKey, {
      name: 'Sample Product',
      price: 99
    });

    let list = await listWishlist(user.id);
    expect(list).toHaveLength(1);
    expect(list[0].legacyProductId).toBe(productKey);
    expect(list[0].name).toBe('Sample Product');

    await removeFromWishlist(user.id, productKey);
    list = await listWishlist(user.id);
    expect(list).toHaveLength(0);

    expect(item.id).toBeTruthy();
  });

  test('remove() cascades to addresses and wishlist items', async () => {
    const user = await create(baseUser());
    const userId = user.id;

    const addr = await addAddress(userId, { fullAddress: 'Cascade Test Address' });
    await addToWishlist(userId, `prod_${Date.now()}`, { name: 'Wishlist Item' });

    await remove(userId);

    const addrCheck = await prisma.address.findUnique({ where: { id: addr.id } });
    const wishCheck = await prisma.wishlistItem.findMany({ where: { userId } });

    expect(addrCheck).toBeNull();
    expect(wishCheck).toHaveLength(0);
  });
});

// ── 5. List / lookup ─────────────────────────────────────────────────────────
describe('User repository — real Neon DB', () => {
  test('findAll() supports search and excludes password', async () => {
    const email = `${PREFIX}search_${Date.now()}@example.com`;
    track(await create({
      firstName: 'Searchable',
      lastName: 'Customer',
      email
    }));

    const results = await findAll({ search: 'Searchable' });
    const hit = results.find((u) => u.email === email);

    expect(hit).toBeDefined();
    expect(hit.password).toBeUndefined();
    expect(hit.name).toBe('Searchable Customer');
  });

  test('generateReferralCode() uses REFERRAL_MAX_ATTEMPTS constant of 6', () => {
    expect(REFERRAL_MAX_ATTEMPTS).toBe(6);
    const code = generateReferralCode();
    expect(code.length).toBe(8);
  });
});
