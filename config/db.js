const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        // আপনার .env ফাইলে থাকা MONGO_URI দিয়ে কানেক্ট হবে
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB Connected Successfully to Atlas! 🚀: ${conn.connection.host}`);
    } catch (err) {
        console.error(`Database Connection Error: ${err.message}`);
        process.exit(1); // কানেকশন ফেল করলে সার্ভার বন্ধ করে দেবে যেন ক্র্যাশ না হয়
    }
};

module.exports = connectDB;



