/********************************************************************
 * productAiAssistService — unit tests (Jest)
 ********************************************************************/

const {
    normalizeContentLanguage,
    normalizeNameLanguage,
    buildLanguageRules,
    normalizeAiProductPayload
} = require('../../backend/src/services/productAiAssistService');

describe('productAiAssistService', () => {
    test('normalizeContentLanguage defaults to english', () => {
        expect(normalizeContentLanguage('')).toBe('english');
        expect(normalizeContentLanguage('bangla')).toBe('bangla');
    });

    test('normalizeNameLanguage supports both', () => {
        expect(normalizeNameLanguage('both')).toBe('both');
        expect(normalizeNameLanguage('invalid')).toBe('english');
    });

    test('buildLanguageRules encodes Bangla + combined name pattern', () => {
        const rules = buildLanguageRules('bangla', 'both');
        expect(rules.contentRule).toMatch(/Bangla/);
        expect(rules.nameRule).toMatch(/English Name - বাংলা নাম/);
        expect(rules.seoRule).toMatch(/English and Bangla/);
    });

    test('normalizeAiProductPayload maps schema and truncates seoDescription', () => {
        const long = 'x'.repeat(200);
        const out = normalizeAiProductPayload({
            name: 'Test Product',
            shortDescription: 'Short',
            detailedDescription: 'Long body',
            keyHighlights: ['A', 'B'],
            suggestedCategory: 'Electronics',
            seoTitle: 'Title',
            seoDescription: long,
            seoKeywords: ['one', 'two']
        });

        expect(out.name).toBe('Test Product');
        expect(out.keyHighlights).toHaveLength(2);
        expect(out.seoKeywords).toBe('one, two');
        expect(out.seoDescription.length).toBeLessThanOrEqual(160);
    });

    test('normalizeAiProductPayload truncates seoTitle to 60 chars', () => {
        const out = normalizeAiProductPayload({
            seoTitle: 'x'.repeat(80),
            seoDescription: 'ok'
        });
        expect(out.seoTitle.length).toBeLessThanOrEqual(60);
    });
});
