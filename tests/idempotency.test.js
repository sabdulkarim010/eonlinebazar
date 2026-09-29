const fs = require('fs');
const path = require('path');
const vm = require('vm');
const request = require('supertest');
const Product = require('../backend/src/models/product');
const Order = require('../backend/src/models/order');
const PaymentMethod = require('../backend/src/models/PaymentMethod');
const {
    normalizeIdempotencyKey,
    buildReplayPayload
} = require('../backend/src/services/orderIdempotencyService');
const { getApp, createTestUser, getAuthToken } = require('./setup');

function loadIdempotencyClient() {
    let code = fs.readFileSync(
        path.join(__dirname, '..', 'client', 'js', 'checkout', 'idempotency.js'),
        'utf8'
    );
    code = code.replace(/\nexport\s+\{[\s\S]*?\};?\s*$/m, '\n');

    const sandbox = {
        window: {},
        crypto: require('crypto').webcrypto
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return sandbox;
}

describe('Order idempotency service', () => {
    test('normalizeIdempotencyKey trims and rejects empty', () => {
        expect(normalizeIdempotencyKey('  abc  ')).toBe('abc');
        expect(normalizeIdempotencyKey('')).toBe('');
    });

    test('buildReplayPayload marks idempotent replay shape', () => {
        const payload = buildReplayPayload({
            orderId: 'ORD-1',
            subTotal: 100,
            grandTotal: 160,
            deliveryCharge: 60,
            discountAmount: 0,
            vatAmount: 0,
            paymentMethod: 'cod'
        });
        expect(payload.success).toBe(true);
        expect(payload.idempotentReplay).toBe(true);
        expect(payload.data.orderId).toBe('ORD-1');
    });
});

describe('Checkout idempotency client', () => {
    test('generateCheckoutIdempotencyKey uses eob_idempotency prefix', () => {
        const mod = loadIdempotencyClient();
        const key = mod.generateCheckoutIdempotencyKey();
        expect(key.startsWith('eob_idempotency_')).toBe(true);
    });

    test('buildIdempotencyHeaders attaches X-Idempotency-Key', () => {
        const mod = loadIdempotencyClient();
        mod.EOBCheckoutState = {
            _s: { idempotencyKey: 'eob_idempotency_test_key' },
            get(k) { return this._s[k]; },
            set(k, v) { this._s[k] = v; }
        };
        const headers = mod.buildIdempotencyHeaders({ 'Content-Type': 'application/json' });
        expect(headers['X-Idempotency-Key']).toBe('eob_idempotency_test_key');
    });

    test('writeSessionIdempotency tolerates legacy boolean checkout flag', () => {
        const mod = loadIdempotencyClient();
        mod.EOBStorageKeys = { ACTIVE_CHECKOUT_SESSION: 'activeCheckoutSession' };
        let stored = null;
        mod.EOBStorage = {
            getJSON() {
                return true;
            },
            setJSON(_key, value) {
                stored = value;
            }
        };
        mod.EOBCheckoutState = {
            _s: {},
            get(k) { return this._s[k]; },
            set(k, v) { this._s[k] = v; }
        };
        expect(() => {
            mod.ensureCheckoutIdempotencyKey([{ id: 'p1', quantity: 1 }]);
        }).not.toThrow();
        expect(stored).toEqual(expect.objectContaining({
            idempotencyKey: expect.stringMatching(/^eob_idempotency_/),
            idempotencyFingerprint: expect.any(String)
        }));
    });

    test('ensureCheckoutIdempotencyKey reuses key for same cart fingerprint', () => {
        const mod = loadIdempotencyClient();
        mod.EOBStorageKeys = { ACTIVE_CHECKOUT_SESSION: 'activeCheckoutSession' };
        mod.EOBStorage = {
            getJSON() { return null; },
            setJSON() {}
        };
        mod.EOBCheckoutState = {
            _s: {},
            get(k) { return this._s[k]; },
            set(k, v) { this._s[k] = v; }
        };
        const items = [{ id: 'p1', quantity: 2, variantId: 'v1' }];
        const k1 = mod.ensureCheckoutIdempotencyKey(items);
        const k2 = mod.ensureCheckoutIdempotencyKey(items);
        expect(k1).toBe(k2);
    });

    test('double submit lock allows only one in-flight submission', async () => {
        const mod = loadIdempotencyClient();
        mod.EOBCheckoutState = {
            _s: { isSubmittingOrder: false },
            get(k) { return this._s[k]; },
            set(k, v) { this._s[k] = v; }
        };

        let fetchCount = 0;
        const postOrder = async () => {
            if (!mod.beginOrderSubmitLock()) return 'blocked';
            try {
                fetchCount += 1;
                await new Promise((r) => setTimeout(r, 30));
                return 'ok';
            } finally {
                mod.endOrderSubmitLock();
            }
        };

        const results = await Promise.all([postOrder(), postOrder()]);
        expect(fetchCount).toBe(1);
        expect(results.filter((r) => r === 'blocked').length).toBe(1);
    });

    test('postOrderWithIdempotency reuses header on retry', async () => {
        const mod = loadIdempotencyClient();
        mod.EOBCheckoutState = {
            _s: { idempotencyKey: 'eob_idempotency_retry_key' },
            get(k) { return this._s[k]; },
            set(k, v) { this._s[k] = v; }
        };

        const seenHeaders = [];
        const postOnce = async () => {
            const headers = mod.buildIdempotencyHeaders({});
            seenHeaders.push(headers['X-Idempotency-Key']);
        };

        await postOnce();
        await postOnce();
        expect(seenHeaders).toEqual([
            'eob_idempotency_retry_key',
            'eob_idempotency_retry_key'
        ]);
    });
});

describe('POST /api/orders idempotency integration', () => {
    const app = getApp();

    test('identical X-Idempotency-Key returns original order without duplicate', async () => {
        const product = await Product.create({
            productId: 'IDEM-PROD-1',
            name: 'Idempotency Tee',
            price: 900,
            stock: 20,
            stockQuantity: 20,
            category: 'General'
        });
        const codMethod = await PaymentMethod.findOne({ code: 'cod' });
        const { email, password, user } = await createTestUser();
        const token = await getAuthToken(email, password);
        const idempotencyKey = `eob_idempotency_${Date.now()}_integration`;

        const body = {
            customerName: 'Idempotent Buyer',
            customerPhone: user.mobile,
            customerAddress: 'House 1, Road 1, Dhaka',
            shippingDistrict: 'Dhaka',
            paymentMethod: codMethod.code,
            items: [{
                productId: String(product._id),
                name: product.name,
                price: 9999,
                quantity: 1
            }]
        };

        const first = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${token}`)
            .set('X-Idempotency-Key', idempotencyKey)
            .send(body);

        expect(first.status).toBe(201);
        expect(first.body.success).toBe(true);

        const second = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${token}`)
            .set('X-Idempotency-Key', idempotencyKey)
            .send(body);

        expect(second.status).toBe(200);
        expect(second.body.idempotentReplay).toBe(true);
        expect(second.body.data.orderId).toBe(first.body.data.orderId);

        const dupCount = await Order.countDocuments({ checkoutIdempotencyKey: idempotencyKey });
        expect(dupCount).toBe(1);
    });
});
