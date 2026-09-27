/********************************************************************
 * userRecordResolver — unit tests
 ********************************************************************/

const {
  isMongoObjectIdString,
  UUID_PATTERN
} = require('../../backend/src/utils/userRecordResolver');

describe('userRecordResolver', () => {
  test('isMongoObjectIdString rejects UUID-shaped strings', () => {
    const uuid = '41bae04b-e68a-42d7-940e-85d74bae0497';
    expect(UUID_PATTERN.test(uuid)).toBe(true);
    expect(isMongoObjectIdString(uuid)).toBe(false);
  });

  test('isMongoObjectIdString accepts canonical 24-hex ObjectId', () => {
    const oid = '507f1f77bcf86cd799439011';
    expect(isMongoObjectIdString(oid)).toBe(true);
  });
});
