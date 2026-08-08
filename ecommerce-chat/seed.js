require('dotenv').config();

const mongoose = require('mongoose');
const Agent = require('./models/Agent.model');
const {
  AIKnowledgeBase,
  StoreConfig,
} = require('./models/AIKnowledgeBase.model');
const {
  DEFAULT_KNOWLEDGE_ENTRIES,
  DEFAULT_STORE_CONFIG,
} = require('./data/defaultKnowledge');

const MONGO_URI =
  process.env.MONGO_URI || 'mongodb://localhost:27017/ecommerce_chat';

const storeConfigSeed = { ...DEFAULT_STORE_CONFIG };
const knowledgeSeed = DEFAULT_KNOWLEDGE_ENTRIES.map((e) => ({ ...e }));

/**
 * Seed / upsert StoreConfig singleton with EonlineBazar AI prompt data.
 */
async function seedStoreConfig() {
  const config = await StoreConfig.findOneAndUpdate({}, storeConfigSeed, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
    runValidators: true,
  });
  return config;
}

/**
 * Seed AIKnowledgeBase with default FAQ training data.
 * Clears existing KB entries, then inserts the EonlineBazar defaults.
 */
async function seedKnowledgeBase() {
  await AIKnowledgeBase.deleteMany({});
  const entries = await AIKnowledgeBase.insertMany(knowledgeSeed);
  return entries;
}

/**
 * Full wipe + seed (agents + config + knowledge).
 */
async function seed() {
  console.log('🌱 Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected:', MONGO_URI);

  console.log('🧹 Clearing collections...');
  await Promise.all([
    Agent.deleteMany({}),
    AIKnowledgeBase.deleteMany({}),
    StoreConfig.deleteMany({}),
  ]);

  console.log('🏪 Seeding StoreConfig...');
  await seedStoreConfig();

  console.log('📚 Seeding AIKnowledgeBase...');
  await seedKnowledgeBase();

  console.log('👤 Creating SUPER_ADMIN agent...');
  await Agent.create({
    name: 'Super Admin',
    email: process.env.SEED_ADMIN_EMAIL || 'admin@yourshop.com',
    password: process.env.SEED_ADMIN_PASSWORD || 'Admin@1234',
    role: 'SUPER_ADMIN',
    is_online: false,
    max_concurrent_chats: 10,
  });

  console.log('\n═══════════════════════════════════════════════════');
  console.log('✅ Seed completed successfully!');
  console.log('═══════════════════════════════════════════════════');
  console.log('Admin login:');
  console.log(
    `  Email:    ${process.env.SEED_ADMIN_EMAIL || 'admin@yourshop.com'}`
  );
  console.log(
    `  Password: ${process.env.SEED_ADMIN_PASSWORD || 'Admin@1234'}`
  );
  console.log('');
  console.log('⚠️  IMPORTANT: Change this password after first login!');
  console.log('═══════════════════════════════════════════════════\n');

  await mongoose.disconnect();
  process.exit(0);
}

if (require.main === module) {
  seed().catch(async (err) => {
    console.error('❌ Seed failed:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
}

module.exports = {
  storeConfigSeed,
  knowledgeSeed,
  seedStoreConfig,
  seedKnowledgeBase,
  seed,
};
