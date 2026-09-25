/**
 * Phase 4.4 — loyalty ledger helpers, coupon rules, banner CTR math.
 */

const {
    calculateDiscount,
    validateAdvancedCouponRules,
    normalizePaymentCode
} = require('../../backend/src/controllers/couponController');

describe('Phase 4.4 coupon rules engine', () => {
    test('rejects coupon when payment method not allowed', () => {
        const coupon = {
            allowedPaymentMethods: ['bkash'],
            applicableCategories: [],
            discountType: 'flat',
            discountValue: 50
        };
        const result = validateAdvancedCouponRules(coupon, {
            paymentMethodCode: 'cod',
            cartItems: [{ category: 'Electronics', price: 500, quantity: 1 }],
            subtotal: 500
        });
        expect(result.ok).toBe(false);
    });

    test('enforces minimum category spend', () => {
        const coupon = {
            allowedPaymentMethods: [],
            applicableCategories: ['Electronics'],
            minCategorySpend: 1000,
            discountType: 'percentage',
            discountValue: 10
        };
        const result = validateAdvancedCouponRules(coupon, {
            paymentMethodCode: 'cod',
            cartItems: [
                { category: 'Electronics', price: 400, quantity: 1 },
                { category: 'Fashion', price: 800, quantity: 1 }
            ],
            subtotal: 1200
        });
        expect(result.ok).toBe(false);
    });

    test('calculates tiered discount with cap', () => {
        const coupon = {
            discountType: 'tiered',
            discountValue: 0,
            applicableCategories: [],
            ruleMetadata: {
                tiers: [
                    { minSpend: 1000, discountValue: 10, maxDiscount: 80 },
                    { minSpend: 5000, discountValue: 15, maxDiscount: 200 }
                ]
            }
        };
        const { discountAmount } = calculateDiscount(coupon, 2000, []);
        expect(discountAmount).toBe(80);
    });

    test('calculates buy-x-get-y on cheapest eligible units', () => {
        const coupon = {
            discountType: 'buy_x_get_y',
            discountValue: 0,
            applicableCategories: ['Snacks'],
            ruleMetadata: { buyQuantity: 2, getQuantity: 1, getDiscountPercent: 100 }
        };
        const items = [
            { category: 'Snacks', price: 100, quantity: 1 },
            { category: 'Snacks', price: 200, quantity: 2 }
        ];
        const { discountAmount } = calculateDiscount(coupon, 500, items);
        expect(discountAmount).toBe(100);
    });

    test('normalizePaymentCode strips separators', () => {
        expect(normalizePaymentCode('SSL Commerz')).toBe('sslcommerz');
    });
});

describe('Phase 4.4 banner CTR', () => {
    function computeCtr(clicks, impressions) {
        if (impressions <= 0) return 0;
        return Math.round((clicks / impressions) * 10000) / 100;
    }

    test('computes CTR percentage with two decimal precision', () => {
        expect(computeCtr(25, 100)).toBe(25);
        expect(computeCtr(1, 3)).toBe(33.33);
        expect(computeCtr(0, 0)).toBe(0);
    });
});
