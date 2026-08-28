require('dotenv').config();

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const { seedDemoProducts, DEMO_PRODUCTS } = require('../backend/src/services/productSeedService');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function main() {
  if (!MONGO_URI) {
    console.error('MONGO_URI (or MONGODB_URI) is not set. Add it to .env before seeding.');
    process.exit(1);
  }

  const replace = process.argv.includes('--replace');

  console.log('\n====================================');
  console.log('⏳ Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected.');

  console.log(`⏳ Upserting ${DEMO_PRODUCTS.length} demo products${replace ? ' (replace DEMO-* first)' : ''}...`);
  const result = await seedDemoProducts({ replace });
  console.log(`✅ Created: ${result.created}, updated: ${result.updated}, categories added: ${result.categoriesCreated}`);
  console.log(`   IDs: ${result.productIds.join(', ')}`);

  await mongoose.disconnect();
  console.log('🎉 Done. GET /api/products to verify.');
  console.log('====================================\n');
}

main().catch(async (error) => {
  console.error('\n❌ Demo product seed failed:', error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
