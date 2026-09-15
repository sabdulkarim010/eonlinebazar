/********************************************************************
 * announcementSettings — resolveFreeShippingThreshold (live Mongo path)
 ********************************************************************/

const { resolveFreeShippingThreshold } = require('../../backend/src/utils/announcementSettings');

describe('resolveFreeShippingThreshold', () => {
  test('null threshold falls through to freeShippingMinAmount (not Number(null) → 0)', () => {
    const doc = { freeShippingThreshold: null, freeShippingMinAmount: 1000 };
    expect(resolveFreeShippingThreshold(doc)).toBe(1000);
    expect(resolveFreeShippingThreshold(doc, 1000)).toBe(1000);
  });

  test('undefined threshold falls through to freeShippingMinAmount', () => {
    const doc = { freeShippingMinAmount: 1000 };
    expect(resolveFreeShippingThreshold(doc)).toBe(1000);
  });

  test('explicit zero threshold is honoured (free shipping on every order)', () => {
    const doc = { freeShippingThreshold: 0, freeShippingMinAmount: 1000 };
    expect(resolveFreeShippingThreshold(doc)).toBe(0);
  });

  test('configured threshold takes precedence when set', () => {
    const doc = { freeShippingThreshold: 1500, freeShippingMinAmount: 1000 };
    expect(resolveFreeShippingThreshold(doc)).toBe(1500);
  });
});
