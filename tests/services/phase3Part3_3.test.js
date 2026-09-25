/********************************************************************
 * Phase 3.3 — Enterprise PIM, Outbox, async queue, scope RBAC
 ********************************************************************/

const request = require('supertest');
const fs = require('fs').promises;
const path = require('path');
const Product = require('../../backend/src/models/product');
const Outbox = require('../../backend/src/models/Outbox');
const BackgroundJob = require('../../backend/src/models/BackgroundJob');
const {
    generateVariantCombinations,
    applyVariantMatrix
} = require('../../backend/src/services/productPimService');
const {
    recordOutboxEvent,
    dispatchPendingOutboxEvents,
    withOutboxTransaction
} = require('../../backend/src/services/outboxService');
const { accountHasScope } = require('../../backend/src/middleware/rbacMiddleware');
const { enqueueJob, executeJob } = require('../../backend/src/queues/importExportQueue');
const { getApp, createTestAdmin } = require('../setup');

describe('Phase 3.3 — PIM, outbox, async queue, scope RBAC', () => {
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

    test('generateVariantCombinations builds 4D cartesian matrix with SKUs', () => {
        const attributes = [
            { name: 'Color', values: ['Red', 'Blue'] },
            { name: 'Size', values: ['S', 'M'] },
            { name: 'Material', values: ['Cotton'] },
            { name: 'Fit', values: ['Regular', 'Slim'] }
        ];

        const variants = generateVariantCombinations('PIM-4D', attributes, {
            defaultPrice: 999,
            defaultStock: 5
        });

        expect(variants.length).toBe(8);
        expect(variants[0].sku).toMatch(/^PIM-4D-/);
        expect(variants[0].price).toBe(999);
        expect(variants[0].stock).toBe(5);
        expect(Object.keys(variants[0].attributes).length).toBe(4);
    });

    test('applyVariantMatrix persists variants and writes outbox event', async () => {
        const product = await Product.create({
            productId: `PIM-APPLY-${Date.now()}`,
            name: 'Matrix Hoodie',
            price: 1200,
            stock: 0,
            stockQuantity: 0
        });

        const attributes = [
            { name: 'Color', values: ['Black', 'White'] },
            { name: 'Size', values: ['L', 'XL'] }
        ];

        const result = await applyVariantMatrix(product._id, attributes, {
            defaultStock: 3
        });

        expect(result.combinationCount).toBe(4);
        expect(result.product.hasVariants).toBe(true);
        expect(result.product.stockQuantity).toBe(12);

        const outbox = await Outbox.findOne({
            eventType: 'VARIANT_MATRIX_APPLIED',
            'payload.productId': String(product._id)
        });
        expect(outbox).toBeTruthy();
        expect(outbox.status).toBe('pending');
    });

    test('outbox dispatcher marks pending events completed', async () => {
        const entry = await recordOutboxEvent('PRODUCT_CREATED', {
            productId: 'test-product',
            source: 'unit-test'
        });

        const summary = await dispatchPendingOutboxEvents(10);
        expect(summary.processed).toBeGreaterThanOrEqual(1);

        const reloaded = await Outbox.findById(entry._id);
        expect(reloaded.status).toBe('completed');
        expect(reloaded.processedAt).toBeTruthy();
    });

    test('withOutboxTransaction records event alongside domain write', async () => {
        const product = await withOutboxTransaction(
            'PRODUCT_CREATED',
            { source: 'transaction-test' },
            async () => Product.create({
                productId: `OUTBOX-TX-${Date.now()}`,
                name: 'Outbox TX Product',
                price: 500,
                stock: 1,
                stockQuantity: 1
            })
        );

        const outbox = await Outbox.findOne({
            eventType: 'PRODUCT_CREATED',
            'payload.source': 'transaction-test'
        });
        expect(outbox).toBeTruthy();
        expect(String(outbox.payload.productId || '')).toBe('');
        expect(product.name).toBe('Outbox TX Product');
    });

    test('async export job completes with downloadable result', async () => {
        await Product.create({
            productId: `JOB-EXP-${Date.now()}`,
            name: 'Export Job Product',
            price: 400,
            stock: 2,
            stockQuantity: 2
        });

        const job = await enqueueJob('PRODUCT_EXPORT_CSV', { format: 'csv' });
        await executeJob(job._id);

        const reloaded = await BackgroundJob.findById(job._id);
        expect(reloaded.status).toBe('completed');
        expect(reloaded.progress).toBe(100);
        expect(reloaded.resultUrl).toContain('/api/admin/jobs/');
        expect(reloaded.result?.absolutePath).toBeTruthy();

        await fs.access(reloaded.result.absolutePath);
    });

    test('scope RBAC maps products:read and pim:manage correctly', () => {
        const reader = { role: 'staff', permissions: ['view_products'], isSuperAdmin: () => false };
        const editor = { role: 'staff', permissions: ['manage_pim'], isSuperAdmin: () => false };
        const denied = { role: 'staff', permissions: ['manage_coupons'], isSuperAdmin: () => false };

        expect(accountHasScope(reader, 'products:read')).toBe(true);
        expect(accountHasScope(reader, 'pim:manage')).toBe(false);
        expect(accountHasScope(editor, 'pim:manage')).toBe(true);
        expect(accountHasScope(denied, 'import:run')).toBe(false);
    });

    test('PIM preview API returns combination count', async () => {
        const token = await adminToken();
        const product = await Product.create({
            productId: `PIM-API-${Date.now()}`,
            name: 'API Matrix Tee',
            price: 650,
            stock: 0,
            stockQuantity: 0
        });

        const res = await request(app)
            .post(`/api/admin/pim/${product._id}/matrix/preview`)
            .set(auth(token))
            .send({
                attributes: [
                    { name: 'Color', values: ['Green', 'Yellow'] },
                    { name: 'Size', values: ['M'] }
                ]
            });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.combinationCount).toBe(2);
        expect(res.body.data.variants).toHaveLength(2);
    });
});
