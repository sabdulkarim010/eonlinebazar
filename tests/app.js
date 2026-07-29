/********************************************************************
 * Test-only Express app — API routes without server listen, validateEnv,
 * or security middleware (helmet/cors packages are optional in dev).
 ********************************************************************/

require('dotenv').config();

const express = require('express');
const requestIp = require('request-ip');

const productRoutes = require('../routes/productRoutes');
const orderRoutes = require('../routes/orderRoutes');
const adminRoutes = require('../routes/adminRoutes');
const userRoutes = require('../routes/userRoutes');
const authRoutes = require('../routes/authRoutes');
const cartRoutes = require('../routes/cartRoutes');
const wishlistRoutes = require('../routes/wishlistRoutes');
const categoryRoutes = require('../routes/categoryRoutes');
const brandRoutes = require('../routes/brandRoutes');
const attributeRoutes = require('../routes/attributeRoutes');
const reviewRoutes = require('../routes/reviewRoutes');
const financeRoutes = require('../routes/financeRoutes');
const couponRoutes = require('../routes/couponRoutes');
const storeRoutes = require('../routes/storeRoutes');
const paymentRoutes = require('../routes/paymentRoutes');
const contactRoutes = require('../routes/contactRoutes');
const inquiryRoutes = require('../routes/inquiryRoutes');
const storeSettingsMiddleware = require('../middlewares/storeSettingsMiddleware');
const { getOrders, updateOrderStatus } = require('../controllers/orderController');
const { verifyAdmin } = require('../middlewares/authMiddleware');
const { checkPermission } = require('../middlewares/rbac');

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
