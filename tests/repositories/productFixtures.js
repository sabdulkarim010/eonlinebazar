/********************************************************************
 * Shared product field defaults for repository integration tests.
 * Prisma uses camelCase; Mongo/dual-write payloads use snake_case.
 ********************************************************************/

'use strict';

function bilingualProductPrismaDefaults(overrides = {}) {
  return {
    nameBn: '',
    descriptionBn: '',
    detailedDescriptionBn: '',
    highlightsBn: [],
    ...overrides
  };
}

function sampleBilingualProductPrisma(overrides = {}) {
  return bilingualProductPrismaDefaults({
    nameBn: 'টেস্ট পণ্য',
    descriptionBn: 'সংক্ষিপ্ত বর্ণনা',
    detailedDescriptionBn: 'বিস্তারিত বর্ণনা',
    highlightsBn: ['হাইলাইট ১', 'হাইলাইট ২'],
    ...overrides
  });
}

function bilingualProductSnakeDefaults(overrides = {}) {
  return {
    name_bn: '',
    description_bn: '',
    detailedDescription_bn: '',
    highlights_bn: [],
    ...overrides
  };
}

function sampleBilingualProductSnake(overrides = {}) {
  return {
    name_bn: 'টেস্ট পণ্য',
    description_bn: 'সংক্ষিপ্ত বর্ণনা',
    detailedDescription_bn: 'বিস্তারিত বর্ণনা',
    highlights_bn: ['হাইলাইট ১'],
    ...overrides
  };
}

module.exports = {
  bilingualProductPrismaDefaults,
  sampleBilingualProductPrisma,
  bilingualProductSnakeDefaults,
  sampleBilingualProductSnake
};
