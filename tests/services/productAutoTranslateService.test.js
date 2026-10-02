const {
  enrichMissingBanglaFields,
  isEmptyBn,
  buildTranslatePrompt
} = require('../../backend/src/services/productAutoTranslateService');

describe('productAutoTranslateService', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  });

  test('isEmptyBn treats blank and empty arrays', () => {
    expect(isEmptyBn('')).toBe(true);
    expect(isEmptyBn('  ')).toBe(true);
    expect(isEmptyBn([])).toBe(true);
    expect(isEmptyBn('hello')).toBe(false);
    expect(isEmptyBn(['a'])).toBe(false);
  });

  test('enrichMissingBanglaFields no-op without API key', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const payload = { name: 'Shirt', description: 'Soft cotton' };
    await enrichMissingBanglaFields(payload);
    expect(payload.name_bn).toBeUndefined();
  });

  test('enrichMissingBanglaFields skips when BN already set', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const fetchImpl = jest.fn();
    const payload = {
      name: 'Shirt',
      name_bn: 'শার্ট',
      description: 'Soft',
      description_bn: 'নরম'
    };
    await enrichMissingBanglaFields(payload, null, { fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('enrichMissingBanglaFields fills empty BN from AI response', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{
          type: 'text',
          text: JSON.stringify({
            name_bn: 'শার্ট',
            description_bn: 'নরম কটন',
            detailedDescription_bn: 'বিস্তারিত',
            highlights_bn: ['হাইলাইট']
          })
        }]
      })
    });

    const payload = {
      name: 'Shirt',
      description: 'Soft cotton',
      detailedDescription: 'Long text',
      highlights: ['Breathable']
    };

    await enrichMissingBanglaFields(payload, null, { fetchImpl });
    expect(payload.name_bn).toBe('শার্ট');
    expect(payload.description_bn).toBe('নরম কটন');
    expect(payload.highlights_bn).toEqual(['হাইলাইট']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('buildTranslatePrompt includes English source fields', () => {
    const prompt = buildTranslatePrompt({
      name: 'A',
      description: 'B',
      detailedDescription: 'C',
      highlights: ['D']
    });
    expect(prompt).toMatch(/name: A/);
    expect(prompt).toMatch(/highlights/);
  });
});
