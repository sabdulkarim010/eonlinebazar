require ('dotenv').config();

const mongoose = require('mongoose');
const fs = require('fs');


const MONGO_URI =process.env.MONGO_URI;


// প্রোডাক্ট স্কিমা
const productSchema = new mongoose.Schema({
    productId: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    category: { type: String, default: 'General' },
    description: { type: String, default: 'No description' },
    icon: { type: String, default: '📦' },
    image: { type: String, default: '' },
    products: { type: String, default: '' },
    stock: { type: Number, default: 0 }
});

// আগে থেকে মডেল থাকলে সেটা নেবে, না থাকলে নতুন বানাবে
const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

async function runSeed() {
    try {
        console.log("\n====================================");
        console.log("⏳ 1. Connecting to MongoDB...");
        await mongoose.connect(MONGO_URI);
        console.log("✅ Database connected successfully!");

        console.log("\n⏳ 2. Clearing existing data...");
        await Product.deleteMany({});
        console.log("✅ Existing data cleared successfully!");

        console.log("\n⏳ 3. Reading products.json file...");
        const rawData = fs.readFileSync('./products.json', 'utf-8');
        const productsData = JSON.parse(rawData);
        console.log(`✅ File read successfully. Total products found: ${productsData.length}`);

        console.log("\n⏳ 4. Uploading new data to MongoDB...");
        await Product.insertMany(productsData);
        console.log("✅ New data uploaded successfully!");

        // কাজ শেষে কানেকশন বন্ধ
        mongoose.connection.close();
        console.log("\n🎉 Seeding completed! Refresh MongoDB Compass to see the results.");
        console.log("====================================\n");

    } catch (error) {
        console.error("\n❌ Error during seeding:", error);
        mongoose.connection.close();
    }
}

runSeed();






