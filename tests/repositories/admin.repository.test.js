/********************************************************************
 * Admin Repository — Isolated Integration Tests
 * Connects to the REAL Neon PostgreSQL test database.
 * Creates and cleans up its own data — does NOT touch MongoDB.
 *
 * Run: npm run test:repositories
 *
 * Stage 2 Step 2, Part 2 — 2026-09-13
 ********************************************************************/

const { describe, test, expect, afterEach, afterAll } = require('./jestCompat');

require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const {
  BCRYPT_PATTERN,
  SECRET_FIELDS,
  isHashed,
  findAll,
  findById,
  findByIdWithSecrets,
  findByUsername,
  create,
  update,
  remove,
  verifyPassword
} = require('../../backend/src/repositories/adminRepository');

const PREFIX = `__test_admin_${Date.now()}_`;
const createdIds = [];

async function cleanup() {
  if (createdIds.length) {
    await prisma.admin.deleteMany({ where: { id: { in: [...createdIds] } } });
    createdIds.length = 0;
  }
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

async function readStoredPassword(id) {
  const row = await prisma.admin.findUnique({
    where: { id },
    select: { password: true }
  });
  return row?.password ?? null;
}

// ── 1. Password hashing ──────────────────────────────────────────────────────
describe('Admin repository — password security', () => {
  test('create() hashes plain-text password (not equal, correct bcrypt prefix)', async () => {
    const plain = 'SecurePass123!';
    const record = track(await create({
      username: `${PREFIX}hash_create`,
      password: plain,
      role: 'staff'
    }));

    const stored = await readStoredPassword(record.id);
    expect(stored).not.toBe(plain);
    expect(isHashed(stored)).toBe(true);
    expect(BCRYPT_PATTERN.test(stored)).toBe(true);
  });

  test('create() with an already-hashed password does NOT double-hash', async () => {
    const plain = 'AnotherPass456!';
    const first = track(await create({
      username: `${PREFIX}no_double`,
      password: plain,
      role: 'staff'
    }));
    const firstHash = await readStoredPassword(first.id);

    const second = track(await create({
      username: `${PREFIX}no_double_2`,
      password: firstHash,
      role: 'staff'
    }));
    const secondHash = await readStoredPassword(second.id);

    expect(secondHash).toBe(firstHash);
  });

  test('verifyPassword() returns true/false against create() hash', async () => {
    const plain = 'VerifyMe789!';
    const record = track(await create({
      username: `${PREFIX}verify_pw`,
      password: plain,
      role: 'staff'
    }));
    const stored = await readStoredPassword(record.id);

    expect(await verifyPassword(plain, stored)).toBe(true);
    expect(await verifyPassword('wrong-password', stored)).toBe(false);
  });
});

// ── 2. select:false secrecy ──────────────────────────────────────────────────
describe('Admin repository — secret field isolation', () => {
  test('findAll() and findById() omit the six secret fields', async () => {
    const record = track(await create({
      username: `${PREFIX}secrets_safe`,
      password: 'SecretFields1!',
      role: 'staff',
      otp: '123456',
      otpExpiry: Date.now() + 60000,
      totpSecret: 'TOTPSECRET',
      totpPendingSecret: 'PENDINGSECRET',
      smsSetupOtp: '654321',
      smsSetupOtpExpiry: Date.now() + 120000
    }));

    const byId = await findById(record.id);
    const all = await findAll({ role: 'staff' });
    const fromList = all.find((a) => a.id === record.id);

    for (const field of SECRET_FIELDS) {
      expect(byId[field]).toBeUndefined();
      expect(fromList[field]).toBeUndefined();
    }
    expect(byId.password).toBeUndefined();
  });

  test('findByIdWithSecrets() returns all six secret fields', async () => {
    const otpExpiry = Date.now() + 60000;
    const smsSetupOtpExpiry = Date.now() + 120000;

    const record = track(await create({
      username: `${PREFIX}secrets_full`,
      password: 'SecretFields2!',
      role: 'staff',
      otp: '123456',
      otpExpiry,
      totpSecret: 'TOTPSECRET',
      totpPendingSecret: 'PENDINGSECRET',
      smsSetupOtp: '654321',
      smsSetupOtpExpiry
    }));

    const withSecrets = await findByIdWithSecrets(record.id);

    expect(withSecrets.otp).toBe('123456');
    expect(withSecrets.otpExpiry).toBe(otpExpiry);
    expect(withSecrets.totpSecret).toBe('TOTPSECRET');
    expect(withSecrets.totpPendingSecret).toBe('PENDINGSECRET');
    expect(withSecrets.smsSetupOtp).toBe('654321');
    expect(withSecrets.smsSetupOtpExpiry).toBe(smsSetupOtpExpiry);
    expect(withSecrets.password).toBeTruthy();
  });
});

// ── 3. CRUD + update password behaviour ──────────────────────────────────────
describe('Admin repository — real Neon DB', () => {
  test('findByUsername() locates account by username', async () => {
    const username = `${PREFIX}by_username`;
    const created = track(await create({
      username,
      password: 'UsernameLookup1!',
      role: 'staff'
    }));

    const found = await findByUsername(username);
    expect(found).toBeDefined();
    expect(found.id).toBe(created.id);
    expect(found.username).toBe(username);
  });

  test('findAll() filters by role and supports pagination', async () => {
    track(await create({
      username: `${PREFIX}staff_a`,
      password: 'StaffA123456!',
      role: 'staff'
    }));
    track(await create({
      username: `${PREFIX}staff_b`,
      password: 'StaffB123456!',
      role: 'staff'
    }));

    const staff = await findAll({ role: 'staff', page: 1, limit: 1 });
    expect(staff.length).toBe(1);
    expect(staff[0].role).toBe('staff');
  });

  test('update() re-hashes a new plain-text password', async () => {
    const created = track(await create({
      username: `${PREFIX}update_pw`,
      password: 'OldPassword1!',
      role: 'staff'
    }));
    const oldHash = await readStoredPassword(created.id);

    await update(created.id, { password: 'NewPassword2!' });
    const newHash = await readStoredPassword(created.id);

    expect(newHash).not.toBe(oldHash);
    expect(isHashed(newHash)).toBe(true);
    expect(await verifyPassword('NewPassword2!', newHash)).toBe(true);
  });

  test('update() without password leaves existing hash untouched', async () => {
    const created = track(await create({
      username: `${PREFIX}update_no_pw`,
      password: 'KeepPassword1!',
      role: 'staff'
    }));
    const before = await readStoredPassword(created.id);

    await update(created.id, { name: 'Updated Name Only' });
    const after = await readStoredPassword(created.id);

    expect(after).toBe(before);
  });

  test('remove() deletes staff account', async () => {
    const created = await create({
      username: `${PREFIX}delete_staff`,
      password: 'DeleteStaff1!',
      role: 'staff'
    });

    const result = await remove(created.id);
    expect(result.deleted).toBe(true);

    const check = await findById(created.id);
    expect(check).toBeNull();
  });

  test('remove() rejects superadmin (mirrors findStaffById guard)', async () => {
    const owner = track(await create({
      username: `${PREFIX}superadmin`,
      password: 'SuperAdmin1!',
      role: 'superadmin'
    }));

    await expect(remove(owner.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  test('remove() throws NOT_FOUND for unknown id', async () => {
    await expect(
      remove('00000000-0000-0000-0000-000000000000')
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
