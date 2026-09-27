/********************************************************************
 * taxSettingsService — Phase 3 global tax engine tests
 ********************************************************************/

const {
    normalizeTaxSettingsFromDoc,
    computeOrderTaxSnapshot,
    getDefaultTaxSettings
} = require('../../backend/src/services/taxSettingsService');

describe('normalizeTaxSettingsFromDoc', () => {
    test('merges legacy vat fields with embedded taxSettings', () => {
        const tax = normalizeTaxSettingsFromDoc({
            vatEnabled: true,
            vatPercentage: 5,
            vatInclusive: false,
            taxRegistrationNumber: 'BIN-1',
            taxSettings: {
                categoryTaxRules: [{ categoryId: 'Electronics', vatRate: 0, ruleName: 'Exempt' }]
            }
        });

        expect(tax.enabled).toBe(true);
        expect(tax.defaultVatRate).toBe(5);
        expect(tax.pricesIncludeTax).toBe(false);
        expect(tax.taxRegistrationNumber).toBe('BIN-1');
        expect(tax.categoryTaxRules).toHaveLength(1);
    });
});

describe('computeOrderTaxSnapshot', () => {
    test('exclusive pricing adds tax on net merchandise', () => {
        const snap = computeOrderTaxSnapshot({
            taxSettings: {
                enabled: true,
                defaultVatRate: 5,
                pricesIncludeTax: false,
                categoryTaxRules: []
            },
            subTotal: 1200,
            discountAmount: 0,
            lineItems: [{ price: 1200, quantity: 1, category: 'General' }]
        });

        expect(snap.priceTaxMode).toBe('EXCLUSIVE');
        expect(snap.taxableAmount).toBe(1200);
        expect(snap.taxAmount).toBe(60);
        expect(snap.vatRate).toBe(5);
    });

    test('category rule overrides default rate', () => {
        const snap = computeOrderTaxSnapshot({
            taxSettings: {
                enabled: true,
                defaultVatRate: 15,
                pricesIncludeTax: false,
                categoryTaxRules: [{ categoryId: 'Books', vatRate: 0, ruleName: 'Zero' }]
            },
            subTotal: 1000,
            discountAmount: 0,
            lineItems: [{ price: 1000, quantity: 1, category: 'Books' }]
        });

        expect(snap.taxAmount).toBe(0);
        expect(snap.vatRate).toBe(0);
    });
});

describe('getDefaultTaxSettings', () => {
    test('matches normalize output for empty document', () => {
        expect(normalizeTaxSettingsFromDoc({})).toEqual(getDefaultTaxSettings());
    });
});
