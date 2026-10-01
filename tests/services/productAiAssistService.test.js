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

    test('normalizeNameLanguage supports legacy values', () => {
        expect(normalizeNameLanguage('both')).toBe('both');
        expect(normalizeNameLanguage('invalid')).toBe('english');
    });

    test('buildLanguageRules requires English primary and separate Bangla fields', () => {
        const rules = buildLanguageRules('english', 'english');
        expect(rules.contentRule).toMatch(/English only/);
        expect(rules.nameRule).toMatch(/English only/);
        expect(rules.bnRule).toMatch(/name_bn/);
        expect(rules.seoRule).toMatch(/English only/);
    });

    test('normalizeAiProductPayload maps bilingual schema and truncates seoDescription', () => {
        const long = 'x'.repeat(200);
        const out = normalizeAiProductPayload({
            name: 'Girls Blue Ikat Dress',
            name_bn: 'নীল ইকাত পোশাক',
            shortDescription: 'Short',
            description_bn: 'সংক্ষিপ্ত',
            detailedDescription: 'Long body',
            detailedDescription_bn: 'বিস্তারিত',
            keyHighlights: ['A', 'B'],
            keyHighlights_bn: ['ক', 'খ'],
            suggestedCategory: 'Electronics',
            seoTitle: 'Title',
            seoDescription: long,
            seoKeywords: ['one', 'two']
        });

        expect(out.name).toBe('Girls Blue Ikat Dress');
        expect(out.name_bn).toBe('নীল ইকাত পোশাক');
        expect(out.keyHighlights).toHaveLength(2);
        expect(out.keyHighlights_bn).toHaveLength(2);
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
