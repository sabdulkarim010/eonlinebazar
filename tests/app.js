/********************************************************************
 * Test-only Express app — API routes without server listen, validateEnv,
 * or security middleware (helmet/cors packages are optional in dev).
 ********************************************************************/

require('dotenv').config();

const express = require('express');
const requestIp = require('request-ip');

const productRoutes = require('../backend/src/routes/productRoutes');
const orderRoutes = require('../backend/src/routes/orderRoutes');
const adminRoutes = require('../backend/src/routes/adminRoutes');
const userRoutes = require('../backend/src/routes/userRoutes');
const authRoutes = require('../backend/src/routes/authRoutes');
const cartRoutes = require('../backend/src/routes/cartRoutes');
const wishlistRoutes = require('../backend/src/routes/wishlistRoutes');
const categoryRoutes = require('../backend/src/routes/categoryRoutes');
const brandRoutes = require('../backend/src/routes/brandRoutes');
const attributeRoutes = require('../backend/src/routes/attributeRoutes');
const reviewRoutes = require('../backend/src/routes/reviewRoutes');
const financeRoutes = require('../backend/src/routes/financeRoutes');
const couponRoutes = require('../backend/src/routes/couponRoutes');
const storeRoutes = require('../backend/src/routes/storeRoutes');
const paymentRoutes = require('../backend/src/routes/paymentRoutes');
const contactRoutes = require('../backend/src/routes/contactRoutes');
const inquiryRoutes = require('../backend/src/routes/inquiryRoutes');
const noteRoutes = require('../backend/src/routes/noteRoutes');
const storeSettingsMiddleware = require('../backend/src/middlewares/storeSettingsMiddleware');
const { getOrders, updateOrderStatus } = require('../backend/src/controllers/orderController');
const { verifyAdmin } = require('../backend/src/middlewares/authMiddleware');
const { checkPermission } = require('../backend/src/middlewares/rbac');

const app = express();

app.use(express.json());
app.use(requestIp.mw());
app.use(storeSettingsMiddleware);

app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/customer', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/attributes', attributeRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/store', storeRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/inquiries', inquiryRoutes);
app.use('/api/notes', noteRoutes);

// Legacy admin API aliases used by the admin panel and smoke tests
app.use('/admin/api', adminRoutes);
app.get('/admin/api/orders', verifyAdmin, checkPermission('manage_orders'), getOrders);
app.patch('/admin/api/orders/:id/status', verifyAdmin, checkPermission('manage_orders'), updateOrderStatus);

app.use((req, res) => {
    if (req.originalUrl.startsWith('/api/') || req.originalUrl.startsWith('/admin/api/')) {
        return res.status(404).json({ success: false, message: 'API endpoint not found!' });
    }
    return res.status(404).json({ success: false, message: 'Not found' });
});

module.exports = app;
