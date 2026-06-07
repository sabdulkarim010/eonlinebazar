require('dotenv').config(); 
const express = require('express');
const path = require('path');
const connectDB = require('./config/db');

// ১. রুট ফাইলসমূহ ইমপোর্ট করা (এগুলো আগের মতোই থাকবে)
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes'); 
const adminRoutes = require('./routes/adminRoutes'); 
const userRoutes = require('./routes/userRoutes'); 

const app = express();
const PORT = process.env.PORT || 3000;

// ২. ডাটাবেজ কানেক্ট করা
connectDB();

// ৩. প্রয়োজনীয় মিডলওয়্যারসমূহ
app.use(express.json()); 

// 🌟 ফিক্স: '../client' পরিবর্তন করে শুধু 'client' করা হয়েছে, কারণ server.js এখন মেইন ফোল্ডারে
app.use(express.static(path.join(__dirname, 'client')));

// ৪. এপিআই রুটসমূহ যুক্ত করা
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes); 
app.use('/api/admin', adminRoutes);  
app.use('/api/users', userRoutes); 

// ৫. ফ্রন্টএন্ড হোমপেজ রুট
// 🌟 ফিক্স: এখানেও '../client' পরিবর্তন করে শুধু 'client' করা হয়েছে
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'index.html'));
});

// ৬. সার্ভার স্টার্ট
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});












