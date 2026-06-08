require('dotenv').config(); // 'require' সবসময় ছোট হাতের অক্ষরে লিখতে হয়
const express = require('express');
const path = require('path');
const connectDB = require('./config/db');

// ১. রুট ফাইলসমূহ ইমপোর্ট করা
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

// স্ট্যাটিক ফাইলগুলো সার্ভ করার জন্য 'client' ফোল্ডার
app.use(express.static(path.join(__dirname, 'client')));

// ৪. এপিআই রুটসমূহ যুক্ত করা
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes); 
app.use('/api/admin', adminRoutes);
app.use('/api/customer', userRoutes);   

// =================================================================
// ৫. ফ্রন্টএন্ড পেজগুলোর রাউট (এখানেই .html হাইড করার লজিক দেওয়া হলো)
// =================================================================

// হোমপেজ রুট
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'index.html'));
});

// অ্যাডমিন ড্যাশবোর্ড রুট (.html ছাড়া)
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'admin.html'));
});

// অ্যাডমিন লগইন রুট (.html ছাড়া)
app.get('/admin-login', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'admin-login.html'));
});

// Order track রুট (.html ছাড়া)
app.get('/order-track', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'order-track.html'));
});

// এখানে নতুন করে এই লাইনটি যোগ
app.get('/forgot-password', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'forgot-password.html'));
});

// এখানে নতুন করে এই লাইনটি যোগ
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'login.html'));
});

// এখানে নতুন করে এই লাইনটি যোগ
app.get('/index', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'index.html'));
});

// এখানে নতুন করে এই লাইনটি যোগ
app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'profile.html'));
});


// ভুল করে কেউ /index.html লিখলে অটোমেটিক / এ পাঠিয়ে দেবে
app.get('/index.html', (req, res) => {
    res.redirect('/');
});

// ভুল করে কেউ /profile.html লিখলে অটোমেটিক /profile এ পাঠিয়ে দেবে
app.get('/profile.html', (req, res) => {
    res.redirect('/profile');
});

// Cart রুটটি এখানে যোগ করুন
app.get('/cart', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'cart.html'));
});

// Checkout রুটটি এখানে যোগ করুন
app.get('/checkout', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'checkout.html'));
});

// Payment রুটটি এখানে যোগ করুন
app.get('/payment', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'payment.html'));
});

// Footer রুটটি এখানে যোগ করুন
app.get('/footer', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'footer.html'));
});

// About রুটটি এখানে যোগ করুন
app.get('/about', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'about.html'));
});

// Contact রুটটি এখানে যোগ করুন
app.get('/contact', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'contact.html'));
});

// register রুটটি এখানে যোগ করুন
app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'register.html'));
});

// Forgot-Password রুটটি এখানে যোগ করুন
app.get('/forgot-password', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'forgot-password.html'));
});


// =================================================================

// ৬. সার্ভার স্টার্ট
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});






