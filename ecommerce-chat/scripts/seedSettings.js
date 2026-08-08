/**
 * Seed StoreConfig + AIKnowledgeBase without wiping agents.
 * Usage: npm run seed:settings
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const {
  seedStoreConfig,
  seedKnowledgeBase,
} = require('../seed');

const MONGO_URI =
  process.env.MONGO_URI || 'mongodb://localhost:27017/ecommerce_chat';

async function main() {
  try {
    console.log('🌱 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected:', MONGO_URI);

    console.log('🏪 Upserting StoreConfig...');
    await seedStoreConfig();

    console.log('📚 Seeding AIKnowledgeBase...');
    const entries = await seedKnowledgeBase();
    console.log(`   Inserted ${entries.length} knowledge entries`);

    console.log('\n✅ Settings seed completed!\n');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Settings seed failed:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

main();
