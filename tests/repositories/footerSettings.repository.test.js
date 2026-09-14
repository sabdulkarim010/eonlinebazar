/********************************************************************
 * FooterSettings Repository — paymentBadges tri-state integration tests
 *
 * Verifies audit-critical behavior:
 *   paymentBadgesMode 'skip'     — undefined/absent input leaves Postgres badges untouched
 *   paymentBadgesMode 'replace'  — explicit [] clears all FooterPaymentBadge rows
 *
 * Stage 2 Step 3, Part 3 — 2026-09-14
 ********************************************************************/

const { describe, test, expect, afterAll } = require('./jestCompat');

require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const {
  FOOTER_SETTINGS_KEY,
  findByKey,
  upsertFromMongo,
  replacePaymentBadges
} = require('../../backend/src/repositories/footerSettingsRepository');

const TEST_BADGE_A = `__test_badge_a_${Date.now()}__`;
const TEST_BADGE_B = `__test_badge_b_${Date.now()}__`;

async function countPaymentBadges(footerSettingsId) {
  return prisma.footerPaymentBadge.count({ where: { footerSettingsId } });
}

async function ensureGlobalFooterRow() {
  let row = await prisma.footerSettings.findUnique({ where: { key: FOOTER_SETTINGS_KEY } });
  if (!row) {
    row = await prisma.footerSettings.create({ data: { key: FOOTER_SETTINGS_KEY } });
  }
  return row;
}

afterAll(async () => {
  const row = await prisma.footerSettings.findUnique({ where: { key: FOOTER_SETTINGS_KEY } });
  if (row) {
    await prisma.footerPaymentBadge.deleteMany({
      where: {
        footerSettingsId: row.id,
        name: { in: [TEST_BADGE_A, TEST_BADGE_B] }
      }
    });
  }
});

describe('footerSettingsRepository — paymentBadges tri-state', () => {
  test('replace mode with explicit [] clears all badge rows', async () => {
    const root = await ensureGlobalFooterRow();
    await replacePaymentBadges(root.id, [{ name: TEST_BADGE_A }, { name: TEST_BADGE_B }]);
    expect(await countPaymentBadges(root.id)).toBe(2);

    await upsertFromMongo(
      { copyrightText: root.copyrightText, paymentBadges: [] },
      { paymentBadgesMode: 'replace' }
    );

    expect(await countPaymentBadges(root.id)).toBe(0);
  });

  test('skip mode leaves existing badge rows untouched when paymentBadges is absent', async () => {
    const root = await ensureGlobalFooterRow();
    await replacePaymentBadges(root.id, [{ name: TEST_BADGE_A }]);
    expect(await countPaymentBadges(root.id)).toBe(1);

    await upsertFromMongo(
      { copyrightText: 'Updated copyright for tri-state skip test' },
      { paymentBadgesMode: 'skip' }
    );

    expect(await countPaymentBadges(root.id)).toBe(1);

    const loaded = await findByKey(FOOTER_SETTINGS_KEY);
    expect(loaded.paymentBadges.some((b) => b.name === TEST_BADGE_A)).toBe(true);
  });
});
