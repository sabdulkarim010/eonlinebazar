/********************************************************************
 * orderMongoLookup — safe Mongo order ref resolution for PG cutover fallbacks
 ********************************************************************/

const mongoose = require('mongoose');
const { isStrictMongoObjectId, findOrderByRef } = require('../../backend/src/utils/orderMongoLookup');

describe('orderMongoLookup', () => {
  describe('isStrictMongoObjectId', () => {
    test('accepts canonical 24-char hex ObjectIds', () => {
      const id = new mongoose.Types.ObjectId().toString();
      expect(isStrictMongoObjectId(id)).toBe(true);
    });

    test('rejects business orderId strings like __test_ord_*', () => {
      expect(isStrictMongoObjectId('__test_ord_1234567890_abc')).toBe(false);
    });

    test('rejects empty and short strings', () => {
      expect(isStrictMongoObjectId('')).toBe(false);
      expect(isStrictMongoObjectId('507f1f77bcf86cd79943901')).toBe(false);
    });
  });

  describe('findOrderByRef', () => {
    const Order = require('../../backend/src/models/order');

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('queries by orderId when ref is not a strict ObjectId', async () => {
      const findOneSpy = jest.spyOn(Order, 'findOne').mockReturnValue({
        lean: () => Promise.resolve({ orderId: '__test_ord_x' })
      });
      const findByIdSpy = jest.spyOn(Order, 'findById');

      const result = await findOrderByRef('__test_ord_x', { lean: true });

      expect(result).toEqual({ orderId: '__test_ord_x' });
      expect(findOneSpy).toHaveBeenCalledWith({ orderId: '__test_ord_x' });
      expect(findByIdSpy).not.toHaveBeenCalled();
    });

    test('queries by _id when ref is a strict ObjectId', async () => {
      const id = new mongoose.Types.ObjectId().toString();
      const findByIdSpy = jest.spyOn(Order, 'findById').mockReturnValue({
        lean: () => Promise.resolve({ _id: id })
      });
      const findOneSpy = jest.spyOn(Order, 'findOne');

      const result = await findOrderByRef(id, { lean: true });

      expect(result).toEqual({ _id: id });
      expect(findByIdSpy).toHaveBeenCalledWith(id);
      expect(findOneSpy).not.toHaveBeenCalled();
    });
  });
});
