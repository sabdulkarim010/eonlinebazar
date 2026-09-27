/********************************************************************
 * taxVatService — ledger snapshot parity tests
 ********************************************************************/

jest.mock('../../backend/src/models/order', () => ({
    find: jest.fn()
}));

const { resolveTaxLine } = require('../../backend/src/services/taxVatService');

const taxSettings = {
    enabled: true,
    defaultVatRate: 15,
    pricesIncludeTax: false,
    taxRegistrationNumber: 'BIN-DEFAULT',
    categoryTaxRules: []
};

describe('resolveTaxLine snapshot parity', () => {

    test('uses order snapshot fields when present', () => {
        const line = resolveTaxLine({
            subTotal: 2000,
            discountAmount: 200,
            taxableAmount: 1500,
            taxAmount: 75,
            vatRate: 5,
            vatEnabled: true,
            priceTaxMode: 'EXCLUSIVE'
        }, taxSettings);

        expect(line.taxableAmount).toBe(1500);
        expect(line.taxCollected).toBe(75);
        expect(line.vatRate).toBe(5);
    });

    test('falls back to current default rate for legacy orders without snapshots', () => {
        const line = resolveTaxLine({
            subTotal: 1000,
            discountAmount: 0,
            vatEnabled: true
        }, taxSettings);

        expect(line.taxableAmount).toBe(1000);
        expect(line.taxCollected).toBe(150);
        expect(line.vatRate).toBe(15);
    });
});
