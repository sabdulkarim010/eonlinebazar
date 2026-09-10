/********************************************************************
 * Phase 2 — ERP Core integration tests.
 * Covers supplier + warehouse CRUD, the purchase order workflow
 * (create → receive → stock increase), product slug generation, and the
 * new Order status enum plus its migration mapping.
 ********************************************************************/

const request = require('supertest');
const Product = require('../backend/src/models/product');
const Order = require('../backend/src/models/order');
const Supplier = require('../backend/src/models/supplier');
const Warehouse = require('../backend/src/models/warehouse');
const PurchaseOrder = require('../backend/src/models/purchaseOrder');
const SecurityLog = require('../backend/src/models/securityLog');
const { seedDefaultWarehouse } = require('../backend/src/services/warehouseService');
const { resolveStatus } = require('../scripts/migrateOrderStatus');
const { getApp, createTestAdmin } = require('./setup');

describe('Phase 2 — ERP Core', () => {
    const app = getApp();

    async function adminToken() {
        const { username, password } = await createTestAdmin();
        const res = await request(app)
            .post('/admin/api/login')
            .send({ username, password });
        expect(res.status).toBe(200);
        return res.body.token;
    }

    function auth(token) {
        return { Authorization: `Bearer ${token}` };
    }

    async function createSupplier(token, overrides = {}) {
        const res = await request(app)
            .post('/api/admin/suppliers')
            .set(auth(token))
            .send({ name: 'Acme Traders', phone: '01700000000', ...overrides });
        expect(res.status).toBe(201);
        return res.body.data;
    }

    async function createProduct(overrides = {}) {
        return Product.create({
            productId: `ERP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: 'ERP Test Product',
            price: 500,
            stock: 10,
            stockQuantity: 10,
            ...overrides
        });
    }

    /* ---------------------------------------------------------------- */

    describe('Suppliers', () => {
        test('rejects unauthenticated access', async () => {
            const res = await request(app).get('/api/admin/suppliers');
            expect(res.status).toBe(401);
        });

        test('creates, lists, fetches, updates, and deletes a supplier', async () => {
            const token = await adminToken();

            const created = await createSupplier(token, { name: 'Dhaka Wholesale' });
            expect(created.name).toBe('Dhaka Wholesale');
            expect(created.status).toBe('active');

            const list = await request(app).get('/api/admin/suppliers').set(auth(token));
            expect(list.status).toBe(200);
            expect(list.body.data).toHaveLength(1);
            expect(list.body.pagination.total).toBe(1);

            const single = await request(app)
                .get(`/api/admin/suppliers/${created._id}`)
                .set(auth(token));
            expect(single.status).toBe(200);
            expect(single.body.data.purchaseOrders).toEqual([]);

            const updated = await request(app)
                .put(`/api/admin/suppliers/${created._id}`)
                .set(auth(token))
                .send({ status: 'inactive', contactPerson: 'Rahim' });
            expect(updated.status).toBe(200);
            expect(updated.body.data.status).toBe('inactive');
            expect(updated.body.data.contactPerson).toBe('Rahim');

            const removed = await request(app)
                .delete(`/api/admin/suppliers/${created._id}`)
                .set(auth(token));
            expect(removed.status).toBe(200);
            expect(await Supplier.countDocuments()).toBe(0);
        });

        test('requires a name', async () => {
            const token = await adminToken();
            const res = await request(app)
                .post('/api/admin/suppliers')
                .set(auth(token))
                .send({ phone: '01711111111' });
            expect(res.status).toBe(400);
        });

        test('refuses deletion while an open purchase order references it', async () => {
            const token = await adminToken();
            const supplier = await createSupplier(token);
            const product = await createProduct();

            await request(app)
                .post('/api/admin/purchase-orders')
                .set(auth(token))
                .send({
                    supplierId: supplier._id,
                    items: [{ productId: product._id, qty: 5, unitCost: 100 }]
                });

            const res = await request(app)
                .delete(`/api/admin/suppliers/${supplier._id}`)
                .set(auth(token));

            expect(res.status).toBe(409);
            expect(await Supplier.countDocuments()).toBe(1);
        });

        test('unlinks products from a deleted supplier', async () => {
            const token = await adminToken();
            const supplier = await createSupplier(token);
            const product = await createProduct({ supplierId: supplier._id });

            const res = await request(app)
                .delete(`/api/admin/suppliers/${supplier._id}`)
                .set(auth(token));
            expect(res.status).toBe(200);

            const reloaded = await Product.findById(product._id).lean();
            expect(reloaded.supplierId).toBeNull();
        });
    });

    /* ---------------------------------------------------------------- */

    describe('Warehouses', () => {
        test('seeds exactly one default warehouse and is idempotent', async () => {
            await seedDefaultWarehouse();
            await seedDefaultWarehouse();

            const all = await Warehouse.find().lean();
            expect(all).toHaveLength(1);
            expect(all[0].isDefault).toBe(true);
        });

        test('promotes the only default and demotes the previous one', async () => {
            const token = await adminToken();
            await seedDefaultWarehouse();

            const second = await request(app)
                .post('/api/admin/warehouses')
                .set(auth(token))
                .send({ name: 'Chattogram Hub', location: 'Chattogram', isDefault: true });
            expect(second.status).toBe(201);
            expect(second.body.data.isDefault).toBe(true);

            const defaults = await Warehouse.find({ isDefault: true }).lean();
            expect(defaults).toHaveLength(1);
            expect(String(defaults[0]._id)).toBe(String(second.body.data._id));
        });

        test('protects the default warehouse from deletion', async () => {
            const token = await adminToken();
            const seeded = await seedDefaultWarehouse();

            const res = await request(app)
                .delete(`/api/admin/warehouses/${seeded._id}`)
                .set(auth(token));

            expect(res.status).toBe(409);
            expect(await Warehouse.countDocuments()).toBe(1);
        });

        test('updates a non-default warehouse and deletes it', async () => {
            const token = await adminToken();
            await seedDefaultWarehouse();

            const created = await request(app)
                .post('/api/admin/warehouses')
                .set(auth(token))
                .send({ name: 'Sylhet Store', location: 'Sylhet' });
            expect(created.body.data.isDefault).toBe(false);

            const updated = await request(app)
                .put(`/api/admin/warehouses/${created.body.data._id}`)
                .set(auth(token))
                .send({ managerName: 'Karim', phone: '01811111111' });
            expect(updated.status).toBe(200);
            expect(updated.body.data.managerName).toBe('Karim');

            const removed = await request(app)
                .delete(`/api/admin/warehouses/${created.body.data._id}`)
                .set(auth(token));
            expect(removed.status).toBe(200);
        });
    });

    /* ---------------------------------------------------------------- */

    describe('Purchase order workflow', () => {
        test('creates a PO with a generated number and computed total', async () => {
            const token = await adminToken();
            await seedDefaultWarehouse();
            const supplier = await createSupplier(token);
            const product = await createProduct();

            const res = await request(app)
                .post('/api/admin/purchase-orders')
                .set(auth(token))
                .send({
                    supplierId: supplier._id,
                    items: [{ productId: product._id, qty: 10, unitCost: 250 }],
                    notes: 'First order'
                });

            expect(res.status).toBe(201);
            expect(res.body.data.poNumber).toMatch(/^PO-\d{4}-\d{4}$/);
            expect(res.body.data.status).toBe('draft');
            expect(res.body.data.totalCost).toBe(2500);
            // Falls back to the default warehouse when none is supplied.
            expect(res.body.data.warehouseId).toBeTruthy();
        });

        test('rejects a PO with no items or an invalid supplier', async () => {
            const token = await adminToken();
            const supplier = await createSupplier(token);
            const product = await createProduct();

            const noItems = await request(app)
                .post('/api/admin/purchase-orders')
                .set(auth(token))
                .send({ supplierId: supplier._id, items: [] });
            expect(noItems.status).toBe(400);

            const badSupplier = await request(app)
                .post('/api/admin/purchase-orders')
                .set(auth(token))
                .send({
                    supplierId: 'not-an-id',
                    items: [{ productId: product._id, qty: 1, unitCost: 1 }]
                });
            expect(badSupplier.status).toBe(400);
        });

        test('receiving in full raises stock, appends cost history, and closes the PO', async () => {
            const token = await adminToken();
            await seedDefaultWarehouse();
            const supplier = await createSupplier(token);
            const product = await createProduct({ stockQuantity: 4, stock: 4 });

            const po = await request(app)
                .post('/api/admin/purchase-orders')
                .set(auth(token))
                .send({
                    supplierId: supplier._id,
                    items: [{ productId: product._id, qty: 6, unitCost: 300 }]
                });

            const received = await request(app)
                .post(`/api/admin/purchase-orders/${po.body.data._id}/receive`)
                .set(auth(token))
                .send({});

            expect(received.status).toBe(200);
            expect(received.body.data.status).toBe('received');
            expect(received.body.data.receivedDate).toBeTruthy();

            const reloaded = await Product.findById(product._id).lean();
            expect(reloaded.stockQuantity).toBe(10); // 4 + 6
            expect(reloaded.stock).toBe(10);
            expect(reloaded.costHistory).toHaveLength(1);
            expect(reloaded.costHistory[0].cost).toBe(300);
            expect(String(reloaded.costHistory[0].supplierId)).toBe(String(supplier._id));
        });

        test('a partial receipt marks the PO partial and adds only what arrived', async () => {
            const token = await adminToken();
            await seedDefaultWarehouse();
            const supplier = await createSupplier(token);
            const product = await createProduct({ stockQuantity: 0, stock: 0 });

            const po = await request(app)
                .post('/api/admin/purchase-orders')
                .set(auth(token))
                .send({
                    supplierId: supplier._id,
                    items: [{ productId: product._id, qty: 10, unitCost: 50 }]
                });

            const itemId = po.body.data.items[0]._id;

            const first = await request(app)
                .post(`/api/admin/purchase-orders/${po.body.data._id}/receive`)
                .set(auth(token))
                .send({ items: [{ itemId, receivedQty: 4 }] });

            expect(first.status).toBe(200);
            expect(first.body.data.status).toBe('partial');
            expect((await Product.findById(product._id)).stockQuantity).toBe(4);

            // Receiving the remaining 6 closes it out.
            const second = await request(app)
                .post(`/api/admin/purchase-orders/${po.body.data._id}/receive`)
                .set(auth(token))
                .send({ items: [{ itemId, receivedQty: 6 }] });

            expect(second.body.data.status).toBe('received');
            expect((await Product.findById(product._id)).stockQuantity).toBe(10);
        });

        test('refuses to receive more than was ordered', async () => {
            const token = await adminToken();
            const supplier = await createSupplier(token);
            const product = await createProduct({ stockQuantity: 0, stock: 0 });

            const po = await request(app)
                .post('/api/admin/purchase-orders')
                .set(auth(token))
                .send({
                    supplierId: supplier._id,
                    items: [{ productId: product._id, qty: 3, unitCost: 10 }]
                });

            const res = await request(app)
                .post(`/api/admin/purchase-orders/${po.body.data._id}/receive`)
                .set(auth(token))
                .send({ items: [{ itemId: po.body.data.items[0]._id, receivedQty: 99 }] });

            expect(res.status).toBe(400);
            expect((await Product.findById(product._id)).stockQuantity).toBe(0);
        });

        test('cancels an untouched PO but not one with received stock', async () => {
            const token = await adminToken();
            const supplier = await createSupplier(token);
            const productA = await createProduct({ stockQuantity: 0, stock: 0 });
            const productB = await createProduct({ stockQuantity: 0, stock: 0 });

            const cancellable = await request(app)
                .post('/api/admin/purchase-orders')
                .set(auth(token))
                .send({
                    supplierId: supplier._id,
                    items: [{ productId: productA._id, qty: 2, unitCost: 5 }]
                });

            const cancelled = await request(app)
                .post(`/api/admin/purchase-orders/${cancellable.body.data._id}/cancel`)
                .set(auth(token))
                .send({ reason: 'Vendor out of stock' });
            expect(cancelled.status).toBe(200);
            expect(cancelled.body.data.status).toBe('cancelled');
            expect(cancelled.body.data.notes).toContain('Vendor out of stock');

            const receivedPo = await request(app)
                .post('/api/admin/purchase-orders')
                .set(auth(token))
                .send({
                    supplierId: supplier._id,
                    items: [{ productId: productB._id, qty: 2, unitCost: 5 }]
                });
            await request(app)
                .post(`/api/admin/purchase-orders/${receivedPo.body.data._id}/receive`)
                .set(auth(token))
                .send({});

            const blocked = await request(app)
                .post(`/api/admin/purchase-orders/${receivedPo.body.data._id}/cancel`)
                .set(auth(token))
                .send({});
            expect(blocked.status).toBe(409);
        });

        test('a cancelled PO cannot receive stock', async () => {
            const token = await adminToken();
            const supplier = await createSupplier(token);
            const product = await createProduct({ stockQuantity: 0, stock: 0 });

            const po = await request(app)
                .post('/api/admin/purchase-orders')
                .set(auth(token))
                .send({
                    supplierId: supplier._id,
                    items: [{ productId: product._id, qty: 1, unitCost: 5 }]
                });

            await request(app)
                .post(`/api/admin/purchase-orders/${po.body.data._id}/cancel`)
                .set(auth(token))
                .send({});

            const res = await request(app)
                .post(`/api/admin/purchase-orders/${po.body.data._id}/receive`)
                .set(auth(token))
                .send({});
            expect(res.status).toBe(409);
        });

        test('locks item edits once the PO is no longer a draft or sent', async () => {
            const token = await adminToken();
            const supplier = await createSupplier(token);
            const product = await createProduct({ stockQuantity: 0, stock: 0 });

            const po = await request(app)
                .post('/api/admin/purchase-orders')
                .set(auth(token))
                .send({
                    supplierId: supplier._id,
                    items: [{ productId: product._id, qty: 4, unitCost: 20 }]
                });

            // Editable while draft.
            const edit = await request(app)
                .put(`/api/admin/purchase-orders/${po.body.data._id}`)
                .set(auth(token))
                .send({ notes: 'Rush this', status: 'sent' });
            expect(edit.status).toBe(200);
            expect(edit.body.data.status).toBe('sent');

            await request(app)
                .post(`/api/admin/purchase-orders/${po.body.data._id}/receive`)
                .set(auth(token))
                .send({ items: [{ itemId: po.body.data.items[0]._id, receivedQty: 1 }] });

            const locked = await request(app)
                .put(`/api/admin/purchase-orders/${po.body.data._id}`)
                .set(auth(token))
                .send({ notes: 'too late' });
            expect(locked.status).toBe(409);
        });

        test('generates sequential PO numbers', async () => {
            const token = await adminToken();
            const supplier = await createSupplier(token);
            const product = await createProduct();

            const first = await request(app)
                .post('/api/admin/purchase-orders')
                .set(auth(token))
                .send({ supplierId: supplier._id, items: [{ productId: product._id, qty: 1, unitCost: 1 }] });
            const second = await request(app)
                .post('/api/admin/purchase-orders')
                .set(auth(token))
                .send({ supplierId: supplier._id, items: [{ productId: product._id, qty: 1, unitCost: 1 }] });

            expect(first.body.data.poNumber).not.toBe(second.body.data.poNumber);
            expect(await PurchaseOrder.countDocuments()).toBe(2);
        });
    });

    /* ---------------------------------------------------------------- */

    describe('Product slug + ERP links', () => {
        test('auto-generates a slug from the product name on create', async () => {
            const token = await adminToken();

            const res = await request(app)
                .post('/api/products')
                .set(auth(token))
                .field('id', `SLUG-${Date.now()}`)
                .field('name', 'Premium Cotton T-Shirt')
                .field('price', '999')
                .field('stock', '5')
                .field('category', 'Apparel')
                .field('icon', '👕');

            expect(res.status).toBe(201);
            expect(res.body.data.slug).toBe('premium-cotton-t-shirt');
        });

        test('de-duplicates slugs for products sharing a name', async () => {
            const token = await adminToken();

            const payload = (id) => request(app)
                .post('/api/products')
                .set(auth(token))
                .field('id', id)
                .field('name', 'Duplicate Name Product')
                .field('price', '100')
                .field('stock', '1')
                .field('category', 'General')
                .field('icon', '📦');

            const first = await payload(`DUP-A-${Date.now()}`);
            const second = await payload(`DUP-B-${Date.now()}`);

            expect(first.body.data.slug).toBe('duplicate-name-product');
            expect(second.body.data.slug).toBe('duplicate-name-product-2');
        });

        test('defaults reorderPoint to 5 and stores supplier/warehouse links', async () => {
            const token = await adminToken();
            const warehouse = await seedDefaultWarehouse();
            const supplier = await createSupplier(token);

            const res = await request(app)
                .post('/api/products')
                .set(auth(token))
                .field('id', `LINK-${Date.now()}`)
                .field('name', 'Linked Product')
                .field('price', '200')
                .field('stock', '2')
                .field('category', 'General')
                .field('icon', '📦')
                .field('supplierId', String(supplier._id))
                .field('warehouseId', String(warehouse._id));

            expect(res.status).toBe(201);
            expect(res.body.data.reorderPoint).toBe(5);
            expect(String(res.body.data.supplierId)).toBe(String(supplier._id));
            expect(String(res.body.data.warehouseId)).toBe(String(warehouse._id));
        });

        test('admin product detail populates the supplier; the public route does not', async () => {
            const token = await adminToken();
            const supplier = await createSupplier(token, { name: 'Secret Vendor Ltd' });
            const product = await createProduct({ supplierId: supplier._id });

            const adminRes = await request(app)
                .get(`/api/admin/products/${product._id}`)
                .set(auth(token));
            expect(adminRes.status).toBe(200);
            expect(adminRes.body.data.supplierId.name).toBe('Secret Vendor Ltd');

            // Vendor names must never reach the public product endpoint.
            const publicRes = await request(app).get(`/api/products/${product._id}`);
            expect(publicRes.status).toBe(200);
            expect(JSON.stringify(publicRes.body)).not.toContain('Secret Vendor Ltd');
        });
    });

    /* ---------------------------------------------------------------- */

    describe('Audit logging', () => {
        test('records supplier, warehouse, and PO actions against the right resourceType', async () => {
            const token = await adminToken();
            const supplier = await createSupplier(token, { name: 'Audited Vendor' });
            const product = await createProduct();

            await request(app)
                .post('/api/admin/warehouses')
                .set(auth(token))
                .send({ name: 'Audited Warehouse' });

            await request(app)
                .post('/api/admin/purchase-orders')
                .set(auth(token))
                .send({
                    supplierId: supplier._id,
                    items: [{ productId: product._id, qty: 1, unitCost: 10 }]
                });

            // resourceType is enum-validated, so a missing value here means
            // the write was silently rejected by the SecurityLog schema.
            const logged = await SecurityLog.find({
                resourceType: { $in: ['supplier', 'warehouse', 'purchase_order'] }
            }).lean();

            const types = logged.map((row) => row.resourceType);
            expect(types).toContain('supplier');
            expect(types).toContain('warehouse');
            expect(types).toContain('purchase_order');
        });
    });

    /* ---------------------------------------------------------------- */

    describe('Order status enum', () => {
        test('exposes the full status list', () => {
            expect(Order.STATUSES).toContain('Pending');
            expect(Order.STATUSES).toContain('Out for Delivery');
            expect(Order.STATUSES).toContain('Return Requested');
            expect(Order.STATUSES).toContain('Refund Pending');
            expect(Order.STATUSES).toContain('Refunded');
        });

        test('rejects an off-enum status on save', async () => {
            await expect(Order.create({
                orderId: `ORD-BAD-${Date.now()}`,
                customerName: 'Enum Test',
                subTotal: 100,
                deliveryCharge: 0,
                grandTotal: 100,
                paymentMethod: 'COD',
                status: 'Teleported'
            })).rejects.toThrow();
        });

        test('accepts Return Requested, which the returns flow writes', async () => {
            const order = await Order.create({
                orderId: `ORD-RR-${Date.now()}`,
                customerName: 'Return Test',
                subTotal: 100,
                deliveryCharge: 0,
                grandTotal: 100,
                paymentMethod: 'COD',
                status: 'Return Requested'
            });
            expect(order.status).toBe('Return Requested');
        });

        test('the admin status endpoint rejects an invalid status', async () => {
            const token = await adminToken();
            const order = await Order.create({
                orderId: `ORD-UP-${Date.now()}`,
                customerName: 'Status Test',
                subTotal: 100,
                deliveryCharge: 0,
                grandTotal: 100,
                paymentMethod: 'COD',
                status: 'Pending'
            });

            const bad = await request(app)
                .patch(`/admin/api/orders/${order._id}/status`)
                .set(auth(token))
                .send({ status: 'Nonsense' });
            expect(bad.status).toBe(400);

            // Lowercase and the legacy single-L "canceled" still normalize.
            const ok = await request(app)
                .patch(`/admin/api/orders/${order._id}/status`)
                .set(auth(token))
                .send({ status: 'canceled' });
            expect(ok.status).toBe(200);
            expect((await Order.findById(order._id)).status).toBe('Cancelled');
        });
    });

    /* ---------------------------------------------------------------- */

    describe('Order status migration mapping', () => {
        test('passes through valid statuses', () => {
            expect(resolveStatus('Pending')).toBe('Pending');
            expect(resolveStatus('Out for Delivery')).toBe('Out for Delivery');
        });

        test('normalizes case and separator variants', () => {
            expect(resolveStatus('delivered')).toBe('Delivered');
            expect(resolveStatus('out_for_delivery')).toBe('Out for Delivery');
            expect(resolveStatus('OUT-FOR-DELIVERY')).toBe('Out for Delivery');
        });

        test('maps known legacy spellings', () => {
            expect(resolveStatus('canceled')).toBe('Cancelled');
            expect(resolveStatus('confirmed')).toBe('Processing');
            expect(resolveStatus('dispatched')).toBe('Shipped');
            expect(resolveStatus('Return Request')).toBe('Return Requested');
            expect(resolveStatus('completed')).toBe('Delivered');
        });

        test('treats empty values as Pending and leaves unknowns unmapped', () => {
            expect(resolveStatus('')).toBe('Pending');
            expect(resolveStatus(null)).toBe('Pending');
            expect(resolveStatus('Teleported')).toBeNull();
        });
    });
});
