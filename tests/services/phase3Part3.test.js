/********************************************************************
 * Phase 3 Part 3 — RFM, multi-stage abandoned cart, offline POS sync.
 ********************************************************************/

jest.mock('../../backend/src/services/mailer', () => ({
    sendAbandonedCartEmail: jest.fn().mockResolvedValue({ delivered: true })
}));

jest.mock('../../backend/src/services/smsService', () => ({
    sendSms: jest.fn().mockResolvedValue({ delivered: true }),
    isCustomerSmsEnabled: jest.fn().mockResolvedValue(true)
}));

jest.mock('../../backend/src/services/whatsappService', () => ({
    sendWhatsAppMessage: jest.fn().mockResolvedValue({ success: true })
}));

const request = require('supertest');
const Cart = require('../../backend/src/models/cart');
const Coupon = require('../../backend/src/models/coupon');
const Order = require('../../backend/src/models/order');
const Product = require('../../backend/src/models/product');
const User = require('../../backend/src/models/user');
const {
    resolveRfmSegment,
    recalculateAllCustomerRfm,
    getRfmSegmentDistribution
} = require('../../backend/src/services/rfmSegmentationService');
const {
    resolveNextStage,
    advanceCartRecoveryStage,
    STAGE_THRESHOLDS_MS
} = require('../../backend/src/services/abandonedCartService');
const { getApp, createTestAdmin, createTestUser } = require('../setup');

describe('Phase 3 Part 3 — RFM, recovery stages, offline sync', () => {
    const app = getApp();

    async function adminToken(overrides = {}) {
        const { username, password } = await createTestAdmin(overrides);
        const res = await request(app)
            .post('/admin/api/login')
            .send({ username, password });
        expect(res.status).toBe(200);
        return res.body.token;
    }

    function auth(token) {
        return { Authorization: `Bearer ${token}` };
    }

    test('RFM segmentation assigns segments and distribution counts', async () => {
        expect(resolveRfmSegment({ recencyDays: 10, frequency: 6, monetary: 15000 })).toBe('CHAMPION');
        expect(resolveRfmSegment({ recencyDays: 10, frequency: 1, monetary: 500 })).toBe('NEW');
        expect(resolveRfmSegment({ recencyDays: 90, frequency: 3, monetary: 4000 })).toBe('AT_RISK');
        expect(resolveRfmSegment({ recencyDays: 150, frequency: 4, monetary: 9000 })).toBe('LOST');

        const { user } = await createTestUser();
        const product = await Product.create({
            productId: `RFM-${Date.now()}`,
            name: 'RFM Product',
            price: 1000,
            stock: 10,
            stockQuantity: 10
        });

        for (let i = 0; i < 5; i += 1) {
            await Order.create({
                orderId: `RFM-ORD-${Date.now()}-${i}`,
                user: user._id,
                customerName: 'RFM Tester',
                customerPhone: user.mobile,
                customerAddress: 'Dhaka',
                subTotal: 1000,
                grandTotal: 1000,
                items: [{ productId: product._id, name: product.name, price: 1000, quantity: 1 }],
                status: 'Delivered',
                isDelivered: true,
                paymentMethod: 'COD'
            });
        }

        const recalc = await recalculateAllCustomerRfm({ monetaryHigh: 5000 });
        expect(recalc.updated).toBeGreaterThanOrEqual(1);
        expect(recalc.segments.CHAMPION).toBeGreaterThanOrEqual(1);

        const refreshed = await User.findById(user._id).lean();
        expect(refreshed.rfmSegment).toBe('CHAMPION');

        const token = await adminToken({ permissions: ['manage_customers'] });
        const distRes = await request(app)
            .get('/api/admin/crm/rfm-segments?monetaryHigh=5000')
            .set(auth(token));
        expect(distRes.status).toBe(200);
        expect(distRes.body.data.segments.CHAMPION).toBeGreaterThanOrEqual(1);

        const liveDistribution = await getRfmSegmentDistribution(5000);
        expect(liveDistribution.totalCustomers).toBeGreaterThanOrEqual(1);
    });

    test('multi-stage abandoned cart progresses stage 1 -> 2 coupon -> 3', async () => {
        const { user } = await createTestUser();
        const product = await Product.create({
            productId: `REC-${Date.now()}`,
            name: 'Recovery Product',
            price: 800,
            stock: 10,
            stockQuantity: 10
        });

        const cart = await Cart.create({
            userId: user._id,
            items: [{ productId: product._id, name: product.name, price: 800, quantity: 1 }],
            recoveryStage: 0
        });

        const stage1At = new Date(Date.now() - STAGE_THRESHOLDS_MS[1] - 5 * 60 * 1000);
        await Cart.updateOne({ _id: cart._id }, { $set: { lastActivityAt: stage1At } });

        const hydrated1 = await Cart.findById(cart._id).populate('userId');
        expect(resolveNextStage(hydrated1)).toBe(1);
        await advanceCartRecoveryStage(hydrated1, hydrated1.userId, 1);

        const afterStage1 = await Cart.findById(cart._id).lean();
        expect(afterStage1.recoveryStage).toBe(1);
        expect(afterStage1.recoveryStage1At).toBeTruthy();

        const stage2At = new Date(Date.now() - STAGE_THRESHOLDS_MS[2] - 5 * 60 * 1000);
        await Cart.updateOne(
            { _id: cart._id },
            { $set: { lastActivityAt: stage2At, recoveryStage: 1 } }
        );

        const hydrated2 = await Cart.findById(cart._id).populate('userId');
        expect(resolveNextStage(hydrated2)).toBe(2);
        await advanceCartRecoveryStage(hydrated2, hydrated2.userId, 2);

        const afterStage2 = await Cart.findById(cart._id).lean();
        expect(afterStage2.recoveryStage).toBe(2);
        expect(afterStage2.recoveryCouponCode).toMatch(/^ACART5-/);

        const coupon = await Coupon.findOne({ code: afterStage2.recoveryCouponCode }).lean();
        expect(coupon).toBeTruthy();
        expect(coupon.discountValue).toBe(5);

        const stage3At = new Date(Date.now() - STAGE_THRESHOLDS_MS[3] - 5 * 60 * 1000);
        await Cart.updateOne(
            { _id: cart._id },
            { $set: { lastActivityAt: stage3At, recoveryStage: 2 } }
        );

        const hydrated3 = await Cart.findById(cart._id).populate('userId');
        expect(resolveNextStage(hydrated3)).toBe(3);
        await advanceCartRecoveryStage(hydrated3, hydrated3.userId, 3);

        const afterStage3 = await Cart.findById(cart._id).lean();
        expect(afterStage3.recoveryStage).toBe(3);
        expect(afterStage3.recoveryStage3At).toBeTruthy();
    });

    test('POS offline batch sync is idempotent on offlineOrderId', async () => {
        const token = await adminToken({ permissions: ['manage_orders', 'access_pos'] });
        const product = await Product.create({
            productId: `OFF-${Date.now()}`,
            name: 'Offline Product',
            price: 450,
            stock: 20,
            stockQuantity: 20
        });

        const offlineOrderId = `OFFLINE-${Date.now()}`;
        const payload = {
            orders: [{
                offlineOrderId,
                totalAmount: 450,
                customer: {
                    name: 'Offline Buyer',
                    phone: '01710001111',
                    address: 'Counter'
                },
                items: [{ productId: product._id, quantity: 1 }],
                payments: [{ method: 'CASH', amount: 450 }]
            }]
        };

        const first = await request(app)
            .post('/api/admin/pos/orders/batch-sync')
            .set(auth(token))
            .send(payload);

        expect(first.status).toBe(200);
        expect(first.body.data.syncedCount).toBe(1);
        expect(first.body.data.skippedCount).toBe(0);

        const saved = await Order.findOne({ offlineOrderId }).lean();
        expect(saved).toBeTruthy();
        expect(saved.orderSource).toBe('offline_pos');

        const second = await request(app)
            .post('/api/admin/pos/orders/batch-sync')
            .set(auth(token))
            .send(payload);

        expect(second.status).toBe(200);
        expect(second.body.data.syncedCount).toBe(0);
        expect(second.body.data.skippedCount).toBe(1);
    });
});
