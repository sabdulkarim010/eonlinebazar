/**
 * Loyalty tier service — unit tests for tier calculation.
 */

const { calculateTier, normalizeTierSettings, TIER_RANK } = require('../backend/src/services/loyaltyTierService');

describe('loyaltyTierService.calculateTier', () => {
    const baseSettings = normalizeTierSettings({
        enableTieredLoyalty: true,
        silverThreshold: 5000,
        goldThreshold: 15000,
        platinumThreshold: 50000,
        silverCashback: 1.5,
        goldCashback: 2.5,
        platinumCashback: 4.0,
        cashbackPercentage: 1
    });

    test('returns none below silver threshold', () => {
        const result = calculateTier(4999, baseSettings);
        expect(result.tier).toBe('none');
        expect(result.cashbackRate).toBe(1);
    });

    test('returns silver at threshold', () => {
        const result = calculateTier(5000, baseSettings);
        expect(result.tier).toBe('silver');
        expect(result.cashbackRate).toBe(1.5);
    });

    test('returns gold at threshold', () => {
        const result = calculateTier(15000, baseSettings);
        expect(result.tier).toBe('gold');
        expect(result.cashbackRate).toBe(2.5);
    });

    test('returns platinum at threshold', () => {
        const result = calculateTier(50000, baseSettings);
        expect(result.tier).toBe('platinum');
        expect(result.cashbackRate).toBe(4.0);
    });

    test('returns default cashback when tiers disabled', () => {
        const result = calculateTier(99999, { ...baseSettings, enableTieredLoyalty: false });
        expect(result.tier).toBe('none');
        expect(result.cashbackRate).toBe(1);
    });
});

describe('loyaltyTierService.TIER_RANK', () => {
    test('ranks tiers in ascending order', () => {
        expect(TIER_RANK.none).toBeLessThan(TIER_RANK.silver);
        expect(TIER_RANK.silver).toBeLessThan(TIER_RANK.gold);
        expect(TIER_RANK.gold).toBeLessThan(TIER_RANK.platinum);
    });
});
